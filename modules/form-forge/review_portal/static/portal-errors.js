const { escHtml, formatDayDate, postJson, showToast } = window.PortalShared;

let workflowRoot = null;
let errorItems = [];
let currentIndex = 0;
let fixedThisSession = 0;
let saving = false;

function wf$(selector) {
  return workflowRoot?.querySelector(selector) ?? null;
}

function showMsg(text, ok = true) {
  showToast(text, { ok });
  const el = wf$("#action-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  el.hidden = false;
}

function hideMsg() {
  const el = wf$("#action-msg");
  if (el) el.hidden = true;
}

function currentCity() {
  return errorItems[currentIndex] || null;
}

function notifyPortalPage(detail = {}) {
  window.dispatchEvent(new CustomEvent("portal-workflow-updated", { detail }));
}

function updateProgress() {
  const remaining = errorItems.length;
  const fixed = fixedThisSession;
  const total = remaining + fixed;
  const fill = wf$("#progress-fill");
  if (fill) {
    fill.style.width = total ? `${Math.round((fixed / total) * 100)}%` : "0%";
  }
  const progressText = wf$("#progress-text");
  if (progressText) {
    progressText.textContent = remaining
      ? `${remaining} portal URL${remaining === 1 ? "" : "s"} need fixing`
      : "All portal errors cleared";
  }
  const progressSub = wf$("#progress-sub");
  if (progressSub) {
    progressSub.textContent = fixed ? `${fixed} fixed this session` : "";
  }
}

function renderRemainingList() {
  const wrap = wf$("#queue-remaining");
  const list = wf$("#queue-remaining-list");
  if (!wrap || !list) return;
  if (!errorItems.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  const activeId = currentCity()?.id || "";
  list.innerHTML = errorItems
    .map((item) => {
      const cls = item.id === activeId ? "active" : "";
      return `<li class="${cls}">${escHtml(item.city)}, ${escHtml(item.state)}</li>`;
    })
    .join("");
}

function showEmptyState() {
  const loading = wf$("#request-loading");
  const card = wf$("#request-card");
  const empty = wf$("#request-empty");
  if (loading) loading.hidden = true;
  if (card) card.hidden = true;
  if (empty) empty.hidden = false;
  const emptyMsg = wf$("#empty-message");
  if (emptyMsg) {
    emptyMsg.textContent = fixedThisSession
      ? `You fixed ${fixedThisSession} portal URL${fixedThisSession === 1 ? "" : "s"} this session.`
      : "Every flagged portal URL has been fixed.";
  }
}

function renderCurrentCity() {
  const city = currentCity();
  if (!saving) hideMsg();

  if (!city) {
    showEmptyState();
    updateProgress();
    renderRemainingList();
    return;
  }

  const loading = wf$("#request-loading");
  const empty = wf$("#request-empty");
  const card = wf$("#request-card");
  if (loading) loading.hidden = true;
  if (empty) empty.hidden = true;
  if (card) card.hidden = false;

  wf$("#card-state").textContent = city.state;
  wf$("#card-city").textContent = city.city;
  wf$("#card-position").textContent = `${currentIndex + 1} of ${errorItems.length} errored portals`;

  const notes = city.portal_error_notes || city.url_notes || "No details recorded.";
  wf$("#card-error-notes").textContent = notes;
  const reportedAt = city.portal_error_at ? formatDayDate(city.portal_error_at) : "";
  const brokenUrl = city.portal_error_url || city.portal_url || "";
  wf$("#card-error-meta").textContent = [
    reportedAt ? `Reported ${reportedAt}` : "",
    brokenUrl ? `Broken URL: ${brokenUrl}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  wf$("#field-broken-url").value = brokenUrl;
  wf$("#field-portal-url").value = city.portal_url || "";
  wf$("#field-url-notes").value = city.url_notes || "";

  const testBtn = wf$("#btn-test-portal");
  const portalUrl = (wf$("#field-portal-url")?.value || "").trim();
  if (testBtn) testBtn.href = portalUrl || "#";

  const saveBtn = wf$("#btn-save-url");
  const fixedBtn = wf$("#btn-mark-fixed");
  if (saveBtn) saveBtn.disabled = saving;
  if (fixedBtn) fixedBtn.disabled = saving;

  updateProgress();
  renderRemainingList();
}

async function loadQueue() {
  const loading = wf$("#request-loading");
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = "<p>Loading portal errors…</p>";
  }
  wf$("#request-empty").hidden = true;
  wf$("#request-card").hidden = true;

  const res = await fetch("/api/portal/portal-errors");
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
  errorItems = data.items || [];
  currentIndex = 0;
  fixedThisSession = 0;
  renderCurrentCity();
  notifyPortalPage({ refreshBadges: true });
}

function advanceAfterFix(cityId) {
  errorItems = errorItems.filter((item) => item.id !== cityId);
  if (currentIndex >= errorItems.length) {
    currentIndex = Math.max(0, errorItems.length - 1);
  }
  fixedThisSession += 1;
  renderCurrentCity();
}

async function savePortalUrl() {
  const city = currentCity();
  if (!city || saving) return;
  const portalUrl = (wf$("#field-portal-url")?.value || "").trim();
  if (!portalUrl) {
    showMsg("Enter a corrected portal URL first.", false);
    return;
  }
  saving = true;
  renderCurrentCity();
  try {
    const data = await postJson(`/api/portal/city/${city.id}/portal-url`, {
      portal_url: portalUrl,
      url_notes: (wf$("#field-url-notes")?.value || "").trim(),
    });
    const idx = errorItems.findIndex((item) => item.id === city.id);
    if (idx >= 0) {
      errorItems[idx] = {
        ...errorItems[idx],
        portal_url: data.city?.portal_url || portalUrl,
        url_notes: data.city?.url_notes || "",
      };
    }
    showMsg("Portal URL saved.", true);
    renderCurrentCity();
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    saving = false;
    renderCurrentCity();
  }
}

async function markFixed() {
  const city = currentCity();
  if (!city || saving) return;
  const portalUrl = (wf$("#field-portal-url")?.value || "").trim();
  if (!portalUrl) {
    showMsg("Save a corrected portal URL before marking fixed.", false);
    return;
  }
  saving = true;
  renderCurrentCity();
  try {
    if (portalUrl !== (city.portal_url || "").trim()) {
      await postJson(`/api/portal/city/${city.id}/portal-url`, {
        portal_url: portalUrl,
        url_notes: (wf$("#field-url-notes")?.value || "").trim(),
      });
    }
    await postJson(`/api/portal/city/${city.id}/portal-error/clear`, {});
    advanceAfterFix(city.id);
    showMsg(`${city.city} marked fixed — back in the monthly queue.`, true);
    notifyPortalPage({ refreshBadges: true, portalErrorDelta: -1 });
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    saving = false;
    renderCurrentCity();
  }
}

function bindEvents() {
  wf$("#btn-save-url")?.addEventListener("click", () => {
    void savePortalUrl();
  });
  wf$("#btn-mark-fixed")?.addEventListener("click", () => {
    void markFixed();
  });
  wf$("#field-portal-url")?.addEventListener("input", () => {
    const testBtn = wf$("#btn-test-portal");
    const portalUrl = (wf$("#field-portal-url")?.value || "").trim();
    if (testBtn) testBtn.href = portalUrl || "#";
  });
}

async function init() {
  workflowRoot = document.querySelector(".submit-portals-layout");
  if (!workflowRoot) return;
  bindEvents();
  try {
    await loadQueue();
  } catch (err) {
    const loading = wf$("#request-loading");
    if (loading) {
      loading.innerHTML = `<p class="load-error">Could not load portal errors. Start the server with <code>python run_review_portal.py</code>. (${err.message})</p>`;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}