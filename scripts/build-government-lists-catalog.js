#!/usr/bin/env node
'use strict';

/**
 * Build public/data/government-lists/catalog.json from:
 * - Wholesale Brain list-type doctrine (inline)
 * - Form Forge portal registry (code + water cities)
 * - Known example portals from gov-lists training
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORTAL_REGISTRY = path.join(ROOT, 'modules', 'form-forge', 'data', 'portal-registry.json');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'government-lists');
const OUT_FILE = path.join(OUT_DIR, 'catalog.json');
const DATA_MIRROR = path.join(ROOT, 'data', 'government-lists', 'catalog.json');

const LIST_TYPES = [
  {
    id: 'pre_lien',
    label: 'Pre-liens',
    priority: 1,
    custodian: 'county',
    cadence: 'weekly',
    summary: 'Civil/small-claims complaints before judgment — 2–3 month edge vs recorded liens.'
  },
  {
    id: 'code_violation',
    label: 'Code violations',
    priority: 2,
    custodian: 'city',
    cadence: 'weekly',
    summary: 'Open/unresolved code, nuisance, boarded, weeds — city code enforcement.'
  },
  {
    id: 'tax_delinquent',
    label: 'Tax delinquent',
    priority: 3,
    custodian: 'county',
    cadence: 'monthly',
    summary: 'Unpaid taxes / tax sale rolls — primary for vacant land.'
  },
  {
    id: 'lis_pendens',
    label: 'Pre-foreclosure (LP / NOD)',
    priority: 4,
    custodian: 'county',
    cadence: 'weekly',
    summary: 'Lis pendens, notice of default, notice of sale — ask by document type, not “pre-foreclosure list.”'
  },
  {
    id: 'probate',
    label: 'Probate / estate',
    priority: 5,
    custodian: 'county',
    cadence: 'weekly',
    summary: 'New estate filings with real property — live dockets beat vendor inheritance lists.'
  },
  {
    id: 'fire',
    label: 'Fire-damaged',
    priority: 6,
    custodian: 'city',
    cadence: 'weekly',
    summary: 'Fire dept incident addresses — low competition if obtained.'
  },
  {
    id: 'eviction',
    label: 'Evictions',
    priority: 7,
    custodian: 'county',
    cadence: 'weekly',
    summary: 'Unlawful detainer dockets — outreach to landlord (plaintiff), not tenant.'
  },
  {
    id: 'water_shutoff',
    label: 'Water shutoffs',
    priority: 8,
    custodian: 'city',
    cadence: 'monthly',
    summary: 'Non-payment shutoffs — high denial rate; try once per market, don’t build on it.'
  }
];

const TEMPLATES = {
  pre_lien: `Under the [STATE PUBLIC RECORDS ACT], I request access to newly filed civil and small-claims complaints (pre-judgment) for [COUNTY] from [START] to [END]. I need case search URLs or exports including case number, filing date, parties, and complaint/summons PDFs when available.`,
  code_violation: `Under the [STATE PUBLIC RECORDS ACT], I request an electronic list of all open/unresolved code-violation cases for [CITY] from [START] to [END]. Please include property address, parcel ID, owner name, mailing address, case number, violation type, opened date, status, and compliance deadline when available. CSV or Excel preferred.`,
  tax_delinquent: `Under the [STATE PUBLIC RECORDS ACT], I request the current tax delinquent / tax-due roll for [COUNTY] (not only the next auction list). Please include parcel ID, property address, owner name, mailing address, years delinquent, amount owed, and any upcoming sale date. CSV or Excel preferred.`,
  lis_pendens: `Please point me to official records search for lis pendens / notice of default / notice of trustee sale / bank foreclosure suits in [COUNTY] from [START] to [END]. I need document type filters and how to export or copy party + property info.`,
  probate: `Under the [STATE PUBLIC RECORDS ACT], I request new probate / estate filings in [COUNTY] from [START] to [END], including decedent name, petitioner/personal representative, case number, filing date, and any real property listed.`,
  fire: `I request an electronic list of residential fire incident addresses in [CITY/COUNTY] for the last 30–60 days (address and incident date). CSV or Excel preferred.`,
  eviction: `I request access to unlawful detainer / eviction filings in [COUNTY] from [START] to [END], including plaintiff (landlord), property address, case number, and filing date when available.`,
  water_shutoff: `Under the [STATE PUBLIC RECORDS ACT], I request an electronic list of water service shutoffs due to non-payment (not voluntary seasonal) for [CITY] for the last 30–60 days, including service address and shutoff date. CSV or Excel preferred.`
};

const EXAMPLE_SOURCES = [
  {
    id: 'ex-milwaukee-accela-code',
    listType: 'code_violation',
    city: 'Milwaukee',
    county: '',
    state: 'Wisconsin',
    url: 'https://aca-prod.accela.com/MILWAUKEE/Cap/CapHome.aspx?module=Enforcement',
    method: 'accela',
    cadence: 'weekly',
    notes: 'Accela enforcement search — verify export options live.',
    source: 'brain_example'
  },
  {
    id: 'ex-lancaster-ca-justfoia',
    listType: 'code_violation',
    city: 'Lancaster',
    county: '',
    state: 'California',
    url: 'https://cityoflancasterca.justfoia.com/publicportal/home/newrequest',
    method: 'request',
    cadence: 'weekly',
    notes: 'JustFOIA public records portal.',
    source: 'brain_example'
  },
  {
    id: 'ex-rome-ga-records',
    listType: 'code_violation',
    city: 'Rome',
    county: '',
    state: 'Georgia',
    url: 'https://romega.us/590/Records-Request',
    method: 'request',
    cadence: 'weekly',
    notes: 'City records request page.',
    source: 'brain_example'
  },
  {
    id: 'ex-tarrant-tx-records',
    listType: 'lis_pendens',
    city: '',
    county: 'Tarrant',
    state: 'Texas',
    url: 'https://tarrant.tx.publicsearch.us',
    method: 'recorder',
    cadence: 'weekly',
    notes: 'Official records — search NOD / LP / trustee sale doc types.',
    source: 'brain_example'
  },
  {
    id: 'ex-dallas-tx-records',
    listType: 'lis_pendens',
    city: '',
    county: 'Dallas',
    state: 'Texas',
    url: 'https://dallastx.publicsearch.us',
    method: 'recorder',
    cadence: 'weekly',
    notes: 'Official records — search NOD / LP / trustee sale doc types.',
    source: 'brain_example'
  },
  {
    id: 'ex-bexar-tx-records',
    listType: 'lis_pendens',
    city: '',
    county: 'Bexar',
    state: 'Texas',
    url: 'https://bexar.tx.publicsearch.us',
    method: 'recorder',
    cadence: 'weekly',
    notes: 'Official records — search NOD / LP / trustee sale doc types.',
    source: 'brain_example'
  },
  {
    id: 'ex-tulsa-ok-records',
    listType: 'lis_pendens',
    city: '',
    county: 'Tulsa',
    state: 'Oklahoma',
    url: 'https://acclaim.tulsacounty.org/AcclaimWeb',
    method: 'recorder',
    cadence: 'weekly',
    notes: 'County Acclaim official records.',
    source: 'brain_example'
  }
];

const PLAYBOOK_SOURCES = LIST_TYPES.map((lt) => ({
  id: `playbook-${lt.id}`,
  listType: lt.id,
  city: '',
  county: '',
  state: '',
  url: '',
  method: lt.custodian === 'county' ? 'court' : 'request',
  cadence: lt.cadence,
  notes: `How-to: ${lt.summary} Custodian is usually the ${lt.custodian}. Use Collect for city code/water requests you already track.`,
  requestTemplate: TEMPLATES[lt.id] || '',
  source: 'brain_playbook',
  priority: lt.priority,
  isPlaybook: true
}));

function pathwayToMethod(pathway) {
  if (pathway === 'online' || pathway === 'hybrid') return 'request';
  if (pathway === 'email_only' || pathway === 'email_pdf') return 'email';
  return 'request';
}

function firstUrlFromNotes(notes) {
  const text = String(notes || '');
  const m = text.match(/https?:\/\/[^\s)\]]+/i);
  return m ? m[0].replace(/[.,;]+$/, '') : '';
}

function slugPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function priorityFor(listTypeId) {
  const lt = LIST_TYPES.find((x) => x.id === listTypeId);
  return lt ? lt.priority : 99;
}

function fromPortalRegistry(registry) {
  const out = [];
  for (const city of registry.cities || []) {
    const method = pathwayToMethod(city.pathway);
    const portalUrl = String(city.portal_url || '').trim();
    const noteUrl = firstUrlFromNotes(city.url_notes);
    const url = portalUrl || noteUrl || '';
    const base = {
      city: city.city || '',
      county: '',
      state: city.state || '',
      contactEmail: city.contact_email || '',
      cadence: 'weekly',
      lastVerified: null,
      forgeCityId: city.id,
      source: 'form_forge'
    };

    out.push({
      id: `${city.id}-code`,
      listType: 'code_violation',
      ...base,
      url,
      method,
      notes: [
        city.form_type ? `Form type: ${city.form_type}` : '',
        city.pathway ? `Pathway: ${city.pathway}` : '',
        city.url_notes ? String(city.url_notes).slice(0, 280) : ''
      ].filter(Boolean).join(' · '),
      requestTemplate: TEMPLATES.code_violation,
      priority: priorityFor('code_violation'),
      isPlaybook: false
    });

    out.push({
      id: `${city.id}-water`,
      listType: 'water_shutoff',
      ...base,
      url,
      method,
      cadence: 'monthly',
      notes: [
        'Water lists are often denied — try once, then move on.',
        city.pathway ? `Pathway: ${city.pathway}` : ''
      ].filter(Boolean).join(' · '),
      requestTemplate: TEMPLATES.water_shutoff,
      priority: priorityFor('water_shutoff'),
      isPlaybook: false
    });
  }
  return out;
}

function normalizeSource(raw) {
  return {
    id: raw.id,
    listType: raw.listType,
    city: raw.city || '',
    county: raw.county || '',
    state: raw.state || '',
    url: raw.url || '',
    method: raw.method || 'request',
    cadence: raw.cadence || 'weekly',
    lastVerified: raw.lastVerified || null,
    notes: raw.notes || '',
    requestTemplate: raw.requestTemplate || TEMPLATES[raw.listType] || '',
    contactEmail: raw.contactEmail || '',
    priority: raw.priority != null ? raw.priority : priorityFor(raw.listType),
    source: raw.source || 'manual',
    forgeCityId: raw.forgeCityId || null,
    isPlaybook: !!raw.isPlaybook
  };
}

function main() {
  if (!fs.existsSync(PORTAL_REGISTRY)) {
    console.error('Missing portal registry:', PORTAL_REGISTRY);
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(PORTAL_REGISTRY, 'utf8'));
  const forgeSources = fromPortalRegistry(registry);
  const exampleSources = EXAMPLE_SOURCES.map((s) =>
    normalizeSource({
      ...s,
      requestTemplate: TEMPLATES[s.listType] || '',
      priority: priorityFor(s.listType),
      isPlaybook: false
    })
  );
  const playbooks = PLAYBOOK_SOURCES.map(normalizeSource);

  const byId = new Map();
  for (const s of [...playbooks, ...exampleSources, ...forgeSources.map(normalizeSource)]) {
    byId.set(s.id, s);
  }
  const sources = [...byId.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const sa = `${a.state} ${a.county} ${a.city}`.localeCompare(`${b.state} ${b.county} ${b.city}`);
    if (sa !== 0) return sa;
    return a.id.localeCompare(b.id);
  });

  const catalog = {
    version: 1,
    updatedAt: new Date().toISOString(),
    title: 'Government Lists — source registry',
    description:
      'Phonebook of where to pull each government list type. Collect asks cities; this page remembers the sources.',
    listTypes: LIST_TYPES,
    methods: [
      { id: 'open_data', label: 'Open data / CSV' },
      { id: 'accela', label: 'Accela / case search' },
      { id: 'court', label: 'Court / clerk search' },
      { id: 'recorder', label: 'Official records' },
      { id: 'request', label: 'Records request portal' },
      { id: 'email', label: 'Email / PDF FOIA' },
      { id: 'manual', label: 'Manual / in person' }
    ],
    sources,
    stats: {
      sourceCount: sources.length,
      forgeCityCount: (registry.cities || []).length,
      listTypeCount: LIST_TYPES.length,
      playbookCount: playbooks.length,
      exampleCount: exampleSources.length
    }
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_MIRROR), { recursive: true });
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  fs.writeFileSync(OUT_FILE, json);
  fs.writeFileSync(DATA_MIRROR, json);
  console.log(
    `Wrote ${sources.length} sources (${forgeSources.length} from Form Forge) → ${path.relative(ROOT, OUT_FILE)}`
  );
}

main();
