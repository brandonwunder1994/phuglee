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
  const responseHourSelect = document.getElementById('bridge-response-hour');
  const responseMinuteSelect = document.getElementById('bridge-response-minute');
  const responseAmpmSelect = document.getElementById('bridge-response-ampm');
  const attachBtn = document.getElementById('bridge-attach');
  const attachStatus = document.getElementById('bridge-attach-status');
  const historyDialog = document.getElementById('bridge-history-dialog');
  const historyOpenBtn = document.getElementById('bridge-history-open');
  const historyCloseBtn = document.getElementById('bridge-history-close');
  const historyLead = document.getElementById('bridge-history-lead');
  const historyList = document.getElementById('bridge-history-list');
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
  let selectedFile = null;
  let lastResult = null;
  let resultsMode = 'kept';
  let savedLists = [];
  let tableState = {
    sortKey: 'streetAddress',
    sortDir: 'asc',
    page: 1
  };
  let lastFailedAction = 'loadStates';
  let loadingTimer = null;

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
    const label = (group && group.violationTypeLabel) || 'Unknown type';
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
      `<div class="bridge-train-group-head"><div class="bridge-train-group-title">${esc(label)} ` +
      `<span class="bridge-train-count">×${esc(String(count))}</span></div></div>` +
      `<div class="bridge-train-signals">${signals}</div>` +
      (desc ? `<ul class="bridge-train-descriptions">${desc}</ul>` : '') +
      `<div class="bridge-train-actions">` +
      `<button type="button" class="bridge-btn bridge-btn-primary bridge-train-approve" data-action="approve" aria-label="Approve ${esc(label)}">✓ Approve</button>` +
      `<button type="button" class="bridge-btn bridge-btn-ghost bridge-train-deny" data-action="deny" aria-label="Deny ${esc(label)}">✗ Deny</button>` +
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

  function renderTrainGroups(groups, data) {
    const distressedEl = document.getElementById('bridge-train-distressed');
    const notEl = document.getElementById('bridge-train-not-distressed');
    const distressed = (groups && groups.distressed) || [];
    const notDistressed = (groups && groups.notDistressed) || [];

    function fill(el, list) {
      if (!el) return;
      if (!list.length) {
        el.innerHTML = '<p class="bridge-train-muted">No groups in this section.</p>';
        return;
      }
      el.innerHTML = list.map(renderTrainGroupCard).join('');
    }

    fill(distressedEl, distressed);
    fill(notEl, notDistressed);

    if (!distressed.length && !notDistressed.length) {
      const missingShape = !data || !data.reviewGroups;
      if (missingShape) {
        setTrainStatus('Train brain needs a process response with review groups (phase 43).', '');
      } else {
        setTrainStatus(
          'No review groups in this batch. Process a code-violation file with mixed types to train.',
          ''
        );
      }
    } else {
      setTrainStatus('', '');
    }
  }

  function setResultsMode(mode) {
    resultsMode = mode === 'train' ? 'train' : 'kept';
    const modeKept = document.getElementById('bridge-mode-kept');
    const modeTrain = document.getElementById('bridge-mode-train');
    const trainPanel = document.getElementById('bridge-train-panel');

    if (modeKept) {
      modeKept.classList.toggle('is-active', resultsMode === 'kept');
      modeKept.setAttribute('aria-selected', resultsMode === 'kept' ? 'true' : 'false');
    }
    if (modeTrain) {
      modeTrain.classList.toggle('is-active', resultsMode === 'train');
      modeTrain.setAttribute('aria-selected', resultsMode === 'train' ? 'true' : 'false');
    }

    if (resultsMode === 'train') {
      setHidden(trainPanel, false);
      setHidden(resultsToolbar, true);
      setHidden(tableWrap, true);
      setHidden(paginationEl, true);
      // Save/attach stay visible (discretion) — do not hide
    } else {
      setHidden(trainPanel, true);
      const rows = lastResult?.rows || [];
      const showTable = Boolean(lastResult && !lastResult.stub && rows.length > 0);
      setHidden(resultsToolbar, !showTable);
      setHidden(tableWrap, !showTable);
      setHidden(paginationEl, !showTable);
    }
  }

  function onTrainDecision(action, group, card) {
    // PHASE45: POST /api/bridge/brain/decisions with phugleeSessionHeaders
    // Stub only — no fetch, no list mutation, no fake success write.
    const type = (group && group.violationTypeLabel) || 'group';
    if (action === 'approve') {
      setTrainStatus(`Approve queued for "${type}" · training API ships in phase 45`, '');
    } else {
      setTrainStatus(`Deny queued for "${type}" · training API ships in phase 45`, '');
    }
    if (card) card.classList.add('is-pending');
  }

  function resolveTrainGroupFromCard(card) {
    if (!card || !lastResult) return null;
    const groupId = card.dataset.groupId || '';
    const section = card.dataset.section || '';
    const groups = getReviewGroups(lastResult);
    const list = section === 'not_distressed' ? groups.notDistressed : groups.distressed;
    const found = list.find((g) => String(g.groupId) === String(groupId));
    if (found) return found;
    return {
      groupId,
      section,
      violationTypeLabel: card.querySelector('.bridge-train-group-title')?.childNodes?.[0]?.textContent?.trim() || 'group'
    };
  }
  // --- end BridgeTrain pure helpers ---

  function showError(msg) {
    const hasError = Boolean(msg);
    setHidden(errorWrap, !hasError);
    if (errorEl) errorEl.textContent = msg || '';
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
    const res = await fetch(url, { cache: 'no-store', ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'OCR_UNAVAILABLE' || res.status === 503) {
        throw new Error(data.error || 'OCR is unavailable. Upload Excel, CSV, or a text-based PDF.');
      }
      if (data.code === 'NO_USABLE_ROWS') {
        const stats = data.stats || {};
        const parts = [];
        if (stats.noDistress || stats.discardReasons?.no_distress_signal) {
          parts.push(`${stats.noDistress || stats.discardReasons.no_distress_signal} no distress signal`);
        }
        if (stats.alreadyImported || stats.discardReasons?.already_imported) {
          parts.push(`${stats.alreadyImported || stats.discardReasons.already_imported} already in Analyze`);
        }
        if (stats.deduplicated || stats.discardReasons?.duplicate) {
          parts.push(`${stats.deduplicated || stats.discardReasons.duplicate} duplicates`);
        }
        const detail = parts.length ? ` Breakdown: ${parts.join(', ')}.` : '';
        throw new Error((data.error || 'No usable addresses found in this file.') + detail);
      }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function resetDownstream(from) {
    if (from === 'state') {
      selectedCity = null;
      selectedUploadType = '';
      selectedFile = null;
      lastResult = null;
      setHidden(cityActions, true);
      setHidden(typePanel, true);
      setHidden(uploadPanel, true);
      setHidden(resultsPanel, true);
      clearFileUi();
      setPipelineStep('location');
    }
    if (from === 'city') {
      selectedUploadType = '';
      selectedFile = null;
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
      selectedFile = null;
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
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    setHidden(fileNameEl, true);
    if (fileNameEl) fileNameEl.textContent = '';
    if (processBtn) processBtn.disabled = true;
    setHidden(clearFileBtn, true);
    dropzone?.classList.remove('has-file', 'is-dragover');
  }

  function setSelectedFile(file) {
    if (!file) return;
    if (!ACCEPTED_EXT.test(file.name)) {
      showError('Unsupported file type. Use Excel, CSV, PDF, Word, TXT, or JPG/PNG list images.');
      return;
    }
    selectedFile = file;
    showError('');
    setHidden(fileNameEl, false);
    if (fileNameEl) fileNameEl.textContent = `${file.name} (${formatBytes(file.size)})`;
    dropzone?.classList.add('has-file');
    if (processBtn) processBtn.disabled = false;
    setHidden(clearFileBtn, false);
    setHidden(resultsPanel, true);
    lastResult = null;
    setPipelineStep('upload');
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

  function initResponseDateTimePicker() {
    if (!responseHourSelect || !responseMinuteSelect) return;
    if (!responseHourSelect.options.length || responseHourSelect.options.length === 1) {
      for (let hour = 1; hour <= 12; hour += 1) {
        const opt = document.createElement('option');
        opt.value = String(hour);
        opt.textContent = String(hour);
        responseHourSelect.appendChild(opt);
      }
    }
    if (!responseMinuteSelect.options.length || responseMinuteSelect.options.length === 1) {
      for (let minute = 0; minute <= 59; minute += 1) {
        const opt = document.createElement('option');
        opt.value = String(minute).padStart(2, '0');
        opt.textContent = String(minute).padStart(2, '0');
        responseMinuteSelect.appendChild(opt);
      }
    }
  }

  function clearResponseDateTime() {
    if (responseDateInput) responseDateInput.value = '';
    if (responseHourSelect) responseHourSelect.value = '';
    if (responseMinuteSelect) responseMinuteSelect.value = '';
    if (responseAmpmSelect) responseAmpmSelect.value = '';
  }

  function getResponseAtValue() {
    const date = String(responseDateInput?.value || '').trim();
    const hour12 = Number(responseHourSelect?.value || '');
    const minute = String(responseMinuteSelect?.value || '').trim();
    const ampm = String(responseAmpmSelect?.value || '').trim();
    if (!date || !hour12 || !minute || !ampm) return '';

    let hour24 = hour12 % 12;
    if (ampm === 'PM') hour24 += 12;
    const local = new Date(`${date}T${String(hour24).padStart(2, '0')}:${minute}:00`);
    if (Number.isNaN(local.getTime())) return '';
    return local.toISOString();
  }

  function focusResponseDateTime() {
    if (responseDateInput && !responseDateInput.value) {
      responseDateInput.focus();
      return;
    }
    if (responseHourSelect && !responseHourSelect.value) {
      responseHourSelect.focus();
      return;
    }
    if (responseMinuteSelect && !responseMinuteSelect.value) {
      responseMinuteSelect.focus();
      return;
    }
    responseAmpmSelect?.focus();
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

  function onCityChange() {
    try {
      resetDownstream('city');
      showError('');
      const id = citySelect.value;
      if (!id) {
        selectedCity = null;
        setHidden(cityActions, true);
        return;
      }
      selectedCity = cities.find((city) => String(city.id) === String(id)) || null;
      if (!selectedCity) return;
      setHidden(typePanel, false);
      setHidden(cityActions, false);
      if (historyLead) {
        historyLead.textContent = `Prior Filter datasets for ${selectedCity.city}, ${selectedCity.state}.`;
      }
      setPipelineStep('type');
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
    loadingCopy.textContent = LOADING_STEPS[0];
    loadingTimer = window.setInterval(() => {
      index = (index + 1) % LOADING_STEPS.length;
      loadingCopy.textContent = LOADING_STEPS[index];
    }, 900);
  }

  function stopLoadingAnimation() {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
  }

  function renderKpis(stats) {
    const cards = [
      { label: 'Kept (distress)', value: stats.kept, accent: true },
      { label: 'No distress signal', value: stats.noDistress || stats.discardReasons?.no_distress_signal || 0 },
      { label: 'Discarded (other)', value: Math.max(0, (stats.discarded || 0) - (stats.noDistress || stats.discardReasons?.no_distress_signal || 0)) },
      { label: 'Already in Analyze', value: stats.alreadyImported },
      { label: 'Needs review', value: stats.needsReview || stats.lowConfidence },
      { label: 'Deduped', value: stats.deduplicated }
    ];
    kpiGrid.innerHTML = cards.map((card) => (
      `<div class="bridge-kpi${card.accent ? ' bridge-kpi--accent' : ''}">` +
      `<span class="bridge-kpi-value">${Number(card.value || 0).toLocaleString()}</span>` +
      `<span class="bridge-kpi-label">${esc(card.label)}</span>` +
      '</div>'
    )).join('');
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

  function renderSavedLists() {
    if (!listsBody) return;
    if (!savedLists.length) {
      setHidden(listsEmpty, false);
      setHidden(listsWrap, true);
      setHidden(listsToolbar, true);
      listsBody.innerHTML = '';
      return;
    }
    setHidden(listsEmpty, true);
    setHidden(listsWrap, false);
    setHidden(listsToolbar, false);
    listsBody.innerHTML = savedLists.map((list) => {
      const cityLabel = [list.city, list.state].filter(Boolean).join(', ') || '—';
      return (
        `<tr data-list-id="${esc(list.id)}">` +
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

  function resetImportAreaAfterSave(savedLabel) {
    // Keep city + lead type so the next city file is one drop away; clear file + results.
    lastResult = null;
    selectedFile = null;
    clearFileUi();
    setHidden(resultsPanel, true);
    setHidden(loadingPanel, true);
    setHidden(savePanel, true);
    setHidden(attachPanel, true);
    setSaveStatus('', '');
    setAttachStatus('', '');
    if (listNameInput) listNameInput.value = '';
    setPipelineStep(selectedUploadType ? 'upload' : (selectedCity ? 'type' : 'location'));
    showError('');
    // Brief confirmation on the saved-lists panel via empty-state note if needed
    const note = document.getElementById('bridge-lists-empty');
    if (note && !savedLists.length) {
      /* lists refresh will repaint */
    }
    // Soft status on save panel is cleared; use a temporary toast-like note in lists lead
    const listsPanel = document.getElementById('bridge-lists-panel');
    if (listsPanel) {
      let flash = document.getElementById('bridge-lists-flash');
      if (!flash) {
        flash = document.createElement('p');
        flash.id = 'bridge-lists-flash';
        flash.className = 'bridge-lists-flash';
        flash.setAttribute('role', 'status');
        const lead = listsPanel.querySelector('.bridge-panel-lead');
        if (lead) lead.insertAdjacentElement('afterend', flash);
        else listsPanel.prepend(flash);
      }
      flash.textContent = savedLabel
        ? `Saved “${savedLabel}”. Upload the next city file when ready.`
        : 'List saved. Upload the next city file when ready.';
      flash.hidden = false;
      window.setTimeout(() => {
        if (flash) flash.hidden = true;
      }, 6000);
      listsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function saveCurrentList() {
    if (!lastResult?.rows?.length) {
      setSaveStatus('Process a file with kept rows before saving.', 'error');
      return;
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
      await loadSavedLists();
      resetImportAreaAfterSave(savedName);
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
    const headers = EXPORT_COLUMNS.map(([, label]) => label);
    const lines = [
      headers.map(escape).join(','),
      ...rows.map((row) => EXPORT_COLUMNS.map(([key]) => escape(row[key])).join(','))
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
      renderHistory(data.history || []);
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
    const parserLabel = data.processingMeta?.parser ? ` · ${data.processingMeta.parser} parser` : '';
    const indexCount = data.processingMeta?.importIndexCount;
    const indexLabel = Number.isFinite(indexCount) && indexCount > 0
      ? ` · ${indexCount.toLocaleString()} address(es) in Analyze`
      : '';
    resultsMeta.textContent =
      `${rows.length.toLocaleString()} record(s) kept from ${data.sourceFile} · ${uploadLabel} · ${data.city.city}, ${data.city.state}${parserLabel}${indexLabel}`;
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
      setHidden(stubNote, !data.stub);
      if (!data.stub) {
        const reviewNote = data.stats.needsReview
          ? ` ${data.stats.needsReview} row(s) flagged for review (low-confidence extraction).`
          : '';
        const importedNote = data.stats.alreadyImported
          ? ` ${data.stats.alreadyImported} already in Analyze (hidden from this list).`
          : '';
        const noDistress = data.stats.noDistress || data.stats.discardReasons?.no_distress_signal || 0;
        const distressNote = noDistress
          ? ` ${noDistress} generic code violation(s) dropped (no distress signal).`
          : '';
        stubNote.textContent = data.stats.discarded
          ? `${data.stats.discarded} row(s) discarded.${distressNote}${importedNote}${reviewNote}`
          : `Processing complete.${distressNote}${importedNote}${reviewNote} Save the list below — nothing was sent to Analyze.`;
        setHidden(stubNote, !data.stats.discarded && !data.stats.alreadyImported
          && !data.stats.needsReview && !noDistress);
      }
    }

    // Train brain (admin-only) — additive; non-admin never sees train chrome
    const trainWrap = document.getElementById('bridge-train-wrap');
    if (isBridgeAdmin()) {
      setHidden(trainWrap, false);
      renderTrainGroups(getReviewGroups(data), data);
      setResultsMode(resultsMode || 'kept');
    } else {
      setHidden(trainWrap, true);
      const d = document.getElementById('bridge-train-distressed');
      const n = document.getElementById('bridge-train-not-distressed');
      if (d) d.innerHTML = '';
      if (n) n.innerHTML = '';
      setTrainStatus('', '');
    }

    setHidden(resultsPanel, false);
    setPipelineStep('results');
  }

  async function processUpload() {
    if (!selectedCity || !selectedUploadType || !selectedFile) return;
    const responseAt = getResponseAtValue();
    if (!responseAt) {
      showError('Enter when the city sent this list (date and time) before processing.');
      focusResponseDateTime();
      return;
    }
    showError('');
    setHidden(resultsPanel, true);
    setHidden(loadingPanel, false);
    if (processBtn) processBtn.disabled = true;
    startLoadingAnimation();
    lastFailedAction = 'process';

    try {
      const form = new FormData();
      form.append('cityId', selectedCity.id);
      form.append('uploadType', selectedUploadType);
      form.append('file', selectedFile, selectedFile.name);
      const data = await fetchJson('/api/bridge/process', { method: 'POST', body: form });
      renderResults(data);
    } finally {
      stopLoadingAnimation();
      setHidden(loadingPanel, true);
      if (processBtn) processBtn.disabled = !selectedFile;
    }
  }

  async function attachDataset() {
    if (!lastResult || !selectedCity) return;
    const responseAt = getResponseAtValue();
    if (!responseAt) {
      setAttachStatus('Response received date/time is required.', 'error');
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
  listsBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.tagName === 'INPUT') return;
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
    const file = event.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
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
    const file = fileInput.files?.[0];
    if (file) setSelectedFile(file);
  });
  clearFileBtn?.addEventListener('click', () => {
    resetDownstream('file');
    clearFileUi();
    setPipelineStep('upload');
  });

  stateSelect?.addEventListener('change', () => { onStateChange().catch((e) => showError(e.message)); });
  citySelect?.addEventListener('change', onCityChange);
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

  // Train brain mode tabs + Approve/Deny (event delegation, once)
  document.querySelector('.bridge-results-mode')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-mode]');
    if (!tab || !isBridgeAdmin()) return;
    setResultsMode(tab.dataset.mode);
  });
  document.getElementById('bridge-train-panel')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="approve"], [data-action="deny"]');
    if (!btn || !isBridgeAdmin()) return;
    const card = btn.closest('.bridge-train-group');
    if (!card) return;
    const group = resolveTrainGroupFromCard(card);
    onTrainDecision(btn.dataset.action, group, card);
  });

  // Test seam for pure helpers (mirrors bridge-train.js when present)
  window.BridgeTrain = window.BridgeTrain || {
    isBridgeAdmin,
    getReviewGroups,
    renderTrainGroupCard
  };

  initResponseDateTimePicker();
  loadStates().catch((err) => showError(err.message || 'Could not load city profiles. Is Form Forge running?'));
  loadSavedLists().catch(() => {});
})();