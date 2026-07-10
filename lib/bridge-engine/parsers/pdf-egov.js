/**
 * E-Gov / SeeClickFix-style PIR PDF rows (Action Form Name, Date Submitted, …).
 * These reports often have multi-line headers/cells and broken text encoding;
 * OCR recovers them. This module rebuilds real columns — especially Action Form Name —
 * so Filter can score Type the same way as Excel.
 */

const PIR_HEADERS = Object.freeze([
  'E-Gov Link Tracking #',
  'Action Form Name',
  'Date Submitted',
  'Department',
  'Issue Street Number',
  'Issue Street Name',
  'Issue City',
  'Form Values'
]);

const STREET_COL = 'Street Address';

function lettersOnly(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function looksLikeActionFormHeader(text) {
  const l = lettersOnly(text);
  if (!l) return false;
  if (l.includes('actionform') || l.includes('actionformname')) return true;
  if (l.includes('formname') && (l.includes('action') || l.includes('egov') || l.includes('tracking'))) {
    return true;
  }
  // Garbled: "A<llon Fom, N..,.." / "Allon Fom"
  if (/a.?llon\s*fom/i.test(text) || /act[il]on\s*f[o0]rm/i.test(text)) return true;
  if (l.includes('egov') && l.includes('tracking')) return true;
  if (l.includes('datesubmitted') && l.includes('department')) return true;
  return false;
}

function looksLikeGrassForm(token) {
  const l = lettersOnly(token);
  if (!l || l.length < 6) return false;
  // grass complaint / glass complatrn / g11sscomp1a1n1
  if (l.includes('grass') && l.includes('comp')) return true;
  if (/^g+r*a*s+s*c*o*m+p/.test(l) && l.includes('comp')) return true;
  if (l.includes('glass') && l.includes('comp')) return true; // common OCR of Grass
  return false;
}

function looksLikePropertyMaintForm(token) {
  const l = lettersOnly(token);
  if (!l) return false;
  if (l.includes('propertymaint') || (l.includes('property') && l.includes('maint'))) return true;
  if (l.includes('propertymaintcodeviolation')) return true;
  return false;
}

function normalizeActionFormName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const l = lettersOnly(s);
  if (looksLikeGrassForm(s) || (l.includes('grass') && l.includes('comp'))) {
    return 'Grass complaint';
  }
  if (looksLikePropertyMaintForm(s) || (l.includes('maint') && l.includes('viol'))) {
    return 'Property Maint. Code Violation';
  }
  if (l.includes('junk') || l.includes('debris')) {
    return s.length <= 80 ? s : 'Property Maint. Code Violation';
  }
  // Collapse multi-line OCR: "Property Maint. Code Violation"
  if (/property/i.test(s) && /maint/i.test(s) && /viol/i.test(s)) {
    return 'Property Maint. Code Violation';
  }
  if (/grass/i.test(s) && /complain/i.test(s)) return 'Grass complaint';
  return s.slice(0, 120);
}

function normalizeDepartment(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Code Compliance';
  if (/code/i.test(s) && /comp/i.test(s)) return 'Code Compliance';
  return s.slice(0, 80);
}

function extractDateTime(chunk) {
  const m = String(chunk || '').match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}):(\d{2})/
  );
  if (!m) {
    const d = String(chunk || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!d) return '';
    let y = d[3];
    if (y.length === 2) y = `20${y}`;
    return `${d[1]}/${d[2]}/${y}`;
  }
  let y = m[3];
  if (y.length === 2) y = `20${y}`;
  return `${m[1]}/${m[2]}/${y} ${m[4]}:${m[5]}`;
}

function buildStreet(number, name) {
  const n = String(number || '').replace(/~/g, '').trim();
  const nm = String(name || '').replace(/\s+/g, ' ').trim();
  if (n && nm) return `${n} ${nm}`.replace(/\s+/g, ' ').trim();
  if (nm) return nm;
  if (n) return n;
  return '';
}

/**
 * Parse OCR or clean text from E-Gov PIR landscape tables.
 * Anchors on tracking # + date + Compliance.
 */
function extractEgovPirFromText(text) {
  const src = String(text || '');
  if (!src.trim()) return null;

  const hasSignal =
    looksLikeActionFormHeader(src) ||
    /\bAction\s*Form\s*Name\b/i.test(src) ||
    /\bDate\s*Submitted\b/i.test(src) ||
    /\bForm\s*Values\b/i.test(src) ||
    /\bIssue\s*Street\b/i.test(src) ||
    /\bE-?Gov\b/i.test(src) ||
    // Garbled or grass-report signal
    /A.?llon\s*Fom/i.test(src) ||
    (/\bCode\s*Comp/i.test(src) && /grass|junk|debris|maint/i.test(src));

  if (!hasSignal) return null;

  const rows = [];
  const seen = new Set();

  // --- Path 1: clean/OCR row cores (Junk & Debris style) ---
  // tracking [Violation] date time Compliance streetNum streetName city formValues
  const coreRe =
    /(\d{9,12})\s+(?:Violation\s+)?(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(?:Code\s+)?Compliance\s+(\d{1,6}|~+)?\s*([A-Za-z][A-Za-z0-9 .#'\-\/]*?)\s+(Harlingen|HARLING(?:EN|ING)?|McAllen|Brownsville|[A-Z][a-z]{3,})\s*([\s\S]*?)(?=\d{9,12}\s+(?:Violation\s+)?\d{1,2}\/|\n\s*Property\s+Maint|$)/gi;

  let m;
  while ((m = coreRe.exec(src)) !== null) {
    const tracking = m[1];
    if (seen.has(tracking)) continue;
    const dateSubmitted = `${m[2]} ${m[3]}`;
    const streetNumber = (m[4] || '').replace(/~/g, '').trim();
    let streetName = String(m[5] || '').replace(/\s+/g, ' ').trim();
    // OCR often splits "BOARDWALK AVE." / "SOUTHGATE RD" / "WEST LOUISIANA STREET"
    streetName = streetName
      .replace(/\bEN\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const city = String(m[6] || '')
      .replace(/^HARLING$/i, 'Harlingen')
      .replace(/^HARLINGEN$/i, 'Harlingen')
      .trim();
    let formValues = String(m[7] || '')
      .replace(/\s+/g, ' ')
      .trim();

    // Action form from preceding window
    const pre = src.slice(Math.max(0, m.index - 120), m.index);
    let actionForm = '';
    if (/property\s*maint/i.test(pre) || /property\s*maint/i.test(m[0]) || /Violation/i.test(m[0])) {
      actionForm = 'Property Maint. Code Violation';
    } else if (looksLikeGrassForm(pre) || looksLikeGrassForm(m[0])) {
      actionForm = 'Grass complaint';
    } else {
      actionForm = normalizeActionFormName(pre) || 'Property Maint. Code Violation';
    }

    // Prefer address inside form values when street columns are incomplete
    // OCR often leaves only "AVE." / "RD" / "STREET" in the name cell.
    const street = buildStreet(streetNumber, streetName);
    const nameLooksStub =
      !streetName ||
      /^(AVE\.?|RD\.?|ST\.?|STREET|DR\.?|BLVD\.?|CT\.?|LN\.?|WAY)$/i.test(streetName) ||
      streetName.length <= 4;
    const addrInForm = formValues.match(
      /\b(\d{1,6}\s+[A-Za-z0-9.#/' -]{2,40}?(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Lane|Ln|Ct|Court|Way|Pkwy|Loop)\.?)\b/i
    );
    let streetAddress = street;
    if (addrInForm && (nameLooksStub || !street || street.length < 8)) {
      streetAddress = addrInForm[1].replace(/\s+/g, ' ').trim();
      // Backfill name from form address when stub
      if (nameLooksStub) {
        const withoutNum = streetAddress.replace(/^\d{1,6}\s+/, '').trim();
        if (withoutNum) streetName = withoutNum;
      }
    } else if (!streetAddress && addrInForm) {
      streetAddress = addrInForm[1].trim();
    }

    if (!streetAddress && !formValues) continue;
    seen.add(tracking);

    rows.push({
      'E-Gov Link Tracking #': tracking,
      'Action Form Name': actionForm,
      'Date Submitted': dateSubmitted,
      Department: 'Code Compliance',
      'Issue Street Number': streetNumber,
      'Issue Street Name': streetName,
      'Issue City': city,
      'Form Values': formValues,
      [STREET_COL]: streetAddress
    });
  }

  // --- Path 2: garbled grass-report lines (bad PDF encoding) ---
  if (rows.length < 3) {
    const lines = src.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Long case/tracking-ish prefix + grass form + code compliance + address
      const idMatch = line.match(/(\d{8,12})/);
      if (!idMatch) continue;
      const tracking = idMatch[1];
      if (seen.has(tracking)) continue;

      const hasGrass = looksLikeGrassForm(line) || /grass\s*complain/i.test(line);
      const hasMaint = looksLikePropertyMaintForm(line);
      const hasDept = /code\s*comp/i.test(line) || /c[o0]de\s*comp/i.test(line);
      if (!hasDept && !hasGrass && !hasMaint) continue;
      if (!hasGrass && !hasMaint && !/complain|violat|junk|debris|maint/i.test(line)) continue;

      const dateSubmitted = extractDateTime(line);
      // Street: text after Code Compliance-ish token (garbled "CodeCompU.nce")
      let afterDept = '';
      const deptSplit = line.split(/[Cc][Oo0Q]de\s*[Cc][Oo0a-z]*mp[a-zUln\.]*/i);
      if (deptSplit.length > 1) afterDept = deptSplit.slice(1).join(' ').trim();
      else {
        // Drop leading case id + form + date tokens; take trailing address-ish chunk
        afterDept = line
          .replace(/^\S+\s+/, '')
          .replace(/.*?(\d{1,2}[\/\-ln]\d{1,2}[\/\-ln]?\d{0,4}\s*\d{0,2}:?\d{0,2})/i, '')
          .trim();
      }
      // Strip residual "Code Compliance" OCR garbage at start of afterDept
      afterDept = afterDept
        .replace(/^(?:[Cc][Oo0Q]?de\s*)?[Cc]omp[a-zUln\.]*\s*/i, '')
        .trim();

      // Pull house number + street words
      let streetAddress = '';
      // Block addresses first: "1000 BLK OF NORTH B STREET"
      const blk = afterDept.match(
        /\b(\d{1,6}\s*[-–]?\s*\d{0,6}\s*BLK\s*(?:OF\s+)?[A-Za-z0-9 .#]+)/i
      );
      if (blk) {
        streetAddress = blk[1].replace(/\s+/g, ' ').trim();
      } else {
        const addr = afterDept.match(
          /\b(\d{1,6}\s+[A-Za-z][A-Za-z0-9#./' -]{2,40})/
        );
        if (addr) streetAddress = addr[1].replace(/\s+/g, ' ').trim();
      }

      // Continuation line may hold more of the street
      if ((!streetAddress || streetAddress.length < 8) && lines[i + 1]) {
        const next = lines[i + 1];
        if (!/^\d{8,}/.test(next) && !/what\s*is\s*the\s*loc/i.test(next)) {
          const cont = next.match(
            /\b(\d{1,6}[-–]?\d{0,6}\s*(?:BLK\s*(?:OF\s+)?)?[A-Za-z0-9 .#]+)/i
          );
          if (cont) streetAddress = cont[1].replace(/\s+/g, ' ').trim();
          else if (/[A-Za-z]{3,}/.test(next) && next.length < 80 && !/code\s*comp/i.test(next)) {
            streetAddress = [streetAddress, next].filter(Boolean).join(' ').trim();
          }
        }
      }

      // Reject if still looks like department/form noise
      if (
        !streetAddress ||
        streetAddress.length < 4 ||
        /code\s*comp|complaint|complatnt/i.test(streetAddress)
      ) {
        continue;
      }

      let actionForm = 'Grass complaint';
      if (hasMaint) actionForm = 'Property Maint. Code Violation';
      else if (hasGrass) actionForm = 'Grass complaint';

      seen.add(tracking);
      rows.push({
        'E-Gov Link Tracking #': tracking,
        'Action Form Name': actionForm,
        'Date Submitted': dateSubmitted,
        Department: 'Code Compliance',
        'Issue Street Number': '',
        'Issue Street Name': streetAddress,
        'Issue City': /harlingen/i.test(src) ? 'Harlingen' : '',
        'Form Values': '',
        [STREET_COL]: streetAddress
      });
    }
  }

  // --- Path 3: form-values address dump when tracking rows thin ---
  if (rows.length < 2) {
    const formAddrRe =
      /(?:located\s+at|occurs\?\s*\[?|Reporting[^[]{0,40})\s*(\d{1,6}\s+[A-Za-z0-9.#/' -]{3,50}?)(?:[.,;\]]|$)/gi;
    let fm;
    while ((fm = formAddrRe.exec(src)) !== null) {
      const street = fm[1].replace(/\s+/g, ' ').trim();
      if (street.length < 5) continue;
      const key = street.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const window = src.slice(fm.index, fm.index + 200);
      const actionForm = /junk|debris|dump/i.test(window)
        ? 'Property Maint. Code Violation'
        : /grass|weed|overgrown/i.test(window)
          ? 'Grass complaint'
          : 'Property Maint. Code Violation';
      rows.push({
        'E-Gov Link Tracking #': '',
        'Action Form Name': actionForm,
        'Date Submitted': '',
        Department: 'Code Compliance',
        'Issue Street Number': '',
        'Issue Street Name': street,
        'Issue City': /harlingen/i.test(src) ? 'Harlingen' : '',
        'Form Values': window.replace(/\s+/g, ' ').trim().slice(0, 400),
        [STREET_COL]: street
      });
    }
  }

  if (!rows.length) return null;

  // AOA for Excel path — keep Action Form Name as a real column
  const headers = [...PIR_HEADERS, STREET_COL];
  const aoa = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => String(row[h] ?? '').trim()));
  }

  return {
    headers,
    rows,
    aoa,
    parseMode: 'egov-pir',
    actionFormColumn: 'Action Form Name'
  };
}

function isEgovPirText(text) {
  return looksLikeActionFormHeader(text) || extractEgovPirFromText(text) != null;
}

module.exports = {
  PIR_HEADERS,
  extractEgovPirFromText,
  looksLikeActionFormHeader,
  normalizeActionFormName,
  isEgovPirText
};
