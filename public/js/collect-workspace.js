/**
 * Request desk workspace routing.
 * Fill form opens as a normal full page (no nested iframe scroll).
 * Portal queue still uses the in-page workspace when needed.
 * Hash: #/fill/work/<cityId> | #/portal
 */
(function (root) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function hideAllMainViews() {
    ['collect-desk-home', 'collect-fire-view', 'collect-fill-view', 'collect-tracker-view', 'collect-workspace-view'].forEach(
      function (id) {
        var el = $(id);
        if (el) el.hidden = true;
      }
    );
  }

  function showHome() {
    hideAllMainViews();
    var desk = $('collect-desk-home');
    if (desk) desk.hidden = false;
  }

  /** Full-page Records Desk URL for one-city fill (document scroll, shell nav). */
  function fillFormPageUrl(cityId) {
    return (
      '/forge/?returnTo=collect&open=' +
      encodeURIComponent(cityId) +
      '#city=' +
      encodeURIComponent(cityId)
    );
  }

  function parseWorkspaceHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h.indexOf('/') !== 0) h = '/' + h;
    // /fill/work/<id>
    var fillWork = h.match(/^\/fill\/work\/([^/?#]+)/);
    if (fillWork) {
      return { mode: 'fill-work', cityId: decodeURIComponent(fillWork[1]) };
    }
    if (h === '/portal' || h === '/portals') {
      return { mode: 'portal' };
    }
    return null;
  }

  function openWorkspace(opts) {
    hideAllMainViews();
    var view = $('collect-workspace-view');
    var frame = $('collect-workspace-frame');
    var title = $('collect-workspace-title');
    var sub = $('collect-workspace-sub');
    var back = $('collect-workspace-back');
    if (!view || !frame) return;

    view.hidden = false;
    if (title) title.textContent = opts.title || 'Request tool';
    if (sub) sub.textContent = opts.sub || '';
    if (back) {
      back.href = opts.backHref || '/collect';
      back.dataset.backHash = opts.backHash || '';
    }
    // Force reload when same src with different open id
    frame.removeAttribute('src');
    frame.src = opts.src;
  }

  function routeFromHash() {
    var ws = parseWorkspaceHash();
    if (!ws) return false;

    if (ws.mode === 'fill-work' && ws.cityId) {
      // Full page — same document scroll as any other desk page (no iframe nest).
      location.replace(fillFormPageUrl(ws.cityId));
      return true;
    }
    if (ws.mode === 'portal') {
      openWorkspace({
        title: 'Portal queue',
        sub: 'Still on Request — submit portals and mark them done.',
        src: '/forge/portal/submit-portals?returnTo=collect&embed=1',
        backHref: '/collect',
        backHash: ''
      });
      return true;
    }
    return false;
  }

  function bind() {
    var view = $('collect-workspace-view');
    if (!view || view.dataset.bound === '1') return;
    view.dataset.bound = '1';

    $('collect-workspace-back')?.addEventListener('click', function (e) {
      var hash = e.currentTarget.dataset.backHash;
      if (hash === '' || hash == null) {
        // home
        return;
      }
      // let hash navigation work via href
    });
  }

  function boot() {
    bind();
    window.addEventListener('hashchange', function () {
      if (!routeFromHash()) {
        // other modules handle their hashes; if home, hide workspace
        var h = (location.hash || '').replace(/^#/, '');
        if (!h) {
          var ws = $('collect-workspace-view');
          if (ws) ws.hidden = true;
        }
      }
    });
    routeFromHash();
  }

  root.PhugleeCollectWorkspace = {
    openWorkspace: openWorkspace,
    routeFromHash: routeFromHash,
    parseWorkspaceHash: parseWorkspaceHash,
    fillFormPageUrl: fillFormPageUrl,
    boot: boot
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
