/**
 * Phuglee — Horizontal property carousel (display only)
 * Non-overlapping cards, even spacing, smooth auto-advance.
 * Vanilla JS — fits Phuglee marketing stack.
 */
(function () {
  'use strict';

  /**
   * Real analyzer deals (admin session). Images are exact Google Street View
   * frames from property_imagery/streetview (copied to /images/carousel/).
   * Street line is rendered but blurred for lead protection; city/state stay clear.
   */
  var PROPERTIES = [
    {
      id: '71bd150f3bd20843',
      street: '418 N Howell St',
      city: 'Rocky Mount',
      state: 'NC',
      image: '/images/carousel/sv-71bd150f3bd20843.jpg',
      alt: 'Google Street View — severe fire and structural damage, Rocky Mount, NC',
      score: 9,
      tags: ['Fire Damage', 'Structural'],
      reason: 'Fire damage, structural fail, and a compromised roof from the curb.',
      featured: true
    },
    {
      id: '3ecb8b7fb8c182ba',
      street: '1002 Waverly Dr',
      city: 'Midland',
      state: 'TX',
      image: '/images/carousel/sv-3ecb8b7fb8c182ba.jpg',
      alt: 'Google Street View — boarded vacant home, Midland, TX',
      score: 9,
      tags: ['Boarded', 'Code Violations'],
      reason: 'Boarded doors and windows with clear vacancy signals.'
    },
    {
      id: '26f935284524cfdc',
      street: '1318 Cherry St',
      city: 'Abilene',
      state: 'TX',
      image: '/images/carousel/sv-26f935284524cfdc.jpg',
      alt: 'Google Street View — boarded windows and yard junk, Abilene, TX',
      score: 8,
      tags: ['Boarded', 'Code Violations'],
      reason: 'Boarded windows and a junk-filled yard on Street View.'
    },
    {
      id: '8723a1d3c1dd720d',
      street: '1013 Sheridan Ave Nw',
      city: 'Palm Bay',
      state: 'FL',
      image: '/images/carousel/sv-8723a1d3c1dd720d.jpg',
      alt: 'Google Street View — boarded windows, junk, and abandoned vehicle, Palm Bay, FL',
      score: 8,
      tags: ['Boarded', 'Abandoned Vehicles'],
      reason: 'Boarded, overgrown lot, and an abandoned vehicle.'
    },
    {
      id: 'fdb11a2a3011c809',
      street: '36378 W Apache Dr',
      city: 'Stanfield',
      state: 'AZ',
      image: '/images/carousel/sv-fdb11a2a3011c809.jpg',
      alt: 'Google Street View — overgrown yard with abandoned vehicles, Stanfield, AZ',
      score: 8,
      tags: ['Abandoned Vehicles', 'Code Violations'],
      reason: 'Yard junk and abandoned vehicles you can see before you dial.'
    },
    /* Additional top-distress pulls from analyzer session (score 8–9) */
    {
      id: 'e5d5388f41d2a13c',
      street: '1621 S Church St',
      city: 'Rocky Mount',
      state: 'NC',
      image: '/images/carousel/sv-e5d5388f41d2a13c.jpg',
      alt: 'Google Street View — severe fire damage and broken windows, Rocky Mount, NC',
      score: 9,
      tags: ['Fire Damage', 'Structural', 'Broken Windows'],
      reason: 'Severe fire damage and broken windows from the curb.'
    },
    {
      id: 'c4c0a262269ffb74',
      street: '414 24Th Ave S',
      city: 'Saint Petersburg',
      state: 'FL',
      image: '/images/carousel/sv-c4c0a262269ffb74.jpg',
      alt: 'Google Street View — fire or water total loss with debris, Saint Petersburg, FL',
      score: 9,
      tags: ['Fire Damage', 'Yard Junk', 'Overgrown'],
      reason: 'Total-loss look — debris and overgrowth still on Street View.'
    },
    {
      id: '5dce789754eb6d7c',
      street: '5608 Easton St',
      city: 'Holly Springs',
      state: 'NC',
      image: '/images/carousel/sv-5dce789754eb6d7c.jpg',
      alt: 'Google Street View — fire-damaged home with damaged roof, Holly Springs, NC',
      score: 9,
      tags: ['Fire Damage', 'Roof Damage'],
      reason: 'Fire damage with a compromised roof — high urgency.'
    },
    {
      id: '341ed43f7d087923',
      street: '1218 Cypress St',
      city: 'Abilene',
      state: 'TX',
      image: '/images/carousel/sv-341ed43f7d087923.jpg',
      alt: 'Google Street View — boarded windows, yard junk, abandoned vehicles, Abilene, TX',
      score: 8,
      tags: ['Boarded', 'Yard Junk', 'Abandoned Vehicles'],
      reason: 'Boarded windows, yard junk, and abandoned vehicles.'
    },
    {
      id: '68f054dd03721862',
      street: '918 Lake Ave',
      city: 'Griffin',
      state: 'GA',
      image: '/images/carousel/sv-68f054dd03721862.jpg',
      alt: 'Google Street View — overgrown lot, roof damage, abandoned vehicle, Griffin, GA',
      score: 8,
      tags: ['Overgrown', 'Roof Damage', 'Abandoned Vehicles'],
      reason: 'Overgrown lot, damaged roof, abandoned vehicle in the yard.'
    }
  ];

  /** px per frame at ~60fps — continuous horizontal scroll */
  var AUTO_SPEED = 0.9;
  var GAP = 16;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Street blurred for lead protection; city/state always fully readable.
   * Stacked (not one ellipsized line) so long streets never clip city/state.
   */
  function addressHtml(prop) {
    var street = prop.street || '';
    return (
      '<strong class="p3d-address">' +
        (street
          ? '<span class="p3d-street" aria-hidden="true">' + street + '</span>'
          : '') +
        '<span class="p3d-city-state">' + prop.city + ', ' + prop.state + '</span>' +
      '</strong>'
    );
  }

  function createCard(prop, index, clone) {
    var card = document.createElement('article');
    card.className = 'p3d-card p3d-card--deal' + (clone ? ' p3d-card--clone' : '');
    card.setAttribute('data-p3d-index', String(index));
    if (clone) card.setAttribute('aria-hidden', 'true');
    var score = prop.score != null ? prop.score : '';
    card.setAttribute(
      'aria-label',
      'Distressed property in ' + prop.city + ', ' + prop.state +
        (score !== '' ? '. Heat score ' + score + '.' : '.') +
        ' Street address obscured.'
    );
    var tags = (prop.tags || []).slice(0, 2);
    card.innerHTML =
      '<div class="p3d-card-photo">' +
        '<img src="' + prop.image + '" alt="' + prop.alt.replace(/"/g, '&quot;') + '" width="480" height="270" loading="' + (index === 0 && !clone ? 'eager' : 'lazy') + '" decoding="async" draggable="false">' +
        '<span class="p3d-card-photo-scrim" aria-hidden="true"></span>' +
        (score !== ''
          ? '<span class="p3d-card-score" aria-hidden="true">' +
              '<span class="p3d-card-score-n">' + score + '</span>' +
              '<span class="p3d-card-score-l">Heat</span>' +
            '</span>'
          : '') +
      '</div>' +
      '<div class="p3d-card-body">' +
        '<div class="p3d-card-loc">' +
          addressHtml(prop) +
        '</div>' +
        '<div class="p3d-card-tags">' +
          tags.map(function (t) {
            return '<span class="p3d-tag">' + t + '</span>';
          }).join('') +
        '</div>' +
        '<p class="p3d-reason">' + (prop.reason || '') + '</p>' +
      '</div>';
    return card;
  }

  function initCarousel(root) {
    if (!root || root.getAttribute('data-p3d-ready') === '1') return;

    var stage = root.querySelector('[data-p3d-stage]');
    var track = root.querySelector('[data-p3d-track]');
    if (!stage || !track) return;

    root.setAttribute('data-p3d-ready', '1');
    root.classList.add('p3d-carousel--flat');

    // Clear static SSR placeholder so we don't double-render the first card
    var staticCards = track.querySelectorAll('[data-p3d-static], .p3d-card--static');
    staticCards.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    track.innerHTML = '';

    var count = PROPERTIES.length;
    // Original set + one clone set for seamless infinite loop
    var cards = [];
    PROPERTIES.forEach(function (prop, i) {
      var el = createCard(prop, i, false);
      track.appendChild(el);
      cards.push(el);
    });
    PROPERTIES.forEach(function (prop, i) {
      var el = createCard(prop, i, true);
      track.appendChild(el);
      cards.push(el);
    });

    var offset = 0;
    var reduced = prefersReducedMotion();
    var rafId = 0;
    var visible = true;
    var cardW = 280;
    var setWidth = 0;

    function measure() {
      var stageW = stage.clientWidth || 320;
      // One primary card with a clean peek of the next — never stacked/overlapping
      if (stageW < 340) {
        cardW = Math.max(220, stageW - 8);
      } else if (stageW < 480) {
        cardW = Math.min(300, stageW * 0.88);
      } else {
        cardW = Math.min(320, stageW * 0.82);
      }

      cards.forEach(function (card) {
        card.style.width = cardW + 'px';
        card.style.flex = '0 0 ' + cardW + 'px';
        card.style.transform = '';
        card.style.opacity = '1';
        card.style.zIndex = '';
        card.style.filter = '';
        card.classList.remove('is-front');
        card.removeAttribute('aria-hidden');
        if (card.classList.contains('p3d-card--clone')) {
          card.setAttribute('aria-hidden', 'true');
        }
      });

      setWidth = count * (cardW + GAP);
      track.style.gap = GAP + 'px';
      layout();
    }

    function layout() {
      // Wrap offset into one set length for seamless loop
      if (setWidth > 0) {
        while (offset >= setWidth) offset -= setWidth;
        while (offset < 0) offset += setWidth;
      }
      track.style.transform = 'translate3d(' + (-offset).toFixed(2) + 'px, 0, 0)';

      // Highlight the card closest to stage center
      var stageW = stage.clientWidth || 320;
      var centerX = offset + stageW / 2;
      var best = -1;
      var bestDist = Infinity;
      for (var i = 0; i < count; i++) {
        var cardCenter = i * (cardW + GAP) + cardW / 2;
        var d = Math.abs(cardCenter - centerX);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      cards.forEach(function (card, idx) {
        var src = idx % count;
        card.classList.toggle('is-front', src === best && !card.classList.contains('p3d-card--clone'));
      });
    }

    function tick() {
      if (!visible) {
        rafId = 0;
        return;
      }

      if (!reduced) {
        offset += AUTO_SPEED;
      }

      layout();
      rafId = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function stopLoop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) startLoop();
          else stopLoop();
        });
      }, { threshold: 0.12 });
      io.observe(root);
    }

    window.addEventListener('resize', function () {
      measure();
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
        reduced = e.matches;
        if (!reduced && visible) startLoop();
        else if (reduced) {
          stopLoop();
          layout();
        }
      });
    }

    measure();
    if (!reduced) startLoop();
    else layout();
  }

  function boot() {
    var roots = document.querySelectorAll('[data-property-carousel-3d]');
    if (!roots.length) return;

    function start(root) {
      if (root.getAttribute('data-carousel-ready') === '1') return;
      root.setAttribute('data-carousel-ready', '1');
      initCarousel(root);
    }

    // Eager roots (homepage edge proof) hydrate immediately so the panel is never empty black
    var lazy = [];
    roots.forEach(function (root) {
      if (root.hasAttribute('data-p3d-eager') || root.classList.contains('p3d-carousel--eager')) {
        start(root);
      } else {
        lazy.push(root);
      }
    });
    if (!lazy.length) return;

    // Lazy: only build carousel DOM/animation when near viewport
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          start(entry.target);
          obs.unobserve(entry.target);
        });
      }, { rootMargin: '200px 0px', threshold: 0.01 });
      lazy.forEach(function (root) { io.observe(root); });
      return;
    }

    lazy.forEach(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.PhugleePropertyCarousel3D = {
    PROPERTIES: PROPERTIES,
    init: initCarousel
  };
})();
