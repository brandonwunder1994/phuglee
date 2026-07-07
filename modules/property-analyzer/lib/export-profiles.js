/**
 * Export profile column contracts — keep in sync with public/js/render.js buildExportRows.
 */
const FULL_EXPORT_COLUMNS = Object.freeze([
  'First Name',
  'Last Name',
  'Phone',
  'Email',
  'Street Address',
  'City',
  'State',
  'Postal Code',
  'Lead Type',
  'Lead Tier',
  'Category',
  'Category Changed By You',
  'Distress Score',
  'AI Original Score',
  'Score Adjusted By You',
  'Manually Reviewed',
  'AI Confidence',
  'Needs Review',
  'Needs Review Later',
  'Satellite Check',
  'Satellite Roof',
  'Satellite Yard',
  'Aerial Distress Score',
  'Street View Skipped',
  'Quality Flags',
  'D4D Indicators',
  'Why This Tier',
  'Reason',
  'Tags',
  'Exported At'
]);

/** Signature columns that distinguish full profile from dial_ready. */
const FULL_EXPORT_SIGNATURE_COLUMNS = Object.freeze([
  'First Name',
  'Last Name',
  'Distress Score',
  'D4D Indicators',
  'Why This Tier'
]);

module.exports = {
  FULL_EXPORT_COLUMNS,
  FULL_EXPORT_SIGNATURE_COLUMNS
};