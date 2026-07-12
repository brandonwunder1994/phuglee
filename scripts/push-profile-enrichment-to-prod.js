/**
 * Push Desktop 10k-style profile enrichment onto production Analyzer leads
 * via chunked POST /api/enrich-profiles (avoids huge full-session upload).
 *
 * Sources (merged, local session preferred):
 *  - Local admin session profiles (already matched from 10k / New Analyzer Leads)
 *  - Desktop "10k plus leads.csv" for any remaining gaps
 *
 * Usage: node scripts/push-profile-enrichment-to-prod.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SESSION_PATH = path.join(
  ROOT,
  'modules',
  'property-analyzer',
  'users',
  'admin',
  'distressAnalyzerSession_LATEST.json'
);
const CSV_PATH = path.join(process.env.USERPROFILE || '', 'Desktop', '10k plus leads.csv');
const PROD = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const CHUNK = Number(process.env.ENRICH_CHUNK || 100);
const REPORT_PATH = path.join(ROOT, 'scripts', '_push-profile-enrichment-report.json');

const {
  fullKey,
  streetCityKey,
  partsFromRecord,
  hasUsefulProfile
} = require('../modules/property-analyzer/lib/profile-enrich');

function fetchUrl(url, { method = 'GET', headers = {}, body = null, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': payload.length } : {})
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: buf,
            text: buf.toString('utf8')
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

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

function nonempty(v) {
  const s = String(v ?? '').trim();
  if (!s || s.toUpperCase() === 'N/A') return '';
  return s;
}

function cleanMoney(v) {
  const s = nonempty(v);
  if (!s) return '';
  if (/^\$/.test(s)) return s;
  const n = Number(String(s).replace(/[$,]/g, ''));
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

function flag01(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 0;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? 1 : 0;
}

function profileFromCsvRow(row) {
  const firstName = nonempty(row.FirstName);
  const lastName = nonempty(row.LastName);
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
  const flags = {};
  for (const k of flagKeys) {
    flags[k.charAt(0).toLowerCase() + k.slice(1)] = flag01(row[k]);
  }

  return {
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
    heatingFuel: nonempty(row.HeatingFuel),
    airConditioning: nonempty(row.AirConditioning),
    garage: nonempty(row.Garage),
    roof: nonempty(row.Roof),
    roofShape: nonempty(row.RoofShape),
    pool: nonempty(row.Pool),
    porch: nonempty(row.Porch),
    patio: nonempty(row.Patio),
    basement: nonempty(row.Basement),
    fireplace: nonempty(row.Fireplace),
    water: nonempty(row.Water),
    sewer: nonempty(row.Sewer),
    hoa: flag01(row.HOA) ? 'Yes' : nonempty(row.HOA),
    hoaName: nonempty(row.HOAName),
    hoaFee: cleanMoney(row.HOAFee),
    hoaFeeFrequency: nonempty(row.HOAFeeFrequency),
    auctionDate: nonempty(row.AuctionDate),
    lastNoticeDate: nonempty(row.LastNoticeDate),
    flags,
    latitude: nonempty(row.Latitude),
    longitude: nonempty(row.Longitude),
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'desktop-csv-profile-stack'
  };
}

function patchFromRecord(r) {
  if (!hasUsefulProfile(r.profile)) return null;
  const { street, city, state, zip } = partsFromRecord(r);
  return {
    street,
    city,
    state,
    postal: zip,
    address: r.address || [street, city, state, zip].filter(Boolean).join(', '),
    profile: r.profile,
    marketValue: r.marketValue || r.profile.marketValue || '',
    avm: r.avm || r.profile.avm || '',
    wholesaleValue: r.wholesaleValue || r.profile.wholesaleValue || '',
    firstName: r.firstName || '',
    lastName: r.lastName || '',
    phone: r.phone || '',
    email: r.email || '',
    latitude: r.latitude || r.lat || r.profile.latitude || '',
    longitude: r.longitude || r.lng || r.profile.longitude || '',
    county: r.county || r.profile.county || '',
    ownerType: r.ownerType || r.profile.ownerType || '',
    ownerName: r.ownerName || r.profile.contactName || ''
  };
}

function buildUniquePatches(localSession, csvRows) {
  const byKey = new Map();

  function put(patch) {
    if (!patch || !hasUsefulProfile(patch.profile)) return;
    const fk = fullKey(patch.street, patch.city, patch.state, patch.postal);
    const sk = streetCityKey(patch.street, patch.city, patch.state);
    const key = fk && !fk.startsWith('|') ? fk : sk;
    if (!key || byKey.has(key)) return;
    byKey.set(key, patch);
  }

  // Prefer results (scanned) then records from local
  for (const r of localSession.results || []) put(patchFromRecord(r));
  for (const r of localSession.records || []) put(patchFromRecord(r));

  for (const row of csvRows || []) {
    const street = nonempty(row.PropertyAddress);
    const city = nonempty(row.PropertyCity);
    const state = nonempty(row.PropertyState);
    const zip = nonempty(row.PropertyPostalCode);
    const profile = profileFromCsvRow(row);
    put({
      street,
      city,
      state,
      postal: zip,
      address: [street, city, state, zip].filter(Boolean).join(', '),
      profile,
      marketValue: profile.marketValue,
      avm: profile.avm,
      wholesaleValue: profile.wholesaleValue,
      firstName: nonempty(row.FirstName),
      lastName: nonempty(row.LastName),
      phone: nonempty(row.Contact1Phone_1) || nonempty(row.Contact1Phone_2),
      email: nonempty(row.Contact1Email_1) || nonempty(row.Contact1Email_2),
      latitude: nonempty(row.Latitude),
      longitude: nonempty(row.Longitude),
      county: profile.county,
      ownerType: profile.ownerType,
      ownerName: profile.contactName
    });
  }

  return [...byKey.values()];
}

async function extractToken() {
  const html = await fetchUrl(`${PROD}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No PDA auth token in production analyzer HTML');
  return m[1];
}

async function waitForEnrichEndpoint(headers, maxMs = 600000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxMs) {
    attempt++;
    // Probe with empty body — 400 means route exists; 404 means not deployed yet
    const res = await fetchUrl(`${PROD}/analyzer/api/enrich-profiles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ patches: [] }),
      timeoutMs: 60000
    });
    if (res.status === 400 || res.status === 200) {
      console.log(`[enrich-push] enrich-profiles live (status ${res.status}) after ${attempt} probe(s)`);
      return true;
    }
    if (res.status !== 404) {
      console.log(`[enrich-push] probe status ${res.status}: ${res.text.slice(0, 120)}`);
    } else {
      console.log(`[enrich-push] waiting for deploy… probe #${attempt} still 404`);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('Timed out waiting for /api/enrich-profiles on production');
}

async function main() {
  const started = Date.now();
  const report = { startedAt: new Date().toISOString(), prod: PROD, chunk: CHUNK };

  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(`Missing local session: ${SESSION_PATH}`);
  }

  console.log('[enrich-push] reading local session…');
  const localSession = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));

  let csvRows = [];
  if (fs.existsSync(CSV_PATH)) {
    console.log('[enrich-push] reading Desktop 10k plus leads.csv…');
    csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
    report.csvRows = csvRows.length;
  }

  const patches = buildUniquePatches(localSession, csvRows);
  report.patchCount = patches.length;
  console.log(`[enrich-push] unique patches=${patches.length}`);

  const token = await extractToken();
  const headers = {
    'X-PDA-Token': token,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  // Before counts
  const beforeRes = await fetchUrl(`${PROD}/analyzer/api/session-backup`, {
    headers,
    timeoutMs: 600000
  });
  if (beforeRes.status !== 200) {
    throw new Error(`GET session-backup failed: ${beforeRes.status}`);
  }
  const beforePayload = JSON.parse(beforeRes.text);
  const before = beforePayload.session || beforePayload;
  report.before = {
    records: (before.records || []).length,
    results: (before.results || []).length,
    resultsWithProfile: (before.results || []).filter((r) => hasUsefulProfile(r.profile)).length,
    recordsWithProfile: (before.records || []).filter((r) => hasUsefulProfile(r.profile)).length
  };
  console.log(
    `[enrich-push] prod before resProfile=${report.before.resultsWithProfile} recProfile=${report.before.recordsWithProfile}`
  );

  if (process.env.SKIP_WAIT !== '1') {
    await waitForEnrichEndpoint(headers);
  }

  let totalResults = 0;
  let totalRecords = 0;
  let totalUnmatched = 0;
  let totalAlready = 0;
  const chunks = Math.ceil(patches.length / CHUNK);

  for (let i = 0; i < patches.length; i += CHUNK) {
    const chunk = patches.slice(i, i + CHUNK);
    const n = Math.floor(i / CHUNK) + 1;
    const body = JSON.stringify({
      source: 'desktop-csv-profile-stack',
      patches: chunk
    });
    const res = await fetchUrl(`${PROD}/analyzer/api/enrich-profiles`, {
      method: 'POST',
      headers,
      body,
      timeoutMs: 300000
    });
    let parsed = {};
    try {
      parsed = JSON.parse(res.text);
    } catch (_) {
      parsed = { raw: res.text.slice(0, 300) };
    }
    if (res.status < 200 || res.status >= 300 || !parsed.ok) {
      console.error(`[enrich-push] chunk ${n}/${chunks} FAILED`, res.status, parsed);
      throw new Error(`enrich chunk failed at offset ${i}`);
    }
    totalResults += Number(parsed.resultsUpdated) || 0;
    totalRecords += Number(parsed.recordsUpdated) || 0;
    totalUnmatched += Number(parsed.unmatched) || 0;
    totalAlready += Number(parsed.alreadyHad) || 0;
    console.log(
      `[enrich-push] chunk ${n}/${chunks} res+${parsed.resultsUpdated} rec+${parsed.recordsUpdated} ` +
        `unmatched=${parsed.unmatched} already=${parsed.alreadyHad}`
    );
  }

  report.apply = {
    resultsUpdated: totalResults,
    recordsUpdated: totalRecords,
    unmatched: totalUnmatched,
    alreadyHad: totalAlready
  };

  // Verify
  const afterRes = await fetchUrl(`${PROD}/analyzer/api/session-backup`, {
    headers,
    timeoutMs: 600000
  });
  const afterPayload = JSON.parse(afterRes.text);
  const after = afterPayload.session || afterPayload;
  report.after = {
    records: (after.records || []).length,
    results: (after.results || []).length,
    resultsWithProfile: (after.results || []).filter((r) => hasUsefulProfile(r.profile)).length,
    recordsWithProfile: (after.records || []).filter((r) => hasUsefulProfile(r.profile)).length
  };
  const sample = (after.results || []).find((r) => hasUsefulProfile(r.profile));
  report.sample = sample && {
    address: sample.address,
    market: sample.marketValue || sample.profile?.marketValue,
    wholesale: sample.wholesaleValue || sample.profile?.wholesaleValue,
    enrichmentSource: sample.profile?.enrichmentSource
  };
  report.ok = report.after.resultsWithProfile > 1000;
  report.durationMs = Date.now() - started;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, before: report.before, after: report.after, apply: report.apply, sample: report.sample }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[enrich-push] FATAL', err);
  process.exit(1);
});
