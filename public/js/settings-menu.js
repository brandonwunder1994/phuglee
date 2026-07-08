(function () {
  'use strict';

  var SESSION_KEY = 'phuglee_session';
  var USERS_KEY = 'phuglee_users';
  var ADMIN_USER = 'admin';

  function sessionApi() {
    return window.PhugleeSession || null;
  }

  var PLANS = {
    lite: { label: 'Lite', price: '$47/mo' },
    pro: { label: 'Pro', price: '$97/mo' },
    max: { label: 'Max', price: '$297/mo' },
    exclusivity: { label: 'Exclusivity', price: 'Custom' }
  };

  function getSessionUser() {
    var api = sessionApi();
    if (api && typeof api.getSessionUser === 'function') {
      return api.getSessionUser() || null;
    }
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return null;
    }
  }

  function isAuthenticated() {
    var api = sessionApi();
    if (api && typeof api.isAuthenticated === 'function') {
      return api.isAuthenticated();
    }
    return !!getSessionUser();
  }

  function isAdmin() {
    return getSessionUser() === ADMIN_USER;
  }

  function readUserRecord() {
    var username = getSessionUser();
    if (!username) return null;
    try {
      var users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
      return users[username] || { username: username, plan: 'pro' };
    } catch (_) {
      return { username: username, plan: 'pro' };
    }
  }

  function billingHtml() {
    var user = readUserRecord();
    if (!user) return '';
    var plan = PLANS[user.plan] || PLANS.pro;
    return (
      '<div class="shell-billing-card">' +
        '<div class="shell-billing-tier">' + plan.label + ' Plan</div>' +
        '<div class="shell-billing-meta">' + plan.price + ' · ' + (user.fullName || user.username) + '</div>' +
      '</div>'
    );
  }

  function themeButtonsHtml() {
    var pref = window.PhugleeTheme ? window.PhugleeTheme.getTheme() : 'dark';
    return ['dark', 'light', 'system'].map(function (mode) {
      var active = pref === mode ? ' is-active' : '';
      var label = mode === 'system' ? 'Auto' : mode.charAt(0).toUpperCase() + mode.slice(1);
      return '<button type="button" class="shell-theme-btn' + active + '" data-theme-mode="' + mode + '">' + label + '</button>';
    }).join('');
  }

  function adminSectionHtml() {
    if (!isAdmin()) return '';
    return (
      '<div class="shell-settings-section" data-admin-only>' +
        '<div class="shell-settings-section-label">Admin</div>' +
        '<a href="/collect?open=pdf-filler" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">📄</span> PDF Filler' +
        '</a>' +
        '<a href="/forge/portal" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">📋</span> Request Tracker' +
        '</a>' +
        '<a href="/forge/portal/portal-errors" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">⚠</span> Portal Errors' +
        '</a>' +
      '</div>'
    );
  }

  function buildDropdown() {
    if (!isAuthenticated()) return '';
    return (
      '<div class="shell-settings" id="shell-settings">' +
        '<button type="button" class="shell-settings-trigger" id="shell-settings-trigger" aria-expanded="false" aria-haspopup="true" aria-label="Settings">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="3"/>' +
            '<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>' +
          '</svg>' +
        '</button>' +
        '<div class="shell-settings-dropdown" id="shell-settings-dropdown" role="menu" hidden>' +
          '<div class="shell-settings-section">' +
            '<div class="shell-settings-section-label">Billings</div>' +
            billingHtml() +
            '<a href="mailto:team@distressos.com?subject=Distress%20OS%20Billing" class="shell-settings-item" role="menuitem">' +
              '<span class="shell-settings-item-icon">↑</span> Upgrade plan' +
            '</a>' +
          '</div>' +
          '<div class="shell-settings-section">' +
            '<div class="shell-settings-section-label">Appearance</div>' +
            '<div class="shell-theme-toggle" role="group" aria-label="Theme">' + themeButtonsHtml() + '</div>' +
          '</div>' +
          adminSectionHtml() +
          '<div class="shell-settings-section">' +
            '<button type="button" class="shell-settings-item danger" id="shell-settings-signout" role="menuitem">' +
              '<span class="shell-settings-item-icon">⏻</span> Sign Out' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function closeDropdown() {
    var dropdown = document.getElementById('shell-settings-dropdown');
    var trigger = document.getElementById('shell-settings-trigger');
    if (!dropdown) return;
    dropdown.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openDropdown() {
    var dropdown = document.getElementById('shell-settings-dropdown');
    var trigger = document.getElementById('shell-settings-trigger');
    if (!dropdown) return;
    dropdown.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    refreshThemeButtons();
  }

  function toggleDropdown() {
    var dropdown = document.getElementById('shell-settings-dropdown');
    if (!dropdown) return;
    if (dropdown.hidden) openDropdown();
    else closeDropdown();
  }

  function refreshThemeButtons() {
    var pref = window.PhugleeTheme ? window.PhugleeTheme.getTheme() : 'dark';
    document.querySelectorAll('[data-theme-mode]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-mode') === pref);
    });
  }

  function bind(root) {
    if (!root) return;
    if (root.dataset.settingsBound === '1') return;
    root.dataset.settingsBound = '1';

    var trigger = root.querySelector('#shell-settings-trigger');
    var signOut = root.querySelector('#shell-settings-signout');

    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDropdown();
      });
    }

    if (signOut) {
      signOut.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
        if (window.PhugleeSession && typeof window.PhugleeSession.signOut === 'function') {
          window.PhugleeSession.signOut();
          return;
        }
        if (window.PhugleeAuth && typeof window.PhugleeAuth.logout === 'function') {
          window.PhugleeAuth.logout();
          return;
        }
        try {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.setItem('phuglee_logout', '1');
        } catch (_) {}
        window.location.replace(
          (window.PhugleeSession && window.PhugleeSession.SIGN_OUT_URL) || '/?signed_out=1&login=1'
        );
      });
    }

    root.querySelectorAll('[data-theme-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-theme-mode');
        if (window.PhugleeTheme) window.PhugleeTheme.setTheme(mode);
        refreshThemeButtons();
      });
    });

    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) closeDropdown();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDropdown();
    });

    window.addEventListener('phuglee-theme-change', refreshThemeButtons);
  }

  function mount() {
    var slot = document.getElementById('shell-settings-slot');
    if (!slot || !isAuthenticated()) return;
    slot.innerHTML = buildDropdown();
    bind(slot);
  }

  window.PhugleeSettings = { mount: mount, buildDropdown: buildDropdown, isAdmin: isAdmin };
})();