(function () {
  const FORGE = '/forge';
  const citySelect = document.getElementById('bridge-city');
  const fileSelect = document.getElementById('bridge-file');
  const mappingPanel = document.getElementById('bridge-mapping-panel');
  const mappingRoot = document.getElementById('bridge-mapping');
  const previewPanel = document.getElementById('bridge-preview-panel');
  const previewMeta = document.getElementById('bridge-preview-meta');
  const previewTable = document.getElementById('bridge-preview');
  const downloadBtn = document.getElementById('bridge-download');
  const errorWrap = document.getElementById('bridge-error-wrap');
  const errorEl = document.getElementById('bridge-error');
  const retryBtn = document.getElementById('bridge-retry');
  const fileHint = document.getElementById('bridge-file-hint');

  const Schema = window.DistressBridgeSchema;
  let cities = [];
  let cityDetail = null;
  let rawRows = [];
  let headers = [];
  let columnMap = {};
  let convertedRows = [];
  let lastFailedAction = 'loadCities';

  function showError(msg) {
    const hasError = Boolean(msg);
    errorWrap.hidden = !hasError;
    errorEl.textContent = msg || '';
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  async function loadCities() {
    lastFailedAction = 'loadCities';
    const data = await fetchJson(`${FORGE}/api/portal/cities/summary`);
    cities = data.items || data.cities || [];
    citySelect.innerHTML = '<option value="">Select a city…</option>';
    cities
      .sort((a, b) => `${a.state}-${a.city}`.localeCompare(`${b.state}-${b.city}`))
      .forEach((city) => {
        const opt = document.createElement('option');
        opt.value = city.id;
        opt.textContent = `${city.city}, ${city.state}`;
        citySelect.appendChild(opt);
      });
    citySelect.disabled = false;
  }

  function spreadsheetFiles(lists) {
    return (lists || []).filter((f) => Schema.isSpreadsheetFile(f.filename));
  }

  async function onCityChange() {
    fileSelect.innerHTML = '<option value="">Loading lists…</option>';
    fileSelect.disabled = true;
    mappingPanel.hidden = true;
    previewPanel.hidden = true;
    downloadBtn.disabled = true;
    showError('');

    const id = citySelect.value;
    if (!id) {
      fileSelect.innerHTML = '<option value="">Select a city first</option>';
      return;
    }

    lastFailedAction = 'cityChange';
    cityDetail = await fetchJson(`${FORGE}/api/portal/city/${encodeURIComponent(id)}`);
    const files = spreadsheetFiles(cityDetail.response_lists);
    fileSelect.innerHTML = files.length
      ? '<option value="">Select a spreadsheet…</option>'
      : '<option value="">No spreadsheet lists for this city</option>';

    files.forEach((file, index) => {
      const opt = document.createElement('option');
      opt.value = String(index);
      opt.textContent = `${file.filename} (${file.file_type_label || 'file'})`;
      opt.dataset.url = file.download_url;
      fileSelect.appendChild(opt);
    });

    fileSelect.disabled = files.length === 0;
    fileHint.textContent = files.length
      ? `${files.length} spreadsheet file(s) available. PDF and image lists must be converted manually.`
      : 'No Excel/CSV response lists found. Upload a list in Form Forge City Tracker first, or use manual import.';
  }

  function renderMapping() {
    mappingRoot.innerHTML = '';
    Schema.COLUMN_KEYS.forEach((key) => {
      const label = document.createElement('label');
      label.className = 'bridge-map-field';
      const title = document.createElement('span');
      title.textContent = Schema.PDA_COLUMNS[key].label;
      const select = document.createElement('select');
      select.dataset.key = key;
      select.innerHTML = '<option value="">— unmapped —</option>';
      headers.forEach((h) => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        if (columnMap[key] === h) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', onMappingChange);
      label.appendChild(title);
      label.appendChild(select);
      mappingRoot.appendChild(label);
    });
    mappingPanel.hidden = false;
  }

  function renderPreview() {
    const sheetRows = Schema.toAnalyzerSheetRows(convertedRows);
    const cols = Object.keys(sheetRows[0] || {});
    previewTable.querySelector('thead').innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const sample = sheetRows.slice(0, 8);
    previewTable.querySelector('tbody').innerHTML = sample.map((row) =>
      `<tr>${cols.map((c) => `<td>${String(row[c] || '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`
    ).join('');
    previewMeta.textContent = `${sheetRows.length.toLocaleString()} row(s) ready for Property Analyzer import. Showing first ${sample.length}.`;
    previewPanel.hidden = false;
    downloadBtn.disabled = sheetRows.length === 0;
  }

  function onMappingChange() {
    mappingRoot.querySelectorAll('select[data-key]').forEach((sel) => {
      columnMap[sel.dataset.key] = sel.value || null;
    });
    try {
      convertedRows = Schema.convertRows(rawRows, columnMap);
      showError('');
      renderPreview();
    } catch (err) {
      convertedRows = [];
      previewPanel.hidden = true;
      downloadBtn.disabled = true;
      lastFailedAction = 'mapping';
      showError(err.message || 'Could not convert with this mapping.');
    }
  }

  async function loadSpreadsheet(url) {
    lastFailedAction = 'fileChange';
    const res = await fetch(`${FORGE}${url}`);
    if (!res.ok) throw new Error('Could not download list file from Form Forge.');
    const buffer = await res.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rawRows.length) throw new Error('Spreadsheet is empty.');
    headers = Object.keys(rawRows[0]);
    columnMap = Schema.detectColumnMap(headers);
    renderMapping();
    onMappingChange();
  }

  async function onFileChange() {
    mappingPanel.hidden = true;
    previewPanel.hidden = true;
    downloadBtn.disabled = true;
    showError('');

    const opt = fileSelect.selectedOptions[0];
    if (!opt || !opt.dataset.url) return;

    try {
      await loadSpreadsheet(opt.dataset.url);
    } catch (err) {
      showError(err.message || 'Failed to read spreadsheet.');
    }
  }

  function onDownload() {
    const sheetRows = Schema.toAnalyzerSheetRows(convertedRows);
    if (!sheetRows.length) return;
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lead Database');
    const cityName = cityDetail?.city || 'city';
    const state = cityDetail?.state || 'list';
    XLSX.writeFile(wb, `distress-os-${state}-${cityName}-analyzer.xlsx`.replace(/[^\w.\-]+/g, '_'));
  }

  async function onRetry() {
    showError('');
    try {
      if (lastFailedAction === 'cityChange') {
        await onCityChange();
      } else if (lastFailedAction === 'fileChange') {
        await onFileChange();
      } else if (lastFailedAction === 'mapping') {
        onMappingChange();
      } else {
        await loadCities();
      }
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  citySelect?.addEventListener('change', () => { onCityChange().catch((e) => showError(e.message)); });
  fileSelect?.addEventListener('change', () => { onFileChange().catch((e) => showError(e.message)); });
  downloadBtn?.addEventListener('click', onDownload);
  retryBtn?.addEventListener('click', () => { onRetry().catch((e) => showError(e.message)); });

  loadCities().catch((err) => showError(err.message || 'Could not load Form Forge cities. Is Form Forge running?'));
})();