const { PDFParse } = require('pdf-parse');
const { extractRowsFromText } = require('./row-extract');

function isPdfFile(filename) {
  return /\.pdf$/i.test(String(filename || ''));
}

async function parsePdf(buffer, filename) {
  if (!isPdfFile(filename)) {
    throw new Error('Not a PDF file');
  }

  // pdf-parse v2 is class-based (v1 was `pdfParse(buffer)`).
  const parser = new PDFParse({ data: buffer });
  let data;
  try {
    data = await parser.getText();
  } finally {
    await parser.destroy().catch(() => {});
  }

  const text = String(data.text || '').trim();
  if (!text) {
    throw new Error('PDF contains no extractable text. Try a scan/image upload for OCR.');
  }

  const extracted = extractRowsFromText(text, { parser: 'pdf' });
  return {
    ...extracted,
    pageCount: data.total || 0
  };
}

module.exports = {
  isPdfFile,
  parsePdf
};
