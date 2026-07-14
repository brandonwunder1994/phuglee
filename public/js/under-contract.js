(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const STAGE_LABELS = {
    under_contract: 'Under contract',
    buyer_found: 'Buyer found',
    closing: 'Closing',
    funded: 'Funded'
  };
  const DOC_LABELS = {
    purchase_contract: 'Purchase contract',
    addendum: 'Addendum',
    amendment: 'Amendment',
    aoc: 'AOC',
    jv: 'JV agreement',
    other: 'Other'
  };
  const POLL_MS = 12000;
  const MSG_POLL_MS = 5000;

  const state = {
    deals: [],
    totals: null,
    goal: null,
    ghlConfigured: false,
    editingId: null,
    activeDealId: null,
    profile: null,
    contact: null,
    messages: [],
    teamMessages: [],
    unreadTeam: [],
    unreadSellerSms: [],
    fromNumber: null,
    toNumber: null,
    pollTimer: null,
    msgPollTimer: null,
    goalTickTimer: null,
    deepLinkHandled: false,
    lastInboundToastId: null
  };

  function teamUserKey() {
    const u = sessionUser();
    if (u === DISPOS) return 'brad';
    if (u === ADMIN) return 'admin';
    return isAdmin() ? 'admin' : 'brad';
  }

  function teamDisplayName(user) {
    if (user === 'brad') return 'Brad';
    if (user === 'admin') return 'Brandon';
    return user || 'Teammate';
  }

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

  function applyAdminOnlyUi() {
    if (isAdmin()) return;
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.hidden = true;
    });
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
    // Cookie is primary; also send identity headers so local/dev and sticky
    // sessionStorage keep Brad authenticated if the cookie is ever missing.
    try {
      const user = (window.PhugleeSession && window.PhugleeSession.getSessionUser
        && window.PhugleeSession.getSessionUser())
        || sessionStorage.getItem('phuglee_session')
        || '';
      if (user && !headers['X-Phuglee-User']) headers['X-Phuglee-User'] = user;
      if (user === ADMIN && !headers['X-Phuglee-Plan']) headers['X-Phuglee-Plan'] = 'max';
      if (user === DISPOS && !headers['X-Phuglee-Plan']) headers['X-Phuglee-Plan'] = 'max';
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

  /** Persist desk field changes — POST preferred (PATCH blocked on some networks). */
  async function saveDealFields(dealId, body) {
    const id = encodeURIComponent(dealId);
    const payload = JSON.stringify(body || {});
    try {
      return await api(`/api/leads/admin/contracts/${id}`, {
        method: 'POST',
        body: payload
      });
    } catch (err) {
      if (err.status === 404 || err.status === 405) {
        return api(`/api/leads/admin/contracts/${id}`, {
          method: 'PATCH',
          body: payload
        });
      }
      throw err;
    }
  }

  function mergeDealIntoState(deal) {
    if (!deal || !deal.dealId) return;
    const idx = state.deals.findIndex((d) => d.dealId === deal.dealId);
    if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...deal };
    else state.deals.unshift(deal);
    if (state.activeDealId === deal.dealId) {
      state.profile = { ...(state.profile || {}), ...deal };
    }
    renderTable(state.deals);
  }

  function photoUrl(d) {
    return d?.thumbUrl || d?.streetViewUrl || d?.satelliteUrl || '';
  }

  function thumbHtml(d, sizeClass) {
    const url = photoUrl(d);
    if (url) {
      return `<img class="${sizeClass}" src="${esc(url)}" alt="${esc(d.address || 'Property')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${sizeClass} uc-thumb--empty',textContent:'SV'}))">`;
    }
    return `<div class="${sizeClass} uc-thumb--empty" aria-hidden="true">SV</div>`;
  }

  function openPhotoLightbox(url, alt) {
    const box = $('uc-lightbox');
    const img = $('uc-lightbox-img');
    if (!box || !img || !url) return;
    img.src = url;
    img.alt = alt || 'Property photo';
    box.hidden = false;
  }

  function closePhotoLightbox() {
    const box = $('uc-lightbox');
    const img = $('uc-lightbox-img');
    if (box) box.hidden = true;
    if (img) img.removeAttribute('src');
  }

  function renderKpis(totals) {
    const t = totals || {};
    const by = t.byStage || {};
    $('uc-kpi-uc').textContent = String(by.under_contract || t.underContract || 0);
    $('uc-kpi-buyer').textContent = String(by.buyer_found || t.buyerFound || 0);
    $('uc-kpi-closing').textContent = String(by.closing || t.closing || 0);
    if ($('uc-kpi-open-fees')) {
      $('uc-kpi-open-fees').textContent = money(t.openAssignmentFees || 0);
    }
    $('uc-kpi-funded').textContent = String(by.funded || t.funded || t.closedCount || 0);
    $('uc-kpi-fees').textContent = money(t.closedAssignmentFees ?? t.totalAssignmentFees ?? 0);
    if ($('uc-kpi-tc')) $('uc-kpi-tc').textContent = money(t.closedTcPay ?? t.totalTcPay ?? 0);
    if ($('uc-kpi-acq')) $('uc-kpi-acq').textContent = money(t.closedAcqPay ?? t.totalAcqPay ?? 0);
    if ($('uc-kpi-dispo')) $('uc-kpi-dispo').textContent = money(t.closedDispoPay ?? t.totalDispoPay ?? 0);
  }

  function formatCountdown(msRemaining, expired) {
    if (expired || msRemaining <= 0) {
      return { value: '0', label: 'window ended' };
    }
    // ceil so a fresh 60-day window shows "60" (not "59" after a few seconds)
    const daysLeft = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (msRemaining >= 2 * 86400000) {
      return { value: String(daysLeft), label: 'days left' };
    }
    if (msRemaining >= 86400000) {
      return {
        value: `1d ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
        label: 'left'
      };
    }
    return {
      value: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      label: 'left today'
    };
  }

  function formatGoalEndDate(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    return new Date(t).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function tickGoalCountdown() {
    const goal = state.goal;
    if (!goal || !$('uc-goal-countdown')) return;
    const endsAt = Date.parse(goal.endsAt);
    const msRemaining = Number.isFinite(endsAt)
      ? Math.max(0, endsAt - Date.now())
      : Number(goal.msRemaining) || 0;
    const expired = Boolean(goal.expired) || msRemaining <= 0;
    const formatted = formatCountdown(msRemaining, expired);
    $('uc-goal-countdown').textContent = formatted.value;
    if ($('uc-goal-countdown-label')) {
      $('uc-goal-countdown-label').textContent = formatted.label;
    }
    if ($('uc-goal-ends')) {
      const endLabel = formatGoalEndDate(goal.endsAt);
      $('uc-goal-ends').textContent = endLabel
        ? (expired ? `Ended ${endLabel}` : `Ends ${endLabel}`)
        : '';
    }
  }

  function renderGoal(goal) {
    const panel = $('uc-goal');
    if (!panel) return;
    const g = goal || {};
    state.goal = g;
    const current = Number(g.currentCount) || 0;
    const target = Number(g.targetCount) || 10;
    const pct = Number.isFinite(Number(g.percentToGoal))
      ? Math.max(0, Math.min(100, Number(g.percentToGoal)))
      : Math.min(100, Math.round((current / Math.max(1, target)) * 100));
    const remaining = Number.isFinite(Number(g.remainingToGoal))
      ? Math.max(0, Number(g.remainingToGoal))
      : Math.max(0, target - current);
    const met = Boolean(g.met) || current >= target;

    if ($('uc-goal-current')) $('uc-goal-current').textContent = String(current);
    if ($('uc-goal-target')) $('uc-goal-target').textContent = String(target);
    if ($('uc-goal-pct')) {
      $('uc-goal-pct').textContent = met ? 'Goal hit — keep going' : `${pct}% to goal`;
    }
    if ($('uc-goal-remaining')) {
      $('uc-goal-remaining').textContent = met
        ? `${current} funded this window`
        : `${remaining} to go`;
    }
    const fill = $('uc-goal-bar-fill');
    const bar = $('uc-goal-bar');
    if (fill) fill.style.width = `${pct}%`;
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuetext', `${current} of ${target} funded (${pct}%)`);
    }
    panel.classList.toggle('is-met', met);

    tickGoalCountdown();
    if (state.goalTickTimer) clearInterval(state.goalTickTimer);
    state.goalTickTimer = setInterval(tickGoalCountdown, 1000);
  }

  const UC_TZ = 'America/Phoenix';

  function parseSmsMs(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return NaN;
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      return raw.length <= 10 ? n * 1000 : n;
    }
    // Bare ISO without offset = UTC (GHL).
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
      return Date.parse(`${raw}Z`);
    }
    return Date.parse(raw);
  }

  function formatUcWhen(value, { withWeekday = false } = {}) {
    const ms = parseSmsMs(value);
    if (!Number.isFinite(ms)) return '';
    const opts = {
      timeZone: UC_TZ,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    };
    if (withWeekday) opts.weekday = 'short';
    const year = new Date(ms).toLocaleString('en-US', { timeZone: UC_TZ, year: 'numeric' });
    const nowYear = new Date().toLocaleString('en-US', { timeZone: UC_TZ, year: 'numeric' });
    if (year !== nowYear) opts.year = 'numeric';
    return new Date(ms).toLocaleString('en-US', opts);
  }

  function formatUcRelative(value) {
    const ms = parseSmsMs(value);
    if (!Number.isFinite(ms)) return '';
    const diff = Date.now() - ms;
    if (diff < 0) return 'just now';
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return formatUcWhen(value);
  }

  function azCalendarKey(ms) {
    return new Date(ms).toLocaleDateString('en-US', {
      timeZone: UC_TZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  }

  function formatSellerSmsAlertTime(iso) {
    const ms = parseSmsMs(iso);
    if (!Number.isFinite(ms)) return '';
    const time = new Date(ms).toLocaleString('en-US', {
      timeZone: UC_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
    const msgDay = azCalendarKey(ms);
    const today = azCalendarKey(Date.now());
    const yesterday = azCalendarKey(Date.now() - 86400000);
    if (msgDay === today) return `${time} Today`;
    if (msgDay === yesterday) return `${time} Yesterday`;
    const date = new Date(ms).toLocaleDateString('en-US', {
      timeZone: UC_TZ,
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    });
    return `${time} ${date}`;
  }

  function sellerSmsHoverTitle(deal) {
    return formatSellerSmsAlertTime(deal?.sellerSmsAt || deal?.sellerSms?.lastInboundAt)
      || 'Seller text';
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
      const { street, cityLine } = propertyLines(d);
      const stage = STAGE_LABELS[d.stage] || d.stage || '—';
      const releaseBtn = isAdmin()
        ? '<button type="button" class="phuglee-btn phuglee-btn-ghost uc-release-btn" data-action="release" data-admin-only>Release</button>'
        : '';
      return `<tr data-deal-id="${esc(d.dealId)}" class="uc-row-clickable">
        <td class="uc-property-cell">
          <div class="uc-property-block">
            <div class="uc-property-main">
              <button type="button" class="uc-thumb-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">
                ${thumbHtml(d, 'uc-thumb')}
              </button>
              <button type="button" class="uc-property-btn" data-action="open">
                <span class="uc-property-text">
                  <span class="uc-addr">${esc(street)}</span>
                  <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
                </span>
              </button>
              ${d.sellerSmsUnread
                ? `<button type="button" class="uc-sms-alert" data-action="open-seller-sms" title="${esc(sellerSmsHoverTitle(d))}" aria-label="${esc(sellerSmsHoverTitle(d))}">💬</button>`
                : ''}
            </div>
            <div class="uc-property-quick">
              <button type="button" class="uc-quick-btn" data-action="buyer-found">Buyer Found</button>
              <button type="button" class="uc-quick-btn uc-quick-btn--jv" data-action="send-jv">Send JV</button>
              <button type="button" class="uc-quick-btn uc-quick-btn--amd" data-action="amendment">Amendment</button>
            </div>
          </div>
        </td>
        <td><span class="uc-stage" data-stage="${esc(d.stage)}">${esc(stage)}</span></td>
        <td class="uc-money">${esc(money(d.purchasePrice))}</td>
        <td class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.titleOpened || '')}">${esc(d.titleOpenedLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.sellerEmdSubmitted || '')}">${esc(d.sellerEmdLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--access" data-access="${esc(d.accessType || '')}">${esc(d.accessDisplay || d.accessLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--vacancy" data-vacancy="${esc(d.vacancy || '')}">${esc(d.vacancyLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.photosAvailable || '')}">${esc(d.photosLabel || '—')}</span></td>
        <td>
          <button type="button" class="uc-rehab-cell" data-action="view-rehab" title="View rehab info">
            <span class="uc-pill uc-pill--yn" data-yn="${esc(d.rehabInfoReady || '')}">${esc(d.rehabInfoLabel || '—')}</span>
            <span class="uc-rehab-link">Click Here</span>
          </button>
        </td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.buyerFound || '')}">${esc(d.buyerFoundLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.buyerEmdSubmitted || '')}">${esc(d.buyerEmdLabel || '—')}</span></td>
        <td>
          <button type="button" class="uc-funded-cell" data-action="view-funded" title="Funded breakdown">
            <span class="uc-pill uc-pill--yn" data-yn="${esc(d.funded || '')}">${esc(d.fundedLabel || '—')}</span>
            <span class="uc-funded-link">Click here</span>
          </button>
        </td>
        <td>
          <div class="uc-row-actions">
            <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="edit">Edit</button>
            ${releaseBtn}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  /** Street on line 1; city, state zip on line 2 — never stack the full one-line address. */
  function propertyLines(deal) {
    const city = String(deal.city || '').trim();
    const state = String(deal.state || '').trim();
    const zip = String(deal.zip || deal.postalCode || '').trim();
    const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    let street = String(deal.address || '').trim();
    if (street && city && street.toLowerCase().includes(city.toLowerCase())) {
      const cut = street.toLowerCase().lastIndexOf(city.toLowerCase());
      if (cut > 0) street = street.slice(0, cut).replace(/[,\s]+$/, '');
    }
    return { street: street || '—', cityLine };
  }

  function renderTeamBanner() {
    // Prefer site-wide banner (all pages); keep page-local banner hidden.
    const local = $('uc-team-banner');
    if (local) local.hidden = true;
    if (window.PhugleeTeamAlertBanner && typeof window.PhugleeTeamAlertBanner.render === 'function') {
      window.PhugleeTeamAlertBanner.render(state.unreadTeam || []);
      return;
    }
    const banner = $('uc-team-banner');
    const text = $('uc-team-banner-text');
    if (!banner || !text) return;
    const items = state.unreadTeam || [];
    if (!items.length) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const first = items[0];
    const n = items.reduce((sum, it) => sum + (Number(it.count) || 1), 0);
    const who = teamDisplayName(first.fromUser);
    const addr = first.address || 'a deal';
    text.textContent = n === 1
      ? `1 new team message — ${who} on ${addr}`
      : `${n} new team message(s) — e.g. ${who} on ${addr}`;
  }

  async function loadDeals(opts = {}) {
    const data = await api('/api/leads/admin/contracts');
    state.deals = data.deals || [];
    state.totals = data.totals || null;
    state.goal = data.goal || null;
    state.ghlConfigured = !!data.ghlConfigured;
    state.unreadTeam = data.unreadTeam || [];
    state.unreadSellerSms = data.unreadSellerSms || [];
    renderKpis(state.totals);
    renderGoal(state.goal);
    renderTable(state.deals);
    renderTeamBanner();
    syncProfileSmsPulse();

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
        status.textContent = 'GHL connected · Sync pulls DTS Seller Signed → Funded · Open a deal to text from the last outbound line.';
      }
    }
    if (syncBtn) syncBtn.disabled = false;

    if (!opts.silent && !state.deepLinkHandled) {
      state.deepLinkHandled = true;
      await handleDeepLink();
    }
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    stopMsgPoll();
  }

  function stopMsgPoll() {
    if (state.msgPollTimer) {
      clearInterval(state.msgPollTimer);
      state.msgPollTimer = null;
    }
  }

  function startMsgPoll() {
    stopMsgPoll();
    if (!state.activeDealId) return;
    state.msgPollTimer = setInterval(() => {
      if (state.activeDealId) {
        loadMessages(state.activeDealId, { silent: true }).catch(() => {});
      }
    }, MSG_POLL_MS);
  }

  function startPoll() {
    stopPoll();
    state.pollTimer = setInterval(() => {
      loadDeals({ silent: true }).catch(() => {});
      if (state.activeDealId) refreshTeamMessagesFromState();
    }, POLL_MS);
    startMsgPoll();
  }

  function ensureBoardPoll() {
    if (!state.pollTimer) {
      state.pollTimer = setInterval(() => {
        loadDeals({ silent: true }).catch(() => {});
      }, POLL_MS);
    }
    if (state.activeDealId) startMsgPoll();
    else stopMsgPoll();
  }

  function syncProfileSmsPulse() {
    const pulse = $('uc-sms-pulse');
    if (!pulse) return;
    const deal = state.profile
      || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId))
      || null;
    const unread = !!(deal?.sellerSmsUnread);
    pulse.hidden = !unread;
    pulse.classList.toggle('is-flash', unread);
    const tip = sellerSmsHoverTitle(deal);
    pulse.title = tip;
    pulse.setAttribute('aria-label', tip);
    syncMarkReadButton(unread);
  }

  function syncMarkReadButton(unreadExplicit) {
    const btn = $('uc-sms-mark-read');
    if (!btn) return;
    const deal = state.profile
      || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId))
      || null;
    const unread = unreadExplicit != null ? !!unreadExplicit : !!(deal?.sellerSmsUnread);
    btn.hidden = !unread;
  }

  function applySellerSmsDealPatch(deal, unreadList) {
    if (Array.isArray(unreadList)) state.unreadSellerSms = unreadList;
    if (!deal?.dealId) {
      syncProfileSmsPulse();
      return false;
    }
    const idx = state.deals.findIndex((d) => d.dealId === deal.dealId);
    const prevUnread = idx >= 0 ? !!state.deals[idx].sellerSmsUnread : null;
    if (idx >= 0) {
      state.deals[idx] = {
        ...state.deals[idx],
        ...deal,
        sellerSmsUnread: deal.sellerSmsUnread,
        sellerSmsAt: deal.sellerSmsAt ?? state.deals[idx].sellerSmsAt,
        sellerSmsPreview: deal.sellerSmsPreview ?? state.deals[idx].sellerSmsPreview,
        sellerSms: deal.sellerSms || state.deals[idx].sellerSms
      };
    }
    if (state.profile?.dealId === deal.dealId) {
      state.profile = {
        ...state.profile,
        ...deal,
        sellerSmsUnread: deal.sellerSmsUnread,
        sellerSmsAt: deal.sellerSmsAt ?? state.profile.sellerSmsAt,
        sellerSmsPreview: deal.sellerSmsPreview ?? state.profile.sellerSmsPreview,
        sellerSms: deal.sellerSms || state.profile.sellerSms,
        sellerMedia: deal.sellerMedia || state.profile.sellerMedia
      };
    }
    const nextUnread = !!deal.sellerSmsUnread;
    syncProfileSmsPulse();
    return prevUnread !== nextUnread;
  }

  function pulseSellerSmsSection() {
    const pulse = $('uc-sms-pulse');
    if (pulse) {
      pulse.hidden = false;
      pulse.classList.add('is-flash');
    }
    $('uc-convo-section')?.classList.add('uc-convo--alert');
    setTimeout(() => $('uc-convo-section')?.classList.remove('uc-convo--alert'), 2500);
  }

  function scrollToSellerSms() {
    requestAnimationFrame(() => {
      $('uc-convo-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('uc-sms-input')?.focus?.();
    });
  }

  function refreshTeamMessagesFromState() {
    if (!state.activeDealId) return;
    const deal = state.deals.find((d) => d.dealId === state.activeDealId)
      || state.profile;
    if (!deal) return;
    state.teamMessages = deal.teamMessages || [];
    if (state.profile && state.profile.dealId === deal.dealId) {
      state.profile = { ...state.profile, ...deal, teamMessages: state.teamMessages };
    }
    renderTeamMessages();
  }

  async function handleDeepLink() {
    let dealId = '';
    try {
      dealId = new URLSearchParams(window.location.search).get('deal') || '';
    } catch (_) { /* ignore */ }
    if (!dealId) return;
    await openProfile(dealId, { scrollToTeam: true, markTeamRead: true });
  }

  async function openUnreadFromBanner() {
    const first = (state.unreadTeam || [])[0];
    if (!first?.dealId) return;
    await openProfile(first.dealId, { scrollToTeam: true, markTeamRead: true });
  }

  function isThreadNearBottom(el, thresholdPx = 96) {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= thresholdPx;
  }

  function mediaProxyUrl(dealId, url) {
    return `/api/leads/admin/contracts/${encodeURIComponent(dealId)}/media-proxy?url=${encodeURIComponent(url)}`;
  }

  function normalizeMediaUrlKey(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      // Strip volatile query signatures but keep path identity.
      return `${u.origin}${u.pathname}`.toLowerCase();
    } catch (_) {
      return raw.split('?')[0].split('#')[0].toLowerCase();
    }
  }

  function savedMediaUrlKeys() {
    const set = new Set();
    for (const m of (state.profile?.sellerMedia || [])) {
      const a = normalizeMediaUrlKey(m.sourceUrl);
      const b = normalizeMediaUrlKey(m.originalUrl);
      if (a) set.add(a);
      if (b) set.add(b);
    }
    return set;
  }

  function isMediaAlreadySaved(url) {
    const key = normalizeMediaUrlKey(url);
    if (!key) return false;
    return savedMediaUrlKeys().has(key);
  }

  function collectThreadMediaItems() {
    const items = [];
    const seen = new Set();
    for (const m of state.messages || []) {
      const atts = Array.isArray(m.attachments) ? m.attachments.filter(Boolean) : [];
      atts.forEach((url, i) => {
        const key = String(url);
        const norm = normalizeMediaUrlKey(key);
        if (!key || seen.has(norm || key)) return;
        seen.add(norm || key);
        items.push({
          url: key,
          messageId: m.id || null,
          name: `seller-${(m.id || 'msg').slice(-6)}-${i + 1}`
        });
      });
    }
    return items;
  }

  function syncSaveAllMediaButton() {
    const btn = $('uc-sms-save-all-media');
    if (!btn) return;
    const items = collectThreadMediaItems();
    const unsaved = items.filter((it) => !isMediaAlreadySaved(it.url));
    btn.hidden = !unsaved.length;
    btn.disabled = !unsaved.length;
    btn.classList.toggle('is-disabled', !unsaved.length);
    btn.textContent = unsaved.length > 1
      ? `Save all media (${unsaved.length})`
      : (unsaved.length === 1 ? 'Save media' : 'All media saved');
  }

  function isVideoUrl(url, mime) {
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('video/')) return true;
    return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(url || ''));
  }

  function renderMedia(list) {
    const box = $('uc-media-grid');
    const zip = $('uc-media-zip');
    if (!box) return;
    const media = Array.isArray(list) ? list : (state.profile?.sellerMedia || []);
    if (zip) {
      if (media.length && state.activeDealId) {
        zip.hidden = false;
        zip.href = `/api/leads/admin/contracts/${encodeURIComponent(state.activeDealId)}/media/zip`;
        zip.setAttribute('download', 'property-media.zip');
      } else {
        zip.hidden = true;
        zip.removeAttribute('href');
      }
    }
    if (!media.length) {
      box.innerHTML = '<p class="uc-media-empty">No saved media yet. Hover a photo/video in Texts and click Save, or use Save all media.</p>';
      return;
    }
    box.innerHTML = media.map((m) => {
      const video = m.kind === 'video' || isVideoUrl(m.viewUrl || m.name, m.mimeType);
      const src = m.viewUrl || '';
      const preview = video
        ? `<video src="${esc(src)}" muted playsinline preload="metadata"></video>`
        : `<img src="${esc(src)}" alt="${esc(m.name || 'Media')}" loading="lazy">`;
      return `<div class="uc-media-card" data-media-id="${esc(m.id)}">
        ${preview}
        <div class="uc-media-card-actions">
          <a href="${esc(m.downloadUrl || (src + (src.includes('?') ? '&' : '?') + 'download=1'))}" download>Download</a>
          <button type="button" data-media-action="remove">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderMessages(opts = {}) {
    const box = $('uc-convo-thread');
    if (!box) return;
    const forceScroll = opts.forceScroll === true;
    const stickToBottom = forceScroll || isThreadNearBottom(box);
    const prevScroll = box.scrollTop;
    if (!state.messages.length) {
      box.innerHTML = '<p class="uc-convo-empty">No SMS yet. Send the first message below.</p>';
      syncSaveAllMediaButton();
      return;
    }
    const saved = savedMediaUrlKeys();
    const dealId = state.activeDealId;
    box.innerHTML = state.messages.map((m) => {
      const outbound = m.direction === 'outbound' || m.direction === 'out';
      const when = formatUcWhen(m.dateAdded);
      const body = (m.body || '').trim();
      const att = Array.isArray(m.attachments) ? m.attachments.filter(Boolean) : [];
      const attHtml = att.length
        ? `<div class="uc-bubble-atts">${att.map((url, i) => {
          const isSaved = isMediaAlreadySaved(url);
          const video = isVideoUrl(url);
          const proxy = dealId ? mediaProxyUrl(dealId, url) : url;
          const preview = video
            ? `<video src="${esc(proxy)}" muted playsinline preload="metadata"></video>`
            : `<img src="${esc(proxy)}" alt="Attachment ${i + 1}" loading="lazy">`;
          return `<figure class="uc-att-tile${isSaved ? ' is-saved' : ''}" data-att-url="${esc(url)}" data-msg-id="${esc(m.id || '')}" data-saved="${isSaved ? '1' : '0'}">
            ${preview}
            <button type="button" class="uc-att-save${isSaved ? ' is-saved' : ''}" data-action="save-media" ${isSaved ? 'disabled aria-disabled="true"' : ''} title="${isSaved ? 'Already in Media' : 'Save to Media'}">${isSaved ? 'In Media' : 'Save'}</button>
          </figure>`;
        }).join('')}</div>`
        : '';
      const label = body
        || (att.length
          ? `📷 ${att.length} ${att.length === 1 ? 'attachment' : 'attachments'}`
          : '');
      return `<div class="uc-bubble ${outbound ? 'uc-bubble--out' : 'uc-bubble--in'}">
        <div class="uc-bubble-body">${body ? esc(body) : (attHtml ? '' : esc('(no text)'))}${attHtml}</div>
        <div class="uc-bubble-meta">${outbound ? 'You' : 'Them'}${when ? ' · ' + esc(when) + ' AZ' : ''}</div>
      </div>`;
    }).join('');
    if (stickToBottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = prevScroll;
    syncSaveAllMediaButton();
  }

  async function loadMessages(dealId, opts = {}) {
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/messages`);
    state.messages = data.messages || [];
    state.fromNumber = data.fromNumber || null;
    state.toNumber = data.toNumber || null;
    const meta = $('uc-convo-meta');
    if (meta) {
      meta.textContent = state.fromNumber && state.toNumber
        ? `From ${state.fromNumber} → ${state.toNumber}`
        : (data.warning || 'SMS numbers resolving…');
    }
    renderMessages({ forceScroll: opts.forceScroll === true });
    // Opening/polling must NOT clear unread — only Mark as read or a reply does.
    const boardChanged = applySellerSmsDealPatch(data.deal, data.unreadSellerSms);
    if (boardChanged) renderTable(state.deals);
    if (!opts.silent) showToast(`Loaded ${state.messages.length} messages`);
  }

  async function markSellerSmsRead(dealId) {
    const id = dealId || state.activeDealId;
    if (!id) return;
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/messages/seen`, {
      method: 'POST',
      body: '{}'
    });
    const boardChanged = applySellerSmsDealPatch(data.deal, data.unreadSellerSms);
    if (boardChanged) renderTable(state.deals);
    showToast('Marked as read');
  }

  async function saveSellerMediaItems(items, { toastLabel } = {}) {
    const dealId = state.activeDealId;
    if (!dealId || !items.length) return null;
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/media`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
    if (data.deal) {
      state.profile = { ...state.profile, ...data.deal, sellerMedia: data.sellerMedia || data.deal.sellerMedia || [] };
    } else if (data.sellerMedia) {
      state.profile = { ...state.profile, sellerMedia: data.sellerMedia };
    }
    renderMedia(state.profile.sellerMedia || []);
    renderMessages({ forceScroll: false });
    const saved = data.saved || 0;
    const skipped = data.skipped || 0;
    const failed = data.failed || 0;
    if (toastLabel) showToast(toastLabel);
    else if (failed && !saved) showToast(`Could not save media (${failed} failed)`);
    else if (saved) showToast(`Saved ${saved} media item${saved === 1 ? '' : 's'}${skipped ? ` · ${skipped} already saved` : ''}`);
    else if (skipped) showToast('Already saved');
    return data;
  }

  async function saveOneThreadMedia(url, messageId, btn) {
    if (!url || !state.activeDealId) return;
    if (isMediaAlreadySaved(url)) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'In Media';
        btn.classList.add('is-saved');
        btn.closest('.uc-att-tile')?.classList.add('is-saved');
      }
      showToast('Already in Media');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }
    try {
      await saveSellerMediaItems([{ url, messageId, name: `seller-${Date.now()}` }]);
      if (btn) {
        btn.textContent = 'In Media';
        btn.classList.add('is-saved');
        btn.setAttribute('aria-disabled', 'true');
        btn.closest('.uc-att-tile')?.classList.add('is-saved');
        btn.closest('.uc-att-tile')?.setAttribute('data-saved', '1');
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
      showToast(err.message || 'Save failed');
    }
  }

  async function saveAllThreadMedia() {
    const items = collectThreadMediaItems().filter((it) => !isMediaAlreadySaved(it.url));
    if (!items.length) {
      showToast('All thread media already in Media');
      syncSaveAllMediaButton();
      return;
    }
    const btn = $('uc-sms-save-all-media');
    if (btn) btn.disabled = true;
    try {
      await saveSellerMediaItems(items);
    } catch (err) {
      showToast(err.message || 'Save all failed');
    } finally {
      if (btn) btn.disabled = false;
      syncSaveAllMediaButton();
    }
  }

  async function removeSavedMedia(mediaId) {
    const dealId = state.activeDealId;
    if (!dealId || !mediaId) return;
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/media/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
      body: '{}'
    });
    if (data.deal) state.profile = { ...state.profile, ...data.deal };
    state.profile.sellerMedia = data.sellerMedia || data.deal?.sellerMedia || [];
    renderMedia(state.profile.sellerMedia);
    renderMessages({ forceScroll: false });
    showToast('Removed from Media');
  }

  function renderProfile(deal, contact) {
    state.profile = deal;
    state.contact = contact;
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (!drawer) return;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('uc-drawer-open');

    $('uc-drawer-title').textContent = deal.address || 'Contract profile';
    const url = photoUrl(deal);
    const heroPhoto = url
      ? `<button type="button" class="uc-profile-hero-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">${thumbHtml(deal, 'uc-profile-hero')}</button>`
      : thumbHtml(deal, 'uc-profile-hero');
    $('uc-drawer-hero').innerHTML = heroPhoto +
      `<div class="uc-profile-hero-copy">
        <p class="uc-stage" data-stage="${esc(deal.stage)}">${esc(STAGE_LABELS[deal.stage] || deal.stage)}</p>
        <h2>${esc(deal.address || '—')}</h2>
        <p>${esc([deal.city, deal.state, deal.zip].filter(Boolean).join(', '))}</p>
      </div>`;

    const rows = [
      ['Owner / seller', deal.ownerName || contact?.sellersName || contact?.name || '—'],
      ['Phone', deal.phone || contact?.phone || '—'],
      ['Email', deal.email || contact?.email || '—'],
      ['Purchase price', money(deal.purchasePrice)],
      ['Assignment fee', money(deal.assignmentFee)],
      ['Photo cost', money(deal.photoCost ?? 0)],
      ['Funded', deal.fundedLabel || '—'],
      ['Buyer found?', deal.buyerFoundLabel || '—'],
      ['Cash buyer', deal.cashBuyerName || contact?.cashBuyerName || '—'],
      ['Closing', deal.closingDate || contact?.closingDate || '—'],
      ['EMD Submitted?', deal.sellerEmdLabel || '—'],
      ['Buyer EMD?', deal.buyerEmdLabel || '—'],
      ['Access', deal.accessDisplay || deal.accessLabel || '—'],
      ['Vacancy', deal.vacancyLabel || '—'],
      ['Photos?', deal.photosLabel || '—'],
      ['Notes', deal.notes || '—']
    ];
    $('uc-drawer-facts').innerHTML = rows.map(([k, v]) =>
      `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
    ).join('');

    fillRehabForm(deal.rehabInfo || {});
    fillPhotoCostForm(deal);
    state.teamMessages = deal.teamMessages || [];
    renderTeamMessages();
    renderDocuments(deal.documents || []);
    renderMedia(deal.sellerMedia || []);
    renderDocsPending(deal);
    closeDocViewer();
    $('uc-convo-thread').innerHTML = '<p class="uc-convo-empty">Loading conversation…</p>';
    $('uc-sms-input').value = '';
    if ($('uc-team-input')) $('uc-team-input').value = '';
    syncProfileSmsPulse();
  }

  function fillPhotoCostForm(deal) {
    if ($('uc-profile-photos')) $('uc-profile-photos').value = deal.photosAvailable || '';
    if ($('uc-profile-photo-cost')) {
      $('uc-profile-photo-cost').value = deal.photoCost != null ? deal.photoCost : 0;
    }
  }

  const TEAM_REACTIONS = [
    { key: 'like', emoji: '👍', label: 'Like' },
    { key: 'dislike', emoji: '👎', label: 'Dislike' },
    { key: 'laugh', emoji: '😂', label: 'Laugh' },
    { key: 'explain', emoji: '❗', label: 'Important' },
    { key: 'fire', emoji: '🔥', label: 'Fire' },
    { key: 'hundred', emoji: '💯', label: '100' }
  ];

  function reactionCount(reactions, key) {
    const r = reactions?.[key] || {};
    return (r.admin ? 1 : 0) + (r.brad ? 1 : 0);
  }

  function renderTeamMessages(opts = {}) {
    const box = $('uc-team-thread');
    if (!box) return;
    const keepScroll = opts.keepScroll === true;
    const prevScroll = box.scrollTop;
    const msgs = state.teamMessages || [];
    if (!msgs.length) {
      box.innerHTML = '<p class="uc-convo-empty">No internal messages yet. Message Brandon or Brad here.</p>';
      return;
    }
    const me = teamUserKey();
    box.innerHTML = msgs.map((m) => {
      const mine = m.fromUser === me;
      const when = formatUcWhen(m.createdAt);
      const reactions = m.reactions || {};
      const appliedHtml = TEAM_REACTIONS.map((r) => {
        const count = reactionCount(reactions, r.key);
        if (!count) return '';
        const mineOn = !!(reactions[r.key] && reactions[r.key][me]);
        return `<button type="button" class="uc-react-chip${mineOn ? ' is-on' : ''}" data-action="team-react" data-msg-id="${esc(m.id)}" data-emoji="${esc(r.key)}" title="${esc(r.label)}" aria-label="${esc(r.label)}" aria-pressed="${mineOn ? 'true' : 'false'}">${r.emoji}<span class="uc-react-count">${count}</span></button>`;
      }).join('');
      const pickerHtml = TEAM_REACTIONS.map((r) => {
        const mineOn = !!(reactions[r.key] && reactions[r.key][me]);
        return `<button type="button" class="uc-react-btn${mineOn ? ' is-on' : ''}" data-action="team-react" data-msg-id="${esc(m.id)}" data-emoji="${esc(r.key)}" title="${esc(r.label)}" aria-label="${esc(r.label)}" aria-pressed="${mineOn ? 'true' : 'false'}">${r.emoji}</button>`;
      }).join('');
      return `<div class="uc-bubble ${mine ? 'uc-bubble--out' : 'uc-bubble--in'}" data-team-msg-id="${esc(m.id)}">
        <div class="uc-bubble-body">${esc(m.body)}</div>
        <div class="uc-bubble-meta">${esc(teamDisplayName(m.fromUser))}${when ? ' · ' + esc(when) : ''}</div>
        <div class="uc-react-row">
          ${appliedHtml ? `<div class="uc-react-applied" role="group" aria-label="Current reactions">${appliedHtml}</div>` : ''}
          <div class="uc-react-menu">
            <button type="button" class="uc-react-trigger" aria-haspopup="true" aria-expanded="false" title="Click to react">React</button>
            <div class="uc-react-picker" role="group" aria-label="Add reaction">${pickerHtml}</div>
          </div>
        </div>
      </div>`;
    }).join('');
    if (keepScroll) box.scrollTop = prevScroll;
    else box.scrollTop = box.scrollHeight;
  }

  async function toggleTeamReaction(messageId, emojiKey) {
    const dealId = state.activeDealId;
    if (!dealId || !messageId || !emojiKey) return;
    try {
      const data = await api(
        `/api/leads/admin/contracts/${encodeURIComponent(dealId)}/team-messages/${encodeURIComponent(messageId)}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji: emojiKey })
        }
      );
      if (data.deal) {
        state.teamMessages = data.deal.teamMessages || [];
        state.profile = { ...(state.profile || {}), ...data.deal };
        const idx = state.deals.findIndex((d) => d.dealId === dealId);
        if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...data.deal };
        renderTeamMessages({ keepScroll: true });
      }
    } catch (err) {
      showToast(err.message || 'Could not save reaction');
    }
  }

  async function markTeamMessagesRead(dealId) {
    if (!dealId) return;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/team-messages/read`, {
        method: 'POST',
        body: '{}'
      });
      if (Array.isArray(data.unreadTeam)) {
        state.unreadTeam = data.unreadTeam;
        renderTeamBanner();
      }
      if (data.deal) {
        state.teamMessages = data.deal.teamMessages || [];
        if (state.profile?.dealId === dealId) {
          state.profile = { ...state.profile, ...data.deal };
        }
        const idx = state.deals.findIndex((d) => d.dealId === dealId);
        if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...data.deal };
        renderTeamMessages();
      }
    } catch (_) { /* ignore */ }
  }

  async function sendTeamMessage() {
    const dealId = state.activeDealId;
    const input = $('uc-team-input');
    const text = (input?.value || '').trim();
    if (!dealId || !text) return;
    const btn = $('uc-team-send');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/team-messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text })
      });
      input.value = '';
      if (Array.isArray(data.unreadTeam)) {
        state.unreadTeam = data.unreadTeam;
        renderTeamBanner();
      }
      if (data.deal) {
        state.teamMessages = data.deal.teamMessages || [];
        state.profile = { ...(state.profile || {}), ...data.deal };
        const idx = state.deals.findIndex((d) => d.dealId === dealId);
        if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...data.deal };
        renderTeamMessages();
      }
      showToast('Team message sent');
    } catch (err) {
      showToast(err.message || 'Could not send team message');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function savePhotoCost() {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first, then save');
      return;
    }
    const btn = $('uc-photo-cost-save');
    if (btn) btn.disabled = true;
    try {
      const photoCostRaw = $('uc-profile-photo-cost')?.value;
      const body = {
        photosAvailable: $('uc-profile-photos')?.value || '',
        photoCost: photoCostRaw === '' ? 0 : Number(photoCostRaw)
      };
      const data = await saveDealFields(dealId, body);
      showToast('Photos / photo cost saved');
      if (data.deal) mergeDealIntoState(data.deal);
      await loadDeals({ silent: true });
      if (data.deal) {
        state.profile = { ...(state.profile || {}), ...data.deal };
        fillPhotoCostForm(data.deal);
        const rowsFacts = $('uc-drawer-facts');
        if (rowsFacts && state.contact) {
          // Refresh fact row money/labels without tearing down SMS thread
          const contact = state.contact;
          const deal = data.deal;
          const rows = [
            ['Owner / seller', deal.ownerName || contact?.sellersName || contact?.name || '—'],
            ['Phone', deal.phone || contact?.phone || '—'],
            ['Email', deal.email || contact?.email || '—'],
            ['Purchase price', money(deal.purchasePrice)],
            ['Assignment fee', money(deal.assignmentFee)],
            ['Photo cost', money(deal.photoCost ?? 0)],
            ['Funded', deal.fundedLabel || '—'],
            ['Buyer found?', deal.buyerFoundLabel || '—'],
            ['Cash buyer', deal.cashBuyerName || contact?.cashBuyerName || '—'],
            ['Closing', deal.closingDate || contact?.closingDate || '—'],
            ['EMD Submitted?', deal.sellerEmdLabel || '—'],
            ['Buyer EMD?', deal.buyerEmdLabel || '—'],
            ['Access', deal.accessDisplay || deal.accessLabel || '—'],
            ['Vacancy', deal.vacancyLabel || '—'],
            ['Photos?', deal.photosLabel || '—'],
            ['Notes', deal.notes || '—']
          ];
          rowsFacts.innerHTML = rows.map(([k, v]) =>
            `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
          ).join('');
        }
      }
    } catch (err) {
      showToast(err.message || 'Could not save photo cost');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openFundedView(deal) {
    const dialog = $('uc-funded-dialog');
    if (!dialog || !deal) return;
    $('uc-funded-title').textContent = 'Funded breakdown';
    $('uc-funded-address').textContent = deal.address
      ? `${deal.address}${deal.city ? ` · ${[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}` : ''}`
      : 'Deal payouts';
    const rows = [
      ['Funded?', deal.fundedLabel || (deal.stage === 'funded' ? 'Yes' : 'No')],
      ['Assignment fee', money(deal.assignmentFee)],
      ['TC cost', money(deal.tcPay)],
      ['Photo cost', money(deal.photoCostApplied ?? deal.photoCost ?? 0)],
      ['Acq payout', money(deal.acqPay)],
      ['Dispo payout', money(deal.dispoPay)]
    ];
    $('uc-funded-facts').innerHTML = rows.map(([k, v]) =>
      `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
    ).join('');
    dialog.showModal();
  }

  function closeFundedView() {
    $('uc-funded-dialog')?.close();
  }

  function fillRehabForm(rehab) {
    const r = rehab || {};
    if ($('uc-rehab-roof')) $('uc-rehab-roof').value = r.roof || '';
    if ($('uc-rehab-ac')) $('uc-rehab-ac').value = r.ac || '';
    if ($('uc-rehab-foundation')) $('uc-rehab-foundation').value = r.foundation || '';
    if ($('uc-rehab-electrical')) $('uc-rehab-electrical').value = r.electrical || '';
    if ($('uc-rehab-plumbing')) $('uc-rehab-plumbing').value = r.plumbing || '';
    if ($('uc-rehab-other')) $('uc-rehab-other').value = r.other || '';
  }

  function readRehabForm() {
    return {
      roof: ($('uc-rehab-roof')?.value || '').trim(),
      ac: ($('uc-rehab-ac')?.value || '').trim(),
      foundation: ($('uc-rehab-foundation')?.value || '').trim(),
      electrical: ($('uc-rehab-electrical')?.value || '').trim(),
      plumbing: ($('uc-rehab-plumbing')?.value || '').trim(),
      other: ($('uc-rehab-other')?.value || '').trim()
    };
  }

  async function saveRehab() {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first, then save');
      return;
    }
    const btn = $('uc-rehab-save');
    if (btn) btn.disabled = true;
    try {
      const data = await saveDealFields(dealId, { rehabInfo: readRehabForm() });
      showToast('Rehab info saved');
      if (data.deal) mergeDealIntoState(data.deal);
      await loadDeals({ silent: true });
      if (data.deal) {
        state.profile = { ...(state.profile || {}), ...data.deal };
        fillRehabForm(data.deal.rehabInfo || {});
      } else if (state.activeDealId === dealId) {
        await openProfile(dealId);
      }
    } catch (err) {
      showToast(err.message || 'Could not save rehab info');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openRehabView(deal) {
    const dialog = $('uc-rehab-view-dialog');
    if (!dialog || !deal) return;
    const rehab = deal.rehabInfo || {};
    const rows = [
      ['Roof age & condition', rehab.roof],
      ['AC age & condition', rehab.ac],
      ['Foundation', rehab.foundation],
      ['Electrical', rehab.electrical],
      ['Plumbing', rehab.plumbing],
      ['Anything else', rehab.other]
    ];
    const hasAny = rows.some(([, v]) => String(v || '').trim());
    $('uc-rehab-view-title').textContent = 'Rehab info';
    $('uc-rehab-view-address').textContent = deal.address
      ? `${deal.address}${deal.city ? ` · ${[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}` : ''}`
      : 'Property rehab details';
    const facts = $('uc-rehab-view-facts');
    if (!hasAny) {
      facts.innerHTML = '<p class="uc-docs-empty">No rehab notes yet. Open the deal profile to add them.</p>';
    } else {
      facts.innerHTML = rows.map(([k, v]) => {
        const val = String(v || '').trim() || '—';
        return `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`;
      }).join('');
    }
    dialog.showModal();
  }

  function closeRehabView() {
    $('uc-rehab-view-dialog')?.close();
  }

  function renderDocuments(docs) {
    const box = $('uc-docs-list');
    if (!box) return;
    if (!docs.length) {
      box.innerHTML = '<p class="uc-docs-empty">No documents yet. Pick a type below and click Send Document — signed PDFs return here automatically.</p>';
      return;
    }
    box.innerHTML = docs.map((d) => {
      const kind = DOC_LABELS[d.kind] || d.label || d.kind || 'Document';
      const src = d.source === 'signnow' ? ' · SignNow' : (d.source === 'ghl' ? '' : '');
      return `<div class="uc-doc-row" data-doc-id="${esc(d.id)}">
        <div class="uc-doc-row-main">
          <span class="uc-doc-kind">${esc(kind)}${esc(src)}</span>
        </div>
        <div class="uc-doc-row-actions">
          <button type="button" class="phuglee-btn phuglee-btn-secondary" data-doc-action="view">View</button>
          ${d.source !== 'ghl' ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" data-doc-action="delete">Remove</button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderDocsPending(deal) {
    const el = $('uc-docs-pending');
    if (!el) return;
    const pending = Array.isArray(deal?.signNowPending) ? deal.signNowPending : [];
    if (!pending.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = `${pending.length} SignNow package${pending.length === 1 ? '' : 's'} awaiting signatures — click Refresh signed after they finish.`;
  }

  function closeDocViewer() {
    const viewer = $('uc-doc-viewer');
    const frame = $('uc-doc-frame');
    if (viewer) viewer.hidden = true;
    if (frame) frame.removeAttribute('src');
  }

  function openDocViewer(doc) {
    const viewer = $('uc-doc-viewer');
    const frame = $('uc-doc-frame');
    const title = $('uc-doc-viewer-title');
    const openTab = $('uc-doc-open-tab');
    if (!viewer || !frame || !doc?.viewUrl) return;
    title.textContent = doc.name || 'Document';
    openTab.href = doc.viewUrl;
    frame.src = doc.viewUrl;
    viewer.hidden = false;
    viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function sendDocumentFromPanel() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const kind = $('uc-doc-kind')?.value || 'aoc';
    if (kind === 'amendment') {
      if (state.profile) openAmendment(state.profile);
      return;
    }
    if (kind === 'aoc') {
      if (state.profile) openBuyerFound(state.profile);
      return;
    }
    if (kind === 'jv') {
      if (state.profile) openSendJv(state.profile);
      return;
    }
  }

  async function refreshSignedDocuments() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const btn = $('uc-docs-refresh-sn');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/sync-signnow`, {
        method: 'POST',
        body: '{}'
      });
      const n = data.ingested || 0;
      showToast(n ? `Pulled ${n} signed document${n === 1 ? '' : 's'}` : 'No newly signed documents yet');
      if (data.deal) {
        state.profile = data.deal;
        renderDocuments(data.deal.documents || []);
        renderDocsPending(data.deal);
      }
    } catch (err) {
      showToast(err.message || 'SignNow refresh failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteDocument(docId) {
    const dealId = state.activeDealId;
    if (!dealId || !docId) return;
    if (!window.confirm('Remove this document from the profile?')) return;
    try {
      const data = await api(
        `/api/leads/admin/contracts/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      if (data.deal) {
        state.profile = data.deal;
        renderDocuments(data.deal.documents || []);
      }
      closeDocViewer();
      showToast('Document removed');
    } catch (err) {
      showToast(err.message || 'Remove failed');
    }
  }

  async function openProfile(dealId, opts = {}) {
    state.activeDealId = dealId;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}`);
      renderProfile(data.deal, data.contact);
      await loadMessages(dealId, { silent: true, forceScroll: true });
      startPoll();
      if (opts.markTeamRead) await markTeamMessagesRead(dealId);
      if (opts.scrollToTeam) {
        requestAnimationFrame(() => {
          $('uc-team-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      if (opts.scrollToSms) {
        pulseSellerSmsSection();
        scrollToSellerSms();
      }
    } catch (err) {
      showToast(err.message || 'Could not open profile');
    }
  }

  function closeProfile() {
    state.activeDealId = null;
    closeDocViewer();
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('uc-drawer-open');
    ensureBoardPoll();
  }

  function openBuyerFound(deal) {
    $('uc-buyer-deal-id').value = deal.dealId;
    $('uc-buyer-title').textContent = deal.address ? `Buyer found — ${deal.address}` : 'Buyer found';
    $('uc-buyer-entity').value = deal.cashBuyerName || deal.buyerAssignment?.buyerEntity || '';
    $('uc-buyer-contact').value = deal.buyerAssignment?.buyerContactName || '';
    $('uc-buyer-email').value = deal.buyerAssignment?.buyerEmail || '';
    $('uc-buyer-phone').value = deal.buyerAssignment?.buyerPhone || '';
    $('uc-buyer-fee').value = deal.assignmentFee ?? '';
    $('uc-buyer-closing').value = deal.closingDate || '';
    $('uc-buyer-emd').value = deal.buyerAssignment?.buyerEmd ?? '';
    $('uc-buyer-notes').value = '';
    $('uc-buyer-dialog').showModal();
  }

  const JV_PARTIES = {
    sales: {
      name: 'Brandon Wunder',
      company: 'Wunderhaus Group LLC',
      email: 'brandon@wunderhausgroup.com'
    },
    dispos: {
      name: 'Brad Lewis',
      company: 'Green Oasis Solutions',
      email: 'buyhomes995@gmail.com'
    }
  };

  function openSendJv(deal) {
    $('uc-jv-deal-id').value = deal.dealId;
    $('uc-jv-title').textContent = deal.address ? `Send JV — ${deal.address}` : 'Send JV agreement';
    $('uc-jv-dialog').showModal();
  }

  function amendmentPartyDefaults(deal, contact, party) {
    const key = party === 'end_buyer' ? 'end_buyer' : 'seller';
    const fromApi = deal?.amendmentDefaults?.[key];
    if (fromApi && (fromApi.counterpartyName || fromApi.counterpartyEmail || fromApi.originalAgreementDate)) {
      return {
        originalAgreementDate: fromApi.originalAgreementDate || '',
        name: fromApi.counterpartyName || '',
        email: fromApi.counterpartyEmail || ''
      };
    }
    if (key === 'end_buyer') {
      const ba = deal?.buyerAssignment || {};
      return {
        originalAgreementDate: deal?.originalAgreementDate || contact?.contractSignedDate || '',
        name: ba.buyerEntity || ba.buyerContactName || deal?.cashBuyerName || contact?.cashBuyerName || '',
        email: ba.buyerEmail || ''
      };
    }
    return {
      originalAgreementDate: deal?.originalAgreementDate || contact?.contractSignedDate || '',
      name: deal?.ownerName || deal?.sellerNames || contact?.sellersName || contact?.name || '',
      email: deal?.ownerEmail || deal?.email || contact?.email || ''
    };
  }

  function applyAmendmentPartyFields() {
    const deal = state._amendmentDeal;
    const contact = state._amendmentContact;
    if (!deal) return;
    const party = $('uc-amendment-party')?.value || 'seller';
    const defs = amendmentPartyDefaults(deal, contact, party);
    const isBuyer = party === 'end_buyer';
    if ($('uc-amendment-name-label')) {
      $('uc-amendment-name-label').textContent = isBuyer ? 'End buyer name' : 'Seller name';
    }
    if ($('uc-amendment-email-label')) {
      $('uc-amendment-email-label').textContent = isBuyer ? 'End buyer email' : 'Seller email';
    }
    $('uc-amendment-orig-date').value = defs.originalAgreementDate || '';
    if ($('uc-amendment-orig-date')) $('uc-amendment-orig-date').readOnly = true;
    $('uc-amendment-seller-name').value = defs.name || '';
    $('uc-amendment-seller-email').value = defs.email || '';
    const hint = $('uc-amendment-orig-hint');
    if (hint) {
      hint.textContent = defs.originalAgreementDate
        ? 'Locked to the PSA / GHL contract signed date — not editable'
        : 'No PSA signed date on file yet — open the deal or Sync from GHL first';
    }
  }

  async function openAmendment(deal) {
    let full = deal;
    let contact = (state.activeDealId === deal.dealId) ? state.contact : null;
    if (state.activeDealId === deal.dealId && state.profile) {
      full = state.profile;
    } else {
      try {
        const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}`);
        full = data.deal || deal;
        contact = data.contact || null;
      } catch (_) { /* use row data */ }
    }
    state._amendmentDeal = full;
    state._amendmentContact = contact;
    $('uc-amendment-deal-id').value = full.dealId;
    $('uc-amendment-title').textContent = full.address ? `Amendment — ${full.address}` : 'Send Amendment';
    $('uc-amendment-terms').value = '';
    if ($('uc-amendment-party')) $('uc-amendment-party').value = 'seller';
    applyAmendmentPartyFields();
    $('uc-amendment-dialog').showModal();
  }

  async function submitBuyerFound(ev) {
    ev.preventDefault();
    const id = $('uc-buyer-deal-id').value;
    const body = {
      buyerEntity: $('uc-buyer-entity').value.trim(),
      buyerContactName: $('uc-buyer-contact').value.trim(),
      buyerEmail: $('uc-buyer-email').value.trim(),
      buyerPhone: $('uc-buyer-phone').value.trim(),
      assignmentFee: $('uc-buyer-fee').value === '' ? null : Number($('uc-buyer-fee').value),
      closingDate: $('uc-buyer-closing').value.trim(),
      buyerEmd: $('uc-buyer-emd').value === '' ? null : Number($('uc-buyer-emd').value),
      notes: $('uc-buyer-notes').value.trim()
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/buyer-found`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-buyer-dialog').close();
      showToast(data.aoc?.message || 'AOC sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Buyer found failed');
    }
  }

  async function submitSendJv(ev) {
    ev.preventDefault();
    const id = $('uc-jv-deal-id').value;
    const body = {
      salesPartner: 'brandon',
      disposPartner: 'brad',
      salesName: JV_PARTIES.sales.name,
      salesCompany: JV_PARTIES.sales.company,
      salesEmail: JV_PARTIES.sales.email,
      disposName: JV_PARTIES.dispos.name,
      disposCompany: JV_PARTIES.dispos.company,
      disposEmail: JV_PARTIES.dispos.email
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-jv`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-jv-dialog').close();
      showToast(data.jv?.message || 'JV sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Send JV failed');
    }
  }

  async function submitAmendment(ev) {
    ev.preventDefault();
    const id = $('uc-amendment-deal-id').value;
    const partyType = $('uc-amendment-party')?.value || 'seller';
    const name = $('uc-amendment-seller-name').value.trim();
    const email = $('uc-amendment-seller-email').value.trim();
    const body = {
      partyType,
      amendmentTerms: $('uc-amendment-terms').value.trim(),
      // Original agreement date is locked to PSA — server resolves it; do not send edits
      sellerName: name,
      sellerEmail: email,
      counterpartyName: name,
      counterpartyEmail: email,
      sellers: [{ name, email }]
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-amendment`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-amendment-dialog').close();
      showToast(data.amendment?.message || 'Amendment sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Send Amendment failed');
    }
  }

  function openEdit(deal) {
    state.editingId = deal.dealId;
    $('uc-edit-id').value = deal.dealId;
    $('uc-edit-stage').value = deal.stage || 'under_contract';
    $('uc-edit-purchase').value = deal.purchasePrice ?? '';
    $('uc-edit-fee').value = deal.assignmentFee ?? '';
    $('uc-edit-buyer').value = deal.cashBuyerName || '';
    $('uc-edit-closing').value = deal.closingDate || '';
    $('uc-edit-access').value = deal.accessType || '';
    $('uc-edit-access-detail').value = deal.accessDetail || '';
    $('uc-edit-vacancy').value = deal.vacancy || '';
    $('uc-edit-seller-emd').value = deal.sellerEmdSubmitted || '';
    $('uc-edit-buyer-emd').value = deal.buyerEmdSubmitted || '';
    if ($('uc-edit-title-opened')) $('uc-edit-title-opened').value = deal.titleOpened || '';
    if ($('uc-edit-photos')) $('uc-edit-photos').value = deal.photosAvailable || '';
    if ($('uc-edit-photo-cost')) {
      $('uc-edit-photo-cost').value = deal.photoCost != null ? deal.photoCost : 0;
    }
    $('uc-edit-notes').value = deal.notes || '';
    $('uc-edit-title').textContent = deal.address || 'Edit deal';
    $('uc-edit-dialog').showModal();
  }

  async function saveEdit(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    const submitter = ev && ev.submitter;
    if (submitter && submitter.value === 'cancel') {
      $('uc-edit-dialog')?.close();
      return;
    }
    const id = $('uc-edit-id')?.value;
    if (!id) {
      showToast('No deal selected — close and open Edit again');
      return;
    }
    const body = {
      stage: $('uc-edit-stage').value,
      purchasePrice: $('uc-edit-purchase').value === '' ? null : Number($('uc-edit-purchase').value),
      assignmentFee: $('uc-edit-fee').value === '' ? null : Number($('uc-edit-fee').value),
      cashBuyerName: $('uc-edit-buyer').value.trim(),
      closingDate: $('uc-edit-closing').value.trim(),
      accessType: $('uc-edit-access').value,
      accessDetail: $('uc-edit-access-detail').value.trim(),
      vacancy: $('uc-edit-vacancy').value,
      sellerEmdSubmitted: $('uc-edit-seller-emd').value,
      buyerEmdSubmitted: $('uc-edit-buyer-emd').value,
      titleOpened: $('uc-edit-title-opened')?.value || '',
      photosAvailable: $('uc-edit-photos')?.value || '',
      photoCost: (() => {
        const el = $('uc-edit-photo-cost');
        if (!el) return undefined;
        return el.value === '' ? 0 : Number(el.value);
      })(),
      notes: $('uc-edit-notes').value.trim()
    };
    if (body.photoCost === undefined) delete body.photoCost;
    const saveBtn = $('uc-edit-save');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const data = await saveDealFields(id, body);
      $('uc-edit-dialog')?.close();
      showToast('Deal updated');
      if (data.deal) mergeDealIntoState(data.deal);
      await loadDeals({ silent: true });
      if (state.activeDealId === id) await openProfile(id);
    } catch (err) {
      showToast(err.message || 'Save failed');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function cancelEdit() {
    $('uc-edit-dialog')?.close();
  }

  async function releaseDeal(dealId, address) {
    if (!isAdmin()) {
      showToast('Release is admin only');
      return;
    }
    openReleaseConfirm(dealId, address);
  }

  function openReleaseConfirm(dealId, address) {
    const dialog = $('uc-release-dialog');
    if (!dialog) return;
    $('uc-release-deal-id').value = dealId;
    $('uc-release-address').textContent = address || 'this lead';
    $('uc-release-confirm-input').value = '';
    $('uc-release-confirm-btn').disabled = true;
    dialog.showModal();
    setTimeout(() => $('uc-release-confirm-input')?.focus(), 50);
  }

  function closeReleaseConfirm() {
    $('uc-release-dialog')?.close();
  }

  function onReleaseConfirmInput() {
    const val = String($('uc-release-confirm-input')?.value || '').trim().toLowerCase();
    const btn = $('uc-release-confirm-btn');
    if (btn) btn.disabled = val !== 'confirm';
  }

  async function submitReleaseConfirm(ev) {
    ev.preventDefault();
    if (!isAdmin()) {
      showToast('Release is admin only');
      closeReleaseConfirm();
      return;
    }
    const typed = String($('uc-release-confirm-input')?.value || '').trim().toLowerCase();
    if (typed !== 'confirm') {
      showToast('Type confirm to release');
      return;
    }
    const dealId = $('uc-release-deal-id').value;
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/release`, {
        method: 'POST',
        body: '{}'
      });
      closeReleaseConfirm();
      if (state.activeDealId === dealId) closeProfile();
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
      state.unreadTeam = data.unreadTeam || state.unreadTeam || [];
      renderKpis(state.totals);
      renderTable(state.deals);
      renderTeamBanner();
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

  async function sendSms() {
    const dealId = state.activeDealId;
    const input = $('uc-sms-input');
    const text = (input?.value || '').trim();
    if (!dealId || !text) return;
    const btn = $('uc-sms-send');
    if (btn) btn.disabled = true;
    try {
      const sent = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          fromNumber: state.fromNumber,
          toNumber: state.toNumber
        })
      });
      input.value = '';
      showToast('SMS sent');
      // Reply clears unread immediately (server marks seen on send).
      const boardChanged = applySellerSmsDealPatch(sent.deal, sent.unreadSellerSms);
      if (boardChanged) renderTable(state.deals);
      await loadMessages(dealId, { silent: true, forceScroll: true });
    } catch (err) {
      showToast(err.message || 'Send failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bind() {
    $('uc-buyer-form')?.addEventListener('submit', submitBuyerFound);
    $('uc-jv-form')?.addEventListener('submit', submitSendJv);
    $('uc-amendment-form')?.addEventListener('submit', submitAmendment);
    $('uc-amendment-party')?.addEventListener('change', applyAmendmentPartyFields);
    $('uc-buyer-cancel')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-buyer-close')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-jv-cancel')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-jv-close')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-amendment-cancel')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-amendment-close')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-release-form')?.addEventListener('submit', submitReleaseConfirm);
    $('uc-release-confirm-input')?.addEventListener('input', onReleaseConfirmInput);
    $('uc-release-cancel')?.addEventListener('click', closeReleaseConfirm);
    $('uc-release-close')?.addEventListener('click', closeReleaseConfirm);
    $('uc-rehab-save')?.addEventListener('click', () => { saveRehab(); });
    $('uc-photo-cost-save')?.addEventListener('click', () => { savePhotoCost(); });
    $('uc-sms-pulse')?.addEventListener('click', () => {
      scrollToSellerSms();
    });
    $('uc-team-send')?.addEventListener('click', () => { sendTeamMessage(); });
    $('uc-team-thread')?.addEventListener('click', (ev) => {
      const reactTrigger = ev.target.closest('.uc-react-trigger');
      if (reactTrigger) {
        ev.preventDefault();
        ev.stopPropagation();
        const menu = reactTrigger.closest('.uc-react-menu');
        if (!menu) return;
        const open = !menu.classList.contains('is-open');
        document.querySelectorAll('.uc-react-menu.is-open').forEach((el) => {
          el.classList.remove('is-open');
          el.querySelector('.uc-react-trigger')?.setAttribute('aria-expanded', 'false');
        });
        if (open) {
          menu.classList.add('is-open');
          reactTrigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      const btn = ev.target.closest('[data-action="team-react"]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggleTeamReaction(btn.getAttribute('data-msg-id'), btn.getAttribute('data-emoji'));
      const menu = btn.closest('.uc-react-menu');
      menu?.classList.remove('is-open');
      menu?.querySelector('.uc-react-trigger')?.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (ev) => {
      if (ev.target.closest('.uc-react-menu')) return;
      document.querySelectorAll('.uc-react-menu.is-open').forEach((el) => {
        el.classList.remove('is-open');
        el.querySelector('.uc-react-trigger')?.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      document.querySelectorAll('.uc-react-menu.is-open').forEach((el) => {
        el.classList.remove('is-open');
        el.querySelector('.uc-react-trigger')?.setAttribute('aria-expanded', 'false');
      });
    });
    $('uc-team-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTeamMessage();
      }
    });
    $('uc-team-banner-btn')?.addEventListener('click', () => {
      openUnreadFromBanner().catch((e) => showToast(e.message || 'Could not open message'));
    });
    $('uc-funded-close')?.addEventListener('click', closeFundedView);
    $('uc-funded-done')?.addEventListener('click', closeFundedView);
    $('uc-rehab-view-close')?.addEventListener('click', closeRehabView);
    $('uc-rehab-view-done')?.addEventListener('click', closeRehabView);
    $('uc-drawer-edit')?.addEventListener('click', () => {
      const deal = state.profile
        || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId));
      if (!deal) {
        showToast('Open a property first');
        return;
      }
      openEdit(deal);
    });
    $('uc-drawer-buyer-found')?.addEventListener('click', () => {
      if (state.profile) openBuyerFound(state.profile);
    });
    $('uc-drawer-send-jv')?.addEventListener('click', () => {
      if (state.profile) openSendJv(state.profile);
    });
    $('uc-drawer-amendment')?.addEventListener('click', () => {
      if (state.profile) openAmendment(state.profile);
    });
    $('uc-sync-ghl')?.addEventListener('click', () => { syncGhl(); });
    $('uc-edit-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      saveEdit(ev);
    });
    $('uc-edit-save')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      saveEdit(ev);
    });
    $('uc-edit-cancel')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      cancelEdit();
    });
    $('uc-drawer-close')?.addEventListener('click', closeProfile);
    $('uc-drawer-backdrop')?.addEventListener('click', closeProfile);
    $('uc-sms-send')?.addEventListener('click', () => { sendSms(); });
    $('uc-sms-refresh')?.addEventListener('click', () => {
      if (state.activeDealId) {
        loadMessages(state.activeDealId, { forceScroll: true }).catch((e) => showToast(e.message));
      }
    });
    $('uc-sms-mark-read')?.addEventListener('click', () => {
      markSellerSmsRead().catch((e) => showToast(e.message || 'Could not mark read'));
    });
    $('uc-sms-save-all-media')?.addEventListener('click', () => {
      saveAllThreadMedia().catch((e) => showToast(e.message || 'Save all failed'));
    });
    $('uc-convo-thread')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action="save-media"]');
      if (!btn || btn.disabled || btn.classList.contains('is-saved')) return;
      const tile = btn.closest('[data-att-url]');
      if (!tile || tile.getAttribute('data-saved') === '1') return;
      saveOneThreadMedia(
        tile.getAttribute('data-att-url'),
        tile.getAttribute('data-msg-id'),
        btn
      ).catch((e) => showToast(e.message || 'Save failed'));
    });
    $('uc-media-grid')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-media-action="remove"]');
      if (!btn) return;
      const card = btn.closest('[data-media-id]');
      const id = card?.getAttribute('data-media-id');
      if (!id) return;
      removeSavedMedia(id).catch((e) => showToast(e.message || 'Remove failed'));
    });
    $('uc-sms-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendSms();
      }
    });
    $('uc-doc-send')?.addEventListener('click', () => { sendDocumentFromPanel(); });
    $('uc-docs-refresh-sn')?.addEventListener('click', () => { refreshSignedDocuments(); });
    $('uc-doc-close-viewer')?.addEventListener('click', closeDocViewer);
    $('uc-docs-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-doc-action]');
      const row = ev.target.closest('[data-doc-id]');
      if (!btn || !row) return;
      const docId = row.getAttribute('data-doc-id');
      const doc = (state.profile?.documents || []).find((d) => d.id === docId);
      if (btn.dataset.docAction === 'view' && doc) openDocViewer(doc);
      if (btn.dataset.docAction === 'delete') deleteDocument(docId);
    });
    $('uc-lightbox-close')?.addEventListener('click', closePhotoLightbox);
    $('uc-lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'uc-lightbox') closePhotoLightbox();
    });
    $('uc-drawer-hero')?.addEventListener('click', (ev) => {
      const zoom = ev.target.closest('[data-action="zoom-photo"]');
      if (!zoom || !state.profile) return;
      ev.preventDefault();
      const url = photoUrl(state.profile);
      if (url) openPhotoLightbox(url, state.profile.address || 'Property');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('uc-lightbox') && !$('uc-lightbox').hidden) {
        closePhotoLightbox();
        return;
      }
      if (!state.activeDealId) return;
      if ($('uc-release-dialog')?.open) return;
      if ($('uc-buyer-dialog')?.open) return;
      if ($('uc-jv-dialog')?.open) return;
      if ($('uc-amendment-dialog')?.open) return;
      if ($('uc-edit-dialog')?.open) return;
      if ($('uc-funded-dialog')?.open) return;
      closeProfile();
    });

    window.addEventListener('phuglee-payouts-updated', (ev) => {
      const detail = ev.detail || {};
      if (detail.deals) {
        state.deals = detail.deals;
        state.totals = detail.totals || state.totals;
        renderKpis(state.totals);
        renderTable(state.deals);
        showToast('Payout settings updated');
        if (state.activeDealId) {
          openProfile(state.activeDealId).catch(() => {});
        }
        return;
      }
      loadDeals().then(() => showToast('Payout settings updated')).catch(() => {});
    });

    $('uc-tbody')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      const row = ev.target.closest('tr[data-deal-id]');
      if (!row) return;
      const dealId = row.getAttribute('data-deal-id');
      const deal = state.deals.find((d) => d.dealId === dealId);
      if (!deal) return;
      const action = btn?.dataset.action || 'open';
      if (action === 'zoom-photo') {
        ev.preventDefault();
        ev.stopPropagation();
        const url = photoUrl(deal);
        if (url) openPhotoLightbox(url, deal.address || 'Property');
        else showToast('No photo available for this deal');
        return;
      }
      if (action === 'open') openProfile(dealId);
      if (action === 'open-seller-sms') {
        ev.preventDefault();
        ev.stopPropagation();
        openProfile(dealId, { scrollToSms: true });
        return;
      }
      if (action === 'edit') openEdit(deal);
      if (action === 'buyer-found') openBuyerFound(deal);
      if (action === 'send-jv') openSendJv(deal);
      if (action === 'amendment') openAmendment(deal);
      if (action === 'view-rehab') openRehabView(deal);
      if (action === 'view-funded') openFundedView(deal);
      if (action === 'release' && isAdmin()) releaseDeal(deal.dealId, deal.address);
    });
  }

  async function allowContractDesk() {
    if (isContractDesk()) return true;
    if (window.PhugleeSession?.syncSessionFromServerCookie) {
      const data = await window.PhugleeSession.syncSessionFromServerCookie();
      if (data?.username === ADMIN || data?.username === DISPOS) return true;
    }
    return false;
  }

  async function init() {
    const gate = $('uc-gate');
    const app = $('uc-app');
    const allowed = await allowContractDesk();
    if (!allowed) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    applyAdminOnlyUi();
    bind();
    try {
      await loadDeals();
      ensureBoardPoll();
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
