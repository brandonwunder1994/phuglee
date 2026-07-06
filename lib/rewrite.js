function createRewriter({ prefix, targetHost, targetPort }) {
  function alreadyPrefixed(pathValue) {
    return pathValue.startsWith(prefix + '/') || pathValue === prefix;
  }

  function prefixRootPath(pathValue) {
    if (!pathValue || pathValue.startsWith('//') || /^https?:/i.test(pathValue)) return pathValue;
    if (alreadyPrefixed(pathValue)) return pathValue;
    if (!pathValue.startsWith('/')) return pathValue;
    return `${prefix}${pathValue}`;
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

    const rewriteRoot = (match, attr, quote, rest) => {
      if (alreadyPrefixed(`/${rest}`)) return match;
      return `${attr}=${quote}${prefix}/${rest}`;
    };

    out = out.replace(
      /(href|src|action)=(["'])\/(?!\/)([^"']*)/gi,
      rewriteRoot
    );

    out = out.replace(
      /\bfetch\((["'])\/(?!\/)([^"']*)/g,
      (match, quote, rest) => {
        if (alreadyPrefixed(`/${rest}`)) return match;
        return `fetch(${quote}${prefix}/${rest}`;
      }
    );

    out = out.replace(
      /\bapiFetch\((["'])\/(?!\/)([^"']*)/g,
      (match, quote, rest) => {
        if (alreadyPrefixed(`/${rest}`)) return match;
        return `apiFetch(${quote}${prefix}/${rest}`;
      }
    );

    out = out.replace(
      /url\((['"]?)\/(?!\/)([^)'"]*)/gi,
      (match, quote, rest) => {
        if (alreadyPrefixed(`/${rest}`)) return match;
        return `url(${quote}${prefix}/${rest}`;
      }
    );

    if (type.includes('text/html')) {
      out = out.replace(
        /<head([^>]*)>/i,
        `<head$1><script>window.__DISTRESS_OS_MODULE_PREFIX__=${JSON.stringify(prefix)};</script>`
      );
    }

    return out;
  }

  function rewriteLocationHeader(location) {
    if (!location || typeof location !== 'string') return location;
    if (/^https?:\/\//i.test(location)) {
      try {
        const url = new URL(location);
        if (url.hostname === targetHost && Number(url.port || 80) === targetPort) {
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

  return {
    rewriteTextBody,
    rewriteLocationHeader,
    prefix
  };
}

module.exports = { createRewriter };