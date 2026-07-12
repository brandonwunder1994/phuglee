const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getAnalyzeZones } = require('../lib/analyze-visibility');

describe('getAnalyzeZones', () => {
  it('empty session: scan desk only, no KPIs or results', () => {
    const z = getAnalyzeZones({
      hasRecords: false,
      hasResults: false,
      isScanning: false,
      resultsWorkbenchOpen: false,
      pastMarketsOpen: false
    });
    assert.equal(z.showScanDesk, true);
    assert.equal(z.showLiveScan, false);
    assert.equal(z.showSessionKpis, false);
    assert.equal(z.showResultsWorkbench, false);
    assert.equal(z.pastMarketsMode, 'control');
  });

  it('list ready not scanning: no KPI strip, no rankings', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: false,
      isScanning: false,
      resultsWorkbenchOpen: false,
      pastMarketsOpen: false
    });
    assert.equal(z.showScanDesk, true);
    assert.equal(z.showSessionKpis, false);
    assert.equal(z.showResultsWorkbench, false);
  });

  it('scanning: live + KPIs on, results off', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: true,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: false
    });
    assert.equal(z.showLiveScan, true);
    assert.equal(z.showSessionKpis, true);
    assert.equal(z.showResultsWorkbench, false);
  });

  it('has results idle with workbench open', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: false,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: false
    });
    assert.equal(z.showSessionKpis, true);
    assert.equal(z.showResultsWorkbench, true);
    assert.equal(z.showLiveScan, false);
  });

  it('past markets expanded only when flagged', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: false,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: true
    });
    assert.equal(z.pastMarketsMode, 'expanded');
  });
});
