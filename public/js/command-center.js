(function () {
  'use strict';

  var KPI_CACHE_KEY = 'phuglee_command_deal_kpis_v2';
  var KPI_CACHE_TTL_MS = 60 * 1000;
  var MONEY_GOAL_TARGET = 100000;

  var stateGoal = null;
  var goalTickTimer = null;

  function hideShellLoading() {
    if (window.PhugleeStates && typeof window.PhugleeStates.hideShellLoading === 'function') {
      window.PhugleeStates.hideShellLoading();
    } else {
      var strip = document.getElementById('shell-loading-strip');
      if (strip) strip.hidden = true;
      document.body.classList.remove('shell-nav-loading');
    }
  }

  function revealAdminTools() {
    function show() {
      var isAdmin = window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function'
        ? window.PhugleeSettings.isAdmin()
        : false;
      if (!isAdmin) {
        try { isAdmin = sessionStorage.getItem('phuglee_session') === 'admin'; } catch (_) {}
      }
      var isContractDesk = window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function'
        ? window.PhugleeSettings.isContractDesk()
        : isAdmin;
      if (!isContractDesk) {
        try {
          var user = sessionStorage.getItem('phuglee_session');
          isContractDesk = user === 'admin' || user === 'brad';
        } catch (_) {}
      }
      document.querySelectorAll('[data-admin-only]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        var showForDesk = isContractDesk && href.indexOf('/under-contract') >= 0;
        el.hidden = !(isAdmin || showForDesk);
      });
    }
    show();
    if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
      window.PhugleeSession.syncSessionFromServerCookie().then(show);
    }
  }

  function formatMoney(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      }).format(v);
    } catch (_) {
      return '$' + Math.round(v).toLocaleString('en-US');
    }
  }

  function formatCount(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US');
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setKpiStatus(message) {
    var status = document.getElementById('command-kpi-status');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      return;
    }
    status.hidden = false;
    status.textContent = message;
  }

  function readKpiCache() {
    try {
      var raw = sessionStorage.getItem(KPI_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.totals || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > KPI_CACHE_TTL_MS) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeKpiCache(totals, goal) {
    try {
      sessionStorage.setItem(
        KPI_CACHE_KEY,
        JSON.stringify({
          ts: Date.now(),
          totals: totals || {},
          goal: goal || null
        })
      );
    } catch (_) {}
  }

  function clearKpiCache() {
    try {
      sessionStorage.removeItem(KPI_CACHE_KEY);
    } catch (_) {}
  }

  function formatCountdown(msRemaining, expired) {
    if (expired || msRemaining <= 0) {
      return { value: '0', label: 'window ended' };
    }
    // Match Under Contract desk: ceil so a fresh 60-day window shows "60"
    var daysLeft = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    var totalSec = Math.max(0, Math.floor(msRemaining / 1000));
    var hours = Math.floor((totalSec % 86400) / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;
    if (msRemaining >= 2 * 86400000) {
      return { value: String(daysLeft), label: 'days left' };
    }
    if (msRemaining >= 86400000) {
      return {
        value: '1d ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0'),
        label: 'left'
      };
    }
    return {
      value:
        String(hours).padStart(2, '0') +
        ':' +
        String(mins).padStart(2, '0') +
        ':' +
        String(secs).padStart(2, '0'),
      label: 'left today'
    };
  }

  function formatGoalEndDate(iso) {
    var t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    return new Date(t).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function tickGoalCountdown() {
    var goal = stateGoal;
    if (!goal) return;
    var endsAt = Date.parse(goal.endsAt);
    var msRemaining = Number.isFinite(endsAt)
      ? Math.max(0, endsAt - Date.now())
      : Number(goal.msRemaining) || 0;
    var expired = Boolean(goal.expired) || msRemaining <= 0;
    var formatted = formatCountdown(msRemaining, expired);
    setText('command-goal-countdown', formatted.value);
    setText('command-goal-countdown-label', formatted.label);
    var endsEl = document.getElementById('command-goal-ends');
    if (endsEl) {
      var endLabel = formatGoalEndDate(goal.endsAt);
      endsEl.textContent = endLabel
        ? expired
          ? 'Ended ' + endLabel
          : 'Ends ' + endLabel
        : '';
    }
  }

  /**
   * Same 60-day / 10-funded window as Under Contract desk (API goal object).
   */
  function applyDealGoal(goal) {
    var panel = document.getElementById('command-deal-goal');
    if (!panel) return;
    var g = goal || {};
    stateGoal = g;
    var current = Number(g.currentCount) || 0;
    var target = Number(g.targetCount) || 10;
    var pct = Number.isFinite(Number(g.percentToGoal))
      ? Math.max(0, Math.min(100, Number(g.percentToGoal)))
      : Math.min(100, Math.round((current / Math.max(1, target)) * 100));
    var remaining = Number.isFinite(Number(g.remainingToGoal))
      ? Math.max(0, Number(g.remainingToGoal))
      : Math.max(0, target - current);
    var met = Boolean(g.met) || current >= target;

    setText('command-goal-current', String(current));
    setText('command-goal-target', String(target));
    setText(
      'command-goal-pct',
      met ? 'Goal hit' : remaining === 1 ? '1 to go' : remaining + ' to go'
    );

    var fill = document.getElementById('command-goal-bar-fill');
    var bar = document.getElementById('command-goal-bar');
    if (fill) {
      var widthPct = current > 0 ? Math.max(pct, 4) : 0;
      if (met) widthPct = 100;
      fill.style.width = widthPct + '%';
      fill.classList.toggle('is-active', current > 0 || met);
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute(
        'aria-valuetext',
        current + ' of ' + target + ' funded (' + pct + '%)'
      );
    }
    panel.classList.toggle('is-met', met);

    tickGoalCountdown();
    if (goalTickTimer) clearInterval(goalTickTimer);
    goalTickTimer = setInterval(tickGoalCountdown, 1000);
  }

  /** Lifetime Total Funded → $100k cash goal; $ tip rides the fill. */
  function applyMoneyGoal(fundedAmount) {
    var panel = document.getElementById('command-money-goal');
    if (!panel) return;
    var funded = Number(fundedAmount);
    if (!Number.isFinite(funded) || funded < 0) funded = 0;
    var pct = Math.min(100, Math.round((funded / MONEY_GOAL_TARGET) * 100));
    var met = funded >= MONEY_GOAL_TARGET;
    var remaining = Math.max(0, MONEY_GOAL_TARGET - funded);

    setText('command-money-current', formatMoney(funded));
    setText('command-money-target', '$100k');
    setText(
      'command-money-pct',
      met ? 'Goal hit' : pct + '% left'
    );
    var moneySub = document.getElementById('command-money-sub');
    if (moneySub) {
      moneySub.textContent = met ? '' : formatMoney(remaining) + ' to go';
      moneySub.setAttribute('aria-hidden', met || remaining <= 0 ? 'true' : 'false');
    }

    var fill = document.getElementById('command-money-bar-fill');
    var bar = document.getElementById('command-money-bar');
    if (fill) {
      var widthPct = funded > 0 ? Math.max(pct, 4) : 0;
      if (met) widthPct = 100;
      fill.style.width = widthPct + '%';
      fill.classList.toggle('is-active', funded > 0);
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute(
        'aria-valuetext',
        formatMoney(funded) + ' of $100,000 total funded (' + pct + '%)'
      );
    }
    panel.classList.toggle('is-met', met);
  }

  /**
   * Motivating pipeline strip from contracts totals (same source as Under Contract desk).
   * - under contract: open deals (under_contract + buyer_found)
   * - projected fundings: open assignment fees
   * - total funded: closed assignment fees from funded closings
   */
  function applyDealTotals(totals) {
    var t = totals || {};
    var by = t.byStage || {};
    var uc =
      t.openCount != null
        ? Number(t.openCount)
        : (Number(by.under_contract || t.underContract || 0) +
            Number(by.buyer_found || t.buyerFound || 0));
    var projected = t.openAssignmentFees;
    var funded = t.closedAssignmentFees != null ? t.closedAssignmentFees : t.totalAssignmentFees;

    setText('command-uc-count', formatCount(uc));
    setText('command-projected-funding', formatMoney(projected));
    setText('command-total-funded', formatMoney(funded));
    applyMoneyGoal(funded);
    setKpiStatus('');
  }

  function loadDealKpis() {
    var ucEl = document.getElementById('command-uc-count');
    if (!ucEl) return Promise.resolve();

    // Paint last-known KPIs immediately so the strip feels instant on revisit.
    var cached = readKpiCache();
    var paintedFromCache = false;
    if (cached && cached.totals) {
      applyDealTotals(cached.totals);
      if (cached.goal) applyDealGoal(cached.goal);
      paintedFromCache = true;
    } else if (cached) {
      // Legacy cache shape: plain totals object
      applyDealTotals(cached);
      paintedFromCache = true;
    }

    return fetch('/api/leads/admin/contracts', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          clearKpiCache();
          setText('command-uc-count', '—');
          setText('command-projected-funding', '—');
          setText('command-total-funded', '—');
          setKpiStatus('Sign in on the Contracts desk to see live pipeline numbers.');
          return null;
        }
        if (!res.ok) throw new Error('Contracts request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (!data.ok && !data.totals) throw new Error(data.error || 'No totals');
        var totals = data.totals || {};
        applyDealTotals(totals);
        if (data.goal) applyDealGoal(data.goal);
        writeKpiCache(totals, data.goal || null);
      })
      .catch(function () {
        // Keep cached numbers if we already painted them; only show error cold.
        if (paintedFromCache) return;
        setText('command-uc-count', '—');
        setText('command-projected-funding', '—');
        setText('command-total-funded', '—');
        setKpiStatus('Could not load contract stats — open Contracts and retry.');
      });
  }

  function init() {
    hideShellLoading();
    revealAdminTools();
    loadDealKpis();
    window.addEventListener('pageshow', function () {
      hideShellLoading();
      loadDealKpis();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
