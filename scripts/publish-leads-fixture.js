#!/usr/bin/env node
/**
 * Load fixture leads into the catalog for local dev / admin seeding.
 * Usage: node scripts/publish-leads-fixture.js [--force-approve]
 */
const fs = require('fs');
const path = require('path');
const { publishLead } = require('../lib/leads-platform/publish');

const FIXTURE_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'leads');
const forceApprove = process.argv.includes('--force-approve');

function main() {
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
    publishLead(raw, { forceApprove: forceApprove || raw.reviewStatus === 'approved' });
    count += 1;
    console.log('Published', raw.leadId || file);
  }
  console.log(`Done — ${count} leads in catalog.`);
}

main();
