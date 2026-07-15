(function () {
  const DASHBOARD_LINK = { id: 'command', label: 'Dashboard', href: '/command' };

  const PROPERTIES_LINKS = [
    { id: 'collect', label: 'Collect', href: '/collect' },
    { id: 'bridge', label: 'Filter', href: '/filter' },
    { id: 'analyzer', label: 'Analyze', href: '/analyzer/' },
    { id: 'forge-portal', label: 'City Tracker', href: '/forge/portal' }
  ];

  const ADMIN_PROPERTIES_LINKS = [
    { id: 'pipeline', label: 'Sales Pipeline', href: '/pipeline' },
    { id: 'under-contract', label: 'Contract Tracker', href: '/under-contract' },
    { id: 'operating-costs', label: 'Operating Costs', href: '/operating-costs' }
  ];

  function isAdminUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'admin';
    } catch (_) {
      return false;
    }
  }

  function isDisposUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isDispos === 'function') {
      return window.PhugleeSettings.isDispos() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'brad';
    } catch (_) {
      return false;
    }
  }

  function isVaultOnlyUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isVaultOnly === 'function') {
      return window.PhugleeSettings.isVaultOnly() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'matt';
    } catch (_) {
      return false;
    }
  }

  function isContractDeskUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    return isAdminUser() || isDisposUser();
  }

  function propertiesLinks() {
    if (isDisposUser() || isVaultOnlyUser()) return [];
    if (!isAdminUser()) return PROPERTIES_LINKS.slice();
    return PROPERTIES_LINKS.concat(ADMIN_PROPERTIES_LINKS);
  }

  const FORGE_LINKS = [
    { id: 'forge-desk', label: 'PDF Filler', href: '/forge/' },
    { id: 'forge-portal', label: 'Request Tracker', href: '/forge/portal' },
    { id: 'forge-map', label: 'Map', href: '/forge/map' },
    { id: 'forge-pdfs', label: 'Request PDFs', href: '/forge/portal/request-pdfs' },
    { id: 'forge-submit', label: 'Submit Portals', href: '/forge/portal/submit-portals' },
    { id: 'forge-email', label: 'Email-only', href: '/forge/portal/email-only' },
    { id: 'forge-errors', label: 'Portal Errors', href: '/forge/portal/portal-errors' }
  ];

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
    // Filter page: /filter is canonical; /bridge remains a legacy alias.
    if (h === '/filter' || h === '/bridge') {
      return p === '/filter' || p === '/bridge';
    }
    return p === h || p.startsWith(h + '/');
  }

  function activeId(path) {
    const p = normalizePath(path);
    if (p === '/command') return 'command';
    if (p === '/vault') return 'vault';
    if (p === '/pipeline') return 'pipeline';
    if (p === '/under-contract') return 'under-contract';
    if (p === '/operating-costs') return 'operating-costs';
    if (p === '/filter' || p === '/bridge') return 'bridge';
    const forgeLinks = [...FORGE_LINKS].sort((a, b) => b.href.length - a.href.length);
    for (const link of forgeLinks) {
      if (matchLink(p, link.href)) return link.id;
    }
    for (const link of propertiesLinks()) {
      if (matchLink(p, link.href)) return link.id;
    }
    return null;
  }

  function isPropertiesSectionActive(current) {
    return propertiesLinks().some((l) => l.id === current);
  }

  function linkClass(id, current) {
    return id === current ? 'shell-link active' : 'shell-link';
  }

  function isAnalyzerPath(pathname) {
    return matchLink(normalizePath(pathname), '/analyzer/');
  }

  function buildFooter(pathname) {
    const onAnalyzer = isAnalyzerPath(pathname || window.location.pathname);
    if (isVaultOnlyUser()) {
      return `
<footer class="shell-footer" id="distress-os-footer">
  <div class="shell-footer-inner">
    <div class="shell-footer-brand-block">
      <span class="shell-footer-brand">PHUGLEE</span>
      <span class="shell-footer-meta">The Vault</span>
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/vault" class="shell-footer-link">The Vault</a>
    </nav>
  </div>
</footer>`;
    }
    const metaLine = onAnalyzer
      ? ''
      : '<span class="shell-footer-meta">Distress OS · Collect. Filter. Analyze.</span>';
    const trustLine = onAnalyzer
      ? ''
      : '<p class="shell-footer-trust">Public records only · Your data stays on your machine</p>';
    return `
<footer class="shell-footer" id="distress-os-footer">
  <div class="shell-footer-inner">
    <div class="shell-footer-brand-block">
      <span class="shell-footer-brand">PHUGLEE</span>
      ${metaLine}
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/heat" class="shell-footer-link">How It Works</a>
      <a href="/collect" class="shell-footer-link">Collect</a>
      <a href="/filter" class="shell-footer-link">Filter</a>
      <a href="/analyzer/" class="shell-footer-link">Analyze</a>
      <a href="/vault" class="shell-footer-link">The Vault</a>
    </nav>
  </div>
  ${trustLine}
</footer>`;
  }

  function mountFooter() {
    const path = window.location.pathname;
    const onAnalyzer = isAnalyzerPath(path);
    const existing = document.getElementById('distress-os-footer');
    const mount = document.getElementById('distress-os-footer-mount');

    if (onAnalyzer) {
      existing?.remove();
      if (mount) mount.innerHTML = '';
      return;
    }

    const html = buildFooter(path);
    if (existing) {
      existing.outerHTML = html;
    } else if (mount) {
      mount.innerHTML = html;
    } else {
      document.body.insertAdjacentHTML('beforeend', html);
    }
  }

  function buildPropertiesDropdown(current) {
    const sectionActive = isPropertiesSectionActive(current);
    const triggerClass = sectionActive
      ? 'shell-link shell-nav-dropdown-trigger active'
      : 'shell-link shell-nav-dropdown-trigger';
    const itemsHtml = propertiesLinks().map((l) => {
      const itemActive = current === l.id;
      const icon = l.emoji ? `<span class="shell-nav-dropdown-icon" aria-hidden="true">${l.emoji}</span>` : '';
      return `<a href="${l.href}" class="shell-nav-dropdown-item${itemActive ? ' active' : ''}" role="menuitem"${itemActive ? ' aria-current="page"' : ''}>${icon}<span class="shell-nav-dropdown-label">${l.label}</span></a>`;
    }).join('');

    return `
      <div class="shell-nav-dropdown" id="shell-properties-dropdown-wrap">
        <button
          type="button"
          class="${triggerClass}"
          id="shell-properties-trigger"
          aria-expanded="false"
          aria-haspopup="true"
          aria-controls="shell-properties-menu"
        >
          Properties
          <svg class="shell-nav-dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="shell-nav-dropdown-menu" id="shell-properties-menu" role="menu" hidden>
          ${itemsHtml}
        </div>
      </div>`;
  }

  function buildNav(pathname) {
    const current = activeId(pathname);
    const vaultHtml = `<a href="/vault" class="${linkClass('vault', current)}"${current === 'vault' ? ' aria-current="page"' : ''}>The Vault</a>`;
    const pipelineHtml = `<a href="/pipeline" class="${linkClass('pipeline', current)}"${current === 'pipeline' ? ' aria-current="page"' : ''}>Sales Pipeline</a>`;
    const contractHtml = `<a href="/under-contract" class="${linkClass('under-contract', current)}"${current === 'under-contract' ? ' aria-current="page"' : ''}>Contract Tracker</a>`;

    let linksHtml;
    if (isVaultOnlyUser()) {
      linksHtml = vaultHtml;
    } else if (isDisposUser()) {
      // Disposition partner: Tracker + Pipeline glance + Vault
      linksHtml = contractHtml + pipelineHtml + vaultHtml;
    } else {
      const dashboardHtml = `<a href="${DASHBOARD_LINK.href}" class="${linkClass(DASHBOARD_LINK.id, current)}"${current === DASHBOARD_LINK.id ? ' aria-current="page"' : ''}>${DASHBOARD_LINK.label}</a>`;
      const propertiesHtml = buildPropertiesDropdown(current);
      linksHtml = dashboardHtml + vaultHtml + propertiesHtml;
    }

    const actionsHtml = isAuthenticated()
      ? `<div class="shell-nav-actions">
          <div id="shell-settings-slot"></div>
        </div>`
      : '';

    const brandHref = isVaultOnlyUser() ? '/vault' : (isDisposUser() ? '/under-contract' : '/');

    return `
<div class="shell-loading-strip" id="shell-loading-strip" hidden aria-live="polite">
  <div class="phuglee-loading-bar" aria-hidden="true"></div>
  <span class="phuglee-loading-copy">Heating up leads…</span>
</div>
<header class="shell-nav-wrap distress-glass--chrome" id="distress-os-nav">
  <nav class="shell-nav" aria-label="Main navigation">
    <a href="${brandHref}" class="shell-brand" aria-label="Phuglee home">
      <img
        src="/images/phuglee-text-logo.svg"
        alt="Phuglee"
        class="shell-brand-logo"
        width="120"
        height="26"
        decoding="async"
      >
    </a>
    <div class="shell-nav-toolbar">
      <button
        type="button"
        class="shell-nav-palette-btn"
        id="shell-cmd-palette-btn"
        aria-label="Open command palette"
        title="Jump anywhere (Ctrl+K)"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="shell-nav-palette-label">Jump</span>
      </button>
      <button
        type="button"
        class="shell-nav-menu-btn"
        id="shell-nav-menu-btn"
        aria-expanded="false"
        aria-controls="shell-links"
        aria-label="Open menu"
      >
        <span class="shell-nav-menu-bars" aria-hidden="true"></span>
      </button>
    </div>
    <div class="shell-links" id="shell-links">
      ${linksHtml}
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
      if (sessionStorage.getItem('phuglee_logout') === '1') return false;
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

  function closePropertiesDropdown() {
    const menu = document.getElementById('shell-properties-menu');
    const trigger = document.getElementById('shell-properties-trigger');
    const wrap = document.getElementById('shell-properties-dropdown-wrap');
    if (!menu) return;
    menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    wrap?.classList.remove('is-open');
  }

  function openPropertiesDropdown() {
    const menu = document.getElementById('shell-properties-menu');
    const trigger = document.getElementById('shell-properties-trigger');
    const wrap = document.getElementById('shell-properties-dropdown-wrap');
    if (!menu) return;
    menu.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    wrap?.classList.add('is-open');
  }

  function togglePropertiesDropdown() {
    const menu = document.getElementById('shell-properties-menu');
    if (!menu) return;
    if (menu.hidden) openPropertiesDropdown();
    else closePropertiesDropdown();
  }

  function bindPropertiesDropdown(root) {
    if (!root || root.dataset.propertiesBound === '1') return;
    const wrap = root.querySelector('#shell-properties-dropdown-wrap');
    const trigger = root.querySelector('#shell-properties-trigger');
    if (!wrap || !trigger) return;
    root.dataset.propertiesBound = '1';

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePropertiesDropdown();
    });

    wrap.querySelectorAll('.shell-nav-dropdown-item').forEach((link) => {
      link.addEventListener('click', () => closePropertiesDropdown());
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closePropertiesDropdown();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePropertiesDropdown();
    });
  }

  function closeMobileNav() {
    const wrap = document.getElementById('distress-os-nav');
    const btn = document.getElementById('shell-nav-menu-btn');
    wrap?.classList.remove('is-nav-open');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
  }

  function toggleMobileNav() {
    const wrap = document.getElementById('distress-os-nav');
    const btn = document.getElementById('shell-nav-menu-btn');
    if (!wrap || !btn) return;
    const open = !wrap.classList.contains('is-nav-open');
    wrap.classList.toggle('is-nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  function bindMobileChrome(root) {
    if (!root || root.dataset.mobileBound === '1') return;
    root.dataset.mobileBound = '1';

    const menuBtn = root.querySelector('#shell-nav-menu-btn');
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileNav();
    });

    const paletteBtn = root.querySelector('#shell-cmd-palette-btn');
    paletteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.PhugleeCommandPalette && typeof window.PhugleeCommandPalette.open === 'function') {
        window.PhugleeCommandPalette.open();
      }
    });

    root.querySelectorAll('.shell-links a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMobileNav());
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
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
      if (isEmbedded) {
        document.body.style.paddingTop = '';
      } else {
        document.body.style.paddingTop = h + 'px';
      }
      guardNavLinks(wrap);
      bindPropertiesDropdown(wrap);
      bindMobileChrome(wrap);
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

  // Cookie-restored sessions arrive async — remount once so admin Contract Tracker appears.
  if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
    window.PhugleeSession.syncSessionFromServerCookie().then(function (data) {
      if (data && data.username) mount();
    });
  }

  window.DistressOSShellNav = {
    mount,
    buildNav,
    buildFooter,
    activeId,
    PROPERTIES_LINKS,
    isPropertiesSectionActive,
    isAdminUser,
    isDisposUser,
    isVaultOnlyUser,
    isContractDeskUser
  };
  mount();
})();