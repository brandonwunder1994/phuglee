const fs = require('fs');
const path = require('path');
const {
  ADMIN_USERNAME,
  VAULT_STORAGE_KEY,
  scopeSessionPath,
  legacyGlobalSessionPath,
  emptySession,
  sessionHasAddresses,
  ensureUserSessionDir
} = require('./user-session');

function resolveSeedSessionPath(config) {
  const candidates = [
    path.join(config.ROOT, '..', '..', 'scripts', 'seed-data', 'distressAnalyzerSession_LATEST.json'),
    path.join(config.ROOT, 'scripts', 'seed-data', 'distressAnalyzerSession_LATEST.json')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function sessionResultCount(session) {
  return Array.isArray(session?.results) ? session.results.length : 0;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function copySessionFile(sourcePath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
}

function shouldReplaceTarget(targetPath, seedResults) {
  if (!fs.existsSync(targetPath)) return true;
  try {
    const live = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    const liveResults = sessionResultCount(live);
    const liveBytes = fs.statSync(targetPath).size;
    const seedBytes = 0;
    return liveResults < Math.min(seedResults, 100) || liveBytes < seedBytes;
  } catch (_) {
    return true;
  }
}

function shouldReplaceTargetWithSeed(targetPath, seedPath, seedResults) {
  if (!fs.existsSync(targetPath)) return true;
  try {
    const live = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    const liveResults = sessionResultCount(live);
    const liveBytes = fs.statSync(targetPath).size;
    const seedBytes = fs.statSync(seedPath).size;
    return liveResults < Math.min(seedResults, 100) || liveBytes < seedBytes;
  } catch (_) {
    return true;
  }
}

function migrateLegacyGlobalToAdmin({ config, fs: fsMod = fs, path: pathMod = path } = {}) {
  const { DATA_ROOT, SESSION_LATEST_FILE } = config;
  const globalPath = legacyGlobalSessionPath(DATA_ROOT, SESSION_LATEST_FILE);
  const adminPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, {
    storageKey: ADMIN_USERNAME
  });
  const globalSession = readJsonIfExists(globalPath);
  if (!sessionHasAddresses(globalSession)) {
    return { migrated: false, reason: 'global_empty' };
  }
  const adminSession = readJsonIfExists(adminPath);
  if (sessionHasAddresses(adminSession)
    && sessionResultCount(adminSession) >= sessionResultCount(globalSession)) {
    return { migrated: false, reason: 'admin_already_has_data' };
  }
  copySessionFile(globalPath, adminPath);
  fsMod.writeFileSync(globalPath, JSON.stringify(emptySession()));
  return {
    migrated: true,
    reason: 'global_to_admin',
    results: sessionResultCount(globalSession),
    adminPath
  };
}

function seedScopedSession({ config, storageKey, seedPath, seedResults, fsMod = fs }) {
  const { DATA_ROOT, SESSION_LATEST_FILE } = config;
  const targetPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, { storageKey });
  if (!shouldReplaceTargetWithSeed(targetPath, seedPath, seedResults)) {
    return {
      seeded: false,
      storageKey,
      liveResults: sessionResultCount(readJsonIfExists(targetPath)),
      seedResults
    };
  }
  ensureUserSessionDir(DATA_ROOT, storageKey);
  copySessionFile(seedPath, targetPath);
  return {
    seeded: true,
    storageKey,
    seedResults,
    targetPath
  };
}

function ensureSeededSession({ config, fs: fsMod = fs, path: pathMod = path } = {}) {
  const { DATA_ROOT, SESSION_LATEST_FILE } = config;
  const seedPath = resolveSeedSessionPath(config);
  const migration = migrateLegacyGlobalToAdmin({ config, fs: fsMod, path: pathMod });

  if (!seedPath) {
    return { seeded: false, reason: 'no_seed_file', migration };
  }

  let seedResults = 0;
  try {
    seedResults = sessionResultCount(JSON.parse(fsMod.readFileSync(seedPath, 'utf8')));
  } catch (_) {
    return { seeded: false, reason: 'seed_parse_failed', migration };
  }

  const adminSeed = seedScopedSession({
    config,
    storageKey: ADMIN_USERNAME,
    seedPath,
    seedResults,
    fsMod
  });
  const vaultSeed = seedScopedSession({
    config,
    storageKey: VAULT_STORAGE_KEY,
    seedPath,
    seedResults,
    fsMod
  });

  const globalPath = legacyGlobalSessionPath(DATA_ROOT, SESSION_LATEST_FILE);
  if (!sessionHasAddresses(readJsonIfExists(globalPath))) {
    fsMod.mkdirSync(pathMod.dirname(globalPath), { recursive: true });
    fsMod.writeFileSync(globalPath, JSON.stringify(emptySession()));
  }

  return {
    seeded: adminSeed.seeded || vaultSeed.seeded,
    reason: adminSeed.seeded || vaultSeed.seeded ? 'admin_and_vault_scoped' : 'scoped_sessions_ok',
    seedResults,
    migration,
    admin: adminSeed,
    vault: vaultSeed
  };
}

module.exports = {
  resolveSeedSessionPath,
  ensureSeededSession,
  migrateLegacyGlobalToAdmin,
  sessionResultCount,
  sessionHasAddresses
};