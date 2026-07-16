(function (root) {
  'use strict';

  const STATES_GEO_URL = '/forge/static/geo/us-states.geojson';
  const ABBR = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
    Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
    Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
    Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
    Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
    Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
    Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
    'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
    Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
    Wyoming: 'WY', 'District of Columbia': 'DC'
  };

  // Lightweight Albers-ish projection for contiguous US (matches home-coverage spirit)
  function project(lon, lat, width, height) {
    const x = (lon + 125) / 60;
    const y = (50 - lat) / 26;
    return [x * width, y * height];
  }

  function ringToPath(ring, width, height) {
    if (!ring || !ring.length) return '';
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const p = project(ring[i][0], ring[i][1], width, height);
      d += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    return d + 'Z';
  }

  function featureToPath(feature, width, height) {
    const g = feature.geometry;
    if (!g) return '';
    const parts = [];
    if (g.type === 'Polygon') {
      (g.coordinates || []).forEach((ring) => parts.push(ringToPath(ring, width, height)));
    } else if (g.type === 'MultiPolygon') {
      (g.coordinates || []).forEach((poly) => {
        (poly || []).forEach((ring) => parts.push(ringToPath(ring, width, height)));
      });
    }
    return parts.join(' ');
  }

  function catalogStates(funds) {
    const set = new Set();
    (funds || []).forEach((f) => {
      (f.buyBoxes || []).forEach((b) => {
        (b.states || []).forEach((s) => set.add(String(s).toUpperCase()));
      });
    });
    return set;
  }

  function strongStates(rows) {
    const set = new Set();
    (rows || []).forEach((r) => {
      if (r.tier !== 'strong' && r.tier !== 'partial') return;
      (r.fund.buyBoxes || []).forEach((b) => {
        (b.states || []).forEach((s) => set.add(String(s).toUpperCase()));
      });
    });
    return set;
  }

  async function mount(host, opts) {
    if (!host) return null;
    const options = opts || {};
    const width = 560;
    const height = 320;
    host.innerHTML = '<p class="tf-map-loading">Loading map…</p>';

    let geo;
    try {
      const res = await fetch(STATES_GEO_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error('geo missing');
      geo = await res.json();
    } catch (_) {
      host.innerHTML = '<p class="tf-map-fallback">Map unavailable — use state filter chips.</p>';
      return null;
    }

    const inCatalog = catalogStates(options.funds);
    const hot = strongStates(options.rows);
    const active = String(options.activeState || '').toUpperCase();

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'tf-map-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Fund market states');

    const g = document.createElementNS(svgNS, 'g');
    (geo.features || []).forEach((feature) => {
      const name = feature.properties && feature.properties.name;
      if (!name || name === 'Alaska' || name === 'Hawaii' || name === 'Puerto Rico') return;
      const abbr = ABBR[name];
      if (!abbr) return;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', featureToPath(feature, width, height));
      let cls = 'tf-map-state';
      if (inCatalog.has(abbr)) cls += ' tf-map-state--fund';
      if (hot.has(abbr)) cls += ' tf-map-state--hot';
      if (active && active === abbr) cls += ' tf-map-state--active';
      path.setAttribute('class', cls);
      path.setAttribute('data-state', abbr);
      path.setAttribute('tabindex', inCatalog.has(abbr) ? '0' : '-1');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', name + ' (' + abbr + ')');
      if (inCatalog.has(abbr) && typeof options.onStateClick === 'function') {
        path.addEventListener('click', () => options.onStateClick(abbr));
        path.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            options.onStateClick(abbr);
          }
        });
      }
      g.appendChild(path);
    });
    svg.appendChild(g);
    host.innerHTML = '';
    host.appendChild(svg);
    return { svg, inCatalog, hot };
  }

  const api = { mount, catalogStates, strongStates, ABBR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TrustFundsMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
