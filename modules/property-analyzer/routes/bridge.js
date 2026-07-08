const { buildImportAddressIndex } = require('../lib/import-address-index');
const { appendRecordsToSession } = require('../lib/bridge-import-records');
const { readScopeFromRequest } = require('../lib/user-session');

function register(ctx) {
  const { router, sendJson, readBody, backups, config } = ctx;
  const { writeFileAtomic } = require('../lib/fs-atomic');

  router.get('/api/import-address-index', async (req, res) => {
    const { session } = backups.loadSessionForRequest(req);
    const index = buildImportAddressIndex(finalizeSession(backups, session));
    sendJson(res, 200, {
      ok: true,
      count: index.count,
      sources: index.sources,
      addresses: index.addresses
    });
    return true;
  });

  router.post('/api/bridge-import-records', async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + err.message });
      return true;
    }

    const records = Array.isArray(body.records) ? body.records : [];
    if (!records.length) {
      sendJson(res, 400, { ok: false, error: 'records must be a non-empty array' });
      return true;
    }

    for (const record of records) {
      if (!record || typeof record !== 'object' || !String(record.address || '').trim()) {
        sendJson(res, 400, { ok: false, error: 'Each record requires a usable address' });
        return true;
      }
    }

    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(backups, session);
    const merged = appendRecordsToSession(base, records);
    merged.session.fileName = String(body.sourceFile || merged.session.fileName || 'Filter import').trim();
    if (body.uploadType) {
      merged.session.importLeadType = String(body.uploadType).trim();
    }

    backups.writeLatestSessionFileForScope(scope, merged.session);

    sendJson(res, 200, {
      ok: true,
      added: merged.added,
      skipped: merged.skipped,
      totalRecords: merged.totalRecords,
      fileName: merged.session.fileName,
      scope: scope.kind,
      storageKey: scope.storageKey
    });
    return true;
  });
}

function finalizeSession(backups, session) {
  return backups.promoteMergedSessionIfBetter(session);
}

module.exports = { register };