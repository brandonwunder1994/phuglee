/**
 * Collect request tracker (Phase 4).
 * Sent + returned dates from Form Forge city payloads (Filter attach ΓåÆ response_at).
 */
(function (root) {
  'use strict';

  var CITIES_URL = '/forge/api/portal/cities';
  var OVERDUE_DAYS = 21;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseDateMs(value) {
    if (!value) return null;
    var t = Date.parse(String(value));
    return Number.isFinite(t) ? t : null;
  }

  function daysBetween(startMs, endMs) {
    if (startMs == null || endMs == null) return null;
    var ms = endMs - startMs;
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.floor(ms / 86400000));
  }

  function formatShortDate(value) {
    var ms = parseDateMs(value);
    if (ms == null) return 'ΓÇö';
    try {
      return new Date(ms).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (_) {
      return String(value).slice(0, 10);
    }
  }

  function channelLabel(channel) {
    if (channel === 'email_pdf') return 'PDF email';
    if (channel === 'email_only') return 'Email-only';
    if (channel === 'online_portal') return 'Portal';
    return channel || 'ΓÇö';
  }

  /**
   * @param {object} item forge portal city payload
   * @param {{ now?: number, overdueDays?: number }} opts
   */
  function classifyTrackerRow(item, opts) {
    opts = opts || {};
    var now = opts.now != null ? opts.now : Date.now();
    var overdueDays = opts.overdueDays != null ? opts.overdueDays : OVERDUE_DAYS;
    var track = (item && item.tracking) || {};
    var cv = ((item && item.requests) || {}).code_violation || {};
    var email = track.email || {};
    var online = track.online || {};

    var lastSent =
      email.last_sent_at ||
      online.last_submitted_at ||
      (item && item.last_submitted_at) ||
      cv.last_email_sent_at ||
      cv.last_online_submitted_at ||
      cv.requested_at ||
      '';

    var responseAt = track.response_at || cv.response_at || '';
    var channel =
      (item && item.last_channel) ||
      (email.last_sent_at ? 'email_pdf' : '') ||
      (online.last_submitted_at ? 'online_portal' : '') ||
      '';
    if (!channel && email.last_sent_at) channel = 'email_pdf';
    if (!channel && item && item.is_email_only && email.last_sent_at) channel = 'email_only';

    var cityReplied = !!track.city_replied;
    var statusRaw = String(cv.response_status || '').toLowerCase();
    var received =
      !!responseAt ||
      cityReplied ||
      statusRaw === 'yes' ||
      statusRaw === 'received' ||
      statusRaw === 'partial';

    var lastSentMs = parseDateMs(lastSent);
    var responseMs = parseDateMs(responseAt);
    var turnaround =
      track.turnaround_days != null && track.turnaround_days !== ''
        ? Number(track.turnaround_days)
        : daysBetween(lastSentMs, responseMs);

    var status = 'none';
    if (received) status = 'received';
    else if (lastSentMs != null) {
      var age = daysBetween(lastSentMs, now);
      status = age != null && age >= overdueDays ? 'overdue' : 'pending';
    }

    return {
      id: (item && item.id) || '',
      city: (item && item.city) || '',
      state: (item && item.state) || '',
      channel: channel,
      channelLabel: channelLabel(channel),
      lastSent: lastSent,
      lastSentLabel: formatShortDate(lastSent),
      responseAt: responseAt,
      responseLabel: formatShortDate(responseAt),
      status: status,
      turnaroundDays: Number.isFinite(turnaround) ? turnaround : null,
      pathway: (item && item.pathway) || ''
    };
  }

  function summarizeRows(rows) {
    var out = { total: 0, pending: 0, overdue: 0, received: 0, none: 0 };
    (rows || []).forEach(function (r) {
      out.total += 1;
      if (out[r.status] != null) out[r.status] += 1;
    });
    return out;
  }

  function filterRows(rows, filter, q) {
    var list = rows || [];
    if (filter && filter !== 'all') {
      list = list.filter(function (r) {
        return r.status === filter;
      });
    }
    var query = String(q || '')
      .trim()
      .toLowerCase();
    if (query) {
      list = list.filter(function (r) {
        return (
          r.city.toLowerCase().indexOf(query) >= 0 ||
          r.state.toLowerCase().indexOf(query) >= 0 ||
          r.id.toLowerCase().indexOf(query) >= 0
        );
      });
    }
    return list;
  }

  // ΓöÇΓöÇ Browser UI ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  var state = {
    rows: [],
    filter: 'pending',
    q: ''
  };

  function $(id) {
    return document.getElementById(id);
  }

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    return h === '/tracker' || h === 'tracker';
  }

  function showView(mode) {
    var desk = $('collect-desk-home');
    var fire = $('collect-fire-view');
    var fill = $('collect-fill-view');
    var track = $('collect-tracker-view');
    var workspace = $('collect-workspace-view');
    if (mode === 'tracker') {
      if (desk) desk.hidden = true;
      if (fire) fire.hidden = true;
      if (fill) fill.hidden = true;
      if (workspace) workspace.hidden = true;
      if (track) track.hidden = false;
    } else if (mode === 'home') {
      if (desk) desk.hidden = false;
      if (fire) fire.hidden = true;
      if (fill) fill.hidden = true;
      if (track) track.hidden = true;
      if (workspace) workspace.hidden = true;
    }
  }

  function statusLabel(status) {
    if (status === 'pending') return 'Pending';
    if (status === 'overdue') return 'Overdue';
    if (status === 'received') return 'Received';
    return 'Not sent';
  }

  function render() {
    var body = $('collect-tracker-rows');
    var statusEl = $('collect-tracker-status');
    var summary = summarizeRows(state.rows);
    var visible = filterRows(state.rows, state.filter, state.q);

    if (statusEl) {
      statusEl.textContent =
        summary.pending +
        ' pending ┬╖ ' +
        summary.overdue +
        ' overdue ┬╖ ' +
        summary.received +
        ' received ┬╖ ' +
        summary.total +
        ' cities ┬╖ overdue ΓëÑ ' +
        OVERDUE_DAYS +
        'd';
    }

    ['all', 'pending', 'overdue', 'received', 'none'].forEach(function (key) {
      var btn = $('collect-tracker-filter-' + key);
      if (!btn) return;
      btn.classList.toggle('is-active', state.filter === key);
      var n =
        key === 'all'
          ? summary.total
          : summary[key] != null
            ? summary[key]
            : 0;
      btn.setAttribute('data-count', String(n));
      var label = btn.getAttribute('data-label') || btn.textContent.split('┬╖')[0].trim();
      btn.textContent = label + ' ┬╖ ' + n;
    });

    if (!body) return;
    if (!visible.length) {
      body.innerHTML =
        '<tr><td colspan="6" class="collect-fire-empty">No cities match this filter.</td></tr>';
      return;
    }

    // Sort: overdue first, then pending, received, none; within group by place
    var order = { overdue: 0, pending: 1, received: 2, none: 3 };
    visible = visible.slice().sort(function (a, b) {
      var oa = order[a.status] != null ? order[a.status] : 9;
      var ob = order[b.status] != null ? order[b.status] : 9;
      if (oa !== ob) return oa - ob;
      var sa = (a.state + a.city).toLowerCase();
      var sb = (b.state + b.city).toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

    body.innerHTML = visible
      .map(function (r) {
        var turn =
          r.turnaroundDays != null ? r.turnaroundDays + 'd' : r.status === 'received' ? 'ΓÇö' : 'ΓÇö';
        return (
          '<tr class="collect-tracker-row is-' +
          escapeHtml(r.status) +
          '">' +
          '<td>' +
          escapeHtml(r.city) +
          ', ' +
          escapeHtml(r.state) +
          '</td>' +
          '<td>' +
          escapeHtml(r.channelLabel) +
          '</td>' +
          '<td class="collect-fire-mono">' +
          escapeHtml(r.lastSentLabel) +
          '</td>' +
          '<td class="collect-fire-mono">' +
          escapeHtml(r.responseLabel) +
          '</td>' +
          '<td><span class="collect-tracker-badge collect-tracker-badge--' +
          escapeHtml(r.status) +
          '">' +
          escapeHtml(statusLabel(r.status)) +
          '</span></td>' +
          '<td class="collect-fire-mono">' +
          escapeHtml(turn) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function loadTracker() {
    showView('tracker');
    var statusEl = $('collect-tracker-status');
    if (statusEl) statusEl.textContent = 'Loading trackerΓÇª';
    try {
      var res = await fetch(CITIES_URL, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var items = data.items || [];
      state.rows = items.map(function (item) {
        return classifyTrackerRow(item, { overdueDays: OVERDUE_DAYS });
      });
      // Default filter: if no pending/overdue, show all
      var sum = summarizeRows(state.rows);
      if (state.filter === 'pending' && sum.pending === 0 && sum.overdue === 0) {
        state.filter = 'all';
      }
      render();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent =
          'Could not load tracker. Sign in and ensure Form Forge is up. ' + (err.message || '');
      }
      state.rows = [];
      render();
    }
  }

  function routeFromHash() {
    if (parseHash()) {
      loadTracker();
      return;
    }
    var h = (location.hash || '').replace(/^#/, '');
    if (
      h.indexOf('fire/') === 0 ||
      h.indexOf('/fire/') === 0 ||
      h.indexOf('fill/') === 0 ||
      h.indexOf('/fill/') === 0
    ) {
      return;
    }
    if (!h) showView('home');
  }

  function bind() {
    var view = $('collect-tracker-view');
    if (!view || view.dataset.bound === '1') return;
    view.dataset.bound = '1';

    $('collect-tracker-back')?.addEventListener('click', function (e) {
      e.preventDefault();
      location.hash = '';
      showView('home');
    });

    ['all', 'pending', 'overdue', 'received', 'none'].forEach(function (key) {
      $('collect-tracker-filter-' + key)?.addEventListener('click', function () {
        state.filter = key;
        render();
      });
    });

    $('collect-tracker-search')?.addEventListener('input', function (e) {
      state.q = e.target.value || '';
      render();
    });
  }

  function boot() {
    bind();
    // Point home strip at local tracker
    var stripLink = $('collect-tracker-strip-link');
    if (stripLink) {
      stripLink.href = '#/tracker';
      stripLink.textContent = 'Open tracker';
    }
    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();
  }

  var api = {
    OVERDUE_DAYS: OVERDUE_DAYS,
    classifyTrackerRow: classifyTrackerRow,
    summarizeRows: summarizeRows,
    filterRows: filterRows,
    formatShortDate: formatShortDate,
    boot: boot,
    loadTracker: loadTracker
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhugleeCollectTracker = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
