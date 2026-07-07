const { computeNeedsReview } = require('../lib/result-classify');
const fs = require('fs');
const path = process.argv[2] || 'distressAnalyzerSession_LATEST.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const results = data.results || [];
const buckets = data.reviewedKeysByFilter || {};
const allReviewed = new Set();
for (const k of Object.keys(buckets)) {
  for (const key of buckets[k] || []) allReviewed.add(key);
}
function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}
function isExcludedFromQueue(r) {
  if (r.manuallyReviewed || r.reviewResolved) return true;
  if (allReviewed.has(recordKey(r))) return true;
  return false;
}

const needsReview = results.filter((r) => computeNeedsReview(r));
const needsButExcluded = needsReview.filter((r) => isExcludedFromQueue(r));
const needsInQueue = needsReview.filter((r) => !isExcludedFromQueue(r));

console.log('Session:', path);
console.log('Total results:', results.length);
console.log('computeNeedsReview (dashboard count):', needsReview.length);
console.log('Excluded from review queue:', needsButExcluded.length);
console.log('Still pending in review queue:', needsInQueue.length);

const breakdown = {};
for (const r of needsReview) {
  const tags = [];
  if (r.needsReviewLater) tags.push('needsReviewLater');
  if (r.manuallyReviewed) tags.push('manuallyReviewed');
  if (r.reviewResolved) tags.push('reviewResolved');
  if (allReviewed.has(recordKey(r))) tags.push('inReviewedKeys');
  if (!r.manuallyReviewed && !r.reviewResolved && !allReviewed.has(recordKey(r))) tags.push('neverReviewed');
  const t = tags.join('+') || 'none';
  breakdown[t] = (breakdown[t] || 0) + 1;
}
console.log('Breakdown:', JSON.stringify(breakdown, null, 2));

if (needsButExcluded.length) {
  console.log('\nSample excluded (dashboard shows, review queue empty):');
  for (const r of needsButExcluded.slice(0, 10)) {
    console.log(' -', r.address, {
      manuallyReviewed: r.manuallyReviewed,
      reviewResolved: r.reviewResolved,
      needsReviewLater: r.needsReviewLater,
      via: r.manuallyReviewedVia
    });
  }
}

if (needsInQueue.length) {
  console.log('\nSample still in queue:');
  for (const r of needsInQueue.slice(0, 10)) {
    console.log(' -', r.address, {
      manuallyReviewed: r.manuallyReviewed,
      reviewResolved: r.reviewResolved,
      needsReviewLater: r.needsReviewLater,
      confidence: r.confidence
    });
  }
}