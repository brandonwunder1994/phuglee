/**
 * Phase 45-02 — POST /api/bridge/brain/decisions (DEC-06 + wired DEC-01–05).
 * RED then GREEN via lib/bridge-api.js requireAdmin + handleBrainDecision.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalBrainRoot = config.BRIDGE_BRAIN_ROOT;
let tempBrainRoot;
let bridgeApi;

function createMockReq({ method = 'GET', url = '/', headers = {}, body = null }) {
  const { Readable } = require('stream');
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  if (body != null) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    queueMicrotask(() => {
      req.push(buf);
      req.push(null);
    });
  } else {
    queueMicrotask(() => {
      req.push(null);
    });
  }
  return req;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    bodyBuffer: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(data) {
      if (Buffer.isBuffer(data)) {
        this.bodyBuffer = data;
        this.body = data.toString('utf8');
      } else {
        this.body = typeof data === 'string' ? data : data?.toString('utf8') || '';
        this.bodyBuffer = Buffer.from(this.body, 'utf8');
      }
    },
    headersSent: false
  };
}

async function callBridge(method, pathname, { headers = {}, body = null } = {}) {
  const url = new URL(`http://127.0.0.1${pathname}`);
  const req = createMockReq({ method, url: url.pathname + url.search, headers, body });
  const res = createMockRes();
  const handled = await bridgeApi.handle(req, res, url.pathname, url);
  assert.equal(handled, true);
  let json = {};
  const contentType = String(res.headers['Content-Type'] || res.headers['content-type'] || '');
  if (res.body && contentType.includes('json')) {
    json = JSON.parse(res.body);
  } else if (res.body && res.body.trim().startsWith('{')) {
    try {
      json = JSON.parse(res.body);
    } catch (_) {}
  }
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    bodyBuffer: res.bodyBuffer,
    json
  };
}

function sampleRow(partial = {}) {
  return {
    rowId: partial.rowId || 'r_1',
    streetAddress: partial.streetAddress || '100 Main St',
    violationIssueType: partial.violationIssueType || 'Fence Permit',
    violationDate: partial.violationDate || '2024-01-01',
    descriptionNotes: partial.descriptionNotes || '',
    distressedSignalTag: partial.distressedSignalTag || 'Strong Distressed Signal',
    confidenceLevel: partial.confidenceLevel || 'high',
    ...partial
  };
}

function denyDistressedBody(overrides = {}) {
  const rows = overrides.rows || [
    sampleRow({ rowId: 'r_keep', violationIssueType: 'Weeds' }),
    sampleRow({ rowId: 'r_drop', violationIssueType: 'Fence Permit' })
  ];
  return {
    action: 'deny',
    section: 'distressed',
    groupId: 'g_fence',
    rowIds: ['r_drop'],
    violationTypeKey: 'fence permit',
    violationTypeLabel: 'Fence Permit',
    city: { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    sourceFile: 'test.csv',
    uploadType: 'code_violation',
    rows,
    notDistressedRows: [],
    sampleAddresses: ['100 Main St'],
    ...overrides
  };
}

function approveFnBody(overrides = {}) {
  const notDistressedRows = overrides.notDistressedRows || [
    sampleRow({
      rowId: 'fn_1',
      violationIssueType: 'Boarded Windows',
      distressedSignalTag: 'Standard'
    })
  ];
  return {
    action: 'approve',
    section: 'not_distressed',
    groupId: 'g_boarded',
    rowIds: ['fn_1'],
    violationTypeKey: 'boarded windows',
    violationTypeLabel: 'Boarded Windows',
    city: { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    sourceFile: 'test.csv',
    uploadType: 'code_violation',
    rows: [],
    notDistressedRows,
    ...overrides
  };
}

function jsonBody(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

function adminHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-phuglee-user': 'admin',
    ...extra
  };
}

before(() => {
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-api-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  // Fresh module load so any cached config paths stay correct
  delete require.cache[require.resolve('../lib/bridge-api')];
  delete require.cache[require.resolve('../lib/bridge-brain-store')];
  delete require.cache[require.resolve('../lib/bridge-brain-decisions')];
  bridgeApi = require('../lib/bridge-api');
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalBrainRoot;
  try {
    if (tempBrainRoot) fs.rmSync(tempBrainRoot, { recursive: true, force: true });
  } catch (_) {}
});

// ─── DEC-06: non-admin rejected ─────────────────────────────────────────────

test('DEC-06: non-admin POST returns 403 ADMIN_REQUIRED and does not write brain', async () => {
  const brainFile = path.join(config.BRIDGE_BRAIN_ROOT, 'global-brain.json');
  const existedBefore = fs.existsSync(brainFile);
  const beforeContent = existedBefore ? fs.readFileSync(brainFile, 'utf8') : null;

  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: {
      'content-type': 'application/json',
      'x-phuglee-user': 'bob'
    },
    body: jsonBody(denyDistressedBody())
  });

  assert.equal(status, 403);
  assert.equal(json.code, 'ADMIN_REQUIRED');

  if (!existedBefore) {
    assert.equal(fs.existsSync(brainFile), false, 'brain file must not be created for non-admin');
  } else {
    assert.equal(fs.readFileSync(brainFile, 'utf8'), beforeContent);
  }
});

test('DEC-06: missing x-phuglee-user returns 403 ADMIN_REQUIRED', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: { 'content-type': 'application/json' },
    body: jsonBody(denyDistressedBody())
  });
  assert.equal(status, 403);
  assert.equal(json.code, 'ADMIN_REQUIRED');
});

// ─── Admin happy paths ──────────────────────────────────────────────────────

test('admin distressed+deny removes rowIds, persists suppress_type, event.by=admin', async () => {
  const { loadBrain } = require('../lib/bridge-brain-store');

  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: jsonBody(denyDistressedBody())
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.rows));
  assert.equal(json.rows.some((r) => r.rowId === 'r_drop'), false);
  assert.equal(json.rows.some((r) => r.rowId === 'r_keep'), true);
  assert.ok(json.event);
  assert.equal(json.event.by, 'admin');
  assert.equal(json.event.action, 'deny_group');
  assert.ok(json.reviewGroups);
  assert.ok(json.brainSummary);
  assert.equal(json.statsPatch.kept, json.rows.length);
  assert.equal(json.statsPatch.notDistressed, json.notDistressedRows.length);

  const brain = loadBrain();
  const suppress = brain.typeRules.find(
    (r) => r.kind === 'suppress_type' && r.violationTypeKey === 'fence permit' && r.status === 'active'
  );
  assert.ok(suppress, 'active suppress_type must be persisted');
  assert.ok(brain.events.length >= 1);
});

test('admin not_distressed+approve promotes rows and persists promote_type', async () => {
  const { loadBrain } = require('../lib/bridge-brain-store');
  const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');

  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: jsonBody(approveFnBody())
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  const promoted = json.rows.find((r) => r.rowId === 'fn_1');
  assert.ok(promoted, 'promoted row should be in kept list');
  assert.equal(promoted.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.equal(json.notDistressedRows.some((r) => r.rowId === 'fn_1'), false);

  const brain = loadBrain();
  const promote = brain.typeRules.find(
    (r) => r.kind === 'promote_type' && r.violationTypeKey === 'boarded windows' && r.status === 'active'
  );
  assert.ok(promote, 'active promote_type must be persisted');
});

// ─── Validation errors ──────────────────────────────────────────────────────

test('invalid JSON body returns 400 INVALID_JSON', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: Buffer.from('{not-json', 'utf8')
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_JSON');
});

test('oversized body returns 413 PAYLOAD_TOO_LARGE', async () => {
  // Cap is 15_000_000 — send just over to avoid multi-second alloc when possible
  const oversize = Buffer.alloc(15_000_001, 0x61);
  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: oversize
  });
  assert.equal(status, 413);
  assert.equal(json.code, 'PAYLOAD_TOO_LARGE');
});

test('water_shut_off uploadType returns 400 WATER_TRAINING_UNSUPPORTED', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: jsonBody(denyDistressedBody({ uploadType: 'water_shut_off' }))
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'WATER_TRAINING_UNSUPPORTED');
});

test('invalid action returns 400', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/brain/decisions', {
    headers: adminHeaders(),
    body: jsonBody(denyDistressedBody({ action: 'maybe' }))
  });
  assert.equal(status, 400);
  assert.ok(
    json.code === 'INVALID_DECISION' || json.code === 'MISSING_FIELDS',
    `expected INVALID_DECISION or MISSING_FIELDS, got ${json.code}`
  );
});

// ─── PHRASE-03: GET /api/bridge/brain + POST rules/:id/status ────────────────

function seedBrainWithRules() {
  const { saveBrain, emptyBrain } = require('../lib/bridge-brain-store');
  const brain = emptyBrain();
  brain.version = 3;
  brain.typeRules = [
    {
      id: 'tr_active_1',
      kind: 'suppress_type',
      violationTypeKey: 'fence permit',
      violationTypeLabel: 'Fence Permit',
      status: 'active',
      source: 'admin_review',
      createdAt: '2026-07-01T00:00:00.000Z',
      hitCount: 1
    }
  ];
  brain.phraseRules = [
    {
      id: 'pr_proposed_1',
      kind: 'suppress_phrase',
      pattern: 'administrative only',
      patternType: 'literal',
      status: 'proposed',
      evidenceEventIds: ['ev_1', 'ev_2'],
      createdAt: '2026-07-02T00:00:00.000Z',
      reviewedAt: null,
      reviewedBy: null
    },
    {
      id: 'pr_active_1',
      kind: 'promote_phrase',
      pattern: 'boarded windows',
      patternType: 'literal',
      status: 'active',
      evidenceEventIds: ['ev_3'],
      createdAt: '2026-07-03T00:00:00.000Z',
      reviewedAt: '2026-07-04T00:00:00.000Z',
      reviewedBy: 'admin'
    }
  ];
  brain.metrics = {
    totalDecisions: 2,
    typeRulesActive: 1,
    phraseRulesActive: 1,
    phraseRulesProposed: 1
  };
  brain.events = Array.from({ length: 25 }, (_, i) => ({
    id: `ev_seed_${i}`,
    at: `2026-07-01T00:00:${String(i).padStart(2, '0')}.000Z`,
    by: 'admin',
    action: 'deny_group'
  }));
  return saveBrain(brain);
}

test('PHRASE-03: non-admin GET /api/bridge/brain returns 403 ADMIN_REQUIRED', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/brain', {
    headers: { 'x-phuglee-user': 'bob' }
  });
  assert.equal(status, 403);
  assert.equal(json.code, 'ADMIN_REQUIRED');
});

test('PHRASE-03: admin GET /api/bridge/brain returns version, typeRules, phraseRules, metrics', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge('GET', '/api/bridge/brain', {
    headers: adminHeaders()
  });

  assert.equal(status, 200);
  assert.equal(json.version, 3);
  assert.ok(Array.isArray(json.typeRules));
  assert.ok(Array.isArray(json.phraseRules));
  assert.ok(json.metrics && typeof json.metrics === 'object');
  assert.equal(json.typeRules.length, 1);
  assert.equal(json.phraseRules.length, 2);
  assert.equal(json.metrics.typeRulesActive, 1);
  assert.equal(json.metrics.phraseRulesProposed, 1);
  // Events omitted or capped to tail of 20
  if (Array.isArray(json.events)) {
    assert.ok(json.events.length <= 20, 'events tail must be ≤20');
  }
});

test('PHRASE-03: non-admin POST rules/:id/status returns 403 ADMIN_REQUIRED', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/pr_proposed_1/status',
    {
      headers: {
        'content-type': 'application/json',
        'x-phuglee-user': 'bob'
      },
      body: jsonBody({ status: 'active' })
    }
  );

  assert.equal(status, 403);
  assert.equal(json.code, 'ADMIN_REQUIRED');

  const { loadBrain } = require('../lib/bridge-brain-store');
  const brain = loadBrain();
  const rule = brain.phraseRules.find((r) => r.id === 'pr_proposed_1');
  assert.equal(rule.status, 'proposed', 'non-admin must not mutate status');
});

test('PHRASE-03: admin activate proposed phrase → active and persists', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/pr_proposed_1/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'active' })
    }
  );

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(json.rule);
  assert.equal(json.rule.status, 'active');
  assert.equal(json.rule.id, 'pr_proposed_1');
  assert.ok(json.rule.reviewedAt);
  assert.equal(json.rule.reviewedBy, 'admin');
  assert.ok(json.brainSummary);
  assert.ok(json.brainSummary.version >= 3);

  const { loadBrain } = require('../lib/bridge-brain-store');
  const brain = loadBrain();
  const rule = brain.phraseRules.find((r) => r.id === 'pr_proposed_1');
  assert.equal(rule.status, 'active');
  assert.equal(rule.reviewedBy, 'admin');
});

test('PHRASE-03: admin reject proposed phrase → rejected', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/pr_proposed_1/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'rejected' })
    }
  );

  assert.equal(status, 200);
  assert.equal(json.rule.status, 'rejected');

  const { loadBrain } = require('../lib/bridge-brain-store');
  const brain = loadBrain();
  assert.equal(brain.phraseRules.find((r) => r.id === 'pr_proposed_1').status, 'rejected');
});

test('PHRASE-03: admin disable active type rule → disabled', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/tr_active_1/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'disabled' })
    }
  );

  assert.equal(status, 200);
  assert.equal(json.rule.status, 'disabled');

  const { loadBrain } = require('../lib/bridge-brain-store');
  const brain = loadBrain();
  assert.equal(brain.typeRules.find((r) => r.id === 'tr_active_1').status, 'disabled');
});

test('PHRASE-03: admin disable active phrase → disabled', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/pr_active_1/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'disabled' })
    }
  );

  assert.equal(status, 200);
  assert.equal(json.rule.status, 'disabled');
});

test('PHRASE-03: unknown rule id → 404 RULE_NOT_FOUND', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/missing_rule_xyz/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'active' })
    }
  );

  assert.equal(status, 404);
  assert.equal(json.code, 'RULE_NOT_FOUND');
});

test('PHRASE-03: invalid status body → 400 INVALID_STATUS', async () => {
  seedBrainWithRules();

  const { status, json } = await callBridge(
    'POST',
    '/api/bridge/brain/rules/pr_proposed_1/status',
    {
      headers: adminHeaders(),
      body: jsonBody({ status: 'banana' })
    }
  );

  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_STATUS');
});
