// location-hub.js — historical state/city search + upload date filter
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const li = () => PDA.lib?.locationIndex;
    const ib = () => PDA.lib?.importBatches;

    /**
     * Leads for location index: analyzed results only (deduped).
     * Never double-count by merging records+results of the same address.
     */
    function leadsForLocationIndex() {
      return state.results || [];
    }

    function buildHistoricalIndex() {
      // Prefer server geo (full session) so state totals are accurate before hydration finishes
      const geo = state._geoFromServer;
      if (geo && Array.isArray(geo.states) && geo.states.length) {
        return {
          states: geo.states.map((s) => ({
            abbr: s.abbr,
            name: s.name || s.abbr,
            total: s.total || s.tierCounts?.all || 0,
            cities: (s.cities || []).map((c) => ({
              name: c.name,
              total: c.total || c.tierCounts?.all || 0
            }))
          })),
          unknownTotal: Number(geo.unknownTotal) || 0
        };
      }
      return li()?.buildLocationIndex(leadsForLocationIndex(), normalizeStateAbbr)
        || { states: [], unknownTotal: 0 };
    }

    R.setLocationFilter = function setLocationFilter(filter) {
      state.locationFilter = filter;
      state.importDateFilter = [];
      resetDisplayLimit();
      // Filter change must not wipe global session KPIs
      tierCountsCache = null;
      tierCountsCacheKey = '';
      invalidateFilteredResultsCache?.();
      updateLocationHubUi();
      updateFilterLabels?.();
      renderResults({ force: true });
      updateLocalKpis();
      saveSession();
      // Ensure full result set for accurate card list when hydration still running
      if (sessionLoadState && !sessionLoadState.complete && typeof ensureSessionResultsLoaded === 'function') {
        ensureSessionResultsLoaded().then(() => {
          if (!state.locationFilter) return;
          invalidateFilteredResultsCache?.();
          tierCountsCache = null;
          tierCountsCacheKey = '';
          renderResults({ force: true });
          updateLocalKpis();
          updateFilterLabels?.();
          updateLocationHubUi();
        }).catch(() => {});
      }
    };

    R.clearLocationFilter = function clearLocationFilter() {
      state.locationFilter = null;
      state.importDateFilter = [];
      if (historicalStateSelect) historicalStateSelect.value = '';
      if (historicalCitySelect) {
        historicalCitySelect.innerHTML = '<option value="">Select city…</option>';
        historicalCitySelect.disabled = true;
      }
      tierCountsCache = null;
      tierCountsCacheKey = '';
      invalidateFilteredResultsCache?.();
      updateLocationHubUi();
      updateFilterLabels?.();
      renderResults({ force: true });
      updateLocalKpis();
      saveSession();
    };

    R.toggleImportDateChip = function toggleImportDateChip(batchId) {
      const current = Array.isArray(state.importDateFilter) ? [...state.importDateFilter] : [];
      const idx = current.indexOf(batchId);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(batchId);
      state.importDateFilter = current;
      tierCountsCache = null;
      tierCountsCacheKey = '';
      invalidateFilteredResultsCache?.();
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
        options.push(`<option value="${escapeHtml(s.abbr)}">${escapeHtml(s.name)} (${Number(s.total || 0).toLocaleString()})</option>`);
      }
      if (index.unknownTotal) {
        const unk = li()?.UNKNOWN_STATE || '__unknown__';
        options.push(`<option value="${unk}">Unknown location (${Number(index.unknownTotal).toLocaleString()})</option>`);
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
        options.push(`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${Number(c.total || 0).toLocaleString()})</option>`);
      }
      historicalCitySelect.innerHTML = options.join('');
      historicalCitySelect.disabled = !stateEntry;
    }

    R.renderUploadDateChips = function renderUploadDateChips() {
      if (!uploadDateChips || !state.locationFilter || !ib()) return;
      const chips = ib().listUploadDatesForLocation(
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

    /**
     * Market KPIs must use location-scoped tier counts — NOT getFilteredResults()
     * (which also applies distressed/review tier filter + search and under-counts).
     */
    R.updateLocalKpis = function updateLocalKpis() {
      if (!localKpiSection) return;
      const picked = !!state.locationFilter;
      localKpiSection.hidden = !picked;
      if (!picked) return;

      const counts = typeof getTierCounts === 'function'
        ? getTierCounts() // market-scoped when locationFilter is set
        : { distressed: 0, well_maintained: 0, vacant: 0, blurred: 0, review: 0, all: 0 };

      if (localDistressed) localDistressed.textContent = Number(counts.distressed || 0).toLocaleString();
      if ($('localWellMaintained')) {
        $('localWellMaintained').textContent = Number(counts.well_maintained || 0).toLocaleString();
      }
      if ($('localLand')) $('localLand').textContent = Number(counts.vacant || 0).toLocaleString();
      if ($('localBlocked')) $('localBlocked').textContent = Number(counts.blurred || 0).toLocaleString();
      if (localTotal) localTotal.textContent = Number(counts.all || 0).toLocaleString();
      const reviewN = Number(counts.review || 0);
      if (localReview) localReview.textContent = reviewN.toLocaleString();
      if ($('localReviewWrap')) $('localReviewWrap').hidden = reviewN <= 0;

      const label = locationBreadcrumbLabel?.textContent || 'Selected market';
      if (localKpiTitle) localKpiTitle.textContent = label;
    };

    R.updateLocationHubUi = function updateLocationHubUi() {
      const hasData = (state.results?.length || 0) > 0
        || (state.records?.length || 0) > 0
        || Number(sessionLoadState?.total || 0) > 0
        || Number(state._tierCountsFromServer?.all || 0) > 0
        || !!(state._geoFromServer?.states?.length);
      const picked = !!state.locationFilter;

      if (locationHub) locationHub.hidden = !hasData;
      if (dashboard) dashboard.hidden = !picked;
      if (locationBreadcrumb) locationBreadcrumb.hidden = !picked;

      if (hasData) populateStateSelect();

      if (picked && locationBreadcrumbLabel) {
        const f = state.locationFilter;
        const unk = li()?.UNKNOWN_STATE || '__unknown__';
        if (f.state === unk) {
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
        // Selecting a state immediately scopes market KPIs + results to that state
        setLocationFilter({ state: abbr, city: null });
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
