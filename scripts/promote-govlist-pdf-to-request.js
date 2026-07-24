#!/usr/bin/env node
/**
 * Promote Government Lists code-violation PDF rows into Form Forge PDF filler.
 *
 * Selection (matches prior operator decision):
 *   listType = code_violation
 *   method   = pdf
 *   no forgeCityId yet
 *   state not in Form Forge LEADS_UNAVAILABLE / EXCLUDED
 *
 * Writes:
 *   - modules/form-forge/data/govlist-pdf-promote-seed.json  (boot merge source)
 *   - portal-registry.json + review-queue.json (local apply)
 *   - public/data + data government-lists catalogs (forgeCityId write-back)
 *
 * Usage:
 *   node scripts/promote-govlist-pdf-to-request.js           # dry-run summary
 *   node scripts/promote-govlist-pdf-to-request.js --apply   # write files
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATHS = [
  path.join(ROOT, 'public', 'data', 'government-lists', 'catalog.json'),
  path.join(ROOT, 'data', 'government-lists', 'catalog.json'),
];
const REGISTRY_PATH = path.join(ROOT, 'modules', 'form-forge', 'data', 'portal-registry.json');
const QUEUE_PATH = path.join(ROOT, 'modules', 'form-forge', 'data', 'review-queue.json');
// Outside data/ so Railway volume symlink does not drop the seed on boot.
const SEED_PATH = path.join(ROOT, 'modules', 'form-forge', 'seeds', 'govlist-pdf-promote-seed.json');
const REPORT_PATH = path.join(ROOT, 'modules', 'form-forge', 'data', 'promote-govlist-pdf-to-request-last.json');

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
};

// Mirror Form Forge portal_registry.LEADS_UNAVAILABLE_STATES + EXCLUDED
const BLOCKED_STATES = new Set([
  'Alaska', 'Alabama', 'Arkansas', 'Delaware', 'Kentucky', 'South Carolina', 'Virginia'
]);

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function slugify(state, city) {
  return `${state}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function expandState(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length === 2) return US_STATES[s.toUpperCase()] || s;
  return s;
}

function nowIso() {
  return new Date().toISOString();
}

function loadCatalog() {
  for (const p of CATALOG_PATHS) {
    if (fs.existsSync(p)) {
      return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  }
  throw new Error('Government lists catalog not found');
}

function selectCandidates(sources) {
  const out = [];
  const skipped = { linked: 0, blocked: 0, noCity: 0, other: 0 };
  for (const s of sources || []) {
    if (!s || s.isPlaybook) continue;
    if (s.listType !== 'code_violation') continue;
    if (s.method !== 'pdf') continue;
    if (s.forgeCityId) {
      skipped.linked += 1;
      continue;
    }
    const city = String(s.city || '').trim();
    if (!city) {
      skipped.noCity += 1;
      continue;
    }
    const state = expandState(s.state);
    if (BLOCKED_STATES.has(state)) {
      skipped.blocked += 1;
      continue;
    }
    const id = slugify(state, city);
    out.push({
      id,
      city,
      state,
      url: String(s.url || '').trim(),
      contact_email: String(s.contactEmail || '').trim(),
      sourceId: s.id,
      listType: s.listType,
      method: s.method,
      verifyStatus: s.verifyStatus || 'pdf_only',
      promotedAt: nowIso()
    });
  }
  // Dedupe by forge city id (same place may appear once after water removal)
  const byId = new Map();
  for (const row of out) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return { cities: [...byId.values()], skipped };
}

function buildRegistryCity(item) {
  return {
    id: item.id,
    city: item.city,
    state: item.state,
    pathway: 'email_pdf',
    portal_url: item.url || '',
    contact_email: item.contact_email || '',
    url_notes: 'Promoted from Government Lists (PDF FOIA form).',
    form_type: 'PDF Email',
    gov_list_source_id: item.sourceId || '',
    promoted_from_govlist_at: item.promotedAt,
    requests: {
      water_shutoff: { requested: null, response_status: 'pending', response_raw: '' },
      code_violation: { requested: null, response_status: 'pending', response_raw: '' }
    },
    pdf: {
      status: 'missing_pdf',
      raw_path: '',
      user_filled_path: '',
      preview_path: '',
      fillable: false,
      field_count: 0,
      field_names: [],
      saved_at: '',
      desktop_path: ''
    },
    submissions: []
  };
}

function buildQueueItem(item) {
  return {
    id: item.id,
    state: item.state,
    city: item.city,
    email: item.contact_email || '',
    raw_path: '',
    user_filled_path: '',
    preview_path: '',
    fillable: false,
    field_count: 0,
    field_names: [],
    status: 'missing_pdf',
    url: item.url || '',
    saved_at: '',
    desktop_path: '',
    gov_list_source_id: item.sourceId || '',
    promoted_from_govlist_at: item.promotedAt
  };
}

function applyToRegistry(cities) {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const byId = new Map((registry.cities || []).map((c) => [c.id, c]));
  let added = 0;
  for (const item of cities) {
    if (byId.has(item.id)) continue;
    byId.set(item.id, buildRegistryCity(item));
    added += 1;
  }
  registry.cities = [...byId.values()].sort((a, b) =>
    `${a.state} ${a.city}`.localeCompare(`${b.state} ${b.city}`)
  );
  registry.city_count = registry.cities.length;
  registry.govlist_pdf_promoted_at = nowIso();
  writeJsonAtomic(REGISTRY_PATH, registry);
  return { added, total: registry.city_count };
}

function applyToQueue(cities) {
  let queue = { mode: 'raw_editor', generated_at: nowIso(), total: 0, stats: {}, items: [] };
  if (fs.existsSync(QUEUE_PATH)) {
    queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  }
  const byId = new Map((queue.items || []).map((i) => [i.id, i]));
  let added = 0;
  for (const item of cities) {
    if (byId.has(item.id)) continue;
    byId.set(item.id, buildQueueItem(item));
    added += 1;
  }
  const items = [...byId.values()].sort((a, b) =>
    `${a.state} ${a.city}`.localeCompare(`${b.state} ${b.city}`)
  );
  queue.items = items;
  queue.total = items.length;
  queue.stats = {
    ...(queue.stats || {}),
    total: items.length,
    completed: items.filter((i) => i.status === 'completed').length,
    pending: items.filter((i) => i.status === 'pending').length,
    missing_pdf: items.filter((i) => i.status === 'missing_pdf').length
  };
  queue.govlist_pdf_promoted_at = nowIso();
  writeJsonAtomic(QUEUE_PATH, queue);
  return { added, total: queue.total };
}

function writeSeed(cities) {
  const seed = {
    version: '2026-07-23-code-pdf-v1',
    generatedAt: nowIso(),
    description:
      'Code-violation PDF FOIA forms from Government Lists for one-time fill in Request → PDF filler.',
    cityCount: cities.length,
    cities
  };
  writeJsonAtomic(SEED_PATH, seed);
  return seed;
}

function writeCatalogLinks(cities) {
  const bySource = new Map(cities.map((c) => [c.sourceId, c.id]));
  let linked = 0;
  for (const catalogPath of CATALOG_PATHS) {
    if (!fs.existsSync(catalogPath)) continue;
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const stamp = nowIso();
    for (const s of catalog.sources || []) {
      if (!s || !bySource.has(s.id)) continue;
      s.forgeCityId = bySource.get(s.id);
      s.promotedToRequestAt = stamp;
      linked += 1;
    }
    catalog.updatedAt = stamp;
    writeJsonAtomic(catalogPath, catalog);
  }
  // linked counts both catalog files when both exist
  return { linked };
}

function main() {
  const apply = process.argv.includes('--apply');
  const { path: catalogPath, data: catalog } = loadCatalog();
  const { cities, skipped } = selectCandidates(catalog.sources || []);

  console.log('Catalog:', catalogPath);
  console.log('Candidates (code + method=pdf + unlinked, allowed states):', cities.length);
  console.log('Skipped:', skipped);

  const seed = writeSeed(cities);
  console.log('Wrote seed:', SEED_PATH, `(${seed.cityCount} cities, version ${seed.version})`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to update registry, queue, and catalog links.');
    writeJsonAtomic(REPORT_PATH, {
      dryRun: true,
      at: nowIso(),
      candidateCount: cities.length,
      skipped,
      sample: cities.slice(0, 8)
    });
    return;
  }

  // Backup registry before mutate
  if (fs.existsSync(REGISTRY_PATH)) {
    const bak = REGISTRY_PATH.replace(
      /portal-registry\.json$/,
      `portal-registry.pre-promote-${new Date().toISOString().slice(0, 10)}.json`
    );
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(REGISTRY_PATH, bak);
      console.log('Backup registry:', bak);
    }
  }

  const reg = applyToRegistry(cities);
  const q = applyToQueue(cities);
  const cat = writeCatalogLinks(cities);

  const report = {
    dryRun: false,
    at: nowIso(),
    candidateCount: cities.length,
    skipped,
    registryAdded: reg.added,
    registryTotal: reg.total,
    queueAdded: q.added,
    queueTotal: q.total,
    catalogLinksWritten: cat.linked,
    seedPath: SEED_PATH,
    seedVersion: seed.version
  };
  writeJsonAtomic(REPORT_PATH, report);
  console.log('\nApplied:', JSON.stringify(report, null, 2));
}

main();
