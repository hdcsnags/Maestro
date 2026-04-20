import { initTheme } from './theme.js';
import { initAnimation } from './animation.js';
import { initFunnel } from './funnel.js';
import { initModals } from './modals.js';

function bootstrap() {
  try {
    initTheme();
    initAnimation();
    initFunnel();
    initModals();
  } catch (error) {
    console.error('Failed to initialize application scripts:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
