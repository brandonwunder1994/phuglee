import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function patch(file, fn) {
  const p = path.join(root, file);
  let c = fs.readFileSync(p, 'utf8');
  const n = fn(c);
  if (n !== c) {
    fs.writeFileSync(p, n);
    console.log('updated', file);
  } else {
    console.log('skip', file);
  }
}

for (const f of ['index.html', 'heat.html', 'command.html']) {
  patch(f, (c) => c.replace(/home-coverage\.js\?v=[^"']+/g, 'home-coverage.js?v=24-wave1'));
}

for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.html'))) {
  patch(f, (c) => c.replace(/shell-bundle\.css\?v=[^"']+/g, 'shell-bundle.css?v=20-wave1-concat'));
}

patch('government-lists.html', (c) =>
  c.replace(/government-lists-app\.js\?v=[^"']+/g, 'government-lists-app.js?v=10-wave1-meta')
);

patch('heat.html', (c) =>
  c
    .replace(/video-fallback\.js(\?v=[^"']*)?/g, 'video-fallback.js?v=3-wave1')
    .replace(/preload="metadata"/g, 'preload="none"')
);

for (const f of ['index.html', 'heat.html']) {
  patch(f, (c) => c.replace(/\/images\/phuglee-logo-hd\.png/g, '/images/phuglee-logo.png'));
}

console.log('logo.png KB', (fs.statSync(path.join(root, 'images', 'phuglee-logo.png')).size / 1024).toFixed(0));
