'use strict';

const path = require('path');
const config = require('./config');
const { createRewriter } = require('./rewrite');

let analyzerModule = null;
let rewriter = null;

function loadAnalyzer() {
  if (analyzerModule) return analyzerModule;
  process.env.ANALYZER_EMBEDDED = '1';
  const entry = path.join(config.ANALYZER_PATH, 'server.js');
  analyzerModule = require(entry);
  rewriter = createRewriter({
    prefix: config.ANALYZER_PREFIX,
    targetHost: config.ANALYZER_HOST,
    targetPort: config.ANALYZER_PORT
  });
  return analyzerModule;
}

function toModulePath(pathname, search) {
  const prefix = config.ANALYZER_PREFIX;
  const stripped = pathname === prefix
    ? '/'
    : pathname.slice(prefix.length) || '/';
  return stripped + (search || '');
}

function wrapResponseForRewrite(res) {
  const chunks = [];
  let statusCode = 200;
  let headers = {};

  const flush = () => {
    if (res.headersSent) return;
    let body = Buffer.concat(chunks);
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const isText = /text\/|javascript|json/.test(String(contentType));
    if (isText && rewriter) {
      const rewritten = rewriter.rewriteTextBody(body.toString('utf8'), String(contentType));
      body = Buffer.from(rewritten, 'utf8');
      delete headers['content-length'];
      delete headers['Content-Length'];
    }
    if (headers.location) {
      const loc = Array.isArray(headers.location) ? headers.location[0] : headers.location;
      headers.location = rewriter.rewriteLocationHeader(loc);
    }
    res.writeHead(statusCode, headers);
    res.end(body);
  };

  return {
    writeHead(code, hdrs) {
      statusCode = code;
      if (Array.isArray(hdrs)) {
        headers = {};
        for (let i = 0; i < hdrs.length; i += 2) {
          headers[hdrs[i].toLowerCase()] = hdrs[i + 1];
        }
      } else {
        headers = { ...(hdrs || {}) };
      }
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      flush();
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    get headersSent() {
      return res.headersSent;
    }
  };
}

async function dispatchEmbeddedAnalyzer(req, res, pathname, search) {
  const mod = loadAnalyzer();
  const moduleUrl = toModulePath(pathname, search);
  const patchedReq = Object.create(req, {
    url: { value: moduleUrl, enumerable: true }
  });
  const wrappedRes = wrapResponseForRewrite(res);
  await mod.handleAnalyzerRequest(patchedReq, wrappedRes);
  if (!res.headersSent && !wrappedRes.headersSent) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function checkEmbeddedAnalyzerHealth() {
  try {
    const mod = loadAnalyzer();
    const status = mod.getApiStatus();
    return Promise.resolve({ ok: !!(status && status.ok), body: JSON.stringify(status) });
  } catch (err) {
    return Promise.resolve({ ok: false, error: err.message });
  }
}

module.exports = {
  dispatchEmbeddedAnalyzer,
  checkEmbeddedAnalyzerHealth
};