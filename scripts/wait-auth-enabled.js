const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') })
        );
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const base = 'https://phuglee-production.up.railway.app';
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const health = await get(`${base}/api/health`);
      const cfg = await get(`${base}/js/auth-config.js`);
      const disabled = /__PHUGLEE_AUTH_DISABLED__\s*=\s*true/.test(cfg.text);
      const enabled = /__PHUGLEE_AUTH_DISABLED__\s*=\s*false/.test(cfg.text);
      const autoAdmin = /phuglee_session',\s*'admin'/.test(cfg.text);
      console.log(
        new Date().toISOString(),
        'health',
        health.status,
        'authDisabled',
        disabled,
        'authEnabledFlag',
        enabled,
        'autoAdmin',
        autoAdmin
      );
      console.log('auth-config snippet:', cfg.text.replace(/\s+/g, ' ').slice(0, 200));
      if (health.status === 200 && enabled && !disabled && !autoAdmin) {
        console.log('SUCCESS login required on production');
        process.exit(0);
      }
    } catch (err) {
      console.log('wait', err.message);
    }
    await sleep(20000);
  }
  console.error('TIMEOUT — auth may still be disabled (check Railway env var override)');
  process.exit(1);
})();
