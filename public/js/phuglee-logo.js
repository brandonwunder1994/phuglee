/**
 * Phuglee logo SVG injector — single-fetch, cached, vanilla JS.
 * Usage: <div data-phuglee-logo="hero" data-phuglee-label="Phuglee"></div>
 * Variants: hero | watermark | inline
 * @global {object} PhugleeLogo
 */
(function () {
  'use strict';

  const LOGO_URL = '/images/phuglee-logo.svg';

  /** @type {SVGSVGElement | null} */
  let cachedSvg = null;

  /** @type {Promise<SVGSVGElement> | null} */
  let fetchPromise = null;

  /**
   * @returns {Promise<SVGSVGElement>}
   */
  function loadSvg() {
    if (cachedSvg) {
      return Promise.resolve(cachedSvg);
    }
    if (!fetchPromise) {
      fetchPromise = fetch(LOGO_URL)
        .then(function (res) {
          if (!res.ok) {
            throw new Error('phuglee-logo: failed to load ' + LOGO_URL);
          }
          return res.text();
        })
        .then(function (text) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');
          const svg = doc.querySelector('svg');
          if (!svg) {
            throw new Error('phuglee-logo: no svg root in ' + LOGO_URL);
          }
          cachedSvg = svg;
          return svg;
        });
    }
    return fetchPromise;
  }

  /**
   * @param {SVGSVGElement} svg
   * @param {string} variant
   * @param {string} label
   * @returns {SVGSVGElement}
   */
  function cloneForVariant(svg, variant, label) {
    const node = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
    node.removeAttribute('width');
    node.removeAttribute('height');
    node.setAttribute('class', 'phuglee-logo-svg phuglee-logo-svg--' + variant);
    node.setAttribute('focusable', 'false');

    if (variant === 'watermark') {
      node.setAttribute('aria-hidden', 'true');
    } else {
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label', label);
    }

    if (variant !== 'watermark') {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = label;
      node.insertBefore(title, node.firstChild);
    }

    return node;
  }

  /**
   * @param {HTMLElement} el
   * @returns {Promise<void>}
   */
  function inject(el) {
    const variant = el.dataset.phugleeLogo || 'inline';
    const label = el.dataset.phugleeLabel || 'Phuglee';

    return loadSvg().then(function (svg) {
      const node = cloneForVariant(svg, variant, label);
      el.replaceChildren(node);
    });
  }

  function init() {
    const els = document.querySelectorAll('[data-phuglee-logo]');
    els.forEach(function (el) {
      inject(/** @type {HTMLElement} */ (el)).catch(function (err) {
        console.error('[phuglee-logo]', err);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PhugleeLogo = {
    load: loadSvg,
    inject: inject,
    init: init
  };
})();