/**
 * Data Bridge v2 — distressed signal tagging for code violation records.
 * Strong tags = real distress (weeds, trash, junk vehicles, blight, neglect).
 * Generic code complaints stay "Standard" and are discarded by the engine.
 */

const { UPLOAD_TYPES } = require('./bridge-intake-schema');

const STRONG_DISTRESSED_TAG = 'Strong Distressed Signal';

/**
 * Strong distress indicator categories.
 * Vegetation / property maintenance / blight are intentionally LOOSE so vague
 * city labels like "Weeds", "Property Maintenance", "Blight" still keep.
 * Do NOT match bare "lawn" or "parking" (parking-on-lawn is not distress).
 */
const INDICATOR_CATEGORIES = Object.freeze([
  {
    id: 'vegetation',
    label: 'Tall/overgrown/high grass or weeds',
    patterns: [
      // Loose: any weeds/grass wording cities commonly use
      /\b(weeds?|weed\s+violation|weed\s+abatement|weed\s+control)\b/i,
      /\b(overgrown|high\s+grass|tall\s+grass|tall\s+weeds?|rank\s+vegetation)\b/i,
      /\b(grass|vegetation)\b.{0,30}\b(height|inch|inches|ft|feet|12|18|24|36|tall|high|overgrown)\b/i,
      /\b(unmaintained\s+lawns?|uncut\s+grass|lawn\s+maintenance|unmowed|not\s+mowed|mowing\s+violation)\b/i,
      /\b(grass\s+violation|vegetation\s+violation|high\s+weeds?)\b/i
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
      // Loose blight: "blight" alone is enough
      /\b(blight|blighted)\b/i,
      /\b(dilapidated|deteriorat(ed|ing)|unsafe|dangerous|structural|substandard)\b/i,
      /\b(broken|missing|boarded)\b.{0,20}\b(window|windows|door|doors)\b/i,
      /\b(peeling\s+paint|paint\s+peel)\b/i,
      /\b(vacant\s+and\s+open|open\s+to\s+the\s+elements|unsecured\s+structure|boarded\s+up)\b/i,
      /\b(structure|building|dwelling|residence|house)\b.{0,30}\b(neglect|deteriorat|unsafe|condemned|uninhabitable|trashed)\b/i,
      /\b(trashed\s+house|neglected\s+(property|house|home|dwelling))\b/i
    ]
  },
  {
    id: 'exterior_neglect',
    label: 'Exterior nuisance or maintenance failure indicating neglect',
    patterns: [
      // Loose property maintenance: city code labels often stop there
      /\b(property\s+maintenance|exterior\s+maintenance|failure\s+to\s+maintain|maintenance\s+violation|maint\.\s*violation)\b/i,
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

function isStrongDistressedTag(tag) {
  return String(tag || '').trim() === STRONG_DISTRESSED_TAG;
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

/**
 * Keep only distress-worthy code violations (strong tag).
 * Water shut-off rows pass through unchanged.
 */
function filterDistressOnly(rows, uploadType) {
  if (uploadType === 'water_shut_off') {
    return { rows: rows || [], removed: [], removedCount: 0 };
  }

  const kept = [];
  const removed = [];
  for (const row of rows || []) {
    if (isStrongDistressedTag(row.distressedSignalTag)) {
      kept.push(row);
    } else {
      removed.push({
        row,
        reason: 'no_distress_signal',
        rawPreview: row.streetAddress || row.violationIssueType || ''
      });
    }
  }
  return { rows: kept, removed, removedCount: removed.length };
}

module.exports = {
  STRONG_DISTRESSED_TAG,
  INDICATOR_CATEGORIES,
  collectMatches,
  buildSearchText,
  tagRow,
  tagRows,
  isStrongDistressedTag,
  filterDistressOnly
};
