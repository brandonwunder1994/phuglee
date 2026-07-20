/**
 * Enrich Vault leads from PropStream-style CSVs (keep-fields only).
 */
const fs = require('fs');
const { buildLeadId } = require('./schema');

const FLAG_LABELS = {
  AbsenteeOwner: 'Absentee owner',
  HighEquity: 'High equity',
  FreeAndClear: 'Free & clear',
  Vacancy: 'Vacant',
  PreForeclosure: 'Pre-foreclosure',
  ForeclosureActivity: 'Foreclosure',
  DelinquentTaxActivity: 'Tax delinquent',
  PotentiallyInherited: 'Inherited',
  UpsideDown: 'Upside down',
  ActiveListing: 'Active listing',
  LongTermOwner: 'Long-term owner',
  ZombieProperty: 'Zombie property',
  BoredInvestor: 'Bored investor',
  CashBuyer: 'Cash buyer',
  Flipped: 'Flipped',
  LowEquity: 'Low equity'
};

/** Alternate spreadsheet headers → canonical PropStream-style keys used below. */
const COLUMN_ALIASES = {
  'First Name': 'FirstName',
  'Last Name': 'LastName',
  'Street Address': 'PropertyAddress',
  City: 'PropertyCity',
  State: 'PropertyState',
  'Postal Code': 'PropertyPostalCode',
  'Mailing Address': 'RecipientAddress',
  'Mailing City': 'RecipientCity',
  'Mailign State': 'RecipientState',
  'Mailing State': 'RecipientState',
  'Mailing Postal Code': 'RecipientPostalCode',
  'Property County': 'County',
  County: 'County',
  'Air Condition': 'AirConditioning',
  'Air Conditioning': 'AirConditioning',
  'Tax Amount': 'TaxAmount',
  'Wholesale Value': 'WholesaleValue',
  'Market Value': 'MarketValue',
  'Tax Assesed Value': 'TaxAssessedValue',
  'Tax Assessed Value': 'TaxAssessedValue',
  Phone: 'Contact1Phone_1',
  'Phone 2': 'Contact1Phone_2',
  Email: 'Contact1Email_1',
  'Email 2': 'Contact1Email_2',
  'Absentee Owner': 'AbsenteeOwner',
  'High Equity': 'HighEquity',
  'Free And Clear': 'FreeAndClear',
  'Pre Foreclosure': 'PreForeclosure',
  'Foreclosure Activity': 'ForeclosureActivity',
  Foreclosures: 'ForeclosureActivity',
  'Delinquent Tax': 'DelinquentTaxActivity',
  'Potentially Inherited': 'PotentiallyInherited',
  'Upside Down': 'UpsideDown',
  'Active Listing': 'ActiveListing',
  'Long Term Owner': 'LongTermOwner',
  'Zombie Property': 'ZombieProperty',
  'Bored Investor': 'BoredInvestor',
  'Cash Buyer': 'CashBuyer',
  'Low Equity': 'LowEquity',
  'Auction Date': 'AuctionDate',
  'Last Notice Date': 'LastNoticeDate'
};

function canonicalizeRow(row = {}) {
  const out = { ...row };
  for (const [alias, canonical] of Object.entries(COLUMN_ALIASES)) {
    const incoming = out[alias];
    if (incoming == null || String(incoming).trim() === '') continue;
    const existing = out[canonical];
    if (existing != null && String(existing).trim() !== '') continue;
    out[canonical] = incoming;
  }
  return out;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { header: [], rows: [] };
  const header = parseRow(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    if (!cols.length || cols.every((c) => !String(c || '').trim())) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cols[idx] == null ? '' : cols[idx]; });
    rows.push(row);
  }
  return { header, rows };
}

function parseRow(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function money(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isTruthyFlag(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function isBlankProp(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  return lower === 'n/a' || lower === 'na' || lower === 'null' || lower === 'none' || lower === '0';
}

function meaningfulText(v) {
  if (isBlankProp(v)) return '';
  return String(v).trim();
}

function mapOwnerType(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s.includes('LLC') || s.includes('CORP') || s.includes('COMPANY') || s.includes('TRUST')) return 'llc';
  if (s.includes('ESTATE')) return 'estate';
  if (s.includes('INDIVIDUAL') || s.includes('PERSON')) return 'individual';
  return 'unknown';
}

function normalizeStreetKey(address) {
  return String(address || '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bapartment\b/g, 'apt')
    .replace(/\bsuite\b/g, 'ste')
    .trim();
}

function matchKey({ address, city, state }) {
  return [
    normalizeStreetKey(address),
    String(city || '').trim().toLowerCase(),
    String(state || '').trim().toUpperCase().slice(0, 2)
  ].join('|');
}

function collectPhones(row) {
  const phones = [];
  for (const slot of [1, 2]) {
    const phone = meaningfulText(row[`Contact1Phone_${slot}`]);
    if (!phone) continue;
    if (isTruthyFlag(row[`Contact1Phone_${slot}_Litigator`])) continue;
    const digits = phone.replace(/\D/g, '');
    phones.push(digits.length >= 10 ? digits : phone);
  }
  return [...new Set(phones)];
}

function flagTags(row) {
  const tags = [];
  for (const [col, label] of Object.entries(FLAG_LABELS)) {
    if (isTruthyFlag(row[col])) tags.push(label);
  }
  return tags;
}

function propertyDetailsFromRow(row) {
  const details = {};
  const beds = num(row.Beds);
  const baths = num(row.Baths);
  const sqft = num(row.SquareFootage);
  const lotSqft = num(row.LotSizeSqFt);
  const yearBuilt = num(row.YearBuilt);
  const stories = num(row.Stories);
  const units = num(row.Units);
  if (beds != null) details.beds = beds;
  if (baths != null) details.baths = baths;
  if (sqft != null) details.sqft = sqft;
  if (lotSqft != null) details.lotSqft = lotSqft;
  if (yearBuilt != null) details.yearBuilt = yearBuilt;
  if (stories != null) details.stories = stories;
  if (units != null && units > 0) details.units = units;

  const county = meaningfulText(row.County);
  if (county) details.county = county;
  const garage = meaningfulText(row.Garage);
  if (garage) details.garage = garage;
  const pool = meaningfulText(row.Pool);
  if (pool) details.pool = pool;

  if (isTruthyFlag(row.HOA) || meaningfulText(row.HOAFee)) {
    details.hoa = true;
    const fee = money(row.HOAFee);
    if (fee != null) details.hoaFee = fee;
  } else if (String(row.HOA || '').trim() !== '') {
    details.hoa = false;
  }

  const amenityMap = {
    heating: 'Heating',
    airConditioning: 'AirConditioning',
    roof: 'Roof',
    basement: 'Basement',
    walls: 'InteriorWalls',
    water: 'Water',
    sewer: 'Sewer',
    patio: 'Patio',
    porch: 'Porch',
    fireplace: 'Fireplace'
  };
  for (const [key, col] of Object.entries(amenityMap)) {
    const val = meaningfulText(row[col]);
    if (val) details[key] = val;
  }
  return details;
}

function financialDetailsFromRow(row) {
  const details = {};
  const setMoney = (key, val) => {
    const n = money(val);
    if (n != null) details[key] = n;
  };
  const setNum = (key, val) => {
    const n = num(val);
    if (n != null) details[key] = n;
  };

  setMoney('wholesaleValue', row.WholesaleValue);
  setNum('taxAmount', row.TaxAmount);
  setMoney('pricePerSqFt', row.PricePerSqFt);
  setMoney('marketValue', row.MarketValue);
  setMoney('mortgageBalance', row.EstimatedMortgageBalance);
  setNum('ltv', row.LTV);
  setMoney('loanAmount', row.LoanAmount);
  setMoney('totalLoans', row.TotalLoans);
  setNum('numberOfLoans', row.NumberOfLoans);
  setMoney('payment', row.EstimatedMortgagePayment);
  setNum('rate', row.MortgageInterestRate);

  const loanType = meaningfulText(row.LoanType);
  const lender = meaningfulText(row.LenderName);
  const recordingDate = meaningfulText(row.RecordingDate);
  const maturityDate = meaningfulText(row.MaturityDate);
  const auctionDate = meaningfulText(row.AuctionDate);
  const lastNoticeDate = meaningfulText(row.LastNoticeDate);
  if (loanType) details.loanType = loanType;
  if (lender) details.lender = lender;
  if (recordingDate) details.recordingDate = recordingDate;
  if (maturityDate) details.maturityDate = maturityDate;
  if (auctionDate) details.auctionDate = auctionDate;
  if (lastNoticeDate) details.lastNoticeDate = lastNoticeDate;
  return details;
}

function rowToEnrichment(row) {
  const address = meaningfulText(row.PropertyAddress);
  const city = meaningfulText(row.PropertyCity);
  const state = meaningfulText(row.PropertyState);
  if (!address || !city || !state) return null;

  const first = meaningfulText(row.FirstName);
  const last = meaningfulText(row.LastName);
  const contactName = meaningfulText(row.Contact1Name);
  const ownerName = contactName || [first, last].filter(Boolean).join(' ').trim();

  const mailingParts = [
    meaningfulText(row.RecipientAddress),
    [meaningfulText(row.RecipientCity), meaningfulText(row.RecipientState)].filter(Boolean).join(', '),
    meaningfulText(row.RecipientPostalCode)
  ].filter(Boolean);

  const avm = money(row.AVM);
  const marketValue = money(row.MarketValue);
  const assessed = money(row.TaxAssessedValue);
  const lastSalePrice = money(row.LastSalesPrice);
  const lastSaleDate = meaningfulText(row.LastSalesDate);

  return {
    address,
    city,
    state,
    zip: meaningfulText(row.PropertyPostalCode),
    lat: num(row.Latitude),
    lng: num(row.Longitude),
    leadId: buildLeadId({ address, city, state }),
    matchKey: matchKey({ address, city, state }),
    ownerName,
    phones: collectPhones(row),
    email: meaningfulText(row.Contact1Email_1),
    mailingAddress: mailingParts.join(' '),
    entityType: mapOwnerType(row.OwnerType),
    propertyType: meaningfulText(row.PropertyType),
    // Do not seed Comp ARV from vendor AVM/market value — store as market only if used elsewhere.
    estARV: null,
    assessedValue: assessed,
    lastSale: (lastSaleDate || lastSalePrice != null)
      ? { date: lastSaleDate || null, price: lastSalePrice }
      : null,
    signalTags: flagTags(row),
    propertyDetails: propertyDetailsFromRow(row),
    financialDetails: financialDetailsFromRow(row)
  };
}

function mergeUniqueStrings(a = [], b = []) {
  const out = [];
  const seen = new Set();
  for (const v of [...a, ...b]) {
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function preferFill(current, incoming) {
  if (incoming == null || incoming === '') return current;
  if (current == null || current === '' || current === 'unknown') return incoming;
  return current;
}

function mergeDetails(current, incoming) {
  const base = (current && typeof current === 'object') ? { ...current } : {};
  if (!incoming || typeof incoming !== 'object') return base;
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === '') continue;
    base[k] = v;
  }
  return base;
}

function mergeTwoEnrichments(a, b) {
  return {
    ...a,
    zip: preferFill(a.zip, b.zip),
    lat: a.lat == null ? b.lat : a.lat,
    lng: a.lng == null ? b.lng : a.lng,
    ownerName: preferFill(a.ownerName, b.ownerName),
    email: preferFill(a.email, b.email),
    mailingAddress: preferFill(a.mailingAddress, b.mailingAddress),
    propertyType: preferFill(a.propertyType, b.propertyType),
    entityType: (!a.entityType || a.entityType === 'unknown') ? b.entityType : a.entityType,
    estARV: a.estARV == null ? b.estARV : a.estARV,
    assessedValue: a.assessedValue == null ? b.assessedValue : a.assessedValue,
    lastSale: (a.lastSale && a.lastSale.price != null) ? a.lastSale : (b.lastSale || a.lastSale),
    phones: mergeUniqueStrings(a.phones, b.phones),
    signalTags: mergeUniqueStrings(a.signalTags, b.signalTags),
    propertyDetails: mergeDetails(a.propertyDetails, b.propertyDetails),
    financialDetails: mergeDetails(a.financialDetails, b.financialDetails)
  };
}

function mergeEnrichmentIntoLead(lead, enrichment) {
  if (!lead || !enrichment) return lead;
  const next = { ...lead };

  next.zip = preferFill(next.zip, enrichment.zip);
  next.lat = next.lat == null ? enrichment.lat : next.lat;
  next.lng = next.lng == null ? enrichment.lng : next.lng;
  next.ownerName = preferFill(next.ownerName, enrichment.ownerName);
  next.email = preferFill(next.email, enrichment.email);
  next.mailingAddress = preferFill(next.mailingAddress, enrichment.mailingAddress);
  next.propertyType = preferFill(next.propertyType, enrichment.propertyType);
  if (!next.entityType || next.entityType === 'unknown') {
    next.entityType = enrichment.entityType || next.entityType;
  }

  next.phones = mergeUniqueStrings(next.phones || [], enrichment.phones || []);
  next.signalTags = mergeUniqueStrings(next.signalTags || [], enrichment.signalTags || []);

  if (next.estARV == null && enrichment.estARV != null) next.estARV = enrichment.estARV;
  if (next.assessedValue == null && enrichment.assessedValue != null) {
    next.assessedValue = enrichment.assessedValue;
  }
  if ((!next.lastSale || next.lastSale.price == null) && enrichment.lastSale) {
    next.lastSale = enrichment.lastSale;
  }

  const arv = next.estARV != null ? next.estARV : enrichment.estARV;
  const bal = enrichment.financialDetails?.mortgageBalance;
  if (next.estEquity == null && arv != null && bal != null) {
    next.estEquity = Math.round(Number(arv) - Number(bal));
  }

  next.propertyDetails = mergeDetails(next.propertyDetails, enrichment.propertyDetails);
  next.financialDetails = mergeDetails(next.financialDetails, enrichment.financialDetails);
  next.enrichedAt = new Date().toISOString();
  next.enrichmentSource = 'propstream-csv';
  return next;
}

function loadEnrichmentsFromFiles(paths = []) {
  const byMatchKey = new Map();
  const stats = { files: 0, rows: 0, parsed: 0 };

  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    stats.files += 1;
    const { rows } = parseCsv(fs.readFileSync(filePath, 'utf8'));
    stats.rows += rows.length;
    for (const row of rows) {
      const enrichment = rowToEnrichment(canonicalizeRow(row));
      if (!enrichment) continue;
      stats.parsed += 1;
      const prev = byMatchKey.get(enrichment.matchKey);
      byMatchKey.set(
        enrichment.matchKey,
        prev ? mergeTwoEnrichments(prev, enrichment) : enrichment
      );
    }
  }

  const enrichments = [...byMatchKey.values()];
  const byLeadId = new Map(enrichments.map((e) => [e.leadId, e]));
  return { enrichments, byLeadId, byMatchKey, stats };
}

module.exports = {
  FLAG_LABELS,
  COLUMN_ALIASES,
  parseCsv,
  canonicalizeRow,
  rowToEnrichment,
  mergeEnrichmentIntoLead,
  matchKey,
  normalizeStreetKey,
  loadEnrichmentsFromFiles,
  money,
  num,
  isTruthyFlag
};
