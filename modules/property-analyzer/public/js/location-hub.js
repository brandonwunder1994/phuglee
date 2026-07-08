// location-hub.js — market picker gate for Distress Rankings
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const li = PDA.lib?.locationIndex;

    R.setLocationFilter = function setLocationFilter(filter) {
      state.locationFilter = filter;
      state.displayLimit = DISPLAY_LIMIT_INITIAL;
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      renderResults({ force: true });
      saveSession();
    };

    R.clearLocationFilter = function clearLocationFilter() {
      state.locationFilter = null;
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      renderResults({ force: true });
      saveSession();
    };

    R.updateLocationHubUi = function updateLocationHubUi() {
      const hasResults = state.results.length > 0;
      const picked = !!state.locationFilter;
      const gateActive = hasResults && !picked;

      document.body.classList.toggle('location-gate-active', gateActive);

      if (locationHub) locationHub.hidden = !gateActive;
      if (dashboard) dashboard.hidden = gateActive;
      if (locationBreadcrumb) locationBreadcrumb.hidden = !picked;

      if (picked && locationBreadcrumbLabel) {
        const f = state.locationFilter;
        if (f.state === li?.UNKNOWN_STATE) {
          locationBreadcrumbLabel.textContent = 'Unknown location';
        } else if (f.city) {
          locationBreadcrumbLabel.textContent = `${f.city}, ${f.state}`;
        } else {
          locationBreadcrumbLabel.textContent = f.state;
        }
      }

      if (gateActive) renderLocationHubList();
    };

    function renderLocationHubList() {
      if (!locationHubList || !li) return;
      const index = li.buildLocationIndex(state.results, normalizeStateAbbr);
      const q = state.locationHubQuery || '';
      const filtered = li.filterLocationIndex(index, q);
      const items = [];

      for (const s of filtered.states) {
        items.push(`<button type="button" class="location-state-row" data-state="${escapeHtml(s.abbr)}" role="listitem">
          <span class="location-state-name">${stateIconHtml({ state: s.abbr }, true)}<span>${escapeHtml(s.name)}</span></span>
          <span class="location-state-total">${s.total.toLocaleString()} leads</span>
        </button>`);
        if (s.cities.length) {
          items.push(`<div class="location-city-row" role="listitem">${s.cities.map((c) =>
            `<button type="button" class="location-city-chip" data-state="${escapeHtml(s.abbr)}" data-city="${escapeHtml(c.name)}">${escapeHtml(c.name)} <span class="location-city-count">${c.total}</span></button>`
          ).join('')}</div>`);
        }
      }

      if (filtered.unknownTotal) {
        items.push(`<button type="button" class="location-state-row location-unknown-row" data-state="${li.UNKNOWN_STATE}" role="listitem">
          <span class="location-state-name">Unknown location</span>
          <span class="location-state-total">${filtered.unknownTotal.toLocaleString()} leads</span>
        </button>`);
      }

      locationHubList.innerHTML = items.join('');
      if (locationHubEmpty) {
        const empty = !items.length;
        locationHubEmpty.hidden = !empty;
      }
    }

    function wireLocationHubEvents() {
      locationHubList?.addEventListener('click', (e) => {
        const cityBtn = e.target.closest('.location-city-chip');
        if (cityBtn) {
          setLocationFilter({ state: cityBtn.dataset.state, city: cityBtn.dataset.city });
          return;
        }
        const stateBtn = e.target.closest('.location-state-row');
        if (stateBtn) {
          setLocationFilter({ state: stateBtn.dataset.state, city: null });
        }
      });

      locationHubSearch?.addEventListener('input', () => {
        state.locationHubQuery = locationHubSearch.value;
        renderLocationHubList();
      });

      locationBreadcrumbChange?.addEventListener('click', () => clearLocationFilter());

      document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (!locationHub || locationHub.hidden) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        locationHubSearch?.focus();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireLocationHubEvents);
    } else {
      wireLocationHubEvents();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);