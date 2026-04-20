const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { AxePuppeteer } = require('@axe-core/puppeteer');

async function loadAxeCore(page) {
  const axeCorePath = require.resolve('axe-core/axe.min.js');
  const axeSource = await fs.promises.readFile(axeCorePath, 'utf8');
  await page.addScriptTag({ content: axeSource });
}

async function getRenderedPageReport(browser, filePath, theme) {
  const page = await browser.newPage();
  const fileUrl = pathToFileURL(filePath).href;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.evaluate((themeName) => {
    document.documentElement.setAttribute('data-theme', themeName);
    document.body?.setAttribute('data-theme', themeName);
  }, theme);
  await page.waitForTimeout(100);
  await loadAxeCore(page);
  const results = await page.evaluate(async () => {
    return await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa']
      }
    });
  });
  await page.close();
  return results;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const pages = [
    path.join(projectRoot, 'index.html'),
    path.join(projectRoot, 'services.html')
  ];
  const themes = ['light', 'dark'];
  const browser = await chromium.launch({ headless: true });

  const warnings = [];
  const failures = [];

  try {
    for (const pagePath of pages) {
      for (const theme of themes) {
        const report = await getRenderedPageReport(browser, pagePath, theme);
        const criticalAndSerious = report.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
        const warningViolations = report.violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');

        if (criticalAndSerious.length > 0) {
          failures.push({
            page: path.relative(projectRoot, pagePath),
            theme,
            violations: criticalAndSerious.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              description: v.description,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                failureSummary: n.failureSummary
              }))
            }))
          });
        }

        if (warningViolations.length > 0) {
          warnings.push({
            page: path.relative(projectRoot, pagePath),
            theme,
            warnings: warningViolations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              description: v.description,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                failureSummary: n.failureSummary
              }))
            }))
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const output = {
    pages: pages.map((p) => path.relative(projectRoot, p)),
    themes,
    warnings
  };

  if (warnings.length > 0) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(JSON.stringify({ ...output, warnings: [] }, null, 2));
  }

  if (failures.length > 0) {
    const error = new Error('Accessibility audit failed with critical or serious violations');
    error.details = failures;
    throw error;
  }
}

main().catch((error) => {
  if (error && error.details) {
    console.error(JSON.stringify({ error: error.message, details: error.details }, null, 2));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
