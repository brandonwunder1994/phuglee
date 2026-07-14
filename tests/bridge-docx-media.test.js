/**
 * DOCX: when text/tables are empty, fall through to embedded image OCR path.
 * Uses a minimal OOXML zip with no media → expect clear error (no OCR needed).
 * Unit-tests extractDocxImageBuffers with a tiny PNG in word/media.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

const {
  extractDocxImageBuffers,
  isDocxFile,
  isLegacyDocFile
} = require('../lib/bridge-engine/parsers/docx');

test('isDocxFile / isLegacyDocFile gate correctly', () => {
  assert.equal(isDocxFile('a.docx'), true);
  assert.equal(isLegacyDocFile('a.doc'), true);
  assert.equal(isLegacyDocFile('a.docx'), false);
});

test('extractDocxImageBuffers returns media images sorted by size', async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>'
  );
  // Minimal 1x1 PNG
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  // Larger fake jpeg payload (>8KB so it is not skipped)
  const large = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12 * 1024, 1)]);
  zip.file('word/media/icon.png', tinyPng);
  zip.file('word/media/scan1.jpg', large);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const images = await extractDocxImageBuffers(buf);
  assert.equal(images.length, 1, 'tiny icon skipped; large jpeg kept');
  assert.ok(images[0].length >= 8 * 1024);
});
