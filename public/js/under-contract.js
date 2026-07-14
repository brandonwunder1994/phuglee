(function () {
  'use strict';

  const ADMIN = 'admin';
  const STAGE_LABELS = {
    under_contract: 'Under contract',
    buyer_found: 'Buyer found',
    closing: 'Closing',
    funded: 'Funded'
  };

  const state = {
    deals: [],
    totals: null,
    ghlConfigured: false,
    editingId: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function sessionUser() {
    try {
      if (window.PhugleeAuthSession && typeof window.PhugleeAuthSession.getUser === 'function') {
        return window.PhugleeAuthSession.getUser();
      }
    } catch (_) { /* ignore */ }
    try {
      return localStorage.getItem('phuglee_session') || '';
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

  function showToast(msg) {
    const el = $('uc-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function money(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Number(n));
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

  function renderKpis(totals) {
    const t = totals || {};
    const by = t.byStage || {};
    $('uc-kpi-uc').textContent = String(by.under_contract || t.underContract || 0);
    $('uc-kpi-buyer').textContent = String(by.buyer_found || t.buyerFound || 0);
    $('uc-kpi-closing').textContent = String(by.closing || t.closing || 0);
    $('uc-kpi-funded').textContent = String(by.funded || t.funded || 0);
    $('uc-kpi-fees').textContent = money(t.totalAssignmentFees || 0);
    $('uc-kpi-profit').textContent = money(t.totalProfit || 0);
  }

  function renderTable(deals) {
    const tbody = $('uc-tbody');
    const table = $('uc-table');
    const empty = $('uc-empty');
    const count = $('uc-board-count');
    if (!tbody) return;

    if (!deals.length) {
      table.hidden = true;
      empty.hidden = false;
      count.textContent = '0 deals';
      tbody.innerHTML = '';
      return;
    }

    empty.hidden = true;
    table.hidden = false;
    count.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;

    tbody.innerHTML = deals.map((d) => {
      const loc = [d.city, d.state, d.zip].filter(Boolean).join(', ');
      const stage = STAGE_LABELS[d.stage] || d.stage || '—';
      const ghlLink = d.ghlContactId
        ? `<a class="phuglee-btn phuglee-btn-ghost" href="https://app.gohighlevel.com/" target="_blank" rel="noopener noreferrer" title="Open GHL">GHL</a>`
        : '';
      return `<tr data-deal-id="${esc(d.dealId)}">
        <td>
          <span class="uc-addr">${esc(d.address || '—')}</span>
          <span class="uc-addr-meta">${esc(loc)}${d.ownerName ? ' · ' + esc(d.ownerName) : ''}</span>
          ${d.ghlStageName ? `<span class="uc-addr-meta">GHL: ${esc(d.ghlStageName)}</span>` : ''}
        </td>
        <td><span class="uc-stage" data-stage="${esc(d.stage)}">${esc(stage)}</span></td>
        <td class="uc-money">${esc(money(d.purchasePrice))}</td>
        <td class="uc-money">${esc(money(d.assignmentFee))}</td>
        <td class="uc-money">${esc(money(d.profit))}</td>
        <td>${esc(d.cashBuyerName || '—')}</td>
        <td>${esc(d.closingDate || '—')}</td>
        <td>${esc(d.source || '—')}</td>
        <td>
          <div class="uc-row-actions">
            <button type="button" class="phuglee-btn phuglee-btn-secondary" data-action="edit">Edit</button>
            <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="release">Release</button>
            ${ghlLink}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  async function loadDeals() {
    const data = await api('/api/leads/admin/contracts');
    state.deals = data.deals || [];
    state.totals = data.totals || null;
    state.ghlConfigured = !!data.ghlConfigured;
    renderKpis(state.totals);
    renderTable(state.deals);

    const status = $('uc-ghl-status');
    const syncBtn = $('uc-sync-ghl');
    if (status) {
      if (!state.ghlConfigured) {
        status.hidden = false;
        status.classList.add('is-warn');
        status.textContent = 'GHL not configured — set GHL_API_KEY and GHL_LOCATION_ID, then Sync.';
      } else {
        status.hidden = false;
        status.classList.remove('is-warn');
        status.textContent = 'GHL connected · Sync pulls DTS Seller Signed → Funded.';
      }
    }
    if (syncBtn) syncBtn.disabled = false;
  }

  function openEdit(deal) {
    state.editingId = deal.dealId;
    $('uc-edit-id').value = deal.dealId;
    $('uc-edit-stage').value = deal.stage || 'under_contract';
    $('uc-edit-purchase').value = deal.purchasePrice ?? '';
    $('uc-edit-fee').value = deal.assignmentFee ?? '';
    $('uc-edit-profit').value = deal.profitOverride ?? '';
    $('uc-edit-buyer').value = deal.cashBuyerName || '';
    $('uc-edit-closing').value = deal.closingDate || '';
    $('uc-edit-notes').value = deal.notes || '';
    $('uc-edit-title').textContent = deal.address || 'Edit deal';
    $('uc-edit-dialog').showModal();
  }

  async function saveEdit(ev) {
    ev.preventDefault();
    const submitter = ev.submitter;
    if (submitter && submitter.value === 'cancel') {
      $('uc-edit-dialog').close();
      return;
    }
    const id = $('uc-edit-id').value;
    const body = {
      stage: $('uc-edit-stage').value,
      purchasePrice: $('uc-edit-purchase').value === '' ? null : Number($('uc-edit-purchase').value),
      assignmentFee: $('uc-edit-fee').value === '' ? null : Number($('uc-edit-fee').value),
      profitOverride: $('uc-edit-profit').value === '' ? null : Number($('uc-edit-profit').value),
      cashBuyerName: $('uc-edit-buyer').value.trim(),
      closingDate: $('uc-edit-closing').value.trim(),
      notes: $('uc-edit-notes').value.trim()
    };
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      $('uc-edit-dialog').close();
      showToast('Deal updated');
      await loadDeals();
    } catch (err) {
      showToast(err.message || 'Save failed');
    }
  }

  async function releaseDeal(dealId, address) {
    if (!window.confirm(`Release ${address || 'this deal'} back to The Vault?`)) return;
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/release`, {
        method: 'POST',
        body: '{}'
      });
      showToast('Released to Vault');
      await loadDeals();
    } catch (err) {
      showToast(err.message || 'Release failed');
    }
  }

  async function syncGhl() {
    const btn = $('uc-sync-ghl');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing…';
    }
    try {
      const data = await api('/api/leads/admin/contracts/sync-ghl', {
        method: 'POST',
        body: '{}'
      });
      state.deals = data.deals || [];
      state.totals = data.totals || null;
      renderKpis(state.totals);
      renderTable(state.deals);
      const s = data.sync || {};
      showToast(`Synced ${s.upserted || 0} of ${s.scanned || 0} GHL opportunities`);
    } catch (err) {
      showToast(err.message || 'GHL sync failed');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sync from GHL';
      }
    }
  }

  function bind() {
    $('uc-sync-ghl')?.addEventListener('click', () => { syncGhl(); });
    $('uc-edit-form')?.addEventListener('submit', saveEdit);
    $('uc-tbody')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const row = btn.closest('tr[data-deal-id]');
      if (!row) return;
      const dealId = row.getAttribute('data-deal-id');
      const deal = state.deals.find((d) => d.dealId === dealId);
      if (!deal) return;
      if (btn.dataset.action === 'edit') openEdit(deal);
      if (btn.dataset.action === 'release') releaseDeal(deal.dealId, deal.address);
    });
  }

  async function init() {
    const gate = $('uc-gate');
    const app = $('uc-app');
    if (!isAdmin()) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    bind();
    try {
      await loadDeals();
    } catch (err) {
      showToast(err.message || 'Could not load contracts');
      if (err.status === 403 && gate) {
        gate.hidden = false;
        app.hidden = true;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
