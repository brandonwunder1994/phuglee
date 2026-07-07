'use strict';

const fs = require('fs');
const path = require('path');
const { computeLeadTier, normalizeLeadTier } = require('./tier-engine');
const { resultLeadTier } = require('./result-classify');
const { applyLearnedTierRules } = require('./learned-rules');

function buildTierContext(record) {
  return {
    indicators: record.indicators,
    satelliteClassification: record.satelliteClassification,
    reason: record.reason
  };
}

function replayRecordTier(record) {
  if (record.leadTier) return normalizeLeadTier(resultLeadTier(record));
  const category = record.category || 'property';
  const tier = computeLeadTier(record.score, category, buildTierContext(record));
  return normalizeLeadTier(tier);
}

function replayRecordWithRules(record, rules) {
  const withTier = {
    ...record,
    leadTier: replayRecordTier(record)
  };
  const updated = applyLearnedTierRules(withTier, rules);
  return normalizeLeadTier(updated.leadTier || replayRecordTier(updated));
}

function replayGoldenCase(testCase, rules = []) {
  const record = testCase.record || {};
  const tier = rules.length
    ? replayRecordWithRules(record, rules)
    : replayRecordTier(record);
  const expected = normalizeLeadTier(testCase.expectedTier);
  const baseline = testCase.baselineTier
    ? normalizeLeadTier(testCase.baselineTier)
    : expected;

  return {
    id: testCase.id,
    source: testCase.source || 'fixture',
    expected,
    baseline,
    actual: tier,
    pass: tier === expected,
    changedFromBaseline: tier !== baseline
  };
}

function replayGoldenSet(cases, options = {}) {
  const rules = options.rules || [];
  const results = (cases || []).map((c) => replayGoldenCase(c, rules));
  const failed = results.filter((r) => !r.pass);
  const changed = results.filter((r) => r.changedFromBaseline);

  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    changedFromBaseline: changed.length,
    results,
    failedIds: failed.map((r) => r.id),
    changedIds: changed.map((r) => r.id)
  };
}

function loadGoldenCases(fixturePath) {
  const resolved = path.resolve(fixturePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (Array.isArray(raw)) return raw;
  return raw.cases || [];
}

function loadAuditRecords(auditDir) {
  if (!auditDir || !fs.existsSync(auditDir)) return [];

  const files = fs.readdirSync(auditDir)
    .filter((f) => f.startsWith('gemini_audit_') && f.endsWith('.jsonl'))
    .map((f) => path.join(auditDir, f));

  const rows = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row.parsedRecord) rows.push(row.parsedRecord);
      } catch (_) {}
    }
  }
  return rows;
}

function formatGoldenReport(summary) {
  const lines = [
    `Golden set: ${summary.passed}/${summary.total} passed`,
    `Baseline changes: ${summary.changedFromBaseline}`
  ];
  if (summary.failedIds.length) {
    lines.push(`Failures: ${summary.failedIds.join(', ')}`);
  }
  if (summary.changedIds.length) {
    lines.push(`Changed: ${summary.changedIds.join(', ')}`);
  }
  return lines.join('\n');
}

module.exports = {
  replayRecordTier,
  replayRecordWithRules,
  replayGoldenCase,
  replayGoldenSet,
  loadGoldenCases,
  loadAuditRecords,
  formatGoldenReport
};