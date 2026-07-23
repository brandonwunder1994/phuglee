/**
 * Helpers for optional gzip of text static assets (Wave 1).
 */
const GZIP_EXTS = new Set([
  '.js',
  '.css',
  '.json',
  '.geojson',
  '.svg',
  '.html',
  '.txt',
  '.map'
]);

function clientAcceptsGzip(acceptEncodingHeader) {
  const ae = String(acceptEncodingHeader || '').toLowerCase();
  return ae.includes('gzip');
}

function gzippableExt(ext) {
  return GZIP_EXTS.has(String(ext || '').toLowerCase());
}

module.exports = {
  GZIP_EXTS,
  clientAcceptsGzip,
  gzippableExt
};
