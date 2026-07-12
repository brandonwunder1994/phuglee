const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createJob,
  listJobs,
  getJob,
  getJobDownload,
  deleteJob,
  runJob
} = require('../lib/geocodio-jobs');

describe('geocodio-jobs', () => {
  let tmp;
  const env = {
    GEOCODIO_API_KEYS: 'testkeyaaaa,testkeybbbb',
    GEOCODIO_API_ACCOUNTS: 'a@test.com,b@test.com',
    GEOCODIO_DAILY_LIMIT: '2500',
    GEOCODIO_USAGE_TZ: 'UTC'
  };
  const scopeMeta = { username: 'geotest', plan: 'pro' };

  function mockFetchOk(rows) {
    return async (_url, options) => {
      const body = JSON.parse(options.body);
      const n = Array.isArray(body) ? body.length : Object.keys(body).length;
      const results = [];
      for (let i = 0; i < n; i += 1) {
        results.push({
          query: 'q',
          response: {
            results: [
              {
                address_components: {
                  number: String(100 + i),
                  formatted_street: 'Test St',
                  city: 'Austin',
                  state_province: 'TX',
                  postal_code: '78701'
                },
                address_lines: [`${100 + i} Test St`]
              }
            ]
          }
        });
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results })
      };
    };
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-jobs-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  it('createJob + runJob produces downloadable CSV', async () => {
    const csv = [
      'Street Address,City,State,Postal Code',
      '1 Main St,Austin,TX,78701',
      '2 Main St,Austin,TX,78701'
    ].join('\n');

    const job = createJob({
      buffer: Buffer.from(csv, 'utf8'),
      filename: 'bulk.csv',
      scopeMeta,
      root: tmp,
      env,
      fetchImpl: mockFetchOk()
    });

    assert.ok(job.id);
    assert.equal(job.inputRows, 2);

    // Wait for async runner
    let meta;
    for (let i = 0; i < 40; i += 1) {
      meta = getJob(job.id, scopeMeta, tmp);
      if (meta.status === 'complete' || meta.status === 'failed' || meta.status === 'partial') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(meta.status, 'complete', meta.error || meta.message);
    assert.equal(meta.kept, 2);

    const dl = getJobDownload(job.id, scopeMeta, tmp);
    const text = dl.buffer.toString('utf8');
    assert.ok(text.includes('Street Address,City,State,Zip Code'));
    assert.ok(text.includes('Austin'));
    assert.ok(text.includes('78701'));

    const { jobs } = listJobs(scopeMeta, tmp);
    assert.equal(jobs.length, 1);

    deleteJob(job.id, scopeMeta, tmp);
    assert.equal(listJobs(scopeMeta, tmp).jobs.length, 0);
  });

  it('rejects second concurrent job', async () => {
    const csv = 'Street Address,City,State\n1 A St,Austin,TX\n';
    // Hang fetch so first job stays running
    const hangFetch = () => new Promise(() => {});
    createJob({
      buffer: Buffer.from(csv, 'utf8'),
      filename: 'a.csv',
      scopeMeta,
      root: tmp,
      env,
      fetchImpl: hangFetch
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.throws(
      () =>
        createJob({
          buffer: Buffer.from(csv, 'utf8'),
          filename: 'b.csv',
          scopeMeta,
          root: tmp,
          env,
          fetchImpl: mockFetchOk()
        }),
      (err) => err.code === 'JOB_IN_PROGRESS'
    );
  });

  it('throws NO_KEYS without env', () => {
    assert.throws(
      () =>
        createJob({
          buffer: Buffer.from('Street Address\n1 Main\n', 'utf8'),
          filename: 'x.csv',
          scopeMeta,
          root: tmp,
          env: {}
        }),
      (err) => err.code === 'NO_KEYS'
    );
  });
});
