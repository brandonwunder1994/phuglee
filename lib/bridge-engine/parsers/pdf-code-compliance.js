/**
 * Reconstruct rows from OCR text of municipal "code compliance / violation report"
 * tables (e.g. Pharr TX 1-month report) with columns like:
 *   Application Name | Opened Date | Street # | Dir | Street Name | Type
 *
 * OCR often emits columns as blocks or glues number|Dir with pipes. This module
 * recovers Property Address + Application Name for the Filter spreadsheet path.
 */

const APP_TYPES = [
  'Public Tree Care',
  'Tires - Residential',
  'Tires – Residential',
  'Tires Residential',
  'Care of Premise',
  'Care of Premises',
  'Weedy Lot',
  'Illegal Dumping',
  'llegal Dumping', // common OCR miss of Illegal
  'Needy Lot' // OCR miss of Weedy Lot — normalized below
];

const STREET_SUFFIX =
  'DR|ST|AVE|RD|CIR|WAY|TR|BLVD|LN|CT|PL|PKWY|HWY|ROAD|DRIVE|STREET|AVENUE|COURT|LANE|TRAIL';

function normalizeAppType(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // OCR confusions
  s = s.replace(/^Needy\s+Lot$/i, 'Weedy Lot');
  s = s.replace(/^l+egal\s+Dumping$/i, 'Illegal Dumping');
  s = s.replace(/^2ublic\s+Tree\s+Care$/i, 'Public Tree Care');
  s = s.replace(/^Tires\s*-?\s*Resident(ial)?$/i, 'Tires - Residential');
  s = s.replace(/^Care\s+of\s+Premises?$/i, 'Care of Premise');
  // Title-ish
  if (/^weedy\s+lot$/i.test(s)) return 'Weedy Lot';
  if (/^care\s+of\s+premise/i.test(s)) return 'Care of Premise';
  if (/^public\s+tree\s+care$/i.test(s)) return 'Public Tree Care';
  if (/^illegal\s+dumping$/i.test(s)) return 'Illegal Dumping';
  if (/^tires/i.test(s)) return 'Tires - Residential';
  return s;
}

function looksLikeAppType(s) {
  const raw = String(s || '').trim();
  // Reject glued OCR lines that already include dates/addresses
  if (/\d/.test(raw)) return false;
  if (raw.length > 40) return false;
  const n = normalizeAppType(raw);
  return APP_TYPES.some((t) => t.toLowerCase() === n.toLowerCase()) ||
    /^(weedy|needy)\s+lot$/i.test(raw) ||
    /^care\s+of\s+premise/i.test(raw) ||
    /^public\s+tree/i.test(raw) ||
    /^illegal\s+dump/i.test(raw) ||
    /^l+egal\s+dump/i.test(raw) ||
    /^tires/i.test(raw);
}

/** Street numbers that are almost always OCR noise for this report family */
function isPlausibleStreetNum(num) {
  const n = String(num || '').trim();
  if (!/^\d{1,6}$/.test(n)) return false;
  if (n === '0' || /^0+$/.test(n)) return false;
  // Years mis-read as street # (Opened Date bleed)
  if (/^(19|20)\d{2}$/.test(n)) return false;
  return true;
}

/**
 * Clean OCR street tokens: "3409|N" → num=3409 dir=N
 */
function parseNumDir(token) {
  const t = String(token || '').trim();
  // 3409|N  3409[N  3409 N  3409N
  let m = t.match(/^(\d{1,6})\s*[|\[Il1\/\\]?\s*([NSEW])\b/i);
  if (m) return { num: m[1], dir: m[2].toUpperCase() };
  m = t.match(/^(\d{1,6})([NSEW])$/i);
  if (m) return { num: m[1], dir: m[2].toUpperCase() };
  m = t.match(/^(\d{1,6})$/);
  if (m) return { num: m[1], dir: '' };
  return null;
}

function cleanStreetName(name) {
  return String(name || '')
    .replace(/[|\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function buildAddress(num, dir, street, suffix) {
  const parts = [num, dir, cleanStreetName(street), suffix ? String(suffix).toUpperCase() : '']
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pull address-like spans from free OCR text.
 * @returns {Array<{ address: string, num: string, dir: string, street: string, suffix: string }>}
 */
function extractAddressSpans(text) {
  const s = String(text || '');
  const out = [];
  const re = new RegExp(
    String.raw`(\d{1,6})\s*[|\[Il1\/\\]?\s*([NSEW])?\s+([A-Z][A-Za-z0-9.'\-\s]{1,40}?)\s+(${STREET_SUFFIX})\b`,
    'gi'
  );
  let m;
  while ((m = re.exec(s)) !== null) {
    if (!isPlausibleStreetNum(m[1])) continue;
    out.push({
      num: m[1],
      dir: (m[2] || '').toUpperCase(),
      street: cleanStreetName(m[3]),
      suffix: m[4].toUpperCase(),
      address: buildAddress(m[1], m[2], m[3], m[4])
    });
  }
  // Also: "3409|N CHAMPAGNE DR" without space before dir
  const re2 = new RegExp(
    String.raw`(\d{1,6})\s*[|\[Il]\s*([NSEW])\s+([A-Z][A-Za-z0-9.'\-\s]{1,40}?)\s+(${STREET_SUFFIX})\b`,
    'gi'
  );
  while ((m = re2.exec(s)) !== null) {
    const addr = buildAddress(m[1], m[2], m[3], m[4]);
    if (!out.some((x) => x.address === addr)) {
      out.push({
        num: m[1],
        dir: m[2].toUpperCase(),
        street: cleanStreetName(m[3]),
        suffix: m[4].toUpperCase(),
        address: addr
      });
    }
  }
  return out;
}

/**
 * Walk OCR lines and emit table rows when Application Name + address pieces appear.
 * @returns {{ aoa: string[][], rowCount: number }|null}
 */
function extractCodeComplianceAoa(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;

  // Fast gate: must look like this report family
  const gate =
    /application\s*name/i.test(raw) ||
    /weedy\s*lot|care\s*of\s*premise|public\s*tree\s*care/i.test(raw);
  if (!gate) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const headers = [
    'Application Name',
    'Opened Date',
    'Property Address',
    'Street #',
    'Dir',
    'Street Name',
    'Type'
  ];
  const rows = [];

  const pushRow = (app, date, num, dir, street, suffix) => {
    if (!isPlausibleStreetNum(num) || !street) return;
    const streetClean = cleanStreetName(street);
    if (streetClean.length < 2) return;
    // Avoid "E" / "N" alone as street name
    if (/^[NSEW]$/i.test(streetClean)) return;
    const address = buildAddress(num, dir, streetClean, suffix);
    rows.push([
      app || '',
      date || '',
      address,
      String(num),
      dir || '',
      `${streetClean}${suffix ? ` ${String(suffix).toUpperCase()}` : ''}`.trim(),
      suffix ? String(suffix).toUpperCase() : ''
    ]);
  };

  // --- Strategy A: line-oriented sparse OCR (each field on its own line) ---
  let pendingApp = '';
  let pendingDate = '';
  let pendingNum = '';
  let pendingDir = '';
  let pendingStreet = '';

  const flushPartial = () => {
    if (pendingNum && pendingStreet) {
      pushRow(pendingApp, pendingDate, pendingNum, pendingDir, pendingStreet, '');
    }
    pendingNum = '';
    pendingDir = '';
    pendingStreet = '';
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^application\s*name$/i.test(line) || /^opened\s*date$/i.test(line)) continue;
    if (/^street\s*(#|name|number)?$/i.test(line) || /^type$/i.test(line) || /^dir$/i.test(line)) {
      continue;
    }

    if (looksLikeAppType(line)) {
      flushPartial();
      pendingApp = normalizeAppType(line);
      pendingDate = '';
      continue;
    }

    const dateOnly = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (dateOnly) {
      pendingDate = dateOnly[1];
      continue;
    }

    // Full-ish address on one line
    const addrOnLine = extractAddressSpans(line);
    if (addrOnLine.length) {
      flushPartial();
      for (const a of addrOnLine) {
        pushRow(pendingApp, pendingDate, a.num, a.dir, a.street, a.suffix);
      }
      continue;
    }

    // Street suffix alone → complete pending address
    if (new RegExp(`^(${STREET_SUFFIX})$`, 'i').test(line)) {
      if (pendingNum && pendingStreet) {
        pushRow(pendingApp, pendingDate, pendingNum, pendingDir, pendingStreet, line);
        pendingNum = '';
        pendingDir = '';
        pendingStreet = '';
      }
      continue;
    }

    // 3409|N or 3409 N
    const nd = parseNumDir(line.replace(/[\[\]]/g, ''));
    if (nd && line.length <= 12) {
      flushPartial();
      pendingNum = nd.num;
      pendingDir = nd.dir;
      pendingStreet = '';
      continue;
    }

    // Dir alone
    if (/^[NSEW]$/i.test(line) && pendingNum && !pendingDir) {
      pendingDir = line.toUpperCase();
      continue;
    }

    // Street name (possibly multi-token)
    if (/^[A-Za-z]/.test(line) && !looksLikeAppType(line) && pendingNum) {
      // May include suffix at end: "MARION ST"
      const m = line.match(new RegExp(`^(.+?)\\s+(${STREET_SUFFIX})$`, 'i'));
      if (m) {
        pushRow(pendingApp, pendingDate, pendingNum, pendingDir, m[1], m[2]);
        pendingNum = '';
        pendingDir = '';
        pendingStreet = '';
      } else {
        pendingStreet = pendingStreet
          ? `${pendingStreet} ${line}`
          : line;
      }
      continue;
    }

    // Mixed tokens on one line without full regex match
    const tokens = line.split(/\s+/);
    let num = '';
    let dir = '';
    let streetParts = [];
    let suffix = '';
    let dateOnLine = '';
    for (const tok of tokens) {
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(tok)) {
        dateOnLine = tok;
        continue;
      }
      const ndTok = parseNumDir(tok.replace(/[\[\]]/g, ''));
      if (ndTok && !num) {
        num = ndTok.num;
        dir = ndTok.dir;
        continue;
      }
      if (new RegExp(`^(${STREET_SUFFIX})$`, 'i').test(tok)) {
        suffix = tok.toUpperCase();
        continue;
      }
      if (/^[NSEW]$/i.test(tok) && num && !dir) {
        dir = tok.toUpperCase();
        continue;
      }
      if (/^[A-Za-z]/.test(tok)) streetParts.push(tok);
    }
    if (num && streetParts.length) {
      flushPartial();
      pushRow(
        pendingApp,
        dateOnLine || pendingDate,
        num,
        dir,
        streetParts.join(' '),
        suffix
      );
    }
  }
  flushPartial();

  // --- Strategy B: flatten + regex addresses, zip with app types ---
  if (rows.length < 3) {
    const apps = [];
    const dates = [];
    for (const line of lines) {
      if (looksLikeAppType(line)) apps.push(normalizeAppType(line));
      const dm = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
      if (dm) dates.push(dm[1]);
    }
    // Join sparse lines so "3409|N\\nCHAMPAGNE\\nDR" becomes one phrase
    const flat = lines.join(' ');
    const addrs = extractAddressSpans(flat);
    if (addrs.length >= 3) {
      const zipped = [];
      for (let i = 0; i < addrs.length; i += 1) {
        const a = addrs[i];
        zipped.push([
          apps[i] || '',
          dates[i] || '',
          a.address,
          a.num,
          a.dir,
          `${a.street}${a.suffix ? ` ${a.suffix}` : ''}`.trim(),
          a.suffix
        ]);
      }
      if (zipped.length > rows.length) {
        rows.length = 0;
        rows.push(...zipped);
      }
    }
  }

  // Dedupe by address + app + date
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const key = `${r[0]}|${r[1]}|${r[2]}`.toLowerCase();
    if (!r[2] || seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }

  if (unique.length < 2) return null;

  return {
    aoa: [headers, ...unique],
    rowCount: unique.length
  };
}

module.exports = {
  extractCodeComplianceAoa,
  extractAddressSpans,
  normalizeAppType,
  looksLikeAppType,
  buildAddress,
  parseNumDir
};
