/**
 * Data Bridge v2 — distressed signal tagging for code violation records.
 * Strong tags = real distress (weeds, trash, junk vehicles, blight, neglect).
 * Generic code complaints stay "Standard" and are discarded by the engine.
 */

const { UPLOAD_TYPES } = require('./bridge-intake-schema');
const { classifyViolationRow } = require('./bridge-violation-categories');

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
      /\b(weeds?|weedy|weed\s+violation|weed\s+abatement|weed\s+control|weeded)\b/i,
      // City labels: "Weedy Lot" (Pharr TX and similar)
      /\bweedy\s+lots?\b/i,
      /\b(overgrown|high\s+grass|tall\s+grass|tall\s+weeds?|high\s+weeds?|rank\s+vegetation)\b/i,
      /\b(grass|vegetation)\b.{0,40}\b(height|inch|inches|ft|feet|12|18|24|36|tall|high|overgrown|uncut|unmowed)\b/i,
      /\b(high|tall|overgrown)\b.{0,20}\b(grass|weeds?|vegetation)\b/i,
      /\b(unmaintained\s+lawns?|uncut\s+grass|lawn\s+maintenance|unmowed|not\s+mowed|mowing\s+violation)\b/i,
      /\b(grass\s+violation|vegetation\s+violation|yard\s+maintenance|lot\s+maintenance)\b/i
    ]
  },
  {
    id: 'trash_debris',
    label: 'Accumulation of trash, junk, debris, or solid waste',
    // Match real outdoor waste/debris — NOT trash cans / garbage bins left out.
    // Patterns run on text after stripTrashCanMentions().
    patterns: [
      /\b(trash|junk|debris|rubbish|solid\s+waste|refuse|litter)\b/i,
      /\b(accumulation|accumulated|excessive|improper\s+storage)\b.{0,40}\b(trash|junk|debris|rubbish|waste)\b/i,
      /\b(furniture|appliances?|tires?|building\s+materials?|mattress|sofa|couch)\b.{0,30}\b(outside|yard|property|curb)\b/i,
      /\b(yard\s+waste|illegal\s+dumping|open\s+storage)\b/i,
      // City labels
      /\billegal\s+dump(ing)?\b/i
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
      // City labels: "Care of Premise(s)" (Pharr TX and similar)
      /\bcare\s+of\s+premises?\b/i,
      /\b(nuisance|public\s+nuisance|exterior\s+nuisance)\b/i,
      /\b(unsanitary|rodent|vermin|infestation)\b/i,
      /\b(fence|fencing)\b.{0,25}\b(dilapidated|deteriorat\w*|missing|fallen|leaning|unsafe)\b/i,
      /\b(roof|siding|gutter|porch|steps)\b.{0,25}\b(deteriorat\w*|damaged|missing|unsafe|collapse)\b/i
    ]
  }
]);

/**
 * Remove trash-can / garbage-bin phrasing so "trash cans left out" is not distress.
 * Keeps "trash and debris", "trash pile", "trashed house" (structures), etc.
 */
function stripTrashCanMentions(text) {
  let out = String(text || '');
  // trash/garbage/refuse/recycle + can(s)/bin(s)/container(s)/barrel(s)/receptacle(s)
  out = out.replace(
    /\b(trash|garbage|rubbish|refuse|recycle|recycling|waste)\s*[-/]?\s*(cans?|bins?|containers?|barrels?|receptacles?|totes?)\b/gi,
    ' '
  );
  // reverse order: cans of trash, bins of garbage
  out = out.replace(
    /\b(cans?|bins?|containers?|barrels?|receptacles?|totes?)\s+(of\s+)?(trash|garbage|rubbish|refuse|waste)\b/gi,
    ' '
  );
  // "garbage can", "wheelie bin" style without trash word
  out = out.replace(/\b(garbage|rubbish)\s+cans?\b/gi, ' ');
  out = out.replace(/\b(wheelie|wheeled|rolling)\s+bins?\b/gi, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Non-house / non-lot targets we do not want as distressed leads.
 * Vacant lots and single-family houses stay eligible. Does not match bare
 * "lot", "apt", or residential street names like "Old Highway Rd" alone.
 */
const NON_RESIDENTIAL_PATTERNS = Object.freeze([
  // Multi-family / apartments (not duplex flip targets unless called complex)
  /\b(apartment\s+complex(es)?|apt\.?\s+complex(es)?|apartment\s+buildings?|apartments?\b)\b/i,
  /\b(multi[-\s]?family|multifamily|condo(minium)?\s+complex(es)?|condo(minium)?\s+buildings?)\b/i,
  /\b(senior\s+living|assisted\s+living|nursing\s+home|retirement\s+(home|community|village))\b/i,
  /\b(mobile\s+home\s+park|trailer\s+park|rv\s+park)\b/i,

  // Commercial / institutional buildings
  /\b(commercial\s+(building|buildings|property|properties|structure|structures|space|unit|plaza|site|development))\b/i,
  /\b(retail\s+(store|building|space|center|plaza)|shopping\s+(center|mall|plaza)|strip\s+mall)\b/i,
  /\b(office\s+(building|complex|park|tower)|warehouse|industrial\s+(building|park|property|site|complex)|business\s+park|storefront)\b/i,
  /\b(hotel|motel|gas\s+station|convenience\s+store|restaurant|hospital|clinic|school\s+building)\b/i,
  /\b(church\s+(building|property|grounds)|municipal\s+building|city\s+hall|county\s+office|department\s+of)\b/i,
  /\b(parking\s+(lot|garage|structure)|public\s+park|community\s+center)\b/i,

  // Highway / road infrastructure (not "123 Highway 50" house addresses alone)
  /\b(highway|interstate|freeway|hwy)\s+(right[-\s]?of[-\s]?way|median|shoulder|embankment|overpass|underpass|interchange|exit|litter|debris|weeds|grass)\b/i,
  /\b(right[-\s]?of[-\s]?way|median|shoulder|embankment)\b.{0,40}\b(highway|interstate|freeway|hwy|i-?\d{1,3})\b/i,
  /\b(along|on|beside|near)\s+(the\s+)?(highway|interstate|freeway|i-?\d{1,3})\b/i,
  /\b(roadway|road\s+right[-\s]?of[-\s]?way|public\s+right[-\s]?of[-\s]?way|state\s+right[-\s]?of[-\s]?way)\b/i,
  /\b(i-?\d{1,3})\s+(median|shoulder|right[-\s]?of[-\s]?way|interchange|exit)\b/i
]);

function isNonResidentialLead(text) {
  const haystack = String(text || '').trim();
  if (!haystack) return false;
  return NON_RESIDENTIAL_PATTERNS.some((re) => re.test(haystack));
}

function collectMatches(text) {
  const haystack = String(text || '');
  if (!haystack.trim()) return [];
  // Non-house targets never qualify as distress keep
  if (isNonResidentialLead(haystack)) return [];

  const matched = [];
  for (const category of INDICATOR_CATEGORIES) {
    // Trash-can-only complaints are not distress; strip before trash_debris patterns.
    const probe =
      category.id === 'trash_debris' ? stripTrashCanMentions(haystack) : haystack;
    if (!probe.trim()) continue;
    if (category.patterns.some((re) => re.test(probe))) {
      matched.push(category.label);
    }
  }
  return matched;
}

/**
 * Build text for distress matching.
 * Always include mapped fields PLUS every raw spreadsheet cell so city files
 * with odd headers (Ordinance Desc, Case Type, Nature of Call, etc.) still match.
 */
function buildSearchText(row, rawRow) {
  const parts = [
    row?.violationIssueType,
    row?.descriptionNotes,
    row?.streetAddress,
    row?.city,
    row?.state
  ];

  if (rawRow && typeof rawRow === 'object') {
    for (const [key, value] of Object.entries(rawRow)) {
      if (key === '_meta' || key.startsWith('_')) continue;
      if (value == null) continue;
      if (typeof value === 'object') continue;
      const text = String(value).trim();
      if (text) parts.push(text);
    }
  }

  // De-dupe while preserving order
  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const t = String(part || '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  return unique.join(' ');
}

function isStrongDistressedTag(tag) {
  return String(tag || '').trim() === STRONG_DISTRESSED_TAG;
}

function tagRow(row, uploadType, rawRow) {
  const type = UPLOAD_TYPES[uploadType];
  if (!type) {
    throw new Error(`Unknown upload type: ${uploadType}`);
  }

  if (uploadType === 'water_shut_off') {
    return {
      distressedSignalTag: type.defaultTag,
      matchedIndicators: [],
      category: ''
    };
  }

  const searchText = buildSearchText(row, rawRow);
  // Exactly one of 24 clear categories on every code-violation row
  const category = classifyViolationRow(row, rawRow);

  // Apartments, commercial, highway ROW, etc. — not single-family / lot leads
  if (isNonResidentialLead(searchText)) {
    return {
      distressedSignalTag: type.defaultTag,
      matchedIndicators: [],
      category,
      nonResidential: true
    };
  }

  const matchedIndicators = collectMatches(searchText);
  if (matchedIndicators.length) {
    return {
      distressedSignalTag: STRONG_DISTRESSED_TAG,
      matchedIndicators,
      category
    };
  }

  return {
    distressedSignalTag: type.defaultTag,
    matchedIndicators: [],
    category
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
  NON_RESIDENTIAL_PATTERNS,
  stripTrashCanMentions,
  isNonResidentialLead,
  collectMatches,
  buildSearchText,
  tagRow,
  tagRows,
  isStrongDistressedTag,
  filterDistressOnly
};
