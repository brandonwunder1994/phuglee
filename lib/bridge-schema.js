const PDA_COLUMNS = Object.freeze({
  firstName: { label: 'First Name', aliases: ['first name', 'firstname', 'first', 'owner first', 'owner first name'] },
  lastName: { label: 'Last Name', aliases: ['last name', 'lastname', 'last', 'owner last', 'owner last name', 'surname'] },
  phone: { label: 'Phone', aliases: ['phone', 'phone number', 'telephone', 'mobile', 'cell', 'owner phone'] },
  email: { label: 'Email', aliases: ['email', 'email address', 'e-mail', 'owner email'] },
  street: { label: 'Street Address', aliases: ['street address', 'street', 'address', 'property address', 'site address', 'location'] },
  city: { label: 'City', aliases: ['city', 'property city', 'mail city'] },
  state: { label: 'State', aliases: ['state', 'st', 'property state'] },
  postal: { label: 'Postal Code', aliases: ['postal code', 'zip code', 'zip', 'postal', 'zipcode'] }
});

const COLUMN_KEYS = Object.keys(PDA_COLUMNS);

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers, aliases, used = new Set()) {
  const normalized = headers
    .map((h) => ({ original: h, lower: normalizeHeader(h) }))
    .filter((h) => !used.has(h.original));

  for (const alias of aliases) {
    const match = normalized.find((h) => h.lower === alias);
    if (match) return match.original;
  }

  for (const alias of aliases) {
    if (alias.length < 3) continue;
    const match = normalized.find((h) => {
      if (h.lower === alias) return true;
      if (h.lower.startsWith(`${alias} `) || h.lower.endsWith(` ${alias}`)) return true;
      if (h.lower.includes(` ${alias} `)) return true;
      return false;
    });
    if (match) return match.original;
  }

  return null;
}

function detectColumnMap(headers) {
  const map = {};
  const used = new Set();
  for (const key of COLUMN_KEYS) {
    const col = findColumn(headers, PDA_COLUMNS[key].aliases, used);
    if (col) used.add(col);
    map[key] = col;
  }
  return map;
}

function missingColumns(map) {
  return COLUMN_KEYS
    .filter((key) => !map[key])
    .map((key) => PDA_COLUMNS[key].label);
}

function buildFullAddress(street, city, stateName, postal) {
  if (!street) return '';
  const cityState = [city, stateName].filter(Boolean).join(', ');
  const parts = [street];
  if (cityState) parts.push(cityState);
  if (postal) parts[parts.length - 1] = `${parts[parts.length - 1]} ${postal}`.trim();
  return parts.join(', ');
}

function convertRows(rows, columnMap) {
  if (!rows.length) return [];

  const missing = missingColumns(columnMap);
  if (missing.length) {
    throw new Error(`Missing columns: ${missing.join(', ')}`);
  }

  return rows.map((row) => {
    const street = String(row[columnMap.street] || '').trim();
    const city = String(row[columnMap.city] || '').trim();
    const stateName = String(row[columnMap.state] || '').trim();
    const postal = String(row[columnMap.postal] || '').trim();
    return {
      'First Name': String(row[columnMap.firstName] || '').trim(),
      'Last Name': String(row[columnMap.lastName] || '').trim(),
      Phone: String(row[columnMap.phone] || '').trim(),
      Email: String(row[columnMap.email] || '').trim(),
      'Street Address': street,
      City: city,
      State: stateName,
      'Postal Code': postal,
      _address: buildFullAddress(street, city, stateName, postal)
    };
  }).filter((row) => row._address.length > 0);
}

function toAnalyzerSheetRows(converted) {
  return converted.map(({ _address, ...rest }) => rest);
}

function isSpreadsheetFile(filename) {
  return /\.(xlsx|xls|xlsm|csv|tsv)$/i.test(String(filename || ''));
}

module.exports = {
  PDA_COLUMNS,
  COLUMN_KEYS,
  findColumn,
  detectColumnMap,
  missingColumns,
  convertRows,
  toAnalyzerSheetRows,
  buildFullAddress,
  isSpreadsheetFile
};