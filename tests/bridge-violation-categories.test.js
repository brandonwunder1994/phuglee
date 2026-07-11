const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  VIOLATION_CATEGORIES,
  DEFAULT_CATEGORY,
  classifyViolationText,
  classifyViolationRow,
  isKnownCategory
} = require('../lib/bridge-violation-categories');
const { tagRow, STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');

test('exactly 24 canonical categories', () => {
  assert.equal(VIOLATION_CATEGORIES.length, 24);
  assert.ok(!VIOLATION_CATEGORIES.includes('Other'));
  assert.ok(!VIOLATION_CATEGORIES.includes('Miscellaneous'));
});

test('classifyViolationText maps common city labels', () => {
  const cases = [
    ['Overgrown weeds exceeding 12 inches', 'Overgrown Grass & Weeds'],
    ['Weeds', 'Overgrown Grass & Weeds'],
    ['Accumulation of trash and debris in yard', 'Trash & Junk Accumulation'],
    ['Abandoned inoperable vehicle on property', 'Abandoned or Broken Vehicles'],
    ['Parking on lawn', 'Illegal Parking'],
    ['Business license expired', 'Business Tax or License'],
    ['Peeling exterior paint', 'Exterior Paint & Walls'],
    ['Roof leak and missing gutters', 'Roof or Drainage Problems'],
    ['Rodent infestation in garage', 'Bugs or Rodents (Infestation)'],
    ['Broken window screens', 'Windows & Screens'],
    ['Accessory building shed violation', 'Sheds or Accessory Buildings'],
    ['Broken sidewalk in front', 'Sidewalks or Driveways'],
    ['Missing house number', 'House Number / Address Sign'],
    ['Building permit required', 'Building Permits'],
    ['Fence permit expired', 'Building Permits'],
    ['Zoning setback violation', 'Zoning or Property Rules'],
    ['Illegal banner on fence', 'Illegal Signs or Banners'],
    ['Unsafe porch steps and railing', 'Stairs or Porch Safety'],
    ['Sight triangle obstructed', 'Corner Visibility (Sight Lines)'],
    ['Dead tree hazardous limbs', 'Farming or Tree Issues'],
    ['Operating without certificate of occupancy', 'Business Operation Rules'],
    ['Electrical wiring exposed', 'Electrical or Plumbing Issues'],
    ['Unsanitary conditions on premises', 'General Sanitation']
  ];

  for (const [text, expected] of cases) {
    const got = classifyViolationText(text);
    assert.equal(got, expected, `"${text}" → expected ${expected}, got ${got}`);
    assert.ok(isKnownCategory(got));
  }
});

test('empty text falls back to Zoning or Property Rules (not Other)', () => {
  assert.equal(classifyViolationText(''), DEFAULT_CATEGORY);
  assert.equal(classifyViolationText('   '), DEFAULT_CATEGORY);
  assert.equal(classifyViolationText('unknown gibberish xyz'), DEFAULT_CATEGORY);
});

test('trash cans left out does not classify as Trash & Junk', () => {
  const cat = classifyViolationText('Trash cans left out on curb');
  assert.notEqual(cat, 'Trash & Junk Accumulation');
});

test('classifyViolationRow uses type + notes', () => {
  const cat = classifyViolationRow({
    violationIssueType: 'Property Maintenance',
    descriptionNotes: 'Overgrown high grass'
  });
  assert.equal(cat, 'Overgrown Grass & Weeds');
});

test('tagRow attaches category on every code_violation', () => {
  const strong = tagRow(
    { streetAddress: '1 Main', descriptionNotes: 'Overgrown weeds' },
    'code_violation'
  );
  assert.equal(strong.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.equal(strong.category, 'Overgrown Grass & Weeds');

  const standard = tagRow(
    { streetAddress: '2 Main', violationIssueType: 'Parking on lawn' },
    'code_violation'
  );
  assert.equal(standard.distressedSignalTag, 'Standard Code Violation');
  assert.equal(standard.category, 'Illegal Parking');
});

test('water shut-off leaves category empty', () => {
  const result = tagRow(
    { streetAddress: '3 Main', descriptionNotes: 'Delinquent water' },
    'water_shut_off'
  );
  assert.equal(result.category, '');
});
