(function (global) {
  'use strict';

  var COVERAGE_MAP_URLS = ['/api/coverage/map', '/forge/api/coverage/map'];
  var COVERAGE_FALLBACK_URLS = [
    '/data/coverage-map-bootstrap.json',
    '/static/data/coverage-map-bootstrap.json',
    '/forge/static/data/coverage-map-bootstrap.json'
  ];
  var COVERAGE_BASIC_URLS = ['/api/coverage', '/forge/api/coverage'];
  var STATES_GEO_URLS = [
    '/forge/static/geo/us-states.geojson',
    '/static/geo/us-states.geojson',
    '/forge/static/geo/us-states.json'
  ];

  var LEADS_UNAVAILABLE = new Set([
    'Alabama',
    'Arkansas',
    'Delaware',
    'Kentucky',
    'South Carolina',
    'Virginia'
  ]);

  var coverageCache = null;
  var imagesCache = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchFirst(urls, options) {
    var lastError = null;
    for (var i = 0; i < urls.length; i += 1) {
      try {
        var res = await fetch(urls[i], options || {});
        if (res.ok) return res;
        lastError = new Error('HTTP ' + res.status);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('fetch failed');
  }

  async function fetchCoverageMap() {
    if (coverageCache) return coverageCache;
    try {
      var res = await fetchFirst(COVERAGE_MAP_URLS, { cache: 'no-store' });
      coverageCache = await res.json();
      return coverageCache;
    } catch (_) {
      var fallback = await fetchFirst(COVERAGE_FALLBACK_URLS, { cache: 'default' });
      coverageCache = await fallback.json();
      return coverageCache;
    }
  }

  async function fetchStatesGeo() {
    var res = await fetchFirst(STATES_GEO_URLS, { cache: 'default' });
    return res.json();
  }

  async function fetchCityImages() {
    if (imagesCache) return imagesCache;
    try {
      var res = await fetchFirst([
        '/api/coverage/city-images',
        '/forge/api/coverage/city-images',
        '/data/city-images.json'
      ], { cache: 'default' });
      imagesCache = await res.json();
      return imagesCache;
    } catch (_) {
      imagesCache = { cities: {} };
      return imagesCache;
    }
  }

  function countByState(coverage) {
    var map = {};
    (coverage.states || []).forEach(function (s) {
      map[s.name] = s.count;
    });
    return map;
  }

  function isLeadsUnavailable(name, coverage) {
    if (coverage && coverage.unavailable_states) {
      return coverage.unavailable_states.indexOf(name) !== -1;
    }
    return LEADS_UNAVAILABLE.has(name);
  }

  function getStateStatus(name, counts, coverage) {
    if (isLeadsUnavailable(name, coverage)) return 'unavailable';
    if ((counts[name] || 0) > 0) return 'covered';
    return 'no-coverage';
  }

  function cityCounty(city) {
    return city.county || 'Unknown County';
  }

  function matchesSearch(city, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return (city.city + ' ' + city.state + ' ' + (city.county || '') + ' ' + city.id).toLowerCase().indexOf(q) !== -1;
  }

  function groupCitiesByCounty(cities) {
    var groups = new Map();
    cities.forEach(function (city) {
      var county = cityCounty(city);
      if (!groups.has(county)) groups.set(county, []);
      groups.get(county).push(city);
    });
    return Array.from(groups.entries())
      .sort(function (a, b) { return a[0].localeCompare(b[0]); })
      .map(function (entry) {
        return {
          county: entry[0],
          cities: entry[1].sort(function (a, b) { return a.city.localeCompare(b.city); })
        };
      });
  }

  function stateCities(coverage, stateName, query, layerFilter) {
    return (coverage.cities || [])
      .filter(function (c) {
        if (c.state !== stateName) return false;
        if (layerFilter && !layerFilter(c)) return false;
        return matchesSearch(c, query);
      })
      .sort(function (a, b) { return a.city.localeCompare(b.city); });
  }

  function searchCities(coverage, query, layerFilter) {
    return (coverage.cities || [])
      .filter(function (c) {
        if (layerFilter && !layerFilter(c)) return false;
        return matchesSearch(c, query);
      })
      .sort(function (a, b) {
        return a.city.localeCompare(b.city) || a.state.localeCompare(b.state);
      });
  }

  function buildCityButton(city, onSelect, options) {
    options = options || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.cityId = city.id;
    btn.className = 'coverage-city-pick' + (options.selectedId === city.id ? ' is-selected' : '');
    if (options.compact) btn.classList.add('coverage-city-pick--compact');
    if (options.command) btn.classList.add('coverage-city-pick--command');

    if (options.command) {
      var isPortal = city.pin_type === 'portal';
      var county = cityCounty(city);
      var countyLabel = county && county !== 'Unknown County' ? county : '';
      btn.innerHTML =
        '<span class="coverage-city-pick-pip' + (isPortal ? ' is-portal' : ' is-live') + '" aria-hidden="true"></span>' +
        '<span class="coverage-city-pick-main">' +
          '<span class="coverage-city-pick-name">' + escapeHtml(city.city) + '</span>' +
          '<span class="coverage-city-pick-state">' + escapeHtml(city.state) + '</span>' +
        '</span>' +
        '<span class="coverage-city-pick-meta">' +
          '<span class="coverage-city-pick-type">' + (isPortal ? 'Portal' : 'FOIA') + '</span>' +
          (countyLabel ? '<span class="coverage-city-pick-county">' + escapeHtml(countyLabel) + '</span>' : '') +
        '</span>';
    } else {
      var tag = city.pin_type === 'portal' ? ' ◆' : ' ●';
      var label = options.compact || options.stateName
        ? city.city + tag
        : city.city + ', ' + city.state + tag;
      btn.textContent = label;
    }

    btn.setAttribute('role', 'option');
    btn.addEventListener('click', function () { onSelect(city); });
    return btn;
  }

  function renderCountyBrowser(container, stateName, cities, options) {
    if (!container) return;
    options = options || {};
    container.innerHTML = '';

    var groups = groupCitiesByCounty(cities);
    var expanded = options.expandedCounties || new Set();
    var searching = Boolean(String(options.searchQuery || '').trim());

    if (searching) {
      groups.forEach(function (g) { expanded.add(g.county); });
    }

    var root = document.createElement('div');
    root.className = 'coverage-county-browser';

    groups.forEach(function (group) {
      var county = group.county;
      var countyCities = group.cities;
      var wrap = document.createElement('div');
      wrap.className = 'coverage-county-group' + (expanded.has(county) ? ' is-open' : '');

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'coverage-county-toggle';
      toggle.setAttribute('aria-expanded', expanded.has(county) ? 'true' : 'false');

      var label = document.createElement('span');
      label.className = 'coverage-county-toggle-label';
      label.textContent = county;

      var meta = document.createElement('span');
      meta.className = 'coverage-county-toggle-meta';
      meta.textContent = String(countyCities.length);

      var chevron = document.createElement('span');
      chevron.className = 'coverage-county-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';

      toggle.append(label, meta, chevron);
      toggle.addEventListener('click', function () {
        if (expanded.has(county)) expanded.delete(county);
        else expanded.add(county);
        wrap.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', wrap.classList.contains('is-open') ? 'true' : 'false');
        if (options.onCountyToggle) options.onCountyToggle(county, expanded);
      });

      var list = document.createElement('div');
      list.className = 'coverage-county-cities';
      countyCities.forEach(function (city) {
        list.appendChild(buildCityButton(city, options.onSelectCity, {
          compact: true,
          stateName: stateName,
          selectedId: options.selectedId
        }));
      });

      wrap.append(toggle, list);
      root.appendChild(wrap);
    });

    container.appendChild(root);
  }

  function renderSearchList(container, cities, onSelect, selectedId, options) {
    if (!container) return;
    options = options || {};
    container.innerHTML = '';
    var list = document.createElement('ul');
    list.className = 'coverage-city-list' + (options.command ? ' coverage-city-list--command' : '');
    list.setAttribute('role', 'listbox');
    if (!cities.length) {
      var empty = document.createElement('li');
      empty.className = 'coverage-city-list-empty';
      empty.textContent = options.emptyText || 'No markets match that scan.';
      list.appendChild(empty);
    } else {
      cities.slice(0, options.limit || 48).forEach(function (city) {
        var li = document.createElement('li');
        li.appendChild(buildCityButton(city, onSelect, {
          selectedId: selectedId,
          command: !!options.command
        }));
        list.appendChild(li);
      });
    }
    container.appendChild(list);
  }

  function syncCitySelection(selectedId) {
    document.querySelectorAll('.coverage-city-pick').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.cityId === selectedId);
    });
  }

  function formatCount(n) {
    return Number(n).toLocaleString('en-US');
  }

  global.PhugleeCoverageShared = {
    LEADS_UNAVAILABLE: LEADS_UNAVAILABLE,
    escapeHtml: escapeHtml,
    fetchCoverageMap: fetchCoverageMap,
    fetchStatesGeo: fetchStatesGeo,
    fetchCityImages: fetchCityImages,
    countByState: countByState,
    isLeadsUnavailable: isLeadsUnavailable,
    getStateStatus: getStateStatus,
    cityCounty: cityCounty,
    matchesSearch: matchesSearch,
    groupCitiesByCounty: groupCitiesByCounty,
    stateCities: stateCities,
    searchCities: searchCities,
    buildCityButton: buildCityButton,
    renderCountyBrowser: renderCountyBrowser,
    renderSearchList: renderSearchList,
    syncCitySelection: syncCitySelection,
    formatCount: formatCount,
    clearCache: function () {
      coverageCache = null;
      imagesCache = null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);