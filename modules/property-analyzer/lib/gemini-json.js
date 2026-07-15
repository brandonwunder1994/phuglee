(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.geminiJson = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function geminiJsonFactory() {
  function extractJsonBlock(text) {
    let cleaned = String(text || '').trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? match[0] : cleaned;
  }

  function repairJsonString(s) {
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
  }

  /**
   * Gemini sometimes omits structure_on_subject_lot or sends null.
   * Never coerce missing/null to false — that falsely marks homes as vacant
   * and then Street/Satellite reconcile dumps them as "could not determine".
   */
  function parseStructureOnLot(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return null;
  }

  /**
   * Apply explicit structure flag to satellite category.
   * Missing/null structure must NOT force vacant_lot.
   */
  function applyStructureToSatelliteCategory(category, structureOnLot) {
    const cat = String(category || '').trim() || 'property';
    if (structureOnLot === false) return 'vacant_lot';
    if (structureOnLot === true && (cat === 'unavailable' || cat === 'blurred')) return 'property';
    return cat;
  }

  function salvagePartialJson(text) {
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
  }

  function stripTrailingCommas(s) {
    let t = String(s || '');
    for (let i = 0; i < 5; i++) t = t.replace(/,\s*([}\]])/g, '$1');
    return t;
  }

  function parseLooseJson(text, required = []) {
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
  }

  return {
    extractJsonBlock,
    repairJsonString,
    salvagePartialJson,
    stripTrailingCommas,
    parseLooseJson,
    parseStructureOnLot,
    applyStructureToSatelliteCategory
  };
});