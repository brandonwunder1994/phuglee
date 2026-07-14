const { createWorker, OEM, PSM } = require('tesseract.js');
const { extractRowsFromText } = require('./row-extract');
const {
  uprightImage,
  checkOcrAvailable: checkPdfOcrAvailable,
  ocrPageCapMessage
} = require('./pdf-ocr');

function isImageFile(filename) {
  return /\.(jpg|jpeg|png)$/i.test(String(filename || ''));
}

async function checkOcrAvailable() {
  return checkPdfOcrAvailable();
}

async function parseImageOcr(buffer, filename) {
  if (!isImageFile(filename)) {
    throw new Error('Not an image file');
  }

  const available = await checkOcrAvailable();
  if (!available) {
    const err = new Error(
      `OCR is unavailable in this environment. Upload Excel/CSV, or ensure Tesseract can run locally. ${ocrPageCapMessage()}`
    );
    err.code = 'OCR_UNAVAILABLE';
    throw err;
  }

  let worker;
  try {
    worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => {} });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    } catch {
      // ignore
    }

    // Detect sideways scans and rotate before OCR (same path as PDF image pages)
    const upright = await uprightImage(buffer, worker, { tryAllAngles: true });
    const text = String(upright.text || '').trim();
    if (!text) {
      throw new Error(
        'OCR could not read any text from this image. Try a clearer photo or upload a spreadsheet.'
      );
    }

    const docConfidence =
      typeof upright.confidence === 'number' ? upright.confidence : 70;

    // Full PDF text-blob stack: family extractors + generic table rebuild → xlsx
    try {
      const { parseTextBlob } = require('./pdf');
      const xlsxName = String(filename || 'image.png').replace(/\.\w+$/i, '') + '.xlsx';
      const fromBlob = parseTextBlob(text, {
        fromOcr: true,
        filename: xlsxName,
        ocrConfidence: docConfidence,
        pageCount: 1
      });
      if (fromBlob && Array.isArray(fromBlob.rows) && fromBlob.rows.length >= 1) {
        return {
          ...fromBlob,
          ocrConfidence: docConfidence,
          rotatedBy: upright.rotatedBy || 0,
          parser: fromBlob.parser || 'ocr',
          source: 'image'
        };
      }
    } catch {
      // fall through to line extract
    }

    const extracted = extractRowsFromText(text, {
      parser: 'ocr',
      ocrConfidence: docConfidence
    });

    // Last resort: force AOA → spreadsheet when line extract has headers
    try {
      const { extractedRowsToAoa, parseAoaAsSpreadsheet } = require('./pdf');
      const aoa = extractedRowsToAoa(extracted);
      if (aoa && aoa.length >= 2) {
        const parsed = parseAoaAsSpreadsheet(aoa, {
          parseMode: 'image-ocr-rows-to-xlsx',
          filename: String(filename || 'image.png').replace(/\.\w+$/i, '') + '.xlsx',
          sheetName: 'Image OCR',
          ocrConfidence: docConfidence
        });
        return {
          ...parsed,
          ocrConfidence: docConfidence,
          rotatedBy: upright.rotatedBy || 0
        };
      }
    } catch {
      // keep line extract
    }

    return {
      ...extracted,
      ocrConfidence: docConfidence,
      rotatedBy: upright.rotatedBy || 0
    };
  } catch (err) {
    if (err.code === 'OCR_UNAVAILABLE') throw err;
    if (/tesseract|worker|wasm/i.test(err.message || '')) {
      const wrapped = new Error(
        `OCR failed to initialize. Upload Excel/CSV or a text-based PDF, or install Tesseract OCR locally. ${ocrPageCapMessage()}`
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
