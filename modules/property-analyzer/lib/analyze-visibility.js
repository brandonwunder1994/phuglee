(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.analyzeVisibility = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function analyzeVisibilityFactory() {
  function getAnalyzeZones(input) {
    const hasRecords = !!input.hasRecords;
    const hasResults = !!input.hasResults;
    const isScanning = !!input.isScanning;
    const resultsWorkbenchOpen = !!input.resultsWorkbenchOpen;
    const pastMarketsOpen = !!input.pastMarketsOpen;

    const showPipeline = true;
    const showScanDesk = true;
    const showLiveScan = isScanning;
    const showSessionKpis = isScanning || hasResults;
    const showResultsWorkbench = !isScanning && hasResults && resultsWorkbenchOpen;
    let pastMarketsMode = 'control';
    if (pastMarketsOpen) pastMarketsMode = 'expanded';

    return {
      showPipeline,
      showScanDesk,
      showLiveScan,
      showSessionKpis,
      showResultsWorkbench,
      showPastMarketsExpanded: pastMarketsMode === 'expanded',
      pastMarketsMode
    };
  }

  return { getAnalyzeZones };
});
