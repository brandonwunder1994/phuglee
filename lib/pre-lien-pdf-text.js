'use strict';

/**
 * Resolve complaint PDF text: embedded pdf-parse first, then Filter OCR fallback.
 */

const { PDFParse } = require('pdf-parse');
const {
  ocrPdfBuffer,
  needsPdfOcr,
  ocrPageCapMessage,
  MAX_OCR_PAGES
} = require('./bridge-engine/parsers/pdf-ocr');

/** Complaints are short — keep OCR cheaper than full Filter city packets. */
const PRE_LIEN_OCR_PAGES = Math.min(8, MAX_OCR_PAGES);

async function defaultPdfBufferToText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    return String(textResult?.text || '');
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * @param {Buffer} buffer
 * @param {{
 *   pdfBufferToText?: (buf: Buffer) => Promise<string>,
 *   ocrPdfBuffer?: Function,
 *   needsPdfOcr?: Function,
 *   maxOcrPages?: number
 * }} [opts]
 */
async function resolveComplaintPdfText(buffer, opts = {}) {
  const pdfBufferToText = opts.pdfBufferToText || defaultPdfBufferToText;
  const runOcr = opts.ocrPdfBuffer || ocrPdfBuffer;
  const needsOcr = opts.needsPdfOcr || needsPdfOcr;
  const maxPages = opts.maxOcrPages || PRE_LIEN_OCR_PAGES;

  let text = '';
  try {
    text = String((await pdfBufferToText(buffer)) || '');
  } catch (_) {
    text = '';
  }

  const embedded = text.trim();
  if (embedded && !needsOcr(embedded, null)) {
    return {
      text: embedded,
      fromOcr: false,
      ocrConfidence: null,
      ocrTruncated: false,
      ocrPageCapNote: null
    };
  }

  let ocr = null;
  try {
    ocr = await runOcr(buffer, { maxPages });
  } catch (err) {
    if (embedded) {
      return {
        text: embedded,
        fromOcr: false,
        ocrConfidence: null,
        ocrTruncated: false,
        ocrPageCapNote: null,
        ocrError: err.message || 'OCR failed'
      };
    }
    return {
      text: '',
      fromOcr: false,
      ocrConfidence: null,
      ocrTruncated: false,
      ocrPageCapNote: null,
      ocrError: err.message || 'OCR failed'
    };
  }

  const ocrText = String(ocr?.text || '').trim();
  if (ocrText) {
    return {
      text: ocrText,
      fromOcr: true,
      ocrConfidence: ocr.ocrConfidence != null ? ocr.ocrConfidence : null,
      ocrTruncated: Boolean(ocr.ocrTruncated),
      ocrPageCapNote: ocr.ocrPageCapNote || (ocr.ocrTruncated ? ocrPageCapMessage(maxPages) : null)
    };
  }

  return {
    text: embedded,
    fromOcr: false,
    ocrConfidence: null,
    ocrTruncated: false,
    ocrPageCapNote: null
  };
}

module.exports = {
  resolveComplaintPdfText,
  defaultPdfBufferToText,
  PRE_LIEN_OCR_PAGES
};
