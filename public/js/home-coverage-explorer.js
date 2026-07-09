(function () {
  'use strict';

  var shared = window.PhugleeCoverageShared;

  var MAPLIBRE_CSS_URLS = [
    '/forge/static/vendor/maplibre-gl.css',
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
  ];
  var MAPLIBRE_JS_URLS = [
    '/forge/static/vendor/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
  ];

  var COLOR_COVERED_LOW = '#8a4a18';
  var COLOR_COVERED_MID = '#e58435';
  var COLOR_COVERED_HIGH = '#eeb746';
  var COLOR_NO_DATA = '#3a4658';
  var COLOR_UNAVAILABLE_BASE = '#8f2a2a';
  var COLOR_UNAVAILABLE_ACCENT = '#c84848';

  var US_MAP_BOUNDS = [[-124.6, 24.0], [-66.4, 49.6]];
  /*
   * Professional 2.5D plate lift (viewport px).
   * Light from top-left: lit face, status-tinted side wall, dual soft shadow, ground socket.
   * Height is animated (ease-out); base polygon is removed while raised.
   */
  var LIFT_HOVER = 6;
  var LIFT_SELECT = 10;
  var EXTRUDE_STEPS = 10;
  var LIFT_DURATION_MS = 150;
  var LIFT_EASE = function (t) {
    /* ease-out cubic — settles without bounce */
    return 1 - Math.pow(1 - t, 3);
  };
  /* Darker siblings of the heat / status palette for the extrusion wall */
  var SIDE_COVERED_LOW = '#3d2010';
  var SIDE_COVERED_MID = '#6b3514';
  var SIDE_COVERED_HIGH = '#8a4a18';
  var SIDE_NO_DATA = '#1a222c';
  var SIDE_UNAVAILABLE = '#4a1616';
  var FACE_COVERED_LOW = '#a35620';
  var FACE_COVERED_MID = '#f09245';
  var FACE_COVERED_HIGH = '#f5c45c';
  var FACE_NO_DATA = '#4a5668';
  var FACE_UNAVAILABLE = '#a03030';
  var liftAnim = {
    raised: '',
    from: 0,
    to: 0,
    current: 0,
    start: 0,
    raf: 0
  };

  /**
   * Tiny coastal states — callouts only when covered or blocked (skip gray "soon").
   * Positions are a vertical ladder in the Atlantic so labels never stack.
   */
  var SMALL_STATE_CALLOUTS = [
    { name: 'Rhode Island', label: 'Rhode Island', center: [-71.48, 41.68], callout: [-67.55, 43.55] },
    { name: 'Connecticut', label: 'Connecticut', center: [-72.72, 41.58], callout: [-67.55, 41.15] },
    { name: 'New Jersey', label: 'New Jersey', center: [-74.55, 40.15], callout: [-67.55, 39.55] },
    { name: 'Delaware', label: 'Delaware', center: [-75.52, 39.0], callout: [-67.55, 37.85] },
    { name: 'Maryland', label: 'Maryland', center: [-76.7, 39.05], callout: [-67.55, 36.15] },
    { name: 'District of Columbia', label: 'D.C.', center: [-77.02, 38.9], callout: [-67.55, 34.55] }
  ];

  var previewStarted = false;
  var previewMap = null;
  var coverage = null;
  var statesGeo = null;
  var currentState = null;
  var hoveredState = null;
  var expandedCountyByState = {};
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
      link.onerror = function () { reject(new Error('css failed: ' + href)); };
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
      script.onerror = function () { reject(new Error('script failed: ' + src)); };
      document.head.appendChild(script);
    });
  }

  async function loadFirstStylesheet(urls) {
    var lastErr = null;
    for (var i = 0; i < urls.length; i += 1) {
      try {
        await loadStylesheet(urls[i]);
        return urls[i];
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('stylesheet unavailable');
  }

  async function loadFirstScript(urls) {
    if (window.maplibregl) return 'cached';
    var lastErr = null;
    for (var i = 0; i < urls.length; i += 1) {
      try {
        await loadScript(urls[i]);
        if (window.maplibregl) return urls[i];
        lastErr = new Error('maplibregl missing after ' + urls[i]);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('script unavailable');
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

  /** Lit top face — slightly brighter than the flat choropleth. */
  function buildLiftFaceColor(maxCount) {
    var max = Math.max(maxCount || 1, 1);
    var coveredExpr;
    if (max <= 1) {
      coveredExpr = FACE_COVERED_MID;
    } else {
      var midStop = Math.max(2, Math.round(max * 0.45));
      coveredExpr = [
        'interpolate',
        ['linear'],
        ['get', 'count'],
        1, FACE_COVERED_LOW,
        midStop, FACE_COVERED_MID,
        max, FACE_COVERED_HIGH
      ];
    }
    return [
      'case',
      ['==', ['get', 'leadsUnavailable'], 1],
      FACE_UNAVAILABLE,
      ['boolean', ['get', 'hasData'], false],
      coveredExpr,
      FACE_NO_DATA
    ];
  }

  /** Extrusion wall — same heat ramp, darkened for side-of-volume shading. */
  function buildLiftSideColor(maxCount) {
    var max = Math.max(maxCount || 1, 1);
    var coveredExpr;
    if (max <= 1) {
      coveredExpr = SIDE_COVERED_MID;
    } else {
      var midStop = Math.max(2, Math.round(max * 0.45));
      coveredExpr = [
        'interpolate',
        ['linear'],
        ['get', 'count'],
        1, SIDE_COVERED_LOW,
        midStop, SIDE_COVERED_MID,
        max, SIDE_COVERED_HIGH
      ];
    }
    return [
      'case',
      ['==', ['get', 'leadsUnavailable'], 1],
      SIDE_UNAVAILABLE,
      ['boolean', ['get', 'hasData'], false],
      coveredExpr,
      SIDE_NO_DATA
    ];
  }

  function stateNameFilter(name) {
    return name ? ['==', ['get', 'name'], name] : ['==', ['get', 'name'], ''];
  }

  function zeroTranslate() {
    return [0, 0];
  }

  function targetLiftHeight(raised) {
    if (!raised || reduceMotion) return 0;
    if (currentState && raised === currentState) return LIFT_SELECT;
    return LIFT_HOVER;
  }

  function baseExcludeFilter(raised) {
    if (!raised) return null;
    return ['!=', ['get', 'name'], raised];
  }

  /**
   * Paint the extrusion stack at a continuous height (px).
   * h=0 clears lift layers but can still show a soft select glow when selected.
   */
  function applyLiftGeometry(raised, h) {
    if (!previewMap) return;
    var filter = stateNameFilter(raised);
    var empty = stateNameFilter('');
    var active = !!(raised && h > 0.15);
    var isSelect = !!(raised && currentState && raised === currentState);

    /* Ground socket — dark plate in the hole so the map doesn't flash empty */
    if (previewMap.getLayer('home-states-lift-socket')) {
      previewMap.setFilter('home-states-lift-socket', active || (raised && reduceMotion) ? filter : empty);
      previewMap.setPaintProperty(
        'home-states-lift-socket',
        'fill-opacity',
        active || (raised && reduceMotion) ? 0.92 : 0
      );
    }

    /* Dual shadow: soft ambient + tighter contact (never a hard outline) */
    if (previewMap.getLayer('home-states-lift-shadow-soft')) {
      previewMap.setFilter('home-states-lift-shadow-soft', active ? filter : empty);
      previewMap.setPaintProperty(
        'home-states-lift-shadow-soft',
        'fill-translate',
        active ? [h * 0.55, h * 1.05] : zeroTranslate()
      );
      previewMap.setPaintProperty(
        'home-states-lift-shadow-soft',
        'fill-opacity',
        active ? (isSelect ? 0.22 : 0.16) : 0
      );
    }
    if (previewMap.getLayer('home-states-lift-shadow-core')) {
      previewMap.setFilter('home-states-lift-shadow-core', active ? filter : empty);
      previewMap.setPaintProperty(
        'home-states-lift-shadow-core',
        'fill-translate',
        active ? [h * 0.28, h * 0.55] : zeroTranslate()
      );
      previewMap.setPaintProperty(
        'home-states-lift-shadow-core',
        'fill-opacity',
        active ? (isSelect ? 0.28 : 0.2) : 0
      );
    }

    /*
     * Side wall: dense steps from ground contact (slight SE) up to the face.
     * Light from NW → side faces SE (positive x/y relative to face).
     */
    var shear = h * 0.42;
    for (var i = 1; i <= EXTRUDE_STEPS; i += 1) {
      var id = 'home-states-extrude-' + i;
      if (!previewMap.getLayer(id)) continue;
      if (!active) {
        previewMap.setFilter(id, empty);
        continue;
      }
      var t = i / EXTRUDE_STEPS;
      var x = shear * (1 - t);
      var y = -h * t;
      previewMap.setFilter(id, filter);
      previewMap.setPaintProperty(id, 'fill-translate', [x, y]);
      /* Slight opacity ramp so micro-gaps never read as stripes */
      previewMap.setPaintProperty(id, 'fill-opacity', 0.94 + t * 0.06);
    }

    /* Lit top face */
    if (previewMap.getLayer('home-states-lift')) {
      previewMap.setFilter('home-states-lift', active || (raised && reduceMotion) ? filter : empty);
      previewMap.setPaintProperty(
        'home-states-lift',
        'fill-translate',
        active ? [0, -h] : zeroTranslate()
      );
      previewMap.setPaintProperty(
        'home-states-lift',
        'fill-opacity',
        raised ? 1 : 0
      );
    }

    /* Soft specular edge — only on the raised face, same translate */
    if (previewMap.getLayer('home-states-lift-edge')) {
      var showEdge = !!(raised && (active || reduceMotion));
      previewMap.setFilter('home-states-lift-edge', showEdge ? filter : empty);
      previewMap.setPaintProperty(
        'home-states-lift-edge',
        'line-translate',
        active ? [0, -h] : zeroTranslate()
      );
      previewMap.setPaintProperty(
        'home-states-lift-edge',
        'line-width',
        isSelect ? 1.05 : 0.75
      );
      previewMap.setPaintProperty(
        'home-states-lift-edge',
        'line-opacity',
        showEdge ? (isSelect ? 0.42 : 0.32) : 0
      );
    }

    /*
     * Hide flat copy only while the plate is actually elevated (or reduced-motion
     * face swap). When height settles to 0, restore the choropleth immediately.
     * Prefer always-true filter over null (safer across MapLibre builds).
     */
    var excludeName = (active || (raised && reduceMotion)) ? raised : '';
    var exclude = baseExcludeFilter(excludeName);
    var always = ['boolean', true];
    ['home-states-fill', 'home-states-hatch', 'home-states-line'].forEach(function (layerId) {
      if (!previewMap.getLayer(layerId)) return;
      try {
        if (exclude) {
          if (layerId === 'home-states-hatch') {
            previewMap.setFilter(layerId, [
              'all',
              ['==', ['get', 'leadsUnavailable'], 1],
              exclude
            ]);
          } else {
            previewMap.setFilter(layerId, exclude);
          }
        } else if (layerId === 'home-states-hatch') {
          previewMap.setFilter(layerId, ['==', ['get', 'leadsUnavailable'], 1]);
        } else {
          previewMap.setFilter(layerId, always);
        }
      } catch (_) { /* ignore paint race */ }
    });

    if (previewMap.getLayer('home-states-fill')) {
      if (currentState) {
        previewMap.setPaintProperty('home-states-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'leadsUnavailable'], 1], 0.48,
          ['boolean', ['get', 'hasData'], false], 0.32,
          0.18
        ]);
      } else {
        previewMap.setPaintProperty('home-states-fill', 'fill-opacity', buildStateFillOpacity());
      }
    }
  }

  function liftAnimTick(now) {
    if (!previewMap) {
      liftAnim.raf = 0;
      return;
    }
    var elapsed = now - liftAnim.start;
    var t = Math.min(1, elapsed / LIFT_DURATION_MS);
    var eased = LIFT_EASE(t);
    liftAnim.current = liftAnim.from + (liftAnim.to - liftAnim.from) * eased;
    applyLiftGeometry(liftAnim.raised, liftAnim.current);
    if (t < 1) {
      liftAnim.raf = requestAnimationFrame(liftAnimTick);
    } else {
      liftAnim.current = liftAnim.to;
      liftAnim.raf = 0;
      applyLiftGeometry(liftAnim.raised, liftAnim.current);
    }
  }

  function startLiftAnimation(raised, targetH) {
    if (liftAnim.raf) {
      cancelAnimationFrame(liftAnim.raf);
      liftAnim.raf = 0;
    }

    /* Switching states mid-air: snap geometry ownership, keep height continuity */
    if (raised !== liftAnim.raised && liftAnim.current > 0.15 && raised) {
      applyLiftGeometry(raised, liftAnim.current);
    }

    liftAnim.raised = raised || '';
    liftAnim.from = liftAnim.current;
    liftAnim.to = targetH;
    liftAnim.start = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    if (reduceMotion || Math.abs(liftAnim.to - liftAnim.from) < 0.2) {
      liftAnim.current = liftAnim.to;
      applyLiftGeometry(liftAnim.raised, liftAnim.current);
      return;
    }

    liftAnim.raf = requestAnimationFrame(liftAnimTick);
  }

  function updateLiftLayers() {
    if (!previewMap) return;
    var raised = hoveredState || currentState || '';
    var targetH = targetLiftHeight(raised);

    /* When clearing lift, keep raised name until height reaches 0 so filter stays valid */
    if (!raised && liftAnim.current > 0.15) {
      startLiftAnimation(liftAnim.raised, 0);
    } else if (!raised) {
      liftAnim.raised = '';
      liftAnim.current = 0;
      liftAnim.to = 0;
      applyLiftGeometry('', 0);
    } else {
      startLiftAnimation(raised, targetH);
    }

    updateHoverTip(hoveredState && hoveredState !== currentState ? hoveredState : null);
    syncStageClasses();
  }

  function syncStageClasses() {
    var screen = document.querySelector('.home-territory-screen--explorer');
    var monitor = document.getElementById('home-territory-monitor');
    if (screen) {
      screen.classList.toggle('has-state', !!currentState);
    }
    if (monitor) {
      monitor.classList.toggle('is-state-locked', !!currentState);
    }
  }

  function updateHoverTip(stateName) {
    var tip = document.getElementById('home-map-hover-tip');
    if (!tip) return;
    if (!stateName || !coverage || !shared) {
      tip.hidden = true;
      tip.setAttribute('aria-hidden', 'true');
      tip.textContent = '';
      return;
    }
    var counts = shared.countByState(coverage);
    var status = shared.getStateStatus(stateName, counts, coverage);
    var n = counts[stateName] || 0;
    var label = stateName;
    if (status === 'unavailable') label += ' · Blocked';
    else if (n > 0) label += ' · ' + n + ' cit' + (n === 1 ? 'y' : 'ies');
    else label += ' · Coming soon';
    tip.textContent = label;
    tip.hidden = false;
    tip.setAttribute('aria-hidden', 'false');
  }

  function lockMapView(map) {
    // Extra right padding so full-name NE callouts stay on-canvas
    map.fitBounds(US_MAP_BOUNDS, { padding: { top: 12, bottom: 12, left: 10, right: 72 }, duration: 0 });
    var zoom = map.getZoom();
    map.setMinZoom(zoom);
    map.setMaxZoom(zoom);
  }

  function setSpotlightHidden(hidden) {
    var el = document.getElementById('home-territory-spotlight');
    if (!el) return;
    el.hidden = !!hidden;
    el.classList.toggle('is-visible', !hidden);
    var screen = document.querySelector('.home-territory-screen--explorer');
    if (screen) screen.classList.toggle('has-dossier', !hidden);
  }

  function setComingSoonPanel(visible, stateName) {
    var panel = document.getElementById('home-spotlight-coming-soon');
    var title = document.getElementById('home-spotlight-coming-title');
    var copy = document.getElementById('home-spotlight-coming-copy');
    if (!panel) return;
    panel.hidden = !visible;
    if (!visible) return;
    if (title) {
      title.textContent = stateName
        ? stateName + ' is next on the board'
        : 'New market on deck';
    }
    if (copy) {
      copy.textContent =
        "We're lighting this territory up next — same pipeline as our live markets. " +
        "Watch the map; when it goes live, you'll want to be first in.";
    }
  }

  function setStatusStamp(status) {
    var el = document.getElementById('home-spotlight-status');
    if (!el) return;
    el.classList.remove('is-live', 'is-blocked', 'is-soon');
    if (status === 'unavailable') {
      el.textContent = 'Blocked';
      el.classList.add('is-blocked');
    } else if (status === 'no-coverage') {
      el.textContent = 'Coming soon';
      el.classList.add('is-soon');
    } else {
      el.textContent = 'Live';
      el.classList.add('is-live');
    }
  }

  function renderSpotlight(stateName) {
    var root = document.getElementById('home-territory-spotlight');
    var titleEl = document.getElementById('home-spotlight-title');
    var metaEl = document.getElementById('home-spotlight-meta');
    var citiesEl = document.getElementById('home-spotlight-cities');
    var listWrap = document.getElementById('home-spotlight-list-wrap');
    var hintEl = document.getElementById('home-spotlight-hint');
    if (!root || !titleEl || !metaEl || !citiesEl || !coverage || !shared) return;

    var counts = shared.countByState(coverage);
    var status = shared.getStateStatus(stateName, counts, coverage);
    var cities = shared.stateCities(coverage, stateName, '');
    titleEl.textContent = stateName;
    metaEl.classList.remove('is-blocked');
    root.classList.remove('is-blocked', 'is-empty', 'is-coming-soon');
    citiesEl.innerHTML = '';
    if (listWrap) listWrap.hidden = true;
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
    setComingSoonPanel(false);
    setStatusStamp(status === 'covered' ? 'covered' : status);
    setSpotlightHidden(false);

    if (status === 'unavailable') {
      root.classList.add('is-blocked');
      metaEl.textContent = 'Records unavailable — clerk systems block access.';
      metaEl.classList.add('is-blocked');
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = "We can't pull public records from this state yet.";
      }
      return;
    }

    if (status === 'no-coverage' || cities.length === 0) {
      root.classList.add('is-empty', 'is-coming-soon');
      setStatusStamp('no-coverage');
      metaEl.textContent = 'Territory queued for expansion';
      setComingSoonPanel(true, stateName);
      return;
    }

    var groups = shared.groupCitiesByCounty
      ? shared.groupCitiesByCounty(cities)
      : [{ county: 'Markets', cities: cities }];
    var countyN = groups.length;
    metaEl.textContent =
      countyN + ' count' + (countyN === 1 ? 'y' : 'ies') + ' · ' +
      cities.length + ' cit' + (cities.length === 1 ? 'y' : 'ies');

    var openCounty = expandedCountyByState[stateName] || '';

    groups.forEach(function (group) {
      var countyName = group.county || 'Unknown County';
      var isOpen = openCounty === countyName;
      var block = document.createElement('div');
      block.className = 'home-territory-county' + (isOpen ? ' is-open' : '');
      block.setAttribute('role', 'listitem');

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'home-territory-county-toggle';
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      var displayCounty = countyName.replace(/\s+County$/i, '');
      if (!displayCounty || displayCounty === 'Unknown') displayCounty = countyName;
      toggle.innerHTML =
        '<span class="home-territory-county-chevron" aria-hidden="true"></span>' +
        '<span class="home-territory-county-name">' + escapeTickerHtml(displayCounty) + '</span>' +
        '<span class="home-territory-county-count">' + group.cities.length + '</span>';
      toggle.addEventListener('click', function () {
        if (expandedCountyByState[stateName] === countyName) {
          expandedCountyByState[stateName] = '';
        } else {
          expandedCountyByState[stateName] = countyName;
        }
        renderSpotlight(stateName);
      });

      var cityList = document.createElement('div');
      cityList.className = 'home-territory-county-cities';
      cityList.hidden = !isOpen;

      if (isOpen) {
        group.cities.forEach(function (city) {
          var row = document.createElement('div');
          row.className = 'home-territory-city-row home-territory-city-row--static';
          row.innerHTML =
            '<span class="home-territory-city-row-pip is-live" aria-hidden="true"></span>' +
            '<span class="home-territory-city-row-main">' +
              '<span class="home-territory-city-row-name">' + escapeTickerHtml(city.city) + '</span>' +
            '</span>';
          cityList.appendChild(row);
        });
      }

      block.appendChild(toggle);
      block.appendChild(cityList);
      citiesEl.appendChild(block);
    });

    if (listWrap) listWrap.hidden = false;
  }

  function selectState(stateName) {
    currentState = stateName;
    renderSpotlight(stateName);
    updateLiftLayers();
  }

  function resetState() {
    currentState = null;
    setSpotlightHidden(true);
    updateLiftLayers();
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
      id: 'home-states-line',
      type: 'line',
      source: 'home-states',
      paint: { 'line-color': 'rgba(240, 235, 227, 0.14)', 'line-width': 0.7 }
    });

    var faceColor = buildLiftFaceColor(maxCount);
    var sideColor = buildLiftSideColor(maxCount);

    /*
     * Stack order (bottom → top):
     * socket → soft shadow → core shadow → side slices → lit face → specular edge
     */
    map.addLayer({
      id: 'home-states-lift-socket',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': '#05080e',
        'fill-opacity': 0,
        'fill-translate-anchor': 'viewport'
      }
    });

    map.addLayer({
      id: 'home-states-lift-shadow-soft',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0,
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'viewport'
      }
    });

    map.addLayer({
      id: 'home-states-lift-shadow-core',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0,
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'viewport'
      }
    });

    for (var step = 1; step <= EXTRUDE_STEPS; step += 1) {
      map.addLayer({
        id: 'home-states-extrude-' + step,
        type: 'fill',
        source: 'home-states',
        filter: stateNameFilter(''),
        paint: {
          'fill-color': sideColor,
          'fill-opacity': 0,
          'fill-translate': [0, 0],
          'fill-translate-anchor': 'viewport'
        }
      });
    }

    map.addLayer({
      id: 'home-states-lift',
      type: 'fill',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'fill-color': faceColor,
        'fill-opacity': 0,
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'viewport'
      }
    });

    map.addLayer({
      id: 'home-states-lift-edge',
      type: 'line',
      source: 'home-states',
      filter: stateNameFilter(''),
      paint: {
        'line-color': 'rgba(255, 248, 230, 0.55)',
        'line-width': 0.75,
        'line-opacity': 0,
        'line-blur': 0.15,
        'line-translate': [0, 0],
        'line-translate-anchor': 'viewport'
      }
    });

    mountSmallStateCallouts(map, counts, cov);

    function hitStateName(point) {
      var layers = ['home-states-lift', 'home-states-fill'];
      for (var s = EXTRUDE_STEPS; s >= 1; s -= 1) {
        layers.push('home-states-extrude-' + s);
      }
      var features = map.queryRenderedFeatures(point, { layers: layers });
      if (!features || !features.length) return null;
      return features[0].properties.name || null;
    }

    map.on('mousemove', function (e) {
      var name = hitStateName(e.point);
      map.getCanvas().style.cursor = name ? 'pointer' : '';
      if (hoveredState !== name) {
        hoveredState = name;
        updateLiftLayers();
      }
    });

    map.on('mouseout', function () {
      map.getCanvas().style.cursor = '';
      if (hoveredState) {
        hoveredState = null;
        updateLiftLayers();
      }
    });

    map.on('click', function (e) {
      var name = hitStateName(e.point);
      if (!name) return;
      selectState(name);
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
      // Only pull out states that matter: live heat or blocked red — not gray clutter
      if (status !== 'covered' && status !== 'unavailable') return;

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
      return (
        '<div class="home-territory-ticker-row">' +
          '<span class="home-territory-ticker-place">' + place + '</span>' +
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
      '<strong>' + shared.formatCount(cov.total_states) + ' states</strong> — click a state for its dossier';
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
      await Promise.all([
        loadFirstStylesheet(MAPLIBRE_CSS_URLS),
        loadFirstScript(MAPLIBRE_JS_URLS)
      ]);
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
        try {
          mountStateLayers(previewMap, statesGeo, coverage);
          document.getElementById('home-territory-monitor')?.classList.add('is-live');
          previewMap.resize();
          lockMapView(previewMap);
          armTerritoryEntrance();
        } catch (mountErr) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[territory] mount failed', mountErr);
          }
        }
      });

      previewMap.on('error', function (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[territory] map error', e && e.error ? e.error : e);
        }
      });

      previewMap.on('resize', function () {
        lockMapView(previewMap);
      });

      document.getElementById('home-spotlight-close')?.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        resetState();
      });

      resetState();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[territory] init failed', err);
      }
      host.classList.remove('home-coverage-map--loading');
      host.classList.remove('home-coverage-map--live');
      if (coverage) buildTerritoryTicker(coverage);
      try {
        await renderSvgFallback();
      } catch (fallbackErr) {
        host.innerHTML =
          '<p class="home-map-error">Map unavailable — refresh in a moment.</p>' +
          '<button type="button" class="home-map-retry" id="home-map-retry">Retry map</button>';
        var retry = document.getElementById('home-map-retry');
        if (retry) {
          retry.addEventListener('click', function () {
            previewStarted = false;
            initExplorer();
          });
        }
      }
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