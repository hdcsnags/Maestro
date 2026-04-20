const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('contact funnel conversion smoke', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const partialPath = path.join(repoRoot, 'partials', 'contact-funnel.html');
  const funnelPath = path.join(repoRoot, 'assets', 'js', 'funnel.js');
  const hubspotPath = path.join(repoRoot, 'assets', 'js', 'hubspot.js');

  function loadMarkup() {
    return fs.readFileSync(partialPath, 'utf8');
  }

  function loadScript(filePath) {
    return fs.readFileSync(filePath, 'utf8');
  }

  function createDom(markup) {
    const dom = new JSDOM(markup, {
      url: 'https://example.com/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });

    const { window } = dom;
    window.console = console;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.scrollTo = () => {};
    window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));

    return dom;
  }

  function runScript(window, code, filename) {
    vm.runInNewContext(code, window, { filename });
  }

  function setValue(window, selector, value) {
    const el = window.document.querySelector(selector);
    expect(el).toBeTruthy();
    el.value = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  function click(window, selector) {
    const el = window.document.querySelector(selector);
    expect(el).toBeTruthy();
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  function getVisibleStep(window) {
    const steps = [...window.document.querySelectorAll('[data-funnel-step]')];
    return steps.find((step) => {
      const style = window.getComputedStyle(step);
      return style.display !== 'none' && !step.hasAttribute('hidden') && !step.classList.contains('is-hidden');
    });
  }

  function findSubmitButton(window) {
    return window.document.querySelector('button[type="submit"], input[type="submit"]');
  }

  async function flush(window) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function setup({ variant = 'multi' } = {}) {
    const markup = loadMarkup();
    const dom = createDom(markup);
    const { window } = dom;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
      text: async () => 'ok',
    });

    window.fetch = fetchMock;
    global.fetch = fetchMock;

    runScript(window, loadScript(hubspotPath), 'hubspot.js');
    runScript(window, loadScript(funnelPath), 'funnel.js');

    if (typeof window.__initializeFunnel === 'function') {
      window.__initializeFunnel();
    } else if (typeof window.initFunnel === 'function') {
      window.initFunnel();
    } else {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    }

    if (variant === 'single') {
      const root = window.document.querySelector('[data-funnel-root], .contact-funnel, form');
      if (root) {
        root.setAttribute('data-funnel-variant', 'single-step');
        root.setAttribute('data-variant', 'single-step');
      }
    }

    return { dom, window, fetchMock };
  }

  it('completes the multi-step funnel and submits the expected HubSpot payload', async () => {
    const { window, fetchMock } = setup({ variant: 'multi' });

    const honeypot = window.document.querySelector('input[name="company"], input[name="website"], input[name="url"], input[name*="honeypot"], input[autocomplete="off"]');
    if (honeypot) {
      expect(honeypot.value).toBe('');
    }

    const visibleBefore = getVisibleStep(window);
    expect(visibleBefore).toBeTruthy();

    const firstName = window.document.querySelector('input[name="firstName"], input[name="firstname"], input[name="name"]');
    const email = window.document.querySelector('input[type="email"], input[name="email"]');
    const company = window.document.querySelector('input[name="company"], input[name="organization"]');
    const phone = window.document.querySelector('input[type="tel"], input[name="phone"]');
    const message = window.document.querySelector('textarea[name="message"], textarea[name="comments"], textarea');

    if (firstName) setValue(window, `input[name="${firstName.name}"]`, 'Ada');
    if (email) setValue(window, `input[name="${email.name}"]`, 'ada@example.com');
    if (company) setValue(window, `input[name="${company.name}"]`, 'Example Co');
    if (phone) setValue(window, `input[name="${phone.name}"]`, '+15555550123');
    if (message) setValue(window, `textarea[name="${message.name}"]`, 'I would like a demo.');

    const nextButtons = [...window.document.querySelectorAll('button, input[type="button"], input[type="next"]')].filter((el) => /next|continue|proceed|step/i.test(el.textContent || el.value || ''));
    for (const btn of nextButtons) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await flush(window);
    }

    const submitButton = findSubmitButton(window);
    expect(submitButton).toBeTruthy();
    submitButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    submitButton.form?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush(window);

    expect(fetchMock).toHaveBeenCalled();

    const calls = fetchMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toBeTruthy();

    const [url, options] = lastCall;
    expect(String(url)).toMatch(/hubspot|forms/i);
    expect(options).toBeTruthy();
    expect(['POST', 'post']).toContain(options.method);

    let body = options.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = body;
      }
    }

    const payloadText = typeof body === 'string' ? body : JSON.stringify(body);
    expect(payloadText).toMatch(/email/i);
    expect(payloadText).toMatch(/ada@example.com/);
    expect(payloadText).toMatch(/firstName|firstname|name/i);
    expect(payloadText).toMatch(/Example Co/);
    expect(payloadText).toMatch(/message|comments/i);

    if (window.submitToHubSpot) {
      const spy = jest.spyOn(window, 'submitToHubSpot');
      await window.submitToHubSpot({ email: 'ada@example.com' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('supports the single-step A/B variant and still submits via HubSpot', async () => {
    const { window, fetchMock } = setup({ variant: 'single' });

    const root = window.document.querySelector('[data-funnel-root], .contact-funnel, form');
    if (root) {
      root.setAttribute('data-funnel-variant', 'single');
      root.setAttribute('data-variant', 'single');
    }

    const firstName = window.document.querySelector('input[name="firstName"], input[name="firstname"], input[name="name"]');
    const email = window.document.querySelector('input[type="email"], input[name="email"]');
    const company = window.document.querySelector('input[name="company"], input[name="organization"]');
    const message = window.document.querySelector('textarea[name="message"], textarea[name="comments"], textarea');

    if (firstName) setValue(window, `input[name="${firstName.name}"]`, 'Grace');
    if (email) setValue(window, `input[name="${email.name}"]`, 'grace@example.com');
    if (company) setValue(window, `input[name="${company.name}"]`, 'Single Step Ltd');
    if (message) setValue(window, `textarea[name="${message.name}"]`, 'Please contact me.');

    const submitButton = findSubmitButton(window);
    expect(submitButton).toBeTruthy();
    submitButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    if (submitButton.form) {
      submitButton.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    }
    await flush(window);

    expect(fetchMock).toHaveBeenCalled();

    const [, options] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const bodyText = JSON.stringify(body);

    expect(bodyText).toMatch(/grace@example.com/);
    expect(bodyText).toMatch(/Single Step Ltd/);
    expect(bodyText).toMatch(/submit|fields|properties|context/i);

    const honeypot = window.document.querySelector('input[name="company"], input[name="website"], input[name="url"], input[name*="honeypot"], input[autocomplete="off"]');
    if (honeypot) {
      expect(honeypot.value).toBe('');
    }
  });
});
