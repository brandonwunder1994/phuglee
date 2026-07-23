/**
 * Concatenate shell chrome CSS into public/css/shell-bundle.css (no @import chain).
 * Run after editing any shell source sheet: node scripts/build-shell-bundle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'public', 'css');

/** Order matches prior shell-bundle @import list — do not reorder casually. */
const FILES = [
  'tokens.css',
  'distress-glass.css',
  'phuglee-components.css',
  'phuglee-shell.css',
  'shell.css',
  'shell-nav.css',
  'team-alert-banner.css',
  'settings-menu.css',
  'command-palette.css',
  'distress-status.css',
  'phuglee-a11y.css',
  'mobile-baseline.css'
];

let out = '/* shell-bundle generated — do not hand-edit; run: node scripts/build-shell-bundle.mjs */\n';

for (const f of FILES) {
  const filePath = path.join(cssDir, f);
  if (!fs.existsSync(filePath)) {
    console.warn('[build-shell-bundle] missing', f);
    continue;
  }
  let body = fs.readFileSync(filePath, 'utf8');
  body = body.replace(/@import\s+url\([^)]+\)\s*;?/gi, '/* stripped import */');
  out += `\n/* === ${f} === */\n${body}\n`;
}

const dest = path.join(cssDir, 'shell-bundle.css');
fs.writeFileSync(dest, out, 'utf8');
console.log(`[build-shell-bundle] wrote ${dest} (${out.length} bytes, ${FILES.length} sheets)`);
