(function () {
  'use strict';

  const TOAST_MS = 2200;
  const SEARCH_DELAY = 320;
  const PAGE_SIZE = 50;

  const CHECK_IDS = [
    'infill',
    'utilities',
    'pavedAccess',
    'cleared',
    'flat',
    'flood',
    'zoning'
  ];

  const CHECK_LABELS = {
    infill: 'Infill',
    utilities: 'Utilities',
    pavedAccess: 'Paved access',
    cleared: 'Cleared',
    flat: 'Flat',
    flood: 'Flood',
    zoning: 'Zoning'
  };

  const VERDICT_LABELS = {
    pending: 'Needs screen',
    keep: 'Keep',
    toss: 'Toss'
  };

  const DEFAULT_INVESTOR_GAP = 5000;
  const LAO_POCKETS = {
    sticks: { buy: 0.10, sell: 0.15, label: 'Sticks (10/15)' },
    suburbia: { buy: 0.15, sell: 0.20, label: 'Suburbia (15/20)' },
    prime: { buy: 0.20, sell: 0.25, label: 'Prime (20/25)' }
  };
  const LAO_COMP_ROWS = 3;

  const state = {
    state: '',
    city: '',
    q: '',
    page: 1,
    sort: 'priorityScore',
    sortDir: 'desc',
    hasPhone: false,
    landVerdict: 'all',
    meta: null,
    statesFiltered: null,
    citiesFiltered: null,
    overlays: { notes: {} },
    leads: [],
    total: 0,
    totalPages: 1,
    activeLeadId: null,
    loading: false,
    searchTimer: null,
    toastTimer: null,
    focusRestoreEl: null,
    laoLocked: false
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
    const el = $('land-vault-toast');
    if (!el) return;
    clearTimeout(state.toastTimer);
    el.textContent = msg;
    el.hidden = false;
    state.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, TOAST_MS);
  }

  function isMaxPlan(me) {
    if (!me) return false;
    if (me.plan === 'max' || me.username === 'admin' || me.username === 'brad' || me.username === 'matt') return true;
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    return false;
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
    params.set('surface', 'land');
    if (state.state) params.set('state', state.state);
    if (state.city) params.set('city', state.city);
    if (state.q) params.set('q', state.q);
    if (state.hasPhone) params.set('hasPhone', '1');
    if (state.landVerdict && state.landVerdict !== 'all') {
      params.set('landVerdict', state.landVerdict);
    }
    params.set('page', String(state.page));
    params.set('sort', state.sort);
    params.set('sortDir', state.sortDir);
    return params.toString();
  }

  function filtersAreActive() {
    return !!(state.state || state.city || state.q || state.hasPhone
      || (state.landVerdict && state.landVerdict !== 'all'));
  }

  function emptyChecks() {
    const checks = {};
    for (const id of CHECK_IDS) {
      checks[id] = { status: 'unknown', note: '' };
    }
    return checks;
  }

  function normalizeCheck(raw = {}) {
    const status = ['pass', 'fail', 'unknown'].includes(String(raw.status || '').toLowerCase())
      ? String(raw.status).toLowerCase()
      : 'unknown';
    return { status, note: String(raw.note || '').trim() };
  }

  function normalizeLandScreen(raw = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const checksIn = src.checks && typeof src.checks === 'object' ? src.checks : {};
    const checks = emptyChecks();
    for (const id of CHECK_IDS) {
      checks[id] = normalizeCheck(checksIn[id] || {});
    }
    const verdict = ['pending', 'keep', 'toss'].includes(String(src.verdict || '').toLowerCase())
      ? String(src.verdict).toLowerCase()
      : 'pending';
    return {
      demandBuilders: normalizeCheck(src.demandBuilders || {}),
      checks,
      verdict,
      verdictNote: String(src.verdictNote || '').trim(),
      recommendedVerdict: src.recommendedVerdict || null,
      screenedAt: src.screenedAt || null,
      screenedBy: src.screenedBy || null
    };
  }

  function laoMoney(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  }

  function laoNonNegMoney(v, fallback = null) {
    const n = laoMoney(v);
    if (n == null) return fallback;
    return Math.max(0, n);
  }

  function laoSumSiteCostParts(parts = {}) {
    const clearing = laoNonNegMoney(parts.clearing, 0) || 0;
    const demo = laoNonNegMoney(parts.demo, 0) || 0;
    const grade = laoNonNegMoney(parts.grade, 0) || 0;
    const other = laoNonNegMoney(parts.other, 0) || 0;
    return clearing + demo + grade + other;
  }

  function laoNormalizeSiteCostParts(raw = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      clearing: laoNonNegMoney(src.clearing, 0) || 0,
      demo: laoNonNegMoney(src.demo, 0) || 0,
      grade: laoNonNegMoney(src.grade, 0) || 0,
      other: laoNonNegMoney(src.other, 0) || 0
    };
  }

  function laoComputeSanityBands({ pocket, newBuildArv } = {}) {
    const key = String(pocket || '').toLowerCase();
    const factors = LAO_POCKETS[key] || null;
    const arv = laoMoney(newBuildArv);
    if (!factors || arv == null || arv <= 0) {
      return { pocket: factors ? key : null, newBuildArv: arv, buyBand: null, sellBand: null };
    }
    return {
      pocket: key,
      newBuildArv: arv,
      buyBand: Math.round(arv * factors.buy),
      sellBand: Math.round(arv * factors.sell)
    };
  }

  function laoSanityWarning(landFmv, sanity) {
    if (landFmv == null || !sanity || sanity.buyBand == null || sanity.sellBand == null) {
      return null;
    }
    if (landFmv > sanity.sellBand * 1.15) {
      return `FMV ($${landFmv.toLocaleString()}) is well above the ~${sanity.pocket} sell band ($${sanity.sellBand.toLocaleString()}). Walk if comps disagree.`;
    }
    if (landFmv < sanity.buyBand * 0.7) {
      return `FMV ($${landFmv.toLocaleString()}) is far below the ~${sanity.pocket} buy band ($${sanity.buyBand.toLocaleString()}). Double-check comps.`;
    }
    return null;
  }

  function laoComputeStack(input = {}) {
    const landFmv = laoMoney(input.landFmv);
    const parts = input.siteCostParts && typeof input.siteCostParts === 'object'
      ? laoNormalizeSiteCostParts(input.siteCostParts)
      : null;
    let siteCosts = laoMoney(input.siteCosts);
    if (parts) {
      const fromParts = laoSumSiteCostParts(parts);
      if (fromParts > 0 || siteCosts == null) siteCosts = fromParts;
    }
    if (siteCosts == null) siteCosts = 0;

    const investorGap = laoNonNegMoney(input.investorGap, DEFAULT_INVESTOR_GAP);
    const assignmentFee = laoNonNegMoney(input.assignmentFee, 0) || 0;

    let buyerCeiling = null;
    let contractTarget = null;
    let lao = laoMoney(input.lao);

    if (landFmv != null) {
      buyerCeiling = landFmv - siteCosts - investorGap;
      contractTarget = buyerCeiling - assignmentFee;
      if (lao == null) lao = contractTarget;
    }

    return {
      landFmv,
      siteCosts,
      siteCostParts: parts || laoNormalizeSiteCostParts({}),
      investorGap,
      assignmentFee,
      buyerCeiling,
      contractTarget,
      lao
    };
  }

  function formatLaoMoney(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return `$${n.toLocaleString()}`;
  }

  function formatLaoInput(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return String(n);
  }

  function recommendLandVerdict(screenInput = {}) {
    const screen = normalizeLandScreen(screenInput);
    if (screen.demandBuilders.status === 'fail') return 'toss';
    for (const id of CHECK_IDS) {
      if (screen.checks[id].status === 'fail') return 'toss';
    }
    if (screen.demandBuilders.status !== 'pass') return null;
    for (const id of CHECK_IDS) {
      if (screen.checks[id].status !== 'pass') return null;
    }
    return 'keep';
  }

  function verdictBadgeClass(verdict) {
    const v = String(verdict || 'pending').toLowerCase();
    if (v === 'keep') return ' land-vault-verdict--keep';
    if (v === 'toss') return ' land-vault-verdict--toss';
    return ' land-vault-verdict--pending';
  }

  function formatVerdictLabel(verdict) {
    const v = String(verdict || 'pending').toLowerCase();
    return VERDICT_LABELS[v] || v;
  }

  function statusSelectHtml(field, value) {
    const v = String(value || 'unknown').toLowerCase();
    const opts = ['unknown', 'pass', 'fail'].map((s) =>
      `<option value="${s}"${s === v ? ' selected' : ''}>${s}</option>`
    ).join('');
    return `<select class="phuglee-select land-vault-status-select" data-screen-field="${esc(field)}">${opts}</select>`;
  }

  function fundMatchesStale(lead = {}) {
    const matches = Array.isArray(lead.fundMatches) ? lead.fundMatches : [];
    if (!matches.length) return true;
    const screenedAt = lead.landScreen?.screenedAt;
    const matchedAt = lead.fundMatchedAt;
    if (screenedAt && matchedAt) {
      const s = Date.parse(screenedAt);
      const m = Date.parse(matchedAt);
      if (Number.isFinite(s) && Number.isFinite(m) && s > m) return true;
    }
    return false;
  }

  async function ensureFundMatches(leadId, lead) {
    if (!fundMatchesStale(lead)) {
      return Array.isArray(lead.fundMatches) ? lead.fundMatches : [];
    }
    const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/fund-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    return Array.isArray(data.fundMatches) ? data.fundMatches : [];
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
    const q = new URLSearchParams({ address: addr, size: '640x640', fast: '1' });
    return `/analyzer/api/sv-image?${q.toString()}`;
  }

  function leadPhotoUrl(lead) {
    return normalizeImageryUrl(
      lead.satelliteUrl
      || lead.thumbUrl
      || lead.streetViewUrl
      || (lead.photos && lead.photos[0])
      || ''
    );
  }

  function bindImgFallback(img, fallbackUrl) {
    if (!img || !fallbackUrl) return;
    img.addEventListener('error', () => {
      if (img.dataset.fallbackTried === '1') {
        img.classList.add('is-broken');
        img.removeAttribute('src');
        img.alt = 'Photo unavailable';
        return;
      }
      img.dataset.fallbackTried = '1';
      img.src = fallbackUrl;
    }, { once: false });
  }

  function thumbHtml(lead) {
    const alt = lead.address || 'Lot';
    let src = leadPhotoUrl(lead);
    const fallback = liveSvUrlForLead(lead);
    if (src.includes('/cached-imagery/') && fallback) {
      const addr = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
      if (addr) src = `${src}${src.includes('?') ? '&' : '?'}address=${encodeURIComponent(addr)}`;
    }
    if (!src && !fallback) {
      return '<span class="vault-thumb vault-thumb--empty" aria-hidden="true"></span>';
    }
    const initial = src || fallback;
    const dataFb = src && src !== initial
      ? ` data-fallback-src="${esc(src)}"`
      : (fallback && fallback !== initial ? ` data-fallback-src="${esc(fallback)}"` : '');
    return `<img class="vault-thumb" src="${esc(initial)}" alt="${esc(alt)}" loading="lazy" decoding="async"${dataFb}>`;
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
    if (large) {
      return `<div class="vault-dial-phones">${shown.map((p) =>
        `<p class="vault-dial-phone-row">${formatPhone(p, true)}</p>`
      ).join('')}${extra > 0 ? `<p class="vault-phone-more">+${extra} more on file</p>` : ''}</div>`;
    }
    const rows = shown.map((p) => formatPhone(p, large)).join('');
    return `<div class="vault-phone-stack">${rows}${
      extra > 0 ? `<span class="vault-phone-more">+${extra}</span>` : ''
    }</div>`;
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

  function primarySignal(row) {
    return row.topSignal || (row.signalTags && row.signalTags[0]) || '—';
  }

  function fullAddress(lead) {
    return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  }

  function syncFilterControls() {
    if ($('land-vault-search')) $('land-vault-search').value = state.q;
    if ($('land-vault-state')) $('land-vault-state').value = state.state;
    if ($('land-vault-city')) {
      $('land-vault-city').value = state.state ? state.city : '';
      $('land-vault-city').disabled = !state.state;
    }
    if ($('land-vault-has-phone')) $('land-vault-has-phone').checked = state.hasPhone;
    syncVerdictTabs();
  }

  function syncVerdictTabs() {
    document.querySelectorAll('#land-vault-verdict-tabs .vault-type-tab').forEach((tab) => {
      const active = (tab.dataset.verdict || 'all') === state.landVerdict;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function applyListFacets(data = {}) {
    state.statesFiltered = Array.isArray(data.statesFiltered) ? data.statesFiltered : null;
    state.citiesFiltered = Array.isArray(data.citiesFiltered) ? data.citiesFiltered : null;
    populateGeoSelects();
  }

  function populateGeoSelects() {
    const stateSel = $('land-vault-state');
    const citySel = $('land-vault-city');
    if (!stateSel || !citySel || !state.meta) return;

    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    const hasState = !!state.state;
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
    citySel.title = hasState ? '' : 'Select a state first';
  }

  function renderKpis() {
    const wrap = $('land-vault-kpis');
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
    const sk = $('land-vault-skeleton');
    const table = $('land-vault-table');
    if (!sk) return;
    sk.hidden = false;
    if (table) table.hidden = true;
    sk.innerHTML = Array.from({ length: 8 }, () => '<div class="vault-skeleton-row"></div>').join('');
  }

  function hideSkeleton() {
    const sk = $('land-vault-skeleton');
    if (sk) sk.hidden = true;
  }

  function renderResultsMeta() {
    const el = $('land-vault-results-meta');
    if (!el) return;
    const inventory = state.meta && state.meta.total != null ? Number(state.meta.total) : null;
    const shown = state.leads.length;
    const start = state.total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    const end = state.total ? Math.min((state.page - 1) * PAGE_SIZE + shown, state.total) : 0;
    const inventoryNote = filtersAreActive() && inventory != null && state.total !== inventory
      ? ` · matching ${state.total.toLocaleString()} of ${inventory.toLocaleString()} inventory`
      : '';
    el.textContent = state.total
      ? `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${state.total.toLocaleString()} lots${inventoryNote}`
      : (filtersAreActive() && inventory
        ? `No matches · ${inventory.toLocaleString()} in inventory`
        : 'No land lots in catalog yet');
  }

  function renderTable() {
    const body = $('land-vault-results-body');
    const empty = $('land-vault-empty');
    const table = $('land-vault-table');
    if (!body) return;

    if (!state.leads.length) {
      body.innerHTML = '';
      if (empty) empty.hidden = false;
      if (table) table.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (table) table.hidden = false;

    body.innerHTML = state.leads.map((row) => {
      const signal = primarySignal(row);
      const phoneHtml = formatPhoneStack(row.phones, {
        max: 2,
        totalCount: row.phoneCount != null ? row.phoneCount : (row.phones || []).length
      });
      const scoreCls = scoreHeatClass(row.priorityScore);
      const verdict = row.landVerdict || 'pending';
      const verdictCls = verdictBadgeClass(verdict);
      const fundName = row.topFundName ? String(row.topFundName) : '—';
      return `<tr class="vault-row" data-lead-id="${esc(row.leadId)}" tabindex="0">
        <td class="vault-col-thumb">${thumbHtml(row)}</td>
        <td>${esc(row.address)}</td>
        <td>${esc(row.city || '—')}</td>
        <td><span class="vault-signal${hotSignalClass(signal)}">${esc(signal)}</span></td>
        <td><span class="land-vault-verdict${verdictCls}">${esc(formatVerdictLabel(verdict))}</span></td>
        <td class="land-vault-col-fund">${esc(fundName)}</td>
        <td><span class="vault-score${scoreCls}">${esc(row.priorityScore)}</span></td>
        <td class="vault-col-owner">${esc(row.ownerName || '—')}</td>
        <td class="vault-col-phone">${phoneHtml}</td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#land-vault-table .vault-sort-btn').forEach((btn) => {
      const sorted = btn.dataset.sort === state.sort;
      btn.classList.toggle('is-sorted', sorted);
      btn.setAttribute('aria-sort', sorted
        ? (state.sortDir === 'asc' ? 'ascending' : 'descending')
        : 'none');
    });

    wireImageryFallbacks($('land-vault-results'));
  }

  function renderPagination() {
    const nav = $('land-vault-pagination');
    if (!nav) return;
    if (state.totalPages <= 1) {
      nav.innerHTML = '';
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

  function applyListPayload(data) {
    state.leads = data.leads || [];
    state.total = data.total || 0;
    state.totalPages = data.totalPages || 1;
    state.page = data.page || 1;
    applyListFacets(data);
    renderTable();
    renderPagination();
    renderResultsMeta();
  }

  async function loadBootstrap() {
    const data = await fetchJson(`/api/leads/bootstrap?${buildQuery()}`);
    state.meta = data.meta;
    state.overlays = data.overlays || { notes: {} };
    applyListPayload(data);
    renderKpis();
    hideSkeleton();
  }

  async function loadLeads() {
    state.loading = true;
    showSkeleton();
    try {
      const data = await fetchJson(`/api/leads?${buildQuery()}`);
      applyListPayload(data);
    } finally {
      state.loading = false;
      hideSkeleton();
    }
  }

  async function refreshList() {
    if (state.page === 1 && !state.leads.length) {
      await loadBootstrap();
      return;
    }
    await loadLeads();
  }

  function activeLeadIndex() {
    if (!state.activeLeadId) return -1;
    return state.leads.findIndex((r) => r.leadId === state.activeLeadId);
  }

  function updateDrawerNav() {
    const idx = activeLeadIndex();
    const prev = $('land-vault-drawer-prev');
    const next = $('land-vault-drawer-next');
    const pos = $('land-vault-drawer-pos');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= state.leads.length - 1;
    if (pos) {
      if (idx < 0 || ($('land-vault-drawer') && $('land-vault-drawer').hidden)) {
        pos.hidden = true;
      } else {
        pos.textContent = `${idx + 1} / ${state.leads.length}`;
        pos.hidden = false;
      }
    }
  }

  function renderFundMatchesSection(fundMatches) {
    const matches = Array.isArray(fundMatches) ? fundMatches : [];
    if (!matches.length) {
      return `<section class="vault-dossier-section land-vault-fund-section">
        <h3>Buyer shape</h3>
        <p class="vault-field-hint">No fund matches yet — run match after screening flood/utilities when known.</p>
      </section>`;
    }
    const chips = matches.map((m) => {
      const reasons = (m.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('');
      const gaps = (m.gaps || []).map((g) => `<li class="land-vault-gap">${esc(g)}</li>`).join('');
      const detail = (reasons || gaps)
        ? `<ul class="land-vault-fund-detail">${reasons}${gaps}</ul>`
        : '';
      return `<div class="land-vault-fund-chip">
        <div class="land-vault-fund-chip-head">
          <strong>${esc(m.fundName || m.fundId)}</strong>
          <span class="land-vault-fund-score">${esc(m.score)}</span>
        </div>
        ${m.oneLiner ? `<p class="land-vault-fund-oneliner">${esc(m.oneLiner)}</p>` : ''}
        ${detail}
      </div>`;
    }).join('');
    return `<section class="vault-dossier-section land-vault-fund-section">
      <h3>Buyer shape</h3>
      <div class="land-vault-fund-chips">${chips}</div>
    </section>`;
  }

  function renderScreenSection(landScreen) {
    const screen = normalizeLandScreen(landScreen);
    const recommended = recommendLandVerdict(screen);
    const recText = recommended === 'keep'
      ? 'Recommended: Keep — demand + all seven checks pass.'
      : (recommended === 'toss'
        ? 'Recommended: Toss — demand or a check failed.'
        : 'Recommended: Still needs screen — unknowns remain.');

    const demandRow = `<div class="land-vault-check-row">
      <span class="land-vault-check-label">Demand builders</span>
      ${statusSelectHtml('demandBuilders', screen.demandBuilders.status)}
      <input type="text" class="phuglee-input land-vault-check-note" data-screen-note="demandBuilders" placeholder="Note" value="${esc(screen.demandBuilders.note)}">
    </div>`;

    const checkRows = CHECK_IDS.map((id) =>
      `<div class="land-vault-check-row">
        <span class="land-vault-check-label">${esc(CHECK_LABELS[id] || id)}</span>
        ${statusSelectHtml(`checks.${id}`, screen.checks[id].status)}
        <input type="text" class="phuglee-input land-vault-check-note" data-screen-note="checks.${id}" placeholder="Note" value="${esc(screen.checks[id].note)}">
      </div>`
    ).join('');

    return `<section class="vault-dossier-section land-vault-screen-section">
      <h3>7-check screen</h3>
      <div class="land-vault-checks">
        ${demandRow}
        ${checkRows}
      </div>
      <p class="land-vault-recommended" data-land-recommended>${esc(recText)}</p>
      <label class="vault-field land-vault-verdict-note-field">
        <span class="vault-field-label">Verdict note</span>
        <textarea id="land-vault-verdict-note" class="phuglee-input land-vault-verdict-note" rows="3" placeholder="Required when keeping a failing lot…">${esc(screen.verdictNote)}</textarea>
      </label>
      <div class="land-vault-verdict-actions">
        <button type="button" class="phuglee-btn phuglee-btn-primary" data-verdict-action="keep">Keep</button>
        <button type="button" class="phuglee-btn phuglee-btn-ghost" data-verdict-action="toss">Toss</button>
      </div>
    </section>`;
  }

  function renderLaoCompRow(idx, comp = {}) {
    return `<div class="land-lao-comp-row" data-comp-idx="${idx}">
      <input type="text" class="phuglee-input land-lao-input land-lao-comp-field" data-lao-field="compsManual.${idx}.address" placeholder="Address" value="${esc(comp.address || '')}">
      <input type="number" class="phuglee-input land-lao-input land-lao-comp-field" data-lao-field="compsManual.${idx}.soldPrice" placeholder="Sold $" inputmode="numeric" value="${esc(formatLaoInput(comp.soldPrice))}">
      <input type="date" class="phuglee-input land-lao-input land-lao-comp-field" data-lao-field="compsManual.${idx}.soldDate" value="${esc(comp.soldDate || '')}">
      <input type="number" class="phuglee-input land-lao-input land-lao-comp-field" data-lao-field="compsManual.${idx}.acres" placeholder="Acres" step="any" value="${comp.acres != null && comp.acres !== '' ? esc(comp.acres) : ''}">
      <input type="text" class="phuglee-input land-lao-input land-lao-comp-field" data-lao-field="compsManual.${idx}.notes" placeholder="Notes" value="${esc(comp.notes || '')}">
    </div>`;
  }

  function renderLaoSection(landUnderwriting, landScreen) {
    const uw = landUnderwriting && typeof landUnderwriting === 'object' ? landUnderwriting : {};
    const parts = laoNormalizeSiteCostParts(uw.siteCostParts || {});
    const stack = laoComputeStack({
      landFmv: uw.landFmv,
      siteCostParts: parts,
      investorGap: uw.investorGap == null ? DEFAULT_INVESTOR_GAP : uw.investorGap,
      assignmentFee: uw.assignmentFee,
      lao: uw.lao
    });
    const sanityIn = uw.sanity && typeof uw.sanity === 'object' ? uw.sanity : {};
    const pocket = sanityIn.pocket || '';
    const newBuildArv = sanityIn.newBuildArv;
    const sanity = laoComputeSanityBands({ pocket, newBuildArv });
    const warning = laoSanityWarning(stack.landFmv, sanity);
    const comps = Array.isArray(uw.compsManual) ? uw.compsManual : [];
    const compRows = Array.from({ length: LAO_COMP_ROWS }, (_, i) =>
      renderLaoCompRow(i, comps[i] || {})
    ).join('');

    const pocketOpts = ['', 'sticks', 'suburbia', 'prime'].map((key) => {
      const label = key ? (LAO_POCKETS[key]?.label || key) : 'Pocket (optional)';
      const sel = key === pocket ? ' selected' : '';
      return `<option value="${key}"${sel}>${esc(label)}</option>`;
    }).join('');

    const clearedFail = normalizeLandScreen(landScreen).checks.cleared.status === 'fail';
    const clearingHint = clearedFail
      ? '<p class="land-lao-hint">Heavy trees often need ~$10K clearing — add under clearing.</p>'
      : '';

    return `<section class="vault-dossier-section land-lao-section" id="land-lao-section">
      <h3>LAO</h3>
      <p class="vault-field-hint land-lao-intro">Land offer math — no house ARV rules.</p>
      ${clearingHint}
      <div class="land-lao-grid">
        <label class="vault-field">
          <span class="vault-field-label">Land FMV ($)</span>
          <input type="number" class="phuglee-input land-lao-input" data-lao-field="landFmv" inputmode="numeric" value="${esc(formatLaoInput(stack.landFmv))}">
        </label>
        <div class="land-lao-site-costs">
          <span class="vault-field-label">Site costs</span>
          <div class="land-lao-site-parts">
            <label class="land-lao-part"><span>Clearing</span><input type="number" class="phuglee-input land-lao-input" data-lao-field="siteCostParts.clearing" inputmode="numeric" value="${esc(formatLaoInput(parts.clearing))}"></label>
            <label class="land-lao-part"><span>Demo</span><input type="number" class="phuglee-input land-lao-input" data-lao-field="siteCostParts.demo" inputmode="numeric" value="${esc(formatLaoInput(parts.demo))}"></label>
            <label class="land-lao-part"><span>Grade</span><input type="number" class="phuglee-input land-lao-input" data-lao-field="siteCostParts.grade" inputmode="numeric" value="${esc(formatLaoInput(parts.grade))}"></label>
            <label class="land-lao-part"><span>Other</span><input type="number" class="phuglee-input land-lao-input" data-lao-field="siteCostParts.other" inputmode="numeric" value="${esc(formatLaoInput(parts.other))}"></label>
          </div>
          <p class="land-lao-site-total">Site total: <strong data-lao-display="siteCosts">${formatLaoMoney(stack.siteCosts)}</strong></p>
        </div>
        <label class="vault-field">
          <span class="vault-field-label">Investor gap ($)</span>
          <input type="number" class="phuglee-input land-lao-input" data-lao-field="investorGap" inputmode="numeric" value="${esc(formatLaoInput(stack.investorGap))}">
        </label>
        <label class="vault-field">
          <span class="vault-field-label">Assignment fee ($)</span>
          <input type="number" class="phuglee-input land-lao-input" data-lao-field="assignmentFee" inputmode="numeric" value="${esc(formatLaoInput(stack.assignmentFee))}">
        </label>
        <div class="land-lao-derived">
          <div class="land-lao-derived-row"><span>Buyer ceiling</span><strong data-lao-display="buyerCeiling">${formatLaoMoney(stack.buyerCeiling)}</strong></div>
          <div class="land-lao-derived-row"><span>Contract target</span><strong data-lao-display="contractTarget">${formatLaoMoney(stack.contractTarget)}</strong></div>
        </div>
        <label class="vault-field">
          <span class="vault-field-label">LAO ($)</span>
          <input type="number" class="phuglee-input land-lao-input" data-lao-field="lao" id="land-lao-offer" inputmode="numeric" value="${esc(formatLaoInput(stack.lao))}">
        </label>
      </div>
      <div class="land-lao-sanity">
        <span class="vault-field-label">Sanity bands (optional)</span>
        <div class="land-lao-sanity-row">
          <select class="phuglee-select land-lao-input" data-lao-field="sanity.pocket">${pocketOpts}</select>
          <label class="land-lao-sanity-arv">
            <span class="sr-only">New-build ARV</span>
            <input type="number" class="phuglee-input land-lao-input" data-lao-field="sanity.newBuildArv" placeholder="New-build ARV ($)" inputmode="numeric" value="${esc(formatLaoInput(newBuildArv))}">
          </label>
        </div>
        <p class="land-lao-bands" data-lao-display="bands"${sanity.buyBand == null ? ' hidden' : ''}>
          Buy band: <strong data-lao-display="buyBand">${formatLaoMoney(sanity.buyBand)}</strong>
          · Sell band: <strong data-lao-display="sellBand">${formatLaoMoney(sanity.sellBand)}</strong>
        </p>
        <p class="land-lao-warning" data-lao-display="warning"${warning ? '' : ' hidden'}>${warning ? esc(warning) : ''}</p>
      </div>
      <details class="land-lao-comps-details">
        <summary class="land-lao-comps-summary">Manual comps (up to 3)</summary>
        <div class="land-lao-comps-head" aria-hidden="true">
          <span>Address</span><span>Sold $</span><span>Date</span><span>Acres</span><span>Notes</span>
        </div>
        ${compRows}
      </details>
      <p class="land-lao-formula" data-lao-display="formula">FMV − site − gap = ceiling − fee = target → LAO</p>
      <div class="land-lao-actions">
        <button type="button" class="phuglee-btn phuglee-btn-primary" data-action="save-lao">Save LAO</button>
      </div>
    </section>`;
  }

  function renderDrawerBody(l, note, landScreen, fundMatches, landUnderwriting) {
    const signals = Array.isArray(l.signalTags) ? l.signalTags : [];
    const signalHtml = signals.length
      ? `<ul class="land-vault-signal-list">${signals.map((s) =>
          `<li><span class="vault-signal${hotSignalClass(s)}">${esc(s)}</span></li>`
        ).join('')}</ul>`
      : '<p class="vault-field-hint">No signals on file</p>';

    const phoneHtml = formatPhoneStack(l.phones, { max: 6, large: true, totalCount: l.phoneCount });
    const photo = leadPhotoUrl(l) || liveSvUrlForLead(l);
    const hero = photo
      ? `<div class="vault-hero-media land-vault-drawer-hero">
          <img class="vault-hero-img" src="${esc(photo)}" alt="${esc(l.address || 'Lot')}" loading="eager" decoding="async" data-fallback-src="${esc(liveSvUrlForLead(l))}">
        </div>`
      : `<div class="vault-hero-media vault-hero-media--empty"><p>No lot imagery yet</p></div>`;

    const noteBlock = note
      ? `<section class="vault-dossier-section">
          <h3>Notes</h3>
          <p class="land-vault-note">${esc(note)}</p>
        </section>`
      : '';

    return `
      ${hero}
      <div class="vault-dossier land-vault-dossier">
        <section class="vault-dossier-section">
          <h3>Address</h3>
          <p class="land-vault-drawer-address">${esc(fullAddress(l))}</p>
          <p><a href="${esc(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(l))}`)}" class="vault-text-btn" target="_blank" rel="noopener noreferrer">Open in Maps</a></p>
        </section>
        <section class="vault-dossier-section">
          <h3>Owner</h3>
          <p>${esc(l.ownerName || '—')}</p>
        </section>
        <section class="vault-dossier-section">
          <h3>Phone</h3>
          ${phoneHtml}
        </section>
        <section class="vault-dossier-section">
          <h3>Signals</h3>
          ${signalHtml}
        </section>
        ${renderFundMatchesSection(fundMatches)}
        ${renderScreenSection(landScreen)}
        ${renderLaoSection(landUnderwriting, landScreen)}
        ${noteBlock}
      </div>
    `;
  }

  function getLaoFieldValue(body, field) {
    const el = body.querySelector(`[data-lao-field="${field}"]`);
    if (!el) return '';
    return el.value;
  }

  function collectLaoFromDrawer() {
    const body = $('land-vault-drawer-body');
    if (!body) return {};
    const parts = laoNormalizeSiteCostParts({
      clearing: getLaoFieldValue(body, 'siteCostParts.clearing'),
      demo: getLaoFieldValue(body, 'siteCostParts.demo'),
      grade: getLaoFieldValue(body, 'siteCostParts.grade'),
      other: getLaoFieldValue(body, 'siteCostParts.other')
    });
    const compsManual = [];
    for (let i = 0; i < LAO_COMP_ROWS; i++) {
      const address = String(getLaoFieldValue(body, `compsManual.${i}.address`) || '').trim();
      const soldPrice = laoMoney(getLaoFieldValue(body, `compsManual.${i}.soldPrice`));
      const soldDate = String(getLaoFieldValue(body, `compsManual.${i}.soldDate`) || '').trim();
      const acresRaw = getLaoFieldValue(body, `compsManual.${i}.acres`);
      const acres = acresRaw === '' ? null : Number(acresRaw);
      const notes = String(getLaoFieldValue(body, `compsManual.${i}.notes`) || '').trim();
      if (address || soldPrice != null) {
        compsManual.push({
          address,
          soldPrice,
          soldDate,
          acres: Number.isFinite(acres) ? acres : null,
          notes
        });
      }
    }
    const laoEl = body.querySelector('[data-lao-field="lao"]');
    const stack = laoComputeStack({
      landFmv: getLaoFieldValue(body, 'landFmv'),
      siteCostParts: parts,
      investorGap: getLaoFieldValue(body, 'investorGap'),
      assignmentFee: getLaoFieldValue(body, 'assignmentFee'),
      lao: laoEl ? laoEl.value : null
    });
    const sanity = laoComputeSanityBands({
      pocket: getLaoFieldValue(body, 'sanity.pocket'),
      newBuildArv: getLaoFieldValue(body, 'sanity.newBuildArv')
    });
    return {
      landFmv: stack.landFmv,
      siteCosts: stack.siteCosts,
      siteCostParts: stack.siteCostParts,
      investorGap: stack.investorGap,
      assignmentFee: stack.assignmentFee,
      buyerCeiling: stack.buyerCeiling,
      contractTarget: stack.contractTarget,
      lao: stack.lao,
      sanity,
      compsManual
    };
  }

  function recomputeLaoDisplay(opts = {}) {
    const body = $('land-vault-drawer-body');
    if (!body || !body.querySelector('#land-lao-section')) return;
    const fmvChanged = !!opts.fmvChanged;
    const laoTouched = !!opts.laoTouched;

    if (laoTouched) state.laoLocked = true;

    const collected = collectLaoFromDrawer();
    let laoVal = collected.lao;
    const laoEl = body.querySelector('[data-lao-field="lao"]');

    if (!state.laoLocked && (fmvChanged || !laoEl?.value?.trim())) {
      laoVal = collected.contractTarget;
      if (laoEl) laoEl.value = formatLaoInput(laoVal);
    } else if (laoEl) {
      laoVal = laoMoney(laoEl.value);
    }

    const stack = laoComputeStack({
      landFmv: collected.landFmv,
      siteCostParts: collected.siteCostParts,
      investorGap: collected.investorGap,
      assignmentFee: collected.assignmentFee,
      lao: laoVal
    });
    const warning = laoSanityWarning(stack.landFmv, collected.sanity);

    const setDisplay = (key, text) => {
      const el = body.querySelector(`[data-lao-display="${key}"]`);
      if (el) el.textContent = text;
    };

    setDisplay('siteCosts', formatLaoMoney(stack.siteCosts));
    setDisplay('buyerCeiling', formatLaoMoney(stack.buyerCeiling));
    setDisplay('contractTarget', formatLaoMoney(stack.contractTarget));

    const bandsEl = body.querySelector('[data-lao-display="bands"]');
    if (bandsEl) {
      const show = collected.sanity.buyBand != null;
      bandsEl.hidden = !show;
      if (show) {
        setDisplay('buyBand', formatLaoMoney(collected.sanity.buyBand));
        setDisplay('sellBand', formatLaoMoney(collected.sanity.sellBand));
      }
    }

    const warnEl = body.querySelector('[data-lao-display="warning"]');
    if (warnEl) {
      warnEl.hidden = !warning;
      warnEl.textContent = warning || '';
    }

    const formulaEl = body.querySelector('[data-lao-display="formula"]');
    if (formulaEl) {
      if (stack.landFmv != null) {
        formulaEl.textContent = `${formatLaoMoney(stack.landFmv)} − ${formatLaoMoney(stack.siteCosts)} − ${formatLaoMoney(stack.investorGap)} = ${formatLaoMoney(stack.buyerCeiling)} − ${formatLaoMoney(stack.assignmentFee)} = ${formatLaoMoney(stack.contractTarget)} → ${formatLaoMoney(stack.lao)}`;
      } else {
        formulaEl.textContent = 'FMV − site − gap = ceiling − fee = target → LAO';
      }
    }
  }

  async function saveLao() {
    const leadId = state.activeLeadId;
    if (!leadId) return;
    const btn = document.querySelector('[data-action="save-lao"]');
    if (btn) btn.disabled = true;
    try {
      const payload = collectLaoFromDrawer();
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/land-underwriting`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landUnderwriting: payload })
      });
      showToast('LAO saved');
      const note = state.overlays?.notes?.[leadId] || '';
      const detail = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = detail.lead || data.lead || {};
      const landScreen = normalizeLandScreen(l.landScreen || {});
      const fundMatches = await ensureFundMatches(leadId, l);
      const uw = data.landUnderwriting || l.landUnderwriting || payload;
      const stack = laoComputeStack({
        landFmv: uw.landFmv,
        siteCostParts: uw.siteCostParts,
        investorGap: uw.investorGap,
        assignmentFee: uw.assignmentFee,
        lao: uw.lao
      });
      state.laoLocked = uw.lao != null && stack.contractTarget != null && uw.lao !== stack.contractTarget;
      const body = $('land-vault-drawer-body');
      if (body) {
        body.innerHTML = renderDrawerBody(l, note, landScreen, fundMatches, uw);
        wireDrawerScreenEvents();
        wireImageryFallbacks(body);
        recomputeLaoDisplay();
      }
    } catch (err) {
      showToast(err.message || 'Could not save LAO');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function collectScreenFromDrawer() {
    const body = $('land-vault-drawer-body');
    if (!body) return normalizeLandScreen({});
    const screen = normalizeLandScreen({});
    body.querySelectorAll('.land-vault-status-select').forEach((sel) => {
      const field = sel.dataset.screenField || '';
      const val = { status: sel.value, note: '' };
      if (field === 'demandBuilders') {
        screen.demandBuilders = val;
      } else if (field.startsWith('checks.')) {
        const id = field.slice('checks.'.length);
        if (screen.checks[id]) screen.checks[id] = val;
      }
    });
    body.querySelectorAll('.land-vault-check-note').forEach((inp) => {
      const field = inp.dataset.screenNote || '';
      const note = (inp.value || '').trim();
      if (field === 'demandBuilders') {
        screen.demandBuilders.note = note;
      } else if (field.startsWith('checks.')) {
        const id = field.slice('checks.'.length);
        if (screen.checks[id]) screen.checks[id].note = note;
      }
    });
    const noteEl = $('land-vault-verdict-note');
    screen.verdictNote = noteEl ? String(noteEl.value || '').trim() : '';
    screen.recommendedVerdict = recommendLandVerdict(screen);
    return screen;
  }

  function updateRecommendedInDrawer() {
    const el = document.querySelector('[data-land-recommended]');
    if (!el) return;
    const screen = collectScreenFromDrawer();
    const recommended = recommendLandVerdict(screen);
    el.textContent = recommended === 'keep'
      ? 'Recommended: Keep — demand + all seven checks pass.'
      : (recommended === 'toss'
        ? 'Recommended: Toss — demand or a check failed.'
        : 'Recommended: Still needs screen — unknowns remain.');
  }

  function screenHasFail(screen) {
    if (screen.demandBuilders.status === 'fail') return true;
    return CHECK_IDS.some((id) => screen.checks[id].status === 'fail');
  }

  function verdictNoteRequired(screen, verdict) {
    if (verdict !== 'keep') return false;
    const recommended = recommendLandVerdict(screen);
    return recommended === 'toss' || screenHasFail(screen);
  }

  function patchLeadInList(lead) {
    if (!lead || !lead.leadId) return;
    const idx = state.leads.findIndex((r) => r.leadId === lead.leadId);
    if (idx < 0) return;
    const row = state.leads[idx];
    const screen = lead.landScreen || {};
    const top = Array.isArray(lead.fundMatches) && lead.fundMatches[0] ? lead.fundMatches[0] : null;
    state.leads[idx] = {
      ...row,
      priorityScore: lead.priorityScore != null ? lead.priorityScore : row.priorityScore,
      landVerdict: screen.verdict || row.landVerdict || 'pending',
      topFundName: top ? (top.fundName || top.fundId) : (row.topFundName || ''),
      fundMatchCount: Array.isArray(lead.fundMatches) ? lead.fundMatches.length : row.fundMatchCount
    };
    renderTable();
  }

  async function saveLandVerdict(verdict) {
    const leadId = state.activeLeadId;
    if (!leadId) return;
    const screen = collectScreenFromDrawer();
    screen.verdict = verdict;
    screen.recommendedVerdict = recommendLandVerdict(screen);
    if (verdictNoteRequired(screen, verdict) && !screen.verdictNote) {
      showToast('Verdict note required when keeping a failing lot');
      $('land-vault-verdict-note')?.focus();
      return;
    }
    const actions = document.querySelectorAll('[data-verdict-action]');
    actions.forEach((btn) => { btn.disabled = true; });
    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/land-screen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landScreen: screen })
      });
      const savedLead = data.lead || { leadId, landScreen: data.landScreen || screen };
      patchLeadInList(savedLead);
      showToast(verdict === 'keep' ? 'Marked Keep' : 'Marked Toss');
      const note = state.overlays?.notes?.[leadId] || '';
      const fundMatches = await ensureFundMatches(leadId, savedLead);
      const body = $('land-vault-drawer-body');
      if (body) {
        const detail = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
        const l = detail.lead || savedLead;
        body.innerHTML = renderDrawerBody(
          l,
          note,
          data.landScreen || savedLead.landScreen || screen,
          fundMatches,
          l.landUnderwriting || {}
        );
        wireDrawerScreenEvents();
        wireImageryFallbacks(body);
        recomputeLaoDisplay();
      }
      await refreshList();
    } catch (err) {
      showToast(err.message || 'Could not save screen');
    } finally {
      actions.forEach((btn) => { btn.disabled = false; });
    }
  }

  function wireDrawerScreenEvents() {
    const body = $('land-vault-drawer-body');
    if (!body) return;
    body.querySelectorAll('.land-vault-status-select, .land-vault-check-note').forEach((el) => {
      el.addEventListener('change', updateRecommendedInDrawer);
      el.addEventListener('input', updateRecommendedInDrawer);
    });
    body.querySelectorAll('[data-verdict-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const verdict = btn.dataset.verdictAction;
        if (verdict === 'keep' || verdict === 'toss') {
          saveLandVerdict(verdict).catch((err) => showToast(err.message || 'Save failed'));
        }
      });
    });
  }

  function closeDrawer() {
    const drawer = $('land-vault-drawer');
    if (drawer) drawer.hidden = true;
    state.activeLeadId = null;
    const pos = $('land-vault-drawer-pos');
    if (pos) pos.hidden = true;
    const restore = state.focusRestoreEl;
    state.focusRestoreEl = null;
    if (restore && typeof restore.focus === 'function') {
      try { restore.focus(); } catch (_) { /* ignore */ }
    }
    clearLeadQueryParam();
  }

  function clearLeadQueryParam() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('lead')) return;
      url.searchParams.delete('lead');
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
    } catch (_) { /* ignore */ }
  }

  function setLeadQueryParam(leadId) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lead', leadId);
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (_) { /* ignore */ }
  }

  async function openDrawer(leadId) {
    const drawer = $('land-vault-drawer');
    const body = $('land-vault-drawer-body');
    const title = $('land-vault-drawer-title');
    if (!drawer || !body) return;

    if (!state.activeLeadId) {
      state.focusRestoreEl = document.activeElement;
    }

    state.activeLeadId = leadId;
    state.laoLocked = false;
    drawer.hidden = false;
    body.innerHTML = '<p class="vault-drawer-loading">Loading…</p>';
    updateDrawerNav();
    setLeadQueryParam(leadId);

    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = data.lead;
      if (!l) throw new Error('Lead not found');
      if (l.leadType && l.leadType !== 'land') {
        window.location.replace(`/vault?lead=${encodeURIComponent(leadId)}`);
        return;
      }
      const landScreen = normalizeLandScreen(l.landScreen || {});
      const landUnderwriting = l.landUnderwriting || {};
      const stack = laoComputeStack({
        landFmv: landUnderwriting.landFmv,
        siteCostParts: landUnderwriting.siteCostParts,
        investorGap: landUnderwriting.investorGap,
        assignmentFee: landUnderwriting.assignmentFee,
        lao: landUnderwriting.lao
      });
      if (landUnderwriting.lao != null && stack.contractTarget != null
        && landUnderwriting.lao !== stack.contractTarget) {
        state.laoLocked = true;
      }
      const fundMatches = await ensureFundMatches(leadId, l);
      if (title) title.textContent = l.address || 'Lot';
      const note = data.note || state.overlays?.notes?.[leadId] || '';
      body.innerHTML = renderDrawerBody(l, note, landScreen, fundMatches, landUnderwriting);
      wireDrawerScreenEvents();
      wireImageryFallbacks(body);
      recomputeLaoDisplay();
      $('land-vault-drawer-close')?.focus();
    } catch (err) {
      body.innerHTML = `<p class="phuglee-error">${esc(err.message)}</p>`;
    }
  }

  function navigateDrawer(delta) {
    const idx = activeLeadIndex();
    if (idx < 0) return;
    const next = state.leads[idx + delta];
    if (next) openDrawer(next.leadId);
  }

  function handleRowActivate(target, leadId) {
    if (target.closest('[data-no-open="1"]')) return;
    openDrawer(leadId);
  }

  function handleRowKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.vault-row');
    if (!row) return;
    e.preventDefault();
    openDrawer(row.dataset.leadId);
  }

  function clearFilters() {
    state.state = '';
    state.city = '';
    state.q = '';
    state.hasPhone = false;
    state.landVerdict = 'all';
    state.page = 1;
    syncFilterControls();
    populateGeoSelects();
    refreshList().catch((err) => showToast(err.message || 'Could not refresh'));
  }

  function scheduleSearch() {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.page = 1;
      refreshList().catch((err) => showToast(err.message || 'Search failed'));
    }, SEARCH_DELAY);
  }

  function bindEvents() {
    $('land-vault-search')?.addEventListener('input', (e) => {
      state.q = (e.target.value || '').trim();
      scheduleSearch();
    });

    $('land-vault-state')?.addEventListener('change', (e) => {
      state.state = e.target.value || '';
      state.city = '';
      state.page = 1;
      syncFilterControls();
      populateGeoSelects();
      refreshList().catch((err) => showToast(err.message || 'Could not filter'));
    });

    $('land-vault-city')?.addEventListener('change', (e) => {
      state.city = e.target.value || '';
      state.page = 1;
      refreshList().catch((err) => showToast(err.message || 'Could not filter'));
    });

    $('land-vault-has-phone')?.addEventListener('change', (e) => {
      state.hasPhone = !!e.target.checked;
      state.page = 1;
      refreshList().catch((err) => showToast(err.message || 'Could not filter'));
    });

    $('land-vault-verdict-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.vault-type-tab[data-verdict]');
      if (!tab) return;
      const verdict = tab.dataset.verdict || 'all';
      if (state.landVerdict === verdict) return;
      state.landVerdict = verdict;
      state.page = 1;
      syncVerdictTabs();
      refreshList().catch((err) => showToast(err.message || 'Could not filter'));
    });

    $('land-vault-clear-filters')?.addEventListener('click', clearFilters);

    $('land-vault-results-body')?.addEventListener('click', (e) => {
      const row = e.target.closest('.vault-row');
      if (row) handleRowActivate(e.target, row.dataset.leadId);
    });

    $('land-vault-results-body')?.addEventListener('keydown', handleRowKeydown);

    $('land-vault-pagination')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.page) || 1;
      loadLeads().catch((err) => showToast(err.message || 'Could not load page'));
    });

    document.querySelectorAll('#land-vault-table .vault-sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sort = btn.dataset.sort;
        if (state.sort === sort) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sort = sort;
          state.sortDir = sort === 'address' || sort === 'city' ? 'asc' : 'desc';
        }
        state.page = 1;
        loadLeads().catch((err) => showToast(err.message || 'Could not sort'));
      });
    });

    $('land-vault-drawer-close')?.addEventListener('click', closeDrawer);
    $('land-vault-drawer-backdrop')?.addEventListener('click', closeDrawer);
    $('land-vault-drawer-prev')?.addEventListener('click', () => navigateDrawer(-1));
    $('land-vault-drawer-next')?.addEventListener('click', () => navigateDrawer(1));

    $('land-vault-drawer-body')?.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('[data-action="save-lao"]');
      if (saveBtn) {
        e.preventDefault();
        saveLao().catch((err) => showToast(err.message || 'Save failed'));
      }
    });

    $('land-vault-drawer-body')?.addEventListener('input', (e) => {
      const inp = e.target.closest('.land-lao-input');
      if (!inp) return;
      const field = inp.dataset.laoField || '';
      const fmvChanged = field === 'landFmv';
      const laoTouched = field === 'lao';
      recomputeLaoDisplay({ fmvChanged, laoTouched });
    });

    $('land-vault-drawer-body')?.addEventListener('change', (e) => {
      const inp = e.target.closest('.land-lao-input');
      if (!inp) return;
      const field = inp.dataset.laoField || '';
      recomputeLaoDisplay({
        fmvChanged: field === 'landFmv',
        laoTouched: field === 'lao'
      });
    });

    document.addEventListener('keydown', (e) => {
      const drawerOpen = $('land-vault-drawer') && !$('land-vault-drawer').hidden;
      if (e.key === 'Escape' && drawerOpen) {
        closeDrawer();
        return;
      }
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === '/' && !drawerOpen) {
        e.preventDefault();
        $('land-vault-search')?.focus();
      }
    });
  }

  function readLeadQueryParam() {
    try {
      return new URL(window.location.href).searchParams.get('lead') || '';
    } catch (_) {
      return '';
    }
  }

  async function init() {
    let me = {};
    try {
      me = await fetchJson('/api/auth/me');
    } catch (_) {
      me = {};
    }

    const max = isMaxPlan(me);
    $('land-vault-gate').hidden = max;
    $('land-vault-app').hidden = !max;
    if (!max) return;

    bindEvents();
    syncFilterControls();

    try {
      showSkeleton();
      await loadBootstrap();
    } catch (err) {
      const meta = $('land-vault-results-meta');
      if (meta) meta.textContent = err.message || 'Could not load catalog';
      showToast(err.message || 'Could not load catalog');
    } finally {
      hideSkeleton();
    }

    const deepLink = readLeadQueryParam();
    if (deepLink) {
      try {
        await openDrawer(deepLink);
      } catch (err) {
        showToast(err.message || 'Could not open lead');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
