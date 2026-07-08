(function () {
  'use strict';

  function syncTerritoryChips() {
    var city = document.getElementById('home-city-count');
    var state = document.getElementById('home-state-count');
    var chipCities = document.getElementById('home-chip-cities');
    var chipStates = document.getElementById('home-chip-states');
    if (city && chipCities) chipCities.textContent = city.textContent;
    if (state && chipStates) chipStates.textContent = state.textContent;
  }

  function observeStatSync() {
    var city = document.getElementById('home-city-count');
    var state = document.getElementById('home-state-count');
    if (!city && !state) return;

    syncTerritoryChips();

    if (!('MutationObserver' in window)) return;

    var observer = new MutationObserver(syncTerritoryChips);
    if (city) observer.observe(city, { childList: true, characterData: true, subtree: true });
    if (state) observer.observe(state, { childList: true, characterData: true, subtree: true });
  }

  function activateMonitors() {
    var monitors = document.querySelectorAll('[data-home-monitor]');
    if (!monitors.length) return;

    if (!('IntersectionObserver' in window)) {
      monitors.forEach(function (el) { el.classList.add('is-scanning'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-scanning', entry.isIntersecting);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    monitors.forEach(function (el) { observer.observe(el); });
  }

  function activateSignalFeed() {
    var feeds = document.querySelectorAll('[data-home-signal-feed]');
    if (!feeds.length) return;

    if (!('IntersectionObserver' in window)) {
      feeds.forEach(function (el) { el.classList.add('is-scrolling'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-scrolling', entry.isIntersecting);
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });

    feeds.forEach(function (el) { observer.observe(el); });
  }

  function activateEdgeGap() {
    var edgeGap = document.querySelector('[data-home-edge-gap]');
    if (!edgeGap) return;

    if (!('IntersectionObserver' in window)) {
      edgeGap.classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    observer.observe(edgeGap);
  }

  function initScrollHint() {
    var hint = document.getElementById('home-scroll-hint');
    var target = document.querySelector('.home-below-hero');
    if (!hint || !target) return;

    hint.addEventListener('click', function () {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        hint.classList.toggle('is-hidden', entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });

    observer.observe(target);
  }

  function init() {
    observeStatSync();
    activateEdgeGap();
    activateSignalFeed();
    activateMonitors();
    initScrollHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PhugleeHomeBelow = { syncTerritoryChips: syncTerritoryChips };
})();