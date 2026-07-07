const {
  $,
  formatDayDate,
  cityPdfUrl,
  pdfPreviewUrl,
  postJson,
  showToast,
  isValidContactEmail,
  filterByCollectSelection,
  collectSelectionCount,
} = window.PortalShared;

const BULK_SEND_INTERVAL_MS = 5000;

let queueData = null;
let pendingItems = [];
let blockedItems = [];
let currentIndex = 0;
let sentThisSession = 0;
let skippedIds = new Set();

let bulkSendActive = false;
let bulkSendTimer = null;
let bulkCountdownTimer = null;
let bulkCountdownSec = 0;
let bulkSessionSent = 0;
let bulkSessionSkipped = 0;
let confirmContext = null;

function skippedStorageKey() {
  return `request-pdfs-skipped-${queueData?.current_month || "unknown"}`;
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
  const el = $("#action-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  el.hidden = false;
}

function hideMsg() {
  const el = $("#action-msg");
  if (el) el.hidden = true;
}

function activeQueue() {
  return pendingItems.filter((item) => !skippedIds.has(item.id));
}

function currentCity() {
  const queue = activeQueue();
  return queue[currentIndex] || null;
}

function updateProgress() {
  const queue = activeQueue();
  const remaining = queue.length;
  const monthLabel = queueData?.current_month_label || "This month";
  const sentMonth = queueData?.total_sent_this_month || 0;
  const doneThisMonth = sentMonth;
  const totalForMonth = queueData?.total_eligible ?? remaining + sentMonth;

  $("#month-label").textContent = monthLabel;

  if (totalForMonth === 0) {
    $("#progress-fill").style.width = "0%";
    $("#progress-text").textContent = "No pending requests";
    $("#progress-sub").textContent = blockedItems.length
      ? `${blockedItems.length} on hold`
      : "";
    return;
  }

  const pct = Math.round((doneThisMonth / totalForMonth) * 100);
  $("#progress-fill").style.width = `${pct}%`;

  if (remaining === 0) {
    $("#progress-text").textContent =
      doneThisMonth === 1
        ? "1 sent this month"
        : `${doneThisMonth} sent this month`;
  } else if (sentThisSession === 0) {
    $("#progress-text").textContent =
      sentMonth > 0
        ? `${remaining} remaining · ${sentMonth} already sent · ${totalForMonth} total`
        : `${remaining} remaining`;
  } else {
    $("#progress-text").textContent = `${doneThisMonth} of ${totalForMonth} sent this month`;
  }

  const subParts = [];
  if (sentThisSession) subParts.push(`${sentThisSession} this session`);
  if (blockedItems.length) subParts.push(`${blockedItems.length} on hold`);
  $("#progress-sub").textContent = subParts.join(" · ");
}

function renderRemainingList() {
  const wrap = $("#queue-remaining");
  const list = $("#queue-remaining-list");
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
      const cls = skippedIds.has(item.id)
        ? "done"
        : item.id === activeId
          ? "active"
          : "";
      const tag = item.apology_email?.show_button ? ' <span class="queue-apology-tag">Apology</span>' : "";
      return `<li class="${cls}">${item.city}, ${item.state}${tag}</li>`;
    })
    .join("");
}

function skippedItems() {
  return pendingItems.filter((item) => skippedIds.has(item.id));
}

function renderSkippedList() {
  const wrap = $("#queue-skipped");
  const list = $("#queue-skipped-list");
  const countEl = $("#queue-skipped-count");
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
        <span>${item.city}, ${item.state}</span>
        <button type="button" class="btn ghost sm queue-skipped-restore" data-restore-id="${item.id}">Restore</button>
      </li>`
    )
    .join("");
}

function renderBlockedList() {
  const wrap = $("#queue-blocked");
  const list = $("#queue-blocked-list");
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
        <strong>${item.city}, ${item.state}</strong>
        ${item.blocked_reason || item.sent_label || "Cannot send yet"}
      </li>`
    )
    .join("");
}

function showEmptyState() {
  $("#request-loading").hidden = true;
  $("#request-card").hidden = true;
  $("#request-empty").hidden = false;

  const sentMonth = queueData?.total_sent_this_month || 0;
  const blocked = blockedItems.length;
  const skipped = skippedIds.size;
  let message = "No PDF requests are ready to send right now.";
  if (skipped && pendingItems.length) {
    message = `You skipped ${skipped} of ${pendingItems.length} cities. Use Restore in the sidebar to bring any back.`;
  } else if (sentMonth && blocked) {
    message = `${sentMonth} emailed this month. ${blocked} more are on hold until cooldown or city reply.`;
  } else if (blocked) {
    message = `No cities ready to send right now. ${blocked} are waiting on reply or cooldown.`;
  } else if (sentMonth) {
    message = `All ${sentMonth} PDF requests for this month are complete.`;
  } else if ((queueData?.total_apology_pending || 0) > 0) {
    message = "Apology emails are still pending — reload the page if you expected cities in the queue.";
  }
  $("#empty-message").textContent = message;
}

function alreadySentThisMonth() {
  return queueData?.total_sent_this_month || 0;
}

function monthlyTotals() {
  const alreadySent = alreadySentThisMonth();
  const remaining = pendingItems.length;
  const total = queueData?.total_eligible ?? remaining + alreadySent;
  const done = alreadySent;
  return { alreadySent, remaining, done, total, sendable: bulkSendableQueue().length };
}

function bulkSendableQueue() {
  const queue = activeQueue();
  return queue.slice(currentIndex).filter((item) => isValidContactEmail(item.contact_email));
}

function clearBulkTimers() {
  if (bulkSendTimer) {
    clearTimeout(bulkSendTimer);
    bulkSendTimer = null;
  }
  if (bulkCountdownTimer) {
    clearInterval(bulkCountdownTimer);
    bulkCountdownTimer = null;
  }
  bulkCountdownSec = 0;
  const countdownEl = $("#bulk-send-countdown");
  if (countdownEl) countdownEl.hidden = true;
}

function setBulkSendUi(running) {
  const card = $("#bulk-send-card");
  const progressCard = $("#queue-progress-card");
  const requestCard = $("#request-card");
  const startBtn = $("#btn-bulk-start");
  const activePanel = $("#bulk-send-active");

  if (card) {
    card.hidden = !pendingItems.length;
    card.classList.toggle("running", running);
  }
  if (progressCard) progressCard.classList.toggle("bulk-active", running);
  if (requestCard) requestCard.classList.toggle("bulk-running", running);
  if (startBtn) startBtn.disabled = running || bulkSendableQueue().length === 0;
  if (activePanel) activePanel.hidden = !running;
}

function updateBulkStatus(text) {
  const el = $("#bulk-send-status");
  if (el) el.textContent = text;
}

function updateBulkCountdown(seconds) {
  const el = $("#bulk-send-countdown");
  if (!el) return;
  if (seconds <= 0) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `Next email in ${seconds}s…`;
}

function startBulkCountdown(seconds) {
  if (bulkCountdownTimer) clearInterval(bulkCountdownTimer);
  bulkCountdownSec = seconds;
  updateBulkCountdown(bulkCountdownSec);
  bulkCountdownTimer = setInterval(() => {
    bulkCountdownSec -= 1;
    if (bulkCountdownSec <= 0) {
      clearInterval(bulkCountdownTimer);
      bulkCountdownTimer = null;
      updateBulkCountdown(0);
      return;
    }
    updateBulkCountdown(bulkCountdownSec);
  }, 1000);
}

function renderBulkSendPanel() {
  const card = $("#bulk-send-card");
  if (!card) return;
  const { alreadySent, remaining, total, sendable } = monthlyTotals();
  card.hidden = !remaining && !alreadySent;

  const statsWrap = $("#bulk-send-stats");
  const statRemaining = $("#bulk-stat-remaining");
  const statDone = $("#bulk-stat-done");
  const statTotal = $("#bulk-stat-total");
  if (statsWrap) statsWrap.hidden = !remaining && !alreadySent;
  if (statRemaining) statRemaining.textContent = String(sendable);
  if (statDone) statDone.textContent = String(alreadySent);
  if (statTotal) statTotal.textContent = String(total);

  const startBtn = $("#btn-bulk-start");
  const desc = $("#bulk-send-desc");
  if (desc && !bulkSendActive) {
    desc.textContent =
      sendable === 0
        ? "No remaining cities to send."
        : `Bulk send will email the ${sendable} remaining ${sendable === 1 ? "city" : "cities"}, 5 seconds apart. Already-sent cities are not included.`;
  }
  if (startBtn && !bulkSendActive) {
    startBtn.disabled = sendable === 0;
    if (sendable === 0) {
      startBtn.textContent = alreadySent ? "All done for this month" : "No emails ready";
    } else {
      startBtn.textContent = `Start bulk send (${sendable} remaining)`;
    }
  }
}

function renderCurrentCity() {
  const city = currentCity();
  if (!bulkSendActive) hideMsg();

  if (!city) {
    showEmptyState();
    updateProgress();
    renderRemainingList();
    renderSkippedList();
    renderBulkSendPanel();
    return;
  }

  $("#request-loading").hidden = true;
  $("#request-empty").hidden = true;
  $("#request-card").hidden = false;

  const queue = activeQueue();
  const { alreadySent, total, done } = monthlyTotals();
  const position = pendingItems.length - queue.length + 1;
  $("#card-state").textContent = city.state;
  $("#card-city").textContent = city.city;
  const sentNote = alreadySent ? ` · ${done} of ${total} done this month` : "";
  $("#card-position").textContent = `City ${position} of ${pendingItems.length} remaining${sentNote}`;

  const email = city.contact_email || "";
  $("#card-email").textContent = email || "No email on file — you'll be prompted";

  const warningRow = $("#card-warning-row");
  const warningEl = $("#card-warning");
  if (!email) {
    warningRow.hidden = false;
    warningEl.textContent = "Add a recipient when you send.";
  } else {
    warningRow.hidden = true;
    warningEl.textContent = "";
  }

  const trackerLink = $("#btn-open-tracker");
  if (trackerLink) trackerLink.href = `/portal?city=${encodeURIComponent(city.id)}`;

  const needsApology = Boolean(city.apology_email?.show_button);
  const apologyBanner = $("#apology-banner");
  const apologyBtn = $("#btn-send-apology");
  const sendBtn = $("#btn-send");

  if (apologyBanner) apologyBanner.hidden = !needsApology;
  if (apologyBtn) {
    apologyBtn.hidden = !needsApology;
    apologyBtn.disabled = bulkSendActive;
    apologyBtn.textContent = bulkSendActive && needsApology ? "Sending…" : "Send 3rd Email with Apology";
  }
  if (sendBtn) {
    sendBtn.hidden = needsApology;
    sendBtn.disabled = bulkSendActive;
    sendBtn.textContent = bulkSendActive && !needsApology ? "Sending…" : "Send Email Request";
  }

  const skipBtn = $("#btn-skip");
  if (skipBtn) skipBtn.disabled = bulkSendActive;

  updateProgress();
  renderRemainingList();
  renderSkippedList();
  renderBulkSendPanel();
}

function advanceAfterSend(sentCityId, { wasApology = false } = {}) {
  skippedIds.delete(sentCityId);
  persistSkippedIds();
  pendingItems = pendingItems.filter((item) => item.id !== sentCityId);
  const queue = activeQueue();
  if (currentIndex >= queue.length) {
    currentIndex = Math.max(0, queue.length - 1);
  }
  if (queueData) {
    queueData.total_pending = pendingItems.length;
    if (wasApology) {
      queueData.total_apology_pending = Math.max(0, (queueData.total_apology_pending || 0) - 1);
    }
    queueData.total_sent_this_month = (queueData.total_sent_this_month || 0) + 1;
  }
  renderBlockedList();
  renderCurrentCity();
}

async function loadQueue() {
  if (bulkSendActive) stopBulkSend();

  const loading = $("#request-loading");
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = "<p>Loading pending PDF requests…</p>";
  }
  $("#request-empty").hidden = true;
  $("#request-card").hidden = true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch("/api/portal/pending-pdf-requests", { signal: controller.signal });
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

  const selectionNote = collectSelectionCount()
    ? ` — ${collectSelectionCount()} cities from Collect`
    : "";
  const apologyCount = queueData.total_apology_pending || 0;
  const subtitle = apologyCount
    ? `${queueData.current_month_label || "This month"} — ${apologyCount} need corrected PDF apology first.${selectionNote}`
    : `${queueData.current_month_label || "This month"} — work through unsent PDF cities.${selectionNote}`;
  $("#page-subtitle").textContent = subtitle;

  renderBlockedList();
  renderCurrentCity();
}

async function sendCityApology(
  city,
  { confirmSend = true, updateUi = true, recipient: recipientOverride = "" } = {}
) {
  if (!city?.apology_email?.show_button) {
    return { ok: false, reason: "no_apology" };
  }

  const recipient = (recipientOverride || city.contact_email || "").trim();
  if (!isValidContactEmail(recipient)) {
    return { ok: false, reason: "no_email" };
  }
  if (confirmSend) {
    return { ok: false, reason: "needs_dialog" };
  }

  const apologyBtn = $("#btn-send-apology");
  if (updateUi && apologyBtn) {
    apologyBtn.disabled = true;
    apologyBtn.textContent = "Sending…";
  }

  try {
    const data = await postJson(`/api/portal/city/${city.id}/send-apology-email`, {
      request_type: "code_violation",
      email: recipient,
      notes: confirmSend
        ? "One-time apology resend from Request PDFs workflow"
        : "Bulk apology resend from Request PDFs workflow",
    });
    sentThisSession += 1;
    advanceAfterSend(city.id, { wasApology: true });
    return { ok: true, data, kind: "apology" };
  } catch (err) {
    if (updateUi && apologyBtn) {
      apologyBtn.disabled = false;
      apologyBtn.textContent = "Send 3rd Email with Apology";
    }
    return { ok: false, error: err.message };
  }
}

async function sendCityEmail(
  city,
  { confirmSend = true, updateUi = true, recipient: recipientOverride = "" } = {}
) {
  if (!city) return { ok: false, reason: "no_city" };
  if (city.apology_email?.show_button) {
    if (confirmSend) {
      showMsg("Send the apology email first — this city received an incorrect PDF earlier.", false);
    }
    return { ok: false, reason: "needs_apology" };
  }

  const recipient = (recipientOverride || city.contact_email || "").trim();
  if (!isValidContactEmail(recipient)) {
    return { ok: false, reason: "no_email" };
  }
  if (confirmSend) {
    return { ok: false, reason: "needs_dialog" };
  }

  const sendBtn = $("#btn-send");
  if (updateUi && sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
  }

  try {
    const data = await postJson(`/api/portal/city/${city.id}/send-email`, {
      request_type: "code_violation",
      email: recipient,
      notes: confirmSend ? "Sent from Request PDFs workflow" : "Bulk sent from Request PDFs workflow",
    });
    sentThisSession += 1;
    advanceAfterSend(city.id);
    return { ok: true, data, kind: "email" };
  } catch (err) {
    if (updateUi && sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Email Request";
    }
    return { ok: false, error: err.message };
  }
}

function openSendConfirmDialog(city, mode) {
  if (!city) return;
  confirmContext = { city, mode };
  const dialog = $("#email-confirm-dialog");
  const title = $("#email-confirm-title");
  const lead = $("#email-confirm-lead");
  const tip = $("#email-confirm-tip");
  const approveBtn = $("#email-confirm-approve");
  if (!dialog || !title || !lead || !approveBtn) return;

  if (mode === "apology") {
    title.textContent = "Send apology email?";
    lead.textContent =
      "This sends the corrected PDF with an apology. This one-time action cannot be undone.";
    tip.textContent = "The date on the PDF will be updated to today before sending.";
    approveBtn.textContent = "Send apology";
  } else {
    title.textContent = "Send email request?";
    lead.textContent =
      "This will email the completed FOIA PDF immediately. This action cannot be undone.";
    tip.textContent = "The date on the PDF will be updated to today before sending.";
    approveBtn.textContent = "Send email";
  }

  $("#email-confirm-city").textContent = `${city.city}, ${city.state}`;
  const recipientInput = $("#email-confirm-recipient");
  if (recipientInput) recipientInput.value = city.contact_email || "";
  dialog.showModal();
  if (recipientInput && !recipientInput.value) {
    recipientInput.focus();
  } else {
    approveBtn.focus();
  }
}

function closeSendConfirmDialog() {
  const dialog = $("#email-confirm-dialog");
  if (dialog?.open) dialog.close();
  confirmContext = null;
}

async function executeSendConfirm() {
  const ctx = confirmContext;
  if (!ctx?.city) return;

  const recipient = ($("#email-confirm-recipient")?.value || "").trim();
  if (!recipient) {
    showMsg("Enter a recipient email before sending.", false);
    return;
  }

  closeSendConfirmDialog();

  const result =
    ctx.mode === "apology"
      ? await sendCityApology(ctx.city, {
          confirmSend: false,
          updateUi: true,
          recipient,
        })
      : await sendCityEmail(ctx.city, {
          confirmSend: false,
          updateUi: true,
          recipient,
        });

  if (!result.ok) {
    if (result.error) showMsg(result.error, false);
    return;
  }

  const sentAt = result.data?.event?.logged_at;
  const label = ctx.mode === "apology" ? "Apology email" : "Email";
  showMsg(sentAt ? `${label} sent on ${formatDayDate(sentAt)}.` : `${label} sent.`);
}

function sendCurrentApology() {
  const city = currentCity();
  if (!city) return;
  openSendConfirmDialog(city, "apology");
}

function sendCurrentEmail() {
  const city = currentCity();
  if (!city) return;
  if (city.apology_email?.show_button) {
    showMsg("Send the apology email first — this city received an incorrect PDF earlier.", false);
    return;
  }
  openSendConfirmDialog(city, "email");
}

function stopBulkSend(message, ok = true) {
  bulkSendActive = false;
  clearBulkTimers();
  setBulkSendUi(false);
  renderCurrentCity();
  if (message) {
    const { done, total } = monthlyTotals();
    const progressNote = total ? ` (${done} of ${total} done this month)` : "";
    showMsg(`${message}${progressNote}`, ok);
  }
}

function scheduleNextBulkStep(delayMs) {
  if (!bulkSendActive) return;

  const nextCity = currentCity();
  if (!nextCity) {
    const parts = [`Bulk send complete — ${bulkSessionSent} sent`];
    if (bulkSessionSkipped) parts.push(`${bulkSessionSkipped} skipped`);
    stopBulkSend(parts.join(", ") + ".");
    return;
  }

  if (delayMs <= 0) {
    processBulkSendStep();
    return;
  }

  const seconds = Math.ceil(delayMs / 1000);
  updateBulkStatus(`Waiting before ${nextCity.city}, ${nextCity.state}…`);
  startBulkCountdown(seconds);
  bulkSendTimer = setTimeout(() => {
    bulkSendTimer = null;
    processBulkSendStep();
  }, delayMs);
}

async function processBulkSendStep() {
  if (!bulkSendActive) return;

  clearBulkTimers();

  const city = currentCity();
  if (!city) {
    stopBulkSend(`Bulk send complete — ${bulkSessionSent} sent.`);
    return;
  }

  if (!isValidContactEmail(city.contact_email)) {
    skippedIds.add(city.id);
    bulkSessionSkipped += 1;
    updateBulkStatus(`Skipped ${city.city} — no valid email on file`);
    showMsg(`Skipped ${city.city}, ${city.state} (no valid email).`, false);
    renderCurrentCity();
    scheduleNextBulkStep(0);
    return;
  }

  const label = `${city.city}, ${city.state}`;
  const isApology = Boolean(city.apology_email?.show_button);
  updateBulkStatus(`Sending ${isApology ? "apology" : "request"} to ${label}…`);
  renderCurrentCity();

  const result = isApology
    ? await sendCityApology(city, { confirmSend: false, updateUi: false })
    : await sendCityEmail(city, { confirmSend: false, updateUi: false });

  if (!result.ok) {
    if (result.reason === "no_email") {
      skippedIds.add(city.id);
      bulkSessionSkipped += 1;
      scheduleNextBulkStep(0);
      return;
    }
    stopBulkSend(`Bulk send stopped at ${label}: ${result.error || "send failed"}`, false);
    return;
  }

  bulkSessionSent += 1;
  const sentAt = result.data?.event?.logged_at;
  const when = sentAt ? formatDayDate(sentAt) : "just now";
  const { done, total } = monthlyTotals();
  const progressNote = total ? ` · ${done} of ${total} done this month` : "";
  showMsg(
    `${isApology ? "Apology" : "Email"} sent to ${label} (${when})${progressNote}. ${bulkSendableQueue().length ? "Next in 5s…" : "Finishing up…"}`
  );
  renderCurrentCity();
  scheduleNextBulkStep(BULK_SEND_INTERVAL_MS);
}

function startBulkSend() {
  if (bulkSendActive) return;

  const queueFromHere = activeQueue().slice(currentIndex);
  const sendable = bulkSendableQueue();
  if (!sendable.length) {
    showMsg("No cities with email addresses are ready to send.", false);
    return;
  }

  const missingEmail = queueFromHere.length - sendable.length;
  const { alreadySent, total } = monthlyTotals();
  let promptText = `Send ${sendable.length} remaining email${sendable.length === 1 ? "" : "s"} automatically, one every 5 seconds?`;
  if (alreadySent) {
    promptText += `\n\n${alreadySent} already sent this month. ${total} total for the month. Bulk send will NOT resend the ones already done.`;
  }
  if (missingEmail) {
    promptText += ` ${missingEmail} ${missingEmail === 1 ? "city" : "cities"} without email will be skipped.`;
  }
  if (!confirm(promptText)) return;

  const first = currentCity();
  bulkSendActive = true;
  bulkSessionSent = 0;
  bulkSessionSkipped = 0;
  setBulkSendUi(true);
  updateBulkStatus(
    first ? `Starting with ${first.city}, ${first.state}…` : "Starting bulk send…"
  );
  processBulkSendStep();
}

function stopBulkSendClicked() {
  if (!bulkSendActive) return;
  const sent = bulkSessionSent;
  stopBulkSend(sent ? `Bulk send stopped — ${sent} sent this run.` : "Bulk send stopped.");
}

function skipCurrent() {
  const city = currentCity();
  if (!city) return;
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

function openPdfPreview() {
  const city = currentCity();
  const pdfUrl = city ? cityPdfUrl(city) : "";
  if (!city || !pdfUrl) return;
  const dialog = $("#pdf-preview-dialog");
  const frame = $("#pdf-dialog-frame");
  const title = $("#pdf-dialog-title");
  const tab = $("#pdf-dialog-tab");
  if (!dialog || !frame) return;
  if (title) title.textContent = `${city.city}, ${city.state} — Completed PDF`;
  frame.src = pdfPreviewUrl(pdfUrl);
  if (tab) tab.href = pdfUrl;
  dialog.showModal();
}

function closePdfPreview() {
  const dialog = $("#pdf-preview-dialog");
  if (dialog?.open) dialog.close();
  const frame = $("#pdf-dialog-frame");
  if (frame) frame.removeAttribute("src");
}

function bindEvents() {
  $("#btn-send-apology")?.addEventListener("click", sendCurrentApology);
  $("#btn-send")?.addEventListener("click", sendCurrentEmail);
  $("#btn-skip")?.addEventListener("click", skipCurrent);
  $("#btn-bulk-start")?.addEventListener("click", startBulkSend);
  $("#btn-bulk-stop")?.addEventListener("click", stopBulkSendClicked);
  $("#email-confirm-deny")?.addEventListener("click", closeSendConfirmDialog);
  $("#email-confirm-approve")?.addEventListener("click", executeSendConfirm);
  $("#email-confirm-dialog")?.addEventListener("cancel", closeSendConfirmDialog);
  $("#queue-skipped-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-restore-id]");
    if (!btn) return;
    restoreSkippedCity(btn.dataset.restoreId);
  });
  $("#pdf-thumb-card")?.addEventListener("click", openPdfPreview);
  $("#pdf-dialog-close")?.addEventListener("click", closePdfPreview);
  $("#pdf-preview-dialog")?.addEventListener("close", closePdfPreview);
}

async function loadPdfInfoSettings() {
  const res = await fetch("/api/settings");
  if (!res.ok) return { name: "", phone: "", email: "" };
  return res.json();
}

async function ensurePdfInfoGate() {
  const dialog = $("#pdf-info-gate-dialog");
  const form = $("#pdf-info-gate-form");
  const statusEl = $("#pdf-info-gate-status");
  const nameInput = $("#pdf-info-name");
  const phoneInput = $("#pdf-info-phone");
  const emailInput = $("#pdf-info-email");
  if (!dialog || !form) return;

  const settings = await loadPdfInfoSettings();
  if (nameInput) nameInput.value = settings.name || "";
  if (phoneInput) phoneInput.value = settings.phone || "";
  if (emailInput) emailInput.value = settings.email || "";
  if (statusEl) statusEl.textContent = "";

  return new Promise((resolve, reject) => {
    function cleanup() {
      $("#pdf-info-gate-cancel")?.removeEventListener("click", onCancel);
      $("#pdf-info-gate-confirm")?.removeEventListener("click", onConfirm);
      dialog.removeEventListener("cancel", onCancel);
    }

    function onCancel() {
      cleanup();
      if (dialog.open) dialog.close();
      reject(new Error("PDF contact info not confirmed"));
    }

    async function onConfirm() {
      if (!form.reportValidity()) return;
      const name = nameInput?.value.trim() || "";
      const phone = phoneInput?.value.trim() || "";
      const email = emailInput?.value.trim() || "";
      const confirmBtn = $("#pdf-info-gate-confirm");
      if (statusEl) statusEl.textContent = "Saving your info and updating PDFs…";
      if (confirmBtn) confirmBtn.disabled = true;
      try {
        await postJson("/api/settings", { name, phone, email });
        await postJson("/api/settings/bulk-apply", { name, phone, email });
        cleanup();
        if (dialog.open) dialog.close();
        resolve();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || "Could not save your info.";
        if (confirmBtn) confirmBtn.disabled = false;
      }
    }

    $("#pdf-info-gate-cancel")?.addEventListener("click", onCancel);
    $("#pdf-info-gate-confirm")?.addEventListener("click", onConfirm);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
    nameInput?.focus();
  });
}

async function init() {
  bindEvents();
  try {
    await ensurePdfInfoGate();
    await loadQueue();
  } catch (err) {
    if (err.message === "PDF contact info not confirmed") {
      $("#request-loading").innerHTML =
        '<p class="load-error">Confirm your PDF contact info to start sending requests. <a href="/collect">Back to Collect</a></p>';
      return;
    }
    const msg =
      err.name === "AbortError"
        ? "Loading timed out — restart the portal server and try again."
        : err.message;
    $("#request-loading").innerHTML = `<p class="load-error">Could not load queue. Start the server with <code>python run_review_portal.py</code>. (${msg})</p>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}