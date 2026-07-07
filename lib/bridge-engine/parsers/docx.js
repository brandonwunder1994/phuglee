const mammoth = require('mammoth');
const { extractRowsFromText, extractRowsFromHtmlTables } = require('./row-extract');

function isDocxFile(filename) {
  return /\.docx$/i.test(String(filename || ''));
}

function isLegacyDocFile(filename) {
  return /\.doc$/i.test(String(filename || '')) && !/\.docx$/i.test(String(filename || ''));
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
  if (tableExtracted) return tableExtracted;

  const textResult = await mammoth.extractRawText({ buffer });
  const text = String(textResult.value || '').trim();
  if (!text) {
    throw new Error('Word document contains no readable text');
  }

  return extractRowsFromText(text, { parser: 'docx' });
}

module.exports = {
  isDocxFile,
  isLegacyDocFile,
  parseDocx
};