(function () {
  const CORE_LINKS = [
    { id: 'collect', label: 'Collect Records', href: '/collect' },
    { id: 'heat', label: 'How It Works', href: '/heat' },
    { id: 'bridge', label: 'Data Bridge', href: '/bridge' }
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

  const ANALYZER_LINK = { id: 'analyzer', label: 'Property Analyzer', href: '/analyzer/' };

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

  function sublinkClass(id, current) {
    return id === current ? 'shell-sublink active' : 'shell-sublink';
  }

  function buildNav(pathname) {
    const current = activeId(pathname);
    const coreHtml = CORE_LINKS.map((l) =>
      `<a href="${l.href}" class="${linkClass(l.id, current)}"${current === l.id ? ' aria-current="page"' : ''}>${l.label}</a>`
    ).join('');

    const forgeHtml = FORGE_LINKS.map((l) =>
      `<a href="${l.href}" class="${sublinkClass(l.id, current)}"${current === l.id ? ' aria-current="page"' : ''}>${l.label}</a>`
    ).join('<span class="shell-nav-divider" aria-hidden="true"></span>');

    const analyzerClass = linkClass(ANALYZER_LINK.id, current);
    const signOutHtml = isAuthenticated()
      ? '<span class="shell-nav-divider shell-sign-out-divider" aria-hidden="true"></span><button type="button" class="shell-link shell-sign-out" id="shell-sign-out">Sign Out</button>'
      : '';

    return `
<header class="shell-nav-wrap" id="distress-os-nav">
  <nav class="shell-nav" aria-label="Main navigation">
    <a href="/heat" class="shell-brand" aria-label="Phuglee home">
      <img
        src="/images/phuglee-text-logo.svg"
        alt="Phuglee"
        class="shell-brand-logo"
        width="148"
        height="32"
        decoding="async"
      >
    </a>
    <div class="shell-links">
      ${coreHtml}
      <a href="${ANALYZER_LINK.href}" class="${analyzerClass}"${current === ANALYZER_LINK.id ? ' aria-current="page"' : ''}>${ANALYZER_LINK.label}</a>
      ${signOutHtml}
    </div>
  </nav>
  <div class="shell-nav-row2" aria-label="Tool pages">
    ${forgeHtml}
  </div>
</header>`;
  }

  function isAuthenticated() {
    try {
      return !!sessionStorage.getItem('phuglee_session');
    } catch (_) {
      return false;
    }
  }

  function logout() {
    try {
      sessionStorage.removeItem('phuglee_session');
    } catch (_) {}
    window.location.href = '/';
  }

  function bindSignOut(root) {
    const btn = root && root.querySelector('#shell-sign-out');
    if (btn) {
      btn.addEventListener('click', logout);
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
      const mount = document.getElementById('distress-os-nav-mount');
      if (mount) {
        mount.innerHTML = html;
      } else {
        document.body.insertAdjacentHTML('afterbegin', html);
      }
    }

    const wrap = document.getElementById('distress-os-nav');
    if (wrap) {
      const h = wrap.offsetHeight;
      document.documentElement.style.setProperty('--distress-nav-offset', h + 'px');
      document.body.style.paddingTop = h + 'px';
      guardNavLinks(wrap);
      bindSignOut(wrap);
    }

    if (path.startsWith('/forge')) {
      document.body.classList.add('distress-os-embedded');
    }
    if (path.startsWith('/analyzer')) {
      document.body.classList.add('distress-os-embedded', 'analyzer-embedded');
    }
  }

  window.DistressOSShellNav = { mount, buildNav, activeId };
  mount();
})();