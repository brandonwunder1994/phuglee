const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.html') || entry.name === 'rewrite.js') acc.push(full);
  }
  return acc;
}

const files = [...walk('public'), path.join('lib', 'rewrite.js')];
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/shell-nav\.js\?v=[^"]+/g, 'shell-nav.js?v=19')
    .replace(/settings-menu\.js\?v=[^"]+/g, 'settings-menu.js?v=4');
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log('updated', file);
  }
}
