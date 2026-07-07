const pdfParse = require('pdf-parse');
const { extractRowsFromText } = require('./row-extract');

function isPdfFile(filename) {
  return /\.pdf$/i.test(String(filename || ''));
}

async function parsePdf(buffer, filename) {
  if (!isPdfFile(filename)) {
    throw new Error('Not a PDF file');
  }

  const data = await pdfParse(buffer);
  const text = String(data.text || '').trim();
  if (!text) {
    throw new Error('PDF contains no extractable text. Try a scan/image upload for OCR.');
  }

  const extracted = extractRowsFromText(text, { parser: 'pdf' });
  return {
    ...extracted,
    pageCount: data.numpages || 0
  };
}

module.exports = {
  isPdfFile,
  parsePdf
};