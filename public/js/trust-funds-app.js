(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const CATALOG_URL = '/data/fund-buyers/catalog.json';

  const FLAG_KEYS = [
    'brick', 'garage', 'offMarket', 'leaseback', 'waterfront',
    'buildable', 'roadAccess', 'utilitiesNearby'
  ];

  const state = {
    funds: [],
    catalog: null,
    cluster: '',
    tierFilter: '',
    stateFilter: '',
    openId: null,
    activeBoxByFund: {},
    compareIds: [],
    showMisses: false,
    dealId: null,
    addressLabel: '',
    flags: {},
    urlTimer: null,
    rankedCache: []
  };

  FLAG_KEYS.forEach((k) => { state.flags[k] = null; });

  function $(id) { return document.getElementById(id); }

  function sessionUser() {
    try {
      if (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function') {
        return window.PhugleeSession.getSessionUser() || '';
      }
    } catch (_) { /* ignore */ }
    try { return sessionStorage.getItem('phuglee_session') || ''; } catch (_) { return ''; }
  }

  function isContractDesk() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    const user = sessionUser();
    return user === ADMIN || user === DISPOS;
  }

  function showToast(msg) {
    const el = $('tf-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readDeal() {
    return {
      address: state.addressLabel || '',
      city: ($('tf-city') && $('tf-city').value) || '',
      market: ($('tf-city') && $('tf-city').value) || '',
      state: ($('tf-state') && $('tf-state').value) || '',
      zip: ($('tf-zip') && $('tf-zip').value) || '',
      assetType: ($('tf-asset') && $('tf-asset').value) || '',
      sqft: ($('tf-sqft') && $('tf-sqft').value) || '',
      beds: ($('tf-beds') && $('tf-beds').value) || '',
      baths: ($('tf-baths') && $('tf-baths').value) || '',
      yearBuilt: ($('tf-year') && $('tf-year').value) || '',
      asking: ($('tf-asking') && $('tf-asking').value) || '',
      arv: ($('tf-arv') && $('tf-arv').value) || '',
      rehab: ($('tf-rehab') && $('tf-rehab').value) || '',
      acres: ($('tf-acres') && $('tf-acres').value) || '',
      condition: ($('tf-condition') && $('tf-condition').value) || '',
      brick: state.flags.brick,
      garage: state.flags.garage,
      offMarket: state.flags.offMarket,
      leaseback: state.flags.leaseback,
      waterfront: state.flags.waterfront,
      buildable: state.flags.buildable,
      roadAccess: state.flags.roadAccess,
      utilitiesNearby: state.flags.utilitiesNearby,
      dealId: state.dealId
    };
  }

  function writeDeal(deal) {
    if (!deal) return;
    const set = (id, v) => { if ($(id)) $(id).value = v == null ? '' : v; };
    set('tf-city', deal.city || '');
    set('tf-state', deal.state || '');
    set('tf-zip', deal.zip || '');
    set('tf-asset', deal.assetType || '');
    set('tf-sqft', deal.sqft || '');
    set('tf-beds', deal.beds || '');
    set('tf-baths', deal.baths || '');
    set('tf-year', deal.yearBuilt || '');
    set('tf-asking', deal.asking || '');
    set('tf-arv', deal.arv || '');
    set('tf-rehab', deal.rehab || '');
    set('tf-acres', deal.acres || '');
    set('tf-condition', deal.condition || '');
    FLAG_KEYS.forEach((k) => {
      state.flags[k] = deal[k] === true ? true : deal[k] === false ? false : null;
    });
    state.dealId = deal.dealId || state.dealId;
    if (deal.address) state.addressLabel = deal.address;
    paintFlags();
    syncAssetMode();
    updateDealChip();
  }

  function paintFlags() {
    document.querySelectorAll('.tf-tri').forEach((wrap) => {
      const key = wrap.getAttribute('data-flag');
      const val = state.flags[key];
      wrap.querySelectorAll('.tf-tri-btn').forEach((btn) => {
        const v = btn.getAttribute('data-val');
        const active = (v === 'null' && val == null)
          || (v === '1' && val === true)
          || (v === '0' && val === false);
        btn.classList.toggle('is-active', active);
      });
    });
  }

  function buildFlagControls() {
    document.querySelectorAll('.tf-tri').forEach((wrap) => {
      const host = wrap.querySelector('.tf-tri-btns');
      if (!host || host.childElementCount) return;
      [
        { val: '1', label: 'Yes' },
        { val: '0', label: 'No' },
        { val: 'null', label: '—' }
      ].forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tf-tri-btn';
        btn.setAttribute('data-val', opt.val);
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          const key = wrap.getAttribute('data-flag');
          state.flags[key] = opt.val === '1' ? true : opt.val === '0' ? false : null;
          paintFlags();
          render();
        });
        host.appendChild(btn);
      });
    });
    paintFlags();
  }

  function isLandAsset(assetType) {
    return assetType === 'land' || assetType === 'teardown';
  }

  function syncAssetMode() {
    const asset = ($('tf-asset') && $('tf-asset').value) || '';
    const land = isLandAsset(asset);
    const house = asset === 'sfh' || asset === 'duplex';
    document.querySelectorAll('.tf-house-field, .tf-house-flags').forEach((el) => {
      el.hidden = land;
    });
    document.querySelectorAll('.tf-land-field, .tf-land-flags').forEach((el) => {
      el.hidden = house;
    });
  }

  function setCluster(cluster) {
    state.cluster = cluster || '';
    document.querySelectorAll('.tf-chip[data-cluster]').forEach((el) => {
      const on = (el.getAttribute('data-cluster') || '') === state.cluster;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function updateDealChip() {
    const chip = $('tf-deal-chip');
    if (!chip) return;
    if (state.addressLabel || state.dealId) {
      chip.hidden = false;
      chip.textContent = 'Matching: ' + (state.addressLabel || state.dealId);
    } else {
      chip.hidden = true;
      chip.textContent = '';
    }
  }

  function urlState() {
    return {
      deal: readDeal(),
      cluster: state.cluster,
      tierFilter: state.tierFilter,
      stateFilter: state.stateFilter,
      openId: state.openId,
      dealId: state.dealId,
      compareIds: state.compareIds.slice(),
      showMisses: state.showMisses
    };
  }

  function scheduleUrl() {
    if (!window.TrustFundsUrl) return;
    clearTimeout(state.urlTimer);
    state.urlTimer = setTimeout(() => {
      window.TrustFundsUrl.applyToUrl(urlState(), true);
    }, 200);
  }

  function personalityBadges(fund) {
    const p = fund.personality || {};
    const bits = [];
    if (p.speed) bits.push(p.speed);
    if (p.pay) bits.push(p.pay);
    if (p.dd === 'none') bits.push('No DD');
    else if (p.dd) bits.push('DD ' + p.dd);
    if (p.emd) bits.push('EMD ' + p.emd);
    (p.tags || []).slice(0, 2).forEach((t) => bits.push(t));
    return bits.map((b) => `<span class="tf-badge">${esc(b)}</span>`).join('');
  }

  function reasonChips(row) {
    const hits = (row.hits || []).slice(0, 4);
    const blocks = (row.blockers || []).slice(0, 3);
    return hits.map((h) => `<span class="tf-reason tf-reason--hit">${esc(h.reason)}</span>`).join('')
      + blocks.map((b) => `<span class="tf-reason tf-reason--block">${esc(b.reason)}</span>`).join('');
  }

  function checklistHtml(row) {
    const hits = row.hits || [];
    const blocks = row.blockers || [];
    const unknowns = row.unknowns || [];
    if (!hits.length && !blocks.length && !unknowns.length) {
      return '<p class="tf-dossier-muted">Enter deal details to build a fit checklist.</p>';
    }
    const li = (cls, items) => items.map((i) => {
      const fix = i.fix ? ` <span class="tf-dossier-muted">— ${esc(i.fix)}</span>` : '';
      return `<li class="${cls}">${esc(i.label || i.reason)}${fix}</li>`;
    }).join('');
    return `<ul class="tf-check-list">
      ${li('tf-check-hit', hits)}
      ${li('tf-check-block', blocks)}
      ${li('tf-check-unknown', unknowns)}
    </ul>`;
  }

  function activeBoxScore(row) {
    const fundId = row.fundId;
    const preferred = state.activeBoxByFund[fundId];
    if (preferred && row.boxScores) {
      const found = row.boxScores.find((b) => b.boxId === preferred);
      if (found) return found;
    }
    return row.bestBox;
  }

  function renderDossier(row) {
    const fund = row.fund;
    const boxes = fund.buyBoxes || [];
    const active = activeBoxScore(row);
    const boxMeta = (active && boxes.find((b) => b.id === active.boxId)) || boxes[0] || {};
    const summary = boxMeta.criteriaSummary || [];
    const notBuying = fund.notBuying || [];
    const boxToggle = boxes.length > 1
      ? `<div class="tf-box-toggle" role="group" aria-label="Buy boxes">
          ${boxes.map((b) => {
            const on = active && active.boxId === b.id;
            return `<button type="button" class="tf-box-btn${on ? ' is-active' : ''}" data-box-fund="${esc(fund.id)}" data-box-id="${esc(b.id)}">${esc(b.label)}</button>`;
          }).join('')}
        </div>`
      : '';

    return `
      <div class="tf-dossier" id="tf-dossier-${esc(fund.id)}">
        ${boxToggle}
        <div class="tf-dossier-grid">
          <div>
            <h3>Buy box</h3>
            <ul>${summary.map((line) => `<li>${esc(line)}</li>`).join('') || '<li class="tf-dossier-muted">—</li>'}</ul>
          </div>
          <div>
            <h3>Fit checklist</h3>
            ${checklistHtml(Object.assign({}, row, {
              hits: (active && active.hits) || row.hits,
              blockers: (active && active.blockers) || row.blockers,
              unknowns: (active && active.unknowns) || row.unknowns
            }))}
          </div>
          <div>
            <h3>Pitch notes</h3>
            <p>${esc(fund.pitchNotes || fund.strategy || '—')}</p>
            <p class="tf-dossier-muted" style="margin-top:0.5rem">${esc(fund.type || '')}</p>
          </div>
          <div>
            <h3>Not buying</h3>
            <ul>${notBuying.length
              ? notBuying.map((line) => `<li>${esc(line)}</li>`).join('')
              : '<li class="tf-dossier-muted">Nothing listed</li>'}</ul>
          </div>
        </div>
      </div>`;
  }

  function renderCard(row, hasInputs) {
    const fund = row.fund;
    const open = state.openId === fund.id;
    const active = activeBoxScore(row) || row.bestBox;
    const displayTier = active ? active.tier : row.tier;
    const displayScore = active ? active.score : row.score;
    const displayRow = active
      ? Object.assign({}, row, {
        tier: active.tier,
        score: active.score,
        hits: active.hits,
        blockers: active.blockers,
        unknowns: active.unknowns,
        bestBox: active
      })
      : row;

    const boxNote = active && active.boxLabel
      ? `Best box: ${active.boxLabel}`
      : (fund.strategyClusters || []).join(' · ');
    const also = (fund.buyBoxes || []).length > 1 && active
      ? (fund.buyBoxes || []).filter((b) => b.id !== active.boxId).map((b) => b.label).join(', ')
      : '';
    const compared = state.compareIds.includes(fund.id);
    const showActions = hasInputs && (displayTier === 'strong' || displayTier === 'partial');

    return `
      <article class="tf-card tf-card--${esc(displayTier)}${open ? ' is-open' : ''}" data-fund-id="${esc(fund.id)}">
        <button type="button" class="tf-card-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-controls="tf-dossier-${esc(fund.id)}">
          <span class="tf-tier tf-tier--${esc(displayTier)}">
            <strong>${hasInputs && displayTier !== 'unknown' ? esc(String(displayScore)) : '—'}</strong>
            ${esc(displayTier === 'unknown' ? 'Browse' : displayTier)}
          </span>
          <span class="tf-card-main">
            <h3 class="tf-card-name">${esc(fund.name)}</h3>
            <p class="tf-card-one">${esc(fund.oneLiner)}</p>
            <p class="tf-card-meta">${esc(boxNote)}${also ? ' · also ' + esc(also) : ''}</p>
            <div class="tf-personality">${personalityBadges(fund)}</div>
            ${hasInputs ? `<div class="tf-reasons">${reasonChips(displayRow)}</div>` : ''}
            ${showActions ? `<div class="tf-card-actions" data-stop="1">
              <button type="button" class="phuglee-btn phuglee-btn-primary" data-action="pitch" data-fund-id="${esc(fund.id)}">Copy pitch</button>
              <label class="tf-compare-check"><input type="checkbox" data-action="compare" data-fund-id="${esc(fund.id)}"${compared ? ' checked' : ''}> Compare</label>
            </div>` : ''}
          </span>
          <svg class="tf-card-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${renderDossier(displayRow)}
      </article>`;
  }

  function renderFitStrip(counts, hasInputs) {
    const strip = $('tf-fit-strip');
    if (!strip) return;
    if (!hasInputs) {
      strip.hidden = true;
      strip.innerHTML = '';
      return;
    }
    strip.hidden = false;
    const mk = (tier, label, n) => {
      const active = state.tierFilter === tier || (!state.tierFilter && tier === '');
      return `<button type="button" class="tf-fit-btn tf-fit-btn--${tier || 'all'}${state.tierFilter === tier ? ' is-active' : ''}${!state.tierFilter && tier === '' ? ' is-active' : ''}" data-tier="${esc(tier)}">${esc(label)} ${n}</button>`;
    };
    strip.innerHTML = [
      mk('', 'All', counts.strong + counts.partial + counts.miss),
      mk('strong', 'Strong', counts.strong),
      mk('partial', 'Partial', counts.partial),
      mk('miss', 'Miss', counts.miss)
    ].join('');
  }

  function renderCompare() {
    const tray = $('tf-compare');
    const body = $('tf-compare-body');
    if (!tray || !body) return;
    const rows = state.rankedCache.filter((r) => state.compareIds.includes(r.fundId));
    if (!rows.length) {
      tray.hidden = true;
      body.innerHTML = '';
      return;
    }
    tray.hidden = false;
    const head = '<tr><th>Fund</th><th>Fit</th><th>Box</th><th>Markets</th><th>Blockers</th><th>Notes</th></tr>';
    const cells = rows.map((r) => {
      const markets = ((r.fund.buyBoxes || [])[0] || {}).markets || [];
      return `<tr>
        <td>${esc(r.fund.name)}</td>
        <td>${esc(r.tier)} ${r.score}%</td>
        <td>${esc((r.bestBox && r.bestBox.boxLabel) || '—')}</td>
        <td>${esc(markets.slice(0, 6).join(', '))}</td>
        <td>${esc((r.blockers || []).map((b) => b.reason).slice(0, 3).join('; ') || '—')}</td>
        <td>${esc((r.fund.pitchNotes || '').slice(0, 120))}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `<table class="tf-compare-table"><thead>${head}</thead><tbody>${cells}</tbody></table>`;
  }

  function renderMap(rows) {
    if (!window.TrustFundsMap) return;
    window.TrustFundsMap.mount($('tf-map'), {
      funds: state.funds,
      rows,
      activeState: state.stateFilter,
      onStateClick: (abbr) => {
        state.stateFilter = state.stateFilter === abbr ? '' : abbr;
        render();
      }
    });
  }

  function render() {
    const matchApi = window.TrustFundsMatch;
    const results = $('tf-results');
    const countEl = $('tf-count');
    if (!matchApi || !results) return;

    syncAssetMode();
    const deal = readDeal();
    const hasInputs = matchApi.dealHasInputs(deal);

    // Rank without tier filter first for strip counts
    const allRanked = matchApi.rankFunds(state.funds, deal, {
      cluster: state.cluster,
      stateFilter: state.stateFilter
    });
    const counts = matchApi.countTiers(allRanked);
    renderFitStrip(counts, hasInputs);

    let ranked = allRanked;
    if (state.tierFilter && hasInputs) {
      ranked = ranked.filter((r) => r.tier === state.tierFilter);
    }

    state.rankedCache = allRanked;

    const landHits = allRanked.filter((r) =>
      (r.fund.strategyClusters || []).includes('land')
      && (r.tier === 'strong' || r.tier === 'partial')
    ).length;
    const hint = $('tf-land-hint');
    if (hint) {
      if (hasInputs && matchApi.isLandAsset(deal) && landHits) {
        hint.hidden = false;
        hint.textContent = landHits + ' land buyer' + (landHits === 1 ? '' : 's') + ' ranked — house funds stay visible under Misses';
      } else {
        hint.hidden = true;
      }
    }

    if (countEl) {
      if (!hasInputs) {
        const landCount = ranked.filter((r) => (r.fund.strategyClusters || []).includes('land')).length;
        countEl.textContent = `${ranked.length} funds (${landCount} land) · enter a deal to rank fit`;
      } else {
        countEl.textContent = `${counts.strong} strong · ${counts.partial} partial · ${counts.miss} miss`;
      }
    }

    if (!ranked.length) {
      results.innerHTML = '<p class="tf-empty">No funds in this filter. Add city + asset to rank, or clear filters.</p>';
      renderCompare();
      scheduleUrl();
      renderMap(allRanked);
      return;
    }

    if (!hasInputs) {
      results.innerHTML = ranked.map((r) => renderCard(r, false)).join('');
    } else {
      const keep = ranked.filter((r) => r.tier !== 'miss');
      const misses = ranked.filter((r) => r.tier === 'miss');
      let html = keep.map((r) => renderCard(r, true)).join('');
      if (!keep.length && !state.showMisses) {
        html = '<p class="tf-empty">No Strong/Partial fits yet — open Misses or widen the deal inputs.</p>';
      }
      if (misses.length) {
        html += `<div class="tf-miss-wrap">
          <button type="button" class="phuglee-btn phuglee-btn-ghost tf-miss-toggle" id="tf-toggle-misses">
            ${state.showMisses ? 'Hide' : 'Show'} misses (${misses.length})
          </button>
          ${state.showMisses || state.tierFilter === 'miss' ? misses.map((r) => renderCard(r, true)).join('') : ''}
        </div>`;
      }
      results.innerHTML = html;
    }

    renderCompare();
    scheduleUrl();
    renderMap(allRanked);
  }

  function renderPresets() {
    const bar = $('tf-preset-bar');
    if (!bar || !window.TrustFundsPresets) return;
    const presets = window.TrustFundsPresets.getPresets(state.catalog);
    bar.innerHTML = presets.map((p) =>
      `<button type="button" class="tf-preset" data-preset="${esc(p.id)}">${esc(p.label)}</button>`
    ).join('');
  }

  function applyPreset(id) {
    const presets = window.TrustFundsPresets.getPresets(state.catalog);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    state.dealId = null;
    state.addressLabel = '';
    writeDeal(Object.assign({}, p.deal));
    state.tierFilter = '';
    state.stateFilter = '';
    state.showMisses = false;
    render();
    $('tf-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearForm() {
    const form = $('tf-form');
    if (form) form.reset();
    FLAG_KEYS.forEach((k) => { state.flags[k] = null; });
    state.openId = null;
    state.dealId = null;
    state.addressLabel = '';
    state.compareIds = [];
    state.tierFilter = '';
    state.stateFilter = '';
    state.showMisses = false;
    state.activeBoxByFund = {};
    setCluster('');
    paintFlags();
    syncAssetMode();
    updateDealChip();
    render();
  }

  function onResultsClick(ev) {
    const stop = ev.target.closest('[data-stop]');
    const actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const fundId = actionBtn.getAttribute('data-fund-id');
      if (action === 'pitch') {
        ev.preventDefault();
        ev.stopPropagation();
        const row = state.rankedCache.find((r) => r.fundId === fundId);
        if (!row || !window.TrustFundsPitch) return;
        const text = window.TrustFundsPitch.buildPitch(row.fund, row, readDeal());
        window.TrustFundsPitch.copyText(text).then(() => showToast('Pitch copied')).catch(() => showToast('Copy failed'));
        return;
      }
      if (action === 'compare') {
        ev.stopPropagation();
        const checked = actionBtn.checked;
        if (checked) {
          if (state.compareIds.length >= 3) {
            actionBtn.checked = false;
            showToast('Compare up to 3 funds');
            return;
          }
          if (!state.compareIds.includes(fundId)) state.compareIds.push(fundId);
        } else {
          state.compareIds = state.compareIds.filter((id) => id !== fundId);
        }
        renderCompare();
        scheduleUrl();
        return;
      }
    }

    const boxBtn = ev.target.closest('[data-box-fund]');
    if (boxBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      state.activeBoxByFund[boxBtn.getAttribute('data-box-fund')] = boxBtn.getAttribute('data-box-id');
      state.openId = boxBtn.getAttribute('data-box-fund');
      render();
      return;
    }

    if (ev.target.closest('#tf-toggle-misses')) {
      state.showMisses = !state.showMisses;
      render();
      return;
    }

    if (stop && !ev.target.closest('.tf-card-toggle')) return;

    const btn = ev.target.closest('.tf-card-toggle');
    if (!btn) return;
    if (ev.target.closest('[data-action]')) return;
    const card = btn.closest('[data-fund-id]');
    if (!card) return;
    const id = card.getAttribute('data-fund-id');
    state.openId = state.openId === id ? null : id;
    render();
  }

  async function openLoadDialog() {
    const dialog = $('tf-load-dialog');
    const list = $('tf-load-list');
    if (!dialog || !list || !window.TrustFundsLoadDeal) return;
    list.innerHTML = '<p class="tf-dossier-muted">Loading…</p>';
    dialog.showModal();
    try {
      const deals = await window.TrustFundsLoadDeal.listDeals();
      if (!deals.length) {
        list.innerHTML = '<p class="tf-dossier-muted">No pipeline/UC deals found.</p>';
        return;
      }
      list.innerHTML = deals.slice(0, 80).map((d) => `
        <button type="button" class="tf-load-item" data-deal-id="${esc(d.dealId)}">
          ${esc(d.address || d.dealId)}
          <small>${esc(d.stage || '')}${d.city ? ' · ' + esc(d.city) : ''}</small>
        </button>
      `).join('');
    } catch (err) {
      list.innerHTML = `<p class="tf-dossier-muted">${esc(err.message || 'Load failed')}</p>`;
    }
  }

  async function loadDealById(dealId) {
    if (!window.TrustFundsLoadDeal) return;
    try {
      const raw = await window.TrustFundsLoadDeal.getDeal(dealId);
      const model = window.TrustFundsLoadDeal.mapDealToModel(raw.deal || raw);
      writeDeal(model);
      state.dealId = dealId;
      state.addressLabel = model.address || dealId;
      updateDealChip();
      render();
      showToast('Deal loaded');
      $('tf-load-dialog')?.close();
    } catch (err) {
      showToast(err.message || 'Load failed');
    }
  }

  function hydrateFromUrl() {
    if (!window.TrustFundsUrl) return null;
    return window.TrustFundsUrl.parse(window.location.search);
  }

  function bind() {
    buildFlagControls();
    const form = $('tf-form');
    if (form) {
      form.addEventListener('input', () => render());
      form.addEventListener('change', () => render());
      form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
    }
    $('tf-asset')?.addEventListener('change', () => {
      syncAssetMode();
      render();
    });
    $('tf-clear')?.addEventListener('click', clearForm);
    $('tf-results')?.addEventListener('click', onResultsClick);
    document.querySelector('.tf-filters')?.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-cluster]');
      if (!chip) return;
      setCluster(chip.getAttribute('data-cluster') || '');
      render();
    });
    $('tf-fit-strip')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-tier]');
      if (!btn) return;
      state.tierFilter = btn.getAttribute('data-tier') || '';
      if (state.tierFilter === 'miss') state.showMisses = true;
      render();
    });
    $('tf-preset-bar')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-preset]');
      if (!btn) return;
      applyPreset(btn.getAttribute('data-preset'));
    });
    $('tf-copy-link')?.addEventListener('click', async () => {
      if (!window.TrustFundsUrl || !window.TrustFundsPitch) return;
      const url = window.location.origin + window.TrustFundsUrl.applyToUrl(urlState(), true);
      await window.TrustFundsPitch.copyText(url);
      showToast('Link copied');
    });
    $('tf-load-deal')?.addEventListener('click', openLoadDialog);
    $('tf-load-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-deal-id]');
      if (!btn) return;
      loadDealById(btn.getAttribute('data-deal-id'));
    });
    $('tf-compare-clear')?.addEventListener('click', () => {
      state.compareIds = [];
      render();
    });
    $('tf-compare-copy')?.addEventListener('click', async () => {
      if (!window.TrustFundsPitch) return;
      const rows = state.rankedCache.filter((r) => state.compareIds.includes(r.fundId));
      await window.TrustFundsPitch.copyText(window.TrustFundsPitch.buildCompareSummary(rows));
      showToast('Compare summary copied');
    });
    syncAssetMode();
  }

  async function loadCatalog() {
    const res = await fetch(CATALOG_URL, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load fund catalog');
    const data = await res.json();
    state.catalog = data;
    state.funds = data.funds || [];
  }

  async function boot() {
    if (!isContractDesk()) {
      $('tf-gate').hidden = false;
      $('tf-app').hidden = true;
      return;
    }
    $('tf-gate').hidden = true;
    $('tf-app').hidden = false;
    bind();
    try {
      await loadCatalog();
      renderPresets();

      const hydrated = hydrateFromUrl();
      if (hydrated) {
        state.cluster = hydrated.cluster || '';
        state.tierFilter = hydrated.tierFilter || '';
        state.stateFilter = hydrated.stateFilter || '';
        state.openId = hydrated.openId;
        state.compareIds = hydrated.compareIds || [];
        state.showMisses = !!hydrated.showMisses;
        setCluster(state.cluster);
        if (hydrated.dealId) {
          await loadDealById(hydrated.dealId);
        } else {
          writeDeal(hydrated.deal);
        }
      }
      render();
    } catch (err) {
      showToast(err.message || 'Failed to load Trust Funds');
      const results = $('tf-results');
      if (results) results.innerHTML = '<p class="tf-empty">Catalog failed to load.</p>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
