'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveComplaintPdfText } = require('../lib/pre-lien-pdf-text');

const SAMPLE = `
CAPITAL ONE, N.A. Plaintiff,
v.
JOHN Q PUBLIC Defendant.
Defendant resides at 123 Main Street, Newark, OH 43055
Case No.: 2026CV001234
`;

test('resolveComplaintPdfText uses embedded text when usable', async () => {
  const out = await resolveComplaintPdfText(Buffer.from('%PDF'), {
    pdfBufferToText: async () => SAMPLE,
    ocrPdfBuffer: async () => {
      throw new Error('OCR should not run');
    }
  });
  assert.equal(out.fromOcr, false);
  assert.match(out.text, /123 Main Street/);
});

test('resolveComplaintPdfText falls back to OCR when embedded text empty', async () => {
  const out = await resolveComplaintPdfText(Buffer.from('%PDF'), {
    pdfBufferToText: async () => '',
    ocrPdfBuffer: async () => ({ text: SAMPLE, ocrConfidence: 82, pageCount: 1 })
  });
  assert.equal(out.fromOcr, true);
  assert.match(out.text, /JOHN Q PUBLIC/);
  assert.equal(out.ocrConfidence, 82);
});

test('resolveComplaintPdfText OCRs garbage embedded text', async () => {
  const out = await resolveComplaintPdfText(Buffer.from('%PDF'), {
    pdfBufferToText: async () => '||||  \n  ##  \n  12',
    ocrPdfBuffer: async () => ({ text: SAMPLE, ocrConfidence: 70 })
  });
  assert.equal(out.fromOcr, true);
  assert.match(out.text, /Newark/);
});

test('pre-liens UI mentions OCR for scans', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'pre-liens.html'), 'utf8');
  assert.match(html, /OCR|scanned/i);
  const api = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pre-lien-api.js'), 'utf8');
  assert.ok(api.includes('resolveComplaintPdfText') || api.includes('ocrPdfBuffer'));
});
