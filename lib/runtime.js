'use strict';

function isVercel() {
  return !!(
    process.env.VERCEL
    || process.env.VERCEL_ENV
    || process.env.VERCEL_REGION
    || process.env.AWS_LAMBDA_FUNCTION_NAME
    || process.env.ANALYZER_EMBEDDED === '1'
  );
}

function useEmbeddedAnalyzer() {
  return isVercel() || process.env.ANALYZER_EMBEDDED === '1';
}

function skipChildProcesses() {
  return isVercel();
}

function remoteForgeUrl() {
  const raw = String(process.env.FORM_FORGE_URL || '').trim();
  return raw || null;
}

module.exports = {
  isVercel,
  useEmbeddedAnalyzer,
  skipChildProcesses,
  remoteForgeUrl
};