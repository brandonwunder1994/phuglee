(function () {
  'use strict';

  var SESSION_KEY = 'phuglee_session';
  var USERS_KEY = 'phuglee_users';
  var ADMIN_USER = 'admin';
  var DISPOS_USER = 'brad';
  var VAULT_ONLY_USER = 'matt';

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

  function isDispos() {
    return getSessionUser() === DISPOS_USER;
  }

  function isVaultOnly() {
    return getSessionUser() === VAULT_ONLY_USER;
  }

  function isContractDesk() {
    return isAdmin() || isDispos();
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

  function contractDeskSectionHtml() {
    if (!isContractDesk() || isAdmin()) return '';
    return (
      '<div class="shell-settings-section">' +
        '<div class="shell-settings-section-label">Contract desk</div>' +
        '<a href="/under-contract" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">◇</span> Under Contract' +
        '</a>' +
        '<a href="/pipeline" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">▦</span> All Leads' +
        '</a>' +
      '</div>'
    );
  }

  function adminSectionHtml() {
    if (!isAdmin()) return '';
    var onAnalyzer = window.location.pathname.indexOf('/analyzer') === 0;
    var analyzerItems = onAnalyzer
      ? '<button type="button" class="shell-settings-item" data-analyzer-action="api-keys" role="menuitem">' +
          '<span class="shell-settings-item-icon">🔑</span> API Keys' +
        '</button>' +
        '<button type="button" class="shell-settings-item" data-analyzer-action="ai-brain" role="menuitem">' +
          '<span class="shell-settings-item-icon">🧠</span> AI Brain' +
        '</button>'
      : '';
    return (
      '<div class="shell-settings-section" data-admin-only>' +
        '<div class="shell-settings-section-label">Admin</div>' +
        analyzerItems +
        '<a href="/operating-costs" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">$</span> Operating Costs' +
        '</a>' +
        '<button type="button" class="shell-settings-item" id="shell-settings-payouts" role="menuitem">' +
          '<span class="shell-settings-item-icon">$</span> Payouts' +
        '</button>' +
        '<a href="/collect?open=pdf-filler" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">📄</span> PDF Filler' +
        '</a>' +
        '<a href="/forge/portal" class="shell-settings-item" role="menuitem">' +
          '<span class="shell-settings-item-icon">📋</span> Track Progress' +
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
          /* Industrial cog — 8 teeth + hub (not a sun/ray icon) */
          '<svg class="shell-settings-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="3.1"/>' +
            '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>' +
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
          contractDeskSectionHtml() +
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

  function ensurePayoutsDialog() {
    var existing = document.getElementById('shell-payouts-dialog');
    if (existing) return existing;
    var dialog = document.createElement('dialog');
    dialog.id = 'shell-payouts-dialog';
    dialog.className = 'uc-dialog shell-payouts-dialog';
    dialog.innerHTML =
      '<form method="dialog" id="shell-payouts-form" class="uc-edit-form">' +
        '<h3>Payouts</h3>' +
        '<p class="shell-payouts-help">Assignment fee (minus photo cost) splits between Acq and Dispo. Default is 50 / 50. TC is no longer charged.</p>' +
        '<label class="vault-field">' +
          '<span class="vault-field-label">Acq percent</span>' +
          '<input type="number" id="shell-payout-acq" class="phuglee-input" step="1" min="0" max="100" required>' +
        '</label>' +
        '<label class="vault-field">' +
          '<span class="vault-field-label">Dispo percent</span>' +
          '<input type="number" id="shell-payout-dispo" class="phuglee-input" step="1" min="0" max="100" required>' +
        '</label>' +
        '<p id="shell-payouts-error" class="shell-payouts-error" hidden></p>' +
        '<div class="uc-edit-actions">' +
          '<button type="submit" value="save" class="phuglee-btn phuglee-btn-primary">Save</button>' +
          '<button type="submit" value="cancel" class="phuglee-btn phuglee-btn-ghost">Cancel</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(dialog);

    var style = document.getElementById('shell-payouts-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'shell-payouts-style';
      style.textContent =
        '.shell-payouts-dialog{max-width:22rem;padding:1.1rem 1.2rem;border:1px solid rgba(255,255,255,.12);' +
        'border-radius:12px;background:#161616;color:inherit}' +
        '.shell-payouts-dialog::backdrop{background:rgba(0,0,0,.55)}' +
        '.shell-payouts-help{margin:0 0 .75rem;font-size:.82rem;opacity:.75;line-height:1.35}' +
        '.shell-payouts-error{margin:.35rem 0 0;color:#e08080;font-size:.82rem}' +
        '.shell-payouts-dialog .uc-edit-form{display:grid;gap:.65rem}' +
        '.shell-payouts-dialog .uc-edit-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.35rem}';
      document.head.appendChild(style);
    }

    dialog.querySelector('#shell-payouts-form').addEventListener('submit', function (ev) {
      var submitter = ev.submitter;
      if (submitter && submitter.value === 'cancel') {
        dialog.close();
        return;
      }
      ev.preventDefault();
      savePayouts(dialog);
    });
    return dialog;
  }

  function showPayoutsError(dialog, msg) {
    var el = dialog.querySelector('#shell-payouts-error');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function openPayoutsDialog() {
    if (!isAdmin()) return;
    var dialog = ensurePayoutsDialog();
    showPayoutsError(dialog, '');
    fetch('/api/leads/admin/contracts/payout-settings', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (out) {
        if (!out.res.ok) throw new Error((out.data && out.data.error) || 'Could not load payouts');
        var s = out.data.settings || {};
        dialog.querySelector('#shell-payout-acq').value = s.acqPercent != null ? s.acqPercent : 50;
        dialog.querySelector('#shell-payout-dispo').value = s.dispoPercent != null ? s.dispoPercent : 50;
        if (typeof dialog.showModal === 'function') dialog.showModal();
      })
      .catch(function (err) {
        showPayoutsError(dialog, err.message || 'Could not load payouts');
        if (typeof dialog.showModal === 'function') dialog.showModal();
      });
  }

  function savePayouts(dialog) {
    var acq = Number(dialog.querySelector('#shell-payout-acq').value);
    var dispo = Number(dialog.querySelector('#shell-payout-dispo').value);
    if (!Number.isFinite(acq) || !Number.isFinite(dispo) || acq < 0 || dispo < 0) {
      showPayoutsError(dialog, 'Enter valid Acq / Dispo percents');
      return;
    }
    if (Math.abs(acq + dispo - 100) > 0.05) {
      showPayoutsError(dialog, 'Acq + Dispo must equal 100%');
      return;
    }
    showPayoutsError(dialog, '');
    fetch('/api/leads/admin/contracts/payout-settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tcFee: 0, acqPercent: acq, dispoPercent: dispo })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (out) {
        if (!out.res.ok) throw new Error((out.data && out.data.error) || 'Save failed');
        dialog.close();
        window.dispatchEvent(new CustomEvent('phuglee-payouts-updated', { detail: out.data }));
      })
      .catch(function (err) {
        showPayoutsError(dialog, err.message || 'Save failed');
      });
  }

  function bind(root) {
    if (!root) return;
    if (root.dataset.settingsBound === '1') return;
    root.dataset.settingsBound = '1';

    var trigger = root.querySelector('#shell-settings-trigger');
    var signOut = root.querySelector('#shell-settings-signout');
    var payoutsBtn = root.querySelector('#shell-settings-payouts');

    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDropdown();
      });
    }

    if (payoutsBtn) {
      payoutsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
        openPayoutsDialog();
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

    root.querySelectorAll('[data-analyzer-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
        window.dispatchEvent(new CustomEvent('phuglee-analyzer-action', {
          detail: { action: btn.getAttribute('data-analyzer-action') }
        }));
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
    if (!slot) return;
    if (!isAuthenticated()) {
      // Session may still be hydrating from cookie — remount once ready.
      if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
        window.PhugleeSession.syncSessionFromServerCookie().then(function (data) {
          if (data && data.username) mount();
        });
      }
      return;
    }
    slot.innerHTML = buildDropdown();
    bind(slot);
  }

  window.PhugleeSettings = {
    mount: mount,
    buildDropdown: buildDropdown,
    isAdmin: isAdmin,
    isDispos: isDispos,
    isVaultOnly: isVaultOnly,
    isContractDesk: isContractDesk
  };
})();