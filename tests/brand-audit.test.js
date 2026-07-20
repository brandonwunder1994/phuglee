const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EMBER_HEX = /#e85d04/i;

const REPO_ROOTS = [
  { name: 'phuglee', dir: path.join(__dirname, '..', 'public') },
  {
    name: 'city-list-requests',
    dir: path.join(__dirname, '..', 'modules', 'form-forge', 'review_portal', 'static')
  },
  {
    name: 'property-distress-analyzer',
    dir: path.join(__dirname, '..', 'modules', 'property-analyzer', 'public')
  }
];

const BRAND_PAGES = {
  'phuglee': ['index.html', 'heat.html', 'collect.html', 'bridge.html', 'command.html', 'vault.html'],
  'city-list-requests': [
    'index.html',
    'portal.html',
    'map.html',
    'request-pdfs.html',
    'submit-portals.html',
    'email-only-requests.html',
    'portal-errors.html'
  ],
  'property-distress-analyzer': ['index.html', 'landing.html']
};

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
      continue;
    }
    if (exts.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function findEmberHex(dir) {
  const exts = new Set(['.css', '.html', '.js']);
  const hits = [];
  for (const file of walkFiles(dir, exts)) {
    const text = fs.readFileSync(file, 'utf8');
    if (EMBER_HEX.test(text)) {
      hits.push(path.relative(dir, file));
    }
  }
  return hits;
}

function pageHasBrandSheet(repo, page) {
  const root = REPO_ROOTS.find((r) => r.name === repo);
  if (!root || !fs.existsSync(root.dir)) return false;
  const html = fs.readFileSync(path.join(root.dir, page), 'utf8');
  if (repo === 'phuglee') {
    // Desk pages use the shell bundle; landing still links components directly.
    return html.includes('phuglee-components.css') || html.includes('shell-bundle.css');
  }
  if (repo === 'city-list-requests') {
    return html.includes('phuglee-forge.css') && html.includes('phuglee-states.js');
  }
  if (repo === 'property-distress-analyzer') {
    if (page === 'landing.html') {
      return html.includes('landing.css') && html.includes('phuglee-a11y.css');
    }
    return html.includes('phuglee-analyzer.css');
  }
  return false;
}

for (const repo of REPO_ROOTS) {
  test(`${repo.name} public assets have no hardcoded Heat ember #e85d04`, () => {
    const hits = findEmberHex(repo.dir);
    assert.deepEqual(
      hits,
      [],
      `Found legacy ember hex in: ${hits.join(', ') || '(none)'}`
    );
  });
}

test('all 13+ brand pages link phuglee signature styles', () => {
  const missing = [];
  for (const [repo, pages] of Object.entries(BRAND_PAGES)) {
    for (const page of pages) {
      if (!pageHasBrandSheet(repo, page)) {
        missing.push(`${repo}/${page}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Missing brand CSS wiring: ${missing.join(', ')}`);
});

test('proxied HTML injection includes phuglee brand stack', () => {
  const { createRewriter } = require('../lib/rewrite');
  const rewriter = createRewriter({ prefix: '/forge', targetHost: '127.0.0.1', targetPort: 8787 });
  const html = '<!DOCTYPE html><html><head></head><body></body></html>';
  const out = rewriter.rewriteTextBody(html, 'text/html');
  assert.ok(out.includes('phuglee-components.css'));
  assert.ok(out.includes('phuglee-a11y.css'));
  assert.ok(out.includes('phuglee-states.js'));
  assert.ok(out.includes('shell-nav.js'));
});