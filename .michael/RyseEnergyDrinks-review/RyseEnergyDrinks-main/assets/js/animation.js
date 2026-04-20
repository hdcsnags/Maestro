let initialized = false;
let reducedMotionQuery = null;

function getReducedMotionPreference() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  if (!reducedMotionQuery) {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return reducedMotionQuery.matches;
}

function getHeroGridLayer() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.hero__grid, .hero-grid svg, .hero-grid');
}

export function initAnimation() {
  if (initialized) return;
  initialized = true;

  if (getReducedMotionPreference()) return;

  const heroGridLayer = getHeroGridLayer();
  if (!heroGridLayer) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          heroGridLayer.style.opacity = '0.28';
          heroGridLayer.style.transform = 'translate3d(0, -0.75rem, 0)';
        } else {
          heroGridLayer.style.opacity = '0.18';
          heroGridLayer.style.transform = 'translate3d(0, 0, 0)';
        }
      });
    },
    { threshold: 0.1 }
  );

  heroGridLayer.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
  observer.observe(heroGridLayer);
}
