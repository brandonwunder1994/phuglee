(function () {
  'use strict';

  const CAT_LABELS = {
    subscription: 'Subscription / plan',
    sms: 'SMS',
    phone: 'Phone / voice',
    email: 'Email',
    ai: 'AI',
    numbers: 'Phone numbers',
    wallet: 'Wallet / top-up',
    other: 'Other'
  };

  const KIND_LABELS = {
    invoice: 'Invoice',
    transactions: 'Transaction',
    unknown: '—'
  };

  const state = {
    period: null,
    snapshot: null
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
        return (
          `<article class="oc-card" data-service="${esc(id)}">` +
          `<div class="oc-card-label">` +
          `<span class="oc-card-name">${esc(s.label)}</span>` +
          `<span class="${badgeClass(s.status)}">${esc(s.status)}</span>` +
          `</div>` +
          provider +
          `<p class="oc-card-amount">${money(s.amountUsd)}</p>` +
          `<p class="oc-card-detail">${esc(s.detail || '')}</p>` +
          billingLinksHtml(s.billing) +
          `</article>`
        );
      })
      .join('');
  }

  function renderPickup(wm) {
    const dateEl = $('oc-pickup-date');
    const hintEl = $('oc-pickup-hint');
    if (!dateEl || !hintEl) return;
    if (!wm || !wm.pickUpDate) {
      dateEl.textContent = 'No GHL charges imported yet';
      hintEl.textContent =
        'Drop invoices and transaction exports below. We’ll remember the last charge so the next export can restart on that same day — already-seen charges are skipped, new ones are added.';
      return;
    }
    const when = wm.lastChargeTime ? `${wm.pickUpDate} · ${wm.lastChargeTime}` : wm.pickUpDate;
    dateEl.textContent = `Last transaction on file: ${when}`;
    hintEl.textContent =
      wm.pickUpHint ||
      `Next export should include ${wm.pickUpDate} onward. Same-day re-imports only add new charges.`;
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
    if (ghlName) ghlName.value = rc.ghlPlanName || '';
    if (ghlUsd) ghlUsd.value = rc.ghlPlanMonthlyUsd ?? '';
    if (snName) snName.value = rc.signnowPlanName || '';
    if (snUsd) snUsd.value = rc.signnowPlanMonthlyUsd ?? '';
  }

  function renderBreakdown(byCategory, charges) {
    const cats = $('oc-breakdown-cats');
    const body = $('oc-charges-body');
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
    if (!charges || !charges.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="oc-empty">No imported charges for this period.</td></tr>';
      return;
    }
    const rows = charges
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 300);
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
      renderBreakdown(data.byCategory || [], data.charges || []);
    } catch (_) {
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
      renderPickup(snap.ghlWatermark);
      renderWatermark(snap.ghlWatermark);
      renderTeamBrief(snap.teamBrief);
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
        signnowPlanMonthlyUsd: Number($('oc-sn-usd')?.value)
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

  async function uploadFiles(fileList) {
    const resultEl = $('oc-import-result');
    const files = Array.from(fileList || []).slice(0, 5);
    if (!files.length) return;
    if (fileList.length > 5 && resultEl) {
      resultEl.classList.remove('is-ok');
      resultEl.classList.add('is-error');
      resultEl.textContent = 'Only the first 5 files will be imported.';
    }
    if (resultEl) {
      resultEl.textContent = `Importing ${files.length} file${files.length === 1 ? '' : 's'}…`;
      resultEl.classList.remove('is-ok', 'is-error');
    }
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f, f.name));
      const res = await fetch('/api/admin/operating-costs/ghl-import', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        renderImportFileResults(data.fileResults);
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      renderImportFileResults(data.fileResults);
      if (resultEl) {
        resultEl.classList.add('is-ok');
        resultEl.textContent =
          `Imported ${data.newCount} new · ${data.duplicateCount} duplicates skipped` +
          (data.watermark?.pickUpDate ? ` · pick up from ${data.watermark.pickUpDate}` : '');
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
    ['dragleave', 'drop'].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-drag');
      });
    });
    zone.addEventListener('drop', (e) => {
      const list = e.dataTransfer && e.dataTransfer.files;
      if (list && list.length) uploadFiles(list);
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
    wireDropzone();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
