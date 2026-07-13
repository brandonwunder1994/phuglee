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

    // Template literals: fetch(`/api/...${var}`) — common in Form Forge + Analyzer
    out = out.replace(
      /\bfetch\(`\/(?!\/)/g,
      `fetch(\`${prefix}/`
    );

    out = out.replace(
      /\bapiFetch\(`\/(?!\/)/g,
      `apiFetch(\`${prefix}/`
    );

    out = out.replace(
      /\bpostJson\(`\/(?!\/)/g,
      `postJson(\`${prefix}/`
    );

    out = out.replace(
      /\bpostForm\(`\/(?!\/)/g,
      `postForm(\`${prefix}/`
    );

    out = out.replace(
      /return `\/api\//g,
      `return \`${prefix}/api/`
    );

    // CSS url(/path) only — never run on JS. The old /url\(.../gi matched
    // proxyFetchUrl('/api/...') case-insensitively and rewrote it to
    // proxyFetchurl('/analyzer/api/...'), breaking Street View scans.
    if (type.includes('text/css') || type.includes('text/html')) {
      out = out.replace(
        /(?<![A-Za-z0-9_$])url\((['"]?)\/(?!\/)([^)'"]*)/gi,
        (match, quote, rest) => {
          if (alreadyPrefixed(`/${rest}`)) return match;
          return `url(${quote}${prefix}/${rest}`;
        }
      );
    }

    if (type.includes('text/html')) {
      const shellHead = [
        '<script src="/js/theme.js?v=distress2"></script>',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">',
        '<link rel="stylesheet" href="/css/tokens.css">',
        '<link rel="stylesheet" href="/css/distress-glass.css">',
        '<link rel="stylesheet" href="/css/heat-base.css">',
        '<link rel="stylesheet" href="/css/heat-atmosphere.css">',
        '<link rel="stylesheet" href="/css/premium-atmosphere.css">',
        '<link rel="stylesheet" href="/css/premium-components.css">',
        '<link rel="stylesheet" href="/css/phuglee-components.css">',
        '<link rel="stylesheet" href="/css/phuglee-a11y.css">',
        '<link rel="stylesheet" href="/css/shell.css">',
        '<link rel="stylesheet" href="/css/shell-nav.css?v=10">',
        '<link rel="stylesheet" href="/css/settings-menu.css?v=distress2">',
        '<link rel="stylesheet" href="/css/command-palette.css?v=distress2">',
        '<link rel="stylesheet" href="/css/distress-status.css?v=distress2">',
        prefix === '/analyzer'
          ? '<link rel="stylesheet" href="/css/distress-analyzer-os.css?v=distress12">'
          : ''
      ].join('');

      const shellBody = [
        '<div class="premium-bg premium-bg--subtle" aria-hidden="true"><div class="premium-bg-photo"></div><div class="premium-bg-grain"></div><div class="premium-bg-wear"></div></div>',
        '<div class="heat-bg" aria-hidden="true"><div class="heat-glow heat-glow-a"></div><div class="heat-glow heat-glow-b"></div><div class="heat-grid"></div></div>',
        '<div id="distress-os-nav-mount"></div>',
        '<div id="distress-os-footer-mount"></div>',
        '<script src="/js/phuglee-motion.js" defer></script>',
        '<script src="/js/phuglee-states.js" defer></script>',
        '<script src="/js/settings-menu.js?v=distress2" defer></script>',
        '<script src="/js/command-palette.js?v=distress3" defer></script>',
        '<script src="/js/distress-status.js?v=distress3" defer></script>',
        '<script src="/js/shell-nav.js?v=13" defer></script>',
        '<script src="/js/shell.js" defer></script>'
      ].join('');

      out = out.replace(
        /<head([^>]*)>/i,
        `<head$1><script src="/js/auth-session.js"></script><script src="/js/auth-config.js"></script><script src="/js/auth-guard.js"></script><script src="/js/phuglee-session-headers.js"></script><script>window.__DISTRESS_OS_MODULE_PREFIX__=${JSON.stringify(prefix)};</script>${shellHead}`
      );

      out = out.replace(/<body([^>]*)>/i, (match, attrs) => {
        const embedClass = 'distress-os-embedded has-premium-bg';
        const extra = prefix === '/analyzer' ? ' analyzer-embedded' : '';
        if (/class\s*=/i.test(attrs)) {
          const withClass = attrs.replace(
            /class\s*=\s*(["'])([^"']*)\1/i,
            (_, q, classes) => {
              const merged = `${classes} ${embedClass}${extra}`.trim();
              return `class=${q}${merged}${q}`;
            }
          );
          return `<body${withClass}>${shellBody}`;
        }
        return `<body${attrs} class="${embedClass}${extra}">${shellBody}`;
      });
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