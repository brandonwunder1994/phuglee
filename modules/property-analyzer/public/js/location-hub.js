// location-hub.js — historical state/city search + upload date filter
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const li = PDA.lib?.locationIndex;
    const ib = PDA.lib?.importBatches;

    function allLeads() {
      return [...(state.records || []), ...(state.results || [])];
    }

    function buildHistoricalIndex() {
      return li?.buildLocationIndex(allLeads(), normalizeStateAbbr) || { states: [], unknownTotal: 0 };
    }

    R.setLocationFilter = function setLocationFilter(filter) {
      state.locationFilter = filter;
      state.importDateFilter = [];
      resetDisplayLimit();
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      updateFilterLabels?.();
      renderResults({ force: true });
      saveSession();
    };

    R.clearLocationFilter = function clearLocationFilter() {
      state.locationFilter = null;
      state.importDateFilter = [];
      if (historicalStateSelect) historicalStateSelect.value = '';
      if (historicalCitySelect) {
        historicalCitySelect.innerHTML = '<option value="">Select city…</option>';
        historicalCitySelect.disabled = true;
      }
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      updateFilterLabels?.();
      renderResults({ force: true });
      saveSession();
    };

    R.toggleImportDateChip = function toggleImportDateChip(batchId) {
      const current = Array.isArray(state.importDateFilter) ? [...state.importDateFilter] : [];
      const idx = current.indexOf(batchId);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(batchId);
      state.importDateFilter = current;
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      renderUploadDateChips();
      updateFilterLabels?.();
      renderResults({ force: true });
      updateLocalKpis();
      saveSession();
    };

    function populateStateSelect() {
      if (!historicalStateSelect) return;
      const index = buildHistoricalIndex();
      const prev = historicalStateSelect.value;
      const options = ['<option value="">Select state…</option>'];
      for (const s of index.states) {
        options.push(`<option value="${escapeHtml(s.abbr)}">${escapeHtml(s.name)} (${s.total})</option>`);
      }
      if (index.unknownTotal) {
        options.push(`<option value="${li.UNKNOWN_STATE}">Unknown location (${index.unknownTotal})</option>`);
      }
      historicalStateSelect.innerHTML = options.join('');
      historicalStateSelect.disabled = index.states.length === 0 && !index.unknownTotal;
      if (prev) historicalStateSelect.value = prev;
    }

    function populateCitySelect(stateAbbr) {
      if (!historicalCitySelect) return;
      if (!stateAbbr) {
        historicalCitySelect.innerHTML = '<option value="">Select city…</option>';
        historicalCitySelect.disabled = true;
        return;
      }
      const index = buildHistoricalIndex();
      const stateEntry = index.states.find((s) => s.abbr === stateAbbr);
      const options = ['<option value="">All cities in state</option>'];
      for (const c of (stateEntry?.cities || [])) {
        options.push(`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.total})</option>`);
      }
      historicalCitySelect.innerHTML = options.join('');
      historicalCitySelect.disabled = !stateEntry;
    }

    R.renderUploadDateChips = function renderUploadDateChips() {
      if (!uploadDateChips || !state.locationFilter || !ib) return;
      const chips = ib.listUploadDatesForLocation(
        state.records,
        state.results,
        state.locationFilter,
        normalizeStateAbbr,
        state.importBatches
      );
      if (uploadDateFilter) uploadDateFilter.hidden = !chips.length;
      if (!chips.length) {
        uploadDateChips.innerHTML = '';
        return;
      }
      const selected = new Set(state.importDateFilter || []);
      uploadDateChips.innerHTML = chips.map((chip) => {
        const active = selected.has(chip.batchId) ? ' is-active' : '';
        const recent = chip.isMostRecent ? '<span class="upload-date-badge">Most recent</span>' : '';
        return `<button type="button" class="upload-date-chip${active}" data-batch-id="${escapeHtml(chip.batchId)}" aria-pressed="${selected.has(chip.batchId)}">${escapeHtml(chip.label)}${recent}</button>`;
      }).join('');
    };

    R.updateLocalKpis = function updateLocalKpis() {
      if (!localKpiSection) return;
      const picked = !!state.locationFilter;
      localKpiSection.hidden = !picked;
      if (!picked) return;

      const list = getFilteredResults();
      let distressed = 0;
      let review = 0;
      for (const r of list) {
        if (computeNeedsReview(r)) review += 1;
        else if (resultLeadTier(r) === 'distressed') distressed += 1;
      }
      if (localDistressed) localDistressed.textContent = distressed.toLocaleString();
      if (localReview) localReview.textContent = review.toLocaleString();
      if (localTotal) localTotal.textContent = list.length.toLocaleString();

      const label = locationBreadcrumbLabel?.textContent || 'Selected market';
      if (localKpiTitle) localKpiTitle.textContent = label;
    };

    R.updateLocationHubUi = function updateLocationHubUi() {
      const hasData = state.records.length > 0 || state.results.length > 0;
      const picked = !!state.locationFilter;

      if (locationHub) locationHub.hidden = !hasData;
      if (dashboard) dashboard.hidden = !picked;
      if (locationBreadcrumb) locationBreadcrumb.hidden = !picked;

      if (hasData) populateStateSelect();

      if (picked && locationBreadcrumbLabel) {
        const f = state.locationFilter;
        if (f.state === li?.UNKNOWN_STATE) {
          locationBreadcrumbLabel.textContent = 'Unknown location';
        } else if (f.city) {
          locationBreadcrumbLabel.textContent = `${f.city}, ${f.state}`;
        } else {
          locationBreadcrumbLabel.textContent = f.state;
        }
        renderUploadDateChips();
        updateLocalKpis();
      } else if (locationHubEmpty) {
        locationHubEmpty.hidden = picked;
      }

      updateScanReadyUi?.();
      syncResultsExportButtons?.();
    };

    function wireHistoricalSearch() {
      historicalStateSelect?.addEventListener('change', () => {
        const abbr = historicalStateSelect.value;
        populateCitySelect(abbr);
        if (!abbr) {
          clearLocationFilter();
          return;
        }
        if (historicalCitySelect && !historicalCitySelect.value) {
          setLocationFilter({ state: abbr, city: null });
        }
      });

      historicalCitySelect?.addEventListener('change', () => {
        const abbr = historicalStateSelect?.value;
        if (!abbr) return;
        const city = historicalCitySelect.value || null;
        setLocationFilter({ state: abbr, city });
      });

      uploadDateChips?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-batch-id]');
        if (!chip) return;
        toggleImportDateChip(chip.dataset.batchId);
      });

      locationBreadcrumbChange?.addEventListener('click', () => clearLocationFilter());

      resultsExportCsvBtn?.addEventListener('click', () => exportResults('csv', { scope: 'current' }));
      resultsExportExcelBtn?.addEventListener('click', () => exportResults('xlsx', { scope: 'all', profile: 'full' }));
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireHistoricalSearch);
    } else {
      wireHistoricalSearch();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);