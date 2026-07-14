'use strict';
require('dotenv').config();
const { spawnSync } = require('child_process');

const vars = [
  ['SIGNNOW_ACCESS_TOKEN', process.env.SIGNNOW_ACCESS_TOKEN],
  ['SIGNNOW_API_BASE', process.env.SIGNNOW_API_BASE || 'https://api.signnow.com'],
  ['SIGNNOW_FROM_EMAIL', process.env.SIGNNOW_FROM_EMAIL || 'brandon@wunderhausgroup.com']
];

for (const [key, value] of vars) {
  if (!value) {
    console.error('missing', key);
    process.exit(1);
  }
  const r = spawnSync('railway', ['variables', '--set', `${key}=${value}`], {
    encoding: 'utf8',
    shell: true
  });
  if (r.status !== 0) {
    console.error(key, 'FAIL', (r.stderr || r.stdout || '').slice(0, 400));
    process.exit(r.status || 1);
  }
  console.log(key, 'set');
}
console.log('railway signnow vars ok');
