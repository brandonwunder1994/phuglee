// app.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

const gj = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.geminiJson) ? PDA.lib.geminiJson : null;
const te = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.tierEngine) ? PDA.lib.tierEngine : null;
const ir = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.imageryRouting) ? PDA.lib.imageryRouting : null;
const rc = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.resultClassify) ? PDA.lib.resultClassify : null;
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
}
if (ir) {
  R.streetAnalysisNeedsSatellite = ir.streetAnalysisNeedsSatellite;
  R.satelliteFallbackFailed = ir.satelliteFallbackFailed;
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

R.fetchCorrectionImagery = async function fetchCorrectionImagery(record) {
  const address = record?.address;
  if (!address || !hasImageryKey()) return { images: [], labels: [] };
  const svKey = '';
  try {
    const imagery = await fetchPropertyImagery(address, svKey);
    const images = [];
    const labels = [];
    if (imagery.satellite?.ok) {
      images.push({
        base64: imagery.satellite.base64,
        mimeType: imagery.satellite.mimeType || 'image/png',
        label: 'SATELLITE'
      });
      labels.push('satellite');
    }
    if (imagery.streetView?.ok && !record?.skippedStreetView) {
      images.push({
        base64: imagery.streetView.base64,
        mimeType: imagery.streetView.mimeType || 'image/jpeg',
        label: 'STREET_VIEW'
      });
      labels.push('street view');
    }
    return { images, labels };
  } catch (err) {
    log(`Correction imagery skipped: ${err.message}`, 'warn');
    return { images: [], labels: [] };
  }
}

R.findRecordForCorrectionEvent = function findRecordForCorrectionEvent(event) {
  if (!event?.recordKey) return null;
  return state.results.find(r => recordKey(r) === event.recordKey) || null;
}

if (gj) {
  R.extractJsonBlock = gj.extractJsonBlock;
  R.repairJsonString = gj.repairJsonString;
  R.salvagePartialJson = gj.salvagePartialJson;
  R.stripTrailingCommas = gj.stripTrailingCommas;
  R.parseLooseJson = gj.parseLooseJson;
} else {
  R.extractJsonBlock = function extractJsonBlock(text) {
    let cleaned = String(text || '').trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? match[0] : cleaned;
  };

  R.repairJsonString = function repairJsonString(s) {
    let t = s.trim();
    let inString = false;
    let escape = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = !inString;
    }
    if (inString) t += '"';
    const opens = (t.match(/\{/g) || []).length;
    const closes = (t.match(/\}/g) || []).length;
    if (opens > closes) t += '}'.repeat(opens - closes);
    return t;
  };

  R.salvagePartialJson = function salvagePartialJson(text) {
    const block = extractJsonBlock(text);
    const out = {};
    const num = (key) => {
      const m = block.match(new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
      return m ? Number(m[1]) : null;
    };
    const str = (key) => {
      const m = block.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : null;
    };
    const bool = (key) => {
      const m = block.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`));
      return m ? m[1] === 'true' : null;
    };
    const score = num('score');
    if (score != null) out.score = score;
    const category = str('category');
    if (category) out.category = category;
    const reason = str('reason');
    if (reason) out.reason = reason;
    const confidence = num('confidence');
    if (confidence != null) out.confidence = confidence;
    const aerial = num('aerial_distress_score');
    if (aerial != null) out.aerial_distress_score = aerial;
    const sol = bool('structure_on_subject_lot');
    if (sol != null) out.structure_on_subject_lot = sol;
    const indMatch = block.match(/"indicators"\s*:\s*\[([\s\S]*?)\]/);
    if (indMatch) {
      try {
        out.indicators = JSON.parse(`[${indMatch[1]}]`);
      } catch (_) {
        out.indicators = [...indMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
      }
    }
    return Object.keys(out).length ? out : null;
  };

  R.stripTrailingCommas = function stripTrailingCommas(s) {
    let t = String(s || '');
    for (let i = 0; i < 5; i++) t = t.replace(/,\s*([}\]])/g, '$1');
    return t;
  };

  R.parseLooseJson = function parseLooseJson(text, required = []) {
    const block = extractJsonBlock(text);
    const salvaged = salvagePartialJson(text);
    const attempts = [block, stripTrailingCommas(block), repairJsonString(block), stripTrailingCommas(repairJsonString(block))];
    if (salvaged) attempts.push(salvaged);
    for (const candidate of attempts) {
      try {
        const parsed = typeof candidate === 'string' ? JSON.parse(candidate) : { ...candidate };
        if (parsed.score == null && parsed.category) parsed.score = 1;
        if (!parsed.category && parsed.score != null) parsed.category = 'property';
        if (!parsed.reason) parsed.reason = 'Analysis complete.';
        for (const key of required) {
          if (parsed[key] == null && parsed[key] !== 0 && parsed[key] !== false) {
            throw new Error(`missing ${key}`);
          }
        }
        return parsed;
      } catch (_) { /* try next */ }
    }
    throw new Error(`Unterminated or invalid JSON from Gemini: ${block.slice(0, 120)}`);
  };
}

R.parseSatelliteResponse = function parseSatelliteResponse(text) {
  const parsed = parseLooseJson(text, ['category']);
  const category = inferCategory(0, parsed.reason || '', normalizeCategory(parsed.category), parsed.structure_on_subject_lot === true || parsed.structure_on_subject_lot === 'true');
  let confidence = Math.round(Number(parsed.confidence));
  if (isNaN(confidence) || confidence < 0) confidence = null;
  else if (confidence > 100) confidence = 100;
  const structureOnLot = parsed.structure_on_subject_lot === true || parsed.structure_on_subject_lot === 'true';
  let aerialDistressScore = Math.round(Number(parsed.aerial_distress_score));
  if (isNaN(aerialDistressScore) || aerialDistressScore < 0) aerialDistressScore = null;
  else if (aerialDistressScore > 10) aerialDistressScore = 10;
  if (category === 'vacant_lot' || !structureOnLot) aerialDistressScore = 0;
  let indicators = normalizeIndicators(parsed.indicators);
  const roofCondition = normalizeCondition(parsed.roof_condition);
  const yardCondition = normalizeCondition(parsed.yard_condition);
  let result = {
    category: structureOnLot === false ? 'vacant_lot' : category,
    structureOnLot,
    confidence,
    reason: String(parsed.reason || 'Satellite D4D scan complete.').trim(),
    indicators,
    roofCondition,
    yardCondition,
    aerialDistressScore
  };
  if (result.category === 'property' && result.structureOnLot) {
    result = applyAerialScoreCalibration(result);
  }
  return result;
}

R.classifyWithSatellite = async function classifyWithSatellite(base64, mimeType, apiKey, address, attempt = 1) {
  const tokens = attempt <= 2 ? 1024 : 1536;
  const text = await callGeminiVision(base64, mimeType, apiKey, buildSatellitePrompt(address), tokens, null, { address, scanType: 'satellite' });
  try {
    return parseSatelliteResponse(text);
  } catch (e) {
    if (attempt < 5 && /bad json|invalid json|unterminated|missing category/i.test(e.message)) {
      await sleep(700 * attempt);
      return classifyWithSatellite(base64, mimeType, apiKey, address, attempt + 1);
    }
    throw e;
  }
}

R.analyzeWithGemini = async function analyzeWithGemini(base64, mimeType, apiKey, address, viewMeta, attempt = 1) {
  const tokens = attempt <= 2 ? 1024 : 1536;
  const text = await callGeminiVision(base64, mimeType, apiKey, buildAnalysisPrompt(address, viewMeta), tokens, null, { address, scanType: 'street' });
  try {
    return parseGeminiResponse(text);
  } catch (e) {
    if (attempt < 5 && /bad json|invalid json|unterminated|invalid score|missing score/i.test(e.message)) {
      await sleep(700 * attempt);
      return analyzeWithGemini(base64, mimeType, apiKey, address, viewMeta, attempt + 1);
    }
    throw e;
  }
}

R.imageryWasFetched = function imageryWasFetched(imagery) {
  return !!(imagery?.satellite?.ok || imagery?.streetView?.ok);
}

R.buildImageryConfirmedFallback = function buildImageryConfirmedFallback(address, { satelliteResult, satGeocoded, svPayload, err, partialScore } = {}) {
  if (satelliteResult?.category) {
    const result = buildResultFromSatelliteOnly(satelliteResult, satGeocoded, err?.message || 'street AI incomplete');
    if (svPayload?.view) {
      result.skippedStreetView = false;
      result.viewMeta = svPayload.view;
    }
    return attachTierRationale(result);
  }
  let score = Math.round(Number(partialScore));
  if (isNaN(score) || score < 1 || score > 10) score = 2;
  return attachTierRationale({
    score,
    category: 'property',
    leadTier: computeLeadTier(score, 'property'),
    structureOnLot: true,
    indicators: score >= DISTRESSED_MIN_SCORE ? ['deferred_maintenance'] : [],
    confidence: 45,
    needsReview: false,
    reason: score >= DISTRESSED_MIN_SCORE
      ? 'Street View imagery confirmed — AI response was cut short; scored from partial analysis.'
      : 'Street View imagery confirmed — defaulting to Well Maintained (AI response incomplete).',
    viewMeta: svPayload?.view || null,
    usedSatellite: false,
    skippedStreetView: !svPayload,
    qualityFlags: ['ai_response_incomplete']
  });
}

R.parseGeminiResponse = function parseGeminiResponse(text) {
  let parsed;
  try {
    parsed = parseLooseJson(text, ['score', 'category']);
  } catch (e) {
    try {
      parsed = parseLooseJson(text, ['score']);
      if (!parsed.category) parsed.category = 'property';
    } catch (e2) {
      throw new Error(`Gemini returned bad JSON — ${e.message}`);
    }
  }
  let score = Math.round(Number(parsed.score));
  if (isNaN(score) || score < 0 || score > 10) {
    throw new Error(`Invalid score: ${parsed.score}`);
  }
  const reason = String(parsed.reason || 'No reason provided').trim();
  let indicators = normalizeIndicators(parsed.indicators);
  let structureOnLot = parsed.structure_on_subject_lot === true
    || parsed.structure_on_subject_lot === 'true';
  let category = inferCategory(score, reason, normalizeCategory(parsed.category), structureOnLot);
  if (structureOnLot === false && category === 'property') category = 'vacant_lot';
  if (category === 'vacant_lot' || category === 'unavailable') score = 0;
  if (category === 'vacant_lot') indicators = [];
  if (category === 'unavailable' && structureOnLot === true && score >= 1) {
    category = 'property';
  }
  if (category === 'property') {
    if (structureOnLot !== false) structureOnLot = true;
    if (score === 0) score = indicators.length ? 2 : 1;
    indicators = indicators.map(i => (
      i === 'roof_damage_or_tarp' && !/(tarp|missing shingles|collapsed|hole)/i.test(reason)
        ? 'deferred_maintenance'
        : i
    ));
    score = applyScoreCalibration(score, indicators, category, { reason });
  }
  let confidence = Math.round(Number(parsed.confidence));
  if (isNaN(confidence) || confidence < 0) confidence = null;
  else if (confidence > 100) confidence = 100;
  let leadTier = parsed.lead_tier ? normalizeLeadTier(parsed.lead_tier) : null;
  if (category === 'vacant_lot') leadTier = 'vacant';
  else if (category === 'unavailable') leadTier = 'unavailable';
  else if (!leadTier || leadTier === 'unavailable' || leadTier === 'vacant') {
    leadTier = computeLeadTier(score, category, { indicators, reason });
  } else if (category === 'property' && leadTier === 'well_maintained') {
    if (looksVisuallyDistressed(score, indicators, null, reason) || hasNeglectCombo(indicators, reason)) {
      leadTier = 'distressed';
      score = clampScoreForTier(Math.max(score, DISTRESSED_MIN_SCORE), 'distressed', indicators, reason);
    } else {
      score = clampScoreForTier(score, 'well_maintained', indicators, reason);
    }
  } else if (category === 'property' && leadTier === 'distressed') {
    if (qualifiesManicuredExemption(indicators, null, null, reason) && !looksVisuallyDistressed(score, indicators, null, reason)) {
      leadTier = 'well_maintained';
      score = clampScoreForTier(score, 'well_maintained', indicators, reason);
    } else if (!looksVisuallyDistressed(score, indicators, null, reason) && !hasNeglectCombo(indicators, reason)) {
      leadTier = 'well_maintained';
      score = clampScoreForTier(score, 'well_maintained', indicators, reason);
    } else {
      leadTier = 'distressed';
      score = clampScoreForTier(Math.max(score, DISTRESSED_MIN_SCORE), 'distressed', indicators, reason);
    }
  } else if (category === 'property') {
    leadTier = computeLeadTier(score, category, { indicators, reason });
    score = clampScoreForTier(score, leadTier, indicators, reason);
  }
  if (category === 'property' && looksVisuallyDistressed(score, indicators, null, reason)) {
    leadTier = 'distressed';
    score = clampScoreForTier(Math.max(score, DISTRESSED_MIN_SCORE), 'distressed', indicators, reason);
  } else if (category === 'property' && leadTier === 'distressed' && !looksVisuallyDistressed(score, indicators, null, reason)) {
    leadTier = 'well_maintained';
    score = clampScoreForTier(score, 'well_maintained', indicators, reason);
  }
  const result = {
    score,
    reason,
    category,
    leadTier,
    indicators,
    structureOnLot,
    confidence,
    needsReview: false
  };
  return attachTierRationale(result);
}

R.finalizePropertyDistress = function finalizePropertyDistress(analysis, satelliteResult = null) {
  const cat = normalizeCategory(analysis.category);
  if (cat !== 'property' || analysis.structureOnLot === false) return analysis;
  analysis.category = 'property';
  analysis.structureOnLot = true;
  analysis.landHomeConflict = false;
  analysis.satelliteConflict = false;
  const combinedReason = combinedTierReason(analysis, satelliteResult);
  if (satelliteResult) {
    fuseStreetAndAerialScore(analysis, satelliteResult);
  } else if (!analysis.score || analysis.score === 0) {
    const inds = normalizeIndicators(analysis.indicators);
    analysis.score = applyScoreCalibration(inds.length ? 2 : 1, inds, 'property', { reason: combinedReason });
  } else {
    analysis.score = applyScoreCalibration(analysis.score, analysis.indicators, 'property', { reason: combinedReason });
  }
  analysis.leadTier = computeLeadTier(analysis.score, 'property', {
    indicators: analysis.indicators,
    satelliteClassification: satelliteResult,
    reason: combinedReason
  });
  if (looksVisuallyDistressed(analysis.score, analysis.indicators, satelliteResult, combinedReason)) {
    analysis.leadTier = 'distressed';
    analysis.score = Math.max(analysis.score, DISTRESSED_MIN_SCORE);
  } else if (analysis.leadTier === 'distressed') {
    analysis.leadTier = 'well_maintained';
    analysis.score = Math.min(analysis.score, WELL_MAINTAINED_MAX_SCORE);
  }
  analysis.score = clampScoreForTier(analysis.score, analysis.leadTier, analysis.indicators, combinedReason);
  return analysis;
}

R.reconcileSatelliteWithStreetView = function reconcileSatelliteWithStreetView(analysis, satelliteResult) {
  if (!satelliteResult || !analysis) return finalizePropertyDistress(analysis);
  const svCat = normalizeCategory(analysis.category);
  const satCat = normalizeCategory(satelliteResult.category);
  const satConf = satelliteResult.confidence ?? 0;
  const svConf = analysis.confidence ?? 0;
  analysis.satelliteConflict = false;
  analysis.landHomeConflict = false;
  analysis.needsReview = false;

  const satSaysVacant = satCat === 'vacant_lot' && satelliteResult.structureOnLot === false;
  const satSaysHome = satCat === 'property' && satelliteResult.structureOnLot === true;
  const svSaysVacant = svCat === 'vacant_lot' && analysis.structureOnLot === false;
  const svSaysHome = svCat === 'property' && analysis.structureOnLot !== false;

  if ((satSaysVacant && svSaysHome) || (satSaysHome && svSaysVacant)) {
    if (satConf >= 55 && svConf >= 55) {
      analysis.landHomeConflict = true;
      analysis.satelliteConflict = true;
      analysis.category = 'unavailable';
      analysis.leadTier = 'unavailable';
      analysis.score = 0;
      analysis.indicators = [];
      analysis.reason = `${analysis.reason || 'Lot type unclear.'} Satellite and Street View disagree — vacant land vs home.`.trim();
      return analysis;
    }
  }

  if (satSaysVacant && satConf >= SAT_VACANT_SKIP_CONFIDENCE && (svSaysVacant || svCat === 'unavailable')) {
    analysis.category = 'vacant_lot';
    analysis.structureOnLot = false;
    analysis.score = 0;
    analysis.indicators = [];
    analysis.leadTier = 'vacant';
    return analysis;
  }

  if (svSaysHome) {
    return finalizePropertyDistress(analysis, satelliteResult);
  }

  if (satSaysHome && satConf >= 60 && (svCat === 'unavailable' || !analysis.score)) {
    const sat = applyAerialScoreCalibration(satelliteResult);
    analysis.category = 'property';
    analysis.structureOnLot = true;
    analysis.indicators = mergeIndicatorSets(analysis.indicators, sat.indicators);
    analysis.score = sat.aerialDistressScore ?? 2;
    if (/cannot|unclear|unavailable|blocked|unsure/i.test(analysis.reason || '')) {
      analysis.reason = sat.reason || analysis.reason;
    }
    return finalizePropertyDistress(analysis, sat);
  }

  if (svCat === 'unavailable' && satSaysVacant && satConf >= SAT_VACANT_SKIP_CONFIDENCE) {
    analysis.category = 'vacant_lot';
    analysis.structureOnLot = false;
    analysis.score = 0;
    analysis.indicators = [];
    analysis.leadTier = 'vacant';
    return analysis;
  }

  if (svCat === 'unavailable') {
    analysis.category = 'unavailable';
    analysis.leadTier = 'unavailable';
    analysis.score = 0;
    analysis.indicators = [];
    return analysis;
  }

  return finalizePropertyDistress(analysis, satelliteResult);
}

R.buildVacantFromSatellite = function buildVacantFromSatellite(satelliteResult, satGeocoded, satUrl) {
  const qualityFlags = [];
  if (satGeocoded?.locationType && satGeocoded.locationType !== 'ROOFTOP') qualityFlags.push('approximate_geocode');
  if (satGeocoded?.partialMatch) qualityFlags.push('partial_address_match');
  return {
    score: 0,
    category: 'vacant_lot',
    leadTier: 'vacant',
    indicators: [],
    structureOnLot: false,
    confidence: satelliteResult.confidence,
    needsReview: false,
    reason: satelliteResult.reason || 'Satellite imagery shows open land with no building footprint on the center parcel — classified as vacant lot.',
    satelliteClassification: satelliteResult,
    usedSatellite: true,
    skippedStreetView: true,
    qualityFlags,
    viewMeta: null
  };
}

R.buildResultFromSatelliteOnly = function buildResultFromSatelliteOnly(satelliteResult, satGeocoded, svError) {
  const qualityFlags = ['no_streetview'];
  if (satGeocoded?.locationType && satGeocoded.locationType !== 'ROOFTOP') qualityFlags.push('approximate_geocode');
  if (satGeocoded?.partialMatch) qualityFlags.push('partial_address_match');

  const category = normalizeCategory(satelliteResult.category);
  let score = 0;
  let indicators = category === 'vacant_lot' ? [] : normalizeIndicators(satelliteResult.indicators);
  if (category === 'property' && satelliteResult.structureOnLot) {
    const sat = applyAerialScoreCalibration(satelliteResult);
    score = sat.aerialDistressScore ?? 2;
    indicators = normalizeIndicators(sat.indicators || indicators);
  }

  const svNote = ' (No Street View at address — scored from satellite only.)';
  const reason = String(satelliteResult.reason || 'Satellite D4D scan complete.').trim() + svNote;

  const leadTier = category === 'vacant_lot' ? 'vacant'
    : category === 'unavailable' ? 'unavailable'
    : computeLeadTier(score, category);

  let confidence = Math.round(Number(satelliteResult.confidence));
  if (isNaN(confidence) || confidence < 0) confidence = null;
  else confidence = Math.max(0, Math.min(100, confidence - 10));

  return attachTierRationale({
    score,
    reason,
    category,
    leadTier,
    indicators,
    structureOnLot: satelliteResult.structureOnLot,
    confidence,
    needsReview: false,
    scanIncomplete: false,
    satelliteClassification: satelliteResult,
    usedSatellite: true,
    skippedStreetView: true,
    qualityFlags,
    viewMeta: null
  });
}

R.recalibratePropertyScores = function recalibratePropertyScores(results) {
  let changed = 0;
  const updated = results.map((r) => {
    if (r.manualOverride || r.manualScore || isTierLocked(r) || resultCategory(r) !== 'property') return r;
    const beforeTier = resultLeadTier(r);
    const copy = {
      ...r,
      indicators: normalizeIndicators(r.indicators),
      retieredWithoutVision: true,
      retieredAt: Date.now()
    };
    if (copy.satelliteClassification?.structureOnLot && copy.usedSatellite) {
      fuseStreetAndAerialScore(copy, copy.satelliteClassification);
    } else {
      copy.score = applyScoreCalibration(resultScore(copy), copy.indicators, 'property', {
        roofCondition: copy.satelliteClassification?.roofCondition,
        yardCondition: copy.satelliteClassification?.yardCondition
      });
      copy.leadTier = computeLeadTier(copy.score, 'property', {
        indicators: copy.indicators,
        satelliteClassification: copy.satelliteClassification,
        reason: copy.reason
      });
    }
    const repaired = attachTierRationale(copy);
    if (typeof enrichClassificationFields === 'function') enrichClassificationFields(repaired);
    if (beforeTier !== resultLeadTier(repaired) || resultScore(r) !== resultScore(repaired)) changed++;
    return repaired;
  });
  if (changed) log(`D4D score recalibration updated ${changed} home${changed === 1 ? '' : 's'} to Distressed / Well Maintained tiers (no vision re-call)`, 'success');
  return updated;
}

R.repairFalseFetchFailures = function repairFalseFetchFailures(results) {
  let repaired = 0;
  const updated = results.map((r) => {
    if (r.manualOverride) return r;
    const wasFailed = r.fetchFailed || String(r.category || '').toLowerCase() === 'fetch_failed';
    if (!wasFailed) return r;
    const sat = r.satelliteClassification;
    if (!sat?.category) return r;
    const fixed = buildResultFromSatelliteOnly(sat, r.satGeocoded || null, r.reason || 'prior scan error');
    repaired++;
    const { fetchFailed, failedAt, errorType, ...rest } = r;
    return attachTierRationale({
      ...rest,
      ...fixed,
      analyzedAt: Date.now()
    });
  });
  if (repaired) {
    log(`Recovered ${repaired} incomplete result${repaired === 1 ? '' : 's'} from saved satellite analysis`, 'success');
  }
  return updated;
}

R.finalizeStreetAnalysis = async function finalizeStreetAnalysis(svPayload, svUrl, address, gKey, workerNum, svKey = '', priorRecord = null) {
  const { base64, mimeType, view } = svPayload;
  const qualityFlags = [...(view?.qualityFlags || [])];
  scanPreview(address, 'Analyzing distress from street level…', svUrl, null, null, true, workerNum);
  try {
    let analysis = await analyzeWithGemini(base64, mimeType, gKey, address, view || {});
    let satelliteResult = null;
    let satGeocoded = null;
    let usedSatellite = false;
    let satelliteFromCache = false;

    if (typeof streetAnalysisNeedsSatellite === 'function' && streetAnalysisNeedsSatellite(analysis, view || {})) {
      scanPreview(address, 'Street view unclear — checking satellite…', svUrl, null, null, true, workerNum);
      try {
        const satData = await fetchSatelliteImagery(address, svKey);
        if (satData.ok) {
          satelliteFromCache = !!satData.fromCache;
          const reuseSatClass = satelliteFromCache
            && priorRecord?.satelliteClassification?.category
            && (priorRecord.satelliteClassification.confidence == null
              || Number(priorRecord.satelliteClassification.confidence) >= 40);
          if (reuseSatClass) {
            satelliteResult = priorRecord.satelliteClassification;
            qualityFlags.push('satellite_classification_reused');
          } else {
            satelliteResult = await classifyWithSatellite(
              satData.base64,
              satData.mimeType || 'image/png',
              gKey,
              address
            );
          }
          satGeocoded = satData.geocoded || null;
          usedSatellite = true;
          if (satData.imagery && svPayload.imagery) {
            svPayload.imagery.satellite = satData.imagery.satellite || satData.imagery;
          } else if (satData.imagery) {
            svPayload.imagery = { ...(svPayload.imagery || {}), ...satData.imagery };
          }
          qualityFlags.push(satelliteFromCache ? 'satellite_from_cache' : 'satellite_fallback');
          analysis = reconcileSatelliteWithStreetView(analysis, satelliteResult);
        } else if (typeof satelliteFallbackFailed === 'function' && satelliteFallbackFailed(analysis, null)) {
          analysis.category = 'unavailable';
          analysis.leadTier = 'unavailable';
          analysis.score = 0;
          analysis.indicators = [];
          analysis.reason = `${analysis.reason || 'Street view unclear.'} Satellite also unavailable — needs review.`.trim();
          analysis = attachTierRationale(analysis);
        }
      } catch (satErr) {
        log(`Satellite fallback failed for ${address}: ${satErr.message}`, 'warn');
        if (normalizeCategory(analysis.category) !== 'unavailable') {
          analysis.category = 'unavailable';
          analysis.leadTier = 'unavailable';
          analysis.score = 0;
          analysis.reason = `${analysis.reason || 'Street view unclear.'} Satellite fallback failed — needs review.`.trim();
          analysis = attachTierRationale(analysis);
        }
      }
    } else {
      analysis = finalizePropertyDistress(analysis);
    }

    const tierLabel = leadTierLabel(analysis.leadTier);
    scanPreview(address, `${tierLabel} — ${analysis.reason}`, svUrl, null, analysis.category === 'property' ? analysis.score : 0, true, workerNum);
    return attachTierRationale({
      ...analysis,
      qualityFlags,
      viewMeta: view || null,
      imagery: svPayload.imagery || null,
      satelliteClassification: satelliteResult,
      satGeocoded,
      usedSatellite,
      satelliteFromCache,
      skippedStreetView: false
    });
  } catch (e) {
    const partial = salvagePartialJson(String(e.message || ''));
    log(`Street AI incomplete — street-level fallback: ${address}`, 'warn');
    const result = buildImageryConfirmedFallback(address, {
      svPayload,
      err: e,
      partialScore: partial?.score
    });
    result.qualityFlags = [...(result.qualityFlags || []), 'street_ai_failed'];
    const tierLabel = leadTierLabel(result.leadTier);
    scanPreview(address, `${tierLabel} — ${result.reason}`, svUrl, null, result.category === 'property' ? result.score : 0, true, workerNum);
    return result;
  }
}

R.repairIncompleteImageryResults = function repairIncompleteImageryResults(results) {
  let repaired = 0;
  const updated = results.map((r) => {
    if (r.manualOverride || r.reviewResolved) return r;
    const flags = r.qualityFlags || [];
    const reason = String(r.reason || '');
    const incomplete = flags.includes('analysis_incomplete')
      || flags.includes('ai_response_incomplete')
      || /imagery pulled|bad json|gemini returned|unterminated or invalid json/i.test(reason);
    if (!incomplete) return r;
    if (resultCategory(r) !== 'unavailable' && !flags.includes('analysis_incomplete')) return r;
    const partial = salvagePartialJson(reason);
    const fixed = buildImageryConfirmedFallback(r.address, {
      satelliteResult: r.satelliteClassification,
      satGeocoded: r.satGeocoded,
      svPayload: r.viewMeta ? { view: r.viewMeta } : null,
      partialScore: partial?.score
    });
    repaired++;
    return attachTierRationale({
      ...r,
      ...fixed,
      fetchFailed: false,
      viewMeta: r.viewMeta || fixed.viewMeta,
      satelliteClassification: r.satelliteClassification || fixed.satelliteClassification,
      analyzedAt: Date.now()
    });
  });
  if (repaired) {
    log(`Reclassified ${repaired} imagery-confirmed lead${repaired === 1 ? '' : 's'} into distress tiers`, 'success');
  }
  return updated;
}

R.migrateLegacyFetchFailedResults = function migrateLegacyFetchFailedResults(results) {
  let migrated = 0;
  const updated = results.map((r) => {
    if (!r.fetchFailed && String(r.category || '').toLowerCase() !== 'fetch_failed') return r;
    migrated++;
    const { fetchFailed, failedAt, errorType, ...rest } = r;
    const cleanReason = String(r.reason || '').replace(/^\[(STREET VIEW|GEMINI)\]\s*/i, '').trim();
    const partial = salvagePartialJson(cleanReason);
    return attachTierRationale({
      ...rest,
      ...buildImageryConfirmedFallback(r.address, {
        satelliteResult: r.satelliteClassification,
        satGeocoded: r.satGeocoded,
        svPayload: r.viewMeta ? { view: r.viewMeta } : null,
        partialScore: partial?.score,
        err: { message: cleanReason }
      }),
      fetchFailed: false,
      analyzedAt: Date.now()
    });
  });
  if (migrated) {
    log(`Reclassified ${migrated} old failed/skipped result${migrated === 1 ? '' : 's'} — imagery was present`, 'success');
  }
  return updated;
}

R.migrateImageryFailuresToBlurred = function migrateImageryFailuresToBlurred(results) {
  let migrated = 0;
  const updated = results.map((r) => {
    if (r.manualOverride || r.reviewResolved) return r;
    const cat = resultCategory(r);
    if (r.landHomeConflict || r.satelliteConflict || r.needsReviewLater) return r;
    if (cat === 'blurred') {
      if (r.needsReview) {
        migrated++;
        return { ...r, needsReview: false };
      }
      return r;
    }
    if (cat !== 'unavailable' && !(r.qualityFlags || []).includes('analysis_incomplete')) return r;
    migrated++;
    return finalizeBlurredLead({
      ...r,
      needsReview: false
    });
  });
  if (migrated) {
    log(`Moved ${migrated} imagery-failure lead${migrated === 1 ? '' : 's'} from Needs Review to Blocked Image`, 'success');
  }
  return updated;
}

R.repairMisclassifiedResults = function repairMisclassifiedResults(results) {
  return results.map((r) => {
    if (r.manualOverride || r.reviewResolved) return r;
    const cat = resultCategory(r);
    if (cat !== 'unavailable' || r.landHomeConflict) return r;

    if (!r.skippedStreetView && r.score > 0) {
      return attachTierRationale({
        ...r,
        category: 'property',
        structureOnLot: true,
        landHomeConflict: false,
        satelliteConflict: false
      });
    }

    const sat = r.satelliteClassification;
    if (sat?.category === 'property' && sat.structureOnLot && (sat.confidence ?? 0) >= 65) {
      const repaired = {
        ...r,
        category: 'property',
        structureOnLot: true,
        score: applyScoreCalibration(
          Math.max(r.score || 0, sat.aerialDistressScore ?? 2),
          sat.indicators || r.indicators || [],
          'property'
        ),
        indicators: normalizeIndicators(sat.indicators || r.indicators),
        landHomeConflict: false,
        satelliteConflict: false
      };
      if (/cannot|unclear|unavailable|blocked|unsure/i.test(repaired.reason || '')) {
        repaired.reason = (sat.reason || repaired.reason || '').replace(/ \(No Street View.*\)/i, '').trim();
      }
      return attachTierRationale(repaired);
    }

    return r;
  });
}

R.processAddress = async function processAddress(address, svKey, gKey, workerNum = null, priorRecord = null) {
  const satUrl = buildSatelliteThumbUrl(address, svKey, CARD_SAT_THUMB_SIZE);
  const svUrl = buildStreetViewThumbUrl(address, svKey, STREET_VIEW_SIZE);

  scanPreview(address, 'Loading street imagery…', svUrl, null, null, true, workerNum);
  const svData = await fetchStreetViewImagery(address, svKey);

  if (svData.ok) {
    const svPayload = {
      base64: svData.base64,
      mimeType: svData.mimeType || 'image/jpeg',
      view: svData.view ? { ...svData.view, qualityFlags: svData.view.qualityFlags || [] } : null,
      imagery: svData.imagery || null,
      cachedUrl: svData.cachedUrl || null
    };
    return finalizeStreetAnalysis(svPayload, svUrl, address, gKey, workerNum, svKey, priorRecord);
  }

  const svErr = svData.error || 'Street View unavailable';
  if (!isStreetViewConfirmedAbsent(svData)) {
    throw new Error('[STREET VIEW] ' + svErr);
  }

  log(`Street View unavailable — satellite fallback: ${address}`, 'warn');
  scanPreview(address, 'No Street View — loading satellite…', null, satUrl, null, true, workerNum);

  const satData = await fetchSatelliteImagery(address, svKey);
  if (!satData.ok) {
    if (!state.satelliteWarnShown && /static maps|satellite|403|denied/i.test(satData.error || '')) {
      state.satelliteWarnShown = true;
      showFatalError(`Satellite API issue: ${satData.error}. Enable Maps Static API in Google Cloud, then refresh and run Full System Test.`);
    }
    throw new Error('[STREET VIEW] No imagery available — ' + svErr);
  }

  scanPreview(address, 'Analyzing distress from satellite…', null, satUrl, null, true, workerNum);
  const satelliteResult = await classifyWithSatellite(
    satData.base64,
    satData.mimeType || 'image/png',
    gKey,
    address
  );
  const result = buildResultFromSatelliteOnly(satelliteResult, satData.geocoded, svErr);
  if (satData.imagery) result.imagery = satData.imagery;
  const tierLabel = leadTierLabel(result.leadTier);
  scanPreview(address, `${tierLabel} — ${result.reason}`, null, satUrl, result.category === 'property' ? result.score : 0, true, workerNum);
  return result;
}

R.processOneRecord = async function processOneRecord(record, svKey, gKey, workerNum = null, scanOpts = null) {
  const deferQueue = scanOpts && scanOpts.deferQueue;
  if (state.aborted) return null;

  const label = `${propertyLocationTitle(record)} — ${record.address}`;
  const maxAttempts = 5;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (state.aborted) return null;
    await waitForRateLimit();

    updateAgentSlot(workerNum, {
      active: true,
      address: shortAgentAddress(record.address, record),
      status: attempt > 1 ? `Retry ${attempt}/${maxAttempts}…` : 'Claimed property…',
      phase: 'working'
    });

    try {
      const analysis = await processAddress(record.address, svKey, gKey, workerNum, record);
      const result = attachTierRationale({
        ...record,
        ...analysis,
        aiScore: analysis.category === 'property' ? analysis.score : null,
        qualityFlags: analysis.qualityFlags || [],
        viewMeta: analysis.viewMeta || null,
        analyzedAt: Date.now()
      });
      result.aiTierAtScan = resultLeadTier(result);
      if (!result.imagery) {
        cachePropertyImageryBackground(result, {
          includeSatellite: analysis.usedSatellite || analysis.skippedStreetView
        });
      }
      noteApiScanSuccess?.();
      state.results.push(result);
      state.succeeded++;
      state.processed = state.results.length;
      if (state.running && state.scanBatchTotal > 0) {
        state.scanBatchDone = Math.min(
          state.scanBatchTotal,
          (Number(state.scanBatchDone) || 0) + 1
        );
      }
      pushIncrementalScanResult(result, state.processed);
      const tier = resultLeadTier(result);
      log(`✓ ${label} — ${leadTierLabel(tier)}`, 'success');
      onResultAdded(result);
      const urls = getPropertyImageUrls(record.address, result);
      if (state.running && state.pinnedKey === '__live__' && state.pinnedLiveAddress === record.address) {
        pinProperty(result);
      } else if (state.running && state.pinnedKey === recordKey(result)) {
        showInspector(result, { scrollFeed: false, scrollList: false });
      }
      updateAgentSlot(workerNum, {
        active: false,
        status: `Done — ${leadTierLabel(tier)}`,
        phase: 'done'
      });
      if (state.running) scheduleThrottledUi();
      else updateProgress();
      setTimeout(() => {
        if (!state.agentSlots[workerNum]?.active && state.running) {
          updateAgentSlot(workerNum, { status: 'Standing by', phase: 'idle', address: '' });
        }
      }, 1200);
      return { address: label, status: result.reason, streetViewUrl: urls.streetView, satelliteUrl: urls.satellite, score: result.score };
    } catch (err) {
      lastErr = err;
      const maybeTransport = isServerConnectionError(err.message)
        || /imagery request failed/i.test(String(err.message || ''));
      if (maybeTransport) {
        const st = await pingServerStatus();
        if (st) {
          serverOnline = true;
          serverOfflineStreak = 0;
          clearServerOfflineFatalBanner();
          if (attempt < maxAttempts) {
            log(`↻ ${label} — brief network blip, retrying (${attempt}/${maxAttempts})…`, 'warn');
            await sleep(2000 * attempt + Math.floor(Math.random() * 1500));
            continue;
          }
        } else if (!state.serverStopAlertShown) {
          serverOnline = false;
          updateServerOfflineBanner();
          state.serverStopAlertShown = true;
          state.aborted = true;
          const msg = 'Local server is not responding. Double-click "Property Distress Analyzer" on your desktop, wait a few seconds, refresh, then click Start.';
          showFatalError(msg);
          log('Scan stopped — local server is not responding', 'error');
          alert(`Scan stopped — the local server is not responding.\n\n${msg}`);
          break;
        }
      }
      // Hard quota → stop immediately (do not burn retries / fail streak).
      if (isHardQuotaError(err.message)) {
        const provider = typeof apiProviderFromError === 'function'
          ? apiProviderFromError(err.message)
          : (/street|maps|over_query|billing/i.test(String(err.message || '')) ? 'maps' : 'gemini');
        if (!state.quotaHaltShown) {
          haltScanForQuota(provider, err.message, { kind: 'quota' });
        }
        break;
      }
      // Transient: back off and retry. Do NOT increment apiFailStreak per attempt —
      // that used to halt the whole scan after ~2 flaky addresses (5 retries × 2).
      if (attempt < maxAttempts && isTransientError(err.message)) {
        noteRateLimit(err);
        if (state.aborted) break;
        log(`↻ ${label} — busy, retrying (${attempt}/${maxAttempts})…`, 'warn');
        await sleep(4000 * attempt + Math.floor(Math.random() * 2000));
        continue;
      }
      break;
    }
  }

  // API dead / quota / aborted — leave this address unscanned so Start Scan can resume it
  if (state.aborted || state.quotaHaltShown) {
    updateAgentSlot(workerNum, {
      active: false,
      status: 'Paused — API',
      phase: 'idle',
      address: ''
    });
    if (state.running) scheduleThrottledUi();
    return null;
  }

  if (lastErr && isHardQuotaError(lastErr.message)) {
    const provider = typeof apiProviderFromError === 'function'
      ? apiProviderFromError(lastErr.message)
      : 'gemini';
    haltScanForQuota(provider, lastErr.message, { kind: 'quota' });
    return null;
  }
  if (lastErr) {
    const deferDisk = isDiskSpaceError?.(lastErr.message) && deferQueue && !state.aborted;
    const deferRate = isDeferrableRateLimitError?.(lastErr.message) && deferQueue && !state.aborted;
    if (deferDisk) {
      noteDiskSpaceError?.(lastErr.message);
      deferQueue.push(record);
      log(`⏸ ${label} — server disk full; cleanup + retry this run (not marked scanned)`, 'warn');
      updateAgentSlot(workerNum, {
        active: false,
        status: 'Waiting — disk cleanup',
        phase: 'idle',
        address: ''
      });
      if (state.running) scheduleThrottledUi();
      return null;
    }
    if (deferRate) {
      noteRateLimit(lastErr);
      deferQueue.push(record);
      log(`⏸ ${label} — Gemini/Google busy; will retry this run (not marked scanned)`, 'warn');
      updateAgentSlot(workerNum, {
        active: false,
        status: 'Waiting — API busy',
        phase: 'idle',
        address: ''
      });
      if (state.running) scheduleThrottledUi();
      return null;
    }
    noteRateLimit(lastErr);
    if (state.aborted) return null;
    noteApiScanFailure?.(lastErr.message, apiProviderFromError?.(lastErr.message));
    if (state.aborted) return null;
  }
  const cat = categorizeError(lastErr?.message);
  if (cat === 'streetview') state.failStreetView++;
  else if (cat === 'gemini') state.failGemini++;
  const reviewResult = buildNeedsReviewResult(record, lastErr);
  state.results.push(reviewResult);
  state.processed = state.results.length;
  if (state.running && state.scanBatchTotal > 0) {
    state.scanBatchDone = Math.min(
      state.scanBatchTotal,
      (Number(state.scanBatchDone) || 0) + 1
    );
  }
  pushIncrementalScanResult(reviewResult, state.processed);
  syncResultCounters();
  updateAgentSlot(workerNum, {
    active: false,
    status: 'Needs review',
    phase: 'done'
  });
  log(`⚠ ${label} — Needs review: ${reviewResult.reason}`, 'warn');
  updateFailStats();
  notifyScanIssue('failure', `${label}: ${reviewResult.reason}`, {
    title: 'Property flagged Needs Review',
    dedupeKey: `failure-${state.failStreetView + state.failGemini}`,
    browserNotify: (state.failStreetView + state.failGemini) % 5 === 1
  });
  onResultAdded(reviewResult);
  if (state.running) scheduleThrottledUi();
  else updateProgress();
  setTimeout(() => {
    if (!state.agentSlots[workerNum]?.active && state.running) {
      updateAgentSlot(workerNum, { status: 'Standing by', phase: 'idle', address: '' });
    }
  }, 1200);
  return null;
}

R.processBatch = async function processBatch(batch, batchNum, svKey, gKey, concurrentLimit) {
  $('statBatch').textContent = batchNum;
  let batchPreview = null;
  let idx = 0;
  const resultsBefore = state.results.length;
  const deferQueue = [];
  const scanOpts = { deferQueue };

  async function worker(workerNum) {
    await sleep(workerNum * 80);
    while (idx < batch.length && !state.aborted) {
      const i = idx++;
      const preview = await processOneRecord(batch[i], svKey, gKey, workerNum, scanOpts);
      if (preview) batchPreview = preview;
      await sleep(200);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrentLimit, batch.length) }, (_, n) => worker(n))
  );

  // Retry addresses deferred by soft rate limits (still unscanned — no Needs Review row).
  let deferRound = 0;
  while (deferQueue.length && !state.aborted && deferRound < 4) {
    deferRound += 1;
    const round = deferQueue.splice(0, deferQueue.length);
    log(`Retrying ${round.length} address(es) after API pause (round ${deferRound})…`, 'warn');
    await waitForRateLimit();
    await sleep(3000 + deferRound * 2000);
    const retryWorkers = Math.min(2, getEffectiveConcurrentLimit(), round.length);
    let ridx = 0;
    async function deferWorker(wNum) {
      while (ridx < round.length && !state.aborted) {
        const ri = ridx++;
        const preview = await processOneRecord(round[ri], svKey, gKey, wNum, scanOpts);
        if (preview) batchPreview = preview;
        await sleep(400);
      }
    }
    await Promise.all(
      Array.from({ length: retryWorkers }, (_, n) => deferWorker(n))
    );
  }
  if (deferQueue.length && !state.aborted) {
    log(`${deferQueue.length} still waiting on API — left unscanned for next Start Scan`, 'warn');
    deferQueue.length = 0;
  }

  const newResults = state.results.slice(resultsBefore);
  const batchPressureFailed = countBatchPressureFailuresInSlice(newResults);
  const failRatio = batch.length ? batchPressureFailed / batch.length : 0;
  if (batch.length >= 4 && batchPressureFailed >= Math.ceil(batch.length * 0.25)) {
    // Batch-level failure pressure — hard step-down (also resets healthy streak)
    scaleDownWorkers?.(
      `${batchPressureFailed}/${batch.length} imagery/analysis issues this batch`,
      { hard: true }
    );
  } else if (batch.length >= 4 && failRatio <= 0.1) {
    // Clean-ish batch while throttled → climb back toward operator max
    maybeScaleUpWorkers?.();
  } else {
    // Mixed batch: don't climb, don't punish
    adaptiveHealthyStreak = 0;
  }

  if (batchPreview) {
    showPreview(batchPreview.address, batchPreview.status, batchPreview.streetViewUrl, batchPreview.satelliteUrl, batchPreview.score, false);
  }
  scheduleSaveSession('scan-batch');
  // Mid-run durable checkpoint so stop/refresh keeps finished addresses
  if (state.scanBatchDone > 0 && state.scanBatchDone % 10 === 0) {
    persistScanProgressNow?.('scan-batch');
  }
}

/**
 * Start Street View + Gemini scan for unscanned import queue.
 * Extracted so Scan Ready button can call it directly (not only via hidden startBtn).
 */
R.startScanAnalysis = async function startScanAnalysis() {
  if (state.running) {
    alert('Scan already running — use Stop first if it looks stuck.');
    return;
  }
  try {
    // Keys live in server .env (no client-side saveKeys) — never call a removed helper here.
    if (startBtn) startBtn.disabled = true;
    if (scanReadyStartBtn) scanReadyStartBtn.disabled = true;

    if (USE_PROXY) {
      const hint = $('startBlockHint');
      if (hint) {
        hint.textContent = 'Connecting to local server…';
        hint.hidden = false;
      }
      const st = await waitForServerReady({ attempts: 12, delayMs: 1500 });
      if (!st) {
        serverOnline = false;
        updateServerOfflineBanner();
        alert('Server not responding.\n\nDouble-click "Property Distress Analyzer" on your desktop (no window needs to stay open), wait a few seconds, refresh this page, then click Start again.');
        updateStartButton();
        updateScanReadyUi?.();
        return;
      }
      serverOnline = true;
      serverOfflineStreak = 0;
      clearServerOfflineFatalBanner();
      updateServerOfflineBanner();
      updateStartButton();
    }
    // Large sessions only load results by default — pull unscanned records before scan
    if (USE_PROXY && !(state.records || []).length) {
      const hint = $('startBlockHint');
      if (hint) {
        hint.textContent = 'Loading leads for scan…';
        hint.hidden = false;
      }
      const loaded = await ensureScanRecordsLoaded?.();
      updateScanReadyUi?.();
      updateStartButton();
      if (!loaded || !(state.records || []).length) {
        alert(
          'Could not load leads into the scan queue.\n\n' +
          'Hard-refresh (Ctrl+Shift+R). If you are not on the admin account, switch to admin — the New Analyzer Leads were imported there.'
        );
        updateStartButton();
        updateScanReadyUi?.();
        return;
      }
    }
    const blockReason = getStartBlockReason();
    if (blockReason) {
      alert(blockReason);
      updateStartButton();
      updateScanReadyUi?.();
      return;
    }
    if (!serverConfig.hasMapsKey || !serverConfig.hasGeminiKey || !state.records.length) {
      alert('Cannot start — configure .env keys or upload leads. Refresh the page and try again.');
      updateStartButton();
      updateScanReadyUi?.();
      return;
    }
    const svKey = '';
    const gKey = '';

    abortSessionBackgroundLoad();
    state.running = true;
    // Live scan must recompute KPIs from growing results, not stale server snapshot
    delete state._tierCountsFromServer;
    delete state._geoFromServer;
    tierCountsCache = null;
    tierCountsCacheKey = '';
    updateScanReadyUi?.();
    if (state.results.length >= 2500) {
      log(
        `Large session (${state.results.length.toLocaleString()} analyzed) — saves are throttled during scan to keep the server stable. Progress still logs to disk every property.`,
        'warn'
      );
    }
    startScanSaveHeartbeat();
    pushScanSessionMeta();
    state.aborted = false;
    state.haltAlertShown = false;
    state.serverStopAlertShown = false;
    state.serverStopAlertShown = false;
    state.satelliteWarnShown = false;
    state.rateLimitWarned = false;
    state.diskSpaceWarned = false;
    state.quotaHaltShown = false;
    state.apiFailStreak = 0;
    if (USE_PROXY && typeof requestDiskCleanup === 'function') {
      requestDiskCleanup().catch(() => {});
    }
    state.apiHaltReason = null;
    firstErrorShown = false;
    errorBanner?.classList.remove('visible');
    rateLimitUntil = 0;
    adaptiveConcurrentCap = null;
    adaptiveHealthyStreak = 0;
    resetScanIssueState();
    setHudStatus('ACTIVE', true);
    updateScanRunningUi();
    setAgentPanelCollapsed(true);
    showScanStartedAlert();
    startServerStatusPolling();
    initAgentSlots(getEffectiveConcurrentLimit());
    // Prefer address-level dedupe — use full server index when browser only has partial results
    const expectedTotal = Math.max(
      Number(sessionLoadState?.total) || 0,
      Number(sessionLoadState?.serverCanonical) || 0,
      Number(state._tierCountsFromServer?.total) || 0
    );
    const resultsPartial = expectedTotal > 0 && (state.results || []).length < expectedTotal;
    if (resultsPartial && typeof fetchServerAddressIndex === 'function') {
      await fetchServerAddressIndex();
    }
    const known = typeof buildKnownAddressSets === 'function'
      ? buildKnownAddressSets(state.results, state._serverAddressIndex)
      : { exact: new Set(), loose: new Set() };
    const existingRecordKeys = new Set();
    for (const r of state.results || []) {
      existingRecordKeys.add(recordKey(r));
    }
    let skippedDupAtStart = 0;
    const pending = state.records.filter((r) => {
      if (existingRecordKeys.has(recordKey(r))) {
        skippedDupAtStart += 1;
        return false;
      }
      if (typeof isRowAlreadyKnown === 'function' && isRowAlreadyKnown(r, known)) {
        skippedDupAtStart += 1;
        return false;
      }
      return true;
    });
    // Keep scan queue clean for credits — remove skipped dups from records
    if (skippedDupAtStart > 0) {
      state.records = pending.slice();
      state._pendingUnscanned = pending.length;
    }
    const resumeCount = state.results.length;
    // Track THIS sheet's progress separately from historical session totals
    state.scanBaselineResults = resumeCount;
    state.scanBatchTotal = pending.length;
    state.scanBatchDone = 0;

    if (!pending.length) {
      log('All addresses already analyzed — open results to review', 'success');
      if (skippedDupAtStart) {
        log(`Skipped ${skippedDupAtStart.toLocaleString()} duplicates already in the system`, 'warn');
      }
      alert(
        skippedDupAtStart
          ? `All ${skippedDupAtStart.toLocaleString()} imported addresses were already scanned.\n\nNothing new to run — open Review Leads to work existing results.`
          : 'No unscanned leads in the queue.\n\nImport a new spreadsheet, then click Start Scan.'
      );
      state.running = false;
      state.scanBatchTotal = 0;
      state.scanBatchDone = 0;
      stopScanSaveHeartbeat();
      updateStartButton();
      updateScanReadyUi?.();
      if (state.results.length) enterReviewMode();
      return;
    }
    if (skippedDupAtStart > 0) {
      log(
        `Skipping ${skippedDupAtStart.toLocaleString()} already-scanned addresses (saving Maps/Gemini credits)`,
        'warn'
      );
    }

    // Session total scanned (for saves) — NOT used as "X of Y this sheet"
    state.processed = resumeCount;
    syncResultCounters();
    log(
      `This list: ${pending.length.toLocaleString()} to scan` +
      (resumeCount ? ` · session already has ${resumeCount.toLocaleString()} saved` : ''),
      'success'
    );
    state.failStreetView = 0;
    state.failGemini = 0;
    state.selectedKey = null;
    state.pinnedKey = null;
    state.pinnedLiveAddress = null;
    state.scanLiveSnapshot = null;
    state.scoreEditKey = null;
    closePropertyModal({ save: false });
    updateScanPinUi();
    // failStats is optional legacy chrome — never throw if missing
    $('failStats')?.classList.remove('visible');
    progressSection?.classList.remove('review-minimal');
    collapseSetup(true);
    state.appView = 'dashboard';
    updateScanFeedUi();
    updateAppNav();
    updateCommandBar();

    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (scanReadyStartBtn) scanReadyStartBtn.disabled = true;
    updateExportButtons();
    progressSection?.classList.add('active');
    if (!resumeCount) {
      if (logPanel) logPanel.innerHTML = '';
      resetVirtualScrollDom?.();
      if (cardsGrid) cardsGrid.innerHTML = '';
      if (resultsBody) resultsBody.innerHTML = '';
    }
    const pctEl = $('progressPct');
    if (pctEl) {
      pctEl.textContent = `${Math.round((resumeCount / Math.max(1, state.records.length)) * 100)}%`;
    }
    updateGauge(null);
    updateGauge(null, false, 'scan');
    updateProgress();
    saveSession();
    if (resumeCount > 0) {
      log(`Resuming — ${countSuccessfulResults().toLocaleString()} good leads kept, ${pending.length.toLocaleString()} to scan`, 'success');
    }
    // Short warmup only for large fresh runs (was up to 20s — felt like "nothing happened")
    if (pending.length > 50 && resumeCount === 0) {
      const waitSec = Math.min(6, 2 + Math.floor(pending.length / 1000));
      log(`Gemini warmup ${waitSec}s before fresh bulk scan…`, 'warn');
      await sleep(waitSec * 1000);
      if (state.aborted) {
        state.running = false;
        stopScanSaveHeartbeat();
        updateStartButton();
        updateScanReadyUi?.();
        return;
      }
    }
    const concurrentLimit = getEffectiveConcurrentLimit();
    if (getConcurrentLimit() > MAX_SAFE_CONCURRENT) {
      log(`Parallel workers capped at ${MAX_SAFE_CONCURRENT} to reduce mass skips`, 'warn');
    }
    const estPerMin = concurrentLimit * 2.5;
    const estHours = pending.length / (estPerMin * 60);
    log(`Analyzing ${pending.length} addresses — ${concurrentLimit} parallel workers (est. ${estHours < 1 ? Math.round(estHours * 60) + ' min' : estHours.toFixed(1) + ' hrs'})`);

    try {
      const batches = [];
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        batches.push(pending.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        if (state.aborted) break;
        await processBatch(batches[i], i + 1, svKey, gKey, getEffectiveConcurrentLimit());
        if (state.aborted) break;
      }
    } catch (err) {
      log(`Scan error: ${err.message}`, 'error');
      console.error(err);
      showFatalError(`Scan stopped: ${err.message}. Refresh the page and click Start again.`);
    }

    flushThrottledUi(true);
    hideLiveTierAlert();
    resetDisplayLimit();
    cardsGrid?.querySelector('.results-scan-cap-hint')?.remove();
    await renderResultsProgressive();

    state.running = false;
    stopScanSaveHeartbeat();
    markSessionResultsReady();
    state.pinnedKey = null;
    state.pinnedLiveAddress = null;
    stopServerStatusPolling();
    updateScanPinUi();
    updateScanFeedUi();
    if (stopBtn) stopBtn.disabled = true;
    updateExportButtons();
    updateStartButton();
    updateScanReadyUi?.();
    updateCommandBar();

    const failed = state.haltAlertShown;
    if (!failed) {
      setHudStatus(state.aborted ? 'ABORTED' : 'COMPLETE', !!state.results.length);
    }

    if (failed) {
      showPreview('', `Failed — ${state.succeeded} done before error`, null);
      log(`Stopped due to error. ${state.succeeded} succeeded before failure.`, 'error');
      if (state.results.length) {
        enterReviewMode();
      }
    } else if (state.aborted) {
      showPreview('', `Stopped — ${state.succeeded} analyzed`, null);
      log('Analysis stopped by user', 'error');
      if (state.results.length) {
        enterReviewMode();
      }
    } else {
      const reviewCount = countFailedResults();
      if (reviewCount || state.failStreetView || state.failGemini) {
        notifyScanIssue('complete_issues',
          `${reviewCount.toLocaleString()} need review (${state.failStreetView} Street View, ${state.failGemini} Gemini failures). Scan otherwise complete.`,
          { title: 'Scan complete — some issues', dedupeKey: 'complete_issues', browserNotify: true }
        );
      }
      log(`Finished. ${state.succeeded.toLocaleString()} properties analyzed.`, 'success');
      if (state.results.length) {
        enterReviewMode();
      } else {
        showPreview('', 'Complete — no results', null);
      }
    }
    updateExportButtons();
    pushScanSessionMeta();
    state.processed = (state.results || []).length;
    const saveReason = state.aborted ? 'scan-stop' : 'scan-complete';
    saveSession(saveReason);
    flushPendingServerSave(saveReason);
    flushSaveSession({ sync: true, force: true, reason: saveReason });
    persistScanProgressNow?.(saveReason);
    // Keep batch counters for UI until next start (shows what finished after stop)
    if (!state.aborted) {
      state.scanBatchDone = state.scanBatchTotal || state.scanBatchDone;
    }
    updateScanReadyUi?.();
    updateLiveScanSectionUi?.();
  } catch (err) {
    console.error('[startScanAnalysis] failed', err);
    state.running = false;
    stopScanSaveHeartbeat?.();
    if (stopBtn) stopBtn.disabled = true;
    persistScanProgressNow?.('scan-error');
    updateStartButton();
    updateScanReadyUi?.();
    alert(`Could not start scan: ${err?.message || err}\n\nHard-refresh (Ctrl+Shift+R) and try again.`);
  }
};

startBtn?.addEventListener('click', () => {
  startScanAnalysis();
});

stopBtn?.addEventListener('click', () => {
  if (typeof requestStopScan === 'function') {
    requestStopScan();
    return;
  }
  state.aborted = true;
  stopBtn.disabled = true;
  log('Stopping after current properties finish…');
});


R.runResortWellMaintainedFromUrl = function runResortWellMaintainedFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get('resortWellMaintained') !== '1') return;
  history.replaceState({}, '', location.pathname);
  setTimeout(() => migrateLowDistressToWellMaintained(), 800);
}

window.__distressAnalyzer = {
  resortWellMaintained: migrateLowDistressToWellMaintained,
  demoteFalseWellMaintained: () => demoteFalseWellMaintainedToLight(),
  getStatus: () => ({
    running: state.running,
    distressed: state.results.filter(r => resultLeadTier(r) === 'distressed').length,
    well: state.results.filter(r => resultLeadTier(r) === 'well_maintained').length,
    total: state.results.length
  }),
  countWouldPromote: () => state.results.filter(r => shouldPromoteLowDistressToWellMaintained(r)).length,
  countWouldDemote: () => state.results.filter(r => shouldDemoteWellMaintainedRecord(r)).length,
  findByAddress: (query) => state.results
    .filter(r => addressMatchesQuery(r.address, query))
    .map(r => ({
      address: r.address,
      tier: resultLeadTier(r),
      score: r.score,
      aerial: r.satelliteClassification?.aerialDistressScore,
      reason: (r.reason || '').slice(0, 160)
    }))
};

R.initAppShell = function initAppShell() {
  const cmdPalette = $('cmdPalette');
  const cmdPaletteInput = $('cmdPaletteInput');
  const cmdPaletteList = $('cmdPaletteList');
  const cmdPaletteBackdrop = $('cmdPaletteBackdrop');
  const cmdToastStack = $('cmdToastStack');
  let cmdActiveIndex = 0;
  let cmdFiltered = [];

  const cmdActions = [
    { label: 'Start scan', hint: 'Begin property analysis', run: () => (scanReadyStartBtn || startBtn)?.click(), when: () => (scanReadyStartBtn || startBtn) && !(scanReadyStartBtn || startBtn).disabled },
    { label: 'Stop scan', hint: 'Halt current batch', run: () => stopBtn?.click(), when: () => stopBtn && !stopBtn.disabled },
    { label: 'Upload spreadsheet', hint: 'Load Excel file', run: () => openUploadModal() },
    { label: 'Export all leads (Excel)', hint: 'Full spreadsheet — all leads in database', run: () => exportResults('xlsx', { scope: 'all', profile: 'full' }), when: () => sidebarExportExcelBtn && !sidebarExportExcelBtn.disabled },
    { label: 'Export current list (CSV)', hint: 'Uses active filter & search', run: () => exportResults('csv', { scope: 'current' }), when: () => sidebarExportCsvBtn && !sidebarExportCsvBtn.disabled },
    { label: 'Export database (Excel)', hint: 'All leads — dial-ready columns', run: () => exportResults('xlsx', { scope: 'all', profile: 'dial_ready' }), when: () => state.results.length > 0 && !state.running },
    { label: 'Search leads', hint: 'Focus results search', keys: '/', run: () => resultSearch?.focus() },
    { label: 'API Keys', hint: 'Keys and workers', run: () => openSettingsModal() },
    { label: 'AI Brain', hint: 'Learned tier rules', run: () => openBrainModal() },
    { label: 'Export backup now', hint: 'Full server checkpoint + download JSON', run: () => $('exportBackupNowBtn')?.click() },
    { label: 'Load backup JSON', hint: 'Restore session from file', run: () => $('loadBackupBtn')?.click() },
    { label: 'Download session backup', hint: 'Timestamped JSON export', run: () => sidebarSaveBackupBtn?.click(), when: () => !!sidebarSaveBackupBtn },
    { label: 'Distressed', hint: 'Quick tier review', run: () => openReviewMode('distressed'), when: () => sidebarReviewDistressedBtn && !sidebarReviewDistressedBtn.disabled },
    { label: 'Well Maintained', hint: 'Quick tier review', run: () => openReviewMode('well_maintained'), when: () => sidebarReviewWellMaintainedBtn && !sidebarReviewWellMaintainedBtn.disabled },
    { label: 'Land', hint: 'Vacant lot / land queue', run: () => openReviewMode('vacant'), when: () => sidebarReviewLandBtn && !sidebarReviewLandBtn.disabled },
    { label: 'Blocked Image', hint: 'Blurry / blocked Street View', run: () => openReviewMode('blurred'), when: () => (state.results || []).length > 0 },
    { label: 'Manual Review', hint: 'Uncertain residual queue', run: () => openReviewMode('review'), when: () => sidebarReviewNeedsReviewBtn && !sidebarReviewNeedsReviewBtn.disabled },
    { label: 'Filter: All leads', run: () => setFilter('all') },
    { label: 'Filter: Distressed', run: () => setFilter('distressed') },
    { label: 'Filter: Well Maintained', run: () => setFilter('well_maintained') },
    { label: 'Filter: Vacant lots', run: () => setFilter('vacant') },
    { label: 'Filter: Needs review', run: () => setFilter('review') },
    { label: 'Go to overview', run: () => scanReadySection?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    { label: 'Review leads', hint: 'Open review queue', run: () => reviewLeadsBtn?.click(), when: () => reviewLeadsBtn && !reviewLeadsBtn.disabled },
  ];

  window.showUiToast = (msg) => {
    if (!cmdToastStack || !msg) return;
    const t = document.createElement('div');
    t.className = 'cmd-toast';
    t.textContent = msg;
    cmdToastStack.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  };

  window.closeCmdPalette = () => {
    cmdPalette?.classList.remove('open');
    if (cmdPalette) cmdPalette.hidden = true;
    if (cmdPaletteInput) cmdPaletteInput.value = '';
    syncToolModalOverflow();
  };

  const openCmdPalette = () => {
    if (state.reviewMode || !cmdPalette) return;
    closeAllToolModals();
    cmdPalette.hidden = false;
    cmdPalette.classList.add('open');
    document.body.style.overflow = 'hidden';
    cmdActiveIndex = 0;
    renderCmdList('');
    cmdPaletteInput?.focus();
  };

  const renderCmdList = (q) => {
    const query = String(q || '').trim().toLowerCase();
    cmdFiltered = cmdActions.filter((a) => {
      if (a.when && !a.when()) return false;
      if (!query) return true;
      return a.label.toLowerCase().includes(query) || String(a.hint || '').toLowerCase().includes(query);
    });
    cmdActiveIndex = Math.min(cmdActiveIndex, Math.max(0, cmdFiltered.length - 1));
    if (!cmdPaletteList) return;
    cmdPaletteList.innerHTML = cmdFiltered.length
      ? cmdFiltered.map((a, i) => `<button type="button" class="cmd-palette-item${i === cmdActiveIndex ? ' active' : ''}" data-cmd-idx="${i}" role="option"><span>${escapeHtml(a.label)}</span>${a.keys ? `<kbd>${escapeHtml(a.keys)}</kbd>` : ''}</button>`).join('')
      : '<div style="padding:1rem;color:var(--text-dim);font-size:0.85rem;">No matching commands</div>';
  };

  const runCmd = (idx) => {
    const a = cmdFiltered[idx];
    if (!a) return;
    closeCmdPalette();
    a.run();
  };

  cmdPaletteBackdrop?.addEventListener('click', closeCmdPalette);
  cmdPaletteInput?.addEventListener('input', () => { cmdActiveIndex = 0; renderCmdList(cmdPaletteInput.value); });
  cmdPaletteInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdActiveIndex = Math.min(cmdActiveIndex + 1, cmdFiltered.length - 1); renderCmdList(cmdPaletteInput.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdActiveIndex = Math.max(cmdActiveIndex - 1, 0); renderCmdList(cmdPaletteInput.value); }
    else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdActiveIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCmdPalette(); }
  });
  cmdPaletteList?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmd-idx]');
    if (btn) runCmd(Number(btn.dataset.cmdIdx));
  });

  function runSidebarAction(actionId) {
    if (actionId === 'openUploadModalBtn') openUploadModal();
    else if (actionId === 'openSettingsBtn') openSettingsModal();
    else if (actionId === 'openBrainBtn') openBrainModal();
    else if (actionId) {
      const el = $(actionId);
      if (el && !el.disabled) el.click();
    }
  }

  function scrollToLeadRankingsOrHub() {
    if (state.results.length && !state.locationFilter) {
      locationHub?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showUiToast?.('Pick a city or state to view leads');
      return;
    }
    $('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('.sidebar-nav-btn:not(.sidebar-nav-toggle)').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav-btn:not(.sidebar-nav-toggle)').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const actionId = btn.dataset.action;
      const scrollId = btn.dataset.scroll;
      if (actionId) runSidebarAction(actionId);
      if (scrollId === 'dashboard') scrollToLeadRankingsOrHub();
      else if (scrollId) $(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('.sidebar-submenu-btn[data-action], .sidebar-overflow-item[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      runSidebarAction(btn.dataset.action);
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (cmdPalette?.classList.contains('open')) closeCmdPalette();
      else openCmdPalette();
    }
  });

  $('agentGridCollapseBtn')?.addEventListener('click', () => {
    setAgentPanelCollapsed(!isAgentPanelCollapsed());
  });

  function applyScanLogUi(expanded) {
    const toggle = $('scanLogToggle');
    const panel = $('logPanel');
    if (!toggle || !panel) return;
    panel.hidden = !expanded;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.textContent = expanded ? 'Hide scan log' : 'Show scan log';
  }

  $('scanLogToggle')?.addEventListener('click', () => {
    const panel = $('logPanel');
    applyScanLogUi(!!panel?.hidden);
  });


  applyScanLogUi(false);

  $('commandWorkersStatus')?.addEventListener('click', () => {
    if (!state.running || !isAgentPanelCollapsed()) return;
    setAgentPanelCollapsed(false);
    $('agentGridPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

R.tickClock = function tickClock() {
  if (!hudClock) return;
  hudClock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
};
if (hudClock) {
  tickClock();
  setInterval(tickClock, 1000);
}

window.addEventListener('error', (e) => {
  console.error('App error', e.error || e.message);
});

try {
  if (window.DistressPersistence) {
    DistressPersistence.init({
      storageKey: PDA.config.STORAGE_KEY,
      useProxy: PDA.config.USE_PROXY,
      getPayload: () => PDA.session.buildSessionPayload(),
      isServerAuthoritative: () => USE_PROXY && serverOnline !== false,
      buildSummaryStub: (p) => PDA.session.buildSessionSummaryStub(p),
      applyPayload: (p) => PDA.session.applyPayloadWithUi(p),
      performSave: async ({ json, payload, reason, localOnly }) => {
        try {
          return await PDA.session.performLocalPersist(json, payload, { reason, localOnly });
        } catch (e) {
          lastSessionSaveError = e;
          lastSessionSaveRejected = false;
          sessionDirty = true;
          updateSessionSaveStatus();
          return { ok: false, error: e };
        }
      },
      readAllLocalCandidates: async () => {
        try {
          const browserCandidates = await readAllBrowserSessionCandidates();
          return browserCandidates.map((c) => ({ ...c, source: 'browser' }));
        } catch (e) {
          console.warn('Browser session read failed', e);
          return [];
        }
      },
      fetchServerBackup: () => PDA.session.fetchServerSessionBackup(),
      rankSession: (d) => PDA.session.sessionDataRank(d),
      onEmergencySave: () => {
        if (state.reviewMode) {
          if (typeof stashReviewProgress === 'function') stashReviewProgress(state.reviewFilter);
          if (typeof pushReviewMetadataToServer === 'function') {
            pushReviewMetadataToServer('beforeunload', { immediate: true });
          }
        }
      },
      onStatusChange: (st) => {
        sessionSaveInFlight = !!st.saveInFlight;
        if (st.lastSaveAt) lastSessionSaveAt = st.lastSaveAt;
        if (st.lastSaveError) {
          lastSessionSaveError = st.lastSaveError;
          if (st.lastSaveRejected != null) lastSessionSaveRejected = !!st.lastSaveRejected;
        } else if (!st.saveInFlight && !sessionDirty) {
          lastSessionSaveError = null;
          lastSessionSaveRejected = false;
        }
        updateSessionSaveStatus();
        if (st.lastPayloadBytes) {
          lastPayloadBytes = st.lastPayloadBytes;
          DistressPersistence.updateStorageIndicator(st.lastPayloadBytes);
        }
      }
    });
  }
  loadCorrections();
  loadLearnedBrain();
  initLeadTypeSelects();
  updateCommandBar();
  initAppShell();
  updateStartButton();
} catch (bootErr) {
  console.error('Startup init failed', bootErr);
}

R.resultsUiRendered = false;

R.bootstrapApp = async function bootstrapApp() {
  if (document.body.classList.contains('analyze-phuglee') && virtualScroll.initialized) {
    resetVirtualScrollDom();
  }
  if (document.body.classList.contains('analyze-phuglee')) {
    resetDisplayLimit();
  }
  resetBlockingUiOnLoad();
  const primed = primeSessionFromLocalStorage();
  if (primed) {
    mainWorkspace?.classList.add('visible');
    updateSummaryStats();
  }
  try {
    if (USE_PROXY && typeof fetchServerConfig === 'function') {
      try { await fetchServerConfig(); } catch (_) { /* proceed; thumbs refresh when config loads */ }
    }
    if (USE_PROXY && typeof fetchImageryIndexMap === 'function') {
      fetchImageryIndexMap().catch(() => {});
    }
    await loadSession();
    scheduleDeferredImageryHydrate();
    runResortWellMaintainedFromUrl();
    scheduleDeferredSessionMigration();
  } catch (e) {
    console.error('bootstrapApp failed', e);
    resetBlockingUiOnLoad();
  } finally {
    resetBlockingUiOnLoad();
    updateCommandBar();
    startServerStatusPolling();
    startAlwaysOnSafetyPolling();
    fetchApiUsage?.();
    wireApiUsageControls?.();
    updateStartButton();
    syncAdminUi?.();
    updateScanReadyUi?.();
    updateLocationHubUi?.();
    if (state.results.length) {
      updateSummaryStats();
      updateCommandBar();
      updateExportButtons();
      mainWorkspace?.classList.add('visible');
      if (!resultsUiRendered) {
        if (isAnalyzeLayout()) renderResults({ force: true });
        else await renderResultsProgressive();
      } else if (state.viewMode === 'cards' && shouldUseVirtualScroll()) renderVirtualCards();
      else refreshAllCardThumbs();
      preloadAnalyzeCardThumbs?.();
      setTimeout(() => runImageryMigrationIfNeeded(), 2500);
    }
  }
};
  R.syncAdminUi = function syncAdminUi() {
    const isAdmin = window.PhugleeSettings?.isAdmin?.() || (() => {
      try { return sessionStorage.getItem('phuglee_session') === 'admin'; } catch (_) { return false; }
    })();
    document.querySelectorAll('.sidebar-admin-only').forEach((el) => {
      el.hidden = !isAdmin;
      el.setAttribute('aria-hidden', isAdmin ? 'false' : 'true');
    });
  };

  window.addEventListener('phuglee-analyzer-action', (e) => {
    const action = e.detail?.action;
    if (action === 'api-keys') openSettingsModal();
    if (action === 'ai-brain') openBrainModal();
  });

  R.bootstrapApp();
}
  PDA.app = {
    get initAppShell() { return R.initAppShell; },
    get bootstrapApp() { return R.bootstrapApp; }
  };
})(window);
