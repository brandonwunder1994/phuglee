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
    'Pushing new leads to Analyze…'
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
        throw new Error(data.error || 'No usable addresses found in this file.');
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
      { label: 'Kept', value: stats.kept, accent: true },
      { label: 'Discarded', value: stats.discarded },
      { label: 'Already in Analyze', value: stats.alreadyImported },
      { label: 'Pushed to Analyze', value: stats.pushedToAnalyzer },
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
    if (data.analyzerPush) {
      stats.pushedToAnalyzer = data.analyzerPush.added || 0;
    }
    renderKpis(stats);

    const stubNote = document.getElementById('bridge-stub-note');
    const showTable = !data.stub && rows.length > 0;
    setHidden(resultsToolbar, !showTable);
    setHidden(tableWrap, !showTable);
    setHidden(paginationEl, !showTable);
    setHidden(attachPanel, !showTable);

    if (showTable) {
      populateTagFilter(rows);
      renderResultsTable();
      setAttachStatus('', '');
    }

    if (stubNote) {
      setHidden(stubNote, !data.stub);
      if (!data.stub) {
        const reviewNote = data.stats.needsReview
          ? ` ${data.stats.needsReview} row(s) flagged for review (low-confidence extraction).`
          : '';
        const importedNote = data.stats.alreadyImported
          ? ` ${data.stats.alreadyImported} already in Analyze.`
          : '';
        const pushedNote = data.analyzerPush?.added
          ? ` ${data.analyzerPush.added} new lead(s) pushed to Analyze.`
          : '';
        stubNote.textContent = data.stats.discarded
          ? `${data.stats.discarded} row(s) discarded.${importedNote}${pushedNote}${reviewNote}`
          : `Processing complete.${importedNote}${pushedNote}${reviewNote}`;
        setHidden(stubNote, !data.stats.discarded && !data.stats.alreadyImported
          && !data.analyzerPush?.added && !data.stats.needsReview);
      }
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

  initResponseDateTimePicker();
  loadStates().catch((err) => showError(err.message || 'Could not load city profiles. Is Form Forge running?'));
})();