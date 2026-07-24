(function () {
  'use strict';

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

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg) {
    const el = $('csms-status');
    if (el) el.textContent = msg || '';
  }

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return String(n);
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      err.code = data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  function renderPolicy(data) {
    const ul = $('csms-policy-list');
    if (!ul) return;
    const p = data.policy || {};
    const items = [
      `KPI scope: ${p.kpiScope || 'contacts tagged phuglee only'}`,
      `Phuglee tag: ${p.phugleeTag || 'phuglee'} · source: ${p.sourceTag || 'code violation'}`,
      `Spacing: ${p.spacingDays || 4} days between cold texts`,
      `Hard stop: ${p.maxTouches || 12} texts or reply`,
      `Live env: ${data.live ? 'ON' : 'OFF'} · Auto env: ${data.autoEnv ? 'ON' : 'OFF'}`,
      `Auto state: ${data.autoState && data.autoState.enabled ? 'enabled' : 'paused'}`,
      'Exclusions: ' + (p.exclusions || []).join(', ')
    ];
    ul.innerHTML = items.map((t) => `<li>${t}</li>`).join('');
    const q = $('csms-queue');
    if (q) q.textContent = `Sync queue depth: ${data.queueDepth ?? 0}`;
  }

  function renderKpis(data) {
    const o = (data.kpis && data.kpis.outcomes) || {};
    const f = (data.kpis && data.kpis.funnel) || {};
    $('kpi-interested').textContent = fmt(o.interested);
    $('kpi-ni').textContent = fmt(o.notInterested);
    $('kpi-dnc').textContent = fmt(o.dncDnd);
    $('kpi-wrong').textContent = fmt(o.wrongNumber);
    $('kpi-fu').textContent = fmt(o.followUp);
    $('kpi-eligible').textContent = fmt(f.eligibleNow);
    $('kpi-zero').textContent = fmt(f.neverTexted);
    $('kpi-seq').textContent = fmt(f.inSequence);
    $('kpi-max').textContent = fmt(f.atMax);
    $('kpi-week').textContent = fmt(f.sentThisWeek);
  }

  let backfillPollTimer = null;

  function fmtNum(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function renderBackfillProgress(bp) {
    const root = $('csms-backfill');
    if (!root) return;
    // Always show temp panel while tracker ships (hide only if API omits it entirely)
    if (!bp) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const pct = Number.isFinite(Number(bp.percent)) ? Number(bp.percent) : 0;
    const pctEl = $('csms-backfill-pct');
    const fill = $('csms-backfill-fill');
    const bar = $('csms-backfill-bar');
    if (pctEl) {
      pctEl.textContent = `${pct}%`;
      pctEl.classList.toggle('is-complete', !!bp.complete || pct >= 100);
    }
    if (fill) {
      fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      fill.classList.toggle('is-complete', !!bp.complete || pct >= 100);
    }
    if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    const counts = $('csms-backfill-counts');
    if (counts) {
      const homes = bp.vaultHomes != null ? bp.vaultHomes : null;
      const land = bp.vaultLand != null ? bp.vaultLand : null;
      const mix =
        homes != null || land != null
          ? ` (${fmtNum(homes || 0)} homes + ${fmtNum(land || 0)} lots)`
          : '';
      counts.textContent =
        `Processed ${fmtNum(bp.processed)} / ${fmtNum(bp.vaultTotal)} vault leads${mix}`;
    }
    const tagged = $('csms-backfill-tagged');
    if (tagged) tagged.textContent = `Tagged in GHL ${fmtNum(bp.tagged)}`;
    const skipped = $('csms-backfill-skipped');
    if (skipped) skipped.textContent = `Skipped ${fmtNum(bp.skipped)}`;
    const ghl = $('csms-backfill-ghl');
    if (ghl) {
      const cov = bp.ghlCoveragePct != null ? ` · ~${bp.ghlCoveragePct}% of vault` : '';
      ghl.textContent = `GHL phuglee contacts ${fmtNum(bp.ghlPhugleeTagged)}${cov}`;
    }
    const updated = $('csms-backfill-updated');
    if (updated) {
      let when = '—';
      if (bp.updatedAt) {
        try {
          when = new Date(bp.updatedAt).toLocaleString();
        } catch (_) {
          when = String(bp.updatedAt);
        }
      }
      updated.textContent = `Updated ${when} · source ${bp.source || '—'}`;
    }

    // Auto-poll while incomplete so refresh isn't required
    if (backfillPollTimer) {
      clearInterval(backfillPollTimer);
      backfillPollTimer = null;
    }
    if (!bp.complete && pct < 100) {
      backfillPollTimer = setInterval(() => {
        pollBackfillOnly();
      }, 12000);
    }
  }

  async function pollBackfillOnly() {
    try {
      const data = await api('/api/admin/campaigns/sms/backfill-progress');
      if (data.backfillProgress) renderBackfillProgress(data.backfillProgress);
    } catch (_) {
      /* ignore poll errors */
    }
  }

  function renderBadge(live) {
    const b = $('csms-live-badge');
    if (!b) return;
    if (live) {
      b.textContent = 'LIVE';
      b.className = 'csms-badge csms-badge--live';
    } else {
      b.textContent = 'DRY MODE';
      b.className = 'csms-badge csms-badge--dry';
    }
  }

  function renderRuns(runs) {
    const body = $('csms-runs-body');
    if (!body) return;
    if (!runs || !runs.length) {
      body.innerHTML = '<tr><td colspan="6">No runs yet</td></tr>';
      return;
    }
    body.innerHTML = runs.map((r) => (
      `<tr>
        <td>${r.at || '—'}</td>
        <td>${r.dryRun ? 'dry-run' : (r.mode || 'live')}</td>
        <td>${r.touch ?? '—'}</td>
        <td>${r.sent ?? 0}</td>
        <td>${r.skipped ?? r.excluded ?? 0}</td>
        <td>${r.failed ?? 0}</td>
      </tr>`
    )).join('');
  }

  async function refresh() {
    setStatus('Loading…');
    try {
      // Progress first so the bar updates even if full KPI fetch is slow
      try {
        const prog = await api('/api/admin/campaigns/sms/backfill-progress');
        if (prog.backfillProgress) renderBackfillProgress(prog.backfillProgress);
      } catch (_) {
        /* non-fatal */
      }
      const data = await api('/api/admin/campaigns/sms/overview');
      renderBadge(!!data.live);
      renderPolicy(data);
      renderKpis(data);
      if (data.backfillProgress) renderBackfillProgress(data.backfillProgress);
      const sendBtn = $('csms-send');
      if (sendBtn) {
        sendBtn.disabled = !data.live;
        sendBtn.title = data.live
          ? 'Live send — requires typing SEND'
          : 'Requires SMS_CAMPAIGNS_LIVE=true';
      }
      const auto = $('csms-auto');
      if (auto) {
        auto.disabled = !data.live || !data.autoEnv;
        auto.checked = !!(data.autoState && data.autoState.enabled);
      }
      const runs = await api('/api/admin/campaigns/sms/runs?limit=20');
      renderRuns(runs.runs || []);
      const bp = data.backfillProgress;
      const pctNote = bp && bp.vaultTotal
        ? ` · base load ${bp.percent}% (${fmtNum(bp.processed)}/${fmtNum(bp.vaultTotal)})`
        : '';
      setStatus(
        (data.kpis && data.kpis.cached ? 'Updated (cached KPIs)' : 'Updated') + pctNote
      );
    } catch (err) {
      setStatus(err.message || 'Failed to load');
    }
  }

  function touchPayload() {
    return {
      touch: Number($('csms-touch').value || 0),
      limit: Number($('csms-limit').value || 100)
    };
  }

  function showResult(obj) {
    const pre = $('csms-result');
    if (!pre) return;
    pre.hidden = false;
    pre.textContent = JSON.stringify(obj, null, 2);
  }

  async function onPreview() {
    setStatus('Preview…');
    try {
      const p = touchPayload();
      const data = await api(
        `/api/admin/campaigns/sms/eligible?touch=${p.touch}&sample=10`
      );
      showResult(data);
      setStatus(`Preview: ${data.candidates} eligible at touch ${data.touch}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onDry() {
    setStatus('Dry-run…');
    try {
      const p = touchPayload();
      const data = await api('/api/admin/campaigns/sms/dry-run', {
        method: 'POST',
        body: JSON.stringify(p)
      });
      showResult(data);
      setStatus(`Dry-run complete: would send ${data.wouldSend?.length ?? data.candidates ?? 0}`);
      refresh();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onSend() {
    const confirm = window.prompt('Type SEND to confirm live blast (irreversible):');
    if (confirm !== 'SEND') {
      setStatus('Send cancelled');
      return;
    }
    setStatus('Sending…');
    try {
      const p = touchPayload();
      const data = await api('/api/admin/campaigns/sms/send', {
        method: 'POST',
        body: JSON.stringify({ ...p, confirm: 'SEND' })
      });
      showResult(data);
      setStatus(`Sent ${data.sent || 0}, failed ${data.failed || 0}`);
      refresh();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onAutoChange() {
    const enabled = !!$('csms-auto').checked;
    try {
      await api('/api/admin/campaigns/sms/auto', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      setStatus(enabled ? 'Auto enabled' : 'Auto paused');
      refresh();
    } catch (err) {
      setStatus(err.message);
      $('csms-auto').checked = !enabled;
    }
  }

  function init() {
    const gate = $('csms-gate');
    const app = $('csms-app');
    if (!isAdmin()) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
    $('csms-refresh')?.addEventListener('click', refresh);
    $('csms-preview')?.addEventListener('click', onPreview);
    $('csms-dry')?.addEventListener('click', onDry);
    $('csms-send')?.addEventListener('click', onSend);
    $('csms-auto')?.addEventListener('change', onAutoChange);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
