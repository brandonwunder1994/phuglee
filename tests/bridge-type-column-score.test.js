/**
 * Wave 0 RED — COL-01 / COL-02 / COL-04 pure Type-column scorer trap matrix.
 *
 * Locks expected winners before lib/bridge-type-column-score.js exists (Plan 02).
 * Do not implement the scorer in this plan — tests must fail (MODULE_NOT_FOUND or asserts).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreTypeColumns,
  pickTypeColumn,
  resolveTypeColumnHeader
} = require('../lib/bridge-type-column-score');

// ---------------------------------------------------------------------------
// Fixtures — realistic value shapes (≥2 rows)
// ---------------------------------------------------------------------------

/** Status Description wins alias-first; Vio Cat must win on scorer. */
function trapStatusVioCat() {
  const headers = ['Status Description', 'Vio Cat', 'Description', 'Open Date'];
  const rows = [
    {
      'Status Description': 'Open',
      'Vio Cat': 'High Grass',
      Description: 'Weeds exceeding 12 inches as of 01/15/2024 10:30',
      'Open Date': '01/15/2024'
    },
    {
      'Status Description': 'Closed',
      'Vio Cat': 'Trash',
      Description: 'Junk in yard observed 02/01/2024 09:00',
      'Open Date': '02/01/2024'
    }
  ];
  return { headers, rows };
}

/** Violation Description wins alias-first; Issue Type must win. */
function trapViolationDescIssueType() {
  const headers = ['Violation Description', 'Issue Type', 'Notes'];
  const rows = [
    {
      'Violation Description':
        'Property observed with overgrown vegetation and debris piles along the fence line as of 03/10/2024 14:22',
      'Issue Type': 'High Grass',
      Notes: 'inspector notes only'
    },
    {
      'Violation Description':
        'Accumulation of junk and abandoned materials in the side yard reported 03/12/2024 08:15',
      'Issue Type': 'Trash',
      Notes: 'follow up'
    }
  ];
  return { headers, rows };
}

/** Code Description wins alias-first; Category must win. */
function trapCodeDescCategory() {
  const headers = ['Code Description', 'Category', 'Comments'];
  const rows = [
    {
      'Code Description':
        'Municipal code section 302.4 regarding weeds and plant growth exceeding maximum height',
      Category: 'Fence Permit',
      Comments: 'admin review'
    },
    {
      'Code Description':
        'Municipal code section 308.1 regarding accumulation of rubbish or garbage on premises',
      Category: 'Trash',
      Comments: 'second visit'
    }
  ];
  return { headers, rows };
}

/** Ordinance Description wins alias-first; Vio Cat must win. */
function trapOrdinanceVioCat() {
  const headers = ['Ordinance Description', 'Vio Cat'];
  const rows = [
    {
      'Ordinance Description':
        'Ordinance 12-04 prohibits vegetation growth over twelve inches in height on residential lots',
      'Vio Cat': 'High Grass'
    },
    {
      'Ordinance Description':
        'Ordinance 12-08 prohibits outdoor storage of junk and inoperable vehicles on private property',
      'Vio Cat': 'Trash'
    }
  ];
  return { headers, rows };
}

/**
 * Alias-first prefers Violation Description over Category.
 * Scorer must pick Category when values are categorical vs narrative.
 */
function trapCategoryVsViolationDesc() {
  const headers = ['Category', 'Violation Description'];
  const rows = [
    {
      Category: 'High Grass',
      'Violation Description':
        'Weeds and tall grass covering the entire front and side yards observed during inspection on 01/15/2024 10:30'
    },
    {
      Category: 'Trash',
      'Violation Description':
        'Scattered debris and household junk throughout the rear yard as documented 02/01/2024 09:00'
    }
  ];
  return { headers, rows };
}

/** Classic short type values — Violation Type must keep winning. */
function classicViolationType() {
  const headers = ['Violation Type', 'Description'];
  const rows = [
    {
      'Violation Type': 'High Grass',
      Description: 'Weeds exceeding 12 inches as of 01/15/2024 10:30'
    },
    {
      'Violation Type': 'Trash',
      Description: 'Junk in yard observed 02/01/2024 09:00'
    }
  ];
  return { headers, rows };
}

/** No Type candidacy — address + notes + date only. */
function noCandidacyNotesOnly() {
  const headers = ['Property Address', 'Notes', 'Open Date'];
  const rows = [
    {
      'Property Address': '100 Main St',
      Notes: 'overgrown weeds and tall grass in front yard',
      'Open Date': '01/15/2024'
    },
    {
      'Property Address': '200 Oak Ave',
      Notes: 'debris pile near fence',
      'Open Date': '02/01/2024'
    }
  ];
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// COL-01 trap matrix — resolveTypeColumnHeader winners
// ---------------------------------------------------------------------------

test('COL-01 trap: Status Description + Vio Cat → header is Vio Cat (not Status Description)', () => {
  const { headers, rows } = trapStatusVioCat();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Vio Cat',
    'Status Description trap: scorer must pick Vio Cat, not Status Description'
  );
  assert.equal(result.source, 'scorer');
});

test('COL-01 trap: Violation Description + Issue Type → header is Issue Type', () => {
  const { headers, rows } = trapViolationDescIssueType();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Issue Type',
    'Violation Description trap: scorer must pick Issue Type'
  );
  assert.equal(result.source, 'scorer');
});

test('COL-01 trap: Code Description + Category → header is Category', () => {
  const { headers, rows } = trapCodeDescCategory();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Category',
    'Code Description trap: scorer must pick Category'
  );
  assert.equal(result.source, 'scorer');
});

test('COL-01 trap: Ordinance Description + Vio Cat → header is Vio Cat', () => {
  const { headers, rows } = trapOrdinanceVioCat();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Vio Cat',
    'Ordinance Description trap: scorer must pick Vio Cat'
  );
  assert.equal(result.source, 'scorer');
});

test('COL-01 trap: Category + Violation Description (categorical vs narrative) → header is Category', () => {
  const { headers, rows } = trapCategoryVsViolationDesc();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Category',
    'Category vs Violation Description trap: scorer must pick Category'
  );
  assert.equal(result.source, 'scorer');
});

test('COL-01 classic: Violation Type + Description with short type values → header is Violation Type', () => {
  const { headers, rows } = classicViolationType();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    'Violation Type',
    'Classic Violation Type must still win'
  );
  assert.equal(result.source, 'scorer');
});

// ---------------------------------------------------------------------------
// COL-02 — no candidacy
// ---------------------------------------------------------------------------

test('COL-02: Address + Notes + Open Date only → header null, source unresolved', () => {
  const { headers, rows } = noCandidacyNotesOnly();
  const result = resolveTypeColumnHeader(headers, rows);
  assert.equal(
    result.header,
    null,
    'No Type candidacy: resolve must return null header'
  );
  assert.equal(
    result.source,
    'unresolved',
    'No Type candidacy: source must be unresolved'
  );
});

// ---------------------------------------------------------------------------
// COL-01 invariants — single winner, ranking, no blend
// ---------------------------------------------------------------------------

test('COL-01: pickTypeColumn never blends/concatenates multi-header strings', () => {
  const { headers, rows } = trapStatusVioCat();
  const ranked = scoreTypeColumns(headers, rows);
  const picked = pickTypeColumn(ranked);

  assert.ok(
    picked === null || (picked && typeof picked.header === 'string'),
    'pick must return null or one object with .header string'
  );
  if (picked) {
    assert.ok(
      headers.includes(picked.header),
      `picked header "${picked.header}" must be one of the input headers`
    );
    assert.ok(
      !String(picked.header).includes(','),
      `picked header must not concatenate multiple headers with comma: ${picked.header}`
    );
  }
});

test('COL-01: scoreTypeColumns ranks all non-empty headers; Status trap top is Vio Cat', () => {
  const { headers, rows } = trapStatusVioCat();
  const ranked = scoreTypeColumns(headers, rows);

  assert.ok(Array.isArray(ranked), 'scoreTypeColumns must return ranked array');
  assert.ok(ranked.length >= headers.length, 'must rank all headers');

  for (const entry of ranked) {
    assert.ok(typeof entry.header === 'string', 'each ranked entry has header');
    assert.ok(typeof entry.score === 'number', 'each ranked entry has score');
    assert.ok(Array.isArray(entry.reasons), 'each ranked entry has reasons[]');
  }

  // Descending score order
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(
      ranked[i - 1].score >= ranked[i].score,
      `ranked must be desc by score: ${ranked[i - 1].header}=${ranked[i - 1].score} then ${ranked[i].header}=${ranked[i].score}`
    );
  }

  const top = ranked[0];
  const picked = pickTypeColumn(ranked);
  assert.ok(
    top.header === 'Vio Cat' || (picked && picked.header === 'Vio Cat'),
    `Status trap: top ranked or pick must be Vio Cat, got top=${top.header} pick=${picked && picked.header}`
  );
});

test('COL-01 optional: empty samples with classic Violation Type header still candidacy-eligible', () => {
  const headers = ['Property Address', 'Violation Type', 'Notes'];
  const rows = []; // empty samples — header features alone
  const result = resolveTypeColumnHeader(headers, rows);
  // Header-only candidacy: classic "Violation Type" should still be eligible
  assert.equal(
    result.header,
    'Violation Type',
    'Empty samples: classic Violation Type header must still win via header features'
  );
  assert.equal(result.source, 'scorer');
});
