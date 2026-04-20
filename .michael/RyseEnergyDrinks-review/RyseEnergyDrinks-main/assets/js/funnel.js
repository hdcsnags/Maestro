const DEFAULT_CONFIG_PATH = '/config/ab-test.json';

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>&"']/g, (ch) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[ch] || ch;
  }).trim();
}

function sanitizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function sanitizePhone(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\d+() \-\.]/g, '').trim();
}

const STEP_DEFS = {
  control: [
    {
      id: 'step-1',
      title: 'Tell us about you',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 80, pattern: /^[\p{L}][\p{L}\p{M}\s.'-]*$/u },
        { name: 'email', type: 'email', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      ],
    },
    {
      id: 'step-2',
      title: 'How can we reach you?',
      fields: [
        { name: 'phone', type: 'tel', required: true, maxLength: 20, pattern: /^\+?[0-9()\-\s.]{7,20}$/ },
        { name: 'company', type: 'text', required: false, maxLength: 120 },
      ],
    },
    {
      id: 'step-3',
      title: 'Final details',
      fields: [
        { name: 'message', type: 'text', required: false, maxLength: 1000 },
      ],
    },
  ],
  variantA: [
    {
      id: 'step-1',
      title: 'Get started',
      fields: [
        { name: 'email', type: 'email', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      ],
    },
    {
      id: 'step-2',
      title: 'A little more',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 80, pattern: /^[\p{L}][\p{L}\p{M}\s.'-]*$/u },
        { name: 'phone', type: 'tel', required: true, maxLength: 20, pattern: /^\+?[0-9()\-\s.]{7,20}$/ },
      ],
    },
    {
      id: 'step-3',
      title: 'Finish',
      fields: [
        { name: 'company', type: 'text', required: false, maxLength: 120 },
        { name: 'message', type: 'text', required: false, maxLength: 1000 },
      ],
    },
  ],
};

let cachedConfig = null;

async function loadAbConfig() {
  if (cachedConfig) return cachedConfig;

  const injected = window.__AB_TEST_CONFIG__ || window.__AB_TEST__ || null;
  if (injected && typeof injected === 'object') {
    cachedConfig = injected;
    return cachedConfig;
  }

  try {
    const response = await fetch(DEFAULT_CONFIG_PATH, { credentials: 'same-origin' });
    if (response.ok) {
      cachedConfig = await response.json();
      return cachedConfig;
    }
  } catch (_err) {
    // Ignore fetch failures and fall back to control.
  }

  cachedConfig = { variant: 'control' };
  return cachedConfig;
}

function getVariant(config) {
  const raw = String(config?.variant || config?.abVariant || 'control').trim();
  if (raw === 'A' || raw === 'variantA' || raw === 'test' || raw === 'treatment') return 'variantA';
  return 'control';
}

function getStepsForVariant(variant) {
  return STEP_DEFS[variant] || STEP_DEFS.control;
}

function getRoot(root) {
  return root || document.querySelector('[data-funnel]');
}

function setVisibleStep(container, stepId) {
  const steps = Array.from(container.querySelectorAll('[data-funnel-step]'));
  steps.forEach((step) => {
    const active = step.getAttribute('data-funnel-step') === stepId;
    step.classList.toggle('is-active', active);
    step.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

function readFieldValue(input) {
  const value = String(input?.value ?? '').trim();
  const type = input?.getAttribute('type') || 'text';
  if (type === 'email') return sanitizeEmail(value);
  if (type === 'tel') return sanitizePhone(value);
  return sanitizeText(value);
}

function validateField(input, def) {
  const value = String(input.value || '').trim();
  const errors = [];

  if (def.required && !value) errors.push('required');
  if (typeof def.maxLength === 'number' && value.length > def.maxLength) errors.push('maxLength');
  if (value && def.pattern && !def.pattern.test(value)) errors.push('pattern');

  input.classList.toggle('is-invalid', errors.length > 0);
  input.setAttribute('aria-invalid', errors.length > 0 ? 'true' : 'false');
  return errors.length === 0;
}

function validateStep(stepEl, stepDef) {
  const inputs = Array.from(stepEl.querySelectorAll('input, textarea, select'));
  let valid = true;
  stepDef.fields.forEach((fieldDef) => {
    const input = inputs.find((el) => el.name === fieldDef.name);
    if (!input) return;
    valid = validateField(input, fieldDef) && valid;
  });
  return valid;
}

function sanitizeStepPayload(stepEl, stepDef) {
  const payload = {};
  stepDef.fields.forEach((fieldDef) => {
    const input = stepEl.querySelector(`[name="${CSS.escape(fieldDef.name)}"]`);
    if (!input) return;
    payload[fieldDef.name] = readFieldValue(input);
  });
  return payload;
}

function renderStep(container, stepDef, index, total) {
  container.innerHTML = '';
  const step = document.createElement('section');
  step.className = 'funnel-step is-active';
  step.setAttribute('data-funnel-step', stepDef.id);
  step.setAttribute('aria-hidden', 'false');

  const title = document.createElement('h2');
  title.className = 'funnel-step__title';
  title.textContent = stepDef.title;
  step.appendChild(title);

  const counter = document.createElement('div');
  counter.className = 'funnel-step__counter';
  counter.textContent = `Step ${index + 1} of ${total}`;
  step.appendChild(counter);

  const form = document.createElement('div');
  form.className = 'funnel-step__fields';

  stepDef.fields.forEach((fieldDef) => {
    const field = document.createElement('label');
    field.className = 'funnel-field';

    const span = document.createElement('span');
    span.className = 'funnel-field__label';
    span.textContent = fieldDef.name;
    field.appendChild(span);

    const input = document.createElement(fieldDef.type === 'text' && fieldDef.name === 'message' ? 'textarea' : 'input');
    input.className = 'funnel-field__input';
    input.name = fieldDef.name;
    input.setAttribute('data-funnel-input', fieldDef.name);
    if (input.tagName === 'INPUT') input.type = fieldDef.type;
    if (fieldDef.maxLength) input.maxLength = fieldDef.maxLength;
    if (fieldDef.required) input.required = true;
    input.autocomplete = fieldDef.name;
    field.appendChild(input);

    form.appendChild(field);
  });

  step.appendChild(form);

  const nav = document.createElement('div');
  nav.className = 'funnel-step__actions';

  if (index > 0) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'funnel-btn funnel-btn--back';
    back.setAttribute('data-funnel-back', 'true');
    back.textContent = 'Back';
    nav.appendChild(back);
  }

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'funnel-btn funnel-btn--next';
  next.setAttribute('data-funnel-next', 'true');
  next.textContent = index === total - 1 ? 'Submit' : 'Continue';
  nav.appendChild(next);

  step.appendChild(nav);
  container.appendChild(step);

  return step;
}

export async function initFunnel(root) {
  const container = getRoot(root);
  if (!container) return null;

  const config = await loadAbConfig();
  const variant = getVariant(config);
  const steps = getStepsForVariant(variant);

  let currentIndex = 0;
  const stepEls = [];
  const payload = {};

  const mount = document.createElement('div');
  mount.className = 'funnel';
  container.replaceChildren(mount);

  steps.forEach((stepDef, index) => {
    const stepEl = renderStep(mount, stepDef, index, steps.length);
    stepEls.push(stepEl);
  });

  function show(index) {
    currentIndex = Math.max(0, Math.min(index, steps.length - 1));
    setVisibleStep(mount, steps[currentIndex].id);
  }

  function submitCurrentStep(stepEl, stepDef) {
    if (!validateStep(stepEl, stepDef)) return false;
    Object.assign(payload, sanitizeStepPayload(stepEl, stepDef));
    return true;
  }

  mount.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const currentStepEl = stepEls[currentIndex];
    const currentStepDef = steps[currentIndex];

    if (target.matches('[data-funnel-back]')) {
      event.preventDefault();
      show(currentIndex - 1);
      return;
    }

    if (target.matches('[data-funnel-next]')) {
      event.preventDefault();
      const ok = submitCurrentStep(currentStepEl, currentStepDef);
      if (!ok) return;

      if (currentIndex < steps.length - 1) {
        show(currentIndex + 1);
        return;
      }

      if (typeof window.hubspotSubmit === 'function') {
        await window.hubspotSubmit({ ...payload });
      }
    }
  });

  mount.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    target.classList.remove('is-invalid');
    target.setAttribute('aria-invalid', 'false');
  });

  show(0);
  return { variant, steps: steps.map((s) => s.id), container: mount };
}
