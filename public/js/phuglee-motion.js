/**
 * Phuglee motion — IntersectionObserver stagger reveal.
 * Usage:
 *   <section data-phuglee-reveal>
 *     <div data-phuglee-reveal-child>...</div>
 *   </section>
 * Auto-staggers direct children if no child markers present.
 * @global {object} PhugleeMotion
 */
(function () {
  'use strict';

  const STAGGER_MS = 80;
  const ACTIVE_CLASS = 'phuglee-reveal-active';
  const VISIBLE_CLASS = 'phuglee-reveal-visible';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  function getRevealChildren(container) {
    const marked = container.querySelectorAll(':scope > [data-phuglee-reveal-child]');
    if (marked.length) {
      return Array.from(marked);
    }
    return Array.from(container.children).filter(function (el) {
      return el.nodeType === 1;
    });
  }

  /**
   * @param {HTMLElement} container
   */
  function activate(container) {
    if (container.classList.contains(ACTIVE_CLASS)) return;
    container.classList.add(ACTIVE_CLASS);

    const children = getRevealChildren(container);
    children.forEach(function (child, index) {
      const delay = prefersReducedMotion() ? 0 : index * STAGGER_MS;
      window.setTimeout(function () {
        child.classList.add(VISIBLE_CLASS);
      }, delay);
    });
  }

  function isProductSurface() {
    const b = document.body;
    if (!b) return false;
    return (
      b.classList.contains('has-shell-chrome') ||
      b.classList.contains('phuglee-app') ||
      b.classList.contains('bridge-page') ||
      b.classList.contains('command-page') ||
      b.classList.contains('collect-page') ||
      b.classList.contains('vault-page')
    );
  }

  function init() {
    const targets = document.querySelectorAll('[data-phuglee-reveal]');

    // Product desks: instant paint (SaaS). Marketing keeps scroll reveal.
    if (isProductSurface() || prefersReducedMotion()) {
      targets.forEach(function (el) {
        activate(/** @type {HTMLElement} */ (el));
      });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) {
        activate(/** @type {HTMLElement} */ (el));
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          activate(/** @type {HTMLElement} */ (entry.target));
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -4% 0px' }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PhugleeMotion = { init: init, activate: activate };
})();