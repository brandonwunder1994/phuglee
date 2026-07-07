const fs = require('fs');
const path = process.argv[2] || 'distressAnalyzerSession_LATEST.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const results = data.results || [];
const buckets = data.reviewedKeysByFilter || {};
const progress = data.reviewProgressByFilter || {};

function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}

function resultCategory(r) {
  if (r.manualOverride) return r.manualOverride;
  if (r.fetchFailed) return 'unavailable';
  const cat = String(r.category || 'property').toLowerCase();
  if (cat === 'vacant' || cat === 'land') return 'vacant_lot';
  if (cat === 'property' && r.structureOnLot === false) return 'vacant_lot';
  return cat || 'property';
}

function resultLeadTier(r) {
  if (resultCategory(r) === 'vacant_lot') return 'vacant';
  if (r.leadTier) return String(r.leadTier).replace('well-maintained', 'well_maintained');
  const score = typeof r.score === 'number' ? r.score : 0;
  return score >= 6 ? 'distressed' : 'well_maintained';
}

function computeNeedsReview(r) {
  if (!r) return false;
  if (r.reviewResolved) return false;
  if (r.manuallyReviewed && !r.needsReviewLater) return false;
  if (r.needsReviewLater) return true;
  return false;
}

function isClassified(r) {
  return !computeNeedsReview(r);
}

const allReviewed = new Set();
for (const b of Object.values(buckets)) {
  for (const k of b || []) allReviewed.add(k);
}

function isExcludedFromWellMaintainedQueue(r) {
  const key = recordKey(r);
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed) return true;
  if (allReviewed.has(key)) return true;
  return false;
}

const wellMaintained = results.filter((r) => {
  if (!isClassified(r)) return false;
  if (resultCategory(r) !== 'property') return false;
  return resultLeadTier(r) === 'well_maintained';
});

const pending = wellMaintained.filter((r) => !isExcludedFromWellMaintainedQueue(r));
const excluded = wellMaintained.filter((r) => isExcludedFromWellMaintainedQueue(r));

const bucketSizes = {};
for (const [k, v] of Object.entries(buckets)) {
  bucketSizes[k] = Array.isArray(v) ? v.length : 0;
}

const wellKeys = new Set(buckets.well_maintained || []);
const manuallyReviewedWell = wellMaintained.filter((r) => r.manuallyReviewed);
const inWellBucketOnly = wellMaintained.filter((r) => wellKeys.has(recordKey(r)));
const excludedNotManuallyReviewed = excluded.filter((r) => !r.manuallyReviewed);
const excludedViaOtherBucketOnly = excludedNotManuallyReviewed.filter((r) => allReviewed.has(recordKey(r)));

console.log('=== Well Maintained Review Analysis ===');
console.log('Session:', path);
console.log('Total results:', results.length);
console.log('Well maintained tier count:', wellMaintained.length);
console.log('Pending in well maintained review queue:', pending.length);
console.log('Excluded (looks reviewed):', excluded.length);
console.log('Reviewed key bucket sizes:', bucketSizes);
console.log('All reviewed keys (union):', allReviewed.size);
console.log('Well-maintained with manuallyReviewed flag:', manuallyReviewedWell.length);
console.log('Excluded but NOT manuallyReviewed:', excludedNotManuallyReviewed.length);
console.log('Excluded only because key in reviewed union:', excludedViaOtherBucketOnly.length);

const bucketSets = Object.fromEntries(
  Object.entries(buckets).map(([k, v]) => [k, new Set(v || [])])
);
const bucketNames = Object.keys(bucketSets);
let allBucketsIdentical = true;
if (bucketNames.length > 1) {
  const first = bucketSets[bucketNames[0]];
  for (const name of bucketNames.slice(1)) {
    const s = bucketSets[name];
    if (s.size !== first.size) { allBucketsIdentical = false; break; }
    for (const key of first) {
      if (!s.has(key)) { allBucketsIdentical = false; break; }
    }
    if (!allBucketsIdentical) break;
  }
}
console.log('All review buckets identical (global mark migration):', allBucketsIdentical);

const wmProgress = progress.well_maintained;
if (wmProgress) {
  console.log('\nSaved well_maintained review progress:');
  console.log('  queue length:', wmProgress.queue?.length || 0);
  console.log('  index:', wmProgress.index);
  console.log('  stats:', wmProgress.stats);
} else {
  console.log('\nNo saved well_maintained reviewProgressByFilter');
}

console.log('\nSession review state on disk:');
console.log('  reviewFilter:', data.reviewFilter);
console.log('  reviewQueue length:', data.reviewQueue?.length || 0);
console.log('  reviewIndex:', data.reviewIndex);
console.log('  reviewMode:', data.reviewMode);

if (pending.length <= 20 && pending.length > 0) {
  console.log('\nSample pending leads:');
  for (const r of pending.slice(0, 5)) {
    console.log(' -', r.address);
  }
}

if (excludedViaOtherBucketOnly.length > 0) {
  console.log('\nSample excluded without manuallyReviewed (ghost-reviewed):');
  for (const r of excludedViaOtherBucketOnly.slice(0, 8)) {
    console.log(' -', r.address, { tier: resultLeadTier(r), score: r.score });
  }
}