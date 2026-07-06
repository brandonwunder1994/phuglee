const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  PORT: Number(process.env.DISTRESS_OS_PORT || 3000),
  HOST: process.env.DISTRESS_OS_HOST || '127.0.0.1',
  ROOT,
  PUBLIC: path.join(ROOT, 'public'),

  FORGE_PREFIX: '/forge',
  FORGE_PORT: Number(process.env.FORM_FORGE_PORT || 8787),
  FORGE_HOST: process.env.FORM_FORGE_HOST || '127.0.0.1',
  FORGE_PATH: process.env.FORM_FORGE_PATH || path.join(ROOT, 'modules', 'form-forge'),

  DISTRESS_ROUTES: {
    '/': 'index.html',
    '/heat': 'heat.html'
  }
};