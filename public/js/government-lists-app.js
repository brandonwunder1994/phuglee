(function () {
  'use strict';

  const CATALOG_URL = '/data/government-lists/catalog.json';
  const PLAYBOOKS_URL = '/api/gov-playbooks';
  const PAGE_SIZE = 80;

  const LIST_SLOT_DEFS = [
    { id: 'code_violation', label: 'Code violations' },
    { id: 'tax_delinquent', label: 'Tax delinquent' },
    { id: 'lis_pendens', label: 'Pre-foreclosure (LP / NOD)' },
    { id: 'probate', label: 'Probate' },
    { id: 'fire', label: 'Fire' },
    { id: 'eviction', label: 'Evictions' },
    { id: 'water_shutoff', label: 'Water shutoffs' }
  ];

  const state = {
    catalog: null,
    listTypes: [],
    methods: [],
    sources: [],
    filtered: [],
    openId: null,
    visibleCount: PAGE_SIZE,
    tab: 'sources',
    playbooks: [],
    activePlaybookId: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = $('gl-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  function authHeaders() {
    const h = {};
    try {
      const user = sessionStorage.getItem('phuglee_session') || '';
      const plan = sessionStorage.getItem('phuglee_plan') || '';
      if (user) h['x-phuglee-user'] = user;
      if (plan) h['x-phuglee-plan'] = plan;
    } catch (_) { /* ignore */ }
    return h;
  }

  function typeLabel(id) {
    const t = state.listTypes.find((x) => x.id === id);
    return t ? t.label : id;
  }

  function methodLabel(id) {
    const m = state.methods.find((x) => x.id === id);
    return m ? m.label : id;
  }

  function placeLabel(src) {
    const parts = [];
    if (src.city) parts.push(src.city);
    if (src.county) parts.push(src.county + (src.city ? '' : ' County'));
    if (src.state) parts.push(src.state);
    if (!parts.length) return 'How-to · any market';
    return parts.join(', ');
  }

  function fillSelect(el, options, allLabel) {
    if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="">${esc(allLabel)}</option>` +
      options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    if (cur && options.some((o) => o.value === cur)) el.value = cur;
  }

  function setTab(tab) {
    state.tab = tab === 'playbooks' ? 'playbooks' : 'sources';
    const sourcesPanel = $('gl-panel-sources');
    const pbPanel = $('gl-panel-playbooks');
    const tabSources = $('gl-tab-sources');
    const tabPb = $('gl-tab-playbooks');
    if (sourcesPanel) sourcesPanel.hidden = state.tab !== 'sources';
    if (pbPanel) pbPanel.hidden = state.tab !== 'playbooks';
    if (tabSources) tabSources.setAttribute('aria-selected', state.tab === 'sources' ? 'true' : 'false');
    if (tabPb) tabPb.setAttribute('aria-selected', state.tab === 'playbooks' ? 'true' : 'false');
    try {
      const url = new URL(window.location.href);
      if (state.tab === 'playbooks') url.searchParams.set('tab', 'playbooks');
      else url.searchParams.delete('tab');
      window.history.replaceState({}, '', url);
    } catch (_) { /* ignore */ }
    if (state.tab === 'playbooks') {
      const count = $('gl-count');
      if (count) count.textContent = `${state.playbooks.length} playbook${state.playbooks.length === 1 ? '' : 's'}`;
    } else {
      applyFilters();
    }
  }

  function renderTypeChips() {
    const host = $('gl-type-chips');
    if (!host) return;
    const active = ($('gl-type') && $('gl-type').value) || '';
    host.innerHTML = state.listTypes
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((t) => {
        const pressed = active === t.id ? 'true' : 'false';
        return `<button type="button" class="gl-chip" data-type="${esc(t.id)}" aria-pressed="${pressed}">${esc(t.label)}</button>`;
      })
      .join('');
  }

  function applyFilters() {
    if (state.tab !== 'sources') return;
    const q = (($('gl-search') && $('gl-search').value) || '').trim().toLowerCase();
    const type = ($('gl-type') && $('gl-type').value) || '';
    const st = ($('gl-state') && $('gl-state').value) || '';
    const method = ($('gl-method') && $('gl-method').value) || '';
    const hidePlaybook = $('gl-hide-playbook') ? $('gl-hide-playbook').checked : true;

    state.filtered = state.sources.filter((s) => {
      if (hidePlaybook && s.isPlaybook) return false;
      if (type && s.listType !== type) return false;
      if (st && s.state !== st) return false;
      if (method && s.method !== method) return false;
      if (!q) return true;
      const hay = [
        s.city, s.county, s.state, s.notes, s.listType, typeLabel(s.listType),
        s.method, methodLabel(s.method), s.url, s.contactEmail, s.id
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    state.visibleCount = PAGE_SIZE;
    if (state.openId && !state.filtered.some((s) => s.id === state.openId)) {
      state.openId = null;
      renderDetail(null);
    }
    renderResults();
    renderTypeChips();
  }

  function renderResults() {
    const host = $('gl-results');
    const empty = $('gl-empty');
    const count = $('gl-count');
    if (!host) return;

    const slice = state.filtered.slice(0, state.visibleCount);
    if (count && state.tab === 'sources') {
      count.textContent = state.filtered.length
        ? `${state.filtered.length.toLocaleString()} sources`
        : '0 sources';
    }

    if (!slice.length) {
      host.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    host.innerHTML = slice
      .map((s) => {
        const active = s.id === state.openId ? ' is-active' : '';
        return `<button type="button" class="gl-row${active}" role="listitem" data-id="${esc(s.id)}">
          <div class="gl-row-top">
            <span class="gl-row-place">${esc(placeLabel(s))}</span>
            <span class="gl-row-meta">${esc(typeLabel(s.listType))} · ${esc(methodLabel(s.method))}</span>
          </div>
          <div class="gl-row-sub">${esc(s.url || s.contactEmail || s.notes || 'No URL yet')}</div>
        </button>`;
      })
      .join('');

    if (state.filtered.length > state.visibleCount) {
      host.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="phuglee-btn phuglee-btn-ghost" id="gl-more" style="margin-top:0.5rem">Show more (${(state.filtered.length - state.visibleCount).toLocaleString()} left)</button>`
      );
    }
  }

  function renderDetail(src) {
    const panel = $('gl-detail');
    const title = $('gl-detail-title');
    const body = $('gl-detail-body');
    if (!panel || !body) return;

    if (!src) {
      panel.hidden = true;
      body.innerHTML = '';
      return;
    }

    panel.hidden = false;
    if (title) title.textContent = placeLabel(src);

    const urlHtml = src.url
      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.url)}</a>`
      : '—';
    const emailHtml = src.contactEmail
      ? `<a href="mailto:${esc(src.contactEmail)}">${esc(src.contactEmail)}</a>`
      : '—';

    const collectLink = (src.listType === 'code_violation' || src.listType === 'water_shutoff')
      ? `<a class="phuglee-btn phuglee-btn-primary" href="/collect">Open Collect</a>`
      : '';
    const preLienLink = src.listType === 'pre_lien'
      ? `<a class="phuglee-btn phuglee-btn-primary" href="/pre-liens">Open Pre-liens desk</a>`
      : '';
    const pbLink = src.county && src.state
      ? `<button type="button" class="phuglee-btn phuglee-btn-ghost" id="gl-open-county-pb" data-county="${esc(src.county)}" data-state="${esc(src.state)}">County playbook</button>`
      : '';
    const filterLink = `<a class="phuglee-btn phuglee-btn-ghost" href="/filter">Open Filter</a>`;
    const openUrl = src.url
      ? `<a class="phuglee-btn phuglee-btn-ghost" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Open source</a>`
      : '';

    body.innerHTML = `
      <dl class="gl-kv"><dt>List type</dt><dd>${esc(typeLabel(src.listType))}</dd></dl>
      <dl class="gl-kv"><dt>Method</dt><dd>${esc(methodLabel(src.method))}</dd></dl>
      <dl class="gl-kv"><dt>Cadence</dt><dd>${esc(src.cadence || '—')}</dd></dl>
      <dl class="gl-kv"><dt>URL</dt><dd>${urlHtml}</dd></dl>
      <dl class="gl-kv"><dt>Email</dt><dd>${emailHtml}</dd></dl>
      <dl class="gl-kv"><dt>Notes</dt><dd>${esc(src.notes || '—')}</dd></dl>
      <div class="gl-actions">${openUrl}${preLienLink}${pbLink}${collectLink}${filterLink}
        ${src.requestTemplate ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" id="gl-copy-template">Copy request text</button>' : ''}
      </div>
      ${src.requestTemplate ? `<p class="gl-label">Request template</p><pre class="gl-template" id="gl-template-text">${esc(src.requestTemplate)}</pre>` : ''}
    `;

    const copyBtn = $('gl-copy-template');
    if (copyBtn && src.requestTemplate) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(src.requestTemplate);
          showToast('Request text copied');
        } catch (_) {
          showToast('Could not copy — select the text manually');
        }
      });
    }

    $('gl-open-county-pb')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const county = btn.getAttribute('data-county') || '';
      const st = btn.getAttribute('data-state') || '';
      openOrCreatePlaybook(county, st);
    });
  }

  function openSource(id) {
    const src = state.sources.find((s) => s.id === id) || state.filtered.find((s) => s.id === id);
    state.openId = src ? src.id : null;
    renderResults();
    renderDetail(src || null);
  }

  function renderPlaybookList() {
    const host = $('gl-pb-list');
    if (!host) return;
    if (!state.playbooks.length) {
      host.innerHTML = '<p class="gl-empty">No county playbooks yet. Click New county.</p>';
      return;
    }
    host.innerHTML = state.playbooks.map((p) => {
      const active = p.id === state.activePlaybookId ? ' is-active' : '';
      const verified = p.lastVerified || 'not verified';
      return `<button type="button" class="gl-pb-item${active}" role="listitem" data-pb-id="${esc(p.id)}">
        <span class="gl-pb-item-title">${esc(p.county)} County, ${esc(p.state)}</span>
        <span class="gl-pb-item-meta">${esc(p.assetFocus || 'houses')} · ${esc(verified)}</span>
      </button>`;
    }).join('');
  }

  function ensureListSlots() {
    const host = $('gl-pb-lists');
    if (!host || host.dataset.ready === '1') return;
    host.innerHTML = LIST_SLOT_DEFS.map((def) => `
      <div class="gl-pb-list-card" data-list-id="${esc(def.id)}">
        <h4>${esc(def.label)}</h4>
        <label class="gl-field gl-field--full">
          <span class="gl-label">URL</span>
          <input type="url" class="phuglee-input" data-f="url" placeholder="https://…">
        </label>
        <div class="gl-pb-grid">
          <label class="gl-field">
            <span class="gl-label">Method</span>
            <input type="text" class="phuglee-input" data-f="method" placeholder="request / recorder…">
          </label>
          <label class="gl-field">
            <span class="gl-label">Cadence</span>
            <input type="text" class="phuglee-input" data-f="cadence" placeholder="weekly">
          </label>
        </div>
        <label class="gl-field gl-field--full">
          <span class="gl-label">Notes</span>
          <input type="text" class="phuglee-input" data-f="notes">
        </label>
      </div>
    `).join('');
    host.dataset.ready = '1';
  }

  function fillPlaybookForm(pb) {
    ensureListSlots();
    const form = $('gl-pb-form');
    if (!form) return;
    form.hidden = false;
    $('gl-pb-id').value = pb?.id || '';
    $('gl-pb-county').value = pb?.county || '';
    $('gl-pb-state').value = pb?.state || '';
    $('gl-pb-asset').value = pb?.assetFocus || 'houses';
    $('gl-pb-verified').value = pb?.lastVerified || '';
    $('gl-pb-court-url').value = pb?.preLien?.courtUrl || '';
    $('gl-pb-case-types').value = pb?.preLien?.caseTypes || '';
    $('gl-pb-filters').value = pb?.preLien?.filters || '';
    $('gl-pb-fees').value = pb?.preLien?.fees || '';
    $('gl-pb-cadence').value = pb?.preLien?.cadence || 'weekly';
    $('gl-pb-login').value = pb?.preLien?.loginNotes || '';
    $('gl-pb-worked').value = pb?.preLien?.whatWorked || '';
    $('gl-pb-blockers').value = pb?.preLien?.blockers || '';
    $('gl-pb-assessor-url').value = pb?.assessor?.url || '';
    $('gl-pb-assessor-notes').value = pb?.assessor?.notes || '';
    $('gl-pb-notes').value = pb?.notes || '';

    LIST_SLOT_DEFS.forEach((def) => {
      const card = document.querySelector(`.gl-pb-list-card[data-list-id="${def.id}"]`);
      if (!card) return;
      const slot = (pb?.lists && pb.lists[def.id]) || {};
      card.querySelector('[data-f="url"]').value = slot.url || '';
      card.querySelector('[data-f="method"]').value = slot.method || '';
      card.querySelector('[data-f="cadence"]').value = slot.cadence || '';
      card.querySelector('[data-f="notes"]').value = slot.notes || '';
    });

    const link = $('gl-pb-open-prelien');
    if (link) {
      const q = new URLSearchParams();
      if (pb?.id) q.set('playbook', pb.id);
      else {
        if (pb?.county) q.set('county', pb.county);
        if (pb?.state) q.set('state', pb.state);
      }
      if (pb?.preLien?.courtUrl) q.set('court', pb.preLien.courtUrl);
      link.href = `/pre-liens${q.toString() ? `?${q}` : ''}`;
    }

    $('gl-pb-status').textContent = pb?.updatedAt
      ? `Updated ${pb.updatedAt.slice(0, 10)}${pb.updatedBy ? ` · ${pb.updatedBy}` : ''}`
      : '';
  }

  function readPlaybookForm() {
    const lists = {};
    LIST_SLOT_DEFS.forEach((def) => {
      const card = document.querySelector(`.gl-pb-list-card[data-list-id="${def.id}"]`);
      lists[def.id] = {
        url: card?.querySelector('[data-f="url"]')?.value.trim() || '',
        method: card?.querySelector('[data-f="method"]')?.value.trim() || '',
        cadence: card?.querySelector('[data-f="cadence"]')?.value.trim() || '',
        notes: card?.querySelector('[data-f="notes"]')?.value.trim() || ''
      };
    });
    return {
      id: $('gl-pb-id').value.trim() || undefined,
      county: $('gl-pb-county').value.trim(),
      state: $('gl-pb-state').value.trim().toUpperCase(),
      assetFocus: $('gl-pb-asset').value,
      lastVerified: $('gl-pb-verified').value || null,
      preLien: {
        courtUrl: $('gl-pb-court-url').value.trim(),
        caseTypes: $('gl-pb-case-types').value.trim(),
        filters: $('gl-pb-filters').value.trim(),
        fees: $('gl-pb-fees').value.trim(),
        loginNotes: $('gl-pb-login').value.trim(),
        cadence: $('gl-pb-cadence').value.trim() || 'weekly',
        whatWorked: $('gl-pb-worked').value.trim(),
        blockers: $('gl-pb-blockers').value.trim()
      },
      assessor: {
        url: $('gl-pb-assessor-url').value.trim(),
        notes: $('gl-pb-assessor-notes').value.trim()
      },
      lists,
      notes: $('gl-pb-notes').value.trim()
    };
  }

  function selectPlaybook(id) {
    state.activePlaybookId = id;
    const pb = state.playbooks.find((p) => p.id === id) || null;
    renderPlaybookList();
    if (pb) fillPlaybookForm(pb);
  }

  function openOrCreatePlaybook(county, st) {
    setTab('playbooks');
    const found = state.playbooks.find(
      (p) => p.county.toLowerCase() === String(county).toLowerCase()
        && p.state.toUpperCase() === String(st).toUpperCase()
    );
    if (found) {
      selectPlaybook(found.id);
      showToast(`Opened ${found.county} County playbook`);
      return;
    }
    fillPlaybookForm({
      county,
      state: String(st || '').toUpperCase(),
      assetFocus: 'houses',
      preLien: { cadence: 'weekly' },
      assessor: {},
      lists: {}
    });
    state.activePlaybookId = null;
    renderPlaybookList();
    showToast('New playbook draft — fill and save');
  }

  async function loadPlaybooks() {
    const res = await fetch(PLAYBOOKS_URL, {
      headers: authHeaders(),
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `Playbooks HTTP ${res.status}`);
    state.playbooks = json.playbooks || [];
    renderPlaybookList();
    if (state.activePlaybookId) {
      const still = state.playbooks.find((p) => p.id === state.activePlaybookId);
      if (still) fillPlaybookForm(still);
    }
  }

  async function savePlaybook(e) {
    e?.preventDefault();
    const payload = readPlaybookForm();
    if (!payload.county || !payload.state) {
      showToast('County and state are required');
      return;
    }
    $('gl-pb-status').textContent = 'Saving…';
    try {
      const res = await fetch(PLAYBOOKS_URL, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ playbook: payload })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Save failed (${res.status})`);
      await loadPlaybooks();
      selectPlaybook(json.playbook.id);
      showToast('Playbook saved');
    } catch (err) {
      $('gl-pb-status').textContent = err.message || 'Save failed';
      showToast(err.message || 'Save failed');
    }
  }

  async function deleteActivePlaybook() {
    const id = $('gl-pb-id').value.trim();
    if (!id) {
      showToast('Nothing to delete');
      return;
    }
    if (!window.confirm('Delete this county playbook?')) return;
    try {
      const res = await fetch(`${PLAYBOOKS_URL}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'same-origin'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Delete failed');
      state.activePlaybookId = null;
      $('gl-pb-form').hidden = true;
      await loadPlaybooks();
      showToast('Playbook deleted');
    } catch (err) {
      showToast(err.message || 'Delete failed');
    }
  }

  function bind() {
    document.querySelectorAll('.gl-tab').forEach((tab) => {
      tab.addEventListener('click', () => setTab(tab.getAttribute('data-tab')));
    });

    ['gl-search', 'gl-type', 'gl-state', 'gl-method', 'gl-hide-playbook'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const evt = el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change';
      el.addEventListener(evt, applyFilters);
    });

    $('gl-type-chips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      const type = btn.getAttribute('data-type');
      const sel = $('gl-type');
      if (!sel) return;
      sel.value = sel.value === type ? '' : type;
      applyFilters();
    });

    $('gl-results')?.addEventListener('click', (e) => {
      if (e.target.closest('#gl-more')) {
        state.visibleCount += PAGE_SIZE;
        renderResults();
        return;
      }
      const row = e.target.closest('[data-id]');
      if (!row) return;
      openSource(row.getAttribute('data-id'));
    });

    $('gl-detail-close')?.addEventListener('click', () => {
      state.openId = null;
      renderDetail(null);
      renderResults();
    });

    $('gl-pb-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pb-id]');
      if (!btn) return;
      selectPlaybook(btn.getAttribute('data-pb-id'));
    });

    $('gl-pb-new')?.addEventListener('click', () => {
      state.activePlaybookId = null;
      renderPlaybookList();
      fillPlaybookForm({
        county: '',
        state: '',
        assetFocus: 'houses',
        preLien: { cadence: 'weekly', caseTypes: 'Small claims / civil debt (pre-judgment)' },
        assessor: { notes: 'Confirm defendant ≈ owner before outreach.' },
        lists: {}
      });
      $('gl-pb-county')?.focus();
    });

    $('gl-pb-form')?.addEventListener('submit', savePlaybook);
    $('gl-pb-delete')?.addEventListener('click', deleteActivePlaybook);
  }

  async function init() {
    bind();
    ensureListSlots();

    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('tab') === 'playbooks') state.tab = 'playbooks';
      const typeQ = params.get('type') || '';

      const res = await fetch(CATALOG_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = await res.json();
      state.catalog = catalog;
      state.listTypes = catalog.listTypes || [];
      state.methods = catalog.methods || [];
      state.sources = catalog.sources || [];

      fillSelect(
        $('gl-type'),
        state.listTypes.map((t) => ({ value: t.id, label: t.label })),
        'All types'
      );
      fillSelect(
        $('gl-method'),
        state.methods.map((m) => ({ value: m.id, label: m.label })),
        'All methods'
      );
      const states = [...new Set(state.sources.map((s) => s.state).filter(Boolean))].sort();
      fillSelect(
        $('gl-state'),
        states.map((s) => ({ value: s, label: s })),
        'All states'
      );

      if (typeQ && state.listTypes.some((t) => t.id === typeQ) && $('gl-type')) {
        $('gl-type').value = typeQ;
      }

      try {
        await loadPlaybooks();
      } catch (err) {
        console.warn(err);
        showToast('Playbooks failed to load — sources still available');
      }

      setTab(state.tab);

      const playbookQ = params.get('playbook') || '';
      if (playbookQ && state.playbooks.some((p) => p.id === playbookQ)) {
        selectPlaybook(playbookQ);
      }

      const countyQ = params.get('county');
      const stateQ = params.get('state');
      if (!playbookQ && countyQ && stateQ) openOrCreatePlaybook(countyQ, stateQ);
    } catch (err) {
      console.error(err);
      showToast('Could not load government lists catalog');
      const count = $('gl-count');
      if (count) count.textContent = 'Catalog failed to load';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
