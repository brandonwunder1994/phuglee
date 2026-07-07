const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LATEST_FILE = 'distressAnalyzerSession_LATEST.json';
const ARCHIVE_DIR = path.join(ROOT, 'backups', 'archive');
const ROOT_ARCHIVE = path.join(ARCHIVE_DIR, 'root');
const REJECTED_ARCHIVE = path.join(ARCHIVE_DIR, 'rejected');
const SESSION_PATTERN = /^distressAnalyzerSession_.*\.json$/i;

function ensureDirs() {
  for (const dir of [ARCHIVE_DIR, ROOT_ARCHIVE, REJECTED_ARCHIVE]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseResults(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data.results) ? data.results.length : null;
  } catch (_) {
    return null;
  }
}

function uniqueDest(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const parsed = path.parse(destPath);
  const stat = fs.statSync(destPath);
  return path.join(parsed.dir, `${parsed.name}_${stat.mtimeMs}${parsed.ext}`);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  ensureDirs();

  const latestPath = path.join(ROOT, LATEST_FILE);
  if (!fs.existsSync(latestPath)) {
    console.error(`ERROR: ${LATEST_FILE} missing at ${latestPath}`);
    process.exit(1);
  }

  const latestStat = fs.statSync(latestPath);
  const latestResults = parseResults(latestPath);
  const preflightStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preflightDir = path.join(ARCHIVE_DIR, `PREFLIGHT_${preflightStamp}`);
  const preflightLatest = path.join(preflightDir, LATEST_FILE);

  console.log(`Pre-flight: ${LATEST_FILE} (${latestStat.size} bytes, ${latestResults ?? 'unknown'} results)`);
  if (dryRun) {
    console.log(`would copy: ${latestPath} -> ${preflightLatest}`);
  } else {
    fs.mkdirSync(preflightDir, { recursive: true });
    fs.copyFileSync(latestPath, preflightLatest);
    console.log(`copied preflight: ${preflightLatest}`);
  }

  const candidates = fs.readdirSync(ROOT)
    .filter((name) => SESSION_PATTERN.test(name) && name !== LATEST_FILE)
    .map((name) => path.join(ROOT, name));

  const files = [];
  for (const from of candidates) {
    const basename = path.basename(from);
    let dest = path.join(ROOT_ARCHIVE, basename);
    const stat = fs.statSync(from);
    if (fs.existsSync(dest)) {
      dest = uniqueDest(dest);
    }
    const relTo = path.relative(ROOT, dest).split(path.sep).join('/');
    const relFrom = basename;

    if (dryRun) {
      console.log(`would move: ${relFrom} -> ${relTo}`);
    } else {
      fs.renameSync(from, dest);
      console.log(`moved: ${relFrom} -> ${relTo}`);
    }

    files.push({
      from: relFrom,
      to: relTo,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
      results: parseResults(dest)
    });
  }

  const manifest = {
    movedAt: Date.now(),
    dryRun,
    preflightDir: path.relative(ROOT, preflightDir).split(path.sep).join('/'),
    latestResults,
    files
  };

  if (dryRun) {
    console.log(`Dry run complete: would archive ${files.length} files; LATEST kept at root (${latestResults ?? 'unknown'} results)`);
  } else {
    fs.writeFileSync(path.join(ARCHIVE_DIR, 'ARCHIVE_MANIFEST.json'), JSON.stringify(manifest, null, 2));
    console.log(`Archived ${files.length} files; LATEST kept at root (${latestResults ?? 'unknown'} results)`);
    console.log(`ARCHIVE_MANIFEST.json written with ${files.length} entries`);
  }
}

main();