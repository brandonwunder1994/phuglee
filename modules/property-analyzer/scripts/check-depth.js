const fs = require('fs');
const raw = fs.readFileSync(require('path').join(__dirname, '../public/js/legacy-app.js'), 'utf8');
const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.replace(/^    /, ''));

function couldBeRegexStart(code, i) {
  if (code[i] !== '/') return false;
  if (i > 0 && /[=(:,\[!&|?;{}]/.test(code[i - 1])) return true;
  const prev = code.slice(0, i).trimEnd();
  return /(?:^|[=(,:&|?;{}!\[])$/.test(prev) || /\breturn$/.test(prev);
}

function stripStringsAndComments(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next !== '/' && next !== '*' && couldBeRegexStart(code, i)) {
      out += ' ';
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '[') {
          i++;
          while (i < code.length) {
            if (code[i] === '\\') { i += 2; continue; }
            if (code[i] === ']') { i++; break; }
            i++;
          }
          continue;
        }
        if (code[i] === '/') {
          i++;
          while (i < code.length && /[a-z]/i.test(code[i])) i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      out += '  ';
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      out += ' ';
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '`') {
      out += ' ';
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '$' && code[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < code.length && depth > 0) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') depth--;
            i++;
          }
          continue;
        }
        if (code[i] === '`') { i++; break; }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

let depth = 0;
const zeros = [];
for (let i = 0; i < lines.length; i++) {
  const scan = stripStringsAndComments(lines[i]);
  const opens = (scan.match(/[{(\[]/g) || []).length;
  const closes = (scan.match(/[})\]]/g) || []).length;
  depth += opens - closes;
  if (depth < 0) depth = 0;
  if (depth === 0) zeros.push(i + 1);
}
console.log('zero depth count', zeros.length);
console.log('first 15', zeros.slice(0, 15));
console.log('1400-1500', zeros.filter((z) => z > 1400 && z < 1500));
console.log('after 500 first 10', zeros.filter((z) => z > 500).slice(0, 10));
console.log('2800-2900', zeros.filter((z) => z > 2800 && z < 2900));
console.log('4200-4300', zeros.filter((z) => z > 4200 && z < 4300));
console.log('5600-5700', zeros.filter((z) => z > 5600 && z < 5700));
console.log('7000-7100', zeros.filter((z) => z > 7000 && z < 7100));
console.log('8500-8600', zeros.filter((z) => z > 8500 && z < 8600));
console.log('9900-10000', zeros.filter((z) => z > 9900 && z < 10000));
console.log('11000+', zeros.filter((z) => z > 11000));
console.log('last 10 zeros', zeros.slice(-10));
console.log('final depth', depth);
for (let mark = 1000; mark <= 12000; mark += 1000) {
  let d = 0;
  for (let i = 0; i < mark && i < lines.length; i++) {
    const scan = stripStringsAndComments(lines[i]);
    d += (scan.match(/[{(\[]/g) || []).length - (scan.match(/[})\]]/g) || []).length;
  }
  console.log('depth@' + mark, d);
}
let d2 = 0;
for (let i = Math.max(0, lines.length - 30); i < lines.length; i++) {
  const scan = stripStringsAndComments(lines[i]);
  const opens = (scan.match(/[{(\[]/g) || []).length;
  const closes = (scan.match(/[})\]]/g) || []).length;
  d2 += opens - closes;
  console.log(i + 1, 'd=' + d2, lines[i].slice(0, 60));
}