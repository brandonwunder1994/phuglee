/**
 * Site-wide Contract Tracker team-message alert banner.
 * Shows a sticky red bar for admin/brad whenever unreadTeam has items.
 * Click → /under-contract?deal=<id>
 */
(function () {
  'use strict';

  const POLL_MS = 12000;
  let timer = null;
  let lastPayload = [];

  function isDeskUser() {
    try {
      if (window.DistressOSShellNav?.isContractDeskUser) {
        return window.DistressOSShellNav.isContractDeskUser() === true;
      }
      if (window.PhugleeSettings?.isContractDesk) {
        return window.PhugleeSettings.isContractDesk() === true;
      }
      const u = sessionStorage.getItem('phuglee_session') || '';
      return u === 'admin' || u === 'brad';
    } catch (_) {
      return false;
    }
  }

  function whoName(user) {
    if (user === 'brad') return 'Brad';
    if (user === 'admin') return 'Brandon';
    return user || 'Teammate';
  }

  function ensureEl() {
    let el = document.getElementById('shell-team-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'shell-team-banner';
    el.className = 'shell-team-banner';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<button type="button" class="shell-team-banner-btn" id="shell-team-banner-btn"><span id="shell-team-banner-text">New team message</span></button>';

    const afterNav = document.getElementById('distress-os-nav');
    const homeBar = document.querySelector('.home-topbar');
    if (afterNav && afterNav.parentNode) {
      afterNav.insertAdjacentElement('afterend', el);
    } else if (homeBar && homeBar.parentNode) {
      homeBar.insertAdjacentElement('afterend', el);
    } else {
      document.body.insertAdjacentElement('afterbegin', el);
    }

    el.querySelector('#shell-team-banner-btn')?.addEventListener('click', () => {
      const first = lastPayload[0];
      if (first?.dealId) {
        window.location.href = `/under-contract?deal=${encodeURIComponent(first.dealId)}`;
      } else {
        window.location.href = '/under-contract';
      }
    });
    return el;
  }

  function render(items) {
    lastPayload = Array.isArray(items) ? items : [];
    const el = ensureEl();
    const text = el.querySelector('#shell-team-banner-text');
    const ucLocal = document.getElementById('uc-team-banner');
    if (!lastPayload.length) {
      el.hidden = true;
      document.body.classList.remove('has-shell-team-banner');
      // Keep UC local banner free when global empty — UC may still manage it
      return;
    }
    el.hidden = false;
    document.body.classList.add('has-shell-team-banner');
    // Avoid double banners on Contract Tracker
    if (ucLocal) ucLocal.hidden = true;

    const first = lastPayload[0];
    const n = lastPayload.reduce((sum, it) => sum + (Number(it.count) || 1), 0);
    const who = whoName(first.fromUser);
    const addr = first.address || 'a deal';
    if (text) {
      text.textContent = n === 1
        ? `1 new team message — ${who} on ${addr}`
        : `${n} new team message(s) — e.g. ${who} on ${addr}`;
    }
  }

  async function refresh() {
    if (!isDeskUser()) {
      render([]);
      return;
    }
    try {
      const res = await fetch('/api/leads/admin/contracts/team-inbox', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) {
        if (res.status === 403) render([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      render(data.unreadTeam || []);
    } catch (_) { /* ignore network blips */ }
  }

  function start() {
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, POLL_MS);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
    // Remount after cookie session sync so brad/admin see the banner
    window.addEventListener('phuglee-session-ready', start);
    if (window.PhugleeSession?.syncSessionFromServerCookie) {
      window.PhugleeSession.syncSessionFromServerCookie().then(function (data) {
        if (data && data.username) start();
      });
    }
  }

  window.PhugleeTeamAlertBanner = { refresh, start, render };
  init();
})();
