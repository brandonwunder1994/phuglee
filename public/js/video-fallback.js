'use strict';

/**
 * Pipeline video helpers:
 * - hide on error (missing /videos/*.mp4)
 * - only autoplay when near viewport (lazy start)
 */
(function () {
  function onError(video) {
    video.setAttribute('hidden', '');
    video.removeAttribute('autoplay');
    try {
      video.pause();
    } catch (_) {
      /* ignore */
    }
    var wrap = video.closest(
      '.home-ui-preview--video, .home-collect-scene--video, .home-filter-scene--video'
    );
    if (wrap) wrap.classList.add('home-video-missing');
  }

  function shouldAutoplayVideo() {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (_) { /* ignore */ }
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c && (c.saveData || /2g/i.test(String(c.effectiveType || '')))) return false;
    } catch (_) { /* ignore */ }
    return true;
  }

  function bind(video) {
    if (!video || video.dataset.videoFallbackBound === '1') return;
    video.dataset.videoFallbackBound = '1';
    video.addEventListener('error', function () {
      onError(video);
    });

    // Click-to-play when autoplay is disabled by policy
    video.addEventListener('click', function () {
      if (video.paused) {
        video.play().catch(function () {});
      }
    });

    var wantsAutoplay = video.hasAttribute('autoplay') && shouldAutoplayVideo();
    if (video.hasAttribute('autoplay')) {
      video.removeAttribute('autoplay');
      try {
        video.pause();
      } catch (_) {
        /* ignore */
      }
    }

    if (!wantsAutoplay) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      video.play().catch(function () {});
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            video.play().catch(function () {});
          } else {
            try {
              video.pause();
            } catch (_) {
              /* ignore */
            }
          }
        });
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(video);
  }

  document.querySelectorAll('video.home-pipeline-video').forEach(bind);
})();
