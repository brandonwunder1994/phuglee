(function () {
  'use strict';

  const CAT_LABELS = {
    subscription: 'Subscription',
    sms: 'SMS',
    phone: 'Phone',
    email: 'Email',
    ai: 'AI',
    numbers: 'Numbers',
    other: 'Other'
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

  function renderCards(services) {
    const root = $('oc-cards');
    if (!root) return;
    const order = ['railway', 'ghl', 'signnow', 'maps', 'gemini'];
    root.innerHTML = order
      .map((id) => {
        const s = services[id];
        if (!s) return '';
        return (
          `<article class="oc-card" data-service="${esc(id)}">` +
          `<div class="oc-card-label">` +
          `<span class="oc-card-name">${esc(s.label)}</span>` +
          `<span class="${badgeClass(s.status)}">${esc(s.status)}</span>` +
          `</div>` +
          `<p class="oc-card-amount">${money(s.amountUsd)}</p>` +
          `<p class="oc-card-detail">${esc(s.detail || '')}</p>` +
          `</article>`
        );
      })
      .join('');
  }

  function renderWatermark(wm) {
    const el = $('oc-watermark');
    if (!el) return;
    if (!wm || (!wm.coveredTo && !wm.lastImportAt)) {
      el.textContent = 'No GHL exports imported yet.';
      return;
    }
    const covered =
      wm.coveredFrom && wm.coveredTo
        ? `Covered ${wm.coveredFrom} → ${wm.coveredTo}`
        : wm.coveredTo
          ? `Through ${wm.coveredTo}`
          : '';
    const last = wm.lastImportAt
      ? `Last import ${new Date(wm.lastImportAt).toLocaleString()}`
      : '';
    el.textContent = [covered, last, wm.lastFilename ? `(${wm.lastFilename})` : '']
      .filter(Boolean)
      .join(' · ');
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
            const label = CAT_LABELS[c.category] || c.category;
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
      body.innerHTML = '<tr><td colspan="4" class="oc-empty">No imported charges for this period.</td></tr>';
      return;
    }
    const rows = charges
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 200);
    body.innerHTML = rows
      .map((c) => {
        const label = CAT_LABELS[c.category] || c.category;
        return (
          `<tr>` +
          `<td>${esc(c.date)}</td>` +
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
    } catch (err) {
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
      $('oc-month-total').textContent = money(snap.monthTotalUsd);
      const refreshed = snap.refreshedAt ? new Date(snap.refreshedAt).toLocaleString() : '';
      $('oc-refreshed').textContent = refreshed ? `Updated ${refreshed}` : '';
      renderCards(snap.services || {});
      renderWatermark(snap.ghlWatermark);
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

  async function uploadFile(file) {
    const resultEl = $('oc-import-result');
    if (!file) return;
    if (resultEl) {
      resultEl.textContent = `Importing ${file.name}…`;
      resultEl.classList.remove('is-ok', 'is-error');
    }
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch('/api/admin/operating-costs/ghl-import', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      if (resultEl) {
        resultEl.classList.add('is-ok');
        resultEl.textContent =
          `Imported ${data.newCount} new · ${data.duplicateCount} duplicates skipped` +
          (data.dateRange?.from
            ? ` · export range ${data.dateRange.from} → ${data.dateRange.to}`
            : '');
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
      const f = input.files && input.files[0];
      if (f) uploadFile(f);
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
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) uploadFile(f);
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
