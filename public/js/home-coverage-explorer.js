(function () {
  'use strict';

  var shared = window.PhugleeCoverageShared;
  var modal = window.PhugleeCityProfileModal;

  var MAPLIBRE_CSS = '/forge/static/vendor/maplibre-gl.css';
  var MAPLIBRE_JS = '/forge/static/vendor/maplibre-gl.js';

  var COLOR_COVERED_LOW = '#8a4a18';
  var COLOR_COVERED_MID = '#e58435';
  var COLOR_COVERED_HIGH = '#eeb746';
  var COLOR_NO_DATA = '#3a4658';
  var COLOR_UNAVAILABLE_BASE = '#8f2a2a';
  var COLOR_UNAVAILABLE_ACCENT = '#c84848';

  var US_MAP_BOUNDS = [[-124.6, 24.0], [-66.4, 49.6]];
  var LIFT_OFFSET_UP = -4;
  var LIFT_OFFSET_SHADOW = 2;

  /**
   * Tiny coastal states are unreadable/unclickable at national zoom.
   * Callouts sit in the Atlantic with leader lines back to the state.
   * center ≈ in-state anchor; callout ≈ label position (must stay in map bounds).
   */
  var SMALL_STATE_CALLOUTS = [
    { name: 'Vermont', label: 'VT', center: [-72.65, 44.05], callout: [-68.9, 45.35] },
    { name: 'New Hampshire', label: 'NH', center: [-71.55, 43.7], callout: [-68.55, 44.45] },
    { name: 'Massachusetts', label: 'MA', center: [-71.8, 42.25], callout: [-68.35, 42.95] },
    { name: 'Rhode Island', label: 'RI', center: [-71.5, 41.68], callout: [-68.2, 41.85] },
    { name: 'Connecticut', label: 'CT', center: [-72.7, 41.6], callout: [-68.15, 40.85] },
    { name: 'New Jersey', label: 'NJ', center: [-74.55, 40.15], callout: [-68.4, 39.85] },
    { name: 'Delaware', label: 'DE', center: [-75.5, 39.0], callout: [-68.55, 38.65] },
    { name: 'Maryland', label: 'MD', center: [-76.7, 39.05], callout: [-68.7, 37.55] },
    { name: 'District of Columbia', label: 'DC', center: [-77.02, 38.9], callout: [-68.9, 36.65] }
  ];

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
  var territoryEntered = false;
  var calloutMarkers = [];

  function markTerritoryEntered() {
    if (territoryEntered) return;
    var monitor = document.getElementById('home-territory-monitor');
    if (!monitor || !monitor.classList.contains('is-live')) return;
    territoryEntered = true;
    monitor.classList.add('is-entered');
    var section = document.querySelector('.home-coverage');
    if (section) section.setAttribute('data-territory-entered', '1');
  }

  function armTerritoryEntrance() {
    var section = document.querySelector('.home-coverage');
    var monitor = document.getElementById('home-territory-monitor');
    if (!section || !monitor) return;

    if (reduceMotion) {
      markTerritoryEntered();
      return;
    }

    function tryEnter() {
      if (!monitor.classList.contains('is-live')) return;
      markTerritoryEntered();
    }

    if (!('IntersectionObserver' in window)) {
      tryEnter();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        tryEnter();
        if (territoryEntered) observer.disconnect();
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

    observer.observe(section);
  }

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
    var max = Math.max(maxCount || 1, 1);
    var coveredExpr;
    if (max <= 1) {
      coveredExpr = COLOR_COVERED_MID;
    } else {
      var midStop = Math.max(2, Math.round(max * 0.45));
      coveredExpr = [
        'interpolate',
        ['linear'],
        ['get', 'count'],
        1, COLOR_COVERED_LOW,
        midStop, COLOR_COVERED_MID,
        max, COLOR_COVERED_HIGH
      ];
    }
    return [
      'case',
      ['==', ['get', 'leadsUnavailable'], 1],
      COLOR_UNAVAILABLE_BASE,
      ['boolean', ['get', 'hasData'], false],
      coveredExpr,
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
    // Extra right padding so NE callouts (RI/CT/DE…) stay on-canvas
    map.fitBounds(US_MAP_BOUNDS, { padding: { top: 14, bottom: 14, left: 12, right: 48 }, duration: 0 });
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

  function setSpotlightHidden(hidden) {
    var el = document.getElementById('home-territory-spotlight');
    if (el) el.hidden = !!hidden;
  }

  function renderSpotlight(stateName) {
    var root = document.getElementById('home-territory-spotlight');
    var titleEl = document.getElementById('home-spotlight-title');
    var metaEl = document.getElementById('home-spotlight-meta');
    var citiesEl = document.getElementById('home-spotlight-cities');
    var hintEl = document.getElementById('home-spotlight-hint');
    if (!root || !titleEl || !metaEl || !citiesEl || !hintEl || !coverage || !shared) return;

    var counts = shared.countByState(coverage);
    var status = shared.getStateStatus(stateName, counts, coverage);
    var cities = shared.stateCities(coverage, stateName, '');
    var portalN = cities.filter(function (c) { return c.pin_type === 'portal'; }).length;
    var liveN = cities.length - portalN;

    titleEl.textContent = stateName;
    metaEl.classList.remove('is-blocked');
    citiesEl.innerHTML = '';
    setSpotlightHidden(false);

    if (status === 'unavailable') {
      metaEl.textContent = 'Records unavailable — clerk systems block access';
      metaEl.classList.add('is-blocked');
      hintEl.textContent = 'We can\'t pull public records from this state yet.';
      return;
    }

    if (status === 'no-coverage' || cities.length === 0) {
      metaEl.textContent = 'Expanding — no cities listed yet';
      hintEl.textContent = 'Check back as new markets go live.';
      return;
    }

    var mix = [];
    if (portalN) mix.push(portalN + ' portal');
    if (liveN) mix.push(liveN + ' PDF');
    metaEl.textContent =
      cities.length + ' cit' + (cities.length === 1 ? 'y' : 'ies') + ' live' +
      (mix.length ? ' · ' + mix.join(' + ') : '');

    var sample = cities.slice();
    sample.sort(function (a, b) {
      if (a.pin_type === 'portal' && b.pin_type !== 'portal') return -1;
      if (b.pin_type === 'portal' && a.pin_type !== 'portal') return 1;
      return a.city.localeCompare(b.city);
    });
    sample.slice(0, 8).forEach(function (city) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'home-territory-spotlight-pill' +
        (city.pin_type === 'portal' ? ' home-territory-spotlight-pill--portal' : '');
      btn.textContent = city.city;
      btn.addEventListener('click', function () {
        onSelectCity(city);
      });
      citiesEl.appendChild(btn);
    });

    hintEl.textContent =
      cities.length > 8
        ? 'Click a city for full profile — or browse counties below.'
        : 'Click a city for its full profile.';
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
    renderSpotlight(stateName);
    showDockPanel('home-dock-state');
    document.getElementById('home-dock-back').hidden = false;
  }

  function renderSearchDock() {
    if (!coverage || !shared) return;
    var matches = shared.searchCities(coverage, searchQuery);
    var list = document.getElementById('home-dock-search-list');
    shared.renderSearchList(list, matches, onSelectCity, selectedCityId);
    updateDockHead('Search results', matches.length + ' matches');
    setSpotlightHidden(true);
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
    updateDockHead('Explore territory', 'Click a state or search a city, county, or state');
    setSpotlightHidden(true);
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

    mountSmallStateCallouts(map, counts, cov);

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

  function calloutFillForStatus(status) {
    if (status === 'covered') return COLOR_COVERED_HIGH;
    if (status === 'unavailable') return COLOR_UNAVAILABLE_BASE;
    return COLOR_NO_DATA;
  }

  function calloutStrokeForStatus(status) {
    if (status === 'unavailable') return COLOR_UNAVAILABLE_ACCENT;
    if (status === 'covered') return '#f5f2e4';
    return 'rgba(240, 235, 227, 0.55)';
  }

  function buildCalloutCollections(counts, cov) {
    var points = [];
    var lines = [];

    SMALL_STATE_CALLOUTS.forEach(function (item) {
      var status = shared.getStateStatus(item.name, counts, cov);
      var color = calloutFillForStatus(status);
      var stroke = calloutStrokeForStatus(status);

      points.push({
        type: 'Feature',
        properties: {
          name: item.name,
          label: item.label,
          status: status,
          color: color,
          stroke: stroke
        },
        geometry: {
          type: 'Point',
          coordinates: item.callout
        }
      });

      lines.push({
        type: 'Feature',
        properties: {
          name: item.name,
          status: status,
          color: color
        },
        geometry: {
          type: 'LineString',
          coordinates: [item.center, item.callout]
        }
      });
    });

    return {
      points: { type: 'FeatureCollection', features: points },
      lines: { type: 'FeatureCollection', features: lines }
    };
  }

  function clearCalloutMarkers() {
    calloutMarkers.forEach(function (marker) {
      try { marker.remove(); } catch (_) { /* noop */ }
    });
    calloutMarkers = [];
  }

  function mountSmallStateCallouts(map, counts, cov) {
    var collections = buildCalloutCollections(counts, cov);

    if (map.getSource('home-callout-lines')) {
      map.getSource('home-callout-lines').setData(collections.lines);
    } else {
      map.addSource('home-callout-lines', { type: 'geojson', data: collections.lines });
      map.addLayer({
        id: 'home-callout-lines',
        type: 'line',
        source: 'home-callout-lines',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.2,
          'line-opacity': 0.88
        }
      });
    }

    clearCalloutMarkers();

    collections.points.features.forEach(function (feature) {
      var props = feature.properties || {};
      var name = props.name;
      var el = document.createElement('button');
      el.type = 'button';
      el.className =
        'home-map-callout home-map-callout--' + (props.status || 'no-coverage');
      el.setAttribute('aria-label', 'Select ' + name);
      el.title = name;
      el.innerHTML =
        '<span class="home-map-callout-dot" aria-hidden="true"></span>' +
        '<span class="home-map-callout-label">' + escapeTickerHtml(props.label || '') + '</span>';

      el.addEventListener('click', function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
        selectState(name);
      });
      el.addEventListener('mouseenter', function () {
        hoveredState = name;
        updateLiftLayers();
      });
      el.addEventListener('mouseleave', function () {
        hoveredState = null;
        updateLiftLayers();
      });

      var marker = new maplibregl.Marker({
        element: el,
        anchor: 'left',
        offset: [0, 0]
      })
        .setLngLat(feature.geometry.coordinates)
        .addTo(map);

      calloutMarkers.push(marker);
    });
  }

  var STATE_ABBREV = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
    Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
    Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
    Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
    Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
    Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
    'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
    'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
    'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
    Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
    'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC'
  };

  function stateAbbrev(name) {
    if (!name) return '';
    if (name.length <= 2) return name.toUpperCase();
    return STATE_ABBREV[name] || name;
  }

  function escapeTickerHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pickTickerCities(cov) {
    var cities = (cov && cov.cities) || [];
    if (!cities.length) return [];

    var portals = [];
    var others = [];
    cities.forEach(function (c) {
      if (!c || !c.city) return;
      if (c.pin_type === 'portal') portals.push(c);
      else others.push(c);
    });

    var ordered = portals.concat(others);
    var perState = {};
    var picked = [];

    ordered.forEach(function (c) {
      if (picked.length >= 32) return;
      var st = c.state || '';
      perState[st] = perState[st] || 0;
      if (perState[st] >= 2) return;
      perState[st] += 1;
      picked.push(c);
    });

    if (picked.length < 8) {
      ordered.forEach(function (c) {
        if (picked.length >= 32) return;
        if (picked.indexOf(c) !== -1) return;
        picked.push(c);
      });
    }

    return picked;
  }

  function buildTerritoryTicker(cov) {
    var track = document.getElementById('home-territory-ticker-track');
    if (!track) return;

    var picked = pickTickerCities(cov);
    if (!picked.length) {
      track.classList.remove('is-marquee');
      track.innerHTML = '<p class="home-territory-ticker-empty">Territory loading…</p>';
      return;
    }

    function rowHtml(c) {
      var place = escapeTickerHtml(c.city) + ', ' + escapeTickerHtml(stateAbbrev(c.state));
      var isPortal = c.pin_type === 'portal';
      var tagClass = 'home-territory-ticker-tag' + (isPortal ? ' home-territory-ticker-tag--portal' : '');
      var tagLabel = isPortal ? 'Portal' : 'Live';
      return (
        '<div class="home-territory-ticker-row">' +
          '<span class="home-territory-ticker-place">' + place + '</span>' +
          '<span class="' + tagClass + '">' + tagLabel + '</span>' +
        '</div>'
      );
    }

    var html = picked.map(rowHtml).join('');
    var useMarquee = picked.length >= 4 && !reduceMotion;
    if (useMarquee) {
      html = html + html;
      track.classList.add('is-marquee');
    } else {
      track.classList.remove('is-marquee');
    }
    track.innerHTML = html;
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
    buildTerritoryTicker(cov);
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
      buildTerritoryTicker(coverage);
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
        armTerritoryEntrance();
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
      host.classList.remove('home-coverage-map--live');
      if (coverage) buildTerritoryTicker(coverage);
      await renderSvgFallback();
      document.getElementById('home-territory-monitor')?.classList.add('is-live');
      armTerritoryEntrance();
    }
  }

  window.PhugleeTerritoryTicker = {
    build: buildTerritoryTicker
  };

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