const fs = require('fs');
const http = require('http');
const path = require('path');
const config = require('./config');
const { buildFullAddress } = require('./bridge-schema');
const { loadImportAddressIndex } = require('./analyzer-import-index');
const { resolveSessionScope, scopeSessionPath } = require('./phuglee-user');
const { readAnalyzerAuthToken } = require('./analyzer-auth');

const SESSION_FILE = 'distressAnalyzerSession_LATEST.json';

const UPLOAD_TO_LEAD_TYPE = {
  code_violation: 'code_violation',
  water_shut_off: 'water_shut_off'
};

function analyzerRecordKey(record) {
  return `${record.email || ''}|${record.phone || ''}|${record.address || ''}`;
}

function bridgeRowsToAnalyzerRecords(rows, { uploadType, sourceFile } = {}) {
  const leadType = UPLOAD_TO_LEAD_TYPE[uploadType] || 'code_violation';
  return rows.map((row) => {
    const street = String(row.streetAddress || '').trim();
    const city = String(row.city || '').trim();
    const state = String(row.state || '').trim();
    const postal = String(row.zip || '').trim();
    const address = buildFullAddress(street, city, state, postal);
    return {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      street,
      city,
      state,
      postal,
      address,
      leadType,
      bridgeSource: 'data_bridge',
      bridgeTag: row.distressedSignalTag || '',
      bridgeIssueType: row.violationIssueType || '',
      bridgeNotes: row.descriptionNotes || '',
      bridgeViolationDate: row.violationDate || '',
      bridgeSourceFile: sourceFile || row.sourceFile || ''
    };
  }).filter((record) => record.address.length > 0);
}

function resolvePushScope(meta = {}) {
  return resolveSessionScope({
    username: meta.username || '',
    plan: meta.plan || ''
  });
}

function readSessionFromDisk(scope) {
  const file = scopeSessionPath(config.ANALYZER_DATA_ROOT, SESSION_FILE, scope);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn('[Bridge] Could not read analyzer session:', err.message);
    return null;
  }
}

function appendRecordsLocally(session, records, meta, scope) {
  const base = session && typeof session === 'object' ? session : {};
  const existingRecords = Array.isArray(base.records) ? base.records : [];
  const existingResults = Array.isArray(base.results) ? base.results : [];
  const existingKeys = new Set();
  for (const row of [...existingRecords, ...existingResults]) {
    const key = analyzerRecordKey(row);
    if (key) existingKeys.add(key);
  }

  const added = [];
  let skipped = 0;
  for (const row of records) {
    const key = analyzerRecordKey(row);
    if (!key || existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    added.push(row);
  }

  const merged = {
    ...base,
    records: [...existingRecords, ...added],
    results: existingResults,
    processed: Number(base.processed) || 0,
    savedAt: Date.now(),
    fileName: meta.sourceFile || base.fileName || 'Filter import',
    importLeadType: meta.uploadType || base.importLeadType || 'code_violation'
  };

  const file = scopeSessionPath(config.ANALYZER_DATA_ROOT, SESSION_FILE, scope);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged), 'utf8');

  return {
    ok: true,
    added: added.length,
    skipped,
    totalRecords: merged.records.length,
    mode: 'disk',
    scope: scope.kind,
    storageKey: scope.storageKey
  };
}

function postAnalyzerJson(pathname, payload, scope) {
  const body = JSON.stringify(payload);
  const token = readAnalyzerAuthToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  };
  if (token) headers['X-PDA-Token'] = token;
  if (scope?.username) headers['X-Phuglee-User'] = scope.username;
  if (scope?.plan) headers['X-Phuglee-Plan'] = scope.plan;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.ANALYZER_HOST,
        port: config.ANALYZER_PORT,
        path: pathname,
        method: 'POST',
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          let data = {};
          try {
            data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch (err) {
            reject(err);
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300 || !data.ok) {
            reject(new Error(data.error || `Analyzer request failed (${res.statusCode})`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function pushRowsToAnalyzer(rows, meta = {}) {
  const records = bridgeRowsToAnalyzerRecords(rows, meta);
  const scope = resolvePushScope(meta);
  if (!records.length) {
    return { ok: true, added: 0, skipped: 0, totalRecords: 0, mode: 'none' };
  }

  const sample = records[0] || {};
  const payload = {
    records,
    sourceFile: meta.sourceFile || '',
    uploadType: UPLOAD_TO_LEAD_TYPE[meta.uploadType] || meta.uploadType || 'code_violation',
    city: meta.city || sample.city || '',
    state: meta.state || sample.state || '',
    importedAt: Number(meta.importedAt) || Date.now()
  };

  try {
    const result = await postAnalyzerJson('/api/bridge-import-records', payload, scope);
    await loadImportAddressIndex({ force: true, username: scope.username, plan: scope.plan });
    return { ...result, mode: 'api' };
  } catch (err) {
    console.warn('[Bridge] Analyzer API import failed, trying disk merge:', err.message);
    const session = readSessionFromDisk(scope);
    const result = appendRecordsLocally(session, records, {
      sourceFile: meta.sourceFile,
      uploadType: payload.uploadType
    }, scope);
    await loadImportAddressIndex({ force: true, username: scope.username, plan: scope.plan });
    return result;
  }
}

module.exports = {
  UPLOAD_TO_LEAD_TYPE,
  analyzerRecordKey,
  bridgeRowsToAnalyzerRecords,
  pushRowsToAnalyzer
};