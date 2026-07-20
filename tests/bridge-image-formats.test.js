/**
 * Wave 2 Task 2.3 — expanded clerk image formats for Filter OCR.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAcceptedFile } = require('../lib/bridge-intake-schema');
const {
  isImageFile,
  isHeicFile,
  parseImageOcr
} = require('../lib/bridge-engine/parsers/image-ocr');

const IMAGE_NAMES = [
  'a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.gif',
  'a.tif', 'a.tiff', 'a.bmp', 'a.heic', 'a.heif'
];

test('isImageFile routes all expanded clerk photo formats', () => {
  for (const name of IMAGE_NAMES) {
    assert.equal(isImageFile(name), true, name);
    assert.equal(isAcceptedFile(name), true, name);
  }
  assert.equal(isImageFile('sheet.xlsx'), false);
  assert.equal(isImageFile('scan.pdf'), false);
  assert.equal(isImageFile('legacy.doc'), false);
});

test('isHeicFile detects HEIC/HEIF only', () => {
  assert.equal(isHeicFile('photo.heic'), true);
  assert.equal(isHeicFile('photo.HEIF'), true);
  assert.equal(isHeicFile('photo.jpg'), false);
  assert.equal(isHeicFile('photo.webp'), false);
});

test('parseImageOcr rejects HEIC with convert-to-JPG/PNG guidance', async () => {
  await assert.rejects(
    () => parseImageOcr(Buffer.from('not-a-real-heic'), 'clerk-photo.heic'),
    (err) => {
      assert.match(String(err.message), /HEIC|HEIF/i);
      assert.match(String(err.message), /JPG|PNG/i);
      assert.equal(err.code, 'UNSUPPORTED_FILE');
      return true;
    }
  );
  await assert.rejects(
    () => parseImageOcr(Buffer.from('x'), 'clerk-photo.heif'),
    /convert to JPG or PNG/i
  );
});
