(function () {
  'use strict';

  const PLAYBOOKS_URL = '/api/gov-playbooks';
  const PLAYBOOK_STORAGE_KEY = 'phuglee_prelien_playbook_id';

  const state = {
    files: [],
    rows: [],
    csv: '',
    lookupAvailable: null,
    playbooks: [],
    activePlaybookId: ''
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = $('pl-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function setStatus(msg) {
    const el = $('pl-status');
    if (el) el.textContent = msg || '';
  }

  function authHeaders() {
    const h = {};
    try {
      const user = sessionStorage.getItem('phuglee_session') || '';
      const plan = sessionStorage.getItem('phuglee_plan') || '';
      if (user) h['x-phuglee-user'] = user;
      if (plan) h['x-phuglee-plan'] = plan;
    } catch (_) { /* ignore */ }
    return h;
  }

  function playbookLabel(p) {
    return `${p.county || 'County'}${p.state ? `, ${p.state}` : ''}`;
  }

  function activePlaybook() {
    return state.playbooks.find((p) => p.id === state.activePlaybookId) || null;
  }

  function playbookPlaceHints() {
    const pb = activePlaybook();
    if (!pb) return {};
    return {
      state: pb.state || '',
      county: pb.county || '',
      city: pb.defaultCity || pb.city || ''
    };
  }

  function appendPlaceFields(fd) {
    const place = playbookPlaceHints();
    if (place.state) fd.append('placeState', place.state);
    if (place.county) fd.append('placeCounty', place.county);
    if (place.city) fd.append('placeCity', place.city);
  }

  function queryIntent() {
    const params = new URLSearchParams(window.location.search || '');
    return {
      playbook: (params.get('playbook') || '').trim(),
      county: (params.get('county') || '').trim().toLowerCase(),
      state: (params.get('state') || '').trim().toUpperCase(),
      court: (params.get('court') || '').trim()
    };
  }

  function resolveInitialPlaybookId() {
    const q = queryIntent();
    if (q.playbook && state.playbooks.some((p) => p.id === q.playbook)) return q.playbook;
    if (q.county || q.state) {
      const hit = state.playbooks.find((p) => {
        const countyOk = !q.county || String(p.county || '').toLowerCase() === q.county;
        const stateOk = !q.state || String(p.state || '').toUpperCase() === q.state;
        return countyOk && stateOk;
      });
      if (hit) return hit.id;
    }
    try {
      const saved = sessionStorage.getItem(PLAYBOOK_STORAGE_KEY) || '';
      if (saved && state.playbooks.some((p) => p.id === saved)) return saved;
    } catch (_) { /* ignore */ }
    return state.playbooks[0]?.id || '';
  }

  function syncPlaybookUrl(id) {
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('playbook', id);
      else url.searchParams.delete('playbook');
      url.searchParams.delete('county');
      url.searchParams.delete('state');
      url.searchParams.delete('court');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    } catch (_) { /* ignore */ }
  }

  function renderPlaybookSelect() {
    const sel = $('pl-playbook-select');
    const empty = $('pl-playbook-empty');
    if (!sel) return;
    if (!state.playbooks.length) {
      sel.innerHTML = '<option value="">No playbooks yet</option>';
      sel.disabled = true;
      if (empty) empty.hidden = false;
      renderPlaybookCard(null);
      return;
    }
    if (empty) empty.hidden = true;
    sel.disabled = false;
    sel.innerHTML = state.playbooks
      .map((p) => `<option value="${esc(p.id)}">${esc(playbookLabel(p))}</option>`)
      .join('');
    if (!state.activePlaybookId || !state.playbooks.some((p) => p.id === state.activePlaybookId)) {
      state.activePlaybookId = resolveInitialPlaybookId();
    }
    sel.value = state.activePlaybookId;
    renderPlaybookCard(activePlaybook());
  }

  function metaRow(label, value) {
    const v = String(value || '').trim();
    if (!v) return '';
    return `<dt>${esc(label)}</dt><dd>${esc(v)}</dd>`;
  }

  function renderPlaybookCard(pb) {
    const card = $('pl-playbook-card');
    const meta = $('pl-playbook-meta');
    const court = $('pl-open-court');
    const assessor = $('pl-open-assessor');
    const edit = $('pl-playbook-edit');
    if (!card || !meta) return;

    if (!pb) {
      card.hidden = true;
      meta.innerHTML = '';
      if (court) court.hidden = true;
      if (assessor) assessor.hidden = true;
      return;
    }

    card.hidden = false;
    const pre = pb.preLien || {};
    const ass = pb.assessor || {};
    meta.innerHTML = [
      metaRow('Case types', pre.caseTypes),
      metaRow('Filters', pre.filters),
      metaRow('Fees', pre.fees),
      metaRow('Cadence', pre.cadence),
      metaRow('Login', pre.loginNotes),
      metaRow('What worked', pre.whatWorked),
      metaRow('Blockers', pre.blockers),
      metaRow('Assessor', ass.notes),
      metaRow('Notes', pb.notes)
    ].join('');

    if (court) {
      if (pre.courtUrl) {
        court.href = pre.courtUrl;
        court.hidden = false;
      } else {
        court.hidden = true;
        court.removeAttribute('href');
      }
    }
    if (assessor) {
      if (ass.url) {
        assessor.href = ass.url;
        assessor.hidden = false;
      } else {
        assessor.hidden = true;
        assessor.removeAttribute('href');
      }
    }
    if (edit) {
      edit.href = `/government-lists?tab=playbooks&playbook=${encodeURIComponent(pb.id)}`;
    }
  }

  function selectPlaybook(id, opts = {}) {
    const next = String(id || '');
    if (!state.playbooks.some((p) => p.id === next)) return;
    state.activePlaybookId = next;
    try {
      sessionStorage.setItem(PLAYBOOK_STORAGE_KEY, next);
    } catch (_) { /* ignore */ }
    const sel = $('pl-playbook-select');
    if (sel) sel.value = next;
    renderPlaybookCard(activePlaybook());
    if (opts.syncUrl !== false) syncPlaybookUrl(next);
  }

  async function loadPlaybooks() {
    const sel = $('pl-playbook-select');
    try {
      const res = await fetch(PLAYBOOKS_URL, {
        headers: authHeaders(),
        credentials: 'same-origin'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Playbooks failed (${res.status})`);
      state.playbooks = json.playbooks || [];
      state.activePlaybookId = resolveInitialPlaybookId();
      renderPlaybookSelect();
      if (state.activePlaybookId) syncPlaybookUrl(state.activePlaybookId);
    } catch (err) {
      if (sel) {
        sel.innerHTML = '<option value="">Could not load playbooks</option>';
        sel.disabled = true;
      }
      showToast(err.message || 'Could not load playbooks');
    }
  }

  function updateFileUi() {
    const btn = $('pl-extract');
    const matchBtn = $('pl-owner-match');
    const label = document.querySelector('.pl-drop-label');
    if (btn) btn.disabled = !state.files.length;
    if (matchBtn) matchBtn.disabled = !state.rows.length;
    if (label) {
      label.textContent = state.files.length
        ? `${state.files.length} PDF${state.files.length === 1 ? '' : 's'} ready`
        : 'Drop PDFs or click to choose';
    }
  }

  function addFiles(fileList) {
    const next = [...state.files];
    for (const f of fileList || []) {
      if (!/\.pdf$/i.test(f.name || '')) continue;
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    state.files = next.slice(0, 25);
    updateFileUi();
  }

  function matchBadge(r) {
    const v = String(r.ownerMatch || 'unchecked');
    const labels = {
      matched: 'Matched',
      possible: 'Possible',
      no_match: 'No match',
      no_owner: 'No owner data',
      unchecked: 'Unchecked'
    };
    return labels[v] || v;
  }

  function includePossibles() {
    return Boolean($('pl-include-possible')?.checked);
  }

  function skipExportRows() {
    return state.rows.filter((r) => {
      if (r.ownerMatch === 'matched') return true;
      if (includePossibles() && r.ownerMatch === 'possible') return true;
      return false;
    });
  }

  function renderRows() {
    const panel = $('pl-results-panel');
    const host = $('pl-results');
    const dl = $('pl-download');
    const dlSkip = $('pl-download-skip');
    const includeWrap = $('pl-include-possible-wrap');
    const count = $('pl-count');
    if (!host || !panel) return;

    if (!state.rows.length) {
      panel.hidden = true;
      host.innerHTML = '';
      if (dl) dl.hidden = true;
      if (dlSkip) dlSkip.hidden = true;
      if (includeWrap) includeWrap.hidden = true;
      if (count) count.textContent = '';
      updateFileUi();
      return;
    }

    panel.hidden = false;
    if (dl) dl.hidden = false;
    const matched = state.rows.filter((r) => r.ownerMatch === 'matched').length;
    const possible = state.rows.filter((r) => r.ownerMatch === 'possible').length;
    const exportCount = skipExportRows().length;
    if (includeWrap) includeWrap.hidden = possible < 1;
    if (dlSkip) {
      dlSkip.hidden = matched < 1 && possible < 1;
      dlSkip.textContent = exportCount > 0
        ? `Download ${exportCount} for skip`
        : 'Download for skip';
    }
    if (count) {
      count.textContent = `${state.rows.length} extracted · ${matched} matched · ${possible} possible`;
    }
    updateLookupTip();

    host.innerHTML = state.rows
      .map((r, i) => {
        const place = [r.streetAddress, r.city, r.state, r.zip].filter(Boolean).join(', ') || 'No address found';
        const checked = r.ownerMatch === 'matched' ? 'checked' : '';
        const ownerLine = r.ownerName
          ? `Owner: ${r.ownerName}${r.ownerMatchReason ? ` · ${r.ownerMatchReason}` : ''}`
          : (r.ownerMatchReason || 'Owner not looked up yet');
        return `<article class="pl-row pl-row--${esc(r.ownerMatch || 'unchecked')}" role="listitem" data-i="${i}">
          <div class="pl-row-top">
            <span class="pl-row-addr">${esc(place)}</span>
            <span class="pl-row-meta">${esc(matchBadge(r))}${r.ownerMatchScore != null && r.ownerMatchScore !== '' ? ` · ${esc(r.ownerMatchScore)}` : ''}</span>
          </div>
          <div class="pl-row-sub">${esc(r.descriptionNotes || '')}</div>
          <div class="pl-row-sub">${esc(ownerLine)}</div>
          <label class="pl-row-check">
            <input type="checkbox" data-owner="${i}" ${checked} />
            <span>Force match (defendant is owner)</span>
          </label>
        </article>`;
      })
      .join('');
    updateFileUi();
  }

  function updateLookupTip() {
    const tip = $('pl-lookup-tip');
    if (!tip) return;
    if (state.lookupAvailable === false) {
      tip.textContent = 'REAPI key not set — Auto owner-match cannot look up owners yet. Add REALESTATE_API_KEY to .env, restart, then re-run. You can still force-match manually and export.';
    } else if (state.lookupAvailable === true) {
      tip.textContent = 'Owner lookup uses RealEstateAPI (defendant ≈ owner only — not skip tracing). Force-match overrides if needed, then Download matched for skip.';
    } else {
      tip.textContent = 'Auto owner-match looks up the property owner (RealEstateAPI) and scores defendant ≈ owner — not skip tracing. Mark overrides manually if needed.';
    }
  }

  function rebuildCsv() {
    const cols = [
      'Street Address', 'City', 'State', 'Zip', 'County', 'Violation/Issue Type', 'Violation Date',
      'Description/Notes', 'Defendant Name', 'Plaintiff', 'Case Number', 'Amount Claimed',
      'Owner Name', 'Mailing Address', 'Owner Match', 'Owner Match Score', 'Owner Match Reason'
    ];
    const keys = [
      'streetAddress', 'city', 'state', 'zip', 'county', 'violationIssueType', 'violationDate',
      'descriptionNotes', 'defendantName', 'plaintiff', 'caseNumber', 'amountClaimed',
      'ownerName', 'mailingAddress', 'ownerMatch', 'ownerMatchScore', 'ownerMatchReason'
    ];
    const escCell = (v) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [cols.join(',')];
    for (const row of state.rows) {
      lines.push(keys.map((k) => escCell(row[k])).join(','));
    }
    state.csv = `${lines.join('\n')}\n`;
  }

  function buildSkipCsv() {
    const selected = skipExportRows();
    const cols = [
      'Owner Name', 'Street Address', 'City', 'State', 'Zip', 'County', 'Mailing Address',
      'Defendant Name', 'Plaintiff', 'Case Number', 'Amount Claimed',
      'Owner Match', 'Owner Match Score'
    ];
    const keys = [
      'ownerName', 'streetAddress', 'city', 'state', 'zip', 'county', 'mailingAddress',
      'defendantName', 'plaintiff', 'caseNumber', 'amountClaimed',
      'ownerMatch', 'ownerMatchScore'
    ];
    const escCell = (v) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [cols.join(',')];
    for (const row of selected) {
      lines.push(keys.map((k) => escCell(row[k])).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function stampRowsFromPlaybook(rows) {
    const place = playbookPlaceHints();
    if (!place.state && !place.county && !place.city) return { rows, stamped: 0 };
    let stamped = 0;
    const next = (rows || []).map((row) => {
      const out = { ...row };
      let changed = false;
      if (!String(out.state || '').trim() && place.state) {
        out.state = String(place.state).toUpperCase().slice(0, 2);
        changed = true;
      }
      if (!String(out.city || '').trim() && place.city) {
        out.city = place.city;
        changed = true;
      }
      if (!String(out.county || '').trim() && place.county) {
        out.county = place.county;
        changed = true;
      }
      if (changed) {
        stamped += 1;
        if (!String(out.descriptionNotes || '').includes('Place from playbook')) {
          out.descriptionNotes = [out.descriptionNotes, 'Place from playbook']
            .filter(Boolean)
            .join(' · ')
            .slice(0, 400);
        }
      }
      return out;
    });
    return { rows: next, stamped };
  }

  function applyResult(json, fallbackToast) {
    let rows = (json.rows || []).map((r) => ({ ...r, ownerMatch: r.ownerMatch || 'unchecked' }));
    const clientStamp = stampRowsFromPlaybook(rows);
    rows = clientStamp.rows;
    const stampCount = (json.placeStamp && json.placeStamp.stamped) || clientStamp.stamped || 0;
    state.rows = rows;
    if (typeof json.lookupAvailable === 'boolean') state.lookupAvailable = json.lookupAvailable;
    state.csv = json.csv || '';
    rebuildCsv();
    renderRows();
    const om = json.ownerMatch;
    const dd = json.dedupe;
    const ocr = json.ocr;
    const bits = [];
    bits.push(`Got ${state.rows.length}`);
    if (om) {
      bits.push(`matched ${om.matched || 0}`);
      bits.push(`possible ${om.possible || 0}`);
      bits.push(`no match ${om.no_match || 0}`);
    }
    if (dd && dd.removed > 0) bits.push(`deduped ${dd.removed}`);
    if (ocr && ocr.used > 0) bits.push(`OCR ${ocr.used}`);
    if (stampCount > 0) bits.push(`place ${stampCount}`);
    if (om || (dd && dd.removed > 0) || (ocr && ocr.used > 0) || stampCount > 0) {
      setStatus(bits.join(' · '));
    }
    if (json.tip && state.lookupAvailable === false) setStatus(json.tip);
    let toast = fallbackToast;
    if (dd && dd.removed > 0) {
      toast = `${toast} · removed ${dd.removed} duplicate address${dd.removed === 1 ? '' : 'es'}`;
    }
    if (ocr && ocr.used > 0) {
      toast = `${toast} · OCR on ${ocr.used} scan${ocr.used === 1 ? '' : 's'}`;
    }
    if (stampCount > 0) {
      toast = `${toast} · stamped place on ${stampCount}`;
    }
    showToast(toast);
  }

  async function extractPdfs() {
    if (!state.files.length) return;
    setStatus('Extracting + OCR if needed + owner-match…');
    const fd = new FormData();
    state.files.forEach((f, i) => fd.append('files', f, f.name || `complaint-${i + 1}.pdf`));
    appendPlaceFields(fd);
    try {
      const res = await fetch('/api/pre-lien/extract', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
        credentials: 'same-origin'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Extract failed (${res.status})`);
      }
      const errN = (json.errors || []).length;
      applyResult(
        json,
        errN ? (json.errors[0].error || 'Some files failed') : 'Extract + owner-match done'
      );
      if (!json.ownerMatch) {
        setStatus(`Got ${state.rows.length} row${state.rows.length === 1 ? '' : 's'}`);
      }
    } catch (err) {
      setStatus(err.message || 'Extract failed');
      showToast(err.message || 'Extract failed');
    }
  }

  async function extractPaste() {
    const text = ($('pl-paste') && $('pl-paste').value) || '';
    if (!text.trim()) {
      showToast('Paste complaint text first');
      return;
    }
    setStatus('Extracting paste + owner-match…');
    try {
      const res = await fetch('/api/pre-lien/extract-text', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, place: playbookPlaceHints() }),
        credentials: 'same-origin'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Failed (${res.status})`);
      applyResult(json, 'Paste extracted');
    } catch (err) {
      setStatus(err.message || 'Paste extract failed');
      showToast(err.message || 'Paste extract failed');
    }
  }

  async function runOwnerMatch() {
    if (!state.rows.length) return;
    setStatus('Running owner-match…');
    try {
      const res = await fetch('/api/pre-lien/owner-match', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: state.rows, lookup: true, place: playbookPlaceHints() }),
        credentials: 'same-origin'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Failed (${res.status})`);
      applyResult(json, json.lookupAvailable === false
        ? 'No API key — scored local owner names only'
        : 'Owner-match complete');
    } catch (err) {
      setStatus(err.message || 'Owner-match failed');
      showToast(err.message || 'Owner-match failed');
    }
  }

  function downloadCsv() {
    rebuildCsv();
    const blob = new Blob([state.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pre-liens-all-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('All rows CSV downloaded');
  }

  function downloadSkipCsv() {
    const selected = skipExportRows();
    if (!selected.length) {
      showToast(includePossibles()
        ? 'No matched or possible rows yet'
        : 'No matched rows — check Include possibles or force-match first');
      return;
    }
    const csv = buildSkipCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const tag = includePossibles() ? 'matched-possible' : 'matched';
    a.download = `pre-liens-${tag}-skip-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    const possN = selected.filter((r) => r.ownerMatch === 'possible').length;
    showToast(
      possN > 0
        ? `${selected.length} rows for skip (${possN} possible)`
        : `${selected.length} matched row${selected.length === 1 ? '' : 's'} → skip tool`
    );
  }

  function bind() {
    const drop = $('pl-drop');
    const input = $('pl-files');
    drop?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((evt) => {
      drop?.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.add('is-drag');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      drop?.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.remove('is-drag');
      });
    });
    drop?.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files));

    $('pl-extract')?.addEventListener('click', extractPdfs);
    $('pl-extract-text')?.addEventListener('click', extractPaste);
    $('pl-owner-match')?.addEventListener('click', runOwnerMatch);
    $('pl-download')?.addEventListener('click', downloadCsv);
    $('pl-download-skip')?.addEventListener('click', downloadSkipCsv);
    $('pl-include-possible')?.addEventListener('change', () => {
      renderRows();
    });
    $('pl-playbook-select')?.addEventListener('change', (e) => {
      selectPlaybook(e.target.value);
      const pb = activePlaybook();
      if (pb) showToast(`Using ${playbookLabel(pb)}`);
      if (state.rows.length) {
        const stamped = stampRowsFromPlaybook(state.rows);
        state.rows = stamped.rows;
        rebuildCsv();
        renderRows();
        if (stamped.stamped > 0) {
          showToast(`Stamped place on ${stamped.stamped} row${stamped.stamped === 1 ? '' : 's'}`);
        }
      }
    });
    $('pl-clear')?.addEventListener('click', () => {
      state.files = [];
      state.rows = [];
      state.csv = '';
      if ($('pl-paste')) $('pl-paste').value = '';
      updateFileUi();
      renderRows();
      setStatus('');
    });

    $('pl-results')?.addEventListener('change', (e) => {
      const box = e.target.closest('[data-owner]');
      if (!box) return;
      const i = Number(box.getAttribute('data-owner'));
      if (!state.rows[i]) return;
      state.rows[i].ownerMatch = box.checked ? 'matched' : 'unchecked';
      if (box.checked) {
        state.rows[i].ownerMatchReason = 'Forced match by operator';
        state.rows[i].ownerMatchScore = 100;
      }
      rebuildCsv();
      renderRows();
    });
  }

  async function init() {
    bind();
    updateFileUi();
    await loadPlaybooks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
    });
  } else {
    init();
  }
})();
