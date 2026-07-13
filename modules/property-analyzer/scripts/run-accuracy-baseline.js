#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  computeCorrectionMetrics,
  formatMetricsReport
} = require('../lib/classification-metrics');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

function extractCorrections(session) {
  if (!session) return [];
  if (Array.isArray(session.tierCorrections)) return session.tierCorrections;
  if (Array.isArray(session.corrections)) return session.corrections;
  return [];
}

const inputPath = process.argv[2]
  || process.env.PDA_SESSION_PATH
  || path.join(process.env.PDA_DATA_ROOT || path.join(__dirname, '..'), 'distressAnalyzerSession_LATEST.json');

if (!fs.existsSync(inputPath)) {
  console.error(`Session file not found (read-only): ${inputPath}`);
  console.error('Usage: node scripts/run-accuracy-baseline.js [path/to/session.json]');
  process.exit(1);
}

const session = readJsonSafe(inputPath);
const corrections = extractCorrections(session);
const metrics = computeCorrectionMetrics(corrections);

console.log(`Accuracy baseline (read-only): ${inputPath}`);
console.log(formatMetricsReport(metrics));
console.log('');
console.log(`Session results count: ${Array.isArray(session.results) ? session.results.length : 'n/a'}`);
