(function () {
  'use strict';

  const META_URL = '/api/gov-lists/meta';
  const SOURCES_URL = '/api/gov-lists/sources';
  const PLAYBOOKS_URL = '/api/gov-playbooks';
  const LAST_STATE_KEY = 'gl-last-state';
  const ROW_HEIGHT = 44;
  const OVERSCAN = 8;

  const GLN = (typeof window !== 'undefined' && window.GLNormalize) || null;

  const LIST_SLOT_DEFS = [
    { id: 'code_violation', label: 'Code violations' },
    { id: 'tax_delinquent', label: 'Tax delinquent' },
    { id: 'lis_pendens', label: 'Pre-foreclosure (LP / NOD)' },
    { id: 'probate', label: 'Probate' },
    { id: 'fire', label: 'Fire' },
    { id: 'eviction', label: 'Evictions' }
  ];

  const state = {
    catalog: null,
    listTypes: [],
    methods: [],
    merged: [],        // deduped non-playbook rows
    howto: [],         // isPlaybook / any-market rows (normalized)
    byId: new Map(),
    filtered: [],
    selected: new Set(),
    openId: null,
    activeIndex: -1,
    sortKey: 'place',
    sortDir: 'asc',
    tab: 'sources',
    playbooks: [],
    activePlaybookId: null,
    scrollScheduled: false
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
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
    showToast._t = setTimeout(() => { el.hidden = true; }, 2800);
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

  function methodShort(id) {
    return String(id || '').replace(/_/g, ' ');
  }

  function placeLabel(src) {
    const parts = [];
    if (src.city) parts.push(src.city);
    if (src.county) parts.push(src.county + (src.city ? '' : ' County'));
    if (src.state) parts.push(src.state);
    if (!parts.length) return 'How-to · any market';
    return parts.join(', ');
  }

  const VERIFY_BADGES = {
    verified: { cls: 'gl-badge--verified', label: 'Verified' },
    pdf_only: { cls: 'gl-badge--pdf', label: 'PDF' },
    email_only: { cls: 'gl-badge--email', label: 'Email' },
    unverified: { cls: 'gl-badge--unverified', label: 'Unverified' }
  };
  const VERIFY_RANK = { verified: 4, pdf_only: 3, email_only: 2, unverified: 1 };

  function verifyBadge(status) {
    return VERIFY_BADGES[status] || VERIFY_BADGES.unverified;
  }

  function needsSendEmail(s) {
    if (!s || s.isPlaybook) return false;
    const emailWorkflow =
      s.method === 'email' || s.method === 'pdf' ||
      s.verifyStatus === 'email_only' || s.verifyStatus === 'pdf_only';
    return emailWorkflow && !(s.contactEmail && String(s.contactEmail).trim());
  }

  function fmtVerified(v) {
    if (!v) return '—';
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  // ── Facets ──
  function computeTypeCounts(rows) {
    const byType = {};
    for (const s of rows) byType[s.listType] = (byType[s.listType] || 0) + 1;
    return byType;
  }

  function computeStates(rows) {
    const byState = {};
    for (const s of rows) if (s.state) byState[s.state] = (byState[s.state] || 0) + 1;
    return Object.keys(byState).sort().map((v) => ({ value: v, label: v, count: byState[v] }));
  }

  function fillSelect(el, options, allLabel) {
    if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="">${esc(allLabel)}</option>` +
      options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}${o.count != null ? ` (${o.count.toLocaleString()})` : ''}</option>`).join('');
    if (cur && options.some((o) => o.value === cur)) el.value = cur;
  }

  // ── Tabs ──
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

  // ── Type rail ──
  function renderTypeRail() {
    const host = $('gl-type-rail');
    if (!host) return;
    // When a state is loaded, counts follow that state; otherwise show national totals
    // so the page never looks like the catalog was wiped.
    const hasStateRows = state.merged.length > 0;
    const national = (state.catalog && state.catalog.listTypeCounts) || {};
    const counts = hasStateRows ? computeTypeCounts(state.merged) : national;
    const active = ($('gl-type') && $('gl-type').value) || '';
    host.innerHTML = state.listTypes
      .slice()
      .sort((a, b) => (a.priority || 99) - (b.priority || 99))
      .map((t) => {
        const pressed = active === t.id ? 'true' : 'false';
        const n = counts[t.id] || 0;
        return `<button type="button" class="gl-type-row" data-type="${esc(t.id)}" aria-pressed="${pressed}">
          <span class="gl-type-row-label">${esc(t.label)}</span>
          <span class="gl-type-row-count">${n.toLocaleString()}</span>
        </button>`;
      })
      .join('');
  }

  // ── Read current filter controls ──
  function readControls() {
    return {
      q: (($('gl-search') && $('gl-search').value) || '').trim().toLowerCase(),
      type: ($('gl-type') && $('gl-type').value) || '',
      st: ($('gl-state') && $('gl-state').value) || '',
      method: ($('gl-method') && $('gl-method').value) || '',
      verify: ($('gl-verify') && $('gl-verify').value) || '',
      hasEmail: $('gl-has-email') ? $('gl-has-email').checked : false,
      hideHowto: $('gl-hide-playbook') ? $('gl-hide-playbook').checked : true
    };
  }

  // ── Sort ──
  function sortRows(rows) {
    const key = state.sortKey;
    const dir = state.sortDir === 'desc' ? -1 : 1;
    const cmp = (a, b) => {
      let av, bv;
      if (key === 'status') {
        av = VERIFY_RANK[a.verifyStatus] || 0;
        bv = VERIFY_RANK[b.verifyStatus] || 0;
        // status asc = best first
        return (bv - av) * dir || placeLabel(a).localeCompare(placeLabel(b));
      }
      if (key === 'list') { av = typeLabel(a.listType); bv = typeLabel(b.listType); }
      else if (key === 'method') { av = a.method || ''; bv = b.method || ''; }
      else if (key === 'verified') { av = a.lastVerified || ''; bv = b.lastVerified || ''; }
      else { av = placeLabel(a).toLowerCase(); bv = placeLabel(b).toLowerCase(); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return placeLabel(a).localeCompare(placeLabel(b));
    };
    rows.sort(cmp);
    return rows;
  }

  // ── Filter ──
  function applyFilters() {
    if (state.tab !== 'sources') return;
    const f = readControls();
    const base = f.hideHowto ? state.merged : state.merged.concat(state.howto);

    state.filtered = base.filter((s) => {
      if (f.type && s.listType !== f.type) return false;
      if (f.st && s.state !== f.st) return false;
      if (f.method && s.method !== f.method) return false;
      if (f.hasEmail && !(s.contactEmail && String(s.contactEmail).trim())) return false;
      if (f.verify === 'needs_email') {
        if (!needsSendEmail(s)) return false;
      } else if (f.verify && s.verifyStatus !== f.verify) {
        return false;
      }
      if (!f.q) return true;
      const hay = [
        s.city, s.county, s.state, s.notes, s.listType, typeLabel(s.listType),
        s.method, methodLabel(s.method), s.url, s.contactEmail, s.id
      ].join(' ').toLowerCase();
      return hay.includes(f.q);
    });

    sortRows(state.filtered);
    state.activeIndex = -1;

    if (state.openId && !state.filtered.some((s) => s.id === state.openId)) {
      state.openId = null;
      renderDetail(null);
    }

    const vp = $('gl-viewport');
    if (vp) vp.scrollTop = 0;
    renderRows();
    renderTypeRail();
    renderCounts();
    renderChips();
    updateSelectAll();
    updateBulkBar();
    writeUrl(f);
  }

  // ── Counts ──
  function catalogReadySummary() {
    const n = Number(state.catalog && state.catalog.sourceCount) || 0;
    const states = state.catalog && state.catalog.stateCounts
      ? Object.keys(state.catalog.stateCounts).length
      : 0;
    if (n <= 0) return 'Catalog loading…';
    return `${n.toLocaleString()} sources live · ${states} states — pick a state to open the table`;
  }

  function renderCounts() {
    const st = ($('gl-state') && $('gl-state').value) || '';
    let txt;
    if (!st && !state.merged.length) {
      txt = catalogReadySummary();
    } else if (state.filtered.length) {
      const places = new Set(state.filtered.map((s) => `${(s.city || s.county || '').toLowerCase()}|${s.state}`)).size;
      txt = `${state.filtered.length.toLocaleString()} sources · ${places.toLocaleString()} places`;
    } else {
      txt = '0 sources match filters';
    }
    const tb = $('gl-toolbar-count');
    if (tb) tb.textContent = txt;
    const count = $('gl-count');
    if (count && state.tab === 'sources') count.textContent = txt;
  }

  // ── Chips ──
  function renderChips() {
    const host = $('gl-chips');
    if (!host) return;
    const f = readControls();
    const chips = [];
    if (f.q) chips.push(['search', `“${f.q}”`]);
    if (f.type) chips.push(['type', typeLabel(f.type)]);
    if (f.st) chips.push(['state', f.st]);
    if (f.method) chips.push(['method', methodLabel(f.method)]);
    if (f.verify) chips.push(['verify', f.verify === 'needs_email' ? 'Needs email' : verifyBadge(f.verify).label]);
    if (f.hasEmail) chips.push(['hasEmail', 'Has email']);
    host.innerHTML = chips
      .map(([k, label]) => `<button type="button" class="gl-chip" data-chip="${esc(k)}">${esc(label)}<span class="gl-chip-x" aria-hidden="true">×</span></button>`)
      .join('');
    host.hidden = chips.length === 0;
  }

  function clearChip(kind) {
    if (kind === 'search' && $('gl-search')) $('gl-search').value = '';
    if (kind === 'type' && $('gl-type')) $('gl-type').value = '';
    if (kind === 'state' && $('gl-state')) {
      $('gl-state').value = '';
      loadSourcesForState('').then(() => applyFilters()).catch(() => applyFilters());
      return;
    }
    if (kind === 'method' && $('gl-method')) $('gl-method').value = '';
    if (kind === 'verify' && $('gl-verify')) $('gl-verify').value = '';
    if (kind === 'hasEmail' && $('gl-has-email')) $('gl-has-email').checked = false;
    applyFilters();
  }

  // ── URL state ──
  function writeUrl(f) {
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams;
      const set = (k, v) => { if (v) p.set(k, v); else p.delete(k); };
      set('q', f.q);
      set('type', f.type);
      set('state', f.st);
      set('method', f.method);
      set('status', f.verify);
      set('email', f.hasEmail ? '1' : '');
      set('sort', `${state.sortKey}:${state.sortDir}`);
      window.history.replaceState({}, '', url);
    } catch (_) { /* ignore */ }
  }

  function readUrl() {
    try {
      const p = new URLSearchParams(window.location.search || '');
      if (p.get('tab') === 'playbooks') state.tab = 'playbooks';
      if ($('gl-search') && p.get('q')) $('gl-search').value = p.get('q');
      const type = p.get('type') || '';
      if (type && $('gl-type') && state.listTypes.some((t) => t.id === type)) $('gl-type').value = type;
      if (p.get('state') && $('gl-state')) $('gl-state').value = p.get('state');
      if (p.get('method') && $('gl-method')) $('gl-method').value = p.get('method');
      if (p.get('status') && $('gl-verify')) $('gl-verify').value = p.get('status');
      if (p.get('email') === '1' && $('gl-has-email')) $('gl-has-email').checked = true;
      const sort = p.get('sort') || '';
      if (sort.includes(':')) {
        const [k, d] = sort.split(':');
        state.sortKey = k;
        state.sortDir = d === 'desc' ? 'desc' : 'asc';
      }
      if ($('gl-sort')) $('gl-sort').value = `${state.sortKey}:${state.sortDir}`;
    } catch (_) { /* ignore */ }
  }

  // ── Virtualized rows ──
  function rowHTML(s, i) {
    const b = verifyBadge(s.verifyStatus);
    const sel = state.selected.has(s.id) ? ' is-selected' : '';
    const active = s.id === state.openId ? ' is-active' : '';
    const cursor = i === state.activeIndex ? ' is-cursor' : '';
    const checked = state.selected.has(s.id) ? 'checked' : '';
    const label = placeLabel(s);
    const contact = (s.contactEmail && String(s.contactEmail).trim())
      ? esc(s.contactEmail)
      : (needsSendEmail(s) ? '<span class="gl-need">needs email</span>' : '<span class="gl-dash">—</span>');
    return `<div class="gl-row${sel}${active}${cursor}" role="row" data-id="${esc(s.id)}" data-i="${i}" style="top:${i * ROW_HEIGHT}px">
      <span class="gl-td gl-td-select"><input type="checkbox" class="gl-row-check" data-id="${esc(s.id)}" ${checked} tabindex="-1" aria-label="Select ${esc(label)}"></span>
      <span class="gl-td gl-td-place" title="${esc(label)}">${esc(label)}</span>
      <span class="gl-td gl-td-list">${esc(typeLabel(s.listType))}</span>
      <span class="gl-td gl-td-method" title="${esc(methodLabel(s.method))}">${esc(methodShort(s.method))}</span>
      <span class="gl-td gl-td-status"><span class="gl-badge ${b.cls}">${esc(b.label)}</span></span>
      <span class="gl-td gl-td-contact">${contact}</span>
      <span class="gl-td gl-td-verified">${esc(fmtVerified(s.lastVerified))}</span>
    </div>`;
  }

  function renderRows() {
    const rowsEl = $('gl-rows');
    const vp = $('gl-viewport');
    const empty = $('gl-empty');
    if (!rowsEl || !vp) return;

    const rows = state.filtered;
    if (!rows.length) {
      rowsEl.style.height = '0px';
      rowsEl.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    rowsEl.style.height = (rows.length * ROW_HEIGHT) + 'px';
    const scrollTop = vp.scrollTop;
    const vpH = vp.clientHeight || 480;
    let start = Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN;
    let end = Math.ceil((scrollTop + vpH) / ROW_HEIGHT) + OVERSCAN;
    start = Math.max(0, start);
    end = Math.min(rows.length, end);

    let html = '';
    for (let i = start; i < end; i++) html += rowHTML(rows[i], i);
    rowsEl.innerHTML = html;
  }

  function onViewportScroll() {
    if (state.scrollScheduled) return;
    state.scrollScheduled = true;
    requestAnimationFrame(() => {
      state.scrollScheduled = false;
      renderRows();
    });
  }

  function moveCursor(delta) {
    const n = state.filtered.length;
    if (!n) return;
    let idx = state.activeIndex < 0 ? 0 : state.activeIndex + delta;
    idx = Math.max(0, Math.min(n - 1, idx));
    state.activeIndex = idx;
    const vp = $('gl-viewport');
    if (vp) {
      const top = idx * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (bottom > vp.scrollTop + vp.clientHeight) vp.scrollTop = bottom - vp.clientHeight;
    }
    renderRows();
  }

  // ── Sort headers ──
  function setSort(key) {
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = key === 'verified' ? 'desc' : 'asc';
    }
    if ($('gl-sort')) $('gl-sort').value = `${state.sortKey}:${state.sortDir}`;
    updateSortHeaders();
    applyFilters();
  }

  function updateSortHeaders() {
    document.querySelectorAll('.gl-th-sort').forEach((btn) => {
      const k = btn.getAttribute('data-sort');
      if (k === state.sortKey) btn.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      else btn.removeAttribute('aria-sort');
    });
  }

  // ── Selection + bulk ──
  function updateSelectAll() {
    const cb = $('gl-select-all');
    if (!cb) return;
    const ids = state.filtered.map((s) => s.id);
    const selCount = ids.filter((id) => state.selected.has(id)).length;
    cb.checked = ids.length > 0 && selCount === ids.length;
    cb.indeterminate = selCount > 0 && selCount < ids.length;
  }

  function updateBulkBar() {
    const bar = $('gl-bulkbar');
    const count = $('gl-bulk-count');
    if (!bar) return;
    const n = state.selected.size;
    bar.hidden = n === 0;
    if (count) count.textContent = `${n.toLocaleString()} selected`;
  }

  function selectedRows() {
    const out = [];
    state.selected.forEach((id) => {
      const r = state.byId.get(id);
      if (r) out.push(r);
    });
    return out;
  }

  function toggleRowSelection(id, on) {
    if (on) state.selected.add(id);
    else state.selected.delete(id);
    updateSelectAll();
    updateBulkBar();
  }

  async function bulkCopyEmails() {
    const rows = selectedRows();
    const emails = [...new Set(rows.map((r) => (r.contactEmail || '').trim()).filter(Boolean))];
    const missing = rows.length - rows.filter((r) => (r.contactEmail || '').trim()).length;
    if (!emails.length) { showToast('None of the selected rows have an email'); return; }
    try {
      await navigator.clipboard.writeText(emails.join('\n'));
      showToast(`Copied ${emails.length} email${emails.length === 1 ? '' : 's'}${missing ? ` · ${missing} had none` : ''}`);
    } catch (_) {
      showToast('Could not copy — clipboard blocked');
    }
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function bulkExportCsv() {
    const rows = selectedRows();
    if (!rows.length) return;
    const header = ['place', 'list_type', 'method', 'status', 'url', 'email', 'verified', 'notes'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        placeLabel(r), typeLabel(r.listType), methodLabel(r.method),
        (verifyBadge(r.verifyStatus).label), r.url || '', r.contactEmail || '',
        fmtVerified(r.lastVerified), r.notes || ''
      ].map(csvCell).join(','));
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `government-lists-selection-${rows.length}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    showToast(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  }

  function bulkStartRequests() {
    const rows = selectedRows();
    if (!rows.length) return;
    const types = new Set(rows.map((r) => r.listType));
    const allCollect = [...types].every((t) => t === 'code_violation');
    const allPreLien = [...types].every((t) => t === 'pre_lien');
    if (allCollect) { window.open('/collect', '_blank', 'noopener'); showToast(`Opening Collect for ${rows.length} row${rows.length === 1 ? '' : 's'}`); return; }
    if (allPreLien) { window.open('/pre-liens', '_blank', 'noopener'); showToast(`Opening Pre-liens for ${rows.length} row${rows.length === 1 ? '' : 's'}`); return; }
    const worklist = rows.map((r) => [placeLabel(r), typeLabel(r.listType), methodLabel(r.method), r.contactEmail || '', r.url || ''].join('\t')).join('\n');
    navigator.clipboard.writeText(worklist).then(
      () => showToast(`Mixed list types — worklist for ${rows.length} rows copied; open the matching desk per row`),
      () => showToast('Mixed list types — could not copy worklist')
    );
  }

  // ── Detail drawer (handoffs preserved) ──
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
      : (needsSendEmail(src)
        ? '<span class="gl-needsmail-note">No send-to email yet — find the clerk/code-enforcement address before sending.</span>'
        : '—');

    const collectLink = (src.listType === 'code_violation')
      ? `<a class="phuglee-btn phuglee-btn-primary" href="/collect">Open Collect</a>` : '';
    const preLienLink = src.listType === 'pre_lien'
      ? `<a class="phuglee-btn phuglee-btn-primary" href="/pre-liens">Open Pre-liens desk</a>` : '';
    const pbLink = src.county && src.state
      ? `<button type="button" class="phuglee-btn phuglee-btn-ghost" id="gl-open-county-pb" data-county="${esc(src.county)}" data-state="${esc(src.state)}">County playbook</button>` : '';
    const filterLink = `<a class="phuglee-btn phuglee-btn-ghost" href="/filter">Open Filter</a>`;
    const openUrl = src.url
      ? `<a class="phuglee-btn phuglee-btn-ghost" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : '';

    body.innerHTML = `
      <div class="gl-detail-badges"><span class="gl-badge ${verifyBadge(src.verifyStatus).cls}">${esc(verifyBadge(src.verifyStatus).label)}</span>${needsSendEmail(src) ? '<span class="gl-badge gl-badge--needsmail">No email</span>' : ''}</div>
      <dl class="gl-kv"><dt>List type</dt><dd>${esc(typeLabel(src.listType))}</dd></dl>
      <dl class="gl-kv"><dt>Method</dt><dd>${esc(methodLabel(src.method))}</dd></dl>
      <dl class="gl-kv"><dt>Cadence</dt><dd>${esc(src.cadence || '—')}</dd></dl>
      <dl class="gl-kv"><dt>URL</dt><dd>${urlHtml}</dd></dl>
      <dl class="gl-kv"><dt>Email</dt><dd>${emailHtml}</dd></dl>
      <dl class="gl-kv"><dt>Last verified</dt><dd>${esc(fmtVerified(src.lastVerified))}</dd></dl>
      <dl class="gl-kv"><dt>Notes</dt><dd>${esc(src.notes || '—')}</dd></dl>
      <div class="gl-actions">${openUrl}${preLienLink}${pbLink}${collectLink}${filterLink}
        ${src.requestTemplate ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" id="gl-copy-template">Copy request text</button>' : ''}
      </div>
      ${src.requestTemplate ? `<p class="gl-label">Request template</p><pre class="gl-template" id="gl-template-text">${esc(src.requestTemplate)}</pre>` : ''}
    `;

    const copyBtn = $('gl-copy-template');
    if (copyBtn && src.requestTemplate) {
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(src.requestTemplate); showToast('Request text copied'); }
        catch (_) { showToast('Could not copy — select the text manually'); }
      });
    }

    const pbBtn = $('gl-open-county-pb');
    if (pbBtn) pbBtn.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      openOrCreatePlaybook(btn.getAttribute('data-county') || '', btn.getAttribute('data-state') || '');
    });
  }

  function openSource(id) {
    const src = state.byId.get(id) || null;
    state.openId = src ? src.id : null;
    renderRows();
    renderDetail(src);
  }

  // ── County Playbooks (unchanged behavior) ──
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
    const res = await fetch(PLAYBOOKS_URL, { headers: authHeaders(), credentials: 'same-origin', cache: 'no-store' });
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
    if (!payload.county || !payload.state) { showToast('County and state are required'); return; }
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
    if (!id) { showToast('Nothing to delete'); return; }
    if (!window.confirm('Delete this county playbook?')) return;
    try {
      const res = await fetch(`${PLAYBOOKS_URL}/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: authHeaders(), credentials: 'same-origin'
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

  function renderResearchProgress(catalog) {
    const host = $('gl-research-progress');
    const statsEl = $('gl-research-progress-stats');
    if (!host || !statsEl) return;
    const rp = catalog && catalog.researchProgress;
    if (!rp || !rp.totalSlots) { host.hidden = true; return; }
    const by = rp.byStatus || {};
    const verified = by.verified || 0;
    const pdf = by.pdf_only || 0;
    const email = by.email_only || 0;
    const pending = (by.unverified || 0) + (by.seeded_from_forge || 0);
    const blocked = (by.blocked || 0) + (by.not_found || 0);
    const publishable = rp.publishable != null ? rp.publishable : verified + pdf + email;
    statsEl.innerHTML = [
      ['Slots', rp.totalSlots], ['Verified', verified], ['PDF', pdf], ['Email', email],
      ['Publishable', publishable], ['Pending', pending], ['Blocked/NF', blocked],
      ['Wave A', (rp.byWave && rp.byWave.A) || '—'], ['Wave B', (rp.byWave && rp.byWave.B) || '—'],
      ['Wave C', (rp.byWave && rp.byWave.C) || '—']
    ].map(([label, val]) => `<span class="gl-research-stat"><span>${esc(label)}</span><strong>${esc(val)}</strong></span>`).join('');
    host.hidden = false;
  }

  // ── Binding ──
  function bind() {
    document.querySelectorAll('.gl-tab').forEach((tab) => {
      tab.addEventListener('click', () => setTab(tab.getAttribute('data-tab')));
    });

    const searchEl = $('gl-search');
    if (searchEl) searchEl.addEventListener('input', applyFilters);
    const stateEl = $('gl-state');
    if (stateEl) {
      stateEl.addEventListener('change', () => {
        const st = stateEl.value || '';
        loadSourcesForState(st).then(() => applyFilters()).catch((err) => {
          console.warn(err);
          showToast('Could not load sources for that state');
        });
      });
    }
    ['gl-method', 'gl-verify', 'gl-has-email', 'gl-hide-playbook'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('change', applyFilters);
    });

    const sortEl = $('gl-sort');
    if (sortEl) sortEl.addEventListener('change', () => {
      const [k, d] = sortEl.value.split(':');
      state.sortKey = k; state.sortDir = d === 'desc' ? 'desc' : 'asc';
      updateSortHeaders();
      applyFilters();
    });

    document.querySelectorAll('.gl-th-sort').forEach((btn) => {
      btn.addEventListener('click', () => setSort(btn.getAttribute('data-sort')));
    });

    $('gl-type-rail')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      const type = btn.getAttribute('data-type');
      const sel = $('gl-type');
      if (!sel) return;
      sel.value = sel.value === type ? '' : type;
      applyFilters();
    });

    $('gl-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) clearChip(chip.getAttribute('data-chip'));
    });

    $('gl-clear')?.addEventListener('click', () => {
      ['gl-search', 'gl-type', 'gl-state', 'gl-method', 'gl-verify'].forEach((id) => {
        const el = $(id); if (el) el.value = '';
      });
      if ($('gl-has-email')) $('gl-has-email').checked = false;
      applyFilters();
    });

    const vp = $('gl-viewport');
    if (vp) {
      vp.addEventListener('scroll', onViewportScroll, { passive: true });
      vp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
        else if (e.key === 'Enter') {
          if (state.activeIndex >= 0 && state.filtered[state.activeIndex]) openSource(state.filtered[state.activeIndex].id);
        } else if (e.key === 'Escape') {
          if (state.openId) { state.openId = null; renderDetail(null); renderRows(); }
        }
      });
    }

    $('gl-rows')?.addEventListener('click', (e) => {
      const check = e.target.closest('.gl-row-check');
      if (check) { toggleRowSelection(check.getAttribute('data-id'), check.checked); renderRows(); return; }
      const row = e.target.closest('[data-id]');
      if (row) {
        state.activeIndex = Number(row.getAttribute('data-i'));
        openSource(row.getAttribute('data-id'));
      }
    });

    $('gl-select-all')?.addEventListener('change', (e) => {
      const on = e.target.checked;
      state.filtered.forEach((s) => { if (on) state.selected.add(s.id); else state.selected.delete(s.id); });
      updateSelectAll(); updateBulkBar(); renderRows();
    });

    $('gl-bulk-emails')?.addEventListener('click', bulkCopyEmails);
    $('gl-bulk-csv')?.addEventListener('click', bulkExportCsv);
    $('gl-bulk-start')?.addEventListener('click', bulkStartRequests);
    $('gl-bulk-clear')?.addEventListener('click', () => {
      state.selected.clear(); updateSelectAll(); updateBulkBar(); renderRows();
    });

    $('gl-detail-close')?.addEventListener('click', () => {
      state.openId = null; renderDetail(null); renderRows();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && state.tab === 'sources') {
        const tag = (e.target && e.target.tagName) || '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          $('gl-search')?.focus();
        }
      }
    });

    window.addEventListener('resize', () => { if (state.tab === 'sources') renderRows(); });

    $('gl-pb-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pb-id]');
      if (btn) selectPlaybook(btn.getAttribute('data-pb-id'));
    });

    $('gl-pb-new')?.addEventListener('click', () => {
      state.activePlaybookId = null;
      renderPlaybookList();
      fillPlaybookForm({
        county: '', state: '', assetFocus: 'houses',
        preLien: { cadence: 'weekly', caseTypes: 'Small claims / civil debt (pre-judgment)' },
        assessor: { notes: 'Confirm defendant ≈ owner before outreach.' },
        lists: {}
      });
      $('gl-pb-county')?.focus();
    });

    $('gl-pb-form')?.addEventListener('submit', savePlaybook);
    $('gl-pb-delete')?.addEventListener('click', deleteActivePlaybook);
  }

  function priorityMap() {
    const priority = {};
    state.listTypes.forEach((t) => { priority[t.id] = t.priority || 99; });
    return priority;
  }

  function rebuildById() {
    state.byId = new Map();
    state.merged.concat(state.howto).forEach((s) => state.byId.set(s.id, s));
  }

  /**
   * Load sources for one state (Wave 1). Empty state clears the table.
   */
  async function loadSourcesForState(st) {
    const code = String(st || '').trim().toUpperCase();
    if (!code) {
      state.merged = [];
      rebuildById();
      applyFilters();
      return;
    }

    try {
      localStorage.setItem(LAST_STATE_KEY, code);
    } catch (_) { /* ignore */ }

    const res = await fetch(`${SOURCES_URL}?state=${encodeURIComponent(code)}`, { cache: 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = (data && data.sources) || [];
    const priority = priorityMap();
    state.merged = GLN ? GLN.mergeSources(raw, priority) : raw.slice();
    rebuildById();
  }

  async function init() {
    bind();
    ensureListSlots();

    try {
      const res = await fetch(META_URL, { cache: 'default' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const meta = (payload && payload.meta) || payload || {};
      state.catalog = meta;
      state.listTypes = meta.listTypes || [];
      state.methods = meta.methods || [];
      renderResearchProgress(meta);

      const howtoRaw = meta.howto || [];
      state.howto = howtoRaw.map((s) => Object.assign({}, s, {
        state: GLN ? GLN.normalizeState(s.state) : s.state
      }));
      state.merged = [];
      rebuildById();

      const stateOpts = Object.keys(meta.stateCounts || {})
        .sort()
        .map((v) => ({ value: v, label: v, count: meta.stateCounts[v] }));

      fillSelect($('gl-type'), state.listTypes.map((t) => ({ value: t.id, label: t.label })), 'All types');
      fillSelect($('gl-method'), state.methods.map((m) => ({ value: m.id, label: m.label })), 'All methods');
      fillSelect($('gl-state'), stateOpts, 'Pick a state…');
      fillSelect($('gl-verify'), [
        { value: 'verified', label: 'Verified' },
        { value: 'pdf_only', label: 'PDF only' },
        { value: 'email_only', label: 'Email only' },
        { value: 'unverified', label: 'Unverified' },
        { value: 'needs_email', label: 'Needs send-to email' }
      ], 'Any status');

      readUrl();
      updateSortHeaders();

      let initialState = ($('gl-state') && $('gl-state').value) || '';
      if (!initialState) {
        try { initialState = localStorage.getItem(LAST_STATE_KEY) || ''; } catch (_) { initialState = ''; }
        if (initialState && $('gl-state') && stateOpts.some((o) => o.value === initialState)) {
          $('gl-state').value = initialState;
        } else {
          initialState = ($('gl-state') && $('gl-state').value) || '';
        }
      }

      if (initialState) {
        await loadSourcesForState(initialState);
      } else {
        // Data is loaded in meta — don't show a blank "0 sources" void.
        // Prefer last-used or TX so the table fills on first paint.
        const preferred = ['TX', 'OH', 'FL', 'CA', 'PA'].find((c) =>
          stateOpts.some((o) => o.value === c)
        );
        if (preferred && $('gl-state')) {
          $('gl-state').value = preferred;
          await loadSourcesForState(preferred);
        } else {
          applyFilters();
        }
      }

      try { await loadPlaybooks(); }
      catch (err) { console.warn(err); showToast('Playbooks failed to load — sources still available'); }

      setTab(state.tab);

      const params = new URLSearchParams(window.location.search || '');
      const playbookQ = params.get('playbook') || '';
      if (playbookQ && state.playbooks.some((p) => p.id === playbookQ)) selectPlaybook(playbookQ);
      const countyQ = params.get('county');
      const stateQ = params.get('state');
      if (!playbookQ && countyQ && stateQ && params.get('tab') === 'playbooks') openOrCreatePlaybook(countyQ, stateQ);
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
