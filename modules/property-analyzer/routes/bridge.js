const { buildImportAddressIndex } = require('../lib/import-address-index');
const { appendRecordsToSession } = require('../lib/bridge-import-records');
const { applyProfilePatchesToSession } = require('../lib/profile-enrich');
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
      addresses: index.addresses,
      // Authoritative scan-desk keys — must match browser addressMatchKey()
      matchKeys: index.matchKeys,
      matchKeysLoose: index.matchKeysLoose,
      matchKeysWithQueue: index.matchKeysWithQueue,
      resultsCount: index.resultsCount,
      recordsCount: index.recordsCount
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
    const sample = records[0] || {};
    const merged = appendRecordsToSession(base, records, {
      city: body.city || sample.city,
      state: body.state || sample.state,
      sourceFile: body.sourceFile || sample.bridgeSourceFile || '',
      importedAt: Number(body.importedAt) || Date.now()
    });
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

  /**
   * Chunked profile enrichment for existing scanned leads.
   * Body: { patches: [{ street, city, state, postal, address, profile, marketValue, ... }] }
   * Matches by normalized address; writes only extra profile fields.
   */
  router.post('/api/enrich-profiles', async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + err.message });
      return true;
    }

    const patches = Array.isArray(body.patches) ? body.patches : [];
    if (!patches.length) {
      sendJson(res, 400, { ok: false, error: 'patches must be a non-empty array' });
      return true;
    }
    if (patches.length > 500) {
      sendJson(res, 400, { ok: false, error: 'patches max 500 per request' });
      return true;
    }
    for (const p of patches) {
      if (!p || typeof p !== 'object' || !p.profile || typeof p.profile !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Each patch requires a profile object' });
        return true;
      }
      const hasAddr =
        String(p.address || '').trim() ||
        (String(p.street || '').trim() && String(p.city || '').trim());
      if (!hasAddr) {
        sendJson(res, 400, { ok: false, error: 'Each patch requires address or street+city' });
        return true;
      }
    }

    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(backups, session);
    const merged = applyProfilePatchesToSession(base, patches);
    merged.session.profileEnrichment = {
      ...(base.profileEnrichment || {}),
      source: body.source || 'desktop-csv-profile-stack',
      lastChunkAt: new Date().toISOString(),
      lastResultsUpdated: merged.resultsUpdated,
      lastRecordsUpdated: merged.recordsUpdated
    };

    // Session rewrites need free disk (Railway volumes fill with rejected backups).
    try {
      const sessionRoutes = require('./session');
      if (typeof sessionRoutes.freeSessionDiskSpace === 'function') {
        sessionRoutes.freeSessionDiskSpace(require('fs'), require('path'), config);
      }
    } catch (_) {}

    try {
      backups.writeLatestSessionFileForScope(scope, merged.session);
    } catch (err) {
      if (err && (err.code === 'ENOSPC' || /no space left/i.test(String(err.message || '')))) {
        try {
          const sessionRoutes = require('./session');
          if (typeof sessionRoutes.freeSessionDiskSpace === 'function') {
            sessionRoutes.freeSessionDiskSpace(require('fs'), require('path'), config, {
              aggressive: true
            });
          }
        } catch (_) {}
        backups.writeLatestSessionFileForScope(scope, merged.session);
      } else {
        throw err;
      }
    }

    sendJson(res, 200, {
      ok: true,
      resultsUpdated: merged.resultsUpdated,
      recordsUpdated: merged.recordsUpdated,
      unmatched: merged.unmatched,
      alreadyHad: merged.alreadyHad,
      totalResults: (merged.session.results || []).length,
      totalRecords: (merged.session.records || []).length,
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