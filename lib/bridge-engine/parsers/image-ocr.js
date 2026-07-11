const { createWorker, OEM, PSM } = require('tesseract.js');
const { extractRowsFromText } = require('./row-extract');
const {
  uprightImage,
  checkOcrAvailable: checkPdfOcrAvailable
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
      'OCR is unavailable in this environment. Upload Excel/CSV, or ensure Tesseract can run locally.'
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
    let extracted = extractRowsFromText(text, {
      parser: 'ocr',
      ocrConfidence: docConfidence
    });

    // Prefer structured table rebuilds when OCR text matches known report families
    try {
      const { parseAoaAsSpreadsheet } = require('./pdf');
      const { extractEnforcementDetailAoa } = require('./pdf-enforcement-detail');
      const enf = extractEnforcementDetailAoa(text);
      if (enf && enf.aoa && enf.aoa.length >= 3) {
        const parsed = parseAoaAsSpreadsheet(enf.aoa, {
          parseMode: 'enforcement-detail-image-ocr-to-xlsx',
          filename: String(filename || 'image.png').replace(/\.\w+$/i, '') + '.xlsx',
          sheetName: 'Enforcement Detail',
          ocrConfidence: docConfidence
        });
        return {
          ...parsed,
          ocrConfidence: docConfidence,
          rotatedBy: upright.rotatedBy || 0,
          redactedSkipped: enf.redactedSkipped || 0
        };
      }
      const { extractCodeComplianceAoa } = require('./pdf-code-compliance');
      const cc = extractCodeComplianceAoa(text);
      if (cc && cc.aoa && cc.aoa.length >= 3) {
        const parsed = parseAoaAsSpreadsheet(cc.aoa, {
          parseMode: 'code-compliance-image-ocr-to-xlsx',
          filename: String(filename || 'image.png').replace(/\.\w+$/i, '') + '.xlsx',
          sheetName: 'Code Compliance',
          ocrConfidence: docConfidence
        });
        return {
          ...parsed,
          ocrConfidence: docConfidence,
          rotatedBy: upright.rotatedBy || 0
        };
      }
    } catch {
      // fall through to line extract
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
