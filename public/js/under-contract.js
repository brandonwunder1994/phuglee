(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const STAGE_LABELS = {
    contract_sent: 'Waiting for Signatures',
    under_contract: 'Under contract',
    buyer_signed_aoc: 'Buyer Signed AOC',
    buyer_found: 'Buyer Submitted EMD',
    funded: 'Funded',
    terminated: 'Terminated'
  };
  /** Lower = closer to funding = higher on the board. Must match schema.js. */
  const STAGE_PROCESS_RANK = {
    funded: 0,
    buyer_found: 1,
    buyer_signed_aoc: 2,
    under_contract: 3,
    contract_sent: 4,
    verbal_offer: 5,
    warm: 6,
    interested: 7,
    terminated: 8
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
    photographerMessages: [],
    teamMessages: [],
    unreadTeam: [],
    unreadSellerSms: [],
    fromNumber: null,
    toNumber: null,
    pollTimer: null,
    msgPollTimer: null,
    goalTickTimer: null,
    deepLinkHandled: false,
    lastInboundToastId: null,
    mediaLightbox: {
      items: [],
      index: 0
    },
    buyerOffers: [],
    selectedBuyerOfferId: null,
    buyerOfferEditIds: {},
    buyerOfferDrafts: [],
    investorBaseUrl: '',
    investorBaseEditing: false,
    profileTab: 'overview',
    commChannel: 'seller',
    mediaRoomFilter: 'all',
    mediaActiveId: null,
    /** Per-deal/channel thread scrollTop — open restores, never jumps to bottom. */
    threadScroll: Object.create(null)
  };

  /** Element to restore focus to when the profile dialog closes. */
  let profileReturnFocus = null;

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

  function showToast(msg, ms = 3200) {
    const hold = Math.max(3200, Number(ms) || 3200, String(msg || '').length > 80 ? 7000 : 3200);
    // Modal <dialog> uses the browser top layer — page toasts (even high z-index)
    // paint underneath. Mirror the message into the open dialog so sends/errors
    // are never silent while a form is open.
    const openDialog = document.querySelector('dialog.uc-dialog[open], dialog[open].uc-dialog');
    if (openDialog) {
      const dedicated = openDialog.querySelector('#uc-amendment-status, #uc-psa-error, [data-uc-dialog-status]');
      let banner = dedicated || openDialog.querySelector('[data-uc-dialog-toast]');
      if (!banner) {
        banner = document.createElement('p');
        banner.dataset.ucDialogToast = '1';
        banner.className = 'uc-dialog-toast';
        banner.setAttribute('role', 'status');
        const form = openDialog.querySelector('form.uc-edit-form') || openDialog.querySelector('form') || openDialog;
        const actions = form.querySelector('.uc-edit-actions');
        if (actions) form.insertBefore(banner, actions);
        else form.appendChild(banner);
      }
      banner.textContent = msg;
      banner.hidden = false;
      if (banner.dataset) banner.dataset.kind = /fail|error|missing|required|limit/i.test(String(msg || ''))
        ? 'error'
        : 'info';
      clearTimeout(showToast._dlgT);
      showToast._dlgT = setTimeout(() => { banner.hidden = true; }, hold);
    }
    const el = $('uc-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, hold);
  }

  function setAmendmentStatus(msg, kind = 'error') {
    const el = $('uc-amendment-status');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.removeAttribute('data-kind');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.dataset.kind = kind;
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
      const detail = data.error || data.message || res.statusText || '';
      const err = new Error(detail
        ? detail
        : `Request failed (${res.status})`);
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
    if (!url) return;
    state.mediaLightbox = {
      items: [{ src: url, alt: alt || 'Property photo', kind: 'image' }],
      index: 0
    };
    showLightboxAt(0);
  }

  function openMediaLightbox(mediaList, startId) {
    const list = Array.isArray(mediaList) ? mediaList : [];
    const items = list
      .filter((m) => m && (m.viewUrl || m.downloadUrl))
      .map((m) => ({
        id: m.id,
        src: m.viewUrl || m.downloadUrl,
        alt: m.aiLabel?.room
          ? `${m.aiLabel.room}${m.name ? ' · ' + m.name : ''}`
          : (m.name || 'Media'),
        kind: (m.kind === 'video' || isVideoUrl(m.viewUrl || m.name, m.mimeType)) ? 'video' : 'image'
      }));
    if (!items.length) return;
    let index = items.findIndex((m) => m.id === startId);
    if (index < 0) index = 0;
    state.mediaLightbox = { items, index };
    showLightboxAt(index);
  }

  function showLightboxAt(index) {
    const box = $('uc-lightbox');
    const img = $('uc-lightbox-img');
    const video = $('uc-lightbox-video');
    const caption = $('uc-lightbox-caption');
    const prev = $('uc-lightbox-prev');
    const next = $('uc-lightbox-next');
    const items = state.mediaLightbox?.items || [];
    if (!box || !items.length) return;
    const i = ((index % items.length) + items.length) % items.length;
    state.mediaLightbox.index = i;
    const item = items[i];
    if (img) {
      if (item.kind === 'video') {
        img.hidden = true;
        img.removeAttribute('src');
      } else {
        img.hidden = false;
        img.src = item.src;
        img.alt = item.alt || 'Property photo';
      }
    }
    if (video) {
      if (item.kind === 'video') {
        video.hidden = false;
        video.src = item.src;
      } else {
        video.hidden = true;
        video.pause?.();
        video.removeAttribute('src');
      }
    }
    if (caption) {
      caption.textContent = items.length > 1
        ? `${i + 1} / ${items.length} · ${item.alt || ''}`
        : (item.alt || '');
    }
    const multi = items.length > 1;
    if (prev) prev.hidden = !multi;
    if (next) next.hidden = !multi;
    box.hidden = false;
  }

  function stepLightbox(delta) {
    const items = state.mediaLightbox?.items || [];
    if (items.length < 2) return;
    showLightboxAt((state.mediaLightbox.index || 0) + delta);
  }

  function closePhotoLightbox() {
    const box = $('uc-lightbox');
    const img = $('uc-lightbox-img');
    const video = $('uc-lightbox-video');
    if (box) box.hidden = true;
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
    }
    if (video) {
      video.hidden = true;
      try { video.pause(); } catch (_) { /* ignore */ }
      video.removeAttribute('src');
    }
    state.mediaLightbox = { items: [], index: 0 };
  }

  const MONEY_GOAL_TARGET = 100000;

  function renderKpis(totals) {
    const t = totals || {};
    const by = t.byStage || {};
    // Under Contract KPI = any dispo stage except terminated
    // (under contract, signed AOC, submitted EMD, funded)
    const ucKpi =
      (Number(by.under_contract) || 0) +
      (Number(by.buyer_signed_aoc) || 0) +
      (Number(by.buyer_found) || 0) +
      (Number(by.funded) || 0);
    const ucFallback =
      (Number(t.openCount) || 0) + (Number(t.funded ?? t.closedCount) || 0);
    $('uc-kpi-uc').textContent = String(
      Object.keys(by).length ? ucKpi : (ucFallback || t.underContract || 0)
    );
    if ($('uc-kpi-pending-sign')) {
      // Server total; renderTable overrides with the live Waiting-for-Signatures group count.
      $('uc-kpi-pending-sign').textContent = String(t.pendingSignatures ?? by.contract_sent ?? 0);
    }
    if ($('uc-kpi-open-fees')) {
      $('uc-kpi-open-fees').textContent = money(t.openAssignmentFees || 0);
    }
    $('uc-kpi-funded').textContent = String(by.funded || t.funded || t.closedCount || 0);
    $('uc-kpi-fees').textContent = money(t.closedAssignmentFees ?? t.totalAssignmentFees ?? 0);
    if ($('uc-kpi-avg-funded')) {
      $('uc-kpi-avg-funded').textContent = money(t.avgFundedAssignmentFee ?? 0);
    }
    renderMoneyGoal(t);
  }

  /** Lifetime Total Funded → $100k (same source as Command Center). */
  function renderMoneyGoal(totals) {
    const panel = $('uc-money-goal');
    if (!panel) return;
    const t = totals || {};
    let funded = Number(t.closedAssignmentFees ?? t.totalAssignmentFees ?? 0);
    if (!Number.isFinite(funded) || funded < 0) funded = 0;
    const pct = Math.min(100, Math.round((funded / MONEY_GOAL_TARGET) * 100));
    const met = funded >= MONEY_GOAL_TARGET;
    const remaining = Math.max(0, MONEY_GOAL_TARGET - funded);

    if ($('uc-money-current')) $('uc-money-current').textContent = money(funded);
    if ($('uc-money-target')) $('uc-money-target').textContent = '$100k';
    if ($('uc-money-pct')) {
      $('uc-money-pct').textContent = met ? 'Goal hit — keep going' : `${pct}% to goal`;
    }
    if ($('uc-money-remaining')) {
      $('uc-money-remaining').textContent = met ? '' : `${money(remaining)} to go`;
      $('uc-money-remaining').hidden = met;
    }

    const fill = $('uc-money-bar-fill');
    const bar = $('uc-money-bar');
    if (fill) {
      const widthPct = met ? 100 : funded > 0 ? Math.max(pct, 3) : 0;
      fill.style.width = `${widthPct}%`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuetext', `${money(funded)} of $100,000 total funded (${pct}%)`);
    }
    panel.classList.toggle('is-met', met);
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

  /**
   * Overview-only closing date: "Tuesday, July 15, 2026"
   * (weekday + long month). Board/contracts keep numeric display.
   */
  function formatOverviewClosingDate(raw) {
    const s = String(raw || '').trim();
    if (!s || s === '—') return '—';
    let d = null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    } else {
      const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (slash) {
        let yy = Number(slash[3]);
        if (yy < 100) yy += 2000;
        d = new Date(yy, Number(slash[1]) - 1, Number(slash[2]), 12, 0, 0);
      } else {
        const ms = Date.parse(s);
        if (Number.isFinite(ms)) d = new Date(ms);
      }
    }
    if (!d || Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
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

  function statusYn(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'yes') return 'yes';
    if (v === 'no') return 'no';
    return '';
  }

  function processYes(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const v = String(value == null ? '' : value).trim().toLowerCase();
    return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'submitted';
  }

  function processRehabFilled(rehab) {
    if (processYes(rehab)) return true;
    if (!rehab || typeof rehab !== 'object') return false;
    return Boolean(
      rehab.roof || rehab.ac || rehab.foundation
      || rehab.electrical || rehab.plumbing
      || rehab.other || rehab.notes || rehab.custom
    );
  }

  function processBuyerFound(d) {
    const stage = d?.stage || '';
    if (stage === 'buyer_found' || stage === 'funded') return true;
    if (String(d?.cashBuyerName || '').trim()) return true;
    if (processYes(d?.buyerFound)) return true;
    const ba = d?.buyerAssignment;
    if (ba && (ba.buyerEntity || ba.buyerEmail || ba.buyerContactName)) return true;
    return false;
  }

  function dealProcessProgressScore(d) {
    let score = 0;
    if (processYes(d?.buyerEmdSubmitted)) score += 32;
    if (processBuyerFound(d)) score += 16;
    if (processYes(d?.rehabInfoReady) || processRehabFilled(d?.rehabInfo)) score += 8;
    if (processYes(d?.photosAvailable)) score += 4;
    if (processYes(d?.titleOpened)) score += 2;
    if (processYes(d?.sellerEmdSubmitted)) score += 1;
    return score;
  }

  /** Parse board closing date → ms; missing/invalid sorts last. */
  function closingSortKey(deal) {
    const raw = String(deal?.closingDate || deal?.closingDisplay || '').trim();
    if (!raw || raw === '—') return Number.POSITIVE_INFINITY;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0).getTime();
    }
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (slash) {
      let yy = Number(slash[3]);
      if (yy < 100) yy += 2000;
      return new Date(yy, Number(slash[1]) - 1, Number(slash[2]), 12, 0, 0).getTime();
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  }

  /** Soonest closing first — priority board order. */
  function compareDealsByClosing(a, b) {
    const ka = closingSortKey(a);
    const kb = closingSortKey(b);
    if (ka !== kb) return ka - kb;
    const createdCmp = String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
    if (createdCmp) return createdCmp;
    return String(a?.dealId || '').localeCompare(String(b?.dealId || ''));
  }

  function sortDealsByClosing(deals) {
    return (deals || []).slice().sort(compareDealsByClosing);
  }

  /** End buyer name for board rows (no profile offers required). */
  function boardEndBuyerName(deal) {
    const cash = String(deal?.cashBuyerName || '').trim();
    if (cash && !isPlaceholderBuyerName(cash)) return cash;
    const ba = deal?.buyerAssignment || {};
    const entity = String(ba.buyerEntity || ba.buyerContactName || '').trim();
    if (entity && !isPlaceholderBuyerName(entity)) return entity;
    const offers = Array.isArray(deal?.buyerOffers) ? deal.buyerOffers : [];
    const selectedId = deal?.selectedBuyerOfferId;
    const selected = selectedId
      ? offers.find((o) => String(o?.id || '') === String(selectedId))
      : null;
    const ordered = selected ? [selected, ...offers] : offers;
    for (const o of ordered) {
      const n = String(o?.buyerName || '').trim();
      if (n && !isPlaceholderBuyerName(n)) return n;
    }
    return '';
  }

  /** Scannable status chip for board table + cards. Omit label when empty (board columns have headers). */
  function statusChip(opts) {
    const label = opts.label || '';
    const labelHtml = label ? `<span class="uc-status-label">${esc(label)}</span>` : '';
    const kind = opts.kind || 'yn';
    if (kind === 'access') {
      return (
        `<span class="uc-status uc-status--access${label ? '' : ' uc-status--value-only'}" data-access="${esc(opts.value || '')}">` +
        labelHtml +
        `<span class="uc-status-value">${esc(opts.text || '—')}</span>` +
        `</span>`
      );
    }
    if (kind === 'vacancy') {
      return (
        `<span class="uc-status uc-status--vacancy${label ? '' : ' uc-status--value-only'}" data-vacancy="${esc(opts.value || '')}">` +
        labelHtml +
        `<span class="uc-status-value">${esc(opts.text || '—')}</span>` +
        `</span>`
      );
    }
    const yn = statusYn(opts.yn);
    const text = opts.text || (yn === 'yes' ? 'Yes' : yn === 'no' ? 'No' : '—');
    return (
      `<span class="uc-status uc-status--yn${label ? '' : ' uc-status--value-only'}" data-yn="${esc(yn)}">` +
      labelHtml +
      `<span class="uc-status-value">${esc(text)}</span>` +
      `</span>`
    );
  }

  function dealChecklistHtml(d) {
    // Values only — column/card context supplies meaning
    return (
      statusChip({
        kind: 'access',
        value: d.accessType,
        text: d.accessDisplay || d.accessLabel
      }) +
      statusChip({
        kind: 'vacancy',
        value: d.vacancy,
        text: d.vacancyLabel
      }) +
      statusChip({ yn: d.photosAvailable, text: d.photosLabel }) +
      statusChip({ yn: d.buyerFound, text: d.buyerFoundLabel }) +
      statusChip({ yn: d.buyerEmdSubmitted, text: d.buyerEmdLabel })
    );
  }

  function isWaitingForSignatures(deal) {
    return String(deal?.stage || '') === 'contract_sent';
  }

  function isBrad() {
    return sessionUser() === DISPOS;
  }

  /** Brad may glance Waiting for Signatures on the tracker; only admin opens them. */
  function canOpenWaitingDeal() {
    return isAdmin();
  }

  function dispoQuickActionsHtml(d) {
    // Board is read-only for sends — AOC / JV / Amendment live on Docs auto-flows + profile Docs tab.
    if (isWaitingForSignatures(d)) {
      return '<span class="uc-waiting-chip">Waiting for Signatures</span>';
    }
    return '';
  }

  function renderWaitingSection(waiting) {
    const section = $('uc-waiting-section');
    const tbody = $('uc-waiting-tbody');
    const table = $('uc-waiting-table');
    const cards = $('uc-waiting-cards');
    const count = $('uc-waiting-count');
    const lead = document.querySelector('#uc-waiting-section .uc-waiting-lead');
    if (!section || !tbody) return;

    const deals = sortDealsByClosing(waiting || []);
    if (!deals.length) {
      section.hidden = true;
      tbody.innerHTML = '';
      if (cards) cards.innerHTML = '';
      return;
    }

    section.hidden = false;
    section.classList.toggle('uc-board--waiting-glance', isBrad() && !isAdmin());
    if (lead) {
      lead.textContent = canOpenWaitingDeal()
        ? 'Cash PSAs sent via SignNow — no AOC, JV, or Amendment until the seller signs.'
        : 'Address and photo only while the PSA is out for signature. Admin opens these deals.';
    }
    if (count) count.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;
    if (table) table.hidden = false;
    if (cards) cards.hidden = false;

    const adminOpen = canOpenWaitingDeal();
    tbody.innerHTML = deals.map((d) => {
      const { street, cityLine } = propertyLines(d);
      const openBtn = adminOpen
        ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="open">Open</button>'
        : '<span class="uc-waiting-locked" title="Admin only">On tracker</span>';
      const addrInner = `<span class="uc-property-text">
                  <span class="uc-addr">${esc(street)}</span>
                  <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
                </span>`;
      const addrCell = adminOpen
        ? `<button type="button" class="uc-property-btn" data-action="open">${addrInner}</button>`
        : `<div class="uc-property-btn uc-property-btn--static">${addrInner}</div>`;
      const rowClass = adminOpen ? 'uc-row-clickable' : 'uc-row-glance';
      return `<tr data-deal-id="${esc(d.dealId)}" class="${rowClass}" data-waiting="1"${adminOpen ? '' : ' data-restricted="1"'}>
        <td class="uc-property-cell">
          <div class="uc-property-block">
            <div class="uc-property-main">
              <button type="button" class="uc-thumb-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">
                ${thumbHtml(d, 'uc-thumb')}
              </button>
              ${addrCell}
            </div>
          </div>
        </td>
        <td><span class="uc-stage" data-stage="contract_sent">Waiting for Signatures</span></td>
        <td class="uc-money">${adminOpen ? esc(money(d.purchasePrice)) : '—'}</td>
        <td class="uc-closing-cell">${adminOpen ? esc(d.closingDisplay || d.closingDate || '—') : '—'}</td>
        <td>${adminOpen ? esc(d.ownerName || d.sellerNames || '—') : '—'}</td>
        <td>
          <div class="uc-row-actions">
            ${openBtn}
          </div>
        </td>
      </tr>`;
    }).join('');

    if (cards) {
      cards.innerHTML = deals.map((d) => {
        const { street, cityLine } = propertyLines(d);
        const openBtn = adminOpen
          ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="open">Open</button>'
          : '<span class="uc-waiting-locked" title="Admin only">On tracker</span>';
        const addrInner = `<span class="uc-property-text">
                <span class="uc-addr">${esc(street)}</span>
                <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
              </span>`;
        const addrCell = adminOpen
          ? `<button type="button" class="uc-property-btn" data-action="open">${addrInner}</button>`
          : `<div class="uc-property-btn uc-property-btn--static">${addrInner}</div>`;
        return `<article class="uc-deal-card uc-deal-card--waiting${adminOpen ? '' : ' uc-deal-card--glance'}" data-deal-id="${esc(d.dealId)}" data-waiting="1"${adminOpen ? '' : ' data-restricted="1"'}>
          <div class="uc-deal-card-head">
            <button type="button" class="uc-thumb-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">
              ${thumbHtml(d, 'uc-thumb')}
            </button>
            ${addrCell}
          </div>
          <div class="uc-deal-card-meta">
            <span class="uc-stage" data-stage="contract_sent">Waiting for Signatures</span>
            ${adminOpen ? `<span class="uc-money">${esc(money(d.purchasePrice))}</span>` : ''}
          </div>
          ${adminOpen ? `<p class="uc-waiting-seller">${esc(d.ownerName || d.sellerNames || '—')}</p>` : ''}
          <div class="uc-row-actions uc-deal-card-actions">
            ${openBtn}
          </div>
        </article>`;
      }).join('');
    }
  }

  function renderFundedSection(funded) {
    const section = $('uc-funded-section');
    const tbody = $('uc-funded-tbody');
    const table = $('uc-funded-table');
    const cards = $('uc-funded-cards');
    const count = $('uc-funded-section-count');
    if (!section || !tbody) return;

    const deals = sortDealsByClosing(funded || []);
    if (!deals.length) {
      section.hidden = true;
      tbody.innerHTML = '';
      if (cards) cards.innerHTML = '';
      return;
    }

    section.hidden = false;
    if (count) count.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;
    if (table) table.hidden = false;
    if (cards) cards.hidden = false;

    tbody.innerHTML = deals.map((d) => {
      const { street, cityLine } = propertyLines(d);
      const stage = STAGE_LABELS[d.stage] || d.stage || 'Funded';
      const endBuyer = boardEndBuyerName(d) || '—';
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
              ${dealTypeBadgeHtml(d)}
            </div>
          </div>
        </td>
        <td><span class="uc-stage" data-stage="${esc(d.stage || 'funded')}">${esc(stage)}</span></td>
        <td class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</td>
        <td class="uc-end-buyer-cell">${esc(endBuyer)}</td>
        <td class="uc-money">${esc(money(d.assignmentFee))}</td>
      </tr>`;
    }).join('');

    if (cards) {
      cards.innerHTML = deals.map((d) => {
        const { street, cityLine } = propertyLines(d);
        const stage = STAGE_LABELS[d.stage] || d.stage || 'Funded';
        const endBuyer = boardEndBuyerName(d) || '—';
        return `<article class="uc-deal-card uc-deal-card--funded" data-deal-id="${esc(d.dealId)}">
          <div class="uc-deal-card-head">
            <button type="button" class="uc-thumb-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">
              ${thumbHtml(d, 'uc-thumb')}
            </button>
            <button type="button" class="uc-property-btn" data-action="open">
              <span class="uc-property-text">
                <span class="uc-addr">${esc(street)}</span>
                <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
              </span>
            </button>
          </div>
          <div class="uc-deal-card-meta">
            <span class="uc-stage" data-stage="${esc(d.stage || 'funded')}">${esc(stage)}</span>
            <span class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</span>
          </div>
          <p class="uc-funded-buyer">${esc(endBuyer)}</p>
          <p class="uc-funded-spread uc-money">${esc(money(d.assignmentFee))}</p>
          <div class="uc-row-actions uc-deal-card-actions">
            <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="open">Open</button>
          </div>
        </article>`;
      }).join('');
    }
  }

  function renderTable(deals) {
    const tbody = $('uc-tbody');
    const table = $('uc-table');
    const cards = $('uc-cards');
    const empty = $('uc-empty');
    const count = $('uc-board-count');
    if (!tbody) return;

    // Active dispo (not funded) in main table; contract_sent → Waiting; funded → Funded section.
    // Sorted soonest closing → latest so upcoming closes surface first.
    const ACTIVE = new Set(['under_contract', 'buyer_signed_aoc', 'buyer_found', 'terminated']);
    const all = Array.isArray(deals) ? deals : [];
    const waiting = all.filter((d) => isWaitingForSignatures(d));
    const funded = all.filter((d) => String(d?.stage || '') === 'funded');
    deals = sortDealsByClosing(all.filter((d) => ACTIVE.has(d.stage)));

    // Pending Signatures KPI mirrors the Waiting-for-Signatures group exactly.
    if ($('uc-kpi-pending-sign')) {
      $('uc-kpi-pending-sign').textContent = String(waiting.length);
    }

    renderWaitingSection(waiting);
    renderFundedSection(funded);

    if (!deals.length) {
      if (table) table.hidden = true;
      if (cards) {
        cards.hidden = true;
        cards.innerHTML = '';
      }
      empty.hidden = waiting.length > 0 || funded.length > 0;
      if (count) {
        count.textContent = (waiting.length || funded.length) ? '0 open deals' : '0 deals';
      }
      tbody.innerHTML = '';
      return;
    }

    empty.hidden = true;
    if (table) table.hidden = false;
    if (cards) cards.hidden = false;
    count.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;

    tbody.innerHTML = deals.map((d) => {
      const { street, cityLine } = propertyLines(d);
      const stage = STAGE_LABELS[d.stage] || d.stage || '—';
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
              ${dealTypeBadgeHtml(d)}
              ${trustFundBadgeHtml(d)}
              ${d.sellerSmsUnread
                ? `<button type="button" class="uc-sms-alert" data-action="open-seller-sms" title="${esc(sellerSmsHoverTitle(d))}" aria-label="${esc(sellerSmsHoverTitle(d))}">💬</button>`
                : ''}
            </div>
            <div class="uc-property-quick">
              ${dispoQuickActionsHtml(d)}
            </div>
          </div>
        </td>
        <td><span class="uc-stage" data-stage="${esc(d.stage)}">${esc(stage)}</span></td>
        <td class="uc-money">${esc(money(d.purchasePrice))}</td>
        <td class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</td>
        <td>${statusChip({
          kind: 'access',
          value: d.accessType,
          text: d.accessDisplay || d.accessLabel
        })}</td>
        <td>${statusChip({
          kind: 'vacancy',
          value: d.vacancy,
          text: d.vacancyLabel
        })}</td>
        <td>${statusChip({ yn: d.photosAvailable, text: d.photosLabel })}</td>
        <td>${statusChip({ yn: d.buyerFound, text: d.buyerFoundLabel })}</td>
        <td>${statusChip({ yn: d.buyerEmdSubmitted, text: d.buyerEmdLabel })}</td>
      </tr>`;
    }).join('');

    if (cards) {
      cards.innerHTML = deals.map((d) => {
        const { street, cityLine } = propertyLines(d);
        const stage = STAGE_LABELS[d.stage] || d.stage || '—';
        return `<article class="uc-deal-card" data-deal-id="${esc(d.dealId)}">
          <div class="uc-deal-card-head">
            <button type="button" class="uc-thumb-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">
              ${thumbHtml(d, 'uc-thumb')}
            </button>
            <button type="button" class="uc-property-btn" data-action="open">
              <span class="uc-property-text">
                <span class="uc-addr">${esc(street)}</span>
                <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
              </span>
            </button>
            ${dealTypeBadgeHtml(d)}
            ${trustFundBadgeHtml(d)}
            ${d.sellerSmsUnread
              ? `<button type="button" class="uc-sms-alert" data-action="open-seller-sms" title="${esc(sellerSmsHoverTitle(d))}" aria-label="${esc(sellerSmsHoverTitle(d))}">💬</button>`
              : ''}
          </div>
          <div class="uc-deal-card-meta">
            <span class="uc-stage" data-stage="${esc(d.stage)}">${esc(stage)}</span>
            <span class="uc-money">${esc(money(d.purchasePrice))}</span>
            <span class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</span>
          </div>
          <div class="uc-deal-card-checklist" aria-label="Deal checklist">
            ${dealChecklistHtml(d)}
          </div>
          <div class="uc-deal-card-quick">
            ${dispoQuickActionsHtml(d)}
          </div>
          <div class="uc-row-actions uc-deal-card-actions">
            <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="open">Open</button>
          </div>
        </article>`;
      }).join('');
    }
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

  function dealTypeBadgeHtml(deal) {
    const type = String(deal?.dealType || '').trim();
    if (type !== 'cash' && type !== 'subject_to') return '';
    const label = deal.dealTypeLabel
      || (type === 'cash' ? 'Cash deal' : 'Subject-to deal');
    const short = type === 'cash' ? 'Cash' : 'SubTo';
    // Monoline marks — same gold/ink language as UC stage chips (no cartoon PNGs).
    const icon = type === 'cash'
      ? `<svg class="uc-deal-type-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="2.5" y="4.5" width="11" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M5.5 8h5M8 6.2v3.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>`
      : `<svg class="uc-deal-type-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.2 10.8V5.6L8 3.2l4.8 2.4v5.2L8 13.2 3.2 10.8z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M5.6 9.2h2.6a1.4 1.4 0 0 0 0-2.8H7" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><path d="M9.4 8.2h2.2M10.8 6.8v2.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>`;
    return `<span class="uc-deal-type-badge" data-deal-type="${esc(type)}" title="${esc(label)}" aria-label="${esc(label)}">${icon}<span class="uc-deal-type-text">${esc(short)}</span></span>`;
  }

  function trustFundBadgeHtml(deal) {
    // Already have a buyer — no flashing Buyer Fit / Maybe alert.
    if (processBuyerFound(deal)) return '';
    const flag = deal && (deal.buyerMatch || deal.trustFundMatch);
    if (!flag || !flag.hit) return '';
    const cls = flag.tier === 'partial' ? 'uc-tf-alert uc-tf-alert--partial' : 'uc-tf-alert';
    const short = flag.tier === 'strong' ? 'Buyer Fit' : 'Buyer Maybe';
    return `<button type="button" class="${cls}" data-action="buyer-fit" title="${esc(flag.label)}" aria-label="${esc(flag.label)}"><span class="uc-tf-alert-dot" aria-hidden="true"></span>${esc(short)}</button>`;
  }

  async function enrichTrustFundFlags(deals) {
    const flagApi = window.BuyersDealFlag || window.TrustFundsDealFlag;
    if (!flagApi || typeof flagApi.flagDeals !== 'function') {
      return deals || [];
    }
    try {
      return await flagApi.flagDeals(deals || []);
    } catch (_) {
      return deals || [];
    }
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
    const data = await api('/api/leads/admin/contracts?board=contracts');
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

    // Cross-ref Trust Funds after first paint so the board stays snappy
    enrichTrustFundFlags(state.deals).then((flagged) => {
      if (!flagged || !flagged.length) return;
      state.deals = flagged;
      renderTable(state.deals);
      if (state.activeDealId) {
        const open = state.deals.find((d) => d.dealId === state.activeDealId);
        if (open && state.profile && state.profile.dealId === open.dealId) {
          // refresh badge in open drawer hero if still viewing this deal
          const heroCopy = document.querySelector('#uc-drawer-hero .uc-profile-hero-copy');
          if (heroCopy && !processBuyerFound(open) && open.trustFundMatch && open.trustFundMatch.hit) {
            let badge = heroCopy.querySelector('.uc-tf-alert');
            if (!badge) {
              const html = trustFundBadgeHtml(open);
              if (html) heroCopy.insertAdjacentHTML('beforeend', html);
            }
          } else if (heroCopy && processBuyerFound(open)) {
            heroCopy.querySelectorAll('.uc-tf-alert').forEach((el) => el.remove());
          }
        }
      }
    }).catch(() => { /* ignore flag errors */ });

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
      if (state.activeDealId) {
        refreshTeamMessagesFromState();
        autoSyncSignedDocuments({ silent: true }).catch(() => {});
      }
    }, POLL_MS);
    startMsgPoll();
  }

  function ensureBoardPoll() {
    if (!state.pollTimer) {
      state.pollTimer = setInterval(() => {
        loadDeals({ silent: true }).catch(() => {});
        if (state.activeDealId) {
          autoSyncSignedDocuments({ silent: true }).catch(() => {});
        }
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
    // Keep Comms tab unread chip in sync with seller SMS pulse
    const commsTab = $('uc-tab-comms');
    if (commsTab) {
      commsTab.classList.toggle('has-unread', unread);
      commsTab.setAttribute('data-summary', unread ? '1' : '0');
      if (unread) commsTab.setAttribute('aria-label', 'Comms, unread seller texts');
      else commsTab.removeAttribute('aria-label');
    }
  }

  function syncMarkReadButton(unreadExplicit) {
    const btn = $('uc-sms-mark-read');
    if (!btn) return;
    const deal = state.profile
      || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId))
      || null;
    const unread = unreadExplicit != null ? !!unreadExplicit : !!(deal?.sellerSmsUnread);
    // Only when there is unread seller SMS (premium Comms: actions context-only)
    btn.hidden = !state.activeDealId || !unread;
    btn.disabled = false;
    btn.classList.toggle('is-unread', unread);
    btn.setAttribute('aria-pressed', unread ? 'false' : 'true');
    btn.textContent = 'Mark read';
    btn.title = 'Mark seller texts as read';
    btn.textContent = unread ? 'Mark as read' : 'Marked read';
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

  function setPanelOpen(panel, open) {
    if (!panel) return null;
    const next = Boolean(open);
    panel.classList.toggle('is-open', next);
    const btn = panel.querySelector(':scope > .uc-panel-summary');
    const body = panel.querySelector(':scope > .uc-panel-body');
    if (btn) btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (body) body.hidden = !next;
    if (next) {
      // Restore last read position (do not force-jump to newest).
      requestAnimationFrame(() => scrollOpenCommunicationThreads(panel));
    }
    return panel;
  }

  const PROFILE_TABS = ['overview', 'comms', 'docs', 'media', 'walkthroughs', 'buyers'];

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  /** Flash only meaningful state changes (send / sign import / scan) — not decoration. */
  function flashState(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('uc-flash-state');
    void el.offsetWidth;
    el.classList.add('uc-flash-state');
    const done = () => {
      el.classList.remove('uc-flash-state');
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
  }

  function scrollInstrumentIntoView(el) {
    if (!el) return;
    try {
      el.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest'
      });
    } catch (_) {
      el.scrollIntoView(true);
    }
  }

  /**
   * Cross-tab deep link: open instrument, optional channel, scroll + flash target.
   * Used by Overview blockers, SMS pulse, primary CTA, and board open opts.
   */
  function navigateProfileInstrument(tabId, opts = {}) {
    const tab = PROFILE_TABS.includes(tabId) ? tabId : 'overview';
    showProfileTab(tab);
    if (tab === 'comms' || opts.channel) {
      showCommChannel(opts.channel || (tab === 'comms' ? 'seller' : state.commChannel) || 'seller');
    }
    requestAnimationFrame(() => {
      let focusEl = null;
      const focus = opts.focus || '';
      if (focus === 'docs-attention' || focus === 'docs-packages' || opts.packageKey) {
        focusEl = opts.packageKey
          ? document.querySelector(
            `#uc-docs-pending-list .uc-docs-row[data-pkg-key="${CSS.escape(opts.packageKey)}"], ` +
            `#uc-docs-signed-list .uc-docs-row[data-pkg-key="${CSS.escape(opts.packageKey)}"]`
          )
          : ($('uc-docs-pending-list') || $('uc-docs-instrument') || $('uc-panel-docs'));
      } else if (focus === 'buyers-leader' || tab === 'buyers') {
        focusEl = $('uc-buyers-leader') || $('uc-buyers-econ') || $('uc-panel-buyers');
      } else if (focus === 'scan' || focus === 'media-hero') {
        focusEl = $('uc-evidence-hero') || $('uc-scan-lines') || $('uc-evidence-instrument');
      } else if (tab === 'media') {
        focusEl = $('uc-evidence-instrument') || $('uc-media-rooms');
      } else if (tab === 'comms') {
        focusEl = $('uc-convo-thread') || document.querySelector('.uc-comm-shell');
      } else if (focus === 'overview-snap' || tab === 'overview') {
        focusEl = document.querySelector('#uc-drawer-facts .uc-snap-section') || $('uc-drawer-facts');
      } else if (tab === 'docs') {
        focusEl = $('uc-docs-pending-list') || $('uc-docs-instrument') || $('uc-panel-docs');
      }
      if (opts.el) focusEl = opts.el;
      scrollInstrumentIntoView(focusEl);
      if (opts.flash !== false) flashState(focusEl);
    });
    return tab;
  }

  function showProfileTab(tabId) {
    const tab = PROFILE_TABS.includes(tabId) ? tabId : 'overview';
    state.profileTab = tab;
    document.querySelectorAll('.uc-profile-tabs [role="tab"]').forEach((btn) => {
      const on = btn.getAttribute('data-tab') === tab;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.uc-profile-tabpanel').forEach((panel) => {
      const on = panel.getAttribute('data-tab') === tab;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
    // Comms: hide property hero so the thread owns the modal (big visual change)
    const drawer = $('uc-drawer');
    if (drawer) drawer.classList.toggle('uc-comms-focus', tab === 'comms');
    // Tab sections are always open (no accordion). Comms still needs channel visibility.
    if (tab === 'comms') {
      showCommChannel(state.commChannel || 'seller');
      // Phone-style: open Comms on the latest message.
      requestAnimationFrame(() => pinActiveCommThreadToLatest());
    }
    if (tab === 'walkthroughs') {
      renderWalkthroughs(state.profile);
    }
    if (tab === 'buyers') {
      renderBuyerOffers();
    }
    return tab;
  }

  function pinActiveCommThreadToLatest() {
    const ch = state.commChannel || 'seller';
    if (ch === 'seller') scrollThreadToLatest($('uc-convo-thread'));
    else if (ch === 'internal') scrollThreadToLatest($('uc-team-thread'));
    else if (ch === 'photo') scrollThreadToLatest($('uc-photo-thread'));
  }

  const COMM_CHANNELS = ['seller', 'internal', 'photo'];

  function showCommChannel(channel) {
    // Snapshot the channel we're leaving before switching panes.
    saveThreadScroll($('uc-convo-thread'));
    saveThreadScroll($('uc-team-thread'));
    saveThreadScroll($('uc-photo-thread'));
    const ch = COMM_CHANNELS.includes(channel) ? channel : 'seller';
    state.commChannel = ch;
    const map = {
      seller: 'uc-convo-section',
      internal: 'uc-team-section',
      photo: 'uc-photo-convo-section'
    };
    Object.entries(map).forEach(([key, id]) => {
      const el = $(id);
      if (!el) return;
      const on = key === ch;
      el.hidden = !on;
      if (on) setPanelOpen(el, true);
    });
    document.querySelectorAll('.uc-comm-channel').forEach((btn) => {
      const on = btn.getAttribute('data-channel') === ch;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
    // Phone-style: switching channels lands on the newest message.
    requestAnimationFrame(() => pinActiveCommThreadToLatest());
    return ch;
  }

  function bindCommChannels() {
    const list = document.querySelector('#uc-drawer .uc-comm-channels');
    if (!list || list.dataset.bound === '1') return;
    list.dataset.bound = '1';
    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-channel]');
      if (!btn || !list.contains(btn)) return;
      showCommChannel(btn.getAttribute('data-channel'));
      btn.focus();
    });
    list.addEventListener('keydown', (ev) => {
      const tabs = Array.from(list.querySelectorAll('[data-channel]'));
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = tabs.length - 1;
      else return;
      ev.preventDefault();
      const t = tabs[next];
      showCommChannel(t.getAttribute('data-channel'));
      t.focus();
    });
  }

  function defaultProfileTab(deal, opts = {}) {
    // Explicit deep-links only — normal board open always lands on Overview
    if (opts.scrollToSms) return { tab: 'comms', channel: 'seller' };
    if (opts.scrollToTeam) return { tab: 'comms', channel: 'internal' };
    return { tab: 'overview' };
  }

  function bindProfileTabs() {
    const tablist = document.querySelector('#uc-drawer .uc-profile-tabs');
    if (!tablist || tablist.dataset.bound === '1') return;
    tablist.dataset.bound = '1';
    tablist.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[role="tab"]');
      if (!btn || !tablist.contains(btn)) return;
      showProfileTab(btn.getAttribute('data-tab'));
      btn.focus();
    });
    tablist.addEventListener('keydown', (ev) => {
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = tabs.length - 1;
      else return;
      ev.preventDefault();
      const t = tabs[next];
      showProfileTab(t.getAttribute('data-tab'));
      t.focus();
    });
  }

  function channelForThreadEl(box) {
    if (!box) return state.commChannel || 'seller';
    if (box.id === 'uc-team-thread') return 'internal';
    if (box.id === 'uc-photo-thread') return 'photo';
    if (box.id === 'uc-convo-thread') return 'seller';
    return state.commChannel || 'seller';
  }

  function threadScrollKey(channel) {
    return `${state.activeDealId || ''}:${channel || state.commChannel || 'seller'}`;
  }

  function saveThreadScroll(box) {
    if (!box || !state.activeDealId) return;
    try {
      state.threadScroll[threadScrollKey(channelForThreadEl(box))] = box.scrollTop;
    } catch (_) { /* ignore */ }
  }

  /** Cancel pending pin-to-bottom jobs for a thread (user is reading history). */
  function cancelThreadPin(box) {
    if (!box) return;
    box._pinGen = (box._pinGen || 0) + 1;
  }

  /**
   * Pin to latest message. Used on open / send / channel switch only.
   * Delayed image re-pins are cancelled if the user scrolls up (reading history).
   */
  function scrollThreadToLatest(box) {
    if (!box) return;
    const gen = (box._pinGen = (box._pinGen || 0) + 1);
    const hardGo = () => {
      if (box._pinGen !== gen) return;
      try {
        box.scrollTop = box.scrollHeight;
        saveThreadScroll(box);
      } catch (_) { /* ignore */ }
    };
    // Soft go: only follow if still near the bottom (never yank history readers).
    const softGo = () => {
      if (box._pinGen !== gen) return;
      if (!isThreadNearBottom(box, 140)) return;
      hardGo();
    };
    hardGo();
    requestAnimationFrame(() => {
      hardGo();
      requestAnimationFrame(hardGo);
    });
    box.querySelectorAll('img, video').forEach((el) => {
      if (el.tagName === 'IMG' && !el.complete) {
        el.addEventListener('load', softGo, { once: true });
        el.addEventListener('error', softGo, { once: true });
      }
      if (el.tagName === 'VIDEO') {
        el.addEventListener('loadedmetadata', softGo, { once: true });
      }
    });
    setTimeout(softGo, 50);
    setTimeout(softGo, 200);
    setTimeout(softGo, 450);
  }

  /** After re-render while reading: restore exact scrollTop — never jump to bottom. */
  function applyPreservedScroll(box, prevScroll) {
    if (!box) return;
    cancelThreadPin(box);
    const go = () => {
      try {
        box.scrollTop = prevScroll;
        saveThreadScroll(box);
      } catch (_) { /* ignore */ }
    };
    go();
    requestAnimationFrame(go);
  }

  /** Live tail: only if already at bottom before paint (new msgs while following). */
  function followBottomIfWasThere(box, wasNearBottom) {
    if (!box) return;
    if (wasNearBottom) {
      // One-shot pin — no multi-timeout yank chain.
      cancelThreadPin(box);
      try {
        box.scrollTop = box.scrollHeight;
        saveThreadScroll(box);
      } catch (_) { /* ignore */ }
      requestAnimationFrame(() => {
        try {
          box.scrollTop = box.scrollHeight;
          saveThreadScroll(box);
        } catch (_) { /* ignore */ }
      });
    }
  }

  function scrollOpenCommunicationThreads(panel) {
    if (!panel) return;
    const id = panel.id || '';
    if (id === 'uc-convo-section' || id === 'uc-communication-section') {
      scrollThreadToLatest($('uc-convo-thread'));
    }
    if (id === 'uc-team-section' || id === 'uc-communication-section') {
      scrollThreadToLatest($('uc-team-thread'));
    }
    if (id === 'uc-photo-convo-section' || id === 'uc-communication-section') {
      scrollThreadToLatest($('uc-photo-thread'));
    }
    if (!id && panel.classList.contains('uc-convo')) {
      scrollThreadToLatest(panel.querySelector('.uc-convo-thread'));
    }
  }

  function bindThreadScrollMemory() {
    ['uc-convo-thread', 'uc-team-thread', 'uc-photo-thread'].forEach((id) => {
      const el = $(id);
      if (!el || el.dataset.scrollMemBound === '1') return;
      el.dataset.scrollMemBound = '1';
      el.addEventListener('scroll', () => {
        saveThreadScroll(el);
        // User moved away from bottom → cancel any pending open/image pin jobs.
        if (!isThreadNearBottom(el, 140)) cancelThreadPin(el);
      }, { passive: true });
    });
  }

  function expandPanel(el) {
    if (!el) return null;
    const panel = el.closest?.('.uc-panel') || (el.classList?.contains('uc-panel') ? el : null) || el;
    if (!panel?.classList?.contains('uc-panel')) return panel;
    // Keep ancestors open so nested Communication children stay visible.
    const ancestors = [];
    let walk = panel.parentElement?.closest?.('.uc-panel');
    while (walk) {
      ancestors.push(walk);
      walk = walk.parentElement?.closest?.('.uc-panel');
    }
    ancestors.reverse().forEach((a) => setPanelOpen(a, true));
    // Accordion only among siblings at the same nesting level.
    const parent = panel.parentElement;
    if (parent) {
      Array.from(parent.children).forEach((sib) => {
        if (sib !== panel && sib.classList?.contains('uc-panel')) setPanelOpen(sib, false);
      });
    }
    setPanelOpen(panel, true);
    requestAnimationFrame(() => {
      const drawerBody = document.querySelector('#uc-drawer .uc-drawer-body');
      const summary = panel.querySelector(':scope > .uc-panel-summary');
      if (!drawerBody || !summary) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const bodyTop = drawerBody.getBoundingClientRect().top;
      const summaryTop = summary.getBoundingClientRect().top;
      const nextTop = drawerBody.scrollTop + (summaryTop - bodyTop) - 8;
      drawerBody.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    });
    return panel;
  }

  function togglePanel(panel) {
    if (!panel?.classList?.contains('uc-panel')) return null;
    if (panel.classList.contains('is-open')) {
      return setPanelOpen(panel, false);
    }
    return expandPanel(panel);
  }

  function pulseSellerSmsSection() {
    const pulse = $('uc-sms-pulse');
    if (pulse) {
      pulse.hidden = false;
      pulse.classList.add('is-flash');
    }
    showProfileTab('comms');
    showCommChannel('seller');
    const section = $('uc-convo-section');
    section?.classList.add('uc-convo--alert');
    setTimeout(() => $('uc-convo-section')?.classList.remove('uc-convo--alert'), 2500);
  }

  function scrollToSellerSms() {
    requestAnimationFrame(() => {
      showProfileTab('comms');
      showCommChannel('seller');
      $('uc-convo-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Unread SMS deep-link: jump to latest so the alert is visible.
      scrollThreadToLatest($('uc-convo-thread'));
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
    if (!el) return false;
    // Hidden / zero-height threads: not "near bottom" — open restores memory instead.
    if (el.clientHeight < 8) return false;
    if (el.scrollHeight <= el.clientHeight + 4) return true;
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

  function mediaRoomKey(m) {
    const room = String(m?.aiLabel?.room || '').trim().toLowerCase().replace(/\s+/g, '_');
    return room || 'unlabeled';
  }

  function mediaRoomLabel(key) {
    if (!key || key === 'all') return 'All';
    if (key === 'unlabeled') return 'Unlabeled';
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function filteredMediaList(list) {
    const media = Array.isArray(list) ? list : [];
    const filter = state.mediaRoomFilter || 'all';
    if (filter === 'all') return media;
    return media.filter((m) => mediaRoomKey(m) === filter);
  }

  function setEvidenceStage(mediaItem) {
    // Legacy stage preview removed — Pics tab is a single gallery now.
    state.mediaActiveId = mediaItem?.id || null;
    document.querySelectorAll('#uc-media-grid .uc-media-card.is-active').forEach((el) => el.classList.remove('is-active'));
    if (mediaItem?.id) {
      document.querySelector(`#uc-media-grid .uc-media-card[data-media-id="${CSS.escape(String(mediaItem.id))}"]`)
        ?.classList.add('is-active');
    }
  }

  function mediaSourceLabel(m) {
    const src = String(m?.uploadSource || m?.source || '').toLowerCase();
    if (src === 'photographer' || src === 'photo') return 'Photographer';
    if (src === 'desk' || src === 'upload' || src === 'manual') return 'Upload';
    if (src === 'seller' || src === 'sms') return 'Seller';
    if (src && src !== 'seller') return src.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return '';
  }

  function openEvidenceFromMediaIds(mediaIds) {
    const media = state.profile?.sellerMedia || [];
    const ids = Array.isArray(mediaIds) ? mediaIds.map(String) : [];
    const hit = media.find((m) => ids.includes(String(m.id)));
    if (hit) {
      if (hit.aiLabel?.room) state.mediaRoomFilter = mediaRoomKey(hit);
      renderMedia(media);
      setEvidenceStage(hit);
      openMediaLightbox(media, hit.id);
      return;
    }
    showToast('No cited photos linked to this line');
  }

  function renderMediaRooms(media) {
    const box = $('uc-media-rooms');
    if (!box) return;
    const counts = { all: media.length };
    for (const m of media) {
      const k = mediaRoomKey(m);
      counts[k] = (counts[k] || 0) + 1;
    }
    const keys = Object.keys(counts).filter((k) => k !== 'all').sort((a, b) => {
      if (a === 'unlabeled') return 1;
      if (b === 'unlabeled') return -1;
      return a.localeCompare(b);
    });
    const filter = state.mediaRoomFilter || 'all';
    if (filter !== 'all' && !counts[filter]) state.mediaRoomFilter = 'all';
    const active = state.mediaRoomFilter || 'all';
    const chips = [{ key: 'all', n: counts.all }, ...keys.map((k) => ({ key: k, n: counts[k] }))];
    box.innerHTML = chips.map((c) =>
      `<button type="button" class="uc-media-room-chip${c.key === active ? ' is-active' : ''}" data-room="${esc(c.key)}" role="tab" aria-selected="${c.key === active ? 'true' : 'false'}">${esc(mediaRoomLabel(c.key))} <span>${c.n}</span></button>`
    ).join('');
  }

  function renderMedia(list) {
    const box = $('uc-media-grid');
    const zip = $('uc-media-zip');
    const countMeta = $('uc-media-count-meta');
    const drop = $('uc-evidence-drop');
    if (!box) return;
    const media = Array.isArray(list) ? list : (state.profile?.sellerMedia || []);
    if (state.profile) state.profile.sellerMedia = media;
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
    if (countMeta) {
      countMeta.textContent = media.length
        ? `${media.length} photo${media.length === 1 ? '' : 's'}`
        : '0 photos';
    }
    if (drop) drop.classList.toggle('is-empty', !media.length);

    if (!media.length) {
      box.innerHTML =
        `<div class="uc-pics-empty">` +
          `<strong>No pictures yet</strong>` +
          `<p>Drop photos here, use Upload, or save media from Seller / Photographer texts in Comms.</p>` +
        `</div>`;
      state.mediaActiveId = null;
      syncProfileTabSummaries(state.profile);
      return;
    }

    box.innerHTML = media.map((m) => {
      const video = m.kind === 'video' || isVideoUrl(m.viewUrl || m.name, m.mimeType);
      const src = m.viewUrl || '';
      const preview = video
        ? `<video src="${esc(src)}" muted playsinline preload="metadata"></video>`
        : `<img src="${esc(src)}" alt="${esc(m.name || 'Property photo')}" loading="lazy">`;
      const source = mediaSourceLabel(m);
      const srcChip = source ? `<span class="uc-pics-src">${esc(source)}</span>` : '';
      const active = state.mediaActiveId && String(state.mediaActiveId) === String(m.id) ? ' is-active' : '';
      const dl = m.downloadUrl || (src + (src.includes('?') ? '&' : '?') + 'download=1');
      return (
        `<article class="uc-media-card uc-pics-tile${active}" data-media-id="${esc(m.id)}" data-media-open="1" title="Open picture">` +
          `${preview}` +
          `<div class="uc-media-card-meta">${srcChip}</div>` +
          `<div class="uc-media-card-actions">` +
            `<a href="${esc(dl)}" download>Download</a>` +
            `<button type="button" data-media-action="remove">Remove</button>` +
          `</div>` +
        `</article>`
      );
    }).join('');

    syncProfileTabSummaries(state.profile);
  }

  function uploadUrlFromDeal(deal) {
    return deal?.photographerSchedule?.uploadUrl || '';
  }

  async function copyUploadUrl() {
    const url = uploadUrlFromDeal(state.profile);
    if (!url) {
      showToast('No upload URL on file for this deal');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Upload URL copied');
    } catch (_) {
      showToast(url);
    }
  }

  function renderPhotographerSection(deal) {
    const sched = deal?.photographerSchedule;
    const copySms = $('uc-photo-copy-url-sms');
    const scheduled = Boolean(sched?.scheduled && sched?.uploadToken);
    if (copySms) copySms.hidden = !scheduled;
    syncPhotoConvoMeta(deal);
  }

  function moneyPlain(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function renderConditionScan(deal) {
    // Condition-scan UI removed from Pics + Rehab tab — keep no-op for older callers.
    if (!$('uc-scan-summary') && !$('uc-evidence-hero-total') && !$('uc-scan-lines')) return;
    const scan = deal?.conditionScan;
    const summary = $('uc-scan-summary');
    const linesBox = $('uc-scan-lines');
    const walk = $('uc-scan-walk');
    const prov = $('uc-scan-provenance');
    const meta = $('uc-scan-meta');
    const heroTotal = $('uc-evidence-hero-total');
    const heroSub = $('uc-evidence-hero-sub');
    const heroStats = $('uc-evidence-hero-stats');
    if ($('uc-scan-finish') && scan?.finishGrade) $('uc-scan-finish').value = scan.finishGrade;
    if ($('uc-scan-sqft') && scan?.livingSqft) $('uc-scan-sqft').value = scan.livingSqft;
    if ($('uc-scan-contingency') && scan?.contingencyPct != null) $('uc-scan-contingency').value = scan.contingencyPct;

    const labeledCount = Array.isArray(deal?.sellerMedia)
      ? deal.sellerMedia.filter((m) => m.aiLabel?.room).length
      : (scan?.labeledCount || 0);
    const mediaCount = Array.isArray(deal?.sellerMedia) ? deal.sellerMedia.length : (scan?.mediaCount || 0);

    if (!scan || scan.status === 'idle' || (!scan.lines?.length && scan.status !== 'labeling' && scan.status !== 'scanning' && scan.status !== 'queued')) {
      if (heroTotal) heroTotal.textContent = '—';
      if (heroSub) {
        heroSub.textContent = mediaCount
          ? `${mediaCount} photo${mediaCount === 1 ? '' : 's'} on deal · run Rescan for an estimate`
          : 'Add photos, then Rescan for a screening-grade rehab number';
      }
      if (heroStats) {
        heroStats.hidden = true;
        heroStats.innerHTML = '';
      }
      if (summary) {
        summary.hidden = true;
        summary.innerHTML = '';
      }
      if (linesBox) {
        linesBox.innerHTML = mediaCount
          ? '<div class="uc-empty-workflow" style="min-height:5rem;padding:1rem"><strong class="uc-empty-workflow-title">No estimate lines yet</strong><p class="uc-empty-workflow-body">Photos are ready. Hit Rescan to build cited rehab lines.</p></div>'
          : '<div class="uc-empty-workflow" style="min-height:5rem;padding:1rem"><strong class="uc-empty-workflow-title">No line items</strong><p class="uc-empty-workflow-body">Evidence photos drive the estimate. Upload or save from Comms first.</p></div>';
      }
      if (walk) { walk.hidden = true; walk.innerHTML = ''; }
      if (prov) prov.textContent = '';
      if (meta) meta.textContent = 'Evidence · screening estimate (not a contractor bid)';
      return;
    }

    const conf = scan.confidence || '—';
    const mid = scan.totals?.withContingency ?? scan.totals?.active;
    if (heroTotal) heroTotal.textContent = moneyPlain(mid);
    if (heroSub) {
      if (scan.status === 'labeling' || scan.status === 'scanning' || scan.status === 'queued') {
        heroSub.textContent = `${scan.status}… labeling photos / building lines`;
      } else {
        heroSub.textContent = [
          scan.finishGrade || 'investor',
          conf !== '—' ? `${conf} confidence` : '',
          labeledCount || mediaCount ? `${labeledCount}/${mediaCount || '?'} labeled` : ''
        ].filter(Boolean).join(' · ');
      }
    }
    if (heroStats) {
      heroStats.hidden = false;
      heroStats.innerHTML =
        `<div><span>Active</span><strong class="uc-money-display">${moneyPlain(scan.totals?.active)}</strong></div>` +
        `<div><span>+ Cont. ${esc(String(scan.contingencyPct ?? 10))}%</span><strong class="uc-money-display">${moneyPlain(scan.totals?.withContingency)}</strong></div>` +
        `<div><span>Voided</span><strong class="uc-money-display">${moneyPlain(scan.totals?.voided)}</strong></div>` +
        `<div><span>Confidence</span><strong class="uc-scan-conf uc-scan-conf--${esc(conf)}">${esc(conf)}</strong></div>`;
    }

    const quotaNote = scan.jobError && /quota|billing|429/i.test(scan.jobError)
      ? `<p class="uc-scan-warn">Gemini quota hit — labeled ${labeledCount}/${mediaCount}. Fix GEMINI_API_KEY billing, then Rescan.</p>`
      : (scan.jobError ? `<p class="uc-scan-warn">${esc(scan.jobError)}</p>` : '');

    if (summary) {
      const hasNotes = Boolean(scan.summary || scan.honestyLabel || quotaNote || scan.overPurchaseWarn);
      summary.hidden = !hasNotes;
      summary.innerHTML = hasNotes
        ? (scan.summary ? `<p>${esc(scan.summary)}</p>` : '') +
          (scan.honestyLabel ? `<p class="uc-docs-meta">${esc(scan.honestyLabel)}</p>` : '') +
          quotaNote +
          (scan.overPurchaseWarn ? '<p class="uc-scan-warn">Rehab mid is high vs purchase — double-check scope.</p>' : '')
        : '';
    }

    if (walk && Array.isArray(scan.walkOrder) && scan.walkOrder.length) {
      walk.hidden = false;
      walk.innerHTML = '<h4>Blind spots / walk order</h4><ol>' +
        scan.walkOrder.map((w) => `<li><strong>${esc((w.room || '').replace(/_/g, ' '))}</strong> — ${esc(w.tip || '')}</li>`).join('') +
        '</ol>';
    } else if (walk) {
      walk.hidden = true;
      walk.innerHTML = '';
    }

    const lines = (Array.isArray(scan.lines) ? scan.lines.slice() : []).sort((a, b) => {
      const av = a.voided ? -1 : Number(a.total) || 0;
      const bv = b.voided ? -1 : Number(b.total) || 0;
      return bv - av;
    });
    if (linesBox) {
      linesBox.innerHTML = lines.map((l) => {
        const faded = l.voided ? ' is-voided' : '';
        const cites = Array.isArray(l.mediaIds) ? l.mediaIds.length : 0;
        return `<div class="uc-scan-line${faded}${cites ? ' is-citable' : ''}" data-line-id="${esc(l.id)}" data-media-ids="${esc((l.mediaIds || []).join(','))}" tabindex="${cites ? '0' : '-1'}">
          <div class="uc-scan-line-main">
            <strong>${esc(l.label)}</strong>
            <span class="uc-scan-cat">${esc(l.category)}</span>
            <span class="uc-money-display">${moneyPlain(l.total)}</span>
          </div>
          <div class="uc-scan-line-meta">${esc(String(l.qty))} ${esc(l.unit)} · ${cites ? cites + ' photo' + (cites === 1 ? '' : 's') : 'no photos'}${l.note ? ' · ' + esc(l.note) : ''}</div>
          <button type="button" class="phuglee-btn phuglee-btn-ghost uc-scan-void-btn" data-line-void="${esc(l.id)}" data-voided="${l.voided ? '0' : '1'}">${l.voided ? 'Restore' : 'Void'}</button>
        </div>`;
      }).join('') || '<p class="uc-docs-meta">No cited rehab lines yet.</p>';
    }

    if (prov) {
      prov.textContent = [
        scan.costBookVersion ? `book ${scan.costBookVersion}` : '',
        scan.metroLabel || scan.metroId || '',
        scan.livingSqft ? `sqft ${scan.livingSqft} (${scan.sqftSource || '?'})` : '',
        scan.scannedAt ? `scanned ${scan.scannedAt}` : ''
      ].filter(Boolean).join(' · ');
    }
    if (meta) meta.textContent = `Evidence · ${scan.status || 'ready'} · ${scan.finishGrade || 'investor'}`;
  }

  async function schedulePhotographer() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const body = {
      date: $('uc-photo-date')?.value || '',
      time: $('uc-photo-time')?.value || '',
      photographerName: $('uc-photo-name')?.value || '',
      photographerEmail: $('uc-photo-email')?.value || '',
      photographerPhone: $('uc-photo-phone')?.value || ''
    };
    if (!body.date || !body.time || !body.photographerName || !body.photographerPhone) {
      showToast('Date, time, name, and phone required');
      return;
    }
    const btn = $('uc-photo-sched-save');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/photographer/schedule`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (data.deal) state.profile = { ...state.profile, ...data.deal };
      renderPhotographerSection(state.profile);
      syncPhotoConvoMeta(state.profile);
      loadPhotographerMessages(dealId);
      showToast(data.introSmsSentAt ? 'Scheduled + intro SMS sent' : (data.ghlWarning || 'Scheduled'));
      if (data.ghlWarning && data.introSmsSentAt) showToast(data.ghlWarning);
    } catch (err) {
      showToast(err.message || 'Schedule failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function runRehabScan({ sync } = {}) {
    const dealId = state.activeDealId;
    if (!dealId) return;
    try {
      showToast(sync ? 'Scanning…' : 'Queued AI label + scan…');
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/rehab-scan`, {
        method: 'POST',
        body: JSON.stringify({ sync: !!sync, force: false })
      });
      if (data.deal) {
        state.profile = { ...state.profile, ...data.deal };
        renderMedia(state.profile.sellerMedia || []);
        renderConditionScan(state.profile);
        flashState($('uc-evidence-hero') || $('uc-scan-lines') || $('uc-evidence-instrument'));
      } else {
        // poll profile shortly
        setTimeout(() => refreshProfileScan(), 2500);
        setTimeout(() => refreshProfileScan(), 8000);
      }
    } catch (err) {
      showToast(err.message || 'Scan failed');
    }
  }

  async function refreshProfileScan() {
    if (!state.activeDealId) return;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(state.activeDealId)}`);
      if (data.deal) {
        state.profile = { ...state.profile, ...data.deal };
        renderMedia(state.profile.sellerMedia || []);
        renderConditionScan(state.profile);
        renderPhotographerSection(state.profile);
      }
    } catch (_) { /* ignore */ }
  }

  async function applyScanOptions() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/rehab-scan/options`, {
        method: 'POST',
        body: JSON.stringify({
          finishGrade: $('uc-scan-finish')?.value || 'investor',
          livingSqft: Number($('uc-scan-sqft')?.value) || undefined,
          contingencyPct: Number($('uc-scan-contingency')?.value)
        })
      });
      if (data.conditionScan) {
        state.profile = { ...state.profile, conditionScan: data.conditionScan };
        renderConditionScan(state.profile);
        showToast('Repriced');
      }
    } catch (err) {
      showToast(err.message || 'Reprice failed');
    }
  }

  async function voidScanLine(lineId, voided) {
    const dealId = state.activeDealId;
    if (!dealId || !lineId) return;
    try {
      const data = await api(
        `/api/leads/admin/contracts/${encodeURIComponent(dealId)}/rehab-scan/lines/${encodeURIComponent(lineId)}/void`,
        { method: 'POST', body: JSON.stringify({ voided: voided !== false }) }
      );
      if (data.conditionScan) {
        state.profile = { ...state.profile, conditionScan: data.conditionScan };
        renderConditionScan(state.profile);
      }
    } catch (err) {
      showToast(err.message || 'Void failed');
    }
  }

  async function deskUploadMedia(fileList) {
    const dealId = state.activeDealId;
    const files = [...(fileList || [])];
    if (!dealId || !files.length) return;
    const items = [];
    for (const file of files) {
      const contentBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || '');
          resolve(s.includes(',') ? s.split(',')[1] : s);
        };
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });
      items.push({
        contentBase64,
        mimeType: file.type || 'image/jpeg',
        name: file.name,
        uploadSource: 'desk'
      });
    }
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/media`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
    if (data.deal) state.profile = { ...state.profile, ...data.deal, sellerMedia: data.sellerMedia || data.deal.sellerMedia };
    else if (data.sellerMedia) state.profile.sellerMedia = data.sellerMedia;
    renderMedia(state.profile.sellerMedia || []);
    showToast(`Uploaded ${data.saved || items.length}`);
    setTimeout(() => refreshProfileScan(), 3000);
  }

  function sellerDisplayName(deal) {
    const d = deal || state.profile || {};
    const c = state.contact || {};
    const name = d.ownerName || d.sellerNames || c.sellersName || c.name || '';
    const first = String(name).split(/[,&]/)[0].trim();
    return first || 'Seller';
  }

  function photographerDisplayName(deal) {
    const sched = (deal || state.profile)?.photographerSchedule;
    return String(sched?.photographerName || '').trim() || 'Photographer';
  }

  function meDisplayName() {
    return teamDisplayName(teamUserKey()) || 'You';
  }

  function dayKeyFromWhen(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function dayLabelFromWhen(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const yday = new Date();
    yday.setDate(today.getDate() - 1);
    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yday)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function convoDaySep(label) {
    return `<div class="uc-convo-day" role="separator"><span>${esc(label)}</span></div>`;
  }

  function syncSellerModeHeader(deal) {
    const nameEl = $('uc-seller-mode-name');
    const meta = $('uc-convo-meta');
    const name = sellerDisplayName(deal);
    if (nameEl) nameEl.textContent = name;
    if (!meta) return;
    const phone = deal?.phone || state.contact?.phone || state.toNumber || '';
    const bits = [];
    if (phone) bits.push(phone);
    if (state.fromNumber && state.toNumber) bits.push(`${state.fromNumber} → ${state.toNumber}`);
    if (deal?.sellerSmsUnread) bits.push('Unread inbound');
    meta.textContent = bits.join(' · ') || 'Seller SMS on this deal';
  }

  function syncPhotoConvoMeta(deal) {
    const meta = $('uc-photo-convo-meta');
    const nameEl = $('uc-photo-mode-name');
    const chip = $('uc-photo-media-count');
    const banner = $('uc-photo-job-banner');
    const sched = deal?.photographerSchedule;
    const name = photographerDisplayName(deal);
    if (nameEl) nameEl.textContent = name;
    if (meta) {
      if (sched?.photographerName) {
        meta.textContent = [
          sched.photographerPhone || '',
          sched.date || sched.scheduledDate || '',
          sched.time || sched.scheduledTime || ''
        ].filter(Boolean).join(' · ') || 'Field logistics SMS';
      } else {
        meta.textContent = 'Schedule a shoot or text logistics';
      }
    }
    const mediaN = Array.isArray(deal?.sellerMedia)
      ? deal.sellerMedia.filter((m) => m.uploadSource === 'photographer' || m.uploadSource === 'photo').length
      : 0;
    const allMedia = Array.isArray(deal?.sellerMedia) ? deal.sellerMedia.length : 0;
    if (chip) {
      if (allMedia) {
        chip.hidden = false;
        chip.textContent = mediaN
          ? `${mediaN} photographer · ${allMedia} total`
          : `${allMedia} media on deal`;
      } else {
        chip.hidden = true;
      }
    }
    if (banner) {
      const scheduled = Boolean(sched?.scheduled && (sched?.uploadToken || sched?.uploadUrl));
      if (scheduled) {
        banner.hidden = false;
        banner.innerHTML = `<strong>Job live</strong> · ${esc(name)}${sched.date || sched.scheduledDate ? ' · ' + esc(String(sched.date || sched.scheduledDate)) : ''}${sched.time || sched.scheduledTime ? ' ' + esc(String(sched.time || sched.scheduledTime)) : ''}${sched.uploadUrl ? ' · upload link ready' : ''}`;
      } else if (sched?.photographerName) {
        banner.hidden = false;
        banner.innerHTML = `<strong>Contact on file</strong> · ${esc(name)} · no active upload link`;
      } else {
        banner.hidden = true;
        banner.innerHTML = '';
      }
    }
  }

  function renderPhotographerMessages(opts = {}) {
    const box = $('uc-photo-thread');
    if (!box) return;
    const forceScroll = opts.forceScroll === true;
    const stickToBottom = isThreadNearBottom(box);
    const prevScroll = box.scrollTop;
    const list = state.photographerMessages || [];
    const photoName = photographerDisplayName();
    const me = meDisplayName();
    if (!list.length) {
      box.innerHTML = `<div class="uc-convo-empty"><strong>No photographer texts yet</strong><span>Schedule or text logistics below.</span></div>`;
      return;
    }
    let lastDay = '';
    const parts = [];
    for (const m of list) {
      const day = dayKeyFromWhen(m.dateAdded);
      if (day && day !== lastDay) {
        parts.push(convoDaySep(dayLabelFromWhen(m.dateAdded)));
        lastDay = day;
      }
      const outbound = m.direction === 'outbound' || m.direction === 'out';
      const when = formatUcWhen(m.dateAdded);
      const body = (m.body || '').trim();
      parts.push(`<div class="uc-bubble ${outbound ? 'uc-bubble--out' : 'uc-bubble--in'}">
        <div class="uc-bubble-body">${body ? esc(body) : esc('(no text)')}</div>
        <div class="uc-bubble-meta">${esc(outbound ? me : photoName)}${when ? ' · ' + esc(when) : ''}</div>
      </div>`);
    }
    box.innerHTML = parts.join('');
    if (opts.keepScroll === true) {
      if (stickToBottom) followBottomIfWasThere(box, true);
      else applyPreservedScroll(box, prevScroll);
    } else {
      scrollThreadToLatest(box);
    }
  }

  async function loadPhotographerMessages(dealId, opts = {}) {
    if (!dealId) return;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/photographer/messages`);
      state.photographerMessages = data.messages || [];
      renderPhotographerMessages({
        forceScroll: opts.forceScroll === true,
        keepScroll: opts.keepScroll === true && opts.forceScroll !== true
      });
      if (data.photographerName || data.warning) {
        const meta = $('uc-photo-convo-meta');
        if (meta && data.photographerName) {
          meta.textContent = `Texting ${data.photographerName} — separate from seller SMS`;
        } else if (meta && data.warning) {
          meta.textContent = data.warning;
        }
      }
    } catch (_) {
      state.photographerMessages = [];
      renderPhotographerMessages({ forceScroll: opts.forceScroll === true });
    }
  }

  async function sendPhotographerSms() {
    const dealId = state.activeDealId;
    const input = $('uc-photo-sms-input');
    const text = (input?.value || '').trim();
    if (!dealId || !text) return;
    const btn = $('uc-photo-sms-send');
    if (btn) btn.disabled = true;
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/photographer/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });
      input.value = '';
      showToast('Photographer SMS sent');
      await loadPhotographerMessages(dealId, { forceScroll: true });
    } catch (err) {
      showToast(err.message || 'Send failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderMessages(opts = {}) {
    const box = $('uc-convo-thread');
    if (!box) return;
    const forceScroll = opts.forceScroll === true;
    const stickToBottom = isThreadNearBottom(box);
    const prevScroll = box.scrollTop;
    const sellerName = sellerDisplayName();
    const me = meDisplayName();
    if (!state.messages.length) {
      box.innerHTML = `<div class="uc-convo-empty"><strong>No texts on this deal yet</strong><span>Message the seller below.</span></div>`;
      syncSaveAllMediaButton();
      return;
    }
    const dealId = state.activeDealId;
    let lastDay = '';
    const parts = [];
    for (const m of state.messages) {
      const day = dayKeyFromWhen(m.dateAdded);
      if (day && day !== lastDay) {
        parts.push(convoDaySep(dayLabelFromWhen(m.dateAdded)));
        lastDay = day;
      }
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
      parts.push(`<div class="uc-bubble ${outbound ? 'uc-bubble--out' : 'uc-bubble--in'}">
        <div class="uc-bubble-body">${body ? esc(body) : (attHtml ? '' : esc('(no text)'))}${attHtml}</div>
        <div class="uc-bubble-meta">${esc(outbound ? me : sellerName)}${when ? ' · ' + esc(when) : ''}</div>
      </div>`);
    }
    box.innerHTML = parts.join('');
    // Open/send → pin latest. Poll/re-render → preserve scroll (only soft-follow if was at bottom).
    if (opts.keepScroll === true) {
      if (stickToBottom) followBottomIfWasThere(box, true);
      else applyPreservedScroll(box, prevScroll);
    } else {
      scrollThreadToLatest(box);
    }
    syncSaveAllMediaButton();
  }

  async function loadMessages(dealId, opts = {}) {
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/messages`);
    state.messages = data.messages || [];
    state.fromNumber = data.fromNumber || null;
    state.toNumber = data.toNumber || null;
    if (data.deal) {
      state.profile = { ...(state.profile || {}), ...data.deal };
    }
    syncSellerModeHeader(state.profile);
    if (data.warning && $('uc-convo-meta') && !state.toNumber) {
      $('uc-convo-meta').textContent = data.warning;
    }
    // Silent poll / background refresh: never yank scroll. Open/send use forceScroll.
    const keepScroll = opts.keepScroll === true || (opts.silent === true && opts.forceScroll !== true);
    renderMessages({
      forceScroll: opts.forceScroll === true,
      keepScroll
    });
    // Opening/polling must NOT clear unread — only Mark as read or a reply does.
    const boardChanged = applySellerSmsDealPatch(data.deal, data.unreadSellerSms);
    if (boardChanged) renderTable(state.deals);
    if (!opts.silent) showToast(`Loaded ${state.messages.length} messages`);
  }

  async function markSellerSmsRead(dealId) {
    const id = dealId || state.activeDealId;
    if (!id) return;
    const btn = $('uc-sms-mark-read');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/messages/seen`, {
        method: 'POST',
        body: '{}'
      });
      const boardChanged = applySellerSmsDealPatch(data.deal, data.unreadSellerSms);
      if (boardChanged) renderTable(state.deals);
      syncMarkReadButton(false);
      showToast('Seller texts marked as read');
    } finally {
      if (btn) btn.disabled = false;
      syncMarkReadButton();
    }
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

  function getProfileFocusables() {
    const root = $('uc-drawer');
    if (!root || root.hidden) return [];
    const sel = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'summary',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(root.querySelectorAll(sel)).filter((el) => {
      if (el.closest('[hidden]')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.tabIndex < 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    });
  }

  function anyBlockingOverlayOpen() {
    if ($('uc-lightbox') && !$('uc-lightbox').hidden) return true;
    const dialogIds = [
      'uc-release-dialog',
      'uc-buyer-dialog',
      'uc-jv-dialog',
      'uc-amendment-dialog',
      'uc-edit-dialog',
      'uc-funded-dialog',
      'uc-aoc-remind-dialog',
      'uc-psa-dialog',
      'uc-rehab-view-dialog'
    ];
    return dialogIds.some((id) => {
      const d = $(id);
      return d && d.open;
    });
  }

  function handleProfileFocusTrap(ev) {
    if (ev.key !== 'Tab') return;
    const drawer = $('uc-drawer');
    if (!drawer || drawer.hidden) return;
    if (anyBlockingOverlayOpen()) return;
    const focusables = getProfileFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !drawer.contains(active)) {
        ev.preventDefault();
        last.focus();
      }
    } else if (active === last || !drawer.contains(active)) {
      ev.preventDefault();
      first.focus();
    }
  }

  function syncProfilePrimaryCta(deal) {
    // Header chrome removed — primary/edit stay off-screen hooks only.
    const btn = $('uc-profile-primary');
    if (!btn) return;
    const stage = String(deal?.stage || '');
    const waiting = isWaitingForSignatures(deal) || stage === 'contract_sent';
    let action = 'edit';
    if (waiting) action = 'docs';
    else if (stage === 'under_contract') action = 'aoc';
    else if (stage === 'buyer_found') action = 'jv';
    btn.dataset.primaryAction = action;
    btn.hidden = true;
    btn.setAttribute('aria-hidden', 'true');
    const editBtn = $('uc-drawer-edit');
    if (editBtn) {
      editBtn.hidden = true;
      editBtn.setAttribute('aria-hidden', 'true');
    }
  }

  function runProfilePrimaryAction() {
    const deal = state.profile
      || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId));
    if (!deal) {
      showToast('Open a property first');
      return;
    }
    const action = $('uc-profile-primary')?.dataset.primaryAction || 'edit';
    if (action === 'aoc') {
      openAocAction(deal);
      return;
    }
    if (action === 'jv') {
      openSendJv(deal);
      return;
    }
    if (action === 'refresh-signed') {
      navigateProfileInstrument('docs', { focus: 'docs-attention', flash: false });
      refreshSignedDocuments();
      return;
    }
    if (action === 'docs') {
      navigateProfileInstrument('docs', { focus: 'docs-attention' });
      return;
    }
    openEdit(deal);
  }

  function syncProfileTabSummaries(deal) {
    const d = deal || state.profile;
    const docs = Array.isArray(d?.documents) ? d.documents.length : 0;
    const buyers = Array.isArray(state.buyerOffers)
      ? state.buyerOffers.length
      : (Array.isArray(d?.buyerOffers) ? d.buyerOffers.length : 0);
    const media = Array.isArray(d?.sellerMedia) ? d.sellerMedia.length : 0;
    const unread = !!(d?.sellerSmsUnread);

    function setCountTab(id, base, count) {
      const el = $(id);
      if (!el) return;
      const n = Number(count) || 0;
      el.textContent = n > 0 ? base + ' (' + n + ')' : base;
      el.setAttribute('data-summary', String(n));
    }

    const walks = Array.isArray(d?.walkthroughs) ? d.walkthroughs.length : 0;

    setCountTab('uc-tab-docs', 'Documents', docs);
    setCountTab('uc-tab-buyers', 'Offers', buyers);
    setCountTab('uc-tab-walkthroughs', 'Walkthroughs', walks);
    setCountTab('uc-tab-media', 'Pics + Rehab Info', media);

    const overview = $('uc-tab-overview');
    if (overview) {
      overview.textContent = 'Overview';
      overview.removeAttribute('data-summary');
    }

    const comms = $('uc-tab-comms');
    if (comms) {
      comms.textContent = 'Comms';
      comms.setAttribute('data-summary', unread ? '1' : '0');
      comms.classList.toggle('has-unread', unread);
      if (unread) {
        comms.setAttribute('aria-label', 'Comms, unread seller texts');
      } else {
        comms.removeAttribute('aria-label');
      }
    }
  }

  function syncWaitingForSignaturesUi(deal) {
    const waiting = isWaitingForSignatures(deal);
    const actionsMore = document.querySelector('#uc-drawer .uc-drawer-more');
    if (actionsMore) actionsMore.hidden = waiting;
    const docsSend = document.querySelector('#uc-drawer .uc-docs-send');
    if (docsSend) docsSend.hidden = waiting;
    ['uc-drawer-buyer-found', 'uc-drawer-send-jv', 'uc-drawer-amendment'].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = waiting;
    });
  }

  /** Seller display names for Overview snapshot (1–2). */
  function overviewSellerNames(deal, contact) {
    const out = [];
    const push = (n) => {
      const name = String(n || '').trim();
      if (!name || out.includes(name)) return;
      out.push(name);
    };
    const sellers = Array.isArray(deal?.contractSellers) ? deal.contractSellers : [];
    for (const s of sellers) {
      push(s?.name);
      if (out.length >= 2) return out;
    }
    const joined = String(
      deal?.sellerNames || deal?.ownerName || contact?.sellersName || contact?.name || ''
    ).trim();
    if (joined) {
      const parts = joined.split(/\s*\/\s*|\s+and\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        push(p);
        if (out.length >= 2) break;
      }
    }
    if (!out.length && deal?.ownerName) push(deal.ownerName);
    return out.slice(0, 2);
  }

  function isPlaceholderBuyerName(name) {
    const n = String(name || '').trim();
    if (!n) return true;
    // Board "buyer found" labels / yes-no leakage must never show as a person
    return /^(yes|no|y|n|—|-|n\/a|na|none|unset|unknown|true|false|buyer found)$/i.test(n);
  }

  /**
   * End buyer for Overview: leading Buyers-tab offer, else real cashBuyerName.
   * Returns null when none — UI shows "No".
   */
  function overviewEndBuyerInfo(deal) {
    const offers = typeof sortedBuyerOffers === 'function' ? sortedBuyerOffers() : [];
    const leader = offers[0] || null;
    const offerName = String(leader?.buyerName || '').trim();
    const cashName = String(deal?.cashBuyerName || '').trim();

    let name = '';
    let offer = null;
    if (!isPlaceholderBuyerName(offerName)) {
      name = offerName;
      offer = leader;
    } else if (!isPlaceholderBuyerName(cashName)) {
      name = cashName;
      offer = leader;
    }
    if (!name) return null;

    const amount = offer && typeof offerAmountNum === 'function'
      ? offerAmountNum(offer)
      : (offer && Number.isFinite(Number(offer.offerAmount)) ? Number(offer.offerAmount) : null);

    return {
      name,
      offerAmount: amount,
      offerCount: offers.length
    };
  }

  /** @deprecated use overviewEndBuyerInfo — kept name for tests that may reference buyer label path */
  function overviewEndBuyerName(deal) {
    const info = overviewEndBuyerInfo(deal);
    return info ? info.name : '';
  }

  /** End buyer purchase = our lockup + assignment when both numbers exist. */
  function overviewEndBuyerPrice(deal) {
    const p = Number(deal?.purchasePrice);
    const a = Number(deal?.assignmentFee);
    if (!Number.isFinite(p) || !Number.isFinite(a)) return null;
    return p + a;
  }

  /** Property image for profile atmosphere (street view / thumb / first media). */
  function profileAtmosphereUrl(deal) {
    const base = photoUrl(deal);
    if (base) return base;
    const media = Array.isArray(deal?.sellerMedia) ? deal.sellerMedia : [];
    for (const m of media) {
      const u = m?.viewUrl || m?.downloadUrl || m?.thumbUrl;
      if (u) return u;
    }
    return '';
  }

  function applyProfileAtmosphere(deal) {
    const drawer = $('uc-drawer');
    if (!drawer || !drawer.classList.contains('uc-profile')) return;
    const url = profileAtmosphereUrl(deal);
    if (url) {
      // Escape quotes in URL for CSS
      const safe = String(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      drawer.style.setProperty('--uc-profile-photo', `url("${safe}")`);
      drawer.classList.add('has-deal-photo');
    } else {
      drawer.style.removeProperty('--uc-profile-photo');
      drawer.classList.remove('has-deal-photo');
    }
  }

  function hasInvestorBaseUrl(deal) {
    const u = String(deal?.investorBaseUrl || state.investorBaseUrl || '').trim();
    if (!u) return false;
    if (/^https?:\/\/\/?$/i.test(u) || u === 'https://' || u === 'http://') return false;
    return true;
  }

  function marketingBannerHtml(deal) {
    const yes = hasInvestorBaseUrl(deal);
    return (
      `<span id="uc-marketing-banner" class="uc-marketing-banner uc-marketing-chip ${yes ? 'is-yes' : 'is-no'}"` +
        ` role="status" title="Started marketing? ${yes ? 'Yes — InvestorBase URL set' : 'No — add Investor site URL'}">` +
        `<span class="uc-marketing-banner-label">Marketing to Buyers:</span>` +
        `<strong class="uc-marketing-banner-value">${yes ? 'Yes' : 'No'}</strong>` +
      `</span>`
    );
  }

  function syncMarketingBanner(deal) {
    const host = $('uc-drawer-hero')?.querySelector('.uc-profile-hero-badges');
    if (!host) return;
    const existing = $('uc-marketing-banner');
    const html = marketingBannerHtml(deal || state.profile);
    if (existing) {
      existing.outerHTML = html;
    } else {
      // Sit to the right of cash / subto (and any trust-fund badge)
      host.insertAdjacentHTML('beforeend', html);
    }
  }

  function renderOverviewSnapshot(deal, contact) {
    const root = $('uc-drawer-facts');
    if (!root) return;
    const sellers = overviewSellerNames(deal, contact);
    const sellerLine = sellers.length ? sellers.join(' · ') : '—';
    const endBuyer = overviewEndBuyerInfo(deal);
    const endPrice = overviewEndBuyerPrice(deal);
    const notesRaw = String(deal?.notes || '');
    const closingRaw = deal?.closingDate || contact?.closingDate || deal?.closingDisplay || '';
    const closing = formatOverviewClosingDate(closingRaw);
    const accessText = deal.accessDisplay || deal.accessLabel || '—';
    const accessDetail = String(deal.accessDetail || '').trim();

    const endBuyerHtml = endBuyer
      ? `<strong class="uc-snap-value">${esc(endBuyer.name)}</strong>` +
        (endBuyer.offerAmount != null
          ? `<span class="uc-snap-sub uc-money-display">${esc(money(endBuyer.offerAmount))} offer${endBuyer.offerCount > 1 ? ' · lead of ' + endBuyer.offerCount : ''}</span>`
          : '')
      : `<strong class="uc-snap-value is-empty">No</strong>`;

    root.innerHTML =
      `<section class="uc-snap-section" aria-label="Parties">
        <h3 class="uc-brief-section-title">Parties</h3>
        <div class="uc-snap-grid uc-snap-grid--parties">
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Seller${sellers.length > 1 ? 's' : ''}</h4>
            <strong class="uc-snap-value">${esc(sellerLine)}</strong>
          </div>
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">End Buyer</h4>
            ${endBuyerHtml}
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Deal breakdown">
        <h3 class="uc-brief-section-title">Deal Breakdown</h3>
        <div class="uc-snap-econ">
          <div class="uc-snap-econ-cell">
            <h4 class="uc-snap-label">Our Price</h4>
            <strong class="uc-money-display">${esc(money(deal.purchasePrice))}</strong>
          </div>
          <div class="uc-snap-econ-cell">
            <h4 class="uc-snap-label">End Buyer Price</h4>
            <strong class="uc-money-display">${esc(endPrice == null ? '—' : money(endPrice))}</strong>
          </div>
          <div class="uc-snap-econ-cell uc-snap-econ-cell--assignment">
            <h4 class="uc-snap-label">Assignment Fee</h4>
            <strong class="uc-money-display uc-snap-assignment">${esc(money(deal.assignmentFee))}</strong>
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Buyer walkthrough">
        <h3 class="uc-brief-section-title">Buyer Walkthrough</h3>
        <div class="uc-snap-grid uc-snap-grid--parties">
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Access</h4>
            <div class="uc-snap-chip">
              ${statusChip({
                kind: 'access',
                label: 'Access',
                value: deal.accessType,
                text: accessDetail && accessDetail !== accessText
                  ? `${accessText} · ${accessDetail}`
                  : accessText
              })}
            </div>
          </div>
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Vacancy</h4>
            <div class="uc-snap-chip">${statusChip({ kind: 'vacancy', label: 'Vacancy', value: deal.vacancy, text: deal.vacancyLabel })}</div>
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Close and status">
        <h3 class="uc-brief-section-title">Close &amp; Status</h3>
        <div class="uc-snap-status">
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Closing Date</h4>
            <strong class="uc-snap-value">${esc(closing)}</strong>
          </div>
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Title Open</h4>
            <div class="uc-snap-chip">${statusChip({ label: 'Title', yn: deal.titleOpened, text: deal.titleOpenedLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Our EMD</h4>
            <div class="uc-snap-chip">${statusChip({ label: 'EMD', yn: deal.sellerEmdSubmitted, text: deal.sellerEmdLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <h4 class="uc-snap-label">Buyer EMD</h4>
            <div class="uc-snap-chip">${statusChip({ label: 'Buyer EMD', yn: deal.buyerEmdSubmitted, text: deal.buyerEmdLabel })}</div>
          </div>
        </div>
      </section>

      <section class="uc-snap-section uc-snap-section--notes" aria-label="Notes">
        <h3 class="uc-brief-section-title">Notes</h3>
        ${notesRaw
          ? `<div class="uc-snap-note-card" id="uc-overview-note-card">
              <p class="uc-snap-note-body">${esc(notesRaw)}</p>
            </div>
            <button type="button" id="uc-overview-note-open" class="phuglee-btn phuglee-btn-secondary phuglee-btn-sm" data-note-mode="edit">Edit note</button>`
          : `<button type="button" id="uc-overview-note-open" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm" data-note-mode="add">Add a Note</button>`}
      </section>`;
  }

  function openNoteDialog() {
    const dlg = $('uc-note-dialog');
    if (!dlg) return;
    const existing = String(state.profile?.notes || '').trim();
    const title = $('uc-note-dialog-title');
    if (title) title.textContent = existing ? 'Edit note' : 'Add a Note';
    if ($('uc-note-input')) $('uc-note-input').value = existing;
    const clearBtn = $('uc-note-clear');
    if (clearBtn) clearBtn.hidden = !existing;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    requestAnimationFrame(() => $('uc-note-input')?.focus());
  }

  function closeNoteDialog() {
    const dlg = $('uc-note-dialog');
    if (dlg?.open) dlg.close();
    else dlg?.removeAttribute('open');
  }

  async function saveOverviewNotes(notesExplicit) {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first');
      return;
    }
    const notes = notesExplicit != null
      ? String(notesExplicit).trim()
      : ($('uc-note-input')?.value || '').trim();
    const btn = $('uc-note-save');
    if (btn) btn.disabled = true;
    try {
      const data = await saveDealFields(dealId, { notes });
      if (data.deal) {
        mergeDealIntoState(data.deal);
        state.profile = { ...(state.profile || {}), ...data.deal };
      }
      renderOverviewSnapshot(state.profile, state.contact);
      closeNoteDialog();
      showToast(notes ? 'Note saved' : 'Note cleared');
    } catch (err) {
      showToast(err.message || 'Could not save note');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindOverviewNotes() {
    const facts = $('uc-drawer-facts');
    if (facts && facts.dataset.notesBound !== '1') {
      facts.dataset.notesBound = '1';
      facts.addEventListener('click', (ev) => {
        if (ev.target.closest('#uc-overview-note-open')) {
          openNoteDialog();
        }
      });
    }
    const save = $('uc-note-save');
    if (save && save.dataset.bound !== '1') {
      save.dataset.bound = '1';
      save.addEventListener('click', () => {
        saveOverviewNotes().catch((e) => showToast(e.message || 'Save failed'));
      });
    }
    const clear = $('uc-note-clear');
    if (clear && clear.dataset.bound !== '1') {
      clear.dataset.bound = '1';
      clear.addEventListener('click', () => {
        if ($('uc-note-input')) $('uc-note-input').value = '';
        saveOverviewNotes('').catch((e) => showToast(e.message || 'Clear failed'));
      });
    }
  }

  /* ── Walkthroughs ─────────────────────────────────────────────── */

  function walkthroughList(deal) {
    const list = Array.isArray(deal?.walkthroughs) ? deal.walkthroughs.slice() : [];
    return list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  }

  function localDayKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function walkthroughUrgencyClient(deal, now = new Date()) {
    const list = walkthroughList(deal);
    if (!list.length) return { kind: null, walkthrough: null };
    const today = localDayKey(now);
    const tomorrow = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const todayHit = list.find((w) => localDayKey(w.at) === today);
    if (todayHit) return { kind: 'today', walkthrough: todayHit };
    const tomHit = list.find((w) => localDayKey(w.at) === tomorrow);
    if (tomHit) return { kind: 'tomorrow', walkthrough: tomHit };
    return { kind: null, walkthrough: null };
  }

  function formatWalkWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function renderWalkthroughAlert(deal) {
    const el = $('uc-walkthrough-alert');
    if (!el) return;
    const { kind, walkthrough } = walkthroughUrgencyClient(deal);
    if (!kind || !walkthrough) {
      el.hidden = true;
      el.innerHTML = '';
      el.className = 'uc-walkthrough-alert';
      return;
    }
    const buyer = walkthrough.buyerName || 'Buyer';
    const when = formatWalkWhen(walkthrough.at);
    el.hidden = false;
    el.className = `uc-walkthrough-alert is-${kind}`;
    if (kind === 'today') {
      el.innerHTML =
        `<strong>Walkthrough today</strong>` +
        `<span>${esc(buyer)} · ${esc(when)}</span>` +
        `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-action="goto-walkthroughs">View</button>`;
    } else {
      el.innerHTML =
        `<strong>Walkthrough tomorrow</strong>` +
        `<span>${esc(buyer)} · ${esc(when)}</span>` +
        `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-action="goto-walkthroughs">View</button>`;
    }
  }

  function renderWalkthroughs(deal) {
    const d = deal || state.profile || {};
    const accessEl = $('uc-walk-kpi-access');
    const vacEl = $('uc-walk-kpi-vacancy');
    if (accessEl) {
      const accessText = d.accessDisplay || d.accessLabel || '—';
      const detail = String(d.accessDetail || '').trim();
      const text = detail && detail !== accessText
        ? `${accessText} · ${detail}`
        : accessText;
      // Match Overview orange status chips
      accessEl.innerHTML = statusChip({
        kind: 'access',
        label: 'Access',
        value: d.accessType,
        text
      });
    }
    if (vacEl) {
      vacEl.innerHTML = statusChip({
        kind: 'vacancy',
        label: 'Vacancy',
        value: d.vacancy,
        text: d.vacancyLabel || d.vacancy || '—'
      });
    }

    const box = $('uc-walk-list');
    if (!box) return;
    const list = walkthroughList(d);
    if (!list.length) {
      box.innerHTML =
        `<div class="uc-walk-empty">` +
          `<strong>No walkthroughs scheduled</strong>` +
          `<p>Add a buyer name and time so the desk can track showings.</p>` +
        `</div>`;
      syncProfileTabSummaries(d);
      return;
    }
    const now = new Date();
    const today = localDayKey(now);
    const tomorrow = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    box.innerHTML = list.map((w) => {
      const day = localDayKey(w.at);
      let badge = '';
      if (day === today) badge = '<span class="uc-walk-badge is-today">Today</span>';
      else if (day === tomorrow) badge = '<span class="uc-walk-badge is-tomorrow">Tomorrow</span>';
      else if (new Date(w.at) < now) badge = '<span class="uc-walk-badge is-past">Past</span>';
      const contactBits = [w.phone, w.email].filter(Boolean).join(' · ');
      return (
        `<article class="uc-walk-row" data-walk-id="${esc(w.id)}">` +
          `<div class="uc-walk-row-main">` +
            `<strong class="uc-walk-buyer">${esc(w.buyerName || '—')}${badge}</strong>` +
            `<span class="uc-walk-when">${esc(formatWalkWhen(w.at))}</span>` +
            (contactBits ? `<span class="uc-walk-contact">${esc(contactBits)}</span>` : '') +
          `</div>` +
          `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-walk-action="remove" data-walk-id="${esc(w.id)}">Remove</button>` +
        `</article>`
      );
    }).join('');
    syncProfileTabSummaries(d);
    renderOfferWalkerPresets();
  }

  function openWalkDialog() {
    const dlg = $('uc-walk-dialog');
    if (!dlg) return;
    if ($('uc-walk-buyer')) $('uc-walk-buyer').value = '';
    if ($('uc-walk-phone')) $('uc-walk-phone').value = '';
    if ($('uc-walk-email')) $('uc-walk-email').value = '';
    const now = new Date();
    if ($('uc-walk-date')) $('uc-walk-date').value = localDayKey(now);
    if ($('uc-walk-time')) {
      const t = new Date(now.getTime() + 60 * 60 * 1000);
      $('uc-walk-time').value =
        `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    requestAnimationFrame(() => $('uc-walk-buyer')?.focus());
  }

  function closeWalkDialog() {
    const dlg = $('uc-walk-dialog');
    if (dlg?.open) dlg.close();
    else dlg?.removeAttribute('open');
  }

  async function saveWalkthrough() {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first');
      return;
    }
    const buyerName = ($('uc-walk-buyer')?.value || '').trim();
    const phone = ($('uc-walk-phone')?.value || '').trim();
    const email = ($('uc-walk-email')?.value || '').trim().toLowerCase();
    const date = ($('uc-walk-date')?.value || '').trim();
    const time = ($('uc-walk-time')?.value || '').trim();
    if (!buyerName) {
      showToast('Enter the buyer name');
      $('uc-walk-buyer')?.focus();
      return;
    }
    if (!date || !time) {
      showToast('Pick a date and time');
      return;
    }
    const at = new Date(`${date}T${time}:00`);
    if (Number.isNaN(at.getTime())) {
      showToast('Invalid date or time');
      return;
    }
    const btn = $('uc-walk-save');
    if (btn) btn.disabled = true;
    try {
      const next = walkthroughList(state.profile).concat([{
        buyerName,
        phone,
        email,
        at: at.toISOString(),
        createdBy: teamUserKey()
      }]);
      const data = await saveDealFields(dealId, { walkthroughs: next });
      if (data.deal) {
        mergeDealIntoState(data.deal);
        state.profile = { ...(state.profile || {}), ...data.deal };
      }
      renderWalkthroughs(state.profile);
      renderWalkthroughAlert(state.profile);
      closeWalkDialog();
      showToast('Walkthrough scheduled');
    } catch (err) {
      showToast(err.message || 'Could not save walkthrough');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function removeWalkthrough(id) {
    const dealId = state.activeDealId;
    if (!dealId || !id) return;
    const next = walkthroughList(state.profile).filter((w) => w.id !== id);
    try {
      const data = await saveDealFields(dealId, { walkthroughs: next });
      if (data.deal) {
        mergeDealIntoState(data.deal);
        state.profile = { ...(state.profile || {}), ...data.deal };
      }
      renderWalkthroughs(state.profile);
      renderWalkthroughAlert(state.profile);
      showToast('Walkthrough removed');
    } catch (err) {
      showToast(err.message || 'Could not remove walkthrough');
    }
  }

  function bindWalkthroughs() {
    $('uc-walk-add')?.addEventListener('click', () => openWalkDialog());
    $('uc-walk-save')?.addEventListener('click', () => {
      saveWalkthrough().catch((e) => showToast(e.message || 'Save failed'));
    });
    // type=button + explicit close — required fields block method=dialog cancel submits
    $('uc-walk-cancel')?.addEventListener('click', () => closeWalkDialog());
    $('uc-walk-close')?.addEventListener('click', () => closeWalkDialog());
    $('uc-walk-dialog')?.addEventListener('cancel', (ev) => {
      // Escape key
      ev.preventDefault();
      closeWalkDialog();
    });
    $('uc-walk-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-walk-action="remove"]');
      if (!btn) return;
      removeWalkthrough(btn.getAttribute('data-walk-id')).catch(() => {});
    });
    $('uc-walkthrough-alert')?.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-action="goto-walkthroughs"]')) {
        showProfileTab('walkthroughs');
      }
    });
    // Prevent accidental form submit (Enter in a field) from fighting required validation
    $('uc-walk-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
    });
  }

  function renderProfile(deal, contact) {
    state.profile = deal;
    state.contact = contact;
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (!drawer) return;
    const wasHidden = drawer.hidden;
    if (wasHidden) {
      profileReturnFocus = document.activeElement;
    }
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('uc-drawer-open');
    syncDrawerJvButton(deal);
    syncDrawerAocButton(deal);
    syncWaitingForSignaturesUi(deal);
    syncProfilePrimaryCta(deal);
    applyProfileAtmosphere(deal);

    $('uc-drawer-title').textContent = deal.address || 'Contract profile';
    const url = photoUrl(deal);
    const heroPhoto = url
      ? `<button type="button" class="uc-profile-hero-btn" data-action="zoom-photo" title="Expand photo" aria-label="Expand property photo">${thumbHtml(deal, 'uc-profile-hero')}</button>`
      : thumbHtml(deal, 'uc-profile-hero');

    state.investorBaseUrl = deal.investorBaseUrl || '';
    state.investorBaseEditing = false;

    $('uc-drawer-hero').innerHTML = heroPhoto +
      `<div class="uc-profile-hero-copy">
        <div class="uc-profile-hero-stage-row">
          <span class="uc-stage uc-stage--outline" data-stage="${esc(deal.stage)}">${esc(STAGE_LABELS[deal.stage] || deal.stage)}</span>
        </div>
        <h2>${esc(deal.address || '—')}</h2>
        <p>${esc([deal.city, deal.state, deal.zip].filter(Boolean).join(', '))}</p>
        <div class="uc-profile-hero-badges">
          ${dealTypeBadgeHtml(deal)}
          ${marketingBannerHtml(deal)}
          ${trustFundBadgeHtml(deal.buyerMatch || deal.trustFundMatch ? deal : (state.deals.find((x) => x.dealId === deal.dealId) || deal))}
          <div id="uc-hero-investorbase" class="uc-hero-ib" aria-label="Investorbase link"></div>
        </div>
      </div>`;

    // Buyer offers ready for Buyers tab (and any shared state)
    state.buyerOffers = Array.isArray(deal.buyerOffers) ? deal.buyerOffers.slice() : [];
    state.selectedBuyerOfferId = deal.selectedBuyerOfferId || null;
    state.buyerOfferEditIds = {};
    state.buyerOfferDrafts = [];
    renderOverviewSnapshot(deal, contact);
    renderWalkthroughAlert(deal);
    fillRehabForm(deal.rehabInfo || {});
    renderBuyerOffers();
    renderWalkthroughs(deal);
    renderInvestorBase();
    state.teamMessages = deal.teamMessages || [];
    renderTeamMessages();
    renderDocuments(deal.documents || []);
    renderMedia(deal.sellerMedia || []);
    renderPhotographerSection(deal);
    syncPhotoConvoMeta(deal);
    syncSellerModeHeader(deal);
    renderConditionScan(deal);
    loadPhotographerMessages(deal.dealId);
    closeDocViewer();
    $('uc-convo-thread').innerHTML = '<p class="uc-convo-empty">Loading conversation…</p>';
    $('uc-sms-input').value = '';
    if ($('uc-photo-sms-input')) $('uc-photo-sms-input').value = '';
    if ($('uc-team-input')) $('uc-team-input').value = '';
    clearPendingTeamGif();
    syncProfileSmsPulse();
    syncProfileTabSummaries(deal);
    showProfileTab(state.profileTab || 'overview');
    if (wasHidden) {
      requestAnimationFrame(() => {
        ($('uc-drawer-close') || $('uc-profile-primary') || getProfileFocusables()[0])?.focus?.();
      });
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
    const forceScroll = opts.forceScroll === true;
    const keepScroll = opts.keepScroll === true;
    const prevScroll = box.scrollTop;
    const stickToBottom = isThreadNearBottom(box);
    const msgs = state.teamMessages || [];
    if (!msgs.length) {
      box.innerHTML = `<div class="uc-convo-empty"><strong>No internal notes yet</strong><span>Keep access, buyers, and decisions here.</span></div>`;
      return;
    }
    const me = teamUserKey();
    let lastDay = '';
    const parts = [];
    for (const m of msgs) {
      const day = dayKeyFromWhen(m.createdAt);
      if (day && day !== lastDay) {
        parts.push(convoDaySep(dayLabelFromWhen(m.createdAt)));
        lastDay = day;
      }
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
      const gif = m.gif && m.gif.url ? m.gif : null;
      const bodyText = (m.body || '').trim();
      // Hide default "GIF" / title placeholder when the message is gif-only
      const showText = bodyText && !(gif && (bodyText === 'GIF' || bodyText === (gif.title || '').trim()));
      const gifHtml = gif
        ? `<figure class="uc-bubble-gif"><img src="${esc(gif.url)}" alt="${esc(gif.title || 'GIF')}" loading="lazy" decoding="async"></figure>`
        : '';
      const textHtml = showText ? `<div class="uc-bubble-body-text">${esc(bodyText)}</div>` : '';
      parts.push(`<div class="uc-bubble ${mine ? 'uc-bubble--out' : 'uc-bubble--in'}${gif && !showText ? ' uc-bubble-gif-only' : ''}" data-team-msg-id="${esc(m.id)}">
        <div class="uc-bubble-body">${textHtml}${gifHtml}</div>
        <div class="uc-bubble-meta">${esc(teamDisplayName(m.fromUser))}${when ? ' · ' + esc(when) : ''}</div>
        <div class="uc-react-row">
          ${appliedHtml ? `<div class="uc-react-applied" role="group" aria-label="Current reactions">${appliedHtml}</div>` : ''}
          <div class="uc-react-menu">
            <button type="button" class="uc-react-trigger" aria-haspopup="true" aria-expanded="false" title="Click to react">React</button>
            <div class="uc-react-picker" role="group" aria-label="Add reaction">${pickerHtml}</div>
          </div>
        </div>
      </div>`);
    }
    box.innerHTML = parts.join('');
    if (keepScroll) {
      if (stickToBottom) followBottomIfWasThere(box, true);
      else applyPreservedScroll(box, prevScroll);
    } else {
      // Open / send / channel switch — phone-style latest
      scrollThreadToLatest(box);
    }
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

  /** Detect a lone pasted GIF/media URL from Giphy/Tenor/Klipy (normalize share links → media). */
  function parseStandaloneGifUrl(text) {
    const t = String(text || '').trim();
    if (!t || /\s/.test(t)) return null;
    try {
      const u = new URL(t);
      if (u.protocol !== 'https:') return null;
      const h = u.hostname.toLowerCase();
      let provider = '';
      if (h === 'giphy.com' || h.endsWith('.giphy.com')) provider = 'giphy';
      else if (h === 'tenor.com' || h.endsWith('.tenor.com')) provider = 'tenor';
      else if (h === 'klipy.com' || h.endsWith('.klipy.com')) provider = 'klipy';
      else return null;

      let mediaUrl = t;
      // giphy.com/gifs/slug-ID → direct media
      if (provider === 'giphy' && /giphy\.com$/i.test(h)) {
        const m = u.pathname.match(/\/gifs\/(?:[\w-]+-)?([a-zA-Z0-9]+)/);
        if (m) mediaUrl = `https://media.giphy.com/media/${m[1]}/giphy.gif`;
      }
      // media.giphy.com/media/ID/... already fine
      if (provider === 'tenor' && !/\.(gif|mp4|webp)(\?|$)/i.test(u.pathname) && !h.startsWith('media')) {
        // share page — keep host allowlisted URL; may not animate but still stores
        mediaUrl = t;
      }
      return { url: mediaUrl, previewUrl: mediaUrl, title: '', provider };
    } catch (_) {
      return null;
    }
  }

  async function sendTeamMessage(opts = {}) {
    const dealId = state.activeDealId;
    const input = $('uc-team-input');
    const text = (input?.value || '').trim();
    // Prefer explicit gif, then staged draft, then a lone pasted GIF URL in the box.
    let gif = opts.gif || pendingTeamGif || null;
    let body = opts.body != null ? String(opts.body) : text;
    if (!gif && body) {
      const asGif = parseStandaloneGifUrl(body);
      if (asGif) {
        gif = asGif;
        body = '';
      }
    }
    if (!dealId || (!body.trim() && !gif)) return;
    const btn = $('uc-team-send');
    if (btn) btn.disabled = true;
    try {
      const payload = {};
      if (body.trim()) payload.body = body.trim();
      if (gif && gif.url) payload.gif = gif;
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/team-messages`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (input && !opts.keepInput) input.value = '';
      clearPendingTeamGif();
      closeGifPicker();
      if (Array.isArray(data.unreadTeam)) {
        state.unreadTeam = data.unreadTeam;
        renderTeamBanner();
      }
      if (data.deal) {
        state.teamMessages = data.deal.teamMessages || [];
        state.profile = { ...(state.profile || {}), ...data.deal };
        const idx = state.deals.findIndex((d) => d.dealId === dealId);
        if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...data.deal };
        renderTeamMessages({ forceScroll: true });
      }
      showToast(gif ? 'GIF sent' : 'Team message sent');
    } catch (err) {
      showToast(err.message || 'Could not send team message');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── GIF picker (Discord-style, Giphy rating=r) ──
  // Click a result → stage draft in compose; Send posts it. Remove to swap.
  let gifSearchTimer = null;
  let gifPickerOpen = false;
  let pendingTeamGif = null;

  function setGifStatus(msg, isError = false) {
    const el = $('uc-gif-status');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
  }

  function renderGifResults(list) {
    const box = $('uc-gif-results');
    if (!box) return;
    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      box.innerHTML = '';
      box._gifItems = [];
      return;
    }
    // Use <div> tiles (not <button>) so global button / phuglee styles can't crush layout.
    box.innerHTML = items.map((g, i) => {
      const src = esc(g.previewUrl || g.url);
      const title = esc(g.title || 'GIF');
      return `<div class="uc-gif-tile" role="option" tabindex="0" data-gif-idx="${i}" title="${title}" aria-label="Add GIF to message: ${title}">
        <img class="uc-gif-tile-img" src="${src}" alt="" loading="lazy" decoding="async" draggable="false">
      </div>`;
    }).join('');
    box._gifItems = items;
  }

  async function loadGifs(query) {
    const q = String(query || '').trim();
    setGifStatus(q ? `Searching “${q}”…` : 'Loading trending…');
    try {
      // Load many results; CSS shows ~6 large tiles at a time (2×3) with scroll for more.
      const path = q
        ? `/api/leads/admin/gifs/search?q=${encodeURIComponent(q)}&limit=30`
        : '/api/leads/admin/gifs/trending?limit=30';
      const data = await api(path);
      const list = data.results || [];
      renderGifResults(list);
      if (!list.length) {
        setGifStatus(q ? 'No GIFs for that search.' : 'No trending GIFs right now.');
      } else {
        setGifStatus(q ? `${list.length} results · scroll for more` : `Trending · ${list.length} · scroll for more`);
      }
    } catch (err) {
      renderGifResults([]);
      const msg = err?.message || 'GIF search failed';
      if (String(err?.code || '').includes('GIPHY') || /GIPHY_API_KEY|not configured/i.test(msg)) {
        setGifStatus('Add GIPHY_API_KEY to server .env (free at developers.giphy.com). You can still paste a GIF URL in the box.', true);
      } else {
        setGifStatus(msg, true);
      }
    }
  }

  function openGifPicker() {
    const panel = $('uc-gif-picker');
    const toggle = $('uc-gif-toggle');
    if (!panel) return;
    panel.hidden = false;
    gifPickerOpen = true;
    toggle?.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
    const search = $('uc-gif-search');
    if (search) {
      search.value = '';
      requestAnimationFrame(() => search.focus());
    }
    loadGifs('');
  }

  function closeGifPicker() {
    const panel = $('uc-gif-picker');
    const toggle = $('uc-gif-toggle');
    if (panel) panel.hidden = true;
    gifPickerOpen = false;
    toggle?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    if (gifSearchTimer) {
      clearTimeout(gifSearchTimer);
      gifSearchTimer = null;
    }
  }

  function toggleGifPicker() {
    if (gifPickerOpen) closeGifPicker();
    else openGifPicker();
  }

  function renderPendingTeamGif() {
    const wrap = $('uc-gif-draft');
    const img = $('uc-gif-draft-img');
    const titleEl = $('uc-gif-draft-title');
    if (!wrap || !img) return;
    if (!pendingTeamGif || !pendingTeamGif.url) {
      wrap.hidden = true;
      img.removeAttribute('src');
      if (titleEl) titleEl.textContent = '';
      return;
    }
    wrap.hidden = false;
    img.src = pendingTeamGif.previewUrl || pendingTeamGif.url;
    img.alt = pendingTeamGif.title ? `Selected GIF: ${pendingTeamGif.title}` : 'Selected GIF preview';
    if (titleEl) titleEl.textContent = pendingTeamGif.title || 'GIF';
  }

  function clearPendingTeamGif() {
    pendingTeamGif = null;
    renderPendingTeamGif();
  }

  /** Stage a GIF in the compose draft — does not send until the user hits Send. */
  function stageGifInCompose(gif) {
    if (!gif || !gif.url) return;
    pendingTeamGif = {
      url: String(gif.url),
      previewUrl: String(gif.previewUrl || gif.url),
      title: String(gif.title || '').slice(0, 160),
      provider: String(gif.provider || 'giphy').slice(0, 32),
      id: String(gif.id || '').slice(0, 80)
    };
    renderPendingTeamGif();
    closeGifPicker();
    // Keep optional caption text; focus compose so Enter/Send is obvious.
    requestAnimationFrame(() => $('uc-team-input')?.focus?.());
    showToast('GIF added — hit Send when ready');
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

  function buyerOfferDraftId() {
    return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function syncBuyerOffersHint() {
    const hint = $('uc-buyer-offers-hint');
    if (!hint) return;
    const n = (state.buyerOffers || []).length;
    hint.textContent = n
      ? `Disposition market · ${n} offer${n === 1 ? '' : 's'}`
      : 'Disposition market · no offers yet';
  }

  function parseOfferAmountInput(raw) {
    const n = Number(String(raw || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function sortedBuyerOffers() {
    return (Array.isArray(state.buyerOffers) ? state.buyerOffers.slice() : []).sort((a, b) => {
      const na = Number(a?.offerAmount);
      const nb = Number(b?.offerAmount);
      const av = Number.isFinite(na) ? na : -1;
      const bv = Number.isFinite(nb) ? nb : -1;
      return bv - av;
    });
  }

  function offerAmountNum(offer) {
    const n = Number(offer?.offerAmount);
    return Number.isFinite(n) ? n : null;
  }

  function formatSpread(amount, purchase) {
    if (amount == null || purchase == null || !Number.isFinite(purchase)) return '—';
    const delta = amount - purchase;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${money(delta)} vs purchase`;
  }

  function renderBuyersEconomics(offers) {
    const el = $('uc-buyers-econ');
    if (!el) return;
    const deal = state.profile || {};
    const purchase = Number(deal.purchasePrice);
    const leader = offers[0] || null;
    const best = leader ? offerAmountNum(leader) : null;
    const assignFee = (best != null && Number.isFinite(purchase)) ? (best - purchase) : null;
    const hasAny = Number.isFinite(purchase) || best != null;
    if (!hasAny) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const feeCls = assignFee == null ? '' : (assignFee >= 0 ? 'is-up' : 'is-down');
    const buyerName = (leader?.buyerName || '').trim();
    const buyerLine = buyerName
      ? `<em class="uc-buyers-econ-buyer">${esc(buyerName)}</em>`
      : '';
    el.innerHTML =
      `<div class="uc-buyers-econ-cell">` +
        `<span>Purchase price</span>` +
        `<strong class="uc-money-display">${esc(Number.isFinite(purchase) ? money(purchase) : '—')}</strong>` +
      `</div>` +
      `<div class="uc-buyers-econ-cell uc-buyers-econ-cell--best">` +
        `<span>Best offer</span>` +
        `<strong class="uc-money-display">${esc(best != null ? money(best) : '—')}</strong>` +
        buyerLine +
      `</div>` +
      `<div class="uc-buyers-econ-cell ${feeCls}">` +
        `<span>Assignment fee</span>` +
        `<strong class="uc-money-display">${esc(assignFee != null ? money(assignFee) : '—')}</strong>` +
      `</div>`;
  }

  function renderBuyersLeader(offers) {
    const el = $('uc-buyers-leader');
    if (!el) return;
    const leader = offers[0];
    const amount = leader ? offerAmountNum(leader) : null;
    if (!leader || amount == null) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const deal = state.profile || {};
    const purchase = Number(deal.purchasePrice);
    const second = offers[1] ? offerAmountNum(offers[1]) : null;
    const vsNext = second != null
      ? ` · ${money(amount - second)} over #2`
      : (offers.length === 1 ? ' · sole offer' : '');
    const fee = Number.isFinite(purchase) ? amount - purchase : null;
    const waiting = isWaitingForSignatures(deal);
    const isSelected = state.selectedBuyerOfferId && state.selectedBuyerOfferId === leader.id;
    el.hidden = false;
    el.classList.toggle('is-selected', Boolean(isSelected));
    el.innerHTML =
      `<div class="uc-buyers-leader-copy">` +
        `<span class="uc-buyers-leader-kicker">Leading offer</span>` +
        `<strong class="uc-buyers-leader-amount uc-money-display">${esc(money(amount))}</strong>` +
        `<span class="uc-buyers-leader-name">${esc(leader.buyerName || 'Unnamed buyer')}` +
          (fee != null ? ` · fee ${esc(money(fee))}` : '') +
          `${esc(vsNext)}</span>` +
      `</div>` +
      `<div class="uc-buyers-leader-actions">` +
        (waiting
          ? ''
          : `<button type="button" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm" data-buyer-offer-action="send-aoc" data-offer-id="${esc(leader.id)}">Send AOC</button>`) +
        `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="edit" data-offer-id="${esc(leader.id)}">Edit</button>` +
      `</div>`;
  }

  function buyerContactLine(offer) {
    const bits = [];
    if (offer?.phone) bits.push(String(offer.phone));
    if (offer?.email) bits.push(String(offer.email));
    return bits.join(' · ');
  }

  /** Unique walkers on this deal (for Offers presets). Most recent walk first. */
  function uniqueWalkersFromDeal(deal) {
    const list = walkthroughList(deal || state.profile);
    const byKey = new Map();
    // Newest last so older get overwritten; then reverse for display
    for (const w of list) {
      const name = String(w.buyerName || '').trim();
      if (!name) continue;
      const key = `${name.toLowerCase()}|${String(w.phone || '').replace(/\D/g, '')}|${String(w.email || '').toLowerCase()}`;
      byKey.set(key, {
        walkId: w.id,
        buyerName: name,
        phone: w.phone || '',
        email: w.email || '',
        at: w.at
      });
    }
    return Array.from(byKey.values()).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }

  function renderOfferWalkerPresets() {
    const el = $('uc-offer-walker-presets');
    if (!el) return;
    const walkers = uniqueWalkersFromDeal(state.profile);
    if (!walkers.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML =
      `<div class="uc-offer-walker-presets-head">` +
        `<span class="uc-offer-walker-presets-label">Walked this property</span>` +
        `<span class="uc-offer-walker-presets-hint">Tap to start an offer with their contact</span>` +
      `</div>` +
      `<div class="uc-offer-walker-chips">` +
        walkers.map((w) => {
          const sub = [w.phone, w.email].filter(Boolean).join(' · ');
          return (
            `<button type="button" class="uc-offer-walker-chip" data-walker-pick="${esc(w.walkId)}"` +
              ` title="${esc(sub || 'Add offer from walker')}">` +
              `<strong>${esc(w.buyerName)}</strong>` +
              (sub ? `<span>${esc(sub)}</span>` : '') +
            `</button>`
          );
        }).join('') +
      `</div>`;
  }

  function addOfferFromWalker(walkId) {
    const walkers = uniqueWalkersFromDeal(state.profile);
    const w = walkers.find((x) => String(x.walkId) === String(walkId))
      || walkthroughList(state.profile).find((x) => String(x.id) === String(walkId));
    if (!w) {
      showToast('Walker not found');
      return;
    }
    state.buyerOfferDrafts = (state.buyerOfferDrafts || []).concat([{
      id: buyerOfferDraftId(),
      buyerName: w.buyerName || '',
      offerAmount: '',
      phone: w.phone || '',
      email: w.email || '',
      fromWalkId: w.walkId || w.id || ''
    }]);
    renderBuyerOffers();
    const list = $('uc-buyer-offers-list');
    const last = list?.querySelector('.uc-buyer-offer-row.is-draft:last-child .uc-buyer-offer-amount');
    last?.focus();
    showToast(`Offer started for ${w.buyerName || 'buyer'}`);
  }

  function renderBuyerOffers() {
    const box = $('uc-buyer-offers-list');
    if (!box) return;
    const offers = sortedBuyerOffers();
    const drafts = Array.isArray(state.buyerOfferDrafts) ? state.buyerOfferDrafts : [];
    const purchase = Number(state.profile?.purchasePrice);
    const selectedId = state.selectedBuyerOfferId || null;
    const parts = [];

    renderOfferWalkerPresets();
    renderBuyersEconomics(offers);
    renderBuyersLeader(offers);

    if (!offers.length && !drafts.length) {
      const walkers = uniqueWalkersFromDeal(state.profile);
      parts.push(
        `<div class="uc-buyer-offers-empty uc-empty-workflow">` +
          `<strong class="uc-empty-workflow-title">No offers yet</strong>` +
          `<p class="uc-empty-workflow-body">` +
            (walkers.length
              ? 'Pick someone who already walked (above), or add an offer with bid, phone, and email.'
              : 'Add who offered, bid, phone, and email. Highest bid leads. Select a row (gold) to mark who you’re moving forward with.') +
          `</p>` +
        `</div>`
      );
      box.innerHTML = parts.join('');
      box.classList.add('is-empty');
      syncBuyerOffersHint();
      syncProfileTabSummaries(state.profile);
      return;
    }
    box.classList.remove('is-empty');

    if (offers.length) {
      parts.push(
        `<div class="uc-buyers-board-head" aria-hidden="true">` +
          `<span>#</span><span>Buyer</span><span>Offer</span><span>Contact</span><span></span>` +
        `</div>`
      );
    }

    offers.forEach((offer, index) => {
      const id = offer.id;
      const rank = index + 1;
      const editing = Boolean(state.buyerOfferEditIds[id]);
      const amount = offerAmountNum(offer);
      const isSelected = selectedId && selectedId === id;
      if (editing) {
        parts.push(
          `<div class="uc-buyer-offer-row is-editing" data-offer-id="${esc(id)}">` +
            `<span class="uc-buyer-rank">${rank}</span>` +
            `<label class="vault-field">` +
              `<span class="vault-field-label">Buyer name</span>` +
              `<input type="text" class="phuglee-input uc-buyer-offer-name" value="${esc(offer.buyerName || '')}" autocomplete="off">` +
            `</label>` +
            `<label class="vault-field">` +
              `<span class="vault-field-label">Offer amount</span>` +
              `<input type="text" inputmode="decimal" class="phuglee-input uc-buyer-offer-amount" value="${esc(offer.offerAmount ?? '')}" placeholder="88000">` +
            `</label>` +
            `<label class="vault-field">` +
              `<span class="vault-field-label">Phone</span>` +
              `<input type="tel" class="phuglee-input uc-buyer-offer-phone" value="${esc(offer.phone || '')}" placeholder="555-…" autocomplete="tel">` +
            `</label>` +
            `<label class="vault-field">` +
              `<span class="vault-field-label">Email</span>` +
              `<input type="email" class="phuglee-input uc-buyer-offer-email" value="${esc(offer.email || '')}" placeholder="buyer@…" autocomplete="email">` +
            `</label>` +
            `<div class="uc-buyer-offer-actions">` +
              `<button type="button" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm" data-buyer-offer-action="save">Save</button>` +
              `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="cancel">Cancel</button>` +
              `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="remove">Remove</button>` +
            `</div>` +
          `</div>`
        );
      } else {
        const isLead = rank === 1;
        const contact = buyerContactLine(offer);
        parts.push(
          `<div class="uc-buyer-offer-row is-locked${isLead ? ' is-leader' : ''}${isSelected ? ' is-selected' : ''}" data-offer-id="${esc(id)}" data-buyer-offer-action="select" role="button" tabindex="0" aria-pressed="${isSelected ? 'true' : 'false'}" title="Select end buyer (gold highlight only)">` +
            `<span class="uc-buyer-rank" title="Rank">${rank}</span>` +
            `<div class="uc-buyer-offer-main">` +
              `<p class="uc-buyer-offer-locked-name">${esc(offer.buyerName || '—')}` +
                `${isLead ? ' <span class="uc-buyer-lead-tag">Best</span>' : ''}` +
                `${isSelected ? ' <span class="uc-buyer-selected-tag">Selected</span>' : ''}` +
              `</p>` +
              (Number.isFinite(purchase) && amount != null
                ? `<p class="uc-buyer-offer-spread">${esc(formatSpread(amount, purchase))}</p>`
                : '') +
            `</div>` +
            `<p class="uc-buyer-offer-locked-amount uc-money-display">${esc(money(offer.offerAmount))}</p>` +
            `<p class="uc-buyer-offer-contact">${esc(contact || '—')}</p>` +
            `<div class="uc-buyer-offer-actions">` +
              `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="edit">Edit</button>` +
              `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="remove">Remove</button>` +
            `</div>` +
          `</div>`
        );
      }
    });

    for (const draft of drafts) {
      parts.push(
        `<div class="uc-buyer-offer-row is-draft" data-offer-id="${esc(draft.id)}" data-draft="1">` +
          `<span class="uc-buyer-rank">+</span>` +
          `<label class="vault-field">` +
            `<span class="vault-field-label">Buyer name</span>` +
            `<input type="text" class="phuglee-input uc-buyer-offer-name" value="${esc(draft.buyerName || '')}" placeholder="Buyer name" autocomplete="off">` +
          `</label>` +
          `<label class="vault-field">` +
            `<span class="vault-field-label">Offer amount</span>` +
            `<input type="text" inputmode="decimal" class="phuglee-input uc-buyer-offer-amount" value="${esc(draft.offerAmount ?? '')}" placeholder="88000">` +
          `</label>` +
          `<label class="vault-field">` +
            `<span class="vault-field-label">Phone</span>` +
            `<input type="tel" class="phuglee-input uc-buyer-offer-phone" value="${esc(draft.phone || '')}" placeholder="555-…" autocomplete="tel">` +
          `</label>` +
          `<label class="vault-field">` +
            `<span class="vault-field-label">Email</span>` +
            `<input type="email" class="phuglee-input uc-buyer-offer-email" value="${esc(draft.email || '')}" placeholder="buyer@…" autocomplete="email">` +
          `</label>` +
          `<div class="uc-buyer-offer-actions">` +
            `<button type="button" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm" data-buyer-offer-action="save">Save</button>` +
            `<button type="button" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" data-buyer-offer-action="remove">Remove</button>` +
          `</div>` +
        `</div>`
      );
    }

    box.innerHTML = parts.join('');
    syncBuyerOffersHint();
    syncProfileTabSummaries(state.profile);
  }

  function readBuyerOfferRow(row) {
    const name = (row.querySelector('.uc-buyer-offer-name')?.value || '').trim();
    const amount = parseOfferAmountInput(row.querySelector('.uc-buyer-offer-amount')?.value);
    const phone = (row.querySelector('.uc-buyer-offer-phone')?.value || '').trim();
    const email = (row.querySelector('.uc-buyer-offer-email')?.value || '').trim().toLowerCase();
    return { buyerName: name, offerAmount: amount, phone, email };
  }

  /**
   * Push saved offer into Buyers catalog under "Need to Verify Buy Box".
   * Option B: does NOT create GHL contact on select — only catalog row on save.
   */
  async function ensureCatalogBuyerFromOffer(offer) {
    if (!offer?.buyerName) return null;
    try {
      const data = await api('/api/buyers', {
        method: 'POST',
        body: JSON.stringify({
          name: offer.buyerName,
          phone: offer.phone || '',
          email: offer.email || '',
          contactPhone: offer.phone || '',
          contactEmail: offer.email || '',
          contactName: offer.buyerName,
          fromDealOffer: true,
          needVerifyBuyBox: true,
          verificationStatus: 'need_verify_buy_box',
          oneLiner: `From deal offer · ${money(offer.offerAmount) || 'offer'}`,
          notes: `UC deal offer on ${state.profile?.address || state.activeDealId || 'deal'}`
        })
      });
      return data.buyer || null;
    } catch (_) {
      return null;
    }
  }

  async function persistBuyerOffers(nextList, toastMsg, opts = {}) {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first, then save');
      return null;
    }
    let selectedId = state.selectedBuyerOfferId;
    if (selectedId && !nextList.some((o) => o.id === selectedId)) {
      selectedId = null;
    }
    const patch = { buyerOffers: nextList };
    if (Object.prototype.hasOwnProperty.call(opts, 'selectedBuyerOfferId') || selectedId !== state.selectedBuyerOfferId) {
      patch.selectedBuyerOfferId = selectedId;
    }
    const data = await saveDealFields(dealId, patch);
    const saved = Array.isArray(data.deal?.buyerOffers) ? data.deal.buyerOffers : nextList;
    state.buyerOffers = saved.slice();
    if (data.deal && Object.prototype.hasOwnProperty.call(data.deal, 'selectedBuyerOfferId')) {
      state.selectedBuyerOfferId = data.deal.selectedBuyerOfferId || null;
    } else {
      state.selectedBuyerOfferId = selectedId;
    }
    if (data.deal) {
      mergeDealIntoState(data.deal);
      state.profile = { ...(state.profile || {}), ...data.deal };
    }
    state.buyerOfferEditIds = {};
    showToast(toastMsg || 'Buyer offer saved');
    renderBuyerOffers();
    // Keep Overview end-buyer card in sync with Buyers tab
    if (state.profile) renderOverviewSnapshot(state.profile, state.contact);
    return data;
  }

  async function selectBuyerOffer(offerId) {
    const id = String(offerId || '').trim();
    if (!id) return;
    const exists = (state.buyerOffers || []).some((o) => o.id === id);
    if (!exists) {
      showToast('Offer not found');
      return;
    }
    // Gold highlight only — no GHL contact, no Comms channel, no SMS side effects
    const next = state.selectedBuyerOfferId === id ? null : id;
    state.selectedBuyerOfferId = next;
    try {
      const dealId = state.activeDealId;
      if (!dealId) {
        renderBuyerOffers();
        return;
      }
      const data = await saveDealFields(dealId, { selectedBuyerOfferId: next });
      if (data.deal) {
        mergeDealIntoState(data.deal);
        state.profile = { ...(state.profile || {}), ...data.deal };
        state.selectedBuyerOfferId = data.deal.selectedBuyerOfferId || null;
      }
      renderBuyerOffers();
      showToast(next ? 'Buyer selected' : 'Selection cleared');
    } catch (err) {
      showToast(err.message || 'Could not update selection');
      renderBuyerOffers();
    }
  }

  function addBuyerOfferDraft() {
    state.buyerOfferDrafts = (state.buyerOfferDrafts || []).concat([{
      id: buyerOfferDraftId(),
      buyerName: '',
      offerAmount: '',
      phone: '',
      email: ''
    }]);
    renderBuyerOffers();
    const list = $('uc-buyer-offers-list');
    const last = list?.querySelector('.uc-buyer-offer-row.is-draft:last-child .uc-buyer-offer-name');
    last?.focus();
  }

  async function onBuyerOfferAction(ev) {
    const btn = ev.target.closest('[data-buyer-offer-action]');
    const rowClick = !btn && ev.target.closest('.uc-buyer-offer-row.is-locked[data-buyer-offer-action="select"]');
    const actionEl = btn || rowClick;
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-buyer-offer-action');
    const row = actionEl.closest('.uc-buyer-offer-row');
    const id = row?.getAttribute('data-offer-id')
      || actionEl.getAttribute('data-offer-id')
      || '';

    if (action === 'select') {
      // Don't select when clicking Edit/Remove
      if (ev.target && ev.target.closest && ev.target.closest('.uc-buyer-offer-actions button, .uc-buyer-offer-actions')) {
        // Allow only if the click landed on the actions container itself with no button
        if (ev.target.closest('button[data-buyer-offer-action]')) return;
      }
      if (ev.target && ev.target.closest && ev.target.closest('button[data-buyer-offer-action="edit"], button[data-buyer-offer-action="remove"]')) {
        return;
      }
      await selectBuyerOffer(id);
      return;
    }

    if (action === 'send-aoc') {
      const deal = state.profile
        || (state.activeDealId && state.deals.find((d) => d.dealId === state.activeDealId));
      if (!deal) {
        showToast('Open a property first');
        return;
      }
      openAocAction(deal);
      return;
    }

    if (!row && action === 'edit' && id) {
      state.buyerOfferEditIds = { ...(state.buyerOfferEditIds || {}), [id]: true };
      renderBuyerOffers();
      requestAnimationFrame(() => {
        document.querySelector(`.uc-buyer-offer-row[data-offer-id="${CSS.escape(id)}"] .uc-buyer-offer-name`)?.focus();
      });
      return;
    }

    if (!row) return;
    const isDraft = row.getAttribute('data-draft') === '1';

    if (action === 'edit') {
      state.buyerOfferEditIds = { ...(state.buyerOfferEditIds || {}), [id]: true };
      renderBuyerOffers();
      return;
    }

    if (action === 'cancel') {
      delete state.buyerOfferEditIds[id];
      renderBuyerOffers();
      return;
    }

    if (action === 'remove') {
      if (isDraft) {
        state.buyerOfferDrafts = (state.buyerOfferDrafts || []).filter((d) => d.id !== id);
        renderBuyerOffers();
        return;
      }
      const next = (state.buyerOffers || []).filter((o) => o.id !== id);
      if (state.selectedBuyerOfferId === id) state.selectedBuyerOfferId = null;
      try {
        await persistBuyerOffers(next, 'Buyer offer removed', { selectedBuyerOfferId: state.selectedBuyerOfferId });
      } catch (err) {
        showToast(err.message || 'Could not remove buyer offer');
      }
      return;
    }

    if (action === 'save') {
      const parsed = readBuyerOfferRow(row);
      if (!parsed.buyerName) {
        showToast('Enter the buyer name');
        row.querySelector('.uc-buyer-offer-name')?.focus();
        return;
      }
      if (parsed.offerAmount == null) {
        showToast('Enter the offer amount');
        row.querySelector('.uc-buyer-offer-amount')?.focus();
        return;
      }
      if (btn) btn.disabled = true;
      try {
        let next;
        let savedOffer = null;
        if (isDraft) {
          savedOffer = {
            buyerName: parsed.buyerName,
            offerAmount: parsed.offerAmount,
            phone: parsed.phone,
            email: parsed.email,
            updatedBy: teamUserKey()
          };
          next = (state.buyerOffers || []).concat([savedOffer]);
          state.buyerOfferDrafts = (state.buyerOfferDrafts || []).filter((d) => d.id !== id);
        } else {
          next = (state.buyerOffers || []).map((o) => {
            if (o.id !== id) return o;
            savedOffer = {
              ...o,
              buyerName: parsed.buyerName,
              offerAmount: parsed.offerAmount,
              phone: parsed.phone,
              email: parsed.email,
              updatedBy: teamUserKey(),
              updatedAt: new Date().toISOString()
            };
            return savedOffer;
          });
        }
        // Catalog: land in Need to Verify Buy Box (idempotent-ish by name/email)
        const catalogBuyer = await ensureCatalogBuyerFromOffer(savedOffer || parsed);
        if (catalogBuyer?.id && savedOffer) {
          next = next.map((o) => {
            const match = o === savedOffer
              || (o.buyerName === savedOffer.buyerName && o.offerAmount === savedOffer.offerAmount);
            return match ? { ...o, catalogBuyerId: catalogBuyer.id } : o;
          });
        }
        await persistBuyerOffers(next, catalogBuyer
          ? 'Offer saved · buyer queued to verify buy box'
          : 'Buyer offer saved');
      } catch (err) {
        showToast(err.message || 'Could not save buyer offer');
      } finally {
        if (btn) btn.disabled = false;
      }
    }
  }

  function investorBaseHref(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function renderInvestorBase() {
    const box = $('uc-hero-investorbase');
    if (!box) return;
    const url = state.investorBaseUrl || state.profile?.investorBaseUrl || '';
    const href = investorBaseHref(url);
    // Same row as CASH / Marketing chips — compact inline control
    if (url && !state.investorBaseEditing) {
      box.innerHTML =
        `<span class="uc-hero-ib-label">Investorbase:</span>` +
        `<a class="uc-hero-ib-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">${esc(url)}</a>` +
        `<button type="button" class="uc-hero-ib-btn" data-investor-base-action="edit" title="Edit link">Edit</button>`;
    } else {
      box.innerHTML =
        `<span class="uc-hero-ib-label">Investorbase:</span>` +
        `<input type="url" id="uc-investor-base-input" class="uc-hero-ib-input" value="${esc(url)}" placeholder="https://…" autocomplete="off">` +
        `<button type="button" class="uc-hero-ib-btn uc-hero-ib-btn--save" data-investor-base-action="save">Save</button>` +
        (url
          ? `<button type="button" class="uc-hero-ib-btn" data-investor-base-action="cancel">Cancel</button>`
          : '');
    }
  }

  async function persistInvestorBaseUrl(nextUrl, toastMsg) {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first, then save');
      return null;
    }
    const data = await saveDealFields(dealId, { investorBaseUrl: nextUrl });
    const saved = data.deal?.investorBaseUrl != null ? data.deal.investorBaseUrl : nextUrl;
    state.investorBaseUrl = saved || '';
    state.investorBaseEditing = false;
    if (data.deal) {
      mergeDealIntoState(data.deal);
      state.profile = { ...(state.profile || {}), ...data.deal };
    }
    showToast(toastMsg || 'Investorbase link saved');
    renderInvestorBase();
    syncMarketingBanner(state.profile);
    return data;
  }

  async function onInvestorBaseAction(ev) {
    const btn = ev.target.closest('[data-investor-base-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-investor-base-action');

    if (action === 'edit') {
      state.investorBaseEditing = true;
      renderInvestorBase();
      $('uc-investor-base-input')?.focus();
      return;
    }

    if (action === 'cancel') {
      state.investorBaseEditing = false;
      renderInvestorBase();
      return;
    }

    if (action === 'clear') {
      btn.disabled = true;
      try {
        await persistInvestorBaseUrl('', 'Investorbase link cleared');
      } catch (err) {
        showToast(err.message || 'Could not clear link');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'save') {
      const input = $('uc-investor-base-input');
      const next = (input?.value || '').trim();
      if (!next) {
        showToast('Paste the Investorbase link first');
        input?.focus();
        return;
      }
      btn.disabled = true;
      try {
        await persistInvestorBaseUrl(next, 'Investorbase link saved');
      } catch (err) {
        showToast(err.message || 'Could not save link');
      } finally {
        btn.disabled = false;
      }
    }
  }

  function openRehabView(deal) {
    const dialog = $('uc-rehab-view-dialog');
    if (!dialog || !deal) return;
    const rehab = deal.rehabInfo || {};
    const rows = [
      ['Roof age + condition', rehab.roof],
      ['AC age + condition', rehab.ac],
      ['Foundation condition', rehab.foundation],
      ['Plumbing condition', rehab.plumbing],
      ['Electrical condition', rehab.electrical],
      ['Additional notes', rehab.other]
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

  /** Universal display order: Purchase Agreement → JV → AOC → Amendments */
  const PACKAGE_SLOTS = [
    {
      key: 'psa',
      title: 'Purchase Agreement',
      sendKind: 'psa',
      docKinds: ['purchase_contract'],
      pendingKinds: ['purchase_contract', 'psa', 'cash', 'subto', 'subject_to']
    },
    {
      key: 'jv',
      title: 'JV Agreement',
      sendKind: 'jv',
      docKinds: ['jv'],
      pendingKinds: ['jv']
    },
    {
      key: 'aoc',
      title: 'AOC',
      sendKind: 'aoc',
      docKinds: ['aoc'],
      pendingKinds: ['aoc']
    },
    {
      key: 'amendment',
      title: 'Amendment',
      sendKind: 'amendment',
      docKinds: ['amendment'],
      pendingKinds: ['amendment']
    }
  ];

  /** Formal UI labels for Documents desk (same as PACKAGE_SLOTS titles). */
  const DOCS_UI_LABELS = {
    psa: 'Purchase Agreement',
    jv: 'JV Agreement',
    aoc: 'AOC',
    amendment: 'Amendment'
  };

  function pendingKindKey(p) {
    return String(p?.kind || p?.templateKey || '').toLowerCase().replace(/[\s-]+/g, '_');
  }

  function matchPendingForSlot(pending, slot) {
    return pending.filter((p) => {
      const k = pendingKindKey(p);
      return slot.pendingKinds.some((pk) => k === pk || k.includes(pk) || pk.includes(k));
    });
  }

  function matchDocsForSlot(docs, slot) {
    return docs.filter((d) => slot.docKinds.includes(String(d?.kind || '')));
  }

  function buildPackageModel(deal) {
    const docs = Array.isArray(deal?.documents) ? deal.documents : [];
    const pending = Array.isArray(deal?.signNowPending) ? deal.signNowPending : [];
    return PACKAGE_SLOTS.map((slot) => {
      const matchedDocs = matchDocsForSlot(docs, slot);
      const matchedPending = matchPendingForSlot(pending, slot);
      let status = 'missing';
      let meta = 'Not sent';
      let primaryDoc = matchedDocs[0] || null;
      if (matchedDocs.length) {
        status = 'complete';
        const src = primaryDoc?.source === 'signnow' ? 'SignNow' : (primaryDoc?.source === 'ghl' ? 'GHL' : 'Uploaded');
        meta = `${matchedDocs.length} file${matchedDocs.length === 1 ? '' : 's'} · ${src}`;
      } else if (matchedPending.length) {
        status = 'pending';
        const p = matchedPending[0];
        const invitees = Array.isArray(p.invitees) ? p.invitees : [];
        const who = invitees.map((i) => i.email).filter(Boolean).slice(0, 2).join(', ');
        meta = who
          ? `Awaiting signatures · ${who}`
          : (p.documentName ? `Awaiting · ${p.documentName}` : 'Awaiting signatures');
        if (p.openedByEmail) meta += ` · opened by ${p.openedByEmail}`;
      }
      return {
        ...slot,
        status,
        meta,
        primaryDoc,
        matchedDocs,
        matchedPending
      };
    });
  }

  function docsUiLabel(pkg) {
    return DOCS_UI_LABELS[pkg?.key] || pkg?.title || 'Document';
  }

  /**
   * Real document preview (PDF/image embed) so the card looks like the actual file.
   * Full-size modal still opens on click. Placeholder paper only when no file URL.
   */
  function docsThumbHtml(pkg, bucket, label) {
    const doc = pkg.primaryDoc;
    const viewUrl = doc?.viewUrl || '';
    const mime = String(doc?.mimeType || doc?.contentType || '').toLowerCase();
    const name = String(doc?.name || doc?.label || viewUrl || '');
    const isImage = mime.startsWith('image/')
      || /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(name);
    const short =
      pkg.key === 'psa' ? 'PSA'
        : pkg.key === 'aoc' ? 'AOC'
          : pkg.key === 'jv' ? 'JV'
            : pkg.key === 'amendment' ? 'AMD'
              : 'DOC';

    if (viewUrl) {
      let viewport;
      if (isImage) {
        viewport = (
          `<span class="uc-docs-thumb-viewport is-image" aria-hidden="true">` +
            `<img class="uc-docs-thumb-real" src="${esc(viewUrl)}" alt="" loading="lazy" decoding="async">` +
          `</span>`
        );
      } else {
        // Live PDF page — no toolbar chrome; scaled to fit the card
        const pdfSrc = viewUrl.includes('#')
          ? viewUrl
          : `${viewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width`;
        viewport = (
          `<span class="uc-docs-thumb-viewport is-pdf" aria-hidden="true">` +
            `<iframe class="uc-docs-thumb-real" src="${esc(pdfSrc)}" title="${esc(label)}" tabindex="-1" loading="lazy"></iframe>` +
          `</span>`
        );
      }
      return (
        `<button type="button" class="uc-docs-thumb is-${esc(bucket)} is-preview is-live"` +
          ` data-pkg-key="${esc(pkg.key)}"` +
          ` data-docs-bucket="${esc(bucket)}"` +
          ` data-doc-id="${esc(doc?.id || '')}"` +
          ` aria-label="Open ${esc(label)} preview">` +
          viewport +
          `<span class="uc-docs-thumb-caption">Open full preview</span>` +
        `</button>`
      );
    }

    const paper = (
      `<span class="uc-docs-thumb-paper" aria-hidden="true">` +
        `<span class="uc-docs-thumb-badge">${esc(short)}</span>` +
        `<span class="uc-docs-thumb-title">${esc(label)}</span>` +
        `<span class="uc-docs-thumb-lines"></span>` +
      `</span>`
    );
    return (
      `<div class="uc-docs-thumb is-${esc(bucket)} is-placeholder">` +
        paper +
        `<span class="uc-docs-thumb-caption">${bucket === 'pending' ? 'Awaiting signatures' : 'No file yet'}</span>` +
      `</div>`
    );
  }

  function docsRowHtml(pkg, bucket) {
    const label = docsUiLabel(pkg);
    // Label chip is display-only; preview thumb below opens the modal
    return (
      `<li class="uc-docs-bucket-item">` +
        `<div class="uc-docs-card is-${esc(bucket)}">` +
          `<div class="uc-docs-row is-${esc(bucket)}" data-pkg-key="${esc(pkg.key)}">` +
            `<span class="uc-docs-row-label">${esc(label)}</span>` +
          `</div>` +
          docsThumbHtml(pkg, bucket, label) +
        `</div>` +
      `</li>`
    );
  }

  function renderDocsDesk(deal) {
    const pendingList = $('uc-docs-pending-list');
    const signedList = $('uc-docs-signed-list');
    if (!pendingList && !signedList) return;

    const packages = buildPackageModel(deal || state.profile);
    const pending = packages.filter((p) => p.status === 'pending');
    const signed = packages.filter((p) => p.status === 'complete');

    if (pendingList) {
      pendingList.innerHTML = pending.length
        ? pending.map((p) => docsRowHtml(p, 'pending')).join('')
        : `<li class="uc-docs-bucket-empty">Nothing waiting on signatures.</li>`;
    }
    if (signedList) {
      signedList.innerHTML = signed.length
        ? signed.map((p) => docsRowHtml(p, 'signed')).join('')
        : `<li class="uc-docs-bucket-empty">No signed packages on this deal yet.</li>`;
    }

    const meta = $('uc-docs-toolbar-meta');
    if (meta) {
      meta.textContent = `${pending.length} pending · ${signed.length} signed`;
    }
  }

  function renderDocuments(docs) {
    if (state.profile && Array.isArray(docs)) state.profile.documents = docs;
    const deal = state.profile || {};
    renderDocsDesk(deal);
    syncProfileTabSummaries(state.profile);
  }

  function onDocsDeskClick(ev) {
    // Only the preview thumbnail opens the modal (not the type label chip)
    const thumb = ev.target.closest('button.uc-docs-thumb[data-pkg-key]');
    if (!thumb) return;
    const key = thumb.getAttribute('data-pkg-key');
    const packages = buildPackageModel(state.profile);
    const pkg = packages.find((p) => p.key === key);
    if (!pkg) return;
    const doc = pkg.primaryDoc;
    if (doc?.viewUrl) {
      openDocViewerModal(doc, docsUiLabel(pkg));
      return;
    }
    showToast('No preview available for this package yet');
  }

  async function autoSyncSignedDocuments(opts = {}) {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const pending = Array.isArray(state.profile?.signNowPending) ? state.profile.signNowPending : [];
    if (!pending.length) return;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/sync-signnow`, {
        method: 'POST',
        body: '{}'
      });
      const n = data.ingested || 0;
      if (data.deal) {
        state.profile = data.deal;
        const idx = state.deals.findIndex((d) => d.dealId === dealId);
        if (idx >= 0) state.deals[idx] = { ...state.deals[idx], ...data.deal };
        renderDocuments(data.deal.documents || []);
        syncDrawerJvButton(data.deal);
        syncDrawerAocButton(data.deal);
      }
      if (n && !opts.silent) {
        showToast(`Auto-imported ${n} signed document${n === 1 ? '' : 's'}`);
      }
    } catch (_) { /* silent background sync */ }
  }

  function closeDocViewer() {
    closeDocViewerModal();
  }

  function closeDocViewerModal() {
    const dlg = $('uc-doc-view-dialog');
    const frame = $('uc-doc-view-frame');
    if (frame) frame.removeAttribute('src');
    if (dlg?.open) dlg.close();
  }

  function openDocViewer(doc, label) {
    openDocViewerModal(doc, label);
  }

  function openDocViewerModal(doc, label) {
    const dlg = $('uc-doc-view-dialog');
    const frame = $('uc-doc-view-frame');
    const title = $('uc-doc-view-title');
    const openTab = $('uc-doc-view-open-tab');
    if (!dlg || !frame || !doc?.viewUrl) {
      showToast('No preview URL for this document');
      return;
    }
    if (title) title.textContent = label || doc.name || 'Document';
    if (openTab) openTab.href = doc.viewUrl;
    frame.src = doc.viewUrl;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function sendPackageKind(sendKind) {
    const sel = $('uc-doc-kind');
    if (sel && sendKind) sel.value = sendKind;
    return sendDocumentFromPanel(sendKind);
  }

  function openDocsSendTypeModal() {
    const dlg = $('uc-docs-send-type-dialog');
    if (!dlg) return;
    const first = dlg.querySelector('input[name="uc-docs-send-type"][value="psa"]');
    if (first) first.checked = true;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function continueDocsSendType() {
    const dlg = $('uc-docs-send-type-dialog');
    const picked = dlg?.querySelector('input[name="uc-docs-send-type"]:checked')?.value || 'psa';
    if (dlg?.open) dlg.close();
    else if (dlg) dlg.removeAttribute('open');
    sendDocumentFromPanel(picked);
  }

  async function sendDocumentFromPanel(kindOverride) {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first');
      return;
    }
    const kind = kindOverride || $('uc-doc-kind')?.value || 'aoc';
    const sel = $('uc-doc-kind');
    if (sel) sel.value = kind === 'purchase_contract' ? 'psa' : kind;
    if (kind === 'amendment') {
      const deal = state.profile || state.deals.find((d) => d.dealId === dealId);
      if (deal) openAmendment(deal);
      else showToast('Open a property first, then send the Amendment', 7000);
      return;
    }
    if (kind === 'aoc') {
      const deal = state.profile || state.deals.find((d) => d.dealId === dealId);
      if (deal) openAocAction(deal);
      else showToast('Open a property first, then send the AOC', 7000);
      return;
    }
    if (kind === 'jv') {
      showToast('JV auto-completes when the signed Purchase Agreement is imported — no manual send', 6000);
      return;
    }
    if (kind === 'psa' || kind === 'purchase_contract') {
      await sendPsaFromPanel(state.profile || { dealId });
    }
  }

  async function sendPsaFromPanel(deal) {
    if (!deal?.dealId) return;
    const dealType = String(deal.dealType || '').trim();
    // Prefer Send New PSA modal so Cash vs Subject-to is an explicit choice.
    // Existing deals without a vault leadId still use the direct SubTo/Cash send path.
    if (deal.leadId || dealType === 'cash' || !dealType) {
      openSendNewPsa({ dealType: dealType === 'subject_to' ? 'subject_to' : 'cash' });
      if (deal.leadId && deal.address) {
        selectPsaLead({
          leadId: deal.leadId,
          address: deal.address,
          city: deal.city,
          state: deal.state,
          zip: deal.zip,
          ownerName: deal.ownerName || deal.sellerNames || '',
          email: deal.ownerEmail || deal.email || '',
          phones: deal.phone ? [deal.phone] : []
        });
        if ($('uc-psa-price') && deal.purchasePrice != null && deal.purchasePrice !== '') {
          $('uc-psa-price').value = formatPsaMoneyInput(deal.purchasePrice);
        }
        if ($('uc-psa-emd') && deal.emdDeposit != null && deal.emdDeposit !== '') {
          $('uc-psa-emd').value = formatPsaMoneyInput(deal.emdDeposit);
        }
      }
      return;
    }
    showToast('Sending Subject-to PSA…');
    const btn = $('uc-doc-send');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/send-document`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'subto',
          sellerName: deal.ownerName || deal.sellerNames || '',
          sellerEmail: deal.ownerEmail || deal.email || '',
          purchasePrice: deal.purchasePrice,
          emdDeposit: deal.emdDeposit,
          legalDescription: deal.aocSend?.legalDescription || '',
          apn: deal.aocSend?.apn || ''
        })
      });
      showToast(data.result?.message || data.psa?.message || 'Subject-to PSA sent via SignNow');
      await loadDeals();
      if (data.deal && state.activeDealId === deal.dealId) {
        state.profile = data.deal;
        renderProfile(data.deal, state.contact);
        flashState($('uc-docs-pending-list') || $('uc-docs-instrument'));
      }
    } catch (err) {
      showToast(err.message || 'Send purchase contract failed');
    } finally {
      if (btn) btn.disabled = false;
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
      }
      if (n > 0) {
        flashState($('uc-docs-signed-list') || $('uc-docs-instrument'));
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
    const listed = state.deals.find((d) => d.dealId === dealId);
    if (
      !canOpenWaitingDeal()
      && (isWaitingForSignatures(listed) || listed?.restricted === true)
    ) {
      showToast('Waiting for Signatures is admin-only — shown on your tracker only');
      return;
    }
    state.activeDealId = dealId;
    state.profileTab = 'overview';
    state.commChannel = 'seller';
    const buyersLink = $('uc-buyers-link') || $('uc-trust-funds-link');
    if (buyersLink) buyersLink.href = `/buyers?deal=${encodeURIComponent(dealId)}`;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}`);
      renderProfile(data.deal, data.contact);
      const d = defaultProfileTab(data.deal, opts);
      showProfileTab(d.tab);
      if (d.channel) showCommChannel(d.channel);
      // Phone-style: load lands on the latest message in each thread.
      await loadMessages(dealId, { silent: true, forceScroll: true, pinLatest: true });
      requestAnimationFrame(() => {
        scrollThreadToLatest($('uc-convo-thread'));
        scrollThreadToLatest($('uc-team-thread'));
        scrollThreadToLatest($('uc-photo-thread'));
      });
      startPoll();
      if (opts.markTeamRead) await markTeamMessagesRead(dealId);
      if (opts.scrollToTeam) {
        requestAnimationFrame(() => {
          navigateProfileInstrument('comms', { channel: 'internal', flash: false });
          scrollThreadToLatest($('uc-team-thread'));
          $('uc-team-input')?.focus?.();
        });
      }
      if (opts.scrollToSms) {
        navigateProfileInstrument('comms', { channel: 'seller', flash: false });
        pulseSellerSmsSection();
        scrollToSellerSms();
      }
      syncMarkReadButton();
    } catch (err) {
      showToast(err.message || 'Could not open profile');
    }
  }

  function closeDrawerMoreMenu() {
    const more = document.querySelector('#uc-drawer .uc-drawer-more');
    if (more) more.open = false;
  }

  function closeProfile() {
    state.activeDealId = null;
    closeDocViewer();
    closeDrawerMoreMenu();
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (drawer) {
      drawer.classList.remove('uc-comms-focus');
      drawer.hidden = true;
    }
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('uc-drawer-open');
    const returnEl = profileReturnFocus;
    profileReturnFocus = null;
    ensureBoardPoll();
    if (returnEl && typeof returnEl.focus === 'function') {
      requestAnimationFrame(() => {
        try { returnEl.focus(); } catch (_) { /* ignore */ }
      });
    }
  }

  function openBuyerFound(deal) {
    const aoc = deal.aocSend || {};
    const { street, cityLine } = propertyLines(deal);
    const propLine = [street, cityLine].filter((p) => p && p !== '—').join(', ') || deal.address || 'this property';
    $('uc-buyer-deal-id').value = deal.dealId;
    $('uc-buyer-title').textContent = deal.address ? `Send AOC — ${deal.address}` : 'Send AOC';
    const lead = $('uc-aoc-property-line');
    if (lead) {
      lead.textContent = `Property address (from deal): ${propLine}. Fill buyer name/phone/email below — they fill address, then sign, date, By, and Its.`;
    }
    $('uc-aoc-buyer-name').value = aoc.buyerName
      || deal.buyerAssignment?.buyerContactName
      || deal.buyerAssignment?.buyerEntity
      || deal.cashBuyerName
      || '';
    $('uc-aoc-buyer-phone').value = aoc.buyerPhone || deal.buyerAssignment?.buyerPhone || '';
    $('uc-aoc-buyer-email').value = aoc.buyerEmail || deal.buyerAssignment?.buyerEmail || '';
    $('uc-aoc-legal').value = aoc.legalDescription || '';
    $('uc-aoc-apn').value = aoc.apn || '';
    $('uc-aoc-purchase-price').value = aoc.assigneePurchasePrice ?? '';
    $('uc-aoc-title-name').value = aoc.titleCompanyName || '';
    $('uc-aoc-title-address').value = aoc.titleCompanyAddress || '';
    $('uc-aoc-escrow-officer').value = aoc.escrowOfficerName || '';
    $('uc-aoc-title-email').value = aoc.titleCompanyEmail || '';
    $('uc-aoc-emd').value = aoc.buyerEmd ?? '';
    $('uc-aoc-coe').value = aoc.closingDate || deal.closingDate || deal.closingDisplay || '';
    $('uc-aoc-terms').value = aoc.additionalTerms && aoc.additionalTerms !== 'NA' ? aoc.additionalTerms : '';
    $('uc-buyer-dialog').showModal();
    ensureAocParcelFields(deal).catch(() => {});
  }

  async function ensureAocParcelFields(deal) {
    if (!deal?.dealId) return;
    const legalEl = $('uc-aoc-legal');
    const apnEl = $('uc-aoc-apn');
    const needLegal = !(legalEl && legalEl.value.trim());
    const needApn = !(apnEl && apnEl.value.trim());
    if (!needLegal && !needApn) return;
    try {
      const data = await api(
        `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/ensure-parcel`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      const fields = data.fields || {};
      if (needLegal && fields.legalDescription && legalEl) {
        legalEl.value = fields.legalDescription;
      }
      if (needApn && fields.apn && apnEl) {
        apnEl.value = fields.apn;
      }
      if (data.deal) {
        const idx = state.deals.findIndex((d) => d.dealId === data.deal.dealId);
        if (idx >= 0) state.deals[idx] = data.deal;
      }
      if ((needLegal && fields.legalDescription) || (needApn && fields.apn)) {
        showToast('APN / legal description filled from property records');
      }
    } catch (err) {
      if (needLegal || needApn) {
        showToast(err.message || 'Could not auto-fill APN / legal');
      }
    }
  }

  /** First send opens the AOC form; after send, confirm before reminding unsigned parties. */
  function openAocAction(deal) {
    if (!deal?.dealId) return;
    const { sent } = aocState(deal);
    if (sent) {
      openAocRemindConfirm(deal);
      return;
    }
    openBuyerFound(deal);
  }

  function aocState(deal) {
    const aoc = deal?.aocSend && typeof deal.aocSend === 'object' ? deal.aocSend : null;
    if (!aoc) return { sent: false, signed: false, aoc: null };
    const status = String(aoc.status || '').toLowerCase();
    const signed = status === 'signed' || Boolean(aoc.signedAt);
    const sent = signed
      || status === 'sent'
      || status === 'sending'
      || status === 'reminded'
      || Boolean(aoc.signNowDocumentId)
      || Boolean(aoc.requestedAt);
    return { sent, signed, aoc };
  }

  function aocQuickBtnHtml(deal) {
    const { sent, signed } = aocState(deal);
    const cls = ['uc-quick-btn'];
    if (signed) cls.push('uc-quick-btn--aoc-signed');
    else if (sent) cls.push('uc-quick-btn--aoc-sent');
    const label = signed ? 'AOC signed' : (sent ? 'AOC Reminder' : 'Send AOC');
    const title = signed
      ? 'AOC fully signed — click to remind anyone still pending'
      : (sent ? 'AOC already sent — click to remind unsigned parties' : 'Send AOC via SignNow');
    return `<button type="button" class="${cls.join(' ')}" data-action="buyer-found" title="${esc(title)}">${esc(label)}</button>`;
  }

  function syncDrawerAocButton(deal) {
    const btn = $('uc-drawer-buyer-found');
    if (!btn) return;
    const { sent, signed } = aocState(deal);
    btn.classList.toggle('uc-btn-aoc-signed', signed);
    btn.classList.toggle('uc-btn-aoc-sent', sent && !signed);
    btn.textContent = signed ? 'AOC signed' : (sent ? 'AOC Reminder' : 'Send AOC');
  }

  function openAocRemindConfirm(deal) {
    const { aoc, signed } = aocState(deal);
    $('uc-aoc-remind-deal-id').value = deal.dealId;
    $('uc-aoc-remind-title').textContent = deal.address
      ? `AOC reminder — ${deal.address}`
      : 'Send AOC reminder';
    const buyer = aoc?.buyerEmail || deal.buyerAssignment?.buyerEmail || 'the assignee';
    const sentWhen = formatJvWhen(aoc?.requestedAt) || 'unknown time';
    const remindedWhen = formatJvWhen(aoc?.lastRemindedAt);
    const body = $('uc-aoc-remind-body');
    const confirmBtn = $('uc-aoc-remind-confirm');
    if (signed) {
      if (confirmBtn) confirmBtn.textContent = 'Check & remind anyway';
      if (body) {
        body.innerHTML = `
          <p>This AOC looks fully signed.</p>
          <p>We can still check SignNow and remind anyone who somehow has not finished.</p>
          <ul class="uc-jv-resend-meta">
            <li><strong>Originally sent:</strong> ${esc(sentWhen)}</li>
            <li><strong>Assignee email:</strong> ${esc(buyer)}</li>
          </ul>`;
      }
    } else {
      if (confirmBtn) confirmBtn.textContent = 'Yes, send reminder';
      if (body) {
        body.innerHTML = `
          <p>Send a reminder to everyone who has <strong>not signed</strong> the AOC yet?</p>
          <ul class="uc-jv-resend-meta">
            <li><strong>Originally sent:</strong> ${esc(sentWhen)}</li>
            <li><strong>Assignee email on file:</strong> ${esc(buyer)}</li>
            ${remindedWhen ? `<li><strong>Last reminder:</strong> ${esc(remindedWhen)}</li>` : ''}
          </ul>
          <p class="uc-jv-resend-note">SignNow will email only pending signers (buyer / Assignee who have not completed).</p>`;
      }
    }
    $('uc-aoc-remind-dialog')?.showModal();
  }

  function closeAocRemindConfirm() {
    $('uc-aoc-remind-dialog')?.close();
  }

  async function doRemindAoc(deal) {
    if (!deal?.dealId) return;
    try {
      showToast('Sending AOC reminder…', 8000);
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/remind-aoc`, {
        method: 'POST',
        body: '{}'
      });
      showToast(data.reminder?.message || 'AOC reminder sent', 7000);
      await loadDeals();
      if (state.activeDealId === deal.dealId && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'AOC reminder failed', 9000);
    }
  }

  async function submitAocRemind(ev) {
    ev.preventDefault();
    const id = $('uc-aoc-remind-deal-id').value;
    const deal = state.deals.find((d) => d.dealId === id)
      || (state.profile?.dealId === id ? state.profile : null)
      || { dealId: id };
    $('uc-aoc-remind-dialog')?.close();
    await doRemindAoc(deal);
  }

  const JV_PARTIES = {
    sales: {
      name: 'Brandon Wunder',
      company: 'Wunderhaus Group LLC',
      email: 'brandon@wunderhausgroup.com'
    },
    dispos: {
      name: 'Bradley Lewis',
      company: 'Green Oasis Solutions LLC',
      email: 'buyhomes995@gmail.com'
    }
  };

  function jvState(deal) {
    const jv = deal?.jvAgreement && typeof deal.jvAgreement === 'object' ? deal.jvAgreement : null;
    if (!jv) return { sent: false, signed: false, jv: null };
    const status = String(jv.status || '').toLowerCase();
    const signed = status === 'signed' || Boolean(jv.signedAt);
    const sent = signed
      || status === 'sent'
      || status === 'sending'
      || Boolean(jv.signNowDocumentId)
      || Boolean(jv.requestedAt);
    return { sent, signed, jv };
  }

  function formatJvWhen(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  /** JV auto-runs after signed PSA import — no manual Complete JV control. */
  function jvQuickBtnHtml(deal) {
    const { sent, signed } = jvState(deal);
    if (signed) {
      return `<span class="uc-quick-btn uc-quick-btn--jv uc-quick-btn--jv-signed" title="JV auto-completed after signed PSA">JV signed</span>`;
    }
    if (sent) {
      return `<span class="uc-quick-btn uc-quick-btn--jv uc-quick-btn--jv-sent" title="JV in progress / on file">JV done</span>`;
    }
    return `<span class="uc-quick-btn uc-quick-btn--jv" title="JV auto-sends when signed PSA is imported">JV auto</span>`;
  }

  function syncDrawerJvButton(deal) {
    const btn = $('uc-drawer-send-jv');
    if (!btn) return;
    // Hidden control — JV auto-completes after signed PSA import.
    btn.hidden = true;
    btn.setAttribute('aria-hidden', 'true');
    btn.tabIndex = -1;
    const { sent, signed } = jvState(deal);
    btn.classList.toggle('uc-btn-jv-signed', signed);
    btn.classList.toggle('uc-btn-jv-sent', sent && !signed);
    btn.textContent = signed ? 'JV signed' : (sent ? 'JV done' : 'JV auto');
  }

  async function doSendJv(deal) {
    // Manual Complete JV removed — kept as no-op safety if something still calls it.
    showToast('JV auto-completes when the signed Purchase Agreement is imported', 5000);
    if (deal?.dealId) {
      try {
        await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/sync-signnow`, {
          method: 'POST',
          body: '{}'
        });
        await loadDeals();
      } catch (_) { /* ignore */ }
    }
  }

  function openJvConfirm(deal) {
    // Manual Complete JV retired — JV auto-runs after signed PSA import.
    doSendJv(deal);
  }

  function openSendJv(deal) {
    if (!deal?.dealId) return;
    openJvConfirm(deal);
  }

  function inferPsaDateFromDeal(deal, contact) {
    const fromApiSeller = deal?.amendmentDefaults?.seller?.originalAgreementDate;
    const fromApiBuyer = deal?.amendmentDefaults?.end_buyer?.originalAgreementDate;
    if (fromApiSeller || fromApiBuyer) return fromApiSeller || fromApiBuyer || '';
    const direct = deal?.originalAgreementDate
      || deal?.agreementDate
      || deal?.contractDate
      || contact?.contractSignedDate
      || deal?.cashPsaSend?.signedAt
      || deal?.subtoPsaSend?.signedAt
      || '';
    if (direct) return direct;
    const docs = Array.isArray(deal?.documents) ? deal.documents : [];
    const psa = docs.find((d) => {
      const kind = String(d?.kind || '').toLowerCase();
      const label = String(d?.label || '').toLowerCase();
      const name = String(d?.name || '').toLowerCase();
      return kind === 'purchase_contract' || kind === 'subto' || label === 'subto'
        || (/\b(purchase|psa|sub\s*-?\s*to|subject\s*-?\s*to)\b/.test(name)
          && !/\b(amendment|addendum|assignment|aoc|jv)\b/.test(name));
    });
    return psa?.signedAt || psa?.uploadedAt || '';
  }

  function amendmentPartyDefaults(deal, contact, party) {
    const key = party === 'end_buyer' ? 'end_buyer' : 'seller';
    const fromApi = deal?.amendmentDefaults?.[key] || {};
    if (key === 'end_buyer') {
      const ba = deal?.buyerAssignment || {};
      return {
        originalAgreementDate: fromApi.originalAgreementDate
          || inferPsaDateFromDeal(deal, contact)
          || '',
        sellers: [{
          name: fromApi.counterpartyName
            || ba.buyerEntity
            || ba.buyerContactName
            || deal?.cashBuyerName
            || contact?.cashBuyerName
            || '',
          email: fromApi.counterpartyEmail || ba.buyerEmail || ''
        }]
      };
    }
    let sellers = Array.isArray(fromApi.sellers) ? fromApi.sellers.slice() : [];
    if (!sellers.length && Array.isArray(deal?.contractSellers) && deal.contractSellers.length) {
      sellers = deal.contractSellers.slice();
    }
    if (!sellers.length) {
      const names = String(deal?.sellerNames || '')
        .split(/\s*\/\s*/)
        .map((n) => String(n || '').trim())
        .filter(Boolean);
      const s1Name = deal?.ownerName || names[0] || contact?.sellersName || contact?.name || '';
      const s1Email = deal?.ownerEmail || deal?.email || contact?.email || '';
      sellers = [{ name: s1Name, email: s1Email }];
      if (names[1]) sellers.push({ name: names[1], email: '' });
    }
    return {
      originalAgreementDate: fromApi.originalAgreementDate
        || inferPsaDateFromDeal(deal, contact)
        || '',
      sellers
    };
  }

  function syncAmendmentSellerCountUi() {
    const party = $('uc-amendment-party')?.value || 'seller';
    const sellerBlock = $('uc-amendment-seller-block');
    const buyerBlock = $('uc-amendment-end-buyer-block');
    const isBuyer = party === 'end_buyer';
    if (sellerBlock) sellerBlock.hidden = isBuyer;
    if (buyerBlock) buyerBlock.hidden = !isBuyer;
    const s1Name = $('uc-amendment-s1-name');
    const s1Email = $('uc-amendment-s1-email');
    const buyerName = $('uc-amendment-buyer-name');
    const buyerEmail = $('uc-amendment-buyer-email');
    if (s1Name) s1Name.required = !isBuyer;
    if (s1Email) s1Email.required = !isBuyer;
    if (buyerName) buyerName.required = isBuyer;
    if (buyerEmail) buyerEmail.required = isBuyer;

    const count = document.querySelector('input[name="uc-amendment-seller-count"]:checked')?.value || '1';
    const box = $('uc-amendment-seller2');
    if (box) box.hidden = isBuyer || count !== '2';
    const s2Name = $('uc-amendment-s2-name');
    const s2Email = $('uc-amendment-s2-email');
    if (s2Name) s2Name.required = !isBuyer && count === '2';
    if (s2Email) s2Email.required = !isBuyer && count === '2';
  }

  function applyAmendmentPartyFields() {
    const deal = state._amendmentDeal;
    const contact = state._amendmentContact;
    if (!deal) return;
    const party = $('uc-amendment-party')?.value || 'seller';
    const defs = amendmentPartyDefaults(deal, contact, party);
    $('uc-amendment-orig-date').value = defs.originalAgreementDate || '';
    if ($('uc-amendment-orig-date')) $('uc-amendment-orig-date').readOnly = true;

    if (party === 'end_buyer') {
      const s = defs.sellers?.[0] || {};
      if ($('uc-amendment-buyer-name')) $('uc-amendment-buyer-name').value = s.name || '';
      if ($('uc-amendment-buyer-email')) $('uc-amendment-buyer-email').value = s.email || '';
    } else {
      const sellers = Array.isArray(defs.sellers) ? defs.sellers : [];
      const countRadio = document.querySelector(
        `input[name="uc-amendment-seller-count"][value="${sellers.length >= 2 ? '2' : '1'}"]`
      );
      if (countRadio) countRadio.checked = true;
      if ($('uc-amendment-s1-name')) $('uc-amendment-s1-name').value = sellers[0]?.name || '';
      if ($('uc-amendment-s1-email')) $('uc-amendment-s1-email').value = sellers[0]?.email || '';
      if ($('uc-amendment-s2-name')) $('uc-amendment-s2-name').value = sellers[1]?.name || '';
      if ($('uc-amendment-s2-email')) $('uc-amendment-s2-email').value = sellers[1]?.email || '';
    }

    syncAmendmentSellerCountUi();
    const hint = $('uc-amendment-orig-hint');
    if (hint) {
      const hasPsaDoc = Array.isArray(deal?.documents)
        && deal.documents.some((d) => {
          const kind = String(d?.kind || '').toLowerCase();
          const label = String(d?.label || '').toLowerCase();
          const name = String(d?.name || '').toLowerCase();
          return kind === 'purchase_contract' || kind === 'subto' || label === 'subto'
            || (/\b(purchase|psa|sub\s*-?\s*to|subject\s*-?\s*to)\b/.test(name)
              && !/\b(amendment|addendum|assignment|aoc|jv)\b/.test(name));
        });
      if (defs.originalAgreementDate) {
        hint.textContent = hasPsaDoc && !deal?.originalAgreementDate
          ? 'Using the date from the PSA in Documents — locked for this send'
          : 'Locked to the PSA / GHL contract signed date — not editable';
      } else if (hasPsaDoc) {
        hint.textContent = 'PSA is in Documents but no signed date was found — reopen this deal (or re-upload the PSA) so the date can load';
      } else if (deal?.dealType === 'subject_to') {
        hint.textContent = 'No PSA signed date yet — attach the signed SubTo or set the signed date before sending an amendment';
      } else {
        hint.textContent = 'No PSA signed date on file yet — open the deal or Sync from GHL first';
      }
    }
  }

  async function openAmendment(deal) {
    let full = deal;
    let contact = null;
    // Always refresh from API so seller email comes from the GHL contact page
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}`);
      full = data.deal || deal;
      contact = data.contact || null;
    } catch (_) {
      if (state.activeDealId === deal.dealId) {
        full = state.profile || deal;
        contact = state.contact || null;
      }
    }
    state._amendmentDeal = full;
    state._amendmentContact = contact;
    state._amendmentSending = false;
    $('uc-amendment-deal-id').value = full.dealId;
    $('uc-amendment-title').textContent = full.address ? `Amendment — ${full.address}` : 'Send Amendment';
    $('uc-amendment-terms').value = '';
    if ($('uc-amendment-party')) $('uc-amendment-party').value = 'seller';
    setAmendmentStatus('');
    const submitBtn = $('uc-amendment-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Amendment';
    }
    applyAmendmentPartyFields();
    $('uc-amendment-dialog').showModal();
  }

  async function submitBuyerFound(ev) {
    ev.preventDefault();
    const id = $('uc-buyer-deal-id').value;
    const body = {
      buyerName: $('uc-aoc-buyer-name').value.trim(),
      buyerPhone: $('uc-aoc-buyer-phone').value.trim(),
      buyerEmail: $('uc-aoc-buyer-email').value.trim(),
      legalDescription: $('uc-aoc-legal').value.trim(),
      apn: $('uc-aoc-apn').value.trim(),
      assigneePurchasePrice: $('uc-aoc-purchase-price').value === '' ? null : Number($('uc-aoc-purchase-price').value),
      titleCompanyName: $('uc-aoc-title-name').value.trim(),
      titleCompanyAddress: $('uc-aoc-title-address').value.trim(),
      escrowOfficerName: $('uc-aoc-escrow-officer').value.trim(),
      titleCompanyEmail: $('uc-aoc-title-email').value.trim(),
      buyerEmd: $('uc-aoc-emd').value === '' ? null : Number($('uc-aoc-emd').value),
      closingDate: $('uc-aoc-coe').value.trim(),
      additionalTerms: $('uc-aoc-terms').value.trim() || 'NA'
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-aoc`, {
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
      showToast(err.message || 'Send AOC failed');
    }
  }

  async function submitSendJv(ev) {
    ev.preventDefault();
    const id = $('uc-jv-deal-id').value;
    const deal = state.deals.find((d) => d.dealId === id)
      || (state.profile?.dealId === id ? state.profile : null)
      || { dealId: id };
    $('uc-jv-dialog')?.close();
    await doSendJv(deal);
  }

  async function submitAmendment(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (state._amendmentSending) return;
    const id = $('uc-amendment-deal-id').value;
    const partyType = $('uc-amendment-party')?.value || 'seller';
    const terms = $('uc-amendment-terms').value.trim();
    const origDate = ($('uc-amendment-orig-date')?.value || '').trim();
    setAmendmentStatus('');
    if (!id) {
      setAmendmentStatus('Deal missing — close and open Amendment again');
      showToast('Deal missing — close and open Amendment again', 7000);
      return;
    }
    if (!terms) {
      setAmendmentStatus('Enter amendment terms first');
      showToast('Enter amendment terms first', 7000);
      $('uc-amendment-terms')?.focus();
      return;
    }
    if (!origDate) {
      setAmendmentStatus('Original PSA signed date is missing — open the deal or attach the signed PSA first');
      showToast('Original PSA signed date is missing — Sync from GHL or set it on the deal first', 9000);
      return;
    }

    let sellers = [];
    let sellerCount = 1;
    if (partyType === 'end_buyer') {
      const name = ($('uc-amendment-buyer-name')?.value || '').trim();
      const email = ($('uc-amendment-buyer-email')?.value || '').trim();
      if (!name || !email) {
        setAmendmentStatus('End buyer name and email are required');
        showToast('End buyer name and email are required', 7000);
        return;
      }
      sellers = [{ name, email }];
    } else {
      sellerCount = Number(document.querySelector('input[name="uc-amendment-seller-count"]:checked')?.value || '1');
      const s1Name = ($('uc-amendment-s1-name')?.value || '').trim();
      const s1Email = ($('uc-amendment-s1-email')?.value || '').trim();
      if (!s1Name || !s1Email) {
        setAmendmentStatus('Seller 1 name and email are required');
        showToast('Seller 1 name and email are required', 7000);
        return;
      }
      sellers = [{ name: s1Name, email: s1Email }];
      if (sellerCount >= 2) {
        const s2Name = ($('uc-amendment-s2-name')?.value || '').trim();
        const s2Email = ($('uc-amendment-s2-email')?.value || '').trim();
        if (!s2Name || !s2Email) {
          setAmendmentStatus('Seller 2 name and email are required');
          showToast('Seller 2 name and email are required', 7000);
          return;
        }
        sellers.push({ name: s2Name, email: s2Email });
      }
    }

    const btn = $('uc-amendment-submit');
    const prevLabel = btn?.textContent || 'Send Amendment';
    state._amendmentSending = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    setAmendmentStatus('Sending amendment via SignNow…', 'info');
    showToast('Sending amendment via SignNow…', 12000);

    const body = {
      partyType,
      amendmentTerms: terms,
      sellerCount,
      sellers,
      sellerName: sellers[0].name,
      sellerEmail: sellers[0].email,
      counterpartyName: sellers[0].name,
      counterpartyEmail: sellers[0].email
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-amendment`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setAmendmentStatus(data.amendment?.message || 'Amendment sent via SignNow', 'ok');
      $('uc-amendment-dialog').close();
      showToast(data.amendment?.message || 'Amendment sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      const raw = String(err.message || 'Send Amendment failed');
      const friendly = /429|rate limit/i.test(raw)
        ? 'SignNow rate limit hit (500 API calls/hour). Wait until the next hour, then click Send Amendment again — the form stays ready.'
        : raw;
      setAmendmentStatus(friendly, 'error');
      showToast(friendly, 12000);
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    } finally {
      state._amendmentSending = false;
    }
  }

  let psaSearchTimer = null;
  let psaSelectedLead = null;
  let psaSearchSeq = 0;

  function setPsaResultsHtml(html) {
    const box = $('uc-psa-results');
    if (!box) return;
    const content = String(html || '').trim();
    box.innerHTML = content;
    box.hidden = !content;
  }

  function syncPsaSeller2Visibility() {
    const count = document.querySelector('input[name="uc-psa-seller-count"]:checked')?.value || '1';
    const box = $('uc-psa-seller2');
    if (box) box.hidden = count !== '2';
    const s2Name = $('uc-psa-s2-name');
    const s2Email = $('uc-psa-s2-email');
    if (s2Name) s2Name.required = count === '2';
    if (s2Email) s2Email.required = count === '2';
  }

  function setPsaError(msg) {
    const el = $('uc-psa-error');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function formatPsaMoneyInput(v, fallback) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw && fallback != null) return formatPsaMoneyInput(fallback);
    if (!raw) return '';
    if (raw.startsWith('$')) return raw;
    const n = Number(String(raw).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n)) return raw;
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    });
  }

  function clearPsaLeadSelection({ keepSearch = false } = {}) {
    psaSelectedLead = null;
    if ($('uc-psa-lead-id')) $('uc-psa-lead-id').value = '';
    if (!keepSearch && $('uc-psa-search')) $('uc-psa-search').value = '';
  }

  function selectedPsaDealType() {
    const raw = document.querySelector('input[name="uc-psa-deal-type"]:checked')?.value || 'cash';
    return raw === 'subject_to' ? 'subject_to' : 'cash';
  }

  function syncPsaSubmitLabel() {
    const submitBtn = $('uc-psa-submit');
    if (!submitBtn || submitBtn.disabled) return;
    submitBtn.textContent = selectedPsaDealType() === 'subject_to'
      ? 'Send Subject-to PSA'
      : 'Send Cash PSA';
  }

  function openSendNewPsa(opts = {}) {
    clearPsaLeadSelection();
    setPsaError('');
    setPsaResultsHtml('');
    if ($('uc-psa-s1-name')) $('uc-psa-s1-name').value = '';
    if ($('uc-psa-s1-email')) $('uc-psa-s1-email').value = '';
    if ($('uc-psa-s2-name')) $('uc-psa-s2-name').value = '';
    if ($('uc-psa-s2-email')) $('uc-psa-s2-email').value = '';
    if ($('uc-psa-price')) $('uc-psa-price').value = '';
    if ($('uc-psa-emd')) $('uc-psa-emd').value = '$100.00';
    if ($('uc-psa-inspection')) $('uc-psa-inspection').value = '10';
    if ($('uc-psa-closing-loc')) $('uc-psa-closing-loc').value = "Buyer's Choice";
    if ($('uc-psa-terms')) $('uc-psa-terms').value = '';
    const one = document.querySelector('input[name="uc-psa-seller-count"][value="1"]');
    if (one) one.checked = true;
    syncPsaSeller2Visibility();
    const prefer = opts.dealType === 'subject_to' ? 'subject_to' : 'cash';
    const typeRadio = document.querySelector(`input[name="uc-psa-deal-type"][value="${prefer}"]`)
      || document.querySelector('input[name="uc-psa-deal-type"][value="cash"]');
    if (typeRadio) typeRadio.checked = true;
    const submitBtn = $('uc-psa-submit');
    if (submitBtn) submitBtn.disabled = false;
    syncPsaSubmitLabel();
    $('uc-psa-dialog')?.showModal();
    $('uc-psa-search')?.focus();
  }

  function selectPsaLead(lead) {
    psaSelectedLead = lead;
    if ($('uc-psa-lead-id')) $('uc-psa-lead-id').value = lead.leadId || '';
    const line = [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    if ($('uc-psa-search')) $('uc-psa-search').value = line;
    setPsaResultsHtml('');
    if ($('uc-psa-s1-name')) $('uc-psa-s1-name').value = lead.ownerName || '';
    if ($('uc-psa-s1-email')) $('uc-psa-s1-email').value = lead.email || '';
    if (!lead.email) {
      setPsaError('No email on this Vault lead — enter Seller 1 email before sending.');
    } else {
      setPsaError('');
    }
  }

  function leadMatchesPsaQuery(lead, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return false;
    const tokens = q.split(/\s+/).filter(Boolean);
    const hay = [
      lead.address,
      lead.city,
      lead.state,
      lead.zip,
      lead.ownerName,
      lead.email
    ].join(' ').toLowerCase();
    const compact = hay.replace(/[^a-z0-9]+/g, '');
    return tokens.every((token) => {
      if (hay.includes(token)) return true;
      const t = token.replace(/[^a-z0-9]+/g, '');
      return t.length >= 2 && compact.includes(t);
    });
  }

  async function searchVaultForPsa(q) {
    const box = $('uc-psa-results');
    if (!box) return;
    // Already picked — do not reopen dropdown until the user edits/clears the search.
    if (psaSelectedLead && ($('uc-psa-lead-id')?.value || '')) {
      setPsaResultsHtml('');
      return;
    }
    const query = String(q || '').trim();
    const seq = ++psaSearchSeq;
    if (query.length < 2) {
      setPsaResultsHtml(query
        ? '<p class="uc-psa-results-empty">Type at least 2 characters…</p>'
        : '');
      return;
    }
    setPsaResultsHtml('<p class="uc-psa-results-empty">Searching Vault…</p>');
    try {
      const data = await api(`/api/leads/admin/contracts/vault-search?q=${encodeURIComponent(query)}&limit=12`);
      if (seq !== psaSearchSeq) return; // stale response — ignore
      const current = String($('uc-psa-search')?.value || '').trim();
      if (current !== query) return;
      const leads = (data.leads || []).filter((l) => leadMatchesPsaQuery(l, query));
      if (!leads.length) {
        setPsaResultsHtml('<p class="uc-psa-results-empty">No active Vault leads match that address.</p>');
        return;
      }
      setPsaResultsHtml(leads.map((l) => {
        const cityLine = [l.city, l.state, l.zip].filter(Boolean).join(', ');
        const emailBit = l.email ? ` · ${esc(l.email)}` : '';
        return `<button type="button" class="uc-psa-result" role="option" data-lead-id="${esc(l.leadId)}"
          data-address="${esc(l.address || '')}" data-city="${esc(l.city || '')}"
          data-state="${esc(l.state || '')}" data-zip="${esc(l.zip || '')}"
          data-owner="${esc(l.ownerName || '')}" data-email="${esc(l.email || '')}">
          <span class="uc-psa-result-addr">${esc(l.address || '—')}</span>
          <span class="uc-psa-result-meta">${esc(cityLine || '—')}${l.ownerName ? ` · ${esc(l.ownerName)}` : ''}${emailBit}</span>
        </button>`;
      }).join(''));
    } catch (err) {
      if (seq !== psaSearchSeq) return;
      setPsaResultsHtml(`<p class="uc-psa-results-empty">${esc(err.message || 'Search failed')}</p>`);
    }
  }

  async function submitSendNewPsa(ev) {
    ev.preventDefault();
    setPsaError('');
    const leadId = ($('uc-psa-lead-id')?.value || '').trim();
    if (!leadId) {
      setPsaError('Select a Vault property first.');
      return;
    }
    const sellerCount = Number(document.querySelector('input[name="uc-psa-seller-count"]:checked')?.value || '1');
    const s1Name = ($('uc-psa-s1-name')?.value || '').trim();
    const s1Email = ($('uc-psa-s1-email')?.value || '').trim();
    if (!s1Name || !s1Email) {
      setPsaError('Confirm Seller 1 name and email.');
      return;
    }
    const sellers = [{ name: s1Name, email: s1Email }];
    if (sellerCount >= 2) {
      const s2Name = ($('uc-psa-s2-name')?.value || '').trim();
      const s2Email = ($('uc-psa-s2-email')?.value || '').trim();
      if (!s2Name || !s2Email) {
        setPsaError('Enter Seller 2 name and email, or switch to 1 seller.');
        return;
      }
      sellers.push({ name: s2Name, email: s2Email });
    }
    const purchasePrice = ($('uc-psa-price')?.value || '').trim();
    if (!purchasePrice) {
      setPsaError('Purchase price is required.');
      return;
    }

    const dealType = selectedPsaDealType();
    const body = {
      leadId,
      dealType,
      sellerCount,
      sellers,
      purchasePrice: formatPsaMoneyInput(purchasePrice) || purchasePrice,
      emdDeposit: formatPsaMoneyInput(($('uc-psa-emd')?.value || '').trim(), 100),
      inspectionDays: ($('uc-psa-inspection')?.value || '').trim() || '10',
      closingLocation: ($('uc-psa-closing-loc')?.value || '').trim() || "Buyer's Choice",
      additionalTerms: ($('uc-psa-terms')?.value || '').trim()
    };

    const btn = $('uc-psa-submit');
    const prev = btn?.textContent || (dealType === 'subject_to' ? 'Send Subject-to PSA' : 'Send Cash PSA');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    try {
      const data = await api('/api/leads/admin/contracts/send-new-psa', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-psa-dialog')?.close();
      const fallbackMsg = dealType === 'subject_to'
        ? 'Subject-to PSA sent via SignNow'
        : 'Cash PSA sent via SignNow';
      showToast(data.psa?.message || fallbackMsg, 6000);
      await loadDeals();
      if (data.deal?.dealId) {
        openProfile(data.deal.dealId).catch(() => {});
      }
    } catch (err) {
      setPsaError(err.message || 'Send New PSA failed');
      if (err.deal || err.code === 'SIGNNOW_SEND_FAILED' || err.code === 'SIGNNOW_API_ERROR') {
        await loadDeals().catch(() => {});
      }
      showToast(err.message || 'Send New PSA failed', 9000);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev;
        syncPsaSubmitLabel();
      }
    }
  }

  function openEdit(deal) {
    state.editingId = deal.dealId;
    $('uc-edit-id').value = deal.dealId;
    $('uc-edit-stage').value = deal.stage || 'under_contract';
    if ($('uc-edit-deal-type')) $('uc-edit-deal-type').value = deal.dealType || '';
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
      dealType: $('uc-edit-deal-type')?.value || '',
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
      const board = await api('/api/leads/admin/contracts?board=contracts');
      state.deals = board.deals || [];
      state.totals = board.totals || data.totals || null;
      state.unreadTeam = board.unreadTeam || data.unreadTeam || state.unreadTeam || [];
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
    bindThreadScrollMemory();
    $('uc-buyer-form')?.addEventListener('submit', submitBuyerFound);
    $('uc-jv-form')?.addEventListener('submit', submitSendJv);
    $('uc-amendment-form')?.addEventListener('submit', submitAmendment);
    $('uc-amendment-party')?.addEventListener('change', applyAmendmentPartyFields);
    document.querySelectorAll('input[name="uc-amendment-seller-count"]').forEach((radio) => {
      radio.addEventListener('change', syncAmendmentSellerCountUi);
    });
    $('uc-buyer-cancel')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-buyer-close')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-jv-cancel')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-jv-close')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-amendment-cancel')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-amendment-close')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-psa-cancel')?.addEventListener('click', () => $('uc-psa-dialog')?.close());
    $('uc-psa-close')?.addEventListener('click', () => $('uc-psa-dialog')?.close());
    $('uc-send-new-psa')?.addEventListener('click', () => openSendNewPsa());
    $('uc-psa-form')?.addEventListener('submit', submitSendNewPsa);
    document.querySelectorAll('input[name="uc-psa-deal-type"]').forEach((radio) => {
      radio.addEventListener('change', syncPsaSubmitLabel);
    });
    $('uc-psa-search')?.addEventListener('input', () => {
      // Editing/clearing the filled address unlocks search again.
      if (psaSelectedLead) {
        clearPsaLeadSelection({ keepSearch: true });
        if ($('uc-psa-s1-name')) $('uc-psa-s1-name').value = '';
        if ($('uc-psa-s1-email')) $('uc-psa-s1-email').value = '';
        setPsaError('');
      }
      clearTimeout(psaSearchTimer);
      psaSearchTimer = setTimeout(() => searchVaultForPsa($('uc-psa-search')?.value || ''), 220);
    });
    $('uc-psa-price')?.addEventListener('blur', () => {
      const el = $('uc-psa-price');
      if (!el || !el.value.trim()) return;
      el.value = formatPsaMoneyInput(el.value);
    });
    $('uc-psa-emd')?.addEventListener('blur', () => {
      const el = $('uc-psa-emd');
      if (!el) return;
      el.value = formatPsaMoneyInput(el.value, 100);
    });
    $('uc-psa-results')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-lead-id]');
      if (!btn) return;
      selectPsaLead({
        leadId: btn.getAttribute('data-lead-id'),
        address: btn.getAttribute('data-address') || '',
        city: btn.getAttribute('data-city') || '',
        state: btn.getAttribute('data-state') || '',
        zip: btn.getAttribute('data-zip') || '',
        ownerName: btn.getAttribute('data-owner') || '',
        email: btn.getAttribute('data-email') || ''
      });
    });
    document.querySelectorAll('input[name="uc-psa-seller-count"]').forEach((radio) => {
      radio.addEventListener('change', syncPsaSeller2Visibility);
    });
    $('uc-release-form')?.addEventListener('submit', submitReleaseConfirm);
    $('uc-release-confirm-input')?.addEventListener('input', onReleaseConfirmInput);
    $('uc-release-cancel')?.addEventListener('click', closeReleaseConfirm);
    $('uc-release-close')?.addEventListener('click', closeReleaseConfirm);
    $('uc-rehab-save')?.addEventListener('click', () => { saveRehab(); });
    $('uc-buyer-offer-add')?.addEventListener('click', () => { addBuyerOfferDraft(); });
    $('uc-offer-walker-presets')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-walker-pick]');
      if (!btn) return;
      addOfferFromWalker(btn.getAttribute('data-walker-pick'));
    });
    bindWalkthroughs();
    $('uc-buyer-offers-list')?.addEventListener('click', (ev) => {
      onBuyerOfferAction(ev).catch((err) => showToast(err.message || 'Buyer offer action failed'));
    });
    $('uc-buyer-offers-list')?.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const row = ev.target.closest('.uc-buyer-offer-row.is-locked[data-buyer-offer-action="select"]');
      if (!row || ev.target.closest('button, input, textarea, a')) return;
      ev.preventDefault();
      onBuyerOfferAction({ target: row, preventDefault() {}, stopPropagation() {} })
        .catch((err) => showToast(err.message || 'Buyer offer action failed'));
    });
    $('uc-buyers-leader')?.addEventListener('click', (ev) => {
      onBuyerOfferAction(ev).catch((err) => showToast(err.message || 'Buyer offer action failed'));
    });
    bindOverviewNotes();
    // Investorbase link lives in the hero; re-bind via delegation on drawer hero
    $('uc-drawer')?.addEventListener('click', (ev) => {
      if (!ev.target.closest('#uc-hero-investorbase')) return;
      onInvestorBaseAction(ev).catch((err) => showToast(err.message || 'Investorbase action failed'));
    });
    $('uc-drawer')?.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      if (!ev.target.closest('#uc-investor-base-input')) return;
      ev.preventDefault();
      const fake = { target: document.querySelector('[data-investor-base-action="save"]') || ev.target };
      // trigger save
      const btn = document.querySelector('#uc-hero-investorbase [data-investor-base-action="save"]');
      if (btn) {
        onInvestorBaseAction({ target: btn, preventDefault() {}, stopPropagation() {} })
          .catch((err) => showToast(err.message || 'Save failed'));
      }
    });
    $('uc-photo-copy-url-sms')?.addEventListener('click', () => { copyUploadUrl(); });
    $('uc-photo-sms-send')?.addEventListener('click', () => { sendPhotographerSms(); });
    $('uc-photo-sms-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPhotographerSms();
      }
    });
    $('uc-scan-run')?.addEventListener('click', () => { runRehabScan({ sync: false }); });
    $('uc-scan-apply-opts')?.addEventListener('click', () => { applyScanOptions(); });
    $('uc-scan-assumptions-toggle')?.addEventListener('click', () => {
      const panel = $('uc-scan-assumptions');
      const btn = $('uc-scan-assumptions-toggle');
      if (!panel) return;
      const next = panel.hidden;
      panel.hidden = !next;
      if (btn) btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    });
    $('uc-scan-lines')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-line-void]');
      if (btn) {
        const id = btn.getAttribute('data-line-void');
        const voided = btn.getAttribute('data-voided') !== '0';
        voidScanLine(id, voided);
        return;
      }
      const line = ev.target.closest('.uc-scan-line[data-media-ids]');
      if (!line) return;
      const raw = line.getAttribute('data-media-ids') || '';
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length) openEvidenceFromMediaIds(ids);
    });
    $('uc-media-rooms')?.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-room]');
      if (!chip) return;
      state.mediaRoomFilter = chip.getAttribute('data-room') || 'all';
      renderMedia(state.profile?.sellerMedia || []);
    });
    $('uc-media-desk-upload')?.addEventListener('click', () => $('uc-media-desk-file')?.click());
    $('uc-media-desk-file')?.addEventListener('change', (ev) => {
      deskUploadMedia(ev.target.files).catch((err) => showToast(err.message || 'Upload failed'));
      ev.target.value = '';
    });
    const drop = $('uc-evidence-drop');
    if (drop && drop.dataset.bound !== '1') {
      drop.dataset.bound = '1';
      ['dragenter', 'dragover'].forEach((type) => {
        drop.addEventListener(type, (ev) => {
          ev.preventDefault();
          drop.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        drop.addEventListener(type, (ev) => {
          ev.preventDefault();
          if (type === 'dragleave' && drop.contains(ev.relatedTarget)) return;
          drop.classList.remove('is-dragover');
        });
      });
      drop.addEventListener('drop', (ev) => {
        ev.preventDefault();
        drop.classList.remove('is-dragover');
        const files = ev.dataTransfer?.files;
        if (files?.length) {
          deskUploadMedia(files).catch((err) => showToast(err.message || 'Upload failed'));
        }
      });
    }
    // SMS pulse is a span badge on the Seller channel control (not nested button-in-button).
    $('uc-sms-pulse')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      scrollToSellerSms();
    });
    bindCommChannels();
    $('uc-team-send')?.addEventListener('click', () => { sendTeamMessage(); });
    $('uc-gif-toggle')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      toggleGifPicker();
    });
    $('uc-gif-picker-close')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      closeGifPicker();
    });
    $('uc-gif-draft-clear')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      clearPendingTeamGif();
      showToast('GIF removed');
    });
    $('uc-gif-search')?.addEventListener('input', () => {
      if (gifSearchTimer) clearTimeout(gifSearchTimer);
      gifSearchTimer = setTimeout(() => {
        loadGifs($('uc-gif-search')?.value || '');
      }, 280);
    });
    $('uc-gif-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeGifPicker();
      }
    });
    const onGifTileActivate = (tile) => {
      if (!tile) return;
      const box = $('uc-gif-results');
      const idx = Number(tile.getAttribute('data-gif-idx'));
      const gif = box?._gifItems?.[idx];
      if (!gif) return;
      tile.classList.add('is-selected');
      stageGifInCompose(gif);
      // Selection flash; draft lives in compose until Send or Remove.
      requestAnimationFrame(() => tile.classList.remove('is-selected'));
    };
    $('uc-gif-results')?.addEventListener('click', (ev) => {
      const tile = ev.target.closest('.uc-gif-tile');
      if (!tile) return;
      ev.preventDefault();
      onGifTileActivate(tile);
    });
    $('uc-gif-results')?.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const tile = ev.target.closest('.uc-gif-tile');
      if (!tile) return;
      ev.preventDefault();
      onGifTileActivate(tile);
    });
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
      if (gifPickerOpen) closeGifPicker();
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
      closeDrawerMoreMenu();
      if (state.profile) openAocAction(state.profile);
    });
    $('uc-aoc-remind-form')?.addEventListener('submit', submitAocRemind);
    $('uc-aoc-remind-cancel')?.addEventListener('click', closeAocRemindConfirm);
    $('uc-aoc-remind-close')?.addEventListener('click', closeAocRemindConfirm);
    $('uc-drawer-send-jv')?.addEventListener('click', () => {
      closeDrawerMoreMenu();
      if (state.profile) openSendJv(state.profile);
    });
    $('uc-drawer-amendment')?.addEventListener('click', () => {
      closeDrawerMoreMenu();
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
    bindProfileTabs();
    $('uc-profile-primary')?.addEventListener('click', () => {
      runProfilePrimaryAction();
    });
    document.addEventListener('keydown', handleProfileFocusTrap);
    $('uc-drawer-close')?.addEventListener('click', closeProfile);
    $('uc-drawer-backdrop')?.addEventListener('click', closeProfile);
    $('uc-drawer')?.addEventListener('click', (ev) => {
      const summary = ev.target.closest('.uc-panel > .uc-panel-summary');
      if (!summary || !ev.currentTarget.contains(summary)) return;
      // Nested controls inside the header handle themselves.
      if (ev.target.closest('a, input, select, textarea, label') && ev.target !== summary) return;
      if (ev.target.closest('#uc-sms-pulse') || ev.target.closest('.uc-comm-channels')) return;
      ev.preventDefault();
      const panel = summary.closest('.uc-panel');
      // Top-level panels inside tabpanels are always open — tabs replaced accordion as primary IA.
      // Comms channels use showCommChannel (no nested accordion).
      if (
        panel?.parentElement?.classList?.contains('uc-profile-tabpanel')
        || panel?.classList?.contains('uc-comm-channel-pane')
      ) {
        setPanelOpen(panel, true);
        return;
      }
      togglePanel(panel);
    });
    $('uc-sms-send')?.addEventListener('click', () => { sendSms(); });
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
      if (ev.target.closest('a[download]') || ev.target.closest('[data-media-action="remove"]')) {
        const btn = ev.target.closest('[data-media-action="remove"]');
        if (btn) {
          const card = btn.closest('[data-media-id]');
          const id = card?.getAttribute('data-media-id');
          if (id) removeSavedMedia(id).catch((e) => showToast(e.message || 'Remove failed'));
        }
        return;
      }
      const card = ev.target.closest('.uc-media-card[data-media-id]');
      if (!card) return;
      ev.preventDefault();
      const id = card.getAttribute('data-media-id');
      const media = state.profile?.sellerMedia || [];
      openMediaLightbox(media, id);
    });
    $('uc-sms-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendSms();
      }
    });
    $('uc-docs-send-doc')?.addEventListener('click', () => { openDocsSendTypeModal(); });
    $('uc-docs-send-type-continue')?.addEventListener('click', () => { continueDocsSendType(); });
    $('uc-docs-send-type-dialog')?.addEventListener('click', (ev) => {
      // Click backdrop (dialog itself) cancels
      if (ev.target === $('uc-docs-send-type-dialog')) {
        $('uc-docs-send-type-dialog').close?.();
      }
    });
    $('uc-docs-pending-list')?.addEventListener('click', onDocsDeskClick);
    $('uc-docs-signed-list')?.addEventListener('click', onDocsDeskClick);
    $('uc-doc-view-close')?.addEventListener('click', closeDocViewerModal);
    $('uc-doc-view-dialog')?.addEventListener('click', (ev) => {
      if (ev.target === $('uc-doc-view-dialog')) closeDocViewerModal();
    });
    $('uc-doc-view-dialog')?.addEventListener('close', () => {
      const frame = $('uc-doc-view-frame');
      if (frame) frame.removeAttribute('src');
    });
    $('uc-lightbox-close')?.addEventListener('click', closePhotoLightbox);
    $('uc-lightbox-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      stepLightbox(-1);
    });
    $('uc-lightbox-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      stepLightbox(1);
    });
    $('uc-lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'uc-lightbox' || e.target.classList.contains('uc-lightbox-stage')) {
        closePhotoLightbox();
      }
    });
    $('uc-drawer-hero')?.addEventListener('click', (ev) => {
      const tf = ev.target.closest('[data-action="buyer-fit"], [data-action="trust-fund"]');
      if (tf && state.activeDealId) {
        ev.preventDefault();
        window.location.href = `/buyers?deal=${encodeURIComponent(state.activeDealId)}`;
        return;
      }
      const zoom = ev.target.closest('[data-action="zoom-photo"]');
      if (!zoom || !state.profile) return;
      ev.preventDefault();
      const url = photoUrl(state.profile);
      if (url) openPhotoLightbox(url, state.profile.address || 'Property');
    });
    document.addEventListener('keydown', (e) => {
      if ($('uc-lightbox') && !$('uc-lightbox').hidden) {
        if (e.key === 'Escape') {
          closePhotoLightbox();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stepLightbox(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          stepLightbox(1);
          return;
        }
      }
      if (e.key !== 'Escape') return;
      if (!state.activeDealId) return;
      if ($('uc-release-dialog')?.open) return;
      if ($('uc-buyer-dialog')?.open) return;
      if ($('uc-jv-dialog')?.open) return;
      if ($('uc-amendment-dialog')?.open) return;
      if ($('uc-edit-dialog')?.open) return;
      if ($('uc-funded-dialog')?.open) return;
      if ($('uc-aoc-remind-dialog')?.open) return;
      if ($('uc-psa-dialog')?.open) return;
      if ($('uc-rehab-view-dialog')?.open) return;
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

    function handleDealBoardClick(ev) {
      const btn = ev.target.closest('[data-action]');
      const row = ev.target.closest('[data-deal-id]');
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
      if (
        (action === 'open' || !btn)
        && isWaitingForSignatures(deal)
        && !canOpenWaitingDeal()
      ) {
        ev.preventDefault();
        ev.stopPropagation();
        showToast('Waiting for Signatures is admin-only — shown on your tracker only');
        return;
      }
      if (action === 'open') openProfile(dealId);
      if (action === 'open-seller-sms') {
        ev.preventDefault();
        ev.stopPropagation();
        openProfile(dealId, { scrollToSms: true });
        return;
      }
      if (action === 'trust-fund' || action === 'buyer-fit') {
        ev.preventDefault();
        ev.stopPropagation();
        const flag = deal && (deal.buyerMatch || deal.trustFundMatch);
        const href = (flag && flag.href) || `/buyers?deal=${encodeURIComponent(dealId)}`;
        window.location.href = href;
        return;
      }
      if (action === 'edit') openEdit(deal);
      if (action === 'buyer-found' || action === 'send-jv' || action === 'amendment') {
        if (isWaitingForSignatures(deal)) {
          showToast('Wait for the PSA to be signed before sending AOC, JV, or Amendments');
          return;
        }
      }
      if (action === 'buyer-found') openAocAction(deal);
      if (action === 'send-jv') openSendJv(deal);
      if (action === 'amendment') openAmendment(deal);
      if (action === 'view-rehab') openRehabView(deal);
      if (action === 'view-funded') openFundedView(deal);
      if (action === 'release' && isAdmin()) releaseDeal(deal.dealId, deal.address);
    }

    $('uc-tbody')?.addEventListener('click', handleDealBoardClick);
    $('uc-cards')?.addEventListener('click', handleDealBoardClick);
    $('uc-waiting-tbody')?.addEventListener('click', handleDealBoardClick);
    $('uc-waiting-cards')?.addEventListener('click', handleDealBoardClick);
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
