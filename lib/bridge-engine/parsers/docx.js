const mammoth = require('mammoth');
const JSZip = require('jszip');
const { extractRowsFromText, extractRowsFromHtmlTables } = require('./row-extract');

function isDocxFile(filename) {
  return /\.docx$/i.test(String(filename || ''));
}

function isLegacyDocFile(filename) {
  return /\.doc$/i.test(String(filename || '')) && !/\.docx$/i.test(String(filename || ''));
}

/**
 * Extract embedded image buffers from a .docx (OOXML zip).
 * Used when mammoth finds no usable tables/text (screenshot-in-Word packets).
 */
async function extractDocxImageBuffers(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const out = [];
  const media = zip.folder('word/media');
  if (!media) return out;

  const entries = [];
  media.forEach((relativePath, file) => {
    if (file.dir) return;
    if (!/\.(png|jpe?g|gif|bmp|tiff?|webp)$/i.test(relativePath)) return;
    entries.push({ relativePath, file });
  });

  // Prefer larger images first (charts / full-page screenshots beat icons)
  const withSize = [];
  for (const entry of entries) {
    const data = await entry.file.async('nodebuffer');
    withSize.push({ relativePath: entry.relativePath, data, size: data.length });
  }
  withSize.sort((a, b) => b.size - a.size);

  for (const item of withSize.slice(0, 8)) {
    if (item.size < 8 * 1024) continue; // skip tiny icons
    out.push(item.data);
  }
  return out;
}

function countUsableRows(parsed) {
  if (!parsed || !Array.isArray(parsed.rows)) return 0;
  return parsed.rows.filter((r) => r && typeof r === 'object').length;
}

/**
 * When Word is text-empty (screenshot paste), OCR embedded images via the
 * same image → family/table rebuild path as JPG uploads.
 */
async function parseDocxViaEmbeddedImages(buffer, filename) {
  const images = await extractDocxImageBuffers(buffer);
  if (!images.length) return null;

  const { parseImageOcr } = require('./image-ocr');
  let best = null;
  let bestRows = 0;

  for (let i = 0; i < images.length; i += 1) {
    const imgName = String(filename || 'word.docx').replace(/\.docx$/i, '') + `-image-${i + 1}.png`;
    try {
      const parsed = await parseImageOcr(images[i], imgName);
      const rows = countUsableRows(parsed);
      if (rows > bestRows) {
        best = {
          ...parsed,
          parser: 'docx-image-ocr',
          parseMode: (parsed.parseMode || 'ocr') + '+docx-media',
          source: 'docx'
        };
        bestRows = rows;
      }
      // Good enough — stop early
      if (bestRows >= 5) break;
    } catch {
      // try next image
    }
  }

  return bestRows >= 1 ? best : null;
}

function isWeakTextExtract(extracted) {
  if (!extracted) return true;
  const rows = countUsableRows(extracted);
  if (rows >= 2) return false;
  const headers = extracted.headers || [];
  if (headers.length >= 2 && rows >= 1) return false;
  return true;
}

async function parseDocx(buffer, filename) {
  if (isLegacyDocFile(filename)) {
    const err = new Error('Legacy .doc files are not supported. Save as .docx or upload CSV/PDF.');
    err.code = 'UNSUPPORTED_FILE';
    throw err;
  }
  if (!isDocxFile(filename)) {
    throw new Error('Not a Word document');
  }

  const htmlResult = await mammoth.convertToHtml({ buffer });
  const tableExtracted = extractRowsFromHtmlTables(htmlResult.value, 'docx');
  if (tableExtracted && !isWeakTextExtract(tableExtracted)) {
    return tableExtracted;
  }

  const textResult = await mammoth.extractRawText({ buffer });
  const text = String(textResult.value || '').trim();
  let textExtracted = null;
  if (text) {
    textExtracted = extractRowsFromText(text, { parser: 'docx' });
    if (textExtracted && !isWeakTextExtract(textExtracted)) {
      return textExtracted;
    }
  }

  // Screenshot-in-Word / image-only packets: OCR embedded media
  const fromImages = await parseDocxViaEmbeddedImages(buffer, filename);
  if (fromImages) return fromImages;

  // Prefer weak text extract over hard fail when something was recoverable
  if (tableExtracted && countUsableRows(tableExtracted) >= 1) return tableExtracted;
  if (textExtracted && countUsableRows(textExtracted) >= 1) return textExtracted;

  if (!text) {
    throw new Error(
      'Word document contains no readable text or extractable images. Paste into Excel or upload CSV/PDF.'
    );
  }

  throw new Error(
    'Word document text could not be tabled. Try Paste text to Excel, or save as CSV/PDF.'
  );
}

module.exports = {
  isDocxFile,
  isLegacyDocFile,
  parseDocx,
  extractDocxImageBuffers,
  parseDocxViaEmbeddedImages
};
