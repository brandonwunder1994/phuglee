'use strict';

function createReviewTrainingBuffer() {
  const pending = new Map();
  const committed = new Map();
  const geminiKeys = new Set();

  function setPending(recordKey, action) {
    if (!recordKey || !action?.type) return false;
    pending.set(recordKey, { ...action, recordKey, queuedAt: Date.now() });
    return true;
  }

  function getPending(recordKey) {
    return pending.get(recordKey) || null;
  }

  function clearPending(recordKey) {
    pending.delete(recordKey);
  }

  function takePending(recordKey) {
    const action = pending.get(recordKey) || null;
    pending.delete(recordKey);
    return action;
  }

  function markCommitted(recordKey, meta = {}) {
    if (!recordKey) return;
    committed.set(recordKey, { recordKey, committedAt: Date.now(), ...meta });
  }

  function getCommitted(recordKey) {
    return committed.get(recordKey) || null;
  }

  function clearCommitted(recordKey) {
    committed.delete(recordKey);
  }

  function shouldDedupeGemini(recordKey, actionType) {
    const key = `${recordKey}:${actionType}`;
    if (geminiKeys.has(key)) return true;
    geminiKeys.add(key);
    return false;
  }

  function reset() {
    pending.clear();
    committed.clear();
    geminiKeys.clear();
  }

  return {
    setPending,
    getPending,
    clearPending,
    takePending,
    markCommitted,
    getCommitted,
    clearCommitted,
    shouldDedupeGemini,
    reset,
    pendingCount: () => pending.size
  };
}

function popLastMatching(array, predicate) {
  if (!Array.isArray(array)) return null;
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i)) {
      return array.splice(i, 1)[0];
    }
  }
  return null;
}

const api = { createReviewTrainingBuffer, popLastMatching };

if (typeof module === 'object' && module.exports) {
  module.exports = api;
} else {
  const root = typeof globalThis !== 'undefined' ? globalThis : this;
  root.PDA = root.PDA || {};
  root.PDA.lib = root.PDA.lib || {};
  root.PDA.lib.reviewTraining = api;
}