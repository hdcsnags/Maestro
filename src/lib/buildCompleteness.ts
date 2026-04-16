/**
 * Build Completeness Gate
 *
 * Detects the target framework from build manifest files and checks
 * whether critical bootstrap/entrypoint files are present.
 * Runs client-side before or alongside Bouncer — no API call needed.
 */

export type Framework =
  | 'vite-react'
  | 'nextjs'
  | 'api-service'
  | 'docker'
  | 'unknown';

export type Verdict =
  | 'complete'
  | 'scaffold_only'
  | 'missing_critical'
  | 'import_drift'
  | 'entrypoint_mismatch';

export interface CompletenessCheck {
  file: string;
  required: boolean;
  present: boolean;
  note?: string;
}

export interface CompletenessResult {
  framework: Framework;
  verdict: Verdict;
  checks: CompletenessCheck[];
  missing_critical: string[];
  missing_optional: string[];
  import_issues: string[];
  summary: string;
}

interface ManifestFile {
  path: string;
  content: string | null;
  operation?: string;
}

function detectFramework(files: ManifestFile[]): Framework {
  const paths = new Set(files.map(f => f.path.toLowerCase()));
  const packageJson = files.find(f => f.path === 'package.json');

  let pkgContent: Record<string, unknown> | null = null;
  if (packageJson?.content) {
    try { pkgContent = JSON.parse(packageJson.content); } catch { /* ignore */ }
  }

  const deps = {
    ...(pkgContent?.dependencies as Record<string, string> ?? {}),
    ...(pkgContent?.devDependencies as Record<string, string> ?? {}),
  };

  // Next.js detection
  if (deps['next'] || paths.has('next.config.js') || paths.has('next.config.ts') || paths.has('next.config.mjs')) {
    return 'nextjs';
  }

  // Vite + React detection
  if (deps['vite'] || deps['react'] || paths.has('vite.config.ts') || paths.has('vite.config.js')) {
    return 'vite-react';
  }

  // Docker detection
  if (paths.has('dockerfile') || paths.has('docker-compose.yml') || paths.has('docker-compose.yaml')) {
    return 'docker';
  }

  // API service (has package.json but no frontend framework)
  if (pkgContent && (deps['express'] || deps['fastify'] || deps['hono'] || deps['koa'])) {
    return 'api-service';
  }

  return 'unknown';
}

const FRAMEWORK_CHECKS: Record<Framework, { file: string; required: boolean; note?: string }[]> = {
  'vite-react': [
    { file: 'package.json', required: true },
    { file: 'vite.config.ts', required: false, note: 'or vite.config.js' },
    { file: 'index.html', required: true, note: 'Vite entrypoint' },
    { file: 'src/main.tsx', required: true, note: 'or src/main.ts / src/index.tsx' },
    { file: 'src/App.tsx', required: true, note: 'root component' },
    { file: 'src/index.css', required: false, note: 'or equivalent style entry' },
    { file: 'tsconfig.json', required: false },
    { file: 'tailwind.config.js', required: false, note: 'if using Tailwind' },
    { file: 'postcss.config.js', required: false, note: 'if using Tailwind/PostCSS' },
  ],
  'nextjs': [
    { file: 'package.json', required: true },
    { file: 'next.config.ts', required: false, note: 'or next.config.js / next.config.mjs' },
    { file: 'tsconfig.json', required: true },
    { file: 'src/app/layout.tsx', required: false, note: 'App Router layout (or pages/_app.tsx)' },
    { file: 'src/app/page.tsx', required: false, note: 'App Router root page (or pages/index.tsx)' },
    { file: 'tailwind.config.js', required: false, note: 'if using Tailwind' },
    { file: 'postcss.config.js', required: false, note: 'if using Tailwind/PostCSS' },
  ],
  'api-service': [
    { file: 'package.json', required: true },
    { file: 'tsconfig.json', required: false },
    { file: 'src/index.ts', required: true, note: 'or src/server.ts / index.js' },
  ],
  'docker': [
    { file: 'Dockerfile', required: true },
    { file: 'docker-compose.yml', required: false, note: 'or docker-compose.yaml' },
  ],
  'unknown': [
    { file: 'package.json', required: false },
  ],
};

// Alternate acceptable paths for fuzzy matching
const ALTERNATES: Record<string, string[]> = {
  'vite.config.ts': ['vite.config.js', 'vite.config.mjs'],
  'src/main.tsx': ['src/main.ts', 'src/index.tsx', 'src/index.ts'],
  'src/index.css': ['src/styles.css', 'src/globals.css', 'src/app.css', 'src/global.css'],
  'next.config.ts': ['next.config.js', 'next.config.mjs'],
  'src/app/layout.tsx': ['src/app/layout.ts', 'app/layout.tsx', 'pages/_app.tsx', 'pages/_app.ts'],
  'src/app/page.tsx': ['src/app/page.ts', 'app/page.tsx', 'pages/index.tsx', 'pages/index.ts'],
  'src/index.ts': ['src/server.ts', 'src/app.ts', 'index.ts', 'index.js', 'src/index.js', 'src/server.js'],
  'Dockerfile': ['dockerfile'],
  'docker-compose.yml': ['docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  'tailwind.config.js': ['tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'],
  'postcss.config.js': ['postcss.config.cjs', 'postcss.config.mjs', 'postcss.config.ts'],
};

function filePresent(targetPath: string, paths: Set<string>): boolean {
  if (paths.has(targetPath)) return true;
  const alternates = ALTERNATES[targetPath];
  if (alternates) {
    return alternates.some(alt => paths.has(alt));
  }
  return false;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRe = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  let match;
  while ((match = importRe.exec(content)) !== null) {
    const specifier = match[1];
    // Only check relative imports (not node_modules)
    if (specifier.startsWith('.')) {
      imports.push(specifier);
    }
  }
  return imports;
}

function resolveRelativeImport(fromFile: string, importPath: string): string[] {
  const dir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';
  let resolved = importPath;

  // Resolve relative path
  if (dir && resolved.startsWith('./')) {
    resolved = `${dir}/${resolved.substring(2)}`;
  } else if (dir && resolved.startsWith('../')) {
    const parts = dir.split('/');
    let rel = resolved;
    while (rel.startsWith('../') && parts.length > 0) {
      parts.pop();
      rel = rel.substring(3);
    }
    resolved = parts.length > 0 ? `${parts.join('/')}/${rel}` : rel;
  }

  // Generate possible file paths (with extensions)
  const candidates = [resolved];
  if (!resolved.match(/\.\w+$/)) {
    candidates.push(
      `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`, `${resolved}.jsx`,
      `${resolved}/index.ts`, `${resolved}/index.tsx`, `${resolved}/index.js`,
    );
  }
  return candidates;
}

function checkImports(files: ManifestFile[]): string[] {
  const paths = new Set(files.map(f => f.path));
  const issues: string[] = [];

  for (const file of files) {
    if (!file.content) continue;
    if (!file.path.match(/\.(tsx?|jsx?|mjs)$/)) continue;

    const imports = extractImports(file.content);
    for (const imp of imports) {
      const candidates = resolveRelativeImport(file.path, imp);
      const found = candidates.some(c => paths.has(c));
      if (!found) {
        issues.push(`${file.path} imports "${imp}" but no matching file in manifest`);
      }
    }
  }

  return issues;
}

export function checkBuildCompleteness(files: ManifestFile[]): CompletenessResult {
  const activeFiles = files.filter(f => f.operation !== 'delete');
  const paths = new Set(activeFiles.map(f => f.path));
  const framework = detectFramework(activeFiles);
  const requiredChecks = FRAMEWORK_CHECKS[framework];

  const checks: CompletenessCheck[] = requiredChecks.map(check => ({
    file: check.file,
    required: check.required,
    present: filePresent(check.file, paths),
    note: check.note,
  }));

  const missingCritical = checks.filter(c => c.required && !c.present).map(c => c.file);
  const missingOptional = checks.filter(c => !c.required && !c.present).map(c => c.file);
  const importIssues = checkImports(activeFiles);

  let verdict: Verdict = 'complete';
  if (missingCritical.length > 0) {
    verdict = 'missing_critical';
  } else if (importIssues.length > 3) {
    verdict = 'import_drift';
  } else if (activeFiles.length <= 2) {
    verdict = 'scaffold_only';
  }

  // Check for entrypoint mismatches in package.json
  const pkgFile = activeFiles.find(f => f.path === 'package.json');
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const main = pkg.main ?? pkg.module;
      if (main && typeof main === 'string' && !paths.has(main)) {
        verdict = 'entrypoint_mismatch';
      }
    } catch { /* ignore */ }
  }

  const summaryParts: string[] = [`Framework: ${framework}`];
  if (missingCritical.length > 0) {
    summaryParts.push(`Missing critical: ${missingCritical.join(', ')}`);
  }
  if (importIssues.length > 0) {
    summaryParts.push(`${importIssues.length} import issue(s)`);
  }
  if (verdict === 'complete') {
    summaryParts.push('All critical files present');
  }

  return {
    framework,
    verdict,
    checks,
    missing_critical: missingCritical,
    missing_optional: missingOptional,
    import_issues: importIssues,
    summary: summaryParts.join('. ') + '.',
  };
}
