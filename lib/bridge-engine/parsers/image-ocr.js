const { createWorker } = require('tesseract.js');
const { extractRowsFromText, scoreFromOcr } = require('./row-extract');

function isImageFile(filename) {
  return /\.(jpg|jpeg|png)$/i.test(String(filename || ''));
}

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

async function parseImageOcr(buffer, filename) {
  if (!isImageFile(filename)) {
    throw new Error('Not an image file');
  }

  const available = await checkOcrAvailable();
  if (!available) {
    const err = new Error(
      'OCR is unavailable in this environment. Upload Excel/CSV, or ensure Tesseract can run locally.'
    );
    err.code = 'OCR_UNAVAILABLE';
    throw err;
  }

  let worker;
  try {
    worker = await createWorker('eng', undefined, { logger: () => {} });
    const { data } = await worker.recognize(buffer);
    const text = String(data.text || '').trim();
    if (!text) {
      throw new Error('OCR could not read any text from this image. Try a clearer photo or upload a spreadsheet.');
    }

    const docConfidence = typeof data.confidence === 'number' ? data.confidence : 70;
    let extracted = extractRowsFromText(text, { parser: 'ocr', ocrConfidence: docConfidence });

    if (Array.isArray(data.lines) && data.lines.length) {
      extracted.rows = extracted.rows.map((row, index) => {
        const line = data.lines[index];
        const lineScore = line && typeof line.confidence === 'number' ? line.confidence : docConfidence;
        const scored = scoreFromOcr(lineScore);
        return { ...row, _meta: scored };
      });
    }

    return {
      ...extracted,
      ocrConfidence: docConfidence
    };
  } catch (err) {
    if (err.code === 'OCR_UNAVAILABLE') throw err;
    if (/tesseract|worker|wasm/i.test(err.message || '')) {
      const wrapped = new Error(
        'OCR failed to initialize. Upload Excel/CSV or a text-based PDF, or install Tesseract OCR locally.'
      );
      wrapped.code = 'OCR_UNAVAILABLE';
      throw wrapped;
    }
    throw err;
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

module.exports = {
  isImageFile,
  checkOcrAvailable,
  parseImageOcr
};