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

  function bind(video) {
    if (!video || video.dataset.videoFallbackBound === '1') return;
    video.dataset.videoFallbackBound = '1';
    video.addEventListener('error', function () {
      onError(video);
    });

    var wantsAutoplay = video.hasAttribute('autoplay');
    if (wantsAutoplay) {
      video.removeAttribute('autoplay');
      try {
        video.pause();
      } catch (_) {
        /* ignore */
      }
    }

    if (!wantsAutoplay || typeof IntersectionObserver === 'undefined') {
      if (wantsAutoplay) {
        video.play().catch(function () {});
      }
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
