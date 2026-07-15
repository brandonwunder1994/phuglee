/**
 * Mobile territory browser: state → city list (no map ≤768).
 * Desktop keeps MapLibre / SVG via home-coverage-explorer.
 */
(function () {
  'use strict';

  var MQ = '(max-width: 768px)';
  var started = false;
  var coverage = null;
  var openState = '';

  function isPhone() {
    return window.matchMedia(MQ).matches;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function citiesForState(stateName, query) {
    var shared = window.PhugleeCoverageShared;
    if (shared && coverage) {
      return shared.stateCities(coverage, stateName, query || '');
    }
    var q = String(query || '').trim().toLowerCase();
    return (coverage.cities || [])
      .filter(function (c) {
        if (c.state !== stateName) return false;
        if (!q) return true;
        return (c.city + ' ' + (c.county || '')).toLowerCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) {
        return a.city.localeCompare(b.city);
      });
  }

  function blockedStates() {
    var list =
      (coverage && coverage.unavailable_states) ||
      (window.PhugleeCoverageShared &&
        Array.from(window.PhugleeCoverageShared.LEADS_UNAVAILABLE || [])) ||
      [];
    return list.slice().sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function liveStates() {
    return (coverage.states || [])
      .filter(function (s) {
        return (s.count || 0) > 0;
      })
      .sort(function (a, b) {
        return (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name);
      });
  }

  function stateMatchesQuery(stateName, cities, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    if (stateName.toLowerCase().indexOf(q) !== -1) return true;
    return cities.some(function (c) {
      return (
        c.city.toLowerCase().indexOf(q) !== -1 ||
        String(c.county || '')
          .toLowerCase()
          .indexOf(q) !== -1
      );
    });
  }

  function cityRowHtml(city) {
    var isPortal = city.pin_type === 'portal';
    var type = isPortal ? 'Portal' : 'FOIA';
    var county = city.county && city.county !== 'Unknown County' ? city.county : '';
    return (
      '<li class="home-dir-city">' +
      '<span class="home-dir-city-pip' +
      (isPortal ? ' is-portal' : ' is-live') +
      '" aria-hidden="true"></span>' +
      '<span class="home-dir-city-main">' +
      '<span class="home-dir-city-name">' +
      escapeHtml(city.city) +
      '</span>' +
      (county
        ? '<span class="home-dir-city-county">' + escapeHtml(county) + '</span>'
        : '') +
      '</span>' +
      '<span class="home-dir-city-type">' +
      type +
      '</span>' +
      '</li>'
    );
  }

  function render(query) {
    var root = document.getElementById('home-coverage-directory');
    if (!root || !coverage) return;

    var q = String(query || '').trim();
    var live = liveStates().filter(function (s) {
      return stateMatchesQuery(s.name, citiesForState(s.name, ''), q);
    });
    var blocked = blockedStates().filter(function (name) {
      if (!q) return true;
      return name.toLowerCase().indexOf(q.toLowerCase()) !== -1;
    });

    var liveHtml = live
      .map(function (s) {
        var cities = citiesForState(s.name, q);
        var isOpen = openState === s.name;
        var cityHtml = isOpen
          ? cities.length
            ? '<ul class="home-dir-cities" role="list">' +
              cities.map(cityRowHtml).join('') +
              '</ul>'
            : '<p class="home-dir-empty">No cities match.</p>'
          : '';
        return (
          '<li class="home-dir-state' +
          (isOpen ? ' is-open' : '') +
          '">' +
          '<button type="button" class="home-dir-state-btn" data-state="' +
          escapeHtml(s.name) +
          '" aria-expanded="' +
          (isOpen ? 'true' : 'false') +
          '">' +
          '<span class="home-dir-state-name">' +
          escapeHtml(s.name) +
          '</span>' +
          '<span class="home-dir-state-count">' +
          formatCount(s.count) +
          ' cities</span>' +
          '<span class="home-dir-state-chevron" aria-hidden="true"></span>' +
          '</button>' +
          cityHtml +
          '</li>'
        );
      })
      .join('');

    var blockedHtml = blocked
      .map(function (name) {
        return (
          '<li class="home-dir-state home-dir-state--blocked">' +
          '<div class="home-dir-state-static">' +
          '<span class="home-dir-state-name">' +
          escapeHtml(name) +
          '</span>' +
          '<span class="home-dir-state-badge">Blocked</span>' +
          '</div>' +
          '</li>'
        );
      })
      .join('');

    var searchValue = escapeHtml(q);
    root.innerHTML =
      '<div class="home-dir-toolbar">' +
      '<label class="home-dir-search-label">' +
      '<span class="visually-hidden">Search markets</span>' +
      '<input type="search" class="home-dir-search" id="home-dir-search" placeholder="Search state or city…" value="' +
      searchValue +
      '" autocomplete="off" enterkeyhint="search">' +
      '</label>' +
      '</div>' +
      '<div class="home-dir-body">' +
      '<p class="home-dir-kicker">Live markets</p>' +
      (liveHtml
        ? '<ul class="home-dir-states" id="home-dir-live">' + liveHtml + '</ul>'
        : '<p class="home-dir-empty">No live markets match.</p>') +
      (blockedHtml
        ? '<p class="home-dir-kicker">Records blocked</p>' +
          '<ul class="home-dir-states home-dir-states--blocked" id="home-dir-blocked">' +
          blockedHtml +
          '</ul>'
        : '') +
      '</div>' +
      '<p class="home-dir-footnote">Full US map on larger screens</p>';

    var input = document.getElementById('home-dir-search');
    if (input) {
      input.addEventListener('input', function () {
        render(input.value);
        var next = document.getElementById('home-dir-search');
        if (next) {
          next.focus();
          try {
            var len = next.value.length;
            next.setSelectionRange(len, len);
          } catch (_) {}
        }
      });
    }

    root.querySelectorAll('.home-dir-state-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-state') || '';
        openState = openState === name ? '' : name;
        render(document.getElementById('home-dir-search')?.value || '');
      });
    });
  }

  function updateHud(cov) {
    var cities = document.getElementById('home-chip-cities');
    var states = document.getElementById('home-chip-states');
    var summary = document.getElementById('home-map-summary');
    if (cities) cities.textContent = formatCount(cov.total_cities);
    if (states) states.textContent = formatCount(cov.total_states);
    if (summary) {
      summary.textContent =
        formatCount(cov.total_cities) +
        ' cities across ' +
        formatCount(cov.total_states) +
        ' states — tap a state to see markets.';
    }
  }

  async function loadAndRender() {
    var root = document.getElementById('home-coverage-directory');
    if (!root) return;

    root.innerHTML = '<p class="home-dir-loading">Loading markets…</p>';
    root.hidden = false;

    try {
      var shared = window.PhugleeCoverageShared;
      if (shared && shared.fetchCoverageMap) {
        coverage = await shared.fetchCoverageMap();
      } else if (window.PhugleeCoverage && window.PhugleeCoverage.fetch) {
        coverage = await window.PhugleeCoverage.fetch();
      } else {
        var res = await fetch('/data/coverage-map-bootstrap.json', { cache: 'default' });
        if (!res.ok) throw new Error('coverage unavailable');
        coverage = await res.json();
      }
      updateHud(coverage);
      if (window.PhugleeTerritoryTicker && window.PhugleeTerritoryTicker.build) {
        window.PhugleeTerritoryTicker.build(coverage);
      }
      document.getElementById('home-territory-monitor')?.classList.add('is-live');
      render('');
    } catch (err) {
      root.innerHTML =
        '<p class="home-dir-error">Markets unavailable — refresh in a moment.</p>' +
        '<button type="button" class="home-dir-retry" id="home-dir-retry">Retry</button>';
      document.getElementById('home-dir-retry')?.addEventListener('click', function () {
        started = false;
        initDirectory();
      });
    }
  }

  function initDirectory() {
    if (!isPhone()) return;
    if (started) return;
    started = true;
    document.body.classList.add('home-territory-list-mode');
    loadAndRender();
  }

  function observeDirectory() {
    if (!document.body.hasAttribute('data-home-map-preview')) return;
    if (!document.getElementById('home-coverage-directory')) return;

    if (!isPhone()) {
      document.body.classList.remove('home-territory-list-mode');
      return;
    }

    var section = document.querySelector('.home-coverage');
    if (!section) {
      initDirectory();
      return;
    }

    if (!('IntersectionObserver' in window)) {
      initDirectory();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          initDirectory();
          observer.disconnect();
        });
      },
      { rootMargin: '160px 0px', threshold: 0.05 }
    );
    observer.observe(section);
  }

  window.addEventListener('resize', function () {
    if (isPhone()) {
      document.body.classList.add('home-territory-list-mode');
      if (!started) observeDirectory();
    } else {
      document.body.classList.remove('home-territory-list-mode');
    }
  });

  window.PhugleeHomeCoverageDirectory = {
    init: initDirectory,
    isPhone: isPhone
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeDirectory);
  } else {
    observeDirectory();
  }
})();
