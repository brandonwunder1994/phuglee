const https = require('https');
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        const c = [];
        res.on('data', (d) => c.push(d));
        res.on('end', () =>
          resolve({ status: res.statusCode, text: Buffer.concat(c).toString('utf8') })
        );
      })
      .on('error', reject);
  });
}
function hasEnrichment(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.profile && typeof r.profile === 'object') return true;
  if (r.marketValue || r.avm || r.wholesaleValue) return true;
  if (r.violations?.length || r.codeCategory || r.violationDescription) return true;
  if (r.importSource === 'new_analyzer_leads_2026-07-11') return true;
  return false;
}
(async () => {
  const html = await get('https://phuglee-production.up.railway.app/analyzer/');
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)[1];
  const h = {
    'X-PDA-Token': tok,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json'
  };
  const s = await get(
    'https://phuglee-production.up.railway.app/analyzer/api/session-backup',
    h
  );
  console.log('status', s.status, 'len', s.text.length);
  const p = JSON.parse(s.text);
  const session = p.session || p;
  const records = session.records || [];
  const results = session.results || [];
  const recEn = records.filter(hasEnrichment);
  const resEn = results.filter(hasEnrichment);
  const newSrc = records.filter((r) => r.importSource === 'new_analyzer_leads_2026-07-11');
  console.log(
    JSON.stringify(
      {
        records: records.length,
        results: results.length,
        recordsEnriched: recEn.length,
        resultsEnriched: resEn.length,
        newImportSourceRecords: newSrc.length,
        fileName: session.fileName,
        importBatches: (session.importBatches || []).length,
        sampleEnrichedRecord: recEn[0] && {
          address: recEn[0].address,
          market: recEn[0].marketValue || recEn[0].profile?.marketValue,
          hasProfile: !!recEn[0].profile,
          src: recEn[0].importSource
        },
        sampleResult: results[0] && {
          address: results[0].address,
          keys: Object.keys(results[0]).sort(),
          hasProfile: !!results[0].profile,
          market: results[0].marketValue
        }
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
