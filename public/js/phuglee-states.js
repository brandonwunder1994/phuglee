(function () {
  const DEFAULT_LOADING_COPY = 'Heating up leads…';

  function esc(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
  }

  function enhanceErrorNode(el) {
    if (!el || el.dataset.phugleeErrorEnhanced) return;
    const msg = el.textContent.trim();
    if (!msg) return;
    el.dataset.phugleeErrorEnhanced = '1';

    const wrap = document.createElement('div');
    wrap.className = 'phuglee-error-wrap';
    wrap.setAttribute('role', 'alert');

    const p = document.createElement('p');
    p.className = 'phuglee-error';
    p.innerHTML = el.innerHTML;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'phuglee-btn phuglee-btn-secondary phuglee-error-retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => window.location.reload());

    wrap.appendChild(p);
    wrap.appendChild(retry);
    el.replaceWith(wrap);
  }

  function enhanceErrors(root) {
    (root || document).querySelectorAll('.load-error, .list-error, li.load-error').forEach(enhanceErrorNode);
  }

  function enhanceLoadingPanel(el, copy) {
    if (!el || el.dataset.phugleeLoadingEnhanced) return;
    const existing = el.querySelector('.phuglee-loading-bar');
    if (existing) {
      el.classList.add('phuglee-loading-state');
      el.dataset.phugleeLoadingEnhanced = '1';
      return;
    }
    const p = el.querySelector('p');
    const msg = copy || p?.textContent?.trim() || DEFAULT_LOADING_COPY;
    el.dataset.phugleeLoadingEnhanced = '1';
    el.classList.add('phuglee-loading-state');
    el.innerHTML =
      '<div class="phuglee-loading-bar" aria-hidden="true"></div>' +
      `<p class="phuglee-loading-copy">${esc(msg)}</p>`;
  }

  function enhanceLoadingPanels(root) {
    const scope = root || document;
    scope.querySelectorAll('.request-loading, #request-loading').forEach((el) => {
      if (!el.hidden) enhanceLoadingPanel(el);
    });
    scope.querySelectorAll('.empty-workspace, .request-empty, .empty-state.hero-empty').forEach((el) => {
      el.classList.add('phuglee-empty-state');
    });
  }

  function showShellLoading() {
    const strip = document.getElementById('shell-loading-strip');
    if (strip) strip.hidden = false;
    document.body.classList.add('shell-nav-loading');
  }

  function hideShellLoading() {
    const strip = document.getElementById('shell-loading-strip');
    if (strip) strip.hidden = true;
    document.body.classList.remove('shell-nav-loading');
  }

  function bindShellNavLoading() {
    const nav = document.getElementById('distress-os-nav');
    if (!nav) return;
    nav.querySelectorAll('a.shell-link, a.shell-sublink, a.shell-brand').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('mailto:') || href.startsWith('#')) return;
        if (link.target === '_blank') return;
        try {
          const url = new URL(href, window.location.origin);
          if (url.origin !== window.location.origin) return;
          if (url.pathname === window.location.pathname) return;
        } catch (_) {
          return;
        }
        showShellLoading();
      });
    });
    window.addEventListener('pageshow', hideShellLoading);
    window.addEventListener('load', hideShellLoading);
  }

  function observeDynamicStates() {
    const obs = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('.load-error, .list-error')) enhanceErrorNode(node);
          node.querySelectorAll?.('.load-error, .list-error, li.load-error').forEach(enhanceErrorNode);
          if (node.matches?.('.request-loading, #request-loading') && !node.hidden) {
            enhanceLoadingPanel(node);
          }
          node.querySelectorAll?.('.request-loading:not([hidden])').forEach((el) => enhanceLoadingPanel(el));
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    enhanceLoadingPanels();
    enhanceErrors();
    bindShellNavLoading();
    observeDynamicStates();
    hideShellLoading();
  }

  window.PhugleeStates = {
    init,
    enhanceErrors,
    enhanceLoadingPanels,
    showShellLoading,
    hideShellLoading
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();