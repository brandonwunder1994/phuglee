// premium-shell.js — v1.8 Aerial Command theater (empty demo, scan class, KPI pulse)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;

  const DEMO_CARDS = [
    { cls: 'distressed', tier: 'Distressed', addr: '142 Oak St, Dayton OH' },
    { cls: 'well', tier: 'Well Maintained', addr: '88 Maple Ave, Akron OH' },
    { cls: 'review', tier: 'Needs Review', addr: '210 Pine Rd, Toledo OH' },
  ];

  let demoTimer = null;
  let demoStarted = false;

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  R.initEmptyDemoTheater = function initEmptyDemoTheater() {
    const ws = document.getElementById('emptyWorkspace');
    if (!ws || document.getElementById('emptyDemoTheater')) return;

    const theater = document.createElement('div');
    theater.id = 'emptyDemoTheater';
    theater.className = 'empty-demo-theater';
    theater.innerHTML = `
      <div class="empty-demo-label">Live preview — how your leads get ranked</div>
      <div class="empty-demo-track" id="emptyDemoTrack"></div>
      <div class="empty-demo-scanline" id="emptyDemoScanline" aria-hidden="true"></div>`;

    const actions = ws.querySelector('.empty-workspace-actions');
    if (actions) ws.insertBefore(theater, actions);
    else ws.appendChild(theater);

    const track = document.getElementById('emptyDemoTrack');
    if (!track) return;

    track.innerHTML = DEMO_CARDS.map((c, i) => `
      <div class="empty-demo-card ${c.cls}" data-demo-idx="${i}">
        <div class="demo-thumb"><span class="demo-tier">${c.tier}</span></div>
        <div class="demo-addr">${c.addr}</div>
      </div>`).join('');

    const obs = new MutationObserver(() => {
      if (ws.classList.contains('visible') && !ws.classList.contains('hidden-by-app')) {
        startDemoSequence();
      } else {
        stopDemoSequence();
      }
    });
    obs.observe(ws, { attributes: true, attributeFilter: ['class'] });

    if (ws.classList.contains('visible') && !ws.classList.contains('hidden-by-app')) {
      startDemoSequence();
    }
  };

  function startDemoSequence() {
    if (demoStarted || prefersReducedMotion()) {
      document.querySelectorAll('.empty-demo-card').forEach((c) => c.classList.add('revealed'));
      return;
    }
    demoStarted = true;
    stopDemoSequence();
    const cards = document.querySelectorAll('.empty-demo-card');
    const scanline = document.getElementById('emptyDemoScanline');
    cards.forEach((c) => c.classList.remove('revealed'));
    if (scanline) scanline.classList.remove('active');

    let i = 0;
    function revealNext() {
      if (i === 0 && scanline) scanline.classList.add('active');
      if (i < cards.length) {
        cards[i].classList.add('revealed');
        i += 1;
        demoTimer = setTimeout(revealNext, 520);
      } else {
        demoTimer = setTimeout(() => {
          demoStarted = false;
          cards.forEach((c) => c.classList.remove('revealed'));
          if (scanline) scanline.classList.remove('active');
          demoTimer = setTimeout(startDemoSequence, 2400);
        }, 2800);
      }
    }
    demoTimer = setTimeout(revealNext, 400);
  }

  function stopDemoSequence() {
    if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
    demoStarted = false;
  }

  R.syncScanTheaterClass = function syncScanTheaterClass(running) {
    const section = document.getElementById('progressSection');
    if (!section) return;
    section.classList.toggle('scanning-active', !!running);
  };

  R.pulseDistressedKpi = function pulseDistressedKpi(count) {
    const card = document.getElementById('sumDistressedKpiCard');
    if (!card || !count || prefersReducedMotion()) return;
    card.classList.remove('kpi-pulse');
    void card.offsetWidth;
    card.classList.add('kpi-pulse');
  };

  function boot() {
    R.initEmptyDemoTheater();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);