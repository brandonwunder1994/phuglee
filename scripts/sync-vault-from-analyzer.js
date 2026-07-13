#!/usr/bin/env node
/**
 * Sync manually reviewed Analyzer results into the Vault catalog.
 * Usage: node scripts/sync-vault-from-analyzer.js [--force]
 */
const { syncAnalyzerSessions, getLastSyncStats } = require('../lib/leads-platform/analyzer-sync');

const force = process.argv.includes('--force');
const stats = syncAnalyzerSessions({ force });
console.log(JSON.stringify({ ok: true, sync: stats || getLastSyncStats() }, null, 2));
