(function () {
  const DASHBOARD_LINK = { id: 'command', label: 'Dashboard', href: '/command' };

  /** Data desk order: Request → Filter → Review → Government Lists (Pre-liens lives on GL page). */
  const DATA_LINKS = [
    { id: 'collect', label: 'Request', href: '/collect' },
    { id: 'bridge', label: 'Filter', href: '/filter' },
    { id: 'analyzer', label: 'Review', href: '/analyzer/' },
    { id: 'government-lists', label: 'Government Lists', href: '/government-lists' }
  ];

  /** Dispo desk (was Pipeline) — Under Contract + Buyers only; /pipeline page stays reachable via URL/settings if needed. */
  const PIPELINE_LINKS = [
    { id: 'under-contract', label: 'Under Contract', href: '/under-contract' },
    { id: 'buyers', label: 'Buyers', href: '/buyers' }
  ];

  /** Leads desk (was Vault) */
  const VAULT_LINKS = [
    { id: 'vault', label: 'Houses', href: '/vault' },
    { id: 'land-vault', label: 'Land', href: '/land-vault' }
  ];

  const FORGE_LINKS = [
    { id: 'forge-desk', label: 'PDF Filler', href: '/forge/' },
    { id: 'forge-portal', label: 'Track Progress', href: '/forge/portal' },
    { id: 'forge-map', label: 'Map', href: '/forge/map' },
    { id: 'forge-pdfs', label: 'Request PDFs', href: '/forge/portal/request-pdfs' },
    { id: 'forge-submit', label: 'Submit Portals', href: '/forge/portal/submit-portals' },
    { id: 'forge-email', label: 'Email-only', href: '/forge/portal/email-only' },
    { id: 'forge-errors', label: 'Portal Errors', href: '/forge/portal/portal-errors' }
  ];

  /** Minimal monochrome icons for rail rows (16×16 viewBox). */
  const ICONS = {
    command:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    collect:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 3.5h10v9H3z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 6.5h5M5.5 9h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    'government-lists':
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 13.5h11M3.5 13.5V5.5L8 2.5l4.5 3v8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.5 13.5v-4h3v4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    'pre-liens':
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 2.5h6.5L13 5v8.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 2.5V5h2.8M6 8h4M6 10.5h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    bridge:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 11.5 6 4.5l2.2 4.2L10.5 6l3 5.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    analyzer:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2 13.5 13.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    'under-contract':
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 3.5h9v9h-9z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 8.2 7.1 9.8 10.5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pipeline:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 4.5h4v7h-4zM9.5 4.5h4v7h-4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 8h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    buyers:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="6" cy="5.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 13c0-2.2 1.6-3.5 3.5-3.5s3.5 1.3 3.5 3.5M11 7.5v4M9 9.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    vault:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 6.5 8 3l5.5 3.5v6.5H2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.5 13V9h3v4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    'land-vault':
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 11.5 5.5 6l2.5 3.2L10.5 5.5 14 11.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 13h12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    default:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
  };

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
    if (p === '/government-lists') return 'government-lists';
    if (p === '/pre-liens') return 'pre-liens';
    if (p === '/filter' || p === '/bridge') return 'bridge';
    if (p === '/heat') return 'heat';
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
    // Pre-liens is reached from Government Lists, not a rail row — still light Data.
    if (current === 'pre-liens') return true;
    return DATA_LINKS.some((l) => l.id === current);
  }

  function isPipelineSectionActive(current) {
    return PIPELINE_LINKS.some((l) => l.id === current);
  }

  function isVaultSectionActive(current) {
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

  /** Ops desks: chrome only — no marketing/link footer (matches Analyze / Collect). */
  function isOpsDeskNoFooterPath(pathname) {
    const p = normalizePath(pathname || window.location.pathname);
    if (isAnalyzerPath(p)) return true;
    if (matchLink(p, '/filter') || matchLink(p, '/bridge')) return true;
    if (matchLink(p, '/collect')) return true;
    return false;
  }

  function iconFor(id) {
    return ICONS[id] || ICONS.default;
  }

  function pageTitleFor(pathname) {
    const id = activeId(pathname);
    const all = [DASHBOARD_LINK, ...DATA_LINKS, ...PIPELINE_LINKS, ...VAULT_LINKS, ...FORGE_LINKS];
    const hit = all.find((l) => l.id === id);
    if (hit) return hit.label;
    const p = normalizePath(pathname);
    if (p === '/heat') return 'How It Works';
    if (p === '/operating-costs') return 'Operating Costs';
    return 'Phuglee';
  }

  function buildFooter(pathname) {
    const onAnalyzer = isAnalyzerPath(pathname || window.location.pathname);
    if (isVaultOnlyUser()) {
      return `
<footer class="shell-footer" id="phuglee-footer">
  <div class="shell-footer-inner">
    <div class="shell-footer-brand-block">
      <span class="shell-footer-brand">PHUGLEE</span>
      <span class="shell-footer-meta">Houses · Land</span>
    </div>
    <nav class="shell-footer-links" aria-label="Footer">
      <a href="/vault" class="shell-footer-link">Houses</a>
      <a href="/land-vault" class="shell-footer-link">Land</a>
    </nav>
  </div>
</footer>`;
    }
    const metaLine = onAnalyzer
      ? ''
      : '<span class="shell-footer-meta">Phuglee · Collect. Filter. Analyze.</span>';
    const trustLine = onAnalyzer
      ? ''
      : '<p class="shell-footer-trust">Public records only · Your data stays on your machine</p>';
    return `
<footer class="shell-footer" id="phuglee-footer">
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
      <a href="/government-lists" class="shell-footer-link">Government Lists</a>
      <a href="/vault" class="shell-footer-link">The Vault</a>
    </nav>
  </div>
  ${trustLine}
</footer>`;
  }

  function elById(...ids) {
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(ids[i]);
      if (el) return el;
    }
    return null;
  }

  function mountFooter() {
    const path = window.location.pathname;
    // Prefer phuglee-*; accept legacy distress-os-* during rename transition.
    const existing = elById('phuglee-footer', 'distress-os-footer');
    const mount = elById('phuglee-footer-mount', 'distress-os-footer-mount');

    if (isOpsDeskNoFooterPath(path)) {
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

  function buildRailLink(link, current) {
    const active = link.id === current;
    return (
      `<a href="${link.href}" class="${linkClass(link.id, current)}"${active ? ' aria-current="page"' : ''} data-shell-id="${link.id}">` +
      `<span class="shell-link-icon" aria-hidden="true">${iconFor(link.id)}</span>` +
      `<span class="shell-link-label">${link.label}</span>` +
      `</a>`
    );
  }

  function buildRailSection(opts) {
    const { id, label, links, current, sectionActive } = opts;
    const items = links.map((l) => buildRailLink(l, current)).join('');
    return `
      <div class="shell-rail-section${sectionActive ? ' is-active-section' : ''}" data-shell-section="${id}">
        <div class="shell-rail-section-label" id="shell-${id}-trigger">${label}</div>
        <div class="shell-rail-section-links" role="group" aria-labelledby="shell-${id}-trigger">
          ${items}
        </div>
      </div>`;
  }

  function buildNav(pathname) {
    const current = activeId(pathname);

    let railBody = '';
    if (isVaultOnlyUser()) {
      railBody = buildRailSection({
        id: 'vault',
        label: 'Leads',
        links: VAULT_LINKS,
        current,
        sectionActive: isVaultSectionActive(current)
      });
    } else if (isDisposUser()) {
      // Dashboard-adjacent order: Leads, then Dispo
      railBody =
        buildRailSection({
          id: 'vault',
          label: 'Leads',
          links: VAULT_LINKS,
          current,
          sectionActive: isVaultSectionActive(current)
        }) +
        buildRailSection({
          id: 'pipeline',
          label: 'Dispo',
          links: PIPELINE_LINKS,
          current,
          sectionActive: isPipelineSectionActive(current)
        });
    } else {
      const dashboardHtml =
        `<div class="shell-rail-primary">` +
        buildRailLink(DASHBOARD_LINK, current) +
        `</div>`;
      const leadsHtml = buildRailSection({
        id: 'vault',
        label: 'Leads',
        links: VAULT_LINKS,
        current,
        sectionActive: isVaultSectionActive(current)
      });
      const dispoHtml = isAdminUser()
        ? buildRailSection({
            id: 'pipeline',
            label: 'Dispo',
            links: PIPELINE_LINKS,
            current,
            sectionActive: isPipelineSectionActive(current)
          })
        : '';
      const dataHtml = buildRailSection({
        id: 'data',
        label: 'Data',
        links: DATA_LINKS,
        current,
        sectionActive: isDataSectionActive(current)
      });
      // Dashboard → Leads → Dispo → Data
      railBody = dashboardHtml + leadsHtml + dispoHtml + dataHtml;
    }

    const railFooterHtml = isAuthenticated()
      ? `<div class="shell-rail-footer">
          <div class="shell-nav-actions">
            <div id="shell-settings-slot"></div>
          </div>
        </div>`
      : '';

    const brandHref = isVaultOnlyUser() ? '/vault' : isDisposUser() ? '/under-contract' : '/';

    // No page-title top bar, no Jump button — rail only (hamburger on mobile).
    return `
<div class="shell-chrome" id="phuglee-nav">
  <div class="shell-loading-strip" id="shell-loading-strip" hidden aria-hidden="true">
    <div class="phuglee-loading-bar" aria-hidden="true"></div>
  </div>
  <aside class="shell-rail" id="shell-rail" aria-label="Product navigation">
    <a href="${brandHref}" class="shell-brand" aria-label="Phuglee home">
      <img
        src="/images/phuglee-text-logo.svg"
        alt="Phuglee"
        class="shell-brand-logo"
        width="200"
        height="44"
        decoding="async"
      >
    </a>
    <nav class="shell-rail-nav shell-links" id="shell-links">
      ${railBody}
    </nav>
    ${railFooterHtml}
  </aside>
  <div class="shell-rail-backdrop" id="shell-rail-backdrop" hidden></div>
  <button
    type="button"
    class="shell-nav-menu-btn"
    id="shell-nav-menu-btn"
    aria-expanded="false"
    aria-controls="shell-rail"
    aria-label="Open menu"
  >
    <span class="shell-nav-menu-bars" aria-hidden="true"></span>
  </button>
</div>`;
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

  function applyShellInsets() {
    const root = document.documentElement;
    root.style.setProperty('--shell-rail-width', '240px');
    // No top title bar — sticky desks use 0 offset on desktop.
    root.style.setProperty('--shell-topbar-height', '0px');
    root.style.setProperty('--distress-nav-offset', '0px');
    if (document.body) {
      document.body.style.paddingTop = '';
    }
  }

  function closeMobileNav() {
    const chrome = elById('phuglee-nav', 'distress-os-nav');
    const btn = document.getElementById('shell-nav-menu-btn');
    const backdrop = document.getElementById('shell-rail-backdrop');
    chrome?.classList.remove('is-nav-open');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('shell-rail-open');
  }

  function openMobileNav() {
    const chrome = elById('phuglee-nav', 'distress-os-nav');
    const btn = document.getElementById('shell-nav-menu-btn');
    const backdrop = document.getElementById('shell-rail-backdrop');
    chrome?.classList.add('is-nav-open');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
    }
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('shell-rail-open');
  }

  function toggleMobileNav() {
    const chrome = elById('phuglee-nav', 'distress-os-nav');
    if (!chrome) return;
    if (chrome.classList.contains('is-nav-open')) closeMobileNav();
    else openMobileNav();
  }

  function bindMobileChrome(root) {
    if (!root || root.dataset.mobileBound === '1') return;
    root.dataset.mobileBound = '1';

    const menuBtn = root.querySelector('#shell-nav-menu-btn');
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileNav();
    });

    const backdrop = root.querySelector('#shell-rail-backdrop');
    backdrop?.addEventListener('click', () => closeMobileNav());

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
    const existing = elById('phuglee-nav', 'distress-os-nav');
    const html = buildNav(path);

    if (existing) {
      existing.outerHTML = html;
    } else {
      const mountEl = elById('phuglee-nav-mount', 'distress-os-nav-mount');
      if (mountEl) {
        mountEl.innerHTML = html;
      } else {
        document.body.insertAdjacentHTML('afterbegin', html);
      }
    }

    const wrap = elById('phuglee-nav', 'distress-os-nav');
    if (path.startsWith('/forge')) {
      document.body.classList.add('phuglee-embedded', 'distress-os-embedded');
    }
    if (path.startsWith('/analyzer')) {
      document.body.classList.add('phuglee-embedded', 'distress-os-embedded', 'analyzer-embedded');
    }

    if (wrap) {
      applyShellInsets();
      guardNavLinks(wrap);
      bindMobileChrome(wrap);
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

  const shellNavApi = {
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
    isPropertiesSectionActive,
    isVaultSectionActive,
    isAdminUser,
    isDisposUser,
    isVaultOnlyUser,
    isContractDeskUser
  };
  window.PhugleeShellNav = shellNavApi;
  /** @deprecated Use PhugleeShellNav — kept during rename transition. */
  window.DistressOSShellNav = shellNavApi;
  mount();
})();
