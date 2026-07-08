(function () {
  const CORE_LINKS = [
    { id: 'command', label: 'Dashboard', href: '/command' },
    { id: 'collect', label: 'Collect', href: '/collect' },
    { id: 'bridge', label: 'Filter', href: '/bridge' }
  ];

  const FORGE_LINKS = [
    { id: 'forge-desk', label: 'PDF Filler', href: '/forge/' },
    { id: 'forge-portal', label: 'Request Tracker', href: '/forge/portal' },
    { id: 'forge-map', label: 'Map', href: '/forge/map' },
    { id: 'forge-pdfs', label: 'Request PDFs', href: '/forge/portal/request-pdfs' },
    { id: 'forge-submit', label: 'Submit Portals', href: '/forge/portal/submit-portals' },
    { id: 'forge-email', label: 'Email-only', href: '/forge/portal/email-only' },
    { id: 'forge-errors', label: 'Portal Errors', href: '/forge/portal/portal-errors' }
  ];

  const VAULT_LINK = { id: 'vault', label: 'The Vault', href: '/vault' };
  const ANALYZER_LINK = { id: 'analyzer', label: 'Analyze', href: '/analyzer/' };

  function normalizePath(pathname) {
    if (!pathname) return '/';
    let p = pathname.replace(/\/+$/, '') || '/';
    if (p === '/index.html') return '/';
    return p;
  }

  function matchLink(path, href) {
    const p = normalizePath(path);
    const h = normalizePath(href);
    if (h === '/forge' || h === '/forge/') {
      return p === '/forge' || p === '/forge/index.html';
    }
    if (h === '/analyzer' || h === '/analyzer/') {
      return p === '/analyzer' || p === '/analyzer/index.html';
    }
    return p === h || p.startsWith(h + '/');
  }

  function activeId(path) {
    const p = normalizePath(path);
    if (p === '/command') return 'command';
    if (p === '/vault') return 'vault';
    const forgeLinks = [...FORGE_LINKS].sort((a, b) => b.href.length - a.href.length);
    for (const link of forgeLinks) {
      if (matchLink(p, link.href)) return link.id;
    }
    if (matchLink(p, ANALYZER_LINK.href)) return ANALYZER_LINK.id;
    for (const link of CORE_LINKS) {
      if (matchLink(p, link.href)) return link.id;
    }
    return null;
  }

  function linkClass(id, current) {
    return id === current ? 'shell-link active' : 'shell-link';
  }

  function buildFooter() {
    return `
<footer class="shell-footer" id="distress-os-footer">
  <div class="shell-footer-inner">
    <div class="shell-footer-brand-block">
      <span class="shell-footer-brand">PHUGLEE</span>
      <span class="shell-footer-meta">Distress OS · Collect. Filter. Analyze.</span>
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/heat" class="shell-footer-link">How It Works</a>
      <a href="/collect" class="shell-footer-link">Collect</a>
      <a href="/bridge" class="shell-footer-link">Filter</a>
      <a href="/analyzer/" class="shell-footer-link">Analyze</a>
      <a href="/vault" class="shell-footer-link">The Vault</a>
    </nav>
  </div>
  <p class="shell-footer-trust">Public records only · Your data stays on your machine</p>
</footer>`;
  }

  function mountFooter() {
    const existing = document.getElementById('distress-os-footer');
    const html = buildFooter();
    if (existing) {
      existing.outerHTML = html;
    } else {
      const mount = document.getElementById('distress-os-footer-mount');
      if (mount) {
        mount.innerHTML = html;
      } else {
        document.body.insertAdjacentHTML('beforeend', html);
      }
    }
  }

  function buildNav(pathname) {
    const current = activeId(pathname);
    const coreHtml = CORE_LINKS.map((l) =>
      `<a href="${l.href}" class="${linkClass(l.id, current)}"${current === l.id ? ' aria-current="page"' : ''}>${l.label}</a>`
    ).join('');

    const analyzerClass = linkClass(ANALYZER_LINK.id, current);
    const vaultClass = linkClass(VAULT_LINK.id, current);

    const actionsHtml = isAuthenticated()
      ? `<div class="shell-nav-actions">
          <div id="shell-settings-slot"></div>
        </div>`
      : '';

    return `
<div class="shell-loading-strip" id="shell-loading-strip" hidden aria-live="polite">
  <div class="phuglee-loading-bar" aria-hidden="true"></div>
  <span class="phuglee-loading-copy">Heating up leads…</span>
</div>
<header class="shell-nav-wrap distress-glass--chrome" id="distress-os-nav">
  <nav class="shell-nav" aria-label="Main navigation">
    <a href="/" class="shell-brand" aria-label="Phuglee home">
      <img
        src="/images/phuglee-text-logo.svg"
        alt="Phuglee"
        class="shell-brand-logo"
        width="120"
        height="26"
        decoding="async"
      >
    </a>
    <div class="shell-links">
      ${coreHtml}
      <a href="${ANALYZER_LINK.href}" class="${analyzerClass}"${current === ANALYZER_LINK.id ? ' aria-current="page"' : ''}>${ANALYZER_LINK.label}</a>
      <a href="${VAULT_LINK.href}" class="${vaultClass}"${current === VAULT_LINK.id ? ' aria-current="page"' : ''}>${VAULT_LINK.label}</a>
      ${actionsHtml}
    </div>
  </nav>
</header>`;
  }

  function isAuthenticated() {
    if (window.PhugleeSession && typeof window.PhugleeSession.isAuthenticated === 'function') {
      return window.PhugleeSession.isAuthenticated();
    }
    try {
      return !!sessionStorage.getItem('phuglee_session');
    } catch (_) {
      return false;
    }
  }

  function guardNavLinks(root) {
    if (!root || isAuthenticated()) return;
    root.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('#')) return;
      const path = normalizePath(href.split('?')[0].split('#')[0]);
      if (path === '/') return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const returnUrl = href.startsWith('/') ? href : path;
        window.location.href = '/?login=1&return=' + encodeURIComponent(returnUrl);
      });
    });
  }

  function mount() {
    const path = window.location.pathname;
    if (normalizePath(path) === '/') return;
    const existing = document.getElementById('distress-os-nav');
    const html = buildNav(path);

    if (existing) {
      existing.outerHTML = html;
    } else {
      const mountEl = document.getElementById('distress-os-nav-mount');
      if (mountEl) {
        mountEl.innerHTML = html;
      } else {
        document.body.insertAdjacentHTML('afterbegin', html);
      }
    }

    const wrap = document.getElementById('distress-os-nav');
    const isEmbedded = path.startsWith('/forge') || path.startsWith('/analyzer');
    if (wrap) {
      const h = wrap.offsetHeight;
      document.documentElement.style.setProperty('--distress-nav-offset', h + 'px');
      // Embedded proxied apps position content with --distress-nav-offset; avoid double top pad.
      if (isEmbedded) {
        document.body.style.paddingTop = '';
      } else {
        document.body.style.paddingTop = h + 'px';
      }
      guardNavLinks(wrap);
    }

    if (path.startsWith('/forge')) {
      document.body.classList.add('distress-os-embedded');
    }
    if (path.startsWith('/analyzer')) {
      document.body.classList.add('distress-os-embedded', 'analyzer-embedded');
    }

    mountFooter();
    document.body.classList.add('has-shell-chrome');

    if (window.PhugleeSettings && typeof window.PhugleeSettings.mount === 'function') {
      window.PhugleeSettings.mount();
    }
    if (window.DistressStatus && typeof window.DistressStatus.mount === 'function') {
      window.DistressStatus.mount();
    }
    if (window.PhugleeMotion && typeof window.PhugleeMotion.init === 'function') {
      window.PhugleeMotion.init();
    }
    if (window.PhugleeStates && typeof window.PhugleeStates.init === 'function') {
      window.PhugleeStates.init();
    }
  }

  window.DistressOSShellNav = { mount, buildNav, buildFooter, activeId };
  mount();
})();