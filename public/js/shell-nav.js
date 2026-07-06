(function () {
  const CORE_LINKS = [
    { id: 'home', label: 'Home', href: '/' },
    { id: 'heat', label: 'Command Hub', href: '/heat' },
    { id: 'bridge', label: 'Data Bridge', href: '/bridge' }
  ];

  const FORGE_LINKS = [
    { id: 'forge-desk', label: 'Records Desk', href: '/forge/' },
    { id: 'forge-portal', label: 'City Tracker', href: '/forge/portal' },
    { id: 'forge-map', label: 'Coverage Map', href: '/forge/map' },
    { id: 'forge-pdfs', label: 'Request PDFs', href: '/forge/request-pdfs' },
    { id: 'forge-submit', label: 'Submit Portals', href: '/forge/submit-portals' },
    { id: 'forge-email', label: 'Email-only', href: '/forge/email-only-requests' },
    { id: 'forge-errors', label: 'Portal Errors', href: '/forge/portal-errors' }
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
    for (const link of FORGE_LINKS) {
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

    return `
<header class="shell-nav-wrap" id="distress-os-nav">
  <nav class="shell-nav" aria-label="Distress OS">
    <a href="/" class="shell-brand">
      <span class="shell-brand-mark" aria-hidden="true">DO</span>
      <span class="shell-brand-text">Distress OS</span>
    </a>
    <div class="shell-links">
      ${coreHtml}
      <a href="${ANALYZER_LINK.href}" class="${analyzerClass}"${current === ANALYZER_LINK.id ? ' aria-current="page"' : ''}>${ANALYZER_LINK.label}</a>
    </div>
    <div class="shell-status" aria-live="polite">
      <span class="shell-status-pill" id="status-forge"><span class="shell-status-dot" aria-hidden="true"></span><span class="shell-status-label">Forge</span></span>
      <span class="shell-status-pill" id="status-analyzer"><span class="shell-status-dot" aria-hidden="true"></span><span class="shell-status-label">Analyzer</span></span>
    </div>
  </nav>
  <div class="shell-nav-row2" aria-label="Form Forge pages">
    <span class="shell-nav-row2-label">Form Forge</span>
    ${forgeHtml}
  </div>
</header>`;
  }

  function mount() {
    const path = window.location.pathname;
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