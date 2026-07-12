const crypto = require('crypto');
const {
  stripIncidentalNoise,
  stableTypeKey,
  stableDescriptionKey
} = require('./bridge-stable-text');
const { shortLabelForDisplay } = require('./bridge-short-label');

const MAX_FN_REVIEW_ROWS = 5000;

function shortHash(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.join('\u0001'))
    .digest('hex')
    .slice(0, 8);
}

function groupIdFor(section, typeKey, descriptionKey = null) {
  const parts = [section, typeKey];
  if (typeKey === '__unknown__' || descriptionKey != null) {
    parts.push(String(descriptionKey ?? ''));
  }
  const digest = crypto
    .createHash('sha1')
    .update(parts.join('\u0001'))
    .digest('hex')
    .slice(0, 12);
  return `g_${digest}`;
}

function assignRowIds(rows, { prefix = 'r' } = {}) {
  return (rows || []).map((row, index) => {
    if (row && row.rowId) return row;
    const h = shortHash([
      (row && row.streetAddress) || '',
      (row && row.violationIssueType) || '',
      (row && row.violationDate) || '',
      (row && row.descriptionNotes) || '',
      String(index)
    ]);
    return { ...row, rowId: `${prefix}_${index}_${h}` };
  });
}

function buildReviewGroups(rows, section) {
  const map = new Map();

  for (const row of rows || []) {
    const typeLabelRaw = String(row.violationIssueType || '').trim();
    const typeKey = stableTypeKey(typeLabelRaw);
    const descTrimmed = String(row.descriptionNotes || '').trim();
    const isUnknown = typeKey === '__unknown__';
    const descriptionKey = isUnknown ? stableDescriptionKey(descTrimmed) : null;

    const mapKey = isUnknown
      ? `${section}|${typeKey}|${descriptionKey}`
      : `${section}|${typeKey}`;

    let g = map.get(mapKey);
    if (!g) {
      g = {
        groupId: groupIdFor(section, typeKey, descriptionKey),
        section,
        violationTypeLabel: '',
        violationTypeKey: typeKey,
        descriptionKey,
        count: 0,
        rowIds: [],
        sampleAddresses: [],
        matchedIndicators: [],
        descriptionSamples: [],
        confidenceLevels: [],
        isSingleton: true,
        _indicatorSeen: new Set(),
        _descSeen: new Set(),
        _confSeen: new Set(),
        _labelSet: false
      };
      map.set(mapKey, g);
    }

    g.count += 1;
    if (row.rowId) g.rowIds.push(row.rowId);

    // Label: prefer cleaned type, else cleaned description, else raw fallback, else '(no type)'
    if (!g._labelSet) {
      const typeLabelClean = stripIncidentalNoise(typeLabelRaw)
        .replace(/\s+/g, ' ')
        .trim();
      const descLabelClean = stripIncidentalNoise(descTrimmed)
        .replace(/\s+/g, ' ')
        .trim();
      if (typeLabelClean) {
        g.violationTypeLabel = typeLabelClean;
        g._labelSet = true;
      } else if (descLabelClean) {
        g.violationTypeLabel = descLabelClean;
        g._labelSet = true;
      } else if (typeLabelRaw) {
        g.violationTypeLabel = typeLabelRaw;
        g._labelSet = true;
      } else if (descTrimmed) {
        g.violationTypeLabel = descTrimmed;
        g._labelSet = true;
      } else {
        g.violationTypeLabel = '(no type)';
        g._labelSet = true;
      }
    }

    const addr = String(row.streetAddress || '').trim();
    if (addr && g.sampleAddresses.length < 5) {
      g.sampleAddresses.push(addr);
    }

    const indicators = Array.isArray(row.matchedIndicators) ? row.matchedIndicators : [];
    for (const ind of indicators) {
      if (ind == null || ind === '') continue;
      const s = String(ind);
      if (!g._indicatorSeen.has(s)) {
        g._indicatorSeen.add(s);
        g.matchedIndicators.push(s);
      }
    }

    // descriptionSamples store raw (timestamped) strings
    if (descTrimmed && g.descriptionSamples.length < 5 && !g._descSeen.has(descTrimmed)) {
      g._descSeen.add(descTrimmed);
      g.descriptionSamples.push(descTrimmed);
    }

    const conf = row.confidenceLevel != null ? String(row.confidenceLevel).trim() : '';
    if (conf && !g._confSeen.has(conf)) {
      g._confSeen.add(conf);
      g.confidenceLevels.push(conf);
    }
  }

  const groups = [];
  for (const g of map.values()) {
    g.isSingleton = g.count === 1;
    // Display-only parallel field — never mutates keys, full label, or row type
    g.shortLabel = shortLabelForDisplay(g.violationTypeLabel);
    // Strip private fields (shortLabel is public API)
    const {
      _indicatorSeen,
      _descSeen,
      _confSeen,
      _labelSet,
      ...publicGroup
    } = g;
    groups.push(publicGroup);
  }

  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.violationTypeLabel.localeCompare(b.violationTypeLabel);
  });

  return groups;
}

/**
 * Does this row belong to a review group (same type / unknown-desc keys)?
 */
function rowMatchesGroup(row, group) {
  if (!row || !group) return false;
  const typeLabelRaw = String(row.violationIssueType || '').trim();
  const typeKey = stableTypeKey(typeLabelRaw);
  const groupKey = String(group.violationTypeKey || '');
  if (typeKey !== groupKey) return false;
  if (typeKey === '__unknown__') {
    const descTrimmed = String(row.descriptionNotes || '').trim();
    const descriptionKey = stableDescriptionKey(descTrimmed);
    return String(descriptionKey ?? '') === String(group.descriptionKey ?? '');
  }
  return true;
}

/**
 * Resolve rowIds for a group from a pool of rows (used by Train when groups are slim).
 */
function resolveRowIdsForGroup(rows, group) {
  const out = [];
  for (const row of rows || []) {
    if (!rowMatchesGroup(row, group)) continue;
    if (row.rowId != null && row.rowId !== '') out.push(row.rowId);
  }
  return out;
}

/**
 * Wire-safe groups: drop full rowIds arrays (can be thousands of ids per group).
 * Keeps count + samples for Train cards.
 */
function slimReviewGroups(reviewGroups) {
  const slimList = (list) =>
    (list || []).map((g) => {
      if (!g || typeof g !== 'object') return g;
      const n = Array.isArray(g.rowIds) ? g.rowIds.length : Number(g.count) || 0;
      return {
        groupId: g.groupId,
        section: g.section,
        violationTypeLabel: g.violationTypeLabel,
        violationTypeKey: g.violationTypeKey,
        descriptionKey: g.descriptionKey ?? null,
        count: Number(g.count) || n,
        rowIds: [],
        rowIdCount: n,
        sampleAddresses: Array.isArray(g.sampleAddresses) ? g.sampleAddresses : [],
        matchedIndicators: Array.isArray(g.matchedIndicators) ? g.matchedIndicators : [],
        descriptionSamples: Array.isArray(g.descriptionSamples) ? g.descriptionSamples : [],
        confidenceLevels: Array.isArray(g.confidenceLevels) ? g.confidenceLevels : [],
        isSingleton: Boolean(g.isSingleton),
        shortLabel: g.shortLabel
      };
    });
  return {
    distressed: slimList(reviewGroups && reviewGroups.distressed),
    notDistressed: slimList(reviewGroups && reviewGroups.notDistressed)
  };
}

function findGroupInReviewGroups(reviewGroups, groupId, section) {
  const id = String(groupId || '');
  if (!id) return null;
  const groups = reviewGroups || {};
  const lists = [];
  if (section === 'not_distressed') lists.push(groups.notDistressed || []);
  else if (section === 'distressed') lists.push(groups.distressed || []);
  else {
    lists.push(groups.distressed || [], groups.notDistressed || []);
  }
  for (const list of lists) {
    const hit = (list || []).find((g) => g && String(g.groupId) === id);
    if (hit) return hit;
  }
  return null;
}

module.exports = {
  MAX_FN_REVIEW_ROWS,
  groupIdFor,
  assignRowIds,
  buildReviewGroups,
  rowMatchesGroup,
  resolveRowIdsForGroup,
  slimReviewGroups,
  findGroupInReviewGroups
};
