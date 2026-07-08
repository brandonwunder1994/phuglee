(function (global) {
  'use strict';

  var shared = global.PhugleeCoverageShared;
  var overlay = null;
  var imagesManifest = null;
  var detailCache = new Map();
  var openCityId = null;

  var TEASE_ROWS = [
    '████ ██████ Ave · Distress signal tracked',
    '████ ███ St · Code violation flagged',
    '████ ██████ Blvd · Fresh lead updating'
  ];

  function isMember() {
    if (global.PhugleeAuth && typeof global.PhugleeAuth.isAuthenticated === 'function') {
      return global.PhugleeAuth.isAuthenticated();
    }
    if (global.PhugleeAuth && typeof global.PhugleeAuth.getSessionUser === 'function') {
      return !!global.PhugleeAuth.getSessionUser();
    }
    return false;
  }

  function openLogin() {
    if (global.PhugleeAuth && typeof global.PhugleeAuth.openLogin === 'function') {
      global.PhugleeAuth.openLogin();
      return;
    }
    window.location.href = '/?auth=login';
  }

  function apiBase() {
    if (window.location.pathname.indexOf('/forge') === 0) return '/forge';
    return '';
  }

  async function fetchCityDetail(cityId) {
    if (detailCache.has(cityId)) return detailCache.get(cityId);
    var bases = [apiBase() + '/api/coverage/city/', '/api/coverage/city/', '/forge/api/coverage/city/'];
    var lastErr = null;
    for (var i = 0; i < bases.length; i += 1) {
      try {
        var res = await fetch(bases[i] + encodeURIComponent(cityId));
        if (!res.ok) throw new Error('not found');
        var data = await res.json();
        detailCache.set(cityId, data);
        return data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('detail unavailable');
  }

  function imageForCity(city) {
    if (!imagesManifest || !imagesManifest.cities) return null;
    return imagesManifest.cities[city.id] || null;
  }

  function imageUrl(city, imageMeta) {
    if (!imageMeta) return '';
    if (imageMeta.local) {
      var prefix = apiBase() || '/forge';
      return prefix + '/static/city-images/' + imageMeta.local;
    }
    return imageMeta.url || '';
  }

  function formatSince(savedAt) {
    if (!savedAt) return '';
    var d = new Date(savedAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'city-profile-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<article class="city-profile-modal">' +
        '<button type="button" class="city-profile-close" aria-label="Close city profile">×</button>' +
        '<div class="city-profile-hero" id="city-profile-hero"></div>' +
        '<div class="city-profile-body">' +
          '<p class="city-profile-breadcrumb" id="city-profile-breadcrumb"></p>' +
          '<h2 class="city-profile-title" id="city-profile-title"></h2>' +
          '<p class="city-profile-kicker" id="city-profile-kicker"></p>' +
          '<div class="city-profile-chips" id="city-profile-chips"></div>' +
          '<p class="city-profile-section-title">What we pull</p>' +
          '<ul class="city-profile-available" id="city-profile-available"></ul>' +
          '<div class="city-profile-tease" id="city-profile-tease"></div>' +
          '<div class="city-profile-actions" id="city-profile-actions"></div>' +
          '<p class="city-profile-credit" id="city-profile-credit" hidden></p>' +
        '</div>' +
      '</article>';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('.city-profile-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) close();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderHero(city, imageMeta) {
    var hero = overlay.querySelector('#city-profile-hero');
    hero.innerHTML = '';
    var url = imageUrl(city, imageMeta);

    if (url) {
      var img = document.createElement('img');
      img.className = 'city-profile-hero-img';
      img.src = url;
      img.alt = city.city + ', ' + city.state;
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        renderHeroFallback(city, hero);
      });
      hero.appendChild(img);
    } else {
      renderHeroFallback(city, hero);
    }

    var veil = document.createElement('div');
    veil.className = 'city-profile-hero-overlay';
    hero.appendChild(veil);
  }

  function renderHeroFallback(city, hero) {
    var existing = hero.querySelector('.city-profile-hero-gradient, .city-profile-hero-fallback-title');
    if (existing) return;
    var grad = document.createElement('div');
    grad.className = 'city-profile-hero-gradient';
    var title = document.createElement('div');
    title.className = 'city-profile-hero-fallback-title';
    title.innerHTML = escape(city.city) + '<span>' + escape(city.state) + '</span>';
    hero.insertBefore(grad, hero.firstChild);
    hero.insertBefore(title, hero.firstChild);
  }

  function escape(value) {
    return shared ? shared.escapeHtml(value) : String(value);
  }

  function renderAvailable(city) {
    var list = overlay.querySelector('#city-profile-available');
    list.innerHTML = '';
    var isPortal = city.pin_type === 'portal';
    var items = isPortal
      ? ['Code violation lists', 'Water shutoff lists']
      : ['Public records requests (FOIA)'];
    items.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
  }

  function renderTease(member) {
    var tease = overlay.querySelector('#city-profile-tease');
    if (member) {
      tease.hidden = true;
      tease.innerHTML = '';
      return;
    }

    tease.hidden = false;
    tease.innerHTML =
      '<div class="city-profile-tease-head">' +
        '<p class="city-profile-section-title">Live signal preview</p>' +
        '<span class="city-profile-tease-lock">Members only</span>' +
      '</div>' +
      '<p class="city-profile-tease-copy">Distress signals tracked in this market. Fresh leads updating — unlock to dial.</p>' +
      '<div class="city-profile-tease-rows">' +
        TEASE_ROWS.map(function (row) {
          return '<div class="city-profile-tease-row">' + escape(row) + '</div>';
        }).join('') +
        '<div class="city-profile-tease-shimmer" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="city-profile-tease-cta">' +
        '<button type="button" class="city-profile-btn-primary" data-action="member">Become a member</button>' +
      '</div>';

    tease.querySelector('[data-action="member"]').addEventListener('click', openLogin);
  }

  function renderActions(city, member) {
    var actions = overlay.querySelector('#city-profile-actions');
    actions.innerHTML = '';

    if (!member) return;

    var isPortal = city.pin_type === 'portal';
    var portalUrl = city.url || city.portal_url || '';
    var pdfPath = city.pdf_path || '';

    if (isPortal && portalUrl) {
      var portal = document.createElement('a');
      portal.className = 'city-profile-btn-primary';
      portal.href = portalUrl;
      portal.target = '_blank';
      portal.rel = 'noopener';
      portal.textContent = 'View government portal';
      actions.appendChild(portal);
    }

    if (pdfPath) {
      var pdf = document.createElement('a');
      pdf.className = 'city-profile-btn-ghost';
      pdf.href = (apiBase() || '') + '/api/file/' + pdfPath;
      pdf.target = '_blank';
      pdf.rel = 'noopener';
      pdf.textContent = 'View completed form';
      actions.appendChild(pdf);
    }
  }

  function renderCredit(imageMeta) {
    var credit = overlay.querySelector('#city-profile-credit');
    if (!imageMeta || !imageMeta.credit) {
      credit.hidden = true;
      credit.textContent = '';
      return;
    }
    credit.hidden = false;
    if (imageMeta.credit_url) {
      credit.innerHTML = 'Photo by <a href="' + escape(imageMeta.credit_url) + '" target="_blank" rel="noopener">' +
        escape(imageMeta.credit) + '</a>' + (imageMeta.source ? ' on ' + escape(imageMeta.source) : '');
    } else {
      credit.textContent = 'Photo: ' + imageMeta.credit;
    }
  }

  function renderModal(city, detail) {
    var data = Object.assign({}, city, detail || {});
    var member = isMember();
    var county = shared && shared.cityCounty ? shared.cityCounty(data) : (data.county || '');
    var countyLabel = county && county !== 'Unknown County' ? county : '';
    var imageMeta = imageForCity(data);

    overlay.querySelector('#city-profile-breadcrumb').textContent =
      'United States · ' + data.state + (countyLabel ? ' · ' + countyLabel : '');
    overlay.querySelector('#city-profile-title').textContent = data.city;
    overlay.querySelector('#city-profile-kicker').textContent =
      (countyLabel ? countyLabel + ' · ' : '') + data.state + ' · Public records coverage';

    var chips = overlay.querySelector('#city-profile-chips');
    chips.innerHTML = '';
    var badge = document.createElement('span');
    badge.className = 'city-profile-chip city-profile-chip--' + (data.pin_type === 'portal' ? 'portal' : 'live');
    badge.textContent = data.pin_type === 'portal' ? 'Online Portal' : 'Records Form';
    chips.appendChild(badge);

    var live = document.createElement('span');
    live.className = 'city-profile-chip city-profile-chip--live';
    live.textContent = data.pin_type === 'portal' ? 'Active data source' : 'Records access established';
    chips.appendChild(live);

    var since = formatSince(data.saved_at);
    if (since) {
      var sinceChip = document.createElement('span');
      sinceChip.className = 'city-profile-chip';
      sinceChip.textContent = 'Since ' + since;
      chips.appendChild(sinceChip);
    }

    renderHero(data, imageMeta);
    renderAvailable(data);
    renderTease(member);
    renderActions(data, member);
    renderCredit(imageMeta);
  }

  async function open(city, options) {
    options = options || {};
    if (!city || !city.id) return;
    ensureOverlay();
    openCityId = city.id;
    overlay.hidden = false;
    document.body.classList.add('city-profile-open');
    overlay.setAttribute('aria-label', city.city + ', ' + city.state);

    if (!imagesManifest && shared && shared.fetchCityImages) {
      imagesManifest = await shared.fetchCityImages();
    }

    renderModal(city, null);

    try {
      var needsDetail = !(city.url || city.portal_url || city.pdf_path || city.requests);
      if (needsDetail || options.alwaysFetchDetail) {
        var detail = await fetchCityDetail(city.id);
        if (openCityId === city.id) renderModal(Object.assign({}, city, detail), detail);
      }
    } catch (_) {
      /* keep minimal */
    }

    if (options.onOpen) options.onOpen(city);
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    openCityId = null;
    document.body.classList.remove('city-profile-open');
    if (global.PhugleeCityProfileModal && global.PhugleeCityProfileModal._onClose) {
      global.PhugleeCityProfileModal._onClose();
    }
  }

  function isOpen() {
    return overlay && !overlay.hidden;
  }

  global.PhugleeCityProfileModal = {
    open: open,
    close: close,
    isOpen: isOpen,
    isMember: isMember,
    prefetchImages: async function () {
      if (!shared) return null;
      imagesManifest = await shared.fetchCityImages();
      return imagesManifest;
    },
    _onClose: null
  };
})(typeof window !== 'undefined' ? window : globalThis);