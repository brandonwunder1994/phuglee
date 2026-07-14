(function () {
  'use strict';

  const CAT_LABELS = {
    subscription: 'Subscription / plan',
    tax: 'Sales tax',
    sms: 'SMS',
    phone: 'Phone / voice',
    email: 'Email',
    ai: 'AI',
    numbers: 'Phone numbers',
    wallet: 'Wallet / top-up',
    other: 'Other'
  };

  const KIND_LABELS = {
    usage: 'Usage',
    topup: 'Top-up',
    tax: 'Tax',
    invoice: 'Invoice',
    transactions: 'Usage',
    unknown: '—'
  };

  const state = {
    period: null,
    snapshot: null,
    chargeFilter: 'all',
    chargeRows: [],
    chargeCats: []
  };

  function $(id) {
    return document.getElementById(id);
  }

  function isAdmin() {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    try {
      return sessionStorage.getItem('phuglee_session') === 'admin';
    } catch (_) {
      return false;
    }
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return (
      '$' +
      x.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }

  function currentMonthValue() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function setStatus(msg, kind) {
    const el = $('oc-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', kind === 'error');
  }

  function badgeClass(status) {
    if (status === 'live' || status === 'estimated') return 'oc-badge oc-badge--live';
    if (status === 'fixed') return 'oc-badge oc-badge--fixed';
    if (status === 'hybrid') return 'oc-badge oc-badge--hybrid';
    return 'oc-badge oc-badge--error';
  }

  function billingLinksHtml(billing) {
    if (!billing || !billing.href) return '';
    let html =
      `<div class="oc-card-links">` +
      `<a class="oc-billing-link" href="${esc(billing.href)}" target="_blank" rel="noopener noreferrer">${esc(billing.label || 'Open billing')}</a>`;
    if (billing.secondary?.href) {
      html +=
        `<a class="oc-billing-link oc-billing-link--secondary" href="${esc(billing.secondary.href)}" target="_blank" rel="noopener noreferrer">${esc(billing.secondary.label || 'More')}</a>`;
    }
    html += `</div>`;
    return html;
  }

  function renderCards(services) {
    const root = $('oc-cards');
    if (!root) return;
    const order = ['railway', 'ghl', 'signnow', 'maps', 'gemini'];
    root.innerHTML = order
      .map((id) => {
        const s = services[id];
        if (!s) return '';
        const provider =
          s.provider
            ? `<span class="oc-card-provider">${esc(s.provider)}</span>`
            : '';
        const usageNote =
          id === 'maps' && s.usageUsd != null && s.coveredByCredit
            ? `<p class="oc-card-usage">Credit burn ~${money(s.usageUsd)}</p>`
            : '';
        return (
          `<article class="oc-card" data-service="${esc(id)}">` +
          `<div class="oc-card-label">` +
          `<span class="oc-card-name">${esc(s.label)}</span>` +
          `<span class="${badgeClass(s.status)}">${esc(s.status)}</span>` +
          `</div>` +
          provider +
          `<p class="oc-card-amount">${money(s.amountUsd)}</p>` +
          usageNote +
          `<p class="oc-card-detail">${esc(s.detail || '')}</p>` +
          billingLinksHtml(s.billing) +
          `</article>`
        );
      })
      .join('');
  }

  function renderGcpCredit(credit) {
    const grantedEl = $('oc-gcp-granted');
    const remainingEl = $('oc-gcp-remaining');
    const usedEl = $('oc-gcp-used');
    const burnEl = $('oc-gcp-maps-burn');
    const linksEl = $('oc-gcp-credit-links');
    if (!grantedEl || !remainingEl || !usedEl || !burnEl) return;

    const hasGranted = credit && credit.grantedUsd != null;
    const hasRemaining = credit && credit.remainingUsd != null;
    grantedEl.textContent = hasGranted ? money(credit.grantedUsd) : 'Not set';
    remainingEl.textContent = hasRemaining ? money(credit.remainingUsd) : 'Not set';
    usedEl.textContent =
      credit && credit.usedUsd != null ? money(credit.usedUsd) : hasGranted && hasRemaining ? money(0) : '—';
    burnEl.textContent =
      credit && credit.mapsBurnUsdThisMonth != null ? money(credit.mapsBurnUsdThisMonth) : '—';

    if (linksEl) {
      linksEl.innerHTML = billingLinksHtml(
        credit?.billing || {
          label: 'Open Google Cloud billing',
          href: 'https://console.cloud.google.com/billing'
        }
      );
    }
  }

  function renderGeminiPrepaidCredit(credit) {
    const valueEl = $('oc-gemini-credit-value');
    const inputEl = $('oc-gemini-credit-input');
    const formInput = $('oc-gemini-credit-form-input');
    const linksEl = $('oc-gemini-credit-links');
    if (!valueEl) return;

    const bal = credit && credit.balanceUsd != null ? Number(credit.balanceUsd) : null;
    if (bal == null || !Number.isFinite(bal)) {
      valueEl.textContent = 'Not set';
      valueEl.classList.remove('is-low');
    } else {
      valueEl.textContent = money(bal);
      valueEl.classList.toggle('is-low', bal < 5);
    }
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = bal != null ? String(bal) : '';
    }
    if (formInput && document.activeElement !== formInput) {
      formInput.value = bal != null ? String(bal) : '';
    }
    if (linksEl) {
      linksEl.innerHTML = billingLinksHtml(
        credit?.billing || {
          label: 'Open AI Studio billing',
          href: 'https://aistudio.google.com/billing'
        }
      );
    }
  }

  function renderWalletBalance(wb) {
    const valueEl = $('oc-wallet-balance-value');
    const metaEl = $('oc-wallet-balance-meta');
    const hintEl = $('oc-wallet-balance-hint');
    if (!valueEl || !metaEl) return;

    const bal =
      wb && wb.balanceAfterUsd != null
        ? Number(wb.balanceAfterUsd)
        : wb && wb.totalIncludingCreditsUsd != null
          ? Number(wb.totalIncludingCreditsUsd)
          : null;

    if (bal == null || !Number.isFinite(bal)) {
      valueEl.textContent = '—';
      valueEl.classList.remove('is-low');
      metaEl.textContent = 'Import a WALLET_TRANSACTIONS CSV to capture the latest balance.';
      if (hintEl) {
        hintEl.textContent =
          'Pulled from “Wallet Balance After Transaction” on your newest CSV row. Re-upload that export to refresh.';
      }
      return;
    }

    valueEl.textContent = money(bal);
    valueEl.classList.toggle('is-low', bal < 10);
    const when = wb.asOfTime ? `${wb.asOfDate} · ${wb.asOfTime}` : wb.asOfDate || 'unknown time';
    const total =
      wb.totalIncludingCreditsUsd != null && wb.totalIncludingCreditsUsd !== wb.balanceAfterUsd
        ? ` · total w/ credits ${money(wb.totalIncludingCreditsUsd)}`
        : '';
    metaEl.textContent = `As of ${when}${total}` + (wb.sourceFile ? ` · ${wb.sourceFile}` : '');
    if (hintEl) {
      hintEl.textContent =
        bal < 10
          ? 'Wallet is running low — top up in HighLevel, then re-upload WALLET_TRANSACTIONS to refresh this number.'
          : 'Re-upload your latest WALLET_TRANSACTIONS CSV anytime to refresh this balance.';
    }
  }

  function renderPickup(wm) {
    const dateEl = $('oc-pickup-date');
    const hintEl = $('oc-pickup-hint');
    if (!dateEl || !hintEl) return;
    if (!wm || !wm.pickUpDate) {
      dateEl.textContent = 'No GHL charges imported yet';
      hintEl.textContent =
        'Drop HighLevel wallet files below: transactions CSV, top-up receipt PDF, and/or sales-tax invoice PDF. Duplicates are skipped by transaction ID — dates are never a hard cutoff.';
      return;
    }
    const when = wm.lastChargeTime ? `${wm.pickUpDate} · ${wm.lastChargeTime}` : wm.pickUpDate;
    dateEl.textContent = `Latest charge on file: ${when}`;
    hintEl.textContent =
      wm.pickUpHint ||
      'Duplicates are skipped by transaction/charge ID. Older-dated rows in a new export still import if they are new.';
  }

  function renderWatermark(wm) {
    const el = $('oc-watermark');
    if (!el) return;
    if (!wm || (!wm.coveredTo && !wm.lastImportAt)) {
      el.textContent = 'No GHL exports imported yet.';
      return;
    }
    const covered =
      wm.coveredFrom && wm.coveredTo ? `Covered ${wm.coveredFrom} → ${wm.coveredTo}` : '';
    const last = wm.lastImportAt
      ? `Last import ${new Date(wm.lastImportAt).toLocaleString()}`
      : '';
    el.textContent = [covered, last].filter(Boolean).join(' · ');
  }

  function renderBars(rootId, rows, emptyId) {
    const root = $(rootId);
    const empty = emptyId ? $(emptyId) : null;
    if (!root) return;
    if (!rows || !rows.length) {
      root.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    root.innerHTML = rows
      .map((row) => {
        const pct = Math.max(0, Math.min(100, Number(row.sharePct) || 0));
        const label = row.label || row.category || row.id;
        const blurb = row.blurb ? `<span class="oc-bar-blurb">${esc(row.blurb)}</span>` : '';
        const link =
          row.billing?.href
            ? `<a class="oc-billing-link oc-billing-link--inline" href="${esc(row.billing.href)}" target="_blank" rel="noopener noreferrer">${esc(row.billing.label || 'Open')}</a>`
            : '';
        return (
          `<div class="oc-bar-row">` +
          `<div class="oc-bar-meta">` +
          `<span class="oc-bar-label">${esc(label)}</span>` +
          blurb +
          link +
          `</div>` +
          `<div class="oc-bar-track" aria-hidden="true"><div class="oc-bar-fill" style="width:${pct}%"></div></div>` +
          `<div class="oc-bar-nums"><strong>${money(row.amountUsd ?? row.totalUsd)}</strong><span>${pct}%</span></div>` +
          `</div>`
        );
      })
      .join('');
  }

  function renderTeamBrief(brief) {
    if (!brief) {
      renderBars('oc-stack-bars', []);
      renderBars('oc-ghl-bars', [], 'oc-ghl-brief-empty');
      return;
    }
    const heading = $('oc-brief-heading');
    if (heading && brief.title) heading.textContent = brief.title;
    renderBars('oc-stack-bars', brief.stack || []);
    renderBars('oc-ghl-bars', brief.ghlBuckets || [], 'oc-ghl-brief-empty');
  }

  function renderRateCard(rc) {
    if (!rc) return;
    const ghlName = $('oc-ghl-name');
    const ghlUsd = $('oc-ghl-usd');
    const snName = $('oc-sn-name');
    const snUsd = $('oc-sn-usd');
    const gcpGranted = $('oc-gcp-granted-input');
    const gcpRemaining = $('oc-gcp-remaining-input');
    const geminiCredit = $('oc-gemini-credit-form-input');
    const geminiPanel = $('oc-gemini-credit-input');
    if (ghlName) ghlName.value = rc.ghlPlanName || '';
    if (ghlUsd) ghlUsd.value = rc.ghlPlanMonthlyUsd ?? '';
    if (snName) snName.value = rc.signnowPlanName || '';
    if (snUsd) snUsd.value = rc.signnowPlanMonthlyUsd ?? '';
    if (gcpGranted) gcpGranted.value = rc.gcpPromoCreditGrantedUsd ?? '';
    if (gcpRemaining) gcpRemaining.value = rc.gcpPromoCreditRemainingUsd ?? '';
    if (geminiCredit) geminiCredit.value = rc.geminiPrepaidCreditUsd ?? '';
    if (geminiPanel && document.activeElement !== geminiPanel) {
      geminiPanel.value = rc.geminiPrepaidCreditUsd ?? '';
    }
  }

  function optionalUsdInput(id) {
    const el = $(id);
    if (!el) return undefined;
    const raw = String(el.value ?? '').trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function renderGhlFamilies(family) {
    const root = $('oc-ghl-families');
    if (!root) return;
    const items = [
      {
        id: 'usage',
        title: 'Wallet usage',
        blurb: 'WALLET_TRANSACTIONS CSV — SMS, calls, email, numbers',
        bucket: family?.usage
      },
      {
        id: 'tax',
        title: 'Sales tax',
        blurb: 'WALLET_SALES_TAX PDF — tax charged to the wallet',
        bucket: family?.tax
      },
      {
        id: 'topup',
        title: 'Top-ups (funding)',
        blurb: 'WALLET_TOP_UP_RECEIPT PDF — money in, not spend',
        bucket: family?.topup,
        funding: true
      }
    ];
    root.innerHTML = items
      .map((item) => {
        const count = Number(item.bucket?.count) || 0;
        const total = Number(item.bucket?.totalUsd) || 0;
        return (
          `<article class="oc-family-card${item.funding ? ' is-funding' : ''}" data-family="${esc(item.id)}">` +
          `<h3 class="oc-family-title">${esc(item.title)}</h3>` +
          `<p class="oc-family-amount">${money(total)}</p>` +
          `<p class="oc-family-meta">${count} line${count === 1 ? '' : 's'} in this period</p>` +
          `<p class="oc-family-blurb">${esc(item.blurb)}</p>` +
          `</article>`
        );
      })
      .join('');
  }

  function renderBreakdown(byCategory, charges, familyFilter) {
    const cats = $('oc-breakdown-cats');
    const body = $('oc-charges-body');
    const filter = familyFilter || state.chargeFilter || 'all';
    let filtered = charges || [];
    if (filter === 'usage') {
      filtered = filtered.filter((c) => c.kind === 'usage' || c.kind === 'transactions');
    } else if (filter === 'topup') {
      filtered = filtered.filter((c) => c.kind === 'topup');
    } else if (filter === 'tax') {
      filtered = filtered.filter((c) => c.kind === 'tax' || c.category === 'tax');
    }

    if (cats) {
      if (!byCategory || !byCategory.length) {
        cats.innerHTML = '';
      } else {
        cats.innerHTML = byCategory
          .map((c) => {
            const label = c.label || CAT_LABELS[c.category] || c.category;
            return (
              `<span class="oc-cat-chip">${esc(label)}` +
              `<strong>${money(c.totalUsd)}</strong>` +
              ` · ${c.count}</span>`
            );
          })
          .join('');
      }
    }
    if (!body) return;
    if (!filtered.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="oc-empty">No imported charges for this period / filter. Top-ups often land in a prior month — switch Period if needed.</td></tr>';
      return;
    }
    const rows = filtered
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 400);
    body.innerHTML = rows
      .map((c) => {
        const label = c.categoryLabel || CAT_LABELS[c.category] || c.category;
        const kind = KIND_LABELS[c.kind] || c.kind || '—';
        const when = c.time ? `${c.date} ${c.time}` : c.date;
        return (
          `<tr>` +
          `<td>${esc(when)}</td>` +
          `<td>${esc(kind)}</td>` +
          `<td>${esc(label)}</td>` +
          `<td>${esc(c.description || '—')}</td>` +
          `<td class="oc-num">${money(c.amountUsd)}</td>` +
          `</tr>`
        );
      })
      .join('');
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.code = data.code;
      err.status = res.status;
      err.fileResults = data.fileResults;
      throw err;
    }
    return data;
  }

  async function loadCharges() {
    const period = state.period || currentMonthValue();
    try {
      const data = await fetchJson(
        `/api/admin/operating-costs/ghl-charges?period=${encodeURIComponent(period)}`
      );
      state.chargeRows = data.charges || [];
      state.chargeCats = data.byCategory || [];
      renderGhlFamilies(data.byFamily || state.snapshot?.ghlFamily);
      renderBreakdown(state.chargeCats, state.chargeRows, state.chargeFilter);
    } catch (_) {
      state.chargeRows = [];
      state.chargeCats = [];
      renderGhlFamilies(null);
      renderBreakdown([], []);
    }
  }

  async function refresh() {
    const period = $('oc-period')?.value || currentMonthValue();
    state.period = period;
    setStatus('Loading live costs…');
    try {
      const snap = await fetchJson(
        `/api/admin/operating-costs?period=${encodeURIComponent(period)}`
      );
      state.snapshot = snap;
      const periodLabel = snap.period?.label || period;
      const totalLabel = $('oc-total-label');
      if (totalLabel) totalLabel.textContent = `${periodLabel} total`;
      $('oc-month-total').textContent = money(snap.monthTotalUsd);
      const refreshed = snap.refreshedAt ? new Date(snap.refreshedAt).toLocaleString() : '';
      const range =
        snap.period?.from && snap.period?.to ? `${snap.period.from} → ${snap.period.to}` : '';
      $('oc-refreshed').textContent = [range, refreshed ? `Updated ${refreshed}` : '']
        .filter(Boolean)
        .join(' · ');
      renderCards(snap.services || {});
      renderGcpCredit(snap.googleCloudCredit);
      renderGeminiPrepaidCredit(snap.geminiPrepaidCredit);
      renderWalletBalance(snap.ghlWalletBalance);
      renderPickup(snap.ghlWatermark);
      renderWatermark(snap.ghlWatermark);
      renderTeamBrief(snap.teamBrief);
      renderGhlFamilies(snap.ghlFamily || snap.teamBrief?.ghlFamily);
      renderRateCard(snap.rateCard);
      await loadCharges();
      setStatus('');
    } catch (err) {
      setStatus(err.message || 'Failed to load costs', 'error');
    }
  }

  async function saveRateCard(e) {
    e.preventDefault();
    const status = $('oc-rate-status');
    if (status) {
      status.textContent = 'Saving…';
      status.classList.remove('is-ok');
    }
    try {
      const body = {
        ghlPlanName: $('oc-ghl-name')?.value,
        ghlPlanMonthlyUsd: Number($('oc-ghl-usd')?.value),
        signnowPlanName: $('oc-sn-name')?.value,
        signnowPlanMonthlyUsd: Number($('oc-sn-usd')?.value),
        gcpPromoCreditGrantedUsd: optionalUsdInput('oc-gcp-granted-input'),
        gcpPromoCreditRemainingUsd: optionalUsdInput('oc-gcp-remaining-input'),
        geminiPrepaidCreditUsd:
          optionalUsdInput('oc-gemini-credit-form-input') ??
          optionalUsdInput('oc-gemini-credit-input')
      };
      await fetchJson('/api/admin/operating-costs/rate-card', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (status) {
        status.textContent = 'Saved';
        status.classList.add('is-ok');
      }
      await refresh();
    } catch (err) {
      if (status) status.textContent = err.message || 'Save failed';
    }
  }

  async function saveGeminiCreditFromPanel() {
    const status = $('oc-rate-status');
    try {
      await fetchJson('/api/admin/operating-costs/rate-card', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiPrepaidCreditUsd: optionalUsdInput('oc-gemini-credit-input')
        })
      });
      if (status) {
        status.textContent = 'Gemini credit saved';
        status.classList.add('is-ok');
      }
      await refresh();
    } catch (err) {
      if (status) status.textContent = err.message || 'Save failed';
    }
  }

  function renderImportFileResults(fileResults) {
    const wrap = $('oc-import-files');
    if (!wrap) return;
    if (!fileResults || !fileResults.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = fileResults
      .map((f) => {
        if (!f.ok) {
          return `<div class="oc-import-file is-error"><strong>${esc(f.filename)}</strong> — ${esc(f.error || 'failed')}</div>`;
        }
        const doc = f.document?.label || f.document?.kind || 'detected';
        return (
          `<div class="oc-import-file">` +
          `<strong>${esc(f.filename)}</strong>` +
          `<span class="oc-import-file-kind">${esc(doc)}</span>` +
          `<span>+${f.newCount} new · ${f.duplicateCount} dup</span>` +
          (f.dateRange?.from ? `<span>${esc(f.dateRange.from)} → ${esc(f.dateRange.to)}</span>` : '') +
          `</div>`
        );
      })
      .join('');
  }

  const IMPORT_NAME_RE = /\.(csv|tsv|txt|xlsx|xls|xlsm|pdf)$/i;

  function collectDroppedFiles(dt) {
    if (!dt) return [];
    const out = [];
    if (dt.items && dt.items.length) {
      for (let i = 0; i < dt.items.length; i += 1) {
        const item = dt.items[i];
        if (item && item.kind === 'file') {
          const f = item.getAsFile();
          if (f) out.push(f);
        }
      }
    }
    if (out.length) return out;
    return Array.from(dt.files || []);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadOneFile(file) {
    const dataBase64 = await fileToBase64(file);
    const res = await fetch('/api/admin/operating-costs/ghl-import', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ filename: file.name || 'export.csv', dataBase64 }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Import failed (${res.status})`);
      err.fileResults = data.fileResults || [
        { ok: false, filename: file.name, error: data.error || `Import failed (${res.status})` }
      ];
      err.data = data;
      throw err;
    }
    return data;
  }

  async function uploadFiles(fileList) {
    const resultEl = $('oc-import-result');
    const files = Array.from(fileList || []).slice(0, 5);
    if (!files.length) return;
    if ((fileList.length || 0) > 5 && resultEl) {
      resultEl.classList.remove('is-ok');
      resultEl.classList.add('is-error');
      resultEl.textContent = 'Only the first 5 files will be imported.';
    }
    const odd = files.filter((f) => f && f.name && !IMPORT_NAME_RE.test(f.name));
    if (resultEl) {
      resultEl.textContent =
        `Importing ${files.length} file${files.length === 1 ? '' : 's'} one-by-one…` +
        (odd.length
          ? ` (including ${odd.map((f) => f.name).join(', ')} — CSV/Excel/PDF preferred)`
          : '');
      resultEl.classList.remove('is-ok', 'is-error');
    }

    const allResults = [];
    let newCount = 0;
    let duplicateCount = 0;
    let lastWatermark = null;
    let hardError = null;

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (resultEl) {
          resultEl.textContent = `Importing ${i + 1}/${files.length}: ${file.name || 'file'}…`;
        }
        try {
          const data = await uploadOneFile(file);
          const fr = Array.isArray(data.fileResults) ? data.fileResults : [];
          allResults.push(...fr);
          newCount += Number(data.newCount) || 0;
          duplicateCount += Number(data.duplicateCount) || 0;
          lastWatermark = data.watermark || lastWatermark;
        } catch (err) {
          const fr = Array.isArray(err.fileResults) ? err.fileResults : null;
          if (fr && fr.length) allResults.push(...fr);
          else {
            allResults.push({
              ok: false,
              filename: file.name || 'file',
              error: err.message || 'Import failed'
            });
          }
          hardError = hardError || err;
        }
      }

      renderImportFileResults(allResults);
      const okFiles = allResults.filter((f) => f.ok).length;
      const failFiles = allResults.filter((f) => !f.ok).length;
      if (resultEl) {
        const summary =
          `${files.length} file${files.length === 1 ? '' : 's'} sent` +
          ` · ${okFiles} ok · ${failFiles} failed` +
          ` · ${newCount} new · ${duplicateCount} duplicates skipped` +
          (lastWatermark?.pickUpDate ? ` · pick up from ${lastWatermark.pickUpDate}` : '');
        resultEl.classList.toggle('is-error', failFiles > 0 || !!hardError);
        resultEl.classList.toggle('is-ok', failFiles === 0 && !hardError);
        resultEl.textContent = summary;
      }
      await refresh();
    } catch (err) {
      if (resultEl) {
        resultEl.classList.add('is-error');
        resultEl.textContent = err.message || 'Import failed';
      }
    }
  }

  function wireDropzone() {
    const zone = $('oc-dropzone');
    const input = $('oc-file');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      if (input.files && input.files.length) uploadFiles(input.files);
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-drag');
      });
    });
    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-drag');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-drag');
      const list = collectDroppedFiles(e.dataTransfer);
      if (list.length) uploadFiles(list);
    });
  }

  function boot() {
    const gate = $('oc-gate');
    const app = $('oc-app');
    if (!isAdmin()) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;

    const period = $('oc-period');
    if (period) period.value = currentMonthValue();
    $('oc-refresh')?.addEventListener('click', () => refresh());
    period?.addEventListener('change', () => refresh());
    $('oc-rate-form')?.addEventListener('submit', saveRateCard);
    $('oc-gemini-credit-input')?.addEventListener('change', () => saveGeminiCreditFromPanel());
    $('oc-kind-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.chargeFilter = btn.getAttribute('data-filter') || 'all';
      $('oc-kind-filters')
        ?.querySelectorAll('.oc-kind-filter')
        .forEach((el) => el.classList.toggle('is-active', el === btn));
      renderBreakdown(state.chargeCats, state.chargeRows, state.chargeFilter);
    });
    wireDropzone();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
