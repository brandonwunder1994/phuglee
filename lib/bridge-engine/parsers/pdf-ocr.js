/**
 * Screenshot + Tesseract OCR for image / bad-encoding PDFs.
 * Detects sideways scans (OSD), rotates pages upright, then OCRs.
 * Used when pdf-parse getText/getTable cannot recover usable rows.
 */

const { PDFParse } = require('pdf-parse');
const { createWorker, detect, OEM, PSM } = require('tesseract.js');

const MAX_OCR_PAGES = 12;
const DEFAULT_SCALE = 2.2;
/** OSD confidence below this → multi-angle score fallback */
const OSD_CONF_MIN = 0.45;
/** If upright OCR score is still weak, try other rotations */
const WEAK_OCR_SCORE = 120;

let ocrAvailability = null;
let rotateCanvas = null;

async function checkOcrAvailable() {
  if (ocrAvailability !== null) return ocrAvailability.available;
  let worker;
  try {
    worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => {} });
    ocrAvailability = { available: true };
  } catch (err) {
    ocrAvailability = { available: false, error: err };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
  return ocrAvailability.available;
}

/**
 * Lazy-load @napi-rs/canvas (already a pdf-parse dependency).
 * @returns {{ createCanvas: Function, loadImage: Function }|null}
 */
function getCanvas() {
  if (rotateCanvas !== null) return rotateCanvas || null;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    rotateCanvas = require('@napi-rs/canvas');
  } catch {
    rotateCanvas = false;
  }
  return rotateCanvas || null;
}

/**
 * Rotate a PNG/JPEG buffer by 0/90/180/270 degrees clockwise.
 * @param {Buffer} buf
 * @param {number} degrees
 * @returns {Promise<Buffer>}
 */
async function rotateImageBuffer(buf, degrees) {
  const deg = ((Number(degrees) % 360) + 360) % 360;
  if (!deg || deg === 0) return buf;
  if (![90, 180, 270].includes(deg)) return buf;

  const canvasApi = getCanvas();
  if (!canvasApi) return buf;

  const img = await canvasApi.loadImage(buf);
  const w = img.width;
  const h = img.height;
  const swap = deg === 90 || deg === 270;
  const canvas = canvasApi.createCanvas(swap ? h : w, swap ? w : h);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toBuffer('image/png');
}

/**
 * Tesseract OSD: orientation_degrees = how the page is currently rotated.
 * To upright: rotate clockwise by (360 - orientation_degrees) % 360.
 * Empirically validated on sideways Pharr TX code-compliance scans (270 → rotate 90).
 *
 * @param {number} orientationDegrees
 * @returns {number} clockwise rotation to apply (0|90|180|270)
 */
function correctionDegreesFromOsd(orientationDegrees) {
  const o = ((Number(orientationDegrees) % 360) + 360) % 360;
  if (!o) return 0;
  // Only snap to right angles
  const snapped = [0, 90, 180, 270].reduce((best, cand) =>
    Math.abs(cand - o) < Math.abs(best - o) ? cand : best
  );
  if (snapped === 0) return 0;
  return (360 - snapped) % 360;
}

/**
 * Score OCR text quality for list extraction (higher = better).
 */
function scoreOcrText(text) {
  const s = String(text || '');
  if (!s.trim()) return 0;
  let score = Math.min(180, s.length / 4);
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const bad = (s.match(/[^\x09\x0a\x0d\x20-\x7e]/g) || []).length;
  score += Math.min(200, letters);
  score -= bad * 2;
  // Street-like tokens
  score += ((s.match(/\b\d{1,6}\s*[|Il]?\s*[NSEW]\b/gi) || []).length) * 25;
  score += ((s.match(/\b\d{1,6}\s+[A-Za-z]/g) || []).length) * 20;
  score += ((s.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) || []).length) * 8;
  // Domain headers / violation labels
  if (/application\s*name|opened\s*date|street\s*(#|name|number)|violation|address|property/i.test(s)) {
    score += 80;
  }
  if (/weedy\s*lot|care\s*of\s*premise|illegal\s*dumping|high\s*grass|action\s*form/i.test(s)) {
    score += 60;
  }
  // Gainesville-style Enforcement Cases Detail (sideways scans + GENF IDs)
  if (/enforcement\s+cases\s+detail|record\s*id\s+location|GENF\s*\d{2}/i.test(s)) {
    score += 90;
  }
  score += Math.min(120, ((s.match(/\bGENF\s*[-–]?\s*\d{2}\s*[-–]?\s*\d{3,5}\b/gi) || []).length) * 15);
  if (/\b(tall\s+grass|trash|closed\s*-\s*violation|code\s+officer\s+initiated)\b/i.test(s)) {
    score += 40;
  }
  // Pure garbage from sideways OCR is short on vowels relative to symbols
  const vowels = (s.match(/[aeiouAEIOU]/g) || []).length;
  if (letters > 40 && vowels / letters < 0.15) score -= 80;
  return score;
}

/**
 * Detect page orientation via Tesseract OSD.
 * @returns {Promise<{ orientationDegrees: number, orientationConfidence: number, correctionDegrees: number }>}
 */
async function detectImageOrientation(imageBuf) {
  try {
    const result = await detect(imageBuf);
    const data = (result && result.data) || result || {};
    const orientationDegrees = Number(data.orientation_degrees) || 0;
    const orientationConfidence = Number(data.orientation_confidence) || 0;
    return {
      orientationDegrees,
      orientationConfidence,
      correctionDegrees: correctionDegreesFromOsd(orientationDegrees)
    };
  } catch {
    return { orientationDegrees: 0, orientationConfidence: 0, correctionDegrees: 0 };
  }
}

/**
 * OCR one image buffer; returns text + confidence + score.
 */
async function recognizeBuffer(worker, imageBuf) {
  const { data } = await worker.recognize(imageBuf);
  const text = String(data.text || '').trim();
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
  return {
    text,
    confidence,
    score: scoreOcrText(text) + confidence * 0.5
  };
}

/**
 * Pick best upright orientation for a page image.
 * Uses OSD first; if weak, scores 0/90/180/270 OCR samples.
 *
 * @returns {Promise<{ buffer: Buffer, rotatedBy: number, orientationDegrees: number, text?: string, confidence?: number, score?: number }>}
 */
async function uprightImage(imageBuf, worker, opts = {}) {
  const tryAll = opts.tryAllAngles === true;
  const osd = await detectImageOrientation(imageBuf);
  let rotatedBy = 0;
  let working = imageBuf;

  if (
    osd.correctionDegrees &&
    (osd.orientationConfidence >= OSD_CONF_MIN || tryAll)
  ) {
    rotatedBy = osd.correctionDegrees;
    working = await rotateImageBuffer(imageBuf, rotatedBy);
  }

  let best = {
    buffer: working,
    rotatedBy,
    orientationDegrees: osd.orientationDegrees,
    ...(await recognizeBuffer(worker, working))
  };

  const needFallback =
    tryAll ||
    best.score < WEAK_OCR_SCORE ||
    (osd.correctionDegrees && osd.orientationConfidence < OSD_CONF_MIN);

  if (needFallback && getCanvas()) {
    for (const deg of [0, 90, 180, 270]) {
      if (deg === rotatedBy) continue;
      const buf = await rotateImageBuffer(imageBuf, deg);
      const rec = await recognizeBuffer(worker, buf);
      if (rec.score > best.score) {
        best = {
          buffer: buf,
          rotatedBy: deg,
          orientationDegrees: osd.orientationDegrees,
          ...rec
        };
      }
    }
  }

  return best;
}

/**
 * Render PDF pages to images, auto-rotate sideways scans, OCR them.
 * @returns {{ text: string, pageCount: number, ocrConfidence: number, rotatedBy: number[], orientationDegrees: number[] }|null}
 */
async function ocrPdfBuffer(buffer, opts = {}) {
  const maxPages = opts.maxPages != null ? opts.maxPages : MAX_OCR_PAGES;
  const scale = opts.scale != null ? opts.scale : DEFAULT_SCALE;

  const available = await checkOcrAvailable();
  if (!available) return null;

  const parser = new PDFParse({ data: buffer });
  let worker;
  try {
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
      return null;
    }

    const pages = (shot && shot.pages) || [];
    if (!pages.length) return null;

    worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => {} });
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO
      });
    } catch {
      // older parameter sets may reject — continue with defaults
    }

    const chunks = [];
    let confSum = 0;
    let confN = 0;
    const rotatedBy = [];
    const orientationDegrees = [];
    /** Once we learn a correction, reuse it on later pages (same scan batch). */
    let learnedRotation = null;

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const data = page.data || page.buffer;
      if (!data || !data.length) continue;
      const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);

      let upright;
      if (learnedRotation != null && learnedRotation !== 0) {
        const buf = await rotateImageBuffer(raw, learnedRotation);
        const rec = await recognizeBuffer(worker, buf);
        // If reused rotation collapses quality, re-detect this page
        if (rec.score < WEAK_OCR_SCORE * 0.6) {
          upright = await uprightImage(raw, worker, { tryAllAngles: i === 0 });
          learnedRotation = upright.rotatedBy;
        } else {
          upright = {
            buffer: buf,
            rotatedBy: learnedRotation,
            orientationDegrees: learnedRotation ? (360 - learnedRotation) % 360 : 0,
            ...rec
          };
        }
      } else {
        upright = await uprightImage(raw, worker, {
          // First page: allow multi-angle if OSD is unsure
          tryAllAngles: i === 0
        });
        learnedRotation = upright.rotatedBy;
      }

      rotatedBy.push(upright.rotatedBy || 0);
      orientationDegrees.push(upright.orientationDegrees || 0);
      if (upright.text) chunks.push(upright.text);
      if (typeof upright.confidence === 'number') {
        confSum += upright.confidence;
        confN += 1;
      }
    }

    if (!chunks.length) return null;
    return {
      text: chunks.join('\n\n'),
      pageCount: pages.length,
      ocrConfidence: confN ? confSum / confN : 70,
      rotatedBy,
      orientationDegrees
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
  const bad = (s.match(/[^\x09\x0a\x0d\x20-\x7e]/g) || []).length;
  if (s.length > 80 && bad / s.length > 0.12) return true;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (s.length > 40 && letters / s.length < 0.35) return true;
  if (/^[\s\d\-of]+$/i.test(s.replace(/--/g, ''))) return true;
  return false;
}

module.exports = {
  ocrPdfBuffer,
  checkOcrAvailable,
  needsPdfOcr,
  rotateImageBuffer,
  correctionDegreesFromOsd,
  scoreOcrText,
  detectImageOrientation,
  uprightImage,
  MAX_OCR_PAGES,
  DEFAULT_SCALE
};
