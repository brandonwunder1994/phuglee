const {
  resultCategory,
  isBlurredImagery,
  isClassifiedResult,
  computeNeedsReview,
  resultLeadTier
} = require('./result-classify');

function computeTierCounts(results) {
  const list = results || [];
  let all = list.length;
  let distressed = 0;
  let well_maintained = 0;
  let vacant = 0;
  let blurred = 0;
  let review = 0;
  for (const r of list) {
    if (computeNeedsReview(r)) review++;
    if (isBlurredImagery(r)) blurred++;
    if (!isClassifiedResult(r)) continue;
    const cat = resultCategory(r);
    if (cat === 'vacant_lot') {
      vacant++;
      continue;
    }
    if (isBlurredImagery(r)) continue;
    if (cat !== 'property') continue;
    const tier = resultLeadTier(r);
    if (tier === 'distressed') distressed++;
    else if (tier === 'well_maintained') well_maintained++;
  }
  return normalizeTierCounts({ all, distressed, well_maintained, vacant, blurred, review }, list.length);
}

/** Ensure tierCounts.all reflects every scanned row, not classified-only. */
function normalizeTierCounts(counts, totalScanned) {
  const base = counts && typeof counts === 'object' ? { ...counts } : {};
  const total = Math.max(Number(totalScanned) || 0, Number(base.all) || 0);
  if (total > 0) base.all = total;
  return base;
}

module.exports = { computeTierCounts, normalizeTierCounts };