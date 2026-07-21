/**
 * Filter Live Scrub Feed — pure helpers (event build, summary, play options).
 * Loaded before bridge.js; unit-tested via vm without DOM / SSE / fetch.
 * FEED-01 maps process payload pools; FEED-02 reduced-motion play config.
 */
(function (root) {
  'use strict';

  var SCRUB_FEED_CAP = 32; // range 24–40; default 32
  var SCRUB_FEED_PLAY_MS = 2000; // motion path wall-clock cap (≤ 2500)
  var SCRUB_FEED_TICK_MS = 60; // 50–80 ms between row reveals

  /** Status chip copy (ops voice) */
  var STATUS_LABELS = {
    kept: 'Kept · distress',
    'no-distress': 'No distress · dropped',
    discarded: 'Discarded',
    'already-in-Analyze': 'Already in Review'
  };

  var STATUS_KEYS = ['kept', 'no-distress', 'discarded', 'already-in-Analyze'];

  /** Target mix of cap: ~40% kept / ~30% no-distress / ~20% discarded / ~10% already-in-Analyze */
  var MIX_WEIGHTS = {
    kept: 0.4,
    'no-distress': 0.3,
    discarded: 0.2,
    'already-in-Analyze': 0.1
  };

  function emptySummary() {
    return { kept: 0, noDistress: 0, discarded: 0, alreadyImported: 0 };
  }

  function emptyRemainder() {
    return {
      kept: 0,
      'no-distress': 0,
      discarded: 0,
      'already-in-Analyze': 0
    };
  }

  function emptyResult() {
    return {
      events: [],
      summary: emptySummary(),
      remainderByStatus: emptyRemainder()
    };
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isAlreadyImportedReason(reason) {
    var r = String(reason || '');
    if (r === 'already_imported') return true;
    return /already imported/i.test(r);
  }

  function shortReason(reason) {
    var s = String(reason || '').trim();
    if (!s) return '';
    // Drop common prefixes for chip suffix
    s = s.replace(/^Already imported in Review$/i, '').trim();
    if (s.length > 48) s = s.slice(0, 48) + '…';
    return s;
  }

  function mapKeptPool(rows) {
    var out = [];
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      var address = String(r.streetAddress || '').trim();
      if (!address) continue;
      var type = String(r.violationIssueType || '').trim();
      out.push({
        status: 'kept',
        address: address,
        type: type,
        label: STATUS_LABELS.kept
      });
    }
    return out;
  }

  function mapNoDistressPool(rows) {
    var out = [];
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      var address = String(r.streetAddress || '').trim();
      if (!address) continue;
      var type = String(r.violationIssueType || '').trim();
      out.push({
        status: 'no-distress',
        address: address,
        type: type,
        label: STATUS_LABELS['no-distress']
      });
    }
    return out;
  }

  function mapDiscardPools(discarded) {
    var discardedPool = [];
    var alreadyPool = [];
    var list = Array.isArray(discarded) ? discarded : [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i] || {};
      var reason = String(d.reason || '');
      var preview = String(d.rawPreview || '').trim();
      // Never invent streets — reason-only OK when preview empty
      var address = preview || reason.trim();
      if (!address) continue;
      if (isAlreadyImportedReason(reason)) {
        alreadyPool.push({
          status: 'already-in-Analyze',
          address: address,
          type: reason,
          label: STATUS_LABELS['already-in-Analyze']
        });
      } else {
        var suffix = shortReason(reason);
        var label = STATUS_LABELS.discarded;
        if (suffix) label = label + ' · ' + suffix;
        discardedPool.push({
          status: 'discarded',
          address: address,
          type: reason,
          label: label
        });
      }
    }
    return { discarded: discardedPool, already: alreadyPool };
  }

  /**
   * Allocate integer quotas toward cap by mix weights; redistribute empty pools.
   * @param {Object.<string, number>} poolSizes
   * @param {number} cap
   * @returns {Object.<string, number>}
   */
  function allocateQuotas(poolSizes, cap) {
    var quotas = {};
    var active = [];
    var weightSum = 0;
    var k;
    for (k = 0; k < STATUS_KEYS.length; k++) {
      var key = STATUS_KEYS[k];
      var size = poolSizes[key] || 0;
      if (size > 0) {
        active.push(key);
        weightSum += MIX_WEIGHTS[key] || 0;
      } else {
        quotas[key] = 0;
      }
    }
    if (active.length === 0 || cap <= 0) {
      for (k = 0; k < STATUS_KEYS.length; k++) quotas[STATUS_KEYS[k]] = 0;
      return quotas;
    }
    if (weightSum <= 0) weightSum = active.length;

    var assigned = 0;
    for (k = 0; k < active.length; k++) {
      var ak = active[k];
      var w = (MIX_WEIGHTS[ak] || 0) / weightSum;
      var q = Math.floor(cap * w);
      // Never request more than pool size
      q = Math.min(q, poolSizes[ak]);
      quotas[ak] = q;
      assigned += q;
    }

    // Fill remainder of cap from pools that still have room (prefer weight order)
    var remaining = cap - assigned;
    var guard = 0;
    while (remaining > 0 && guard < cap + 8) {
      guard++;
      var progressed = false;
      for (k = 0; k < active.length && remaining > 0; k++) {
        var bk = active[k];
        if ((quotas[bk] || 0) < (poolSizes[bk] || 0)) {
          quotas[bk] = (quotas[bk] || 0) + 1;
          remaining--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return quotas;
  }

  /**
   * Round-robin interleave sampled pools so feed is not all-kept then all-kills.
   */
  function interleave(pools, quotas) {
    var cursors = {};
    var events = [];
    var k;
    for (k = 0; k < STATUS_KEYS.length; k++) {
      cursors[STATUS_KEYS[k]] = 0;
    }
    var done = false;
    while (!done) {
      done = true;
      for (k = 0; k < STATUS_KEYS.length; k++) {
        var key = STATUS_KEYS[k];
        var pool = pools[key] || [];
        var quota = quotas[key] || 0;
        var c = cursors[key];
        if (c < quota && c < pool.length) {
          events.push(pool[c]);
          cursors[key] = c + 1;
          done = false;
        }
      }
    }
    return events;
  }

  /**
   * @param {object} data process success payload
   * @param {{ cap?: number }} [opts]
   * @returns {{
   *   events: Array<{ status: string, address: string, type: string, label: string }>,
   *   summary: { kept: number, noDistress: number, discarded: number, alreadyImported: number, totalParsed?: number },
   *   remainderByStatus: { kept: number, 'no-distress': number, discarded: number, 'already-in-Analyze': number }
   * }}
   */
  function buildScrubFeedEvents(data, opts) {
    opts = opts || {};
    if (data == null) return emptyResult();

    var cap = opts.cap != null ? num(opts.cap) : SCRUB_FEED_CAP;
    if (cap < 0) cap = 0;

    var keptPool = mapKeptPool(data.rows);
    var noDistressPool = mapNoDistressPool(data.notDistressedRows);
    var disc = mapDiscardPools(data.discarded);

    var pools = {
      kept: keptPool,
      'no-distress': noDistressPool,
      discarded: disc.discarded,
      'already-in-Analyze': disc.already
    };

    var poolSizes = {
      kept: keptPool.length,
      'no-distress': noDistressPool.length,
      discarded: disc.discarded.length,
      'already-in-Analyze': disc.already.length
    };

    var quotas = allocateQuotas(poolSizes, cap);
    var events = interleave(pools, quotas);
    // Hard cap safety
    if (events.length > cap) events = events.slice(0, cap);

    var stats = data.stats || {};
    var summary = {
      kept: num(stats.kept),
      noDistress: num(stats.noDistress),
      discarded: num(stats.discarded),
      alreadyImported: num(stats.alreadyImported)
    };
    if (stats.totalParsed != null) {
      summary.totalParsed = num(stats.totalParsed);
    }

    var shown = emptyRemainder();
    for (var i = 0; i < events.length; i++) {
      var st = events[i].status;
      if (Object.prototype.hasOwnProperty.call(shown, st)) {
        shown[st] += 1;
      }
    }

    // Prefer stats totals over pool length (FN list may be truncated server-side)
    var remainderByStatus = {
      kept: Math.max(0, summary.kept - shown.kept),
      'no-distress': Math.max(0, summary.noDistress - shown['no-distress']),
      discarded: Math.max(0, summary.discarded - shown.discarded),
      'already-in-Analyze': Math.max(0, summary.alreadyImported - shown['already-in-Analyze'])
    };

    return {
      events: events,
      summary: summary,
      remainderByStatus: remainderByStatus
    };
  }

  /**
   * Operator-facing summary line for reduced-motion + feed header.
   * Omit Already-in-Analyze segment when alreadyImported === 0 (IND-04 honesty).
   */
  function formatScrubFeedSummary(summary) {
    summary = summary || {};
    var parts = [
      'Kept ' + num(summary.kept),
      'No distress ' + num(summary.noDistress),
      'Discarded ' + num(summary.discarded)
    ];
    var already = num(summary.alreadyImported);
    if (already > 0) {
      parts.push('Already in Review ' + already);
    }
    return parts.join(' · ');
  }

  /**
   * FEED-02 play config — pure options object (no DOM).
   * reducedMotion true → zero staged delay; false → stagger within hard cap.
   * prefers-reduced-motion: reduce is evaluated by caller via matchMedia.
   */
  function getScrubFeedPlayOptions(opts) {
    opts = opts || {};
    if (opts.reducedMotion === true) {
      return { maxMs: 0, tickMs: 0, stagger: false };
    }
    return {
      maxMs: SCRUB_FEED_PLAY_MS,
      tickMs: SCRUB_FEED_TICK_MS,
      stagger: true
    };
  }

  root.BridgeScrubFeed = {
    SCRUB_FEED_CAP: SCRUB_FEED_CAP,
    SCRUB_FEED_PLAY_MS: SCRUB_FEED_PLAY_MS,
    SCRUB_FEED_TICK_MS: SCRUB_FEED_TICK_MS,
    STATUS_LABELS: STATUS_LABELS,
    buildScrubFeedEvents: buildScrubFeedEvents,
    formatScrubFeedSummary: formatScrubFeedSummary,
    getScrubFeedPlayOptions: getScrubFeedPlayOptions
  };
})(typeof window !== 'undefined' ? window : globalThis);
