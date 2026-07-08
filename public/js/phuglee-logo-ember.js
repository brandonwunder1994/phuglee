(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = null;
  var ctx = null;
  var particles = [];
  var rafId = null;
  var running = false;
  var observer = null;
  var resizeObserver = null;
  var resizeAttempts = 0;

  var COLORS = [
    'rgba(255, 120, 45,',
    'rgba(229, 132, 53,',
    'rgba(255, 150, 60,',
    'rgba(212, 90, 32,',
    'rgba(255, 95, 30,'
  ];

  function particleCount() {
    return window.innerWidth < 600 ? 14 : window.innerWidth < 960 ? 18 : 24;
  }

  function resize() {
    if (!canvas) return false;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function scheduleResizeRetries() {
    var delays = [0, 80, 240, 600, 1200, 2400];
    delays.forEach(function (delay) {
      window.setTimeout(function () {
        if (resize()) {
          ensureParticles();
          if (!running && !reduceMotion) start();
        }
      }, delay);
    });
  }

  function spawnParticle() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var spread = w * 0.38;
    return {
      x: w * 0.5 + (Math.random() - 0.5) * spread,
      y: h * 0.7 + Math.random() * h * 0.18,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.3 - Math.random() * 0.65,
      life: 0,
      maxLife: 80 + Math.random() * 120,
      size: 1.2 + Math.random() * 2.8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      flicker: Math.random() * Math.PI * 2
    };
  }

  function ensureParticles() {
    var target = particleCount();
    while (particles.length < target) {
      var p = spawnParticle();
      p.life = Math.random() * p.maxLife * 0.6;
      particles.push(p);
    }
    if (particles.length > target) particles.length = target;
  }

  function tick() {
    if (!ctx || !canvas) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w < 1 || h < 1) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < particles.length; i += 1) {
      var p = particles[i];
      p.life += 1;
      p.x += p.vx + Math.sin(p.life * 0.045 + p.flicker) * 0.14;
      p.y += p.vy;

      var t = p.life / p.maxLife;
      var alpha = t < 0.12 ? t / 0.12 : t > 0.65 ? (1 - t) / 0.35 : 1;
      alpha *= 0.5 + Math.sin(p.life * 0.2 + p.flicker) * 0.18;

      var radius = p.size * (1 - t * 0.35);
      var gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.2);
      gradient.addColorStop(0, p.color + Math.min(1, alpha * 0.95) + ')');
      gradient.addColorStop(0.45, p.color + Math.min(1, alpha * 0.45) + ')');
      gradient.addColorStop(1, p.color + '0)');

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      if (p.life >= p.maxLife || p.y < h * 0.15) {
        particles[i] = spawnParticle();
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduceMotion) return;
    if (!resize()) {
      resizeAttempts += 1;
      if (resizeAttempts < 12) {
        window.setTimeout(start, 120);
      }
      return;
    }
    resizeAttempts = 0;
    ensureParticles();
    running = true;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
  }

  function bindResizeObservers(wrap) {
    var backdrop = wrap.querySelector('.logo-ember-backdrop');
    var floatEl = wrap.querySelector('.logo-ember-float');
    var slot = wrap.querySelector('.landing-logo-slot');

    window.addEventListener('resize', function () {
      resize();
    }, { passive: true });

    if (!window.ResizeObserver) return;

    resizeObserver = new ResizeObserver(function () {
      if (resize()) ensureParticles();
    });

    if (backdrop) resizeObserver.observe(backdrop);
    if (floatEl) resizeObserver.observe(floatEl);
    if (slot) resizeObserver.observe(slot);
  }

  function watchLogoInject(wrap) {
    var slot = wrap.querySelector('.landing-logo-slot');
    if (!slot || !window.MutationObserver) return;

    var logoObserver = new MutationObserver(function () {
      resize();
      ensureParticles();
      if (!running && !reduceMotion) start();
    });

    logoObserver.observe(slot, { childList: true, subtree: true });
  }

  function init() {
    if (reduceMotion) return;

    var wrap = document.querySelector('body.home-page .landing-logo-wrap');
    if (!wrap) return;

    canvas = wrap.querySelector('.logo-ember-canvas');
    if (!canvas) return;

    bindResizeObservers(wrap);
    watchLogoInject(wrap);
    scheduleResizeRetries();

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) start();
          else stop();
        });
      }, { threshold: 0.02, rootMargin: '80px 0px' });
      observer.observe(wrap);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();