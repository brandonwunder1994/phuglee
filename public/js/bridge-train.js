/**
 * Filter Train brain — pure helpers (admin gate, review groups, group cards).
 * Loaded before bridge.js; unit-tested via vm without DOM.
 */
(function (root) {
  'use strict';

  function esc(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isBridgeAdmin() {
    try {
      if (root.PhugleeSettings && typeof root.PhugleeSettings.isAdmin === 'function') {
        return root.PhugleeSettings.isAdmin() === true;
      }
      var u = (root.PhugleeSession && typeof root.PhugleeSession.getSessionUser === 'function')
        ? root.PhugleeSession.getSessionUser()
        : (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('phuglee_session') || '') : '');
      return String(u || '').trim() === 'admin';
    } catch (_) {
      return false;
    }
  }

  function getReviewGroups(data) {
    var g = data && data.reviewGroups;
    return {
      distressed: Array.isArray(g && g.distressed) ? g.distressed : [],
      notDistressed: Array.isArray(g && g.notDistressed) ? g.notDistressed : []
    };
  }

  /**
   * Stable id for a train card leaving the queue after Approve/Deny.
   * Prefer groupId — multiple groups can share violationTypeKey (notably
   * __unknown__ description clusters). Using type key alone clears the whole
   * list when the first shared-key card is reviewed.
   */
  function trainDecisionKey(group) {
    if (!group) return '';
    var gid = group.groupId != null ? String(group.groupId).trim() : '';
    if (gid) return gid;
    // Fallback for malformed cards without groupId
    var section = group.section != null ? String(group.section).trim() : '';
    var typeKey = group.violationTypeKey != null ? String(group.violationTypeKey).trim() : '';
    var desc = group.descriptionKey != null ? String(group.descriptionKey).trim() : '';
    if (!section && !typeKey && !desc) return '';
    return [section, typeKey, desc].filter(function (p) { return p !== ''; }).join('|');
  }

  function filterUndecidedTrainGroups(list, decidedKeys) {
    var set = decidedKeys instanceof Set ? decidedKeys : new Set(decidedKeys || []);
    return (list || []).filter(function (g) {
      var k = trainDecisionKey(g);
      return !k || !set.has(k);
    });
  }

  /**
   * Open (undecided) train groups across distressed + notDistressed.
   * Pure — uses full review groups, never search-filtered length.
   */
  function countOpenTrainGroups(data, decidedKeys) {
    var groups = getReviewGroups(data);
    var all = (groups.distressed || []).concat(groups.notDistressed || []);
    return filterUndecidedTrainGroups(all, decidedKeys).length;
  }

  function truncateTrainSample(text, maxLen) {
    var s = String(text || '');
    var max = maxLen || 160;
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  function renderTrainGroupCard(group) {
    group = group || {};
    // Display-only short title; full label stays on group for decisions / tooltip
    var fullLabel = group.violationTypeLabel || 'Unknown type';
    var label = group.shortLabel || fullLabel;
    var count = Number(group.count) || 0;
    var groupId = group.groupId || '';
    var section = group.section || '';
    var isSingleton = group.isSingleton === true || count === 1;
    var indicators = Array.isArray(group.matchedIndicators) ? group.matchedIndicators : [];
    var samples = Array.isArray(group.descriptionSamples) ? group.descriptionSamples : [];
    var addresses = Array.isArray(group.sampleAddresses) ? group.sampleAddresses : [];

    var signalsHtml;
    if (indicators.length) {
      signalsHtml = indicators.map(function (ind) {
        return '<span class="bridge-tag bridge-tag--strong">' + esc(ind) + '</span>';
      }).join('');
    } else {
      signalsHtml = '<span class="bridge-train-muted">No matched signals</span>';
    }

    var descItems = samples.slice(0, 5).map(function (s) {
      return '<li>' + esc(truncateTrainSample(s, 160)) + '</li>';
    }).join('');
    var descHtml = descItems
      ? '<ul class="bridge-train-descriptions">' + descItems + '</ul>'
      : '';

    var addrHtml = addresses.length
      ? '<p class="bridge-train-addresses">' + esc(addresses.slice(0, 5).join(' · ')) + '</p>'
      : '';

    var badge = isSingleton
      ? ' <span class="bridge-train-badge bridge-train-badge--singleton">Singleton</span>'
      : '';

    var btn = trainActionButtonLabels(section);

    return (
      '<article class="bridge-train-group" data-group-id="' + esc(groupId) + '" data-section="' + esc(section) + '">' +
        '<div class="bridge-train-group-head">' +
          '<div class="bridge-train-group-title" title="' + esc(fullLabel) + '">' +
            esc(label) +
            ' <span class="bridge-train-count">×' + esc(String(count)) + '</span>' +
            badge +
          '</div>' +
        '</div>' +
        '<div class="bridge-train-signals">' + signalsHtml + '</div>' +
        descHtml +
        addrHtml +
        '<div class="bridge-train-actions">' +
          '<button type="button" class="phuglee-btn phuglee-btn-primary bridge-train-approve" data-action="approve" title="' +
            esc(btn.approveTitle) +
            '" aria-label="' + esc(btn.approveLabel + ' ' + label) + '">' +
            esc(btn.approveLabel) +
          '</button>' +
          '<button type="button" class="phuglee-btn phuglee-btn-secondary bridge-train-deny" data-action="deny" title="' +
            esc(btn.denyTitle) +
            '" aria-label="' + esc(btn.denyLabel + ' ' + label) + '">' +
            esc(btn.denyLabel) +
          '</button>' +
        '</div>' +
      '</article>'
    );
  }

  /**
   * Outcome-oriented button copy for Train cards (data-action stays approve/deny).
   * Distressed: confirm distressed vs mark not distressed.
   * Not distressed: confirm not distressed vs mark distressed.
   * @param {string} section
   * @returns {{ approveLabel: string, denyLabel: string, approveTitle: string, denyTitle: string }}
   */
  function trainActionButtonLabels(section) {
    var isFn = section === 'not_distressed';
    if (isFn) {
      return {
        approveLabel: '✅ Not Distressed',
        denyLabel: '🏚️ Distressed',
        approveTitle: 'AI was right — leave off the distressed list',
        denyTitle: 'AI was wrong — move to distressed and promote this type'
      };
    }
    return {
      approveLabel: '🏚️ Distressed',
      denyLabel: '✅ Not Distressed',
      approveTitle: 'AI was right — keep as distressed',
      denyTitle: 'AI was wrong — move to not-distressed and suppress this type'
    };
  }

  root.BridgeTrain = {
    isBridgeAdmin: isBridgeAdmin,
    getReviewGroups: getReviewGroups,
    trainDecisionKey: trainDecisionKey,
    filterUndecidedTrainGroups: filterUndecidedTrainGroups,
    countOpenTrainGroups: countOpenTrainGroups,
    renderTrainGroupCard: renderTrainGroupCard,
    trainActionButtonLabels: trainActionButtonLabels,
    truncateTrainSample: truncateTrainSample,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
