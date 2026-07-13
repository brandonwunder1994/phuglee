(function () {
  'use strict';

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
    viewMode: 'table',
    selected: new Set(),
    meta: null,
    sync: null,
    overlays: { favorites: [], notes: {}, presets: [] },
    leads: [],
    total: 0,
    totalPages: 1,
    activeLeadId: null,
    drawerImageMode: 'street',
    loading: false,
    loadingMore: false,
    searchTimer: null
  };

  const $ = (id) => document.getElementById(id);

  function esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return '—';
    const digits = p.replace(/\D/g, '');
    if (digits.length >= 10) {
      return `<a href="tel:${esc(digits)}" class="vault-phone-link">${esc(p)}</a>`;
    }
    return esc(p);
  }

  function isMaxPlan(me) {
    return me && (me.plan === 'max' || me.username === 'admin');
  }

  function leadTypeLabel(type) {
    return String(type || '').replace(/_/g, ' ');
  }

  function hotSignalClass(signal) {
    const hot = ['pre-foreclosure', 'vacant', 'water shut-off', 'tax delinquent'];
    return hot.includes(String(signal || '').toLowerCase()) ? ' vault-signal--hot' : '';
  }

  function tierClass(tier) {
    const n = Number(tier);
    if (!Number.isFinite(n)) return '';
    if (n >= 8) return ' vault-tier--high';
    if (n >= 5) return ' vault-tier--mid';
    return ' vault-tier--low';
  }

  function thumbHtml(url, alt) {
    if (!url) {
      return '<span class="vault-thumb vault-thumb--empty" aria-hidden="true"></span>';
    }
    return `<img class="vault-thumb" src="${esc(url)}" alt="${esc(alt || 'Property')}" loading="lazy" decoding="async">`;
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
    if (mode === 'satellite' && lead.satelliteUrl) return lead.satelliteUrl;
    return lead.streetViewUrl || (lead.photos && lead.photos[0]) || lead.satelliteUrl || '';
  }

  function formatSyncAge(ts) {
    if (!ts) return '';
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
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

  function syncFilterControls() {
    if ($('vault-search')) $('vault-search').value = state.q;
    if ($('vault-state')) $('vault-state').value = state.state;
    if ($('vault-city')) $('vault-city').value = state.city;
    if ($('vault-since')) $('vault-since').value = state.since;
    if ($('vault-min-score')) $('vault-min-score').value = String(state.minScore);
    if ($('vault-min-score-val')) $('vault-min-score-val').textContent = String(state.minScore);
    if ($('vault-favorites-only')) $('vault-favorites-only').checked = state.favoritesOnly;
    if ($('vault-has-phone')) $('vault-has-phone').checked = state.hasPhone;
  }

  async function loadOverlays() {
    const data = await fetchJson('/api/leads/user/overlays');
    state.overlays = data.overlays || { favorites: [], notes: {}, presets: [] };
    renderPresetSelect();
  }

  async function loadMeta() {
    const data = await fetchJson('/api/leads/meta');
    state.meta = data.meta;
    state.sync = data.sync || null;
    renderKpis();
    renderSyncStatus();
    populateGeoSelects();
    renderSignalChips();
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
    const el = $('vault-sync-status');
    if (!el) return;
    const m = state.meta;
    const s = state.sync;
    if (!m) {
      el.hidden = true;
      return;
    }
    const parts = [`${m.total.toLocaleString()} leads`];
    if (s && s.lastSyncAt) {
      parts.push(`synced ${formatSyncAge(s.lastSyncAt)}`);
    }
    el.textContent = parts.join(' · ');
    el.hidden = false;
  }

  function renderKpis() {
    const el = $('vault-kpis');
    if (!el || !state.meta) return;
    const m = state.meta;
    const items = [
      ['Total', m.total],
      ['This week', m.freshThisWeek || 0],
      ['Distressed', m.byType?.distressed || 0],
      ['Well maintained', m.byType?.well_maintained || 0],
      ['Land', m.byType?.land || 0],
      ['With phone', m.withPhone || 0],
      ['With photo', m.withImagery || 0]
    ];
    el.innerHTML = items.map(([label, val]) =>
      `<div class="vault-kpi"><span class="vault-kpi-val">${Number(val).toLocaleString()}</span><span class="vault-kpi-label">${esc(label)}</span></div>`
    ).join('');
  }

  function populateGeoSelects() {
    const stateSel = $('vault-state');
    const citySel = $('vault-city');
    if (!stateSel || !citySel || !state.meta) return;
    const states = state.meta.states || [];
    const cities = state.state && state.meta.citiesByState?.[state.state]
      ? state.meta.citiesByState[state.state]
      : (state.meta.cities || []);
    const prevState = state.state;
    const prevCity = state.city;
    stateSel.innerHTML = '<option value="">All states</option>' + states.map((s) =>
      `<option value="${esc(s.name)}"${s.name === prevState ? ' selected' : ''}>${esc(s.name)} (${s.count})</option>`
    ).join('');
    citySel.innerHTML = '<option value="">All cities</option>' + cities.map((c) =>
      `<option value="${esc(c.name)}"${c.name === prevCity ? ' selected' : ''}>${esc(c.name)} (${c.count})</option>`
    ).join('');
  }

  function signalOptions() {
    const fromMeta = (state.meta?.signals || []).map((s) => s.name).filter(Boolean);
    if (fromMeta.length) return fromMeta.slice(0, 24);
    return [
      'Pre-foreclosure', 'Tax delinquent', 'Vacant', 'Code violation',
      'Water shut-off', 'Probate / estate', 'Absentee owner', 'High equity'
    ];
  }

  function renderSignalChips() {
    const wrap = $('vault-signal-chips');
    if (!wrap) return;
    wrap.innerHTML = signalOptions().map((label) => {
      const active = state.signals.includes(label);
      return `<button type="button" class="vault-signal-chip${active ? ' is-active' : ''}" data-signal="${esc(label)}" aria-pressed="${active}">${esc(label)}</button>`;
    }).join('');
  }

  function renderPresetSelect() {
    const sel = $('vault-presets');
    if (!sel) return;
    const presets = state.overlays.presets || [];
    sel.innerHTML = '<option value="">Load preset…</option>' + presets.map((p, i) =>
      `<option value="${i}">${esc(p.name || `Preset ${i + 1}`)}</option>`
    ).join('');
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
      $('vault-export-btn').disabled = true;
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
        const signal = row.topSignal || (row.signalTags && row.signalTags[0]) || '—';
        const phone = (row.phones && row.phones[0]) || '—';
        const checked = state.selected.has(row.leadId) ? ' checked' : '';
        const fav = row.favorite ? ' vault-row--fav' : '';
        const tier = row.distressTier != null
          ? `<span class="vault-tier${tierClass(row.distressTier)}">${esc(row.distressTier)}</span>`
          : '';
        return `<tr class="vault-row${fav}" data-lead-id="${esc(row.leadId)}" tabindex="0">
          <td class="vault-col-check" data-no-open="1"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}" aria-label="Select lead"${checked}></td>
          <td class="vault-col-thumb">${thumbHtml(row.thumbUrl, row.address)}</td>
          <td>${esc(row.address)}</td>
          <td>${esc(row.city)}, ${esc(row.state)}</td>
          <td><span class="vault-signal${hotSignalClass(signal)}">${esc(signal)}</span></td>
          <td><span class="vault-score">${esc(row.priorityScore)}</span>${tier}</td>
          <td class="vault-col-owner">${esc(row.ownerName || '—')}</td>
          <td class="vault-col-phone">${formatPhone(phone)}</td>
        </tr>`;
      }).join('');
    }

    document.querySelectorAll('.vault-sort-btn').forEach((btn) => {
      btn.classList.toggle('is-sorted', btn.dataset.sort === state.sort);
    });
    updateExportButton();
    updateBulkBar();
    updateViewToggle();
  }

  function renderCard(row) {
    const signal = row.topSignal || (row.signalTags && row.signalTags[0]) || '—';
    const phone = (row.phones && row.phones[0]) || '';
    const checked = state.selected.has(row.leadId) ? ' checked' : '';
    return `<article class="vault-card${row.favorite ? ' vault-card--fav' : ''}" data-lead-id="${esc(row.leadId)}" tabindex="0">
      <div class="vault-card-media">${thumbHtml(row.thumbUrl, row.address)}</div>
      <div class="vault-card-body">
        <label class="vault-card-check" data-no-open="1"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}"${checked}></label>
        <h3 class="vault-card-address">${esc(row.address)}</h3>
        <p class="vault-card-meta">${esc(row.city)}, ${esc(row.state)} · <span class="vault-score">${esc(row.priorityScore)}</span></p>
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
    if (btn) btn.disabled = state.selected.size === 0;
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
    if (!url) {
      return `<div class="vault-hero-media vault-hero-media--empty">
        <p>No property imagery yet</p>
        <span class="vault-hero-hint">Scan in Analyze to add Street View or satellite</span>
      </div>`;
    }
    return `<div class="vault-hero-media">
      ${toggle}
      <button type="button" class="vault-hero-img-btn" id="vault-hero-img" aria-label="Expand property photo">
        <img class="vault-hero-img" src="${esc(url)}" alt="${esc(l.address || 'Property')}" loading="eager" decoding="async">
      </button>
    </div>`;
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

  async function openDrawer(leadId) {
    const drawer = $('vault-drawer');
    const body = $('vault-drawer-body');
    const title = $('vault-drawer-title');
    if (!drawer || !body) return;
    state.activeLeadId = leadId;
    state.drawerImageMode = 'street';
    drawer.hidden = false;
    body.innerHTML = '<p class="vault-drawer-loading">Loading…</p>';
    updateDrawerNav();
    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = data.lead;
      title.textContent = l.address || 'Lead dossier';
      const signals = (l.signalTags || []).map((t) =>
        `<span class="vault-signal-chip is-active">${esc(t)}</span>`
      ).join(' ') || '—';
      const phones = (l.phones || []).map((p) => formatPhone(p)).join('<br>') || '—';
      const tierBadge = l.distressTier != null
        ? `<span class="vault-tier vault-tier--lg${tierClass(l.distressTier)}">Tier ${esc(l.distressTier)}</span>`
        : '';
      const phoneRaw = (l.phones && l.phones[0]) || '';
      body.innerHTML = `
        ${renderDrawerHero(l)}
        <div class="vault-dossier">
          <p class="vault-dossier-address">${esc(fullAddress(l))}</p>
          <div class="vault-dossier-score-row">
            <span class="vault-score vault-score--lg">${esc(l.priorityScore)}</span>
            ${tierBadge}
            <span class="vault-dossier-type">${esc(leadTypeLabel(l.leadType))}</span>
          </div>
          <div class="vault-dossier-actions vault-dossier-actions--top">
            ${phoneRaw ? `<a href="tel:${esc(phoneRaw.replace(/\D/g, ''))}" class="phuglee-btn phuglee-btn-primary vault-call-btn">Call</a>` : ''}
            <a href="${esc(mapsUrl(l))}" class="phuglee-btn phuglee-btn-secondary" target="_blank" rel="noopener noreferrer">Maps</a>
            <a href="${esc(analyzeUrl(l))}" class="phuglee-btn phuglee-btn-ghost" target="_blank" rel="noopener noreferrer">Analyze</a>
            <button type="button" id="vault-copy-addr" class="phuglee-btn phuglee-btn-ghost">Copy</button>
            <button type="button" id="vault-fav-btn" class="phuglee-btn phuglee-btn-ghost" data-fav="${data.favorite ? '1' : '0'}">${data.favorite ? '★ Saved' : '☆ Favorite'}</button>
          </div>
          <section class="vault-dossier-section">
            <h3>Signals</h3>
            <div class="vault-signal-chips">${signals}</div>
          </section>
          <section class="vault-dossier-section">
            <h3>Owner</h3>
            <p>${esc(l.ownerName || '—')}</p>
            <p>${phones}</p>
            ${l.email ? `<p>${esc(l.email)}</p>` : ''}
          </section>
          <section class="vault-dossier-section">
            <h3>Financials</h3>
            <dl class="vault-dl">
              <dt>Est. ARV</dt><dd>${l.estARV != null ? '$' + Number(l.estARV).toLocaleString() : '—'}</dd>
              <dt>Est. repairs</dt><dd>${l.estRepairs != null ? '$' + Number(l.estRepairs).toLocaleString() : '—'}</dd>
              <dt>Est. equity</dt><dd>${l.estEquity != null ? '$' + Number(l.estEquity).toLocaleString() : '—'}</dd>
            </dl>
          </section>
          ${renderComps(l.comps)}
          <section class="vault-dossier-section">
            <h3>Notes</h3>
            <textarea id="vault-note-input" class="phuglee-textarea" rows="3" placeholder="Your notes…">${esc(data.note || '')}</textarea>
            <button type="button" id="vault-save-note" class="phuglee-btn phuglee-btn-secondary">Save note</button>
          </section>
        </div>
      `;
      bindDrawerEvents(l, leadId);
      $('vault-drawer-close')?.focus();
    } catch (err) {
      body.innerHTML = `<p class="phuglee-error">${esc(err.message)}</p>`;
    }
  }

  function bindDrawerEvents(l, leadId) {
    $('vault-save-note')?.addEventListener('click', async () => {
      const note = $('vault-note-input')?.value || '';
      await fetchJson(`/api/leads/user/notes/${encodeURIComponent(leadId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
    });
    $('vault-fav-btn')?.addEventListener('click', async () => {
      const data2 = await fetchJson(`/api/leads/user/favorites/${encodeURIComponent(leadId)}`, { method: 'PUT' });
      const btn = $('vault-fav-btn');
      if (btn) {
        btn.textContent = data2.favorite ? '★ Saved' : '☆ Favorite';
        btn.dataset.fav = data2.favorite ? '1' : '0';
      }
      const row = state.leads.find((r) => r.leadId === leadId);
      if (row) row.favorite = data2.favorite;
      renderResults();
    });
    $('vault-copy-addr')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(fullAddress(l));
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
  }

  function updateDrawerNav() {
    const idx = activeLeadIndex();
    const prev = $('vault-drawer-prev');
    const next = $('vault-drawer-next');
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= state.leads.length - 1;
  }

  function closeDrawer() {
    const drawer = $('vault-drawer');
    if (drawer) drawer.hidden = true;
    state.activeLeadId = null;
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

    ['vault-favorites-only', 'vault-has-phone'].forEach((id) => {
      $(id)?.addEventListener('change', (e) => {
        if (id === 'vault-favorites-only') state.favoritesOnly = e.target.checked;
        else state.hasPhone = e.target.checked;
        state.page = 1;
        state.leads = [];
        loadLeads();
      });
    });

    $('vault-min-score')?.addEventListener('input', (e) => {
      state.minScore = Number(e.target.value) || 0;
      const val = $('vault-min-score-val');
      if (val) val.textContent = String(state.minScore);
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

    $('vault-clear-filters')?.addEventListener('click', () => {
      state.state = '';
      state.city = '';
      state.signals = [];
      state.minScore = 0;
      state.since = '';
      state.q = '';
      state.favoritesOnly = false;
      state.hasPhone = false;
      state.page = 1;
      state.leads = [];
      syncFilterControls();
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
      const name = window.prompt('Preset name');
      if (!name) return;
      const presets = [...(state.overlays.presets || [])];
      presets.push({ name: name.trim(), filters: currentFilterSnapshot() });
      const data = await fetchJson('/api/leads/user/presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets })
      });
      state.overlays.presets = data.presets || presets;
      renderPresetSelect();
    });

    document.querySelector('.vault-view-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.vault-view-btn');
      if (!btn) return;
      state.viewMode = btn.dataset.view || 'table';
      state.page = 1;
      state.leads = [];
      loadLeads();
    });

    function handleRowActivate(target, leadId) {
      if (target.closest('[data-no-open="1"]')) return;
      openDrawer(leadId);
    }

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

    $('vault-results-body')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const row = e.target.closest('.vault-row');
        if (row) openDrawer(row.dataset.leadId);
      }
    });

    $('vault-cards')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const card = e.target.closest('.vault-card');
        if (card) openDrawer(card.dataset.leadId);
      }
    });

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
      exportSelected().catch((err) => alert(err.message || 'Export failed'));
    });

    $('vault-bulk-export')?.addEventListener('click', () => {
      exportSelected().catch((err) => alert(err.message || 'Export failed'));
    });

    $('vault-bulk-fav')?.addEventListener('click', async () => {
      try {
        await fetchJson('/api/leads/user/favorites/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...state.selected], favorite: true })
        });
        await loadLeads();
      } catch (err) {
        alert(err.message || 'Could not favorite');
      }
    });

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

    bindEvents();
    try {
      await Promise.all([loadOverlays(), loadMeta()]);
      await loadLeads();
    } catch (err) {
      const meta = $('vault-results-meta');
      if (meta) meta.textContent = err.message || 'Could not load catalog';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
