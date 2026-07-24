/**
 * Collect PDF needs-fill intake (Phase 3).
 * Lists email_pdf cities without a completed filled form; Fill opens in-Collect workspace.
 */
(function (root) {
  'use strict';

  var API = '/forge/api/portal/pending-pdf-fill';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h === '/fill/pdf' || h === 'fill/pdf') return 'list';
    if (h.indexOf('fill/work/') === 0 || h.indexOf('/fill/work/') === 0) return 'work';
    return null;
  }

  function showView(mode) {
    var desk = $('collect-desk-home');
    var fire = $('collect-fire-view');
    var fill = $('collect-fill-view');
    var track = $('collect-tracker-view');
    var workspace = $('collect-workspace-view');
    if (mode === 'fill') {
      if (desk) desk.hidden = true;
      if (fire) fire.hidden = true;
      if (track) track.hidden = true;
      if (workspace) workspace.hidden = true;
      if (fill) fill.hidden = false;
    } else if (mode === 'fire') {
      if (desk) desk.hidden = true;
      if (fill) fill.hidden = true;
      if (track) track.hidden = true;
      if (workspace) workspace.hidden = true;
      if (fire) fire.hidden = false;
    } else {
      if (desk) desk.hidden = false;
      if (fire) fire.hidden = true;
      if (fill) fill.hidden = true;
      if (track) track.hidden = true;
      if (workspace) workspace.hidden = true;
    }
  }

  async function loadFillQueue() {
    var status = $('collect-fill-status');
    var body = $('collect-fill-rows');
    if (status) status.textContent = 'Loading cities that need a filled FOIA PDF…';
    showView('fill');
    try {
      var res = await fetch(API, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var items = data.items || [];
      if (status) {
        status.textContent =
          items.length +
          ' need fill · ' +
          (data.total_with_blank_form || 0) +
          ' have blank form · ' +
          (data.total_missing_blank || 0) +
          ' missing blank PDF';
      }
      if (!body) return;
      if (!items.length) {
        body.innerHTML =
          '<tr><td colspan="4" class="collect-fire-empty">All PDF-email cities have a completed form. New research cities appear after they are enrolled as pathway email_pdf in Form Forge.</td></tr>';
        return;
      }
      body.innerHTML = items
        .map(function (it) {
          // Full-page Records Desk (normal document scroll) — not an iframe nest.
          var href =
            root.PhugleeCollectWorkspace &&
            typeof root.PhugleeCollectWorkspace.fillFormPageUrl === 'function'
              ? root.PhugleeCollectWorkspace.fillFormPageUrl(it.id)
              : '/forge/?returnTo=collect&open=' + encodeURIComponent(it.id);
          return (
            '<tr>' +
            '<td>' +
            escapeHtml(it.city) +
            ', ' +
            escapeHtml(it.state) +
            '</td>' +
            '<td class="collect-fire-mono">' +
            escapeHtml(it.contact_email || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(it.reason || '') +
            '</td>' +
            '<td><a class="phuglee-btn phuglee-btn-primary phuglee-btn-sm" href="' +
            escapeHtml(href) +
            '">Fill</a></td>' +
            '</tr>'
          );
        })
        .join('');
    } catch (err) {
      if (status) {
        status.textContent =
          'Could not load needs-fill queue. Sign in and ensure Form Forge is up. ' +
          (err.message || '');
      }
      if (body) {
        body.innerHTML =
          '<tr><td colspan="4" class="collect-fire-empty">Queue failed to load.</td></tr>';
      }
    }
  }

  function routeFromHash() {
    var kind = parseHash();
    if (kind === 'list') {
      loadFillQueue();
      return;
    }
    if (kind === 'work') {
      // collect-workspace.js redirects #/fill/work/:id to full-page Records Desk
      return;
    }
    var h = (location.hash || '').replace(/^#/, '');
    if (
      h.indexOf('fire/') === 0 ||
      h.indexOf('/fire/') === 0 ||
      h.indexOf('portal') === 0 ||
      h.indexOf('/portal') === 0 ||
      h.indexOf('tracker') >= 0
    ) {
      return;
    }
    if (!h) {
      showView('home');
    }
  }

  function bind() {
    var fill = $('collect-fill-view');
    if (!fill || fill.dataset.bound === '1') return;
    fill.dataset.bound = '1';
    $('collect-fill-back')?.addEventListener('click', function (e) {
      e.preventDefault();
      location.hash = '';
      showView('home');
      if (root.PhugleeCollectLanes && typeof root.PhugleeCollectLanes.bootCollectLanes === 'function') {
        root.PhugleeCollectLanes.bootCollectLanes();
      }
    });
  }

  function boot() {
    bind();
    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();
  }

  var api = { loadFillQueue: loadFillQueue, boot: boot };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhugleeCollectFillQueue = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
