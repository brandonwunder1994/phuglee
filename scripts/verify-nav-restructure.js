const fs = require('fs');
const checks = {
  collectTrackProgress: fs.readFileSync('public/collect.html', 'utf8').includes('Track Progress'),
  settingsOperatingCosts: fs.readFileSync('public/js/settings-menu.js', 'utf8').includes('Operating Costs'),
  settingsNoSalesPipeline: !fs.readFileSync('public/js/settings-menu.js', 'utf8').includes('Sales Pipeline'),
  settingsNoContractTracker: !fs.readFileSync('public/js/settings-menu.js', 'utf8').includes('Contract Tracker'),
  pipelineAllLeads: fs.readFileSync('public/pipeline.html', 'utf8').includes('All Leads'),
  shellHasDataDropdown: fs.readFileSync('public/js/shell-nav.js', 'utf8').includes('buildDataDropdown'),
  shellHasPipelineDropdown: fs.readFileSync('public/js/shell-nav.js', 'utf8').includes('buildPipelineDropdown'),
  shellNoCityTrackerLabel: !fs.readFileSync('public/js/shell-nav.js', 'utf8').includes("label: 'City Tracker'")
};
console.log(checks);
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('feature checks ok');
