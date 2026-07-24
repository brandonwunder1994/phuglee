/**
 * Collect bulk lane helpers — Phase 1 command center.
 * Pure summary + browser bootstrap for pending forge queues.
 */
(function (root) {
  'use strict';

  function summarizePendingQueue(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ready: 0, blocked: 0, sentThisMonth: 0, monthLabel: '' };
    }
    return {
      ready: Number(payload.total_pending) || 0,
      blocked: Number(payload.total_blocked) || 0,
      sentThisMonth: Number(payload.total_sent_this_month) || 0,
      monthLabel: String(payload.current_month_label || '')
    };
  }

  function withReturnTo(path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return path + sep + 'returnTo=collect';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {object} input
   * @param {object|null} [input.emailOnly]
   * @param {object|null} [input.pdf]
   * @param {object|null} [input.online]
   * @param {object|null} [input.kpi]
   * @param {number} [input.needsFillCount]
   */
  function buildLaneModel(input) {
    input = input || {};
    var email = summarizePendingQueue(input.emailOnly);
    var pdf = summarizePendingQueue(input.pdf);
    var online = summarizePendingQueue(input.online);
    var needsFill = Math.max(0, Number(input.needsFillCount) || 0);

    var lanes = [
      {
        id: 'email_only',
        label: 'Email-only',
        ready: email.ready,
        blocked: email.blocked,
        sentThisMonth: email.sentThisMonth,
        href: '#/fire/email-only',
        ctaLabel: 'Open email fire queue'
      },
      {
        id: 'pdf_ready',
        label: 'PDF ready',
        ready: pdf.ready,
        blocked: pdf.blocked,
        sentThisMonth: pdf.sentThisMonth,
        href: '#/fire/pdf',
        ctaLabel: 'Open PDF fire queue'
      },
      {
        id: 'pdf_needs_fill',
        label: 'PDF needs fill',
        ready: needsFill,
        blocked: 0,
        sentThisMonth: 0,
        href: '#/fill/pdf',
        ctaLabel: 'Open fill queue'
      },
      {
        id: 'portal',
        label: 'Portals',
        ready: online.ready,
        blocked: online.blocked,
        sentThisMonth: online.sentThisMonth,
        href: '#/portal',
        ctaLabel: 'Open portal queue'
      }
    ];

    var monthLabel = email.monthLabel || pdf.monthLabel || online.monthLabel || '';
    var tracker = {
      monthLabel: monthLabel,
      emailPdf: pdf.sentThisMonth,
      emailOnly: email.sentThisMonth,
      onlinePortal: online.sentThisMonth,
      total: pdf.sentThisMonth + email.sentThisMonth + online.sentThisMonth,
      href: '#/tracker'
    };

    var kpi = input.kpi;
    if (kpi && typeof kpi === 'object') {
      // Live forge shape: top-level current_month_* fields
      if (
        kpi.current_month_total_submitted != null ||
        kpi.current_month_email_sent != null
      ) {
        var emailPdfOnly =
          (Number(kpi.current_month_email_sent) || 0) -
          (Number(kpi.current_month_email_only_sent) || 0);
        if (emailPdfOnly < 0) emailPdfOnly = 0;
        tracker = {
          monthLabel: String(kpi.current_month_label || monthLabel),
          emailPdf: emailPdfOnly,
          emailOnly: Number(kpi.current_month_email_only_sent) || 0,
          onlinePortal: Number(kpi.current_month_online_submitted) || 0,
          total: Number(kpi.current_month_total_submitted) || 0,
          href: '#/tracker'
        };
      } else if (kpi.months && kpi.months[0]) {
        var m0 = kpi.months[0];
        var c = m0.counts || m0;
        tracker = {
          monthLabel: String(m0.label || monthLabel),
          emailPdf: Number(c.email_pdf != null ? c.email_pdf : c.email_sent) || 0,
          emailOnly: Number(c.email_only != null ? c.email_only : c.email_only_sent) || 0,
          onlinePortal:
            Number(c.online_portal != null ? c.online_portal : c.online_submitted) || 0,
          total: Number(c.total != null ? c.total : c.total_submitted) || 0,
          href: '#/tracker'
        };
      }
    }

    return { lanes: lanes, tracker: tracker };
  }

  async function fetchJson(url, fetchImpl) {
    var f = fetchImpl || fetch;
    var res = await f(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.json();
  }

  async function loadLaneModel(fetchImpl) {
    var f = fetchImpl || fetch;
    var results = await Promise.all([
      fetchJson('/forge/api/portal/pending-email-only-requests', f).catch(function () {
        return null;
      }),
      fetchJson('/forge/api/portal/pending-pdf-requests', f).catch(function () {
        return null;
      }),
      fetchJson('/forge/api/portal/pending-online-requests', f).catch(function () {
        return null;
      }),
      fetchJson('/forge/api/portal/kpi', f).catch(function () {
        return null;
      }),
      fetchJson('/forge/api/portal/pending-pdf-fill', f).catch(function () {
        return null;
      })
    ]);
    var fillPayload = results[4];
    var needsFillCount =
      fillPayload && fillPayload.total_pending != null
        ? Number(fillPayload.total_pending) || 0
        : 0;
    return buildLaneModel({
      emailOnly: results[0],
      pdf: results[1],
      online: results[2],
      kpi: results[3],
      needsFillCount: needsFillCount
    });
  }

  function renderLanes(root, model) {
    if (!root || !model || !model.lanes) return;
    root.innerHTML = model.lanes
      .map(function (lane) {
        return (
          '<article class="collect-lane phuglee-panel" data-lane="' +
          escapeHtml(lane.id) +
          '">' +
          '<h2 class="collect-lane-title">' +
          escapeHtml(lane.label) +
          '</h2>' +
          '<p class="collect-lane-count"><strong>' +
          lane.ready +
          '</strong> ready' +
          (lane.blocked ? ' · ' + lane.blocked + ' blocked' : '') +
          '</p>' +
          '<p class="collect-lane-sent">' +
          lane.sentThisMonth +
          ' sent this month</p>' +
          '<a class="phuglee-btn phuglee-btn-primary collect-lane-cta" href="' +
          escapeHtml(lane.href) +
          '">' +
          escapeHtml(lane.ctaLabel) +
          '</a>' +
          '</article>'
        );
      })
      .join('');
  }

  async function bootCollectLanes(opts) {
    var root = document.getElementById('collect-lanes-root');
    var status = document.getElementById('collect-lanes-status');
    var stripBody = document.getElementById('collect-tracker-strip-body');
    var stripLink = document.getElementById('collect-tracker-strip-link');
    if (!root) return;
    try {
      var model = await loadLaneModel(opts && opts.fetchImpl);
      if (status) status.remove();
      renderLanes(root, model);
      if (stripBody) {
        stripBody.textContent =
          model.tracker.total +
          ' total · PDF ' +
          model.tracker.emailPdf +
          ' · Email ' +
          model.tracker.emailOnly +
          ' · Portal ' +
          model.tracker.onlinePortal +
          (model.tracker.monthLabel ? ' · ' + model.tracker.monthLabel : '');
      }
      if (stripLink) stripLink.href = model.tracker.href;
    } catch (err) {
      if (status) {
        status.textContent =
          'Could not load Form Forge queues. Is Distress OS + Form Forge running? You can still use custom batch below.';
      }
    }
  }

  var api = {
    summarizePendingQueue: summarizePendingQueue,
    buildLaneModel: buildLaneModel,
    withReturnTo: withReturnTo,
    loadLaneModel: loadLaneModel,
    bootCollectLanes: bootCollectLanes,
    renderLanes: renderLanes,
    escapeHtml: escapeHtml
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhugleeCollectLanes = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bootCollectLanes();
      });
    } else {
      bootCollectLanes();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
