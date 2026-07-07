'use strict';

function isVercel() {
  return !!(process.env.VERCEL || process.env.VERCEL_ENV);
}

function useEmbeddedAnalyzer() {
  return isVercel() || process.env.ANALYZER_EMBEDDED === '1';
}

function skipChildProcesses() {
  return isVercel();
}

module.exports = {
  isVercel,
  useEmbeddedAnalyzer,
  skipChildProcesses
};