'use strict';

/**
 * Builder packet — text + PDF one-pager for land disposition.
 * Copy / download only — not a PSA generator.
 */

const PDFDocument = require('pdfkit');
const { extractParcelFields, leadAcres } = require('./parcel');

const GOLD = '#B8860B';
const INK = '#1A1A1A';
const MUTED = '#5C5C5C';
const RULE = '#D4D0C8';
const BAND = '#F7F5F0';

function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function fmtMoney(v) {
  const n = money(v);
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

function fmtAcres(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Math.round(n * 100) / 100} ac`;
}

function leadZoning(lead = {}) {
  return extractParcelFields(lead).zoning || '';
}

function checkLine(label, check = {}) {
  const status = String(check.status || 'unknown').toUpperCase();
  const note = String(check.note || '').trim();
  return note ? `${label}: ${status} — ${note}` : `${label}: ${status}`;
}

function packetSlug(lead = {}) {
  return String(lead.address || lead.leadId || 'lot')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'lot';
}

function buildPacketModel(lead = {}, opts = {}) {
  const note = String(opts.note || '').trim();
  const screen = lead.landScreen && typeof lead.landScreen === 'object' ? lead.landScreen : {};
  const checks = screen.checks && typeof screen.checks === 'object' ? screen.checks : {};
  const uw = lead.landUnderwriting && typeof lead.landUnderwriting === 'object'
    ? lead.landUnderwriting
    : {};
  const funds = Array.isArray(lead.fundMatches) ? lead.fundMatches : [];
  const parcel = extractParcelFields(lead);
  const address = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const verdict = String(screen.verdict || 'pending').toUpperCase();
  const recommended = String(screen.recommendedVerdict || '').toUpperCase();
  const dispo = lead.landDisposition && typeof lead.landDisposition === 'object'
    ? lead.landDisposition
    : null;

  return {
    address: address || '—',
    owner: lead.ownerName || '—',
    phones: (Array.isArray(lead.phones) && lead.phones.length) ? lead.phones.join(', ') : '—',
    parcel,
    asset: lead.assetClass === 'teardown' ? 'Teardown' : 'Vacant lot',
    signals: (Array.isArray(lead.signalTags) && lead.signalTags.length)
      ? lead.signalTags.join(', ')
      : '—',
    verdict,
    recommended,
    demandBuilders: String(screen.demandBuilders || 'unknown').toUpperCase(),
    checks: [
      checkLine('Infill', checks.infill),
      checkLine('Utilities', checks.utilities),
      checkLine('Paved access', checks.pavedAccess),
      checkLine('Cleared', checks.cleared),
      checkLine('Flat', checks.flat),
      checkLine('Flood', checks.flood),
      checkLine('Zoning check', checks.zoning)
    ],
    verdictNote: String(screen.verdictNote || '').trim(),
    uw: {
      landFmv: fmtMoney(uw.landFmv),
      siteCosts: fmtMoney(uw.siteCosts),
      investorGap: fmtMoney(uw.investorGap != null ? uw.investorGap : 5000),
      assignmentFee: fmtMoney(uw.assignmentFee),
      buyerCeiling: fmtMoney(uw.buyerCeiling),
      contractTarget: fmtMoney(uw.contractTarget),
      lao: fmtMoney(uw.lao),
      sanityWarning: uw.sanityWarning || ''
    },
    funds: funds.slice(0, 8).map((f, i) => {
      const name = f.fundName || f.fundId || `Fund ${i + 1}`;
      const score = f.score != null ? String(f.score) : '';
      const reasons = Array.isArray(f.reasons) ? f.reasons.slice(0, 3).join('; ') : '';
      return { name, score, reasons };
    }),
    note,
    dispoStatus: dispo?.status || '',
    leadId: lead.leadId || '—',
    generatedAt: new Date().toISOString()
  };
}

function buildBuilderPacketText(lead = {}, opts = {}) {
  const m = buildPacketModel(lead, opts);
  const p = m.parcel;
  const lines = [
    'PHUGLEE — BUILDER PACKET (Land Desk)',
    '====================================',
    '',
    'SUBJECT',
    `  Address: ${m.address}`,
    `  Owner: ${m.owner}`,
    `  Phones: ${m.phones}`,
    `  Acres: ${fmtAcres(p.acres)}`,
    `  Lot sqft: ${p.lotSqft != null ? p.lotSqft.toLocaleString() : '—'}`,
    `  Zoning: ${p.zoning || '—'}`,
    `  Land use: ${p.landUse || '—'}`,
    `  County: ${p.county || '—'}`,
    `  APN: ${p.apn || '—'}`,
    `  Water: ${p.water || '—'}`,
    `  Sewer: ${p.sewer || '—'}`,
    `  Flood: ${p.flood || '—'}`,
    `  Frontage: ${p.frontage || '—'}`,
    `  Asset: ${m.asset}`,
    `  Signals: ${m.signals}`,
    '',
    'SCREEN',
    `  Verdict: ${m.verdict}${m.recommended && m.recommended !== m.verdict ? ` (recommended ${m.recommended})` : ''}`,
    `  Demand / builders nearby: ${m.demandBuilders}`,
    ...m.checks.map((c) => `  ${c}`),
    m.verdictNote ? `  Note: ${m.verdictNote}` : null,
    '',
    'LAO / OFFER MATH',
    `  Land FMV: ${m.uw.landFmv}`,
    `  Site costs: ${m.uw.siteCosts}`,
    `  Investor gap: ${m.uw.investorGap}`,
    `  Assignment fee: ${m.uw.assignmentFee}`,
    `  Buyer ceiling: ${m.uw.buyerCeiling}`,
    `  Contract target: ${m.uw.contractTarget}`,
    `  LAO: ${m.uw.lao}`,
    m.uw.sanityWarning ? `  Sanity: ${m.uw.sanityWarning}` : null,
    '',
    'FUND / BUYER MATCH',
    ...(m.funds.length
      ? m.funds.map((f, i) => `  ${i + 1}. ${f.name}${f.score ? ` · score ${f.score}` : ''}${f.reasons ? ` — ${f.reasons}` : ''}`)
      : ['  (none matched yet — run Fund match on Land Desk)']),
    '',
    m.note ? `OPERATOR NOTES\n  ${m.note}` : null,
    m.dispoStatus ? `Disposition: ${m.dispoStatus}` : null,
    '',
    `Generated: ${m.generatedAt}`,
    `Lead ID: ${m.leadId}`,
    '',
    'Not a PSA. Numbers are underwriting notes for builder outreach.'
  ].filter((line) => line != null);

  return {
    text: lines.join('\n'),
    filename: `builder-packet-${packetSlug(lead)}.txt`,
    acres: p.acres,
    zoning: p.zoning,
    model: m
  };
}

function sectionTitle(doc, title, y) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), 48, y, {
    characterSpacing: 1.2
  });
  const after = doc.y + 4;
  doc.strokeColor(GOLD).lineWidth(1.25).moveTo(48, after).lineTo(564, after).stroke();
  return after + 10;
}

function kv(doc, label, value, x, y, labelW = 88) {
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, x, y, { width: labelW });
  doc.fillColor(INK).font('Helvetica').fontSize(10).text(String(value || '—'), x + labelW, y, {
    width: 200
  });
}

/**
 * Render a letter-size builder packet PDF.
 * @returns {Promise<Buffer>}
 */
function buildBuilderPacketPdf(lead = {}, opts = {}) {
  const m = buildPacketModel(lead, opts);
  const p = m.parcel;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 42, bottom: 48, left: 48, right: 48 },
      info: {
        Title: `Builder Packet — ${m.address}`,
        Author: 'Phuglee Land Desk',
        Subject: 'Land underwriting packet for builders'
      }
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header band
    doc.rect(0, 0, 612, 72).fill(BAND);
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11)
      .text('PHUGLEE', 48, 22, { characterSpacing: 2 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20)
      .text('Builder Packet', 48, 38);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('Land Desk · vacant lot underwriting', 360, 28, { width: 200, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(m.generatedAt.slice(0, 10), 360, 44, { width: 200, align: 'right' });

    doc.fillColor(GOLD).rect(0, 72, 612, 3).fill();

    let y = 92;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(m.address, 48, y, { width: 516 });
    y = doc.y + 6;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`${m.asset}  ·  ${m.signals}`, 48, y, { width: 516 });
    y = doc.y + 14;

    y = sectionTitle(doc, 'Subject', y);
    kv(doc, 'Owner', m.owner, 48, y);
    kv(doc, 'Phone', m.phones, 320, y);
    y += 16;
    kv(doc, 'Acres', fmtAcres(p.acres), 48, y);
    kv(doc, 'Lot sqft', p.lotSqft != null ? p.lotSqft.toLocaleString() : '—', 320, y);
    y += 16;
    kv(doc, 'Zoning', p.zoning || '—', 48, y);
    kv(doc, 'Land use', p.landUse || '—', 320, y);
    y += 16;
    kv(doc, 'County', p.county || '—', 48, y);
    kv(doc, 'APN', p.apn || '—', 320, y);
    y += 16;
    kv(doc, 'Water', p.water || '—', 48, y);
    kv(doc, 'Sewer', p.sewer || '—', 320, y);
    y += 16;
    kv(doc, 'Flood', p.flood || '—', 48, y);
    kv(doc, 'Frontage', p.frontage || '—', 320, y);
    y += 28;

    y = sectionTitle(doc, 'Screen', y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
      .text(`Verdict: ${m.verdict}`, 48, y);
    if (m.recommended && m.recommended !== m.verdict) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text(`Recommended ${m.recommended}`, 200, y + 2);
    }
    y += 18;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`Builders / demand nearby: ${m.demandBuilders}`, 48, y);
    y += 14;
    m.checks.forEach((line) => {
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(`•  ${line}`, 48, y, { width: 516 });
      y = doc.y + 3;
    });
    if (m.verdictNote) {
      y += 4;
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
        .text(m.verdictNote, 48, y, { width: 516 });
      y = doc.y + 10;
    } else {
      y += 12;
    }

    y = sectionTitle(doc, 'LAO / Offer math', y);
    // Number cards
    const cards = [
      ['Land FMV', m.uw.landFmv],
      ['Site costs', m.uw.siteCosts],
      ['Investor gap', m.uw.investorGap],
      ['Fee', m.uw.assignmentFee],
      ['Ceiling', m.uw.buyerCeiling],
      ['LAO', m.uw.lao]
    ];
    const cardW = 80;
    cards.forEach((c, i) => {
      const x = 48 + (i % 6) * (cardW + 6);
      const cy = y;
      doc.roundedRect(x, cy, cardW, 42, 4).fillAndStroke('#FFFFFF', RULE);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(c[0].toUpperCase(), x + 6, cy + 8, {
        width: cardW - 12
      });
      doc.fillColor(i === 5 ? GOLD : INK).font('Helvetica-Bold').fontSize(10)
        .text(c[1], x + 6, cy + 22, { width: cardW - 12 });
    });
    y += 54;
    if (m.uw.sanityWarning) {
      doc.fillColor('#8B4513').font('Helvetica').fontSize(8)
        .text(m.uw.sanityWarning, 48, y, { width: 516 });
      y = doc.y + 12;
    }

    y = sectionTitle(doc, 'Fund / buyer match', y);
    if (!m.funds.length) {
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
        .text('None matched yet — run Fund match on Land Desk.', 48, y);
      y = doc.y + 12;
    } else {
      m.funds.forEach((f, i) => {
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
          .text(`${i + 1}. ${f.name}`, 48, y, { continued: !!f.score });
        if (f.score) {
          doc.fillColor(GOLD).font('Helvetica').fontSize(9).text(`  ·  ${f.score}`);
        }
        y = doc.y + 2;
        if (f.reasons) {
          doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(f.reasons, 60, y, { width: 480 });
          y = doc.y + 6;
        } else {
          y += 8;
        }
      });
    }

    if (m.note) {
      y += 6;
      y = sectionTitle(doc, 'Operator notes', y);
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(m.note, 48, y, { width: 516 });
      y = doc.y + 10;
    }

    // Footer
    const footY = 742;
    doc.strokeColor(RULE).lineWidth(0.75).moveTo(48, footY).lineTo(564, footY).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text('Not a PSA. Figures are underwriting notes for builder outreach.', 48, footY + 8, {
        width: 360
      });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`Lead ${m.leadId}`, 420, footY + 8, { width: 144, align: 'right' });

    doc.end();
  });
}

async function buildBuilderPacket(lead = {}, opts = {}) {
  const textPacket = buildBuilderPacketText(lead, opts);
  const pdfBuffer = await buildBuilderPacketPdf(lead, opts);
  return {
    ...textPacket,
    pdfBuffer,
    pdfFilename: `builder-packet-${packetSlug(lead)}.pdf`
  };
}

module.exports = {
  leadAcres,
  leadZoning,
  extractParcelFields,
  buildPacketModel,
  buildBuilderPacketText,
  buildBuilderPacketPdf,
  buildBuilderPacket
};
