(function () {
  'use strict';

  const SMART_DEFAULTS_KEY = 'vaultSmartDefaults';
  const CARD_BREAKPOINT = 641;
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
    viewMode: 'table',
    viewModeManual: false,
    selected: new Set(),
    meta: null,
    byTypeFiltered: null,
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
    toastTimer: null
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

  function isMaxPlan(me) {
    if (!me) return false;
    if (me.plan === 'max' || me.username === 'admin' || me.username === 'brad') return true;
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    return false;
  }

  function leadTypeLabel(type) {
    const key = String(type || '').toLowerCase().replace(/\s+/g, '_');
    if (key === 'distressed') return "Distressed CV's";
    if (key === 'well_maintained' || key === 'wellmaintained') return "CV's";
    if (key === 'land') return "Land CV's";
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
    if (state.state) params.set('state', state.state);
    if (state.city) params.set('city', state.city);
    if (state.q) params.set('q', state.q);
    if (state.minScore > 0) params.set('minScore', String(state.minScore));
    if (state.since) params.set('since', state.since);
    if (state.favoritesOnly) params.set('favoritesOnly', '1');
    if (state.hasPhone) params.set('hasPhone', '1');
    if (state.hasImagery) params.set('hasImagery', '1');
    params.set('page', String(state.page));
    params.set('sort', state.sort);
    params.set('sortDir', state.sortDir);
    state.signals.forEach((s) => params.append('signal', s));
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
      sort: state.sort,
      sortDir: state.sortDir
    };
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
    state.sort = snapshot.sort || 'priorityScore';
    state.sortDir = snapshot.sortDir || 'desc';
    state.page = 1;
    syncFilterControls();
    syncTypeTabs();
    renderSignalChips();
    populateGeoSelects();
    loadLeads();
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
    const activeKey = state.leadType && state.leadType !== 'all' ? state.leadType : 'all';

    document.querySelectorAll('.vault-tab-count').forEach((el) => {
      const key = el.dataset.countFor;
      if (!key) {
        el.textContent = '';
        return;
      }

      let count = null;
      // Active tab must match the leads list total exactly
      if (key === activeKey && state.total != null) {
        count = state.total;
      } else if (filtered && filtered[key] != null) {
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
    const presets = state.overlays.presets || [];
    sel.innerHTML = '<option value="">Load preset…</option>' + presets.map((p, i) =>
      `<option value="${i}">${esc(p.name || `Preset ${i + 1}`)}</option>`
    ).join('');
  }

  async function loadBootstrap() {
    const data = await fetchJson(`/api/leads/bootstrap?${buildQuery()}`);
    state.meta = data.meta;
    state.byTypeFiltered = data.byTypeFiltered || null;
    state.sync = data.sync || null;
    state.overlays = data.overlays || { favorites: [], notes: {}, presets: [], dispositions: {} };
    if (!state.overlays.dispositions) state.overlays.dispositions = {};
    state.leads = data.leads || [];
    state.total = data.total || 0;
    state.totalPages = data.totalPages || 1;
    state.page = data.page || 1;
    renderKpis();
    renderSyncStatus();
    renderTypeTabCounts();
    populateGeoSelects();
    renderSignalChips();
    renderPresetSelect();
    renderResults();
    renderPagination();
    renderResultsMeta();
    hideSkeleton();
  }

  function renderKpis() {
    /* no-op — KPI strip removed from desk redesign */
  }

  function showSkeleton() {
    const sk = $('vault-skeleton');
    const table = $('vault-table');
    const cards = $('vault-cards');
    if (!sk) return;
    sk.hidden = false;
    if (table) table.hidden = true;
    if (cards) cards.hidden = true;
    sk.innerHTML = Array.from({ length: 8 }, () =>
      '<div class="vault-skeleton-row"></div>'
    ).join('');
  }

  function hideSkeleton() {
    const sk = $('vault-skeleton');
    if (sk) sk.hidden = true;
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
      if (data.byTypeFiltered) state.byTypeFiltered = data.byTypeFiltered;
      renderTypeTabCounts();
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
    const states = [...(state.meta.states || [])].sort(byName);
    const hasState = !!state.state;
    // City is only pickable after a state is chosen — clear orphan city values
    if (!hasState) state.city = '';
    const cities = hasState
      ? [...(state.meta.citiesByState?.[state.state] || [])].sort(byName)
      : [];
    const prevState = state.state;
    const prevCity = state.city;
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
    if (!body) return;

    if (!state.leads.length) {
      body.innerHTML = '';
      if (empty) empty.hidden = false;
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
        const phone = (row.phones && row.phones[0]) || '';
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
          <td class="vault-col-phone">${formatPhone(phone)}</td>
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
    const phone = (row.phones && row.phones[0]) || '';
    const checked = state.selected.has(row.leadId) ? ' checked' : '';
    const scoreCls = scoreHeatClass(row.priorityScore);
    return `<article class="vault-card${row.favorite ? ' vault-card--fav' : ''}" data-lead-id="${esc(row.leadId)}" tabindex="0">
      <div class="vault-card-media">${thumbHtml(row.thumbUrl, row)}</div>
      <div class="vault-card-body">
        <label class="vault-card-check" data-no-open="1"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}" aria-label="Select ${esc(row.address)} lead"${checked}></label>
        <h3 class="vault-card-address">${esc(row.address)}</h3>
        <p class="vault-card-meta">${esc(row.city)}, ${esc(row.state)} · <span class="vault-score${scoreCls}">${esc(row.priorityScore)}</span></p>
        <p class="vault-card-signal${hotSignalClass(signal)}">${esc(signal)}</p>
        ${phone ? `<p class="vault-card-phone">${formatPhone(phone)}</p>` : ''}
      </div>
    </article>`;
  }

  function renderResults() {
    renderTable();
  }

  function renderResultsMeta() {
    const el = $('vault-results-meta');
    if (!el) return;
    const shown = state.leads.length;
    const start = state.total ? (state.page - 1) * 50 + 1 : 0;
    const end = state.total ? Math.min((state.page - 1) * 50 + shown, state.total) : 0;
    if (state.viewMode === 'cards' && state.page > 1) {
      el.textContent = state.total
        ? `Showing ${shown.toLocaleString()} of ${state.total.toLocaleString()} leads (scroll for more)`
        : 'No leads in catalog yet';
      return;
    }
    el.textContent = state.total
      ? `Showing ${start}–${end} of ${state.total.toLocaleString()} leads`
      : 'No leads in catalog yet';
  }

  function renderPagination() {
    const nav = $('vault-pagination');
    if (!nav) return;
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
    if (state.selected.size > 0) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.disabled = state.leads.length === 0;
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
    // Phone: always cards (thumb-first). Manual toggle only applies ≥641px.
    if (narrow) {
      if (state.viewMode === 'cards') return;
      state.viewMode = 'cards';
      state.page = 1;
      state.leads = [];
      updateViewToggle();
      loadLeads();
      return;
    }
    if (state.viewModeManual) return;
    const want = 'table';
    if (state.viewMode === want) return;
    state.viewMode = want;
    state.page = 1;
    state.leads = [];
    updateViewToggle();
    loadLeads();
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
    return `<div class="vault-action-strip">
      <a href="${esc(mapsUrl(l))}" class="phuglee-btn phuglee-btn-secondary" target="_blank" rel="noopener noreferrer">Maps</a>
      <a href="${esc(analyzeUrl(l))}" class="phuglee-btn phuglee-btn-ghost" target="_blank" rel="noopener noreferrer">Analyze</a>
      <button type="button" id="vault-copy-addr" class="phuglee-btn phuglee-btn-ghost">Copy address</button>
      <button type="button" id="vault-fav-btn" class="phuglee-btn phuglee-btn-ghost" data-fav="${favorite ? '1' : '0'}">${favorite ? '★ Saved' : '☆ Favorite'}</button>
      ${adminBtn}
    </div>`;
  }

  function stripSectionShell(html) {
    return String(html || '')
      .replace(/<section class="vault-dossier-section">/g, '<div class="vault-panel-block">')
      .replace(/<\/section>/g, '</div>')
      .replace(/<h3>[^<]*<\/h3>/g, '');
  }

  function buildDrawerSections(l, data) {
    const dealBody = [renderDealMath(l), renderOfferBand(l)].filter(Boolean).join('');
    const distressBody = [renderDistressSection(l), renderCodeViolationSection(l)].filter(Boolean).join('');
    const propertyBody = renderPropertySection(l);
    const mortgageBody = renderMortgageTaxSection(l);
    const compsBody = renderComps(l.comps);
    const notesBody = `
      <div class="vault-panel-block">
        ${renderDispositionChips(data.disposition || '')}
        <textarea id="vault-note-input" class="phuglee-textarea" rows="4" placeholder="Your notes…">${esc(data.note || '')}</textarea>
        <button type="button" id="vault-save-note" class="phuglee-btn phuglee-btn-secondary">Save note</button>
      </div>`;

    const sections = [
      { id: 'owner', label: 'Owner', html: renderDialBrief(l) },
      { id: 'deal', label: 'Deal', html: stripSectionShell(dealBody) },
      { id: 'distress', label: 'Distress', html: stripSectionShell(distressBody) },
      { id: 'property', label: 'Property', html: stripSectionShell(propertyBody) },
      { id: 'mortgage', label: 'Mortgage', html: stripSectionShell(mortgageBody) },
      { id: 'comps', label: 'Comps', html: stripSectionShell(compsBody) },
      { id: 'notes', label: 'Notes', html: notesBody }
    ].filter((s) => String(s.html || '').trim());

    if (!sections.length) {
      sections.push({ id: 'owner', label: 'Owner', html: '<p class="vault-drawer-loading">No details for this lead yet.</p>' });
    }

    const activeId = sections.some((s) => s.id === state.drawerSection)
      ? state.drawerSection
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

  function renderDialBrief(l) {
    const phoneRaw = (l.phones && l.phones[0]) || '';
    const entity = entityTypeLabel(l.entityType);
    const ownerLine = [l.ownerName || 'Owner unknown', entity].filter(Boolean).join(' · ');
    const signals = (l.signalTags || []).slice(0, 6).map((t) =>
      `<span class="vault-signal-chip is-active">${esc(t)}</span>`
    ).join(' ');
    return `<div class="vault-dial-brief">
      <p class="vault-dial-owner"><strong>${esc(ownerLine)}</strong></p>
      <p class="vault-dial-phone-row">${formatPhone(phoneRaw, true)}</p>
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
    if (!Array.isArray(comps) || !comps.length) return '';
    const rows = comps.slice(0, 5).map((c) =>
      `<tr>
        <td>${esc(c.address || '—')}</td>
        <td>${c.price != null ? '$' + Number(c.price).toLocaleString() : '—'}</td>
        <td>${esc(c.soldDate || '—')}</td>
      </tr>`
    ).join('');
    return `<section class="vault-dossier-section">
      <h3>Comps</h3>
      <table class="vault-comps-table">
        <thead><tr><th>Address</th><th>Price</th><th>Sold</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
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
    if (switchingLead) state.drawerSection = 'owner';
    drawer.hidden = false;
    body.innerHTML = '<p class="vault-drawer-loading">Loading…</p>';
    updateDrawerNav();

    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = data.lead;
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

    $('vault-copy-addr')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullAddress(l));
        showToast('Address copied');
      } catch (_) {
        showToast('Could not copy address');
      }
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

  async function exportSelected(ids) {
    const list = ids || [...state.selected];
    if (!list.length) return;
    const data = await fetchJson('/api/leads/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: list })
    });
    const blob = new Blob([data.csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.filename || 'vault-export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`Exported ${data.count || list.length} leads`);
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
      loadLeads();
    });

    $('vault-search')?.addEventListener('input', (e) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.q = e.target.value.trim();
        state.page = 1;
        state.leads = [];
        loadLeads();
      }, 300);
    });

    $('vault-state')?.addEventListener('change', (e) => {
      state.state = e.target.value;
      state.city = '';
      state.page = 1;
      state.leads = [];
      populateGeoSelects();
      loadLeads();
    });

    $('vault-city')?.addEventListener('change', (e) => {
      state.city = e.target.value;
      state.page = 1;
      state.leads = [];
      loadLeads();
    });

    $('vault-since')?.addEventListener('change', (e) => {
      state.since = e.target.value;
      state.page = 1;
      state.leads = [];
      loadLeads();
    });

    ['vault-favorites-only', 'vault-has-phone', 'vault-has-photo'].forEach((id) => {
      $(id)?.addEventListener('change', (e) => {
        if (id === 'vault-favorites-only') state.favoritesOnly = e.target.checked;
        else if (id === 'vault-has-phone') state.hasPhone = e.target.checked;
        else state.hasImagery = e.target.checked;
        state.page = 1;
        state.leads = [];
        loadLeads();
      });
    });

    $('vault-smart-defaults')?.addEventListener('change', (e) => {
      state.smartDefaults = e.target.checked;
      writeSmartDefaultsPref(state.smartDefaults);
      if (state.smartDefaults) {
        applySmartDefaults();
        state.page = 1;
        state.leads = [];
        loadLeads();
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
        loadLeads();
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
      loadLeads();
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
      state.leadType = 'all';
      state.page = 1;
      state.leads = [];
      if ($('vault-smart-defaults')) $('vault-smart-defaults').checked = false;
      syncFilterControls();
      syncTypeTabs();
      renderSignalChips();
      populateGeoSelects();
      loadLeads();
    });

    $('vault-presets')?.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx === '') return;
      const preset = state.overlays.presets[Number(idx)];
      if (preset?.filters) applyFilterSnapshot(preset.filters);
      e.target.value = '';
    });

    $('vault-save-preset')?.addEventListener('click', async () => {
      const input = $('vault-preset-name');
      const name = (input?.value || '').trim();
      if (!name) {
        showToast('Enter a preset name');
        input?.focus();
        return;
      }
      try {
        const presets = [...(state.overlays.presets || [])];
        presets.push({ name, filters: currentFilterSnapshot() });
        const data = await fetchJson('/api/leads/user/presets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presets })
        });
        state.overlays.presets = data.presets || presets;
        renderPresetSelect();
        if (input) input.value = '';
        showToast('Preset saved');
      } catch (err) {
        showToast(err.message || 'Could not save preset');
      }
    });

    document.querySelector('.vault-view-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.vault-view-btn');
      if (!btn) return;
      state.viewModeManual = true;
      state.viewMode = btn.dataset.view || 'table';
      state.page = 1;
      state.leads = [];
      loadLeads();
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
      loadLeads();
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
        loadLeads();
      });
    });

    $('vault-export-btn')?.addEventListener('click', () => {
      exportSelected([...state.selected]).catch((err) => showToast(err.message || 'Export failed'));
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
        await loadLeads();
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
      if (e.key === 'Escape') {
        if (lightboxOpen) closeLightbox();
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
