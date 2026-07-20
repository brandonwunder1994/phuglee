(function () {
  const DASHBOARD_LINK = { id: 'command', label: 'Dashboard', href: '/command' };

  const DATA_LINKS = [
    { id: 'collect', label: 'Request', href: '/collect' },
    { id: 'bridge', label: 'Filter', href: '/filter' },
    { id: 'analyzer', label: 'Review', href: '/analyzer/' }
  ];

  const PIPELINE_LINKS = [
    { id: 'under-contract', label: 'Under Contract', href: '/under-contract' },
    { id: 'pipeline', label: 'All Leads', href: '/pipeline' },
    { id: 'buyers', label: 'Buyers', href: '/buyers' }
  ];

  const VAULT_LINKS = [
    { id: 'vault', label: 'Homes', href: '/vault' },
    { id: 'land-vault', label: 'Land', href: '/land-vault' }
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

  const FORGE_LINKS = [
    { id: 'forge-desk', label: 'PDF Filler', href: '/forge/' },
    { id: 'forge-portal', label: 'Track Progress', href: '/forge/portal' },
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
    if (p === '/land-vault') return 'land-vault';
    if (p === '/pipeline') return 'pipeline';
    if (p === '/under-contract') return 'under-contract';
    if (p === '/buyers' || p === '/trust-funds') return 'buyers';
    if (p === '/operating-costs') return 'operating-costs';
    // Collect sub-desks — highlight Collect in Data, not top-nav entries.
    if (p === '/government-lists' || p === '/pre-liens') return 'collect';
    if (p === '/filter' || p === '/bridge') return 'bridge';
    const forgeLinks = [...FORGE_LINKS].sort((a, b) => b.href.length - a.href.length);
    for (const link of forgeLinks) {
      if (matchLink(p, link.href)) return link.id;
    }
    for (const link of DATA_LINKS) {
      if (matchLink(p, link.href)) return link.id;
    }
    return null;
  }

  function isDataSectionActive(current) {
    return DATA_LINKS.some((l) => l.id === current);
  }

  function isPipelineSectionActive(current) {
    return PIPELINE_LINKS.some((l) => l.id === current);
  }

  function isVaultsSectionActive(current) {
    return VAULT_LINKS.some((l) => l.id === current);
  }

  // Back-compat alias for older tests / callers.
  function isPropertiesSectionActive(current) {
    return isDataSectionActive(current);
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
      <span class="shell-footer-meta">Homes · Land</span>
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/vault" class="shell-footer-link">Homes</a>
      <a href="/land-vault" class="shell-footer-link">Land</a>
    </nav>
  </div>
</footer>`;
    }
    if (isDisposUser()) {
      return `
<footer class="shell-footer" id="distress-os-footer">
  <div class="shell-footer-inner">
    <div class="shell-footer-brand-block">
      <span class="shell-footer-brand">PHUGLEE</span>
      <span class="shell-footer-meta">Disposition desk</span>
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/collect" class="shell-footer-link">Request</a>
      <a href="/under-contract" class="shell-footer-link">Under Contract</a>
      <a href="/pipeline" class="shell-footer-link">All Leads</a>
      <a href="/buyers" class="shell-footer-link">Buyers</a>
      <a href="/vault" class="shell-footer-link">Homes</a>
      <a href="/land-vault" class="shell-footer-link">Land</a>
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
      <a href="/collect" class="shell-footer-link">Request</a>
      <a href="/filter" class="shell-footer-link">Filter</a>
      <a href="/analyzer/" class="shell-footer-link">Review</a>
      <a href="/vault" class="shell-footer-link">Homes</a>
      <a href="/land-vault" class="shell-footer-link">Land</a>
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

  function buildNavDropdown(opts) {
    const {
      id,
      label,
      links,
      sectionActive
    } = opts;
    const triggerClass = sectionActive
      ? 'shell-link shell-nav-dropdown-trigger active'
      : 'shell-link shell-nav-dropdown-trigger';
    const itemsHtml = links.map((l) => {
      const itemActive = opts.current === l.id;
      const icon = l.emoji
        ? `<span class="shell-nav-dropdown-icon" aria-hidden="true">${l.emoji}</span>`
        : '';
      return `<a href="${l.href}" class="shell-nav-dropdown-item${itemActive ? ' active' : ''}" role="menuitem"${itemActive ? ' aria-current="page"' : ''}>${icon}<span class="shell-nav-dropdown-label">${l.label}</span></a>`;
    }).join('');

    const wrapId = `shell-${id}-dropdown-wrap`;
    const triggerId = `shell-${id}-trigger`;
    const menuId = `shell-${id}-menu`;

    return `
      <div class="shell-nav-dropdown" id="${wrapId}" data-shell-dropdown="${id}">
        <button
          type="button"
          class="${triggerClass}"
          id="${triggerId}"
          aria-expanded="false"
          aria-haspopup="true"
          aria-controls="${menuId}"
        >
          ${label}
          <svg class="shell-nav-dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="shell-nav-dropdown-menu" id="${menuId}" role="menu" hidden>
          ${itemsHtml}
        </div>
      </div>`;
  }

  function buildDataDropdown(current) {
    return buildNavDropdown({
      id: 'data',
      label: 'Data',
      links: DATA_LINKS,
      sectionActive: isDataSectionActive(current),
      current
    });
  }

  function buildPipelineDropdown(current) {
    return buildNavDropdown({
      id: 'pipeline',
      label: 'Pipeline',
      links: PIPELINE_LINKS,
      sectionActive: isPipelineSectionActive(current),
      current
    });
  }

  function buildVaultsDropdown(current) {
    return buildNavDropdown({
      id: 'vaults',
      label: 'Leads',
      links: VAULT_LINKS,
      sectionActive: isVaultsSectionActive(current),
      current
    });
  }

  function buildNav(pathname) {
    const current = activeId(pathname);
    const vaultHtml = buildVaultsDropdown(current);

    let linksHtml;
    if (isVaultOnlyUser()) {
      linksHtml = vaultHtml;
    } else if (isDisposUser()) {
      const collectHtml = `<a href="/collect" class="${linkClass('collect', current)}"${current === 'collect' ? ' aria-current="page"' : ''}>Request</a>`;
      linksHtml = collectHtml + buildPipelineDropdown(current) + vaultHtml;
    } else {
      const dashboardHtml = `<a href="${DASHBOARD_LINK.href}" class="${linkClass(DASHBOARD_LINK.id, current)}"${current === DASHBOARD_LINK.id ? ' aria-current="page"' : ''}>${DASHBOARD_LINK.label}</a>`;
      const dataHtml = buildDataDropdown(current);
      const pipelineHtml = isAdminUser() ? buildPipelineDropdown(current) : '';
      linksHtml = dashboardHtml + vaultHtml + dataHtml + pipelineHtml;
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

  function closeDropdown(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector('.shell-nav-dropdown-menu');
    const trigger = wrap.querySelector('.shell-nav-dropdown-trigger');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('is-open');
  }

  function openDropdown(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector('.shell-nav-dropdown-menu');
    const trigger = wrap.querySelector('.shell-nav-dropdown-trigger');
    if (menu) menu.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-open');
  }

  function closeAllDropdowns(root) {
    (root || document).querySelectorAll('[data-shell-dropdown]').forEach((wrap) => {
      closeDropdown(wrap);
    });
  }

  function bindNavDropdowns(root) {
    if (!root || root.dataset.dropdownsBound === '1') return;
    const wraps = root.querySelectorAll('[data-shell-dropdown]');
    if (!wraps.length) return;
    root.dataset.dropdownsBound = '1';

    wraps.forEach((wrap) => {
      const trigger = wrap.querySelector('.shell-nav-dropdown-trigger');
      if (!trigger) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = wrap.classList.contains('is-open');
        closeAllDropdowns(root);
        if (!wasOpen) openDropdown(wrap);
      });

      wrap.querySelectorAll('.shell-nav-dropdown-item').forEach((link) => {
        link.addEventListener('click', () => closeAllDropdowns(root));
      });
    });

    document.addEventListener('click', (e) => {
      if (![...wraps].some((w) => w.contains(e.target))) closeAllDropdowns(root);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDropdowns(root);
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
      bindNavDropdowns(wrap);
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

  // Cookie-restored sessions arrive async — remount once so admin Pipeline menu appears.
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
    DATA_LINKS,
    PIPELINE_LINKS,
    VAULT_LINKS,
    PROPERTIES_LINKS: DATA_LINKS,
    isDataSectionActive,
    isPipelineSectionActive,
    isVaultsSectionActive,
    isPropertiesSectionActive,
    isAdminUser,
    isDisposUser,
    isVaultOnlyUser,
    isContractDeskUser
  };
  mount();
})();
