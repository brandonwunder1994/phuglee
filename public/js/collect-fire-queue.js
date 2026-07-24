/**
 * Collect fire queues (Phase 2) — email-only + PDF drip via Form Forge APIs.
 * Pure helpers are exported for node --test; browser boot mounts #/fire/* UI.
 *
 * Send endpoints (mirror forge UIs):
 *   POST /forge/api/portal/city/:id/send-email-only  { request_type, email, notes }
 *   POST /forge/api/portal/city/:id/send-email        { request_type, email, notes }
 *   POST /forge/api/portal/city/:id/send-apology-email { request_type, email, notes }
 */
(function (root) {
  'use strict';

  var BULK_SEND_INTERVAL_MS = 5000;
  var FORGE_API = '/forge/api/portal';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hasEmail(value) {
    var text = String(value || '').trim();
    if (!text) return false;
    var lowered = text.toLowerCase();
    if (['nan', 'none', 'null', 'n/a', 'na', '#n/a'].indexOf(lowered) >= 0) return false;
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(text);
  }

  /**
   * @param {object} pendingPayload forge pending-* response
   * @param {'email_only'|'email_pdf'} channel
   * @returns {{ items: Array, blocked: Array, monthLabel: string, sentThisMonth: number }}
   */
  function normalizeFireItems(pendingPayload, channel) {
    var payload = pendingPayload && typeof pendingPayload === 'object' ? pendingPayload : {};
    var rawItems = Array.isArray(payload.items) ? payload.items : [];
    var rawBlocked = Array.isArray(payload.blocked) ? payload.blocked : [];
    var ch = channel === 'email_pdf' ? 'email_pdf' : 'email_only';

    var items = rawItems.map(function (row) {
      var email = String(row.contact_email || '').trim();
      var needsApology = !!(row.apology_email && row.apology_email.show_button);
      var canSend = hasEmail(email);
      return {
        id: String(row.id || ''),
        city: String(row.city || ''),
        state: String(row.state || ''),
        contactEmail: email,
        channel: ch,
        needsApology: needsApology,
        checked: canSend,
        disabled: !canSend,
        excludeReason: canSend ? '' : 'No contact email',
        status: 'pending',
        statusNote: ''
      };
    });

    var blocked = rawBlocked.map(function (row) {
      return {
        id: String(row.id || ''),
        city: String(row.city || ''),
        state: String(row.state || ''),
        blockedReason: String(row.blocked_reason || row.sent_label || 'Blocked')
      };
    });

    return {
      items: items,
      blocked: blocked,
      monthLabel: String(payload.current_month_label || ''),
      sentThisMonth: Number(payload.total_sent_this_month) || 0
    };
  }

  function selectedIds(items) {
    return (items || [])
      .filter(function (it) {
        return it && it.checked && !it.disabled && it.id;
      })
      .map(function (it) {
        return it.id;
      });
  }

  /**
   * @param {string[]} ids
   * @param {{ delayMs?: number }} opts
   */
  function dripPlan(ids, opts) {
    var delayMs = opts && opts.delayMs != null ? Number(opts.delayMs) : BULK_SEND_INTERVAL_MS;
    if (!Number.isFinite(delayMs) || delayMs < 0) delayMs = BULK_SEND_INTERVAL_MS;
    var list = Array.isArray(ids) ? ids : [];
    return {
      steps: list.map(function (id, i) {
        return { id: id, delayMs: i === 0 ? 0 : delayMs };
      })
    };
  }

  function sendPathForItem(item) {
    if (!item || !item.id) return '';
    if (item.channel === 'email_only') {
      return FORGE_API + '/city/' + encodeURIComponent(item.id) + '/send-email-only';
    }
    if (item.needsApology) {
      return FORGE_API + '/city/' + encodeURIComponent(item.id) + '/send-apology-email';
    }
    return FORGE_API + '/city/' + encodeURIComponent(item.id) + '/send-email';
  }

  function buildSendBody(item) {
    return {
      request_type: 'code_violation',
      email: item.contactEmail,
      notes:
        item.channel === 'email_only'
          ? 'Bulk sent from Collect fire queue (email-only)'
          : item.needsApology
            ? 'Bulk apology resend from Collect fire queue'
            : 'Bulk sent from Collect fire queue (PDF email)'
    };
  }

  // ── Browser UI ──────────────────────────────────────────

  var ui = {
    channel: null,
    items: [],
    blocked: [],
    monthLabel: '',
    dripActive: false,
    abortDrip: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h === '/fire/email-only' || h === 'fire/email-only') return 'email_only';
    if (h === '/fire/pdf' || h === 'fire/pdf') return 'email_pdf';
    return null;
  }

  function showView(mode) {
    var desk = $('collect-desk-home');
    var fire = $('collect-fire-view');
    var fill = $('collect-fill-view');
    var track = $('collect-tracker-view');
    var workspace = $('collect-workspace-view');
    if (mode === 'fire') {
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

  function queueUrl(channel) {
    if (channel === 'email_pdf') return FORGE_API + '/pending-pdf-requests';
    return FORGE_API + '/pending-email-only-requests';
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.json();
  }

  async function loadChannel(channel) {
    ui.channel = channel;
    ui.dripActive = false;
    ui.abortDrip = false;
    var status = $('collect-fire-status');
    var title = $('collect-fire-title');
    if (title) {
      title.textContent = channel === 'email_pdf' ? 'PDF fire queue' : 'Email-only fire queue';
    }
    if (status) status.textContent = 'Loading queue…';
    showView('fire');

    try {
      var payload = await fetchJson(queueUrl(channel));
      var norm = normalizeFireItems(payload, channel);
      ui.items = norm.items;
      ui.blocked = norm.blocked;
      ui.monthLabel = norm.monthLabel;
      if (status) {
        status.textContent =
          (norm.monthLabel ? norm.monthLabel + ' · ' : '') +
          norm.items.length +
          ' ready · ' +
          norm.blocked.length +
          ' blocked · ' +
          norm.sentThisMonth +
          ' sent this month';
      }
      renderTable();
      updateSendButton();
    } catch (err) {
      if (status) {
        status.textContent =
          'Could not load queue. Sign in and ensure Form Forge is up. ' + (err.message || '');
      }
      ui.items = [];
      ui.blocked = [];
      renderTable();
      updateSendButton();
    }
  }

  function renderTable() {
    var body = $('collect-fire-rows');
    var blockedEl = $('collect-fire-blocked');
    if (!body) return;

    if (!ui.items.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="collect-fire-empty">No cities ready to send in this queue.</td></tr>';
    } else {
      body.innerHTML = ui.items
        .map(function (it) {
          var st =
            it.status === 'sent'
              ? 'Sent'
              : it.status === 'failed'
                ? 'Failed'
                : it.status === 'skipped'
                  ? 'Skipped'
                  : it.status === 'sending'
                    ? 'Sending…'
                    : it.needsApology
                      ? 'Apology'
                      : 'Ready';
          var stCls =
            it.status === 'sent'
              ? 'is-sent'
              : it.status === 'failed'
                ? 'is-failed'
                : it.status === 'sending'
                  ? 'is-sending'
                  : '';
          return (
            '<tr data-id="' +
            escapeHtml(it.id) +
            '" class="' +
            stCls +
            '">' +
            '<td><input type="checkbox" class="collect-fire-check" data-id="' +
            escapeHtml(it.id) +
            '"' +
            (it.checked ? ' checked' : '') +
            (it.disabled || ui.dripActive ? ' disabled' : '') +
            ' /></td>' +
            '<td>' +
            escapeHtml(it.city) +
            ', ' +
            escapeHtml(it.state) +
            '</td>' +
            '<td class="collect-fire-mono">' +
            escapeHtml(it.contactEmail || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(st) +
            (it.statusNote ? ' · ' + escapeHtml(it.statusNote) : '') +
            (it.excludeReason && it.disabled ? ' · ' + escapeHtml(it.excludeReason) : '') +
            '</td>' +
            '<td class="collect-fire-mono">' +
            escapeHtml(it.id) +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    if (blockedEl) {
      if (!ui.blocked.length) {
        blockedEl.hidden = true;
        blockedEl.innerHTML = '';
      } else {
        blockedEl.hidden = false;
        blockedEl.innerHTML =
          '<p class="collect-fire-blocked-title">' +
          ui.blocked.length +
          ' blocked / on hold</p><ul class="collect-fire-blocked-list">' +
          ui.blocked
            .map(function (b) {
              return (
                '<li>' +
                escapeHtml(b.city) +
                ', ' +
                escapeHtml(b.state) +
                ' — ' +
                escapeHtml(b.blockedReason) +
                '</li>'
              );
            })
            .join('') +
          '</ul>';
      }
    }
  }

  function updateSendButton() {
    var btn = $('collect-fire-send');
    var countEl = $('collect-fire-selected-count');
    var n = selectedIds(ui.items).length;
    if (countEl) countEl.textContent = n + ' selected';
    if (btn) {
      btn.disabled = ui.dripActive || n === 0;
      btn.textContent = ui.dripActive ? 'Sending…' : 'Send all (' + n + ')';
    }
    var stopBtn = $('collect-fire-stop');
    if (stopBtn) stopBtn.hidden = !ui.dripActive;
  }

  function onCheckChange(ev) {
    var t = ev.target;
    if (!t || !t.classList || !t.classList.contains('collect-fire-check')) return;
    var id = t.getAttribute('data-id');
    ui.items.forEach(function (it) {
      if (it.id === id && !it.disabled) it.checked = !!t.checked;
    });
    updateSendButton();
  }

  function selectAll(checked) {
    ui.items.forEach(function (it) {
      if (!it.disabled) it.checked = checked;
    });
    renderTable();
    updateSendButton();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function postSend(item) {
    var url = sendPathForItem(item);
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSendBody(item))
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (!res.ok) throw new Error(data.error || 'Send failed (' + res.status + ')');
    return data;
  }

  async function runDrip() {
    var ids = selectedIds(ui.items);
    if (!ids.length) return;
    var plan = dripPlan(ids, { delayMs: BULK_SEND_INTERVAL_MS });
    if (
      !confirm(
        'Send ' +
          ids.length +
          ' ' +
          (ui.channel === 'email_pdf' ? 'PDF email' : 'email-only') +
          ' request(s) via Gmail drip (about ' +
          BULK_SEND_INTERVAL_MS / 1000 +
          's between sends)? Nothing is undoable after send.'
      )
    ) {
      return;
    }

    ui.dripActive = true;
    ui.abortDrip = false;
    updateSendButton();
    renderTable();

    var sent = 0;
    var failed = 0;
    var skipped = 0;
    var progress = $('collect-fire-progress');

    for (var i = 0; i < plan.steps.length; i++) {
      if (ui.abortDrip) break;
      var step = plan.steps[i];
      if (step.delayMs > 0) await sleep(step.delayMs);
      if (ui.abortDrip) break;

      var item = null;
      for (var j = 0; j < ui.items.length; j++) {
        if (ui.items[j].id === step.id) {
          item = ui.items[j];
          break;
        }
      }
      if (!item) continue;
      if (!hasEmail(item.contactEmail)) {
        item.status = 'skipped';
        item.statusNote = 'No email';
        item.checked = false;
        skipped += 1;
        renderTable();
        continue;
      }

      item.status = 'sending';
      renderTable();
      if (progress) {
        progress.textContent =
          'Sending ' + (i + 1) + ' of ' + plan.steps.length + ' — ' + item.city + ', ' + item.state;
      }

      try {
        var data = await postSend(item);
        item.status = 'sent';
        item.checked = false;
        item.statusNote =
          data && data.event && data.event.logged_at
            ? String(data.event.logged_at).slice(0, 10)
            : 'ok';
        sent += 1;
      } catch (err) {
        item.status = 'failed';
        item.statusNote = err.message || 'error';
        failed += 1;
        renderTable();
        if (progress) {
          progress.textContent =
            'Stopped at ' + item.city + ': ' + (err.message || 'send failed');
        }
        break;
      }
      renderTable();
    }

    ui.dripActive = false;
    updateSendButton();
    renderTable();
    if (progress && !ui.abortDrip) {
      progress.textContent =
        'Done — ' + sent + ' sent · ' + failed + ' failed · ' + skipped + ' skipped';
    } else if (progress && ui.abortDrip) {
      progress.textContent =
        'Stopped — ' + sent + ' sent · ' + failed + ' failed · ' + skipped + ' skipped';
    }

    if (root.PhugleeCollectLanes && typeof root.PhugleeCollectLanes.bootCollectLanes === 'function') {
      root.PhugleeCollectLanes.bootCollectLanes();
    }
  }

  function routeFromHash() {
    var channel = parseHash();
    if (channel) {
      loadChannel(channel);
    } else {
      showView('home');
    }
  }

  function bindUi() {
    var fire = $('collect-fire-view');
    if (!fire || fire.dataset.bound === '1') return;
    fire.dataset.bound = '1';

    fire.addEventListener('change', onCheckChange);
    $('collect-fire-select-all')?.addEventListener('click', function () {
      selectAll(true);
    });
    $('collect-fire-clear')?.addEventListener('click', function () {
      selectAll(false);
    });
    $('collect-fire-send')?.addEventListener('click', function () {
      runDrip();
    });
    $('collect-fire-stop')?.addEventListener('click', function () {
      ui.abortDrip = true;
    });
    $('collect-fire-back')?.addEventListener('click', function (e) {
      e.preventDefault();
      location.hash = '';
      showView('home');
    });
  }

  function boot() {
    bindUi();
    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();
  }

  var api = {
    BULK_SEND_INTERVAL_MS: BULK_SEND_INTERVAL_MS,
    normalizeFireItems: normalizeFireItems,
    selectedIds: selectedIds,
    dripPlan: dripPlan,
    hasEmail: hasEmail,
    sendPathForItem: sendPathForItem,
    buildSendBody: buildSendBody,
    boot: boot
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhugleeCollectFireQueue = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
