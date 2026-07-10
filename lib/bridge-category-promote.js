/**
 * Pure category promotion helpers (MAP-01/02/03).
 * When violationIssueType is empty after mapRawRow, copy a real city category
 * from unmapped category-like headers. Never invent from free-text noise.
 */

const CATEGORY_HEADER_RE =
  /\b(cat|category|type|vio|violation|issue|offense|charge|ordinance|complaint|problem|infraction|code\s*type|case\s*type)\b/i;
const NARRATIVE_HEADER_RE =
  /\b(description|notes|comments|narrative|remarks|memo|findings|observation|detail)\b/i;
const TIMESTAMP_ONLY_RE =
  /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

/**
 * True when header looks like a category/issue-type column (not narrative).
 * @param {string} header
 * @returns {boolean}
 */
function isCategoryLikeHeader(header) {
  const h = String(header || '').trim();
  if (!h || NARRATIVE_HEADER_RE.test(h)) return false;
  return CATEGORY_HEADER_RE.test(h);
}

/**
 * When mapped.violationIssueType is empty, copy first non-empty category-like
 * unmapped cell (stable header order). Never invent from free-text dumps.
 * @param {object} rawRow
 * @param {string[]} headers
 * @param {object} columnMap
 * @param {object} mapped
 * @returns {string} promoted type or ''
 */
function promoteCategoryFromRaw(rawRow, headers, columnMap, mapped) {
  if (String(mapped?.violationIssueType || '').trim()) {
    return String(mapped.violationIssueType).trim();
  }
  const used = new Set(Object.values(columnMap || {}).filter(Boolean));
  for (const header of headers || []) {
    if (!header || used.has(header)) continue;
    if (!isCategoryLikeHeader(header)) continue;
    const cell = String(rawRow?.[header] ?? '').trim();
    if (!cell || cell.length > 120) continue;
    if (TIMESTAMP_ONLY_RE.test(cell)) continue;
    return cell; // first wins — do not concatenate
  }
  return '';
}

module.exports = {
  isCategoryLikeHeader,
  promoteCategoryFromRaw,
  CATEGORY_HEADER_RE,
  NARRATIVE_HEADER_RE,
  TIMESTAMP_ONLY_RE
};
