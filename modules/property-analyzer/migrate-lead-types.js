#!/usr/bin/env node
/**
 * Tags all leads without a leadType as Code Violation and bumps session schema to v5.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const SESSION_FILE = path.join(ROOT, 'distressAnalyzerSession_LATEST.json');
const DEFAULT_LEAD_TYPE = 'code_violation';
const SESSION_SCHEMA_VERSION = 6;
const BACKUP_FILE = path.join(
  ROOT,
  `distressAnalyzerSession_BEFORE_LEAD_TYPES_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`
);

function ensureLeadType(item) {
  if (item.leadType) return { item, changed: false };
  return { item: { ...item, leadType: DEFAULT_LEAD_TYPE }, changed: true };
}

function postSession(session) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(session);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3456,
      path: '/api/session-backup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function main() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('Session file not found:', SESSION_FILE);
    process.exit(1);
  }

  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(session, null, 2), 'utf8');
  console.log('Backup written:', BACKUP_FILE);

  let changed = 0;
  session.records = (session.records || []).map((r) => {
    const { item, changed: c } = ensureLeadType(r);
    if (c) changed++;
    return item;
  });
  session.results = (session.results || []).map((r) => {
    const { item, changed: c } = ensureLeadType(r);
    if (c) changed++;
    return item;
  });

  session.sessionSchemaVersion = SESSION_SCHEMA_VERSION;
  if (!session.importLeadType) session.importLeadType = DEFAULT_LEAD_TYPE;
  if (!session.leadTypeFilter) session.leadTypeFilter = 'all';
  session.savedAt = Date.now();

  fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf8');
  console.log(`Tagged ${changed} record/result entries as Code Violation`);
  console.log('Session schema ->', SESSION_SCHEMA_VERSION);

  postSession(session)
    .then((res) => {
      if (res.ok) console.log('Posted migrated session to server');
      else console.warn('Server POST response:', res);
    })
    .catch((err) => {
      console.warn('Could not POST to server (is it running?):', err.message);
      console.log('Local session file was still updated.');
    });
}

main();