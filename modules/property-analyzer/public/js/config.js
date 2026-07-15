// config.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.BATCH_SIZE = 100;
/**
 * Operator band: 5–50 parallel property workers.
 * Soft API pressure can lower toward 5; clean batches climb back to the slider max.
 * Never collapses to 1 — that used to happen when a global pause left one visible Gemini slot.
 * Default 25 = sweet spot for paid Gemini RPM + Maps/browser; slider can go to 50.
 */
R.MIN_CONCURRENT_LIMIT = 5;
R.DEFAULT_CONCURRENT_LIMIT = 25;
R.MAX_SAFE_CONCURRENT = 50;
/** Cooldown so server status polls don’t keep hammering scale-down every 5s. */
R.SCALE_DOWN_COOLDOWN_MS = 45000;
R.STREET_VIEW_SIZE = '640x480';
R.CARD_THUMB_SIZE = '400x300';
R.CARD_SAT_THUMB_SIZE = '400x400';
R.SV_THUMB_FOV = 65;
R.SV_THUMB_RADIUS = 50;
R.SAT_THUMB_ZOOM = 20;
R.REVIEW_STREET_VIEW_SIZE = '480x360';
R.REVIEW_PREFETCH_AHEAD = 10;
R.REVIEW_PREFETCH_URGENT = 6;
R.REVIEW_PRELOAD_CONCURRENCY = 3;
R.REVIEW_PRELOAD_CACHE_MAX = 256;
R.REVIEW_LEAN_PAGE_SIZE = 500;
R.REVIEW_SAVE_EVERY_N = 40;
R.REVIEW_PROGRESS_DEBOUNCE_MS = 3500;
R.REVIEW_CHECKPOINT_EVERY_N = 100;
R.GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
R.UI_THROTTLE_MS = 4000;
R.SESSION_SAVE_IDLE_MS = 2000;
R.SESSION_SAVE_SCAN_MS = 8000;
R.SIZE_WARN_BYTES = 4 * 1024 * 1024;
R.SCAN_SAVE_HEARTBEAT_MS = 45000;

R.sessionSaveEveryN = function sessionSaveEveryN() {
  const n = state.results.length;
  if (n >= 5000) return 80;
  if (n >= 3000) return 50;
  if (n >= 1500) return 35;
  if (n >= 500) return 20;
  return 10;
}

R.scanSaveHeartbeatMs = function scanSaveHeartbeatMs() {
  const n = state.results.length;
  if (n >= 3000) return 60000;
  if (n >= 1500) return 45000;
  return 30000;
}
R.SAT_VACANT_SKIP_CONFIDENCE = 70;
R.LOCAL_APP_HOST = 'distressos.local';
R.LOCAL_APP_URL = 'http://distressos.local:3456';
R.MODULE_PREFIX = (typeof window.__DISTRESS_OS_MODULE_PREFIX__ === 'string' && window.__DISTRESS_OS_MODULE_PREFIX__) || '';
R.IS_EMBEDDED = !!R.MODULE_PREFIX;
R.USE_PROXY = location.hostname === 'localhost'
  || location.hostname === '127.0.0.1'
  || location.hostname === R.LOCAL_APP_HOST
  || R.IS_EMBEDDED;
R.serverHasMapsKey = false;
R.serverConfig = { hasMapsKey: false, hasGeminiKey: false, mapsKeyTail: null, geminiKeyTail: null };

R.getAuthToken = function getAuthToken() {
  return typeof window.__PDA_AUTH_TOKEN__ === 'string' ? window.__PDA_AUTH_TOKEN__ : '';
}

R.resolveModuleApiUrl = function resolveModuleApiUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return url;
  const prefix = R.MODULE_PREFIX;
  if (!prefix || url.startsWith(prefix + '/')) return url;
  if (url.startsWith('/api/') || url === '/api') return `${prefix}${url}`;
  return url;
}

/** Prefix /api/* paths for embedded Distress OS (/analyzer) — img.src does not use fetch patch. */
R.resolveImageryPublicUrl = function resolveImageryPublicUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  if (url.startsWith('/api/')) return R.resolveModuleApiUrl(url);
  return url;
}

R.applyPhugleeSessionHeaders = function applyPhugleeSessionHeaders(headers = {}) {
  if (typeof window !== 'undefined'
    && window.PhugleeSessionHeaders
    && typeof window.PhugleeSessionHeaders.phugleeSessionHeaders === 'function') {
    return window.PhugleeSessionHeaders.phugleeSessionHeaders(headers);
  }
  return { ...headers };
}

R.apiFetch = function apiFetch(url, opts = {}) {
  const headers = R.applyPhugleeSessionHeaders(opts.headers || {});
  const token = getAuthToken();
  if (token) headers['X-PDA-Token'] = token;
  // Keep shell login cookie on Analyzer API calls so save/load use the same user folder.
  return fetch(R.resolveModuleApiUrl(url), {
    credentials: 'same-origin',
    ...opts,
    headers
  });
}

if (R.IS_EMBEDDED && typeof window !== 'undefined' && !window.__PDA_FETCH_PATCHED__) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function pdaFetch(input, init) {
    if (typeof input === 'string') input = R.resolveModuleApiUrl(input);
    const nextInit = { credentials: 'same-origin', ...(init || {}) };
    if (typeof input === 'string' && (input.includes('/api/') || input.endsWith('/api'))) {
      const headers = R.applyPhugleeSessionHeaders(
        nextInit.headers && typeof nextInit.headers === 'object' && !(nextInit.headers instanceof Headers)
          ? nextInit.headers
          : {}
      );
      nextInit.headers = headers;
    }
    return nativeFetch(input, nextInit);
  };
  window.__PDA_FETCH_PATCHED__ = true;
}
  window.apiFetch = R.apiFetch;
  global.apiFetch = R.apiFetch;
window.apiFetch = apiFetch;

R.appendMapsKeyParam = function appendMapsKeyParam(params, apiKey) {
  if (USE_PROXY) return;
  const k = normalizeApiKey(apiKey);
  if (k) params.set('key', k);
}

R.updateKeyStatusUi = function updateKeyStatusUi() {
  const mapsOk = !!serverConfig.hasMapsKey;
  const geminiOk = !!serverConfig.hasGeminiKey;
  streetViewKey.value = mapsOk
    ? `✓ Configured (…${serverConfig.mapsKeyTail || '??????'})`
    : '✗ Not configured — add MAPS_API_KEY to .env';
  geminiKey.value = geminiOk
    ? `✓ Configured (…${serverConfig.geminiKeyTail || '??????'})`
    : '✗ Not configured — add GEMINI_API_KEY to .env';
  streetViewKeyHint.textContent = mapsOk
    ? `MAPS_API_KEY loaded on server — ends in …${serverConfig.mapsKeyTail || ''}`
    : 'Add MAPS_API_KEY to .env and restart launch-analyzer.bat';
  streetViewKeyHint.classList.toggle('active', mapsOk);
  geminiKeyHint.textContent = geminiOk
    ? `GEMINI_API_KEY loaded on server — ends in …${serverConfig.geminiKeyTail || ''}`
    : 'Add GEMINI_API_KEY to .env and restart launch-analyzer.bat';
  geminiKeyHint.classList.toggle('active', geminiOk);
}

let serverConfigLoadPromise = null;

R.fetchServerConfig = async function fetchServerConfig() {
  if (!USE_PROXY) return;
  if (serverConfigLoadPromise) return serverConfigLoadPromise;
  serverConfigLoadPromise = (async () => {
    try {
      const res = typeof apiFetch === 'function'
        ? await apiFetch('/api/config')
        : await fetch(resolveModuleApiUrl('/api/config'), { credentials: 'same-origin' });
      const data = await res.json();
      if (data?.ok) {
        serverConfig = data;
        serverHasMapsKey = !!data.hasMapsKey;
        updateKeyStatusUi();
        updateStartButton();
        if (serverHasMapsKey && state.results.length) {
          resetThumbLoadQueue();
          refreshAllCardThumbs();
        }
        if (serverHasMapsKey) {
          console.log('[Imagery] Server maps key ready — card previews use /api/sv-image proxy');
        }
      }
    } catch (e) {
      console.warn('[Config] Server config fetch failed', e);
    }
  })();
  return serverConfigLoadPromise;
}

R.buildD4DVacantLotRules = function buildD4DVacantLotRules() {
  return `
VACANT LOT vs HOME (decide FIRST — wholesalers' #1 mistake is scoring weeds on empty land):
- vacant_lot = NO roof/building/mobile-home footprint on the RED MARKER lot. Grass, dirt, trees, farmland, wooded lot, or cleared pad with no structure.
- property = clear roof footprint (house, mobile home, large garage/workshop) ON the marked lot.
- unavailable = ONLY if trees/shadows fully hide the marked lot so you cannot see whether a footprint exists.
- Weeds, junk piles, or debris on OPEN LAND without a roof = vacant_lot score 0, NOT property.
- A driveway or sidewalk alone does NOT mean a house — look for a roof polygon on the lot.
- Double-check: if you see a roof on the marked lot, it is property even if the yard is trashed — score distress on the HOME, not vacant_lot.`;
}

R.buildD4DIndicatorGuide = function buildD4DIndicatorGuide() {
  return `
INDICATOR DEFINITIONS (use exact keys; do not guess):
SIGNAL RULE: Report every visible distress signal you see — do not hide moderate flags on otherwise normal homes. Tier decision uses indicator combos: severe flags alone = distressed; moderate flags need supporting neglect OR score 6+ with multiple visible issues.

SEVERE / HIGH signals (score 8-10 if home confirmed — any ONE alone = distressed):
  boarded_windows, boarded_doors, structural_damage, fire_or_water_damage
  roof_damage_or_tarp = blue/tan tarp, missing shingles, collapsed/sagging roof — NOT mere discoloration
MODERATE signals — require SUPPORTING neglect (do NOT distress on one flag alone):
  junk_or_hoarding_yard = visible debris piles, junk scattered across yard, hoarding, trashed lot — NOT one trash can
  broken_windows = broken/missing facade window panes — NOT reflections or blinds
  abandoned_vehicles = non-running cars, trucks, boats sitting on lot long-term
  A single moderate flag alone on an otherwise normal home → well_maintained (1-5). Pair with another signal to distress.
COMBINATION signals — 2+ together = distressed score 6+:
  junk + overgrown_landscaping, junk + peeling_paint, junk + deferred_maintenance, junk + broken_windows
  broken_windows + overgrown_landscaping or peeling_paint or deferred_maintenance
  abandoned_vehicles + junk or overgrown or peeling or deferred
  overgrown_landscaping + peeling_paint, overgrown_landscaping + deferred_maintenance, peeling_paint + deferred_maintenance
  poor satellite yard + 2 cosmetic neglect flags
COSMETIC / SOFT (never distress alone — combine with moderate or other cosmetic):
  overgrown_landscaping, deferred_maintenance, peeling_paint, broken_gutters, damaged_driveway, code_violation_notice
DUMP HOUSE rule: debris/junk piles + weeds + dirty/heavily peeling exterior = score 6-10 distressed — flag junk_or_hoarding_yard + overgrown_landscaping + peeling_paint when all visible
Satellite-only aerial keys: roof_damage_or_tarp, overgrown_landscaping, junk_or_hoarding_yard, abandoned_vehicles, structural_damage, deferred_maintenance`;
}

R.buildD4DAerialScoringGuide = function buildD4DAerialScoringGuide() {
  return `
AERIAL DISTRESS SCORE (aerial_distress_score) for HOMES only:
  1-3 = manicured lawn, maintained roof, no visible junk/debris from above
  4-5 = minor wear — light discoloration, slightly uneven grass, one soft flag, NO junk piles or abandoned vehicles
  6-7 = distressed from above — clear junk/debris piles OR abandoned vehicle + yard neglect OR heavy overgrowth engulfing structure + peeling/deferred signals
  8-10 = tarp/boarded visible, junk piles + abandoned car, structural damage, severe neglect covering most of lot
Score 6+ only with clear significant neglect: junk piles, debris fields + other neglect, abandoned car + trashed yard, or heavy multi-signal neglect.
Do NOT score 6+ for fair roof discoloration, light grass, or a single minor yard issue on an otherwise maintained lot.`;
}

R.buildD4DStreetScoringGuide = function buildD4DStreetScoringGuide() {
  return `
STREET VIEW checks (facade — wholesalers' drive-by red flags):
  DISTRESSED (score 6-10) — assign when you see CLEAR multi-signal or severe neglect:
• Junk/debris piles + weeds, peeling paint, or deferred maintenance (dump-house pattern)
• Broken windows + overgrowth, peeling, deferred maintenance, or junk
• Abandoned vehicle + junk, heavy weeds, or visible yard neglect
• Heavy weeds engulfing structure + peeling paint or deferred maintenance
• Boarded windows/doors, structural damage, fire/water damage, tarp on roof (severe — score 8+)
  WELL MAINTAINED (score 1-5) — default for normal occupied homes:
• Manicured or mowed yard, clean facade, intact windows, no junk piles, no abandoned cars
• One moderate flag alone (single broken window, one junk pile edge case, one old car) on otherwise maintained home → score 3-5, well_maintained
• Minor code-list flags (light grass, one gutter, code notice) on otherwise normal suburban home → score 2-4
  When uncertain, still list every visible indicator; use score 6+ only when multiple neglect signals or any severe flag is visible.`;
}

R.buildSatellitePrompt = function buildSatellitePrompt(address) {
  return `You are a Driving for Dollars (D4D) wholesaler screening ONE lot from SATELLITE (top-down aerial).

Address: ${address}
RED MARKER = SUBJECT lot only. Ignore neighbor roofs at image edges.

${buildD4DVacantLotRules()}

AERIAL SCAN ORDER:
1) Footprint: home on lot, vacant land, or blocked view?
2) ROOF on subject structure: good/fair/poor — tarp, missing patches, sagging, much worse than neighbors?
3) YARD from above: maintained lawn vs weeds, junk piles, abandoned cars, bare dirt, neglected pool?

${buildD4DIndicatorGuide()}
${buildD4DAerialScoringGuide()}

${buildStaticTierRules()}

REASON CONSISTENCY: If aerial distress is material (score-like 6+ or poor roof/yard neglect), reason must name that neglect — not "well-maintained". If lot looks maintained from above, say so and keep aerial score low.

Respond ONLY valid JSON. reason = one plain sentence (max 25 words) on roof/yard for homes, or why vacant.
{"category":"property"|"vacant_lot"|"unavailable","structure_on_subject_lot":true|false,"roof_condition":"good"|"fair"|"poor"|"unknown","yard_condition":"good"|"fair"|"poor"|"unknown","aerial_distress_score":<0-10>,"indicators":["roof_damage_or_tarp",...],"confidence":<0-100>,"reason":"<plain sentence, no quotes>"}`;
}

R.buildAnalysisPrompt = function buildAnalysisPrompt(address, viewMeta) {
  const viewNote = viewMeta?.targeting === 'geocode_heading'
    ? `Camera was aimed at the geocoded parcel (heading ${viewMeta.heading}°, narrow FOV). Center of frame = subject lot at: ${address}`
    : `Target parcel address: ${address}. Center of frame = subject lot.`;
  const flagNote = (viewMeta?.qualityFlags || []).length
    ? `\nPhoto quality flags (informational only — do NOT set needs_review for these alone): ${viewMeta.qualityFlags.map(f => QUALITY_FLAG_LABELS[f] || f).join('; ')}.\n`
    : '';
  const sat = viewMeta?.satellite;
  const satNote = sat
    ? `\nSATELLITE D4D aerial (red marker = subject lot):
- Structure: ${sat.category}, on_lot=${sat.structureOnLot}, confidence=${sat.confidence}%
- Roof from above: ${sat.roofCondition || 'unknown'} | Yard from above: ${sat.yardCondition || 'unknown'}
- Aerial distress estimate: ${sat.aerialDistressScore != null ? sat.aerialDistressScore + '/10' : 'n/a'}
- Aerial red flags: ${(sat.indicators || []).length ? sat.indicators.join(', ') : 'none seen'}
- "${sat.reason}"
Combine satellite roof/yard clues with Street View facade checks for final score.\n`
    : '';

  return `You are a Driving for Dollars (D4D) wholesaler screening ONE lot from STREET VIEW (drive-by facade check).

${viewNote}${satNote}${flagNote}

SUBJECT LOT ONLY — center of frame = property at: ${address}. Ignore neighbors across street and at far edges.

${buildD4DVacantLotRules()}

WORKFLOW:
STEP 1 — Lot type (before any distress score):
  property = you see a home/structure on subject lot → continue to Steps 2-3
  vacant_lot = open land, no house footprint (weeds/junk on bare lot ≠ home)
  unavailable = ONLY if you truly cannot tell vacant land vs home (rare)
  blurred = Google privacy blur or uniform blur — you cannot assess the home at all
  If you see a house clearly: category=property. Score distress. Set lead_tier distressed or well_maintained.

STEP 2 — Street-level indicators on SUBJECT home only:
boarded_windows, boarded_doors, code_violation_notice, structural_damage, fire_or_water_damage, overgrown_landscaping, roof_damage_or_tarp, peeling_paint, broken_windows, junk_or_hoarding_yard, damaged_driveway, broken_gutters, abandoned_vehicles, deferred_maintenance

${buildD4DIndicatorGuide()}
${buildD4DStreetScoringGuide()}

STEP 3 — Score 1-10 and lead_tier (use satellite clues above if provided):
${buildStaticTierRules()}
${buildCalibrationNote()}

TIER OUTPUT (mandatory when category=property):
  lead_tier "well_maintained" = score 1-5 — normal/manicured homes; minor cosmetic wear, light overgrowth, or code flags alone; single moderate flag without supporting neglect
  lead_tier "distressed" = score 6-10 — boarded/structural/fire-water, OR clear multi-signal neglect (junk+weeds, broken windows+overgrowth, abandoned car+junk, dump-house combos)
  lead_tier "vacant" = vacant_lot score 0
  lead_tier "unavailable" = cannot determine lot type
  lead_tier "blurred" = privacy/uniform blur — cannot assess home

If vacant_lot: score=0, indicators=[], lead_tier=vacant.
If unavailable: score=0, indicators=[], lead_tier=unavailable.
If blurred: score=0, indicators=[], lead_tier=blurred, structure_on_subject_lot=null.

EXAMPLES — distressed (score 6-10, lead_tier distressed):
  • Yard full of junk piles + weeds + peeling dirty exterior → score 7, indicators: junk_or_hoarding_yard, overgrown_landscaping, peeling_paint
  • Broken front window + overgrown yard + deferred maintenance → score 6, indicators: broken_windows, overgrown_landscaping, deferred_maintenance
  • Abandoned truck + trashed side yard with debris → score 7, indicators: abandoned_vehicles, junk_or_hoarding_yard
  • Boarded windows on facade → score 8, indicators: boarded_windows
EXAMPLES — well maintained (score 1-5, lead_tier well_maintained):
  • Mowed lawn, intact windows, clean siding, one tall-grass flag → score 2-3
  • Fair roof discoloration only, tidy yard, no junk → score 3-4
  • One broken side window on otherwise maintained occupied home, no junk/overgrowth → score 4, well_maintained
  • Single junk pile near garage but manicured front yard and clean facade → score 4-5, well_maintained (not dump house)

confidence: 0-100. needs_review: false unless lot type truly ambiguous.
REASON CONSISTENCY (mandatory): reason must match lead_tier / score band.
  • score 6-10 / lead_tier=distressed → name the visible neglect (indicators). NEVER write "well-maintained", "manicured", or "no signs of distress".
  • score 1-5 / lead_tier=well_maintained → describe maintained/occupied appearance. Do NOT claim dump-house, boarded, structural, or severe neglect.
Respond ONLY valid JSON. reason = one plain sentence (max 25 words).
{"score":<0-10>,"category":"property"|"vacant_lot"|"unavailable"|"blurred","structure_on_subject_lot":true|false|null,"lead_tier":"distressed"|"well_maintained"|"vacant"|"unavailable"|"blurred","confidence":<0-100>,"needs_review":false,"indicators":["boarded_windows",...],"reason":"<short plain sentence, no quotes>"}`;
}

R.QUALITY_FLAG_LABELS = {
  geocode_failed: 'Approximate address',
  approximate_aim: 'Wide-angle photo',
  partial_address_match: 'Partial address match',
  approximate_geocode: 'Non-rooftop geocode',
  camera_far_from_parcel: 'Camera far from lot',
  stale_streetview: 'Old Street View (4+ yrs)',
  no_streetview: 'No Street View — satellite-only'
};

R.INDICATOR_LABELS = {
  boarded_windows: 'Boarded windows',
  boarded_doors: 'Boarded doors',
  code_violation_notice: 'Code violation posted',
  structural_damage: 'Structural damage',
  fire_or_water_damage: 'Fire or water damage',
  overgrown_landscaping: 'Overgrown yard',
  roof_damage_or_tarp: 'Bad roof / tarp',
  peeling_paint: 'Peeling paint',
  broken_windows: 'Broken windows',
  junk_or_hoarding_yard: 'Junk in yard',
  damaged_driveway: 'Bad driveway',
  broken_gutters: 'Broken gutters',
  abandoned_vehicles: 'Abandoned vehicles',
  deferred_maintenance: 'General neglect'
};

R.CONDITION_LABELS = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Unknown'
};

R.WELL_MAINTAINED_MAX_SCORE = 5;
R.DISTRESSED_MIN_SCORE = 6;

R.HIGH_INDICATORS = new Set([
  'boarded_windows', 'boarded_doors',
  'structural_damage', 'fire_or_water_damage'
]);

R.CODE_ONLY_INDICATORS = new Set([
  'code_violation_notice', 'overgrown_landscaping', 'deferred_maintenance'
]);

R.COSMETIC_INDICATORS = new Set([
  'overgrown_landscaping', 'roof_damage_or_tarp', 'deferred_maintenance',
  'peeling_paint', 'broken_gutters', 'damaged_driveway'
]);

R.MODERATE_INDICATORS = new Set([
  'junk_or_hoarding_yard', 'broken_windows', 'abandoned_vehicles'
]);

R.STRONG_DISTRESS_INDICATORS = new Set([
  'boarded_windows', 'boarded_doors',
  'structural_damage', 'fire_or_water_damage',
  'roof_damage_or_tarp'
]);

R.NEGLECT_COMBO_INDICATORS = new Set([
  'overgrown_landscaping', 'deferred_maintenance', 'peeling_paint',
  'broken_gutters', 'damaged_driveway', 'code_violation_notice'
]);

R.WELL_MAINTAINED_SOFT_INDICATORS = new Set([
  'overgrown_landscaping', 'deferred_maintenance',
  'broken_gutters', 'damaged_driveway', 'code_violation_notice',
  'roof_damage_or_tarp', 'peeling_paint'
]);

R.WELL_MAINTAINED_HARD_BLOCKING_INDICATORS = new Set([
  ...HIGH_INDICATORS
]);

R.WELL_MAINTAINED_BLOCKING_INDICATORS = WELL_MAINTAINED_HARD_BLOCKING_INDICATORS;

R.hasModerateWithSupportingNeglect = function hasModerateWithSupportingNeglect(inds, reason = '') {
  const list = normalizeIndicators(inds);
  const hasJunk = list.includes('junk_or_hoarding_yard');
  const hasBroken = list.includes('broken_windows');
  const hasAbandoned = list.includes('abandoned_vehicles');
  const hasOvergrown = list.includes('overgrown_landscaping');
  const hasPeeling = list.includes('peeling_paint');
  const hasDeferred = list.includes('deferred_maintenance');
  const supportCosmetic = hasOvergrown || hasPeeling || hasDeferred
    || list.includes('broken_gutters') || list.includes('roof_damage_or_tarp');
  const neglectCount = countNeglectIndicators(list);

  if (hasJunk && (hasOvergrown || hasPeeling || hasDeferred || hasBroken || hasAbandoned || neglectCount >= 2)) return true;
  if (hasBroken && (hasOvergrown || hasPeeling || hasDeferred || hasJunk || hasAbandoned || supportCosmetic)) return true;
  if (hasAbandoned && (hasJunk || hasOvergrown || hasPeeling || hasDeferred || neglectCount >= 2)) return true;
  if (hasJunk && /debris pile|junk (scattered|everywhere)|hoarding|trashed (lot|yard)|dump (house|yard)|yard full of|scattered debris/i.test(reason)) return true;
  return false;
}

R.hasDistressBlockingIndicators = function hasDistressBlockingIndicators(inds, reason = '') {
  const list = normalizeIndicators(inds);
  if (list.some(i => HIGH_INDICATORS.has(i))) return true;
  if (hasModerateWithSupportingNeglect(list, reason)) return true;
  if (hasNeglectCombo(list, reason)) return true;
  return false;
}

R.US_STATE_ABBRS = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

R.US_STATE_NAME_TO_ABBR = Object.fromEntries(
  Object.entries(US_STATE_ABBRS).map(([abbr, name]) => [name.toLowerCase(), abbr])
);
for (const [abbr] of Object.entries(US_STATE_ABBRS)) {
  US_STATE_NAME_TO_ABBR[abbr.toLowerCase()] = abbr;
}

/** StateFace glyph map (MIT) — https://github.com/propublica/stateface */
R.US_STATE_ICON_GLYPHS = {
  AL: 'B', AK: 'A', AZ: 'D', AR: 'C', CA: 'E', CO: 'F', CT: 'G', DE: 'H', DC: 'y',
  FL: 'I', GA: 'J', HI: 'K', ID: 'M', IL: 'N', IN: 'O', IA: 'L', KS: 'P', KY: 'Q',
  LA: 'R', ME: 'U', MD: 'T', MA: 'S', MI: 'V', MN: 'W', MS: 'Y', MO: 'X', MT: 'Z',
  NE: 'c', NV: 'g', NH: 'd', NJ: 'e', NM: 'f', NY: 'h', NC: 'a', ND: 'b', OH: 'i',
  OK: 'j', OR: 'k', PA: 'l', RI: 'm', SC: 'n', SD: 'o', TN: 'p', TX: 'q', UT: 'r',
  VT: 't', VA: 's', WA: 'u', WV: 'w', WI: 'v', WY: 'x'
};

R.US_STATE_ICON_COLORS = {
  AL: '#9E1B32', AK: '#0F204B', AZ: '#AB0520', AR: '#BF0A30', CA: '#B71234',
  CO: '#002868', CT: '#0A3161', DE: '#C5A900', DC: '#7B1E3A', FL: '#F4911E',
  GA: '#BA0C2F', HI: '#C8102E', ID: '#003776', IL: '#13274F', IN: '#A5ACAF',
  IA: '#5D8AA8', KS: '#005EB8', KY: '#0033A0', LA: '#461D7C', ME: '#003F87',
  MD: '#9D2235', MA: '#00287D', MI: '#00274C', MN: '#5E1148', MS: '#BF0A30',
  MO: '#C8102E', MT: '#003087', NE: '#002F6C', NV: '#C5B783', NH: '#002F6C',
  NJ: '#CE1126', NM: '#CE1126', NY: '#002D72', NC: '#BF0A30', ND: '#002F6C',
  OH: '#BB0000', OK: '#007A33', OR: '#154734', PA: '#002D72', RI: '#002E62',
  SC: '#003366', SD: '#007A33', TN: '#CC0000', TX: '#002868', UT: '#002F6C',
  VT: '#003087', VA: '#00297A', WA: '#008457', WV: '#0A3161', WI: '#C8102E', WY: '#BF0A30'
};

R.STORAGE_KEY = 'distressAnalyzerSession';
R.SESSION_IDB_NAME = 'distressAnalyzerDB';
R.SESSION_IDB_STORE = 'session';
R.SESSION_SCHEMA_VERSION = 6;
R.BRAIN_CAPS = {
  learnedRules: 120,
  correctionEvents: 200,
  scoreCorrections: 50,
  tierCorrections: 80,
  categoryCorrections: 30
};
R.CORRECTIONS_KEY = 'distressAnalyzerCorrections';
R.CATEGORY_CORRECTIONS_KEY = 'distressAnalyzerCategoryCorrections';
R.TIER_CORRECTIONS_KEY = 'distressAnalyzerTierCorrections';
R.LEARNED_RULES_KEY = 'distressAnalyzerLearnedRules';
R.CORRECTION_EVENTS_KEY = 'distressAnalyzerCorrectionEvents';
R.GAUGE_CIRC = 251.2;
R.scoreCorrections = [];
R.tierCorrections = [];
R.categoryCorrections = [];
R.learnedRules = [];
R.correctionEvents = [];
R.correctionReviewQueue = Promise.resolve();

R.state = {
  records: [],
  results: [],
  running: false,
  aborted: false,
  processed: 0,
  /** Current-sheet scan progress (not total session history). */
  scanBatchTotal: 0,
  scanBatchDone: 0,
  scanBaselineResults: 0,
  succeeded: 0,
  skipped: 0,
  failStreetView: 0,
  failGemini: 0,
  haltAlertShown: false,
  serverStopAlertShown: false,
  satelliteWarnShown: false,
  rateLimitWarned: false,
  quotaHaltShown: false,
  apiFailStreak: 0,
  apiHaltReason: null,
  fileName: '',
  filter: 'all',
  leadTypeFilter: 'all',
  importLeadType: 'code_violation',
  viewMode: 'cards',
  selectedKey: null,
  pinnedKey: null,
  pinnedLiveAddress: null,
  scanLiveSnapshot: null,
  searchQuery: '',
  locationFilter: null,
  locationHubQuery: '',
  resultsWorkbenchOpen: false,
  pastMarketsOpen: false,
  importBatches: [],
  importDateFilter: [],
  sortMode: 'newest',
  setupCollapsed: false,
  scoreEditKey: null,
  scoreEditRecordKey: null,
  scoreEditSelectedTier: null,
  appView: 'dashboard',
  propertyModalOpen: false,
  agentSlots: [],
  bulkSelectMode: false,
  reviewMode: false,
  reviewFilter: 'all',
  reviewQueue: [],
  reviewIndex: 0,
  reviewUndoStack: [],
  reviewStats: { kept: 0, changed: 0, deferred: 0 },
  reviewProgressByFilter: {},
  reviewedKeysByFilter: { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [] },
  reviewActionsSinceCheckpoint: 0,
  lastReviewCheckpointAt: 0,
  totalReviewCheckpoints: 0,
  reviewTrainingGeminiMode: 'metadata',
  displayLimit: 80
};

R.DISPLAY_LIMIT_INITIAL = 80;
R.DISPLAY_LIMIT_STEP = 80;
R.ANALYZE_DISPLAY_LIMIT_INITIAL = 30;
R.ANALYZE_DISPLAY_LIMIT_STEP = 30;

R.getDisplayLimitInitial = function getDisplayLimitInitial() {
  return document.body.classList.contains('analyze-phuglee')
    ? ANALYZE_DISPLAY_LIMIT_INITIAL
    : DISPLAY_LIMIT_INITIAL;
};

R.getDisplayLimitStep = function getDisplayLimitStep() {
  return document.body.classList.contains('analyze-phuglee')
    ? ANALYZE_DISPLAY_LIMIT_STEP
    : DISPLAY_LIMIT_STEP;
};

R.resetDisplayLimit = function resetDisplayLimit() {
  state.displayLimit = getDisplayLimitInitial();
};
R.MAX_LIVE_DOM_CARDS = 60;
R.VIRTUAL_ROW_HEIGHT = 340;
R.VIRTUAL_CARD_MIN_WIDTH = 280;
R.VIRTUAL_CARD_GAP = 20;
R.VIRTUAL_OVERSCAN = 5;
R.VIRTUAL_MAX_DOM = 40;
R.VIRTUAL_SCROLL_THRESHOLD = 48;

R.shouldUseVirtualScroll = function shouldUseVirtualScroll(itemCount) {
  if (document.body.classList.contains('analyze-phuglee')) return false;
  const n = itemCount ?? (state.results?.length ?? 0);
  return n > VIRTUAL_SCROLL_THRESHOLD;
};
R.SESSION_PAGE_SIZE = 1000;
/** First network page for Analyze — keep small so cards appear before full hydrate. */
R.ANALYZE_SESSION_FIRST_PAGE = 40;

R.getSessionFirstPageSize = function getSessionFirstPageSize() {
  return document.body.classList.contains('analyze-phuglee')
    ? ANALYZE_SESSION_FIRST_PAGE
    : SESSION_PAGE_SIZE;
};

R.isAnalyzeLayout = function isAnalyzeLayout() {
  return document.body.classList.contains('analyze-phuglee');
};
R.FETCH_KEEPALIVE_MAX_BYTES = 64000;
R.SESSION_STUB_MAX_BYTES = 10 * 1024;

R.bulkSelectedKeys = new Set();

R.$ = (id) => document.getElementById(id);

R.streetViewKey = $('streetViewKey');
R.geminiKey = $('geminiKey');
R.concurrentLimitInput = $('concurrentLimit');
R.concurrentLimitVal = $('concurrentLimitVal');
R.fileInput = $('fileInput');
R.fileDrop = $('fileDrop');
R.fileInfo = $('fileInfo');
R.startBtn = $('startBtn');
R.stopBtn = $('stopBtn');
R.exportBtn = $('exportBtn'); // legacy hook (element removed)
R.resetUploadBtn = $('resetUploadBtn');
R.progressSection = $('progressSection');
R.progressBar = $('progressBar');
R.resultsBody = $('resultsBody');
R.cardsGrid = $('cardsGrid');
R.cardsVirtualSpacer = null;
R.cardsVirtualWindow = null;
R.virtualScroll = {
  scrollTop: 0,
  containerHeight: 600,
  mountedKeys: new Map(),
  rafPending: false,
  initialized: false
};
R.sessionLoadState = { complete: false, loading: false, loaded: 0, total: 0, serverCanonical: 0 };
R.sessionLoadGeneration = 0;

R.resetVirtualScrollDom = function resetVirtualScrollDom() {
  if (!virtualScroll.initialized) return;
  virtualScroll.initialized = false;
  virtualScroll.mountedKeys.clear();
  virtualScroll.scrollTop = 0;
  cardsVirtualSpacer = null;
  cardsVirtualWindow = null;
  cardsGrid?.classList.remove('cards-grid--virtual');
  if (cardsGrid) {
    cardsGrid.style.maxHeight = '';
    cardsGrid.style.overflowY = '';
  }
}

R.resetVirtualScrollPosition = function resetVirtualScrollPosition() {
  virtualScroll.scrollTop = 0;
  virtualScroll.mountedKeys.clear();
  if (cardsGrid) cardsGrid.scrollTop = 0;
}

R.getVirtualGridWidth = function getVirtualGridWidth() {
  return cardsGrid?.clientWidth || cardsVirtualWindow?.clientWidth || 1200;
}

R.getVirtualScrollMetrics = function getVirtualScrollMetrics() {
  const vs = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.virtualScroll) ? PDA.lib.virtualScroll : null;
  const width = getVirtualGridWidth();
  const opts = {
    rowHeight: VIRTUAL_ROW_HEIGHT,
    cardMinWidth: VIRTUAL_CARD_MIN_WIDTH,
    cardGap: VIRTUAL_CARD_GAP,
    overscanRows: VIRTUAL_OVERSCAN
  };
  if (vs) {
    return {
      vs,
      width,
      opts,
      cols: () => vs.getColumnCount(width, opts),
      slice: (total, scrollTop, viewH) => vs.getVisibleSlice(total, scrollTop, viewH, width, opts),
      spacerHeight: (total) => vs.getSpacerHeight(total, width, opts)
    };
  }
  const cols = Math.max(1, Math.floor((width + VIRTUAL_CARD_GAP) / (VIRTUAL_CARD_MIN_WIDTH + VIRTUAL_CARD_GAP)));
  return {
    vs: null,
    width,
    opts,
    cols: () => cols,
    slice: (total, scrollTop, viewH) => {
      const totalRows = total ? Math.ceil(total / cols) : 0;
      const firstRow = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
      const visibleRows = Math.ceil(viewH / VIRTUAL_ROW_HEIGHT) + (VIRTUAL_OVERSCAN * 2);
      const lastRow = Math.min(totalRows, firstRow + visibleRows);
      return {
        cols,
        totalRows,
        firstRow,
        startIndex: firstRow * cols,
        endIndex: Math.min(total, lastRow * cols),
        offsetY: firstRow * VIRTUAL_ROW_HEIGHT
      };
    },
    spacerHeight: (total) => (total ? Math.ceil(total / cols) : 0) * VIRTUAL_ROW_HEIGHT
  };
}

R.syncVirtualGridMaxHeight = function syncVirtualGridMaxHeight() {
  if (!cardsGrid || !virtualScroll.initialized) return;
  const analyzeLayout = document.body.classList.contains('analyze-phuglee');
  if (!analyzeLayout) {
    cardsGrid.style.maxHeight = 'calc(100vh - 220px)';
    return;
  }
  const top = cardsGrid.getBoundingClientRect().top;
  const bottomPad = document.body.classList.contains('has-status-bar') ? 40 : 24;
  const h = Math.max(360, window.innerHeight - top - bottomPad);
  cardsGrid.style.maxHeight = `${Math.round(h)}px`;
  cardsGrid.style.overflowY = 'auto';
};

R.initVirtualScroll = function initVirtualScroll() {
  if (!cardsGrid || virtualScroll.initialized) return;
  if (!shouldUseVirtualScroll()) return;
  const analyzeLayout = document.body.classList.contains('analyze-phuglee');
  cardsGrid.style.overflowY = analyzeLayout ? 'auto' : 'auto';
  if (!analyzeLayout) {
    cardsGrid.style.maxHeight = 'calc(100vh - 220px)';
  } else {
    syncVirtualGridMaxHeight();
  }
  cardsGrid.style.position = 'relative';
  cardsVirtualSpacer = document.createElement('div');
  cardsVirtualSpacer.id = 'cardsVirtualSpacer';
  cardsVirtualWindow = document.createElement('div');
  cardsVirtualWindow.id = 'cardsVirtualWindow';
  cardsVirtualWindow.style.cssText = 'position:absolute;top:0;left:0;right:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;';
  cardsGrid.replaceChildren(cardsVirtualSpacer, cardsVirtualWindow);
  cardsGrid.addEventListener('scroll', () => {
    virtualScroll.scrollTop = cardsGrid.scrollTop;
    if (!virtualScroll.rafPending) {
      virtualScroll.rafPending = true;
      requestAnimationFrame(() => {
        virtualScroll.rafPending = false;
        renderVirtualCards();
      });
    }
  }, { passive: true });
  if (!virtualScroll.resizeBound) {
    virtualScroll.resizeBound = true;
    window.addEventListener('resize', () => {
      if (!virtualScroll.initialized || state.viewMode !== 'cards') return;
      if (!virtualScroll.resizeRaf) {
        virtualScroll.resizeRaf = requestAnimationFrame(() => {
          virtualScroll.resizeRaf = null;
          syncVirtualGridMaxHeight();
          renderVirtualCards();
        });
      }
    }, { passive: true });
  }
  virtualScroll.initialized = true;
  cardsGrid.classList.add('cards-grid--virtual');
  if (typeof resetThumbObserver === 'function') resetThumbObserver();
}

R.updateVirtualSpacerHeight = function updateVirtualSpacerHeight(count) {
  if (!cardsVirtualSpacer) return;
  const metrics = getVirtualScrollMetrics();
  cardsVirtualSpacer.style.height = `${metrics.spacerHeight(count)}px`;
}

R.resultsLoadMore = $('resultsLoadMore');
R.resultsLoadMoreBtn = $('resultsLoadMoreBtn');
R.resultsLoadMoreHint = $('resultsLoadMoreHint');
R.summarySection = $('summarySection');
R.dashboard = $('dashboard');
R.locationHub = $('locationHub');
R.locationHubSearch = $('locationHubSearch');
R.locationHubList = $('locationHubList');
R.locationHubEmpty = $('locationHubEmpty');
R.locationBreadcrumb = $('locationBreadcrumb');
R.locationBreadcrumbLabel = $('locationBreadcrumbLabel');
R.locationBreadcrumbChange = $('locationBreadcrumbChange');
R.scanReadySection = $('scanReadySection');
R.scanReadyLocation = $('scanReadyLocation');
R.scanReadyCount = $('scanReadyCount');
R.scanReadyStartBtn = $('scanReadyStartBtn');
R.reviewLeadsBtn = $('reviewLeadsBtn');
R.reviewLeadsMenu = $('reviewLeadsMenu');
R.reviewLeadsWrap = $('reviewLeadsWrap');
R.liveScanSection = $('liveScanSection');
R.liveScanFeed = $('liveScanFeed');
R.liveScanProgress = $('liveScanProgress');
R.liveScanProgressFill = $('liveScanProgressFill');
R.historicalStateSelect = $('historicalStateSelect');
R.historicalCitySelect = $('historicalCitySelect');
R.uploadDateFilter = $('uploadDateFilter');
R.uploadDateChips = $('uploadDateChips');
R.localKpiSection = $('localKpiSection');
R.localDistressed = $('localDistressed');
R.localReview = $('localReview');
R.localTotal = $('localTotal');
R.localKpiTitle = $('localKpiTitle');
R.resultsExportCsvBtn = $('resultsExportCsvBtn');
R.resultsExportExcelBtn = $('resultsExportExcelBtn');
R.resultsWrap = $('resultsWrap');
R.previewImg = $('previewImg');
R.previewSatImg = $('previewSatImg');
R.previewSatWrap = $('previewSatWrap');
R.previewImages = $('previewImages');
R.previewPaneLabel = $('previewPaneLabel');
R.previewMainReticle = $('previewMainReticle');
R.previewPlaceholder = $('previewPlaceholder');
R.previewWrap = $('previewWrap');
R.scanFeedPanel = $('scanFeedPanel');
R.scanFeedImages = $('scanFeedImages');
R.scanFeedImg = $('scanFeedImg');
R.scanFeedSatImg = $('scanFeedSatImg');
R.scanFeedSatWrap = $('scanFeedSatWrap');
R.scanFeedWrap = $('scanFeedWrap');
R.scanFeedPaneLabel = $('scanFeedPaneLabel');
R.scanFeedMainReticle = $('scanFeedMainReticle');
R.scanFeedPlaceholder = $('scanFeedPlaceholder');
R.scanFeedPinHint = $('scanFeedPinHint');
R.scanFeedStatus = $('scanFeedStatus');
R.scanFeedAddress = $('scanFeedAddress');
R.scanLiveDot = $('scanLiveDot');
R.scanRecBadge = $('scanRecBadge');
R.scanGaugeFill = $('scanGaugeFill');
R.scanGaugeNum = $('scanGaugeNum');
R.propertyModal = $('propertyModal');
R.propertyModalBackdrop = $('propertyModalBackdrop');
R.closePropertyBtn = $('closePropertyBtn');
R.scoreEditModal = $('scoreEditModal');
R.scoreEditBackdrop = $('scoreEditBackdrop');
R.scoreEditClose = $('scoreEditClose');
R.scoreEditCancel = $('scoreEditCancel');
R.scoreEditSave = $('scoreEditSave');
R.learnedRulesList = $('learnedRulesList');
R.learnedRulesSub = $('learnedRulesSub');
R.scoreEditAddress = $('scoreEditAddress');
R.scoreEditTierPicker = $('scoreEditTierPicker');
R.scoreEditAiNote = $('scoreEditAiNote');
R.bulkSelectToggleBtn = $('bulkSelectToggleBtn');
R.bulkEditBar = $('bulkEditBar');
R.bulkEditCount = $('bulkEditCount');
R.bulkEditHint = $('bulkEditHint');

R.imageLightbox = $('imageLightbox');
R.lightboxImg = $('lightboxImg');
R.lightboxLabel = $('lightboxLabel');
R.lightboxClose = $('lightboxClose');
R.lightboxBackdrop = $('lightboxBackdrop');
R.reviewModeOverlay = $('reviewModeOverlay');
R.reviewProgress = $('reviewProgress');
R.reviewFilterTag = $('reviewFilterTag');
R.reviewStatsEl = $('reviewStatsEl');
R.reviewCheckpointEl = $('reviewCheckpointEl');
R.reviewExitBtn = $('reviewExitBtn');
R.reviewBody = $('reviewBody');
R.reviewImages = $('reviewImages');
R.reviewSatWrap = $('reviewSatWrap');
R.reviewSatImg = $('reviewSatImg');
R.reviewSvWrap = $('reviewSvWrap');
R.reviewSvImg = $('reviewSvImg');
R.reviewPlaceholder = $('reviewPlaceholder');
R.reviewPaneLabel = $('reviewPaneLabel');
R.reviewMetaName = $('reviewMetaName');
R.reviewMetaStreet = $('reviewMetaStreet');
R.reviewMetaBadges = $('reviewMetaBadges');
R.reviewMetaAnalysis = $('reviewMetaAnalysis');
R.reviewCompletePanel = $('reviewCompletePanel');
R.reviewCompleteText = $('reviewCompleteText');
R.reviewModeInner = $('reviewModeInner');
R.reviewModeBadge = $('reviewModeBadge');
R.reviewShortcutsBar = $('reviewShortcutsBar');
R.reviewShortcutChips = $('reviewShortcutChips');
R.reviewActionBar = $('reviewActionBar');
R.reviewKeepBtn = $('reviewKeepBtn');
R.reviewChangeBtn = $('reviewChangeBtn');
R.reviewDeferBtn = $('reviewDeferBtn');
R.reviewLandBtn = $('reviewLandBtn');
R.reviewUndoBtn = $('reviewUndoBtn');
R.reviewCompleteExitBtn = $('reviewCompleteExitBtn');
R.sidebarReviewGroup = $('sidebarReviewGroup');
R.sidebarReviewToggle = $('sidebarReviewToggle');
R.sidebarReviewDistressedBtn = $('sidebarReviewDistressedBtn');
R.sidebarReviewWellMaintainedBtn = $('sidebarReviewWellMaintainedBtn');
R.sidebarReviewLandBtn = $('sidebarReviewLandBtn');
R.sidebarReviewNeedsReviewBtn = $('sidebarReviewNeedsReviewBtn');
R.reviewBlurredBtn = $('reviewBlurredBtn');
R.reviewSatelliteOnlyBtn = $('reviewSatelliteOnlyBtn');
R.reviewTierPickOverlay = $('reviewTierPickOverlay');
R.reviewTierPickCancel = $('reviewTierPickCancel');
R.REVIEW_ENTRY_BTNS = [
  sidebarReviewDistressedBtn,
  sidebarReviewWellMaintainedBtn,
  sidebarReviewLandBtn,
  sidebarReviewNeedsReviewBtn
];
R.REVIEW_MODE_FILTERS = ['distressed', 'well_maintained', 'vacant', 'blurred', 'review', 'satellite_only'];
R.reviewTierPickResolver = null;
R.inspectorBody = $('inspectorBody');
R.inspectorPos = $('inspectorPos');
R.prevPropBtn = $('prevPropBtn');
R.nextPropBtn = $('nextPropBtn');
R.resultSearch = $('resultSearch');
R.setupZone = $('setupZone');
R.uploadCollapsedBar = $('uploadCollapsedBar');
R.uploadCollapsedBtn = $('uploadCollapsedBtn');
R.heroCount = null;
R.sidebarTitle = $('sidebarTitle');
R.sidebarTagline = $('sidebarTagline');
R.scanProgressTitle = $('scanProgressTitle');
R.mainWorkspace = $('mainWorkspace');
R.settingsModal = $('settingsModal');
R.settingsModalBackdrop = $('settingsModalBackdrop');
R.settingsModalClose = $('settingsModalClose');
R.openSettingsBtn = $('openSettingsBtn');
R.uploadModal = $('uploadModal');
R.uploadModalBackdrop = $('uploadModalBackdrop');
R.uploadModalClose = $('uploadModalClose');
R.openUploadModalBtn = $('openUploadModalBtn');

R.brainModal = $('brainModal');
R.brainModalBackdrop = $('brainModalBackdrop');
R.brainModalClose = $('brainModalClose');
R.openBrainBtn = $('openBrainBtn');
R.openToolModalId = null;
R.browseFileLabel = $('browseFileLabel');
R.sidebarSettingsGroup = $('sidebarSettingsGroup');
R.sidebarSettingsToggle = $('sidebarSettingsToggle');
R.sidebarManageDataGroup = $('sidebarManageDataGroup');
R.sidebarManageDataToggle = $('sidebarManageDataToggle');
R.sidebarExportHint = $('sidebarExportHint');
R.sidebarExportExcelBtn = $('sidebarExportExcelBtn');
R.sidebarExportCsvBtn = $('sidebarExportCsvBtn');
R.sidebarExportAllBtn = $('sidebarExportAllBtn');
R.sidebarLoadBackupBtn = $('sidebarLoadBackupBtn');
R.sidebarSaveBackupBtn = $('sidebarSaveBackupBtn');
R.sidebarSettingsSaveBackupBtn = $('sidebarSettingsSaveBackupBtn');
R.sidebarSettingsBackupHint = $('sidebarSettingsBackupHint');
R.EXPORT_MENU_BTNS = [
  sidebarExportExcelBtn,
  sidebarExportCsvBtn,
  sidebarExportAllBtn,
  resultsExportCsvBtn,
  resultsExportExcelBtn
];

R.appNav = $('appNav');
R.navContext = $('navContext');
R.navSetup = $('navSetup');
R.navDashboard = $('navDashboard');
R.navScan = $('navScan');
R.previewHeaderTitle = $('previewHeaderTitle');
R.liveDot = $('liveDot');

R.logPanel = $('logPanel');
R.gaugeFill = $('gaugeFill');
R.gaugeNum = $('gaugeNum');
R.propertyModalTierPill = $('propertyModalTierPill');
R.propertyDistressScale = $('propertyDistressScale');
R.inspectorGaugePanel = $('inspectorGaugePanel');
R.profileActionStrip = $('profileActionStrip');
R.profileCopyPhoneBtn = $('profileCopyPhoneBtn');
R.profileCopyEmailBtn = $('profileCopyEmailBtn');
R.profileGoogleLink = $('profileGoogleLink');
R.profileChangeLevelBtn = $('profileChangeLevelBtn');
R.profileSatelliteBtn = $('profileSatelliteBtn');
R.profileSectionNav = $('profileSectionNav');
R.profileDossierScroll = $('profileDossierScroll');

R.recBadge = $('recBadge');

R.liveTierAlertStack = $('liveTierAlertStack');
R.TIER_ALERT_LIFETIME_MS = 4000;
R.MAX_TIER_ALERT_STACK = 1;
R.hudClock = $('hudClock');
R.testSvBtn = $('testSvBtn');
R.testSvResult = $('testSvResult');
R.errorBanner = $('errorBanner');
R.scanIssueAlert = $('scanIssueAlert');
R.scanIssueTitle = $('scanIssueTitle');
R.scanIssueDetail = $('scanIssueDetail');
R.scanIssueMeta = $('scanIssueMeta');
R.scanIssueDismiss = $('scanIssueDismiss');
R.scanIssueNotifyBtn = $('scanIssueNotifyBtn');
R.diagStreetView = $('diagStreetView');
R.diagSatellite = $('diagSatellite');
R.diagGemini = $('diagGemini');
R.diagFull = $('diagFull');
R.firstErrorShown = false;

R.SCAN_NOTIFY_KEY = 'distressAnalyzerNotify';
R.scanIssueState = { lastKind: '', lastTitle: '', lastMessage: '', lastTier: 'warn' };
R.scanIssueDismissed = false;
R.rateLimitTicker = null;
R.serverStatusPoll = null;
R.workerActivityPoll = null;
R.alwaysOnSafetyPoll = null;
R.lastPayloadBytes = 0;
R.serverOnline = null;
R.lastServerApiStatus = null;
R.serverOfflineStreak = 0;
R.scanIssueHudWasPaused = false;
R.scanIssueNotifiedKeys = new Set();

R.scanNotifyEnabled = function scanNotifyEnabled() {
  return localStorage.getItem(SCAN_NOTIFY_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted';
}

R.updateScanNotifyBtn = function updateScanNotifyBtn() {
  const btn = $('scanIssueNotifyBtn');
  if (!btn) return;
  const on = scanNotifyEnabled();
  btn.textContent = on ? 'Alerts on' : 'Notify me';
  btn.classList.toggle('enabled', on);
  btn.title = on
    ? 'Desktop alerts enabled for rate limits and failures'
    : 'Get desktop alerts when rate limits or failures occur';
}

R.ensureNotificationPermission = async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Desktop notifications are not supported in this browser.');
    return false;
  }
  if (Notification.permission === 'granted') {
    localStorage.setItem(SCAN_NOTIFY_KEY, '1');
    updateScanNotifyBtn();
    return true;
  }
  if (Notification.permission === 'denied') {
    alert('Notifications are blocked. Enable them in your browser site settings, then click Notify me again.');
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.setItem(SCAN_NOTIFY_KEY, '1');
    updateScanNotifyBtn();
    return true;
  }
  return false;
}

R.maybeBrowserNotify = function maybeBrowserNotify(title, body, dedupeKey) {
  if (!scanNotifyEnabled()) return;
  const key = dedupeKey || `${title}|${String(body || '').slice(0, 96)}`;
  if (scanIssueNotifiedKeys.has(key)) return;
  scanIssueNotifiedKeys.add(key);
  try {
    new Notification(title, { body: String(body || '').slice(0, 220), tag: 'distress-scan-issue' });
  } catch (_) { /* ignore */ }
}

R.formatPauseRemaining = function formatPauseRemaining(until) {
  const sec = Math.ceil((until - Date.now()) / 1000);
  return sec > 0 ? `${sec}s` : '';
}

R.stopWorkerActivityPolling = function stopWorkerActivityPolling() {
  if (workerActivityPoll) {
    clearInterval(workerActivityPoll);
    workerActivityPoll = null;
  }
}

R.startWorkerActivityPolling = function startWorkerActivityPolling() {
  stopWorkerActivityPolling();
  updateWorkerActivityUi(lastServerApiStatus);
  workerActivityPoll = setInterval(() => {
    if (state.running) updateWorkerActivityUi(lastServerApiStatus);
    else stopWorkerActivityPolling();
  }, 1000);
}

R.stopServerStatusPolling = function stopServerStatusPolling() {
  if (serverStatusPoll) {
    clearInterval(serverStatusPoll);
    serverStatusPoll = null;
  }
  stopWorkerActivityPolling();
}

R.isRawFetchTransportError = function isRawFetchTransportError(msg) {
  const m = String(msg || '').toLowerCase().trim();
  // Exact browser/Node fetch failures
  if (/^(typeerror: )?failed to fetch\.?$/.test(m) || /^fetch failed\.?$/.test(m)) return true;
  // Contained in wrappers: "Street View request failed (Failed to fetch)…"
  if (/\bfailed to fetch\b/.test(m) || /\bfetch failed\b/.test(m)) return true;
  return /networkerror|network error|connection refused|err_connection_refused|net::err_connection_refused|err_network|err_internet_disconnected|err_connection_reset|err_connection_timed_out|econnreset|socket hang up/.test(m);
}

/**
 * Proxy/deploy infra blips (Railway restart, 502 HTML body, etc.) — never Needs Review.
 */
R.isProxyInfraError = function isProxyInfraError(msg) {
  const m = String(msg || '').toLowerCase();
  if (!m) return false;
  if (isHardQuotaError?.(m)) return false;
  return /502|503|504|bad gateway|gateway time-?out|application failed to respond|upstream|cloudflare|<\/?html|unexpected token\s*[<'"]|is not valid json|malformed json|service unavailable/.test(m);
}

/**
 * Brief browser↔proxy blip under high concurrency — retry/defer, never Needs Review.
 * Matches raw Failed to fetch, deploy/proxy HTML errors, and wrapped imagery/Gemini fetch failures.
 */
R.isTransportBlipError = function isTransportBlipError(msg) {
  const m = String(msg || '');
  if (!m) return false;
  if (isHardQuotaError?.(m)) return false;
  if (isRawFetchTransportError(m)) return true;
  if (typeof isProxyInfraError === 'function' ? isProxyInfraError(m) : false) return true;
  return /(street view|satellite|imagery|gemini)\s+request failed/i.test(m)
    && /failed to fetch|fetch failed|network|timed out|timeout|econnreset|socket hang up|connection|502|503|504|bad gateway|unexpected token/i.test(m);
}

R.isServerConnectionError = function isServerConnectionError(msg) {
  const m = String(msg || '').toLowerCase();
  if (/open via start-server|run start-server\.bat first/i.test(m)) return !USE_PROXY;
  if (/failed to fetch imagery from local server/i.test(m)) return isRawFetchTransportError(m);
  return isRawFetchTransportError(msg);
}

R.pingServerStatus = async function pingServerStatus() {
  if (!USE_PROXY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // Must use apiFetch so /analyzer prefix + session cookies apply on Railway.
    // Bare fetch('/api/status') hits the shell (404) and Start Scan never begins.
    const res = typeof apiFetch === 'function'
      ? await apiFetch('/api/status', { cache: 'no-store', signal: ctrl.signal })
      : await fetch(resolveModuleApiUrl('/api/status'), {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: ctrl.signal
      });
    if (!res.ok) return null;
    const st = await res.json().catch(() => null);
    return st?.ok ? st : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

R.waitForServerReady = async function waitForServerReady({ attempts = 10, delayMs = 1500 } = {}) {
  // Embedded Railway can cold-start — give it real backoff (was 4×500ms and aborted Start).
  const tries = R.IS_EMBEDDED ? Math.max(attempts, 12) : attempts;
  const delay = R.IS_EMBEDDED ? Math.max(delayMs, 1000) : delayMs;
  for (let i = 0; i < tries; i++) {
    const st = await pingServerStatus();
    if (st) return st;
    if (i < tries - 1) await sleep(delay);
  }
  return null;
}

R.clearServerOfflineFatalBanner = function clearServerOfflineFatalBanner() {
  const text = errorBanner?.textContent || '';
  if (/local server is not running|server not running/i.test(text)) {
    errorBanner.classList.remove('visible');
    errorBanner.innerHTML = '';
  }
}

R.updateServerOfflineBanner = function updateServerOfflineBanner() {
  if (!USE_PROXY) return;
  if (serverOnline === false && !state.running) {
    updateStartButton();
  } else if (serverOnline === true) {
    clearServerOfflineFatalBanner();
    updateStartButton();
  }
}

R.fetchServerSafetyStatus = async function fetchServerSafetyStatus() {
  if (!USE_PROXY) return null;
  try {
    const res = typeof apiFetch === 'function'
      ? await apiFetch('/api/safety-status', { cache: 'no-store' })
      : await fetch(resolveModuleApiUrl('/api/safety-status'), {
        cache: 'no-store',
        credentials: 'same-origin'
      });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data : null;
  } catch (_) {
    return null;
  }
}

R.updateServerSafetyIndicator = function updateServerSafetyIndicator(safety) {
  const el = $('backupSizeIndicator');
  if (!el || !safety) return;
  const localPart = lastPayloadBytes
    ? `Local: ${DistressPersistence?.formatBytes?.(lastPayloadBytes) || Math.round(lastPayloadBytes / 1024) + ' KB'}`
    : '';
  const serverTs = safety.lastAutoSnapshotAt || safety.lastPromoteAt || safety.latestSavedAt;
  const ago = serverTs ? Math.max(0, Math.round((Date.now() - serverTs) / 1000)) : null;
  const agoLabel = ago == null ? '—' : (ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`);
  const milestoneCount = safety.milestoneBackupCount || 0;
  const manualCount = safety.manualBackupCount || 0;
  const serverPart = `Server: ${(safety.latestResults || 0).toLocaleString()} saved · ${agoLabel} · ${milestoneCount} milestones · ${manualCount} manual`;
  el.hidden = false;
  el.textContent = localPart ? `${localPart} · ${serverPart}` : serverPart;
  el.title = `Disk backups: milestones (review edits) in backups/milestones/, ephemeral rolling in backups/auto/. Mirror: MIRROR_LATEST.json`;
}

R.refreshServerStatusUi = async function refreshServerStatusUi() {
  if (!USE_PROXY) return null;
  const st = await pingServerStatus();
  if (st) {
    serverOfflineStreak = 0;
    serverOnline = true;
    updateServerOfflineBanner();
    fetchServerSafetyStatus().then(updateServerSafetyIndicator);
    const hardMsg = st.lastHardQuota?.message || '';
    // Sticky ledger flag is UI-only. Never abort a running scan from it — that raced
    // with clear-quota and killed Start Scan immediately after click (looked "stuck").
    // Live hard-quota stops still come from Gemini/Maps response hardQuota flags.
    const serverHardQuota = !!st.hardQuotaActive || (!!hardMsg && isHardQuotaError(hardMsg));
    if (serverHardQuota) {
      if (diagGemini) setDiag(diagGemini, 'fail', 'Gemini: ⚠ prior quota flag (scan still runs — clear if credits remain)');
      if (diagFull) setDiag(diagFull, 'warn', 'Full pipeline: prior quota flag set — Start Scan clears it');
    } else if (st.gemini?.rateLimited) {
      // Only throttle when the Gemini queue is actually backed up — recent429 alone
      // stays true for 2 minutes and was hammering scale-down every poll.
      const gemWaiting = Number(st.gemini.waiting) || 0;
      const gemActive = Number(st.gemini.active) || 0;
      const gemMax = Number(st.gemini.maxConcurrent) || 8;
      const pressure = gemWaiting >= 2 || (gemActive >= gemMax && (Number(st.gemini.recent429) || 0) >= 5);
      if (state.running && pressure) {
        scaleDownWorkers?.('Gemini queue pressure (server)', { hard: false });
      }
      const eff = getEffectiveConcurrentLimit();
      const msg = `${st.gemini.recent429} Gemini rate limits in the last 2 min` +
        ` (${st.gemini.active}/${st.gemini.maxConcurrent} active, ${st.gemini.waiting} queued).` +
        ` Workers at ${eff}; scan keeps rolling — soft limits do not stop the run.`;
      notifyScanIssue('rate_limit', msg, {
        title: state.running ? `Gemini busy — ${eff} workers` : 'Gemini rate limited — wait before bulk scan',
        dedupeKey: `srv-429-${st.gemini.recent429}`,
        browserNotify: !state.running
      });
      if (diagGemini && !state.running) {
        setDiag(diagGemini, 'warn', `Gemini: ⚠ RATE LIMITED (${st.gemini.recent429} recent 429s)`);
      }
      if (diagFull && /ALL WORKING/i.test(diagFull.textContent || '')) {
        setDiag(diagFull, 'warn', 'Full pipeline: ⚠ Gemini rate limited right now — wait before scanning');
      }
    }
    lastServerApiStatus = st;
    if (st.usage) updateApiUsageUi(st.usage);
    else fetchApiUsage();
    updateWorkerActivityUi(st);
    return st;
  }
  serverOfflineStreak++;
  if (serverOfflineStreak >= 2) {
    serverOnline = false;
    updateServerOfflineBanner();
  }
  return null;
}

R.startServerStatusPolling = function startServerStatusPolling() {
  stopServerStatusPolling();
  refreshServerStatusUi();
  serverStatusPoll = setInterval(refreshServerStatusUi, 5000);
  startWorkerActivityPolling();
}

R.startAlwaysOnSafetyPolling = function startAlwaysOnSafetyPolling() {
  if (!USE_PROXY) return;
  fetchServerSafetyStatus().then(updateServerSafetyIndicator);
  if (!alwaysOnSafetyPoll) {
    alwaysOnSafetyPoll = setInterval(() => {
      fetchServerSafetyStatus().then(updateServerSafetyIndicator);
    }, 15000);
  }
}

R.resetScanIssueState = function resetScanIssueState() {
  scanIssueDismissed = false;
  scanIssueNotifiedKeys.clear();
  scanIssueHudWasPaused = false;
  scanIssueState.lastKind = '';
  scanIssueState.lastTitle = '';
  scanIssueState.lastMessage = '';
  scanIssueState.lastTier = 'warn';
  stopServerStatusPolling();
  if (rateLimitTicker) {
    clearInterval(rateLimitTicker);
    rateLimitTicker = null;
  }
  if (scanIssueAlert) {
    scanIssueAlert.classList.remove('visible');
    scanIssueAlert.hidden = true;
    scanIssueAlert.dataset.tier = '';
  }
  updateScanNotifyBtn();
}

R.startRateLimitTicker = function startRateLimitTicker() {
  if (rateLimitTicker) return;
  rateLimitTicker = setInterval(() => {
    if (!state.running && Date.now() >= rateLimitUntil) {
      clearInterval(rateLimitTicker);
      rateLimitTicker = null;
      if (scanIssueHudWasPaused) {
        scanIssueHudWasPaused = false;
        setHudStatus('STANDBY');
      }
      updateScanIssuePanel();
      return;
    }
    updateScanIssuePanel();
    if (state.running) updateWorkerActivityUi(lastServerApiStatus);
  }, 450);
}

R.updateScanIssuePanel = function updateScanIssuePanel() {
  if (!scanIssueAlert) return;

  const rateLimited = Date.now() < rateLimitUntil;
  const failSv = state.failStreetView || 0;
  const failGem = state.failGemini || 0;
  const throttled = adaptiveConcurrentCap != null && adaptiveConcurrentCap < getConcurrentLimit();
  const fatal = !!state.haltAlertShown;
  const hasIssues = rateLimited || failSv || failGem || throttled || fatal || (state.running && scanIssueState.lastKind);

  if (scanIssueDismissed && !rateLimited && !fatal) {
    scanIssueAlert.classList.remove('visible');
    scanIssueAlert.hidden = true;
    return;
  }

  if (!hasIssues) {
    scanIssueAlert.classList.remove('visible');
    scanIssueAlert.hidden = true;
    if (scanIssueHudWasPaused && state.running) {
      scanIssueHudWasPaused = false;
      setHudStatus('ACTIVE', true);
    }
    return;
  }

  let tier = 'warn';
  let title = 'Scan issue';
  let detail = '';

  if (fatal) {
    tier = 'error';
    title = 'Scan stopped';
    detail = scanIssueState.lastMessage || 'A fatal API error stopped the scan.';
  } else if (rateLimited) {
    tier = 'warn';
    title = `Rate limited — paused ${formatPauseRemaining(rateLimitUntil)}`;
    detail = 'Google/Gemini is busy (429 or 503). All workers wait, then retry automatically.';
    if (state.running) {
      scanIssueHudWasPaused = true;
      setHudStatus(`PAUSED ${formatPauseRemaining(rateLimitUntil)}`, true);
    }
  } else if (throttled) {
    tier = 'warn';
    title = `Slowed to ${getEffectiveConcurrentLimit()} workers`;
    detail = 'API or imagery pressure — workers auto-lowered. Scan keeps going; speed climbs back after clean batches.';
  } else if (failSv || failGem) {
    tier = 'warn';
    title = 'Some properties need review';
    detail = scanIssueState.lastMessage || 'Transient errors exhausted retries — flagged Needs Review, scan continues.';
  } else if (scanIssueState.lastMessage) {
    detail = scanIssueState.lastMessage;
    title = scanIssueState.lastTitle || title;
    tier = scanIssueState.lastTier || 'info';
  }

  scanIssueAlert.dataset.tier = tier;
  scanIssueTitle.textContent = title;
  scanIssueDetail.textContent = detail;

  const chips = [];
  if (failSv) chips.push(`<span class="fail-chip sv">${failSv} SV fail</span>`);
  if (failGem) chips.push(`<span class="fail-chip gem">${failGem} Gemini fail</span>`);
  if (state.running) {
    const bt = Number(state.scanBatchTotal) || 0;
    const bd = Number(state.scanBatchDone) || 0;
    chips.push(bt > 0
      ? `<span>${bd}/${bt} this list</span>`
      : `<span>${(state.results || []).length} saved</span>`);
  }
  const notifyHtml = `<button type="button" class="scan-issue-notify-btn${scanNotifyEnabled() ? ' enabled' : ''}" id="scanIssueNotifyBtn">${scanNotifyEnabled() ? 'Alerts on' : 'Notify me'}</button>`;
  scanIssueMeta.innerHTML = chips.join('') + notifyHtml;
  $('scanIssueNotifyBtn')?.addEventListener('click', () => ensureNotificationPermission());

  scanIssueAlert.hidden = false;
  scanIssueAlert.classList.add('visible');
}

R.notifyScanIssue = function notifyScanIssue(kind, message, opts = {}) {
  const titleMap = {
    rate_limit: 'Rate limit — workers paused',
    retry: 'Retrying after busy response',
    failure: 'Property needs review',
    throttle: 'Workers throttled',
    fatal: 'Scan stopped',
    complete_issues: 'Scan finished with issues',
    warning: 'Scan warning'
  };

  scanIssueState.lastKind = kind;
  scanIssueState.lastTitle = opts.title || titleMap[kind] || 'Scan issue';
  scanIssueState.lastMessage = message || '';
  scanIssueState.lastTier = opts.tier || (kind === 'fatal' ? 'error' : 'warn');

  if (kind !== 'retry') scanIssueDismissed = false;

  if (kind === 'rate_limit') startRateLimitTicker();

  updateScanIssuePanel();

  if (opts.browserNotify !== false) {
    const notifyTitle = scanIssueState.lastTitle;
    const notifyBody = message || '';
    const dedupe = opts.dedupeKey || kind;
    maybeBrowserNotify(notifyTitle, notifyBody, dedupe);
  }
}

scanIssueDismiss?.addEventListener('click', () => {
  if (Date.now() < rateLimitUntil || state.haltAlertShown) return;
  scanIssueDismissed = true;
  updateScanIssuePanel();
});

scanIssueNotifyBtn?.addEventListener('click', () => ensureNotificationPermission());
updateScanNotifyBtn();

R.setDiag = function setDiag(el, status, msg) {
  el.className = status === 'ok' ? 'diag-ok' : status === 'fail' ? 'diag-fail' : status === 'warn' ? 'diag-warn' : 'diag-pending';
  el.textContent = msg;
}

R.categorizeError = function categorizeError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('gemini') || m.includes('quota') || m.includes('exceeded') || m.includes('429') || m.includes('resource_exhausted')) return 'gemini';
  if (m.includes('street view') || m.includes('no street view') || m.includes('request_denied') || m.includes('imagery') || m.includes('metadata') || m.includes('403') && !m.includes('gemini')) return 'streetview';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('timed out') || m.includes('timeout') || m.includes('satellite')) return 'fetch';
  return 'unknown';
}

R.updateFailStats = function updateFailStats() {
  const sv = $('failSvCount');
  const gem = $('failGemCount');
  if (sv) sv.textContent = state.failStreetView;
  if (gem) gem.textContent = state.failGemini;
  if (state.failStreetView || state.failGemini) {
    $('failStats')?.classList.add('visible');
  }
}

R.isFatalError = function isFatalError() {
  return false;
}

R.rateLimitUntil = 0;
R.adaptiveConcurrentCap = null;
/** Consecutive healthy batches while auto-throttled — used to scale workers back up. */
R.adaptiveHealthyStreak = 0;
R.lastScaleDownAt = 0;

R.syncResultCounters = function syncResultCounters() {
  state.succeeded = state.results.length;
  state.skipped = 0;
}

R.countSuccessfulResults = function countSuccessfulResults() {
  return state.results.filter(r => !computeNeedsReview(r)).length;
}

R.countFailedResults = function countFailedResults() {
  return state.results.filter(r => {
    if (computeNeedsReview(r)) return true;
    if (r.fetchFailed) return true;
    const cat = String(r.category || '').toLowerCase();
    return cat === 'unavailable' || cat === 'fetch_failed';
  }).length;
}

/** Transient 429/503 / transport blips — defer/retry, do not treat as batch pressure or scan halt. */
R.isDeferrableRateLimitError = function isDeferrableRateLimitError(msg) {
  const m = String(msg || '');
  if (isHardQuotaError(m)) return false;
  if (typeof isTransportBlipError === 'function' && isTransportBlipError(m)) return true;
  return isTransientError(m);
};

/** Failures that should trigger worker step-down (excludes Gemini busy / rate limit). */
R.resultCountsAsBatchPressureFailure = function resultCountsAsBatchPressureFailure(r) {
  if (!r) return false;
  if (r.errorType === 'transient') return false;
  const reason = String(r.reason || r.error || '');
  if (/503|rate limit|overloaded|high demand|\b429\b|resource_exhausted|timeout|temporarily unavailable|try again/i.test(reason)) {
    return false;
  }
  if (computeNeedsReview(r)) return true;
  if (r.fetchFailed) return true;
  const cat = String(r.category || '').toLowerCase();
  return cat === 'unavailable' || cat === 'fetch_failed';
};

R.countBatchPressureFailuresInSlice = function countBatchPressureFailuresInSlice(resultsSlice) {
  return (resultsSlice || []).filter(resultCountsAsBatchPressureFailure).length;
};

R.clampWorkerCount = function clampWorkerCount(n) {
  const min = Number(MIN_CONCURRENT_LIMIT) || 5;
  const max = Number(MAX_SAFE_CONCURRENT) || 10;
  const v = Math.round(Number(n) || DEFAULT_CONCURRENT_LIMIT);
  return Math.max(min, Math.min(max, v));
};

R.getEffectiveConcurrentLimit = function getEffectiveConcurrentLimit() {
  const user = getConcurrentLimit();
  const capped = clampWorkerCount(Math.min(user, MAX_SAFE_CONCURRENT));
  if (adaptiveConcurrentCap == null) return capped;
  return clampWorkerCount(Math.min(capped, adaptiveConcurrentCap));
};

/**
 * Smart worker throttle within the 5–50 band.
 * Soft API pressure drops toward 5; clean batches climb back to the operator max.
 * Takes effect on the next batch (in-flight workers finish their current address).
 */
R.scaleDownWorkers = function scaleDownWorkers(reason = 'rate_limit', opts = {}) {
  const floor = Number(MIN_CONCURRENT_LIMIT) || 5;
  const userMax = clampWorkerCount(Math.min(getConcurrentLimit(), MAX_SAFE_CONCURRENT));
  const current = getEffectiveConcurrentLimit();
  const now = Date.now();
  const cooldown = Number(SCALE_DOWN_COOLDOWN_MS) || 45000;
  // Status polls + repeat 429s used to call this every few seconds and keep the fleet pinned low.
  if (!opts.force && lastScaleDownAt && (now - lastScaleDownAt) < cooldown) {
    return false;
  }
  if (current <= floor) {
    adaptiveHealthyStreak = 0;
    adaptiveConcurrentCap = floor;
    return false;
  }
  // Prefer soft −1; hard −2 only on sustained pressure.
  const hard = opts.hard === true;
  let next = hard ? current - 2 : current - 1;
  next = clampWorkerCount(next);
  if (next >= current) return false;
  if (adaptiveConcurrentCap != null && next >= adaptiveConcurrentCap) return false;

  adaptiveConcurrentCap = next;
  adaptiveHealthyStreak = 0;
  lastScaleDownAt = now;
  if (state.running) {
    try { initAgentSlots(getEffectiveConcurrentLimit()); } catch (_) {}
    try { updateWorkerActivityUi(lastServerApiStatus); } catch (_) {}
    try { updateLiveScanSectionUi?.(); } catch (_) {}
  }
  const why = String(reason || 'API pressure').slice(0, 80);
  log(`Auto-throttled workers: ${current} → ${next} (${why}). Floor is ${floor}; will climb back up when batches look healthy.`, 'warn');
  notifyScanIssue?.('throttle',
    `Using ${next} of ${userMax} workers — ${why}. Stays between ${floor}–${MAX_SAFE_CONCURRENT}; auto-raises after clean batches.`,
    { title: `Slowed to ${next} workers`, dedupeKey: `throttle-${next}` }
  );
  return true;
};

/** After a clean batch while throttled, step workers back toward the operator max (≤ 50). */
R.maybeScaleUpWorkers = function maybeScaleUpWorkers() {
  if (adaptiveConcurrentCap == null) {
    adaptiveHealthyStreak = 0;
    return false;
  }
  const userMax = clampWorkerCount(Math.min(getConcurrentLimit(), MAX_SAFE_CONCURRENT));
  if (adaptiveConcurrentCap >= userMax) {
    adaptiveConcurrentCap = null;
    adaptiveHealthyStreak = 0;
    return false;
  }
  adaptiveHealthyStreak = (adaptiveHealthyStreak || 0) + 1;
  // One clean batch is enough — recover throughput faster after soft limits.
  if (adaptiveHealthyStreak < 1) return false;
  adaptiveHealthyStreak = 0;
  const prev = adaptiveConcurrentCap;
  // Larger band: climb in bigger steps so recovery from 5→50 is not dozens of batches.
  const step = Math.max(2, Math.ceil(userMax / 10));
  let next = clampWorkerCount(adaptiveConcurrentCap + step);
  if (next >= userMax) {
    adaptiveConcurrentCap = null;
    next = userMax;
  } else {
    adaptiveConcurrentCap = next;
  }
  if (next <= prev) return false;
  if (state.running) {
    try { initAgentSlots(getEffectiveConcurrentLimit()); } catch (_) {}
    try { updateWorkerActivityUi(lastServerApiStatus); } catch (_) {}
    try { updateLiveScanSectionUi?.(); } catch (_) {}
  }
  log(`Auto-raised workers: ${prev} → ${next} (batches healthy). Band is ${MIN_CONCURRENT_LIMIT}–${MAX_SAFE_CONCURRENT}.`, 'success');
  return true;
};

/**
 * Soft rate-limit wait: brief stagger only.
 * A full-fleet freeze made the UI look like “1 worker” while everyone parked on rateLimitUntil.
 */
R.waitForRateLimit = async function waitForRateLimit() {
  const until = rateLimitUntil || 0;
  if (!until || Date.now() >= until || state.aborted) return;
  const remaining = until - Date.now();
  // Cap shared wait so one 429 can’t park the whole scan for tens of seconds.
  const waitMs = Math.min(Math.max(remaining, 0), 2500);
  if (waitMs > 0) await sleep(waitMs);
}

/** Hard quota / billing / free-tier exhausted — stop scan (not retry forever). */
R.isHardQuotaError = function isHardQuotaError(msg, status) {
  const m = String(msg || '').toLowerCase();
  const st = Number(status) || 0;
  // Soft RPM: bare RESOURCE_EXHAUSTED / 429 without credit language — retry, don't halt.
  if (/rate limit|per minute|requests per minute|\brpm\b|try again in|high demand|overloaded/i.test(m)
    && !/billing not enabled|out of credits|credits?.?(exhausted|depleted)|spend.?limit|free_tier|prepaid|purchase additional/i.test(m)) {
    return false;
  }
  if (/exceeded your current quota|quota exceeded|billing not enabled|enable billing|free_tier|generaterequestsperday|perdayperproject|limit:\s*0\b|insufficient.?credit|out of credits|credits?.?(exhausted|depleted|ran out)|no credits|spend.?limit|spending.?cap|monthly spending|project spend|ai\.studio\/spend|manage your project spend|billing.?hard.?limit|consumer_?suspended|purchase additional|prepaid.?credit|payment required|over_query_limit|must enable billing|api project is not authorized|quota\/credits exhausted/i.test(m)) {
    return true;
  }
  // RESOURCE_EXHAUSTED alone is usually RPM — only hard when paired with credit/daily language.
  if (/resource_exhausted/i.test(m) && /daily|monthly|free.?tier|credit|billing|spend/i.test(m)) return true;
  if ((st === 429 || /429/.test(m)) && /free.?tier|daily|monthly|credit|billing|spend/i.test(m) && !/try again in|per minute|rate/i.test(m)) {
    return true;
  }
  // Dead API key / Maps denied / Gemini auth
  if (/api key not valid|api_key_invalid|invalid api key|key expired|permission.?denied|request_denied|access.?denied|unregistered|api is not activated|has not been used|not authorized to use this api|google_maps.*denied|maps_api.*denied/i.test(m)) {
    return true;
  }
  if (st === 401 || st === 403) {
    if (/gemini|maps|street|google|api key|quota|billing|denied|credit/i.test(m)) return true;
  }
  return false;
}

/** True when an Error (or flag) means stop the scan — never write Needs Review / uncategorized. */
R.errorIsHardQuota = function errorIsHardQuota(err) {
  if (!err) return false;
  if (err.hardQuota === true) return true;
  const status = err.status || err.httpStatus || err.statusCode;
  return isHardQuotaError(err.message || err, status);
}

/** Maps vs Gemini from an error string */
R.apiProviderFromError = function apiProviderFromError(msg) {
  const m = String(msg || '').toLowerCase();
  if (/street|maps|over_query|staticmap|streetview|geocod|billing.*maps|maps.*billing/i.test(m)) {
    return 'maps';
  }
  return 'gemini';
}

R.isDiskSpaceError = function isDiskSpaceError(msg) {
  const m = String(msg || '').toLowerCase();
  return /enospc|no space left on device|disk full|server disk full|not enough space/.test(m);
}

R.isTransientError = function isTransientError(msg) {
  if (isHardQuotaError(msg)) return false; // do not treat hard quota as "retry later"
  if (isDiskSpaceError(msg)) return true; // disk full is infra — cleanup + retry, not halt
  // Transport blips retry like soft API pressure (was excluded and dumped into Needs Review).
  if (typeof isTransportBlipError === 'function' ? isTransportBlipError(msg) : isRawFetchTransportError(msg)) {
    return true;
  }
  const m = String(msg || '').toLowerCase();
  return /503|429|high demand|overloaded|rate limit|too many requests|try again later|temporarily unavailable|econnreset|socket hang up|image fetch failed|bad json|invalid json|unterminated|invalid score/.test(m);
}

R.isStreetViewConfirmedAbsent = function isStreetViewConfirmedAbsent(streetViewResult) {
  return streetViewResult?.unavailable === true;
}

R.isStreetViewFetchFailure = function isStreetViewFetchFailure(streetViewResult) {
  if (!streetViewResult || streetViewResult.ok) return false;
  if (streetViewResult.unavailable === true) return false;
  const err = String(streetViewResult.error || '').toLowerCase();
  return /image fetch failed|metadata found|retry|502|503|timed out|rate limit/.test(err);
}

R.isStreetViewQuotaError = function isStreetViewQuotaError(msg) {
  const m = String(msg || '').toLowerCase();
  return isHardQuotaError(m) || /403|request_denied|over_query|quota exceeded|billing/.test(m);
}

/**
 * Stop the scan when Maps/Gemini credits run out or the API is down/denied.
 * Does NOT mark the current address as scanned — Start Scan resumes unscanned only.
 */
R.haltScanForQuota = function haltScanForQuota(provider, errMsg, opts = {}) {
  if (state.quotaHaltShown) return;
  state.quotaHaltShown = true;
  state.aborted = true;
  state.apiHaltReason = {
    provider: provider === 'maps' ? 'maps' : 'gemini',
    message: String(errMsg || '').slice(0, 400),
    at: Date.now(),
    kind: opts.kind || 'quota'
  };
  const who = provider === 'maps' ? 'Google Maps / Street View' : 'Gemini';
  const detail = String(errMsg || 'API stopped working').slice(0, 280);
  const title = opts.kind === 'disk'
    ? 'Server disk full — scan paused after cleanup could not recover'
    : opts.kind === 'outage'
      ? `${who} stopped responding — scan paused`
      : `${who} credits / quota / key issue — scan stopped`;
  const body =
    `${detail}\n\n` +
    `Progress is saved. The current property was NOT marked done — when APIs work again, click Start Scan to pick up where you left off.`;
  log(`${title}: ${detail}`, 'error');
  notifyScanIssue('quota_exhausted', body, {
    title,
    dedupeKey: `quota-${provider}-${opts.kind || 'hard'}`,
    browserNotify: true,
    tier: 'error'
  });
  showFatalError?.(`${title}. ${detail}`);
  try {
    // Best-effort save so resume has latest completed properties
    if (typeof requestServerSave === 'function') requestServerSave('api-halt');
    else if (typeof flushSaveSession === 'function') {
      flushSaveSession({ force: true, reason: 'api-halt' });
    }
  } catch (_) {}
  try {
    alert(
      `Scan stopped — ${who} is not usable right now.\n\n` +
      `${detail}\n\n` +
      `Your finished properties are saved.\n` +
      `When credits/keys are fixed (or free tier resets), click Start Scan — it only runs addresses still left.`
    );
  } catch (_) {}
  updateApiUsageUi();
  updateStartButton?.();
  updateScanReadyUi?.();
}

/** Ask server to free temp backups/logs when disk is full. */
R.requestDiskCleanup = async function requestDiskCleanup() {
  if (!USE_PROXY || typeof apiFetch !== 'function') return null;
  const now = Date.now();
  if (state._lastDiskCleanupAt && now - state._lastDiskCleanupAt < 30_000) {
    return state._lastDiskCleanupResult || null;
  }
  try {
    const res = await apiFetch('/api/disk-cleanup', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    state._lastDiskCleanupAt = now;
    state._lastDiskCleanupResult = data;
    if (data?.files > 0) {
      log?.(
        `Server disk cleanup — removed ${Number(data.files).toLocaleString()} temp file(s)` +
        (data.bytes ? ` (~${Math.round(data.bytes / 1e6)} MB)` : ''),
        'warn'
      );
    }
    return data;
  } catch (e) {
    console.warn('[disk-cleanup] request failed', e);
    return null;
  }
}

R.noteDiskSpaceError = function noteDiskSpaceError(errMsg) {
  state.apiFailStreak = 0;
  const pauseMs = 12_000 + Math.floor(Math.random() * 8000);
  rateLimitUntil = Math.max(rateLimitUntil, Date.now() + pauseMs);
  scaleDownWorkers?.('server disk full', { hard: true });
  if (!state.diskSpaceWarned) {
    state.diskSpaceWarned = true;
    log(
      'Server disk was full — cleaning temp backups and retrying (scan continues; address not marked done).',
      'warn'
    );
    notifyScanIssue('disk_full', String(errMsg || 'Server disk full'), {
      title: 'Disk full — auto-cleanup + retry',
      dedupeKey: 'disk-full',
      browserNotify: true
    });
  }
  requestDiskCleanup?.();
}

/** Count consecutive non-transient API failures; soft 429/503 never halts the scan. */
R.noteApiScanFailure = function noteApiScanFailure(errMsg, provider) {
  if (isHardQuotaError(errMsg) || (errMsg && errMsg.hardQuota === true)) {
    const msg = typeof errMsg === 'string' ? errMsg : (errMsg?.message || String(errMsg || ''));
    haltScanForQuota(provider || apiProviderFromError(msg), msg, { kind: 'quota' });
    return true;
  }
  if (isDiskSpaceError(errMsg)) {
    noteDiskSpaceError(errMsg);
    return false;
  }
  if (isDeferrableRateLimitError(errMsg)) {
    noteRateLimit({ message: errMsg });
    return false;
  }
  state.apiFailStreak = (state.apiFailStreak || 0) + 1;
  const streak = state.apiFailStreak;
  // Only stop on sustained non-transient failures (not Gemini busy / 429 thrash).
  if (streak >= 30) {
    haltScanForQuota(
      provider || apiProviderFromError(errMsg),
      `API failed ${streak} times in a row (non-rate-limit). Last error: ${String(errMsg || '').slice(0, 160)}`,
      { kind: 'outage' }
    );
    return true;
  }
  return false;
}

R.noteApiScanSuccess = function noteApiScanSuccess() {
  state.apiFailStreak = 0;
}

R.noteRateLimit = function noteRateLimit(err) {
  const raw = String(err?.message || err || '');
  if (isHardQuotaError(raw)) {
    haltScanForQuota(apiProviderFromError(raw), raw, { kind: 'quota' });
    return;
  }
  const m = raw.toLowerCase();
  if (isServerConnectionError(m) || !isTransientError(m)) return;
  // Soft limits: brief advisory pause + gentle throttle — never abort, never freeze the fleet.
  state.apiFailStreak = 0;
  const pauseMs = /503|high demand|overloaded/.test(m)
    ? 4000 + Math.floor(Math.random() * 2000)
    : 2500 + Math.floor(Math.random() * 1500);
  rateLimitUntil = Math.max(rateLimitUntil, Date.now() + pauseMs);
  const pauseSec = Math.ceil(pauseMs / 1000);
  const hard = /503|high demand|overloaded/.test(m);
  scaleDownWorkers?.(
    hard ? 'Gemini 503 / overload' : 'rate limit 429',
    { hard }
  );
  const effective = getEffectiveConcurrentLimit();
  notifyScanIssue('rate_limit',
    `Brief API pause ~${pauseSec}s — keeping ${effective} parallel worker${effective === 1 ? '' : 's'} (auto-adjust on).`,
    { dedupeKey: 'rate_limit', browserNotify: !state.rateLimitWarned }
  );
  if (!state.rateLimitWarned) {
    state.rateLimitWarned = true;
    log(`Gemini/Google busy (503 or rate limit) — short pause ~${pauseSec}s, gentle worker adjust, scan continues.`, 'warn');
  }
}

R.lastApiUsage = null;

R.updateApiUsageUi = function updateApiUsageUi(usage) {
  const u = usage || lastApiUsage || lastServerApiStatus?.usage;
  if (!u) return;
  lastApiUsage = u;

  const gemMain = $('apiUsageGeminiMain');
  const gemSub = $('apiUsageGeminiSub');
  const gemBar = $('apiUsageGeminiBar');
  const gemCard = $('apiUsageGeminiCard');
  const mapsMain = $('apiUsageMapsMain');
  const mapsSub = $('apiUsageMapsSub');
  const mapsBar = $('apiUsageMapsBar');
  const mapsCard = $('apiUsageMapsCard');
  const statusEl = $('apiUsageStatus');
  const noteEl = $('apiUsageNote');
  const clearBtn = $('apiUsageClearQuotaBtn');

  const g = u.gemini || {};
  const m = u.maps || {};
  if (noteEl && u.note) noteEl.textContent = u.note;

  if (gemMain) {
    gemMain.textContent = g.remainingLabel
      || `Today: ${(g.todayOk || 0).toLocaleString()} ok · ${(g.todayFail || 0).toLocaleString()} fail`;
  }
  if (gemSub) {
    const sess = (g.sessionOk != null)
      ? `This server session: ${(g.sessionOk || 0).toLocaleString()} ok · ${(g.sessionFail || 0).toLocaleString()} fail`
      : '';
    gemSub.textContent = [
      `Today calls: ${(g.todayTotal || 0).toLocaleString()} (429s: ${g.today429 || 0})`,
      sess
    ].filter(Boolean).join(' · ');
  }
  if (gemBar && g.freeTierDailyLimitEst) {
    const usedPct = Math.min(100, Math.round(((g.todayTotal || 0) / g.freeTierDailyLimitEst) * 100));
    gemBar.style.width = `${usedPct}%`;
    gemCard?.classList.toggle('is-warn', usedPct >= 70 && usedPct < 95);
    gemCard?.classList.toggle('is-danger', usedPct >= 95 || (g.todayHardQuota || 0) > 0);
  }

  if (mapsMain) {
    mapsMain.textContent = m.remainingLabel
      || `Month est. spend: $${Number(m.estimatedSpendUsdMonth || 0).toFixed(2)}`;
  }
  if (mapsSub) {
    mapsSub.textContent = [
      `Today SV/Maps ok: ${(m.todayStreetViewOk || m.todayOk || 0).toLocaleString()} · fail: ${(m.todayStreetViewFail || m.todayFail || 0).toLocaleString()}`,
      m.sessionStreetViewOk != null
        ? `Session SV: ${(m.sessionStreetViewOk || 0).toLocaleString()} ok · ${(m.sessionStreetViewFail || 0).toLocaleString()} fail`
        : ''
    ].filter(Boolean).join(' · ');
  }
  if (mapsBar && m.monthlyCreditUsdEst) {
    const spent = Number(m.estimatedSpendUsdMonth || 0);
    const usedPct = Math.min(100, Math.round((spent / m.monthlyCreditUsdEst) * 100));
    mapsBar.style.width = `${usedPct}%`;
    mapsCard?.classList.toggle('is-warn', usedPct >= 70 && usedPct < 95);
    mapsCard?.classList.toggle('is-danger', usedPct >= 95 || (m.todayHardQuota || 0) > 0);
  }

  if (statusEl) {
    statusEl.classList.remove('is-ok', 'is-warn', 'is-danger');
    if (u.hardQuotaActive && u.lastHardQuota) {
      statusEl.classList.add('is-danger');
      const who = u.lastHardQuota.provider === 'maps' ? 'Maps/Street View' : 'Gemini';
      statusEl.textContent =
        `⚠ ${who} quota/credits exhausted — scans auto-stop so you can reload credits and resume. ` +
        `${String(u.lastHardQuota.message || '').slice(0, 160)}`;
      if (clearBtn) clearBtn.hidden = false;
    } else if ((g.today429 || 0) >= 3 || lastServerApiStatus?.gemini?.rateLimited) {
      statusEl.classList.add('is-warn');
      statusEl.textContent = 'Soft rate limit activity — workers pause briefly and retry (not a full credit stop).';
      if (clearBtn) clearBtn.hidden = true;
    } else {
      statusEl.classList.add('is-ok');
      statusEl.textContent = 'APIs healthy. Scan will auto-stop if free-tier or billing credits run out so you can pick up later.';
      if (clearBtn) clearBtn.hidden = true;
    }
  }
}

R.fetchApiUsage = async function fetchApiUsage() {
  if (!USE_PROXY) return null;
  try {
    const res = await apiFetch('/api/usage', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.ok) {
      lastApiUsage = data;
      updateApiUsageUi(data);
      return data;
    }
  } catch (_) {}
  return null;
}

R.wireApiUsageControls = function wireApiUsageControls() {
  if (R._apiUsageWired) return;
  R._apiUsageWired = true;
  $('apiUsageOpenBtn')?.addEventListener('click', () => openApiUsageModal?.());
  $('apiUsageRefreshBtn')?.addEventListener('click', () => {
    fetchApiUsage();
    refreshServerStatusUi?.();
  });
  $('apiUsageClearQuotaBtn')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/usage/clear-quota', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.usage) updateApiUsageUi(data.usage);
      else await fetchApiUsage();
      state.quotaHaltShown = false;
      log('Quota stop flag cleared — you can Start Scan again after reloading credits.', 'success');
    } catch (err) {
      log(`Could not clear quota flag: ${err.message}`, 'error');
    }
  });
}

R.buildNeedsReviewResult = function buildNeedsReviewResult(record, err, partial = {}) {
  const cleanMsg = String(err?.message || 'Unknown error').replace(/^\[(STREET VIEW|GEMINI)\]\s*/i, '').trim();
  const transient = /503|rate limit|overloaded|high demand|timeout|temporarily unavailable/i.test(cleanMsg);
  const blurred = /privacy blur|blurred|too blurry|image blur/i.test(cleanMsg);
  const qualityFlags = [...(partial.qualityFlags || [])];
  if (transient && !blurred) qualityFlags.push('street_ai_failed');
  else if (!blurred) qualityFlags.push('analysis_incomplete');

  const base = attachTierRationale({
    ...record,
    ...partial,
    category: blurred ? 'blurred' : 'unavailable',
    leadTier: blurred ? 'blurred' : 'unavailable',
    score: 0,
    aiScore: null,
    confidence: null,
    indicators: [],
    structureOnLot: null,
    needsReview: false,
    landHomeConflict: false,
    satelliteConflict: false,
    fetchFailed: false,
    errorType: transient && !blurred ? 'transient' : partial.errorType,
    reason: cleanMsg
      ? (blurred
        ? `Blocked image — cannot see or assess the home (${cleanMsg}).`
        : transient
          ? `Analysis interrupted (${cleanMsg}) — retry or review.`
          : `Imagery unavailable (${cleanMsg}).`)
      : (blurred
        ? 'Blocked image — cannot see or assess the home; could not finish analysis.'
        : 'Imagery unavailable — could not finish analysis.'),
    analyzedAt: Date.now(),
    qualityFlags
  });
  if (typeof enrichClassificationFields === 'function') enrichClassificationFields(base);
  return base;
}

R.streetViewFixHint = function streetViewFixHint(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('403') || m.includes('forbidden')) {
    return '403 fix: Credentials → your API key → Application restrictions = NONE (not "HTTP referrers"). Also finish Maps setup at console.cloud.google.com/google/maps-apis/start';
  }
  if (m.includes('invalid') && m.includes('api key')) {
    return 'Wrong key in the Street View box. Use a key from Google Cloud Console — NOT your Gemini key.';
  }
  if (m.includes('not authorized') || m.includes('enable') || m.includes('activated')) {
    return 'Enable "Street View Static API" at console.cloud.google.com/apis/library — then finish Maps onboarding at console.cloud.google.com/google/maps-apis/start';
  }
  if (m.includes('billing') || m.includes('payment')) {
    return 'Link billing at console.cloud.google.com/billing';
  }
  if (m.includes('referrer') || m.includes('restriction')) {
    return 'Credentials → API key → Application restrictions = NONE. "HTTP referrers" causes 403 with this tool.';
  }
  return '1) Maps onboarding 2) Street View Static API enabled 3) Billing on 4) Key restrictions = None';
}

R.haltSearch = function haltSearch(err, label) {
  if (state.haltAlertShown) return;
  state.haltAlertShown = true;
  state.aborted = true;

  const raw = err.message || String(err);
  const isSv = raw.includes('[STREET VIEW]');
  const isGem = raw.includes('[GEMINI]');
  const detail = raw.replace(/^\[(STREET VIEW|GEMINI)\]\s*/i, '');

  let title = 'Scan stopped';
  if (isSv) title = 'Street View failed — scan stopped';
  if (isGem) title = 'Gemini failed — scan stopped';

  const fix = isSv ? streetViewFixHint(detail) : isGem
    ? 'Gemini quota exceeded or bad key — get a key at aistudio.google.com/apikey or add billing.'
    : '';

  const banner = isSv
    ? `Street View: ${detail} — ${fix}`
    : isGem
      ? `Gemini: ${detail}`
      : detail;

  showFatalError(banner);
  notifyScanIssue('fatal', banner, { title, browserNotify: true, dedupeKey: 'fatal' });
  setHudStatus('FAILED', true);
  stopBtn.disabled = true;

  alert(
    `${title}\n\n` +
    `Error: ${detail}\n\n` +
    (fix ? `How to fix:\n${fix}\n\n` : '') +
    `Stopped at: ${label}`
  );
  log(`STOPPED — ${raw}`, 'error');
}

R.streetViewKeyHint = $('streetViewKeyHint');
R.geminiKeyHint = $('geminiKeyHint');
R.clearKeysBtn = $('clearKeysBtn');

R.normalizeApiKey = function normalizeApiKey(key) {
  let k = String(key || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  const aq = k.match(/AQ\.[A-Za-z0-9_.-]{8,}/);
  if (aq) return aq[0];
  const aiZa = k.match(/AIza[A-Za-z0-9_-]{20,}/);
  if (aiZa) return aiZa[0];
  return k.replace(/\s+/g, '');
}

R.isValidMapsKey = function isValidMapsKey(key) {
  const k = normalizeApiKey(key);
  return /^AIza[A-Za-z0-9_-]{20,}$/.test(k);
}

R.isValidGeminiKey = function isValidGeminiKey(key) {
  const k = normalizeApiKey(key);
  if (/^AIza[A-Za-z0-9_-]{20,}$/.test(k)) return true;
  if (/^AQ\.[A-Za-z0-9_.-]{8,}$/.test(k)) return true;
  return k.length >= 20 && /^[A-Za-z0-9._-]+$/.test(k);
}

try { localStorage.removeItem('distressAnalyzerKeys'); } catch (_) {}

R.savedPrefs = {};
try {
  savedPrefs = JSON.parse(localStorage.getItem('distressAnalyzerPrefs') || '{}');
  if (!savedPrefs || typeof savedPrefs !== 'object') savedPrefs = {};
} catch (_) {
  savedPrefs = {};
}
R.getConcurrentLimit = function getConcurrentLimit() {
  return clampWorkerCount(parseInt(concurrentLimitInput?.value, 10) || DEFAULT_CONCURRENT_LIMIT);
}

R.savePrefs = function savePrefs() {
  localStorage.setItem('distressAnalyzerPrefs', JSON.stringify({
    concurrentLimit: getConcurrentLimit()
  }));
}

R.getStartBlockReason = function getStartBlockReason() {
  if (state.running) return 'Scan already running — use Stop first if it looks stuck.';
  if (USE_PROXY && serverOnline === false && serverOfflineStreak >= 2) {
    return 'Server not responding — double-click "Property Distress Analyzer" on your desktop, wait a few seconds, then refresh.';
  }
  const serverPending = Number(state._serverPendingUnscanned) || 0;
  if (!state.records.length && !(USE_PROXY && serverPending > 0)) {
    return 'Import a spreadsheet in Ready to scan first (CSV/Excel).';
  }
  if (!serverConfig.hasMapsKey) return 'Add MAPS_API_KEY to .env and restart the server.';
  if (!serverConfig.hasGeminiKey) return 'Add GEMINI_API_KEY to .env and restart the server.';
  return '';
}

R.updateStartButton = function updateStartButton() {
  const reason = getStartBlockReason();
  if (startBtn) {
    startBtn.disabled = !!reason;
    startBtn.title = reason || 'Analyze unscanned leads (keeps existing results)';
  }
  if (resetUploadBtn) {
    resetUploadBtn.disabled = state.running || (!state.records.length && !state.results.length && !state.fileName);
  }
  // Keep Scan Ready primary button in sync with hidden startBtn
  try { updateScanReadyUi?.(); } catch (_) {}
}

R.runStreetViewTest = async function runStreetViewTest() {
  if (!serverConfig.hasMapsKey) {
    setDiag(diagStreetView, 'fail', 'Street View: ✗ add MAPS_API_KEY to .env');
    return;
  }
  if (!USE_PROXY) {
    setDiag(diagStreetView, 'fail', 'Street View: ✗ run launch-analyzer.bat first');
    return;
  }
  setDiag(diagStreetView, 'warn', 'Street View: testing…');
  testSvBtn.disabled = true;
  try {
    const res = await fetch('/api/test-streetview');
    const data = await res.json();
    if (data.ok) {
      setDiag(diagStreetView, 'ok', 'Street View: ✓ WORKING — photo loads');
      resetThumbLoadQueue();
      refreshAllCardThumbs();
    } else {
      const err = data.googleError || data.meta?.error_message || `HTTP ${data.imageStatus}` || data.meta?.status || 'API not enabled or billing off';
      const fix = data.hint || streetViewFixHint(err + ' ' + (data.imageStatus || ''));
      const keyTail = serverConfig.mapsKeyTail || '(unknown)';
      setDiag(diagStreetView, 'fail', `Street View: ✗ BROKEN — ${err}`);
      alert(
        `Street View failed (key ends …${keyTail}):\n\n` +
        `Google says: ${err}\n` +
        `(Image HTTP ${data.imageStatus}, meta: ${data.meta?.status || '?'})\n\n` +
        `How to fix:\n${fix}\n\n` +
        `Update MAPS_API_KEY in .env and restart launch-analyzer.bat.`
      );
    }
  } catch (e) {
    setDiag(diagStreetView, 'fail', 'Street View: ✗ BROKEN — ' + e.message);
  }
  testSvBtn.disabled = false;
}

{
  const rawSaved = parseInt(savedPrefs.concurrentLimit, 10);
  // Migrate old 5–10 band, and the brief default-50 push, to the 25 sweet spot.
  const migrated = Number.isFinite(rawSaved) && rawSaved > 0 && (rawSaved <= 10 || rawSaved === 50)
    ? DEFAULT_CONCURRENT_LIMIT
    : (rawSaved || DEFAULT_CONCURRENT_LIMIT);
  R.savedWorkers = clampWorkerCount(migrated);
}
if (concurrentLimitInput) {
  concurrentLimitInput.min = String(MIN_CONCURRENT_LIMIT);
  concurrentLimitInput.max = String(MAX_SAFE_CONCURRENT);
  concurrentLimitInput.value = String(savedWorkers);
}
if (concurrentLimitVal) concurrentLimitVal.textContent = String(savedWorkers);
savePrefs();
fetchServerConfig();

concurrentLimitInput.addEventListener('input', () => {
  concurrentLimitVal.textContent = concurrentLimitInput.value;
  savePrefs();
});
concurrentLimitInput.addEventListener('change', savePrefs);

clearKeysBtn.addEventListener('click', async () => {
  await fetchServerConfig();
  setDiag(diagStreetView, 'pending', 'Street View: not tested yet');
  setDiag(diagSatellite, 'pending', 'Satellite: not tested yet');
  setDiag(diagGemini, 'pending', 'Gemini: not tested yet');
  setDiag(diagFull, 'pending', 'Full pipeline: not tested yet');
  log('Server config refreshed from .env', 'success');
});

updateKeyStatusUi();
updateStartButton();

if (!USE_PROXY && location.protocol === 'file:') {
  showFatalError(`You opened the HTML file directly. Close this tab, double-click launch-analyzer.bat, and use ${LOCAL_APP_URL} instead.`);
}

$('testGeminiBtn').addEventListener('click', () => runGeminiTest());
testSvBtn.addEventListener('click', () => runStreetViewTest());
$('testFullBtn').addEventListener('click', () => runFullTest());
$('exportLearnedBtn')?.addEventListener('click', () => exportLearnedBrain());
$('importLearnedBtn')?.addEventListener('click', () => $('importLearnedFile')?.click());
$('importLearnedFile')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) importLearnedBrainFile(f);
  e.target.value = '';
});


  }

  const te = PDA.lib && PDA.lib.tierEngine;
  const ir = PDA.lib && PDA.lib.imageryRouting;
  const cc = PDA.lib && PDA.lib.classificationConfidence;
  const rc = PDA.lib && PDA.lib.resultClassify;
  if (ir) {
    R.streetAnalysisNeedsSatellite = ir.streetAnalysisNeedsSatellite;
    R.propertyScanNeedsSatellite = ir.propertyScanNeedsSatellite;
    R.scanNeedsSatellite = ir.scanNeedsSatellite;
    R.satelliteFallbackFailed = ir.satelliteFallbackFailed;
  }
  if (cc) {
    R.inferImageryQuality = cc.inferImageryQuality;
    R.computeClassificationConfidence = cc.computeClassificationConfidence;
    R.enrichClassificationFields = cc.enrichClassificationFields;
    R.CLASSIFICATION_REVIEW_THRESHOLD = cc.REVIEW_THRESHOLD;
  }
  if (te) {
    R.normalizeCategory = te.normalizeCategory;
    R.stripTierMigrationReasonSuffix = te.stripTierMigrationReasonSuffix;
    R.computeLeadTier = te.computeLeadTier;
    R.normalizeLeadTier = te.normalizeLeadTier;
    R.looksVisuallyDistressed = te.looksVisuallyDistressed;
    R.hasNeglectCombo = te.hasNeglectCombo;
    R.qualifiesManicuredExemption = te.qualifiesManicuredExemption;
    R.normalizeIndicators = te.normalizeIndicators;
    R.hasModerateWithSupportingNeglect = te.hasModerateWithSupportingNeglect;
    R.countNeglectIndicators = te.countNeglectIndicators;
    R.reasonSuggestsDumpHouse = te.reasonSuggestsDumpHouse;
    R.reasonSuggestsManicured = te.reasonSuggestsManicured;
    R.reconcileReasonWithTier = te.reconcileReasonWithTier;
  }
  if (rc) {
    R.inferCategory = rc.inferCategory;
    R.resultCategory = rc.resultCategory;
    R.isBlurredImagery = rc.isBlurredImagery;
    R.isLandHomeUncertain = rc.isLandHomeUncertain;
    R.computeNeedsReview = rc.computeNeedsReview;
    R.isClassifiedResult = rc.isClassifiedResult;
    R.resultScore = rc.resultScore;
    R.combinedTierReason = rc.combinedTierReason;
    R.resultLeadTier = rc.resultLeadTier;
    R.leadTierContextFromRecord = rc.leadTierContextFromRecord;
  }

  PDA.config = {
    get USE_PROXY() { return R.USE_PROXY; },
    get STORAGE_KEY() { return R.STORAGE_KEY; },
    get SIZE_WARN_BYTES() { return R.SIZE_WARN_BYTES; },
    get SESSION_PAGE_SIZE() { return R.SESSION_PAGE_SIZE; },
    get VIRTUAL_MAX_DOM() { return R.VIRTUAL_MAX_DOM; },
    get apiFetch() { return R.apiFetch; },
    get $() { return R.$; },
    get log() { return R.log; },
    get fetchServerConfig() { return R.fetchServerConfig; },
    get getAuthToken() { return R.getAuthToken; },
    get BATCH_SIZE() { return R.BATCH_SIZE; },
    get GEMINI_MODELS() { return R.GEMINI_MODELS; },
    get serverConfig() { return R.serverConfig; },
    get serverHasMapsKey() { return R.serverHasMapsKey; },
    get appendMapsKeyParam() { return R.appendMapsKeyParam; },
    get updateKeyStatusUi() { return R.updateKeyStatusUi; }
  };
})(window);
