const THEME_STORAGE_KEY = 'theme';
const DARK_THEME = 'dark';
const LIGHT_THEME = 'light';
const THEME_MEDIA_QUERY = window.matchMedia('(prefers-color-scheme: dark)');

function getSystemTheme() {
  return THEME_MEDIA_QUERY.matches ? DARK_THEME : LIGHT_THEME;
}

function getStoredTheme() {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return theme === DARK_THEME || theme === LIGHT_THEME ? theme : null;
  } catch (_) {
    return null;
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {
    // Ignore storage failures.
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || getStoredTheme() || getSystemTheme();
  const nextTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  setTheme(nextTheme);
}

function bindToggleButton() {
  const toggleButton = document.querySelector('[data-theme-toggle]');
  if (!toggleButton || toggleButton.dataset.themeToggleBound === 'true') {
    return;
  }

  toggleButton.dataset.themeToggleBound = 'true';
  toggleButton.addEventListener('click', toggleTheme);
}

function applyInitialTheme() {
  const storedTheme = getStoredTheme();
  const theme = storedTheme || getSystemTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

function syncWithSystemTheme() {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    return;
  }

  setTheme(getSystemTheme());
}

export function initTheme() {
  applyInitialTheme();
  bindToggleButton();

  if (typeof THEME_MEDIA_QUERY.addEventListener === 'function') {
    THEME_MEDIA_QUERY.addEventListener('change', syncWithSystemTheme);
  } else if (typeof THEME_MEDIA_QUERY.addListener === 'function') {
    THEME_MEDIA_QUERY.addListener(syncWithSystemTheme);
  }
}
