#!/usr/bin/env node
'use strict';

/**
 * Convert DealSauce/LPP scrub export → Analyzer-ready workbook + load scan queue.
 * Keeps existing AI results; replaces only the scan queue (same as UI upload).
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { buildImportProfile, profileForImportRecord, buildHeaderMap } = require(
  '../modules/property-analyzer/lib/import-profile'
);
const { writeFileAtomic } = require('../modules/property-analyzer/lib/fs-atomic');

const SRC =
  process.argv[2] ||
  'c:/Users/brand/Desktop/lpp-export-b9d13ad6-382a-46f2-8beb-88ed80248bef.csv';
const OUT_XLSX =
  process.argv[3] ||
  'c:/Users/brand/OneDrive/Desktop/vantage-dealsauce-analyzer-import.xlsx';
const OUT_CSV = OUT_XLSX.replace(/\.xlsx$/i, '.csv');
const USER = process.env.PDA_IMPORT_USER || 'admin';
const SESSION_PATH = path.join(
  __dirname,
  '..',
  'modules',
  'property-analyzer',
  'users',
  USER,
  'distressAnalyzerSession_LATEST.json'
);

function padZip(z) {
  const d = String(z == null ? '' : z).replace(/\.0+$/, '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 5 ? d.padStart(5, '0') : d.slice(0, 5);
}

function phoneStr(z) {
  let s = String(z == null ? '' : z).trim();
  if (!s) return '';
  if (/e\+/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  s = s.replace(/\.0+$/, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits || s;
}

function excelSerialToIso(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return s;
  // Excel serial → UTC date
  const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return s;
  return utc.toISOString().slice(0, 10);
}

function flagText(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === '1' || s === 'true' || s === 'yes') return '1';
  if (s === '0' || s === 'false' || s === 'no') return '0';
  return String(v);
}

function cleanRow(raw) {
  const street = String(raw.PropertyAddress || raw['Street Address'] || '').trim();
  const city = String(raw.PropertyCity || raw.City || '').trim();
  const state = String(raw.PropertyState || raw.State || '').trim().toUpperCase().slice(0, 2);
  const zip = padZip(raw.PropertyPostalCode || raw.Zip || raw['Postal Code']);
  if (!street) return null;

  const first = String(raw.FirstName || raw['First Name'] || '').trim();
  const last = String(raw.LastName || raw['Last Name'] || '').trim();
  const phone = phoneStr(raw.Contact1Phone_1 || raw.Phone);
  const email = String(raw.Contact1Email_1 || raw.Email || '').trim();

  // Keep LPP column names Analyzer already maps + friendly aliases
  const row = {
    FirstName: first,
    LastName: last,
    PropertyAddress: street,
    'Street Address': street,
    PropertyCity: city,
    City: city,
    PropertyState: state,
    State: state,
    PropertyPostalCode: zip,
    'Postal Code': zip,
    Zip: zip,
    Contact1Phone_1: phone,
    Phone: phone,
    Contact1Phone_1_Type: String(raw.Contact1Phone_1_Type || '').trim(),
    Contact1Phone_1_DNC: String(raw.Contact1Phone_1_DNC || '').trim(),
    Contact1Phone_2: phoneStr(raw.Contact1Phone_2),
    Contact1Phone_2_Type: String(raw.Contact1Phone_2_Type || '').trim(),
    Contact1Phone_2_DNC: String(raw.Contact1Phone_2_DNC || '').trim(),
    Contact1Phone_3: phoneStr(raw.Contact1Phone_3),
    Contact1Email_1: email,
    Email: email,
    Contact1Email_2: String(raw.Contact1Email_2 || '').trim(),
    Contact1Name: String(raw.Contact1Name || `${first} ${last}`.trim()).trim(),
    Contact1Type: String(raw.Contact1Type || '').trim(),
    RecipientAddress: String(raw.RecipientAddress || '').trim(),
    RecipientCity: String(raw.RecipientCity || '').trim(),
    RecipientState: String(raw.RecipientState || '').trim().toUpperCase().slice(0, 2),
    RecipientPostalCode: padZip(raw.RecipientPostalCode),
    County: String(raw.County || '').trim(),
    Latitude: raw.Latitude !== '' && raw.Latitude != null ? String(raw.Latitude) : '',
    Longitude: raw.Longitude !== '' && raw.Longitude != null ? String(raw.Longitude) : '',
    OwnerType: String(raw.OwnerType || '').trim(),
    PropertyType: String(raw.PropertyType || '').trim(),
    Beds: raw.Beds !== '' && raw.Beds != null ? String(raw.Beds) : '',
    Baths: raw.Baths !== '' && raw.Baths != null ? String(raw.Baths) : '',
    SquareFootage: raw.SquareFootage !== '' && raw.SquareFootage != null ? String(raw.SquareFootage) : '',
    LotSizeSqFt: raw.LotSizeSqFt !== '' && raw.LotSizeSqFt != null ? String(raw.LotSizeSqFt) : '',
    YearBuilt: raw.YearBuilt !== '' && raw.YearBuilt != null ? String(raw.YearBuilt) : '',
    Stories: raw.Stories !== '' && raw.Stories != null ? String(raw.Stories) : '',
    Units: raw.Units !== '' && raw.Units != null ? String(raw.Units) : '',
    LastSalesDate: excelSerialToIso(raw.LastSalesDate),
    LastSalesPrice: raw.LastSalesPrice !== '' && raw.LastSalesPrice != null ? String(raw.LastSalesPrice) : '',
    PricePerSqFt: raw.PricePerSqFt !== '' && raw.PricePerSqFt != null ? String(raw.PricePerSqFt) : '',
    AVM: raw.AVM !== '' && raw.AVM != null ? String(raw.AVM) : '',
    MarketValue: raw.MarketValue !== '' && raw.MarketValue != null ? String(raw.MarketValue) : '',
    WholesaleValue: raw.WholesaleValue !== '' && raw.WholesaleValue != null ? String(raw.WholesaleValue) : '',
    TaxAssessedValue: raw.TaxAssessedValue !== '' && raw.TaxAssessedValue != null ? String(raw.TaxAssessedValue) : '',
    TaxAmount: raw.TaxAmount !== '' && raw.TaxAmount != null ? String(raw.TaxAmount) : '',
    EstimatedMortgageBalance:
      raw.EstimatedMortgageBalance !== '' && raw.EstimatedMortgageBalance != null
        ? String(raw.EstimatedMortgageBalance)
        : '',
    EstimatedMortgagePayment:
      raw.EstimatedMortgagePayment !== '' && raw.EstimatedMortgagePayment != null
        ? String(raw.EstimatedMortgagePayment)
        : '',
    MortgageInterestRate:
      raw.MortgageInterestRate !== '' && raw.MortgageInterestRate != null
        ? String(raw.MortgageInterestRate)
        : '',
    LenderName: String(raw.LenderName || '').trim(),
    LoanType: String(raw.LoanType || '').trim(),
    NumberOfLoans: raw.NumberOfLoans !== '' && raw.NumberOfLoans != null ? String(raw.NumberOfLoans) : '',
    TotalLoans: raw.TotalLoans !== '' && raw.TotalLoans != null ? String(raw.TotalLoans) : '',
    LoanAmount: raw.LoanAmount !== '' && raw.LoanAmount != null ? String(raw.LoanAmount) : '',
    LTV: raw.LTV !== '' && raw.LTV != null ? String(raw.LTV) : '',
    Heating: String(raw.Heating || '').trim(),
    HeatingFuel: String(raw.HeatingFuel || '').trim(),
    AirConditioning: String(raw.AirConditioning || '').trim(),
    Fireplace: raw.Fireplace !== '' && raw.Fireplace != null ? String(raw.Fireplace) : '',
    Garage: String(raw.Garage || '').trim(),
    Roof: String(raw.Roof || '').trim(),
    RoofShape: String(raw.RoofShape || '').trim(),
    Basement: String(raw.Basement || '').trim(),
    Water: String(raw.Water || '').trim(),
    Sewer: String(raw.Sewer || '').trim(),
    Pool: String(raw.Pool || '').trim(),
    Porch: String(raw.Porch || '').trim(),
    Patio: String(raw.Patio || '').trim(),
    HOA: flagText(raw.HOA),
    HOAName: String(raw.HOAName || '').trim(),
    HOAFee: raw.HOAFee !== '' && raw.HOAFee != null ? String(raw.HOAFee) : '',
    HOAFeeFrequency: String(raw.HOAFeeFrequency || '').trim(),
    AuctionDate: excelSerialToIso(raw.AuctionDate),
    LastNoticeDate: excelSerialToIso(raw.LastNoticeDate),
    AbsenteeOwner: flagText(raw.AbsenteeOwner),
    ActiveListing: flagText(raw.ActiveListing),
    HighEquity: flagText(raw.HighEquity),
    PreForeclosure: flagText(raw.PreForeclosure),
    Vacancy: flagText(raw.Vacancy),
    FreeAndClear: flagText(raw.FreeAndClear),
    LongTermOwner: flagText(raw.LongTermOwner),
    PotentiallyInherited: flagText(raw.PotentiallyInherited),
    DelinquentTaxActivity: flagText(raw.DelinquentTaxActivity),
    ZombieProperty: flagText(raw.ZombieProperty),
    CashBuyer: flagText(raw.CashBuyer),
    Flipped: flagText(raw.Flipped),
    ForeclosureActivity: flagText(raw.ForeclosureActivity),
    BoredInvestor: flagText(raw.BoredInvestor),
    Source: 'Vantage → DealSauce scrub',
    Reason: 'Vantage distress list after DealSauce scrub'
  };
  return row;
}

function buildFullAddress(street, city, state, postal) {
  return [street, city, [state, postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function addressKey(street, city, state) {
  return `${String(street || '').toLowerCase().replace(/[#.,]/g, ' ').replace(/\s+/g, ' ').trim()}|${String(city || '').toLowerCase().trim()}|${String(state || '').toLowerCase().slice(0, 2)}`;
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Missing source: ${SRC}`);
  const wbIn = XLSX.readFile(SRC, { cellDates: true, raw: false });
  const sheet = wbIn.Sheets[wbIn.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  const cleaned = [];
  const seen = new Set();
  let blank = 0;
  let dups = 0;
  for (const raw of rawRows) {
    const row = cleanRow(raw);
    if (!row) {
      blank += 1;
      continue;
    }
    const k = addressKey(row.PropertyAddress, row.PropertyCity, row.PropertyState);
    if (seen.has(k)) {
      dups += 1;
      continue;
    }
    seen.add(k);
    cleaned.push(row);
  }

  // Write Analyzer-ready workbook (string zips/phones)
  const outWb = XLSX.utils.book_new();
  const outSheet = XLSX.utils.json_to_sheet(cleaned);
  // Force zip/phone columns to strings
  const range = XLSX.utils.decode_range(outSheet['!ref']);
  const headers = [];
  for (let C = range.s.c; C <= range.e.c; C += 1) {
    headers[C] = String(outSheet[XLSX.utils.encode_cell({ r: 0, c: C })]?.v || '');
  }
  for (let R = range.s.r + 1; R <= range.e.r; R += 1) {
    for (let C = range.s.c; C <= range.e.c; C += 1) {
      const h = headers[C];
      if (!/postal|zip|phone/i.test(h)) continue;
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = outSheet[addr];
      if (!cell) continue;
      cell.t = 's';
      cell.v = String(cell.v ?? '');
      cell.z = '@';
    }
  }
  XLSX.utils.book_append_sheet(outWb, outSheet, 'Leads');
  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.aoa_to_sheet([
      ['Vantage DealSauce → Analyzer import'],
      ['Created', new Date().toISOString()],
      ['Source', SRC],
      ['Input rows', rawRows.length],
      ['Blank address skipped', blank],
      ['Dupes skipped', dups],
      ['Output rows', cleaned.length],
      ['Lead type', 'code_violation'],
      ['Note', 'Upload in Analyze or loaded into scan queue (results kept)']
    ]),
    'Summary'
  );

  for (const dest of [
    OUT_XLSX,
    'c:/Users/brand/Desktop/vantage-dealsauce-analyzer-import.xlsx',
    'c:/Users/brand/Downloads/vantage-dealsauce-analyzer-import.xlsx'
  ]) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      XLSX.writeFile(outWb, dest);
    } catch (err) {
      console.warn('write skip', dest, err.message);
    }
  }

  // CSV twin
  const csvHeaders = Object.keys(cleaned[0] || {});
  const csvLines = [
    csvHeaders.join(','),
    ...cleaned.map((r) =>
      csvHeaders
        .map((h) => {
          const s = String(r[h] ?? '');
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
  ];
  for (const dest of [OUT_CSV, 'c:/Users/brand/Desktop/vantage-dealsauce-analyzer-import.csv']) {
    try {
      fs.writeFileSync(dest, `\uFEFF${csvLines.join('\n')}\n`, 'utf8');
    } catch (_) {}
  }

  // Build scan-queue records
  const importedAt = Date.now();
  const batchId = `batch_vantage_dealsauce_${importedAt}`;
  const byLower = buildHeaderMap(Object.keys(cleaned[0] || {}));
  const records = cleaned.map((r) => {
    const profile = buildImportProfile(r, { byLower, headers: Object.keys(r) });
    const street = r.PropertyAddress;
    const city = r.PropertyCity;
    const state = r.PropertyState;
    const postal = r.PropertyPostalCode;
    const rec = {
      firstName: r.FirstName,
      lastName: r.LastName,
      phone: r.Contact1Phone_1,
      email: r.Contact1Email_1,
      street,
      city,
      state,
      postal,
      address: buildFullAddress(street, city, state, postal),
      leadType: 'code_violation',
      importedAt,
      importBatchId: batchId,
      importSource: 'vantage_dealsauce_scrub',
      sourceFile: path.basename(SRC),
      forceRescan: true
    };
    if (r.Latitude) rec.latitude = r.Latitude;
    if (r.Longitude) rec.longitude = r.Longitude;
    if (profile) {
      rec.profile = profileForImportRecord(profile);
      if (profile.marketValue) rec.marketValue = profile.marketValue;
      if (profile.avm) rec.avm = profile.avm;
      if (profile.wholesaleValue) rec.wholesaleValue = profile.wholesaleValue;
      if (profile.ownerType) rec.ownerType = profile.ownerType;
      if (profile.county) rec.county = profile.county;
      if (profile.contactName) rec.ownerName = profile.contactName;
    }
    return rec;
  });

  // Lean queue for session (drop fat profiles to keep session write smaller — UI re-reads profile from import if needed)
  // Actually keep profiles — dossier uses them. 750 rows is fine.
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(`Session not found: ${SESSION_PATH}`);
  }

  // Backup session before queue replace
  const backupPath = SESSION_PATH.replace(
    /_LATEST\.json$/,
    `_LATEST_BEFORE_VANTAGE_IMPORT_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  );
  fs.copyFileSync(SESSION_PATH, backupPath);

  const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  const priorResults = Array.isArray(session.results) ? session.results.length : 0;
  const priorRecords = Array.isArray(session.records) ? session.records.length : 0;
  const batches = Array.isArray(session.importBatches) ? session.importBatches : [];

  const next = {
    ...session,
    records,
    results: Array.isArray(session.results) ? session.results : [],
    processed: Array.isArray(session.results) ? session.results.length : Number(session.processed) || 0,
    fileName: path.basename(OUT_XLSX),
    importLeadType: 'code_violation',
    importBatches: [
      ...batches,
      {
        id: batchId,
        city: '',
        state: '',
        sourceFile: path.basename(SRC),
        leadCount: records.length,
        importedAt
      }
    ],
    savedAt: importedAt
  };

  writeFileAtomic(SESSION_PATH, JSON.stringify(next));

  // Mirror latest for safety HUD
  try {
    const mirror = path.join(
      __dirname,
      '..',
      'modules',
      'property-analyzer',
      'backups',
      'auto',
      'MIRROR_LATEST.json'
    );
    writeFileAtomic(mirror, JSON.stringify(next));
  } catch (err) {
    console.warn('mirror write skipped:', err.message);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: SRC,
        outXlsx: OUT_XLSX,
        inputRows: rawRows.length,
        blankSkipped: blank,
        dupesSkipped: dups,
        queueRows: records.length,
        user: USER,
        sessionPath: SESSION_PATH,
        sessionBackup: backupPath,
        priorResultsKept: priorResults,
        priorQueueReplaced: priorRecords,
        sample: records.slice(0, 2).map((r) => ({
          address: r.address,
          phone: r.phone,
          postal: r.postal,
          hasProfile: !!r.profile
        }))
      },
      null,
      2
    )
  );
}

main();
