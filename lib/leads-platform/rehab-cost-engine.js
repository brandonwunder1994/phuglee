'use strict';

/**
 * Deterministic rehab pricing: vision findings → qty rules × cost book × metro.
 * LLM never invents dollar totals.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COST_BOOK_PATH = path.join(__dirname, 'cost-book.json');

let _book = null;

function loadCostBook() {
  if (_book) return _book;
  _book = JSON.parse(fs.readFileSync(COST_BOOK_PATH, 'utf8'));
  return _book;
}

function slug(s) {
  return String(s || '').trim().toLowerCase();
}

function resolveMetro({ city, state, metroId } = {}) {
  const book = loadCostBook();
  if (metroId && book.metros[metroId]) {
    return { id: metroId, ...book.metros[metroId] };
  }
  const cityKey = slug(city);
  const st = slug(state);
  if (st === 'tx' || st === 'texas' || !st) {
    for (const [id, meta] of Object.entries(book.metros)) {
      if (id === 'national') continue;
      const cities = Array.isArray(meta.cities) ? meta.cities : [];
      if (cities.some((c) => cityKey === c || cityKey.includes(c) || c.includes(cityKey))) {
        return { id, ...meta };
      }
    }
  }
  return { id: 'national', ...book.metros.national };
}

function livingSqftFromDeal(deal, override) {
  if (override != null && Number.isFinite(Number(override)) && Number(override) > 0) {
    return { sqft: Number(override), source: 'user_override' };
  }
  const scan = deal?.conditionScan;
  if (scan?.livingSqft != null && Number(scan.livingSqft) > 0) {
    return { sqft: Number(scan.livingSqft), source: scan.sqftSource || 'scan' };
  }
  try {
    if (deal?.leadId) {
      const { getLead } = require('./store');
      const lead = getLead(deal.leadId);
      const sqft = Number(lead?.propertyDetails?.sqft || lead?.sqft || lead?.livingArea || 0);
      if (sqft > 200 && sqft < 20000) {
        return { sqft, source: 'lead' };
      }
    }
  } catch (_) { /* optional */ }
  return { sqft: 1400, source: 'default_estimate' };
}

function roundMoney(n) {
  return Math.round(Number(n) || 0);
}

function unitCost(book, unitKey, metroFactor, finishGrade) {
  const u = book.units[unitKey];
  if (!u) return 0;
  let mid = Number(u.nationalMid) || 0;
  mid *= Number(metroFactor) || 1;
  if (u.finishSensitive) {
    const grade = book.finishGrades[finishGrade] || book.finishGrades.investor;
    if (unitKey.startsWith('kitchen')) mid *= grade.kitchenMult;
    else if (unitKey.startsWith('bath')) mid *= grade.bathMult;
    else if (unitKey.startsWith('flooring')) mid *= grade.flooringMult;
  }
  return Math.round(mid * 100) / 100;
}

function roofSquaresFromSqft(livingSf) {
  // Footprint heuristic ~ living / 1.6 stories, then /100 for squares, +15% waste
  const footprint = Math.max(800, livingSf / 1.55);
  return Math.max(10, Math.round((footprint / 100) * 1.15));
}

/**
 * @param {object} opts
 * @param {object} opts.deal
 * @param {Array} opts.mediaItems - enriched media with aiLabel
 * @param {object} [opts.options]
 */
function synthesizeConditionScan(opts = {}) {
  const deal = opts.deal || {};
  const media = Array.isArray(opts.mediaItems) ? opts.mediaItems : [];
  const options = opts.options || {};
  const book = loadCostBook();
  const finishGrade = ['retail', 'investor'].includes(options.finishGrade)
    ? options.finishGrade
    : (deal.conditionScan?.finishGrade || 'investor');
  const metro = resolveMetro({
    city: deal.city,
    state: deal.state,
    metroId: options.metroId || deal.conditionScan?.metroId
  });
  const sqftInfo = livingSqftFromDeal(deal, options.livingSqft);
  const contingencyPct = Number.isFinite(Number(options.contingencyPct))
    ? Math.min(25, Math.max(0, Number(options.contingencyPct)))
    : (deal.conditionScan?.contingencyPct ?? 10);

  const priorVoids = new Map();
  const priorOverrides = new Map();
  for (const line of (deal.conditionScan?.lines || [])) {
    if (line?.id && line.voided) priorVoids.set(line.id, true);
    if (line?.id && line.costOverride != null) {
      priorOverrides.set(line.id, {
        costOverride: line.costOverride,
        overrideBy: line.overrideBy || null,
        overrideAt: line.overrideAt || null
      });
    }
  }

  const coverage = Object.fromEntries(book.coverageRooms.map((r) => [r, false]));
  const findings = [];
  const labeled = media.filter((m) => m.aiLabel && typeof m.aiLabel === 'object');

  for (const m of labeled) {
    const L = m.aiLabel;
    const room = slug(L.room);
    if (room.includes('kitchen')) coverage.kitchen = true;
    else if (room.includes('bath')) coverage.bath = true;
    else if (room.includes('bed')) coverage.bedroom = true;
    else if (room.includes('living') || room.includes('family') || room.includes('den')) coverage.living = true;
    else if (room.includes('laundry') || room.includes('utility')) coverage.laundry = true;
    else if (room.includes('garage')) coverage.garage = true;
    else if (room.includes('mech') || room.includes('hvac') || room.includes('water heater') || room.includes('electrical')) {
      coverage.mechanical = true;
    } else if (room.includes('roof') || room.includes('attic')) coverage.roof = true;
    else if (room.includes('yard') || room.includes('backyard') || room.includes('front yard')) coverage.yard = true;
    else if (room.includes('exterior') || room.includes('outside') || room.includes('facade')) {
      if (room.includes('front') || room.includes('street')) coverage.exterior_front = true;
      else if (room.includes('left') || room.includes('side')) coverage.exterior_left = true;
      else if (room.includes('right')) coverage.exterior_right = true;
      else if (room.includes('rear') || room.includes('back')) coverage.exterior_rear = true;
      else coverage.exterior_front = true;
    }

    const issues = Array.isArray(L.issues) ? L.issues : [];
    for (const issue of issues) {
      findings.push({
        mediaId: m.id,
        room: L.room || room,
        text: String(issue.text || issue.label || issue || '').trim(),
        severity: Math.min(5, Math.max(1, Number(issue.severity) || Number(L.severity) || 2)),
        categoryHint: slug(issue.category || L.category || ''),
        surfaces: Array.isArray(L.surfaces) ? L.surfaces : []
      });
    }
  }

  const lines = [];
  function addLine({ category, unitKey, label, qty, mediaIds, severity, note }) {
    const q = Math.max(0, Number(qty) || 0);
    if (q <= 0) return;
    const uc = unitCost(book, unitKey, metro.factor, finishGrade);
    const total = roundMoney(uc * q);
    const id = `line_${category}_${unitKey}_${crypto.createHash('sha1').update(String(mediaIds?.sort().join('|') || label)).digest('hex').slice(0, 10)}`;
    const voided = priorVoids.has(id);
    const ov = priorOverrides.get(id);
    const activeTotal = ov?.costOverride != null ? roundMoney(ov.costOverride) : total;
    lines.push({
      id,
      category,
      unitKey,
      label: label || book.units[unitKey]?.label || unitKey,
      qty: Math.round(q * 100) / 100,
      unit: book.units[unitKey]?.unit || 'ea',
      unitCost: uc,
      total: activeTotal,
      bookTotal: total,
      mediaIds: [...new Set(mediaIds || [])].filter(Boolean),
      severity: severity || 2,
      note: note || '',
      voided: Boolean(voided),
      costOverride: ov?.costOverride ?? null,
      overrideBy: ov?.overrideBy || null,
      overrideAt: ov?.overrideAt || null
    });
  }

  // Aggregate by category heuristics from findings
  const byCat = {
    roofing: [],
    kitchen: [],
    bathrooms: [],
    flooring: [],
    hvac: [],
    plumbing: [],
    electrical: [],
    paint_drywall: [],
    exterior: [],
    windows_doors: []
  };

  function classifyFinding(f) {
    const t = `${f.categoryHint} ${f.text} ${f.room}`.toLowerCase();
    if (/roof|shingle|tarp|leak.*ceiling/.test(t)) return 'roofing';
    if (/kitchen|cabinet|counter|appliance/.test(t)) return 'kitchen';
    if (/bath|toilet|shower|vanity/.test(t)) return 'bathrooms';
    if (/floor|lvp|carpet|tile floor|hardwood/.test(t)) return 'flooring';
    if (/hvac|ac unit|furnace|condenser|air handler/.test(t)) return 'hvac';
    if (/plumb|pipe|water heater|wh |leak.*under|sewer/.test(t)) return 'plumbing';
    if (/electric|panel|breaker|outlet|knob.?and.?tube|fuse/.test(t)) return 'electrical';
    if (/paint|drywall|hole in wall|texture|popcorn/.test(t)) return 'paint_drywall';
    if (/siding|exterior paint|fascia|gutters|fence|foundation crack/.test(t)) return 'exterior';
    if (/window|door|sliding glass/.test(t)) return 'windows_doors';
    return null;
  }

  for (const f of findings) {
    const cat = classifyFinding(f);
    if (cat) byCat[cat].push(f);
  }

  if (byCat.roofing.length) {
    const sev = Math.max(...byCat.roofing.map((f) => f.severity));
    if (sev >= 3) {
      addLine({
        category: 'roofing',
        unitKey: 'roof_squares',
        qty: roofSquaresFromSqft(sqftInfo.sqft),
        mediaIds: byCat.roofing.map((f) => f.mediaId),
        severity: sev,
        note: byCat.roofing[0].text
      });
    }
  }

  if (byCat.kitchen.length) {
    const sev = Math.max(...byCat.kitchen.map((f) => f.severity));
    addLine({
      category: 'kitchen',
      unitKey: sev >= 4 ? 'kitchen_gut' : 'kitchen_cosmetic',
      qty: 1,
      mediaIds: byCat.kitchen.map((f) => f.mediaId),
      severity: sev,
      note: byCat.kitchen[0].text
    });
  }

  if (byCat.bathrooms.length) {
    const bathMedia = new Set(byCat.bathrooms.map((f) => f.mediaId));
    const bathCount = Math.max(1, Math.min(4, bathMedia.size || 1));
    const sev = Math.max(...byCat.bathrooms.map((f) => f.severity));
    addLine({
      category: 'bathrooms',
      unitKey: sev >= 4 ? 'bath_gut' : 'bath_refresh',
      qty: bathCount,
      mediaIds: [...bathMedia],
      severity: sev,
      note: `${bathCount} bath(s)`
    });
  }

  if (byCat.flooring.length || coverage.living || coverage.bedroom) {
    const sev = byCat.flooring.length
      ? Math.max(...byCat.flooring.map((f) => f.severity))
      : 2;
    if (byCat.flooring.length || sev >= 2) {
      const coverSf = Math.round(sqftInfo.sqft * 0.85);
      addLine({
        category: 'flooring',
        unitKey: 'flooring_lvp',
        qty: coverSf,
        mediaIds: byCat.flooring.map((f) => f.mediaId),
        severity: sev,
        note: `≈${coverSf} sf @ living ${sqftInfo.sqft}`
      });
    }
  }

  if (byCat.hvac.length) {
    const sev = Math.max(...byCat.hvac.map((f) => f.severity));
    addLine({
      category: 'hvac',
      unitKey: sev >= 4 ? 'hvac_replace' : 'hvac_service',
      qty: 1,
      mediaIds: byCat.hvac.map((f) => f.mediaId),
      severity: sev,
      note: byCat.hvac[0].text
    });
  }

  if (byCat.plumbing.length) {
    const sev = Math.max(...byCat.plumbing.map((f) => f.severity));
    const hasWh = byCat.plumbing.some((f) => /water heater|wh /i.test(f.text));
    addLine({
      category: 'plumbing',
      unitKey: 'plumbing_repairs',
      qty: 1,
      mediaIds: byCat.plumbing.map((f) => f.mediaId),
      severity: sev,
      note: byCat.plumbing[0].text
    });
    if (hasWh || sev >= 4) {
      addLine({
        category: 'plumbing',
        unitKey: 'water_heater',
        qty: 1,
        mediaIds: byCat.plumbing.map((f) => f.mediaId),
        severity: sev,
        note: 'Water heater cue'
      });
    }
  }

  if (byCat.electrical.length) {
    const sev = Math.max(...byCat.electrical.map((f) => f.severity));
    const panel = byCat.electrical.some((f) => /panel|breaker|fuse|knob/i.test(f.text));
    addLine({
      category: panel ? 'electrical' : 'electrical',
      unitKey: panel || sev >= 4 ? 'electrical_panel' : 'electrical_misc',
      qty: 1,
      mediaIds: byCat.electrical.map((f) => f.mediaId),
      severity: sev,
      note: byCat.electrical[0].text
    });
  }

  if (byCat.paint_drywall.length || findings.some((f) => f.severity >= 3)) {
    const paintFind = byCat.paint_drywall.length ? byCat.paint_drywall : findings.filter((f) => f.severity >= 3);
    addLine({
      category: 'paint_drywall',
      unitKey: 'paint_interior',
      qty: Math.round(sqftInfo.sqft * 0.9),
      mediaIds: paintFind.map((f) => f.mediaId),
      severity: Math.max(...paintFind.map((f) => f.severity), 2),
      note: 'Interior paint / patch allowance'
    });
  }

  if (byCat.exterior.length) {
    const sev = Math.max(...byCat.exterior.map((f) => f.severity));
    addLine({
      category: 'exterior',
      unitKey: 'exterior_paint',
      qty: 1,
      mediaIds: byCat.exterior.map((f) => f.mediaId),
      severity: sev,
      note: byCat.exterior[0].text
    });
  }

  if (byCat.windows_doors.length) {
    const winCount = Math.min(12, Math.max(1, byCat.windows_doors.length));
    const sev = Math.max(...byCat.windows_doors.map((f) => f.severity));
    const doorish = byCat.windows_doors.filter((f) => /door/i.test(f.text));
    addLine({
      category: 'windows_doors',
      unitKey: 'window_replace',
      qty: Math.max(1, winCount - doorish.length),
      mediaIds: byCat.windows_doors.map((f) => f.mediaId),
      severity: sev,
      note: byCat.windows_doors[0].text
    });
    if (doorish.length) {
      addLine({
        category: 'windows_doors',
        unitKey: 'door_replace',
        qty: Math.min(3, doorish.length),
        mediaIds: doorish.map((f) => f.mediaId),
        severity: sev,
        note: doorish[0].text
      });
    }
  }

  // Only citeable lines (plan: uncitable cannot enter Active total)
  const citeable = lines.filter((l) => Array.isArray(l.mediaIds) && l.mediaIds.length > 0);
  const active = citeable.filter((l) => !l.voided);
  const voided = citeable.filter((l) => l.voided);
  const activeSum = active.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const voidedSum = voided.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const contingencyAmt = roundMoney(activeSum * (contingencyPct / 100));
  const withContingency = activeSum + contingencyAmt;

  const coveredCount = Object.values(coverage).filter(Boolean).length;
  const coverageRatio = coveredCount / book.coverageRooms.length;
  let confidence = 'low';
  if (coverageRatio >= 0.7 && labeled.length >= 8) confidence = 'high';
  else if (coverageRatio >= 0.4 && labeled.length >= 4) confidence = 'medium';

  // Suggest bump contingency when low confidence
  const suggestedContingency = confidence === 'low' ? Math.max(contingencyPct, 15) : contingencyPct;

  const gaps = book.coverageRooms.filter((r) => !coverage[r]);
  const walkOrder = buildWalkOrder(gaps, coverage);

  const purchase = Number(deal.purchasePrice) || 0;
  const overPurchaseWarn = purchase > 0 && withContingency > purchase * 0.65;

  return {
    status: 'ready',
    costBookVersion: book.version,
    finishGrade,
    metroId: metro.id,
    metroLabel: metro.label,
    metroFactor: metro.factor,
    livingSqft: sqftInfo.sqft,
    sqftSource: sqftInfo.source,
    contingencyPct: suggestedContingency,
    coverage,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    confidence,
    gaps,
    walkOrder,
    lines: citeable,
    categories: book.categories,
    totals: {
      active: activeSum,
      voided: voidedSum,
      contingency: contingencyAmt,
      withContingency
    },
    labeledCount: labeled.length,
    mediaCount: media.length,
    summary: buildSummary(citeable, confidence, metro.label),
    overPurchaseWarn,
    scannedAt: new Date().toISOString(),
    honestyLabel: 'Screening-grade estimate (~15–25% of contractor bids with good photo coverage). Not a bid.'
  };
}

function buildWalkOrder(gaps, coverage) {
  const tips = {
    kitchen: 'Shoot full kitchen — cabinets, counters, appliances, floor',
    bath: 'Every bath: vanity, tub/shower, floor, ceiling',
    bedroom: 'Each bedroom corner-to-corner',
    living: 'Living / family room wide shot + flooring close-up',
    laundry: 'Laundry / utility if present',
    garage: 'Garage (door opener, walls, slab)',
    mechanical: 'HVAC nameplate + water heater label + panel door open',
    roof: 'Roof line / attic hatch if accessible (flashlight)',
    exterior_front: 'Front elevation street view',
    exterior_left: 'Left elevation',
    exterior_right: 'Right elevation',
    exterior_rear: 'Rear elevation',
    yard: 'Yard / fence / drainage'
  };
  const order = [];
  for (const g of gaps) {
    order.push({ room: g, tip: tips[g] || `Capture ${g.replace(/_/g, ' ')}` });
  }
  if (!coverage.mechanical) {
    order.unshift({
      room: 'mechanical',
      tip: 'Priority: HVAC + water heater labels — drives replace vs service $'
    });
  }
  return order.slice(0, 12);
}

function buildSummary(lines, confidence, metroLabel) {
  const active = lines.filter((l) => !l.voided);
  if (!active.length) {
    return `No citable rehab lines yet (${metroLabel}). Upload more rooms or Rescan after labeling.`;
  }
  const cats = [...new Set(active.map((l) => l.category))];
  return `${active.length} line(s) across ${cats.length} categories · confidence ${confidence} · ${metroLabel}`;
}

function applyLineVoid(scan, lineId, voided) {
  if (!scan || !Array.isArray(scan.lines)) return scan;
  const lines = scan.lines.map((l) => (l.id === lineId ? { ...l, voided: Boolean(voided) } : l));
  const active = lines.filter((l) => !l.voided && l.mediaIds?.length);
  const voidedLines = lines.filter((l) => l.voided);
  const activeSum = active.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const voidedSum = voidedLines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const contingencyPct = Number(scan.contingencyPct) || 10;
  const contingencyAmt = roundMoney(activeSum * (contingencyPct / 100));
  return {
    ...scan,
    lines,
    totals: {
      active: activeSum,
      voided: voidedSum,
      contingency: contingencyAmt,
      withContingency: activeSum + contingencyAmt
    }
  };
}

function repriceScan(scan, deal, options = {}) {
  return synthesizeConditionScan({
    deal: { ...deal, conditionScan: scan },
    mediaItems: options.mediaItems || [],
    options: {
      finishGrade: options.finishGrade || scan?.finishGrade,
      contingencyPct: options.contingencyPct ?? scan?.contingencyPct,
      livingSqft: options.livingSqft ?? scan?.livingSqft,
      metroId: options.metroId || scan?.metroId
    }
  });
}

module.exports = {
  loadCostBook,
  resolveMetro,
  livingSqftFromDeal,
  roofSquaresFromSqft,
  synthesizeConditionScan,
  applyLineVoid,
  repriceScan,
  unitCost,
  COST_BOOK_PATH
};
