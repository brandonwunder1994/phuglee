(function () {
  'use strict';

  const SIGNAL_OPTIONS = [
    'Pre-foreclosure',
    'Tax delinquent',
    'Vacant',
    'Code violation',
    'Water shut-off',
    'Probate / estate',
    'Absentee owner',
    'High equity',
    'Long ownership',
    'MLS expired'
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
    selected: new Set(),
    meta: null,
    leads: [],
    total: 0,
    totalPages: 1,
    activeLeadId: null,
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
    if (digits.length >= 10) return `<a href="tel:${esc(digits)}" class="vault-phone-link">${esc(p)}</a>`;
    return esc(p);
  }

  function isMaxPlan(me) {
    return me && (me.plan === 'max' || me.username === 'admin');
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
    params.set('page', String(state.page));
    params.set('sort', state.sort);
    params.set('sortDir', state.sortDir);
    state.signals.forEach((s) => params.append('signal', s));
    return params.toString();
  }

  async function loadMeta() {
    const data = await fetchJson('/api/leads/meta');
    state.meta = data.meta;
    renderKpis();
    populateGeoSelects();
    renderSignalChips();
  }

  async function loadLeads() {
    const data = await fetchJson(`/api/leads?${buildQuery()}`);
    state.leads = data.leads || [];
    state.total = data.total || 0;
    state.totalPages = data.totalPages || 1;
    state.page = data.page || 1;
    renderTable();
    renderPagination();
    renderResultsMeta();
  }

  function renderKpis() {
    const el = $('vault-kpis');
    if (!el || !state.meta) return;
    const m = state.meta;
    el.innerHTML = `
      <div class="vault-kpi"><span class="vault-kpi-val">${m.total}</span><span class="vault-kpi-label">Total</span></div>
      <div class="vault-kpi"><span class="vault-kpi-val">${m.freshThisWeek || 0}</span><span class="vault-kpi-label">This week</span></div>
      <div class="vault-kpi"><span class="vault-kpi-val">${m.byType?.distressed || 0}</span><span class="vault-kpi-label">Distressed</span></div>
    `;
  }

  function populateGeoSelects() {
    const stateSel = $('vault-state');
    const citySel = $('vault-city');
    if (!stateSel || !citySel || !state.meta) return;
    const states = state.meta.states || [];
    const cities = state.meta.cities || [];
    const prevState = state.state;
    const prevCity = state.city;
    stateSel.innerHTML = '<option value="">All states</option>' + states.map((s) =>
      `<option value="${esc(s.name)}"${s.name === prevState ? ' selected' : ''}>${esc(s.name)} (${s.count})</option>`
    ).join('');
    citySel.innerHTML = '<option value="">All cities</option>' + cities.map((c) =>
      `<option value="${esc(c.name)}"${c.name === prevCity ? ' selected' : ''}>${esc(c.name)} (${c.count})</option>`
    ).join('');
  }

  function renderSignalChips() {
    const wrap = $('vault-signal-chips');
    if (!wrap) return;
    wrap.innerHTML = SIGNAL_OPTIONS.map((label) => {
      const active = state.signals.includes(label);
      return `<button type="button" class="vault-signal-chip${active ? ' is-active' : ''}" data-signal="${esc(label)}" aria-pressed="${active}">${esc(label)}</button>`;
    }).join('');
  }

  function hotSignalClass(signal) {
    const hot = ['pre-foreclosure', 'vacant', 'water shut-off'];
    return hot.includes(String(signal || '').toLowerCase()) ? ' vault-signal--hot' : '';
  }

  function renderTable() {
    const body = $('vault-results-body');
    const empty = $('vault-empty');
    const table = $('vault-table');
    if (!body) return;

    if (!state.leads.length) {
      body.innerHTML = '';
      if (empty) empty.hidden = false;
      if (table) table.hidden = true;
      $('vault-export-btn').disabled = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (table) table.hidden = false;

    body.innerHTML = state.leads.map((row) => {
      const signal = row.topSignal || (row.signalTags && row.signalTags[0]) || '—';
      const phone = (row.phones && row.phones[0]) || '—';
      const checked = state.selected.has(row.leadId) ? ' checked' : '';
      return `<tr class="vault-row" data-lead-id="${esc(row.leadId)}" tabindex="0">
        <td class="vault-col-check"><input type="checkbox" class="vault-row-check" data-id="${esc(row.leadId)}" aria-label="Select lead"${checked}></td>
        <td>${esc(row.address)}</td>
        <td>${esc(row.city)}, ${esc(row.state)}</td>
        <td><span class="vault-signal${hotSignalClass(signal)}">${esc(signal)}</span></td>
        <td><span class="vault-score">${esc(row.priorityScore)}</span></td>
        <td class="vault-col-owner">${esc(row.ownerName || '—')}</td>
        <td class="vault-col-phone">${formatPhone(phone)}</td>
      </tr>`;
    }).join('');

    document.querySelectorAll('.vault-sort-btn').forEach((btn) => {
      btn.classList.toggle('is-sorted', btn.dataset.sort === state.sort);
    });
    updateExportButton();
  }

  function renderResultsMeta() {
    const el = $('vault-results-meta');
    if (!el) return;
    const start = state.total ? (state.page - 1) * 50 + 1 : 0;
    const end = Math.min(state.page * 50, state.total);
    el.textContent = state.total
      ? `Showing ${start}–${end} of ${state.total} leads`
      : 'No leads in catalog yet';
  }

  function renderPagination() {
    const nav = $('vault-pagination');
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

  function updateExportButton() {
    const btn = $('vault-export-btn');
    if (btn) btn.disabled = state.selected.size === 0;
  }

  async function openDrawer(leadId) {
    const drawer = $('vault-drawer');
    const body = $('vault-drawer-body');
    const title = $('vault-drawer-title');
    if (!drawer || !body) return;
    state.activeLeadId = leadId;
    drawer.hidden = false;
    body.innerHTML = '<p class="vault-drawer-loading">Loading…</p>';
    try {
      const data = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
      const l = data.lead;
      title.textContent = l.address || 'Lead dossier';
      const signals = (l.signalTags || []).map((t) =>
        `<span class="vault-signal-chip is-active">${esc(t)}</span>`
      ).join(' ') || '—';
      const phones = (l.phones || []).map((p) => formatPhone(p)).join('<br>') || '—';
      body.innerHTML = `
        <div class="vault-dossier">
          <p class="vault-dossier-address">${esc(l.address)}, ${esc(l.city)}, ${esc(l.state)} ${esc(l.zip || '')}</p>
          <div class="vault-dossier-score-row">
            <span class="vault-score vault-score--lg">${esc(l.priorityScore)}</span>
            <span class="vault-dossier-type">${esc(l.leadType.replace(/_/g, ' '))}</span>
          </div>
          <section class="vault-dossier-section">
            <h3>Signals</h3>
            <div class="vault-signal-chips">${signals}</div>
          </section>
          <section class="vault-dossier-section">
            <h3>Owner</h3>
            <p>${esc(l.ownerName || '—')}</p>
            <p>${phones}</p>
          </section>
          <section class="vault-dossier-section">
            <h3>Financials</h3>
            <dl class="vault-dl">
              <dt>Est. ARV</dt><dd>${l.estARV != null ? '$' + Number(l.estARV).toLocaleString() : '—'}</dd>
              <dt>Est. repairs</dt><dd>${l.estRepairs != null ? '$' + Number(l.estRepairs).toLocaleString() : '—'}</dd>
              <dt>Est. equity</dt><dd>${l.estEquity != null ? '$' + Number(l.estEquity).toLocaleString() : '—'}</dd>
            </dl>
          </section>
          <section class="vault-dossier-section">
            <h3>Notes</h3>
            <textarea id="vault-note-input" class="phuglee-textarea" rows="3" placeholder="Your notes…">${esc(data.note || '')}</textarea>
            <button type="button" id="vault-save-note" class="phuglee-btn phuglee-btn-secondary">Save note</button>
          </section>
          <div class="vault-dossier-actions">
            <button type="button" id="vault-fav-btn" class="phuglee-btn phuglee-btn-ghost" data-fav="${data.favorite ? '1' : '0'}">${data.favorite ? '★ Favorited' : '☆ Favorite'}</button>
            <button type="button" id="vault-copy-addr" class="phuglee-btn phuglee-btn-ghost">Copy address</button>
          </div>
        </div>
      `;
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
          btn.textContent = data2.favorite ? '★ Favorited' : '☆ Favorite';
          btn.dataset.fav = data2.favorite ? '1' : '0';
        }
      });
      $('vault-copy-addr')?.addEventListener('click', () => {
        const text = [l.address, l.city, l.state, l.zip].filter(Boolean).join(', ');
        navigator.clipboard?.writeText(text);
      });
      $('vault-drawer-close')?.focus();
    } catch (err) {
      body.innerHTML = `<p class="phuglee-error">${esc(err.message)}</p>`;
    }
  }

  function closeDrawer() {
    const drawer = $('vault-drawer');
    if (drawer) drawer.hidden = true;
    state.activeLeadId = null;
  }

  function bindEvents() {
    $('vault-type-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.vault-type-tab');
      if (!tab) return;
      document.querySelectorAll('.vault-type-tab').forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      state.leadType = tab.dataset.type || 'all';
      state.page = 1;
      loadLeads();
    });

    $('vault-search')?.addEventListener('input', (e) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.q = e.target.value.trim();
        state.page = 1;
        loadLeads();
      }, 300);
    });

    ['vault-state', 'vault-city', 'vault-since'].forEach((id) => {
      $(id)?.addEventListener('change', (e) => {
        const key = id === 'vault-state' ? 'state' : id === 'vault-city' ? 'city' : 'since';
        state[key] = e.target.value;
        state.page = 1;
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
      loadLeads();
    });

    $('vault-clear-filters')?.addEventListener('click', () => {
      state.state = '';
      state.city = '';
      state.signals = [];
      state.minScore = 0;
      state.since = '';
      state.q = '';
      state.page = 1;
      if ($('vault-search')) $('vault-search').value = '';
      if ($('vault-min-score')) $('vault-min-score').value = '0';
      if ($('vault-min-score-val')) $('vault-min-score-val').textContent = '0';
      if ($('vault-since')) $('vault-since').value = '';
      renderSignalChips();
      populateGeoSelects();
      loadLeads();
    });

    $('vault-results-body')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('vault-row-check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
        updateExportButton();
        return;
      }
      const row = e.target.closest('.vault-row');
      if (row) openDrawer(row.dataset.leadId);
    });

    $('vault-results-body')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const row = e.target.closest('.vault-row');
        if (row) openDrawer(row.dataset.leadId);
      }
    });

    $('vault-select-all')?.addEventListener('change', (e) => {
      state.leads.forEach((row) => {
        if (e.target.checked) state.selected.add(row.leadId);
        else state.selected.delete(row.leadId);
      });
      renderTable();
    });

    $('vault-pagination')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.page) || 1;
      loadLeads();
    });

    document.querySelectorAll('.vault-sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sort = btn.dataset.sort;
        if (state.sort === sort) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sort = sort;
          state.sortDir = sort === 'address' || sort === 'city' ? 'asc' : 'desc';
        }
        loadLeads();
      });
    });

    $('vault-export-btn')?.addEventListener('click', async () => {
      if (!state.selected.size) return;
      try {
        const data = await fetchJson('/api/leads/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...state.selected] })
        });
        const blob = new Blob([data.csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = data.filename || 'vault-export.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        alert(err.message || 'Export failed');
      }
    });

    $('vault-drawer-close')?.addEventListener('click', closeDrawer);
    $('vault-drawer-backdrop')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('vault-drawer')?.hidden) closeDrawer();
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
      await loadMeta();
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
