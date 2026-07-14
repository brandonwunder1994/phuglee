'use strict';
/**
 * Shared target resolver for destructive / write-to-prod scripts.
 *
 * Default: local http://127.0.0.1:3000
 * Production: require explicit --prod (or PHUGLEE_ALLOW_PROD=1 with --prod)
 *
 * Usage:
 *   const { resolveScriptTarget } = require('./script-target');
 *   const { base, isProd } = resolveScriptTarget(process.argv);
 */
function resolveScriptTarget(argv = process.argv, opts = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const wantProd = args.includes('--prod');
  const wantLocal = args.includes('--local') || !wantProd;
  const prodUrl = String(
    process.env.PHUGLEE_PROD_URL || opts.prodUrl || 'https://phuglee-production.up.railway.app'
  ).replace(/\/$/, '');
  const localUrl = String(opts.localUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');

  if (wantProd) {
    return { base: prodUrl, isProd: true, label: 'production' };
  }
  return { base: localUrl, isProd: false, label: 'local' };
}

function assertProdAllowed(argv = process.argv) {
  const { isProd, base } = resolveScriptTarget(argv);
  if (!isProd) return { base, isProd: false };
  if (!argv.includes('--prod')) {
    throw new Error('Refusing production target without --prod');
  }
  return { base, isProd: true };
}

module.exports = { resolveScriptTarget, assertProdAllowed };
