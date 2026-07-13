// scan.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.ensureReviewTrainingBuffer = function ensureReviewTrainingBuffer() {
  if (!R.reviewTrainingBuffer) {
    const factory = (typeof PDA !== 'undefined' && PDA.lib?.reviewTraining?.createReviewTrainingBuffer);
    R.reviewTrainingBuffer = factory ? factory() : {
      setPending() { return false; },
      takePending() { return null; },
      clearPending() {},
      markCommitted() {},
      getCommitted() { return null; },
      clearCommitted() {},
      shouldDedupeGemini() { return false; },
      reset() {},
      pendingCount() { return 0; }
    };
  }
  return R.reviewTrainingBuffer;
};

R.resetReviewTrainingBuffer = function resetReviewTrainingBuffer() {
  R.ensureReviewTrainingBuffer().reset();
};

R.getReviewTrainingGeminiMode = function getReviewTrainingGeminiMode() {
  const mode = String(state.reviewTrainingGeminiMode || 'metadata').toLowerCase();
  return ['off', 'metadata', 'full'].includes(mode) ? mode : 'metadata';
};

R.commitReviewTrainingForKey = function commitReviewTrainingForKey(key) {
  if (!key) return null;
  const buf = R.ensureReviewTrainingBuffer();
  const action = buf.takePending(key);
  if (!action) return null;

  let event = null;
  if (action.type === 'affirmation') {
    event = R.captureAffirmationEvent(action.record, action.tier, { ...(action.opts || {}), deferTraining: false });
  } else if (action.type === 'tier_change') {
    if (action.scorePayload) recordScoreCorrection(action.scorePayload);
    if (action.tierPayload) recordTierCorrection(action.tierPayload);
    event = R.captureCorrectionEvent(
      action.record,
      action.fromTier,
      action.toTier,
      { ...(action.opts || {}), deferTraining: false }
    );
  }

  buf.markCommitted(key, {
    eventId: event?.id || null,
    address: action.record?.address || null,
    type: action.type
  });
  return event;
};

R.rollbackReviewTrainingForKey = function rollbackReviewTrainingForKey(key, address) {
  if (!key) return;
  const buf = R.ensureReviewTrainingBuffer();
  buf.clearPending(key);
  const committed = buf.getCommitted(key);
  if (!committed) return;

  const pop = PDA.lib?.reviewTraining?.popLastMatching;
  const addr = String(address || committed.address || '').slice(0, 80);
  const recent = committed.committedAt ? committed.committedAt - 30000 : 0;

  if (typeof pop === 'function') {
    const ev = pop(correctionEvents, (e) => {
      if (e.superseded) return false;
      if (committed.eventId && e.id === committed.eventId) return true;
      if (e.recordKey === key && (e.at || 0) >= recent) return true;
      return false;
    });
    if (ev) ev.superseded = true;
    pop(tierCorrections, (c) => addr && String(c.address || '').slice(0, 80) === addr && (c.at || 0) >= recent);
    pop(scoreCorrections, (c) => addr && String(c.address || '').slice(0, 80) === addr && (c.at || 0) >= recent);
  } else if (committed.eventId) {
    const ev = correctionEvents.find((e) => e.id === committed.eventId);
    if (ev) ev.superseded = true;
  }

  buf.clearCommitted(key);
  saveLearnedBrain();
  saveCorrections();
};

R.cancelReviewTrainingForKey = function cancelReviewTrainingForKey(key) {
  if (!key) return;
  R.ensureReviewTrainingBuffer().clearPending(key);
};

R.captureAffirmationEvent = function captureAffirmationEvent(record, confirmedTier, opts = {}) {
  const tier = normalizeLeadTier(confirmedTier);
  if (!tier || tier === 'vacant' || tier === 'unavailable') return null;
  if (resultCategory(record) !== 'property') return null;

  if (opts.deferTraining) {
    R.ensureReviewTrainingBuffer().setPending(recordKey(record), {
      type: 'affirmation',
      record,
      tier,
      opts: {
        source: opts.source || 'review_mode',
        autoApprove: opts.autoApprove,
        userNote: opts.userNote
      }
    });
    return null;
  }

  const aiScore = record.aiScore ?? record.score;
  const aiTier = normalizeLeadTier(
    record.aiTierAtScan || (aiScore != null
      ? computeLeadTier(aiScore, 'property', leadTierContextFromRecord(record))
      : tier)
  );
  const userScore = Math.round(Number(record.score)) || scoreForTier(tier);

  recordTierAffirmation({
    aiTier,
    confirmedTier: tier,
    aiScore,
    userScore,
    indicators: record.indicators,
    satellite: record.satelliteClassification,
    address: record.address
  });

  const event = {
    id: nextCorrectionEventId(),
    kind: 'affirmation',
    recordKey: recordKey(record),
    address: (record.address || '').slice(0, 120),
    fromTier: aiTier,
    toTier: tier,
    affirmedTier: tier,
    aiTier,
    aiScore,
    aiReason: (record.reason || '').slice(0, 400),
    indicators: normalizeIndicators(record.indicators).slice(0, 8),
    satellite: record.satelliteClassification || null,
    userNote: (opts.userNote || inferAffirmationMeaning(tier)).slice(0, 320),
    inferredMeaning: inferAffirmationMeaning(tier),
    batchId: opts.batchId || null,
    source: opts.source || 'review_mode',
    reviewed: false,
    at: Date.now()
  };
  correctionEvents.push(event);
  if (correctionEvents.length > 200) correctionEvents = correctionEvents.slice(-200);
  saveLearnedBrain({ silent: !!state.reviewMode });
  queueCorrectionReview(event, opts);
  return event;
}

R.captureCorrectionEvent = function captureCorrectionEvent(record, fromTier, toTier, opts = {}) {
  const from = normalizeLeadTier(fromTier);
  const to = normalizeLeadTier(toTier);
  if (!from || !to || from === to) return null;

  if (opts.deferTraining) {
    const aiScore = record.aiScore ?? record.score;
    const parsed = scoreForTier(to);
    R.ensureReviewTrainingBuffer().setPending(recordKey(record), {
      type: 'tier_change',
      record,
      fromTier: from,
      toTier: to,
      scorePayload: {
        aiScore,
        userScore: parsed,
        indicators: record.indicators,
        address: record.address
      },
      tierPayload: {
        aiTier: from,
        userTier: to,
        aiScore,
        userScore: parsed,
        indicators: record.indicators,
        satellite: record.satelliteClassification,
        address: record.address
      },
      opts: {
        source: opts.source || 'review_mode',
        autoApprove: opts.autoApprove,
        batchId: opts.batchId || null,
        userNote: opts.userNote
      }
    });
    return null;
  }

  const aiScore = record.aiScore ?? record.score;
  const aiTier = record.aiTierAtScan || (aiScore != null
    ? computeLeadTier(aiScore, 'property', leadTierContextFromRecord(record))
    : from);
  const event = {
    id: nextCorrectionEventId(),
    recordKey: recordKey(record),
    address: (record.address || '').slice(0, 120),
    fromTier: from,
    toTier: to,
    aiTier: normalizeLeadTier(aiTier),
    aiScore,
    aiReason: (record.reason || '').slice(0, 400),
    indicators: normalizeIndicators(record.indicators).slice(0, 8),
    satellite: record.satelliteClassification || null,
    userNote: (opts.userNote || inferCorrectionMeaning(from, to)).slice(0, 320),
    inferredMeaning: inferCorrectionMeaning(from, to),
    batchId: opts.batchId || null,
    source: opts.source || null,
    reviewed: false,
    at: Date.now()
  };
  correctionEvents.push(event);
  if (correctionEvents.length > 200) correctionEvents = correctionEvents.slice(-200);
  saveLearnedBrain({ silent: !!state.reviewMode });
  queueCorrectionReview(event, opts);
  return event;
}

R.salvageReviewJson = function salvageReviewJson(text) {
  try {
    const block = extractJsonBlock(text);
    return JSON.parse(repairJsonString(block));
  } catch (_) {
    return null;
  }
}

R.reviewCorrectionEvent = async function reviewCorrectionEvent(event) {
  if (!USE_PROXY) return null;
  if (!serverConfig.hasGeminiKey) return null;
  const record = findRecordForCorrectionEvent(event);
  const sat = event.satellite || {};
  const { images, labels } = record ? await fetchCorrectionImagery(record) : { images: [], labels: [] };
  const visionBlock = images.length
    ? `PROPERTY PHOTOS ATTACHED (${labels.join(' + ')}):
Study the ACTUAL images — roof footprint, yard condition, junk/debris, boarded windows, overgrown grass, abandoned vehicles, tarp, peeling paint.
The human looked at these photos and moved tier from "${event.fromTier}" to "${event.toTier}". Your rule must reflect VISIBLE cues you see, not only the AI metadata below.
Image order: ${images.map((img, i) => `${i + 1}=${img.label}`).join(', ')}`
    : `NO PHOTOS ATTACHED — infer rule from AI metadata and distress signal tags only.`;

  const prompt = `You analyze property tier corrections for a Driving for Dollars wholesaling tool.
A human moved a home from "${event.fromTier}" to "${event.toTier}".

${visionBlock}

TIER CHANGE MEANING (authoritative — do not ask the user why):
${event.inferredMeaning || inferCorrectionMeaning(event.fromTier, event.toTier)}
- distressed → well_maintained = good/manicured home, NOT distress
- well_maintained → distressed = any visible wear or neglect (grass-cut through heavy)

AI metadata from original scan:
- ai_tier: ${event.aiTier}
- ai_score: ${event.aiScore}
- reason: ${event.aiReason || 'n/a'}
- indicators: ${(event.indicators || []).join(', ') || 'none'}
- satellite roof: ${sat.roofCondition || 'unknown'}
- satellite yard: ${sat.yardCondition || 'unknown'}
- aerial_distress_score: ${sat.aerialDistressScore ?? 'n/a'}

Explain why AI disagreed with the human tier move (cite what you see in photos if attached).
Propose ONE executable rule for future scans using distress signals that match what is visible.
NEVER weaken rules for boarded_windows, boarded_doors, structural_damage, fire_or_water_damage, or clear junk piles.

Respond ONLY valid JSON:
{"mistake_summary":"...","overweighted_signals":[],"underweighted_signals":[],"visual_cues_seen":["..."],"proposed_rule":"one sentence","tier_definition_addition":"one sentence","confidence":0-100,"executable":{"fromTiers":["${event.fromTier}"],"toTier":"${event.toTier}","when":{"aerialDistressScore_lte":2,"satelliteYard_in":["good","fair"],"indicators_exclude":["junk_or_hoarding_yard","boarded_windows","abandoned_vehicles"],"reason_contains_any":["well-maintained","manicured"]},"never_when_indicators":["boarded_windows","structural_damage","junk_or_hoarding_yard"]}}`;

  try {
    if (images.length) {
      log(`Review training — analyzing ${labels.join(' + ')} photos for ${(event.address || '').slice(0, 50)}…`, 'success');
    }
    const text = await callGeminiVision(null, null, null, prompt, 1024, images);
    const parsed = salvageReviewJson(text);
    if (!parsed?.proposed_rule) return null;
    event.reviewed = true;
    event.review = parsed;
    event.reviewedWithVision = images.length > 0;
    saveLearnedBrain();
    return parsed;
  } catch (err) {
    log(`Rule review skipped: ${err.message}`, 'warn');
    return null;
  }
}

R.reviewAffirmationEvent = async function reviewAffirmationEvent(event) {
  if (!USE_PROXY) return null;
  if (!serverConfig.hasGeminiKey) return null;
  const record = findRecordForCorrectionEvent(event);
  const tier = normalizeLeadTier(event.affirmedTier || event.toTier);
  const sat = event.satellite || {};
  const { images, labels } = record ? await fetchCorrectionImagery(record) : { images: [], labels: [] };
  const visionBlock = images.length
    ? `PROPERTY PHOTOS ATTACHED (${labels.join(' + ')}):
The human CONFIRMED tier "${tier}" is correct (AI got it right). Study visible cues that justify staying at this tier.
Image order: ${images.map((img, i) => `${i + 1}=${img.label}`).join(', ')}`
    : `NO PHOTOS ATTACHED — infer rule from AI metadata and distress signal tags only.`;

  const prompt = `You analyze property tier confirmations for a Driving for Dollars wholesaling tool.
A human reviewed a home and KEPT the AI tier "${tier}" (confirmed correct — no change needed).

${visionBlock}

CONFIRMATION MEANING (authoritative):
${event.inferredMeaning || inferAffirmationMeaning(tier)}
- well_maintained confirmed = manicured/code-list false positive — future similar homes should stay Well Maintained (score 1-5)
- distressed confirmed = real distress signals — future similar homes should stay Distressed (score 6-10)

AI metadata from scan:
- ai_tier: ${event.aiTier}
- ai_score: ${event.aiScore}
- reason: ${event.aiReason || 'n/a'}
- indicators: ${(event.indicators || []).join(', ') || 'none'}
- satellite roof: ${sat.roofCondition || 'unknown'}
- satellite yard: ${sat.yardCondition || 'unknown'}
- aerial_distress_score: ${sat.aerialDistressScore ?? 'n/a'}

Propose ONE executable rule so future scans classify matching homes as "${tier}".
Use visible cues from photos when attached. NEVER weaken rules for boarded_windows, structural_damage, or clear junk.

Respond ONLY valid JSON:
{"mistake_summary":"...","overweighted_signals":[],"underweighted_signals":[],"visual_cues_seen":["..."],"proposed_rule":"one sentence","tier_definition_addition":"one sentence","confidence":0-100,"executable":{"fromTiers":["distressed","well_maintained"],"toTier":"${tier}","when":{"satelliteYard_in":["good"],"indicators_exclude":["junk_or_hoarding_yard"]},"never_when_indicators":["boarded_windows","structural_damage"]}}`;

  try {
    if (images.length) {
      log(`Review training — confirming ${labels.join(' + ')} photos for ${(event.address || '').slice(0, 50)}…`, 'success');
    }
    const text = await callGeminiVision(null, null, null, prompt, 1024, images);
    const parsed = salvageReviewJson(text);
    if (!parsed?.proposed_rule) return null;
    event.reviewed = true;
    event.review = parsed;
    event.reviewedWithVision = images.length > 0;
    saveLearnedBrain();
    return parsed;
  } catch (err) {
    log(`Affirmation review skipped: ${err.message}`, 'warn');
    return null;
  }
}

R.reviewCategoryCorrectionEvent = async function reviewCategoryCorrectionEvent(record, fromCategory, toCategory) {
  if (!USE_PROXY || !record) return null;
  if (!serverConfig.hasGeminiKey) return null;
  const sat = record.satelliteClassification || {};
  const { images, labels } = await fetchCorrectionImagery(record);
  const visionBlock = images.length
    ? `PROPERTY PHOTOS ATTACHED (${labels.join(' + ')}):
Look for roof/building footprint ON the subject lot vs open land (grass, dirt, trees only).
Human reclassified: ${fromCategory} → ${toCategory}. Rule must use visible structure footprint cues.`
    : `NO PHOTOS ATTACHED — use AI metadata only.`;

  const prompt = `You analyze category corrections for a Driving for Dollars wholesaling tool.
${visionBlock}

AI metadata:
- from_category: ${fromCategory}
- to_category: ${toCategory}
- ai_score: ${record.aiScore ?? record.score ?? 'n/a'}
- reason: ${(record.reason || '').slice(0, 400)}
- indicators: ${normalizeIndicators(record.indicators).join(', ') || 'none'}
- satellite roof: ${sat.roofCondition || 'unknown'}
- satellite yard: ${sat.yardCondition || 'unknown'}
- structure_on_lot: ${record.structureOnLot != null ? record.structureOnLot : 'unknown'}

Propose ONE executable category rule for future scans (vacant_lot vs property).
Weeds/junk on OPEN LAND without a roof = vacant_lot. Roof footprint on lot = property even if yard is trashed.

Respond ONLY valid JSON:
{"mistake_summary":"...","visual_cues_seen":["..."],"proposed_rule":"one sentence","confidence":0-100,"executable":{"fromCategories":["${fromCategory}"],"toCategory":"${toCategory}","when":{"aerialDistressScore_lte":1,"indicators_exclude":["structural_damage"],"reason_contains_any":["no structure","open land","vacant lot"]}}}`;

  try {
    if (images.length) {
      log(`Category training — analyzing ${labels.join(' + ')} photos for ${(record.address || '').slice(0, 50)}…`, 'success');
    }
    const text = await callGeminiVision(null, null, null, prompt, 896, images);
    const parsed = salvageReviewJson(text);
    if (!parsed?.proposed_rule) return null;
    return { review: parsed, withVision: images.length > 0 };
  } catch (err) {
    log(`Category rule review skipped: ${err.message}`, 'warn');
    return null;
  }
}

R.createPendingCategoryRuleFromReview = function createPendingCategoryRuleFromReview(record, review, fromCategory, toCategory) {
  if (!review?.proposed_rule) return null;
  const exe = review.executable;
  const when = exe?.when && typeof exe.when === 'object' ? { ...exe.when } : {};
  const rule = {
    id: nextLearnedRuleId(),
    status: 'pending',
    ruleType: 'category',
    fromCategories: Array.isArray(exe?.fromCategories) ? exe.fromCategories : [fromCategory],
    toCategory: exe?.toCategory || toCategory,
    fromTiers: [],
    toTier: null,
    when,
    proposedRule: review.proposed_rule,
    mistakeSummary: review.mistake_summary || '',
    confidence: Math.max(0, Math.min(100, Number(review.confidence) || 50)),
    sourceAddresses: [(record.address || '').slice(0, 120)],
    createdAt: Date.now(),
    approvedAt: null
  };
  learnedRules.push(rule);
  if (learnedRules.length > 120) learnedRules = learnedRules.slice(-120);
  saveLearnedBrain();
  return rule;
}

R.queueCategoryCorrectionReview = function queueCategoryCorrectionReview(record, fromCategory, toCategory, opts = {}) {
  correctionReviewQueue = correctionReviewQueue.then(async () => {
    const result = await reviewCategoryCorrectionEvent(record, fromCategory, toCategory);
    if (!result?.review) return;
    const rule = createPendingCategoryRuleFromReview(record, result.review, fromCategory, toCategory);
    if (!rule) return;
    rule.reviewedWithVision = result.withVision;
    if (opts.autoApprove && rule.confidence >= 70) {
      approveLearnedRule(rule.id);
      const visionTag = rule.reviewedWithVision ? ', photos' : '';
      log(`Category training — auto-approved (${rule.confidence}%${visionTag}) · ${categoryLabel(fromCategory)} → ${categoryLabel(toCategory)}`, 'success');
    } else {
      log(`Category training — proposed rule pending (${categoryLabel(fromCategory)} → ${categoryLabel(toCategory)})`, 'warn');
    }
  }).catch(() => {});
}

R.validateRuleExecutable = function validateRuleExecutable(exe, event) {
  if (!exe || !exe.toTier) return null;
  const when = exe.when && typeof exe.when === 'object' ? { ...exe.when } : {};
  if (exe.never_when_indicators) when.never_when_indicators = exe.never_when_indicators;
  return {
    fromTiers: Array.isArray(exe.fromTiers) ? exe.fromTiers.map(normalizeLeadTier) : [event.fromTier],
    toTier: normalizeLeadTier(exe.toTier),
    when
  };
}

R.validateRuleAgainstEvents = function validateRuleAgainstEvents(rule) {
  const fromTiers = (rule.fromTiers || []).map(normalizeLeadTier);
  const toTier = normalizeLeadTier(rule.toTier);
  const related = correctionEvents.filter(e =>
    fromTiers.includes(normalizeLeadTier(e.fromTier)) && toTier === normalizeLeadTier(e.toTier)
  );
  if (!related.length) return { pass: 0, total: 0, label: '—' };
  let pass = 0;
  for (const ev of related.slice(-12)) {
    const fake = {
      score: ev.aiScore ?? 3,
      leadTier: ev.fromTier,
      indicators: ev.indicators,
      satelliteClassification: ev.satellite,
      reason: ev.aiReason,
      category: 'property'
    };
    if (recordMatchesLearnedWhen(fake, rule.when) && toTier === normalizeLeadTier(ev.toTier)) pass++;
  }
  const total = Math.min(related.length, 12);
  return { pass, total, label: `${pass}/${total}` };
}

R.createPendingRuleFromReview = function createPendingRuleFromReview(event, review) {
  const exe = validateRuleExecutable(review.executable, event);
  if (!exe) return null;
  const existing = learnedRules.find(r =>
    r.status === 'pending' &&
    r.fromTiers?.join() === exe.fromTiers.join() &&
    r.toTier === exe.toTier &&
    JSON.stringify(r.when) === JSON.stringify(exe.when)
  );
  if (existing) {
    existing.sourceEventIds = [...new Set([...(existing.sourceEventIds || []), event.id])];
    existing.sourceAddresses = [...new Set([...(existing.sourceAddresses || []), event.address])].slice(0, 8);
    if (event.reviewedWithVision) existing.reviewedWithVision = true;
    saveLearnedBrain();
    return existing;
  }
  const validation = validateRuleAgainstEvents({ ...exe, status: 'approved' });
  const rule = {
    id: nextLearnedRuleId(),
    status: 'pending',
    fromTiers: exe.fromTiers,
    toTier: exe.toTier,
    when: exe.when,
    proposedRule: review.proposed_rule,
    tierDefinition: review.tier_definition_addition || '',
    mistakeSummary: review.mistake_summary || '',
    confidence: Math.max(0, Math.min(100, Number(review.confidence) || 50)),
    sourceEventIds: [event.id],
    sourceAddresses: [event.address],
    validation,
    reviewedWithVision: !!event.reviewedWithVision,
    createdAt: Date.now(),
    approvedAt: null
  };
  learnedRules.push(rule);
  if (learnedRules.length > 120) learnedRules = learnedRules.slice(-120);
  saveLearnedBrain();
  return rule;
}

R.ruleWhenHasConstraints = function ruleWhenHasConstraints(when) {
  if (!when || typeof when !== 'object') return false;
  return Object.keys(when).some(k => {
    const v = when[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

R.buildMetadataFallbackReview = function buildMetadataFallbackReview(event) {
  const from = normalizeLeadTier(event.fromTier);
  const to = normalizeLeadTier(event.toTier);
  if (!from || !to || from === to) return null;

  const sat = event.satellite || {};
  const inds = normalizeIndicators(event.indicators);
  const roof = normalizeCondition(sat.roofCondition);
  const yard = normalizeCondition(sat.yardCondition);
  const aerial = sat.aerialDistressScore;
  const when = {};
  const cues = [];
  const hardNever = ['boarded_windows', 'boarded_doors', 'structural_damage', 'fire_or_water_damage', 'junk_or_hoarding_yard'];

  if (from === 'well_maintained' && to === 'distressed') {
    if (['fair', 'poor'].includes(roof)) {
      when.satelliteRoof_in = [roof];
      cues.push(`${roof} roof`);
    }
    if (['fair', 'poor'].includes(yard)) {
      when.satelliteYard_in = [yard];
      cues.push(`${yard} yard`);
    }
    if (aerial != null && aerial >= DISTRESSED_MIN_SCORE) {
      when.aerialDistressScore_gte = Math.max(DISTRESSED_MIN_SCORE, Math.floor(aerial));
      cues.push(`aerial ${aerial}+`);
    }
    const signalInds = inds.filter(i => !hardNever.includes(i));
    if (signalInds.length) {
      when.indicators_require = signalInds.slice(0, 3);
      cues.push(signalInds.slice(0, 2).map(k => INDICATOR_LABELS[k] || k.replace(/_/g, ' ')).join(', '));
    }
    when.never_when_indicators = hardNever;
    if (!ruleWhenHasConstraints(when)) return null;
    return {
      proposed_rule: cues.length
        ? `Review pick: ${cues.join(' + ')} → Distressed (visible wear AI missed on manicured-classified home).`
        : event.inferredMeaning,
      tier_definition_addition: 'Well Maintained only when satellite and street show manicured condition with no wear.',
      confidence: Math.min(78, 58 + cues.length * 7),
      executable: { fromTiers: [from], toTier: to, when, never_when_indicators: hardNever },
      metadataFallback: true
    };
  }

  if (from === 'distressed' && to === 'well_maintained') {
    if (roof === 'good') {
      when.satelliteRoof_in = ['good'];
      cues.push('good roof');
    }
    if (yard === 'good') {
      when.satelliteYard_in = ['good'];
      cues.push('good yard');
    }
    if (aerial != null && aerial <= WELL_MAINTAINED_MAX_SCORE) {
      when.aerialDistressScore_lte = Math.ceil(aerial);
      cues.push(`aerial ≤${aerial}`);
    }
    when.indicators_exclude = [...hardNever, 'abandoned_vehicles', 'overgrown_landscaping'];
    if (event.aiScore != null && event.aiScore <= WELL_MAINTAINED_MAX_SCORE) when.score_lte = WELL_MAINTAINED_MAX_SCORE;
    if (!ruleWhenHasConstraints(when)) return null;
    return {
      proposed_rule: cues.length
        ? `Review pick: ${cues.join(' + ')}, no junk/boarded → Well Maintained (false distress positive).`
        : event.inferredMeaning,
      tier_definition_addition: 'Normal code-list suburban homes with good satellite cues default to Well Maintained.',
      confidence: Math.min(76, 56 + cues.length * 7),
      executable: { fromTiers: [from], toTier: to, when },
      metadataFallback: true
    };
  }

  return null;
}

R.buildMetadataFallbackAffirmation = function buildMetadataFallbackAffirmation(event) {
  const tier = normalizeLeadTier(event.affirmedTier || event.toTier);
  if (!tier || tier === 'vacant' || tier === 'unavailable') return null;

  const sat = event.satellite || {};
  const inds = normalizeIndicators(event.indicators);
  const roof = normalizeCondition(sat.roofCondition);
  const yard = normalizeCondition(sat.yardCondition);
  const aerial = sat.aerialDistressScore;
  const when = {};
  const cues = [];
  const hardNever = ['boarded_windows', 'boarded_doors', 'structural_damage', 'fire_or_water_damage'];

  if (tier === 'well_maintained') {
    if (['good', 'fair'].includes(roof)) {
      when.satelliteRoof_in = [roof];
      cues.push(`${roof} roof`);
    }
    if (['good', 'fair'].includes(yard)) {
      when.satelliteYard_in = [yard];
      cues.push(`${yard} yard`);
    }
    if (aerial != null && aerial <= WELL_MAINTAINED_MAX_SCORE) {
      when.aerialDistressScore_lte = Math.ceil(aerial);
      cues.push(`aerial ≤${aerial}`);
    }
    when.indicators_exclude = [...hardNever, 'junk_or_hoarding_yard', 'abandoned_vehicles'];
    if (event.aiScore != null && event.aiScore <= WELL_MAINTAINED_MAX_SCORE) when.score_lte = WELL_MAINTAINED_MAX_SCORE;
    if (!ruleWhenHasConstraints(when)) return null;
    return {
      proposed_rule: cues.length
        ? `Review confirmed: ${cues.join(' + ')} → stay Well Maintained (score 1-5).`
        : event.inferredMeaning,
      tier_definition_addition: 'Confirmed manicured/code-list homes stay Well Maintained.',
      confidence: Math.min(74, 58 + cues.length * 6),
      executable: {
        fromTiers: ['well_maintained', 'distressed'],
        toTier: tier,
        when,
        never_when_indicators: [...hardNever, 'junk_or_hoarding_yard']
      },
      metadataFallback: true
    };
  }

  if (tier === 'distressed') {
    const signalInds = inds.filter(i => !hardNever.includes(i) || MODERATE_INDICATORS.has(i) || HIGH_INDICATORS.has(i));
    if (['fair', 'poor'].includes(roof)) {
      when.satelliteRoof_in = [roof];
      cues.push(`${roof} roof`);
    }
    if (['fair', 'poor'].includes(yard)) {
      when.satelliteYard_in = [yard];
      cues.push(`${yard} yard`);
    }
    if (aerial != null && aerial >= DISTRESSED_MIN_SCORE) {
      when.aerialDistressScore_gte = Math.max(DISTRESSED_MIN_SCORE, Math.floor(aerial));
      cues.push(`aerial ${aerial}+`);
    }
    if (signalInds.length) {
      when.indicators_require = signalInds.slice(0, 3);
      cues.push(signalInds.slice(0, 2).map(k => INDICATOR_LABELS[k] || k.replace(/_/g, ' ')).join(', '));
    }
    when.never_when_indicators = hardNever;
    if (!ruleWhenHasConstraints(when)) return null;
    return {
      proposed_rule: cues.length
        ? `Review confirmed: ${cues.join(' + ')} → stay Distressed (score 6-10).`
        : event.inferredMeaning,
      tier_definition_addition: 'Confirmed distress signals should remain Distressed.',
      confidence: Math.min(76, 58 + cues.length * 6),
      executable: {
        fromTiers: ['distressed', 'well_maintained'],
        toTier: tier,
        when,
        never_when_indicators: hardNever
      },
      metadataFallback: true
    };
  }

  return null;
}

R.queueCorrectionReview = function queueCorrectionReview(event, opts = {}) {
  if (!R._flushingReviewCorrections
    && state.reviewMode
    && (opts.source === 'review_mode' || event?.source === 'review_mode')) {
    if (!R._deferredCorrectionReviews) R._deferredCorrectionReviews = [];
    R._deferredCorrectionReviews.push({ event, opts });
    return;
  }
  correctionReviewQueue = correctionReviewQueue.then(async () => {
    if (opts.deferReview || event?.superseded) return;
    const isAffirmation = event.kind === 'affirmation';
    const geminiMode = getReviewTrainingGeminiMode();
    const dedupeKey = event.recordKey || event.address || '';
    if (dedupeKey && ensureReviewTrainingBuffer().shouldDedupeGemini(
      dedupeKey,
      isAffirmation ? 'affirmation' : 'tier_change'
    )) {
      return;
    }

    let review = null;
    let usedFallback = false;
    if (geminiMode === 'full') {
      review = isAffirmation
        ? await reviewAffirmationEvent(event)
        : await reviewCorrectionEvent(event);
    }
    if (!review && geminiMode !== 'off') {
      review = isAffirmation ? buildMetadataFallbackAffirmation(event) : buildMetadataFallbackReview(event);
      usedFallback = !!review;
    }
    if (!review) {
      log(`Training saved — ${isAffirmation ? 'tier confirmation' : 'tier pick'} recorded (no rule proposal)`, 'success');
      return;
    }
    if (!review) {
      log(`Training saved — ${isAffirmation ? 'tier confirmation' : 'tier pick'} recorded for next scan calibration`, 'success');
      return;
    }
    const rule = createPendingRuleFromReview(event, review);
    if (!rule) {
      log(`Training saved — ${isAffirmation ? 'tier confirmation' : 'tier pick'} recorded for next scan calibration`, 'success');
      return;
    }
    const fromReview = opts.source === 'review_mode' || event.source === 'review_mode';
    const minConfidence = fromReview ? 60 : 70;
    const canAutoApprove = opts.autoApprove
      && rule.confidence >= minConfidence
      && (usedFallback ? ruleWhenHasConstraints(rule.when) : true);
    if (canAutoApprove) {
      approveLearnedRule(rule.id, { skipSessionApply: true });
      const tag = event.reviewedWithVision ? ', photos' : usedFallback ? ', signals' : '';
      const verb = isAffirmation ? 'confirmed-tier rule' : 'rule';
      log(`Brain updated — auto-approved ${verb} (${rule.confidence}%${tag}) · ${leadTierLabel(rule.fromTiers[0])} → ${leadTierLabel(rule.toTier)}`, 'success');
    } else {
      log(`Brain training — proposed rule pending approval (${leadTierLabel(rule.fromTiers[0])} → ${leadTierLabel(rule.toTier)})`, 'warn');
    }
  }).catch(() => {});
}

R.reviewBulkCorrectionBatch = async function reviewBulkCorrectionBatch(batchId, fromTier, toTier, count, sampleEvent) {
  if (!sampleEvent || count < 2) return;
  const review = await reviewCorrectionEvent({
    ...sampleEvent,
    inferredMeaning: `${inferCorrectionMeaning(fromTier, toTier)} [Bulk: ${count} properties moved together.]`
  });
  if (!review) return;
  review.proposed_rule = `Bulk pattern (${count} homes): ${review.proposed_rule}`;
  createPendingRuleFromReview(sampleEvent, review);
  log(`Bulk training — 1 shared rule proposed for ${count} properties (approve in Learned Rules)`, 'warn');
}

R.recordMatchesLearnedWhen = function recordMatchesLearnedWhen(record, when) {
  if (!when || typeof when !== 'object') return true;
  const sat = record.satelliteClassification || {};
  const inds = normalizeIndicators(record.indicators);
  const reason = String(record.reason || '').toLowerCase();
  const score = resultScore(record);

  if (when.aerialDistressScore_lte != null && (sat.aerialDistressScore ?? 99) > when.aerialDistressScore_lte) return false;
  if (when.aerialDistressScore_gte != null && (sat.aerialDistressScore ?? -1) < when.aerialDistressScore_gte) return false;
  if (when.satelliteYard_in?.length && !when.satelliteYard_in.includes(normalizeCondition(sat.yardCondition))) return false;
  if (when.satelliteRoof_in?.length && !when.satelliteRoof_in.includes(normalizeCondition(sat.roofCondition))) return false;
  if (when.indicators_exclude?.some(i => inds.includes(i))) return false;
  if (when.indicators_require?.length && !when.indicators_require.every(i => inds.includes(i))) return false;
  if (when.reason_contains_any?.length && !when.reason_contains_any.some(p => reason.includes(String(p).toLowerCase()))) return false;
  if (when.never_when_indicators?.some(i => inds.includes(i))) return false;
  if (when.score_lte != null && score > when.score_lte) return false;
  if (when.score_gte != null && score < when.score_gte) return false;
  return true;
}

R.applyLearnedRuleToRecord = function applyLearnedRuleToRecord(record, rule) {
  const parsed = scoreForTier(rule.toTier);
  const baseReason = stripTierMigrationReasonSuffix(record.reason || '')
    .replace(/ Applied learned rule [^.]+\./g, '')
    .replace(/ You (set|bulk-set) distress level to [^.]+\./g, '')
    .trim();
  const updated = {
    ...record,
    score: clampScoreForTier(rule.toTier === 'well_maintained' ? 1 : parsed, rule.toTier),
    leadTier: rule.toTier,
    autoLearnedTier: true,
    appliedLearnedRuleId: rule.id
  };
  if (rule.toTier === 'well_maintained') updated.autoWellMaintained = true;
  else delete updated.autoWellMaintained;
  updated.reason = baseReason
    ? `${baseReason} Applied learned rule ${rule.id}.`
    : `Applied learned rule ${rule.id}.`;
  return attachTierRationale(updated);
}

R.applyLearnedTierRules = function applyLearnedTierRules(record) {
  if (!record || isTierLocked(record)) return record;
  if (resultCategory(record) !== 'property') return record;
  if (computeNeedsReview(record)) return record;
  const inds = normalizeIndicators(record.indicators);
  if (inds.some(i => HARD_NEVER_LEARN_INDICATORS.has(i))) return record;

  const approved = learnedRules.filter(r => r.status === 'approved');
  const currentTier = normalizeLeadTier(record.leadTier || resultLeadTier(record));

  for (const rule of approved) {
    const fromTiers = (rule.fromTiers || []).map(normalizeLeadTier);
    if (!fromTiers.includes(currentTier)) continue;
    if (!recordMatchesLearnedWhen(record, rule.when)) continue;
    const toTier = normalizeLeadTier(rule.toTier);
    if (toTier === currentTier) continue;
    const promotingFromWellMaintained =
      fromTiers.includes('well_maintained') && currentTier === 'well_maintained';
    if (toTier === 'distressed' && !promotingFromWellMaintained && !looksVisuallyDistressed(
      resultScore(record),
      record.indicators,
      record.satelliteClassification,
      combinedTierReason(record)
    )) continue;
    return applyLearnedRuleToRecord(record, { ...rule, toTier });
  }
  return record;
}

R.applyApprovedRulesToSession = function applyApprovedRulesToSession() {
  let changed = 0;
  state.results = state.results.map(r => {
    if (isTierLocked(r)) return r;
    const before = resultLeadTier(r);
    const updated = applyLearnedTierRules({ ...r });
    if (resultLeadTier(updated) !== before) changed++;
    return updated;
  });
  if (changed) {
    saveSession();
    renderResults({ force: true });
    updateSummaryStats();
    log(`Learned rules re-tiered ${changed} propert${changed === 1 ? 'y' : 'ies'} in this session`, 'success');
  }
  return changed;
}

R.approveLearnedRule = function approveLearnedRule(ruleId, opts = {}) {
  const rule = learnedRules.find(r => r.id === ruleId);
  if (!rule || rule.status !== 'pending') return;
  rule.status = 'approved';
  rule.approvedAt = Date.now();
  rule.validation = validateRuleAgainstEvents(rule);
  saveLearnedBrain({ silent: !!state.reviewMode });
  if (!opts.skipSessionApply && !state.reviewMode) applyApprovedRulesToSession();
  log(`Approved learned rule ${rule.id} — active on future scans`, 'success');
}

R.rejectLearnedRule = function rejectLearnedRule(ruleId) {
  const rule = learnedRules.find(r => r.id === ruleId);
  if (!rule) return;
  rule.status = 'rejected';
  saveLearnedBrain();
  log(`Rejected learned rule ${rule.id}`, 'warn');
}

R.learnedRuleArrowLabel = function learnedRuleArrowLabel(rule) {
  if (rule.ruleType === 'category') {
    const from = (rule.fromCategories || []).map(c => categoryLabel(c)).join('/') || '?';
    return `${from} → ${categoryLabel(rule.toCategory)}`;
  }
  return `${(rule.fromTiers || []).map(t => leadTierLabel(t)).join('/')} → ${leadTierLabel(rule.toTier)}`;
}

R.buildLearnedRulesNote = function buildLearnedRulesNote() {
  const approved = learnedRules.filter(r => r.status === 'approved');
  if (!approved.length) return '';
  const lines = approved.slice(-10).map(r => {
    const arrow = learnedRuleArrowLabel(r);
    const vision = r.reviewedWithVision ? ' [photo-trained]' : '';
    return `- [${r.id}]${vision} ${arrow}: ${r.proposedRule}`;
  });
  const defs = approved.filter(r => r.tierDefinition).slice(-4).map(r => r.tierDefinition);
  let note = `\nLEARNED RULES (approved by user — ${approved.length} total):\n`;
  note += lines.join('\n') + '\n';
  if (defs.length) note += `Tier definitions from corrections:\n- ${defs.join('\n- ')}\n`;
  return note;
}

R.renderLearnedRulesPanel = function renderLearnedRulesPanel() {
  if (!learnedRulesList) return;
  const pending = learnedRules.filter(r => r.status === 'pending');
  const approved = learnedRules.filter(r => r.status === 'approved');
  const rejected = learnedRules.filter(r => r.status === 'rejected').slice(-3);
  if (learnedRulesSub) {
    learnedRulesSub.textContent = `${approved.length} active · ${pending.length} pending approval · ${correctionEvents.length} training signals`;
  }
  const cards = [...pending, ...approved.slice(-6), ...rejected].map(rule => {
    const arrow = learnedRuleArrowLabel(rule);
    const val = rule.validation?.label ? ` · validates ${rule.validation.label}` : '';
    const btns = rule.status === 'pending'
      ? `<div class="learned-rule-btns">
          <button type="button" class="approve" data-approve-rule="${escapeHtml(rule.id)}">Approve</button>
          <button type="button" class="reject" data-reject-rule="${escapeHtml(rule.id)}">Reject</button>
        </div>`
      : '';
    return `<div class="learned-rule-card ${rule.status}">
      <div class="learned-rule-meta">${escapeHtml(rule.id)} · ${arrow} · ${rule.status}${val}</div>
      <div class="learned-rule-text">${escapeHtml(rule.proposedRule || rule.mistakeSummary || '')}</div>
      ${rule.mistakeSummary && rule.proposedRule ? `<div class="learned-rule-text" style="opacity:0.75;font-size:0.65rem;">${escapeHtml(rule.mistakeSummary)}</div>` : ''}
      ${btns}
    </div>`;
  });
  learnedRulesList.innerHTML = cards.length
    ? cards.join('')
    : '<div class="learned-rules-sub" style="margin-top:0.35rem;">Change a property tier — a proposed rule will appear here for approval.</div>';
  learnedRulesList.querySelectorAll('[data-approve-rule]').forEach(btn => {
    btn.addEventListener('click', () => approveLearnedRule(btn.dataset.approveRule));
  });
  learnedRulesList.querySelectorAll('[data-reject-rule]').forEach(btn => {
    btn.addEventListener('click', () => rejectLearnedRule(btn.dataset.rejectRule));
  });
}

R.exportLearnedBrain = function exportLearnedBrain() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    learnedRules,
    correctionEvents: correctionEvents.slice(-100)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `distress-learned-brain-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  log('Exported learned rules brain', 'success');
}

R.importLearnedBrainFile = function importLearnedBrainFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.learnedRules)) throw new Error('Invalid brain file');
      learnedRules = data.learnedRules;
      if (Array.isArray(data.correctionEvents)) {
        correctionEvents = [...correctionEvents, ...data.correctionEvents].slice(-200);
      }
      saveLearnedBrain();
      applyApprovedRulesToSession();
      log(`Imported ${learnedRules.length} learned rules`, 'success');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

R.buildStaticTierRules = function buildStaticTierRules() {
  return `
D4D TIER SYSTEM (two buckets: skip vs work):

SIGNAL RULE: List all visible distress indicators. Severe flags alone = distressed. Moderate flags need supporting neglect or score 6+ with multiple visible issues. Do not omit junk, broken windows, or heavy weeds just because the facade looks otherwise normal.

KEY QUESTION for every HOME: "Is this a dump house / clearly neglected property worth driving by?"
  → Genuinely manicured, occupied, cared-for suburban home → Well Maintained (score 1-5) lead_tier=well_maintained
  → Clear multi-signal neglect, boarded/structural damage, or dump-house pattern → Distressed (score 6-10) lead_tier=distressed

⚠️ DISTRESSED (score 6-10, lead_tier=distressed) — WORK LEADS — require strong evidence:
  ANY ONE ALONE = score 8+ distressed (severe):
• boarded_windows or boarded_doors
• structural_damage or fire_or_water_damage
• roof_damage_or_tarp (tarp, missing shingles, collapsed/sagging roof — NOT discoloration alone)
  COMBINATIONS = score 6+ distressed (moderate flags need support — never distress on one alone):
• junk_or_hoarding_yard + overgrown_landscaping, peeling_paint, deferred_maintenance, broken_windows, or abandoned_vehicles
• broken_windows + overgrown_landscaping, peeling_paint, deferred_maintenance, or junk
• abandoned_vehicles + junk, overgrown_landscaping, peeling_paint, or deferred_maintenance
• overgrown_landscaping + peeling_paint or deferred_maintenance
• peeling_paint + deferred_maintenance
• poor satellite yard + 2 cosmetic neglect flags
  DUMP HOUSE pattern (score 6-10 distressed):
• Debris/junk all over yard + weeds + dirty/heavily peeling exterior
• Trashed lot with multiple visible neglect signals

✨ WELL MAINTAINED (score 1-5, lead_tier=well_maintained) — DEFAULT for normal homes:
  • Manicured/mowed yard, intact windows, clean facade, occupied suburban home
  • Single moderate flag alone (one junk pile edge, one broken window, one old car) without supporting neglect → score 3-5
  • Single minor code-list flag (light grass, one gutter, code notice) → score 2-4
  • Fair/poor roof discoloration ONLY with tidy yard → score 3-5
  • When uncertain, still report visible indicators; score 6+ requires multiple neglect signals or any severe flag

🏜️ VACANT LOT (score 0, lead_tier=vacant):
  • No roof/structure footprint on subject lot — land, woods, empty pad, weeds on open ground
  • NEVER assign distress indicators or scores to bare land without a building

DECISION ORDER (first match wins):
  1. No structure footprint? → vacant_lot score 0
  2. Boarded, structural, fire/water, severe roof tarp? → score 8-10 distressed
  3. Moderate flag + supporting neglect combo (junk+weeds, broken+overgrowth, etc.)? → score 6-10 distressed
  4. 2+ cosmetic neglect signals (weeds+peeling, weeds+deferred) OR dump-house visuals? → score 6-10 distressed
  5. Otherwise normal/maintained or single isolated flag? → score 1-5 well_maintained

SATELLITE + STREET VIEW FUSION:
  • Satellite best for: footprint, roof tarp, yard junk piles, abandoned cars from above, poor yard
  • Street View best for: broken windows, peeling paint, boarded doors, code notices, facade neglect
  • Distress requires corroboration — single moderate flag in one view alone is NOT enough for score 6+
  • Neighbor distress NEVER counts — subject lot at marker/center frame only`;
}

R.applyScoreCalibration = function applyScoreCalibration(score, indicators, category, opts = {}) {
  if (normalizeCategory(category) !== 'property') return score;
  let s = Math.round(Number(score)) || 0;
  const inds = normalizeIndicators(indicators);
  const roofCond = opts.roofCondition;
  const yardCond = opts.yardCondition;
  const reason = opts.reason || '';

  const hasHigh = inds.some(i => HIGH_INDICATORS.has(i));
  const hasCode = inds.includes('code_violation_notice');
  const hasJunk = inds.includes('junk_or_hoarding_yard');
  const hasAbandoned = inds.includes('abandoned_vehicles');
  const hasOvergrown = inds.includes('overgrown_landscaping');
  const hasRoof = inds.includes('roof_damage_or_tarp');
  const hasBroken = inds.includes('broken_windows');
  const hasPeeling = inds.includes('peeling_paint');
  const hasDeferred = inds.includes('deferred_maintenance');
  const hasBoarded = inds.includes('boarded_windows') || inds.includes('boarded_doors');
  const moderateWithSupport = hasModerateWithSupportingNeglect(inds, reason);
  const neglectCombo = hasNeglectCombo(inds, reason);
  const manicured = qualifiesManicuredExemption(inds, roofCond, yardCond, reason);
  const softOrSingleModerate = !inds.length || inds.every(i =>
    WELL_MAINTAINED_SOFT_INDICATORS.has(i) || MODERATE_INDICATORS.has(i)
  );
  const singleModerateOnly = inds.some(i => MODERATE_INDICATORS.has(i))
    && !moderateWithSupport && !neglectCombo && !hasHigh && !hasBoarded;
  const grassOnly = (hasOvergrown || hasCode) && !hasHigh && !hasBoarded && !moderateWithSupport;

  // ── Force distressed floors — severe signals or proven combos only ──
  if (hasBoarded || hasHigh) return Math.max(s, 8);
  if (hasRoof && (roofCond === 'poor' || /tarp|missing shingles|collapsed|sagging/i.test(reason))) {
    return Math.max(s, 8);
  }
  if (hasJunk && hasAbandoned) return Math.max(Math.min(s, 9), 7);
  if (hasJunk && hasBroken) return Math.max(Math.min(s, 8), DISTRESSED_MIN_SCORE);
  if (hasJunk && hasOvergrown) return Math.max(Math.min(s, 8), DISTRESSED_MIN_SCORE);
  if (moderateWithSupport) return Math.max(Math.min(s, 7), DISTRESSED_MIN_SCORE);
  if (hasOvergrown && (hasPeeling || hasDeferred)) return Math.max(Math.min(s, 7), DISTRESSED_MIN_SCORE);
  if (hasPeeling && hasDeferred) return Math.max(Math.min(s, 6), DISTRESSED_MIN_SCORE);
  if ((yardCond === 'poor' || roofCond === 'poor') && countNeglectIndicators(inds) >= 2) {
    return Math.max(Math.min(s, 7), DISTRESSED_MIN_SCORE);
  }
  if (neglectCombo) return Math.max(Math.min(s, 7), DISTRESSED_MIN_SCORE);

  // ── Cap over-scored AI — single moderate or cosmetic-only → well_maintained ──
  if (manicured || (softOrSingleModerate && grassOnly && roofCond === 'good' && yardCond === 'good')) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (singleModerateOnly && !reasonSuggestsDumpHouse(reason)) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (!inds.length) {
    if (roofCond === 'good' && yardCond === 'good') return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
    if (roofCond === 'poor' || yardCond === 'poor') return Math.min(Math.max(s, 3), WELL_MAINTAINED_MAX_SCORE);
    if (roofCond === 'fair' || yardCond === 'fair') return Math.min(Math.max(s, 2), WELL_MAINTAINED_MAX_SCORE);
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (softOrSingleModerate && (roofCond === 'good' || yardCond === 'good')) return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  if (hasOvergrown && !hasPeeling && !hasDeferred && !hasBroken && !hasJunk && roofCond !== 'poor' && yardCond !== 'poor') {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (hasRoof && roofCond !== 'poor' && !hasJunk && !hasAbandoned && !hasBroken && !/tarp|missing shingles/i.test(reason)) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (hasBroken && !moderateWithSupport && !neglectCombo) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (hasJunk && !moderateWithSupport && !neglectCombo) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }
  if (hasAbandoned && !moderateWithSupport && !neglectCombo) {
    return Math.min(s, WELL_MAINTAINED_MAX_SCORE);
  }

  return s;
}

R.applyAerialScoreCalibration = function applyAerialScoreCalibration(satelliteResult) {
  if (!satelliteResult || normalizeCategory(satelliteResult.category) !== 'property') return satelliteResult;
  if (!satelliteResult.structureOnLot) return satelliteResult;
  let score = satelliteResult.aerialDistressScore;
  if (score == null || isNaN(score)) score = 2;
  score = applyScoreCalibration(score, satelliteResult.indicators, 'property', {
    roofCondition: satelliteResult.roofCondition,
    yardCondition: satelliteResult.yardCondition,
    reason: satelliteResult.reason
  });
  return { ...satelliteResult, aerialDistressScore: score };
}

R.mergeIndicatorSets = function mergeIndicatorSets(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const i of normalizeIndicators(list)) {
      if (!seen.has(i)) { seen.add(i); out.push(i); }
    }
  }
  return out;
}

R.fuseStreetAndAerialScore = function fuseStreetAndAerialScore(analysis, satelliteResult) {
  if (!satelliteResult || normalizeCategory(analysis.category) !== 'property') return analysis;
  const sat = applyAerialScoreCalibration(satelliteResult);
  const aerial = sat.aerialDistressScore ?? 0;
  const street = analysis.score || 0;
  const mergedInds = mergeIndicatorSets(analysis.indicators, sat.indicators);
  const aerialInds = normalizeIndicators(sat.indicators);
  const combinedReason = combinedTierReason(analysis, sat);
  const visuallyDistressed = looksVisuallyDistressed(street, mergedInds, sat, combinedReason);
  const aerialHasSevereDistress = aerialInds.some(i => HIGH_INDICATORS.has(i))
    || hasModerateWithSupportingNeglect(mergedInds, combinedReason)
    || hasNeglectCombo(mergedInds, combinedReason);
  let fused = street;
  if (visuallyDistressed || aerialHasSevereDistress) {
    fused = Math.max(street, aerial, DISTRESSED_MIN_SCORE);
  } else if (aerial <= WELL_MAINTAINED_MAX_SCORE && qualifiesManicuredExemption(mergedInds, sat.roofCondition, sat.yardCondition, combinedReason)) {
    fused = Math.min(street, WELL_MAINTAINED_MAX_SCORE);
  } else if (aerial <= 3 && street > 3 && mergedInds.every(i => WELL_MAINTAINED_SOFT_INDICATORS.has(i))) {
    fused = Math.min(fused, 3);
  }
  analysis.score = applyScoreCalibration(fused, mergedInds, 'property', {
    roofCondition: sat.roofCondition,
    yardCondition: sat.yardCondition,
    reason: combinedReason
  });
  analysis.indicators = mergedInds;
  analysis.leadTier = computeLeadTier(analysis.score, 'property', {
    indicators: analysis.indicators,
    satelliteClassification: sat,
    reason: analysis.reason
  });
  analysis.score = clampScoreForTier(analysis.score, analysis.leadTier);
  return analysis;
}

R.buildTierRationale = function buildTierRationale(r) {
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  const inds = normalizeIndicators(r.indicators);
  const indLabels = inds.map(i => INDICATOR_LABELS[i] || i.replace(/_/g, ' '));
  const parts = [];

  if (cat === 'vacant_lot') {
    return 'Vacant lot — no structure footprint on parcel. Yard weeds/debris on open land is NOT a distressed home.';
  }
  if (cat === 'unavailable') {
    return r.landHomeConflict
      ? 'Needs review — satellite and street view disagree on whether this is vacant land or a home.'
      : 'Needs review — could not determine if lot is vacant land or has a home.';
  }
  if (cat === 'blurred') {
    return 'Blocked image — cannot see or assess the home — tracked separately, not in the review queue.';
  }
  if (computeNeedsReview(r)) {
    parts.push('Needs review — confirm vacant land vs home.');
  }

  const hasHigh = inds.some(i => HIGH_INDICATORS.has(i));
  const hasCode = inds.includes('code_violation_notice');
  const hasJunk = inds.includes('junk_or_hoarding_yard');
  const hasAbandoned = inds.includes('abandoned_vehicles');
  const hasOvergrown = inds.includes('overgrown_landscaping');
  const hasRoof = inds.includes('roof_damage_or_tarp');
  const cosmeticOnly = inds.length > 0 && inds.every(i => COSMETIC_INDICATORS.has(i));
  const codeListOnly = hasCode && !hasHigh && !hasJunk && !hasAbandoned
    && inds.every(i => CODE_ONLY_INDICATORS.has(i));

  const s = resultScore(r);
  if (tier === 'well_maintained') {
    parts.push('Well Maintained: manicured/normal home — no junk, no broken windows, no abandoned cars, no dump-house neglect.');
    parts.push('Likely code-list false positive — skip unless you have other motivation.');
  } else if (tier === 'distressed') {
    if (hasHigh) parts.push('Distressed: critical flags (boarded, structural, or fire/water damage).');
    else if (hasJunk && hasAbandoned && hasOvergrown) parts.push('Distressed: junk + abandoned vehicles + severe yard neglect together.');
    else if (hasJunk && hasAbandoned) parts.push('Distressed: junk/hoarding plus abandoned vehicles — serious neglect.');
    else if (hasJunk && hasOvergrown) parts.push('Distressed: junk in yard plus overgrown landscaping — visible distress.');
    else if (hasJunk) parts.push(`Distressed: visible junk/debris${indLabels.length > 1 ? ' with ' + indLabels.filter(l => !/junk/i.test(l)).slice(0, 2).join(', ') : ''}.`);
    else if (s >= 7) parts.push(`Distressed: score ${s}/10 — visibly beat up, prioritize outreach.`);
    else if (s >= DISTRESSED_MIN_SCORE) parts.push(`Distressed: score ${s}/10 — drive-by worthy, work this lead.`);
    else if (codeListOnly || (hasCode && !hasJunk && !hasAbandoned && !hasHigh)) {
      parts.push('Distressed: code-list property — minor violation, lower priority.');
    } else if (cosmeticOnly) parts.push('Distressed: cosmetic yard/roof wear — lower priority unless motivated.');
    else if (hasOvergrown && !hasJunk && !hasAbandoned) parts.push('Distressed: tall grass/weeds — grass-cut lead.');
    else if (!inds.length) parts.push('Distressed: minor wear visible — lower priority unless other motivation.');
    else parts.push(`Distressed: ${indLabels.join(', ')}.`);
  }

  if (r.manualScore) parts.push('You adjusted this tier.');
  if (r.manualOverride) parts.push('You changed the category.');
  return parts.join(' ');
}

R.getTierRationaleShort = function getTierRationaleShort(r) {
  return buildTierRationale(r).replace(/\s+/g, ' ').trim();
}

R.attachTierRationale = function attachTierRationale(obj, opts = {}) {
  if (obj) {
    if (!opts.skipReconcile) reconcileLeadTier(obj);
    else if (obj.leadTier) obj.leadTier = normalizeLeadTier(obj.leadTier);
    if (typeof enrichClassificationFields === 'function') enrichClassificationFields(obj);
    obj.tierRationale = buildTierRationale(obj);
  }
  return obj;
}

R.SCAN_PROMPT_NOTE_MAX = 900;

R.trimPromptNote = function trimPromptNote(note) {
  const t = String(note || '').trim();
  if (t.length <= SCAN_PROMPT_NOTE_MAX) return t;
  return t.slice(0, SCAN_PROMPT_NOTE_MAX) + '\n…(calibration note truncated to save tokens)';
}

R.buildCalibrationNote = function buildCalibrationNote() {
  let note = '';
  if (scoreCorrections.length) {
    const lowers = scoreCorrections.filter(c => c.userScore < c.aiScore);
    const highers = scoreCorrections.filter(c => c.userScore > c.aiScore);
    const avgLower = lowers.length
      ? lowers.reduce((s, c) => s + (c.aiScore - c.userScore), 0) / lowers.length
      : 0;
    const roofLowers = lowers.filter(c => (c.indicators || []).includes('roof_damage_or_tarp')).length;
    const yardLowers = lowers.filter(c => (c.indicators || []).includes('overgrown_landscaping')).length;
    const examples = scoreCorrections.slice(-6).map(c => {
      const inds = (c.indicators || []).slice(0, 2).map(k => INDICATOR_LABELS[k] || k).join(', ');
      return `AI ${c.aiScore} → ${c.userScore}${inds ? ` (${inds})` : ''}`;
    });
    note += `\nUSER SCORE CALIBRATION (${scoreCorrections.length} corrections on this computer):\n`;
    if (lowers.length > highers.length && avgLower >= 0.5) {
      note += `- User scores ~${avgLower.toFixed(1)} points LOWER on cosmetic-only distress — manicured homes with light grass stay 1-5.\n`;
      if (roofLowers >= 5) note += `- Roof discoloration alone was over-scored ${roofLowers} times — use roof_damage_or_tarp ONLY for tarp/missing shingles.\n`;
      if (yardLowers >= 5) note += `- Overgrown yard ALONE on manicured homes was over-scored ${yardLowers} times — but junk/broken windows/abandoned cars must still score 6+.\n`;
      note += `- Do NOT under-score real dump houses: junk+weeds, broken+overgrowth, abandoned+junk, or boarded/structural = distressed 6+.\n`;
    } else if (highers.length > lowers.length) {
      note += `- User raised scores when dump-house signals (junk, broken windows, debris, heavy weeds + peeling) were under-weighted — classify these as distressed 6+.\n`;
    }
    note += `- Recent: ${examples.join('; ')}.\n`;
  }
  const toVacant = categoryCorrections.filter(c => c.toCategory === 'vacant_lot');
  if (toVacant.length) {
    note += `\nUSER CATEGORY CALIBRATION (${toVacant.length} vacant-lot corrections):\n`;
    note += `- User reclassified ${toVacant.length} AI "property" results as vacant lot — yard debris/weeds on open land without a house footprint is NOT a distressed home.\n`;
    note += `- Confirm structure_on_subject_lot before scoring; if no roof footprint, use vacant_lot score 0.\n`;
  }
  note += buildUserTierCalibrationNote();
  note += buildLearnedRulesNote();
  return trimPromptNote(note);
}

R.buildUserTierCalibrationNote = function buildUserTierCalibrationNote() {
  const manual = (state.results || []).filter(r => r.manualScore && resultCategory(r) === 'property');
  const fromCorrections = tierCorrections.length;
  if (!manual.length && !fromCorrections) {
    return `\nTIER CALIBRATION (reviewed lead list):\n` +
      `- ✨ Well Maintained = score 1-5 — normal/manicured homes; minor cosmetic wear; single moderate flag without supporting neglect.\n` +
      `- ⚠️ Distressed = score 6-10 — boarded/structural, or clear combos (junk+weeds, broken+overgrowth, abandoned+junk). Be conservative.\n`;
  }

  const toDistressed = manual.filter(r => normalizeLeadTier(r.leadTier) === 'distressed');
  const toWell = manual.filter(r => normalizeLeadTier(r.leadTier) === 'well_maintained');
  const poorRoofDistressed = toDistressed.filter(r => normalizeCondition(r.satelliteClassification?.roofCondition) === 'poor').length;
  const poorYardDistressed = toDistressed.filter(r => normalizeCondition(r.satelliteClassification?.yardCondition) === 'poor').length;
  const junkDistressed = toDistressed.filter(r => normalizeIndicators(r.indicators).includes('junk_or_hoarding_yard')).length;

  let note = `\nUSER TIER CALIBRATION (${manual.length} hand-sorted homes${fromCorrections ? `, ${fromCorrections} tier picks saved` : ''}):\n`;
  note += `- ✨ Well Maintained (${toWell.length}): code-list false positives — score 1-5, skip targets.\n`;
  note += `- ⚠️ Distressed (${toDistressed.length}): score 6-10 — junk (${junkDistressed}), boarded, abandoned cars, heavy neglect.\n`;
  note += `- Distressed (6+) triggers: boarded/structural, OR moderate flag + supporting neglect combo — NOT single moderate alone.\n`;
  note += `- Fair/poor roof/yard alone (no junk/broken windows) → Well Maintained (1-5).\n`;

  const affirmed = tierCorrections.filter(c => c.affirmed).length;
  if (affirmed) note += `- ${affirmed} review confirmations (Keep) saved — reinforce matching signals on future scans.\n`;
  const recent = tierCorrections.slice(-5).map(c => {
    const inds = (c.indicators || []).slice(0, 2).map(k => INDICATOR_LABELS[k] || k).join(', ');
    const arrow = c.affirmed ? `${c.userTier}✓` : `${c.aiTier}→${c.userTier}`;
    return `${arrow}${inds ? ` (${inds})` : ''}`;
  });
  if (recent.length) note += `- Recent tier picks: ${recent.join('; ')}.\n`;
  return note;
}

R.canEditScore = function canEditScore(r) {
  return resultCategory(r) === 'property';
}

R.openScoreEditModal = function openScoreEditModal(r) {
  if (!r || !canEditScore(r)) return;
  const tier = resultLeadTier(r);
  state.scoreEditRecordKey = recordKey(r);
  state.scoreEditSelectedTier = tier;
  if (scoreEditAddress) {
    scoreEditAddress.textContent = `${propertyStreetLine(r)} · ${propertyLocationTitle(r)}`;
  }
  if (scoreEditTierPicker) {
    scoreEditTierPicker.innerHTML = buildTierPickerHtml(tier, 'scoreEditPick');
    wireTierPicker(scoreEditTierPicker, (t) => { state.scoreEditSelectedTier = t; });
  }
  if (scoreEditAiNote) {
    if (r.aiScore != null) {
      const aiTier = tierFromScore(r.aiScore, 'property');
      if (r.aiScore !== resultScore(r)) {
        scoreEditAiNote.textContent = `AI picked ${leadTierLabel(aiTier)} — you have ${leadTierLabel(tier)}`;
        scoreEditAiNote.hidden = false;
      } else {
        scoreEditAiNote.textContent = `AI picked ${leadTierLabel(aiTier)}`;
        scoreEditAiNote.hidden = false;
      }
    } else {
      scoreEditAiNote.hidden = true;
    }
  }
  if (scoreEditModal) {
    scoreEditModal.hidden = false;
    scoreEditModal.classList.add('open');
  }
  document.body.style.overflow = 'hidden';
}

R.closeScoreEditModal = function closeScoreEditModal() {
  state.scoreEditRecordKey = null;
  state.scoreEditSelectedTier = null;
  scoreEditModal?.classList.remove('open');
  if (scoreEditModal) scoreEditModal.hidden = true;
  if (!state.propertyModalOpen && !imageLightbox.classList.contains('open')) {
    document.body.style.overflow = '';
  }
}

R.refreshOpenPropertyInspector = function refreshOpenPropertyInspector(updated) {
  if (state.propertyModalOpen && state.selectedKey === recordKey(updated)) {
    showInspector(updated, { scrollList: false, scrollFeed: false });
  }
}

R.cardQuickTierMoveHtml = function cardQuickTierMoveHtml(r) {
  if (resultCategory(r) !== 'property') return '';
  const tier = resultLeadTier(r);
  if (tier === 'well_maintained') {
    return '<button type="button" class="card-quick-tier-move to-distressed" data-move-tier="distressed">→ Move to Distressed</button>';
  }
  if (tier === 'distressed') {
    return '<button type="button" class="card-quick-tier-move to-well-maintained" data-move-tier="well_maintained">→ Move to Well Maintained</button>';
  }
  return '';
}

R.quickApplyTierFromCard = function quickApplyTierFromCard(r, targetTier) {
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return false;
  const prev = state.results[idx];
  if (resultCategory(prev) !== 'property') return false;
  if (!PROPERTY_TIERS.includes(targetTier)) return false;
  const beforeTier = resultLeadTier(prev);
  if (beforeTier === targetTier) return false;
  const updated = mutateTierOnRecord(prev, targetTier, { source: 'card_quick_move', autoApprove: true });
  if (!updated) return false;
  const baseReason = (updated.reason || '').replace(/ You bulk-set distress level to [^.]+\./g, '');
  updated.reason = `${baseReason} You set distress level to ${leadTierLabel(targetTier)}.`;
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  saveSession();
  saveLearnedBrain();
  updateSummaryStats();
  renderResults({ force: !state.running });
  if (state.selectedKey === recordKey(updated)) refreshOpenPropertyInspector(updated);
  return true;
}

R.applyScoreCorrection = function applyScoreCorrection(r, tierOrScore) {
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return;
  const cat = resultCategory(r);
  if (cat !== 'property') {
    alert('Level adjustment only applies to homes/properties — not vacant lots.');
    return;
  }
  let tier;
  if (PROPERTY_TIERS.includes(tierOrScore)) {
    tier = tierOrScore;
  } else {
    const parsed = Math.round(Number(tierOrScore));
    if (isNaN(parsed) || parsed < 0 || parsed > 10) {
      alert('Pick a distress level.');
      return;
    }
    tier = computeLeadTier(parsed, 'property');
  }
  const oldTier = resultLeadTier(state.results[idx]);
  const updated = mutateTierOnRecord(state.results[idx], tier);
  if (!updated) {
    state.scoreEditKey = null;
    closeScoreEditModal();
    refreshOpenPropertyInspector(state.results[idx]);
    return;
  }
  const baseReason = (updated.reason || '').replace(/ You bulk-set distress level to [^.]+\./g, '');
  updated.reason = `${baseReason} You set distress level to ${leadTierLabel(tier)}.`;
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  state.scoreEditKey = null;
  saveSession();
  renderResults();
  closeScoreEditModal();
  refreshOpenPropertyInspector(updated);
  log(`Level set: ${contactName(updated)} — ${leadTierLabel(oldTier)} → ${leadTierLabel(tier)} (reviewing change for learning)`, 'success');
}

R.wireScoreEditClick = function wireScoreEditClick(el, r) {
  if (!el || !canEditScore(r)) return;
  el.classList.add('score-editable');
  el.title = 'Click to change distress level';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.bulkSelectMode) {
      toggleBulkKey(recordKey(r));
      return;
    }
    openScoreEditModal(r);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openScoreEditModal(r);
    }
  });
}

R.formatCategoryChangeHtml = function formatCategoryChangeHtml(r) {
  const cat = resultCategory(r);
  const isProperty = cat === 'property';
  const isVacant = cat === 'vacant_lot';
  const isBlurred = cat === 'blurred';
  const isUnavailable = cat === 'unavailable';
  return `<div class="category-change-panel">
    <div class="category-change-title">Change category</div>
    <div class="category-change-current">Currently: <strong>${escapeHtml(categoryLabel(cat))}</strong>${r.manualOverride ? ' <span class="category-corrected-badge">Changed by you</span>' : ''}${r.satelliteOnly ? ' <span class="category-corrected-badge satellite-only-badge">Satellite Only</span>' : ''}</div>
    <div class="category-change-btns">
      <button type="button" class="category-change-btn property${isProperty && !r.satelliteOnly ? ' is-current' : ''}" data-change-cat="property"${isProperty && !r.satelliteOnly ? ' disabled' : ''}>→ Home / Property</button>
      <button type="button" class="category-change-btn vacant${isVacant && !r.satelliteOnly ? ' is-current' : ''}" data-change-cat="vacant_lot"${isVacant && !r.satelliteOnly ? ' disabled' : ''}>→ Vacant Lot / Land</button>
      <button type="button" class="category-change-btn blurred${isBlurred && !r.satelliteOnly ? ' is-current' : ''}" data-change-cat="blurred"${isBlurred && !r.satelliteOnly ? ' disabled' : ''}>→ Blocked Image</button>
      <button type="button" class="category-change-btn satellite-only${r.satelliteOnly ? ' is-current' : ''}" data-mark-satellite-only="1"${r.satelliteOnly ? ' disabled' : ''}>→ Satellite Only</button>
      ${isUnavailable ? '<button type="button" class="category-change-btn" data-change-cat="unavailable" disabled>→ Unavailable (current)</button>' : ''}
    </div>
    <div class="category-change-hint">${computeNeedsReview(r) ? 'Pick land vs home to clear Needs Review, or choose Blocked Image / Satellite Only when Street View is not enough.' : 'Wrong call? Switch category — Satellite Only parks the lead for a later re-scan.'}</div>
  </div>`;
}

R.normalizeIndicators = function normalizeIndicators(list) {
  if (!Array.isArray(list)) return [];
  return list.map(i => String(i).toLowerCase().trim().replace(/\s+/g, '_')).filter(Boolean);
}

R.stripTierMigrationReasonSuffix = function stripTierMigrationReasonSuffix(reason) {
  return String(reason || '')
    .replace(/ Moved to (Low )?Distressed — does not meet manicured\/green-lawn Well Maintained bar\./g, '')
    .replace(/ Re-tiered to [^—]+ — does not meet manicured\/green-lawn Well Maintained bar\./g, '')
    .replace(/ Re-tiered to Well Maintained[^.]*\./g, '')
    .replace(/ You (bulk-)?set distress level to [^.]+\./g, '')
    .trim();
}

R.reasonWithoutNegatedDistressPhrases = function reasonWithoutNegatedDistressPhrases(reason) {
  return stripTierMigrationReasonSuffix(reason)
    .replace(/no visible signs of[^.;]+/gi, '')
    .replace(/no signs of[^.;]+/gi, '')
    .replace(/without (visible )?(signs of )?(distress|neglect)[^.;]*/gi, '')
    .replace(/appears well-maintained[^.]*/gi, '')
    .replace(/in good condition[^.]*/gi, '');
}

R.DUMP_HOUSE_REASON_PATTERN = /junk|debris|trash pile|dump house|dump yard|trashed|hoarding|boarded|broken window|weeds everywhere|overgrown everywhere|heavy weeds|heavy neglect|severe neglect|signs of neglect|visible neglect|dilapidat|unmaintained|derelict|eyesore|filthy|heavily peeling|extensively peeling|dirty exterior|messy yard|clutter|yard waste|abandoned car|abandoned vehicle/i;

R.reasonSuggestsDumpHouse = function reasonSuggestsDumpHouse(reason) {
  const stripped = stripTierMigrationReasonSuffix(reason);
  const text = /no visible signs of distress|no visible distress|no signs of distress|no visible signs of neglect|no signs of neglect|without neglect|no neglect visible|free of neglect/i.test(stripped)
    ? reasonWithoutNegatedDistressPhrases(stripped)
    : stripped;
  return DUMP_HOUSE_REASON_PATTERN.test(text);
}

R.countNeglectIndicators = function countNeglectIndicators(inds) {
  const list = normalizeIndicators(inds);
  const seen = new Set();
  for (const i of list) {
    if (NEGLECT_COMBO_INDICATORS.has(i) || COSMETIC_INDICATORS.has(i)) seen.add(i);
  }
  return seen.size;
}

R.hasNeglectCombo = function hasNeglectCombo(inds, reason = '') {
  const list = normalizeIndicators(inds);
  const hasJunk = list.includes('junk_or_hoarding_yard');
  const hasBroken = list.includes('broken_windows');
  const hasAbandoned = list.includes('abandoned_vehicles');
  const hasOvergrown = list.includes('overgrown_landscaping');
  const hasPeeling = list.includes('peeling_paint');
  const hasDeferred = list.includes('deferred_maintenance');
  const neglectCount = countNeglectIndicators(list);

  if (hasModerateWithSupportingNeglect(list, reason)) return true;
  if (hasOvergrown && (hasPeeling || hasDeferred)) return true;
  if (hasPeeling && hasDeferred) return true;
  if (neglectCount >= 3) return true;
  if (reasonSuggestsDumpHouse(reason) && (hasJunk || hasBroken || hasAbandoned || neglectCount >= 2)) return true;
  return false;
}

R.qualifiesManicuredExemption = function qualifiesManicuredExemption(inds, roofCond, yardCond, reason = '') {
  const list = normalizeIndicators(inds);
  const roof = normalizeCondition(roofCond);
  const yard = normalizeCondition(yardCond);
  if (hasDistressBlockingIndicators(list, reason)) return false;
  if (list.some(i => HIGH_INDICATORS.has(i))) return false;
  if (hasNeglectCombo(list, reason)) return false;
  if (reasonSuggestsDumpHouse(reason)) return false;
  const softOrSingleModerate = !list.length || list.every(i =>
    WELL_MAINTAINED_SOFT_INDICATORS.has(i) || MODERATE_INDICATORS.has(i)
  );
  if (!softOrSingleModerate) return false;
  if (list.some(i => MODERATE_INDICATORS.has(i)) && hasModerateWithSupportingNeglect(list, reason)) return false;
  return roof === 'good' && yard === 'good';
}

R.reasonHasHighDistressLanguage = function reasonHasHighDistressLanguage(reason) {
  const stripped = stripTierMigrationReasonSuffix(reason);
  return /junk|debris|boarded|broken window|tarp on roof|tarped|roof damage|abandoned|structural|fire|water damage|hoarding|violation posted|dilapidat|\bneglect\b/i.test(stripped);
}

R.reasonSuggestsVisibleDistress = function reasonSuggestsVisibleDistress(reason) {
  const stripped = stripTierMigrationReasonSuffix(reason);
  if (reasonSuggestsDumpHouse(stripped)) return true;
  if (/no visible signs of distress|no visible distress|no signs of distress|without distress|no distress visible|no visible signs of distress or neglect|no visible signs of neglect|no signs of neglect|without neglect|free of distress|absence of distress|no severe issues|no severe distress/i.test(stripped)) {
    return /junk|debris|boarded|broken window|tarp on roof|roof damage|abandoned|fire|water damage|hoarding|violation posted|dilapidat|\bneglect\b|trashed|dump|weeds everywhere|peeling/i.test(reasonWithoutNegatedDistressPhrases(stripped));
  }
  return reasonHasHighDistressLanguage(stripped)
    || /signs of severe neglect|notice posted|vacant feel|heavy neglect|dump house|yard debris|filthy|derelict/i.test(stripped);
}

R.reasonAffirmsGrassCutOrWear = function reasonAffirmsGrassCutOrWear(reason) {
  const stripped = stripTierMigrationReasonSuffix(reason);
  if (/otherwise (well-)?maintained|good condition|no severe|well-maintained|appears to be a well-maintained|minor (deferred|overgrown|cosmetic)/i.test(stripped)) {
    return false;
  }
  return /poor (roof|yard)|yard is overgrown|tall grass|weeds|unkempt yard|roof (shows )?(damage|discoloration)|signs of roof damage/i.test(stripped);
}

R.reasonSuggestsWellMaintained = function reasonSuggestsWellMaintained(reason) {
  const stripped = stripTierMigrationReasonSuffix(reason);
  if (reasonHasHighDistressLanguage(stripped)) return false;
  return /well-maintained|well maintained|good condition|otherwise (well-)?maintained|otherwise (appears )?(good|normal|livable)|appears otherwise|no severe|no visible signs of distress|occupied|manicured|tidy yard|clean (facade|yard)|in good shape|minor deferred|minor overgrown|good roof|well-maintained roof|appears to be a well-maintained/i.test(stripped);
}

R.hasHardDistressIndicators = function hasHardDistressIndicators(indicators, reason = '') {
  return hasDistressBlockingIndicators(normalizeIndicators(indicators), reason);
}

R.satelliteYardRoofPair = function satelliteYardRoofPair(sat) {
  if (!sat) return { roof: 'unknown', yard: 'unknown', aerial: null };
  return {
    roof: normalizeCondition(sat.roofCondition),
    yard: normalizeCondition(sat.yardCondition),
    aerial: sat.aerialDistressScore
  };
}

R.satelliteConfirmsManicured = function satelliteConfirmsManicured(sat) {
  const { roof, yard, aerial } = satelliteYardRoofPair(sat);
  if (roof === 'poor' || yard === 'poor') return false;
  if (roof === 'good' && yard === 'good') return aerial == null || aerial <= 3;
  if (yard === 'good' && roof !== 'poor') return aerial == null || aerial <= 3;
  return aerial != null && aerial <= 2;
}

R.wellMaintainedIndicatorProfile = function wellMaintainedIndicatorProfile(inds, reason = '') {
  const list = normalizeIndicators(inds);
  if (hasDistressBlockingIndicators(list, reason)) {
    return { ok: false, softOnly: false };
  }
  const softOnly = !list.length || list.every(i =>
    WELL_MAINTAINED_SOFT_INDICATORS.has(i) || MODERATE_INDICATORS.has(i)
  );
  return { ok: softOnly, softOnly };
}


  }
  PDA.scan = {
    get buildAnalysisPrompt() { return R.buildAnalysisPrompt; },
    get buildSatellitePrompt() { return R.buildSatellitePrompt; },
    get buildStaticTierRules() { return R.buildStaticTierRules; },
    get processAddress() { return R.processAddress; },
    get runBatch() { return R.runBatch; },
    get analyzeWithGemini() { return R.analyzeWithGemini; },
    get getStartBlockReason() { return R.getStartBlockReason; },
    get updateStartButton() { return R.updateStartButton; },
    get getEffectiveConcurrentLimit() { return R.getEffectiveConcurrentLimit; },
    get notifyScanIssue() { return R.notifyScanIssue; },
    get finalizePropertyDistress() { return R.finalizePropertyDistress; },
    get applyScoreCalibration() { return R.applyScoreCalibration; }
  };
})(window);
