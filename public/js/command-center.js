(function () {
  'use strict';

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
    setKpiStatus('');
  }

  function loadDealKpis() {
    var ucEl = document.getElementById('command-uc-count');
    if (!ucEl) return Promise.resolve();

    return fetch('/api/leads/admin/contracts', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
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
        applyDealTotals(data.totals || {});
      })
      .catch(function () {
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
