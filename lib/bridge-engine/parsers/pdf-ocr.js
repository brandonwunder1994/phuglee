/**
 * Screenshot + Tesseract OCR for image / bad-encoding PDFs.
 * Used when pdf-parse getText/getTable cannot recover Action Form Name columns.
 */

const { PDFParse } = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const MAX_OCR_PAGES = 12;
const DEFAULT_SCALE = 2;

let ocrAvailability = null;

async function checkOcrAvailable() {
  if (ocrAvailability !== null) return ocrAvailability.available;
  let worker;
  try {
    worker = await createWorker('eng', undefined, { logger: () => {} });
    ocrAvailability = { available: true };
  } catch (err) {
    ocrAvailability = { available: false, error: err };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
  return ocrAvailability.available;
}

/**
 * Render PDF pages to images and OCR them.
 * @returns {{ text: string, pageCount: number, ocrConfidence: number }|null}
 */
async function ocrPdfBuffer(buffer, opts = {}) {
  const maxPages = opts.maxPages != null ? opts.maxPages : MAX_OCR_PAGES;
  const scale = opts.scale != null ? opts.scale : DEFAULT_SCALE;

  const available = await checkOcrAvailable();
  if (!available) return null;

  const parser = new PDFParse({ data: buffer });
  let worker;
  try {
    // Discover page count via lightweight text call first
    let totalPages = 0;
    try {
      const info = await parser.getText({ first: 1 });
      totalPages = Number(info.total) || 0;
    } catch {
      totalPages = 0;
    }

    const pageLimit = totalPages > 0 ? Math.min(totalPages, maxPages) : maxPages;
    const partial = Array.from({ length: pageLimit }, (_, i) => i + 1);

    let shot;
    try {
      shot = await parser.getScreenshot({
        partial: totalPages > 0 ? partial : undefined,
        first: totalPages > 0 ? undefined : pageLimit,
        scale,
        imageBuffer: true,
        imageDataUrl: false
      });
    } catch {
      // Some envs lack canvas — OCR path unavailable
      return null;
    }

    const pages = (shot && shot.pages) || [];
    if (!pages.length) return null;

    worker = await createWorker('eng', undefined, { logger: () => {} });
    const chunks = [];
    let confSum = 0;
    let confN = 0;

    for (const page of pages) {
      const data = page.data || page.buffer;
      if (!data || !data.length) continue;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const { data: ocr } = await worker.recognize(buf);
      const text = String(ocr.text || '').trim();
      if (text) chunks.push(text);
      if (typeof ocr.confidence === 'number') {
        confSum += ocr.confidence;
        confN += 1;
      }
    }

    if (!chunks.length) return null;
    return {
      text: chunks.join('\n\n'),
      pageCount: pages.length,
      ocrConfidence: confN ? confSum / confN : 70
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    await parser.destroy().catch(() => {});
  }
}

/**
 * True when embedded text is empty or useless (image PDF / encoding garbage).
 */
function needsPdfOcr(text, tableAoa) {
  if (tableAoa && tableAoa.length >= 3) return false;
  const s = String(text || '').trim();
  if (s.length < 40) return true;
  // High ratio of non-ascii / replacement chars → bad encoding
  const bad = (s.match(/[^\x09\x0a\x0d\x20-\x7e]/g) || []).length;
  if (s.length > 80 && bad / s.length > 0.12) return true;
  // Almost no letters
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (s.length > 40 && letters / s.length < 0.35) return true;
  // Page marker only
  if (/^[\s\d\-of]+$/i.test(s.replace(/--/g, ''))) return true;
  return false;
}

module.exports = {
  ocrPdfBuffer,
  checkOcrAvailable,
  needsPdfOcr,
  MAX_OCR_PAGES
};
