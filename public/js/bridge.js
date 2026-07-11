(function () {
  const ACCEPTED_EXT = /\.(xlsx|xls|xlsm|csv|tsv|txt|pdf|docx|jpg|jpeg|png)$/i;
  const PAGE_SIZE = 50;
  const LOADING_STEPS = [
    'Detecting format…',
    'Parsing records…',
    'Normalizing addresses…',
    'Tagging distressed signals…',
    'Deduplicating upload…',
    'Cross-checking Analyze…',
    'Building filtered list…'
  ];
  const EXPORT_COLUMNS = [
    ['streetAddress', 'Street Address'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip', 'Zip'],
    ['violationIssueType', 'Violation/Issue Type'],
    ['violationDate', 'Violation Date'],
    ['descriptionNotes', 'Description/Notes'],
    ['distressedSignalTag', 'Distressed Signal Tag'],
    ['matchedIndicators', 'Matched Indicators'],
    ['confidenceLevel', 'Confidence Level'],
    ['sourceFile', 'Source File'],
    ['uploadType', 'Upload Type'],
    ['processedAt', 'Processed At']
  ];

  const stateSelect = document.getElementById('bridge-state');
  const citySelect = document.getElementById('bridge-city');
  const cityActions = document.getElementById('bridge-city-actions');
  const cityDossier = document.getElementById('bridge-city-dossier');
  const dossierEmptyEl = document.getElementById('bridge-dossier-empty');
  const dossierLastScrubBody = document.getElementById('bridge-dossier-last-scrub-body');
  const dossierAttachesBody = document.getElementById('bridge-dossier-attaches-body');
  const dossierListsBody = document.getElementById('bridge-dossier-lists-body');
  const outcomeDrawer = document.getElementById('bridge-outcome-drawer');
  const outcomeDrawerToggle = document.getElementById('bridge-outcome-drawer-toggle');
  const cityOutcomePanel = document.getElementById('bridge-city-outcome');
  const otherSourceWrap = document.getElementById('bridge-other-source-wrap');
  const otherSourceNotes = document.getElementById('bridge-other-source-notes');
  const outcomeSaveBtn = document.getElementById('bridge-outcome-save');
  const outcomeStatusEl = document.getElementById('bridge-outcome-status');
  const outcomeTypeSelect = document.getElementById('bridge-outcome-type');
  const typePanel = document.getElementById('bridge-type-panel');
  const uploadPanel = document.getElementById('bridge-upload-panel');
  const loadingPanel = document.getElementById('bridge-loading-panel');
  const loadingCopy = document.getElementById('bridge-loading-copy');
  const resultsPanel = document.getElementById('bridge-results-panel');
  const resultsMeta = document.getElementById('bridge-results-meta');
  const kpiGrid = document.getElementById('bridge-kpi-grid');
  const resultsToolbar = document.getElementById('bridge-results-toolbar');
  const tableWrap = document.getElementById('bridge-table-wrap');
  const resultsBody = document.getElementById('bridge-results-body');
  const resultsTable = document.getElementById('bridge-results-table');
  const paginationEl = document.getElementById('bridge-pagination');
  const filterSearch = document.getElementById('bridge-filter-search');
  const filterTag = document.getElementById('bridge-filter-tag');
  const filterConfidence = document.getElementById('bridge-filter-confidence');
  const filterReview = document.getElementById('bridge-filter-review');
  const exportCsvBtn = document.getElementById('bridge-export-csv');
  const savePanel = document.getElementById('bridge-save-panel');
  const listNameInput = document.getElementById('bridge-list-name');
  const saveListBtn = document.getElementById('bridge-save-list');
  const saveStatus = document.getElementById('bridge-save-status');
  const listsEmpty = document.getElementById('bridge-lists-empty');
  const listsWrap = document.getElementById('bridge-lists-wrap');
  const listsBody = document.getElementById('bridge-lists-body');
  const listsToolbar = document.getElementById('bridge-lists-toolbar');
  const downloadAllCsvBtn = document.getElementById('bridge-download-all-csv');
  const downloadAllXlsxBtn = document.getElementById('bridge-download-all-xlsx');
  const clearAllListsBtn = document.getElementById('bridge-clear-all-lists');
  const attachPanel = document.getElementById('bridge-attach-panel');
  const responseDateInput = document.getElementById('bridge-response-date');
  const attachBtn = document.getElementById('bridge-attach');
  const attachStatus = document.getElementById('bridge-attach-status');
  const historyDialog = document.getElementById('bridge-history-dialog');
  const historyOpenBtn = document.getElementById('bridge-history-open');
  const historyCloseBtn = document.getElementById('bridge-history-close');
  const historyLead = document.getElementById('bridge-history-lead');
  const historyList = document.getElementById('bridge-history-list');
  const typeConfirmDialog = document.getElementById('bridge-type-column-confirm-dialog');
  const typeConfirmCloseBtn = document.getElementById('bridge-type-column-confirm-close');
  const typeConfirmCancelBtn = document.getElementById('bridge-type-column-confirm-cancel');
  const typeConfirmOkBtn = document.getElementById('bridge-type-column-confirm-ok');
  const typeConfirmLead = document.getElementById('bridge-type-column-confirm-lead');
  const typeConfirmSuggested = document.getElementById('bridge-type-column-suggested');
  const typeConfirmCandidates = document.getElementById('bridge-type-column-candidates');
  const typeConfirmSamples = document.getElementById('bridge-type-column-samples');
  const dropzone = document.getElementById('bridge-dropzone');
  const fileInput = document.getElementById('bridge-file-input');
  const fileNameEl = document.getElementById('bridge-file-name');
  const browseBtn = document.getElementById('bridge-browse');
  const processBtn = document.getElementById('bridge-process');
  const clearFileBtn = document.getElementById('bridge-clear-file');
  const errorWrap = document.getElementById('bridge-error-wrap');
  const errorEl = document.getElementById('bridge-error');
  const retryBtn = document.getElementById('bridge-retry');
  const pipeline = document.getElementById('bridge-pipeline');

  let states = [];
  let cities = [];
  let selectedCity = null;
  let selectedUploadType = '';
  const MAX_UPLOAD_FILES = 5;
  /** @type {File[]} */
  let selectedFiles = [];
  let lastResult = null;
  let resultsMode = 'kept';
  /** After processUpload: force Train theater once when open groups exist (THTR-01). */
  let forceTrainTheater = false;
  let savedLists = [];
  let tableState = {
    sortKey: 'streetAddress',
    sortDir: 'asc',
    page: 1
  };
  let lastFailedAction = 'loadStates';
  let loadingTimer = null;
  /** Scrub feed staged-play interval (FEED-01 client theater; not SSE) */
  let feedPlayTimer = null;
  /** Last history payload for the selected city (dossier composition) */
  let dossierHistoryCache = [];

  // Split undo: client restores list/review snapshot; server reverts rules
  const trainUndoStack = [];
  const UNDO_LIMIT = 10;
  const TRAIN_PAGE_SIZE = 40;
  const DENY_CONFIRM_THRESHOLD = 10;
  /** Group ids decided this batch — cards leave the queue until re-process / undo */
  const trainDecidedKeys = new Set();
  let brainVersion = null;
  let trainSearchQuery = '';
  let trainPage = { distressed: 1, notDistressed: 1 };
  /** Serialize train decisions so a second Deny cannot overwrite the first promote with a stale rows snapshot. */
  let trainDecisionChain = Promise.resolve();
  let trainDecisionInFlight = false;

  function trainDecisionKey(group) {
    if (window.BridgeTrain && typeof window.BridgeTrain.trainDecisionKey === 'function') {
      return window.BridgeTrain.trainDecisionKey(group);
    }
    // Fallback if bridge-train.js failed to load — prefer groupId (never type-only)
    if (!group) return '';
    const gid = group.groupId != null ? String(group.groupId).trim() : '';
    if (gid) return gid;
    const section = group.section != null ? String(group.section).trim() : '';
    const typeKey = group.violationTypeKey != null ? String(group.violationTypeKey).trim() : '';
    const desc = group.descriptionKey != null ? String(group.descriptionKey).trim() : '';
    if (!section && !typeKey && !desc) return '';
    return [section, typeKey, desc].filter((p) => p !== '').join('|');
  }

  function clearTrainDecidedKeys() {
    trainDecidedKeys.clear();
  }

  function filterUndecidedTrainGroups(list) {
    if (window.BridgeTrain && typeof window.BridgeTrain.filterUndecidedTrainGroups === 'function') {
      return window.BridgeTrain.filterUndecidedTrainGroups(list, trainDecidedKeys);
    }
    return (list || []).filter((g) => {
      const k = trainDecisionKey(g);
      return !k || !trainDecidedKeys.has(k);
    });
  }

  /** Undecided open-group count (full review groups — never search-filtered). */
  function countOpenTrainGroups(data, decidedKeys) {
    if (window.BridgeTrain && typeof window.BridgeTrain.countOpenTrainGroups === 'function') {
      return window.BridgeTrain.countOpenTrainGroups(data, decidedKeys != null ? decidedKeys : trainDecidedKeys);
    }
    const groups = getReviewGroups(data);
    const all = (groups.distressed || []).concat(groups.notDistressed || []);
    return filterUndecidedTrainGroups(all).length;
  }

  /**
   * Mission header open/kept counts (admin + #bridge-train-mission only).
   * Non-admin / missing markup → hide and no-op (THTR-03 fail-closed).
   */
  function updateTrainMissionHeader(openCount, keptCount) {
    const mission = document.getElementById('bridge-train-mission');
    const openEl = document.getElementById('bridge-train-open-count');
    const keptEl = document.getElementById('bridge-train-kept-count');
    if (!mission) return;
    if (!isBridgeAdmin()) {
      setHidden(mission, true);
      updateTrainTheaterChrome(0);
      return;
    }
    const open = Math.max(0, Number(openCount) || 0);
    const kept = Math.max(0, Number(keptCount) || 0);
    if (openEl) {
      openEl.textContent = open === 1 ? '1 open group' : `${open} open groups`;
      openEl.classList.toggle('is-open', open > 0);
    }
    if (keptEl) {
      keptEl.textContent = `${kept.toLocaleString()} kept`;
    }
    // Show whenever admin train wrap is in play (mission is inside wrap)
    setHidden(mission, false);
    updateTrainTheaterChrome(open);
  }

  /**
   * Theater chrome: is-theater on wrap + bridge-results-mode--theater on tab rail.
   * Active when admin wrap visible AND (train mode OR open groups remain).
   */
  function updateTrainTheaterChrome(openCount) {
    const wrap = document.getElementById('bridge-train-wrap');
    if (!wrap) return;
    const modeRail = wrap.querySelector('.bridge-results-mode');
    const open = Math.max(0, Number(openCount) || 0);
    const wrapVisible = !wrap.hidden;
    const theaterOn =
      isBridgeAdmin() &&
      wrapVisible &&
      (resultsMode === 'train' || open > 0);
    wrap.classList.toggle('is-theater', theaterOn);
    if (modeRail) {
      modeRail.classList.toggle('bridge-results-mode--theater', theaterOn);
    }
  }

  function animateTrainCardExit(card) {
    return new Promise((resolve) => {
      if (!card || !card.isConnected) {
        resolve();
        return;
      }
      const height = card.offsetHeight;
      card.style.maxHeight = `${height}px`;
      card.style.overflow = 'hidden';
      // Force layout so the transition starts from full height
      void card.offsetHeight;
      card.classList.add('is-exiting');
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        card.removeEventListener('transitionend', onEnd);
        if (card.parentNode) card.parentNode.removeChild(card);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === card) finish();
      };
      card.addEventListener('transitionend', onEnd);
      setTimeout(finish, 380);
    });
  }

  function esc(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = hidden;
  }

  // --- BridgeTrain pure helpers (also on window.BridgeTrain via bridge-train.js) ---
  function isBridgeAdmin() {
    try {
      if (window.BridgeTrain && typeof window.BridgeTrain.isBridgeAdmin === 'function') {
        return window.BridgeTrain.isBridgeAdmin() === true;
      }
      if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
        return window.PhugleeSettings.isAdmin() === true;
      }
      const u = (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function')
        ? window.PhugleeSession.getSessionUser()
        : (sessionStorage.getItem('phuglee_session') || '');
      return String(u || '').trim() === 'admin';
    } catch (_) {
      return false;
    }
  }

  function getReviewGroups(data) {
    if (window.BridgeTrain && typeof window.BridgeTrain.getReviewGroups === 'function') {
      return window.BridgeTrain.getReviewGroups(data);
    }
    const g = data && data.reviewGroups;
    return {
      distressed: Array.isArray(g && g.distressed) ? g.distressed : [],
      notDistressed: Array.isArray(g && g.notDistressed) ? g.notDistressed : []
    };
  }

  function renderTrainGroupCard(group) {
    if (window.BridgeTrain && typeof window.BridgeTrain.renderTrainGroupCard === 'function') {
      return window.BridgeTrain.renderTrainGroupCard(group);
    }
    // Fallback if bridge-train.js failed to load — still escape dynamic text
    // Display-only short title; full label for tooltip / decisions stay on group
    const fullLabel = (group && group.violationTypeLabel) || 'Unknown type';
    const label = (group && group.shortLabel) || fullLabel;
    const count = Number(group && group.count) || 0;
    const groupId = (group && group.groupId) || '';
    const section = (group && group.section) || '';
    const indicators = Array.isArray(group && group.matchedIndicators) ? group.matchedIndicators : [];
    const samples = Array.isArray(group && group.descriptionSamples) ? group.descriptionSamples : [];
    const signals = indicators.length
      ? indicators.map((ind) => `<span class="bridge-tag bridge-tag--strong">${esc(ind)}</span>`).join('')
      : '<span class="bridge-train-muted">No matched signals</span>';
    const desc = samples.slice(0, 5).map((s) => {
      const t = String(s || '');
      const clipped = t.length > 160 ? `${t.slice(0, 160)}…` : t;
      return `<li>${esc(clipped)}</li>`;
    }).join('');
    return (
      `<article class="bridge-train-group" data-group-id="${esc(groupId)}" data-section="${esc(section)}">` +
      `<div class="bridge-train-group-head"><div class="bridge-train-group-title" title="${esc(fullLabel)}">${esc(label)} ` +
      `<span class="bridge-train-count">×${esc(String(count))}</span></div></div>` +
      `<div class="bridge-train-signals">${signals}</div>` +
      (desc ? `<ul class="bridge-train-descriptions">${desc}</ul>` : '') +
      `<div class="bridge-train-actions">` +
      (function () {
        const isFn = section === 'not_distressed';
        const approveLabel = isFn ? '✅ Not Distressed' : '🏚️ Distressed';
        const denyLabel = isFn ? '🏚️ Distressed' : '✅ Not Distressed';
        return (
          `<button type="button" class="phuglee-btn phuglee-btn-primary bridge-train-approve" data-action="approve" aria-label="${esc(approveLabel + ' ' + label)}">${esc(approveLabel)}</button>` +
          `<button type="button" class="phuglee-btn phuglee-btn-secondary bridge-train-deny" data-action="deny" aria-label="${esc(denyLabel + ' ' + label)}">${esc(denyLabel)}</button>`
        );
      })() +
      `</div></article>`
    );
  }

  function setTrainStatus(msg, kind) {
    const el = document.getElementById('bridge-train-status');
    if (!el) return;
    const text = msg || '';
    setHidden(el, !text);
    el.textContent = text;
    el.classList.remove('is-error', 'is-success');
    if (kind === 'error') el.classList.add('is-error');
    if (kind === 'success') el.classList.add('is-success');
  }

  function deepClone(value) {
    if (value == null) return value;
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (_) {}
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotTrainState() {
    if (!lastResult) return null;
    return {
      rows: deepClone(lastResult.rows || []),
      notDistressedRows: deepClone(lastResult.notDistressedRows || []),
      reviewGroups: deepClone(lastResult.reviewGroups || null),
      stats: deepClone(lastResult.stats || null)
    };
  }

  /**
   * Fast undo entry: store only the decided key + moved rows (not full list clone).
   * Full deepClone of multi‑thousand-row lists was a major Train-click lag source.
   */
  function pushTrainUndoPatch(patch) {
    if (!patch || !lastResult) return;
    trainUndoStack.push({
      kind: 'patch',
      decidedKey: patch.decidedKey || null,
      action: patch.action || '',
      section: patch.section || '',
      rowIds: Array.isArray(patch.rowIds) ? patch.rowIds.slice() : [],
      movedRows: Array.isArray(patch.movedRows) ? patch.movedRows : null,
      stats: patch.stats ? { ...patch.stats } : null
    });
    while (trainUndoStack.length > UNDO_LIMIT) trainUndoStack.shift();
    updateTrainUndoButton();
  }

  function pushTrainUndoSnapshot(extra = {}) {
    // Prefer patch when caller provides one (Train speed path)
    if (extra && extra.kind === 'patch') {
      pushTrainUndoPatch(extra);
      return;
    }
    const snap = snapshotTrainState();
    if (!snap) return;
    snap.kind = 'full';
    snap.decidedKey = extra.decidedKey || null;
    trainUndoStack.push(snap);
    while (trainUndoStack.length > UNDO_LIMIT) trainUndoStack.shift();
    updateTrainUndoButton();
  }

  function popTrainUndoSnapshot() {
    const snap = trainUndoStack.pop();
    updateTrainUndoButton();
    return snap || null;
  }

  function applyTrainSnapshot(snap) {
    if (!lastResult || !snap) return;
    if (snap.kind === 'patch') {
      const idSet = new Set(
        (snap.rowIds || []).map((id) => (id == null ? '' : String(id))).filter(Boolean)
      );
      if (snap.action === 'deny' && snap.section === 'distressed' && snap.movedRows) {
        // Undo demote: remove from FN, restore to kept
        lastResult.notDistressedRows = (lastResult.notDistressedRows || []).filter(
          (r) => r && !idSet.has(String(r.rowId))
        );
        lastResult.rows = (lastResult.rows || []).concat(snap.movedRows);
      } else if (snap.action === 'deny' && snap.section === 'not_distressed' && snap.movedRows) {
        // Undo promote: remove from kept, restore to FN (original tags on movedRows)
        lastResult.rows = (lastResult.rows || []).filter(
          (r) => r && !idSet.has(String(r.rowId))
        );
        lastResult.notDistressedRows = (lastResult.notDistressedRows || []).concat(
          snap.movedRows
        );
      }
      // approve paths: no row moves to reverse
      if (snap.stats && lastResult.stats) {
        lastResult.stats = { ...lastResult.stats, ...snap.stats };
      } else if (lastResult.stats) {
        lastResult.stats.kept = (lastResult.rows || []).length;
        lastResult.stats.notDistressed = (lastResult.notDistressedRows || []).length;
      }
      return;
    }
    lastResult.rows = Array.isArray(snap.rows) ? snap.rows : lastResult.rows;
    lastResult.notDistressedRows = Array.isArray(snap.notDistressedRows)
      ? snap.notDistressedRows
      : lastResult.notDistressedRows;
    if (snap.reviewGroups) lastResult.reviewGroups = snap.reviewGroups;
    if (snap.stats && lastResult.stats) {
      lastResult.stats = { ...lastResult.stats, ...snap.stats };
    } else if (lastResult.stats) {
      lastResult.stats.kept = (lastResult.rows || []).length;
      lastResult.stats.notDistressed = (lastResult.notDistressedRows || []).length;
    }
  }

  /**
   * Apply Train Approve/Deny to in-memory lastResult immediately (before network).
   * Mirrors server promote/demote tags. Returns originals for patch undo.
   * @returns {{ movedRows: object[], movedCount: number }}
   */
  function applyTrainDecisionLocally(action, section, group) {
    const rowIds = Array.isArray(group && group.rowIds) ? group.rowIds : [];
    const idSet = new Set(
      rowIds.map((id) => (id == null ? '' : String(id))).filter(Boolean)
    );
    let undoRows = [];
    let movedCount = 0;
    if (action === 'deny' && section === 'distressed') {
      const kept = Array.isArray(lastResult.rows) ? lastResult.rows : [];
      const nextKept = [];
      const demoted = [];
      for (const r of kept) {
        if (r && idSet.has(String(r.rowId))) {
          undoRows.push(r);
          demoted.push({
            ...r,
            distressedSignalTag: 'Standard',
            brainDecision: 'demoted'
          });
        } else if (r) nextKept.push(r);
      }
      movedCount = demoted.length;
      lastResult.rows = nextKept;
      lastResult.notDistressedRows = (lastResult.notDistressedRows || []).concat(demoted);
    } else if (action === 'deny' && section === 'not_distressed') {
      const fn = Array.isArray(lastResult.notDistressedRows)
        ? lastResult.notDistressedRows
        : [];
      const nextFn = [];
      const promoted = [];
      for (const r of fn) {
        if (r && idSet.has(String(r.rowId))) {
          undoRows.push(r);
          promoted.push({
            ...r,
            distressedSignalTag: 'Strong Distressed Signal',
            confidenceLevel: r.confidenceLevel || 'high',
            brainDecision: 'promoted'
          });
        } else if (r) nextFn.push(r);
      }
      movedCount = promoted.length;
      lastResult.notDistressedRows = nextFn;
      lastResult.rows = (lastResult.rows || []).concat(promoted);
    }
    if (lastResult.stats) {
      lastResult.stats.kept = (lastResult.rows || []).length;
      lastResult.stats.notDistressed = (lastResult.notDistressedRows || []).length;
      if (action === 'deny' && section === 'not_distressed' && movedCount) {
        lastResult.stats.noDistress = Math.max(
          0,
          (Number(lastResult.stats.noDistress) || 0) - movedCount
        );
      } else if (action === 'deny' && section === 'distressed' && movedCount) {
        lastResult.stats.noDistress =
          (Number(lastResult.stats.noDistress) || 0) + movedCount;
      }
    }
    return { movedRows: undoRows, movedCount };
  }

  function refreshTrainUiAfterDecision() {
    if (!lastResult) return;
    if (typeof renderKpis === 'function' && lastResult.stats) {
      renderKpis(lastResult.stats);
    }
    // Light path: only Train cards + KPIs — avoid full renderResults (table rebuild)
    if (resultsMode === 'train' || resultsMode === 'brain') {
      renderTrainGroups(getReviewGroups(lastResult), lastResult);
      if (resultsMode === 'train') setResultsMode('train');
    } else {
      renderResults(lastResult);
      setResultsMode(resultsMode || 'kept');
    }
    // Keep mission HUD open/kept in sync on decision, undo, and conflict rollback
    const remaining = countOpenTrainGroups(lastResult, trainDecidedKeys);
    const keptNow = (lastResult.rows || []).length;
    updateTrainMissionHeader(remaining, keptNow);
    updateTrainUndoButton();
  }

  function updateTrainUndoButton() {
    const btn = document.getElementById('bridge-train-undo');
    if (!btn) return;
    const canUndo = trainUndoStack.length > 0 && isBridgeAdmin();
    btn.disabled = !canUndo;
    btn.setAttribute('aria-disabled', canUndo ? 'false' : 'true');
    btn.title = canUndo
      ? `Undo last training decision (${trainUndoStack.length} on stack)`
      : 'Nothing to undo';
  }

  function rememberBrainVersion(summaryOrVersion) {
    if (summaryOrVersion == null) return;
    if (typeof summaryOrVersion === 'number' && Number.isFinite(summaryOrVersion)) {
      brainVersion = summaryOrVersion;
      return;
    }
    if (typeof summaryOrVersion === 'object') {
      if (summaryOrVersion.version != null) {
        brainVersion = Number(summaryOrVersion.version);
      } else if (summaryOrVersion.brainSummary && summaryOrVersion.brainSummary.version != null) {
        brainVersion = Number(summaryOrVersion.brainSummary.version);
      }
    }
  }

  function sortGroupsByCountDesc(list) {
    return (list || []).slice().sort((a, b) => {
      const ca = Number(a && a.count) || 0;
      const cb = Number(b && b.count) || 0;
      if (cb !== ca) return cb - ca;
      const la = String((a && a.violationTypeLabel) || '');
      const lb = String((b && b.violationTypeLabel) || '');
      return la.localeCompare(lb);
    });
  }

  function filterGroupsBySearch(list, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return list || [];
    return (list || []).filter((g) => {
      const label = String((g && g.violationTypeLabel) || '').toLowerCase();
      const key = String((g && g.violationTypeKey) || '').toLowerCase();
      return label.includes(q) || key.includes(q);
    });
  }

  function renderTrainPager(pagerEl, total, page, sectionKey) {
    if (!pagerEl) return;
    const pages = Math.max(1, Math.ceil(total / TRAIN_PAGE_SIZE));
    if (total <= TRAIN_PAGE_SIZE) {
      pagerEl.innerHTML = '';
      setHidden(pagerEl, true);
      return;
    }
    const safePage = Math.min(Math.max(1, page), pages);
    setHidden(pagerEl, false);
    pagerEl.innerHTML =
      `<span>Page ${safePage} of ${pages} · ${total} groups</span>` +
      `<button type="button" class="phuglee-btn phuglee-btn-secondary" data-train-page="${sectionKey}" data-page="${safePage - 1}" ${safePage <= 1 ? 'disabled' : ''}>Prev</button>` +
      `<button type="button" class="phuglee-btn phuglee-btn-secondary" data-train-page="${sectionKey}" data-page="${safePage + 1}" ${safePage >= pages ? 'disabled' : ''}>Next</button>`;
  }

  function pageSlice(list, page) {
    const p = Math.max(1, Number(page) || 1);
    const start = (p - 1) * TRAIN_PAGE_SIZE;
    return (list || []).slice(start, start + TRAIN_PAGE_SIZE);
  }

  function renderTrainGroups(groups, data) {
    const distressedEl = document.getElementById('bridge-train-distressed');
    const notEl = document.getElementById('bridge-train-not-distressed');
    const distressedPager = document.getElementById('bridge-train-distressed-pager');
    const notPager = document.getElementById('bridge-train-not-distressed-pager');

    const distressedAll = sortGroupsByCountDesc(
      filterUndecidedTrainGroups(
        filterGroupsBySearch((groups && groups.distressed) || [], trainSearchQuery)
      )
    );
    const notAll = sortGroupsByCountDesc(
      filterUndecidedTrainGroups(
        filterGroupsBySearch((groups && groups.notDistressed) || [], trainSearchQuery)
      )
    );

    // Clamp pages when filter shrinks the list
    const dPages = Math.max(1, Math.ceil(distressedAll.length / TRAIN_PAGE_SIZE) || 1);
    const nPages = Math.max(1, Math.ceil(notAll.length / TRAIN_PAGE_SIZE) || 1);
    if (trainPage.distressed > dPages) trainPage.distressed = dPages;
    if (trainPage.notDistressed > nPages) trainPage.notDistressed = nPages;

    const distressedPage = pageSlice(distressedAll, trainPage.distressed);
    const notPage = pageSlice(notAll, trainPage.notDistressed);

    function fill(el, list, emptyMsg) {
      if (!el) return;
      if (!list.length) {
        el.innerHTML = `<p class="bridge-train-muted">${esc(emptyMsg)}</p>`;
        return;
      }
      el.innerHTML = list.map(renderTrainGroupCard).join('');
    }

    const emptySearch = trainSearchQuery.trim()
      ? 'No groups match this search.'
      : 'No groups in this section.';
    fill(distressedEl, distressedPage, emptySearch);
    fill(notEl, notPage, emptySearch);
    renderTrainPager(distressedPager, distressedAll.length, trainPage.distressed, 'distressed');
    renderTrainPager(notPager, notAll.length, trainPage.notDistressed, 'notDistressed');
    updateTrainUndoButton();

    const rawD = (groups && groups.distressed) || [];
    const rawN = (groups && groups.notDistressed) || [];
    if (!rawD.length && !rawN.length) {
      const missingShape = !data || !data.reviewGroups;
      if (missingShape) {
        setTrainStatus('Train brain needs a process response with review groups (phase 43).', '');
      } else {
        setTrainStatus(
          'No review groups in this batch. Process a code-violation file with mixed types to train.',
          ''
        );
      }
    } else if (!distressedAll.length && !notAll.length && trainSearchQuery.trim()) {
      setTrainStatus('No train groups match your search.', '');
    } else if (!distressedAll.length && !notAll.length && trainDecidedKeys.size > 0) {
      setTrainStatus('All groups reviewed for this batch. Process another file or Undo to revise.', 'success');
    } else {
      // Keep error/success messages; clear only empty-state hints
      const el = document.getElementById('bridge-train-status');
      if (el && !el.classList.contains('is-error') && !el.classList.contains('is-success')) {
        setTrainStatus('', '');
      }
    }
  }

  function setResultsMode(mode) {
    if (mode === 'train' || mode === 'brain') {
      resultsMode = mode;
    } else {
      resultsMode = 'kept';
    }
    const modeKept = document.getElementById('bridge-mode-kept');
    const modeTrain = document.getElementById('bridge-mode-train');
    const modeBrain = document.getElementById('bridge-mode-brain');
    const trainPanel = document.getElementById('bridge-train-panel');
    const brainPanel = document.getElementById('bridge-brain-panel');

    if (modeKept) {
      modeKept.classList.toggle('is-active', resultsMode === 'kept');
      modeKept.setAttribute('aria-selected', resultsMode === 'kept' ? 'true' : 'false');
    }
    if (modeTrain) {
      modeTrain.classList.toggle('is-active', resultsMode === 'train');
      modeTrain.setAttribute('aria-selected', resultsMode === 'train' ? 'true' : 'false');
    }
    if (modeBrain) {
      modeBrain.classList.toggle('is-active', resultsMode === 'brain');
      modeBrain.setAttribute('aria-selected', resultsMode === 'brain' ? 'true' : 'false');
    }

    // Theater tab weight: recompute from current open groups whenever mode changes
    if (lastResult) {
      updateTrainTheaterChrome(countOpenTrainGroups(lastResult, trainDecidedKeys));
    } else {
      updateTrainTheaterChrome(0);
    }

    if (resultsMode === 'train') {
      setHidden(trainPanel, false);
      setHidden(brainPanel, true);
      setHidden(resultsToolbar, true);
      setHidden(tableWrap, true);
      setHidden(paginationEl, true);
      // Save/attach stay visible (discretion) — do not hide
    } else if (resultsMode === 'brain') {
      setHidden(trainPanel, true);
      setHidden(brainPanel, false);
      setHidden(resultsToolbar, true);
      setHidden(tableWrap, true);
      setHidden(paginationEl, true);
      loadBrainPanel().catch((e) => {
        setBrainStatus((e && e.message) || 'Could not load Filter brain', 'error');
      });
    } else {
      setHidden(trainPanel, true);
      setHidden(brainPanel, true);
      const rows = lastResult?.rows || [];
      const showTable = Boolean(lastResult && !lastResult.stub && rows.length > 0);
      setHidden(resultsToolbar, !showTable);
      setHidden(tableWrap, !showTable);
      setHidden(paginationEl, !showTable);
    }
  }

  function setBrainStatus(msg, kind) {
    const el = document.getElementById('bridge-brain-status');
    if (!el) return;
    const text = msg || '';
    setHidden(el, !text);
    el.textContent = text;
    el.classList.remove('is-error', 'is-success');
    if (kind === 'error') el.classList.add('is-error');
    if (kind === 'success') el.classList.add('is-success');
  }

  function kindLabel(kind) {
    const k = String(kind || '');
    if (k === 'suppress_type') return 'Suppress type';
    if (k === 'promote_type') return 'Promote type';
    if (k === 'suppress_phrase') return 'Suppress phrase';
    if (k === 'promote_phrase') return 'Promote phrase';
    return k || 'Rule';
  }

  function renderBrainRuleCard(rule, actions) {
    const id = (rule && rule.id) || '';
    const kind = (rule && rule.kind) || '';
    const isPhrase = kind === 'suppress_phrase' || kind === 'promote_phrase';
    const title = isPhrase
      ? (rule.pattern || '(empty pattern)')
      : (rule.violationTypeLabel || rule.violationTypeKey || '(unknown type)');
    const actionHtml = (actions || []).map((a) => {
      const cls = a.status === 'active'
        ? 'phuglee-btn phuglee-btn-primary'
        : 'phuglee-btn phuglee-btn-secondary';
      return (
        `<button type="button" class="${cls}" data-rule-id="${esc(id)}" data-rule-status="${esc(a.status)}">` +
        `${esc(a.label)}</button>`
      );
    }).join('');
    return (
      `<article class="bridge-brain-rule" data-rule-id="${esc(id)}">` +
      `<div class="bridge-brain-rule-head">` +
      `<div class="bridge-brain-rule-title">${esc(title)}</div>` +
      `<span class="bridge-brain-rule-kind">${esc(kindLabel(kind))}</span>` +
      `</div>` +
      (actionHtml ? `<div class="bridge-brain-rule-actions">${actionHtml}</div>` : '') +
      `</article>`
    );
  }

  function renderBrainPanel(data) {
    const typeEl = document.getElementById('brain-type-rules');
    const proposedEl = document.getElementById('brain-phrase-proposed');
    const activePhraseEl = document.getElementById('brain-phrase-active');
    const metricsEl = document.getElementById('brain-metrics');

    const typeRules = Array.isArray(data && data.typeRules) ? data.typeRules : [];
    const phraseRules = Array.isArray(data && data.phraseRules) ? data.phraseRules : [];
    const metrics = (data && data.metrics) || {};

    const activeTypes = typeRules.filter((r) => r && r.status === 'active');
    const proposedPhrases = phraseRules.filter((r) => r && r.status === 'proposed');
    const activePhrases = phraseRules.filter((r) => r && r.status === 'active');

    if (metricsEl) {
      const version = data && data.version != null ? data.version : '—';
      const totalDecisions = metrics.totalDecisions ?? '—';
      const suppressCount = metrics.suppressCount;
      const promoteCount = metrics.promoteCount;
      // LRN-01 paired learning health (server nest + client process apply coverage)
      const learning = metrics.learning || data.learning || {};
      const decisionTrend = learning.decisionTrend || {};
      const gold = learning.gold || {};
      const appliedIds =
        (lastResult && lastResult.processingMeta && lastResult.processingMeta.brainAppliedRuleIds) ||
        [];
      const coverageNote = appliedIds.length
        ? `${appliedIds.length} rules applied last process`
        : (learning.applyCoverage && learning.applyCoverage.note) || 'process for apply coverage';
      const trendLabel = decisionTrend.direction
        ? `trend ${decisionTrend.direction} (${decisionTrend.recentCount ?? '—'}/${decisionTrend.previousCount ?? '—'})`
        : '';
      const goldLabel =
        gold.precision != null && gold.recall != null
          ? `gold P ${Number(gold.precision).toFixed(2)} R ${Number(gold.recall).toFixed(2)}${gold.degraded ? ' ⚠' : ''}`
          : gold.source === 'unavailable'
            ? 'gold n/a'
            : '';
      const pairedLabel =
        learning.pairedOk === true
          ? 'paired ok'
          : learning.pairedOk === false
            ? 'paired needs coverage'
            : '';
      metricsEl.innerHTML =
        `<span class="bridge-brain-metric">v${esc(String(version))}</span>` +
        `<span class="bridge-brain-metric">${esc(String(totalDecisions))} decisions</span>` +
        `<span class="bridge-brain-metric">${esc(String(metrics.typeRulesActive ?? activeTypes.length))} type active</span>` +
        `<span class="bridge-brain-metric">${esc(String(metrics.phraseRulesProposed ?? proposedPhrases.length))} proposed</span>` +
        `<span class="bridge-brain-metric">${esc(String(metrics.phraseRulesActive ?? activePhrases.length))} phrase active</span>` +
        (suppressCount != null
          ? `<span class="bridge-brain-metric">${esc(String(suppressCount))} suppress</span>`
          : '') +
        (promoteCount != null
          ? `<span class="bridge-brain-metric">${esc(String(promoteCount))} promote</span>`
          : '') +
        (trendLabel
          ? `<span class="bridge-brain-metric bridge-brain-metric--learning" data-learning="decisionTrend">${esc(trendLabel)}</span>`
          : '') +
        (goldLabel
          ? `<span class="bridge-brain-metric bridge-brain-metric--learning" data-learning="gold">${esc(goldLabel)}</span>`
          : '') +
        (coverageNote
          ? `<span class="bridge-brain-metric bridge-brain-metric--learning" data-learning="brainAppliedRuleIds">${esc(coverageNote)}</span>`
          : '') +
        (pairedLabel
          ? `<span class="bridge-brain-metric bridge-brain-metric--learning" data-learning="pairedOk">${esc(pairedLabel)}</span>`
          : '');
    }
    if (data && data.version != null) rememberBrainVersion(data.version);

    if (typeEl) {
      typeEl.innerHTML = activeTypes.length
        ? activeTypes.map((r) => renderBrainRuleCard(r, [{ status: 'disabled', label: 'Disable' }])).join('')
        : '<p class="bridge-train-muted">No active type rules yet. Deny on distressed suppresses a type; Deny on not-distressed promotes a type.</p>';
    }
    if (proposedEl) {
      proposedEl.innerHTML = proposedPhrases.length
        ? proposedPhrases.map((r) => renderBrainRuleCard(r, [
          { status: 'active', label: 'Activate' },
          { status: 'rejected', label: 'Reject' }
        ])).join('')
        : '<p class="bridge-train-muted">No proposed phrases. Train on free-text samples to mine candidates.</p>';
    }
    if (activePhraseEl) {
      activePhraseEl.innerHTML = activePhrases.length
        ? activePhrases.map((r) => renderBrainRuleCard(r, [{ status: 'disabled', label: 'Disable' }])).join('')
        : '<p class="bridge-train-muted">No active phrase rules. Activate a proposed phrase to apply it on process.</p>';
    }
  }

  async function loadBrainPanel() {
    if (!isBridgeAdmin()) {
      setBrainStatus('Admin required to view Filter brain.', 'error');
      return null;
    }
    setBrainStatus('Loading Filter brain…', '');
    try {
      const data = await fetchJson('/api/bridge/brain');
      renderBrainPanel(data);
      setBrainStatus('', '');
      return data;
    } catch (err) {
      const msg = (err && err.message) || 'Could not load Filter brain';
      if (/admin/i.test(msg)) {
        setBrainStatus('Admin required to view Filter brain.', 'error');
      } else {
        setBrainStatus(msg, 'error');
      }
      throw err;
    }
  }

  async function setRuleStatus(id, status) {
    if (!isBridgeAdmin()) {
      throw new Error('Admin required to change rule status');
    }
    if (!id || !status) {
      throw new Error('Missing rule id or status');
    }
    const payload = { status };
    if (brainVersion != null) payload.brainVersion = brainVersion;
    try {
      const data = await fetchJson(`/api/bridge/brain/rules/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data && data.brainSummary) rememberBrainVersion(data.brainSummary);
      await loadBrainPanel();
      if (status === 'active') {
        setBrainStatus('Rule activated. Applies on next file process.', 'success');
      } else if (status === 'rejected') {
        setBrainStatus('Proposed rule rejected.', 'success');
      } else if (status === 'disabled') {
        setBrainStatus('Rule disabled. Will not apply on next process.', 'success');
      } else {
        setBrainStatus('Rule status updated.', 'success');
      }
      return data;
    } catch (err) {
      if (err && err.code === 'VERSION_CONFLICT') {
        setBrainStatus('Brain was updated elsewhere — refresh train state', 'error');
        if (err.currentVersion != null) brainVersion = Number(err.currentVersion);
        await loadBrainPanel().catch(() => {});
      }
      throw err;
    }
  }

  async function onBrainRuleAction(btn) {
    if (!btn || btn.disabled || !isBridgeAdmin()) return;
    const id = btn.getAttribute('data-rule-id');
    const status = btn.getAttribute('data-rule-status');
    const card = btn.closest('.bridge-brain-rule');
    if (card) card.classList.add('is-pending');
    card?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await setRuleStatus(id, status);
    } catch (err) {
      setBrainStatus((err && err.message) || 'Could not update rule status', 'error');
      if (card) {
        card.classList.remove('is-pending');
        card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    }
  }

  function setTrainCardBusy(card, busy) {
    if (!card) return;
    card.classList.toggle('is-pending', Boolean(busy));
    card.querySelectorAll('button[data-action="approve"], button[data-action="deny"]').forEach((btn) => {
      btn.disabled = Boolean(busy);
    });
  }

  /**
   * Re-resolve a train group from the latest lastResult (not a stale click payload).
   * After a prior promote/demote, only current reviewGroups have correct rowIds + lists.
   */
  function findTrainGroupById(groupId, section) {
    if (!lastResult || groupId == null || groupId === '') return null;
    const groups = getReviewGroups(lastResult);
    const list =
      section === 'not_distressed'
        ? groups.notDistressed
        : section === 'distressed'
          ? groups.distressed
          : (groups.distressed || []).concat(groups.notDistressed || []);
    return (list || []).find((g) => String(g.groupId) === String(groupId)) || null;
  }

  /**
   * Synchronous Train commit: local list moves + UI. Returns persist meta or null.
   * Network is separate so the next click is not blocked by brain POST latency.
   */
  function commitTrainDecisionLocally({ action, section, group, card }) {
    if (!lastResult) {
      throw new Error('Process a file before training the brain.');
    }
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function'
        && !window.PhugleeSettings.isAdmin()) {
      throw new Error('Admin required to train the brain');
    }
    const resolvedSection = section || (group && group.section) || (card && card.dataset.section) || '';
    const groupId = (group && group.groupId) || (card && card.dataset.groupId) || '';
    const liveGroup = findTrainGroupById(groupId, resolvedSection) || group;
    if (!liveGroup || !Array.isArray(liveGroup.rowIds) || !liveGroup.rowIds.length) {
      throw new Error('This group has no row ids to decide on. Re-process the file and try again.');
    }
    const sectionForPost = liveGroup.section || resolvedSection;
    if (sectionForPost !== 'distressed' && sectionForPost !== 'not_distressed') {
      throw new Error('Unknown train section for this group');
    }
    if (action !== 'approve' && action !== 'deny') {
      throw new Error('Invalid train action');
    }

    const decidedKey = trainDecisionKey(liveGroup);
    if (decidedKey && trainDecidedKeys.has(decidedKey)) {
      setTrainStatus('That group was already decided.', '');
      return null;
    }

    const statsBefore = lastResult.stats
      ? {
          kept: lastResult.stats.kept,
          notDistressed: lastResult.stats.notDistressed,
          noDistress: lastResult.stats.noDistress
        }
      : null;
    const local = applyTrainDecisionLocally(action, sectionForPost, liveGroup);
    if (decidedKey) trainDecidedKeys.add(decidedKey);
    pushTrainUndoSnapshot({
      kind: 'patch',
      decidedKey,
      action,
      section: sectionForPost,
      rowIds: liveGroup.rowIds.slice(),
      movedRows: local.movedRows,
      stats: statsBefore
    });

    if (card && card.isConnected) {
      void animateTrainCardExit(card);
    }
    refreshTrainUiAfterDecision();

    const remaining = countOpenTrainGroups(lastResult, trainDecidedKeys);
    const keptNow = (lastResult.rows || []).length;
    updateTrainMissionHeader(remaining, keptNow);
    if (remaining === 0) {
      setTrainStatus(
        `Decision saved · ${keptNow.toLocaleString()} kept. Save list below when this city is ready.`,
        'success'
      );
    } else {
      setTrainStatus(
        `Decision saved · ${keptNow.toLocaleString()} kept · ${remaining} group(s) left. Save list when ready.`,
        'success'
      );
    }

    return {
      decidedKey,
      body: {
        clientApplied: true,
        action,
        section: sectionForPost,
        groupId: liveGroup.groupId || '',
        rowIds: liveGroup.rowIds,
        violationTypeKey: liveGroup.violationTypeKey || '',
        violationTypeLabel: liveGroup.violationTypeLabel || '',
        city: lastResult.city || null,
        sourceFile: lastResult.sourceFile || '',
        uploadType: lastResult.uploadType || '',
        matchedIndicators: Array.isArray(liveGroup.matchedIndicators)
          ? liveGroup.matchedIndicators
          : [],
        descriptionSamples: Array.isArray(liveGroup.descriptionSamples)
          ? liveGroup.descriptionSamples
          : [],
        sampleAddresses: Array.isArray(liveGroup.sampleAddresses)
          ? liveGroup.sampleAddresses
          : []
      }
    };
  }

  /**
   * Persist brain rules only (slim POST). Serialized via trainDecisionChain for brainVersion.
   */
  async function persistTrainBrainDecision(meta) {
    if (!meta || !meta.body) return null;
    const body = { ...meta.body };
    if (brainVersion != null) body.brainVersion = brainVersion;

    let data;
    try {
      data = await fetchJson('/api/bridge/brain/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      const snap = popTrainUndoSnapshot();
      if (meta.decidedKey) trainDecidedKeys.delete(meta.decidedKey);
      applyTrainSnapshot(snap);
      refreshTrainUiAfterDecision();
      if (err && err.code === 'VERSION_CONFLICT') {
        setTrainStatus('Brain was updated elsewhere — refresh train state', 'error');
        if (err.currentVersion != null) brainVersion = Number(err.currentVersion);
        await loadBrainPanel().catch(() => {});
      }
      throw err;
    }

    if (data && data.brainSummary) rememberBrainVersion(data.brainSummary);
    if (data && !data.clientApplied) {
      if (Array.isArray(data.rows)) lastResult.rows = data.rows;
      if (Array.isArray(data.notDistressedRows)) {
        lastResult.notDistressedRows = data.notDistressedRows;
      }
      if (data.reviewGroups) lastResult.reviewGroups = data.reviewGroups;
      if (lastResult.stats && data.statsPatch) {
        if (data.statsPatch.kept != null) lastResult.stats.kept = data.statsPatch.kept;
        if (data.statsPatch.notDistressed != null) {
          lastResult.stats.notDistressed = data.statsPatch.notDistressed;
        }
      }
      refreshTrainUiAfterDecision();
    }
    return data;
  }

  /** @deprecated path name kept for tests that grep submitTrainDecision */
  async function submitTrainDecision(args) {
    const meta = commitTrainDecisionLocally(args);
    if (!meta) return null;
    return persistTrainBrainDecision(meta);
  }

  async function onTrainUndo() {
    if (!trainUndoStack.length) {
      setTrainStatus('Nothing to undo.', '');
      updateTrainUndoButton();
      return;
    }
    if (!isBridgeAdmin()) {
      setTrainStatus('Admin required to undo training.', 'error');
      return;
    }
    const undoBtn = document.getElementById('bridge-train-undo');
    if (undoBtn) undoBtn.disabled = true;
    setTrainStatus('Undoing last decision…', '');
    showError('');
    try {
      const body = {};
      if (brainVersion != null) body.brainVersion = brainVersion;
      const data = await fetchJson('/api/bridge/brain/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (data && data.brainSummary) rememberBrainVersion(data.brainSummary);
      const snap = popTrainUndoSnapshot();
      applyTrainSnapshot(snap);
      if (snap && snap.decidedKey) trainDecidedKeys.delete(snap.decidedKey);
      const modeBefore = resultsMode;
      if (modeBefore === 'train' || modeBefore === 'brain') {
        refreshTrainUiAfterDecision();
        setResultsMode(modeBefore);
      } else {
        renderResults(lastResult);
        setResultsMode('train');
      }
      if (modeBefore === 'brain') {
        await loadBrainPanel().catch(() => {});
      }
      setTrainStatus('Undid last training decision · list restored', 'success');
      updateTrainUndoButton();
    } catch (err) {
      if (err && err.code === 'VERSION_CONFLICT') {
        setTrainStatus('Brain was updated elsewhere — refresh train state', 'error');
        if (err.currentVersion != null) brainVersion = Number(err.currentVersion);
        await loadBrainPanel().catch(() => {});
      } else if (err && err.code === 'NOTHING_TO_UNDO') {
        // Server has nothing; still pop client stack if present
        const snap = popTrainUndoSnapshot();
        if (snap) {
          applyTrainSnapshot(snap);
          if (snap.decidedKey) trainDecidedKeys.delete(snap.decidedKey);
          refreshTrainUiAfterDecision();
          setResultsMode('train');
        }
        setTrainStatus('Nothing left to undo on the server.', 'error');
      } else {
        setTrainStatus((err && err.message) || 'Could not undo', 'error');
        showError((err && err.message) || 'Could not undo');
      }
      updateTrainUndoButton();
    }
  }

  async function onTrainDecision(action, group, card) {
    if (!lastResult) {
      setTrainStatus('Process a file before training the brain.', 'error');
      return;
    }
    if (!group) {
      setTrainStatus('Could not resolve this group. Re-process and try again.', 'error');
      return;
    }
    if (action === 'deny') {
      const count = Number(group.count) || (Array.isArray(group.rowIds) ? group.rowIds.length : 0);
      if (count >= DENY_CONFIRM_THRESHOLD) {
        // Confirm chrome only — decision POST uses full group.violationTypeLabel
        const displayLabel = group.shortLabel || group.violationTypeLabel || 'this group';
        const section = (group && group.section) || (card && card.dataset.section) || '';
        const moveHint = section === 'not_distressed'
          ? 'They will move to distressed and a promote rule will be trained.'
          : 'They will move to not-distressed and a suppress rule will be trained.';
        const outcomeLabel = section === 'not_distressed' ? 'Distressed' : 'Not Distressed';
        const ok = window.confirm(
          `Mark ${count} records as ${outcomeLabel} for “${displayLabel}”? ${moveHint}`
        );
        if (!ok) return;
      }
    }
    showError('');
    let meta;
    try {
      // Instant: list move + card exit + Train re-render (no network wait)
      meta = commitTrainDecisionLocally({
        action,
        section: (group && group.section) || (card && card.dataset.section) || '',
        group,
        card
      });
    } catch (err) {
      const msg = (err && err.message) || 'Could not apply train decision';
      setTrainStatus(msg, 'error');
      showError(msg);
      return;
    }
    if (!meta) return;

    // Background: persist brain (serialized for version); UI already advanced
    const run = () => {
      trainDecisionInFlight = true;
      return persistTrainBrainDecision(meta).finally(() => {
        trainDecisionInFlight = false;
      });
    };
    const p = trainDecisionChain.then(run, run);
    trainDecisionChain = p.catch(() => {});
    p.catch((err) => {
      const msg = (err && err.message) || 'Could not save train decision';
      setTrainStatus(msg, 'error');
      showError(msg);
    });
  }

  function resolveTrainGroupFromCard(card) {
    if (!card || !lastResult) return null;
    const groupId = card.dataset.groupId || '';
    const section = card.dataset.section || '';
    const groups = getReviewGroups(lastResult);
    const list = section === 'not_distressed' ? groups.notDistressed : groups.distressed;
    const found = list.find((g) => String(g.groupId) === String(groupId));
    // Fail closed: never invent violationTypeLabel from DOM title (short labels would poison brain)
    if (found) return found;
    return null;
  }
  // --- end BridgeTrain pure helpers ---

  function showError(msg) {
    const hasError = Boolean(msg);
    setHidden(errorWrap, !hasError);
    if (errorEl) errorEl.textContent = msg || '';
    if (hasError && errorWrap) {
      try {
        errorWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) { /* ignore */ }
    }
    if (hasError) {
      try {
        console.error('[Filter] process/UI error:', msg);
      } catch (_) { /* ignore */ }
    }
  }

  function setPipelineStep(step) {
    const order = ['location', 'type', 'upload', 'results'];
    const activeIndex = order.indexOf(step);
    pipeline?.querySelectorAll('.bridge-pipeline-step').forEach((el, index) => {
      el.classList.toggle('is-active', index === activeIndex);
      el.classList.toggle('is-complete', index < activeIndex);
    });
  }

  function bridgeHeaders(extra) {
    if (window.PhugleeSessionHeaders && typeof window.PhugleeSessionHeaders.phugleeSessionHeaders === 'function') {
      return window.PhugleeSessionHeaders.phugleeSessionHeaders(extra);
    }
    const headers = { ...(extra || {}) };
    try {
      const user = (window.PhugleeAuth && window.PhugleeAuth.getSessionUser)
        ? window.PhugleeAuth.getSessionUser()
        : sessionStorage.getItem('phuglee_session');
      if (user) headers['X-Phuglee-User'] = user;
    } catch (_) {}
    return headers;
  }

  async function fetchJson(url, options) {
    const headers = bridgeHeaders(options && options.headers);
    let res;
    try {
      res = await fetch(url, { cache: 'no-store', ...options, headers });
    } catch (netErr) {
      const err = new Error(
        (netErr && netErr.message)
          ? `Network error: ${netErr.message}`
          : 'Network error — could not reach the server. Check connection and try again.'
      );
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'OCR_UNAVAILABLE' || res.status === 503) {
        throw new Error(data.error || 'OCR is unavailable. Upload Excel, CSV, or a text-based PDF.');
      }
      if (data.code === 'NO_USABLE_ROWS') {
        const stats = data.stats || {};
        const parts = [];
        const reasons = stats.discardReasons || {};
        // Prefer server message when it already includes a breakdown.
        const serverMsg = String(data.error || '');
        if (/Breakdown:/i.test(serverMsg)) {
          throw new Error(serverMsg);
        }
        for (const [reason, count] of Object.entries(reasons)) {
          if (Number(count) > 0) parts.push(`${count} ${reason}`);
        }
        if (!parts.length) {
          if (stats.noDistress) parts.push(`${stats.noDistress} no distress signal`);
          if (stats.alreadyImported) parts.push(`${stats.alreadyImported} already in Analyze`);
          if (stats.deduplicated) parts.push(`${stats.deduplicated} duplicates`);
        }
        const detail = parts.length ? ` Breakdown: ${parts.join(', ')}.` : '';
        throw new Error((data.error || 'No usable addresses found in this file.') + detail);
      }
      if (data.code === 'FORMAT_MISMATCH') {
        // Legacy: server used to hard-fail mixed headers. Prefer multi-format confirm path.
        const err = new Error(
          data.error ||
            'Mixed file formats in batch — confirm Type column for each sheet format.'
        );
        err.code = 'FORMAT_MISMATCH';
        err.status = res.status;
        err.details = data;
        throw err;
      }
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.code = data.code || null;
      err.status = res.status;
      if (data.currentVersion != null) err.currentVersion = data.currentVersion;
      // Type column confirm gate: attach full body so client can open modal / re-POST
      if (data.code === 'TYPE_COLUMN_CONFIRM_REQUIRED') {
        err.details = data;
        if (data.formatFingerprint != null) err.formatFingerprint = data.formatFingerprint;
        if (data.candidates != null) err.candidates = data.candidates;
        if (data.suggestedHeader !== undefined) err.suggestedHeader = data.suggestedHeader;
        if (Array.isArray(data.formats)) err.formats = data.formats;
        if (data.multiFormat != null) err.multiFormat = data.multiFormat;
      }
      throw err;
    }
    return data;
  }

  function resetDownstream(from) {
    if (from === 'state') {
      selectedCity = null;
      selectedUploadType = '';
      selectedFiles = [];
      lastResult = null;
      setHidden(cityActions, true);
      hideCityDossierUi();
      resetCityOutcomeUi();
      setHidden(typePanel, true);
      setHidden(uploadPanel, true);
      setHidden(resultsPanel, true);
      clearFileUi();
      setPipelineStep('location');
    }
    if (from === 'city') {
      selectedUploadType = '';
      selectedFiles = [];
      lastResult = null;
      setHidden(typePanel, true);
      setHidden(uploadPanel, true);
      setHidden(resultsPanel, true);
      clearFileUi();
      document.querySelectorAll('input[name="bridge-upload-type"]').forEach((input) => {
        input.checked = false;
      });
      setPipelineStep(selectedCity ? 'type' : 'location');
      setHidden(cityActions, !selectedCity);
    }
    if (from === 'type') {
      selectedFiles = [];
      setHidden(uploadPanel, true);
      setHidden(resultsPanel, true);
      lastResult = null;
      clearFileUi();
      clearResponseDateTime();
      setPipelineStep(selectedUploadType ? 'upload' : 'type');
    }
    if (from === 'file') {
      setHidden(resultsPanel, true);
      lastResult = null;
    }
  }

  function clearFileUi() {
    selectedFiles = [];
    if (fileInput) fileInput.value = '';
    setHidden(fileNameEl, true);
    if (fileNameEl) fileNameEl.textContent = '';
    if (processBtn) {
      processBtn.disabled = true;
      processBtn.textContent = 'Scrub it';
    }
    setHidden(clearFileBtn, true);
    dropzone?.classList.remove('has-file', 'is-dragover');
  }

  function syncFileUi() {
    const count = selectedFiles.length;
    if (!count) {
      setHidden(fileNameEl, true);
      if (fileNameEl) fileNameEl.textContent = '';
      if (processBtn) {
        processBtn.disabled = true;
        processBtn.textContent = 'Scrub it';
      }
      setHidden(clearFileBtn, true);
      dropzone?.classList.remove('has-file');
      return;
    }
    const lines = selectedFiles.map((f, i) => `${i + 1}. ${f.name} (${formatBytes(f.size)})`);
    setHidden(fileNameEl, false);
    if (fileNameEl) {
      fileNameEl.textContent =
        count === 1
          ? lines[0].replace(/^1\.\s*/, '')
          : `${count} files selected\n${lines.join('\n')}`;
    }
    dropzone?.classList.add('has-file');
    if (processBtn) {
      processBtn.disabled = false;
      processBtn.textContent = count === 1 ? 'Scrub it' : `Scrub ${count} files`;
    }
    setHidden(clearFileBtn, false);
  }

  /**
   * Add files to the batch (max MAX_UPLOAD_FILES). Keeps existing picks when
   * dropping/browsing more; skips unsupported types and name duplicates.
   */
  function addSelectedFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (!incoming.length) return;

    const rejected = [];
    const next = selectedFiles.slice();
    const seen = new Set(next.map((f) => `${f.name}::${f.size}`));

    for (const file of incoming) {
      if (next.length >= MAX_UPLOAD_FILES) {
        rejected.push(`${file.name} (max ${MAX_UPLOAD_FILES} files)`);
        continue;
      }
      if (!ACCEPTED_EXT.test(file.name)) {
        rejected.push(`${file.name} (unsupported type)`);
        continue;
      }
      const key = `${file.name}::${file.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
    }

    selectedFiles = next;
    if (rejected.length && !selectedFiles.length) {
      showError(
        rejected.some((r) => /unsupported/i.test(r))
          ? 'Unsupported file type. Use Excel, CSV, PDF, Word, TXT, or JPG/PNG list images.'
          : `Could not add files: ${rejected.join('; ')}`
      );
    } else if (rejected.length) {
      showError(`Some files were skipped: ${rejected.join('; ')}`);
    } else {
      showError('');
    }

    syncFileUi();
    setHidden(resultsPanel, true);
    lastResult = null;
    setPipelineStep('upload');
  }

  /** @deprecated use addSelectedFiles — kept name for drop/browse call sites */
  function setSelectedFile(file) {
    if (!file) return;
    addSelectedFiles([file]);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDisplayDate(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function clearResponseDateTime() {
    if (responseDateInput) responseDateInput.value = '';
  }

  /**
   * Date-only response received value (ISO).
   * Uses local noon so the calendar day does not shift across timezones.
   */
  function getResponseAtValue() {
    const date = String(responseDateInput?.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const local = new Date(`${date}T12:00:00`);
    if (Number.isNaN(local.getTime())) return '';
    return local.toISOString();
  }

  function focusResponseDateTime() {
    try {
      responseDateInput?.focus();
    } catch (_) { /* ignore */ }
  }

  async function loadStates() {
    lastFailedAction = 'loadStates';
    const data = await fetchJson('/api/bridge/states');
    states = data.states || [];
    stateSelect.innerHTML = '<option value="">Select a state…</option>';
    states.forEach((state) => {
      const opt = document.createElement('option');
      opt.value = state.code;
      opt.textContent = `${state.label} (${state.cityCount})`;
      stateSelect.appendChild(opt);
    });
    stateSelect.disabled = false;
    citySelect.innerHTML = '<option value="">Select a state first</option>';
    citySelect.disabled = true;
  }

  async function onStateChange() {
    resetDownstream('state');
    showError('');
    const state = stateSelect.value;
    if (!state) {
      citySelect.innerHTML = '<option value="">Select a state first</option>';
      citySelect.disabled = true;
      return;
    }

    lastFailedAction = 'stateChange';
    citySelect.disabled = true;
    citySelect.innerHTML = '<option value="">Loading cities…</option>';
    const data = await fetchJson(`/api/bridge/cities?state=${encodeURIComponent(state)}`);
    cities = data.cities || [];
    citySelect.innerHTML = cities.length
      ? '<option value="">Select a city…</option>'
      : '<option value="">No profiles in this state</option>';
    cities.forEach((city) => {
      const opt = document.createElement('option');
      opt.value = city.id;
      opt.textContent = city.city;
      citySelect.appendChild(opt);
    });
    citySelect.disabled = cities.length === 0;
  }

  function setOutcomeStatus(msg, kind) {
    if (!outcomeStatusEl) return;
    const text = String(msg || '').trim();
    setHidden(outcomeStatusEl, !text);
    outcomeStatusEl.textContent = text;
    outcomeStatusEl.classList.toggle('is-success', kind === 'success');
    outcomeStatusEl.classList.toggle('is-error', kind === 'error');
  }

  function selectedCityOutcome() {
    const checked = document.querySelector('input[name="bridge-city-outcome"]:checked');
    return checked ? checked.value : '';
  }

  function setOutcomeDrawerOpen(open) {
    const isOpen = !!open;
    if (cityOutcomePanel) setHidden(cityOutcomePanel, !isOpen);
    if (outcomeDrawer) outcomeDrawer.classList.toggle('is-open', isOpen);
    if (outcomeDrawerToggle) {
      outcomeDrawerToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }

  function hideCityDossierUi() {
    dossierHistoryCache = [];
    setHidden(cityDossier, true);
    setHidden(outcomeDrawer, true);
    setOutcomeDrawerOpen(false);
    if (cityOutcomePanel) setHidden(cityOutcomePanel, true);
    if (dossierEmptyEl) setHidden(dossierEmptyEl, true);
    if (dossierLastScrubBody) dossierLastScrubBody.textContent = '—';
    if (dossierAttachesBody) dossierAttachesBody.textContent = '—';
    if (dossierListsBody) dossierListsBody.textContent = '—';
  }

  /**
   * Client-only dossier model from existing history + lists APIs.
   * No GET /api/bridge/dossier.
   */
  function buildDossierModel(city, history, lists) {
    const attaches = Array.isArray(history) ? history : [];
    const lastScrub = attaches.length
      ? [...attaches].sort((a, b) =>
          String(b.attached_at || '').localeCompare(String(a.attached_at || ''))
        )[0]
      : null;
    const cityId = city && city.id;
    const stagedLists = (lists || []).filter(
      (l) => String(l.cityId || '') === String(cityId)
    );
    const listStatus = {
      ready: stagedLists.filter((l) => (l.status || 'ready') === 'ready').length,
      downloaded: stagedLists.filter((l) => l.status === 'downloaded').length,
      recordCount: stagedLists.reduce((n, l) => n + (Number(l.recordCount) || 0), 0)
    };
    return { city, attaches, lastScrub, stagedLists, listStatus };
  }

  function renderCityDossier(model) {
    if (!cityDossier) return;
    if (!model || !model.city) {
      setHidden(cityDossier, true);
      return;
    }
    setHidden(cityDossier, false);

    const attaches = model.attaches || [];
    const staged = model.stagedLists || [];
    const listStatus = model.listStatus || { ready: 0, downloaded: 0, recordCount: 0 };
    const isEmpty = attaches.length === 0 && staged.length === 0;

    if (dossierEmptyEl) {
      setHidden(dossierEmptyEl, !isEmpty);
    }

    if (dossierLastScrubBody) {
      if (model.lastScrub) {
        const s = model.lastScrub;
        const typeLabel = s.upload_type_label || s.upload_type || 'Attach';
        const kept = Number(s.kept_count || 0).toLocaleString();
        const when = s.attached_at ? formatDisplayDate(s.attached_at) : '—';
        const file = s.original_filename || 'dataset';
        dossierLastScrubBody.textContent = `${typeLabel} · ${kept} kept · ${when} · ${file}`;
      } else {
        dossierLastScrubBody.textContent = isEmpty ? '—' : 'No scrubs yet';
      }
    }

    if (dossierAttachesBody) {
      const n = attaches.length;
      dossierAttachesBody.textContent =
        n === 0 ? 'None yet' : `${n} attach${n === 1 ? '' : 'es'} on file`;
    }

    if (dossierListsBody) {
      const n = staged.length;
      if (n === 0) {
        dossierListsBody.textContent = 'No lists staged for this city';
      } else {
        dossierListsBody.textContent =
          `${n} list${n === 1 ? '' : 's'} · ${listStatus.ready} ready · ` +
          `${listStatus.downloaded} downloaded · ${Number(listStatus.recordCount || 0).toLocaleString()} records`;
      }
    }
  }

  function refreshDossierListsFacet() {
    if (!selectedCity || !cityDossier || cityDossier.hidden) return;
    renderCityDossier(buildDossierModel(selectedCity, dossierHistoryCache, savedLists));
  }

  /**
   * Eager history for dossier on city select — does not block type panel.
   * Race-guarded: ignore stale responses if city changed mid-flight.
   */
  async function loadCityDossierHistory(cityId) {
    if (!cityId) return;
    if (dossierLastScrubBody) dossierLastScrubBody.textContent = 'Loading…';
    if (dossierAttachesBody) dossierAttachesBody.textContent = 'Loading…';
    try {
      const data = await fetchJson(`/api/bridge/history/${encodeURIComponent(cityId)}`);
      if (String(selectedCity?.id) !== String(cityId)) return;
      const history = Array.isArray(data.history) ? data.history : [];
      dossierHistoryCache = history;
      renderCityDossier(buildDossierModel(selectedCity, history, savedLists));
      if (historyDialog && historyDialog.open) {
        renderHistory(history);
      }
    } catch (err) {
      if (String(selectedCity?.id) !== String(cityId)) return;
      // Soft error: keep type panel; show lists facet from in-memory savedLists
      dossierHistoryCache = [];
      if (dossierLastScrubBody) {
        dossierLastScrubBody.textContent = (err && err.message) || 'Could not load history';
      }
      if (dossierAttachesBody) dossierAttachesBody.textContent = '—';
      renderCityDossier(buildDossierModel(selectedCity, [], savedLists));
    }
  }

  function syncCityOutcomeUi() {
    const status = selectedCityOutcome();
    const showNotes = status === 'other_source' || status === 'approved_bad_data';
    if (otherSourceWrap) setHidden(otherSourceWrap, !showNotes);
    const notesLabel = document.getElementById('bridge-outcome-notes-label');
    if (notesLabel && otherSourceNotes) {
      if (status === 'approved_bad_data') {
        notesLabel.textContent = 'What was wrong (optional)';
        otherSourceNotes.placeholder =
          'e.g. Scanned sideways / wrong years / parcels only / not code violations / unreadable PDF';
      } else {
        notesLabel.textContent = 'Who / where to contact';
        otherSourceNotes.placeholder =
          'e.g. Code Enforcement · (555) 123-4567 · ask for Jane · portal.city.gov/foia';
      }
    }
    if (outcomeSaveBtn) outcomeSaveBtn.disabled = !selectedCity || !status;
  }

  function resetCityOutcomeUi() {
    document.querySelectorAll('input[name="bridge-city-outcome"]').forEach((el) => {
      el.checked = false;
    });
    if (otherSourceNotes) otherSourceNotes.value = '';
    if (outcomeTypeSelect) outcomeTypeSelect.value = 'code_violation';
    setOutcomeStatus('', '');
    syncCityOutcomeUi();
  }

  async function saveCityOutcome() {
    if (!selectedCity) {
      setOutcomeStatus('Select a city first.', 'error');
      return;
    }
    const responseStatus = selectedCityOutcome();
    if (!responseStatus) {
      setOutcomeStatus('Choose a city reply option.', 'error');
      return;
    }
    const notes = (otherSourceNotes && otherSourceNotes.value || '').trim();
    if (responseStatus === 'other_source' && !notes) {
      setOutcomeStatus('Enter who/where to contact for the other source.', 'error');
      return;
    }
    if (outcomeSaveBtn) outcomeSaveBtn.disabled = true;
    setOutcomeStatus('Saving to City Tracker…', '');
    try {
      const requestType = (outcomeTypeSelect && outcomeTypeSelect.value) || 'code_violation';
      const data = await fetchJson('/api/bridge/city-outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId: selectedCity.id,
          response_status: responseStatus,
          request_type: requestType,
          notes,
          response_raw: notes
        })
      });
      const labels = {
        needs_clarification: 'Needs clarification — respond to get list',
        no: 'No records of this kind',
        other_source: 'Contact another source',
        they_charge: 'They charge for the list',
        approved_bad_data: 'Replied — info invalid to use'
      };
      const label = labels[responseStatus] || responseStatus;
      setOutcomeStatus(`Saved: ${label} for ${selectedCity.city}. Filter it in City Tracker.`, 'success');
      return data;
    } catch (err) {
      setOutcomeStatus((err && err.message) || 'Could not save city outcome', 'error');
    } finally {
      syncCityOutcomeUi();
    }
  }

  function onCityChange() {
    try {
      resetDownstream('city');
      showError('');
      const id = citySelect.value;
      if (!id) {
        selectedCity = null;
        setHidden(cityActions, true);
        hideCityDossierUi();
        resetCityOutcomeUi();
        return;
      }
      selectedCity = cities.find((city) => String(city.id) === String(id)) || null;
      if (!selectedCity) return;

      // Happy path: type panel immediately — history must not block type reveal
      setHidden(typePanel, false);
      setHidden(cityActions, false);
      setPipelineStep('type');

      // CITY-01: dossier with lists now; history loads async
      dossierHistoryCache = [];
      setHidden(cityDossier, false);
      renderCityDossier(buildDossierModel(selectedCity, [], savedLists));
      loadCityDossierHistory(selectedCity.id);

      // CITY-02: outcome scrap closed by default (no five-radio wall)
      setHidden(outcomeDrawer, false);
      setOutcomeDrawerOpen(false);
      resetCityOutcomeUi();

      if (historyLead) {
        historyLead.textContent = `Prior Filter datasets for ${selectedCity.city}, ${selectedCity.state}.`;
      }
    } catch (err) {
      showError(err.message || 'Could not update city selection.');
    }
  }

  function onUploadTypeChange() {
    const checked = document.querySelector('input[name="bridge-upload-type"]:checked');
    selectedUploadType = checked ? checked.value : '';
    resetDownstream('type');
    showError('');
    if (!selectedUploadType) return;
    setHidden(uploadPanel, false);
    setPipelineStep('upload');
  }

  function startLoadingAnimation() {
    let index = 0;
    // HTTP wait: slogans only — feed stays empty/hidden (no fake addresses)
    clearScrubFeedUi();
    loadingCopy.textContent = LOADING_STEPS[0];
    loadingTimer = window.setInterval(() => {
      index = (index + 1) % LOADING_STEPS.length;
      loadingCopy.textContent = LOADING_STEPS[index];
    }, 900);
  }

  function clearScrubFeedPlay() {
    if (feedPlayTimer) {
      window.clearInterval(feedPlayTimer);
      feedPlayTimer = null;
    }
  }

  function clearScrubFeedUi() {
    clearScrubFeedPlay();
    const feedEl = document.getElementById('bridge-scrub-feed');
    const summaryEl = document.getElementById('bridge-scrub-feed-summary');
    if (feedEl) {
      feedEl.innerHTML = '';
      feedEl.hidden = true;
    }
    if (summaryEl) {
      summaryEl.textContent = '';
      summaryEl.hidden = true;
    }
  }

  function stopLoadingAnimation() {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
    // Always clear feed interval with slogan timer (confirm/error/finally safety)
    clearScrubFeedPlay();
  }

  /**
   * Append scrub feed rows (escaped). Status class: is-kept | is-no-distress | …
   */
  function paintFeedEvents(feedEl, events, opts) {
    if (!feedEl || !Array.isArray(events)) return;
    const animated = !!(opts && opts.animated);
    for (let i = 0; i < events.length; i++) {
      const ev = events[i] || {};
      const status = String(ev.status || 'discarded');
      const li = document.createElement('li');
      li.className =
        'bridge-scrub-feed-item is-' + status + (animated ? ' is-enter' : '');
      const typeHtml = ev.type
        ? `<span class="bridge-scrub-feed-type">${esc(ev.type)}</span>`
        : '';
      li.innerHTML =
        `<span class="bridge-scrub-feed-addr">${esc(ev.address)}</span>` +
        `<span class="bridge-scrub-feed-meta">` +
        typeHtml +
        `<span class="bridge-scrub-feed-status">${esc(ev.label || status)}</span>` +
        `</span>`;
      feedEl.appendChild(li);
    }
  }

  function paintRemainders(feedEl, remainderByStatus) {
    if (!feedEl || !remainderByStatus) return;
    const parts = [];
    const order = [
      ['kept', 'kept'],
      ['no-distress', 'no distress'],
      ['discarded', 'discarded'],
      ['already-in-Analyze', 'already in Analyze']
    ];
    for (let i = 0; i < order.length; i++) {
      const key = order[i][0];
      const label = order[i][1];
      const n = Number(remainderByStatus[key]) || 0;
      if (n > 0) parts.push(`+${n.toLocaleString()} more ${label}`);
    }
    if (!parts.length) return;
    const li = document.createElement('li');
    li.className = 'bridge-scrub-feed-remainder';
    li.textContent = parts.join(' · ');
    feedEl.appendChild(li);
  }

  /**
   * Stagger row reveals until events done or maxMs wall clock.
   * Always clears feedPlayTimer on resolve.
   */
  function stageFeedEvents(feedEl, events, opts) {
    opts = opts || {};
    const tickMs = Math.max(16, Number(opts.tickMs) || 60);
    const maxMs = Math.max(0, Number(opts.maxMs) || 2000);
    const list = Array.isArray(events) ? events : [];
    const remainderByStatus = opts.remainderByStatus;

    return new Promise((resolve) => {
      clearScrubFeedPlay();
      if (!feedEl || !list.length) {
        paintRemainders(feedEl, remainderByStatus);
        resolve();
        return;
      }

      let idx = 0;
      const started = Date.now();

      const finish = () => {
        clearScrubFeedPlay();
        // Flush any remaining rows instantly so cap is always shown
        if (idx < list.length) {
          paintFeedEvents(feedEl, list.slice(idx), { animated: false });
          idx = list.length;
        }
        paintRemainders(feedEl, remainderByStatus);
        resolve();
      };

      // First row immediately so feed is not blank for a full tick
      paintFeedEvents(feedEl, [list[idx]], { animated: true });
      idx += 1;
      if (idx >= list.length) {
        finish();
        return;
      }

      feedPlayTimer = window.setInterval(() => {
        if (Date.now() - started >= maxMs) {
          finish();
          return;
        }
        paintFeedEvents(feedEl, [list[idx]], { animated: true });
        idx += 1;
        if (idx >= list.length) finish();
      }, tickMs);
    });
  }

  /**
   * FEED-01/02: stage real process outcomes after /api/bridge/process returns.
   * Client-staged only — no server-push stream / SSE / fake addresses.
   */
  async function playScrubFeedFromProcess(data) {
    const feedEl = document.getElementById('bridge-scrub-feed');
    const summaryEl = document.getElementById('bridge-scrub-feed-summary');
    const api = window.BridgeScrubFeed;
    if (!api || !feedEl || !summaryEl) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const built = api.buildScrubFeedEvents(data, { cap: api.SCRUB_FEED_CAP || 32 });
    const play = api.getScrubFeedPlayOptions({ reducedMotion: reduced });

    feedEl.innerHTML = '';
    summaryEl.textContent = api.formatScrubFeedSummary(built.summary);
    summaryEl.hidden = false;
    feedEl.hidden = false;

    if (play.stagger === false || play.maxMs === 0) {
      // FEED-02: paint summary + samples at once — no multi-second delay
      paintFeedEvents(feedEl, built.events, { animated: false });
      paintRemainders(feedEl, built.remainderByStatus);
      return;
    }

    await stageFeedEvents(feedEl, built.events, {
      tickMs: play.tickMs,
      maxMs: play.maxMs,
      remainderByStatus: built.remainderByStatus
    });
  }

  /** Operator-facing short labels for kill-reason chips (engine keys + human strings). */
  const KILL_REASON_LABELS = {
    no_address: 'No address',
    'No usable street address': 'No address',
    blank_row: 'Blank row',
    'Blank or empty row': 'Blank row',
    non_property: 'Non-property',
    'Clearly non-property record': 'Non-property',
    duplicate: 'Deduped',
    'Near-duplicate within upload': 'Deduped',
    already_imported: 'Already in Analyze',
    'Already imported in Analyze': 'Already in Analyze',
    no_distress_signal: 'No distress signal',
    'No distressed signal (generic code violation)': 'No distress signal',
    parse_error: 'Parse error',
    'Could not parse row': 'Parse error'
  };

  function killReasonLabel(key) {
    if (KILL_REASON_LABELS[key]) return KILL_REASON_LABELS[key];
    const s = String(key || '');
    if (/no usable street address/i.test(s)) return 'No address';
    if (/blank or empty/i.test(s)) return 'Blank row';
    if (/non-property/i.test(s)) return 'Non-property';
    if (/near-duplicate|dedup/i.test(s)) return 'Deduped';
    if (/already imported/i.test(s)) return 'Already in Analyze';
    if (/no distressed signal|no_distress/i.test(s)) return 'No distress signal';
    if (/could not parse|parse error/i.test(s)) return 'Parse error';
    return s || 'Other';
  }

  function buildKillReasons(s) {
    const counts = new Map();
    const reasons = s.discardReasons || {};
    Object.entries(reasons).forEach(([key, n]) => {
      const count = Number(n) || 0;
      if (count <= 0) return;
      const label = killReasonLabel(key);
      counts.set(label, (counts.get(label) || 0) + count);
    });
    // Merge non-zero counters without double-label spam
    const counterPairs = [
      [Number(s.noDistress) || 0, 'No distress signal'],
      [Number(s.deduplicated) || 0, 'Deduped'],
      [Number(s.alreadyImported) || 0, 'Already in Analyze']
    ];
    counterPairs.forEach(([count, label]) => {
      if (count <= 0) return;
      if (!counts.has(label)) counts.set(label, count);
    });
    return [...counts.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => (
        `<span class="bridge-kill-reason">${n.toLocaleString()} ${esc(label)}</span>`
      ))
      .join('');
  }

  function buildProofChips(s, meta) {
    const chips = [];
    const ms = meta.durationMs;
    if (Number.isFinite(ms) && ms >= 0) {
      chips.push(`<span class="bridge-proof-chip">Scrubbed in ${(ms / 1000).toFixed(1)}s</span>`);
    }
    const tr = meta.typeResolution;
    if (tr && tr.source === 'auto_reuse') {
      const typeBit = tr.header
        ? ` · Type: ${esc(tr.header)}`
        : ' · No type column';
      chips.push(`<span class="bridge-proof-chip">Format reused${typeBit}</span>`);
    }
    if (meta.parser) {
      chips.push(`<span class="bridge-proof-chip">${esc(String(meta.parser))}</span>`);
    }
    const idx = Number(meta.importIndexCount);
    if (Number.isFinite(idx) && idx > 0) {
      chips.push(`<span class="bridge-proof-chip">${idx.toLocaleString()} in Analyze index</span>`);
    }
    const needsReview = Number(s.needsReview) || Number(s.lowConfidence) || 0;
    if (needsReview > 0) {
      chips.push(`<span class="bridge-proof-chip">Needs review · ${needsReview.toLocaleString()}</span>`);
    }
    // Independence proof (LIST-03 / IND) — chip + stub clean path keep "nothing was sent to Analyze"
    chips.push('<span class="bridge-proof-chip">Nothing sent to Analyze</span>');
    return chips.join('');
  }

  function buildKeptSamples(rows) {
    if (!rows || !rows.length) return '';
    const sorted = rows.slice().sort((a, b) => {
      const aStrong = /strong/i.test(String(a.distressedSignalTag || '')) ? 0 : 1;
      const bStrong = /strong/i.test(String(b.distressedSignalTag || '')) ? 0 : 1;
      return aStrong - bStrong;
    });
    const samples = sorted.slice(0, 3);
    const cards = samples.map((row) => {
      const tag = row.distressedSignalTag || '';
      const tagHtml = tag
        ? `<span class="bridge-tag bridge-tag--${tagClass(tag)}">${esc(tag)}</span>`
        : '';
      return (
        `<article class="bridge-kept-sample">` +
        `<strong class="bridge-kept-sample-addr">${esc(row.streetAddress || '—')}</strong>` +
        `<span class="bridge-kept-sample-type">${esc(row.violationIssueType || '')}</span>` +
        tagHtml +
        `</article>`
      );
    }).join('');
    return `<div class="bridge-kept-samples" aria-label="Sample kept records">${cards}</div>`;
  }

  function renderKpis(stats) {
    if (!kpiGrid) return;
    const s = stats || {};
    const data = lastResult || {};
    const meta = data.processingMeta || {};
    const rows = data.rows || [];

    const kept = Number(s.kept);
    const keptN = Number.isFinite(kept) ? kept : rows.length;
    let raw = Number(s.totalParsed);
    if (!Number.isFinite(raw) || raw < 0) {
      const fallbackKilled =
        (Number(s.discarded) || 0) +
        (Number(s.deduplicated) || 0) +
        (Number(s.alreadyImported) || 0);
      raw = keptN + Math.max(0, fallbackKilled);
    }
    const killed = Math.max(0, raw - keptN);

    const reasonHtml = buildKillReasons(s);
    const proofHtml = buildProofChips(s, meta);
    const samplesHtml = buildKeptSamples(rows);

    kpiGrid.classList.add('bridge-kill-report');
    kpiGrid.innerHTML =
      `<div class="bridge-kill-flow" role="group" aria-label="Kill-rate scrub report">` +
      `<div class="bridge-kill-stat bridge-kill-stat--raw">` +
      `<span class="bridge-kill-stat-value">${raw.toLocaleString()}</span>` +
      `<span class="bridge-kill-stat-label">RAW</span>` +
      `</div>` +
      `<span class="bridge-kill-arrow" aria-hidden="true">→</span>` +
      `<div class="bridge-kill-stat bridge-kill-stat--killed">` +
      `<span class="bridge-kill-stat-value">${killed.toLocaleString()}</span>` +
      `<span class="bridge-kill-stat-label">KILLED</span>` +
      `</div>` +
      `<span class="bridge-kill-arrow" aria-hidden="true">→</span>` +
      `<div class="bridge-kill-stat bridge-kill-stat--kept">` +
      `<span class="bridge-kill-stat-value">${keptN.toLocaleString()}</span>` +
      `<span class="bridge-kill-stat-label">KEPT</span>` +
      `</div>` +
      `</div>` +
      (reasonHtml ? `<div class="bridge-kill-reasons">${reasonHtml}</div>` : '') +
      (proofHtml ? `<div class="bridge-proof-chips">${proofHtml}</div>` : '') +
      samplesHtml;
  }

  function setSaveStatus(message, tone) {
    if (!saveStatus) return;
    setHidden(saveStatus, !message);
    saveStatus.textContent = message || '';
    saveStatus.classList.remove('is-error', 'is-success');
    if (tone) saveStatus.classList.add(`is-${tone}`);
  }

  function defaultNameFromResult(data) {
    if (!data) return '';
    const typeLabel = data.uploadType === 'water_shut_off' ? 'Water Shut Off' : 'Code Violation';
    const city = data.city?.city || selectedCity?.city || 'List';
    const when = new Date();
    const datePart = when.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    return `${city} · ${typeLabel} · ${datePart}`;
  }

  function statusLabel(status) {
    if (status === 'downloaded') return 'Downloaded';
    return 'Ready';
  }

  function formatListWhen(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (err) {
      return String(iso);
    }
  }

  /** IDLE-01: derive desk-rest proof metrics from savedLists summaries (no extra fetch). */
  function computeIdleProof(lists) {
    const rows = Array.isArray(lists) ? lists : [];
    const listCount = rows.length;
    const recordTotal = rows.reduce((s, r) => s + (Number(r.recordCount) || 0), 0);
    const lastSaveAt = rows[0]?.createdAt || null; // API sorts createdAt desc
    return { listCount, recordTotal, lastSaveAt };
  }

  /** IDLE-01: render live inventory strip under hero from computeIdleProof(savedLists). */
  function renderIdleProof() {
    const lineEl = document.getElementById('bridge-idle-proof-line');
    if (!lineEl) return;
    const { listCount, recordTotal, lastSaveAt } = computeIdleProof(savedLists);
    if (listCount === 0) {
      lineEl.textContent = '0 lists staged · Ready when you scrub the first city';
      return;
    }
    const listsLabel = listCount === 1 ? 'list' : 'lists';
    const recordsLabel = recordTotal === 1 ? 'record' : 'records';
    lineEl.textContent =
      `${listCount.toLocaleString()} ${listsLabel} staged · ` +
      `${recordTotal.toLocaleString()} ${recordsLabel} ready · ` +
      `Last save ${formatListWhen(lastSaveAt)}`;
  }

  /** Saved-list kind chip: hazard for code violation, water for shut-off. */
  function listUploadTypeBadge(uploadType) {
    const t = String(uploadType || '').trim().toLowerCase();
    if (t === 'water_shut_off' || t === 'water' || t.includes('water')) {
      return {
        kind: 'water',
        emoji: '💧',
        label: 'Water shut-off',
        title: 'Water shut-off list'
      };
    }
    // Default / code_violation / anything else → hazard (code violation)
    return {
      kind: 'violation',
      emoji: '⚠️',
      label: 'Code violation',
      title: 'Code violation list'
    };
  }

  function renderSavedLists() {
    const listsTotalEl = document.getElementById('bridge-lists-total');
    if (!listsBody) return;
    if (!savedLists.length) {
      setHidden(listsEmpty, false);
      setHidden(listsWrap, true);
      setHidden(listsToolbar, true);
      listsBody.innerHTML = '';
      if (listsTotalEl) {
        listsTotalEl.textContent = '';
        setHidden(listsTotalEl, true);
      }
      refreshDossierListsFacet();
      renderIdleProof(); // IDLE-01: honest zeros on empty inventory
      return;
    }
    setHidden(listsEmpty, true);
    setHidden(listsWrap, false);
    setHidden(listsToolbar, false);
    listsBody.innerHTML = savedLists.map((list) => {
      const cityLabel = [list.city, list.state].filter(Boolean).join(', ') || '—';
      const kind = listUploadTypeBadge(list.uploadType);
      return (
        `<tr data-list-id="${esc(list.id)}" data-upload-type="${esc(list.uploadType || kind.kind)}">` +
        `<td class="bridge-list-type-cell">` +
        `<span class="bridge-list-type bridge-list-type--${esc(kind.kind)}" title="${esc(kind.title)}" aria-label="${esc(kind.title)}">` +
        `<span class="bridge-list-type-emoji" aria-hidden="true">${kind.emoji}</span>` +
        `<span class="bridge-list-type-text">${esc(kind.label)}</span>` +
        `</span></td>` +
        `<td><input type="text" class="bridge-list-name-input" data-action="rename" value="${esc(list.name)}" maxlength="120" aria-label="List name" /></td>` +
        `<td>${esc(formatListWhen(list.createdAt))}</td>` +
        `<td>${Number(list.recordCount || 0).toLocaleString()}</td>` +
        `<td><span class="bridge-list-status bridge-list-status--${esc(list.status || 'ready')}">${esc(statusLabel(list.status))}</span></td>` +
        `<td>${esc(cityLabel)}</td>` +
        `<td class="bridge-list-actions">` +
        `<button type="button" class="bridge-list-action" data-action="download" data-format="csv">CSV</button>` +
        `<button type="button" class="bridge-list-action" data-action="download" data-format="xlsx">XLSX</button>` +
        `<button type="button" class="bridge-list-action bridge-list-action--danger" data-action="delete">Delete</button>` +
        `</td>` +
        `</tr>`
      );
    }).join('');
    // Combined record count across all staged lists
    const totalRecords = savedLists.reduce(
      (sum, row) => sum + (Number(row.recordCount) || 0),
      0
    );
    const listCount = savedLists.length;
    if (listsTotalEl) {
      listsTotalEl.textContent =
        `Total: ${totalRecords.toLocaleString()} record${totalRecords === 1 ? '' : 's'}` +
        ` across ${listCount.toLocaleString()} list${listCount === 1 ? '' : 's'}`;
      setHidden(listsTotalEl, false);
    }
    // CITY-01: refresh dossier staged-lists facet when inventory changes
    refreshDossierListsFacet();
    renderIdleProof(); // IDLE-01: live lists staged · records ready · last save
  }

  async function loadSavedLists() {
    try {
      const data = await fetchJson('/api/bridge/lists');
      savedLists = Array.isArray(data.lists) ? data.lists : [];
      renderSavedLists();
    } catch (err) {
      console.warn('[Filter] Could not load saved lists:', err.message);
    }
  }

  /**
   * After Save list: full fresh-filter reset so the next city cannot inherit
   * the previous session's city, type, file, response time, results, or Train state.
   * Saved lists + optional flash download stay; never auto-downloads.
   */
  function resetImportAreaAfterSave(savedLabel, savedListId) {
    // --- Working set & train session ---
    lastResult = null;
    selectedCity = null;
    selectedUploadType = '';
    selectedFiles = [];
    trainUndoStack.length = 0;
    clearTrainDecidedKeys();
    trainSearchQuery = '';
    trainPage = { distressed: 1, notDistressed: 1 };
    brainVersion = null;
    resultsMode = 'kept';
    const trainSearchInput = document.getElementById('bridge-train-search');
    if (trainSearchInput) trainSearchInput.value = '';

    // --- Location / type / file / response chrome ---
    clearFileUi();
    clearResponseDateTime();
    resetCityOutcomeUi();
    document.querySelectorAll('input[name="bridge-upload-type"]').forEach((input) => {
      input.checked = false;
    });
    // Clear city pick; keep state + city dropdown options so next TX city is one click
    if (citySelect && !citySelect.disabled) {
      citySelect.value = '';
    }
    setHidden(cityActions, true);
    hideCityDossierUi();
    setHidden(typePanel, true);
    setHidden(uploadPanel, true);

    // --- Results / save / attach / train chrome ---
    setHidden(resultsPanel, true);
    setHidden(loadingPanel, true);
    setHidden(savePanel, true);
    setHidden(attachPanel, true);
    setHidden(resultsToolbar, true);
    setHidden(tableWrap, true);
    setHidden(paginationEl, true);
    setSaveStatus('', '');
    setAttachStatus('', '');
    if (listNameInput) listNameInput.value = '';
    if (resultsMeta) resultsMeta.textContent = '';
    if (kpiGrid) kpiGrid.innerHTML = '';
    if (resultsBody) resultsBody.innerHTML = '';
    if (filterSearch) filterSearch.value = '';
    if (filterTag) filterTag.value = '';
    if (filterConfidence) filterConfidence.value = '';
    if (filterReview) filterReview.checked = false;
    const stubNote = document.getElementById('bridge-stub-note');
    if (stubNote) {
      stubNote.textContent = '';
      setHidden(stubNote, true);
    }
    const trainWrap = document.getElementById('bridge-train-wrap');
    setHidden(trainWrap, true);
    const trainD = document.getElementById('bridge-train-distressed');
    const trainN = document.getElementById('bridge-train-not-distressed');
    if (trainD) trainD.innerHTML = '';
    if (trainN) trainN.innerHTML = '';
    setTrainStatus('', '');
    updateTrainUndoButton();
    // Mode tabs back to default kept (results panel is hidden)
    const modeKept = document.getElementById('bridge-mode-kept');
    const modeTrain = document.getElementById('bridge-mode-train');
    const modeBrain = document.getElementById('bridge-mode-brain');
    if (modeKept) {
      modeKept.classList.add('is-active');
      modeKept.setAttribute('aria-selected', 'true');
    }
    if (modeTrain) {
      modeTrain.classList.remove('is-active');
      modeTrain.setAttribute('aria-selected', 'false');
    }
    if (modeBrain) {
      modeBrain.classList.remove('is-active');
      modeBrain.setAttribute('aria-selected', 'false');
    }

    setPipelineStep('location');
    showError('');

    // Soft status on save panel is cleared; toast on Saved lists (download is click-only)
    const listsPanel = document.getElementById('bridge-lists-panel');
    if (listsPanel) {
      let flash = document.getElementById('bridge-lists-flash');
      if (!flash) {
        flash = document.createElement('div');
        flash.id = 'bridge-lists-flash';
        flash.className = 'bridge-lists-flash';
        flash.setAttribute('role', 'status');
        const lead = listsPanel.querySelector('.bridge-panel-lead');
        if (lead) lead.insertAdjacentElement('afterend', flash);
        else listsPanel.prepend(flash);
      }
      // DOM build (not raw HTML) so list names stay escaped via text nodes
      flash.textContent = '';
      const teaching = document.createElement('span');
      teaching.className = 'bridge-lists-flash-text';
      teaching.textContent = savedLabel
        ? `Saved “${savedLabel}”. Filter reset — pick the next city to start a fresh list, or download from Saved lists for enrichment.`
        : 'List saved. Filter reset — pick the next city to start a fresh list, or download from Saved lists for enrichment.';
      flash.appendChild(teaching);
      // One-click CSV for the just-saved list only — never auto-download.
      // Wire via data-action; click handled outside this function (EFF-02).
      if (savedListId) {
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.id = 'bridge-flash-download-csv';
        dlBtn.className = 'bridge-flash-download bridge-list-action';
        dlBtn.dataset.action = 'flash-download';
        dlBtn.dataset.listId = String(savedListId);
        dlBtn.dataset.format = 'csv';
        dlBtn.textContent = 'Download this list (CSV)';
        flash.appendChild(dlBtn);
      }
      flash.hidden = false;
      window.setTimeout(() => {
        if (flash) flash.hidden = true;
      }, 10000);
      listsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // Focus location step so the next city is obvious
    try {
      citySelect?.focus();
    } catch (_) { /* ignore */ }
  }

  async function saveCurrentList() {
    if (!lastResult?.rows?.length) {
      setSaveStatus('Process a file with kept rows before saving.', 'error');
      return;
    }
    // LIST-02 soft Train-before-Save (admin only; never hard-block without cancel)
    if (isBridgeAdmin() && resultsMode === 'train') {
      const open = filterUndecidedTrainGroups(
        (getReviewGroups(lastResult).distressed || []).concat(
          getReviewGroups(lastResult).notDistressed || []
        )
      ).length;
      if (open > 0) {
        const ok = window.confirm(
          `${open} Train group(s) are still visible. Save this list now?\n\n` +
          `Tip: Finish Approve/Deny first so this download matches your decisions.`
        );
        if (!ok) return;
      }
    }
    const name = String(listNameInput?.value || '').trim() || defaultNameFromResult(lastResult);
    if (saveListBtn) saveListBtn.disabled = true;
    setSaveStatus('Saving list…', '');
    lastFailedAction = 'saveList';
    try {
      const data = await fetchJson('/api/bridge/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          rows: lastResult.rows,
          stats: lastResult.stats || {},
          cityId: lastResult.city?.id || selectedCity?.id || '',
          cityName: lastResult.city?.city || selectedCity?.city || '',
          state: lastResult.city?.state || selectedCity?.state || '',
          uploadType: lastResult.uploadType || selectedUploadType,
          sourceFile: lastResult.sourceFile || '',
          processingMeta: lastResult.processingMeta || {}
        })
      });
      const savedName = data.list?.name || name;
      const savedId = data.list?.id || '';
      await loadSavedLists();
      resetImportAreaAfterSave(savedName, savedId);
    } catch (err) {
      setSaveStatus(err.message || 'Could not save list.', 'error');
    } finally {
      if (saveListBtn) saveListBtn.disabled = false;
    }
  }

  async function downloadAllSavedLists(format) {
    if (!savedLists.length) {
      showError('No saved lists to download yet.');
      return;
    }
    const fmt = format === 'xlsx' ? 'xlsx' : 'csv';
    try {
      const res = await fetch(`/api/bridge/lists/download-all?format=${fmt}`, {
        cache: 'no-store',
        headers: bridgeHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `filter-lists-all.${fmt}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      await loadSavedLists();
    } catch (err) {
      showError(err.message || 'Could not download all lists.');
    }
  }

  async function clearAllSavedLists() {
    if (!savedLists.length) return;
    const count = savedLists.length;
    const total = savedLists.reduce((sum, row) => sum + (Number(row.recordCount) || 0), 0);
    if (!window.confirm(
      `Clear all ${count} saved list(s) (${total.toLocaleString()} records)?\n\nThis cannot be undone. Use this for a fresh day of city uploads.`
    )) return;
    try {
      await fetchJson('/api/bridge/lists', { method: 'DELETE' });
      await loadSavedLists();
      const flash = document.getElementById('bridge-lists-flash');
      if (flash) {
        flash.textContent = 'All saved lists cleared. Ready for a new day.';
        flash.hidden = false;
        window.setTimeout(() => { flash.hidden = true; }, 5000);
      }
    } catch (err) {
      showError(err.message || 'Could not clear saved lists.');
    }
  }

  async function renameSavedList(listId, name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) {
      await loadSavedLists();
      return;
    }
    try {
      await fetchJson(`/api/bridge/lists/${encodeURIComponent(listId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleaned })
      });
      await loadSavedLists();
    } catch (err) {
      showError(err.message || 'Could not rename list.');
      await loadSavedLists();
    }
  }

  async function deleteSavedList(listId) {
    const list = savedLists.find((row) => row.id === listId);
    const label = list?.name || 'this list';
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/bridge/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
      await loadSavedLists();
    } catch (err) {
      showError(err.message || 'Could not delete list.');
    }
  }

  async function downloadSavedList(listId, format) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'csv';
    const url = `/api/bridge/lists/${encodeURIComponent(listId)}/download?format=${fmt}`;
    try {
      const res = await fetch(url, { cache: 'no-store', headers: bridgeHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `filter-list.${fmt}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      await loadSavedLists();
    } catch (err) {
      showError(err.message || 'Download failed.');
    }
  }

  function tagClass(tag) {
    if (/strong/i.test(tag)) return 'strong';
    if (/water shut off/i.test(tag)) return 'water';
    return 'standard';
  }

  function getFilteredRows() {
    if (!lastResult?.rows) return [];
    const query = String(filterSearch?.value || '').trim().toLowerCase();
    const tag = filterTag?.value || '';
    const confidence = filterConfidence?.value || '';
    const reviewOnly = Boolean(filterReview?.checked);

    return lastResult.rows.filter((row) => {
      if (reviewOnly && !row.needsReview) return false;
      if (tag && row.distressedSignalTag !== tag) return false;
      if (confidence && row.confidenceLevel !== confidence) return false;
      if (!query) return true;
      const haystack = [
        row.streetAddress,
        row.violationIssueType,
        row.distressedSignalTag,
        row.descriptionNotes
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function sortRows(rows) {
    const key = tableState.sortKey;
    const dir = tableState.sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const left = String(a[key] || '').toLowerCase();
      const right = String(b[key] || '').toLowerCase();
      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
      return 0;
    });
  }

  function populateTagFilter(rows) {
    if (!filterTag) return;
    const tags = [...new Set(rows.map((row) => row.distressedSignalTag).filter(Boolean))].sort();
    const current = filterTag.value;
    filterTag.innerHTML = '<option value="">All tags</option>' +
      tags.map((tag) => `<option value="${esc(tag)}">${esc(tag)}</option>`).join('');
    if (tags.includes(current)) filterTag.value = current;
  }

  function updateSortHeaders() {
    resultsTable?.querySelectorAll('th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === tableState.sortKey;
      th.classList.toggle('is-sorted', active);
      th.dataset.sortDir = active ? (tableState.sortDir === 'asc' ? '▲' : '▼') : '';
    });
  }

  function renderResultsTable() {
    if (!lastResult) return;
    const filtered = sortRows(getFilteredRows());
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (tableState.page > totalPages) tableState.page = totalPages;
    const start = (tableState.page - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    resultsBody.innerHTML = pageRows.map((row) => (
      `<tr class="${row.needsReview ? 'bridge-row-review' : ''}">` +
      `<td>${esc(row.streetAddress)}</td>` +
      `<td>${esc(row.violationIssueType)}</td>` +
      `<td><span class="bridge-tag bridge-tag--${tagClass(row.distressedSignalTag)}">${esc(row.distressedSignalTag)}</span></td>` +
      `<td>${esc(row.confidenceLevel)}${row.needsReview ? ' <span class="bridge-review-flag">Review</span>' : ''}</td>` +
      `<td>${esc(row.violationDate)}</td>` +
      `</tr>`
    )).join('') || '<tr><td colspan="5">No rows match the current filters.</td></tr>';

    paginationEl.innerHTML =
      `<span>${filtered.length.toLocaleString()} shown · page ${tableState.page} of ${totalPages}</span>` +
      '<div class="bridge-pagination-actions">' +
      `<button type="button" class="bridge-pagination-btn" data-page="prev" ${tableState.page <= 1 ? 'disabled' : ''}>Previous</button>` +
      `<button type="button" class="bridge-pagination-btn" data-page="next" ${tableState.page >= totalPages ? 'disabled' : ''}>Next</button>` +
      '</div>';
    updateSortHeaders();
  }

  function rowsToCsv(rows) {
    const escape = (value) => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const cellValue = (row, key) => {
      const value = row[key];
      if (key === 'matchedIndicators' && Array.isArray(value)) {
        return value.filter(Boolean).join('; ');
      }
      return value;
    };
    const headers = EXPORT_COLUMNS.map(([, label]) => label);
    const lines = [
      headers.map(escape).join(','),
      ...rows.map((row) => EXPORT_COLUMNS.map(([key]) => escape(cellValue(row, key))).join(','))
    ];
    return `${lines.join('\n')}\n`;
  }

  function downloadCsv(rows, filename) {
    const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function setAttachStatus(message, tone) {
    if (!attachStatus) return;
    setHidden(attachStatus, !message);
    attachStatus.textContent = message || '';
    attachStatus.classList.remove('is-error', 'is-success');
    if (tone) attachStatus.classList.add(`is-${tone}`);
  }

  function openHistoryDialog() {
    if (!selectedCity || !historyDialog) return;
    if (historyLead) {
      historyLead.textContent = `Prior Filter datasets for ${selectedCity.city}, ${selectedCity.state}.`;
    }
    historyDialog.showModal();
    loadHistory(selectedCity.id).catch(() => {});
  }

  function closeHistoryDialog() {
    historyDialog?.close();
  }

  async function loadHistory(cityId) {
    if (!cityId || !historyList) return;
    historyList.innerHTML = '<p class="bridge-history-empty">Loading history…</p>';
    try {
      const data = await fetchJson(`/api/bridge/history/${encodeURIComponent(cityId)}`);
      const history = data.history || [];
      renderHistory(history);
      // Keep dossier in sync after attach / dialog load when city still selected
      if (selectedCity && String(selectedCity.id) === String(cityId)) {
        dossierHistoryCache = history;
        renderCityDossier(buildDossierModel(selectedCity, history, savedLists));
      }
    } catch (err) {
      historyList.innerHTML = `<p class="bridge-history-empty">${esc(err.message || 'Could not load history')}</p>`;
    }
  }

  function renderHistory(history) {
    if (!history.length) {
      historyList.innerHTML = '<p class="bridge-history-empty">No datasets attached yet for this city.</p>';
      return;
    }
    historyList.innerHTML = history.map((entry) => {
      const links = [];
      if (entry.csv_download_url) links.push(`<a href="${esc(entry.csv_download_url)}" download>CSV</a>`);
      if (entry.xlsx_download_url) links.push(`<a href="${esc(entry.xlsx_download_url)}" download>XLSX</a>`);
      return (
        '<article class="bridge-history-item">' +
        '<div class="bridge-history-item-main">' +
        `<div class="bridge-history-title">${esc(entry.upload_type_label || entry.upload_type)} · ${esc(entry.original_filename || 'dataset')}</div>` +
        `<div class="bridge-history-meta">` +
        `${Number(entry.kept_count || 0).toLocaleString()} kept` +
        `${entry.response_received_at ? ` · received ${esc(formatDisplayDate(entry.response_received_at))}` : ''}` +
        `${entry.attached_at ? ` · attached ${esc(formatDisplayDate(entry.attached_at))}` : ''}` +
        '</div></div>' +
        `<div class="bridge-history-links">${links.join('') || '<span class="bridge-history-empty">No files</span>'}</div>` +
        '</article>'
      );
    }).join('');
  }

  function renderResults(data) {
    lastResult = data;
    tableState.page = 1;
    const stats = data.stats || {};
    const rows = data.rows || [];
    const uploadLabel = data.uploadType === 'water_shut_off' ? 'Water Shut Off' : 'Code Violation';
    const fileCount = Number(data.fileCount) || (Array.isArray(data.sourceFiles) ? data.sourceFiles.length : 1) || 1;
    const fileLabel = fileCount > 1
      ? `${fileCount} files (${data.sourceFile})`
      : data.sourceFile;
    // Slim ops context only — duration / Format reused / parser live on proof chips (renderKpis)
    const cityBit = data.city
      ? `${data.city.city}, ${data.city.state}`
      : '';
    let trainTip = '';
    if (isBridgeAdmin()) {
      const openTrain = filterUndecidedTrainGroups(
        (getReviewGroups(data).distressed || []).concat(
          getReviewGroups(data).notDistressed || []
        )
      ).length;
      if (openTrain > 0) {
        trainTip = ` · ${openTrain} Train group(s) ready`;
      }
    }
    resultsMeta.textContent = [uploadLabel, cityBit, fileLabel].filter(Boolean).join(' · ') + trainTip;
    renderKpis(stats);

    const stubNote = document.getElementById('bridge-stub-note');
    const showTable = !data.stub && rows.length > 0;
    setHidden(resultsToolbar, !showTable);
    setHidden(tableWrap, !showTable);
    setHidden(paginationEl, !showTable);
    setHidden(savePanel, !showTable);
    setHidden(attachPanel, !showTable);

    if (showTable) {
      populateTagFilter(rows);
      renderResultsTable();
      setAttachStatus('', '');
      setSaveStatus('', '');
      if (listNameInput) listNameInput.value = defaultNameFromResult(data);
    }

    if (stubNote) {
      // Kill report owns discard/review/independence proof chips — hide stub for normal process.
      // Keep stub path for data.stub and rare edge prose; independence phrase stays in source.
      if (data.stub) {
        setHidden(stubNote, false);
        stubNote.textContent =
          'Stub / edge process path. Save the list below — nothing was sent to Analyze.';
      } else {
        setHidden(stubNote, true);
        stubNote.textContent = '';
      }
    }

    // Train brain (admin-only) — additive; non-admin never sees train chrome
    const trainWrap = document.getElementById('bridge-train-wrap');
    if (isBridgeAdmin()) {
      setHidden(trainWrap, false);
      renderTrainGroups(getReviewGroups(data), data);
      const openCount = countOpenTrainGroups(data, trainDecidedKeys);
      updateTrainMissionHeader(openCount, (data.rows || []).length);
      // THTR-01: process success forces Train theater when open groups remain
      if (forceTrainTheater) {
        forceTrainTheater = false;
        setResultsMode(openCount > 0 ? 'train' : 'kept');
      } else {
        setResultsMode(resultsMode || 'kept');
      }
    } else {
      setHidden(trainWrap, true);
      const mission = document.getElementById('bridge-train-mission');
      if (mission) setHidden(mission, true);
      const d = document.getElementById('bridge-train-distressed');
      const n = document.getElementById('bridge-train-not-distressed');
      if (d) d.innerHTML = '';
      if (n) n.innerHTML = '';
      setTrainStatus('', '');
    }

    setHidden(resultsPanel, false);
    setPipelineStep('results');
  }

  /**
   * Build multipart FormData for /api/bridge/process.
   * Optional resume fields:
   * - confirmedTypeHeader + formatFingerprint (single format)
   * - confirmedFormats: [{ formatFingerprint, confirmedTypeHeader }] (mixed sheets)
   */
  function buildProcessFormData(confirmOpts) {
    const form = new FormData();
    form.append('cityId', selectedCity.id);
    form.append('uploadType', selectedUploadType);
    for (const file of selectedFiles) {
      form.append('file', file, file.name);
    }
    if (confirmOpts && Object.prototype.hasOwnProperty.call(confirmOpts, 'confirmedTypeHeader')) {
      const raw = confirmOpts.confirmedTypeHeader;
      form.append(
        'confirmedTypeHeader',
        raw === null || raw === undefined || raw === '' ? '__none__' : String(raw)
      );
    }
    if (confirmOpts && confirmOpts.formatFingerprint) {
      form.append('formatFingerprint', String(confirmOpts.formatFingerprint));
    }
    if (confirmOpts && Array.isArray(confirmOpts.confirmedFormats) && confirmOpts.confirmedFormats.length) {
      form.append('confirmedFormats', JSON.stringify(confirmOpts.confirmedFormats));
    }
    return form;
  }

  /**
   * Normalize TYPE_COLUMN_CONFIRM_REQUIRED payload into one or more format steps.
   * Mixed-header batches return formats[]; single-format keeps top-level fields.
   */
  function formatsNeedingConfirm(details) {
    if (!details) return [];
    if (Array.isArray(details.formats) && details.formats.length) {
      return details.formats.map((f) => ({
        formatFingerprint: f.formatFingerprint,
        candidates: f.candidates || [],
        suggestedHeader: f.suggestedHeader != null ? f.suggestedHeader : null,
        filenames: Array.isArray(f.filenames) ? f.filenames : [],
        city: details.city
      }));
    }
    return [{
      formatFingerprint: details.formatFingerprint,
      candidates: details.candidates || [],
      suggestedHeader: details.suggestedHeader != null ? details.suggestedHeader : null,
      filenames: Array.isArray(details.files)
        ? details.files.map((x) => (x && x.filename) || x).filter(Boolean)
        : [],
      city: details.city
    }];
  }

  /**
   * Wait until the Type confirm <dialog> is fully closed so showModal() for
   * format N+1 does not throw (NotAllowedError / already open).
   */
  function waitTypeConfirmDialogClosed() {
    return new Promise((resolve) => {
      if (!typeConfirmDialog || !typeConfirmDialog.open) {
        // Brief yield so the browser paints the close before next open
        setTimeout(resolve, 40);
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        typeConfirmDialog.removeEventListener('close', done);
        setTimeout(resolve, 40);
      };
      typeConfirmDialog.addEventListener('close', done);
      // Safety: never hang the multi-format loop
      setTimeout(done, 400);
    });
  }

  /**
   * Walk each distinct sheet format and collect Type column confirms.
   * Always attaches filenames so the server can map confirms even if PDF
   * fingerprints drift between pre-scan and process.
   * @returns {Promise<Array|{cancelled:true}>}
   */
  async function collectMultiFormatConfirms(details) {
    const steps = formatsNeedingConfirm(details);
    if (!steps.length) {
      // Defensive: top-level only payload with no formats[] / fingerprint
      steps.push({
        formatFingerprint: details && details.formatFingerprint,
        candidates: (details && details.candidates) || [],
        suggestedHeader: details ? details.suggestedHeader : null,
        filenames: Array.isArray(details && details.filenames)
          ? details.filenames
          : (selectedFiles || []).map((f) => f.name),
        city: details && details.city
      });
    }
    const confirmedFormats = [];
    // Prefer formats[] total when server reports more steps than this payload
    // (e.g. formatCount) so the lead text stays honest across rounds.
    const reportedTotal =
      details && details.formatCount != null
        ? Number(details.formatCount)
        : steps.length;
    const formatTotal = Math.max(steps.length, Number.isFinite(reportedTotal) ? reportedTotal : steps.length);

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const names = Array.isArray(step.filenames) && step.filenames.length
        ? step.filenames
        : (selectedFiles || []).map((f) => f.name);
      const stepDetails = {
        ...step,
        filenames: names,
        city: step.city || (details && details.city),
        multiFormat:
          formatTotal > 1 ||
          steps.length > 1 ||
          (selectedFiles && selectedFiles.length > 1) ||
          Boolean(details && details.multiFormat),
        formatIndex: i + 1,
        formatTotal
      };
      // Allow dialog to fully close before re-opening for the next format
      if (i > 0) {
        await waitTypeConfirmDialogClosed();
      }
      const choice = await openTypeColumnConfirmDialog(stepDetails);
      if (choice === undefined) {
        return { cancelled: true };
      }
      await waitTypeConfirmDialogClosed();
      confirmedFormats.push({
        formatFingerprint: step.formatFingerprint || null,
        confirmedTypeHeader: choice,
        filenames: names
      });
    }
    return confirmedFormats;
  }

  /**
   * Merge newly confirmed formats into accumulator (by fingerprint + filenames).
   */
  function mergeConfirmedFormats(existing, incoming) {
    const out = Array.isArray(existing) ? existing.slice() : [];
    for (const item of incoming || []) {
      if (!item) continue;
      const fp = item.formatFingerprint != null ? String(item.formatFingerprint) : '';
      let idx = -1;
      if (fp) {
        idx = out.findIndex((x) => x && String(x.formatFingerprint || '') === fp);
      }
      if (idx < 0 && Array.isArray(item.filenames) && item.filenames.length) {
        const nameSet = new Set(item.filenames.map(String));
        idx = out.findIndex(
          (x) =>
            Array.isArray(x.filenames) &&
            x.filenames.some((n) => nameSet.has(String(n)))
        );
      }
      if (idx >= 0) {
        const prev = out[idx];
        const names = [
          ...new Set([...(prev.filenames || []), ...(item.filenames || [])].filter(Boolean))
        ];
        out[idx] = {
          formatFingerprint: item.formatFingerprint || prev.formatFingerprint || null,
          confirmedTypeHeader: item.confirmedTypeHeader,
          filenames: names
        };
      } else {
        out.push({
          formatFingerprint: item.formatFingerprint || null,
          confirmedTypeHeader: item.confirmedTypeHeader,
          filenames: Array.isArray(item.filenames) ? item.filenames.slice() : []
        });
      }
    }
    return out;
  }

  /**
   * Fallback when <dialog>.showModal is unavailable — never silent-fail process.
   * @returns {string|null|undefined} header | null (no type) | undefined (cancel)
   */
  function fallbackTypeColumnConfirm(details) {
    const suggested = details && details.suggestedHeader != null
      ? String(details.suggestedHeader)
      : '';
    const cityLabel = details && details.city
      ? [details.city.city, details.city.state].filter(Boolean).join(', ')
      : (selectedCity ? [selectedCity.city, selectedCity.state].filter(Boolean).join(', ') : 'this city');
    if (suggested) {
      const ok = window.confirm(
        `${cityLabel}: confirm Type column “${suggested}” for this format?\n\n` +
        `OK = use “${suggested}”\nCancel = stop process (click Process again to choose)`
      );
      return ok ? suggested : undefined;
    }
    const okNone = window.confirm(
      `${cityLabel}: no Type column was suggested.\n\n` +
      `OK = process with no type column\nCancel = stop process`
    );
    return okNone ? null : undefined;
  }

  /**
   * Admin modal: ranked Type column candidates + samples.
   * @returns {Promise<string|null|undefined>} header string | null (no type) | undefined (cancel)
   */
  function openTypeColumnConfirmDialog(details) {
    return new Promise((resolve) => {
      if (!typeConfirmDialog || !typeConfirmCandidates) {
        resolve(fallbackTypeColumnConfirm(details));
        return;
      }

      const candidates = Array.isArray(details && details.candidates) ? details.candidates : [];
      const suggested = details && details.suggestedHeader != null
        ? String(details.suggestedHeader)
        : '';
      const cityLabel = details && details.city
        ? [details.city.city, details.city.state].filter(Boolean).join(', ')
        : (selectedCity ? [selectedCity.city, selectedCity.state].filter(Boolean).join(', ') : 'this city');

      if (typeConfirmLead) {
        const idx = details && details.formatIndex;
        const total = details && details.formatTotal;
        const multi = details && (details.multiFormat || (total != null && total > 1));
        const names = Array.isArray(details && details.filenames)
          ? details.filenames.filter(Boolean)
          : [];
        const fileNote = names.length
          ? ` Sheet${names.length > 1 ? 's' : ''}: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}.`
          : '';
        if (multi && idx != null && total != null) {
          typeConfirmLead.textContent =
            `${cityLabel} — format ${idx} of ${total}.${fileNote} ` +
            `Headers differ across your upload; pick the Type column for this sheet format.`;
        } else {
          typeConfirmLead.textContent =
            `${cityLabel} format needs a Type column confirmation before processing.${fileNote} ` +
            `Pick the column that holds the violation or issue type.`;
        }
      }
      if (typeConfirmSuggested) {
        if (suggested) {
          typeConfirmSuggested.hidden = false;
          typeConfirmSuggested.textContent = `Suggested: ${suggested}`;
        } else {
          typeConfirmSuggested.hidden = true;
          typeConfirmSuggested.textContent = '';
        }
      }

      const samplesByHeader = new Map();
      typeConfirmCandidates.innerHTML = '';

      candidates.forEach((c, idx) => {
        const header = c && c.header != null ? String(c.header) : '';
        if (!header) return;
        const score = c.score != null ? Number(c.score) : null;
        const samples = Array.isArray(c.samples) ? c.samples : [];
        samplesByHeader.set(header, samples);

        const label = document.createElement('label');
        label.className = 'bridge-type-confirm-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'bridge-type-column-pick';
        input.value = header;
        if ((suggested && header === suggested) || (!suggested && idx === 0)) {
          input.checked = true;
        }
        const body = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'bridge-type-confirm-option-label';
        title.textContent = header;
        const meta = document.createElement('div');
        meta.className = 'bridge-type-confirm-option-meta';
        meta.textContent = Number.isFinite(score) ? `Score ${score}` : '';
        body.appendChild(title);
        if (meta.textContent) body.appendChild(meta);
        label.appendChild(input);
        label.appendChild(body);
        typeConfirmCandidates.appendChild(label);
      });

      // "No type column" option
      const noneLabel = document.createElement('label');
      noneLabel.className = 'bridge-type-confirm-option bridge-type-confirm-option--none';
      const noneInput = document.createElement('input');
      noneInput.type = 'radio';
      noneInput.name = 'bridge-type-column-pick';
      noneInput.value = '__none__';
      // Pre-select No type when scorer found nothing
      if (!candidates.length) noneInput.checked = true;
      const noneBody = document.createElement('div');
      const noneTitle = document.createElement('div');
      noneTitle.className = 'bridge-type-confirm-option-label';
      noneTitle.textContent = 'No type column — keep rows for review';
      const noneMeta = document.createElement('div');
      noneMeta.className = 'bridge-type-confirm-option-meta';
      noneMeta.textContent = 'Process without mapping a Violation/Issue Type column';
      noneBody.appendChild(noneTitle);
      noneBody.appendChild(noneMeta);
      noneLabel.appendChild(noneInput);
      noneLabel.appendChild(noneBody);
      typeConfirmCandidates.appendChild(noneLabel);

      function renderSamplesForSelection() {
        if (!typeConfirmSamples) return;
        const checked = typeConfirmCandidates.querySelector('input[name="bridge-type-column-pick"]:checked');
        const val = checked ? checked.value : '';
        if (!val || val === '__none__') {
          typeConfirmSamples.innerHTML =
            '<span class="bridge-type-confirm-samples-empty">No sample values for this choice.</span>';
          return;
        }
        const samples = (samplesByHeader.get(val) || []).slice(0, 5);
        if (!samples.length) {
          typeConfirmSamples.innerHTML =
            '<span class="bridge-type-confirm-samples-empty">No sample cells available for this column.</span>';
          return;
        }
        const items = samples.map((s) => `<li>${esc(String(s))}</li>`).join('');
        typeConfirmSamples.innerHTML = `<strong>Sample values</strong><ul>${items}</ul>`;
      }

      renderSamplesForSelection();
      typeConfirmCandidates.onchange = renderSamplesForSelection;

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        typeConfirmCandidates.onchange = null;
        typeConfirmOkBtn?.removeEventListener('click', onOk);
        typeConfirmCancelBtn?.removeEventListener('click', onCancel);
        typeConfirmCloseBtn?.removeEventListener('click', onCancel);
        typeConfirmDialog.removeEventListener('cancel', onEsc);
        typeConfirmDialog.removeEventListener('click', onBackdrop);
        try {
          if (typeConfirmDialog.open) typeConfirmDialog.close();
        } catch (_) {}
        resolve(value);
      };

      const onOk = () => {
        const checked = typeConfirmCandidates.querySelector('input[name="bridge-type-column-pick"]:checked');
        if (!checked) {
          // Prefer suggested / first candidate over silent cancel
          if (suggested) {
            finish(suggested);
            return;
          }
          const first = typeConfirmCandidates.querySelector('input[name="bridge-type-column-pick"]');
          if (first && first.value && first.value !== '__none__') {
            finish(first.value);
            return;
          }
          finish(null);
          return;
        }
        if (checked.value === '__none__') {
          finish(null);
          return;
        }
        finish(checked.value);
      };
      const onCancel = () => finish(undefined);
      const onEsc = (event) => {
        event.preventDefault();
        finish(undefined);
      };
      const onBackdrop = (event) => {
        if (event.target === typeConfirmDialog) finish(undefined);
      };

      typeConfirmOkBtn?.addEventListener('click', onOk);
      typeConfirmCancelBtn?.addEventListener('click', onCancel);
      typeConfirmCloseBtn?.addEventListener('click', onCancel);
      typeConfirmDialog.addEventListener('cancel', onEsc);
      typeConfirmDialog.addEventListener('click', onBackdrop);

      try {
        if (typeof typeConfirmDialog.showModal === 'function') {
          typeConfirmDialog.showModal();
        } else {
          finish(fallbackTypeColumnConfirm(details));
        }
      } catch (dialogErr) {
        console.warn('[Filter] type confirm showModal failed, using fallback', dialogErr);
        finish(fallbackTypeColumnConfirm(details));
      }
    });
  }

  let processUploadInFlight = false;

  async function processUpload() {
    if (processUploadInFlight) {
      showError('Process is already running — wait for it to finish.');
      return;
    }
    if (!selectedCity) {
      showError('Select a city before processing.');
      setPipelineStep('location');
      try { citySelect?.focus(); } catch (_) { /* ignore */ }
      return;
    }
    if (!selectedUploadType) {
      showError('Select the upload type (Code Violation or Water Shut Off) before processing.');
      setPipelineStep('type');
      return;
    }
    if (!selectedFiles.length) {
      showError('Add at least one file before processing.');
      setPipelineStep('upload');
      return;
    }
    const responseAt = getResponseAtValue();
    if (!responseAt) {
      showError('Enter the date the city sent this list before processing.');
      focusResponseDateTime();
      return;
    }
    // LIST-02 dirty-guard: do not silently clobber unsaved kept / Train work
    if (lastResult && Array.isArray(lastResult.rows) && lastResult.rows.length > 0) {
      const n = lastResult.rows.length;
      const ok = window.confirm(
        `You have ${n.toLocaleString()} kept row(s) that are not saved yet.\n\n` +
        `Process a new file anyway? Unsaved work (including any Train decisions) will be lost.`
      );
      if (!ok) {
        showError('Process cancelled — unsaved kept rows were kept on screen.');
        return;
      }
    }
    showError('');
    setHidden(resultsPanel, true);
    setHidden(loadingPanel, false);
    if (processBtn) processBtn.disabled = true;
    startLoadingAnimation();
    lastFailedAction = 'process';
    processUploadInFlight = true;

    try {
      let data = null;
      let confirmedFormats = [];
      const maxConfirmRounds = 8;
      let lastConfirmDetails = null;

      // Keep confirming until process succeeds. Covers multi-format batches and
      // PDF fingerprint drift between pre-scan and process (re-ask remaining only).
      for (let round = 0; round < maxConfirmRounds; round += 1) {
        // Always prefer confirmedFormats[]. Only send legacy single-format fields
        // when we have exactly one mapping — multi-format + bare confirmedTypeHeader
        // without a fingerprint used to apply that Type column to every sheet (*).
        let resumeOpts;
        if (confirmedFormats.length === 1) {
          resumeOpts = {
            confirmedFormats,
            confirmedTypeHeader: confirmedFormats[0].confirmedTypeHeader,
            formatFingerprint: confirmedFormats[0].formatFingerprint || undefined
          };
        } else if (confirmedFormats.length > 1) {
          resumeOpts = { confirmedFormats };
        } else {
          resumeOpts = undefined;
        }

        try {
          if (round > 0) {
            setHidden(loadingPanel, false);
            if (processBtn) processBtn.disabled = true;
            startLoadingAnimation();
            showError('');
          }
          data = await fetchJson('/api/bridge/process', {
            method: 'POST',
            body: buildProcessFormData(resumeOpts)
          });
          break; // success
        } catch (err) {
          if (!err || err.code !== 'TYPE_COLUMN_CONFIRM_REQUIRED') {
            throw err;
          }

          // Stop spinner before modal so non-admin never hangs
          stopLoadingAnimation();
          clearScrubFeedUi();
          setHidden(loadingPanel, true);
          if (processBtn) processBtn.disabled = !selectedFiles.length;
          syncFileUi();

          if (!isBridgeAdmin()) {
            showError(
              'An admin must confirm the Type column for this city format once. Ask an admin to process this upload.'
            );
            return;
          }

          const details = err.details || err;
          lastConfirmDetails = details;
          const steps = formatsNeedingConfirm(details);
          const multi =
            steps.length > 1 ||
            details.multiFormat ||
            details.formatCount > 1 ||
            (selectedFiles && selectedFiles.length > 1);
          // Soft status while dialogs are open — never leave the hard 409 text
          // on screen as if process failed mid multi-format confirm.
          showError(
            multi
              ? `Confirm the Type column for each sheet format` +
                (steps.length > 1 ? ` (${steps.length} remaining)…` : '…')
              : 'Confirm the Type column in the dialog to continue processing this city format…'
          );

          const collected = await collectMultiFormatConfirms(details);
          if (collected && collected.cancelled) {
            showError(
              'Type column confirmation was cancelled — nothing was processed. ' +
              'Click Process again and confirm the Type column for each sheet format.'
            );
            return;
          }
          confirmedFormats = mergeConfirmedFormats(confirmedFormats, collected);
          if (!confirmedFormats.length) {
            showError(
              'No Type column choice was recorded. Click Process again and confirm each sheet format.'
            );
            return;
          }
          // loop → re-POST with accumulated confirms
        }
      }

      if (!data || typeof data !== 'object') {
        const remain = lastConfirmDetails
          ? formatsNeedingConfirm(lastConfirmDetails)
          : [];
        const remainNames = remain
          .flatMap((s) => s.filenames || [])
          .filter(Boolean)
          .slice(0, 6);
        const remainNote = remainNames.length
          ? ` Still need: ${remainNames.join(', ')}${remainNames.length >= 6 ? '…' : ''}.`
          : '';
        throw new Error(
          data == null
            ? `Still need Type column confirmation for one or more sheets.${remainNote} Click Process and confirm each format.`
            : 'Process returned an empty response. Try again.'
        );
      }

      // New process batch — reset client undo stack and train polish state
      trainUndoStack.length = 0;
      clearTrainDecidedKeys();
      trainSearchQuery = '';
      trainPage = { distressed: 1, notDistressed: 1 };
      const searchInput = document.getElementById('bridge-train-search');
      if (searchInput) searchInput.value = '';
      brainVersion = null;
      if (data && data.processingMeta && data.processingMeta.brainVersion != null) {
        brainVersion = Number(data.processingMeta.brainVersion);
      }
      showError('');
      // Freeze slogan ticker; stage truthful feed before results (D4 client-staged)
      stopLoadingAnimation();
      if (loadingCopy) loadingCopy.textContent = 'Scrubbing results…';
      await playScrubFeedFromProcess(data);
      // THTR-01: land admin in Train theater after process when open groups exist
      forceTrainTheater = true;
      renderResults(data);
      updateTrainUndoButton();
      // Ensure results are visible (not left under the fold after loader)
      try {
        resultsPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) { /* ignore */ }
    } catch (err) {
      clearScrubFeedUi();
      const msg = (err && err.message) || 'Could not process upload.';
      showError(msg);
      try {
        console.error('[Filter] processUpload failed', err);
      } catch (_) { /* ignore */ }
    } finally {
      processUploadInFlight = false;
      stopLoadingAnimation();
      clearScrubFeedUi();
      setHidden(loadingPanel, true);
      if (processBtn) processBtn.disabled = !selectedFiles.length;
      syncFileUi();
    }
  }

  async function attachDataset() {
    if (!lastResult || !selectedCity) return;
    const responseAt = getResponseAtValue();
    if (!responseAt) {
      setAttachStatus('Response received date is required.', 'error');
      focusResponseDateTime();
      return;
    }

    attachBtn.disabled = true;
    setAttachStatus('Attaching dataset…', '');
    lastFailedAction = 'attach';

    try {
      const payload = await fetchJson('/api/bridge/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId: selectedCity.id,
          uploadType: lastResult.uploadType,
          responseReceivedAt: responseAt,
          originalFilename: lastResult.sourceFile,
          stats: lastResult.stats,
          rows: lastResult.rows,
          metadata: { processingMeta: lastResult.processingMeta || {} }
        })
      });
      const version = payload.version || {};
      const turnaround = payload.turnaroundDays;
      const turnaroundNote = Number.isFinite(turnaround)
        ? ` Turnaround: ${turnaround} day(s).`
        : '';
      setAttachStatus(
        `Attached ${version.id || 'dataset'} — ${Number(version.kept_count || lastResult.stats.kept || 0).toLocaleString()} records.${turnaroundNote}`,
        'success'
      );
      await loadHistory(selectedCity.id);
    } catch (err) {
      setAttachStatus(err.message || 'Attach failed.', 'error');
    } finally {
      attachBtn.disabled = false;
    }
  }

  async function onRetry() {
    showError('');
    try {
      if (lastFailedAction === 'attach') {
        await attachDataset();
      } else if (lastFailedAction === 'saveList') {
        await saveCurrentList();
      } else if (lastFailedAction === 'process') {
        await processUpload();
      } else if (lastFailedAction === 'stateChange') {
        await onStateChange();
      } else {
        await loadStates();
      }
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  filterSearch?.addEventListener('input', () => {
    tableState.page = 1;
    renderResultsTable();
  });
  filterTag?.addEventListener('change', () => {
    tableState.page = 1;
    renderResultsTable();
  });
  filterConfidence?.addEventListener('change', () => {
    tableState.page = 1;
    renderResultsTable();
  });
  filterReview?.addEventListener('change', () => {
    tableState.page = 1;
    renderResultsTable();
  });
  exportCsvBtn?.addEventListener('click', () => {
    if (!lastResult) return;
    const rows = sortRows(getFilteredRows());
    const base = (lastResult.sourceFile || 'bridge-export').replace(/\.[^.]+$/, '');
    downloadCsv(rows, `${base}-filtered.csv`);
  });
  paginationEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.page === 'prev') tableState.page -= 1;
    if (btn.dataset.page === 'next') tableState.page += 1;
    renderResultsTable();
  });
  resultsTable?.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (tableState.sortKey === key) {
        tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        tableState.sortKey = key;
        tableState.sortDir = 'asc';
      }
      renderResultsTable();
    });
  });
  attachBtn?.addEventListener('click', () => { attachDataset().catch((e) => setAttachStatus(e.message, 'error')); });
  saveListBtn?.addEventListener('click', () => { saveCurrentList().catch((e) => setSaveStatus(e.message, 'error')); });
  listNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCurrentList().catch((e) => setSaveStatus(e.message, 'error'));
    }
  });
  downloadAllCsvBtn?.addEventListener('click', () => {
    downloadAllSavedLists('csv').catch((e) => showError(e.message));
  });
  downloadAllXlsxBtn?.addEventListener('click', () => {
    downloadAllSavedLists('xlsx').catch((e) => showError(e.message));
  });
  clearAllListsBtn?.addEventListener('click', () => {
    clearAllSavedLists().catch((e) => showError(e.message));
  });
  // Post-save flash: one-click CSV for the list just saved (explicit click only)
  document.getElementById('bridge-lists-panel')?.addEventListener('click', (event) => {
    const flashBtn = event.target.closest('#bridge-flash-download-csv, [data-action="flash-download"]');
    if (!flashBtn) return;
    const listId = flashBtn.dataset.listId;
    if (!listId) return;
    event.preventDefault();
    downloadSavedList(listId, flashBtn.dataset.format || 'csv').catch((e) => showError(e.message));
  });
  listsBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.tagName === 'INPUT') return;
    if (btn.dataset.action === 'flash-download') return; // handled on lists-panel
    const row = btn.closest('tr[data-list-id]');
    const listId = row?.dataset.listId;
    if (!listId) return;
    if (btn.dataset.action === 'download') {
      downloadSavedList(listId, btn.dataset.format).catch((e) => showError(e.message));
    } else if (btn.dataset.action === 'delete') {
      deleteSavedList(listId).catch((e) => showError(e.message));
    }
  });
  listsBody?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-action="rename"]');
    if (!input) return;
    const row = input.closest('tr[data-list-id]');
    const listId = row?.dataset.listId;
    if (!listId) return;
    renameSavedList(listId, input.value).catch((e) => showError(e.message));
  });
  listsBody?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest('input[data-action="rename"]');
    if (!input) return;
    event.preventDefault();
    input.blur();
  });

  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    const list = event.dataTransfer?.files;
    if (list && list.length) addSelectedFiles(list);
  });
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });
  dropzone?.addEventListener('click', (event) => {
    if (event.target.closest('.bridge-browse-link')) return;
    fileInput?.click();
  });
  browseBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput?.click();
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length) {
      addSelectedFiles(fileInput.files);
    }
    // Allow re-selecting the same file set after clear
    fileInput.value = '';
  });
  clearFileBtn?.addEventListener('click', () => {
    resetDownstream('file');
    clearFileUi();
    setPipelineStep('upload');
  });

  stateSelect?.addEventListener('change', () => { onStateChange().catch((e) => showError(e.message)); });
  citySelect?.addEventListener('change', onCityChange);
  outcomeDrawerToggle?.addEventListener('click', () => {
    const open = outcomeDrawerToggle.getAttribute('aria-expanded') !== 'true';
    setOutcomeDrawerOpen(open);
  });
  document.querySelectorAll('input[name="bridge-city-outcome"]').forEach((input) => {
    input.addEventListener('change', syncCityOutcomeUi);
  });
  outcomeSaveBtn?.addEventListener('click', () => {
    saveCityOutcome().catch((e) => setOutcomeStatus((e && e.message) || 'Could not save', 'error'));
  });
  document.querySelectorAll('input[name="bridge-upload-type"]').forEach((input) => {
    input.addEventListener('change', onUploadTypeChange);
  });
  processBtn?.addEventListener('click', () => { processUpload().catch((e) => showError(e.message)); });
  retryBtn?.addEventListener('click', () => { onRetry().catch((e) => showError(e.message)); });
  historyOpenBtn?.addEventListener('click', openHistoryDialog);
  historyCloseBtn?.addEventListener('click', closeHistoryDialog);
  historyDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeHistoryDialog();
  });
  historyDialog?.addEventListener('click', (event) => {
    if (event.target === historyDialog) closeHistoryDialog();
  });

  // Train brain / Filter brain mode tabs + Approve/Deny + rule status (event delegation, once)
  document.querySelector('.bridge-results-mode')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-mode]');
    if (!tab || !isBridgeAdmin()) return;
    setResultsMode(tab.dataset.mode);
  });
  document.getElementById('bridge-train-panel')?.addEventListener('click', (event) => {
    const pageBtn = event.target.closest('[data-train-page]');
    if (pageBtn && !pageBtn.disabled) {
      const key = pageBtn.getAttribute('data-train-page');
      const page = Number(pageBtn.getAttribute('data-page')) || 1;
      if (key === 'distressed' || key === 'notDistressed') {
        trainPage[key] = Math.max(1, page);
        if (lastResult) renderTrainGroups(getReviewGroups(lastResult), lastResult);
      }
      return;
    }
    const btn = event.target.closest('[data-action="approve"], [data-action="deny"]');
    if (!btn || btn.disabled || !isBridgeAdmin()) return;
    const card = btn.closest('.bridge-train-group');
    if (!card) return;
    const group = resolveTrainGroupFromCard(card);
    onTrainDecision(btn.dataset.action, group, card).catch((e) => {
      showError((e && e.message) || 'Could not save train decision');
    });
  });

  // Train hotkeys: A/Enter approve, D deny — first visible undecided card only.
  // Reuses onTrainDecision so Deny≥10 confirm (DENY_CONFIRM_THRESHOLD) still applies.
  function handleTrainHotkeys(event) {
    if (resultsMode !== 'train' || !isBridgeAdmin()) return;
    const el = event.target;
    if (el) {
      if (el.closest && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (el.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el.isContentEditable) return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    let action = null;
    if (key === 'a' || key === 'A' || key === 'Enter') action = 'approve';
    else if (key === 'd' || key === 'D') action = 'deny';
    else return;
    const panel = document.getElementById('bridge-train-panel');
    if (!panel || panel.hidden) return;
    const approveBtn = panel.querySelector(
      '.bridge-train-group button[data-action="approve"]:not([disabled])'
    );
    const card = approveBtn ? approveBtn.closest('.bridge-train-group') : null;
    if (!card) return;
    event.preventDefault();
    const group = resolveTrainGroupFromCard(card);
    onTrainDecision(action, group, card).catch((e) => {
      showError((e && e.message) || 'Could not save train decision');
    });
  }
  document.addEventListener('keydown', handleTrainHotkeys);

  document.getElementById('bridge-train-search')?.addEventListener('input', (event) => {
    trainSearchQuery = event.target.value || '';
    trainPage.distressed = 1;
    trainPage.notDistressed = 1;
    if (lastResult) renderTrainGroups(getReviewGroups(lastResult), lastResult);
  });
  document.getElementById('bridge-train-undo')?.addEventListener('click', () => {
    onTrainUndo().catch((e) => {
      showError((e && e.message) || 'Could not undo');
    });
  });
  document.getElementById('bridge-brain-panel')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-rule-id][data-rule-status]');
    if (!btn || btn.disabled || !isBridgeAdmin()) return;
    onBrainRuleAction(btn).catch((e) => {
      setBrainStatus((e && e.message) || 'Could not update rule status', 'error');
    });
  });

  // Test seam for pure helpers (mirrors bridge-train.js when present)
  window.BridgeTrain = window.BridgeTrain || {
    isBridgeAdmin,
    getReviewGroups,
    renderTrainGroupCard
  };


  loadStates().catch((err) => showError(err.message || 'Could not load city profiles. Is Form Forge running?'));
  loadSavedLists().catch(() => {});
})();