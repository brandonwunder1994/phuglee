(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const API = '/api/buyers';
  const CATALOG_FALLBACK = '/data/buyers/catalog.json';

  const FLAG_KEYS = [
    'brick', 'garage', 'offMarket', 'leaseback', 'waterfront',
    'buildable', 'roadAccess', 'utilitiesNearby'
  ];

  const PITCH_STATUSES = ['waiting', 'passed', 'won'];

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
    rankedCache: [],
    buyerPitches: [],
    pitchSaving: false
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

  function apiHeaders() {
    const h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const user = sessionUser();
    if (user) h['X-Phuglee-User'] = user;
    if (user === ADMIN || user === DISPOS) h['X-Phuglee-Plan'] = 'max';
    return h;
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

  function upsertPitch(buyerId, buyerName, status) {
    const list = (state.buyerPitches || []).filter((p) => p.buyerId !== buyerId);
    list.push({
      buyerId,
      buyerName,
      status,
      at: new Date().toISOString(),
      by: sessionUser() || '',
      note: ''
    });
    state.buyerPitches = list;
  }

  function getPitchStatus(buyerId) {
    const row = (state.buyerPitches || []).find((p) => p.buyerId === buyerId);
    return row ? row.status : null;
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
    if (!window.BuyersUrl) return;
    clearTimeout(state.urlTimer);
    state.urlTimer = setTimeout(() => {
      window.BuyersUrl.applyToUrl(urlState(), true);
    }, 200);
  }

  function speedBadge(fund) {
    const speed = (fund.personality && fund.personality.speed) || '';
    if (!speed) return '';
    const labels = {
      hours: 'Hours close',
      fast: 'Fast close',
      weekly: 'Weekly',
      normal: 'Normal',
      process: 'Process'
    };
    return `<span class="tf-badge tf-badge--speed">${esc(labels[speed] || speed)}</span>`;
  }

  function personalityBadges(fund) {
    const p = fund.personality || {};
    const bits = [];
    if (p.pay) bits.push(p.pay);
    if (p.dd === 'none') bits.push('No DD');
    else if (p.dd) bits.push('DD ' + p.dd);
    if (p.emd) bits.push('EMD ' + p.emd);
    (p.tags || []).slice(0, 2).forEach((t) => bits.push(t));
    return speedBadge(fund) + bits.map((b) => `<span class="tf-badge">${esc(b)}</span>`).join('');
  }

  function staleChip(fund) {
    if (!window.BuyersAsk || !window.BuyersAsk.isStale(fund)) return '';
    const label = window.BuyersAsk.staleLabel(fund);
    return label ? `<span class="tf-badge tf-badge--stale">${esc(label)}</span>` : '';
  }

  function askBlock(fund, deal, tier) {
    if (!window.BuyersAsk || (tier !== 'strong' && tier !== 'partial')) return '';
    const ask = window.BuyersAsk.suggestAsk(fund, deal);
    if (!ask.ok) return '';
    let html = `<div class="tf-ask-block"><span class="tf-ask-mid">${esc(ask.label)}</span>`;
    if (ask.vsAskingLabel) {
      const cls = ask.vsAsking >= 0 ? 'tf-ask-vs--above' : 'tf-ask-vs--below';
      html += `<span class="tf-ask-vs ${cls}">${esc(ask.vsAskingLabel)}</span>`;
    }
    html += '</div>';
    return html;
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

  function contactHtml(fund) {
    const c = fund.contact || {};
    const lines = [];
    if (c.name) lines.push(`<li><strong>${esc(c.name)}</strong></li>`);
    if (c.phone) lines.push(`<li>${esc(c.phone)}</li>`);
    if (c.email) lines.push(`<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
    if (c.notes) lines.push(`<li class="tf-dossier-muted">${esc(c.notes)}</li>`);
    if (!lines.length) return '';
    return `<div>
      <h3>Contact</h3>
      <ul>${lines.join('')}</ul>
    </div>`;
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

  function pitchActionBtns(fundId, showPitchActions) {
    if (!showPitchActions) return '';
    const status = getPitchStatus(fundId);
    return PITCH_STATUSES.map((s) => {
      const active = status === s ? ' is-active' : '';
      return `<button type="button" class="tf-pitch-btn${active}" data-action="pitch-status" data-status="${s}" data-fund-id="${esc(fundId)}">${esc(s.charAt(0).toUpperCase() + s.slice(1))}</button>`;
    }).join('');
  }

  function pitchStatusBadge(fundId, showPitchActions) {
    if (!showPitchActions) return '';
    const status = getPitchStatus(fundId);
    return status
      ? `<span class="tf-pitch-status tf-pitch-status--${esc(status)}">${esc(status)}</span>`
      : '';
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
          ${contactHtml(fund)}
        </div>
      </div>`;
  }

  function renderCard(row, hasInputs, pitchRank) {
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
    const deal = readDeal();
    const rankHint = pitchRank != null && pitchRank <= 3
      ? `<span class="tf-key-hint" title="Press ${pitchRank} to copy pitch">${pitchRank}</span>`
      : '';

    return `
      <article class="tf-card tf-card--${esc(displayTier)}${open ? ' is-open' : ''}" data-fund-id="${esc(fund.id)}">
        <button type="button" class="tf-card-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-controls="tf-dossier-${esc(fund.id)}">
          <span class="tf-tier tf-tier--${esc(displayTier)}">
            ${rankHint}
            <strong>${hasInputs && displayTier !== 'unknown' ? esc(String(displayScore)) : '—'}</strong>
            ${esc(displayTier === 'unknown' ? 'Browse' : displayTier)}
          </span>
          <span class="tf-card-main">
            <h3 class="tf-card-name">${esc(fund.name)}</h3>
            <p class="tf-card-one">${esc(fund.oneLiner)}</p>
            <p class="tf-card-meta">${esc(boxNote)}${also ? ' · also ' + esc(also) : ''}</p>
            <div class="tf-personality">${personalityBadges(fund)}${staleChip(fund)}</div>
            ${askBlock(fund, deal, displayTier)}
            ${hasInputs ? `<div class="tf-reasons">${reasonChips(displayRow)}</div>` : ''}
            ${pitchStatusBadge(fund.id, !!state.dealId && showActions)}
            ${showActions ? `<div class="tf-card-actions" data-stop="1">
              <button type="button" class="phuglee-btn phuglee-btn-primary" data-action="pitch" data-fund-id="${esc(fund.id)}">Copy pitch</button>
              <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="pitch-line" data-fund-id="${esc(fund.id)}">Pitch sheet line</button>
              ${pitchActionBtns(fund.id, !!state.dealId)}
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
      strip.classList.remove('is-sticky');
      return;
    }
    strip.hidden = false;
    strip.classList.add('is-sticky');
    const mk = (tier, label, n) => {
      const active = state.tierFilter === tier || (!state.tierFilter && tier === '');
      return `<button type="button" class="tf-fit-btn tf-fit-btn--${tier || 'all'}${active ? ' is-active' : ''}" data-tier="${esc(tier)}">${esc(label)} ${n}</button>`;
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
    const head = '<tr><th>Buyer</th><th>Fit</th><th>Box</th><th>Markets</th><th>Blockers</th><th>Notes</th></tr>';
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
    if (!window.BuyersMap) return;
    window.BuyersMap.mount($('tf-map'), {
      funds: state.funds,
      rows,
      activeState: state.stateFilter,
      onStateClick: (abbr) => {
        state.stateFilter = state.stateFilter === abbr ? '' : abbr;
        render();
      }
    });
  }

  function pitchCandidates() {
    const strong = state.rankedCache.filter((r) => r.tier === 'strong');
    const partial = state.rankedCache.filter((r) => r.tier === 'partial');
    return strong.concat(partial).slice(0, 3);
  }

  function keyboardPitchTargets() {
    return pitchCandidates();
  }

  function gapsText(row) {
    const blocks = (row.blockers || []).map((b) => b.reason);
    const unknowns = (row.unknowns || []).map((u) => u.reason);
    const gaps = blocks.concat(unknowns).filter(Boolean);
    return gaps.length ? gaps.slice(0, 6).join('; ') : 'None flagged';
  }

  function contactLine(fund) {
    const c = fund.contact || {};
    const parts = [c.name, c.phone, c.email].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }

  function buildPitchSheetHtml() {
    const deal = readDeal();
    const addr = [deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(', ') || '[address]';
    const rows = pitchCandidates();
    if (!rows.length) {
      return '<p class="tf-dossier-muted">Enter deal details and get Strong/Partial fits to build a pitch sheet.</p>';
    }
    return rows.map((row, i) => {
      const fund = row.fund;
      const ask = window.BuyersAsk ? window.BuyersAsk.suggestAsk(fund, deal) : { ok: false };
      const askLine = ask.ok ? ask.label + (ask.vsAskingLabel ? ' · ' + ask.vsAskingLabel : '') : '—';
      return `<article class="tf-pitch-sheet-card">
        <h4>${i + 1}. ${esc(fund.name)} <span class="tf-pitch-sheet-tier tf-tier--${esc(row.tier)}">${esc(row.tier)} ${row.score}%</span></h4>
        <p><strong>Deal:</strong> ${esc(addr)}</p>
        <p><strong>Suggested ask:</strong> ${esc(askLine)}</p>
        <p><strong>Gaps to confirm:</strong> ${esc(gapsText(row))}</p>
        <p><strong>Contact:</strong> ${esc(contactLine(fund))}</p>
      </article>`;
    }).join('');
  }

  function openPitchSheet() {
    const dialog = $('tf-pitch-sheet');
    const body = $('tf-pitch-sheet-body');
    const lead = $('tf-pitch-sheet-lead');
    if (!dialog || !body) return;
    const deal = readDeal();
    const addr = [deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(', ');
    if (lead) {
      lead.textContent = addr
        ? `Top fits for ${addr}`
        : 'Top Strong/Partial buyers for the current deal check';
    }
    body.innerHTML = buildPitchSheetHtml();
    dialog.showModal();
  }

  function render() {
    const matchApi = window.BuyersMatch;
    const results = $('tf-results');
    const countEl = $('tf-count');
    if (!matchApi || !results) return;

    syncAssetMode();
    const deal = readDeal();
    const hasInputs = matchApi.dealHasInputs(deal);

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
        hint.textContent = landHits + ' land buyer' + (landHits === 1 ? '' : 's') + ' ranked — house buyers stay visible under Misses';
      } else {
        hint.hidden = true;
      }
    }

    const totalBuyers = state.funds.length;
    if (countEl) {
      if (!hasInputs) {
        const landCount = ranked.filter((r) => (r.fund.strategyClusters || []).includes('land')).length;
        countEl.textContent = `${totalBuyers} buyers (${landCount} land) · enter a deal to rank fit`;
      } else {
        countEl.textContent = `${counts.strong} strong · ${counts.partial} partial · ${counts.miss} miss · ${totalBuyers} buyers`;
      }
    }

    const pitchRanks = {};
    keyboardPitchTargets().forEach((r, i) => { pitchRanks[r.fundId] = i + 1; });

    if (!ranked.length) {
      results.innerHTML = '<p class="tf-empty">No buyers in this filter. Add city + asset to rank, or clear filters.</p>';
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
      let html = keep.map((r) => renderCard(r, true, pitchRanks[r.fundId])).join('');
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
    if (!bar || !window.BuyersPresets) return;
    const presets = window.BuyersPresets.getPresets(state.catalog);
    bar.innerHTML = presets.map((p) =>
      `<button type="button" class="tf-preset" data-preset="${esc(p.id)}">${esc(p.label)}</button>`
    ).join('');
  }

  function applyPreset(id) {
    const presets = window.BuyersPresets.getPresets(state.catalog);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    state.dealId = null;
    state.addressLabel = '';
    state.buyerPitches = [];
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
    state.buyerPitches = [];
    setCluster('');
    paintFlags();
    syncAssetMode();
    updateDealChip();
    render();
  }

  async function savePitches() {
    if (!state.dealId || state.pitchSaving) return;
    state.pitchSaving = true;
    try {
      const res = await fetch('/api/leads/admin/contracts/' + encodeURIComponent(state.dealId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: apiHeaders(),
        body: JSON.stringify({ buyerPitches: state.buyerPitches })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save pitch status');
      showToast('Pitch status saved');
    } catch (err) {
      showToast(err.message || 'Save failed');
    } finally {
      state.pitchSaving = false;
    }
  }

  async function setPitchStatus(fundId, fundName, status) {
    if (!state.dealId) {
      showToast('Load a deal first to track pitches');
      return;
    }
    upsertPitch(fundId, fundName, status);
    render();
    await savePitches();
  }

  function copyPitchForRow(row) {
    if (!row || !window.BuyersPitch) return;
    const text = window.BuyersPitch.buildPitch(row.fund, row, readDeal());
    return window.BuyersPitch.copyText(text).then(() => showToast('Pitch copied')).catch(() => showToast('Copy failed'));
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
        copyPitchForRow(row);
        return;
      }
      if (action === 'pitch-line') {
        ev.preventDefault();
        ev.stopPropagation();
        const row = state.rankedCache.find((r) => r.fundId === fundId);
        if (!row || !window.BuyersPitch) return;
        const deal = readDeal();
        const fund = row.fund;
        const ask = window.BuyersAsk ? window.BuyersAsk.suggestAsk(fund, deal) : null;
        const addr = [deal.address, deal.city, deal.state].filter(Boolean).join(', ');
        const line = [
          fund.name,
          addr,
          ask && ask.ok ? ask.label : null,
          gapsText(row) !== 'None flagged' ? 'Gaps: ' + gapsText(row) : null,
          contactLine(fund) !== '—' ? contactLine(fund) : null
        ].filter(Boolean).join(' · ');
        window.BuyersPitch.copyText(line).then(() => showToast('Pitch line copied')).catch(() => showToast('Copy failed'));
        return;
      }
      if (action === 'pitch-status') {
        ev.preventDefault();
        ev.stopPropagation();
        const row = state.rankedCache.find((r) => r.fundId === fundId);
        const status = actionBtn.getAttribute('data-status');
        if (!row || !PITCH_STATUSES.includes(status)) return;
        setPitchStatus(fundId, row.fund.name, status);
        return;
      }
      if (action === 'compare') {
        ev.stopPropagation();
        const checked = actionBtn.checked;
        if (checked) {
          if (state.compareIds.length >= 3) {
            actionBtn.checked = false;
            showToast('Compare up to 3 buyers');
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

  function onKeyDown(ev) {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const n = Number(ev.key);
    if (n < 1 || n > 3) return;
    const targets = keyboardPitchTargets();
    const row = targets[n - 1];
    if (!row) return;
    ev.preventDefault();
    copyPitchForRow(row);
  }

  async function openLoadDialog() {
    const dialog = $('tf-load-dialog');
    const list = $('tf-load-list');
    if (!dialog || !list || !window.BuyersLoadDeal) return;
    list.innerHTML = '<p class="tf-dossier-muted">Loading…</p>';
    dialog.showModal();
    try {
      const deals = await window.BuyersLoadDeal.listDeals();
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
    if (!window.BuyersLoadDeal) return;
    try {
      const raw = await window.BuyersLoadDeal.getDeal(dealId);
      const dealObj = raw.deal || raw;
      const model = window.BuyersLoadDeal.mapDealToModel(dealObj);
      writeDeal(model);
      state.dealId = dealId;
      state.addressLabel = model.address || dealId;
      state.buyerPitches = Array.isArray(dealObj.buyerPitches) ? dealObj.buyerPitches.slice() : [];
      updateDealChip();
      render();
      showToast('Deal loaded');
      $('tf-load-dialog')?.close();
    } catch (err) {
      showToast(err.message || 'Load failed');
    }
  }

  function openAddDialog() {
    const dialog = $('tf-add-dialog');
    const form = $('tf-add-form');
    const errEl = $('tf-add-error');
    if (!dialog || !form) return;
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    form.reset();
    dialog.showModal();
  }

  function closeAddDialog() {
    const dialog = $('tf-add-dialog');
    const errEl = $('tf-add-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (dialog && dialog.open) dialog.close();
  }

  async function submitAddBuyer(ev) {
    ev.preventDefault();
    const submitter = ev.submitter;
    // Cancel / Escape / method=dialog without Save must never hit required-field validation.
    if (submitter && submitter.value && submitter.value !== 'save') {
      closeAddDialog();
      return;
    }
    if (submitter && submitter.id === 'tf-add-cancel') {
      closeAddDialog();
      return;
    }
    const form = $('tf-add-form');
    const errEl = $('tf-add-error');
    if (!form) return;

    const fd = new FormData(form);
    const payload = {};
    fd.forEach((val, key) => {
      if (val != null && String(val).trim() !== '') payload[key] = val;
    });

    if (!payload.name || !String(payload.name).trim()) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Buyer name is required';
      }
      return;
    }

    const saveBtn = $('tf-add-save');
    if (saveBtn) saveBtn.disabled = true;
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    try {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: apiHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to add buyer');
      if (data.catalog) {
        state.catalog = data.catalog;
        state.funds = data.catalog.funds || [];
      } else {
        await loadCatalog();
      }
      renderPresets();
      render();
      $('tf-add-dialog')?.close();
      showToast('Buyer added');
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || 'Save failed';
      } else {
        showToast(err.message || 'Save failed');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function hydrateFromUrl() {
    if (!window.BuyersUrl) return null;
    return window.BuyersUrl.parse(window.location.search);
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
    document.addEventListener('keydown', onKeyDown);
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
      if (!window.BuyersUrl || !window.BuyersPitch) return;
      const url = window.location.origin + window.BuyersUrl.applyToUrl(urlState(), true);
      await window.BuyersPitch.copyText(url);
      showToast('Link copied');
    });
    $('tf-load-deal')?.addEventListener('click', openLoadDialog);
    $('tf-add-buyer')?.addEventListener('click', openAddDialog);
    $('tf-add-cancel')?.addEventListener('click', closeAddDialog);
    $('tf-add-cancel-x')?.addEventListener('click', closeAddDialog);
    $('tf-add-form')?.addEventListener('submit', submitAddBuyer);
    $('tf-add-dialog')?.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      closeAddDialog();
    });
    $('tf-pitch-sheet-btn')?.addEventListener('click', openPitchSheet);
    $('tf-pitch-sheet-print')?.addEventListener('click', () => window.print());
    $('tf-pitch-sheet-close')?.addEventListener('click', () => $('tf-pitch-sheet')?.close());
    $('tf-pitch-sheet-close2')?.addEventListener('click', () => $('tf-pitch-sheet')?.close());
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
      if (!window.BuyersPitch) return;
      const rows = state.rankedCache.filter((r) => state.compareIds.includes(r.fundId));
      await window.BuyersPitch.copyText(window.BuyersPitch.buildCompareSummary(rows));
      showToast('Compare summary copied');
    });
    syncAssetMode();
  }

  async function loadCatalog() {
    try {
      const res = await fetch(API, { cache: 'no-store', credentials: 'same-origin', headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.catalog) {
          state.catalog = data.catalog;
          state.funds = data.catalog.funds || [];
          return;
        }
      }
    } catch (_) { /* fallback below */ }

    const res = await fetch(CATALOG_FALLBACK, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load buyer catalog');
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
      showToast(err.message || 'Failed to load Buyers');
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
