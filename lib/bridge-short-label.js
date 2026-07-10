/**
 * Pure display-only short labels for Train / review group titles.
 * Never used for group keys, export, brain rules, or stored violationIssueType.
 */

const { stripIncidentalTimestamps } = require('./bridge-stable-text');

/** Default max display length (REQUIREMENTS ~48–64; research lock: 56). */
const DEFAULT_MAX = 56;

/**
 * Deterministic display shortener for long type/description walls.
 * Prefer natural em/en dash or clause breaks; else word-boundary hard max + ….
 *
 * Natural dash/clause detection runs on whitespace-normalized raw text so
 * stripIncidentalTimestamps (which cleans dangling separators) does not
 * destroy em/en dash break points before we can use them.
 *
 * @param {unknown} text
 * @param {{ maxLen?: number }} [opts]
 * @returns {string}
 */
function shortLabelForDisplay(text, { maxLen = DEFAULT_MAX } = {}) {
  const raw = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  // Prefer natural breaks while dashes/clauses are still intact
  if (raw.length > maxLen) {
    const dashSplit = raw.split(/\s*[—–]\s*|\s+-\s+/);
    const leftDash = dashSplit[0] ? dashSplit[0].trim() : '';
    if (leftDash.length >= 12 && leftDash.length <= maxLen) {
      const cleaned = stripIncidentalTimestamps(leftDash);
      return cleaned || leftDash;
    }

    const clause = raw.match(/^(.{12,}?)[.|;]\s/);
    if (clause && clause[1].length <= maxLen) {
      const leftClause = clause[1].trim();
      const cleaned = stripIncidentalTimestamps(leftClause);
      return cleaned || leftClause;
    }
  }

  // Timestamp clean for passthrough + hard-max paths
  let s = stripIncidentalTimestamps(raw);
  if (!s) return '';
  if (s.length <= maxLen) return s;

  // Word-boundary hard max + unicode ellipsis
  let cut = s.slice(0, maxLen - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp >= 12) cut = cut.slice(0, sp);
  return cut.trimEnd() + '…';
}

module.exports = { shortLabelForDisplay, DEFAULT_MAX };
