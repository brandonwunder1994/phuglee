const fs = require('fs');
const path = require('path');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8'
};

function register(ctx) {
  const { router, config, authToken } = ctx;

  function serveHtmlWithAuthToken(res) {
    let html = fs.readFileSync(config.PUBLIC_INDEX, 'utf8');
    // Only inject when explicitly opted in (direct :3456 debugging).
    // Shell proxy strips this and injects X-PDA-Token server-side instead.
    const expose = ['1', 'true', 'yes'].includes(
      String(process.env.PDA_EXPOSE_TOKEN || '').trim().toLowerCase()
    );
    if (expose && authToken) {
      const inject = `<script>window.__PDA_AUTH_TOKEN__=${JSON.stringify(authToken)};</script>\n`;
      html = html.replace('</head>', inject + '</head>');
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(html);
  }

  router.get('/', async (req, res) => { serveHtmlWithAuthToken(res); return true; });
  router.get('/index.html', async (req, res) => { serveHtmlWithAuthToken(res); return true; });

  router.get('/landing', async (req, res) => {
    const landing = path.join(config.PUBLIC_DIR, 'landing.html');
    if (!fs.existsSync(landing)) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(landing, 'utf8'));
    return true;
  });

  router.getPrefix('/fonts/', async (req, res, url) => {
    const rel = url.pathname.replace(/^\/fonts\//, '');
    const file = path.join(config.PUBLIC_DIR, 'fonts', rel);
    const fontsRoot = path.join(config.PUBLIC_DIR, 'fonts');
    if (!file.startsWith(fontsRoot)) return false;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=604800'
    });
    res.end(fs.readFileSync(file));
    return true;
  });

  router.getPrefix('/css/', async (req, res, url) => {
    const rel = url.pathname.replace(/^\/css\//, '');
    const file = path.join(config.PUBLIC_DIR, 'css', rel);
    if (!file.startsWith(path.join(config.PUBLIC_DIR, 'css'))) return false;
    if (!fs.existsSync(file)) return false;
    res.writeHead(200, { 'Content-Type': MIME['.css'], 'Cache-Control': 'public, max-age=86400' });
    res.end(fs.readFileSync(file));
    return true;
  });

  router.getPrefix('/images/', async (req, res, url) => {
    const rel = url.pathname.replace(/^\/images\//, '');
    const file = path.join(config.PUBLIC_DIR, 'images', rel);
    const imagesRoot = path.join(config.PUBLIC_DIR, 'images');
    if (!file.startsWith(imagesRoot)) return false;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.end(fs.readFileSync(file));
    return true;
  });

  const LIB_ALLOWLIST = new Set(['gemini-json.js', 'tier-engine.js', 'imagery-routing.js', 'imagery-urls.js', 'virtual-scroll.js', 'classification-confidence.js', 'result-classify.js', 'review-training.js', 'export-schema.js', 'location-index.js', 'import-meta.js', 'import-batches.js', 'analyze-visibility.js', 'tier-labels.js', 'property-profile-dossier.js']);

  router.getPrefix('/lib/', async (req, res, url) => {
    const name = path.basename(url.pathname);
    if (!LIB_ALLOWLIST.has(name)) return false;
    const file = path.join(config.ROOT, 'lib', name);
    if (!file.startsWith(path.join(config.ROOT, 'lib'))) return false;
    if (!fs.existsSync(file)) return false;
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
    return true;
  });

  router.getPrefix('/js/', async (req, res, url) => {
    const rel = url.pathname.replace(/^\/js\//, '');
    const file = path.join(config.PUBLIC_DIR, 'js', rel);
    if (!file.startsWith(path.join(config.PUBLIC_DIR, 'js'))) return false;
    if (!fs.existsSync(file)) return false;
    const ext = path.extname(file);
    // no-store: Distress OS rewrites JS on the fly (module prefix). A 24h cache
    // once served mangled proxyFetchUrl → proxyFetchurl and froze scans for a day.
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(fs.readFileSync(file));
    return true;
  });

  router.get('/persistence.js', async (req, res) => {
    const file = config.PERSISTENCE_JS;
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
    return true;
  });

  ctx.serveHtmlWithAuthToken = serveHtmlWithAuthToken;
}

module.exports = { register };