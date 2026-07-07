/**
 * Data Bridge v2 — distressed signal tagging for code violation records.
 */

const { UPLOAD_TYPES } = require('./bridge-intake-schema');

const STRONG_DISTRESSED_TAG = 'Strong Distressed Signal';

const INDICATOR_CATEGORIES = Object.freeze([
  {
    id: 'vegetation',
    label: 'Tall/overgrown/high grass or weeds',
    patterns: [
      /\b(overgrown|high\s+grass|tall\s+grass|rank\s+vegetation|weeds?|weed\s+violation)\b/i,
      /\b(grass|vegetation)\b.{0,30}\b(height|inch|inches|ft|feet|12|18|24|36)\b/i,
      /\b(unmaintained\s+lawns?|uncut\s+grass|lawn\s+maintenance)\b/i
    ]
  },
  {
    id: 'trash_debris',
    label: 'Accumulation of trash, junk, debris, or solid waste',
    patterns: [
      /\b(trash|junk|debris|rubbish|solid\s+waste|refuse|litter)\b/i,
      /\b(accumulation|accumulated|excessive|improper\s+storage)\b.{0,40}\b(trash|junk|debris|rubbish|waste)\b/i,
      /\b(furniture|appliances?|tires?|building\s+materials?|mattress|sofa|couch)\b.{0,30}\b(outside|yard|property|curb)\b/i,
      /\b(yard\s+waste|illegal\s+dumping|open\s+storage)\b/i
    ]
  },
  {
    id: 'vehicles',
    label: 'Abandoned, inoperable, derelict, or unregistered vehicles',
    patterns: [
      /\b(abandoned|inoperable|derelict|junk|unregistered|inoperative)\b.{0,25}\b(vehicle|vehicles|car|cars|auto|automobile|truck|trailer|rv)\b/i,
      /\b(vehicle|vehicles|car|cars)\b.{0,25}\b(abandoned|inoperable|derelict|junk|unregistered|inoperative)\b/i,
      /\b(inoperable\s+vehicle|junk\s+vehicle|abandoned\s+vehicle|unregistered\s+vehicle)\b/i
    ]
  },
  {
    id: 'structures',
    label: 'Dilapidated, blighted, or dangerous structures',
    patterns: [
      /\b(dilapidated|blighted|deteriorat(ed|ing)|unsafe|dangerous|structural|substandard)\b/i,
      /\b(broken|missing|boarded)\b.{0,20}\b(window|windows|door|doors)\b/i,
      /\b(peeling\s+paint|paint\s+peel)\b/i,
      /\b(vacant\s+and\s+open|open\s+to\s+the\s+elements|unsecured\s+structure)\b/i,
      /\b(structure|building|dwelling|residence)\b.{0,30}\b(neglect|deteriorat|unsafe|condemned|uninhabitable)\b/i
    ]
  },
  {
    id: 'exterior_neglect',
    label: 'Exterior nuisance or maintenance failure indicating neglect',
    patterns: [
      /\b(exterior\s+maintenance|property\s+maintenance|failure\s+to\s+maintain)\b/i,
      /\b(nuisance|public\s+nuisance|exterior\s+nuisance)\b/i,
      /\b(unsanitary|rodent|vermin|infestation)\b/i,
      /\b(fence|fencing)\b.{0,25}\b(dilapidated|deteriorat\w*|missing|fallen|leaning|unsafe)\b/i,
      /\b(roof|siding|gutter|porch|steps)\b.{0,25}\b(deteriorat\w*|damaged|missing|unsafe|collapse)\b/i
    ]
  }
]);

function collectMatches(text) {
  const haystack = String(text || '');
  if (!haystack.trim()) return [];

  const matched = [];
  for (const category of INDICATOR_CATEGORIES) {
    if (category.patterns.some((re) => re.test(haystack))) {
      matched.push(category.label);
    }
  }
  return matched;
}

function buildSearchText(row) {
  return [
    row.violationIssueType,
    row.descriptionNotes,
    row.streetAddress
  ].filter(Boolean).join(' ');
}

function tagRow(row, uploadType) {
  const type = UPLOAD_TYPES[uploadType];
  if (!type) {
    throw new Error(`Unknown upload type: ${uploadType}`);
  }

  if (uploadType === 'water_shut_off') {
    return {
      distressedSignalTag: type.defaultTag,
      matchedIndicators: []
    };
  }

  const matchedIndicators = collectMatches(buildSearchText(row));
  if (matchedIndicators.length) {
    return {
      distressedSignalTag: STRONG_DISTRESSED_TAG,
      matchedIndicators
    };
  }

  return {
    distressedSignalTag: type.defaultTag,
    matchedIndicators: []
  };
}

function tagRows(rows, uploadType) {
  return rows.map((row) => {
    const tags = tagRow(row, uploadType);
    return { ...row, ...tags };
  });
}

module.exports = {
  STRONG_DISTRESSED_TAG,
  INDICATOR_CATEGORIES,
  collectMatches,
  buildSearchText,
  tagRow,
  tagRows
};