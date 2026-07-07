(function () {
  'use strict';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/index.html' ? '/' : p;
  }

  var state = {
    flipped: false
  };

  var PRICING = [
    {
      id: 'lite',
      tier: 'Lite',
      amount: '$47',
      period: '/month',
      tagline: 'One city. Full pipeline.',
      featured: false,
      exclusive: false,
      vault: false,
      mailto: 'mailto:team@distressos.com?subject=Distress%20OS%20Lite%20Plan',
      features: [
        'Pick <strong>1 city</strong> to run yourself',
        'PDF filler, request tracker &amp; analyzer tools',
        'Collect, scrub, and analyze on your schedule',
        'Perfect for testing a single market'
      ]
    },
    {
      id: 'pro',
      tier: 'Pro',
      amount: '$97',
      period: '/month',
      tagline: 'Full access. Every city.',
      featured: true,
      exclusive: false,
      vault: false,
      mailto: 'mailto:team@distressos.com?subject=Distress%20OS%20Pro%20Plan',
      features: [
        'Unlimited access to <strong data-coverage-city-count>500+</strong> cities nationwide',
        'Every tool in the Distress OS stack',
        'Run the full collect → scrub → analyze workflow anywhere',
        'Best value when you\'re serious about volume'
      ]
    },
    {
      id: 'max',
      tier: 'Max',
      amount: '$297',
      period: '/month',
      tagline: 'Skip DIY. Start dialing.',
      featured: false,
      exclusive: false,
      vault: true,
      mailto: 'mailto:team@distressos.com?subject=Distress%20OS%20Max%20Plan',
      features: [
        'Everything in <strong>Pro</strong>, plus <strong>The Vault</strong>',
        'Pre-scrubbed leads by city — we did the collect &amp; filter',
        'Filter markets and pull ranked seller-ready lists',
        'Get straight to calling — save hours every week'
      ]
    },
    {
      id: 'exclusivity',
      tier: 'Exclusivity',
      amount: 'Custom',
      period: '',
      tagline: 'Own an entire city.',
      featured: false,
      exclusive: true,
      vault: false,
      mailto: 'mailto:team@distressos.com?subject=Distress%20OS%20City%20Exclusivity',
      features: [
        'City blackout — your market, your leads only',
        'Not self-serve — we vet every applicant',
        'Speak with our team to confirm you\'re the right fit',
        'Limited availability by market'
      ]
    }
  ];

  function buildPricingCards() {
    return PRICING.map(function (plan) {
      var classes = ['guide-pricing-card'];
      if (plan.featured) classes.push('guide-pricing-card--featured');
      if (plan.exclusive) classes.push('guide-pricing-card--exclusive');
      if (plan.vault) classes.push('guide-pricing-card--vault');

      var priceHtml = plan.period
        ? '<span class="guide-pricing-amount">' + plan.amount + '</span><span class="guide-pricing-period">' + plan.period + '</span>'
        : '<span class="guide-pricing-amount">' + plan.amount + '</span>';

      var features = plan.features.map(function (f) {
        return '<li>' + f + '</li>';
      }).join('');

      var ctaLabel = plan.exclusive ? 'Talk to Our Team' : 'Get Started';

      return (
        '<article class="' + classes.join(' ') + '">' +
          '<span class="guide-pricing-tier">' + plan.tier + '</span>' +
          '<div class="guide-pricing-price">' + priceHtml + '</div>' +
          '<p class="guide-pricing-tagline">' + plan.tagline + '</p>' +
          '<ul class="guide-pricing-features">' + features + '</ul>' +
          '<a href="' + plan.mailto + '" class="guide-pricing-cta">' + ctaLabel + '</a>' +
        '</article>'
      );
    }).join('');
  }

  function buildModal() {
    return (
      '<div class="guide-overlay" id="guide-overlay" hidden aria-hidden="true">' +
        '<div class="guide-backdrop" data-guide-close></div>' +
        '<div class="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-how-title">' +
          '<div class="guide-modal-grain" aria-hidden="true"></div>' +
          '<button type="button" class="guide-close" data-guide-close aria-label="Close">&times;</button>' +
          '<div class="guide-card-scene">' +
            '<div class="guide-card" id="guide-card">' +

              '<div class="guide-card-face guide-card-front">' +
                '<div class="guide-face-scroll">' +
                  '<p class="guide-eyebrow">How It Works</p>' +
                  '<h2 id="guide-how-title" class="guide-title">Leads this hot don\'t wait for aggregators.</h2>' +
                  '<p class="guide-lead">We pull lists straight from city and county records — not data warehouses that drip the same leads to everyone else weeks later.</p>' +

                  '<section class="guide-map-section" aria-label="Coverage map">' +
                    '<p class="guide-map-eyebrow">Where we operate</p>' +
                    '<p class="guide-map-summary" id="guide-map-summary">Loading coverage…</p>' +
                    '<div class="guide-coverage-map" id="guide-coverage-map"></div>' +
                    '<ul class="guide-map-legend">' +
                      '<li><span class="guide-map-swatch guide-map-swatch--covered"></span> We have cities here</li>' +
                      '<li><span class="guide-map-swatch guide-map-swatch--pending"></span> Not in yet</li>' +
                      '<li><span class="guide-map-swatch guide-map-swatch--blocked"></span> Can\'t get data here</li>' +
                    '</ul>' +
                  '</section>' +

                  '<div class="guide-vs" aria-label="Your edge versus aggregators">' +
                    '<div class="guide-vs-panel guide-vs-panel--fresh">' +
                      '<span class="guide-vs-badge">Your edge</span>' +
                      '<h3>Phuglee pipeline</h3>' +
                      '<p>City clerk → your inbox → Filter scrubs → Analyze ranks → you dial. <strong>Days.</strong> Nobody else has seen this list.</p>' +
                    '</div>' +
                    '<div class="guide-vs-panel guide-vs-panel--stale">' +
                      '<span class="guide-vs-badge">Everyone else</span>' +
                      '<h3>Aggregator drip</h3>' +
                      '<p>Portal scrape → warehouse → sold to 400 wholesalers. <strong>Weeks.</strong> Stale before you open the file.</p>' +
                    '</div>' +
                  '</div>' +

                  '<ol class="guide-steps">' +
                    '<li class="guide-step">' +
                      '<span class="guide-step-num">01</span>' +
                      '<div>' +
                        '<h4>Collect at the source</h4>' +
                        '<p>Request public records directly from cities and counties — PDF emails, portals, or plain email FOIA. Fresh leads while aggregators are still waiting.</p>' +
                      '</div>' +
                    '</li>' +
                    '<li class="guide-step">' +
                      '<span class="guide-step-num">02</span>' +
                      '<div>' +
                        '<h4>Scrub with Filter</h4>' +
                        '<p>Drop in whatever the city sends — Excel, CSV, PDF, even photos. We normalize, tag distress signals, and build a clean spreadsheet ready to filter and skip trace.</p>' +
                      '</div>' +
                    '</li>' +
                    '<li class="guide-step">' +
                      '<span class="guide-step-num">03</span>' +
                      '<div>' +
                        '<h4>Analyze with AI + human review</h4>' +
                        '<p>Import your refined list. AI scans Street View and ranks visible distress — then human review double-checks every tier before you dial.</p>' +
                      '</div>' +
                    '</li>' +
                  '</ol>' +

                  '<div class="guide-face-actions">' +
                    '<button type="button" class="phuglee-btn phuglee-btn-primary" id="guide-show-pricing">View Pricing</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div class="guide-card-face guide-card-back">' +
                '<div class="guide-face-scroll">' +
                  '<button type="button" class="guide-back-link" id="guide-back-to-how">&larr; Back to How It Works</button>' +
                  '<p class="guide-eyebrow">Get in the game</p>' +
                  '<h2 class="guide-title">Pick your territory</h2>' +
                  '<p class="guide-lead">Start with one market or unlock every city in the network. Same tools, same pipeline.</p>' +
                  '<div class="guide-pricing-grid">' + buildPricingCards() + '</div>' +
                  '<p class="guide-pricing-note">Exclusivity is not automated signup — our team personally reviews every request to protect lead quality and market integrity.</p>' +
                '</div>' +
              '</div>' +

            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function setFlipped(flipped) {
    state.flipped = flipped;
    var card = $('#guide-card');
    if (card) card.classList.toggle('is-flipped', flipped);
  }

  function openGuide() {
    if (window.PhugleeAuth && typeof window.PhugleeAuth.openLogin === 'function') {
      var authOverlay = $('#auth-overlay');
      if (authOverlay && !authOverlay.hidden && typeof window.PhugleeAuth.closeLogin === 'function') {
        window.PhugleeAuth.closeLogin();
      }
    }

    var overlay = $('#guide-overlay');
    if (!overlay) return;
    setFlipped(false);
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('guide-modal-open');
    var closeBtn = overlay.querySelector('.guide-close');
    if (closeBtn) closeBtn.focus();

    if (window.PhugleeCoverage && typeof window.PhugleeCoverage.renderGuideMap === 'function') {
      window.PhugleeCoverage.renderGuideMap();
    }
  }

  function closeGuide() {
    var overlay = $('#guide-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('guide-modal-open');
    setFlipped(false);
  }

  function flipToPricing() {
    setFlipped(true);
  }

  function flipToHow() {
    setFlipped(false);
  }

  var GUIDE_TRIGGER_IDS = [
    'btn-how-it-works',
    'btn-how-it-works-footer',
    'btn-how-it-works-dashboard',
    'btn-how-it-works-quick'
  ];

  function bindTriggers() {
    GUIDE_TRIGGER_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          openGuide();
        });
      }
    });
  }

  function guidePages() {
    return ['/', '/command'];
  }

  function shouldInitGuide() {
    return guidePages().indexOf(normalizePath(window.location.pathname)) !== -1;
  }

  function bindEvents() {
    var overlay = $('#guide-overlay');
    if (!overlay) return;

    overlay.querySelectorAll('[data-guide-close]').forEach(function (el) {
      el.addEventListener('click', closeGuide);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!overlay.hidden) closeGuide();
    });

    var showPricing = $('#guide-show-pricing');
    if (showPricing) showPricing.addEventListener('click', flipToPricing);

    var backHow = $('#guide-back-to-how');
    if (backHow) backHow.addEventListener('click', flipToHow);
  }

  function init() {
    if (!shouldInitGuide()) return;

    if (!$('#guide-overlay')) {
      var mount = document.createElement('div');
      mount.innerHTML = buildModal();
      document.body.appendChild(mount.firstElementChild);
      bindEvents();
    }

    bindTriggers();

    if (window.location.hash === '#how-it-works') {
      window.setTimeout(openGuide, 60);
    }
  }

  window.PhugleeGuide = {
    open: openGuide,
    close: closeGuide,
    flipToPricing: flipToPricing,
    flipToHow: flipToHow
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();