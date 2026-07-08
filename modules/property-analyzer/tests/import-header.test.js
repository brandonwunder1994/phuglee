const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveImportLocation,
  countUnscannedLeads,
  formatImportLocation
} = require('../lib/import-meta');

const recordKey = (r) => `${r.street}|${r.city}|${r.state}`;

function buildImportHeaderCopy(state) {
  const source = state.records.length ? state.records : state.results;
  if (state.records.length) {
    const loc = deriveImportLocation(state.records);
    const pending = countUnscannedLeads(state.records, state.results, recordKey);
    const title = formatImportLocation(loc) || state.fileName || 'Analyze';
    const analyzed = state.results.length;
    const tagline = pending > 0
      ? (analyzed > 0
        ? `${pending.toLocaleString()} leads ready to scan (${analyzed.toLocaleString()} already analyzed)`
        : `${pending.toLocaleString()} leads ready to scan`)
      : `${state.records.length.toLocaleString()} leads loaded — hit Start Scan`;
    return { title, tagline, scanTitle: `${title} — ready to scan` };
  }
  return { title: 'Analyze', tagline: 'default', scanTitle: 'Scanning' };
}

describe('import header copy', () => {
  it('shows city/state and pending lead count for a fresh import', () => {
    const copy = buildImportHeaderCopy({
      records: [
        { street: '1 A', city: 'Waxahachie', state: 'TX' },
        { street: '2 B', city: 'Waxahachie', state: 'TX' }
      ],
      results: [],
      fileName: 'leads.xlsx'
    });
    assert.equal(copy.title, 'Waxahachie, TX');
    assert.match(copy.tagline, /2 leads ready to scan/);
    assert.match(copy.scanTitle, /Waxahachie, TX — ready to scan/);
  });
});