(function () {
  'use strict';

  var MAPLIBRE_CSS = '/forge/static/vendor/maplibre-gl.css';
  var MAPLIBRE_JS = '/forge/static/vendor/maplibre-gl.js';
  var STATES_GEO_URL = '/forge/static/geo/us-states.geojson';

  var COLOR_COVERED_LOW = '#8a4a18';
  var COLOR_COVERED_MID = '#e58435';
  var COLOR_COVERED_HIGH = '#eeb746';
  var COLOR_NO_DATA = '#3a4658';
  var COLOR_UNAVAILABLE_BASE = '#8f2a2a';
  var COLOR_UNAVAILABLE_ACCENT = '#c84848';

  var US_HOME_CENTER = [-96.2, 38.8];
  var US_HOME_ZOOM = 3.4;

  var LEADS_UNAVAILABLE = new Set([
    'Alabama',
    'Arkansas',
    'Delaware',
    'Kentucky',
    'South Carolina',
    'Tennessee',
    'Virginia'
  ]);

  var previewStarted = false;
  var previewMap = null;

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

  function showTooltip(text, x, y) {
    var tip = document.getElementById('home-map-tooltip');
    if (!tip) return;
    if (!text) {
      tip.hidden = true;
      tip.textContent = '';
      return;
    }
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function mountStateLayers(map, statesGeo, coverage) {
    var counts = countByState(coverage);
    var maxCount = coverage.max_count || 1;

    statesGeo.features.forEach(function (feature) {
      var name = feature.properties.name;
      var count = counts[name] || 0;
      feature.properties.count = count;
      feature.properties.hasData = count > 0;
      feature.properties.leadsUnavailable = isLeadsUnavailable(name, coverage) ? 1 : 0;
    });

    map.addSource('home-states', { type: 'geojson', data: statesGeo });

    map.addLayer({
      id: 'home-states-fill',
      type: 'fill',
      source: 'home-states',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'leadsUnavailable'], 1],
          COLOR_UNAVAILABLE_BASE,
          ['boolean', ['get', 'hasData'], false],
          maxCount <= 1
            ? COLOR_COVERED_MID
            : [
                'interpolate',
                ['linear'],
                ['get', 'count'],
                1,
                COLOR_COVERED_LOW,
                Math.max(2, Math.round(maxCount * 0.45)),
                COLOR_COVERED_MID,
                maxCount,
                COLOR_COVERED_HIGH
              ],
          COLOR_NO_DATA
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'leadsUnavailable'], 1],
          1,
          ['boolean', ['get', 'hasData'], false],
          1,
          0.72
        ]
      }
    });

    if (ensureHatchPattern(map)) {
      map.addLayer({
        id: 'home-states-hatch',
        type: 'fill',
        source: 'home-states',
        filter: ['==', ['get', 'leadsUnavailable'], 1],
        paint: {
          'fill-pattern': 'home-unavailable-hatch',
          'fill-opacity': 1
        }
      });
    }

    map.addLayer({
      id: 'home-states-line',
      type: 'line',
      source: 'home-states',
      paint: {
        'line-color': 'rgba(240, 235, 227, 0.18)',
        'line-width': 0.8
      }
    });

    map.addLayer({
      id: 'home-states-hover',
      type: 'line',
      source: 'home-states',
      paint: { 'line-color': '#eeb746', 'line-width': 2 },
      filter: ['==', ['get', 'name'], '']
    });

    var frame = document.querySelector('.home-territory-screen') || document.querySelector('.home-coverage-map-frame');

    map.on('mousemove', 'home-states-fill', function (e) {
      if (!e.features || !e.features.length) return;
      var props = e.features[0].properties;
      var name = props.name;
      var unavailable = Number(props.leadsUnavailable) === 1;
      var count = Number(props.count) || 0;
      var label;

      if (unavailable) {
        label = name + ' — records unavailable';
        map.getCanvas().style.cursor = 'not-allowed';
      } else if (count > 0) {
        label = name + ' — ' + count + (count === 1 ? ' city' : ' cities') + ' live';
        map.getCanvas().style.cursor = 'default';
      } else {
        label = name + ' — expanding soon';
        map.getCanvas().style.cursor = 'default';
      }

      map.setFilter('home-states-hover', ['==', ['get', 'name'], name]);

      if (frame) {
        showTooltip(label, e.point.x, e.point.y - 12);
      }
    });

    map.on('mouseleave', 'home-states-fill', function () {
      map.getCanvas().style.cursor = '';
      map.setFilter('home-states-hover', ['==', ['get', 'name'], '']);
      showTooltip('');
    });
  }

  function renderSvgFallback() {
    if (window.PhugleeCoverage && window.PhugleeCoverage.refreshHomeMap) {
      return window.PhugleeCoverage.refreshHomeMap();
    }
    if (window.PhugleeCoverage && window.PhugleeCoverage.renderHomeMap) {
      return window.PhugleeCoverage.renderHomeMap();
    }
    var host = document.getElementById('home-coverage-map');
    if (host) host.innerHTML = '<p class="home-map-error">Map preview unavailable.</p>';
  }

  async function initPreviewMap() {
    if (previewStarted) return;
    previewStarted = true;

    var host = document.getElementById('home-coverage-map');
    if (!host) return;

    host.innerHTML = '<p class="home-map-loading">Loading map…</p>';
    host.classList.add('home-coverage-map--loading');

    try {
      await Promise.all([loadStylesheet(MAPLIBRE_CSS), loadScript(MAPLIBRE_JS)]);

      if (!window.maplibregl) {
        throw new Error('maplibre missing');
      }

      var coverage;
      if (window.PhugleeCoverage && window.PhugleeCoverage.fetch) {
        coverage = await window.PhugleeCoverage.fetch();
      } else {
        var covRes = await fetch('/forge/api/coverage', { cache: 'no-store' });
        if (!covRes.ok) throw new Error('coverage failed');
        coverage = await covRes.json();
      }

      if (window.PhugleeCoverage && window.PhugleeCoverage.updateCoverageStats) {
        window.PhugleeCoverage.updateCoverageStats(coverage);
      }

      var geoRes = await fetch(STATES_GEO_URL, { cache: 'default' });
      if (!geoRes.ok) throw new Error('geo failed');
      var statesGeo = await geoRes.json();

      host.innerHTML = '';
      host.classList.remove('home-coverage-map--loading');
      host.classList.add('home-coverage-map--live');

      previewMap = new maplibregl.Map({
        container: host,
        style: buildDarkStyle(),
        center: US_HOME_CENTER,
        zoom: US_HOME_ZOOM,
        minZoom: 2.8,
        maxZoom: 5,
        attributionControl: false,
        fadeDuration: 0,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        boxZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false
      });

      previewMap.on('load', function () {
        mountStateLayers(previewMap, statesGeo, coverage);
        host.setAttribute('role', 'img');
        host.setAttribute('aria-label', 'United States coverage map preview');
        var monitor = document.getElementById('home-territory-monitor');
        if (monitor) monitor.classList.add('is-live');
        previewMap.resize();
      });
    } catch (_) {
      host.classList.remove('home-coverage-map--loading');
      try {
        await renderSvgFallback();
      } catch (__) {
        host.innerHTML = '<p class="home-map-error">Map unavailable — check back shortly.</p>';
      }
    }
  }

  function observePreview() {
    if (!document.body.hasAttribute('data-home-map-preview')) return;

    var section = document.querySelector('.home-coverage');
    var host = document.getElementById('home-coverage-map');
    if (!section || !host) return;

    if (!('IntersectionObserver' in window)) {
      initPreviewMap();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        initPreviewMap();
        observer.disconnect();
      });
    }, { rootMargin: '160px 0px', threshold: 0.05 });

    observer.observe(section);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePreview);
  } else {
    observePreview();
  }

  window.PhugleeHomeMapPreview = { init: initPreviewMap };
})();