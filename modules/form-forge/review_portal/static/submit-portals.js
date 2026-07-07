const {
  escHtml,
  formatDayDate,
  isPdfLinkUrl,
  postJson,
  showToast,
  filterByCollectSelection,
  collectSelectionCount,
} = window.PortalShared;
const {
  buildMessage,
  defaultVariantIndex,
  nextVariantIndex,
  VARIANT_COUNT,
} = window.PortalRequestMessage;

let workflowRoot = null;
let queueData = null;
let pendingItems = [];
let blockedItems = [];
let currentIndex = 0;
let sentThisSession = 0;
let skippedIds = new Set();
let submitting = false;
let messageVariantIndex = 0;
let previousCity = null;
let markingPreviousError = false;
let markingPreviousPdf = false;
let messageExpanded = false;
const ignoredSubmissionLogs = new Set();

function wf$(selector) {
  if (!workflowRoot) return document.querySelector(selector);
  const hit = workflowRoot.querySelector(selector);
  if (hit) return hit;
  // Confirm dialogs live outside the workflow root (<main>).
  if (selector.startsWith("#")) return document.querySelector(selector);
  return null;
}

function skippedStorageKey() {
  return `submit-portals-skipped-${queueData?.current_month || "unknown"}`;
}

function loadSkippedFromStorage() {
  try {
    const raw = sessionStorage.getItem(skippedStorageKey());
    skippedIds = new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    skippedIds = new Set();
  }
}

function persistSkippedIds() {
  try {
    sessionStorage.setItem(skippedStorageKey(), JSON.stringify([...skippedIds]));
  } catch (_) {
    /* ignore quota errors */
  }
}

function restoreSkippedCity(cityId) {
  if (!cityId || !skippedIds.has(cityId)) return;
  skippedIds.delete(cityId);
  persistSkippedIds();
  renderCurrentCity();
}

function showMsg(text, ok = true) {
  showToast(text, { ok });
  const el = wf$("#portal-submit-msg") || wf$("#action-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  el.hidden = false;
}

function hideMsg() {
  const el = wf$("#portal-submit-msg") || wf$("#action-msg");
  if (el) el.hidden = true;
}

function activeQueue() {
  return pendingItems.filter((item) => !skippedIds.has(item.id));
}

function currentCity() {
  return activeQueue()[currentIndex] || null;
}

function alreadySentThisMonth() {
  return queueData?.total_sent_this_month || 0;
}

function monthlyTotals() {
  const alreadySent = alreadySentThisMonth();
  const remaining = pendingItems.length;
  // total_sent_this_month is bumped locally in advanceAfterSubmit — do not add sentThisSession again.
  const done = alreadySent;
  const total =
    queueData?.total_eligible ?? remaining + alreadySent + (queueData?.total_blocked || 0);
  return { alreadySent, remaining, done, total };
}

function updateProgress() {
  const queue = activeQueue();
  const remaining = queue.length;
  const sentMonth = queueData?.total_sent_this_month || 0;
  const doneThisMonth = sentMonth;
  const totalForMonth =
    queueData?.total_eligible ?? doneThisMonth + remaining + (queueData?.total_blocked || 0);

  const monthLabel = wf$("#month-label");
  if (monthLabel) monthLabel.textContent = queueData?.current_month_label || "This month";

  if (totalForMonth === 0) {
    const fill = wf$("#progress-fill");
    if (fill) fill.style.width = "0%";
    const progressText = wf$("#progress-text");
    if (progressText) progressText.textContent = "No pending submissions";
    const progressSub = wf$("#progress-sub");
    if (progressSub) {
      progressSub.textContent = blockedItems.length ? `${blockedItems.length} on hold` : "";
    }
    return;
  }

  const pct = Math.round((doneThisMonth / totalForMonth) * 100);
  const fill = wf$("#progress-fill");
  if (fill) fill.style.width = `${pct}%`;

  const progressText = wf$("#progress-text");
  if (progressText) {
    if (remaining === 0) {
      progressText.textContent =
        doneThisMonth === 1
          ? "1 submitted this month"
          : `${doneThisMonth} submitted this month`;
    } else if (sentThisSession === 0 && sentMonth === 0) {
      progressText.textContent = `${remaining} remaining`;
    } else if (sentThisSession === 0) {
      progressText.textContent = `${remaining} remaining · ${sentMonth} already done · ${totalForMonth} total`;
    } else {
      progressText.textContent = `${doneThisMonth} of ${totalForMonth} submitted this month`;
    }
  }

  const subParts = [];
  if (sentThisSession) subParts.push(`${sentThisSession} this session`);
  if (blockedItems.length) subParts.push(`${blockedItems.length} on hold`);
  const progressSub = wf$("#progress-sub");
  if (progressSub) progressSub.textContent = subParts.join(" · ");
}

function renderRemainingList() {
  const wrap = wf$("#queue-remaining");
  const list = wf$("#queue-remaining-list");
  const queue = activeQueue();
  if (!wrap || !list) return;

  if (!queue.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  const activeId = currentCity()?.id || "";
  list.innerHTML = pendingItems
    .map((item) => {
      const cls = skippedIds.has(item.id) ? "done" : item.id === activeId ? "active" : "";
      return `<li class="${cls}">${escHtml(item.city)}, ${escHtml(item.state)}</li>`;
    })
    .join("");
}

function skippedItems() {
  return pendingItems.filter((item) => skippedIds.has(item.id));
}

function renderSkippedList() {
  const wrap = wf$("#queue-skipped");
  const list = wf$("#queue-skipped-list");
  const countEl = wf$("#queue-skipped-count");
  const items = skippedItems();
  if (!wrap || !list) return;

  if (!items.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    if (countEl) countEl.textContent = "";
    return;
  }

  wrap.hidden = false;
  if (countEl) countEl.textContent = `(${items.length})`;
  list.innerHTML = items
    .map(
      (item) => `
      <li>
        <span>${escHtml(item.city)}, ${escHtml(item.state)}</span>
        <button type="button" class="btn ghost sm queue-skipped-restore" data-restore-id="${item.id}">Restore</button>
      </li>`
    )
    .join("");
}

function renderBlockedList() {
  const wrap = wf$("#queue-blocked");
  const list = wf$("#queue-blocked-list");
  if (!wrap || !list) return;

  if (!blockedItems.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  list.innerHTML = blockedItems
    .map(
      (item) => `
      <li>
        <strong>${escHtml(item.city)}, ${escHtml(item.state)}</strong>
        ${escHtml(item.blocked_reason || item.sent_label || "Cannot submit yet")}
      </li>`
    )
    .join("");
}

function showEmptyState() {
  const loading = wf$("#request-loading");
  const card = wf$("#request-card");
  const empty = wf$("#request-empty");
  if (loading) loading.hidden = true;
  if (card) card.hidden = true;
  if (empty) empty.hidden = false;

  const sentMonth = queueData?.total_sent_this_month || 0;
  const blocked = blockedItems.length;
  const skipped = skippedIds.size;
  let message = "No portal submissions are ready right now.";
  if (skipped && pendingItems.length) {
    message = `You skipped ${skipped} of ${pendingItems.length} cities. Use Restore below to bring any back.`;
  } else if (sentMonth && blocked) {
    message = `${sentMonth} submitted this month. ${blocked} more are on hold until cooldown.`;
  } else if (blocked) {
    message = `No cities ready to submit right now. ${blocked} are waiting on cooldown.`;
  } else if (sentMonth) {
    message = `All ${sentMonth} portal submissions for this month are complete.`;
  }
  const emptyMsg = wf$("#empty-message");
  if (emptyMsg) emptyMsg.textContent = message;
}

function messageVariantStorageKey() {
  return `submit-portals-message-variant-${queueData?.current_month || "unknown"}`;
}

function loadMessageVariantIndex() {
  const fallback = defaultVariantIndex(queueData?.current_month);
  try {
    const raw = sessionStorage.getItem(messageVariantStorageKey());
    if (raw == null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return ((parsed % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
  } catch (_) {
    return fallback;
  }
}

function persistMessageVariantIndex() {
  try {
    sessionStorage.setItem(messageVariantStorageKey(), String(messageVariantIndex));
  } catch (_) {
    /* ignore quota errors */
  }
}

function setMessageExpanded(expanded) {
  messageExpanded = expanded;
  const body = wf$("#portal-request-message-body");
  const toggle = wf$("#btn-toggle-message");
  const wrap = wf$("#portal-request-message");
  if (body) body.hidden = !expanded;
  if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  if (wrap) wrap.classList.toggle("is-expanded", expanded);
}

function toggleRequestMessage() {
  setMessageExpanded(!messageExpanded);
}

function renderRequestMessage(city) {
  const wrap = wf$("#portal-request-message");
  const textarea = wf$("#portal-request-message-text");
  const cityLabel = wf$("#portal-request-message-city");
  if (!wrap || !textarea) return;

  if (!city?.city) {
    wrap.hidden = true;
    textarea.value = "";
    if (cityLabel) cityLabel.textContent = "";
    setMessageExpanded(false);
    return;
  }

  wrap.hidden = false;
  setMessageExpanded(false);
  if (cityLabel) cityLabel.textContent = city.city;
  textarea.value = buildMessage(city.city, messageVariantIndex);
}

function rewriteRequestMessage() {
  const city = currentCity();
  if (!city) return;
  messageVariantIndex = nextVariantIndex(messageVariantIndex);
  persistMessageVariantIndex();
  renderRequestMessage(city);
  showToast("Message rewritten — same request, new wording.", { ok: true, duration: 3200 });
}

async function copyRequestMessage() {
  const textarea = wf$("#portal-request-message-text");
  const text = (textarea?.value || "").trim();
  if (!text) {
    showToast("No message to copy.", { ok: false });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Message copied to clipboard.", { ok: true, duration: 3200 });
  } catch (_) {
    textarea?.focus();
    textarea?.select();
    showToast("Copy failed — message selected; press Ctrl+C.", { ok: false, duration: 4500 });
  }
}

function setPortalButtonState({ disabled = false, label = "Open portal & mark submitted" } = {}) {
  const btn = wf$("#btn-open-portal");
  if (!btn) return;
  btn.classList.toggle("submitting", disabled);
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  const labelEl = btn.querySelector(".portal-open-label");
  if (labelEl) labelEl.textContent = label;
}

function notifyPortalPage(detail = {}) {
  window.dispatchEvent(new CustomEvent("portal-workflow-updated", { detail }));
}

function setPreviousCity(city) {
  if (!city) {
    previousCity = null;
    return;
  }
  previousCity = {
    id: city.id,
    city: city.city,
    state: city.state,
  };
}

function renderPreviousCityBanner() {
  const wrap = wf$("#portal-previous-actions");
  const label = wf$("#portal-previous-label");
  const detail = wf$("#portal-previous-detail");
  const errorBtn = wf$("#btn-mark-previous-error");
  const pdfBtn = wf$("#btn-mark-previous-pdf");
  if (!wrap) return;
  if (!previousCity) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (label) label.textContent = `Previous: ${previousCity.city}, ${previousCity.state}`;
  if (detail) detail.textContent = "Opened a PDF or broken link?";
  if (errorBtn) errorBtn.disabled = markingPreviousError || markingPreviousPdf;
  if (pdfBtn) pdfBtn.disabled = markingPreviousError || markingPreviousPdf;
}

function renderPdfUrlWarning(city) {
  const warning = wf$("#portal-pdf-url-warning");
  if (!warning) return;
  const portalUrl = (city?.portal_url || "").trim();
  warning.hidden = !isPdfLinkUrl(portalUrl);
}

function openPortalErrorDialog() {
  if (!previousCity) return;
  const dialog = wf$("#portal-error-dialog");
  const notes = wf$("#portal-error-notes");
  const lead = wf$("#portal-error-dialog-lead");
  if (lead) {
    lead.textContent = `Revert ${previousCity.city}'s submission for this month and flag the portal URL as broken.`;
  }
  if (notes) notes.value = "";
  dialog?.showModal();
}

function closePortalErrorDialog() {
  wf$("#portal-error-dialog")?.close();
}

function adjustMonthlyCountsAfterRevert() {
  if (queueData && (queueData.total_sent_this_month || 0) > 0) {
    queueData.total_sent_this_month -= 1;
  }
  if (sentThisSession > 0) sentThisSession -= 1;
}

async function markPreviousPortalError() {
  if (!previousCity || markingPreviousError) return;
  const notes = (wf$("#portal-error-notes")?.value || "").trim();
  markingPreviousError = true;
  ignoredSubmissionLogs.add(previousCity.id);
  renderPreviousCityBanner();
  try {
    await postJson(`/api/portal/city/${previousCity.id}/portal-error`, { notes });
    adjustMonthlyCountsAfterRevert();
    showMsg(`${previousCity.city} marked as portal error — removed from this month's queue.`, true);
    previousCity = null;
    closePortalErrorDialog();
    renderPreviousCityBanner();
    updateProgress();
    notifyPortalPage({ refreshBadges: true, portalErrorDelta: 1 });
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    markingPreviousError = false;
    renderPreviousCityBanner();
  }
}

function openPortalPdfDialog() {
  if (!previousCity) return;
  const dialog = wf$("#portal-pdf-dialog");
  const notes = wf$("#portal-pdf-notes");
  const lead = wf$("#portal-pdf-dialog-lead");
  if (lead) {
    lead.textContent = `Revert ${previousCity.city}'s submission for this month and move it to the PDF workflow.`;
  }
  if (notes) notes.value = "";
  dialog?.showModal();
}

function closePortalPdfDialog() {
  wf$("#portal-pdf-dialog")?.close();
}

async function markPreviousAsPdfForm() {
  if (!previousCity || markingPreviousPdf) return;
  const notes = (wf$("#portal-pdf-notes")?.value || "").trim();
  markingPreviousPdf = true;
  ignoredSubmissionLogs.add(previousCity.id);
  renderPreviousCityBanner();
  try {
    await postJson(`/api/portal/city/${previousCity.id}/reclassify-pdf-form`, { notes });
    adjustMonthlyCountsAfterRevert();
    showMsg(
      `${previousCity.city} marked as PDF form — fill it in Records Desk, then send via Request PDFs.`,
      true
    );
    previousCity = null;
    closePortalPdfDialog();
    renderPreviousCityBanner();
    updateProgress();
    notifyPortalPage({ refreshBadges: true, onlineDelta: 1 });
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    markingPreviousPdf = false;
    renderPreviousCityBanner();
  }
}

function advanceAfterSubmit(city) {
  const cityId = typeof city === "string" ? city : city?.id;
  if (!cityId) return;
  if (city && typeof city === "object") setPreviousCity(city);
  skippedIds.delete(cityId);
  persistSkippedIds();
  pendingItems = pendingItems.filter((item) => item.id !== cityId);
  const queue = activeQueue();
  if (currentIndex >= queue.length) {
    currentIndex = Math.max(0, queue.length - 1);
  }
  if (queueData) {
    queueData.total_pending = pendingItems.length;
    queueData.total_sent_this_month = (queueData.total_sent_this_month || 0) + 1;
  }
  renderBlockedList();
  renderPreviousCityBanner();
  renderCurrentCity();
}

function renderCurrentCity() {
  const city = currentCity();
  if (!submitting) hideMsg();

  if (!city) {
    showEmptyState();
    updateProgress();
    renderRemainingList();
    renderSkippedList();
    return;
  }

  const loading = wf$("#request-loading");
  const empty = wf$("#request-empty");
  const card = wf$("#request-card");
  if (loading) loading.hidden = true;
  if (empty) empty.hidden = true;
  if (card) card.hidden = false;

  const queue = activeQueue();
  const { total, done } = monthlyTotals();
  const stateEl = wf$("#card-state");
  const cityEl = wf$("#card-city");
  const positionEl = wf$("#card-position");
  if (stateEl) stateEl.textContent = city.state;
  if (cityEl) cityEl.textContent = city.city;
  const remaining = queue.length;
  if (positionEl) {
    positionEl.textContent = `${remaining} remaining · ${done} of ${total} done this month`;
  }

  const portalUrl = (city.portal_url || "").trim();
  const openBtn = wf$("#btn-open-portal");
  if (openBtn) openBtn.href = portalUrl || "#";

  const skipBtn = wf$("#btn-skip");
  if (skipBtn) skipBtn.disabled = submitting;

  setPortalButtonState({
    disabled: submitting || !portalUrl,
    label: submitting ? "Logging submission…" : "Open portal & mark submitted",
  });

  renderRequestMessage(city);
  renderPdfUrlWarning(city);
  renderPreviousCityBanner();

  updateProgress();
  renderRemainingList();
  renderSkippedList();
}

async function loadQueue() {
  const loading = wf$("#request-loading");
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = "<p>Loading pending portal submissions…</p>";
  }
  const empty = wf$("#request-empty");
  const card = wf$("#request-card");
  if (empty) empty.hidden = true;
  if (card) card.hidden = true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch("/api/portal/pending-online-requests", { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  queueData = await res.json();
  pendingItems = filterByCollectSelection(queueData.items || []);
  blockedItems = filterByCollectSelection(queueData.blocked || []);
  currentIndex = 0;
  sentThisSession = 0;
  loadSkippedFromStorage();
  messageVariantIndex = loadMessageVariantIndex();

  const selectionNote = collectSelectionCount()
    ? ` — ${collectSelectionCount()} cities from Collect`
    : "";
  const subtitle = document.querySelector("#page-subtitle");
  if (subtitle) {
    subtitle.textContent = `${queueData.current_month_label || "This month"} — open each portal and we'll log today's submission.${selectionNote}`;
  }

  renderBlockedList();
  renderCurrentCity();
  notifyPortalPage();
}

function logSubmissionInBackground(cityId) {
  return postJson(`/api/portal/city/${cityId}/submit`, {
    request_type: "code_violation",
    notes: "Submitted from Submit Portals workflow",
    light: true,
  })
    .then((data) => {
      if (ignoredSubmissionLogs.has(cityId)) return;
      const sentAt = data.event?.logged_at;
      showToast(
        sentAt ? `Logged ${formatDayDate(sentAt)}.` : "Submission logged.",
        { ok: true, duration: 2800 }
      );
      notifyPortalPage({ refreshBadges: true });
    })
    .catch((err) => {
      showToast(`Could not log submission: ${err.message}`, { ok: false, duration: 6500 });
      notifyPortalPage({ refreshBadges: true });
    });
}

async function openPortalAndMarkSubmitted(event) {
  event.preventDefault();
  const city = currentCity();
  if (!city || submitting) return;

  const portalUrl = (city.portal_url || "").trim();
  if (!portalUrl) {
    showMsg("No portal URL on file for this city.", false);
    return;
  }
  if (isPdfLinkUrl(portalUrl)) {
    showMsg(
      "This URL opens a PDF form, not an online portal. Skip it and fill the form in Records Desk.",
      false
    );
    return;
  }

  const cityId = city.id;
  submitting = true;
  setPortalButtonState({ disabled: true, label: "Logging submission…" });

  window.open(portalUrl, "_blank", "noopener");
  sentThisSession += 1;
  submitting = false;
  advanceAfterSubmit(city);
  notifyPortalPage({ onlineDelta: -1 });

  void logSubmissionInBackground(cityId);
}

function skipCurrent() {
  const city = currentCity();
  if (!city || submitting) return;
  skippedIds.add(city.id);
  persistSkippedIds();
  const queue = activeQueue();
  if (!queue.length) {
    renderCurrentCity();
    return;
  }
  if (currentIndex >= queue.length - 1) {
    currentIndex = 0;
  }
  renderCurrentCity();
}

function bindEvents() {
  wf$("#btn-open-portal")?.addEventListener("click", openPortalAndMarkSubmitted);
  wf$("#btn-skip")?.addEventListener("click", skipCurrent);
  wf$("#btn-mark-previous-error")?.addEventListener("click", openPortalErrorDialog);
  wf$("#btn-mark-previous-pdf")?.addEventListener("click", openPortalPdfDialog);
  wf$("#portal-error-cancel")?.addEventListener("click", closePortalErrorDialog);
  wf$("#portal-error-confirm")?.addEventListener("click", () => {
    void markPreviousPortalError();
  });
  wf$("#portal-error-dialog")?.addEventListener("cancel", closePortalErrorDialog);
  wf$("#portal-pdf-cancel")?.addEventListener("click", closePortalPdfDialog);
  wf$("#portal-pdf-confirm")?.addEventListener("click", () => {
    void markPreviousAsPdfForm();
  });
  wf$("#portal-pdf-dialog")?.addEventListener("cancel", closePortalPdfDialog);
  wf$("#btn-toggle-message")?.addEventListener("click", toggleRequestMessage);
  wf$("#btn-copy-message")?.addEventListener("click", () => {
    void copyRequestMessage();
  });
  wf$("#btn-rewrite-message")?.addEventListener("click", rewriteRequestMessage);
  wf$("#queue-skipped-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-restore-id]");
    if (!btn) return;
    restoreSkippedCity(btn.dataset.restoreId);
  });

  document.addEventListener("keydown", (event) => {
    if (!workflowRoot || event.target.closest("input, textarea, select, dialog[open]")) return;
    const card = wf$("#request-card");
    if (event.key === "Enter" && currentCity() && !submitting && card && !card.hidden) {
      event.preventDefault();
      wf$("#btn-open-portal")?.click();
    }
  });
}

async function init() {
  workflowRoot =
    document.querySelector(".portal-submit-section") ||
    document.querySelector(".submit-portals-layout");
  if (!workflowRoot) return;

  bindEvents();
  try {
    await loadQueue();
  } catch (err) {
    const msg =
      err.name === "AbortError"
        ? "Loading timed out — restart the portal server and try again."
        : err.message;
    const loading = wf$("#request-loading");
    if (loading) {
      loading.innerHTML = `<p class="load-error">Could not load queue. Start the server with <code>python run_review_portal.py</code>. (${msg})</p>`;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}