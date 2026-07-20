function createRewriter({ prefix, targetHost, targetPort }) {
  // Phuglee shell APIs live at site root. Prefixing them under /analyzer
  // (or /forge) 404s Vault, health pills, and auth from embedded modules.
  const SHELL_API_PREFIXES = ['/api/leads', '/api/health', '/api/auth', '/api/me'];

  function alreadyPrefixed(pathValue) {
    return pathValue.startsWith(prefix + '/') || pathValue === prefix;
  }

  function isShellApiPath(pathValue) {
    if (!pathValue || typeof pathValue !== 'string') return false;
    const path = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
    return SHELL_API_PREFIXES.some(
      (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
    );
  }

  function prefixRootPath(pathValue) {
    if (!pathValue || pathValue.startsWith('//') || /^https?:/i.test(pathValue)) return pathValue;
    if (alreadyPrefixed(pathValue)) return pathValue;
    if (!pathValue.startsWith('/')) return pathValue;
    if (isShellApiPath(pathValue)) return pathValue;
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
      const path = `/${rest}`;
      if (alreadyPrefixed(path) || isShellApiPath(path)) return match;
      return `${attr}=${quote}${prefix}/${rest}`;
    };

    out = out.replace(
      /(href|src|action)=(["'])\/(?!\/)([^"']*)/gi,
      rewriteRoot
    );

    out = out.replace(
      /\bfetch\((["'])\/(?!\/)([^"']*)/g,
      (match, quote, rest) => {
        const path = `/${rest}`;
        if (alreadyPrefixed(path) || isShellApiPath(path)) return match;
        return `fetch(${quote}${prefix}/${rest}`;
      }
    );

    out = out.replace(
      /\bapiFetch\((["'])\/(?!\/)([^"']*)/g,
      (match, quote, rest) => {
        const path = `/${rest}`;
        if (alreadyPrefixed(path) || isShellApiPath(path)) return match;
        return `apiFetch(${quote}${prefix}/${rest}`;
      }
    );

    // Template literals: fetch(`/api/...${var}`) — common in Form Forge + Analyzer
    // Keep shell APIs unprefixed (Vault/health/auth live on Phuglee root).
    const rewriteTemplateCall = (fnName) => {
      const re = new RegExp(`\\b${fnName}\\(\`\\/(?!\\/)`, 'g');
      out = out.replace(re, (match, offset, full) => {
        const from = offset + match.length - 1; // points at leading /
        const slice = full.slice(from, from + 64);
        const staticHead = slice.split('${')[0].split('`')[0];
        if (isShellApiPath(staticHead)) return match;
        return `${fnName}(\`${prefix}/`;
      });
    };
    rewriteTemplateCall('fetch');
    rewriteTemplateCall('apiFetch');
    rewriteTemplateCall('postJson');
    rewriteTemplateCall('postForm');

    out = out.replace(
      /return `\/api\//g,
      (match, offset, full) => {
        const from = offset + 'return `'.length;
        const slice = full.slice(from, from + 64);
        const staticHead = slice.split('${')[0].split('`')[0];
        if (isShellApiPath(staticHead)) return match;
        return `return \`${prefix}/api/`;
      }
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
      // Analyzer already ships fonts + tokens/phuglee CSS — only inject shell chrome there.
      // Review gets the same photo shell atmosphere as Filter (phuglee-shell-bg + desk plate).
      const shellHead = prefix === '/analyzer'
        ? [
          '<script src="/js/theme.js?v=distress2"></script>',
          '<link rel="stylesheet" href="/css/tokens.css">',
          '<link rel="stylesheet" href="/css/distress-glass.css">',
          '<link rel="stylesheet" href="/css/phuglee-shell.css?v=2-analyze-bg">',
          '<link rel="stylesheet" href="/css/shell.css">',
          '<link rel="stylesheet" href="/css/shell-nav.css?v=17-saas-rail">',
          '<link rel="stylesheet" href="/css/settings-menu.css?v=distress2">',
          '<link rel="stylesheet" href="/css/command-palette.css?v=distress2">',
          '<link rel="stylesheet" href="/css/distress-status.css?v=distress2">',
          '<link rel="stylesheet" href="/css/distress-analyzer-os.css?v=distress15-bg">'
        ].join('')
        : [
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
          '<link rel="stylesheet" href="/css/shell-nav.css?v=17-saas-rail">',
          '<link rel="stylesheet" href="/css/settings-menu.css?v=distress2">',
          '<link rel="stylesheet" href="/css/command-palette.css?v=distress2">',
          '<link rel="stylesheet" href="/css/distress-status.css?v=distress2">'
        ].join('');

      const shellBody = prefix === '/analyzer'
        ? [
          '<div class="phuglee-shell-bg phuglee-shell-bg--strong analyze-shell-bg" aria-hidden="true"></div>',
          '<div id="phuglee-nav-mount"></div>',
          '<div id="phuglee-footer-mount"></div>',
          '<script src="/js/phuglee-motion.js?v=2-route" defer></script>',
          '<script src="/js/phuglee-states.js?v=2-route" defer></script>',
          '<script src="/js/settings-menu.js?v=4" defer></script>',
          '<script src="/js/command-palette.js?v=distress3" defer></script>',
          '<script src="/js/distress-status.js?v=distress3" defer></script>',
          '<script src="/js/shell-nav.js?v=35-phuglee-rename" defer></script>',
          '<script src="/js/shell.js" defer></script>'
        ].join('')
        : [
          '<div class="premium-bg premium-bg--subtle" aria-hidden="true"><div class="premium-bg-photo"></div><div class="premium-bg-grain"></div><div class="premium-bg-wear"></div></div>',
          '<div class="heat-bg" aria-hidden="true"><div class="heat-glow heat-glow-a"></div><div class="heat-glow heat-glow-b"></div><div class="heat-grid"></div></div>',
          '<div id="phuglee-nav-mount"></div>',
          '<div id="phuglee-footer-mount"></div>',
          '<script src="/js/phuglee-motion.js?v=2-route" defer></script>',
          '<script src="/js/phuglee-states.js?v=2-route" defer></script>',
          '<script src="/js/settings-menu.js?v=4" defer></script>',
          '<script src="/js/command-palette.js?v=distress3" defer></script>',
          '<script src="/js/distress-status.js?v=distress3" defer></script>',
          '<script src="/js/shell-nav.js?v=35-phuglee-rename" defer></script>',
          '<script src="/js/shell.js" defer></script>'
        ].join('');

      out = out.replace(
        /<head([^>]*)>/i,
        `<head$1><script src="/js/auth-session.js" defer></script><script src="/js/auth-config.js" defer></script><script src="/js/auth-guard.js" defer></script><script src="/js/phuglee-session-headers.js" defer></script><script>window.__PHUGLEE_MODULE_PREFIX__=${JSON.stringify(prefix)};window.__DISTRESS_OS_MODULE_PREFIX__=${JSON.stringify(prefix)};</script>${shellHead}`
      );

      out = out.replace(/<body([^>]*)>/i, (match, attrs) => {
        // Dual class: phuglee-embedded (new) + distress-os-embedded (CSS compat during rename).
        const embedClass = 'phuglee-embedded distress-os-embedded has-premium-bg';
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