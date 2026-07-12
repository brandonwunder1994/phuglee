/**
 * Import Desktop "New Analyzer Leads.csv" into Analyzer admin session.
 *
 * - Cross-references production SCAN HISTORY (Filter lists) for
 *   Code Type/Category, Violation Description, Violation Date
 * - Skips any address already present in Analyzer (no duplicates)
 * - Stamps importedAt / importBatchId (upload date)
 * - Backs up session before write
 *
 * Usage: node scripts/import-new-analyzer-leads.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(process.env.USERPROFILE || '', 'Desktop', 'New Analyzer Leads.csv');
const SESSION_PATH = path.join(
  ROOT,
  'modules',
  'property-analyzer',
  'users',
  'admin',
  'distressAnalyzerSession_LATEST.json'
);
const BACKUP_DIR = path.join(ROOT, 'modules', 'property-analyzer', 'backups', 'manual');
const CACHE_PATH = path.join(ROOT, 'scripts', '_scan-history-cache.json');
const REPORT_PATH = path.join(ROOT, 'scripts', '_import-new-analyzer-leads-report.json');

const PROD_BASE = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const TOKEN_PATH = path.join(ROOT, 'modules', 'property-analyzer', 'logs', 'pda-auth.token');

const { appendRecordsToSession } = require('../modules/property-analyzer/lib/bridge-import-records');
const { writeFileAtomic } = require('../modules/property-analyzer/lib/fs-atomic');

// ─── CSV parse ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || (row[0] || '') !== '') rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows
    .slice(1)
    .filter((r) => r.some((x) => String(x || '').trim()))
    .map((r) => {
      const o = {};
      headers.forEach((h, idx) => {
        o[h] = r[idx] != null ? String(r[idx]) : '';
      });
      return o;
    });
}

// ─── Address normalization ───────────────────────────────────────────────────

const STREET_ABBR = {
  street: 'st',
  st: 'st',
  avenue: 'ave',
  ave: 'ave',
  road: 'rd',
  rd: 'rd',
  drive: 'dr',
  dr: 'dr',
  lane: 'ln',
  ln: 'ln',
  boulevard: 'blvd',
  blvd: 'blvd',
  court: 'ct',
  ct: 'ct',
  circle: 'cir',
  cir: 'cir',
  way: 'way',
  place: 'pl',
  pl: 'pl',
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  parkway: 'pkwy',
  pkwy: 'pkwy',
  highway: 'hwy',
  hwy: 'hwy',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw'
};

const STATE_MAP = {
  texas: 'tx',
  tx: 'tx',
  florida: 'fl',
  fl: 'fl',
  georgia: 'ga',
  ga: 'ga',
  ohio: 'oh',
  oh: 'oh',
  colorado: 'co',
  co: 'co',
  'north carolina': 'nc',
  nc: 'nc',
  wyoming: 'wy',
  wy: 'wy',
  arizona: 'az',
  az: 'az',
  california: 'ca',
  ca: 'ca',
  'new york': 'ny',
  ny: 'ny',
  illinois: 'il',
  il: 'il',
  michigan: 'mi',
  mi: 'mi',
  pennsylvania: 'pa',
  pa: 'pa',
  virginia: 'va',
  va: 'va',
  tennessee: 'tn',
  tn: 'tn',
  alabama: 'al',
  al: 'al',
  indiana: 'in',
  in: 'in',
  missouri: 'mo',
  mo: 'mo',
  wisconsin: 'wi',
  wi: 'wi',
  minnesota: 'mn',
  mn: 'mn',
  louisiana: 'la',
  la: 'la',
  kentucky: 'ky',
  ky: 'ky',
  oklahoma: 'ok',
  ok: 'ok',
  'south carolina': 'sc',
  sc: 'sc',
  nevada: 'nv',
  nv: 'nv',
  utah: 'ut',
  ut: 'ut',
  iowa: 'ia',
  ia: 'ia',
  kansas: 'ks',
  ks: 'ks',
  arkansas: 'ar',
  ar: 'ar',
  mississippi: 'ms',
  ms: 'ms',
  nebraska: 'ne',
  ne: 'ne',
  'new mexico': 'nm',
  nm: 'nm',
  'west virginia': 'wv',
  wv: 'wv',
  idaho: 'id',
  id: 'id',
  hawaii: 'hi',
  hi: 'hi',
  'new hampshire': 'nh',
  nh: 'nh',
  maine: 'me',
  me: 'me',
  montana: 'mt',
  mt: 'mt',
  'rhode island': 'ri',
  ri: 'ri',
  delaware: 'de',
  de: 'de',
  'south dakota': 'sd',
  sd: 'sd',
  'north dakota': 'nd',
  nd: 'nd',
  alaska: 'ak',
  ak: 'ak',
  vermont: 'vt',
  vt: 'vt',
  'district of columbia': 'dc',
  dc: 'dc',
  connecticut: 'ct',
  'new jersey': 'nj',
  nj: 'nj',
  maryland: 'md',
  md: 'md',
  massachusetts: 'ma',
  ma: 'ma',
  oregon: 'or',
  or: 'or',
  washington: 'wa',
  wa: 'wa'
};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#,.\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stateAbbr(s) {
  const n = norm(s);
  if (STATE_MAP[n]) return STATE_MAP[n];
  if (/^[a-z]{2}$/.test(n)) return n;
  return n.slice(0, 2);
}

function streetKey(s) {
  return norm(s)
    .replace(/\b([a-z0-9]+)\b/g, (m) => STREET_ABBR[m] || m)
    .replace(/\s+/g, ' ')
    .trim();
}

function fullKey(street, city, state, zip) {
  return [
    streetKey(street),
    norm(city),
    stateAbbr(state),
    norm(zip).replace(/\s+/g, '').slice(0, 5)
  ].join('|');
}

function streetCityKey(street, city, state) {
  return [streetKey(street), norm(city), stateAbbr(state)].join('|');
}

function streetOnlyKey(street, state) {
  return [streetKey(street), stateAbbr(state)].join('|');
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function readToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

function httpJson(url, { headers = {}, method = 'GET', body = null, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = { raw: text };
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(
              (data && (data.error || data.message)) || `HTTP ${res.statusCode} for ${url}`
            );
            err.status = res.statusCode;
            err.data = data;
            reject(err);
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── SCAN HISTORY (production Filter lists) ──────────────────────────────────

async function fetchScanHistory(token, { force = false } = {}) {
  if (!force && fs.existsSync(CACHE_PATH)) {
    const ageMs = Date.now() - fs.statSync(CACHE_PATH).mtimeMs;
    if (ageMs < 6 * 60 * 60 * 1000) {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (Array.isArray(cached.rows) && cached.rows.length) {
        console.log(
          `[scan-history] using cache (${cached.rows.length} rows, ${(ageMs / 60000).toFixed(1)} min old)`
        );
        return cached;
      }
    }
  }

  const headers = {
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro'
  };
  if (token) headers['X-PDA-Token'] = token;

  console.log('[scan-history] listing production Filter SCAN HISTORY…');
  const index = await httpJson(`${PROD_BASE}/api/bridge/lists`, { headers });
  const lists = Array.isArray(index.lists) ? index.lists : [];
  console.log(`[scan-history] ${lists.length} lists`);

  const rows = [];
  let fetched = 0;
  const concurrency = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < lists.length) {
      const i = cursor++;
      const list = lists[i];
      const id = list.id;
      try {
        const data = await httpJson(
          `${PROD_BASE}/api/bridge/lists/${encodeURIComponent(id)}?includeRows=1`,
          { headers, timeoutMs: 180000 }
        );
        const listRows = Array.isArray(data.rows) ? data.rows : [];
        for (const row of listRows) {
          rows.push({
            ...row,
            savedListName: data.list?.name || list.name || id,
            savedListId: id,
            savedListCity: data.list?.city || list.city || row.city || '',
            savedListState: data.list?.state || list.state || row.state || '',
            savedListUploadType: data.list?.uploadType || list.uploadType || row.uploadType || ''
          });
        }
        fetched += 1;
        if (fetched % 20 === 0 || fetched === lists.length) {
          console.log(`[scan-history] fetched ${fetched}/${lists.length} lists → ${rows.length} rows`);
        }
      } catch (err) {
        console.warn(`[scan-history] list ${id} failed: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const payload = {
    fetchedAt: new Date().toISOString(),
    listCount: lists.length,
    rowCount: rows.length,
    rows
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload));
  console.log(`[scan-history] cached ${rows.length} rows → ${CACHE_PATH}`);
  return payload;
}

function buildViolationIndex(scanRows) {
  const byFull = new Map();
  const byStreetCity = new Map();
  const byStreetState = new Map();

  function push(map, key, row) {
    if (!key || key.startsWith('|') || key.endsWith('|') || key.includes('||')) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  for (const row of scanRows) {
    // Prefer code violations; still index water for completeness
    const street = row.streetAddress || row.address || '';
    const city = row.city || row.savedListCity || '';
    const state = row.state || row.savedListState || '';
    const zip = row.zip || row.postal || '';
    push(byFull, fullKey(street, city, state, zip), row);
    push(byStreetCity, streetCityKey(street, city, state), row);
    push(byStreetState, streetOnlyKey(street, state), row);
  }

  return { byFull, byStreetCity, byStreetState };
}

function pickViolations(index, street, city, state, zip) {
  const fk = fullKey(street, city, state, zip);
  const sk = streetCityKey(street, city, state);
  const so = streetOnlyKey(street, state);
  if (index.byFull.has(fk)) return { match: 'full', rows: index.byFull.get(fk) };
  if (index.byStreetCity.has(sk)) return { match: 'street_city', rows: index.byStreetCity.get(sk) };
  if (index.byStreetState.has(so)) return { match: 'street_state', rows: index.byStreetState.get(so) };
  return { match: 'none', rows: [] };
}

function formatViolationEntry(row) {
  const category = String(row.category || '').trim();
  const issueType = String(row.violationIssueType || '').trim();
  const description = String(row.descriptionNotes || row.violationIssueType || '').trim();
  const date = String(row.violationDate || '').trim();
  return {
    codeType: issueType || category || '',
    category: category || issueType || '',
    violationDescription: description,
    violationDate: date,
    uploadType: row.uploadType || row.savedListUploadType || '',
    listName: row.savedListName || '',
    listCity: row.savedListCity || row.city || '',
    listState: row.savedListState || row.state || '',
    distressedSignalTag: row.distressedSignalTag || '',
    confidenceLevel: row.confidenceLevel || '',
    sourceFile: row.sourceFile || ''
  };
}

// ─── Record mapping ──────────────────────────────────────────────────────────

function cleanMoney(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s;
}

function flag01(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 0;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? 1 : 0;
}

function nonempty(v) {
  const s = String(v ?? '').trim();
  if (!s || s.toUpperCase() === 'N/A') return '';
  return s;
}

function mapCsvToRecord(row, violations, importedAt) {
  const street = nonempty(row.PropertyAddress);
  const city = nonempty(row.PropertyCity);
  const state = nonempty(row.PropertyState);
  const postal = nonempty(row.PropertyPostalCode);
  const address = [street, city, state, postal].filter(Boolean).join(', ');

  const firstName = nonempty(row.FirstName);
  const lastName = nonempty(row.LastName);
  const phone = nonempty(row.Contact1Phone_1) || nonempty(row.Contact1Phone_2);
  const email = nonempty(row.Contact1Email_1) || nonempty(row.Contact1Email_2);

  const violEntries = (violations.rows || []).map(formatViolationEntry);
  const primary = violEntries[0] || null;

  const distressFlags = {};
  const flagKeys = [
    'AbsenteeOwner',
    'ActiveInvestorOwned',
    'ActiveListing',
    'BoredInvestor',
    'CashBuyer',
    'DelinquentTaxActivity',
    'Flipped',
    'ForeclosureActivity',
    'Foreclosures',
    'FreeAndClear',
    'HighEquity',
    'LongTermOwner',
    'LowEquity',
    'PotentiallyInherited',
    'PreForeclosure',
    'UpsideDown',
    'Vacancy',
    'ZombieProperty'
  ];
  for (const k of flagKeys) {
    distressFlags[k.charAt(0).toLowerCase() + k.slice(1)] = flag01(row[k]);
  }

  const phones = [];
  if (nonempty(row.Contact1Phone_1)) {
    phones.push({
      number: nonempty(row.Contact1Phone_1),
      type: nonempty(row.Contact1Phone_1_Type),
      dnc: String(row.Contact1Phone_1_DNC || '').toLowerCase() === 'true',
      litigator: String(row.Contact1Phone_1_Litigator || '').toLowerCase() === 'true'
    });
  }
  if (nonempty(row.Contact1Phone_2)) {
    phones.push({
      number: nonempty(row.Contact1Phone_2),
      type: nonempty(row.Contact1Phone_2_Type),
      dnc: String(row.Contact1Phone_2_DNC || '').toLowerCase() === 'true',
      litigator: String(row.Contact1Phone_2_Litigator || '').toLowerCase() === 'true'
    });
  }
  const emails = [];
  if (nonempty(row.Contact1Email_1)) emails.push(nonempty(row.Contact1Email_1));
  if (nonempty(row.Contact1Email_2)) emails.push(nonempty(row.Contact1Email_2));

  const profile = {
    _shaped: true,
    propertyType: nonempty(row.PropertyType),
    beds: nonempty(row.Beds),
    baths: nonempty(row.Baths),
    squareFootage: nonempty(row.SquareFootage),
    lotSizeSqFt: nonempty(row.LotSizeSqFt),
    yearBuilt: nonempty(row.YearBuilt),
    stories: nonempty(row.Stories),
    units: nonempty(row.Units),
    ownerType: nonempty(row.OwnerType),
    county: nonempty(row.County),
    lastSalesDate: nonempty(row.LastSalesDate),
    lastSalesPrice: cleanMoney(row.LastSalesPrice),
    pricePerSqFt: cleanMoney(row.PricePerSqFt),
    avm: cleanMoney(row.AVM),
    marketValue: cleanMoney(row.MarketValue),
    wholesaleValue: cleanMoney(row.WholesaleValue),
    taxAssessedValue: cleanMoney(row.TaxAssessedValue),
    taxAmount: cleanMoney(row.TaxAmount),
    ltv: nonempty(row.LTV),
    estimatedMortgageBalance: cleanMoney(row.EstimatedMortgageBalance),
    estimatedMortgagePayment: cleanMoney(row.EstimatedMortgagePayment),
    mortgageInterestRate: nonempty(row.MortgageInterestRate),
    lenderName: nonempty(row.LenderName),
    loanType: nonempty(row.LoanType),
    numberOfLoans: nonempty(row.NumberOfLoans),
    totalLoans: cleanMoney(row.TotalLoans),
    loanAmount: cleanMoney(row.LoanAmount),
    mailingStreet: nonempty(row.RecipientAddress),
    mailingCity: nonempty(row.RecipientCity),
    mailingState: nonempty(row.RecipientState),
    mailingPostal: nonempty(row.RecipientPostalCode),
    contactName: nonempty(row.Contact1Name) || [firstName, lastName].filter(Boolean).join(' '),
    contactType: nonempty(row.Contact1Type),
    phones,
    emails,
    heating: nonempty(row.Heating),
    airConditioning: nonempty(row.AirConditioning),
    garage: nonempty(row.Garage),
    roof: nonempty(row.Roof),
    pool: nonempty(row.Pool),
    porch: nonempty(row.Porch),
    basement: nonempty(row.Basement),
    hoa: flag01(row.HOA) ? 'Yes' : '',
    auctionDate: nonempty(row.AuctionDate),
    lastNoticeDate: nonempty(row.LastNoticeDate),
    flags: {
      absenteeOwner: distressFlags.absenteeOwner,
      activeInvestorOwned: distressFlags.activeInvestorOwned,
      activeListing: distressFlags.activeListing,
      boredInvestor: distressFlags.boredInvestor,
      cashBuyer: distressFlags.cashBuyer,
      delinquentTaxActivity: distressFlags.delinquentTaxActivity,
      flipped: distressFlags.flipped,
      foreclosureActivity: distressFlags.foreclosureActivity,
      foreclosures: distressFlags.foreclosures,
      freeAndClear: distressFlags.freeAndClear,
      highEquity: distressFlags.highEquity,
      longTermOwner: distressFlags.longTermOwner,
      lowEquity: distressFlags.lowEquity,
      potentiallyInherited: distressFlags.potentiallyInherited,
      preForeclosure: distressFlags.preForeclosure,
      upsideDown: distressFlags.upsideDown,
      vacancy: distressFlags.vacancy,
      zombieProperty: distressFlags.zombieProperty
    },
    codeType: primary ? primary.codeType : '',
    codeCategory: primary ? primary.category : '',
    violationDescription: primary ? primary.violationDescription : '',
    violationDate: primary ? primary.violationDate : '',
    violationCount: violEntries.length,
    violations: violEntries
  };

  return {
    firstName,
    lastName,
    phone,
    email,
    street,
    city,
    state,
    postal,
    address,
    leadType: 'code_violation',
    importedAt,
    sourceFile: 'New Analyzer Leads.csv',
    importSource: 'new_analyzer_leads_2026-07-11',
    ownerType: profile.ownerType,
    ownerName: profile.contactName,
    county: profile.county,
    latitude: nonempty(row.Latitude),
    longitude: nonempty(row.Longitude),
    codeType: profile.codeType,
    codeCategory: profile.codeCategory,
    violationDescription: profile.violationDescription,
    violationDate: profile.violationDate,
    violationMatch: violations.match,
    violationCount: violEntries.length,
    violations: violEntries,
    marketValue: profile.marketValue,
    avm: profile.avm,
    profile,
    ...distressFlags
  };
}

function indexExistingAnalyzer(session) {
  const byKey = new Set();
  const byStreetCity = new Set();
  const byStreetState = new Set();
  const samples = [];

  function add(street, city, state, zip, source) {
    const fk = fullKey(street, city, state, zip);
    const sk = streetCityKey(street, city, state);
    const so = streetOnlyKey(street, state);
    if (fk && !fk.startsWith('|')) byKey.add(fk);
    if (sk) byStreetCity.add(sk);
    if (so) byStreetState.add(so);
    if (samples.length < 5) samples.push({ street, city, state, zip, source, fk });
  }

  for (const r of session.records || []) {
    const street = r.street || String(r.address || '').split(',')[0] || '';
    add(street, r.city, r.state, r.postal || r.zip, 'records');
  }
  for (const r of session.results || []) {
    const street = r.street || String(r.address || '').split(',')[0] || '';
    add(street, r.city, r.state, r.postal || r.zip, 'results');
  }

  return { byKey, byStreetCity, byStreetState, samples };
}

function isDuplicate(index, street, city, state, zip) {
  const fk = fullKey(street, city, state, zip);
  if (index.byKey.has(fk)) return { dup: true, how: 'full' };
  const sk = streetCityKey(street, city, state);
  if (index.byStreetCity.has(sk)) return { dup: true, how: 'street_city' };
  // street+state only is too aggressive (same street name in many cities) — skip
  return { dup: false, how: '' };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    csvPath: CSV_PATH,
    sessionPath: SESSION_PATH,
    errors: [],
    warnings: []
  };

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(`Analyzer session not found: ${SESSION_PATH}`);
  }

  console.log('[import] reading CSV…');
  const csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  report.csvRows = csvRows.length;
  console.log(`[import] CSV rows: ${csvRows.length}`);

  console.log('[import] reading analyzer session…');
  const sessionRaw = fs.readFileSync(SESSION_PATH, 'utf8');
  const session = JSON.parse(sessionRaw);
  report.before = {
    records: (session.records || []).length,
    results: (session.results || []).length,
    importBatches: (session.importBatches || []).length
  };
  console.log(
    `[import] existing records=${report.before.records} results=${report.before.results}`
  );

  // Backup first
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupName = `distressAnalyzerSession_BEFORE_NEW_LEADS_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.json`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.writeFileSync(backupPath, sessionRaw);
  report.backupPath = backupPath;
  console.log(`[import] backup → ${backupPath}`);

  const token = readToken();
  const scan = await fetchScanHistory(token, { force: false });
  report.scanHistory = {
    listCount: scan.listCount,
    rowCount: scan.rowCount || (scan.rows || []).length,
    fetchedAt: scan.fetchedAt
  };
  const violIndex = buildViolationIndex(scan.rows || []);
  console.log(
    `[import] violation index full=${violIndex.byFull.size} streetCity=${violIndex.byStreetCity.size}`
  );

  const existing = indexExistingAnalyzer(session);
  console.log(`[import] existing address keys: ${existing.byKey.size}`);

  const importedAt = Date.now();
  const toImport = [];
  const duplicateExamples = [];
  let skippedDuplicate = 0;
  let skippedNoAddress = 0;
  let violMatched = 0;
  let violNone = 0;
  const matchHow = { full: 0, street_city: 0, street_state: 0, none: 0 };
  const dupHow = { full: 0, street_city: 0 };

  for (const row of csvRows) {
    const street = nonempty(row.PropertyAddress);
    const city = nonempty(row.PropertyCity);
    const state = nonempty(row.PropertyState);
    const zip = nonempty(row.PropertyPostalCode);
    if (!street) {
      skippedNoAddress += 1;
      continue;
    }

    const dup = isDuplicate(existing, street, city, state, zip);
    if (dup.dup) {
      skippedDuplicate += 1;
      if (dupHow[dup.how] != null) dupHow[dup.how] += 1;
      if (duplicateExamples.length < 25) {
        duplicateExamples.push({
          address: [street, city, state, zip].filter(Boolean).join(', '),
          how: dup.how
        });
      }
      continue;
    }

    const viol = pickViolations(violIndex, street, city, state, zip);
    matchHow[viol.match] = (matchHow[viol.match] || 0) + 1;
    if (viol.match === 'none') violNone += 1;
    else violMatched += 1;

    const record = mapCsvToRecord(row, viol, importedAt);
    toImport.push(record);

    // Prevent duplicates within the import batch itself
    existing.byKey.add(fullKey(street, city, state, zip));
    existing.byStreetCity.add(streetCityKey(street, city, state));
  }

  console.log(
    `[import] toImport=${toImport.length} skippedDuplicate=${skippedDuplicate} noAddress=${skippedNoAddress}`
  );
  console.log(`[import] violation matches: ${JSON.stringify(matchHow)}`);

  // Chunk append via same helper the API uses (batch stamp + dedupe)
  const CHUNK = 500;
  let added = 0;
  let skippedByHelper = 0;
  let working = session;
  const batches = [];

  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK);
    const sample = chunk[0] || {};
    const merged = appendRecordsToSession(working, chunk, {
      city: '',
      state: '',
      sourceFile: 'New Analyzer Leads.csv',
      importedAt,
      batchId:
        i === 0
          ? `batch_new_analyzer_leads_${importedAt}`
          : `batch_new_analyzer_leads_${importedAt}_${Math.floor(i / CHUNK) + 1}`
    });
    working = merged.session;
    added += merged.added;
    skippedByHelper += merged.skipped;
    batches.push({
      id: merged.batch.id,
      added: merged.added,
      skipped: merged.skipped,
      leadCount: merged.batch.leadCount
    });
    console.log(
      `[import] chunk ${Math.floor(i / CHUNK) + 1}: added=${merged.added} skipped=${merged.skipped} totalRecords=${merged.totalRecords}`
    );
  }

  // Ensure fileName / lead type metadata
  working.fileName = 'New Analyzer Leads.csv';
  working.importLeadType = 'code_violation';
  working.savedAt = importedAt;

  console.log('[import] writing session…');
  writeFileAtomic(SESSION_PATH, JSON.stringify(working));

  // Optional: also mirror root session if tiny/legacy (do not overwrite rich admin with root stub)
  const rootSession = path.join(ROOT, 'modules', 'property-analyzer', 'distressAnalyzerSession_LATEST.json');
  // leave root alone — admin scope is the real store

  report.importedAt = importedAt;
  report.importedAtIso = new Date(importedAt).toISOString();
  report.uploadDateLabel = new Date(importedAt).toLocaleString();
  report.skippedDuplicate = skippedDuplicate;
  report.duplicateHow = dupHow;
  report.duplicateExamples = duplicateExamples;
  report.skippedNoAddress = skippedNoAddress;
  report.toImport = toImport.length;
  report.added = added;
  report.skippedByHelper = skippedByHelper;
  report.violationMatchHow = matchHow;
  report.violationMatched = violMatched;
  report.violationNone = violNone;
  report.batches = batches;
  report.after = {
    records: (working.records || []).length,
    results: (working.results || []).length,
    importBatches: (working.importBatches || []).length
  };
  report.durationMs = Date.now() - started;
  report.ok = true;

  // Sample of imported for verification
  report.sampleImported = (working.records || [])
    .filter((r) => r.importSource === 'new_analyzer_leads_2026-07-11')
    .slice(0, 3)
    .map((r) => ({
      address: r.address,
      codeCategory: r.codeCategory,
      codeType: r.codeType,
      violationDate: r.violationDate,
      marketValue: r.marketValue,
      phone: r.phone,
      importedAt: r.importedAt,
      violationCount: r.violationCount
    }));

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('\n========== IMPORT REPORT ==========');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${REPORT_PATH}`);
  return report;
}

main().catch((err) => {
  console.error('[import] FATAL:', err);
  try {
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2)
    );
  } catch (_) {}
  process.exit(1);
});
