(function () {
  'use strict';

  var COMMANDS = [
    { group: 'Navigate', label: 'Dashboard', href: '/command', meta: 'Pipeline dashboard' },
    { group: 'Navigate', label: 'Collect', href: '/collect', meta: 'Hit up the city' },
    { group: 'Navigate', label: 'Coverage Map', href: '/forge/map', meta: 'Map' },
    { group: 'Navigate', label: 'How It Works', action: 'guide', meta: 'Guide' },
    { group: 'Navigate', label: 'Data Bridge', href: '/bridge', meta: 'Intake' },
    { group: 'Navigate', label: 'Analyzer', href: '/analyzer/', meta: 'Analyze' },
    { group: 'Workflows', label: 'Start PDF Requests', href: '/forge/portal/request-pdfs', meta: 'Email PDFs' },
    { group: 'Workflows', label: 'Submit Portals', href: '/forge/portal/submit-portals', meta: 'Online' },
    { group: 'Workflows', label: 'Email-only Requests', href: '/forge/portal/email-only', meta: 'Plain email' },
    { group: 'Workflows', label: 'Request Tracker', href: '/forge/portal', meta: 'Status' }
  ];

  var backdrop = null;
  var palette = null;
  var input = null;
  var list = null;
  var highlight = 0;
  var filtered = [];

  function isAuthenticated() {
    try {
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

  function filterQuery(q) {
    var needle = (q || '').trim().toLowerCase();
    if (!needle) return COMMANDS.slice();
    return COMMANDS.filter(function (cmd) {
      return cmd.label.toLowerCase().includes(needle) ||
        cmd.meta.toLowerCase().includes(needle) ||
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

    if (cmd.action === 'guide') {
      if (window.PhugleeGuide && typeof window.PhugleeGuide.open === 'function') {
        window.PhugleeGuide.open();
        return;
      }
      window.location.href = '/command#how-it-works';
      return;
    }

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