(function () {
  'use strict';

  const TOAST_MS = 2200;
  const SEARCH_DELAY = 320;
  const PAGE_SIZE = 50;

  const state = {
    state: '',
    city: '',
    q: '',
    page: 1,
    sort: 'priorityScore',
    sortDir: 'desc',
    hasPhone: false,
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
    focusRestoreEl: null
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
    params.set('page', String(state.page));
    params.set('sort', state.sort);
    params.set('sortDir', state.sortDir);
    return params.toString();
  }

  function filtersAreActive() {
    return !!(state.state || state.city || state.q || state.hasPhone);
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
      return `<tr class="vault-row" data-lead-id="${esc(row.leadId)}" tabindex="0">
        <td class="vault-col-thumb">${thumbHtml(row)}</td>
        <td>${esc(row.address)}</td>
        <td>${esc(row.city || '—')}</td>
        <td><span class="vault-signal${hotSignalClass(signal)}">${esc(signal)}</span></td>
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

  function renderDrawerBody(l, note) {
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
        ${noteBlock}
      </div>
    `;
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
      if (title) title.textContent = l.address || 'Lot';
      const note = data.note || state.overlays?.notes?.[leadId] || '';
      body.innerHTML = renderDrawerBody(l, note);
      wireImageryFallbacks(body);
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
