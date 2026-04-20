let activeModal = null;
let previouslyFocusedElement = null;
let focusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;

function getFocusableElements(container) {
  if (!container) return [];
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return Array.from(container.querySelectorAll(selectors)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && !el.hasAttribute('disabled');
  });
}

function updateFocusCache(modal) {
  focusableElements = getFocusableElements(modal);
  firstFocusableElement = focusableElements[0] || null;
  lastFocusableElement = focusableElements[focusableElements.length - 1] || null;
}

function openModal(modal) {
  if (!modal) return;

  if (activeModal && activeModal !== modal) {
    closeModal(activeModal);
  }

  previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeModal = modal;
  modal.classList.add('is-active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  updateFocusCache(modal);

  window.requestAnimationFrame(() => {
    if (firstFocusableElement) {
      firstFocusableElement.focus();
    } else {
      modal.setAttribute('tabindex', '-1');
      modal.focus();
    }
  });
}

function closeModal(modal) {
  const targetModal = modal || activeModal;
  if (!targetModal) return;

  targetModal.classList.remove('is-active');
  targetModal.setAttribute('aria-hidden', 'true');
  targetModal.removeAttribute('tabindex');
  document.body.classList.remove('modal-open');

  if (activeModal === targetModal) {
    activeModal = null;
    focusableElements = [];
    firstFocusableElement = null;
    lastFocusableElement = null;
  }

  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
}

function handleCardClick(event) {
  const card = event.currentTarget;
  const modalId = card.getAttribute('data-modal-id');
  if (!modalId) return;

  const modal = document.getElementById(modalId);
  if (!modal) return;

  openModal(modal);
}

function handleModalClick(event) {
  const modal = event.currentTarget;
  const closeButton = event.target.closest('[data-modal-close]');

  if (closeButton) {
    closeModal(modal);
    return;
  }

  if (event.target === modal || event.target.classList.contains('modal__backdrop')) {
    closeModal(modal);
  }
}

function handleDocumentKeydown(event) {
  if (!activeModal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal(activeModal);
    return;
  }

  if (event.key !== 'Tab') return;

  updateFocusCache(activeModal);
  if (!focusableElements.length) {
    event.preventDefault();
    activeModal.focus();
    return;
  }

  if (event.shiftKey) {
    if (document.activeElement === firstFocusableElement || document.activeElement === activeModal) {
      event.preventDefault();
      lastFocusableElement?.focus();
    }
  } else if (document.activeElement === lastFocusableElement) {
    event.preventDefault();
    firstFocusableElement?.focus();
  }
}

export function initModals() {
  const serviceCards = document.querySelectorAll('[data-modal-id]');
  const modals = document.querySelectorAll('.case-study-modal, .modal');

  serviceCards.forEach((card) => {
    card.addEventListener('click', handleCardClick);
    card.setAttribute('role', card.getAttribute('role') || 'button');
    if (!card.hasAttribute('tabindex')) {
      card.setAttribute('tabindex', '0');
    }
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });
  });

  modals.forEach((modal) => {
    modal.setAttribute('aria-hidden', modal.getAttribute('aria-hidden') || 'true');
    modal.addEventListener('click', handleModalClick);
  });

  document.addEventListener('keydown', handleDocumentKeydown);
}
