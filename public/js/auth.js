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
      features: [
        'Unlimited access to <strong>500+</strong> cities nationwide',
        'Every tool in the Distress OS stack',
        'Run the full collect → scrub → analyze workflow anywhere',
        'Best value when you\'re serious about volume'
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
      features: [
        'City blackout — your market, your leads only',
        'Not self-serve — we vet every applicant',
        'Speak with our team to confirm you\'re the right fit',
        'Limited availability by market'
      ]
    }
  };

  var state = {
    flipped: false,
    signupStep: 'tiers',
    selectedPlan: null,
    pendingUsername: null,
    returnUrl: '/heat'
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

  var BOOTSTRAP_ADMIN = {
    username: 'admin',
    password: 'wunderhaus',
    fullName: 'Administrator',
    email: 'admin@phuglee.com',
    plan: 'pro'
  };

  function seedAdmin() {
    try {
      var users = readUsers();
      var existing = users.admin || {};
      users.admin = {
        username: 'admin',
        password: 'wunderhaus',
        fullName: existing.fullName || BOOTSTRAP_ADMIN.fullName,
        email: existing.email || BOOTSTRAP_ADMIN.email,
        plan: existing.plan || BOOTSTRAP_ADMIN.plan,
        createdAt: existing.createdAt || Date.now()
      };
      writeUsers(users);
    } catch (_) {
      /* localStorage blocked — login() still accepts bootstrap admin */
    }
  }

  function isBootstrapAdmin(username, password) {
    var key = (username || '').trim().toLowerCase();
    return (key === 'admin' || key === 'admin@phuglee.com') && password === 'wunderhaus';
  }

  function isAuthenticated() {
    try {
      return !!sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return false;
    }
  }

  function getSessionUser() {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return null;
    }
  }

  function setSession(username) {
    try {
      sessionStorage.setItem(SESSION_KEY, username);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
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
    var key = username.trim().toLowerCase();

    if (isBootstrapAdmin(username, password)) {
      if (!setSession('admin')) {
        return { ok: false, error: 'Could not save login session. Allow cookies/storage for this site and try again.' };
      }
      try { seedAdmin(); } catch (_) {}
      return { ok: true, user: Object.assign({}, BOOTSTRAP_ADMIN) };
    }

    var users = readUsers();
    var user = users[key];
    if (!user || user.password !== password) {
      return { ok: false, error: 'Invalid username or password.' };
    }
    if (!setSession(key)) {
      return { ok: false, error: 'Could not save login session. Allow cookies/storage for this site and try again.' };
    }
    return { ok: true, user: user };
  }

  function signup(data) {
    var username = (data.username || '').trim().toLowerCase();
    var email = (data.email || '').trim().toLowerCase();
    var fullName = (data.fullName || '').trim();
    var password = data.password || '';
    var confirm = data.confirmPassword || '';
    var plan = data.plan;

    if (!fullName) return { ok: false, error: 'Full name is required.' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    if (!username || username.length < 3) {
      return { ok: false, error: 'Username must be at least 3 characters.' };
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }
    if (!password || password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }
    if (password !== confirm) {
      return { ok: false, error: 'Passwords do not match.' };
    }
    if (!plan || !PLANS[plan]) {
      return { ok: false, error: 'Select a plan to continue.' };
    }

    var users = readUsers();
    if (users[username]) {
      return { ok: false, error: 'That username is already taken.' };
    }

    var takenEmail = Object.keys(users).some(function (k) {
      return users[k].email === email;
    });
    if (takenEmail) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    users[username] = {
      username: username,
      password: password,
      fullName: fullName,
      email: email,
      plan: plan,
      createdAt: Date.now()
    };
    writeUsers(users);
    return { ok: true, username: username };
  }

  function buildPricingCards() {
    return Object.keys(PLANS).map(function (key) {
      var plan = PLANS[key];
      var classes = ['auth-pricing-card'];
      if (plan.featured) classes.push('auth-pricing-featured', 'phuglee-panel-featured');
      if (plan.exclusive) classes.push('auth-pricing-exclusive', 'phuglee-panel-exclusive');

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
          '<button type="button" class="auth-close" data-auth-close aria-label="Close login dialog">&times;</button>' +
          '<div class="auth-card-scene">' +
            '<div class="auth-card" id="auth-card">' +

              '<div class="auth-card-face auth-card-front">' +
                '<div class="auth-face-header">' +
                  '<p class="auth-eyebrow">Welcome back</p>' +
                  '<h2 id="auth-login-title" class="auth-title">Log in to Phuglee</h2>' +
                  '<p class="auth-subtitle">Your distressed leads are waiting. Sign in to access the full pipeline.</p>' +
                '</div>' +
                '<form class="auth-form" id="auth-login-form" novalidate>' +
                  '<div class="auth-field">' +
                    '<label for="auth-login-username">Email or username</label>' +
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
                  '<button type="submit" class="auth-btn auth-btn-primary">' +
                    '<span>Log in</span>' +
                  '</button>' +
                '</form>' +
                '<p class="auth-switch">' +
                  'Don\'t have an account? <button type="button" class="auth-link" id="auth-show-signup">Sign up</button>' +
                '</p>' +
              '</div>' +

              '<div class="auth-card-face auth-card-back">' +
                '<div class="auth-signup-panel" id="auth-signup-tiers">' +
                  '<div class="auth-face-header">' +
                    '<p class="auth-eyebrow">Get in the game</p>' +
                    '<h2 class="auth-title">Choose your access level</h2>' +
                    '<p class="auth-subtitle">Same tools, same pipeline — pick how much ground you want to cover.</p>' +
                  '</div>' +
                  '<div class="auth-pricing-grid">' + buildPricingCards() + '</div>' +
                  '<p class="auth-pricing-note">Exclusivity is not automated signup — our team personally reviews every request to protect lead quality and market integrity.</p>' +
                  '<p class="auth-switch auth-switch-back">' +
                    'Already have an account? <button type="button" class="auth-link" id="auth-show-login">Log in</button>' +
                  '</p>' +
                '</div>' +

                '<div class="auth-signup-panel" id="auth-signup-form-panel" hidden>' +
                  '<button type="button" class="auth-back-link" id="auth-back-to-tiers">&larr; Back to plans</button>' +
                  '<div class="auth-face-header">' +
                    '<p class="auth-eyebrow" id="auth-selected-plan-label">Pro plan</p>' +
                    '<h2 class="auth-title">Create your account</h2>' +
                    '<p class="auth-subtitle">Fill in your details to get started with Distress OS.</p>' +
                  '</div>' +
                  '<form class="auth-form" id="auth-signup-form" novalidate>' +
                    '<div class="auth-field">' +
                      '<label for="auth-signup-name">Full name</label>' +
                      '<input type="text" id="auth-signup-name" name="fullName" autocomplete="name" required>' +
                    '</div>' +
                    '<div class="auth-field">' +
                      '<label for="auth-signup-email">Email</label>' +
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
                    '<button type="submit" class="auth-btn auth-btn-primary">' +
                      '<span>Create account</span>' +
                    '</button>' +
                  '</form>' +
                '</div>' +

                '<div class="auth-success-overlay" id="auth-success" hidden>' +
                  '<div class="auth-success-icon" aria-hidden="true">&#10003;</div>' +
                  '<h3 class="auth-success-title">Account created!</h3>' +
                  '<p class="auth-success-text">Thanks for joining Phuglee. Flip back to log in with your new credentials.</p>' +
                '</div>' +
              '</div>' +

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

  function openModal() {
    var overlay = $('#auth-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');
    var usernameInput = $('#auth-login-username');
    if (usernameInput) {
      setTimeout(function () { usernameInput.focus(); }, 400);
    }
  }

  function closeModal() {
    var overlay = $('#auth-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('auth-modal-open');
  }

  function setFlipped(flipped) {
    state.flipped = flipped;
    var card = $('#auth-card');
    if (card) {
      card.classList.toggle('is-flipped', flipped);
    }
  }

  function showSignupStep(step) {
    state.signupStep = step;
    var tiers = $('#auth-signup-tiers');
    var form = $('#auth-signup-form-panel');
    var success = $('#auth-success');
    if (tiers) tiers.hidden = step !== 'tiers';
    if (form) form.hidden = step !== 'form';
    if (success) success.hidden = step !== 'success';
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
    showSignupStep('form');
    var nameInput = $('#auth-signup-name');
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 300);
  }

  function resetSignupSide() {
    state.selectedPlan = null;
    showSignupStep('tiers');
    document.querySelectorAll('.auth-pricing-card').forEach(function (btn) {
      btn.classList.remove('is-selected');
      btn.setAttribute('aria-pressed', 'false');
    });
    var form = $('#auth-signup-form');
    if (form) form.reset();
    showError($('#auth-signup-error'), '');
  }

  function flipToSignup() {
    resetSignupSide();
    setFlipped(true);
  }

  function flipToLogin() {
    setFlipped(false);
    resetSignupSide();
    showError($('#auth-login-error'), '');
    showError($('#auth-signup-error'), '');
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

  function handleLoginSuccess(username) {
    closeModal();
    var dest = state.returnUrl || '/heat';
    window.location.href = dest;
  }

  function handleSignupSuccess(username) {
    state.pendingUsername = username;
    showSignupStep('success');

    setTimeout(function () {
      flipToLogin();
      prefillLoginUsername(username);
      setRememberedUsername(username);
      var pwd = $('#auth-login-password');
      if (pwd) {
        pwd.value = '';
        setTimeout(function () { pwd.focus(); }, 500);
      }
      state.pendingUsername = null;
    }, 2200);
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

    var showSignup = $('#auth-show-signup');
    if (showSignup) {
      showSignup.addEventListener('click', flipToSignup);
    }

    var showLogin = $('#auth-show-login');
    if (showLogin) {
      showLogin.addEventListener('click', flipToLogin);
    }

    var backToTiers = $('#auth-back-to-tiers');
    if (backToTiers) {
      backToTiers.addEventListener('click', function () {
        showSignupStep('tiers');
        showError($('#auth-signup-error'), '');
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
          showError($('#auth-login-error'), 'Enter your username or email.');
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

        var result = login(resolvedUsername || lookupKey, password);
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
      });
    }

    var signupForm = $('#auth-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', function (e) {
        e.preventDefault();
        showError($('#auth-signup-error'), '');

        var result = signup({
          fullName: ($('#auth-signup-name') || {}).value,
          email: ($('#auth-signup-email') || {}).value,
          username: ($('#auth-signup-username') || {}).value,
          password: ($('#auth-signup-password') || {}).value,
          confirmPassword: ($('#auth-signup-confirm') || {}).value,
          plan: state.selectedPlan
        });

        if (!result.ok) {
          showError($('#auth-signup-error'), result.error);
          return;
        }

        handleSignupSuccess(result.username);
      });
    }
  }

  function initHomepage() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('return')) {
      state.returnUrl = params.get('return');
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

    var btn = document.getElementById('btn-heat');
    if (btn) {
      if (isAuthenticated()) {
        btn.setAttribute('href', state.returnUrl || '/heat');
      } else {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          openModal();
        });
      }
    }

    if (params.get('login') === '1' && !isAuthenticated()) {
      openModal();
      if (params.get('return')) {
        history.replaceState(null, '', '/');
      }
    }
  }

  seedAdmin();

  window.PhugleeAuth = {
    isAuthenticated: isAuthenticated,
    getSessionUser: getSessionUser,
    logout: function () {
      clearSession();
      window.location.href = '/';
    },
    openLogin: openModal
  };

  if (normalizePath(window.location.pathname) === '/') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHomepage);
    } else {
      initHomepage();
    }
  }
})();