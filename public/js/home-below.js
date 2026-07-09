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

  /**
   * Competition-side "?" tiles:
   * - Exactly one hero reveal at a time (dim siblings, scale active)
   * - Auto-stagger flips when section is visible
   * - "Full story" expands a glass panel over the stage
   */
  function activateUnknownFlipCards() {
    var cards = Array.prototype.slice.call(
      document.querySelectorAll('[data-unknown-flip]')
    );
    if (!cards.length) return;

    var grid =
      document.querySelector('[data-unknown-flip-grid]') ||
      cards[0].closest('.home-edge-unknown-grid');
    var stage =
      document.querySelector('[data-unknown-stage]') ||
      cards[0].closest('.home-edge-unknown-visual');
    var storyPanel = document.querySelector('[data-unknown-story]');
    var storyKicker = document.querySelector('[data-unknown-story-kicker]');
    var storyTitle = document.querySelector('[data-unknown-story-title]');
    var storyBody = document.querySelector('[data-unknown-story-body]');
    var storyClose = document.querySelector('[data-unknown-story-close]');

    var BACK_HOLD_MS = 3800;
    var GAP_MIN_MS = 700;
    var GAP_MAX_MS = 1400;
    var START_DELAY_MS = 1000;
    var reducedMotion = false;
    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      reducedMotion = false;
    }

    var sectionVisible = false;
    var activeCard = null;
    var lastCard = null;
    var storyOpen = false;
    var flipBackTimer = null;
    var nextFlipTimer = null;
    var lastFocus = null;

    function randBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function clearFlipBackTimer() {
      if (flipBackTimer != null) {
        clearTimeout(flipBackTimer);
        flipBackTimer = null;
      }
    }

    function clearNextFlipTimer() {
      if (nextFlipTimer != null) {
        clearTimeout(nextFlipTimer);
        nextFlipTimer = null;
      }
    }

    function decodeEntities(str) {
      if (!str) return '';
      var ta = document.createElement('textarea');
      ta.innerHTML = str;
      return ta.value;
    }

    function syncHeroState(card) {
      cards.forEach(function (c) {
        c.classList.toggle('is-hero', c === card);
      });
      if (grid) {
        grid.classList.toggle('has-hero', !!card);
      }
    }

    function setFlipped(card, flipped) {
      card.classList.toggle('is-flipped', flipped);
      card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      if (flipped) {
        /* Restart gold-flash animation on each reveal */
        var back = card.querySelector('.home-edge-unknown-tile-face--back');
        if (back) {
          back.classList.remove('is-flashing');
          void back.offsetWidth;
          back.classList.add('is-flashing');
        }
      }
    }

    function pickRandomCard(exclude) {
      var pool = cards.filter(function (c) {
        return c !== exclude;
      });
      if (!pool.length) pool = cards.slice();
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function canAutoRun() {
      return sectionVisible && !document.hidden && !storyOpen;
    }

    function closeStory(resumeAutos) {
      if (!storyPanel) return;
      storyOpen = false;
      storyPanel.classList.remove('is-open');
      storyPanel.setAttribute('hidden', '');
      if (lastFocus && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus(); } catch (err) { /* ignore */ }
      }
      lastFocus = null;
      if (resumeAutos && canAutoRun()) {
        if (activeCard) {
          scheduleFlipBack(activeCard);
        } else {
          scheduleNextFlip(lastCard);
        }
      }
    }

    function openStory(card) {
      if (!storyPanel || !card) return;
      clearFlipBackTimer();
      clearNextFlipTimer();
      storyOpen = true;
      lastFocus = document.activeElement;

      if (storyKicker) {
        storyKicker.textContent = decodeEntities(card.getAttribute('data-story-kicker') || '');
      }
      if (storyTitle) {
        storyTitle.textContent = decodeEntities(card.getAttribute('data-story-title') || '');
      }
      if (storyBody) {
        storyBody.textContent = decodeEntities(card.getAttribute('data-story-body') || '');
      }

      storyPanel.removeAttribute('hidden');
      /* force reflow so open transition plays */
      void storyPanel.offsetWidth;
      storyPanel.classList.add('is-open');
      if (storyClose) storyClose.focus();
    }

    function scheduleNextFlip(preferExclude) {
      clearNextFlipTimer();
      if (!canAutoRun() || activeCard) return;

      var delay = reducedMotion
        ? randBetween(1100, 1800)
        : randBetween(GAP_MIN_MS, GAP_MAX_MS);

      nextFlipTimer = setTimeout(function () {
        nextFlipTimer = null;
        if (!canAutoRun() || activeCard) return;
        openCard(pickRandomCard(preferExclude || lastCard), false);
      }, delay);
    }

    function scheduleFlipBack(card) {
      clearFlipBackTimer();
      if (storyOpen) return;
      var hold = reducedMotion
        ? 3000
        : BACK_HOLD_MS + randBetween(-400, 600);

      flipBackTimer = setTimeout(function () {
        flipBackTimer = null;
        if (activeCard !== card || storyOpen) return;
        closeCard(card, true);
      }, hold);
    }

    function openCard(card, fromUser) {
      if (!card || storyOpen) return;

      if (activeCard && activeCard !== card) {
        clearFlipBackTimer();
        setFlipped(activeCard, false);
        lastCard = activeCard;
        activeCard = null;
      }

      clearNextFlipTimer();

      if (activeCard === card) {
        if (fromUser) scheduleFlipBack(card);
        return;
      }

      activeCard = card;
      lastCard = card;
      setFlipped(card, true);
      syncHeroState(card);
      scheduleFlipBack(card);
    }

    function closeCard(card, chainNext) {
      if (!card) return;
      clearFlipBackTimer();
      if (activeCard === card) activeCard = null;
      setFlipped(card, false);
      syncHeroState(null);
      lastCard = card;
      if (chainNext && canAutoRun()) {
        scheduleNextFlip(card);
      }
    }

    function stopAutos() {
      clearNextFlipTimer();
      clearFlipBackTimer();
    }

    function startAutos() {
      if (!canAutoRun()) return;
      if (activeCard) {
        scheduleFlipBack(activeCard);
        return;
      }
      clearNextFlipTimer();
      nextFlipTimer = setTimeout(function () {
        nextFlipTimer = null;
        if (!canAutoRun() || activeCard) return;
        openCard(pickRandomCard(lastCard), false);
      }, reducedMotion ? 1400 : START_DELAY_MS);
    }

    cards.forEach(function (card) {
      card.addEventListener('click', function (event) {
        var expand = event.target.closest('[data-unknown-expand]');
        if (expand) {
          event.preventDefault();
          event.stopPropagation();
          if (!card.classList.contains('is-flipped')) {
            openCard(card, true);
          }
          openStory(card);
          return;
        }

        if (card.classList.contains('is-flipped')) {
          closeCard(card, true);
        } else {
          openCard(card, true);
        }
      });
    });

    if (storyClose) {
      storyClose.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeStory(true);
      });
    }

    if (storyPanel) {
      storyPanel.addEventListener('click', function (event) {
        /* Clicks on panel body shouldn't bubble to stage */
        event.stopPropagation();
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && storyOpen) {
        closeStory(true);
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopAutos();
        return;
      }
      if (sectionVisible && !storyOpen) startAutos();
    });

    var root = stage || grid || cards[0];

    if (!('IntersectionObserver' in window)) {
      sectionVisible = true;
      startAutos();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          sectionVisible = entry.isIntersecting;
          if (sectionVisible) {
            startAutos();
          } else {
            stopAutos();
            if (storyOpen) closeStory(false);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -6% 0px' }
    );

    observer.observe(root);
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
    activateUnknownFlipCards();
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