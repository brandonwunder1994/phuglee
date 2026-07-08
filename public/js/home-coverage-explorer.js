(function () {
  'use strict';

  var shared = window.PhugleeCoverageShared;
  var modal = window.PhugleeCityProfileModal;

  var MAPLIBRE_CSS = '/forge/static/vendor/maplibre-gl.css';
  var MAPLIBRE_JS = '/forge/static/vendor/maplibre-gl.js';

  var COLOR_COVERED_LOW = '#2a8f5c';
  var COLOR_COVERED_HIGH = '#45c47e';
  var COLOR_NO_DATA = '#3a4658';
  var COLOR_UNAVAILABLE_BASE = '#8f2a2a';
  var COLOR_UNAVAILABLE_ACCENT = '#c84848';

  var US_MAP_BOUNDS = [[-124.6, 24.0], [-66.4, 49.6]];
  var LIFT_OFFSET_UP = -4;
  var LIFT_OFFSET_SHADOW = 2;

  var previewStarted = false;
  var previewMap = null;
  var coverage = null;
  var statesGeo = null;
  var currentState = null;
  var hoveredState = null;
  var selectedCityId = null;
  var searchQuery = '';
  var expandedCounties = new Map();
  var reduceMotion = false;

  function loadStylesheet(href) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('link[href="' + href + '"]')) {
        resolve();
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = function () { resolve(); };
      link.onerror = function () { reject(new Error('css failed')); };
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.maplibregl) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('script failed')); };
      document.head.appendChild(script);
    });
  }

  function ensureHatchPattern(map) {
    if (map.hasImage('home-unavailable-hatch')) return true;
    try {
      var size = 16;
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.fillStyle = COLOR_UNAVAILABLE_BASE;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = COLOR_UNAVAILABLE_ACCENT;
      ctx.lineWidth = 2;
      for (var offset = -size; offset <= size * 2; offset += 6) {
        ctx.beginPath();
        ctx.moveTo(offset, size);
        ctx.lineTo(offset + size, 0);
        ctx.stroke();
      }
      map.addImage('home-unavailable-hatch', ctx.getImageData(0, 0, size, size), { pixelRatio: 1 });
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildDarkStyle() {
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#080c14' } }]
    };
  }

  function buildStateFillColor(maxCount) {
    return [
      'case',
      ['==', ['get', 'leadsUnavailable'], 1],
      COLOR_UNAVAILABLE_BASE,
      ['boolean', ['get', 'hasData'], false],
      [
        'interpolate',
        ['linear'],
        ['get', 'count'],
        1, COLOR_COVERED_LOW,
        maxCount, COLOR_COVERED_HIGH
      ],
      COLOR_NO_DATA
    ];
  }

  function buildStateFillOpacity() {
    return [
      'case',
      ['==', ['get', 'leadsUnavailable'], 1], 1,
      ['boolean', ['get', 'hasData'], false], 1,
      0.72
    ];
  }

  function stateNameFilter(name) {
    return name ? ['==', ['get', 'name'], name] : ['==', ['get', 'name'], ''];
  }

  function updateLiftLayers() {
    if (!previewMap) return;
    var raised = hoveredState || currentState || '';
    var filter = stateNameFilter(raised);
    var liftUp = reduceMotion ? [0, 0] : [0, LIFT_OFFSET_UP];
    var liftDown = reduceMotion ? [0, 0] : [0, LIFT_OFFSET_SHADOW];

    if (previewMap.getLayer('home-states-lift-shadow')) {
      previewMap.setFilter('home-states-lift-shadow', filter);
      previewMap.setPaintProperty('home-states-lift-shadow', 'fill-translate', liftDown);
    }
    if (previewMap.getLayer('home-states-lift')) {
      previewMap.setFilter('home-states-lift', filter);
      previewMap.setPaintProperty('home-states-lift', 'fill-translate', liftUp);
    }
    if (previewMap.getLayer('home-states-hover')) {
      previewMap.setFilter('home-states-hover', stateNameFilter(currentState || ''));
    }
  }

  function lockMapView(map) {
    map.fitBounds(US_MAP_BOUNDS, { padding: 28, duration: 0 });
    var zoom = map.getZoom();
    map.setMinZoom(zoom);
    map.setMaxZoom(zoom);
  }

  function setDockOpen(open) {
    var dock = document.getElementById('home-coverage-dock');
    if (!dock) return;
    dock.classList.toggle('is-open', open);
    dock.classList.toggle('is-collapsed', !open);
  }

  function showDockPanel(panelId) {
    ['home-dock-hint', 'home-dock-search', 'home-dock-state'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = id !== panelId;
    });
    setDockOpen(panelId !== 'home-dock-hint');
  }

  function updateDockHead(title, sub) {
    var titleEl = document.getElementById('home-dock-title');
    var subEl = document.getElementById('home-dock-sub');
    if (titleEl) titleEl.textContent = title || 'Explore coverage';
    if (subEl) subEl.textContent = sub || '';
  }

  function onSelectCity(city) {
    selectedCityId = city.id;
    shared.syncCitySelection(city.id);
    if (modal) modal.open(city);
  }

  function renderStateDock(stateName) {
    if (!coverage || !shared) return;
    var cities = shared.stateCities(coverage, stateName, searchQuery);
    var browser = document.getElementById('home-dock-counties');
    if (!expandedCounties.has(stateName)) expandedCounties.set(stateName, new Set());
    shared.renderCountyBrowser(browser, stateName, cities, {
      searchQuery: searchQuery,
      selectedId: selectedCityId,
      expandedCounties: expandedCounties.get(stateName),
      onSelectCity: onSelectCity
    });
    var portalN = cities.filter(function (c) { return c.pin_type === 'portal'; }).length;
    var completedN = cities.length - portalN;
    updateDockHead(stateName, cities.length + ' cities · ' + portalN + ' portal · ' + completedN + ' PDF');
    showDockPanel('home-dock-state');
    document.getElementById('home-dock-back').hidden = false;
  }

  function renderSearchDock() {
    if (!coverage || !shared) return;
    var matches = shared.searchCities(coverage, searchQuery);
    var list = document.getElementById('home-dock-search-list');
    shared.renderSearchList(list, matches, onSelectCity, selectedCityId);
    updateDockHead('Search results', matches.length + ' matches');
    showDockPanel('home-dock-search');
    document.getElementById('home-dock-back').hidden = !currentState;
  }

  function selectState(stateName) {
    currentState = stateName;
    searchQuery = document.getElementById('home-dock-search-input')?.value || '';
    if (searchQuery.trim()) {
      renderSearchDock();
    } else {
      renderStateDock(stateName);
    }
    updateLiftLayers();
  }

  function resetDock() {
    currentState = null;
    selectedCityId = null;
    searchQuery = '';
    var input = document.getElementById('home-dock-search-input');
    if (input) input.value = '';
    updateDockHead('Explore coverage', 'Click a state or search a city, county, or state');
    showDockPanel('home-dock-hint');
    document.getElementById('home-dock-back').hidden = true;
    updateLiftLayers();
  }

  function onSearchInput() {
    searchQuery = document.getElementById('home-dock-search-input')?.value || '';
    selectedCityId = null;
    if (searchQuery.trim()) {
      renderSearchDock();
      return;
    }
    if (currentState) renderStateDock(currentState);
    else resetDock();
  }

  function mountStateLayers(map, geo, cov) {
    var counts = shared.countByState(cov);
    var maxCount = cov.max_count || 1;
    var fillColor = buildStateFillColor(maxCount);
    var fillOpacity = buildStateFillOpacity();

    geo.features.forEach(function (feature) {
      var name = feature.properties.name;
      feature.properties.count = counts[name] || 0;
      feature.properties.hasData = feature.properties.count > 0;
      feature.properties.leadsUnavailable = shared.isLeadsUnavailable(name, cov) ? 1 : 0;
    });

    map.addSource('home-states', { type: 'geojson', data: geo });

    map.addLayer({
      id: 'home-states-fill',
      type: 'fill',
      source: 'home-states',
      paint: {
        'fill-color': fillColor,
        'fill-opacity': fillOpacity
      }
    });

    if (ensureHatchPattern(map)) {
      map.addLayer({
        id: 'home-states-hatch',
        type: 'fill',
        source: 'home-states',
        filter: ['==', ['get', 'leadsUnavailable'], 1],
        paint: { 'fill-pattern': 'home-unavailable-hatch', 'fill-opacity': 1 }
      });
    }

    map.addLayer({
      id: 'home-states-lift-shadow',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.42,
        'fill-translate': [0, LIFT_OFFSET_SHADOW]
      }
    });

    map.addLayer({
      id: 'home-states-lift',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': fillColor,
        'fill-opacity': fillOpacity,
        'fill-translate': [0, LIFT_OFFSET_UP]
      }
    });

    map.addLayer({
      id: 'home-states-line',
      type: 'line',
      source: 'home-states',
      paint: { 'line-color': 'rgba(240, 235, 227, 0.18)', 'line-width': 0.8 }
    });

    map.addLayer({
      id: 'home-states-hover',
      type: 'line',
      source: 'home-states',
      paint: { 'line-color': '#eeb746', 'line-width': 2.2 },
      filter: stateNameFilter('')
    });

    map.on('click', 'home-states-fill', function (e) {
      if (!e.features || !e.features.length) return;
      var name = e.features[0].properties.name;
      selectState(name);
    });

    map.on('mousemove', 'home-states-fill', function (e) {
      if (!e.features || !e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      var name = e.features[0].properties.name;
      if (hoveredState !== name) {
        hoveredState = name;
        updateLiftLayers();
      }
    });

    map.on('mouseleave', 'home-states-fill', function () {
      map.getCanvas().style.cursor = '';
      hoveredState = null;
      updateLiftLayers();
    });
  }

  function updateSummary(cov) {
    var el = document.getElementById('home-map-summary');
    if (!el || !shared) return;
    el.innerHTML =
      '<strong>' + shared.formatCount(cov.total_cities) + ' cities</strong> across ' +
      '<strong>' + shared.formatCount(cov.total_states) + ' states</strong> — click a state to browse';
    if (window.PhugleeCoverage && window.PhugleeCoverage.updateCoverageStats) {
      window.PhugleeCoverage.updateCoverageStats({
        total_cities: cov.total_cities,
        total_states: cov.total_states
      });
    }
  }

  async function renderSvgFallback() {
    if (window.PhugleeCoverage && window.PhugleeCoverage.refreshHomeMap) {
      return window.PhugleeCoverage.refreshHomeMap();
    }
    var host = document.getElementById('home-coverage-map');
    if (host) host.innerHTML = '<p class="home-map-error">Map unavailable — check back shortly.</p>';
  }

  async function initExplorer() {
    if (previewStarted || !shared) return;
    previewStarted = true;

    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var host = document.getElementById('home-coverage-map');
    if (!host) return;

    host.innerHTML = '<p class="home-map-loading">Loading map…</p>';
    host.classList.add('home-coverage-map--loading');

    try {
      coverage = await shared.fetchCoverageMap();
      statesGeo = await shared.fetchStatesGeo();
      updateSummary(coverage);
      if (modal) modal.prefetchImages();

      await Promise.all([loadStylesheet(MAPLIBRE_CSS), loadScript(MAPLIBRE_JS)]);
      if (!window.maplibregl) throw new Error('maplibre missing');

      host.innerHTML = '';
      host.classList.remove('home-coverage-map--loading');
      host.classList.add('home-coverage-map--live');

      previewMap = new maplibregl.Map({
        container: host,
        style: buildDarkStyle(),
        center: [-96.2, 38.8],
        zoom: 3.4,
        attributionControl: false,
        fadeDuration: 0,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        boxZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false,
        pitchWithRotate: false
      });

      previewMap.on('load', function () {
        mountStateLayers(previewMap, statesGeo, coverage);
        document.getElementById('home-territory-monitor')?.classList.add('is-live');
        previewMap.resize();
        lockMapView(previewMap);
      });

      previewMap.on('resize', function () {
        lockMapView(previewMap);
      });

      var searchInput = document.getElementById('home-dock-search-input');
      if (searchInput) searchInput.addEventListener('input', onSearchInput);
      document.getElementById('home-dock-back')?.addEventListener('click', resetDock);

      resetDock();
    } catch (_) {
      host.classList.remove('home-coverage-map--loading');
      await renderSvgFallback();
    }
  }

  function observeExplorer() {
    if (!document.body.hasAttribute('data-home-map-preview')) return;
    var section = document.querySelector('.home-coverage');
    if (!section) return;

    if (!('IntersectionObserver' in window)) {
      initExplorer();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        initExplorer();
        observer.disconnect();
      });
    }, { rootMargin: '160px 0px', threshold: 0.05 });

    observer.observe(section);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeExplorer);
  } else {
    observeExplorer();
  }

  window.PhugleeHomeCoverageExplorer = { init: initExplorer };
})();