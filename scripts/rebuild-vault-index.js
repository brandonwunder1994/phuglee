#!/usr/bin/env node
/** Rebuild leads-catalog index.json from on-disk lead files (fast list API). */
const { rebuildIndexFromLeads, readIndex } = require('../lib/leads-platform/store');

const t = Date.now();
const result = rebuildIndexFromLeads();
const index = readIndex();
console.log(JSON.stringify({
  ok: true,
  rebuilt: result.rebuilt,
  indexSize: index.length,
  ms: Date.now() - t
}, null, 2));
