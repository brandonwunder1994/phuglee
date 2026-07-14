(function () {
  'use strict';

  const ADMIN = 'admin';
  const DISPOS = 'brad';
  const STAGE_LABELS = {
    under_contract: 'Under contract',
    buyer_found: 'Buyer found',
    closing: 'Closing',
    funded: 'Funded'
  };
  const DOC_LABELS = {
    purchase_contract: 'Purchase contract',
    addendum: 'Addendum',
    amendment: 'Amendment',
    aoc: 'AOC',
    jv: 'JV agreement',
    other: 'Other'
  };
  const POLL_MS = 12000;

  const state = {
    deals: [],
    totals: null,
    ghlConfigured: false,
    editingId: null,
    activeDealId: null,
    profile: null,
    contact: null,
    messages: [],
    fromNumber: null,
    toNumber: null,
    pollTimer: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function sessionUser() {
    try {
      if (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function') {
        return window.PhugleeSession.getSessionUser() || '';
      }
    } catch (_) { /* ignore */ }
    try {
      return sessionStorage.getItem('phuglee_session') || '';
    } catch (_) {
      return '';
    }
  }

  function isAdmin() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    return sessionUser() === ADMIN;
  }

  function isContractDesk() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function') {
      return window.PhugleeSettings.isContractDesk() === true;
    }
    const user = sessionUser();
    return user === ADMIN || user === DISPOS;
  }

  function applyAdminOnlyUi() {
    if (isAdmin()) return;
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.hidden = true;
    });
  }

  function showToast(msg) {
    const el = $('uc-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function money(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Number(n));
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      ...opts,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function thumbHtml(d, sizeClass) {
    const url = d.thumbUrl || d.streetViewUrl || d.satelliteUrl || '';
    if (url) {
      return `<img class="${sizeClass}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${sizeClass} uc-thumb--empty',textContent:'SV'}))">`;
    }
    return `<div class="${sizeClass} uc-thumb--empty" aria-hidden="true">SV</div>`;
  }

  function renderKpis(totals) {
    const t = totals || {};
    const by = t.byStage || {};
    $('uc-kpi-uc').textContent = String(by.under_contract || t.underContract || 0);
    $('uc-kpi-buyer').textContent = String(by.buyer_found || t.buyerFound || 0);
    $('uc-kpi-closing').textContent = String(by.closing || t.closing || 0);
    if ($('uc-kpi-open-fees')) {
      $('uc-kpi-open-fees').textContent = money(t.openAssignmentFees || 0);
    }
    $('uc-kpi-funded').textContent = String(by.funded || t.funded || t.closedCount || 0);
    $('uc-kpi-fees').textContent = money(t.closedAssignmentFees ?? t.totalAssignmentFees ?? 0);
    if ($('uc-kpi-tc')) $('uc-kpi-tc').textContent = money(t.closedTcPay ?? t.totalTcPay ?? 0);
    if ($('uc-kpi-acq')) $('uc-kpi-acq').textContent = money(t.closedAcqPay ?? t.totalAcqPay ?? 0);
    if ($('uc-kpi-dispo')) $('uc-kpi-dispo').textContent = money(t.closedDispoPay ?? t.totalDispoPay ?? 0);
  }

  function renderTable(deals) {
    const tbody = $('uc-tbody');
    const table = $('uc-table');
    const empty = $('uc-empty');
    const count = $('uc-board-count');
    if (!tbody) return;

    if (!deals.length) {
      table.hidden = true;
      empty.hidden = false;
      count.textContent = '0 deals';
      tbody.innerHTML = '';
      return;
    }

    empty.hidden = true;
    table.hidden = false;
    count.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;

    tbody.innerHTML = deals.map((d) => {
      const { street, cityLine } = propertyLines(d);
      const stage = STAGE_LABELS[d.stage] || d.stage || '—';
      const releaseBtn = isAdmin()
        ? '<button type="button" class="phuglee-btn phuglee-btn-ghost uc-release-btn" data-action="release" data-admin-only>Release</button>'
        : '';
      return `<tr data-deal-id="${esc(d.dealId)}" class="uc-row-clickable">
        <td class="uc-property-cell">
          <div class="uc-property-block">
            <button type="button" class="uc-property-btn" data-action="open">
              ${thumbHtml(d, 'uc-thumb')}
              <span class="uc-property-text">
                <span class="uc-addr">${esc(street)}</span>
                <span class="uc-addr-meta">${esc(cityLine || '—')}</span>
              </span>
            </button>
            <div class="uc-property-quick">
              <button type="button" class="uc-quick-btn" data-action="buyer-found">Buyer Found</button>
              <button type="button" class="uc-quick-btn uc-quick-btn--jv" data-action="send-jv">Send JV</button>
              <button type="button" class="uc-quick-btn uc-quick-btn--amd" data-action="amendment">Amendment</button>
            </div>
          </div>
        </td>
        <td><span class="uc-stage" data-stage="${esc(d.stage)}">${esc(stage)}</span></td>
        <td class="uc-money">${esc(money(d.purchasePrice))}</td>
        <td class="uc-closing-cell">${esc(d.closingDisplay || d.closingDate || '—')}</td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.titleOpened || '')}">${esc(d.titleOpenedLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.sellerEmdSubmitted || '')}">${esc(d.sellerEmdLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--access" data-access="${esc(d.accessType || '')}">${esc(d.accessDisplay || d.accessLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--vacancy" data-vacancy="${esc(d.vacancy || '')}">${esc(d.vacancyLabel || '—')}</span></td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.photosAvailable || '')}">${esc(d.photosLabel || '—')}</span></td>
        <td>
          <button type="button" class="uc-rehab-cell" data-action="view-rehab" title="View rehab info">
            <span class="uc-pill uc-pill--yn" data-yn="${esc(d.rehabInfoReady || '')}">${esc(d.rehabInfoLabel || '—')}</span>
            <span class="uc-rehab-link">Click Here</span>
          </button>
        </td>
        <td><span class="uc-pill uc-pill--yn" data-yn="${esc(d.buyerEmdSubmitted || '')}">${esc(d.buyerEmdLabel || '—')}</span></td>
        <td class="uc-money">${esc(money(d.assignmentFee))}</td>
        <td class="uc-money">${esc(money(d.tcPay))}</td>
        <td class="uc-money">${esc(money(d.acqPay))}</td>
        <td class="uc-money">${esc(money(d.dispoPay))}</td>
        <td>
          <div class="uc-row-actions">
            <button type="button" class="phuglee-btn phuglee-btn-ghost" data-action="edit">Edit</button>
            ${releaseBtn}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  /** Street on line 1; city, state zip on line 2 — never stack the full one-line address. */
  function propertyLines(deal) {
    const city = String(deal.city || '').trim();
    const state = String(deal.state || '').trim();
    const zip = String(deal.zip || deal.postalCode || '').trim();
    const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    let street = String(deal.address || '').trim();
    if (street && city && street.toLowerCase().includes(city.toLowerCase())) {
      const cut = street.toLowerCase().lastIndexOf(city.toLowerCase());
      if (cut > 0) street = street.slice(0, cut).replace(/[,\s]+$/, '');
    }
    return { street: street || '—', cityLine };
  }

  async function loadDeals() {
    const data = await api('/api/leads/admin/contracts');
    state.deals = data.deals || [];
    state.totals = data.totals || null;
    state.ghlConfigured = !!data.ghlConfigured;
    renderKpis(state.totals);
    renderTable(state.deals);

    const status = $('uc-ghl-status');
    const syncBtn = $('uc-sync-ghl');
    if (status) {
      if (!state.ghlConfigured) {
        status.hidden = false;
        status.classList.add('is-warn');
        status.textContent = 'GHL not configured — set GHL_API_KEY and GHL_LOCATION_ID, then Sync.';
      } else {
        status.hidden = false;
        status.classList.remove('is-warn');
        status.textContent = 'GHL connected · Sync pulls DTS Seller Signed → Funded · Open a deal to text from the last outbound line.';
      }
    }
    if (syncBtn) syncBtn.disabled = false;
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    state.pollTimer = setInterval(() => {
      if (state.activeDealId) loadMessages(state.activeDealId, { silent: true }).catch(() => {});
    }, POLL_MS);
  }

  function renderMessages() {
    const box = $('uc-convo-thread');
    if (!box) return;
    if (!state.messages.length) {
      box.innerHTML = '<p class="uc-convo-empty">No SMS yet. Send the first message below.</p>';
      return;
    }
    box.innerHTML = state.messages.map((m) => {
      const outbound = m.direction === 'outbound' || m.direction === 'out';
      const when = m.dateAdded ? new Date(m.dateAdded).toLocaleString() : '';
      return `<div class="uc-bubble ${outbound ? 'uc-bubble--out' : 'uc-bubble--in'}">
        <div class="uc-bubble-body">${esc(m.body)}</div>
        <div class="uc-bubble-meta">${outbound ? 'You' : 'Them'}${when ? ' · ' + esc(when) : ''}</div>
      </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function loadMessages(dealId, opts = {}) {
    const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/messages`);
    state.messages = data.messages || [];
    state.fromNumber = data.fromNumber || null;
    state.toNumber = data.toNumber || null;
    const meta = $('uc-convo-meta');
    if (meta) {
      meta.textContent = state.fromNumber && state.toNumber
        ? `From ${state.fromNumber} → ${state.toNumber}`
        : (data.warning || 'SMS numbers resolving…');
    }
    renderMessages();
    if (!opts.silent) showToast(`Loaded ${state.messages.length} messages`);
  }

  function renderProfile(deal, contact) {
    state.profile = deal;
    state.contact = contact;
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (!drawer) return;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('uc-drawer-open');

    $('uc-drawer-title').textContent = deal.address || 'Contract profile';
    $('uc-drawer-hero').innerHTML = thumbHtml(deal, 'uc-profile-hero') +
      `<div class="uc-profile-hero-copy">
        <p class="uc-stage" data-stage="${esc(deal.stage)}">${esc(STAGE_LABELS[deal.stage] || deal.stage)}</p>
        <h2>${esc(deal.address || '—')}</h2>
        <p>${esc([deal.city, deal.state, deal.zip].filter(Boolean).join(', '))}</p>
      </div>`;

    const rows = [
      ['Owner / seller', deal.ownerName || contact?.sellersName || contact?.name || '—'],
      ['Phone', deal.phone || contact?.phone || '—'],
      ['Email', deal.email || contact?.email || '—'],
      ['Purchase price', money(deal.purchasePrice)],
      ['Assignment fee', money(deal.assignmentFee)],
      ['TC Pay', money(deal.tcPay)],
      ['Acq Pay', money(deal.acqPay)],
      ['Dispo Pay', money(deal.dispoPay)],
      ['Cash buyer', deal.cashBuyerName || contact?.cashBuyerName || '—'],
      ['Closing', deal.closingDate || contact?.closingDate || '—'],
      ['EMD Submitted?', deal.sellerEmdLabel || '—'],
      ['Buyer EMD?', deal.buyerEmdLabel || '—'],
      ['Access', deal.accessDisplay || deal.accessLabel || '—'],
      ['Vacancy', deal.vacancyLabel || '—'],
      ['Photos?', deal.photosLabel || '—'],
      ['Notes', deal.notes || '—']
    ];
    $('uc-drawer-facts').innerHTML = rows.map(([k, v]) =>
      `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
    ).join('');

    fillRehabForm(deal.rehabInfo || {});
    renderDocuments(deal.documents || []);
    renderDocsPending(deal);
    closeDocViewer();
    $('uc-convo-thread').innerHTML = '<p class="uc-convo-empty">Loading conversation…</p>';
    $('uc-sms-input').value = '';
  }

  function fillRehabForm(rehab) {
    const r = rehab || {};
    if ($('uc-rehab-roof')) $('uc-rehab-roof').value = r.roof || '';
    if ($('uc-rehab-ac')) $('uc-rehab-ac').value = r.ac || '';
    if ($('uc-rehab-foundation')) $('uc-rehab-foundation').value = r.foundation || '';
    if ($('uc-rehab-electrical')) $('uc-rehab-electrical').value = r.electrical || '';
    if ($('uc-rehab-plumbing')) $('uc-rehab-plumbing').value = r.plumbing || '';
    if ($('uc-rehab-other')) $('uc-rehab-other').value = r.other || '';
  }

  function readRehabForm() {
    return {
      roof: ($('uc-rehab-roof')?.value || '').trim(),
      ac: ($('uc-rehab-ac')?.value || '').trim(),
      foundation: ($('uc-rehab-foundation')?.value || '').trim(),
      electrical: ($('uc-rehab-electrical')?.value || '').trim(),
      plumbing: ($('uc-rehab-plumbing')?.value || '').trim(),
      other: ($('uc-rehab-other')?.value || '').trim()
    };
  }

  async function saveRehab() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const btn = $('uc-rehab-save');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ rehabInfo: readRehabForm() })
      });
      showToast('Rehab info saved');
      await loadDeals();
      if (data.deal) {
        state.profile = { ...(state.profile || {}), ...data.deal };
        fillRehabForm(data.deal.rehabInfo || {});
      } else if (state.activeDealId === dealId) {
        await openProfile(dealId);
      }
    } catch (err) {
      showToast(err.message || 'Could not save rehab info');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openRehabView(deal) {
    const dialog = $('uc-rehab-view-dialog');
    if (!dialog || !deal) return;
    const rehab = deal.rehabInfo || {};
    const rows = [
      ['Roof age & condition', rehab.roof],
      ['AC age & condition', rehab.ac],
      ['Foundation', rehab.foundation],
      ['Electrical', rehab.electrical],
      ['Plumbing', rehab.plumbing],
      ['Anything else', rehab.other]
    ];
    const hasAny = rows.some(([, v]) => String(v || '').trim());
    $('uc-rehab-view-title').textContent = 'Rehab info';
    $('uc-rehab-view-address').textContent = deal.address
      ? `${deal.address}${deal.city ? ` · ${[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}` : ''}`
      : 'Property rehab details';
    const facts = $('uc-rehab-view-facts');
    if (!hasAny) {
      facts.innerHTML = '<p class="uc-docs-empty">No rehab notes yet. Open the deal profile to add them.</p>';
    } else {
      facts.innerHTML = rows.map(([k, v]) => {
        const val = String(v || '').trim() || '—';
        return `<div class="uc-fact"><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`;
      }).join('');
    }
    dialog.showModal();
  }

  function closeRehabView() {
    $('uc-rehab-view-dialog')?.close();
  }

  function renderDocuments(docs) {
    const box = $('uc-docs-list');
    if (!box) return;
    if (!docs.length) {
      box.innerHTML = '<p class="uc-docs-empty">No documents yet. Pick a type below and click Send Document — signed PDFs return here automatically.</p>';
      return;
    }
    box.innerHTML = docs.map((d) => {
      const kind = DOC_LABELS[d.kind] || d.label || d.kind || 'Document';
      const src = d.source === 'signnow' ? ' · SignNow' : (d.source === 'ghl' ? '' : '');
      return `<div class="uc-doc-row" data-doc-id="${esc(d.id)}">
        <div class="uc-doc-row-main">
          <span class="uc-doc-kind">${esc(kind)}${esc(src)}</span>
        </div>
        <div class="uc-doc-row-actions">
          <button type="button" class="phuglee-btn phuglee-btn-secondary" data-doc-action="view">View</button>
          ${d.source !== 'ghl' ? '<button type="button" class="phuglee-btn phuglee-btn-ghost" data-doc-action="delete">Remove</button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderDocsPending(deal) {
    const el = $('uc-docs-pending');
    if (!el) return;
    const pending = Array.isArray(deal?.signNowPending) ? deal.signNowPending : [];
    if (!pending.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = `${pending.length} SignNow package${pending.length === 1 ? '' : 's'} awaiting signatures — click Refresh signed after they finish.`;
  }

  function closeDocViewer() {
    const viewer = $('uc-doc-viewer');
    const frame = $('uc-doc-frame');
    if (viewer) viewer.hidden = true;
    if (frame) frame.removeAttribute('src');
  }

  function openDocViewer(doc) {
    const viewer = $('uc-doc-viewer');
    const frame = $('uc-doc-frame');
    const title = $('uc-doc-viewer-title');
    const openTab = $('uc-doc-open-tab');
    if (!viewer || !frame || !doc?.viewUrl) return;
    title.textContent = doc.name || 'Document';
    openTab.href = doc.viewUrl;
    frame.src = doc.viewUrl;
    viewer.hidden = false;
    viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function sendDocumentFromPanel() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const kind = $('uc-doc-kind')?.value || 'aoc';
    if (kind === 'amendment') {
      if (state.profile) openAmendment(state.profile);
      return;
    }
    if (kind === 'aoc') {
      if (state.profile) openBuyerFound(state.profile);
      return;
    }
    if (kind === 'jv') {
      if (state.profile) openSendJv(state.profile);
      return;
    }
  }

  async function refreshSignedDocuments() {
    const dealId = state.activeDealId;
    if (!dealId) return;
    const btn = $('uc-docs-refresh-sn');
    if (btn) btn.disabled = true;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/sync-signnow`, {
        method: 'POST',
        body: '{}'
      });
      const n = data.ingested || 0;
      showToast(n ? `Pulled ${n} signed document${n === 1 ? '' : 's'}` : 'No newly signed documents yet');
      if (data.deal) {
        state.profile = data.deal;
        renderDocuments(data.deal.documents || []);
        renderDocsPending(data.deal);
      }
    } catch (err) {
      showToast(err.message || 'SignNow refresh failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteDocument(docId) {
    const dealId = state.activeDealId;
    if (!dealId || !docId) return;
    if (!window.confirm('Remove this document from the profile?')) return;
    try {
      const data = await api(
        `/api/leads/admin/contracts/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      if (data.deal) {
        state.profile = data.deal;
        renderDocuments(data.deal.documents || []);
      }
      closeDocViewer();
      showToast('Document removed');
    } catch (err) {
      showToast(err.message || 'Remove failed');
    }
  }

  async function openProfile(dealId) {
    state.activeDealId = dealId;
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}`);
      renderProfile(data.deal, data.contact);
      await loadMessages(dealId, { silent: true });
      startPoll();
    } catch (err) {
      showToast(err.message || 'Could not open profile');
    }
  }

  function closeProfile() {
    stopPoll();
    state.activeDealId = null;
    closeDocViewer();
    const drawer = $('uc-drawer');
    const backdrop = $('uc-drawer-backdrop');
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('uc-drawer-open');
  }

  function openBuyerFound(deal) {
    $('uc-buyer-deal-id').value = deal.dealId;
    $('uc-buyer-title').textContent = deal.address ? `Buyer found — ${deal.address}` : 'Buyer found';
    $('uc-buyer-entity').value = deal.cashBuyerName || deal.buyerAssignment?.buyerEntity || '';
    $('uc-buyer-contact').value = deal.buyerAssignment?.buyerContactName || '';
    $('uc-buyer-email').value = deal.buyerAssignment?.buyerEmail || '';
    $('uc-buyer-phone').value = deal.buyerAssignment?.buyerPhone || '';
    $('uc-buyer-fee').value = deal.assignmentFee ?? '';
    $('uc-buyer-closing').value = deal.closingDate || '';
    $('uc-buyer-emd').value = deal.buyerAssignment?.buyerEmd ?? '';
    $('uc-buyer-notes').value = '';
    $('uc-buyer-dialog').showModal();
  }

  const JV_PARTIES = {
    sales: {
      name: 'Brandon Wunder',
      company: 'Wunderhaus Group LLC',
      email: 'brandon@wunderhausgroup.com'
    },
    dispos: {
      name: 'Brad Lewis',
      company: 'Green Oasis Solutions',
      email: 'buyhomes995@gmail.com'
    }
  };

  function openSendJv(deal) {
    $('uc-jv-deal-id').value = deal.dealId;
    $('uc-jv-title').textContent = deal.address ? `Send JV — ${deal.address}` : 'Send JV agreement';
    $('uc-jv-dialog').showModal();
  }

  function amendmentPartyDefaults(deal, contact, party) {
    const key = party === 'end_buyer' ? 'end_buyer' : 'seller';
    const fromApi = deal?.amendmentDefaults?.[key];
    if (fromApi && (fromApi.counterpartyName || fromApi.counterpartyEmail || fromApi.originalAgreementDate)) {
      return {
        originalAgreementDate: fromApi.originalAgreementDate || '',
        name: fromApi.counterpartyName || '',
        email: fromApi.counterpartyEmail || ''
      };
    }
    if (key === 'end_buyer') {
      const ba = deal?.buyerAssignment || {};
      return {
        originalAgreementDate: deal?.originalAgreementDate || contact?.contractSignedDate || '',
        name: ba.buyerEntity || ba.buyerContactName || deal?.cashBuyerName || contact?.cashBuyerName || '',
        email: ba.buyerEmail || ''
      };
    }
    return {
      originalAgreementDate: deal?.originalAgreementDate || contact?.contractSignedDate || '',
      name: deal?.ownerName || deal?.sellerNames || contact?.sellersName || contact?.name || '',
      email: deal?.ownerEmail || deal?.email || contact?.email || ''
    };
  }

  function applyAmendmentPartyFields() {
    const deal = state._amendmentDeal;
    const contact = state._amendmentContact;
    if (!deal) return;
    const party = $('uc-amendment-party')?.value || 'seller';
    const defs = amendmentPartyDefaults(deal, contact, party);
    const isBuyer = party === 'end_buyer';
    if ($('uc-amendment-name-label')) {
      $('uc-amendment-name-label').textContent = isBuyer ? 'End buyer name' : 'Seller name';
    }
    if ($('uc-amendment-email-label')) {
      $('uc-amendment-email-label').textContent = isBuyer ? 'End buyer email' : 'Seller email';
    }
    $('uc-amendment-orig-date').value = defs.originalAgreementDate || '';
    $('uc-amendment-seller-name').value = defs.name || '';
    $('uc-amendment-seller-email').value = defs.email || '';
    const hint = $('uc-amendment-orig-hint');
    if (hint) {
      hint.textContent = defs.originalAgreementDate
        ? 'Auto-filled from GHL contract signed date / deal file'
        : 'No signed date on file — enter the original PSA date';
    }
  }

  async function openAmendment(deal) {
    let full = deal;
    let contact = (state.activeDealId === deal.dealId) ? state.contact : null;
    if (state.activeDealId === deal.dealId && state.profile) {
      full = state.profile;
    } else {
      try {
        const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}`);
        full = data.deal || deal;
        contact = data.contact || null;
      } catch (_) { /* use row data */ }
    }
    state._amendmentDeal = full;
    state._amendmentContact = contact;
    $('uc-amendment-deal-id').value = full.dealId;
    $('uc-amendment-title').textContent = full.address ? `Amendment — ${full.address}` : 'Send Amendment';
    $('uc-amendment-terms').value = '';
    if ($('uc-amendment-party')) $('uc-amendment-party').value = 'seller';
    applyAmendmentPartyFields();
    $('uc-amendment-dialog').showModal();
  }

  async function submitBuyerFound(ev) {
    ev.preventDefault();
    const id = $('uc-buyer-deal-id').value;
    const body = {
      buyerEntity: $('uc-buyer-entity').value.trim(),
      buyerContactName: $('uc-buyer-contact').value.trim(),
      buyerEmail: $('uc-buyer-email').value.trim(),
      buyerPhone: $('uc-buyer-phone').value.trim(),
      assignmentFee: $('uc-buyer-fee').value === '' ? null : Number($('uc-buyer-fee').value),
      closingDate: $('uc-buyer-closing').value.trim(),
      buyerEmd: $('uc-buyer-emd').value === '' ? null : Number($('uc-buyer-emd').value),
      notes: $('uc-buyer-notes').value.trim()
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/buyer-found`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-buyer-dialog').close();
      showToast(data.aoc?.message || 'AOC sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Buyer found failed');
    }
  }

  async function submitSendJv(ev) {
    ev.preventDefault();
    const id = $('uc-jv-deal-id').value;
    const body = {
      salesPartner: 'brandon',
      disposPartner: 'brad',
      salesName: JV_PARTIES.sales.name,
      salesCompany: JV_PARTIES.sales.company,
      salesEmail: JV_PARTIES.sales.email,
      disposName: JV_PARTIES.dispos.name,
      disposCompany: JV_PARTIES.dispos.company,
      disposEmail: JV_PARTIES.dispos.email
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-jv`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-jv-dialog').close();
      showToast(data.jv?.message || 'JV sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Send JV failed');
    }
  }

  async function submitAmendment(ev) {
    ev.preventDefault();
    const id = $('uc-amendment-deal-id').value;
    const partyType = $('uc-amendment-party')?.value || 'seller';
    const name = $('uc-amendment-seller-name').value.trim();
    const email = $('uc-amendment-seller-email').value.trim();
    const body = {
      partyType,
      amendmentTerms: $('uc-amendment-terms').value.trim(),
      originalAgreementDate: $('uc-amendment-orig-date').value.trim(),
      sellerName: name,
      sellerEmail: email,
      counterpartyName: name,
      counterpartyEmail: email,
      sellers: [{ name, email }]
    };
    try {
      const data = await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}/send-amendment`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      $('uc-amendment-dialog').close();
      showToast(data.amendment?.message || 'Amendment sent via SignNow');
      await loadDeals();
      if (state.activeDealId === id && data.deal) {
        renderProfile(data.deal, state.contact);
      }
    } catch (err) {
      showToast(err.message || 'Send Amendment failed');
    }
  }

  function openEdit(deal) {
    state.editingId = deal.dealId;
    $('uc-edit-id').value = deal.dealId;
    $('uc-edit-stage').value = deal.stage || 'under_contract';
    $('uc-edit-purchase').value = deal.purchasePrice ?? '';
    $('uc-edit-fee').value = deal.assignmentFee ?? '';
    $('uc-edit-buyer').value = deal.cashBuyerName || '';
    $('uc-edit-closing').value = deal.closingDate || '';
    $('uc-edit-access').value = deal.accessType || '';
    $('uc-edit-access-detail').value = deal.accessDetail || '';
    $('uc-edit-vacancy').value = deal.vacancy || '';
    $('uc-edit-seller-emd').value = deal.sellerEmdSubmitted || '';
    $('uc-edit-buyer-emd').value = deal.buyerEmdSubmitted || '';
    if ($('uc-edit-title-opened')) $('uc-edit-title-opened').value = deal.titleOpened || '';
    if ($('uc-edit-photos')) $('uc-edit-photos').value = deal.photosAvailable || '';
    $('uc-edit-notes').value = deal.notes || '';
    $('uc-edit-title').textContent = deal.address || 'Edit deal';
    $('uc-edit-dialog').showModal();
  }

  async function saveEdit(ev) {
    ev.preventDefault();
    const submitter = ev.submitter;
    if (submitter && submitter.value === 'cancel') {
      $('uc-edit-dialog').close();
      return;
    }
    const id = $('uc-edit-id').value;
    const body = {
      stage: $('uc-edit-stage').value,
      purchasePrice: $('uc-edit-purchase').value === '' ? null : Number($('uc-edit-purchase').value),
      assignmentFee: $('uc-edit-fee').value === '' ? null : Number($('uc-edit-fee').value),
      cashBuyerName: $('uc-edit-buyer').value.trim(),
      closingDate: $('uc-edit-closing').value.trim(),
      accessType: $('uc-edit-access').value,
      accessDetail: $('uc-edit-access-detail').value.trim(),
      vacancy: $('uc-edit-vacancy').value,
      sellerEmdSubmitted: $('uc-edit-seller-emd').value,
      buyerEmdSubmitted: $('uc-edit-buyer-emd').value,
      titleOpened: $('uc-edit-title-opened')?.value || '',
      photosAvailable: $('uc-edit-photos')?.value || '',
      notes: $('uc-edit-notes').value.trim()
    };
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      $('uc-edit-dialog').close();
      showToast('Deal updated');
      await loadDeals();
      if (state.activeDealId === id) await openProfile(id);
    } catch (err) {
      showToast(err.message || 'Save failed');
    }
  }

  async function releaseDeal(dealId, address) {
    if (!isAdmin()) {
      showToast('Release is admin only');
      return;
    }
    openReleaseConfirm(dealId, address);
  }

  function openReleaseConfirm(dealId, address) {
    const dialog = $('uc-release-dialog');
    if (!dialog) return;
    $('uc-release-deal-id').value = dealId;
    $('uc-release-address').textContent = address || 'this lead';
    $('uc-release-confirm-input').value = '';
    $('uc-release-confirm-btn').disabled = true;
    dialog.showModal();
    setTimeout(() => $('uc-release-confirm-input')?.focus(), 50);
  }

  function closeReleaseConfirm() {
    $('uc-release-dialog')?.close();
  }

  function onReleaseConfirmInput() {
    const val = String($('uc-release-confirm-input')?.value || '').trim().toLowerCase();
    const btn = $('uc-release-confirm-btn');
    if (btn) btn.disabled = val !== 'confirm';
  }

  async function submitReleaseConfirm(ev) {
    ev.preventDefault();
    if (!isAdmin()) {
      showToast('Release is admin only');
      closeReleaseConfirm();
      return;
    }
    const typed = String($('uc-release-confirm-input')?.value || '').trim().toLowerCase();
    if (typed !== 'confirm') {
      showToast('Type confirm to release');
      return;
    }
    const dealId = $('uc-release-deal-id').value;
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/release`, {
        method: 'POST',
        body: '{}'
      });
      closeReleaseConfirm();
      if (state.activeDealId === dealId) closeProfile();
      showToast('Released to Vault');
      await loadDeals();
    } catch (err) {
      showToast(err.message || 'Release failed');
    }
  }

  async function syncGhl() {
    const btn = $('uc-sync-ghl');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing…';
    }
    try {
      const data = await api('/api/leads/admin/contracts/sync-ghl', {
        method: 'POST',
        body: '{}'
      });
      state.deals = data.deals || [];
      state.totals = data.totals || null;
      renderKpis(state.totals);
      renderTable(state.deals);
      const s = data.sync || {};
      showToast(`Synced ${s.upserted || 0} of ${s.scanned || 0} GHL opportunities`);
    } catch (err) {
      showToast(err.message || 'GHL sync failed');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sync from GHL';
      }
    }
  }

  async function sendSms() {
    const dealId = state.activeDealId;
    const input = $('uc-sms-input');
    const text = (input?.value || '').trim();
    if (!dealId || !text) return;
    const btn = $('uc-sms-send');
    if (btn) btn.disabled = true;
    try {
      await api(`/api/leads/admin/contracts/${encodeURIComponent(dealId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          fromNumber: state.fromNumber,
          toNumber: state.toNumber
        })
      });
      input.value = '';
      showToast('SMS sent');
      await loadMessages(dealId, { silent: true });
    } catch (err) {
      showToast(err.message || 'Send failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bind() {
    $('uc-buyer-form')?.addEventListener('submit', submitBuyerFound);
    $('uc-jv-form')?.addEventListener('submit', submitSendJv);
    $('uc-amendment-form')?.addEventListener('submit', submitAmendment);
    $('uc-amendment-party')?.addEventListener('change', applyAmendmentPartyFields);
    $('uc-buyer-cancel')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-buyer-close')?.addEventListener('click', () => $('uc-buyer-dialog')?.close());
    $('uc-jv-cancel')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-jv-close')?.addEventListener('click', () => $('uc-jv-dialog')?.close());
    $('uc-amendment-cancel')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-amendment-close')?.addEventListener('click', () => $('uc-amendment-dialog')?.close());
    $('uc-release-form')?.addEventListener('submit', submitReleaseConfirm);
    $('uc-release-confirm-input')?.addEventListener('input', onReleaseConfirmInput);
    $('uc-release-cancel')?.addEventListener('click', closeReleaseConfirm);
    $('uc-release-close')?.addEventListener('click', closeReleaseConfirm);
    $('uc-rehab-save')?.addEventListener('click', () => { saveRehab(); });
    $('uc-rehab-view-close')?.addEventListener('click', closeRehabView);
    $('uc-rehab-view-done')?.addEventListener('click', closeRehabView);
    $('uc-drawer-buyer-found')?.addEventListener('click', () => {
      if (state.profile) openBuyerFound(state.profile);
    });
    $('uc-drawer-send-jv')?.addEventListener('click', () => {
      if (state.profile) openSendJv(state.profile);
    });
    $('uc-drawer-amendment')?.addEventListener('click', () => {
      if (state.profile) openAmendment(state.profile);
    });
    $('uc-sync-ghl')?.addEventListener('click', () => { syncGhl(); });
    $('uc-edit-form')?.addEventListener('submit', saveEdit);
    $('uc-drawer-close')?.addEventListener('click', closeProfile);
    $('uc-drawer-backdrop')?.addEventListener('click', closeProfile);
    $('uc-sms-send')?.addEventListener('click', () => { sendSms(); });
    $('uc-sms-refresh')?.addEventListener('click', () => {
      if (state.activeDealId) loadMessages(state.activeDealId).catch((e) => showToast(e.message));
    });
    $('uc-sms-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendSms();
      }
    });
    $('uc-doc-send')?.addEventListener('click', () => { sendDocumentFromPanel(); });
    $('uc-docs-refresh-sn')?.addEventListener('click', () => { refreshSignedDocuments(); });
    $('uc-doc-close-viewer')?.addEventListener('click', closeDocViewer);
    $('uc-docs-list')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-doc-action]');
      const row = ev.target.closest('[data-doc-id]');
      if (!btn || !row) return;
      const docId = row.getAttribute('data-doc-id');
      const doc = (state.profile?.documents || []).find((d) => d.id === docId);
      if (btn.dataset.docAction === 'view' && doc) openDocViewer(doc);
      if (btn.dataset.docAction === 'delete') deleteDocument(docId);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !state.activeDealId) return;
      if ($('uc-release-dialog')?.open) return;
      if ($('uc-buyer-dialog')?.open) return;
      if ($('uc-jv-dialog')?.open) return;
      if ($('uc-amendment-dialog')?.open) return;
      if ($('uc-edit-dialog')?.open) return;
      closeProfile();
    });

    window.addEventListener('phuglee-payouts-updated', (ev) => {
      const detail = ev.detail || {};
      if (detail.deals) {
        state.deals = detail.deals;
        state.totals = detail.totals || state.totals;
        renderKpis(state.totals);
        renderTable(state.deals);
        showToast('Payout settings updated');
        if (state.activeDealId) {
          openProfile(state.activeDealId).catch(() => {});
        }
        return;
      }
      loadDeals().then(() => showToast('Payout settings updated')).catch(() => {});
    });

    $('uc-tbody')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      const row = ev.target.closest('tr[data-deal-id]');
      if (!row) return;
      const dealId = row.getAttribute('data-deal-id');
      const deal = state.deals.find((d) => d.dealId === dealId);
      if (!deal) return;
      const action = btn?.dataset.action || 'open';
      if (action === 'open') openProfile(dealId);
      if (action === 'edit') openEdit(deal);
      if (action === 'buyer-found') openBuyerFound(deal);
      if (action === 'send-jv') openSendJv(deal);
      if (action === 'amendment') openAmendment(deal);
      if (action === 'view-rehab') openRehabView(deal);
      if (action === 'release' && isAdmin()) releaseDeal(deal.dealId, deal.address);
    });
  }

  async function allowContractDesk() {
    if (isContractDesk()) return true;
    if (window.PhugleeSession?.syncSessionFromServerCookie) {
      const data = await window.PhugleeSession.syncSessionFromServerCookie();
      if (data?.username === ADMIN || data?.username === DISPOS) return true;
    }
    return false;
  }

  async function init() {
    const gate = $('uc-gate');
    const app = $('uc-app');
    const allowed = await allowContractDesk();
    if (!allowed) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    applyAdminOnlyUi();
    bind();
    try {
      await loadDeals();
    } catch (err) {
      showToast(err.message || 'Could not load contracts');
      if (err.status === 403 && gate) {
        gate.hidden = false;
        app.hidden = true;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
