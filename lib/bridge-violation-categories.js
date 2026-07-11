/**
 * Code-violation Category classifier for Filter uploads.
 * Every code_violation row gets exactly one of 24 clear categories — no "Other".
 * Used for display, search, and export. Distress keep/discard still uses
 * bridge-distress-tagger (Strong Distressed Signal).
 */

/** Canonical list — order is stable for docs/UI; matching uses priority scores. */
const VIOLATION_CATEGORIES = Object.freeze([
  'Overgrown Grass & Weeds',
  'Trash & Junk Accumulation',
  'Abandoned or Broken Vehicles',
  'Illegal Parking',
  'Business Tax or License',
  'General Sanitation',
  'Exterior Paint & Walls',
  'Roof or Drainage Problems',
  'Interior Walls & Doors',
  'Broken Appliances',
  'Electrical or Plumbing Issues',
  'Bugs or Rodents (Infestation)',
  'Windows & Screens',
  'Sheds or Accessory Buildings',
  'Outdoor Storage',
  'Sidewalks or Driveways',
  'House Number / Address Sign',
  'Building Permits',
  'Zoning or Property Rules',
  'Illegal Signs or Banners',
  'Stairs or Porch Safety',
  'Corner Visibility (Sight Lines)',
  'Farming or Tree Issues',
  'Business Operation Rules'
]);

/** Fallback when no specific pattern hits — still one of the 24 (never "Other"). */
const DEFAULT_CATEGORY = 'Zoning or Property Rules';

/**
 * Category rules: higher priority wins on ties.
 * More specific categories get higher priority than broad property-rules catch-alls.
 */
const CATEGORY_RULES = Object.freeze([
  {
    category: 'Overgrown Grass & Weeds',
    priority: 90,
    patterns: [
      /\b(weeds?|weedy|weed\s+violation|weed\s+abatement|weed\s+control)\b/i,
      /\bweedy\s+lots?\b/i,
      /\b(overgrown|high\s+grass|tall\s+grass|tall\s+weeds?|high\s+weeds?|rank\s+vegetation)\b/i,
      /\b(grass|vegetation)\b.{0,40}\b(height|inch|inches|ft|feet|12|18|24|36|tall|high|overgrown|uncut|unmowed)\b/i,
      /\b(high|tall|overgrown)\b.{0,20}\b(grass|weeds?|vegetation)\b/i,
      /\b(unmaintained\s+lawns?|uncut\s+grass|lawn\s+maintenance|unmowed|not\s+mowed|mowing\s+violation)\b/i,
      /\b(grass\s+violation|vegetation\s+violation|yard\s+maintenance|lot\s+maintenance)\b/i
    ]
  },
  {
    category: 'Abandoned or Broken Vehicles',
    priority: 88,
    patterns: [
      /\b(abandoned|inoperable|derelict|junk|unregistered|inoperative|wrecked|disabled)\b.{0,25}\b(vehicle|vehicles|car|cars|auto|automobile|truck|trailer|rv|boat)\b/i,
      /\b(vehicle|vehicles|car|cars)\b.{0,25}\b(abandoned|inoperable|derelict|junk|unregistered|inoperative|wrecked|disabled)\b/i,
      /\b(inoperable\s+vehicle|junk\s+vehicle|abandoned\s+vehicle|unregistered\s+vehicle|junk\s+car)\b/i
    ]
  },
  {
    category: 'Trash & Junk Accumulation',
    priority: 86,
    patterns: [
      /\b(trash|junk|debris|rubbish|solid\s+waste|refuse|litter)\b/i,
      /\b(accumulation|accumulated|excessive|improper\s+storage)\b.{0,40}\b(trash|junk|debris|rubbish|waste)\b/i,
      /\b(furniture|appliances?|tires?|building\s+materials?|mattress|sofa|couch)\b.{0,30}\b(outside|yard|property|curb)\b/i,
      /\b(yard\s+waste|illegal\s+dump(ing)?|open\s+storage)\b/i,
      /\b(trashed\s+(house|home|property)|junk\s+pile|debris\s+pile)\b/i
    ]
  },
  {
    category: 'Bugs or Rodents (Infestation)',
    priority: 85,
    patterns: [
      /\b(rodent|rodents|vermin|infestation|infested)\b/i,
      /\b(cockroach|roaches?|bed\s*bugs?|rats?|mice|mouse|termite|insects?)\b/i,
      /\b(pest\s+control|vector\s+control)\b/i
    ]
  },
  {
    category: 'Illegal Parking',
    priority: 84,
    patterns: [
      /\b(illegal\s+parking|parking\s+violation|parked\s+illegally)\b/i,
      /\b(parking\s+on\s+(the\s+)?(lawn|grass|yard|sidewalk))\b/i,
      /\b(vehicle|car|truck)\b.{0,20}\b(parked\s+on|parking\s+on)\b.{0,15}\b(lawn|grass|yard|sidewalk)\b/i,
      /\b(no\s+parking|prohibited\s+parking|overnight\s+parking)\b/i,
      /\b(blocking\s+(driveway|sidewalk|fire\s+hydrant))\b/i
    ]
  },
  {
    category: 'Business Tax or License',
    priority: 83,
    patterns: [
      /\b(business\s+(tax|license|licence|registration)|occupational\s+(tax|license|licence))\b/i,
      /\b(no\s+business\s+license|expired\s+business\s+license|unlicensed\s+business)\b/i,
      /\b(merchant\s+license|privilege\s+license|gross\s+receipts\s+tax)\b/i
    ]
  },
  {
    category: 'Building Permits',
    priority: 82,
    patterns: [
      /\b(building\s+permit|permit\s+required|without\s+a?\s*permit|no\s+permit|unpermitted)\b/i,
      /\b(permit\s+(expired|violation|needed|missing)|expired\s+permit)\b/i,
      /\b(construction\s+without\s+permit|work\s+without\s+permit)\b/i,
      /\b(fence\s+permit|pool\s+permit|roof\s+permit|demo(lition)?\s+permit)\b/i
    ]
  },
  {
    category: 'Illegal Signs or Banners',
    priority: 81,
    patterns: [
      /\b(illegal\s+sign|prohibited\s+sign|unpermitted\s+sign|sign\s+violation)\b/i,
      /\b(banner|billboard|portable\s+sign|sandwich\s+board|snipe\s+sign)\b/i,
      /\b(signage|political\s+sign|real\s+estate\s+sign).{0,20}\b(illegal|prohibited|violation|expired)\b/i,
      /\b(signs?\s+(in\s+)?(right[-\s]?of[-\s]?way|ROW))\b/i
    ]
  },
  {
    category: 'House Number / Address Sign',
    priority: 80,
    patterns: [
      /\b(house\s+number|address\s+number|street\s+number|premise\s+number)\b/i,
      /\b(missing\s+(house\s+)?number|no\s+(visible\s+)?address|address\s+not\s+visible)\b/i,
      /\b(address\s+sign|property\s+identification|unit\s+number\s+missing)\b/i
    ]
  },
  {
    category: 'Corner Visibility (Sight Lines)',
    priority: 79,
    patterns: [
      /\b(sight\s+line|sightline|sight\s+triangle|visibility\s+triangle|corner\s+visibility)\b/i,
      /\b(clear\s+vision|vision\s+clearance|obstructed\s+view|view\s+obstruction)\b/i,
      /\b(intersection\s+visibility|line\s+of\s+sight)\b/i
    ]
  },
  {
    category: 'Stairs or Porch Safety',
    priority: 78,
    patterns: [
      /\b(stairs?|staircase|steps?|porch|deck|railing|handrail|baluster)\b.{0,25}\b(unsafe|damaged|missing|broken|collapse|rot|hazard)\b/i,
      /\b(unsafe|damaged|missing|broken)\b.{0,20}\b(stairs?|steps?|porch|deck|railing|handrail)\b/i,
      /\b(porch\s+(safety|repair|collapse)|stair\s+(safety|repair))\b/i
    ]
  },
  {
    category: 'Roof or Drainage Problems',
    priority: 77,
    patterns: [
      /\b(roof|roofs|roofing|shingles?|eaves?)\b.{0,25}\b(leak|damaged|missing|collapse|deteriorat|unsafe|hole)\b/i,
      /\b(gutter|gutters|downspout|drainage|drainpipe)\b/i,
      /\b(roof\s+(leak|repair|violation)|standing\s+water|improper\s+drainage)\b/i
    ]
  },
  {
    category: 'Windows & Screens',
    priority: 76,
    patterns: [
      /\b(window|windows|screen|screens|glazing)\b.{0,25}\b(broken|missing|boarded|damaged|open|unscreened)\b/i,
      /\b(broken|missing|boarded)\b.{0,20}\b(window|windows|screen|screens)\b/i,
      /\b(broken\s+glass|window\s+screen|unscreened\s+window)\b/i
    ]
  },
  {
    category: 'Exterior Paint & Walls',
    priority: 75,
    patterns: [
      /\b(peeling\s+paint|paint\s+peel|chipping\s+paint|flaking\s+paint)\b/i,
      /\b(exterior\s+(paint|wall|walls|siding)|siding)\b/i,
      /\b(dilapidated|blight|blighted|deteriorat(ed|ing)|substandard)\b/i,
      /\b(property\s+maintenance|exterior\s+maintenance|failure\s+to\s+maintain|care\s+of\s+premises?)\b/i,
      /\b(boarded\s+up|unsecured\s+structure|open\s+to\s+the\s+elements|vacant\s+and\s+open)\b/i,
      /\b(structure|building|dwelling|residence|house)\b.{0,30}\b(neglect|deteriorat|unsafe|condemned|uninhabitable)\b/i,
      /\b(fence|fencing)\b.{0,25}\b(dilapidated|deteriorat\w*|missing|fallen|leaning|unsafe)\b/i
    ]
  },
  {
    category: 'Interior Walls & Doors',
    priority: 74,
    patterns: [
      /\b(interior\s+(wall|walls|door|doors|ceiling|floors?))\b/i,
      /\b(holes?\s+in\s+(the\s+)?(wall|walls|ceiling)|damaged\s+interior)\b/i,
      /\b(broken\s+(interior\s+)?door|missing\s+interior\s+door)\b/i
    ]
  },
  {
    category: 'Electrical or Plumbing Issues',
    priority: 73,
    patterns: [
      /\b(electrical|electric|wiring|outlet|circuit|panel\s+box)\b/i,
      /\b(plumbing|plumb|pipe|pipes|sewer|sewage|water\s+heater|hot\s+water)\b/i,
      /\b(exposed\s+wiring|illegal\s+wiring|no\s+electricity|no\s+running\s+water)\b/i
    ]
  },
  {
    category: 'Broken Appliances',
    priority: 72,
    patterns: [
      /\b(broken\s+appliance|non[-\s]?working\s+appliance|inoperable\s+appliance)\b/i,
      /\b(stove|refrigerator|fridge|oven|dishwasher|washer|dryer)\b.{0,20}\b(broken|inoperable|not\s+working|missing)\b/i,
      /\b(broken|inoperable|not\s+working)\b.{0,20}\b(stove|refrigerator|fridge|oven|dishwasher)\b/i
    ]
  },
  {
    category: 'Sheds or Accessory Buildings',
    priority: 71,
    patterns: [
      /\b(shed|sheds|accessory\s+(building|structure|unit)|outbuilding|gazebo|carport)\b/i,
      /\b(detached\s+garage|accessory\s+dwelling)\b/i
    ]
  },
  {
    category: 'Outdoor Storage',
    priority: 70,
    patterns: [
      /\b(outdoor\s+storage|outside\s+storage|open\s+storage|exterior\s+storage)\b/i,
      /\b(materials?\s+stored|storage\s+of\s+(materials?|equipment|vehicles?))\b/i,
      /\b(stored\s+(outdoors?|outside|in\s+yard|on\s+property))\b/i
    ]
  },
  {
    category: 'Sidewalks or Driveways',
    priority: 69,
    patterns: [
      /\b(sidewalk|sidewalks|driveway|driveways|walkway|curb\s+cut)\b/i,
      /\b(broken\s+sidewalk|heaved\s+sidewalk|driveway\s+repair)\b/i
    ]
  },
  {
    category: 'Farming or Tree Issues',
    priority: 68,
    patterns: [
      /\b(tree|trees|limb|limbs|branch|branches)\b.{0,25}\b(dead|diseased|hazard|fallen|overhang|trim)\b/i,
      /\b(dead\s+tree|hazardous\s+tree|tree\s+removal|tree\s+trimming)\b/i,
      /\b(farming|livestock|chickens?|goats?|horses?|agricultural|farm\s+animal)\b/i
    ]
  },
  {
    category: 'Business Operation Rules',
    priority: 67,
    patterns: [
      /\b(business\s+operation|operating\s+without|home\s+occupation|hours\s+of\s+operation)\b/i,
      /\b(certificate\s+of\s+occupancy|CO\s+required|illegal\s+business|unlawful\s+use)\b/i,
      /\b(short[-\s]?term\s+rental|airbnb|commercial\s+use\s+in\s+residential)\b/i
    ]
  },
  {
    category: 'General Sanitation',
    priority: 66,
    patterns: [
      /\b(unsanitary|sanitation|sanitary|health\s+(code|hazard|nuisance))\b/i,
      /\b(public\s+nuisance|nuisance\s+abatement|filth|fouled)\b/i,
      /\b(garbage|waste\s+management|refuse\s+collection)\b/i
    ]
  },
  {
    category: 'Zoning or Property Rules',
    priority: 50,
    patterns: [
      /\b(zoning|setback|land\s+use|non[-\s]?conforming|variance)\b/i,
      /\b(HOA|homeowners?\s+association|covenant|deed\s+restriction)\b/i,
      /\b(lot\s+coverage|density|use\s+not\s+permitted|prohibited\s+use)\b/i,
      /\b(fence\s+height|height\s+restriction|accessory\s+use)\b/i
    ]
  }
]);

const CATEGORY_SET = new Set(VIOLATION_CATEGORIES);

/**
 * Remove trash-can phrasing so "trash cans left out" does not become Trash & Junk.
 * Mirrors distress-tagger strip for consistent classification.
 */
function stripTrashCanMentions(text) {
  let out = String(text || '');
  out = out.replace(
    /\b(trash|garbage|rubbish|refuse|recycle|recycling|waste)\s*[-/]?\s*(cans?|bins?|containers?|barrels?|receptacles?|totes?)\b/gi,
    ' '
  );
  out = out.replace(
    /\b(cans?|bins?|containers?|barrels?|receptacles?|totes?)\s+(of\s+)?(trash|garbage|rubbish|refuse|waste)\b/gi,
    ' '
  );
  out = out.replace(/\b(garbage|rubbish)\s+cans?\b/gi, ' ');
  out = out.replace(/\b(wheelie|wheeled|rolling)\s+bins?\b/gi, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Classify free text into exactly one of the 24 categories.
 * @param {string} text
 * @returns {string} one of VIOLATION_CATEGORIES
 */
function classifyViolationText(text) {
  const raw = String(text || '').trim();
  if (!raw) return DEFAULT_CATEGORY;

  const haystack = stripTrashCanMentions(raw) || raw;
  let best = null;
  let bestPriority = -1;

  for (const rule of CATEGORY_RULES) {
    if (!rule.patterns.some((re) => re.test(haystack))) continue;
    if (rule.priority > bestPriority) {
      bestPriority = rule.priority;
      best = rule.category;
    }
  }

  return best || DEFAULT_CATEGORY;
}

/**
 * Classify a normalized (or partial) row using type + notes + address + raw cells.
 * @param {object} row
 * @param {object} [rawRow]
 * @returns {string}
 */
function classifyViolationRow(row, rawRow) {
  const parts = [
    row?.violationIssueType,
    row?.descriptionNotes,
    row?.streetAddress
  ];

  if (rawRow && typeof rawRow === 'object') {
    for (const [key, value] of Object.entries(rawRow)) {
      if (key === '_meta' || key.startsWith('_')) continue;
      if (value == null || typeof value === 'object') continue;
      const t = String(value).trim();
      if (t) parts.push(t);
    }
  }

  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const t = String(part || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(t);
  }

  return classifyViolationText(unique.join(' '));
}

function isKnownCategory(value) {
  return CATEGORY_SET.has(String(value || '').trim());
}

module.exports = {
  VIOLATION_CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_RULES,
  classifyViolationText,
  classifyViolationRow,
  isKnownCategory,
  stripTrashCanMentions
};
