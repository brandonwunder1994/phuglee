'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('pre-liens page has county playbook picker', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'pre-liens.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(html.includes('pl-playbook') || html.includes('County playbook'));
  assert.ok(html.includes('pl-playbook-select') || html.includes('id="pl-playbook"'));
  assert.ok(app.includes('/api/gov-playbooks'));
  assert.ok(app.includes('loadPlaybooks') || app.includes('renderPlaybook'));
  assert.ok(app.includes('courtUrl') || app.includes('preLien'));
});

test('pre-liens app supports playbook query param', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(app.includes('playbook') && (app.includes('searchParams') || app.includes('URLSearchParams')));
});
