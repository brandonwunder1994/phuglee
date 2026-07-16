'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'data', 'fund-buyers', 'catalog.json');
const destDir = path.join(root, 'public', 'data', 'fund-buyers');
const dest = path.join(destDir, 'catalog.json');

if (!fs.existsSync(src)) {
  console.error('Missing source catalog:', src);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
const body = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dest, body);
console.log('Synced fund-buyers catalog → public/data/fund-buyers/catalog.json');
