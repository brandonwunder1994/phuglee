const crypto = require('crypto');
const { violationTypeKey } = require('./bridge-brain-store');

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
    const typeLabel = String(row.violationIssueType || '').trim();
    const typeKey = violationTypeKey(row.violationIssueType);
    const descTrimmed = String(row.descriptionNotes || '').trim();
    const isUnknown = typeKey === '__unknown__';
    const descriptionKey = isUnknown ? descTrimmed : null;

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

    // Label: first non-empty type label, else description, else '(no type)'
    if (!g._labelSet) {
      if (typeLabel) {
        g.violationTypeLabel = typeLabel;
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
    // Strip private fields
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

module.exports = {
  MAX_FN_REVIEW_ROWS,
  groupIdFor,
  assignRowIds,
  buildReviewGroups
};
