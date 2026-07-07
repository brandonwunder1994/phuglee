const { buildImportAddressIndex } = require('../lib/import-address-index');
const { appendRecordsToSession } = require('../lib/bridge-import-records');

function register(ctx) {
  const { router, sendJson, readBody, backups, config, fs, path } = ctx;
  const { DATA_ROOT, SESSION_LATEST_FILE } = config;
  const { writeFileAtomic } = require('../lib/fs-atomic');

  router.get('/api/import-address-index', async (req, res) => {
    const session = backups.promoteMergedSessionIfBetter(
      backups.mergeIncrementalIntoSession(backups.readLatestSessionFile())
    );
    const index = buildImportAddressIndex(session);
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

    const latestPath = path.join(DATA_ROOT, SESSION_LATEST_FILE);
    let session = backups.promoteMergedSessionIfBetter(
      backups.mergeIncrementalIntoSession(backups.readLatestSessionFile())
    );
    if (!session || typeof session !== 'object') session = {};

    const merged = appendRecordsToSession(session, records);
    merged.session.fileName = String(body.sourceFile || merged.session.fileName || 'Data Bridge import').trim();
    if (body.uploadType) {
      merged.session.importLeadType = String(body.uploadType).trim();
    }

    writeFileAtomic(latestPath, JSON.stringify(merged.session));
    backups.invalidateSessionCaches();

    sendJson(res, 200, {
      ok: true,
      added: merged.added,
      skipped: merged.skipped,
      totalRecords: merged.totalRecords,
      fileName: merged.session.fileName
    });
    return true;
  });
}

module.exports = { register };