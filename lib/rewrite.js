const config = require('./config');
const PREFIX = config.FORGE_PREFIX;

function alreadyPrefixed(pathValue) {
  return pathValue.startsWith(PREFIX + '/') || pathValue === PREFIX;
}

function prefixRootPath(pathValue) {
  if (!pathValue || pathValue.startsWith('//') || /^https?:/i.test(pathValue)) return pathValue;
  if (alreadyPrefixed(pathValue)) return pathValue;
  if (!pathValue.startsWith('/')) return pathValue;
  return `${PREFIX}${pathValue}`;
}

function rewriteTextBody(body, contentType = '') {
  if (!body || typeof body !== 'string') return body;

  const type = String(contentType).toLowerCase();
  const shouldRewrite =
    type.includes('text/html') ||
    type.includes('javascript') ||
    type.includes('text/css');

  if (!shouldRewrite) return body;

  let out = body;

  out = out.replace(
    /(href|src|action)=(["'])\/(?!\/)([^"']*)/gi,
    (match, attr, quote, rest) => {
      if (alreadyPrefixed(`/${rest}`)) return match;
      return `${attr}=${quote}${PREFIX}/${rest}`;
    }
  );

  out = out.replace(
    /fetch\((["'])\/(?!\/)([^"']*)/gi,
    (match, quote, rest) => {
      if (alreadyPrefixed(`/${rest}`)) return match;
      return `fetch(${quote}${PREFIX}/${rest}`;
    }
  );

  out = out.replace(
    /url\((['"]?)\/(?!\/)([^)'"]*)/gi,
    (match, quote, rest) => {
      if (alreadyPrefixed(`/${rest}`)) return match;
      return `url(${quote}${PREFIX}/${rest}`;
    }
  );

  if (type.includes('text/html')) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1><script>window.__DISTRESS_OS_FORGE_PREFIX__=${JSON.stringify(PREFIX)};</script>`
    );
  }

  return out;
}

function rewriteLocationHeader(location) {
  if (!location || typeof location !== 'string') return location;
  if (/^https?:\/\//i.test(location)) {
    try {
      const url = new URL(location);
      if (url.hostname === config.FORGE_HOST && Number(url.port || 80) === config.FORGE_PORT) {
        return prefixRootPath(`${url.pathname}${url.search}${url.hash}`);
      }
      return location;
    } catch (_) {
      return location;
    }
  }
  if (location.startsWith('//')) return location;
  return prefixRootPath(location);
}

module.exports = {
  rewriteTextBody,
  rewriteLocationHeader,
  PREFIX
};