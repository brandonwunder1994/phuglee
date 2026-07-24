(function () {
  'use strict';

  var COMMANDS = [
    { group: 'Navigate', label: 'Dashboard', href: '/command', meta: 'Pipeline dashboard' },
    { group: 'Navigate', label: 'Request', href: '/collect', meta: 'Bulk FOIA desk' },
    { group: 'Navigate', label: 'Government Lists', href: '/government-lists', meta: 'Source phonebook' },
    { group: 'Navigate', label: 'Pre-liens', href: '/pre-liens', meta: 'Complaint extract desk' },
    { group: 'Navigate', label: 'How It Works', href: '/heat', meta: 'Guide' },
    { group: 'Navigate', label: 'Filter', href: '/filter', meta: 'Scrub & tag' },
    { group: 'Navigate', label: 'Analyze', href: '/analyzer/', meta: 'Rank & dial' },
    { group: 'Leads', label: 'Houses', href: '/vault', meta: 'Curated house leads · Max plan' },
    { group: 'Leads', label: 'Land', href: '/land-vault', meta: 'Vacant lots · Land Desk · Max plan' },
    { group: 'Dispo', label: 'Under Contract', href: '/under-contract', meta: 'Proof desk', contractDeskOnly: true },
    { group: 'Dispo', label: 'Buyers', href: '/buyers', meta: 'Buy-box matcher', contractDeskOnly: true },
    { group: 'Campaigns', label: 'SMS', href: '/campaigns/sms', meta: 'Text blast tracker', adminOnly: true },
    { group: 'Settings', label: 'Operating Costs', href: '/operating-costs', meta: 'Railway · GHL · APIs', adminOnly: true },
    { group: 'Workflows', label: 'Email fire queue', href: '/collect#/fire/email-only', meta: 'Bulk plain email' },
    { group: 'Workflows', label: 'PDF fire queue', href: '/collect#/fire/pdf', meta: 'Bulk PDF drip' },
    { group: 'Workflows', label: 'PDF needs fill', href: '/collect#/fill/pdf', meta: 'Attach & fill blanks' },
    { group: 'Workflows', label: 'Request tracker', href: '/collect#/tracker', meta: 'Sent & returned' },
    { group: 'Workflows', label: 'Portal walkthrough', href: '/collect#/portal', meta: 'Online portals' },
    { group: 'Settings', label: 'Portal Errors', href: '/forge/portal/portal-errors', meta: 'Broken portal URLs', adminOnly: true }
  ];

  var backdrop = null;
  var palette = null;
  var input = null;
  var list = null;
  var highlight = 0;
  var filtered = [];

  function isAuthenticated() {
    if (window.PhugleeSession && typeof window.PhugleeSession.isAuthenticated === 'function') {
      return window.PhugleeSession.isAuthenticated();
    }
    try {
      if (sessionStorage.getItem('phuglee_logout') === '1') return false;
      return !!sessionStorage.getItem('phuglee_session');
    } catch (_) {
      return false;
    }
  }

  function ensureDom() {
    if (palette) return;
    backdrop = document.createElement('div');
    backdrop.className = 'cmd-palette-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('click', close);

    palette = document.createElement('div');
    palette.className = 'cmd-palette';
    palette.hidden = true;
    palette.setAttribute('role', 'dialog');
    palette.setAttribute('aria-modal', 'true');
    palette.setAttribute('aria-label', 'Command palette');
    palette.innerHTML =
      '<div class="cmd-palette-head">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
          '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>' +
        '</svg>' +
        '<input type="search" class="cmd-palette-input" id="cmd-palette-input" placeholder="Jump to anywhere…" autocomplete="off" />' +
        '<span class="cmd-palette-kbd">ESC</span>' +
      '</div>' +
      '<div class="cmd-palette-list" id="cmd-palette-list"></div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(palette);

    input = palette.querySelector('#cmd-palette-input');
    list = palette.querySelector('#cmd-palette-list');

    input.addEventListener('input', function () {
      highlight = 0;
      renderList(input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlight = Math.min(highlight + 1, filtered.length - 1);
        renderList(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight = Math.max(highlight - 1, 0);
        renderList(input.value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[highlight]) navigate(filtered[highlight]);
      }
    });
  }

  function isAdminUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'admin';
    } catch (_) {
      return false;
    }
  }

  function isDisposUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isDispos === 'function') {
      return window.PhugleeSettings.isDispos() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'brad';
    } catch (_) {
      return false;
    }
  }

  function isVaultOnlyUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isVaultOnly === 'function') {
      return window.PhugleeSettings.isVaultOnly() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'matt';
    } catch (_) {
      return false;
    }
  }

  function isContractDeskUser() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    return isAdminUser() || isDisposUser();
  }

  function visibleCommands() {
    return COMMANDS.filter(function (cmd) {
      if (cmd.adminOnly && !isAdminUser()) return false;
      if (cmd.contractDeskOnly && !isContractDeskUser()) return false;
      if (isVaultOnlyUser()) {
        return cmd.href === '/vault' || cmd.href === '/land-vault';
      }
      // Brad sees every Jump command except adminOnly (Operating Costs / Settings).
      return true;
    });
  }

  function filterQuery(q) {
    var needle = (q || '').trim().toLowerCase();
    var pool = visibleCommands();
    if (!needle) return pool.slice();
    return pool.filter(function (cmd) {
      return cmd.label.toLowerCase().includes(needle) ||
        (cmd.meta || '').toLowerCase().includes(needle) ||
        cmd.group.toLowerCase().includes(needle);
    });
  }

  function renderList(q) {
    filtered = filterQuery(q);
    if (!list) return;

    if (!filtered.length) {
      list.innerHTML = '<div class="cmd-palette-empty">No matches</div>';
      return;
    }

    var html = '';
    var lastGroup = '';
    filtered.forEach(function (cmd, i) {
      if (cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        html += '<div class="cmd-palette-group-label">' + cmd.group + '</div>';
      }
      var hi = i === highlight ? ' is-highlighted' : '';
      var dataAttr = cmd.action
        ? ' data-action="' + cmd.action + '"'
        : ' data-href="' + cmd.href + '"';
      html +=
        '<button type="button" class="cmd-palette-item' + hi + '"' + dataAttr + '>' +
          '<span>' + cmd.label + '</span>' +
          '<span class="cmd-palette-item-meta">' + cmd.meta + '</span>' +
        '</button>';
    });

    list.innerHTML = html;
    list.querySelectorAll('.cmd-palette-item').forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        if (action) {
          navigate(filtered[i]);
        } else {
          navigate({ href: btn.getAttribute('data-href') });
        }
      });
      if (i === highlight) btn.scrollIntoView({ block: 'nearest' });
    });
  }

  function navigate(cmd) {
    close();
    if (!cmd) return;

    var href = cmd.href;
    if (!href) return;
    if (!isAuthenticated() && href !== '/') {
      window.location.href = '/?login=1&return=' + encodeURIComponent(href);
      return;
    }
    window.location.href = href;
  }

  function open() {
    if (!isAuthenticated()) return;
    ensureDom();
    backdrop.hidden = false;
    palette.hidden = false;
    highlight = 0;
    input.value = '';
    renderList('');
    window.setTimeout(function () { input.focus(); }, 30);
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!palette) return;
    backdrop.hidden = true;
    palette.hidden = true;
    document.body.style.overflow = '';
  }

  function onKeydown(e) {
    var isK = e.key === 'k' || e.key === 'K';
    if ((e.metaKey || e.ctrlKey) && isK) {
      e.preventDefault();
      if (palette && !palette.hidden) close();
      else open();
    }
  }

  document.addEventListener('keydown', onKeydown);

  window.PhugleeCommandPalette = { open: open, close: close };
})();