#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  loadGoldenCases,
  loadAuditRecords,
  replayGoldenSet,
  formatGoldenReport
} = require('../lib/golden-replay');

const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'golden-cases.json');
const auditDir = process.env.GEMINI_AUDIT_DIR
  || path.join(__dirname, '..', 'gemini_audit');

const cases = loadGoldenCases(fixturePath);
const auditRecords = loadAuditRecords(auditDir);

if (auditRecords.length) {
  console.log(`Note: ${auditRecords.length} parsed audit records available (fixture replay is authoritative).`);
}

const summary = replayGoldenSet(cases);
console.log(formatGoldenReport(summary));

if (summary.failed) process.exit(1);