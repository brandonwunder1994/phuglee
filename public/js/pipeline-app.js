(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const STAGES = [
    { id: 'interested', label: 'Interested', side: 'acq' },
    { id: 'warm', label: 'Warm', side: 'acq' },
    { id: 'verbal_offer', label: 'Verbal offer', side: 'acq' },
    { id: 'contract_sent', label: 'Contract sent', side: 'acq' },
    { id: 'under_contract', label: 'Under contract', side: 'dispo' },
    { id: 'buyer_signed_aoc', label: 'Buyer Signed AOC', side: 'dispo' },
    { id: 'buyer_found', label: 'Buyer Submitted EMD', side: 'dispo' },
    { id: 'funded', label: 'Funded', side: 'dispo' },
    { id: 'terminated', label: 'Terminated', side: 'dispo' }
  ];
  const DISPO = new Set(['under_contract', 'buyer_signed_aoc', 'buyer_found', 'funded', 'terminated']);

  const state = { deals: [], ghlConfigured: false };

  function $(id) {
    return document.getElementById(id);
  }

  function sessionUser() {
    try {
      if (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function') {
        return window.PhugleeSession.getSessionUser() || '';
      }
    } catch (_) { /* ignore */ }
    try {
      return sessionStorage.getItem('phuglee_session') || '';
    } catch (_) {
      return '';
    }
  }

  function isAdmin() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    return sessionUser() === ADMIN;
  }

  function isContractDesk() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    const user = sessionUser();
    return user === ADMIN || user === DISPOS;
  }

  function isBrad() {
    return sessionUser() === DISPOS;
  }

  function applyAdminOnlyUi() {
    if (isAdmin()) return;
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.hidden = true;
    });
  }

  function showToast(msg) {
    const el = $('pipe-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    try {
      const user = (window.PhugleeSession && window.PhugleeSession.getSessionUser
        && window.PhugleeSession.getSessionUser())
        || sessionStorage.getItem('phuglee_session')
        || '';
      if (user && !headers['X-Phuglee-User']) headers['X-Phuglee-User'] = user;
      if ((user === ADMIN || user === DISPOS) && !headers['X-Phuglee-Plan']) {
        headers['X-Phuglee-Plan'] = 'max';
      }
    } catch (_) { /* ignore */ }
    const res = await fetch(path, {
      ...opts,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function photoUrl(d) {
    return d?.thumbUrl || d?.streetViewUrl || d?.satelliteUrl || '';
  }

  function cityLine(d) {
    return [d.city, d.state].filter(Boolean).join(', ')
      + (d.zip ? ` ${d.zip}` : '');
  }

  function thumbHtml(d) {
    const url = photoUrl(d);
    if (url) {
      return `<img class="pipe-card-thumb" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'pipe-card-thumb pipe-card-thumb--empty',textContent:'SV'}))">`;
    }
    return '<div class="pipe-card-thumb pipe-card-thumb--empty" aria-hidden="true">SV</div>';
  }

  function isClickable(d) {
    if (isAdmin()) return true;
    return DISPO.has(d.stage);
  }

  function cardHtml(d) {
    const clickable = isClickable(d);
    const restricted = Boolean(d.restricted) || (isBrad() && !DISPO.has(d.stage));
    const tag = clickable ? 'button' : 'div';
    const attrs = clickable
      ? `type="button" class="pipe-card pipe-card--clickable" data-deal-id="${esc(d.dealId)}" data-stage="${esc(d.stage)}"`
      : `class="pipe-card${restricted ? ' pipe-card--restricted' : ''}" data-deal-id="${esc(d.dealId)}" data-stage="${esc(d.stage)}"`;
    const hint = clickable && DISPO.has(d.stage)
      ? '<span class="pipe-card-hint">Open in Contract Tracker</span>'
      : '';
    return `<${tag} ${attrs}>
      ${thumbHtml(d)}
      <span class="pipe-card-body">
        <span class="pipe-card-addr">${esc(d.address || '—')}</span>
        <span class="pipe-card-meta">${esc(cityLine(d) || '—')}</span>
        ${hint}
      </span>
    </${tag}>`;
  }

  function renderBoard(deals) {
    const board = $('pipe-board');
    const empty = $('pipe-empty');
    if (!board) return;

    const list = Array.isArray(deals) ? deals : [];
    if (empty) empty.hidden = list.length > 0;

    const byStage = Object.fromEntries(STAGES.map((s) => [s.id, []]));
    for (const d of list) {
      if (byStage[d.stage]) byStage[d.stage].push(d);
      else if (byStage.interested) byStage.interested.push(d);
    }

    const parts = [];
    for (const s of STAGES) {
      if (s.id === 'under_contract') {
        parts.push(`<div class="pipe-rail" aria-hidden="true">
          <span class="pipe-rail-label pipe-rail-label--acq">Acq</span>
          <span class="pipe-rail-bar"></span>
          <span class="pipe-rail-label pipe-rail-label--dispo">Dispo</span>
        </div>`);
      }
      const cards = byStage[s.id] || [];
      const side = s.side === 'dispo' ? 'dispo' : 'acq';
      parts.push(`<section class="pipe-col pipe-col--${side}" data-stage="${esc(s.id)}" data-side="${side}" aria-label="${esc(s.label)}">
        <div class="pipe-col-head">
          <p class="pipe-col-side">${side === 'acq' ? 'Acquisitions' : 'Disposition'}</p>
          <div class="pipe-col-head-row">
            <h2 class="pipe-col-title">${esc(s.label)}</h2>
            <span class="pipe-col-count">${cards.length}</span>
          </div>
        </div>
        <div class="pipe-col-body">
          ${cards.map(cardHtml).join('') || '<p class="pipe-card-meta pipe-col-empty">No deals</p>'}
        </div>
      </section>`);
    }
    board.innerHTML = parts.join('');
  }

  async function loadDeals() {
    const data = await api('/api/leads/admin/contracts?board=pipeline');
    state.deals = Array.isArray(data.deals) ? data.deals : [];
    state.ghlConfigured = Boolean(data.ghlConfigured);
    const status = $('pipe-ghl-status');
    if (status && isAdmin()) {
      status.hidden = false;
      status.textContent = state.ghlConfigured
        ? 'GHL connected · Sync: Interested → Warm → Verbal → Contract sent → Under contract → Buyer Signed AOC → Buyer EMD → Funded → Terminated'
        : 'GHL not configured — set GHL_API_KEY and GHL_LOCATION_ID';
    }
    renderBoard(state.deals);
  }

  async function syncGhl() {
    const btn = $('pipe-sync-ghl');
    if (btn) btn.disabled = true;
    try {
      const data = await api('/api/leads/admin/contracts/sync-ghl', { method: 'POST', body: '{}' });
      state.deals = Array.isArray(data.deals)
        ? data.deals
        : state.deals;
      // Re-fetch with pipeline board projection
      await loadDeals();
      const n = data.sync?.upserted ?? state.deals.length;
      showToast(`Synced ${n} deal${n === 1 ? '' : 's'} from GHL`);
    } catch (err) {
      showToast(err.message || 'Sync failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function onBoardClick(ev) {
    const card = ev.target.closest('[data-deal-id].pipe-card--clickable');
    if (!card) return;
    const dealId = card.getAttribute('data-deal-id');
    const stage = card.getAttribute('data-stage');
    if (!dealId) return;
    if (DISPO.has(stage) || isAdmin()) {
      if (DISPO.has(stage)) {
        window.location.href = `/under-contract?deal=${encodeURIComponent(dealId)}`;
        return;
      }
      // Admin on sales stage — still no full desk for early; glance only for now
      // (plan: admin can open; Contract Tracker is for UC+)
      showToast('Early sales stages are managed in GHL. Move to Under Contract to edit in Phuglee.');
    }
  }

  function boot() {
    if (!isContractDesk()) {
      $('pipe-gate').hidden = false;
      $('pipe-app').hidden = true;
      return;
    }
    $('pipe-gate').hidden = true;
    $('pipe-app').hidden = false;
    applyAdminOnlyUi();
    if (isBrad()) {
      const note = $('pipe-brad-note');
      if (note) note.hidden = false;
    }
    $('pipe-sync-ghl')?.addEventListener('click', () => { syncGhl(); });
    $('pipe-board')?.addEventListener('click', onBoardClick);
    loadDeals().catch((err) => {
      showToast(err.message || 'Failed to load pipeline');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
