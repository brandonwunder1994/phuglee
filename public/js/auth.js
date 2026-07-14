(function () {
  'use strict';

  var STORAGE_USERS = 'phuglee_users';
  var STORAGE_REMEMBER = 'phuglee_remembered_username';
  var SESSION_KEY = 'phuglee_session';

  var PLANS = {
    lite: {
      id: 'lite',
      tier: 'Lite',
      amount: '$47',
      period: '/month',
      tagline: 'One city. Full pipeline.',
      featured: false,
      exclusive: false,
      vault: false,
      features: [
        'Pick <strong>1 city</strong> to run yourself',
        'PDF filler, request tracker &amp; analyzer tools',
        'Collect, scrub, and analyze on your schedule',
        'Perfect for testing a single market'
      ]
    },
    pro: {
      id: 'pro',
      tier: 'Pro',
      amount: '$97',
      period: '/month',
      tagline: 'Full access. Every city.',
      featured: true,
      exclusive: false,
      vault: false,
      features: [
        'Unlimited access to <strong data-coverage-city-count>500+</strong> cities nationwide',
        'Every tool in the Distress OS stack',
        'Run the full collect → scrub → analyze workflow anywhere',
        'Best value when you\'re serious about volume'
      ]
    },
    max: {
      id: 'max',
      tier: 'Max',
      amount: '$297',
      period: '/month',
      tagline: 'Skip DIY. Start dialing.',
      featured: false,
      exclusive: false,
      vault: true,
      features: [
        'Everything in <strong>Pro</strong>, plus <strong>The Vault</strong>',
        'Pre-scrubbed leads by city — we did the collect &amp; filter',
        'Filter markets and pull ranked seller-ready lists',
        'Get straight to calling — save hours every week'
      ]
    },
    exclusivity: {
      id: 'exclusivity',
      tier: 'Exclusivity',
      amount: 'Custom',
      period: '',
      tagline: 'Own an entire city.',
      featured: false,
      exclusive: true,
      vault: false,
      features: [
        'City blackout — your market, your leads only',
        'Not self-serve — we vet every applicant',
        'Speak with our team to confirm you\'re the right fit',
        'Limited availability by market'
      ]
    }
  };

  var state = {
    activeView: 'login',
    selectedPlan: null,
    pendingUsername: null,
    returnUrl: '/command'
  };

  function readUsers() {
    try {
      var raw = localStorage.getItem(STORAGE_USERS);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }

  function toHex(buffer) {
    return Array.prototype.map
      .call(new Uint8Array(buffer), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  function fromHex(hex) {
    var out = new Uint8Array(Math.floor(String(hex || '').length / 2));
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function looksHashedPassword(stored) {
    return /^sha256\$[0-9a-f]+\$[0-9a-f]+$/i.test(String(stored || ''));
  }

  function hashPassword(password) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) {
      return Promise.reject(new Error('Web Crypto unavailable'));
    }
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var enc = new TextEncoder();
    var pwdBytes = enc.encode(String(password || ''));
    var combined = new Uint8Array(salt.length + pwdBytes.length);
    combined.set(salt, 0);
    combined.set(pwdBytes, salt.length);
    return subtle.digest('SHA-256', combined).then(function (digest) {
      return 'sha256$' + toHex(salt) + '$' + toHex(digest);
    });
  }

  function verifyPassword(password, stored) {
    var value = String(stored || '');
    if (!looksHashedPassword(value)) {
      return Promise.resolve(password === value);
    }
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve(false);
    var parts = value.split('$');
    var salt = fromHex(parts[1]);
    var expectedHex = parts[2].toLowerCase();
    var enc = new TextEncoder();
    var pwdBytes = enc.encode(String(password || ''));
    var combined = new Uint8Array(salt.length + pwdBytes.length);
    combined.set(salt, 0);
    combined.set(pwdBytes, salt.length);
    return subtle.digest('SHA-256', combined).then(function (digest) {
      return toHex(digest) === expectedHex;
    });
  }

  function migrateUserPasswordIfNeeded(username, password, stored) {
    if (looksHashedPassword(stored)) return Promise.resolve();
    return hashPassword(password).then(function (hashed) {
      try {
        var users = readUsers();
        var key = String(username || '').trim().toLowerCase();
        if (users[key]) {
          users[key].password = hashed;
          writeUsers(users);
        }
      } catch (_) {}
    });
  }

  function establishServerSession(username, plan, password) {
    if (window.__PHUGLEE_AUTH_DISABLED__) {
      return fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          plan: plan || '',
          password: password || ''
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('Session cookie failed');
        return res.json().catch(function () { return { ok: true }; });
      }).catch(function () {
        return { ok: true };
      });
    }
    return fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        plan: plan || '',
        password: password || ''
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || body.ok === false) {
          var err = new Error((body && body.error) || 'Sign-in failed');
          err.code = body && body.code;
          throw err;
        }
        return body;
      });
    });
  }

  function registerServerAccount(data) {
    return fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: data.username,
        password: data.password,
        plan: data.plan,
        email: data.email,
        fullName: data.fullName
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || body.ok === false) {
          var err = new Error((body && body.error) || 'Could not create account');
          err.code = body && body.code;
          throw err;
        }
        return body;
      });
    });
  }

  function clearServerSession() {
    return fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    }).catch(function () {});
  }

  var BOOTSTRAP_ADMIN = {
    username: 'admin',
    fullName: 'Administrator',
    email: 'admin@phuglee.com',
    plan: 'pro'
  };

  function seedAdmin() {
    /* Bootstrap admin is server-verified; keep a local placeholder without password. */
    try {
      var users = readUsers();
      var existing = users.admin || {};
      users.admin = {
        username: 'admin',
        password: existing.password || '',
        fullName: existing.fullName || BOOTSTRAP_ADMIN.fullName,
        email: existing.email || BOOTSTRAP_ADMIN.email,
        plan: existing.plan || BOOTSTRAP_ADMIN.plan,
        createdAt: existing.createdAt || Date.now()
      };
      writeUsers(users);
    } catch (_) {}
  }

  function isAuthenticated() {
    if (window.PhugleeSession && typeof window.PhugleeSession.isAuthenticated === 'function') {
      return window.PhugleeSession.isAuthenticated();
    }
    if (window.__PHUGLEE_AUTH_DISABLED__) return true;
    try {
      return !!sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return false;
    }
  }

  function getSessionUser() {
    if (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function') {
      return window.PhugleeSession.getSessionUser() || null;
    }
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return null;
    }
  }

  function setSession(username) {
    if (window.PhugleeSession && typeof window.PhugleeSession.establishSession === 'function') {
      return window.PhugleeSession.establishSession(username);
    }
    try {
      sessionStorage.setItem(SESSION_KEY, username);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSession() {
    if (window.PhugleeSession && typeof window.PhugleeSession.clearSession === 'function') {
      window.PhugleeSession.clearSession();
      return;
    }
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem('phuglee_logout', '1');
    } catch (_) {}
  }

  function getRememberedUsername() {
    try {
      return localStorage.getItem(STORAGE_REMEMBER) || '';
    } catch (_) {
      return '';
    }
  }

  function setRememberedUsername(username) {
    if (username) {
      localStorage.setItem(STORAGE_REMEMBER, username);
    } else {
      localStorage.removeItem(STORAGE_REMEMBER);
    }
  }

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/index.html' ? '/' : p;
  }

  function login(username, password) {
    var key = String(username || '').trim().toLowerCase();
    if (!key) {
      return Promise.resolve({ ok: false, error: 'Enter your username.' });
    }
    if (!password) {
      return Promise.resolve({ ok: false, error: 'Enter your password.' });
    }

    return establishServerSession(key, '', password)
      .then(function (body) {
        var sessionUser = (body && body.username) || key;
        var plan = (body && body.plan) || '';
        if (!setSession(sessionUser)) {
          return {
            ok: false,
            error: 'Could not save login session. Allow cookies/storage for this site and try again.'
          };
        }
        try {
          var users = readUsers();
          var existing = users[sessionUser] || {};
          users[sessionUser] = {
            username: sessionUser,
            password: existing.password || '',
            fullName: existing.fullName || (sessionUser === 'admin' ? BOOTSTRAP_ADMIN.fullName : ''),
            email: existing.email || (sessionUser === 'admin' ? BOOTSTRAP_ADMIN.email : ''),
            plan: plan || existing.plan || (sessionUser === 'admin' ? BOOTSTRAP_ADMIN.plan : 'lite'),
            createdAt: existing.createdAt || Date.now()
          };
          writeUsers(users);
          if (sessionUser === 'admin') seedAdmin();
        } catch (_) {}
        return {
          ok: true,
          user: {
            username: sessionUser,
            plan: plan || (readUsers()[sessionUser] || {}).plan || '',
            fullName: (readUsers()[sessionUser] || {}).fullName || '',
            email: (readUsers()[sessionUser] || {}).email || ''
          }
        };
      })
      .catch(function (err) {
        return {
          ok: false,
          error: (err && err.message) || 'Invalid username or password.'
        };
      });
  }

  function signup(data) {
    var username = (data.username || '').trim().toLowerCase();
    var email = (data.email || '').trim().toLowerCase();
    var fullName = (data.fullName || '').trim();
    var password = data.password || '';
    var confirm = data.confirmPassword || '';
    var plan = data.plan;

    if (!fullName) return Promise.resolve({ ok: false, error: 'Full name is required.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Promise.resolve({ ok: false, error: 'Enter a valid contact address.' });
    }
    if (!username || username.length < 3) {
      return Promise.resolve({ ok: false, error: 'Username must be at least 3 characters.' });
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return Promise.resolve({
        ok: false,
        error: 'Username can only contain letters, numbers, and underscores.'
      });
    }
    if (!password || password.length < 6) {
      return Promise.resolve({ ok: false, error: 'Password must be at least 6 characters.' });
    }
    if (password !== confirm) {
      return Promise.resolve({ ok: false, error: 'Passwords do not match.' });
    }
    if (!plan || !PLANS[plan]) {
      return Promise.resolve({ ok: false, error: 'Select a plan to continue.' });
    }

    return registerServerAccount({
      username: username,
      password: password,
      plan: plan,
      email: email,
      fullName: fullName
    })
      .then(function (body) {
        var sessionUser = (body && body.username) || username;
        var sessionPlan = (body && body.plan) || plan;
        return hashPassword(password)
          .catch(function () { return ''; })
          .then(function (storedPassword) {
            try {
              var users = readUsers();
              users[sessionUser] = {
                username: sessionUser,
                password: storedPassword || '',
                fullName: fullName,
                email: email,
                plan: sessionPlan,
                createdAt: Date.now()
              };
              writeUsers(users);
            } catch (_) {}
            if (!setSession(sessionUser)) {
              return {
                ok: false,
                error: 'Account created but session could not be saved. Sign in manually.'
              };
            }
            return {
              ok: true,
              username: sessionUser,
              plan: sessionPlan,
              autoLogin: true
            };
          });
      })
      .catch(function (err) {
        return {
          ok: false,
          error: (err && err.message) || 'Could not create account. Try again.'
        };
      });
  }

  function buildPricingCards() {
    return Object.keys(PLANS).map(function (key) {
      var plan = PLANS[key];
      var classes = ['auth-pricing-card'];
      if (plan.featured) classes.push('auth-pricing-featured', 'phuglee-panel-featured');
      if (plan.exclusive) classes.push('auth-pricing-exclusive', 'phuglee-panel-exclusive');
      if (plan.vault) classes.push('auth-pricing-vault', 'phuglee-panel-vault');

      var priceHtml = plan.period
        ? '<span class="auth-pricing-amount">' + plan.amount + '</span><span class="auth-pricing-period">' + plan.period + '</span>'
        : '<span class="auth-pricing-amount">' + plan.amount + '</span>';

      var features = plan.features.map(function (f) {
        return '<li>' + f + '</li>';
      }).join('');

      return (
        '<button type="button" class="' + classes.join(' ') + '" data-plan="' + plan.id + '" aria-pressed="false">' +
          '<span class="auth-pricing-tier">' + plan.tier + '</span>' +
          '<div class="auth-pricing-price">' + priceHtml + '</div>' +
          '<p class="auth-pricing-tagline">' + plan.tagline + '</p>' +
          '<ul class="auth-pricing-features">' + features + '</ul>' +
          '<span class="auth-pricing-select">Select plan</span>' +
        '</button>'
      );
    }).join('');
  }

  function buildModal() {
    return (
      '<div class="auth-overlay" id="auth-overlay" hidden aria-hidden="true">' +
        '<div class="auth-backdrop" data-auth-close></div>' +
        '<div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-login-title">' +
          '<div class="auth-modal-grain" aria-hidden="true"></div>' +
          '<button type="button" class="auth-close" data-auth-close aria-label="Close">&times;</button>' +
          '<div class="auth-panel phuglee-panel" id="auth-panel">' +
            '<header class="auth-brand-strip">' +
              '<img src="/images/phuglee-text-logo.svg" alt="Phuglee" class="auth-brand-logo" width="120" height="26" decoding="async">' +
              '<p class="auth-brand-kicker">Enter the platform</p>' +
            '</header>' +
            '<nav class="auth-tabs" role="tablist" aria-label="Account">' +
              '<button type="button" class="auth-tab is-active" role="tab" id="auth-tab-login" aria-selected="true" aria-controls="auth-view-login" data-auth-view="login">Sign In</button>' +
              '<button type="button" class="auth-tab" role="tab" id="auth-tab-signup" aria-selected="false" aria-controls="auth-view-tiers" data-auth-view="tiers">Sign Up</button>' +
            '</nav>' +
            '<div class="auth-views">' +
              '<section class="auth-view is-active" id="auth-view-login" role="tabpanel" aria-labelledby="auth-tab-login" data-auth-view="login">' +
                '<div class="auth-face-header auth-face-header--compact">' +
                  '<h2 id="auth-login-title" class="auth-title">Welcome back</h2>' +
                  '<p class="auth-subtitle">Sign in to run the full collect → filter → analyze pipeline.</p>' +
                '</div>' +
                '<form class="auth-form" id="auth-login-form" novalidate>' +
                  '<div class="auth-field">' +
                    '<label for="auth-login-username">Username</label>' +
                    '<input type="text" id="auth-login-username" name="username" autocomplete="username" required>' +
                  '</div>' +
                  '<div class="auth-field">' +
                    '<label for="auth-login-password">Password</label>' +
                    '<input type="password" id="auth-login-password" name="password" autocomplete="current-password" required>' +
                  '</div>' +
                  '<label class="auth-checkbox">' +
                    '<input type="checkbox" id="auth-remember" name="remember">' +
                    '<span class="auth-checkbox-box" aria-hidden="true"></span>' +
                    '<span>Remember my username</span>' +
                  '</label>' +
                  '<p class="auth-error" id="auth-login-error" role="alert" hidden></p>' +
                  '<button type="submit" class="auth-btn auth-btn-primary phuglee-btn phuglee-btn-primary">' +
                    '<span>Sign In</span>' +
                  '</button>' +
                '</form>' +
              '</section>' +
              '<section class="auth-view" id="auth-view-tiers" role="tabpanel" aria-labelledby="auth-tab-signup" data-auth-view="tiers" hidden>' +
                '<div class="auth-face-header auth-face-header--compact">' +
                  '<h2 class="auth-title">Pick your territory</h2>' +
                  '<p class="auth-subtitle">Same tools, same pipeline — choose how much ground you want to cover.</p>' +
                '</div>' +
                '<div class="auth-pricing-grid">' + buildPricingCards() + '</div>' +
                '<p class="auth-pricing-note">Exclusivity is vetted manually — our team reviews every request to protect lead quality.</p>' +
              '</section>' +
              '<section class="auth-view" id="auth-view-signup" role="tabpanel" data-auth-view="signup" hidden>' +
                '<button type="button" class="auth-back-link" id="auth-back-to-tiers">&larr; Back to plans</button>' +
                '<div class="auth-face-header auth-face-header--compact">' +
                  '<p class="auth-eyebrow" id="auth-selected-plan-label">Pro plan</p>' +
                  '<h2 class="auth-title">Create your account</h2>' +
                  '<p class="auth-subtitle">You\'re one step from sourcing leads at the clerk.</p>' +
                '</div>' +
                '<form class="auth-form" id="auth-signup-form" novalidate>' +
                  '<div class="auth-field">' +
                    '<label for="auth-signup-name">Full name</label>' +
                    '<input type="text" id="auth-signup-name" name="fullName" autocomplete="name" required>' +
                  '</div>' +
                  '<div class="auth-field">' +
                    '<label for="auth-signup-email">Contact</label>' +
                    '<input type="email" id="auth-signup-email" name="email" autocomplete="email" required>' +
                  '</div>' +
                  '<div class="auth-field">' +
                    '<label for="auth-signup-username">Username</label>' +
                    '<input type="text" id="auth-signup-username" name="username" autocomplete="username" required>' +
                  '</div>' +
                  '<div class="auth-field-row">' +
                    '<div class="auth-field">' +
                      '<label for="auth-signup-password">Password</label>' +
                      '<input type="password" id="auth-signup-password" name="password" autocomplete="new-password" required>' +
                    '</div>' +
                    '<div class="auth-field">' +
                      '<label for="auth-signup-confirm">Confirm password</label>' +
                      '<input type="password" id="auth-signup-confirm" name="confirmPassword" autocomplete="new-password" required>' +
                    '</div>' +
                  '</div>' +
                  '<p class="auth-error" id="auth-signup-error" role="alert" hidden></p>' +
                  '<button type="submit" class="auth-btn auth-btn-primary phuglee-btn phuglee-btn-primary">' +
                    '<span>Create Account</span>' +
                  '</button>' +
                '</form>' +
              '</section>' +
            '</div>' +
            '<footer class="auth-trust">Public records only · Your data stays on your machine</footer>' +
            '<div class="auth-success-overlay" id="auth-success" hidden>' +
              '<div class="auth-success-icon" aria-hidden="true">&#10003;</div>' +
              '<h3 class="auth-success-title">You\'re in.</h3>' +
              '<p class="auth-success-text">Account created — signing you in now.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function showError(el, msg) {
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function showView(view) {
    state.activeView = view;

    var modal = $('.auth-modal');
    if (modal) {
      modal.classList.toggle('auth-modal--wide', view === 'tiers');
    }

    document.querySelectorAll('.auth-view').forEach(function (el) {
      var isActive = el.getAttribute('data-auth-view') === view;
      el.classList.toggle('is-active', isActive);
      el.hidden = !isActive;
    });

    var loginTab = $('#auth-tab-login');
    var signupTab = $('#auth-tab-signup');
    if (loginTab && signupTab) {
      var signupActive = view === 'tiers' || view === 'signup';
      loginTab.classList.toggle('is-active', view === 'login');
      loginTab.setAttribute('aria-selected', view === 'login' ? 'true' : 'false');
      signupTab.classList.toggle('is-active', signupActive);
      signupTab.setAttribute('aria-selected', signupActive ? 'true' : 'false');
    }

    if (view === 'login') {
      var usernameInput = $('#auth-login-username');
      if (usernameInput) {
        setTimeout(function () { usernameInput.focus(); }, 200);
      }
    }
  }

  function resetModalState() {
    state.selectedPlan = null;
    state.activeView = 'login';
    document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
      btn.classList.remove('is-selected');
      btn.setAttribute('aria-pressed', 'false');
    });
    var signupForm = $('#auth-signup-form');
    if (signupForm) signupForm.reset();
    showError($('#auth-login-error'), '');
    showError($('#auth-signup-error'), '');
    var success = $('#auth-success');
    if (success) success.hidden = true;
    showView('login');
  }

  function returnLabel(url) {
    try {
      var path = (String(url || '').split('?')[0].split('#')[0] || '').replace(/\/+$/, '') || '/';
      if (path === '/filter' || path === '/bridge') return 'Filter';
      if (path === '/collect') return 'Collect';
      if (path === '/command') return 'Dashboard';
      if (path.indexOf('/analyzer') === 0) return 'Analyze';
      if (path.indexOf('/forge') === 0) return 'City Tracker';
      if (path === '/vault') return 'The Vault';
      return path;
    } catch (_) {
      return '';
    }
  }

  function applyReturnCopy() {
    var subtitle = $('#auth-view-login .auth-subtitle');
    if (!subtitle) return;
    var label = returnLabel(state.returnUrl);
    if (state.returnUrl && label === 'Dashboard') {
      subtitle.textContent = 'Sign in to open your dashboard.';
    } else if (state.returnUrl && label) {
      subtitle.textContent = 'Sign in to continue to ' + label + '.';
    } else {
      subtitle.textContent = 'Sign in to run the full collect → filter → analyze pipeline.';
    }
  }

  function openModal(preferredView) {
    if (window.PhugleeGuide && typeof window.PhugleeGuide.close === 'function') {
      window.PhugleeGuide.close();
    }
    var overlay = $('#auth-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');
    applyReturnCopy();

    if (preferredView === 'tiers' || preferredView === 'signup') {
      if (preferredView === 'tiers') {
        state.selectedPlan = null;
        document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
          btn.classList.remove('is-selected');
          btn.setAttribute('aria-pressed', 'false');
        });
      }
      showView(preferredView === 'signup' && state.selectedPlan ? 'signup' : 'tiers');
    } else {
      resetModalState();
      applyReturnCopy();
    }
  }

  function openSignup() {
    openModal('tiers');
  }

  function closeModal() {
    var overlay = $('#auth-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('auth-modal-open');
    setTimeout(resetModalState, 280);
  }

  function selectPlan(planId) {
    state.selectedPlan = planId;
    var plan = PLANS[planId];
    var label = $('#auth-selected-plan-label');
    if (label && plan) {
      label.textContent = plan.tier + ' plan';
    }
    document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
      var selected = btn.getAttribute('data-plan') === planId;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    showView('signup');
    var nameInput = $('#auth-signup-name');
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 200);
  }

  function resetSignupTiers() {
    state.selectedPlan = null;
    document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
      btn.classList.remove('is-selected');
      btn.setAttribute('aria-pressed', 'false');
    });
    var form = $('#auth-signup-form');
    if (form) form.reset();
    showError($('#auth-signup-error'), '');
    showView('tiers');
  }

  function prefillLoginUsername(username) {
    var input = $('#auth-login-username');
    var remember = $('#auth-remember');
    if (input && username) {
      input.value = username;
    }
    if (remember) {
      remember.checked = !!username;
    }
  }

  function resolvePostLoginDest() {
    var user = '';
    try {
      user = sessionStorage.getItem(SESSION_KEY) || '';
    } catch (_) {}
    var dest = state.returnUrl || (user === 'brad' ? '/vault' : '/command');
    try {
      var path = (dest.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
      if (path === '/' || path === '/index.html' || path === '/heat') {
        return user === 'brad' ? '/vault' : '/command';
      }
      if (user === 'brad' && path !== '/vault' && path !== '/under-contract') {
        return '/vault';
      }
      return dest;
    } catch (_) {
      return user === 'brad' ? '/vault' : '/command';
    }
  }

  function handleLoginSuccess(username) {
    closeModal();
    window.location.href = resolvePostLoginDest();
  }

  function setAuthBusy(form, busy) {
    if (!form) return;
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = !!busy;
  }

  function handleSignupSuccess(username) {
    state.pendingUsername = username;
    var success = $('#auth-success');
    if (success) success.hidden = false;
    setRememberedUsername(username);
    setTimeout(function () {
      if (success) success.hidden = true;
      state.pendingUsername = null;
      handleLoginSuccess(username);
    }, 900);
  }

  function bindEvents() {
    var overlay = $('#auth-overlay');
    if (!overlay) return;

    overlay.querySelectorAll('[data-auth-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    document.querySelectorAll('.auth-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var view = tab.getAttribute('data-auth-view');
        if (view === 'login') {
          showError($('#auth-signup-error'), '');
          showView('login');
        } else if (view === 'tiers') {
          resetSignupTiers();
        }
      });
    });

    var backToTiers = $('#auth-back-to-tiers');
    if (backToTiers) {
      backToTiers.addEventListener('click', function () {
        state.selectedPlan = null;
        document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
          btn.classList.remove('is-selected');
          btn.setAttribute('aria-pressed', 'false');
        });
        showError($('#auth-signup-error'), '');
        showView('tiers');
      });
    }

    document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectPlan(btn.getAttribute('data-plan'));
      });
    });

    var loginForm = $('#auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        showError($('#auth-login-error'), '');

        var username = ($('#auth-login-username') || {}).value || '';
        var password = ($('#auth-login-password') || {}).value || '';
        var remember = ($('#auth-remember') || {}).checked;

        if (!username.trim()) {
          showError($('#auth-login-error'), 'Enter your username.');
          return;
        }
        if (!password) {
          showError($('#auth-login-error'), 'Enter your password.');
          return;
        }

        var lookupKey = username.trim().toLowerCase();
        var users = readUsers();
        var resolvedUsername = users[lookupKey] ? lookupKey : null;

        if (!resolvedUsername) {
          var byEmail = Object.keys(users).find(function (k) {
            return users[k].email === lookupKey;
          });
          if (byEmail) resolvedUsername = byEmail;
        }

        setAuthBusy(loginForm, true);
        Promise.resolve(login(resolvedUsername || lookupKey, password))
          .then(function (result) {
            if (!result.ok) {
              showError($('#auth-login-error'), result.error);
              return;
            }

            if (remember) {
              setRememberedUsername(result.user.username);
            } else {
              setRememberedUsername('');
            }

            handleLoginSuccess(result.user.username);
          })
          .catch(function () {
            showError($('#auth-login-error'), 'Sign-in failed. Try again.');
          })
          .finally(function () {
            setAuthBusy(loginForm, false);
          });
      });
    }

    var signupForm = $('#auth-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', function (e) {
        e.preventDefault();
        showError($('#auth-signup-error'), '');

        setAuthBusy(signupForm, true);
        Promise.resolve(
          signup({
            fullName: ($('#auth-signup-name') || {}).value,
            email: ($('#auth-signup-email') || {}).value,
            username: ($('#auth-signup-username') || {}).value,
            password: ($('#auth-signup-password') || {}).value,
            confirmPassword: ($('#auth-signup-confirm') || {}).value,
            plan: state.selectedPlan
          })
        )
          .then(function (result) {
            if (!result.ok) {
              showError($('#auth-signup-error'), result.error);
              return;
            }
            handleSignupSuccess(result.username);
          })
          .catch(function () {
            showError($('#auth-signup-error'), 'Could not create account. Try again.');
          })
          .finally(function () {
            setAuthBusy(signupForm, false);
          });
      });
    }
  }

  function initHomepage() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('return')) {
      state.returnUrl = params.get('return');
    }

    var signedOut = params.get('signed_out') === '1';
    var wantsLogin = params.get('login') === '1';

    if (signedOut) {
      clearServerSession();
      clearSession();
      updateHomeAuthChrome(false);
      updateHomePrimaryCta(false);
    } else if (isAuthenticated()) {
      updateHomeAuthChrome(true);
      updateHomePrimaryCta(true);
    } else {
      updateHomeAuthChrome(false);
      updateHomePrimaryCta(false);
    }

    var mount = document.createElement('div');
    mount.innerHTML = buildModal();
    var overlay = mount.firstElementChild;
    document.body.appendChild(overlay);

    bindEvents();

    var remembered = getRememberedUsername();
    if (remembered) {
      prefillLoginUsername(remembered);
      var rememberCb = $('#auth-remember');
      if (rememberCb) rememberCb.checked = true;
    }

    function bindEnterPlatform(btn) {
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (isAuthenticated()) {
          window.location.href = '/command';
        } else {
          openModal();
        }
      });
    }

    bindEnterPlatform(document.getElementById('btn-heat'));
    bindEnterPlatform(document.getElementById('btn-heat-footer'));

    var signInBtn = document.getElementById('btn-sign-in');
    if (signInBtn) {
      signInBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    }

    var signOutBtn = document.getElementById('btn-sign-out');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.PhugleeAuth.logout();
      });
    }

    var wantsSignup =
      params.get('auth') === 'signup' ||
      params.get('signup') === '1' ||
      params.get('auth') === 'tiers';

    if ((wantsLogin || signedOut || wantsSignup) && !isAuthenticated()) {
      openModal(wantsSignup ? 'tiers' : undefined);
      var cleanUrl = '/';
      if (params.get('return')) {
        cleanUrl = '/?return=' + encodeURIComponent(params.get('return'));
      }
      history.replaceState(null, '', cleanUrl);
    }
  }

  seedAdmin();

  function updateHomeAuthChrome(loggedIn) {
    var signInBtn = document.getElementById('btn-sign-in');
    var signOutBtn = document.getElementById('btn-sign-out');
    if (signInBtn) signInBtn.hidden = !!loggedIn;
    if (signOutBtn) signOutBtn.hidden = !loggedIn;
  }

  function updateHomePrimaryCta(loggedIn) {
    var labels = loggedIn ? 'Open Dashboard' : 'Enter the Platform';
    ['btn-heat', 'btn-heat-footer'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.textContent = labels;
    });
  }

  window.PhugleeAuth = {
    isAuthenticated: isAuthenticated,
    getSessionUser: getSessionUser,
    logout: function () {
      clearServerSession().finally(function () {
        if (window.PhugleeSession && typeof window.PhugleeSession.signOut === 'function') {
          window.PhugleeSession.signOut();
          return;
        }
        clearSession();
        window.location.replace(
          (window.PhugleeSession && window.PhugleeSession.SIGN_OUT_URL) || '/?signed_out=1&login=1'
        );
      });
    },
    openLogin: openModal,
    openSignup: openSignup,
    closeLogin: closeModal
  };

  if (normalizePath(window.location.pathname) === '/') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHomepage);
    } else {
      initHomepage();
    }
  }
})();