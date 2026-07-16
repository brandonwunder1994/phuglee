(function () {
  'use strict';

  const SMART_DEFAULTS_KEY = 'vaultSmartDefaults';
  const CARD_BREAKPOINT = 721;
  const SIGNALS_COLLAPSED = 8;
  const TOAST_MS = 2200;
  const DISPOSITIONS = [
    { id: 'contacted', label: 'Contacted', cls: 'vault-disp-chip--warm' },
    { id: 'vm', label: 'VM', cls: 'vault-disp-chip--cool' },
    { id: 'callback', label: 'Callback', cls: 'vault-disp-chip--hot' },
    { id: 'interested', label: 'Interested', cls: 'vault-disp-chip--hot' },
    { id: 'dead', label: 'Dead', cls: 'vault-disp-chip--cool' }
  ];

  const state = {
    leadType: 'all',
    state: '',
    city: '',
    signals: [],
    minScore: 0,
    since: '',
    q: '',
    page: 1,
    sort: 'priorityScore',
    sortDir: 'desc',
    favoritesOnly: false,
    hasPhone: false,
    hasImagery: false,
    entityType: '',
    minEquity: 0,
    viewMode: 'table',
    viewModeManual: false,
    selected: new Set(),
    meta: null,
    byTypeFiltered: null,
    statesFiltered: null,
    citiesFiltered: null,
    sync: null,
    overlays: { favorites: [], notes: {}, presets: [], dispositions: {} },
    leads: [],
    total: 0,
    totalPages: 1,
    activeLeadId: null,
    drawerImageMode: 'street',
    drawerSection: 'owner',
    loading: false,
    loadingMore: false,
    searchTimer: null,
    signalsExpanded: false,
    smartDefaults: true,
    focusRestoreEl: null,
    toastTimer: null,
    originLat: null,
    originLng: null,
    originLabel: '',
    radiusMiles: 5,
    mapMarkers: [],
    mapInstance: null,
    mapPopup: null,
    mapLibReady: null,
    compRunning: false,
    manualCompLeadId: null,
    manualCompLead: null,
    manualCompFiles: []
  };

  const COMP_RULE_LABELS = {
    usable_price: 'Sale price',
    size_band: 'Size band',
    beds_baths: 'Beds/baths',
    distance: 'Distance',
    recency: 'Recency',
    age: 'Age',
    property_type: 'Property type',
    renovation: 'Renovation',
    barrier: 'Road barrier'
  };

  const HAIRCUT_LABELS = {
    dom_soft: 'Active DOM soft cut',
    conservative: 'Conservative trim'
  };

  const $ = (id) => document.getElementById(id);

  function esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = $('vault-toast');
    if (!el) return;
    clearTimeout(state.toastTimer);
    el.textContent = msg;
    el.hidden = false;
    state.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, TOAST_MS);
  }

  function formatPhone(phone, large) {
    const p = String(phone || '').trim();
    if (!p) return '—';
    const digits = p.replace(/\D/g, '');
    const cls = large ? 'vault-phone-link vault-dial-phone' : 'vault-phone-link';
    if (digits.length >= 10) {
      return `<a href="tel:${esc(digits)}" class="${cls}">${esc(p)}</a>`;
    }
    return esc(p);
  }

  function formatPhoneStack(phones, opts = {}) {
    const list = (Array.isArray(phones) ? phones : []).map((p) => String(p || '').trim()).filter(Boolean);
    if (!list.length) return '—';
    const max = opts.max != null ? opts.max : 2;
    const large = !!opts.large;
    const shown = list.slice(0, max);
    const extra = (opts.totalCount != null ? opts.totalCount : list.length) - shown.length;
    const rows = shown.map((p) => formatPhone(p, large)).join('');
    if (large) {
      return `<div class="vault-dial-phones">${shown.map((p) =>
        `<p class="vault-dial-phone-row">${formatPhone(p, true)}</p>`
      ).join('')}${extra > 0 ? `<p class="vault-phone-more">+${extra} more on file</p>` : ''}</div>`;
    }
    return `<div class="vault-phone-stack">${rows}${
      extra > 0 ? `<span class="vault-phone-more">+${extra}</span>` : ''
    }</div>`;
  }

  function isMaxPlan(me) {
    if (!me) return false;
    if (me.plan === 'max' || me.username === 'admin' || me.username === 'brad' || me.username === 'matt') return true;
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    return false;
  }

  function leadTypeLabel(type) {
    const key = String(type || '').toLowerCase().replace(/\s+/g, '_');
    if (key === 'distressed') return 'Distressed';
    if (key === 'well_maintained' || key === 'wellmaintained') return 'Code';
    if (key === 'land') return 'Land';
    if (key === 'all') return 'All';
    const s = String(type || '').replace(/_/g, ' ');
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function entityTypeLabel(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'llc') return 'LLC';
    if (t === 'individual') return 'Individual';
    if (t === 'estate') return 'Estate';
    if (!t || t === 'unknown') return '';
    return leadTypeLabel(t);
  }

  function hotSignalClass(signal) {
    const hot = ['pre-foreclosure', 'vacant', 'water shut-off', 'tax delinquent'];
    return hot.includes(String(signal || '').toLowerCase()) ? ' vault-signal--hot' : '';
  }

  function scoreHeatClass(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return '';
    if (n >= 70) return ' vault-score--hot';
    if (n >= 40) return ' vault-score--mid';
    return ' vault-score--cool';
  }

  function tierClass(tier) {
    const n = Number(tier);
    if (!Number.isFinite(n)) return '';
    if (n >= 8) return ' vault-tier--high';
    if (n >= 5) return ' vault-tier--mid';
    return ' vault-tier--low';
  }

  function normalizeImageryUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('/api/')) return `/analyzer${u}`;
    return u;
  }

  function liveSvUrlForLead(lead) {
    const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
    if (!addr) return '';
    const q = new URLSearchParams({
      address: addr,
      size: '640x640',
      fast: '1'
    });
    return `/analyzer/api/sv-image?${q.toString()}`;
  }

  function bindImgFallback(img, fallbackUrl) {
    if (!img || !fallbackUrl) return;
    img.addEventListener('error', () => {
      const tried = img.dataset.fallbackTried === '1';
      if (tried) {
        img.classList.add('is-broken');
        img.removeAttribute('src');
        img.alt = 'Photo unavailable';
        return;
      }
      img.dataset.fallbackTried = '1';
      img.src = fallbackUrl;
    }, { once: false });
  }

  function thumbHtml(url, leadOrAlt, maybeLead) {
    const lead = (maybeLead && typeof maybeLead === 'object')
      ? maybeLead
      : (leadOrAlt && typeof leadOrAlt === 'object' ? leadOrAlt : null);
    const alt = lead ? (lead.address || 'Property') : String(leadOrAlt || 'Property');
    let src = normalizeImageryUrl(url);
    const fallback = lead ? liveSvUrlForLead(lead) : '';
    // Prefer live Street View proxy — cached paths often 404 as a black tile
    if (src.includes('/cached-imagery/') && fallback) {
      const sep = src.includes('?') ? '&' : '?';
      src = `${src}${sep}address=${encodeURIComponent([lead.address, lead.city, lead.state].filter(Boolean).join(', '))}`;
    }
    if (!src && !fallback) {
      return '<span class="vault-thumb vault-thumb--empty" aria-hidden="true"></span>';
    }
    const initial = fallback || src;
    const dataFb = src && src !== initial ? ` data-fallback-src="${esc(src)}"` : (fallback && fallback !== initial ? ` data-fallback-src="${esc(fallback)}"` : '');
    return `<img class="vault-thumb" src="${esc(initial)}" alt="${esc(alt)}" loading="lazy" decoding="async"${dataFb}>`;
  }

  function fullAddress(lead) {
    return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  }

  function mapsUrl(lead) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(lead))}`;
  }

  function analyzeUrl(lead) {
    const addr = lead.address || '';
    return `/analyzer/?focusAddress=${encodeURIComponent(addr)}`;
  }

  function primaryImage(lead, mode) {
    if (mode === 'satellite' && lead.satelliteUrl) {
      const sat = normalizeImageryUrl(lead.satelliteUrl);
      if (sat.includes('/cached-imagery/')) {
        const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
        return addr ? `${sat}${sat.includes('?') ? '&' : '?'}address=${encodeURIComponent(addr)}` : sat;
      }
      return sat;
    }
    const live = liveSvUrlForLead(lead);
    let src = normalizeImageryUrl(
      lead.streetViewUrl || (lead.photos && lead.photos[0]) || lead.satelliteUrl || ''
    );
    if (!src) return live;
    if (src.includes('/cached-imagery/') && live) {
      const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
      if (addr) src = `${src}${src.includes('?') ? '&' : '?'}address=${encodeURIComponent(addr)}`;
    }
    return src;
  }

  function formatSyncAge(ts) {
    if (!ts) return '';
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  }

  function readSmartDefaultsPref() {
    try {
      const v = localStorage.getItem(SMART_DEFAULTS_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch (_) { /* ignore */ }
    return true;
  }

  function writeSmartDefaultsPref(on) {
    try {
      localStorage.setItem(SMART_DEFAULTS_KEY, on ? '1' : '0');
    } catch (_) { /* ignore */ }
  }

  function applySmartDefaults() {
    state.hasPhone = true;
    state.leadType = 'distressed';
    syncFilterControls();
    syncTypeTabs();
  }

  function buildDialScript(l) {
    const pool = [];
    const seen = new Set();
    const add = (raw) => {
      const t = String(raw || '').trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(t);
    };

    (l.distress?.indicators || []).forEach(add);
    (l.signalTags || []).forEach(add);

    const styled = [];
    const lower = (s) => s.toLowerCase();
    for (const t of pool) {
      const tl = lower(t);
      if (tl.includes('absentee')) styled.push('Absentee');
      else if (tl.includes('high equity') || tl === 'equity') styled.push('High equity');
      else if (tl.includes('roof')) styled.push('Roof damage');
      else if (tl.includes('vacant')) styled.push('Vacant');
      else if (tl.includes('probate') || tl.includes('estate')) styled.push('Probate');
      else if (tl.includes('tax')) styled.push('Tax delinquent');
      else if (tl.includes('foreclosure')) styled.push('Pre-foreclosure');
      else styled.push(t);
    }

    const headline = [...new Set(styled)].slice(0, 3).join(' · ');
    let closer = 'introduce yourself';
    const blob = styled.join(' ').toLowerCase();
    if (blob.includes('roof') || blob.includes('repair') || blob.includes('damage')) {
      closer = 'lead with repairs';
    } else if (l.leadType === 'distressed' || blob.includes('distress')) {
      closer = 'open with motivation';
    } else if (l.leadType === 'well_maintained') {
      closer = 'lead with a value-add angle';
    } else if (l.leadType === 'land') {
      closer = 'ask about plans for the lot';
    }

    return headline ? `${headline} — ${closer}.` : `Scored lead — ${closer}.`;
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(opts && opts.headers) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.leadType && state.leadType !== 'all') params.set('leadType', state.leadType);
    params.set('surface', 'home');
    if (state.state) params.set('state', state.state);
    if (state.city) params.set('city', state.city);
    if (state.q) params.set('q', state.q);
    if (state.minScore > 0) params.set('minScore', String(state.minScore));
    if (state.since) params.set('since', state.since);
    if (state.favoritesOnly) params.set('favoritesOnly', '1');
    if (state.hasPhone) params.set('hasPhone', '1');
    if (state.hasImagery) params.set('hasImagery', '1');
    if (state.entityType) params.set('entityType', state.entityType);
    if (state.minEquity > 0) params.set('minEquity', String(state.minEquity));
    if (state.originLat != null && state.originLng != null && state.radiusMiles > 0) {
      params.set('originLat', String(state.originLat));
      params.set('originLng', String(state.originLng));
      params.set('radiusMiles', String(state.radiusMiles));
    }
    params.set('page', String(state.page));
    params.set('sort', state.sort);
    params.set('sortDir', state.sortDir);
    state.signals.forEach((s) => params.append('signal', s));
    return params.toString();
  }

  function buildMapQuery() {
    const params = new URLSearchParams(buildQuery());
    params.delete('page');
    params.delete('sort');
    params.delete('sortDir');
    return params.toString();
  }

  function currentFilterSnapshot() {
    return {
      leadType: state.leadType,
      state: state.state,
      city: state.city,
      signals: [...state.signals],
      minScore: state.minScore,
      since: state.since,
      q: state.q,
      favoritesOnly: state.favoritesOnly,
      hasPhone: state.hasPhone,
      hasImagery: state.hasImagery,
      entityType: state.entityType,
      minEquity: state.minEquity,
      sort: state.sort,
      sortDir: state.sortDir,
      originLat: state.originLat,
      originLng: state.originLng,
      radiusMiles: state.radiusMiles,
      originLabel: state.originLabel || ''
    };
  }

  function filtersAreActive() {
    return !!(
      state.state
      || state.city
      || state.signals.length
      || state.minScore > 0
      || state.since
      || state.q
      || state.favoritesOnly
      || state.hasPhone
      || state.hasImagery
      || state.entityType
      || state.minEquity > 0
      || (state.leadType && state.leadType !== 'all')
      || (state.originLat != null && state.originLng != null)
    );
  }

  function applyFilterSnapshot(snapshot) {
    if (!snapshot) return;
    state.leadType = snapshot.leadType || 'all';
    state.state = snapshot.state || '';
    state.city = snapshot.city || '';
    state.signals = Array.isArray(snapshot.signals) ? [...snapshot.signals] : [];
    state.minScore = Number(snapshot.minScore) || 0;
    state.since = snapshot.since || '';
    state.q = snapshot.q || '';
    state.favoritesOnly = !!snapshot.favoritesOnly;
    state.hasPhone = !!snapshot.hasPhone;
    state.hasImagery = !!snapshot.hasImagery;
    state.entityType = snapshot.entityType || '';
    state.minEquity = Number(snapshot.minEquity) || 0;
    state.sort = snapshot.sort || 'priorityScore';
    state.sortDir = snapshot.sortDir || 'desc';
    const lat = snapshot.originLat == null || snapshot.originLat === '' ? null : Number(snapshot.originLat);
    const lng = snapshot.originLng == null || snapshot.originLng === '' ? null : Number(snapshot.originLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      state.originLat = lat;
      state.originLng = lng;
      state.radiusMiles = Number(snapshot.radiusMiles) || state.radiusMiles || 5;
      state.originLabel = snapshot.originLabel || '';
    } else {
      state.originLat = null;
      state.originLng = null;
      state.originLabel = '';
    }
    state.page = 1;
    syncFilterControls();
    syncTypeTabs();
    renderSignalChips();
    populateGeoSelects();
    updateRadiusStatus();
    refreshCurrentView();
  }

  function syncTypeTabs() {
    document.querySelectorAll('.vault-type-tab').forEach((tab) => {
      const active = (tab.dataset.type || 'all') === state.leadType;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function renderTypeTabCounts() {
    const filtered = state.byTypeFiltered && typeof state.byTypeFiltered === 'object'
      ? state.byTypeFiltered
      : null;

    document.querySelectorAll('.vault-tab-count').forEach((el) => {
      const key = el.dataset.countFor;
      if (!key) {
        el.textContent = '';
        return;
      }

      let count = null;
      // Always prefer filter-aware facet counts so every CV tab matches the active stack
      // (state / city / signals / phone / radius), not the unfiltered catalog meta.
      if (filtered && filtered[key] != null) {
        count = filtered[key];
      } else if (state.meta) {
        count = key === 'all'
          ? state.meta.total
          : (state.meta.byType?.[key] || 0);
      }

      el.textContent = count != null ? `(${Number(count).toLocaleString()})` : '';
    });
  }

  function syncFilterControls() {
    if ($('vault-search')) $('vault-search').value = state.q;
    if ($('vault-state')) $('vault-state').value = state.state;
    if ($('vault-city')) {
      $('vault-city').value = state.state ? state.city : '';
      $('vault-city').disabled = !state.state;
    }
    if ($('vault-since')) $('vault-since').value = state.since;
    if ($('vault-min-score')) {
      $('vault-min-score').value = String(state.minScore);
      $('vault-min-score').setAttribute('aria-valuenow', String(state.minScore));
    }
    if ($('vault-min-score-val')) $('vault-min-score-val').textContent = String(state.minScore);
    if ($('vault-favorites-only')) $('vault-favorites-only').checked = state.favoritesOnly;
    if ($('vault-has-phone')) $('vault-has-phone').checked = state.hasPhone;
    if ($('vault-has-photo')) $('vault-has-photo').checked = state.hasImagery;
    if ($('vault-entity-type')) $('vault-entity-type').value = state.entityType || '';
    if ($('vault-equity-band')) {
      const band = state.minEquity >= 400000 ? '400k'
        : state.minEquity >= 300000 ? '300k'
          : state.minEquity >= 200000 ? '200k'
            : state.minEquity >= 100000 ? '100k' : '';
      $('vault-equity-band').value = band;
    }
    if ($('vault-smart-defaults')) $('vault-smart-defaults').checked = state.smartDefaults;
  }

  function signalOptions() {
    const fromMeta = (state.meta?.signals || []).map((s) => s.name).filter(Boolean);
    if (fromMeta.length) return fromMeta;
    return [
      'Pre-foreclosure', 'Tax delinquent', 'Vacant', 'Code violation',
      'Water shut-off', 'Probate / estate', 'Absentee owner', 'High equity',
      'Liens', 'Bankruptcy', 'Divorce', 'Fire damage'
    ];
  }

  function renderSignalChips() {
    const wrap = $('vault-signal-chips');
    const moreBtn = $('vault-signals-more');
    if (!wrap) return;

    const all = signalOptions();
    const visible = state.signalsExpanded ? all : all.slice(0, SIGNALS_COLLAPSED);

    wrap.innerHTML = visible.map((label) => {
      const active = state.signals.includes(label);
      return `<button type="button" class="vault-signal-chip${active ? ' is-active' : ''}" data-signal="${esc(label)}" aria-pressed="${active}">${esc(label)}</button>`;
    }).join('');

    if (moreBtn) {
      if (all.length <= SIGNALS_COLLAPSED) {
        moreBtn.hidden = true;
      } else {
        moreBtn.hidden = false;
        moreBtn.textContent = state.signalsExpanded ? 'Fewer signals' : 'More signals';
      }
    }
  }

  function renderPresetSelect() {
    const sel = $('vault-presets');
    if (!sel) return;
    const prev = sel.value;
    const presets = state.overlays.presets || [];
    sel.innerHTML = '<option value="">Load pull…</option>' + presets.map((p, i) =>
      `<option value="${i}">${esc(p.name || `Pull ${i + 1}`)}</option>`
    ).join('');
    if (prev !== '' && presets[Number(prev)]) sel.value = prev;
    updatePullActions();
  }

  function selectedPullIndex() {
    const sel = $('vault-presets');
    if (!sel || sel.value === '') return -1;
    const idx = Number(sel.value);
    return Number.isFinite(idx) ? idx : -1;
  }

  function updatePullActions() {
    const idx = selectedPullIndex();
    const has = idx >= 0;
    const del = $('vault-delete-preset');
    const exp = $('vault-export-pull');
    if (del) del.disabled = !has;
    if (exp) exp.disabled = !has;
  }

  function applyListFacets(data = {}) {
    state.byTypeFiltered = data.byTypeFiltered || null;
    state.statesFiltered = Array.isArray(data.statesFiltered) ? data.statesFiltered : null;
    state.citiesFiltered = Array.isArray(data.citiesFiltered) ? data.citiesFiltered : null;
    renderTypeTabCounts();
    populateGeoSelects();
  }

  async function loadBootstrap() {
    const data = await fetchJson(`/api/leads/bootstrap?${buildQuery()}`);
    state.meta = data.meta;
    state.sync = data.sync || null;
    state.overlays = data.overlays || { favorites: [], notes: {}, presets: [], dispositions: {} };
    if (!state.overlays.dispositions) state.overlays.dispositions = {};
    state.leads = data.leads || [];
    state.total = data.total || 0;
    state.totalPages = data.totalPages || 1;
    state.page = data.page || 1;
    renderKpis();
    renderSyncStatus();
    applyListFacets(data);
    renderSignalChips();
    renderPresetSelect();
    renderResults();
    renderPagination();
    renderResultsMeta();
    updateExportButton();
    hideSkeleton();
  }

  function renderKpis() {
    const wrap = $('vault-kpis');
    if (!wrap) return;
    const m = state.meta || {};
    const set = (key, val) => {
      const el = wrap.querySelector(`[data-kpi="${key}"]`);
      if (el) el.textContent = val == null ? '—' : Number(val).toLocaleString();
    };
    set('total', m.total);
    set('phone', m.withPhone);
    set('fresh', m.freshThisWeek);
    set('mapped', m.withCoords);
  }

  function showSkeleton() {
    const sk = $('vault-skeleton');
    const table = $('vault-table');
    const cards = $('vault-cards');
    const mapPanel = $('vault-map-panel');
    if (!sk) return;
    sk.hidden = false;
    if (table) table.hidden = true;
    if (cards) cards.hidden = true;
    if (mapPanel) mapPanel.hidden = true;
    sk.innerHTML = Array.from({ length: 8 }, () =>
      '<div class="vault-skeleton-row"></div>'
    ).join('');
  }

  function hideSkeleton() {
    const sk = $('vault-skeleton');
    if (sk) sk.hidden = true;
  }

  function loadStylesheet(href) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`link[href="${href}"]`)) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`css failed: ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.maplibregl) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`script failed: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureMapLibre() {
    if (window.maplibregl) return window.maplibregl;
    if (state.mapLibReady) return state.mapLibReady;
    state.mapLibReady = (async () => {
      const cssUrls = [
        '/forge/static/vendor/maplibre-gl.css',
        'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
      ];
      const jsUrls = [
        '/forge/static/vendor/maplibre-gl.js',
        'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
      ];
      let cssOk = false;
      for (const href of cssUrls) {
        try {
          await loadStylesheet(href);
          cssOk = true;
          break;
        } catch (_) { /* try next */ }
      }
      if (!cssOk) throw new Error('Could not load map styles');
      let jsOk = false;
      for (const src of jsUrls) {
        try {
          await loadScript(src);
          if (window.maplibregl) {
            jsOk = true;
            break;
          }
        } catch (_) { /* try next */ }
      }
      if (!jsOk || !window.maplibregl) throw new Error('Could not load map engine');
      return window.maplibregl;
    })();
    return state.mapLibReady;
  }

  function vaultMapStyle() {
    return {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        }
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
    };
  }

  function circleRing(lat, lng, miles, steps = 64) {
    const coords = [];
    const R = 3958.7613;
    const latR = (lat * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const brng = (2 * Math.PI * i) / steps;
      const lat2 = Math.asin(
        Math.sin(latR) * Math.cos(miles / R)
        + Math.cos(latR) * Math.sin(miles / R) * Math.cos(brng)
      );
      const lng2 = ((lng * Math.PI) / 180) + Math.atan2(
        Math.sin(brng) * Math.sin(miles / R) * Math.cos(latR),
        Math.cos(miles / R) - Math.sin(latR) * Math.sin(lat2)
      );
      coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
    }
    return coords;
  }

  function markersToGeoJson(markers) {
    return {
      type: 'FeatureCollection',
      features: (markers || []).map((m) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
        properties: {
          leadId: m.leadId,
          address: m.address || '',
          city: m.city || '',
          state: m.state || '',
          priorityScore: m.priorityScore || 0,
          topSignal: m.topSignal || ''
        }
      }))
    };
  }

  function radiusGeoJson() {
    if (state.originLat == null || state.originLng == null || !(state.radiusMiles > 0)) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [circleRing(state.originLat, state.originLng, state.radiusMiles)]
        },
        properties: {}
      }]
    };
  }

  function ensureMapLayers(map) {
    if (!map.getSource('vault-radius')) {
      map.addSource('vault-radius', {
        type: 'geojson',
        data: radiusGeoJson()
      });
      map.addLayer({
        id: 'vault-radius-fill',
        type: 'fill',
        source: 'vault-radius',
        paint: {
          'fill-color': '#eeb746',
          'fill-opacity': 0.12
        }
      });
      map.addLayer({
        id: 'vault-radius-line',
        type: 'line',
        source: 'vault-radius',
        paint: {
          'line-color': '#eeb746',
          'line-width': 2,
          'line-opacity': 0.7
        }
      });
    }
    if (!map.getSource('vault-leads')) {
      map.addSource('vault-leads', {
        type: 'geojson',
        data: markersToGeoJson([])
      });
      map.addLayer({
        id: 'vault-leads-circle',
        type: 'circle',
        source: 'vault-leads',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 3,
            10, 6,
            14, 9
          ],
          'circle-color': '#e58435',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#1a1a1a',
          'circle-opacity': 0.92
        }
      });
    }
  }

  async function ensureMapInstance() {
    const maplibregl = await ensureMapLibre();
    const el = $('vault-map');
    if (!el) throw new Error('Map container missing');
    if (state.mapInstance) {
      state.mapInstance.resize();
      return state.mapInstance;
    }

    const map = new maplibregl.Map({
      container: el,
      style: vaultMapStyle(),
      center: [-97.5, 31.5],
      zoom: 5.2,
      attributionControl: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    state.mapPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      maxWidth: '220px'
    });

    map.on('load', () => {
      ensureMapLayers(map);
    });

    map.on('mouseenter', 'vault-leads-circle', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features && e.features[0];
      if (!f || !state.mapPopup) return;
      const p = f.properties || {};
      state.mapPopup
        .setLngLat(f.geometry.coordinates)
        .setHTML(
          `<strong>${esc(p.address || 'Lead')}</strong><br>`
          + `${esc(p.city || '')}${p.city && p.state ? ', ' : ''}${esc(p.state || '')}`
          + (p.priorityScore != null ? `<br>Score ${esc(String(p.priorityScore))}` : '')
        )
        .addTo(map);
    });
    map.on('mouseleave', 'vault-leads-circle', () => {
      map.getCanvas().style.cursor = '';
      state.mapPopup?.remove();
    });
    map.on('click', 'vault-leads-circle', (e) => {
      const f = e.features && e.features[0];
      const leadId = f && f.properties && f.properties.leadId;
      if (leadId) openDrawer(leadId);
    });

    state.mapInstance = map;
    return map;
  }

  function fitMapToMarkers(markers) {
    const map = state.mapInstance;
    if (!map || !window.maplibregl) return;
    if (state.originLat != null && state.originLng != null && state.radiusMiles > 0) {
      const ring = circleRing(state.originLat, state.originLng, state.radiusMiles);
      const bounds = ring.reduce(
        (b, c) => b.extend(c),
        new window.maplibregl.LngLatBounds(ring[0], ring[0])
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 500 });
      return;
    }
    if (!markers.length) return;
    if (markers.length === 1) {
      map.easeTo({ center: [markers[0].lng, markers[0].lat], zoom: 13, duration: 500 });
      return;
    }
    const bounds = markers.reduce(
      (b, m) => b.extend([m.lng, m.lat]),
      new window.maplibregl.LngLatBounds([markers[0].lng, markers[0].lat], [markers[0].lng, markers[0].lat])
    );
    map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 600 });
  }

  function paintMapData(markers) {
    const map = state.mapInstance;
    if (!map) return;
    const apply = () => {
      ensureMapLayers(map);
      const leadsSrc = map.getSource('vault-leads');
      const radiusSrc = map.getSource('vault-radius');
      if (leadsSrc) leadsSrc.setData(markersToGeoJson(markers));
      if (radiusSrc) radiusSrc.setData(radiusGeoJson());
      fitMapToMarkers(markers);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }

  function updateRadiusStatus() {
    const el = $('vault-radius-status');
    if (!el) return;
    if (state.originLat == null || state.originLng == null) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const label = state.originLabel || `${state.originLat.toFixed(4)}, ${state.originLng.toFixed(4)}`;
    el.hidden = false;
    el.textContent = `Within ${state.radiusMiles} mi of ${label}`;
  }

  async function setRadiusOrigin(lat, lng, label) {
    state.originLat = Number(lat);
    state.originLng = Number(lng);
    state.originLabel = label || '';
    const milesSel = $('vault-radius-miles');
    state.radiusMiles = Number(milesSel?.value || state.radiusMiles || 5) || 5;
    updateRadiusStatus();
    state.page = 1;
    state.leads = [];
    await refreshCurrentView();
  }

  function clearRadiusOrigin() {
    state.originLat = null;
    state.originLng = null;
    state.originLabel = '';
    updateRadiusStatus();
    state.page = 1;
    state.leads = [];
    refreshCurrentView();
  }

  async function applyRadiusFromAddress() {
    const input = $('vault-radius-address');
    const q = (input?.value || '').trim();
    const milesSel = $('vault-radius-miles');
    state.radiusMiles = Number(milesSel?.value || 5) || 5;
    if (q.length < 3) {
      showToast('Enter an address (3+ characters)');
      input?.focus();
      return;
    }
    try {
      showToast('Looking up address…');
      const data = await fetchJson(`/api/leads/geocode?q=${encodeURIComponent(q)}`);
      await setRadiusOrigin(data.lat, data.lng, data.label || q);
      if (state.viewMode !== 'map') {
        state.viewModeManual = true;
        state.viewMode = 'map';
        updateViewToggle();
      }
      showToast(`Showing leads within ${state.radiusMiles} miles`);
    } catch (err) {
      showToast(err.message || 'Address not found');
    }
  }

  async function applyNearMe() {
    if (!navigator.geolocation) {
      showToast('GPS not available in this browser');
      return;
    }
    const milesSel = $('vault-radius-miles');
    state.radiusMiles = Number(milesSel?.value || 5) || 5;
    showToast('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await setRadiusOrigin(
            pos.coords.latitude,
            pos.coords.longitude,
            'Near me'
          );
          if (state.viewMode !== 'map') {
            state.viewModeManual = true;
            state.viewMode = 'map';
            updateViewToggle();
          }
          showToast(`Showing leads within ${state.radiusMiles} miles of you`);
        } catch (err) {
          showToast(err.message || 'Could not apply Near me');
        }
      },
      (err) => {
        const msg = err && err.code === 1
          ? 'Location permission denied'
          : 'Could not get GPS location';
        showToast(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  async function loadMapMarkers() {
    state.loading = true;
    showSkeleton();
    try {
      await ensureMapInstance();
      const data = await fetchJson(`/api/leads/map?${buildMapQuery()}`);
      state.mapMarkers = data.markers || [];
      state.total = data.total || state.mapMarkers.length;
      state.totalPages = 1;
      applyListFacets(data);
      hideSkeleton();
      renderMap();
      renderPagination();
      renderResultsMeta();
      paintMapData(state.mapMarkers);
    } catch (err) {
      hideSkeleton();
      showToast(err.message || 'Map failed to load');
      const empty = $('vault-empty');
      if (empty) {
        empty.hidden = false;
        empty.querySelector('.phuglee-empty-title').textContent = 'Map unavailable';
        empty.querySelector('.phuglee-empty-copy').textContent = err.message || 'Try again in a moment.';
      }
    } finally {
      state.loading = false;
    }
  }

  function renderMap() {
    const table = $('vault-table');
    const cards = $('vault-cards');
    const mapPanel = $('vault-map-panel');
    const empty = $('vault-empty');
    if (table) table.hidden = true;
    if (cards) cards.hidden = true;
    if (mapPanel) mapPanel.hidden = false;
    if (empty) empty.hidden = state.mapMarkers.length > 0;
    updateViewToggle();
    requestAnimationFrame(() => {
      state.mapInstance?.resize();
    });
  }

  async function refreshCurrentView() {
    if (state.viewMode === 'map') return loadMapMarkers();
    return loadLeads();
  }

  async function loadLeads(opts = {}) {
    const append = !!opts.append;
    if (!append) {
      state.loading = true;
      showSkeleton();
    } else {
      state.loadingMore = true;
    }
    try {
      const data = await fetchJson(`/api/leads?${buildQuery()}`);
      const rows = data.leads || [];
      state.leads = append ? state.leads.concat(rows) : rows;
      state.total = data.total || 0;
      state.totalPages = data.totalPages || 1;
      state.page = data.page || 1;
      applyListFacets(data);
      renderResults();
      renderPagination();
      renderResultsMeta();
    } finally {
      state.loading = false;
      state.loadingMore = false;
      hideSkeleton();
    }
  }

  function renderSyncStatus() {
    // Sync KPI line removed from hero — counts live on type tabs + results meta
    const el = $('vault-sync-status');
    if (el) el.hidden = true;
  }

  function populateGeoSelects() {
    const stateSel = $('vault-state');
    const citySel = $('vault-city');
    if (!stateSel || !citySel || !state.meta) return;
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    const hasState = !!state.state;
    // City is only pickable after a state is chosen — clear orphan city values
    if (!hasState) state.city = '';

    const states = Array.isArray(state.statesFiltered)
      ? [...state.statesFiltered]
      : [...(state.meta.states || [])].sort(byName);
    const cities = hasState
      ? (Array.isArray(state.citiesFiltered)
        ? [...state.citiesFiltered]
        : [...(state.meta.citiesByState?.[state.state] || [])].sort(byName))
      : [];
    const prevState = state.state;
    const prevCity = state.city;
    // Keep the selected state even if the current facet set has 0 (e.g. conflicting filters)
    if (prevState && !states.some((st) => st.name === prevState)) {
      states.unshift({ name: prevState, count: 0 });
    }
    if (prevCity && hasState && !cities.some((c) => c.name === prevCity)) {
      cities.unshift({ name: prevCity, count: 0 });
    }
    stateSel.innerHTML = '<option value="">All states</option>' + states.map((st) =>
      `<option value="${esc(st.name)}"${st.name === prevState ? ' selected' : ''}>${esc(st.name)} (${st.count})</option>`
    ).join('');
    citySel.innerHTML = hasState
      ? ('<option value="">All cities</option>' + cities.map((c) =>
          `<option value="${esc(c.name)}"${c.name === prevCity ? ' selected' : ''}>${esc(c.name)} (${c.count})</option>`
        ).join(''))
      : '<option value="">Select a state first</option>';
    citySel.disabled = !hasState;
    citySel.setAttribute('aria-disabled', hasState ? 'false' : 'true');
    citySel.title = hasState ? '' : 'Select a state first';
  }

  function primarySignal(row) {
    return row.topSignal || (row.signalTags && row.signalTags[0]) || '—';
  }

  function renderTable() {
    const body = $('vault-results-body');
    const empty = $('vault-empty');
    const table = $('vault-table');
    const cards = $('vault-cards');
    const mapPanel = $('vault-map-panel');
    if (!body) return;

    if (mapPanel) mapPanel.hidden = true;

    if (!state.leads.length) {
      body.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        const title = empty.querySelector('.phuglee-empty-title');
        const copy = empty.querySelector('.phuglee-empty-copy');
        if (title) title.textContent = 'No leads match';
        if (copy) {
          copy.textContent = state.originLat != null
            ? 'No leads in this radius. Widen miles or clear the radius filter.'
            : 'Clear filters or finish reviewing leads in Analyze, then refresh.';
        }
      }
      if (table) table.hidden = true;
      if (cards) cards.hidden = true;
      updateExportButton();
      updateBulkBar();
      return;
    }

    if (empty) empty.hidden = true;
    if (state.viewMode === 'cards') {
      if (table) table.hidden = true;
      if (cards) {
        cards.hidden = false;
        cards.innerHTML = state.leads.map((row) => renderCard(row)).join('');
      }
    } else {
      if (cards) cards.hidden = true;
      if (table) table.hidden = false;
      body.innerHTML = state.leads.map((row) => {
        const signal = primarySignal(row);
        const phoneHtml = formatPhoneStack(row.phones, {
          max: 2,
          totalCount: row.phoneCount != null ? row.phoneCount : (row.phones || []).length
        });
        const checked = state.selected.has(row.leadId) ? ' checked' : '';
        const fav = row.favorite ? ' vault-row--fav' : '';
        const tier = row.distressTier != null
          ? `<span class="vault-tier${tierClass(row.distressTier)}">${esc(row.distressTier)}</span>`
          : '';
        const scoreCls = scoreHeatClass(row.priorityScore);
        return `<tr class="vault-row${fav}" data-lead-id="${esc(row.leadId)}" tabindex="0">
          <td class="vault-col-check" data-no-open="1"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}" aria-label="Select lead"${checked}></td>
          <td class="vault-col-thumb">${thumbHtml(row.thumbUrl, row)}</td>
          <td>${esc(row.address)}</td>
          <td>${esc(row.city)}, ${esc(row.state)}</td>
          <td><span class="vault-signal${hotSignalClass(signal)}">${esc(signal)}</span></td>
          <td><span class="vault-score${scoreCls}">${esc(row.priorityScore)}</span>${tier}</td>
          <td class="vault-col-owner">${esc(row.ownerName || '—')}</td>
          <td class="vault-col-phone">${phoneHtml}</td>
        </tr>`;
      }).join('');
    }

    document.querySelectorAll('.vault-sort-btn').forEach((btn) => {
      const sorted = btn.dataset.sort === state.sort;
      btn.classList.toggle('is-sorted', sorted);
      btn.setAttribute('aria-sort', sorted
        ? (state.sortDir === 'asc' ? 'ascending' : 'descending')
        : 'none');
    });

    updateExportButton();
    updateBulkBar();
    updateViewToggle();
    wireImageryFallbacks(document.getElementById('vault-results') || document);
  }

  function wireImageryFallbacks(root) {
    if (!root) return;
    root.querySelectorAll('img.vault-thumb[data-fallback-src], img.vault-hero-img[data-fallback-src]').forEach((img) => {
      if (img.dataset.fallbackBound === '1') return;
      img.dataset.fallbackBound = '1';
      const fb = img.getAttribute('data-fallback-src');
      if (fb) bindImgFallback(img, fb);
    });
  }

  function renderCard(row) {
    const signal = primarySignal(row);
    const phoneHtml = formatPhoneStack(row.phones, {
      max: 2,
      totalCount: row.phoneCount != null ? row.phoneCount : (row.phones || []).length
    });
    const checked = state.selected.has(row.leadId) ? ' checked' : '';
    const scoreCls = scoreHeatClass(row.priorityScore);
    return `<article class="vault-card${row.favorite ? ' vault-card--fav' : ''}" data-lead-id="${esc(row.leadId)}" tabindex="0">
      <div class="vault-card-media">${thumbHtml(row.thumbUrl, row)}</div>
      <div class="vault-card-body">
        <label class="vault-card-check" data-no-open="1"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}" aria-label="Select ${esc(row.address)} lead"${checked}></label>
        <h3 class="vault-card-address">${esc(row.address)}</h3>
        <p class="vault-card-meta">${esc(row.city)}, ${esc(row.state)} · <span class="vault-score${scoreCls}">${esc(row.priorityScore)}</span></p>
        <p class="vault-card-signal${hotSignalClass(signal)}">${esc(signal)}</p>
        ${phoneHtml !== '—' ? `<div class="vault-card-phone">${phoneHtml}</div>` : ''}
      </div>
    </article>`;
  }

  function renderResults() {
    if (state.viewMode === 'map') {
      renderMap();
      return;
    }
    renderTable();
  }

  function renderResultsMeta() {
    const el = $('vault-results-meta');
    if (!el) return;
    const inventory = state.meta && state.meta.total != null ? Number(state.meta.total) : null;
    if (state.viewMode === 'map') {
      const n = state.mapMarkers.length;
      const radiusNote = state.originLat != null
        ? ` within ${state.radiusMiles} mi`
        : '';
      const matchNote = filtersAreActive() && inventory != null && state.total !== inventory
        ? ` · matching ${Number(state.total || 0).toLocaleString()} of ${inventory.toLocaleString()} inventory`
        : '';
      el.textContent = n
        ? `${n.toLocaleString()} mapped leads${radiusNote}${matchNote}`
        : (state.originLat != null
          ? 'No mapped leads in this radius'
          : 'No mapped leads match');
      return;
    }
    const shown = state.leads.length;
    const start = state.total ? (state.page - 1) * 50 + 1 : 0;
    const end = state.total ? Math.min((state.page - 1) * 50 + shown, state.total) : 0;
    const inventoryNote = filtersAreActive() && inventory != null && state.total !== inventory
      ? ` · matching ${state.total.toLocaleString()} of ${inventory.toLocaleString()} inventory`
      : '';
    if (state.viewMode === 'cards' && state.page > 1) {
      el.textContent = state.total
        ? `Showing ${shown.toLocaleString()} of ${state.total.toLocaleString()} leads (scroll for more)${inventoryNote}`
        : 'No leads in catalog yet';
      return;
    }
    el.textContent = state.total
      ? `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${state.total.toLocaleString()} leads${inventoryNote}`
      : (filtersAreActive() && inventory
        ? `No matches · ${inventory.toLocaleString()} in inventory`
        : 'No leads in catalog yet');
  }

  function renderPagination() {
    const nav = $('vault-pagination');
    if (!nav) return;
    if (state.viewMode === 'map') {
      nav.innerHTML = '';
      return;
    }
    if (state.viewMode === 'cards' || state.totalPages <= 1) {
      nav.innerHTML = state.viewMode === 'cards' && state.page < state.totalPages
        ? '<span class="vault-page-label">Scroll down to load more</span>'
        : '';
      return;
    }
    const prevDisabled = state.page <= 1 ? ' disabled' : '';
    const nextDisabled = state.page >= state.totalPages ? ' disabled' : '';
    nav.innerHTML = `
      <button type="button" class="phuglee-btn phuglee-btn-ghost" data-page="${state.page - 1}"${prevDisabled}>Previous</button>
      <span class="vault-page-label">Page ${state.page} of ${state.totalPages}</span>
      <button type="button" class="phuglee-btn phuglee-btn-ghost" data-page="${state.page + 1}"${nextDisabled}>Next</button>
    `;
  }

  function updateViewToggle() {
    document.querySelectorAll('.vault-view-btn').forEach((btn) => {
      const active = btn.dataset.view === state.viewMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updateExportButton() {
    const btn = $('vault-export-btn');
    if (!btn) return;
    const selected = state.selected.size;
    const matching = Number(state.total) || 0;
    btn.hidden = false;
    btn.disabled = selected === 0 && matching === 0;
    if (selected > 0) {
      btn.textContent = `Export ${selected}`;
      btn.title = `Export ${selected} selected lead${selected === 1 ? '' : 's'}`;
    } else if (matching > 0) {
      const n = Math.min(matching, 500);
      btn.textContent = matching > 500 ? `Export ${n} (cap)` : `Export ${n}`;
      btn.title = matching > 500
        ? `Export first 500 of ${matching.toLocaleString()} matching leads`
        : `Export all ${matching.toLocaleString()} matching leads`;
    } else {
      btn.textContent = 'Export';
      btn.title = 'No leads to export';
    }
  }

  function updateBulkBar() {
    const bar = $('vault-bulk-bar');
    const count = $('vault-bulk-count');
    if (!bar || !count) return;
    if (state.selected.size === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    count.textContent = `${state.selected.size} selected`;
  }

  function applyAutoViewMode() {
    const narrow = window.innerWidth < CARD_BREAKPOINT;
    // Phone/phablet: always cards — no MapLibre / wide table on ≤720.
    if (narrow) {
      state.viewModeManual = false;
      if (state.viewMode === 'cards') return;
      state.viewMode = 'cards';
      state.page = 1;
      state.leads = [];
      updateViewToggle();
      refreshCurrentView();
      return;
    }
    if (state.viewModeManual) return;
    const want = 'table';
    if (state.viewMode === want) return;
    state.viewMode = want;
    state.page = 1;
    state.leads = [];
    updateViewToggle();
    refreshCurrentView();
  }

  function activeLeadIndex() {
    return state.leads.findIndex((l) => l.leadId === state.activeLeadId);
  }

  function navigateDrawer(delta) {
    const idx = activeLeadIndex();
    if (idx < 0) return;
    const next = state.leads[idx + delta];
    if (next) openDrawer(next.leadId);
  }

  function openLightbox(url, alt) {
    const box = $('vault-lightbox');
    const img = $('vault-lightbox-img');
    if (!box || !img || !url) return;
    img.src = url;
    img.alt = alt || 'Property';
    box.hidden = false;
  }

  function closeLightbox() {
    const box = $('vault-lightbox');
    const img = $('vault-lightbox-img');
    if (box) box.hidden = true;
    if (img) img.removeAttribute('src');
  }

  function renderDrawerHero(l) {
    const hasSat = !!l.satelliteUrl;
    const hasSv = !!(l.streetViewUrl || (l.photos && l.photos[0]));
    const mode = state.drawerImageMode === 'satellite' && hasSat ? 'satellite' : 'street';
    const url = primaryImage(l, mode);
    const toggle = hasSat && hasSv
      ? `<div class="vault-hero-toggle" role="group" aria-label="Imagery type">
          <button type="button" class="vault-hero-toggle-btn${mode === 'street' ? ' is-active' : ''}" data-img-mode="street">Street</button>
          <button type="button" class="vault-hero-toggle-btn${mode === 'satellite' ? ' is-active' : ''}" data-img-mode="satellite">Satellite</button>
        </div>`
      : '';
    const captionAddr = [l.address, l.city, l.state].filter(Boolean).join(', ');
    if (!url) {
      return `<div class="vault-hero-media vault-hero-media--empty">
        <p>No property imagery yet</p>
        <span class="vault-hero-hint">This lead was reviewed without a Street View scan — run Analyze on this address to add a photo</span>
        ${captionAddr ? `<p class="vault-hero-caption vault-hero-caption--empty">${esc(captionAddr)}</p>` : ''}
      </div>`;
    }
    return `<div class="vault-hero-media">
      ${toggle}
      <button type="button" class="vault-hero-img-btn" id="vault-hero-img" aria-label="Expand property photo">
        <img class="vault-hero-img" src="${esc(url)}" alt="${esc(l.address || 'Property')}" loading="eager" decoding="async" data-fallback-src="${esc(liveSvUrlForLead(l))}">
        ${captionAddr ? `<span class="vault-hero-caption">${esc(captionAddr)}</span>` : ''}
      </button>
    </div>`;
  }

  function moneyFmt(n) {
    if (n == null || n === '') return null;
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    return '$' + Math.round(num).toLocaleString();
  }

  function ruleIdLabel(id) {
    return COMP_RULE_LABELS[id] || String(id || '').replace(/_/g, ' ');
  }

  function compConfidenceBadge(conf) {
    const c = String(conf || '').toLowerCase();
    if (!c) return '';
    return `<span class="vault-comp-conf vault-comp-conf--${esc(c)}">${esc(c)}</span>`;
  }

  function formatCompDate(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }

  function renderRuleResults(results) {
    if (!Array.isArray(results) || !results.length) return '—';
    return results.map((r) => {
      const status = String(r.status || 'pass');
      return `<span class="vault-rule-pill vault-rule-pill--${esc(status)}" title="${esc(r.detail || '')}">${esc(ruleIdLabel(r.id))}</span>`;
    }).join(' ');
  }

  function hasArvCompingReport(l) {
    if (!l) return false;
    if (l.compedAt) return true;
    if (l.compingReport?.arv != null) return true;
    const r = l.compingReport;
    return !!(r && (r.generatedAt || r.confidence || r.arvMethod));
  }

  function hasCompsList(l) {
    return Array.isArray(l?.comps) && l.comps.length > 0;
  }

  function hasCompingContent(l) {
    return hasArvCompingReport(l) || hasCompsList(l);
  }

  function renderCompActionStrip(l) {
    const comped = !!l.compedAt;
    const arvChip = comped && moneyFmt(l.estARV)
      ? `<span class="vault-arv-chip">${moneyFmt(l.estARV)}${compConfidenceBadge(l.compConfidence)}</span>`
      : '';
    const btnLabel = state.compRunning ? 'Comping…' : (comped ? 'Re-comp' : 'Comp');
    const busy = state.compRunning ? ' disabled aria-busy="true"' : '';
    return `${arvChip}<button type="button" id="vault-comp-btn" class="phuglee-btn phuglee-btn-primary vault-comp-btn"${busy}>${btnLabel}</button>`;
  }

  function renderHowWeGotHere(report) {
    if (!report) return '';
    const bits = [];
    if (report.arvMethod) bits.push(`Method: ${report.arvMethod}`);
    if (report.marketTag) bits.push(`Market: ${report.marketTag}`);
    if (report.ladderLevel != null) bits.push(`Ladder: ${report.ladderLevel}`);
    if (report.source) {
      bits.push(report.source === 'manual_propelio' ? 'Source: Propelio manual' : `Source: ${report.source}`);
    }
    const haircuts = Array.isArray(report.haircuts) ? report.haircuts : [];
    const haircutHtml = haircuts.length
      ? `<ul class="vault-haircut-list">${haircuts.map((h) =>
          `<li>${esc(HAIRCUT_LABELS[h.id] || h.id)}${h.pct != null ? `: ${h.pct}%` : ''}${
            h.before != null && h.after != null ? ` (${moneyFmt(h.before)} → ${moneyFmt(h.after)})` : ''
          }</li>`
        ).join('')}</ul>`
      : '';
    const manualNote = report.manualNote ? `<p class="vault-comp-note">${esc(report.manualNote)}</p>` : '';
    if (!bits.length && !haircutHtml && !manualNote) return '';
    return `<div class="vault-comp-block">
      <h4 class="vault-comp-subhead">How we got here</h4>
      ${bits.length ? `<p class="vault-comp-meta">${esc(bits.join(' · '))}</p>` : ''}
      ${haircutHtml}
      ${manualNote}
    </div>`;
  }

  function renderRulesSummaryBlock(summary) {
    if (!Array.isArray(summary) || !summary.length) return '';
    const rows = summary.map((r) =>
      `<li class="vault-rule-summary-row">
        <span class="vault-rule-summary-id">${esc(ruleIdLabel(r.id))}</span>
        <span class="vault-rule-summary-counts">
          <span class="vault-rule-pill vault-rule-pill--pass">${Number(r.pass) || 0} pass</span>
          <span class="vault-rule-pill vault-rule-pill--soft">${Number(r.soft) || 0} soft</span>
          <span class="vault-rule-pill vault-rule-pill--fail">${Number(r.fail) || 0} fail</span>
        </span>
      </li>`
    ).join('');
    return `<div class="vault-comp-block">
      <h4 class="vault-comp-subhead">Comping Rules</h4>
      <ul class="vault-rule-summary">${rows}</ul>
    </div>`;
  }

  function renderSanityBlock(sanity) {
    if (!sanity) return '';
    const avm = sanity.avm != null ? moneyFmt(sanity.avm) : null;
    const ceiling = sanity.newConstructionCeiling != null ? moneyFmt(sanity.newConstructionCeiling) : null;
    const notes = Array.isArray(sanity.notes) ? sanity.notes : [];
    if (!avm && !ceiling && !notes.length) return '';
    return `<div class="vault-comp-block vault-comp-sanity">
      <h4 class="vault-comp-subhead">Sanity checks</h4>
      ${avm ? `<p class="vault-comp-avm"><span class="vault-comp-avm-label">AVM estimate</span> <strong>${esc(avm)}</strong> <span class="vault-comp-avm-note">— estimate, not ARV</span></p>` : ''}
      ${ceiling ? `<p class="vault-comp-meta">New-build ceiling: ${esc(ceiling)}</p>` : ''}
      ${notes.map((n) => `<p class="vault-comp-meta">${esc(n)}</p>`).join('')}
    </div>`;
  }

  function renderStreetViewLinks(l, report) {
    const links = [];
    const subject = report?.subject;
    if (subject?.streetViewUrl) {
      links.push({ label: 'Subject', url: subject.streetViewUrl });
    } else if (l) {
      const url = liveSvUrlForLead(l);
      if (url) links.push({ label: 'Subject', url });
    }
    const comps = Array.isArray(l?.comps) ? l.comps : [];
    comps.slice(0, 8).forEach((c, i) => {
      if (c.streetViewUrl) {
        links.push({ label: c.address || `Comp ${i + 1}`, url: c.streetViewUrl });
      }
    });
    const pass = String(l?.compBlockPass || '').toLowerCase();
    const passActive = pass === 'pass' ? ' is-active' : '';
    const killActive = pass === 'kill' ? ' is-active' : '';
    return `<div class="vault-comp-block" id="vault-sv-block">
      <h4 class="vault-comp-subhead">Street View</h4>
      ${links.length
        ? `<div class="vault-sv-links">${links.map((link) =>
          `<a href="${esc(link.url)}" class="phuglee-btn phuglee-btn-ghost vault-sv-link" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>`
        ).join('')}</div>`
        : '<p class="vault-comp-meta">Open Street View for the subject and comps, then Pass or Kill the barrier call.</p>'}
      <div class="vault-block-pass" role="group" aria-label="Barrier Street View check">
        <span class="vault-block-pass-label">Barrier check</span>
        <button type="button" class="phuglee-btn phuglee-btn-ghost vault-block-pass-btn${passActive}" data-block-pass="pass" aria-pressed="${pass === 'pass' ? 'true' : 'false'}">Pass</button>
        <button type="button" class="phuglee-btn phuglee-btn-ghost vault-block-pass-btn vault-block-pass-btn--kill${killActive}" data-block-pass="kill" aria-pressed="${pass === 'kill' ? 'true' : 'false'}">Kill</button>
        ${pass ? `<span class="vault-block-pass-status">Saved: <strong>${esc(pass)}</strong></span>` : '<span class="vault-block-pass-status vault-block-pass-status--empty">Not set</span>'}
      </div>
    </div>`;
  }

  function renderCompFiles(l) {
    const files = Array.isArray(l.compReportFiles) ? l.compReportFiles : [];
    if (!files.length) return '';
    const leadId = l.leadId;
    const rows = files.map((f) => {
      const url = `/api/leads/${encodeURIComponent(leadId)}/comp/report-file/${encodeURIComponent(f.id)}`;
      const dl = `${url}?download=1`;
      const size = f.size ? `${Math.round(f.size / 1024)} KB` : '';
      return `<li class="vault-comp-file">
        <a href="${esc(url)}" class="vault-comp-file-link" target="_blank" rel="noopener noreferrer">${esc(f.filename || 'Report')}</a>
        <a href="${esc(dl)}" class="vault-comp-file-dl" download>Download</a>
        ${size ? `<span class="vault-comp-file-size">${esc(size)}</span>` : ''}
      </li>`;
    }).join('');
    return `<div class="vault-comp-block">
      <h4 class="vault-comp-subhead">Report files</h4>
      <ul class="vault-comp-files">${rows}</ul>
    </div>`;
  }

  function renderCompsTable(comps, opts = {}) {
    if (!Array.isArray(comps) || !comps.length) return '';
    const extended = opts.extended !== false;
    if (!extended) {
      const rows = comps.slice(0, 5).map((c) =>
        `<tr>
          <td>${esc(c.address || '—')}</td>
          <td>${c.price != null ? '$' + Number(c.price).toLocaleString() : '—'}</td>
          <td>${esc(c.soldDate || '—')}</td>
        </tr>`
      ).join('');
      return `<table class="vault-comps-table">
        <thead><tr><th>Address</th><th>Price</th><th>Sold</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }
    const rows = comps.map((c) => {
      const included = c.includedInArv !== false;
      const inclCls = included ? 'vault-comp-included' : 'vault-comp-excluded';
      const inclLabel = included ? 'Included' : 'Excluded';
      const renov = c.renovation ? esc(c.renovation) : '—';
      const dist = c.distanceMi != null ? `${Number(c.distanceMi).toFixed(2)} mi` : '—';
      const sv = c.streetViewUrl
        ? `<a href="${esc(c.streetViewUrl)}" class="vault-sv-mini" target="_blank" rel="noopener noreferrer">SV</a>`
        : '—';
      return `<tr class="${inclCls}">
        <td>${esc(c.address || '—')}</td>
        <td>${c.price != null ? '$' + Number(c.price).toLocaleString() : '—'}</td>
        <td>${esc(c.soldDate || '—')}</td>
        <td>${esc(dist)}</td>
        <td><span class="vault-comp-incl-badge">${inclLabel}</span></td>
        <td class="vault-comp-rules-col">${renderRuleResults(c.ruleResults)}</td>
        <td>${renov}</td>
        <td>${sv}</td>
      </tr>`;
    }).join('');
    return `<div class="vault-comps-wrap">
      <h4 class="vault-comp-subhead">Comps</h4>
      <div class="vault-comps-scroll">
        <table class="vault-comps-table vault-comps-table--full">
          <thead><tr>
            <th>Address</th><th>Price</th><th>Sold</th><th>Dist</th><th>In ARV</th><th>Rules</th><th>Reno</th><th>SV</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function renderCompingSection(l) {
    if (!hasCompingContent(l)) return '';
    const hasReport = hasArvCompingReport(l);
    const report = l.compingReport || {};
    const heroHtml = hasReport
      ? (() => {
          const arv = report.arv != null ? report.arv : (l.compedAt ? l.estARV : null);
          const conf = report.confidence || l.compConfidence;
          const arvDisplay = moneyFmt(arv) || '—';
          const when = formatCompDate(report.generatedAt || l.compedAt);
          return `<div class="vault-comp-hero">
        <p class="vault-comp-hero-label">ARV</p>
        <p class="vault-comp-hero-val">${esc(arvDisplay)}</p>
        <div class="vault-comp-hero-meta">${compConfidenceBadge(conf)}${when ? `<span class="vault-comp-date">Comped ${esc(when)}</span>` : ''}</div>
      </div>`;
        })()
      : '';
    return `<div class="vault-comp-report">
      ${heroHtml}
      ${hasReport ? renderHowWeGotHere(report) : ''}
      ${hasReport ? renderRulesSummaryBlock(report.rulesSummary) : ''}
      ${renderCompsTable(l.comps, { extended: true })}
      ${hasReport ? renderSanityBlock(report.sanity) : ''}
      ${renderStreetViewLinks(l, report)}
      ${hasReport ? renderCompFiles(l) : ''}
    </div>`;
  }

  function patchLeadInState(lead) {
    if (!lead?.leadId) return;
    const idx = state.leads.findIndex((r) => r.leadId === lead.leadId);
    if (idx >= 0) state.leads[idx] = { ...state.leads[idx], ...lead };
  }

  function blankManualCompRow() {
    return { address: '', price: '', soldDate: '', sqft: '', beds: '', baths: '' };
  }

  function renderManualCompRows(rows) {
    return rows.map((row, i) =>
      `<div class="vault-manual-comp-row" data-row="${i}">
        <input type="text" class="phuglee-input vault-manual-field" data-field="address" placeholder="Address" value="${esc(row.address || '')}" aria-label="Comp ${i + 1} address">
        <input type="number" class="phuglee-input vault-manual-field" data-field="price" placeholder="Price" value="${esc(row.price || '')}" aria-label="Comp ${i + 1} price" inputmode="numeric">
        <input type="text" class="phuglee-input vault-manual-field" data-field="soldDate" placeholder="Sold date" value="${esc(row.soldDate || '')}" aria-label="Comp ${i + 1} sold date">
        <input type="number" class="phuglee-input vault-manual-field" data-field="sqft" placeholder="Sqft" value="${esc(row.sqft || '')}" aria-label="Comp ${i + 1} sqft" inputmode="numeric">
        <input type="number" class="phuglee-input vault-manual-field" data-field="beds" placeholder="Beds" value="${esc(row.beds || '')}" aria-label="Comp ${i + 1} beds" inputmode="numeric">
        <input type="number" class="phuglee-input vault-manual-field" data-field="baths" placeholder="Baths" value="${esc(row.baths || '')}" aria-label="Comp ${i + 1} baths" inputmode="decimal">
        <button type="button" class="phuglee-btn phuglee-btn-ghost vault-manual-remove" data-remove-row="${i}" aria-label="Remove comp ${i + 1}"${rows.length <= 3 ? ' disabled' : ''}>×</button>
      </div>`
    ).join('');
  }

  function readManualCompRowsFromDom() {
    const wrap = $('vault-manual-comp-rows');
    if (!wrap) return [];
    return [...wrap.querySelectorAll('.vault-manual-comp-row')].map((rowEl) => {
      const row = {};
      rowEl.querySelectorAll('.vault-manual-field').forEach((input) => {
        const field = input.dataset.field;
        if (!field) return;
        row[field] = input.value.trim();
      });
      return row;
    });
  }

  function rerenderManualCompRows(rows) {
    const wrap = $('vault-manual-comp-rows');
    if (!wrap) return;
    wrap.innerHTML = renderManualCompRows(rows);
  }

  function bindManualCompRowEvents() {
    const wrap = $('vault-manual-comp-rows');
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-row]');
      if (!btn || btn.disabled) return;
      const idx = Number(btn.dataset.removeRow);
      const rows = readManualCompRowsFromDom();
      if (!Number.isFinite(idx) || rows.length <= 3) return;
      rows.splice(idx, 1);
      rerenderManualCompRows(rows);
    });
  }

  function renderManualFileList() {
    const list = $('vault-manual-file-list');
    if (!list) return;
    if (!state.manualCompFiles.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = state.manualCompFiles.map((f, i) =>
      `<li class="vault-manual-file-item">${esc(f.name)} <button type="button" class="vault-text-btn" data-remove-file="${i}">Remove</button></li>`
    ).join('');
    list.querySelectorAll('[data-remove-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeFile);
        if (Number.isFinite(idx)) {
          state.manualCompFiles.splice(idx, 1);
          renderManualFileList();
        }
      });
    });
  }

  function addManualCompFiles(fileList) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    for (const file of fileList) {
      const mime = file.type || 'application/octet-stream';
      if (!allowed.includes(mime) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name || '')) {
        showToast(`Skipped ${file.name}: unsupported type`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        showToast(`${file.name} exceeds 25 MB`);
        continue;
      }
      state.manualCompFiles.push(file);
    }
    renderManualFileList();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  function ensureManualCompPanel() {
    let panel = $('vault-manual-comp');
    if (panel) return panel;
    const el = document.createElement('aside');
    el.id = 'vault-manual-comp';
    el.className = 'vault-manual-comp';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'vault-manual-comp-title');
    el.innerHTML = `
      <div class="vault-manual-comp-backdrop" id="vault-manual-comp-backdrop" tabindex="-1"></div>
      <div class="vault-manual-comp-panel">
        <header class="vault-manual-comp-header">
          <h2 id="vault-manual-comp-title" class="vault-manual-comp-title">Manual Comp</h2>
          <button type="button" id="vault-manual-comp-close" class="phuglee-btn phuglee-btn-ghost" aria-label="Close">Close</button>
        </header>
        <div class="vault-manual-comp-body" id="vault-manual-comp-body"></div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#vault-manual-comp-close')?.addEventListener('click', closeManualCompPanel);
    el.querySelector('#vault-manual-comp-backdrop')?.addEventListener('click', closeManualCompPanel);
    return el;
  }

  function closeManualCompPanel() {
    const panel = $('vault-manual-comp');
    if (panel) panel.hidden = true;
    state.manualCompLeadId = null;
    state.manualCompLead = null;
    state.manualCompFiles = [];
  }

  function bindManualCompEvents(leadId, lead) {
    bindManualCompRowEvents();

    $('vault-manual-add-row')?.addEventListener('click', () => {
      const rows = readManualCompRowsFromDom();
      rows.push(blankManualCompRow());
      rerenderManualCompRows(rows);
    });

    $('vault-manual-copy-addr')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullAddress(lead));
        showToast('Address copied');
      } catch (_) {
        showToast('Could not copy address');
      }
    });

    const dropzone = $('vault-manual-dropzone');
    const fileInput = $('vault-manual-file');
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.length) addManualCompFiles(e.dataTransfer.files);
    });
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.length) addManualCompFiles(e.target.files);
      e.target.value = '';
    });

    $('vault-manual-save')?.addEventListener('click', () => {
      saveManualComp(leadId).catch((err) => showToast(err.message || 'Could not save comp'));
    });
  }

  function openManualCompPanel(leadId, data, lead) {
    const panel = ensureManualCompPanel();
    const body = $('vault-manual-comp-body');
    if (!body) return;
    state.manualCompLeadId = leadId;
    state.manualCompLead = lead || null;
    state.manualCompFiles = [];
    const l = lead || {};
    const st = data?.state || l.state || '';
    const rows = [blankManualCompRow(), blankManualCompRow(), blankManualCompRow()];
    body.innerHTML = `
      <p class="vault-manual-hint">Use <strong>Propelio</strong> for MLS sold comps in <strong>${esc(st || 'this state')}</strong>, then enter ARV and at least 3 comps below.</p>
      <div class="vault-manual-actions-top">
        <button type="button" id="vault-manual-copy-addr" class="phuglee-btn phuglee-btn-secondary">Copy address</button>
      </div>
      <label class="vault-field">
        <span class="vault-field-label">ARV</span>
        <input type="number" id="vault-manual-arv" class="phuglee-input" placeholder="After-repair value" inputmode="numeric">
      </label>
      <label class="vault-field">
        <span class="vault-field-label">Note (optional)</span>
        <input type="text" id="vault-manual-note" class="phuglee-input" placeholder="Propelio CMA reference">
      </label>
      <div class="vault-field">
        <span class="vault-field-label">Comps (min 3)</span>
        <div id="vault-manual-comp-rows" class="vault-manual-comp-rows">${renderManualCompRows(rows)}</div>
        <button type="button" id="vault-manual-add-row" class="phuglee-btn phuglee-btn-ghost">Add comp</button>
      </div>
      <div class="vault-field">
        <span class="vault-field-label">Propelio report (required — PDF or image)</span>
        <div class="vault-manual-dropzone" id="vault-manual-dropzone">
          <p>Drop files here or <label class="vault-manual-file-label"><input type="file" id="vault-manual-file" class="vault-manual-file-input" accept=".pdf,image/png,image/jpeg,image/webp" multiple hidden>choose files</label></p>
          <ul id="vault-manual-file-list" class="vault-manual-file-list"></ul>
        </div>
        ${Array.isArray(l.compReportFiles) && l.compReportFiles.length
          ? `<p class="vault-comp-meta">This lead already has ${l.compReportFiles.length} report file(s) on file.</p>`
          : '<p class="vault-comp-meta">A Propelio report upload is required before save.</p>'}
      </div>
      <div class="vault-manual-footer">
        <button type="button" id="vault-manual-save" class="phuglee-btn phuglee-btn-primary vault-comp-btn">Save Comp Report</button>
      </div>
    `;
    bindManualCompEvents(leadId, l);
    panel.hidden = false;
    $('vault-manual-arv')?.focus();
  }

  async function saveManualComp(leadId) {
    const arvRaw = $('vault-manual-arv')?.value;
    const arv = Number(arvRaw);
    if (!Number.isFinite(arv) || arv <= 0) {
      showToast('Enter a valid ARV');
      $('vault-manual-arv')?.focus();
      return;
    }
    const rows = readManualCompRowsFromDom();
    const comps = rows.map((row) => ({
      address: row.address,
      price: row.price === '' ? null : Number(row.price),
      soldDate: row.soldDate || undefined,
      sqft: row.sqft === '' ? undefined : Number(row.sqft),
      beds: row.beds === '' ? undefined : Number(row.beds),
      baths: row.baths === '' ? undefined : Number(row.baths)
    })).filter((c) => c.address || c.price != null);
    if (comps.length < 3) {
      showToast('Add at least 3 comps with address and price');
      return;
    }
    for (const c of comps) {
      if (!c.address || !Number.isFinite(c.price) || c.price <= 0) {
        showToast('Each comp needs address and price');
        return;
      }
    }
    const existing = state.manualCompLead
      || state.leads.find((x) => x.leadId === leadId)
      || null;
    const existingFiles = Array.isArray(existing?.compReportFiles) ? existing.compReportFiles.length : 0;
    if (!state.manualCompFiles.length && !existingFiles) {
      showToast('Upload a Propelio report before saving');
      $('vault-manual-dropzone')?.classList.add('is-required-miss');
      return;
    }
    const note = ($('vault-manual-note')?.value || '').trim();
    const saveBtn = $('vault-manual-save');
    if (saveBtn) saveBtn.disabled = true;
    try {
      let lead = existing || null;
      for (const file of state.manualCompFiles) {
        const contentBase64 = await fileToBase64(file);
        const uploaded = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/comp/report-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mime: file.type || 'application/pdf',
            contentBase64
          })
        });
        if (uploaded.lead) lead = uploaded.lead;
      }
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/comp/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arv, comps, note: note || undefined })
      });
      if (data.lead) lead = data.lead;
      closeManualCompPanel();
      if (lead) patchLeadInState(lead);
      state.drawerSection = 'comping';
      await openDrawer(leadId);
      showToast('Comp report saved');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function postCompRequest(leadId, replace) {
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/comp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ replace })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || res.statusText || 'Comp failed');
    }
    return data;
  }

  async function runComp(leadId, { replace = false } = {}) {
    if (state.compRunning) return;
    state.compRunning = true;
    const btn = $('vault-comp-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Comping…';
    }
    try {
      let data = await postCompRequest(leadId, replace);
      if (data.confirmReplace) {
        if (!window.confirm('Replace existing comps and ARV on this lead?')) return;
        data = await postCompRequest(leadId, true);
      }
      if (data.needsManual) {
        let lead = data.lead;
        if (!lead) {
          const detail = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
          lead = detail.lead;
        }
        openManualCompPanel(leadId, data, lead);
        return;
      }
      if (data.lead) {
        patchLeadInState(data.lead);
        state.drawerSection = 'comping';
        await openDrawer(leadId);
        const blocked = data.report?.confidence === 'blocked';
        const kept = data.report?.arvPreserved === true;
        showToast(
          blocked
            ? (kept ? 'Comp blocked — prior ARV kept' : 'Comp complete — ARV blocked')
            : 'Comp complete'
        );
      }
    } catch (err) {
      showToast(err.message || 'Comp failed');
    } finally {
      state.compRunning = false;
      if (state.activeLeadId === leadId) {
        const detail = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`).catch(() => null);
        const l = detail?.lead;
        const compBtn = $('vault-comp-btn');
        if (compBtn && l) {
          compBtn.disabled = false;
          compBtn.textContent = l.compedAt ? 'Re-comp' : 'Comp';
        }
      }
    }
  }

  function dlRows(pairs) {
    return pairs
      .filter(([, v]) => v != null && v !== '' && v !== '—')
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`)
      .join('');
  }

  function isVaultAdmin() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    try {
      return localStorage.getItem('phuglee_session') === 'admin';
    } catch (_) {
      return false;
    }
  }

  function renderActionStrip(l, favorite) {
    const adminBtn = isVaultAdmin()
      ? '<button type="button" id="vault-under-contract-btn" class="phuglee-btn phuglee-btn-primary">Move to Under Contract</button>'
      : '';
    const houseType = l.leadType === 'distressed' || l.leadType === 'well_maintained';
    const promoteBtn = houseType
      ? `<button type="button" id="vault-promote-land-btn" class="phuglee-btn phuglee-btn-secondary">Underwrite as land</button>`
      : '';
    return `<div class="vault-action-strip">
      ${renderCompActionStrip(l)}
      <a href="${esc(mapsUrl(l))}" class="phuglee-btn phuglee-btn-secondary" target="_blank" rel="noopener noreferrer">Maps</a>
      <a href="${esc(analyzeUrl(l))}" class="phuglee-btn phuglee-btn-ghost" target="_blank" rel="noopener noreferrer">Analyze</a>
      <button type="button" id="vault-copy-addr" class="phuglee-btn phuglee-btn-ghost">Copy address</button>
      <button type="button" id="vault-fav-btn" class="phuglee-btn phuglee-btn-ghost" data-fav="${favorite ? '1' : '0'}">${favorite ? '★ Saved' : '☆ Favorite'}</button>
      ${promoteBtn}
      ${adminBtn}
    </div>
    <div id="vault-promote-land-panel" class="vault-panel-block vault-promote-land-panel" hidden>
      <p class="vault-field-hint">Moves this lead to <strong>Land Vault</strong> as a teardown (leaves Home Vault). Pitch: builder / new-construction path — vacant-lot FMV − demo − ≥$5K − fee → LAO.</p>
      <label class="vault-field">
        <span class="vault-field-label">Demo estimate ($)</span>
        <input type="number" id="vault-promote-demo" class="phuglee-input" min="0" step="500" placeholder="e.g. 12000" inputmode="decimal">
      </label>
      <label class="vault-field">
        <span class="vault-field-label">Structure note</span>
        <input type="text" id="vault-promote-note" class="phuglee-input" maxlength="240" placeholder="Older / small footprint, corridor cues…">
      </label>
      <label class="vault-field">
        <span class="vault-field-label">Reason</span>
        <select id="vault-promote-reason" class="phuglee-select">
          <option value="operator">Operator judgment</option>
          <option value="contract_below_land_value">Contract below land value</option>
        </select>
      </label>
      <div class="vault-promote-land-actions">
        <button type="button" id="vault-promote-land-confirm" class="phuglee-btn phuglee-btn-primary">Promote to Land Vault</button>
        <button type="button" id="vault-promote-land-cancel" class="phuglee-btn phuglee-btn-ghost">Cancel</button>
      </div>
    </div>`;
  }

  function stripSectionShell(html) {
    return String(html || '')
      .replace(/<section class="vault-dossier-section">/g, '<div class="vault-panel-block">')
      .replace(/<\/section>/g, '</div>')
      .replace(/<h3>[^<]*<\/h3>/g, '');
  }

  function buildDrawerSections(l, data) {
    const whyBody = renderWhyThisLead(l, data.scoreExplain);
    const dealBody = [renderDealMath(l), renderOfferBand(l)].filter(Boolean).join('');
    const distressBody = [renderDistressSection(l), renderCodeViolationSection(l)].filter(Boolean).join('');
    const propertyBody = renderPropertySection(l);
    const mortgageBody = renderMortgageTaxSection(l);
    const compingBody = renderCompingSection(l);
    const notesBody = `
      <div class="vault-panel-block">
        ${renderDispositionChips(data.disposition || '')}
        <textarea id="vault-note-input" class="phuglee-textarea" rows="4" placeholder="Your notes…">${esc(data.note || '')}</textarea>
        <button type="button" id="vault-save-note" class="phuglee-btn phuglee-btn-secondary">Save note</button>
      </div>`;

    const sections = [
      { id: 'why', label: 'Why', html: whyBody },
      { id: 'owner', label: 'Owner', html: renderDialBrief(l) },
      { id: 'deal', label: 'Deal', html: stripSectionShell(dealBody) },
      { id: 'distress', label: 'Distress', html: stripSectionShell(distressBody) },
      { id: 'property', label: 'Property', html: stripSectionShell(propertyBody) },
      { id: 'mortgage', label: 'Mortgage', html: stripSectionShell(mortgageBody) },
      ...(compingBody ? [{ id: 'comping', label: hasArvCompingReport(l) ? 'ARV Report' : 'Comps', html: compingBody }] : []),
      { id: 'notes', label: 'Notes', html: notesBody }
    ].filter((s) => String(s.html || '').trim());

    if (!sections.length) {
      sections.push({ id: 'owner', label: 'Owner', html: '<p class="vault-drawer-loading">No details for this lead yet.</p>' });
    }

    const preferred = state.drawerSection || 'why';
    const activeId = sections.some((s) => s.id === preferred)
      ? preferred
      : sections[0].id;
    state.drawerSection = activeId;

    const tabs = sections.map((s) => {
      const on = s.id === activeId;
      return `<button type="button" class="vault-section-tab${on ? ' is-active' : ''}" role="tab" id="vault-section-tab-${esc(s.id)}" aria-selected="${on}" aria-controls="vault-section-panel-${esc(s.id)}" data-section="${esc(s.id)}">${esc(s.label)}</button>`;
    }).join('');

    const panels = sections.map((s) => {
      const on = s.id === activeId;
      return `<div class="vault-section-panel${on ? ' is-active' : ''}" role="tabpanel" id="vault-section-panel-${esc(s.id)}" aria-labelledby="vault-section-tab-${esc(s.id)}" ${on ? '' : 'hidden'}>${s.html}</div>`;
    }).join('');

    return `
      <div class="vault-section-nav" role="tablist" aria-label="Property details">
        ${tabs}
      </div>
      <div class="vault-section-panels">
        ${panels}
      </div>
    `;
  }

  function renderWhyThisLead(l, scoreExplain) {
    const explain = scoreExplain && Array.isArray(scoreExplain.parts) ? scoreExplain : null;
    const score = explain?.total != null ? explain.total : l.priorityScore;
    const parts = explain?.parts || [];
    const scoreRows = parts.map((p) =>
      `<li><span class="vault-why-label">${esc(p.label)}</span><span class="vault-why-pts">+${esc(p.points)}</span></li>`
    ).join('');

    const signals = (l.signalTags || []).slice(0, 8).map((t) =>
      `<span class="vault-signal-chip is-active">${esc(t)}</span>`
    ).join(' ');

    const d = l.distress || null;
    const distressBits = [];
    if (d?.score != null) distressBits.push(`Distress ${d.score}/10`);
    if (d?.tier != null || l.distressTier != null) {
      distressBits.push(`Tier ${d?.tier != null ? d.tier : l.distressTier}`);
    }
    const summary = d?.summary
      ? `<blockquote class="vault-distress-quote">${esc(d.summary)}</blockquote>`
      : '';
    const findings = Array.isArray(d?.indicators) ? d.indicators.slice(0, 6) : [];
    const findingChips = findings.length
      ? `<div class="vault-signal-chips">${findings.map((t) =>
        `<span class="vault-signal-chip is-active">${esc(t)}</span>`
      ).join(' ')}</div>`
      : '';

    const cv = l.codeViolation;
    let cvLine = '';
    if (cv && (cv.type || cv.description || cv.date)) {
      const bits = [cv.type, cv.date, cv.category].filter(Boolean).map(String);
      cvLine = `<p class="vault-why-cv"><strong>Code:</strong> ${esc(bits.join(' · '))}${
        cv.description ? ` — ${esc(String(cv.description).slice(0, 160))}` : ''
      }</p>`;
    }

    const proofBits = [
      l.sourceCity ? `Sourced · ${l.sourceCity}` : null,
      l.publishedAt ? `Published ${String(l.publishedAt).slice(0, 10)}` : null,
      l.streetViewUrl || (l.photos && l.photos[0]) ? 'Street View on file' : null,
      Array.isArray(l.phones) && l.phones.length ? `${l.phones.length} phone${l.phones.length === 1 ? '' : 's'}` : 'No phone yet'
    ].filter(Boolean);

    const hasProof = scoreRows || signals || summary || findingChips || cvLine || proofBits.length;
    if (!hasProof) return '';

    return `<div class="vault-why-panel">
      <p class="vault-why-headline">Why this lead <span class="vault-why-score">${esc(score ?? '—')}</span></p>
      <p class="vault-why-sub">Clerk-reviewed catalog proof — not a scraped skip-trace dump.</p>
      ${scoreRows ? `<ul class="vault-why-score-list">${scoreRows}</ul>` : ''}
      ${distressBits.length ? `<p class="vault-why-distress">${esc(distressBits.join(' · '))}</p>` : ''}
      ${summary}
      ${findingChips}
      ${cvLine}
      ${signals ? `<div class="vault-signal-chips vault-why-signals">${signals}</div>` : ''}
      <p class="vault-why-provenance">${esc(proofBits.join(' · '))}</p>
    </div>`;
  }

  function renderDialBrief(l) {
    const phones = Array.isArray(l.phones) ? l.phones : [];
    const entity = entityTypeLabel(l.entityType);
    const ownerLine = [l.ownerName || 'Owner unknown', entity].filter(Boolean).join(' · ');
    const signals = (l.signalTags || []).slice(0, 6).map((t) =>
      `<span class="vault-signal-chip is-active">${esc(t)}</span>`
    ).join(' ');
    const phoneBlock = phones.length
      ? formatPhoneStack(phones, { large: true, max: 4 })
      : '<p class="vault-dial-phone-row">—</p>';
    return `<div class="vault-dial-brief">
      <p class="vault-dial-owner"><strong>${esc(ownerLine)}</strong></p>
      ${phoneBlock}
      ${l.email ? `<p class="vault-dial-email">${esc(l.email)}</p>` : ''}
      ${l.mailingAddress ? `<p class="vault-dial-mail">Mail: ${esc(l.mailingAddress)}</p>` : ''}
      <p class="vault-dial-script">${esc(buildDialScript(l))}</p>
      ${signals ? `<div class="vault-signal-chips vault-dial-signals">${signals}</div>` : ''}
    </div>`;
  }

  function renderDealMath(l) {
    const f = l.financialDetails || {};
    const mortgage = f.mortgageBalance;
    const pairs = [
      ['ARV', moneyFmt(l.estARV)],
      ['Equity', moneyFmt(l.estEquity)],
      ['Wholesale', moneyFmt(f.wholesaleValue)],
      ['Mortgage', moneyFmt(mortgage)]
    ].filter(([, v]) => v);
    if (!pairs.length) return '';
    const rows = pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    return `<section class="vault-dossier-section">
      <h3>Deal math</h3>
      <dl class="vault-deal-math">${rows}</dl>
    </section>`;
  }

  function renderOfferBand(l) {
    const f = l.financialDetails || {};
    const arv = Number(l.estARV);
    const mortgage = Number(f.mortgageBalance);
    if (!Number.isFinite(arv) || arv <= 0 || !Number.isFinite(mortgage) || mortgage < 0) return '';
    const equity = Math.max(0, arv - mortgage);
    const mortPct = Math.min(100, Math.round((mortgage / arv) * 100));
    const eqPct = Math.min(100, Math.round((equity / arv) * 100));
    return `<div class="vault-offer-band" role="img" aria-label="Mortgage ${mortPct}% versus equity ${eqPct}% of ARV">
      <div class="vault-offer-band-bar" style="display:flex;width:100%;height:0.45rem;border-radius:var(--radius-pill);overflow:hidden;margin-bottom:0.45rem;background:rgba(176,169,156,0.15)">
        <div style="width:${mortPct}%;background:var(--phuglee-stone)" title="Mortgage"></div>
        <div style="width:${eqPct}%;background:var(--phuglee-orange)" title="Equity"></div>
      </div>
      <span class="vault-offer-band-label">Mortgage</span>
      <span class="vault-offer-band-value">${mortPct}%</span>
      <span class="vault-offer-band-label">Equity</span>
      <span class="vault-offer-band-value">${eqPct}% · ${esc(moneyFmt(equity) || '')}</span>
    </div>`;
  }

  function renderDistressSection(l) {
    const d = l.distress || null;
    if (!d) return '';
    const findings = Array.isArray(d.indicators) ? d.indicators : [];
    const chips = findings.length
      ? `<div class="vault-signal-chips">${findings.map((t) =>
        `<span class="vault-signal-chip is-active">${esc(t)}</span>`
      ).join(' ')}</div>`
      : '';
    const score = d.score != null ? Number(d.score) : null;
    const meter = score != null && Number.isFinite(score)
      ? `<div class="vault-score-meter" style="margin:0.5rem 0;height:0.35rem;border-radius:var(--radius-pill);background:rgba(176,169,156,0.15);overflow:hidden" aria-hidden="true">
          <div style="width:${Math.min(100, Math.max(0, score * 10))}%;height:100%;background:var(--phuglee-orange)"></div>
        </div>
        <p class="vault-dossier-type">Distress score ${esc(score)}/10${d.tier ? ` · Tier ${esc(d.tier)}` : ''}</p>`
      : '';
    const summary = d.summary
      ? `<blockquote class="vault-distress-quote">${esc(d.summary)}</blockquote>`
      : '';
    if (!meter && !chips && !summary) return '';
    return `<section class="vault-dossier-section">
      <h3>Distress</h3>
      ${meter}
      ${summary}
      ${chips}
    </section>`;
  }

  function codeViolationIsRich(v) {
    if (!v) return false;
    if (v.description) return true;
    if (Array.isArray(v.records) && v.records.length) return true;
    if (v.type && String(v.type).toLowerCase() !== 'code violation') return true;
    if (v.date || v.category) return true;
    return false;
  }

  function renderCodeViolationSection(l) {
    const v = l.codeViolation || null;
    if (!v) return '';
    if (!codeViolationIsRich(v)) {
      const onlyGeneric = String(v.type || '').toLowerCase() === 'code violation' && !v.description;
      if (onlyGeneric) {
        return `<section class="vault-dossier-section"><h3>Code violation</h3><p class="vault-dossier-mail">Imported as code violation list</p></section>`;
      }
      return '';
    }
    const rows = [
      ['Type', v.type || ''],
      ['Category', v.category || ''],
      ['Date', v.date || ''],
      ['Description', v.description || '']
    ];
    let html = dlRows(rows);
    const records = Array.isArray(v.records) ? v.records : [];
    if (records.length) {
      html += records.map((rec) => {
        const bits = [rec.type || rec.description, rec.date].filter(Boolean).join(' · ');
        if (!bits) return '';
        const extra = rec.description && rec.type && rec.description !== rec.type
          ? `<div class="vault-dossier-mail">${esc(rec.description)}</div>`
          : '';
        return `<dt>${esc(rec.date || 'Record')}</dt><dd>${esc(rec.type || rec.description || '—')}${extra}</dd>`;
      }).join('');
    }
    if (!html) return '';
    return `<section class="vault-dossier-section"><h3>Code violation</h3><dl class="vault-dl">${html}</dl></section>`;
  }

  function renderPropertySection(l) {
    const p = l.propertyDetails || {};
    const facts = [];
    if (p.beds != null) facts.push(`${p.beds} bd`);
    if (p.baths != null) facts.push(`${p.baths} ba`);
    if (p.sqft != null) facts.push(`${Number(p.sqft).toLocaleString()} sqft`);
    if (p.yearBuilt != null) facts.push(`Built ${p.yearBuilt}`);
    if (p.lotSqft != null) facts.push(`${Number(p.lotSqft).toLocaleString()} lot`);

    const amenities = [];
    if (p.garage) amenities.push(`Garage ${p.garage}`);
    if (p.pool) amenities.push(`Pool ${p.pool}`);
    if (p.hoa === true) amenities.push(p.hoaFee != null ? `HOA ${moneyFmt(p.hoaFee)}` : 'HOA');
    else if (p.hoa === false) amenities.push('No HOA');
    if (p.heating) amenities.push(`Heat ${p.heating}`);
    if (p.airConditioning) amenities.push(`A/C ${p.airConditioning}`);
    if (p.roof) amenities.push(`Roof ${p.roof}`);

    const factsHtml = facts.length
      ? `<div class="vault-facts">${facts.map((f) => `<span class="vault-fact">${esc(f)}</span>`).join('')}</div>`
      : '';
    const amenHtml = amenities.length
      ? `<div class="vault-facts">${amenities.map((a) => `<span class="vault-amenity-chip">${esc(a)}</span>`).join('')}</div>`
      : '';

    const detailRows = [
      ['Type', l.propertyType || ''],
      ['Stories', p.stories != null ? p.stories : ''],
      ['County', p.county || ''],
      ['Basement', p.basement || ''],
      ['Walls', p.walls || ''],
      ['Water', p.water || ''],
      ['Sewer', p.sewer || ''],
      ['Patio', p.patio || ''],
      ['Porch', p.porch || ''],
      ['Fireplace', p.fireplace || '']
    ];
    const detailHtml = dlRows(detailRows);

    if (!factsHtml && !amenHtml && !detailHtml) return '';
    return `<section class="vault-dossier-section">
      <h3>Property</h3>
      ${factsHtml}
      ${amenHtml}
      ${detailHtml ? `<details class="vault-disclosure"><summary>Building &amp; utilities</summary><dl class="vault-dl">${detailHtml}</dl></details>` : ''}
    </section>`;
  }

  function renderMortgageTaxSection(l) {
    const f = l.financialDetails || {};
    const sale = l.lastSale || {};
    const rows = [
      ['Market value', moneyFmt(f.marketValue)],
      ['Assessed', moneyFmt(l.assessedValue)],
      ['Est. repairs', moneyFmt(l.estRepairs)],
      ['Tax amount', moneyFmt(f.taxAmount)],
      ['Price / sq ft', moneyFmt(f.pricePerSqFt)],
      ['Last sale', sale.date || sale.price != null
        ? `${sale.date || '—'}${sale.price != null ? ` · ${moneyFmt(sale.price)}` : ''}`
        : ''],
      ['LTV', f.ltv != null ? `${f.ltv}%` : ''],
      ['Loan amount', moneyFmt(f.loanAmount)],
      ['Payment', moneyFmt(f.payment)],
      ['Rate', f.rate != null ? `${f.rate}%` : ''],
      ['Loan type', f.loanType || ''],
      ['Lender', f.lender || ''],
      ['Recorded', f.recordingDate || ''],
      ['Matures', f.maturityDate || ''],
      ['Auction', f.auctionDate || ''],
      ['Last notice', f.lastNoticeDate || '']
    ].filter(([k, v]) => v != null && v !== '' && v !== '—');
    if (!rows.length) return '';
    const html = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('');
    return `<section class="vault-dossier-section">
      <details class="vault-disclosure"><summary>Mortgage &amp; tax details</summary><dl class="vault-dl">${html}</dl></details>
    </section>`;
  }

  function renderComps(comps) {
    const table = renderCompsTable(comps, { extended: false });
    if (!table) return '';
    return `<section class="vault-dossier-section">
      <h3>Comps</h3>
      ${table}
    </section>`;
  }

  function renderDispositionChips(activeDisp) {
    const chips = DISPOSITIONS.map((d) => {
      const active = activeDisp === d.id;
      return `<button type="button" class="vault-disp-chip ${d.cls}${active ? ' is-active' : ''}" data-disp="${esc(d.id)}" aria-pressed="${active}">${esc(d.label)}</button>`;
    }).join(' ');
    return `<div class="vault-disp-chips" role="group" aria-label="Disposition">${chips}</div>`;
  }

  function getDrawerFocusables() {
    const panel = document.querySelector('.vault-drawer-panel');
    if (!panel) return [];
    return [...panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null || el === $('vault-drawer-close'));
  }

  function handleDrawerFocusTrap(e) {
    if (e.key !== 'Tab') return;
    const drawer = $('vault-drawer');
    if (!drawer || drawer.hidden) return;
    const focusables = getDrawerFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function openDrawer(leadId) {
    const drawer = $('vault-drawer');
    const body = $('vault-drawer-body');
    const title = $('vault-drawer-title');
    if (!drawer || !body) return;

    if (!state.activeLeadId) {
      state.focusRestoreEl = document.activeElement;
    }

    const switchingLead = state.activeLeadId !== leadId;
    state.activeLeadId = leadId;
    state.drawerImageMode = state.drawerImageMode || 'street';
    if (switchingLead) state.drawerSection = 'why';
    drawer.hidden = false;
    body.innerHTML = '<p class="vault-drawer-loading">Loading…</p>';
    updateDrawerNav();

    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = data.lead;
      if (l && l.leadType === 'land') {
        window.location.replace(`/land-vault?lead=${encodeURIComponent(leadId)}`);
        return;
      }
      if (title) title.textContent = l.address || 'Lead';

      body.innerHTML = `
        ${renderDrawerHero(l)}
        <div class="vault-dossier">
          ${renderActionStrip(l, data.favorite)}
          ${buildDrawerSections(l, data)}
        </div>
      `;

      wireImageryFallbacks(body);
      bindDrawerEvents(l, leadId, data.disposition || '');
      $('vault-drawer-close')?.focus();
    } catch (err) {
      body.innerHTML = `<p class="phuglee-error">${esc(err.message)}</p>`;
    }
  }

  function bindDrawerEvents(l, leadId, disposition) {
    document.querySelectorAll('.vault-section-tab[data-section]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.section || 'owner';
        state.drawerSection = id;
        document.querySelectorAll('.vault-section-tab[data-section]').forEach((t) => {
          const on = t.dataset.section === id;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.vault-section-panel').forEach((panel) => {
          const on = panel.id === `vault-section-panel-${id}`;
          panel.classList.toggle('is-active', on);
          panel.hidden = !on;
        });
      });
    });

    $('vault-save-note')?.addEventListener('click', async () => {
      try {
        const note = $('vault-note-input')?.value || '';
        await fetchJson(`/api/leads/user/notes/${encodeURIComponent(leadId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note })
        });
        showToast('Note saved');
      } catch (err) {
        showToast(err.message || 'Could not save note');
      }
    });

    $('vault-fav-btn')?.addEventListener('click', async () => {
      try {
        const data2 = await fetchJson(`/api/leads/user/favorites/${encodeURIComponent(leadId)}`, { method: 'PUT' });
        const btn = $('vault-fav-btn');
        if (btn) {
          btn.textContent = data2.favorite ? '★ Saved' : '☆ Favorite';
          btn.dataset.fav = data2.favorite ? '1' : '0';
        }
        const row = state.leads.find((r) => r.leadId === leadId);
        if (row) row.favorite = data2.favorite;
        renderResults();
        showToast(data2.favorite ? 'Saved to favorites' : 'Removed from favorites');
      } catch (err) {
        showToast(err.message || 'Could not update favorite');
      }
    });

    $('vault-under-contract-btn')?.addEventListener('click', async () => {
      if (!window.confirm(`Move ${l.address || 'this lead'} to Under Contract and hide it from The Vault?`)) return;
      const btn = $('vault-under-contract-btn');
      if (btn) btn.disabled = true;
      try {
        await fetchJson('/api/leads/admin/contracts/from-vault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId })
        });
        showToast('Moved to Under Contract');
        state.leads = state.leads.filter((r) => r.leadId !== leadId);
        state.total = Math.max(0, (state.total || 1) - 1);
        closeDrawer();
        renderResults();
        try { await loadBootstrap(); } catch (_) { /* list already updated */ }
      } catch (err) {
        showToast(err.message || 'Could not move lead');
        if (btn) btn.disabled = false;
      }
    });

    $('vault-promote-land-btn')?.addEventListener('click', () => {
      const panel = $('vault-promote-land-panel');
      if (panel) panel.hidden = false;
      $('vault-promote-demo')?.focus();
    });

    $('vault-promote-land-cancel')?.addEventListener('click', () => {
      const panel = $('vault-promote-land-panel');
      if (panel) panel.hidden = true;
    });

    $('vault-promote-land-confirm')?.addEventListener('click', async () => {
      if (!window.confirm(
        `Promote ${l.address || 'this lead'} to Land Vault as a teardown?\n\nIt will leave Home Vault and use land underwriting (demo → LAO).`
      )) return;
      const btn = $('vault-promote-land-confirm');
      if (btn) btn.disabled = true;
      const demoRaw = $('vault-promote-demo')?.value;
      const demoEstimate = demoRaw === '' || demoRaw == null ? null : Number(demoRaw);
      const structureNote = String($('vault-promote-note')?.value || '').trim();
      const reason = String($('vault-promote-reason')?.value || 'operator').trim();
      try {
        const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/promote-to-land`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            demoEstimate: Number.isFinite(demoEstimate) ? demoEstimate : null,
            structureNote,
            reason
          })
        });
        showToast('Promoted to Land Vault');
        const dest = data.redirect || `/land-vault?lead=${encodeURIComponent(leadId)}`;
        window.location.assign(dest);
      } catch (err) {
        showToast(err.message || 'Could not promote lead');
        if (btn) btn.disabled = false;
      }
    });

    $('vault-copy-addr')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullAddress(l));
        showToast('Address copied');
      } catch (_) {
        showToast('Could not copy address');
      }
    });

    $('vault-comp-btn')?.addEventListener('click', () => {
      runComp(leadId).catch((err) => showToast(err.message || 'Comp failed'));
    });

    document.querySelectorAll('[data-block-pass]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pass = btn.dataset.blockPass;
        if (pass !== 'pass' && pass !== 'kill') return;
        document.querySelectorAll('[data-block-pass]').forEach((b) => { b.disabled = true; });
        try {
          const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/comp/block-pass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pass })
          });
          if (data.lead) patchLeadInState(data.lead);
          state.drawerSection = 'comping';
          await openDrawer(leadId);
          showToast(pass === 'pass' ? 'Barrier check: Pass' : 'Barrier check: Kill');
        } catch (err) {
          showToast(err.message || 'Could not save barrier check');
          document.querySelectorAll('[data-block-pass]').forEach((b) => { b.disabled = false; });
        }
      });
    });

    $('vault-hero-img')?.addEventListener('click', () => {
      openLightbox(primaryImage(l, state.drawerImageMode), l.address);
    });

    document.querySelectorAll('.vault-hero-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.drawerImageMode = btn.dataset.imgMode || 'street';
        openDrawer(leadId);
      });
    });

    document.querySelectorAll('.vault-disp-chip[data-disp]').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const next = chip.dataset.disp || '';
        const current = disposition;
        const value = current === next ? '' : next;
        try {
          const res = await fetchJson(`/api/leads/user/dispositions/${encodeURIComponent(leadId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disposition: value })
          });
          disposition = res.disposition || '';
          if (state.overlays.dispositions) {
            if (disposition) state.overlays.dispositions[leadId] = disposition;
            else delete state.overlays.dispositions[leadId];
          }
          document.querySelectorAll('.vault-disp-chip[data-disp]').forEach((c) => {
            const active = c.dataset.disp === disposition;
            c.classList.toggle('is-active', active);
            c.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          showToast('Saved');
        } catch (err) {
          showToast(err.message || 'Could not save disposition');
        }
      });
    });
  }

  function updateDrawerNav() {
    const idx = activeLeadIndex();
    const prev = $('vault-drawer-prev');
    const next = $('vault-drawer-next');
    const pos = $('vault-drawer-pos');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= state.leads.length - 1;
    if (pos) {
      if (idx < 0 || ($('vault-drawer') && $('vault-drawer').hidden)) {
        pos.hidden = true;
      } else {
        pos.textContent = `${idx + 1} / ${state.leads.length} · j/k`;
        pos.hidden = false;
      }
    }
  }

  function closeDrawer() {
    const drawer = $('vault-drawer');
    if (drawer) drawer.hidden = true;
    state.activeLeadId = null;
    const pos = $('vault-drawer-pos');
    if (pos) pos.hidden = true;
    const restore = state.focusRestoreEl;
    state.focusRestoreEl = null;
    if (restore && typeof restore.focus === 'function') {
      try { restore.focus(); } catch (_) { /* ignore */ }
    }
  }

  async function downloadExportPayload(data, format) {
    if (format === 'csv' || data.format === 'csv') {
      const blob = new Blob([data.csv || ''], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = data.filename || 'vault-export.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    const raw = String(data.xlsxBase64 || '');
    if (!raw) throw new Error('Export returned empty workbook');
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.filename || 'vault-export.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportSelected(ids) {
    const list = ids || [...state.selected];
    if (!list.length) return;
    const format = ($('vault-export-format-sel')?.value || 'xlsx') === 'csv' ? 'csv' : 'xlsx';
    const data = await fetchJson('/api/leads/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: list,
        format,
        scope: 'ids',
        filters: currentFilterSnapshot(),
        label: ''
      })
    });
    await downloadExportPayload(data, format);
    showToast(`Exported ${data.count || list.length} leads`);
  }

  async function exportMatchingFilters(label, filtersOverride) {
    const format = ($('vault-export-format-sel')?.value || 'xlsx') === 'csv' ? 'csv' : 'xlsx';
    const filters = filtersOverride || currentFilterSnapshot();
    const data = await fetchJson('/api/leads/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'filtered',
        format,
        filters,
        label: label || ''
      })
    });
    await downloadExportPayload(data, format);
    const extra = data.truncated
      ? ` (first ${data.count} of ${Number(data.matchTotal || 0).toLocaleString()})`
      : '';
    showToast(`Exported ${data.count || 0} leads${extra}`);
  }

  async function runToolbarExport() {
    if (state.selected.size > 0) {
      await exportSelected([...state.selected]);
      return;
    }
    if (!state.total) {
      showToast('No leads to export');
      return;
    }
    await exportMatchingFilters();
  }

  function copySelectedPhones() {
    const phones = [];
    const seen = new Set();
    for (const id of state.selected) {
      const row = state.leads.find((l) => l.leadId === id);
      if (!row || !row.phones) continue;
      for (const p of row.phones) {
        const t = String(p || '').trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        phones.push(t);
      }
    }
    if (!phones.length) {
      showToast('No phones in selection');
      return;
    }
    navigator.clipboard.writeText(phones.join('\n')).then(() => {
      showToast(`Copied ${phones.length} phone${phones.length === 1 ? '' : 's'}`);
    }).catch(() => {
      showToast('Could not copy phones');
    });
  }

  function handleRowActivate(target, leadId) {
    if (target.closest('[data-no-open="1"]')) return;
    openDrawer(leadId);
  }

  function handleRowKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.vault-row, .vault-card');
    if (!row) return;
    if (e.target.closest('[data-no-open="1"]')) return;
    e.preventDefault();
    openDrawer(row.dataset.leadId);
  }

  function bindEvents() {
    $('vault-type-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.vault-type-tab');
      if (!tab) return;
      state.leadType = tab.dataset.type || 'all';
      state.page = 1;
      state.leads = [];
      syncTypeTabs();
      refreshCurrentView();
    });

    $('vault-search')?.addEventListener('input', (e) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.q = e.target.value.trim();
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      }, 300);
    });

    $('vault-state')?.addEventListener('change', (e) => {
      state.state = e.target.value;
      state.city = '';
      state.page = 1;
      state.leads = [];
      populateGeoSelects();
      refreshCurrentView();
    });

    $('vault-city')?.addEventListener('change', (e) => {
      state.city = e.target.value;
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-since')?.addEventListener('change', (e) => {
      state.since = e.target.value;
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    ['vault-favorites-only', 'vault-has-phone', 'vault-has-photo'].forEach((id) => {
      $(id)?.addEventListener('change', (e) => {
        if (id === 'vault-favorites-only') state.favoritesOnly = e.target.checked;
        else if (id === 'vault-has-phone') state.hasPhone = e.target.checked;
        else state.hasImagery = e.target.checked;
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      });
    });

    $('vault-entity-type')?.addEventListener('change', (e) => {
      state.entityType = e.target.value || '';
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-equity-band')?.addEventListener('change', (e) => {
      const map = { '100k': 100000, '200k': 200000, '300k': 300000, '400k': 400000 };
      state.minEquity = map[e.target.value] || 0;
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-smart-defaults')?.addEventListener('change', (e) => {
      state.smartDefaults = e.target.checked;
      writeSmartDefaultsPref(state.smartDefaults);
      if (state.smartDefaults) {
        applySmartDefaults();
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      }
    });

    $('vault-min-score')?.addEventListener('input', (e) => {
      state.minScore = Number(e.target.value) || 0;
      const val = $('vault-min-score-val');
      const slider = $('vault-min-score');
      if (val) val.textContent = String(state.minScore);
      if (slider) slider.setAttribute('aria-valuenow', String(state.minScore));
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      }, 200);
    });

    $('vault-signal-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.vault-signal-chip');
      if (!chip) return;
      const signal = chip.dataset.signal;
      const idx = state.signals.indexOf(signal);
      if (idx >= 0) state.signals.splice(idx, 1);
      else state.signals.push(signal);
      renderSignalChips();
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-signals-more')?.addEventListener('click', () => {
      state.signalsExpanded = !state.signalsExpanded;
      renderSignalChips();
    });

    $('vault-clear-filters')?.addEventListener('click', () => {
      state.state = '';
      state.city = '';
      state.signals = [];
      state.minScore = 0;
      state.since = '';
      state.q = '';
      state.favoritesOnly = false;
      state.hasPhone = false;
      state.hasImagery = false;
      state.entityType = '';
      state.minEquity = 0;
      state.leadType = 'all';
      state.originLat = null;
      state.originLng = null;
      state.originLabel = '';
      state.page = 1;
      state.leads = [];
      if ($('vault-smart-defaults')) $('vault-smart-defaults').checked = false;
      if ($('vault-radius-address')) $('vault-radius-address').value = '';
      updateRadiusStatus();
      syncFilterControls();
      syncTypeTabs();
      renderSignalChips();
      populateGeoSelects();
      refreshCurrentView();
    });

    $('vault-radius-apply')?.addEventListener('click', () => {
      applyRadiusFromAddress();
    });
    $('vault-near-me')?.addEventListener('click', () => {
      applyNearMe();
    });
    $('vault-radius-clear')?.addEventListener('click', () => {
      if ($('vault-radius-address')) $('vault-radius-address').value = '';
      clearRadiusOrigin();
    });
    $('vault-radius-miles')?.addEventListener('change', (e) => {
      state.radiusMiles = Number(e.target.value) || 5;
      if (state.originLat != null) {
        updateRadiusStatus();
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      }
    });
    $('vault-radius-address')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyRadiusFromAddress();
      }
    });

    $('vault-presets')?.addEventListener('change', (e) => {
      const idx = e.target.value;
      updatePullActions();
      if (idx === '') return;
      const preset = state.overlays.presets[Number(idx)];
      if (!preset?.filters) return;
      if (preset.name && $('vault-preset-name')) $('vault-preset-name').value = preset.name;
      applyFilterSnapshot(preset.filters);
      showToast(`Loaded pull: ${preset.name || 'Untitled'}`);
    });

    $('vault-save-preset')?.addEventListener('click', async () => {
      const input = $('vault-preset-name');
      const name = (input?.value || '').trim();
      if (!name) {
        showToast('Name this pull');
        input?.focus();
        return;
      }
      try {
        const presets = [...(state.overlays.presets || [])];
        const existingIdx = presets.findIndex((p) => String(p.name || '').toLowerCase() === name.toLowerCase());
        const entry = {
          id: existingIdx >= 0 ? presets[existingIdx].id : undefined,
          name,
          createdAt: existingIdx >= 0 ? presets[existingIdx].createdAt : undefined,
          filters: currentFilterSnapshot()
        };
        if (existingIdx >= 0) presets[existingIdx] = { ...presets[existingIdx], ...entry };
        else presets.push(entry);
        const data = await fetchJson('/api/leads/user/presets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presets })
        });
        state.overlays.presets = data.presets || presets;
        renderPresetSelect();
        const sel = $('vault-presets');
        if (sel) {
          const idx = (state.overlays.presets || []).findIndex((p) => p.name === name);
          if (idx >= 0) sel.value = String(idx);
        }
        updatePullActions();
        showToast(existingIdx >= 0 ? 'Pull updated' : 'Pull saved');
      } catch (err) {
        showToast(err.message || 'Could not save pull');
      }
    });

    $('vault-delete-preset')?.addEventListener('click', async () => {
      const idx = selectedPullIndex();
      if (idx < 0) return;
      const presets = [...(state.overlays.presets || [])];
      const removed = presets.splice(idx, 1)[0];
      try {
        const data = await fetchJson('/api/leads/user/presets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presets })
        });
        state.overlays.presets = data.presets || presets;
        renderPresetSelect();
        if ($('vault-preset-name')) $('vault-preset-name').value = '';
        showToast(`Deleted ${removed?.name || 'pull'}`);
      } catch (err) {
        showToast(err.message || 'Could not delete pull');
      }
    });

    $('vault-export-pull')?.addEventListener('click', async () => {
      const idx = selectedPullIndex();
      if (idx < 0) return;
      const preset = state.overlays.presets[idx];
      if (!preset?.filters) return;
      try {
        applyFilterSnapshot(preset.filters);
        await exportMatchingFilters(preset.name || '', preset.filters);
      } catch (err) {
        showToast(err.message || 'Export failed');
      }
    });

    document.querySelector('.vault-view-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.vault-view-btn');
      if (!btn) return;
      state.viewModeManual = true;
      state.viewMode = btn.dataset.view || 'table';
      state.page = 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-results-body')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('vault-row-check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
        updateExportButton();
        updateBulkBar();
        return;
      }
      const row = e.target.closest('.vault-row');
      if (row) handleRowActivate(e.target, row.dataset.leadId);
    });

    $('vault-cards')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('vault-row-check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
        updateExportButton();
        updateBulkBar();
        return;
      }
      const card = e.target.closest('.vault-card');
      if (card) handleRowActivate(e.target, card.dataset.leadId);
    });

    $('vault-results-body')?.addEventListener('keydown', handleRowKeydown);
    $('vault-cards')?.addEventListener('keydown', handleRowKeydown);

    $('vault-select-all')?.addEventListener('change', (e) => {
      state.leads.forEach((row) => {
        if (e.target.checked) state.selected.add(row.leadId);
        else state.selected.delete(row.leadId);
      });
      renderResults();
    });

    $('vault-pagination')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.page) || 1;
      state.leads = [];
      refreshCurrentView();
    });

    $('vault-results')?.addEventListener('scroll', () => {
      if (state.viewMode !== 'cards') return;
      if (state.loadingMore || state.loading) return;
      if (state.page >= state.totalPages) return;
      const el = $('vault-results');
      if (!el) return;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
      if (nearBottom) {
        state.page += 1;
        loadLeads({ append: true });
      }
    });

    document.querySelectorAll('.vault-sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sort = btn.dataset.sort;
        if (state.sort === sort) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sort = sort;
          state.sortDir = sort === 'address' || sort === 'city' ? 'asc' : 'desc';
        }
        state.page = 1;
        state.leads = [];
        refreshCurrentView();
      });
    });

    $('vault-export-btn')?.addEventListener('click', () => {
      runToolbarExport().catch((err) => showToast(err.message || 'Export failed'));
    });

    $('vault-bulk-export')?.addEventListener('click', () => {
      exportSelected().catch((err) => showToast(err.message || 'Export failed'));
    });

    $('vault-bulk-fav')?.addEventListener('click', async () => {
      try {
        await fetchJson('/api/leads/user/favorites/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...state.selected], favorite: true })
        });
        await refreshCurrentView();
        showToast('Favorited selection');
      } catch (err) {
        showToast(err.message || 'Could not favorite');
      }
    });

    $('vault-bulk-copy-phones')?.addEventListener('click', copySelectedPhones);

    $('vault-bulk-clear')?.addEventListener('click', () => {
      state.selected.clear();
      renderResults();
    });

    $('vault-drawer-close')?.addEventListener('click', closeDrawer);
    $('vault-drawer-backdrop')?.addEventListener('click', closeDrawer);
    $('vault-drawer-prev')?.addEventListener('click', () => navigateDrawer(-1));
    $('vault-drawer-next')?.addEventListener('click', () => navigateDrawer(1));
    $('vault-lightbox-close')?.addEventListener('click', closeLightbox);
    $('vault-lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'vault-lightbox') closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      const drawerOpen = $('vault-drawer') && !$('vault-drawer').hidden;
      const lightboxOpen = $('vault-lightbox') && !$('vault-lightbox').hidden;
      const manualOpen = $('vault-manual-comp') && !$('vault-manual-comp').hidden;
      if (e.key === 'Escape') {
        if (lightboxOpen) closeLightbox();
        else if (manualOpen) closeManualCompPanel();
        else if (drawerOpen) closeDrawer();
        return;
      }
      if (drawerOpen) handleDrawerFocusTrap(e);
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === '/' && !drawerOpen) {
        e.preventDefault();
        $('vault-search')?.focus();
        return;
      }
      if (!drawerOpen) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateDrawer(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateDrawer(-1);
      }
    });

    window.addEventListener('resize', () => {
      applyAutoViewMode();
    });
  }

  async function init() {
    let me = {};
    try {
      me = await fetchJson('/api/auth/me');
    } catch (_) {
      me = {};
    }

    const max = isMaxPlan(me);
    $('vault-gate').hidden = max;
    $('vault-app').hidden = !max;

    if (!max) return;

    state.smartDefaults = readSmartDefaultsPref();
    if (state.smartDefaults) {
      applySmartDefaults();
    }

    if (window.innerWidth < CARD_BREAKPOINT) {
      state.viewMode = 'cards';
    } else if (!state.viewModeManual) {
      state.viewMode = 'table';
    }

    bindEvents();
    syncFilterControls();

    try {
      showSkeleton();
      await loadBootstrap();
    } catch (err) {
      const meta = $('vault-results-meta');
      if (meta) meta.textContent = err.message || 'Could not load catalog';
      showToast(err.message || 'Could not load catalog');
    } finally {
      hideSkeleton();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
