#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  computeCorrectionMetrics,
  formatMetricsReport
} = require('../lib/classification-metrics');
const { formatCostEstimate, estimateApiCallsPer1kLeads } = require('../lib/scale-policy');

const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'tier-correction-metrics.json');
const inputPath = process.argv[2];

let corrections;
if (inputPath && fs.existsSync(inputPath)) {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  corrections = Array.isArray(raw) ? raw : raw.tierCorrections || raw.corrections || [];
} else {
  corrections = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).sampleCorrections;
}

const metrics = computeCorrectionMetrics(corrections);
console.log(formatMetricsReport(metrics));
console.log('');
console.log(formatCostEstimate(estimateApiCallsPer1kLeads()));