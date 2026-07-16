(function () {
  'use strict';

  var COVERAGE_URL = '/forge/api/coverage';
  var STATES_GEO_URL = '/forge/static/geo/us-states.geojson';

  var LEADS_UNAVAILABLE = new Set([
    'Alabama',
    'Arkansas',
    'Delaware',
    'Kentucky',
    'South Carolina',
    'Virginia'
  ]);

  var EXCLUDED_FROM_MAP = new Set(['Alaska', 'Hawaii']);

  var COLOR_COVERED_LOW = '#8a4a18';
  var COLOR_COVERED_MID = '#e58435';
  var COLOR_COVERED_HIGH = '#eeb746';
  var COLOR_NO_DATA = '#3a4658';
  var COLOR_UNAVAILABLE = '#8f2a2a';

  /** Tiny NE states — only covered/blocked get callouts; spaced vertical ladder */
  var SMALL_STATE_CALLOUTS = [
    { name: 'Rhode Island', label: 'Rhode Island', center: [-71.48, 41.68], callout: [-67.55, 43.55] },
    { name: 'Connecticut', label: 'Connecticut', center: [-72.72, 41.58], callout: [-67.55, 41.15] },
    { name: 'New Jersey', label: 'New Jersey', center: [-74.55, 40.15], callout: [-67.55, 39.55] },
    { name: 'Delaware', label: 'Delaware', center: [-75.52, 39.0], callout: [-67.55, 37.85] },
    { name: 'Maryland', label: 'Maryland', center: [-76.7, 39.05], callout: [-67.55, 36.15] },
    { name: 'District of Columbia', label: 'D.C.', center: [-77.02, 38.9], callout: [-67.55, 34.55] }
  ];

  var MAP_BOUNDS = {
    minLng: -124.6,
    maxLng: -66.4,
    minLat: 24.0,
    maxLat: 49.6
  };

  var coverageCache = null;
  var statesGeoCache = null;
  var mapRenderedHosts = new Set();
  var homeSelectedState = null;
  var homeMapObserver = null;

  function formatCount(n) {
    return Number(n).toLocaleString('en-US');
  }

  function lerpHex(lowHex, highHex, t) {
    function parse(hex) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
      ];
    }
    var a = parse(lowHex);
    var b = parse(highHex);
    var mix = function (i) {
      return Math.round(a[i] + (b[i] - a[i]) * t);
    };
    var r = mix(0);
    var g = mix(1);
    var bl = mix(2);
    return (
      '#' +
      r.toString(16).padStart(2, '0') +
      g.toString(16).padStart(2, '0') +
      bl.toString(16).padStart(2, '0')
    );
  }

  function stateFillColor(count, maxCount) {
    if (!count) return COLOR_NO_DATA;
    if (maxCount <= 1) return COLOR_COVERED_MID;
    var t = Math.min(Math.max(count / Math.max(maxCount, 1), 0), 1);
    t = Math.max(t, 0.2);
    if (t <= 0.45) {
      return lerpHex(COLOR_COVERED_LOW, COLOR_COVERED_MID, t / 0.45);
    }
    return lerpHex(COLOR_COVERED_MID, COLOR_COVERED_HIGH, (t - 0.45) / 0.55);
  }

  function countByState(coverage) {
    var map = {};
    (coverage.states || []).forEach(function (s) {
      map[s.name] = s.count;
    });
    return map;
  }

  function getStateStatus(name, counts) {
    if (LEADS_UNAVAILABLE.has(name)) return 'unavailable';
    if ((counts[name] || 0) > 0) return 'covered';
    return 'no-coverage';
  }

  async function fetchCoverage() {
    if (coverageCache) return coverageCache;
    var res = await fetch(COVERAGE_URL, { cache: 'no-store' });
    if (!res.ok) {
      res = await fetch('/data/coverage-map-bootstrap.json', { cache: 'default' });
      if (!res.ok) throw new Error('coverage unavailable');
    }
    coverageCache = await res.json();
    if (coverageCache.unavailable_states) {
      LEADS_UNAVAILABLE.clear();
      coverageCache.unavailable_states.forEach(function (s) {
        LEADS_UNAVAILABLE.add(s);
      });
    }
    return coverageCache;
  }

  async function fetchStatesGeo() {
    if (statesGeoCache) return statesGeoCache;
    var res = await fetch(STATES_GEO_URL, { cache: 'default' });
    if (!res.ok) throw new Error('states geo unavailable');
    statesGeoCache = await res.json();
    return statesGeoCache;
  }

  function project(lng, lat, width, height) {
    var x =
      ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * width;
    var y =
      ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * height;
    return [x, y];
  }

  function ringToPath(ring, width, height) {
    if (!ring || !ring.length) return '';
    var parts = [];
    ring.forEach(function (coord, i) {
      var pt = project(coord[0], coord[1], width, height);
      parts.push((i === 0 ? 'M' : 'L') + pt[0].toFixed(2) + ' ' + pt[1].toFixed(2));
    });
    parts.push('Z');
    return parts.join(' ');
  }

  function featureToPath(feature, width, height) {
    var geom = feature.geometry;
    if (!geom) return '';
    if (geom.type === 'Polygon') {
      return geom.coordinates.map(function (ring) {
        return ringToPath(ring, width, height);
      }).join(' ');
    }
    if (geom.type === 'MultiPolygon') {
      return geom.coordinates.map(function (poly) {
        return poly.map(function (ring) {
          return ringToPath(ring, width, height);
        }).join(' ');
      }).join(' ');
    }
    return '';
  }

  function computeMapStats(coverage, statesGeo) {
    var counts = countByState(coverage);
    var covered = 0;
    var unavailable = 0;
    var notYet = 0;

    (statesGeo.features || []).forEach(function (f) {
      var name = f.properties && f.properties.name;
      if (!name || EXCLUDED_FROM_MAP.has(name)) return;
      var status = getStateStatus(name, counts);
      if (status === 'covered') covered += 1;
      else if (status === 'unavailable') unavailable += 1;
      else notYet += 1;
    });

    return {
      cities: coverage.total_cities || 0,
      states: coverage.total_states || 0,
      coveredStates: covered,
      unavailableStates: unavailable,
      notYetStates: notYet
    };
  }

  function cityCountLabel(coverage) {
    var cities = coverage.total_cities;
    if (typeof cities === 'number' && cities > 0) {
      return formatCount(cities);
    }
    return '500+';
  }

  function stateCountLabel(coverage) {
    var states = coverage.total_states;
    if (typeof states === 'number' && states > 0) {
      return formatCount(states);
    }
    return '10';
  }

  function updateCoverageStats(coverage) {
    var cityLabel = cityCountLabel(coverage);
    var stateLabel = stateCountLabel(coverage);

    [
      ['home-city-count', cityLabel],
      ['home-state-count', stateLabel],
      ['home-chip-cities', cityLabel],
      ['home-chip-states', stateLabel],
      ['hub-city-count', cityLabel],
      ['collect-city-count', cityLabel],
      ['collect-city-count-label', cityLabel],
      ['collect-state-count', stateLabel],
      ['command-city-count', cityLabel],
      ['command-state-count', stateLabel]
    ].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.textContent = pair[1];
    });

    document.querySelectorAll('[data-coverage-city-count]').forEach(function (el) {
      el.textContent = cityLabel;
    });
  }

  function updateMapSummary(summaryId, stats) {
    var el = document.getElementById(summaryId);
    if (!el) return;
    el.innerHTML =
      '<strong>' + formatCount(stats.cities) + ' cities</strong> across ' +
      '<strong>' + formatCount(stats.states) + ' states</strong> · ' +
      stats.notYetStates + ' states not yet · ' +
      stats.unavailableStates + ' states we can\'t pull data from';
  }

  function citiesForState(coverage, stateName) {
    return (coverage.cities || [])
      .filter(function (c) {
        return c.state === stateName;
      })
      .sort(function (a, b) {
        return a.city.localeCompare(b.city, 'en', { sensitivity: 'base' });
      });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderStateCityPanel(stateName, coverage, counts) {
    var panel = document.getElementById('home-state-cities');
    if (!panel) return;

    var status = getStateStatus(stateName, counts);
    var cities = citiesForState(coverage, stateName);
    var count = cities.length || counts[stateName] || 0;

    if (status === 'unavailable') {
      panel.innerHTML =
        '<div class="home-state-panel-head">' +
          '<h3 class="home-state-panel-title" id="home-state-panel-title">' + escapeHtml(stateName) + '</h3>' +
          '<p class="home-state-panel-meta">Records unavailable in this state</p>' +
        '</div>' +
        '<p class="home-state-panel-message">We can\'t pull public records from ' +
        escapeHtml(stateName) + ' yet — clerk systems block automated access.</p>';
      return;
    }

    if (status === 'no-coverage' || count === 0) {
      panel.innerHTML =
        '<div class="home-state-panel-head">' +
          '<h3 class="home-state-panel-title" id="home-state-panel-title">' + escapeHtml(stateName) + '</h3>' +
          '<p class="home-state-panel-meta">No cities listed yet</p>' +
        '</div>' +
        '<p class="home-state-panel-message">We\'re expanding into ' + escapeHtml(stateName) +
        '. Check back as new markets go live.</p>';
      return;
    }

    var cityItems = cities.map(function (city) {
      var badgeClass = city.pin_type === 'portal'
        ? 'home-state-city-badge--portal'
        : 'home-state-city-badge--completed';
      var badgeLabel = city.pin_type === 'portal' ? 'Portal' : 'Live';
      return (
        '<li class="home-state-city-item">' +
          '<span class="home-state-city-name">' + escapeHtml(city.city) + '</span>' +
          '<span class="home-state-city-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
        '</li>'
      );
    }).join('');

    panel.innerHTML =
      '<div class="home-state-panel-head">' +
        '<h3 class="home-state-panel-title" id="home-state-panel-title">' + escapeHtml(stateName) + '</h3>' +
        '<p class="home-state-panel-meta"><strong>' + formatCount(count) + '</strong> ' +
        (count === 1 ? 'city' : 'cities') + ' listed</p>' +
      '</div>' +
      '<ul class="home-state-city-list" role="list">' + cityItems + '</ul>';
  }

  function setHomeSelectedState(stateName, coverage, counts, svg, prefix) {
    homeSelectedState = stateName;
    if (!svg) return;

    svg.querySelectorAll('.' + prefix + '-map-state-group').forEach(function (group) {
      var isSelected = group.getAttribute('data-state') === stateName;
      group.classList.toggle(prefix + '-map-state-group--selected', isSelected);
      var path = group.querySelector('.' + prefix + '-map-state');
      if (path) {
        path.classList.toggle(prefix + '-map-state--selected', isSelected);
        group.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }
    });

    renderStateCityPanel(stateName, coverage, counts);
  }

  function appendSvgSmallStateCallouts(svg, prefix, width, height, counts, options) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var layer = document.createElementNS(svgNS, 'g');
    layer.setAttribute('class', prefix + '-map-callouts');

    SMALL_STATE_CALLOUTS.forEach(function (item) {
      var status = getStateStatus(item.name, counts);
      if (status !== 'covered' && status !== 'unavailable') return;

      var fill =
        status === 'covered'
          ? COLOR_COVERED_HIGH
          : COLOR_UNAVAILABLE;
      var c0 = project(item.center[0], item.center[1], width, height);
      var c1 = project(item.callout[0], item.callout[1], width, height);

      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', c0[0].toFixed(1));
      line.setAttribute('y1', c0[1].toFixed(1));
      line.setAttribute('x2', c1[0].toFixed(1));
      line.setAttribute('y2', c1[1].toFixed(1));
      line.setAttribute('stroke', fill);
      line.setAttribute('stroke-width', '1.2');
      line.setAttribute('stroke-opacity', '0.85');
      line.setAttribute('pointer-events', 'none');
      layer.appendChild(line);

      var g = document.createElementNS(svgNS, 'g');
      g.setAttribute('class', prefix + '-map-callout');
      g.setAttribute('data-state', item.name);
      g.setAttribute('transform', 'translate(' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ')');

      if (options && options.interactive) {
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', item.name + ' — view coverage');
        g.style.cursor = 'pointer';
      }

      var hit = document.createElementNS(svgNS, 'circle');
      hit.setAttribute('r', '14');
      hit.setAttribute('fill', '#000');
      hit.setAttribute('fill-opacity', '0.01');
      g.appendChild(hit);

      var dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('r', '5.5');
      dot.setAttribute('fill', fill);
      dot.setAttribute('stroke', status === 'unavailable' ? '#c84848' : '#f5f2e4');
      dot.setAttribute('stroke-width', '1.4');
      g.appendChild(dot);

      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', '10');
      label.setAttribute('y', '4');
      label.setAttribute('fill', '#f5f2e4');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-family', 'system-ui, sans-serif');
      label.textContent = item.label;
      g.appendChild(label);

      layer.appendChild(g);
    });

    svg.appendChild(layer);
  }

  function attachSvgCalloutHandlers(svg, prefix, coverage, counts) {
    svg.querySelectorAll('.' + prefix + '-map-callout').forEach(function (node) {
      var stateName = node.getAttribute('data-state');
      if (!stateName) return;
      function activate() {
        setHomeSelectedState(stateName, coverage, counts, svg, prefix);
      }
      node.addEventListener('click', activate);
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  function attachInteractiveStateHandlers(svg, prefix, coverage, counts) {
    var groups = svg.querySelectorAll('.' + prefix + '-map-state-group');
    groups.forEach(function (group) {
      var stateName = group.getAttribute('data-state');
      if (!stateName) return;

      group.classList.add(prefix + '-map-state-group--interactive');
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', stateName + ' — view listed cities');
      group.setAttribute('aria-pressed', 'false');

      function selectState() {
        setHomeSelectedState(stateName, coverage, counts, svg, prefix);
      }

      group.addEventListener('click', selectState);
      group.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectState();
        }
      });
    });
  }

  async function renderCoverageMap(hostId, summaryId, prefix, options) {
    options = options || {};
    var host = document.getElementById(hostId);
    if (!host || mapRenderedHosts.has(hostId)) return;

    host.innerHTML = '<p class="' + prefix + '-map-loading">Loading map…</p>';

    try {
      var coverage = await fetchCoverage();
      var statesGeo = await fetchStatesGeo();
      var counts = countByState(coverage);
      var maxCount = coverage.max_count || 1;
      var stats = computeMapStats(coverage, statesGeo);
      if (summaryId) updateMapSummary(summaryId, stats);

      var width = 560;
      var height = 340;
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('class', prefix + '-map-svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'United States coverage map');

      var defs = document.createElementNS(svgNS, 'defs');
      var pattern = document.createElementNS(svgNS, 'pattern');
      pattern.setAttribute('id', prefix + '-unavailable-hatch');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '6');
      pattern.setAttribute('height', '6');
      pattern.setAttribute('patternTransform', 'rotate(45)');
      var patternLine = document.createElementNS(svgNS, 'line');
      patternLine.setAttribute('x1', '0');
      patternLine.setAttribute('y1', '0');
      patternLine.setAttribute('x2', '0');
      patternLine.setAttribute('y2', '6');
      patternLine.setAttribute('stroke', '#c84848');
      patternLine.setAttribute('stroke-width', '2');
      pattern.appendChild(patternLine);
      defs.appendChild(pattern);
      svg.appendChild(defs);

      var group = document.createElementNS(svgNS, 'g');
      group.setAttribute('class', prefix + '-map-states');

      (statesGeo.features || []).forEach(function (feature) {
        var name = feature.properties && feature.properties.name;
        if (!name || EXCLUDED_FROM_MAP.has(name)) return;

        var status = getStateStatus(name, counts);
        var stateGroup = document.createElementNS(svgNS, 'g');
        stateGroup.setAttribute('class', prefix + '-map-state-group');
        stateGroup.setAttribute('data-state', name);

        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', featureToPath(feature, width, height));
        path.setAttribute('class', prefix + '-map-state ' + prefix + '-map-state--' + status);

        if (status === 'covered') {
          path.setAttribute('fill', stateFillColor(counts[name], maxCount));
        } else if (status === 'unavailable') {
          path.setAttribute('fill', COLOR_UNAVAILABLE);
          path.setAttribute('fill-opacity', '0.92');
        } else {
          path.setAttribute('fill', COLOR_NO_DATA);
        }

        stateGroup.appendChild(path);

        if (status === 'unavailable') {
          var hatch = document.createElementNS(svgNS, 'path');
          hatch.setAttribute('d', path.getAttribute('d'));
          hatch.setAttribute('fill', 'url(#' + prefix + '-unavailable-hatch)');
          hatch.setAttribute('fill-opacity', '0.55');
          hatch.setAttribute('pointer-events', 'none');
          stateGroup.appendChild(hatch);
        }

        group.appendChild(stateGroup);
      });

      svg.appendChild(group);
      appendSvgSmallStateCallouts(svg, prefix, width, height, counts, options);
      host.innerHTML = '';
      host.appendChild(svg);
      mapRenderedHosts.add(hostId);

      if (options.interactive) {
        attachInteractiveStateHandlers(svg, prefix, coverage, counts);
        attachSvgCalloutHandlers(svg, prefix, coverage, counts);
        if (homeSelectedState) {
          setHomeSelectedState(homeSelectedState, coverage, counts, svg, prefix);
        }
      }
    } catch (_) {
      mapRenderedHosts.delete(hostId);
      host.innerHTML =
        '<div class="' + prefix + '-map-error-wrap">' +
          '<p class="' + prefix + '-map-error">Territory feed hitch — map couldn\'t load.</p>' +
          '<button type="button" class="' + prefix + '-map-retry" data-map-retry="' + hostId + '">Retry map</button>' +
        '</div>';
      var btn = host.querySelector('[data-map-retry]');
      if (btn) {
        btn.addEventListener('click', function () {
          mapRenderedHosts.delete(hostId);
          renderCoverageMap(hostId, summaryId, prefix, options);
        });
      }
    }
  }

  function renderGuideMap() {
    return renderCoverageMap('guide-coverage-map', 'guide-map-summary', 'guide');
  }

  function renderHubMap() {
    return renderCoverageMap('hub-coverage-map', 'hub-map-summary', 'hub');
  }

  function renderHomeMap() {
    return renderCoverageMap('home-coverage-map', 'home-map-summary', 'home', { interactive: true });
  }

  function observeHomeMap() {
    var section = document.querySelector('.home-coverage');
    var host = document.getElementById('home-coverage-map');
    if (!section || !host || mapRenderedHosts.has('home-coverage-map')) return;

    if (!('IntersectionObserver' in window)) {
      renderHomeMap();
      return;
    }

    if (homeMapObserver) {
      homeMapObserver.disconnect();
    }

    homeMapObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        renderHomeMap();
        homeMapObserver.disconnect();
        homeMapObserver = null;
      });
    }, { rootMargin: '120px 0px', threshold: 0.08 });

    homeMapObserver.observe(section);
  }

  function initCoverage() {
    var needsStats =
      document.getElementById('home-city-count') ||
      document.getElementById('hub-city-count') ||
      document.getElementById('collect-city-count') ||
      document.getElementById('command-city-count') ||
      document.querySelector('[data-coverage-city-count]');

    if (needsStats) {
      fetchCoverage()
        .then(updateCoverageStats)
        .catch(function () {
          updateCoverageStats({ total_cities: 0, total_states: 0 });
        });
    }

    if (document.getElementById('hub-coverage-map')) {
      renderHubMap();
    }

    if (document.getElementById('home-map-summary') && document.body.hasAttribute('data-home-map-preview')) {
      Promise.all([fetchCoverage(), fetchStatesGeo()])
        .then(function (pair) {
          var stats = computeMapStats(pair[0], pair[1]);
          updateMapSummary('home-map-summary', stats);
          updateCoverageStats(pair[0]);
        })
        .catch(function (err) {
          var el = document.getElementById('home-map-summary');
          if (el) {
            el.textContent =
              'Coverage map unavailable' + (err && err.message ? ' — ' + err.message : '');
          }
        });
    }

    var homeMapHost = document.getElementById('home-coverage-map');
    if (homeMapHost) {
      if (document.body.hasAttribute('data-home-map-preview')) {
        // MapLibre explorer owns the primary path; SVG safety net if it never paints.
        // Phone list mode skips the map entirely — do not fall back to SVG.
        window.setTimeout(function () {
          if (window.matchMedia('(max-width: 768px)').matches) return;
          if (document.body.classList.contains('home-territory-list-mode')) return;
          var host = document.getElementById('home-coverage-map');
          if (!host) return;
          var painted =
            host.querySelector('svg') ||
            host.querySelector('canvas') ||
            host.classList.contains('home-coverage-map--live');
          if (painted) return;
          mapRenderedHosts.delete('home-coverage-map');
          renderHomeMap();
        }, 4500);
      } else {
        observeHomeMap();
      }
    }
  }

  window.PhugleeCoverage = {
    fetch: fetchCoverage,
    updateHomeStats: updateCoverageStats,
    updateCoverageStats: updateCoverageStats,
    renderGuideMap: renderGuideMap,
    renderHubMap: renderHubMap,
    renderHomeMap: renderHomeMap,
    refreshGuideMap: function () {
      mapRenderedHosts.delete('guide-coverage-map');
      return renderGuideMap();
    },
    refreshHubMap: function () {
      mapRenderedHosts.delete('hub-coverage-map');
      return renderHubMap();
    },
    refreshHomeMap: function () {
      mapRenderedHosts.delete('home-coverage-map');
      return renderHomeMap();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoverage);
  } else {
    initCoverage();
  }
})();