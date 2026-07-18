(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.analyzeVisibility = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function analyzeVisibilityFactory() {
  /**
   * Rankings / cards / table workbench on Analyze is retired.
   * Session results data stays; operators use Review Leads → Vault.
   */
  const RESULTS_WORKBENCH_ENABLED = false;

  function getAnalyzeZones(input) {
    const hasResults = !!input.hasResults;
    const isScanning = !!input.isScanning;
    const pastMarketsOpen = !!input.pastMarketsOpen;

    const showPipeline = true;
    const showScanDesk = true;
    const showLiveScan = isScanning;
    // Live scan KPIs own the five buckets while scanning; session strip is post-scan truth only
    const showSessionKpis = hasResults && !isScanning;
    // Intentionally ignore resultsWorkbenchOpen — UI removed from Analyze
    const showResultsWorkbench = false;
    let pastMarketsMode = 'control';
    if (pastMarketsOpen) pastMarketsMode = 'expanded';

    return {
      showPipeline,
      showScanDesk,
      showLiveScan,
      showSessionKpis,
      showResultsWorkbench,
      showPastMarketsExpanded: pastMarketsMode === 'expanded',
      pastMarketsMode,
      resultsWorkbenchEnabled: RESULTS_WORKBENCH_ENABLED
    };
  }

  return { getAnalyzeZones, RESULTS_WORKBENCH_ENABLED };
});
