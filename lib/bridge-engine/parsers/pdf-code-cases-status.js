/**
 * Reconstruct rows from municipal "CODE CASES OPENED BY STATUS" PDFs
 * (e.g. Lawrenceville GA CITY-#### exports) with CEU case numbers and a
 * real Case Type column.
 *
 * Embedded text often glues headers and wraps multi-line types/assignees.
 * This recovers Case #, Case Type, Main Address, dates, status, parcel,
 * assignee, and project so Filter can offer Case Type as the Type column.
 */

const CASE_ID_RE = /CEU\d{4}-\d+\*?/g;

const STATUS_RE =
  /^(Closed|Open|On Hold|Pending(?:\s+Court(?:\s+Action)?)?)\b/i;

const KNOWN_ASSIGNEES = [
  'System Administrator',
  'Juan Pablo Rebolledo',
  'Derek Phillips',
  'Todd Parry',
  'George Bowles'
];

const HEADERS = [
  'Case #',
  'Case Type',
  'Main Address',
  'Opened Date',
  'Closed Date',
  'Case Status',
  'Parcel',
  'Assigned To',
  'Project'
];

function looksLikeCodeCasesStatus(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  const ceuCount = (raw.match(/CEU\d{4}-\d+/g) || []).length;
  if (ceuCount >= 3) return true;
  return (
    /CODE\s+CASES\s+OPENED\s+BY\s+STATUS/i.test(raw) &&
    /case\s*#|case\s*type|main\s*address/i.test(raw)
  );
}

function normalizeSpace(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split "High Grass Derek Phillips" / multi-line type + assignee.
 */
function splitTypeAndAssignee(middle) {
  const s = normalizeSpace(middle);
  if (!s) return { caseType: '', assignee: '' };

  for (const name of KNOWN_ASSIGNEES) {
    if (s.length > name.length && s.toLowerCase().endsWith(name.toLowerCase())) {
      const before = s.slice(0, s.length - name.length).trim();
      if (before) return { caseType: before, assignee: name };
    }
  }

  // Last 2–3 Title-Case tokens as person name
  const m3 = s.match(/^(.*?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})$/);
  if (m3 && m3[1] && m3[1].length >= 2) {
    return { caseType: m3[1].trim(), assignee: m3[2].trim() };
  }

  return { caseType: s, assignee: '' };
}

function isPlausibleHouseNum(num) {
  const n = String(num || '').trim();
  if (!/^\d{1,6}$/.test(n)) return false;
  // Years from closed/opened dates glued to the next line (e.g. 06/10/2026 75 Dogwood)
  if (/^(19|20)\d{2}$/.test(n)) return false;
  if (n === '0' || /^0+$/.test(n)) return false;
  return true;
}

/**
 * Address: "75 Dogwood Park Trce, Lawrenceville, GA 30046"
 * Also: "17 E Pike St, Lawrenceville,\nGA 30046"
 * Must not steal the year from "06/10/2026 75 Dogwood…".
 */
function matchAddress(block) {
  const text = String(block || '');
  // (?<!//d) keeps "2026" from MM/DD/YYYY from being the house number
  const re =
    /(?<![\d/])(\d{1,6})\s+([A-Za-z0-9.'#\-\/\s]+?),\s*([A-Za-z][A-Za-z .]*?)\s*,?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/g;

  let m;
  while ((m = re.exec(text)) !== null) {
    if (!isPlausibleHouseNum(m[1])) continue;
    const streetName = normalizeSpace(m[2]);
    if (!streetName || streetName.length < 2) continue;
    if (/count of cases|code status|opened by status/i.test(streetName)) continue;
    // Street token should start with a letter (not another date fragment)
    if (!/^[A-Za-z]/.test(streetName)) continue;
    const city = normalizeSpace(m[3]).replace(/,\s*$/, '');
    if (!city || city.length < 2) continue;
    const street = `${m[1]} ${streetName}`;
    return {
      index: m.index,
      length: m[0].length,
      address: `${street}, ${city}, ${m[4]} ${m[5]}`
    };
  }
  return null;
}

function parseTail(after) {
  const s = normalizeSpace(after);
  if (!s) {
    return { openedDate: '', parcel: '', status: '', project: '' };
  }

  // OpenedDate [Parcel] Status Project
  const m = s.match(
    /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(.*)$/
  );
  if (!m) {
    return { openedDate: '', parcel: '', status: '', project: s };
  }

  const openedDate = m[1];
  let rest = (m[2] || '').trim();

  // Optional parcel then status
  let parcel = '';
  let status = '';
  let project = '';

  const statusM = rest.match(
    /^(?:([A-Z0-9][A-Z0-9A-Za-z]{0,12}(?:\s+[A-Z0-9]{1,6})?)\s+)?(Closed|Open|On Hold|Pending(?:\s+Court(?:\s+Action)?)?)\s*(.*)$/i
  );
  if (statusM) {
    parcel = normalizeSpace(statusM[1] || '');
    // Parcel tokens look like 5110 311 / 5146B138 / 7010A004 — not English words
    if (parcel && /^(Closed|Open|On|Pending)/i.test(parcel)) {
      // mis-captured
      rest = `${parcel} ${statusM[2]} ${statusM[3] || ''}`.trim();
      parcel = '';
    } else {
      status = normalizeSpace(statusM[2] || '');
      project = normalizeSpace(statusM[3] || '');
      return { openedDate, parcel, status, project };
    }
  }

  // Fallback: find status keyword in rest
  const sm = rest.match(STATUS_RE);
  if (sm) {
    status = sm[1];
    const idx = rest.search(STATUS_RE);
    const before = rest.slice(0, idx).trim();
    project = rest.slice(idx + sm[0].length).trim();
    parcel = before;
  } else {
    project = rest;
  }

  return { openedDate, parcel, status, project };
}

function parseCaseBlock(caseId, body) {
  const block = String(body || '');
  const addr = matchAddress(block);
  if (!addr) return null;

  const before = block.slice(0, addr.index);
  const after = block.slice(addr.index + addr.length);

  let mid = normalizeSpace(before);
  let closedDate = '';
  const closedM = mid.match(/\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/);
  if (closedM) {
    closedDate = closedM[1];
    mid = mid.slice(0, closedM.index).trim();
  }

  const { caseType, assignee } = splitTypeAndAssignee(mid);
  if (!caseType || caseType.length < 2) return null;

  const tail = parseTail(after);
  // Prefer status from tail; section headers alone are weak
  const status = tail.status || '';

  return [
    String(caseId).replace(/\*$/, ''),
    caseType,
    addr.address,
    tail.openedDate || '',
    closedDate,
    status,
    tail.parcel || '',
    assignee,
    tail.project || ''
  ];
}

/**
 * @param {string} text
 * @returns {{ aoa: string[][], rowCount: number }|null}
 */
function extractCodeCasesStatusAoa(text) {
  const raw = String(text || '');
  if (!looksLikeCodeCasesStatus(raw)) return null;

  // Drop footer / chart noise lines lightly by working on full text with CEU splits
  const ids = [...raw.matchAll(CASE_ID_RE)];
  if (ids.length < 2) return null;

  const rows = [];
  const seen = new Set();

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i][0];
    const start = ids[i].index + id.length;
    const end = i + 1 < ids.length ? ids[i + 1].index : raw.length;
    let body = raw.slice(start, end);

    // Stop at page footers / totals that trail a block
    body = body.replace(
      /\n(?:Page\s+\d+\s+of\s+\d+|TOTAL CASES OPENED FOR)[\s\S]*$/i,
      '\n'
    );

    const row = parseCaseBlock(id, body);
    if (!row) continue;
    const key = `${row[0]}|${row[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  if (rows.length < 2) return null;

  return {
    aoa: [HEADERS, ...rows],
    rowCount: rows.length
  };
}

module.exports = {
  extractCodeCasesStatusAoa,
  looksLikeCodeCasesStatus,
  parseCaseBlock,
  splitTypeAndAssignee,
  HEADERS
};
