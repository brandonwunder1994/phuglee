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

  function truncateTrainSample(text, maxLen) {
    var s = String(text || '');
    var max = maxLen || 160;
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  function renderTrainGroupCard(group) {
    group = group || {};
    var label = group.violationTypeLabel || 'Unknown type';
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

    return (
      '<article class="bridge-train-group" data-group-id="' + esc(groupId) + '" data-section="' + esc(section) + '">' +
        '<div class="bridge-train-group-head">' +
          '<div class="bridge-train-group-title">' +
            esc(label) +
            ' <span class="bridge-train-count">×' + esc(String(count)) + '</span>' +
            badge +
          '</div>' +
        '</div>' +
        '<div class="bridge-train-signals">' + signalsHtml + '</div>' +
        descHtml +
        addrHtml +
        '<div class="bridge-train-actions">' +
          '<button type="button" class="bridge-btn bridge-btn-primary bridge-train-approve" data-action="approve" title="' +
            (section === 'not_distressed'
              ? 'AI was right — leave off the distressed list'
              : 'AI was right — keep as distressed') +
            '" aria-label="Approve ' + esc(label) + '">✓ Approve</button>' +
          '<button type="button" class="bridge-btn bridge-btn-ghost bridge-train-deny" data-action="deny" title="' +
            (section === 'not_distressed'
              ? 'AI was wrong — move to distressed and promote this type'
              : 'AI was wrong — move to not-distressed and suppress this type') +
            '" aria-label="Deny ' + esc(label) + '">✗ Deny</button>' +
        '</div>' +
      '</article>'
    );
  }

  root.BridgeTrain = {
    isBridgeAdmin: isBridgeAdmin,
    getReviewGroups: getReviewGroups,
    trainDecisionKey: trainDecisionKey,
    filterUndecidedTrainGroups: filterUndecidedTrainGroups,
    renderTrainGroupCard: renderTrainGroupCard,
    truncateTrainSample: truncateTrainSample,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
