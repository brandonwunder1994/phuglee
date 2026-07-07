const $ = (s) => document.querySelector(s);

const BULK_SEND_INTERVAL_MS = 10000;

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

function formatDayDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return iso;
  }
}

function showMsg(text, ok = true) {
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
  return activeQueue()[currentIndex] || null;
}

function alreadySentThisMonth() {
  return queueData?.total_sent_this_month || 0;
}

function bulkSendableQueue() {
  return activeQueue()
    .slice(currentIndex)
    .filter((item) => (item.contact_email || "").trim());
}

function monthlyTotals() {
  const alreadySent = alreadySentThisMonth();
  const remaining = pendingItems.length;
  const total = queueData?.total_eligible ?? remaining + alreadySent;
  const done = alreadySent;
  return { alreadySent, remaining, done, total, sendable: bulkSendableQueue().length };
}

function updateProgress() {
  const queue = activeQueue();
  const remaining = queue.length;
  const sentMonth = queueData?.total_sent_this_month || 0;
  const doneThisMonth = sentMonth;
  const totalForMonth = queueData?.total_eligible ?? remaining + sentMonth;

  $("#month-label").textContent = queueData?.current_month_label || "This month";

  if (totalForMonth === 0) {
    $("#progress-fill").style.width = "0%";
    $("#progress-text").textContent = "No pending requests";
    $("#progress-sub").textContent = blockedItems.length ? `${blockedItems.length} on hold` : "";
    return;
  }

  const pct = Math.round((doneThisMonth / totalForMonth) * 100);
  $("#progress-fill").style.width = `${pct}%`;

  if (remaining === 0) {
    $("#progress-text").textContent =
      doneThisMonth === 1 ? "1 sent this month" : `${doneThisMonth} sent this month`;
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
      const cls = skippedIds.has(item.id) ? "done" : item.id === activeId ? "active" : "";
      return `<li class="${cls}">${item.city}, ${item.state}</li>`;
    })
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
    .map((item) => {
      const note = item.url_notes ? `<span class="blocked-note">${item.url_notes}</span>` : "";
      return `<li>
        <strong>${item.city}, ${item.state}</strong>
        <span>${item.blocked_reason || item.sent_label || "Cannot send yet"}</span>
        ${note}
        <a class="blocked-tracker-link" href="/portal?city=${encodeURIComponent(item.id)}">Add email in tracker</a>
      </li>`;
    })
    .join("");
}

function showEmptyState() {
  $("#request-loading").hidden = true;
  $("#request-card").hidden = true;
  $("#request-empty").hidden = false;
  const sentMonth = queueData?.total_sent_this_month || 0;
  const blocked = blockedItems.length;
  let message = "No email-only requests are ready to send right now.";
  if (sentMonth && blocked) {
    message = `${sentMonth} emailed this month. ${blocked} more are on hold.`;
  } else if (blocked) {
    message = `No cities ready to send. ${blocked} are waiting on reply or cooldown.`;
  } else if (sentMonth) {
    message = `All ${sentMonth} email-only requests for this month are complete.`;
  }
  $("#empty-message").textContent = message;
}

function clearBulkTimers() {
  if (bulkSendTimer) clearTimeout(bulkSendTimer);
  bulkSendTimer = null;
  if (bulkCountdownTimer) clearInterval(bulkCountdownTimer);
  bulkCountdownTimer = null;
  bulkCountdownSec = 0;
  const countdownEl = $("#bulk-send-countdown");
  if (countdownEl) countdownEl.hidden = true;
}

function setBulkSendUi(running) {
  const card = $("#bulk-send-card");
  if (card) {
    card.hidden = !pendingItems.length;
    card.classList.toggle("running", running);
  }
  $("#queue-progress-card")?.classList.toggle("bulk-active", running);
  $("#request-card")?.classList.toggle("bulk-running", running);
  const startBtn = $("#btn-bulk-start");
  if (startBtn) startBtn.disabled = running || bulkSendableQueue().length === 0;
  const activePanel = $("#bulk-send-active");
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
  const { alreadySent, remaining, total, sendable } = monthlyTotals();
  const card = $("#bulk-send-card");
  if (card) card.hidden = !remaining && !alreadySent;

  const statsWrap = $("#bulk-send-stats");
  if (statsWrap) statsWrap.hidden = !remaining && !alreadySent;
  if ($("#bulk-stat-remaining")) $("#bulk-stat-remaining").textContent = String(sendable);
  if ($("#bulk-stat-done")) $("#bulk-stat-done").textContent = String(alreadySent);
  if ($("#bulk-stat-total")) $("#bulk-stat-total").textContent = String(total);

  const startBtn = $("#btn-bulk-start");
  const desc = $("#bulk-send-desc");
  if (desc && !bulkSendActive) {
    desc.textContent =
      sendable === 0
        ? "No remaining cities to send."
        : `Bulk send will email the ${sendable} remaining ${sendable === 1 ? "city" : "cities"}, 10 seconds apart.`;
  }
  if (startBtn && !bulkSendActive) {
    startBtn.disabled = sendable === 0;
    startBtn.textContent =
      sendable === 0
        ? alreadySent
          ? "All done for this month"
          : "No emails ready"
        : `Start bulk send (${sendable} remaining)`;
  }
}

function renderEmailPreview(city) {
  const preview = $("#email-preview-body");
  if (!preview || !city) return;
  preview.textContent = city.email_body_preview || "";
}

function renderCurrentCity() {
  const city = currentCity();
  if (!bulkSendActive) hideMsg();

  if (!city) {
    showEmptyState();
    updateProgress();
    renderRemainingList();
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
  $("#card-email").textContent = email || "No email on file";

  const warningRow = $("#card-warning-row");
  const warningEl = $("#card-warning");
  if (!email) {
    warningRow.hidden = false;
    warningEl.textContent = "This city cannot be sent without an email address.";
  } else {
    warningRow.hidden = true;
    warningEl.textContent = "";
  }

  $("#btn-open-tracker").href = `/portal?city=${encodeURIComponent(city.id)}`;
  renderEmailPreview(city);

  const sendBtn = $("#btn-send");
  if (sendBtn) {
    sendBtn.disabled = bulkSendActive || !email;
    sendBtn.textContent = bulkSendActive ? "Sending…" : "Send Email Request";
  }
  const skipBtn = $("#btn-skip");
  if (skipBtn) skipBtn.disabled = bulkSendActive;

  updateProgress();
  renderRemainingList();
  renderBulkSendPanel();
}

function advanceAfterSend(sentCityId) {
  pendingItems = pendingItems.filter((item) => item.id !== sentCityId);
  const queue = activeQueue();
  if (currentIndex >= queue.length) {
    currentIndex = Math.max(0, queue.length - 1);
  }
  if (queueData) {
    queueData.total_pending = pendingItems.length;
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
    loading.innerHTML = "<p>Loading email-only requests…</p>";
  }
  $("#request-empty").hidden = true;
  $("#request-card").hidden = true;

  const res = await fetch("/api/portal/pending-email-only-requests");
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  queueData = await res.json();
  pendingItems = queueData.items || [];
  blockedItems = queueData.blocked || [];
  currentIndex = 0;
  sentThisSession = 0;
  skippedIds = new Set();

  $("#page-subtitle").textContent = `${queueData.current_month_label || "This month"} — plain email requests, no PDF.`;
  renderBlockedList();
  renderCurrentCity();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function sendCityEmail(city, { confirmSend = true, updateUi = true } = {}) {
  if (!city) return { ok: false, reason: "no_city" };
  const recipient = (city.contact_email || "").trim();
  if (!recipient) return { ok: false, reason: "no_email" };

  if (confirmSend) {
    if (
      !confirm(
        `Send a plain-email public records request to ${recipient} for ${city.city}, ${city.state}? No PDF will be attached.`
      )
    ) {
      return { ok: false, reason: "cancelled" };
    }
  }

  const sendBtn = $("#btn-send");
  if (updateUi && sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
  }

  try {
    const data = await postJson(`/api/portal/city/${city.id}/send-email-only`, {
      request_type: "code_violation",
      email: recipient,
      notes: confirmSend
        ? "Sent from Email Only Requests workflow"
        : "Bulk sent from Email Only Requests workflow",
    });
    sentThisSession += 1;
    advanceAfterSend(city.id);
    return { ok: true, data };
  } catch (err) {
    if (updateUi && sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Email Request";
    }
    return { ok: false, error: err.message };
  }
}

async function sendCurrentEmail() {
  const city = currentCity();
  const result = await sendCityEmail(city, { confirmSend: true, updateUi: true });
  if (!result.ok) {
    if (result.error) showMsg(result.error, false);
    return;
  }
  const sentAt = result.data?.event?.logged_at;
  showMsg(sentAt ? `Email sent on ${formatDayDate(sentAt)}.` : "Email sent.");
}

function stopBulkSend(message, ok = true) {
  bulkSendActive = false;
  clearBulkTimers();
  setBulkSendUi(false);
  renderCurrentCity();
  if (message) showMsg(message, ok);
}

function scheduleNextBulkStep(delayMs) {
  if (!bulkSendActive) return;
  if (!currentCity()) {
    stopBulkSend(`Bulk send complete — ${bulkSessionSent} sent.`);
    return;
  }
  if (delayMs <= 0) {
    processBulkSendStep();
    return;
  }
  const nextCity = currentCity();
  updateBulkStatus(`Waiting before ${nextCity.city}, ${nextCity.state}…`);
  startBulkCountdown(Math.ceil(delayMs / 1000));
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
  if (!(city.contact_email || "").trim()) {
    skippedIds.add(city.id);
    bulkSessionSkipped += 1;
    scheduleNextBulkStep(0);
    return;
  }
  updateBulkStatus(`Sending to ${city.city}, ${city.state}…`);
  renderCurrentCity();
  const result = await sendCityEmail(city, { confirmSend: false, updateUi: false });
  if (!result.ok) {
    stopBulkSend(`Bulk send stopped at ${city.city}: ${result.error || "send failed"}`, false);
    return;
  }
  bulkSessionSent += 1;
  showMsg(`Email sent to ${city.city}, ${city.state}. ${bulkSendableQueue().length ? "Next in 10s…" : "Finishing up…"}`);
  renderCurrentCity();
  scheduleNextBulkStep(BULK_SEND_INTERVAL_MS);
}

function startBulkSend() {
  if (bulkSendActive) return;
  const sendable = bulkSendableQueue();
  if (!sendable.length) {
    showMsg("No cities with email addresses are ready to send.", false);
    return;
  }
  const { alreadySent, total } = monthlyTotals();
  let promptText = `Send ${sendable.length} remaining plain emails automatically, one every 10 seconds?`;
  if (alreadySent) {
    promptText += `\n\n${alreadySent} already sent this month. ${total} total for the month.`;
  }
  if (!confirm(promptText)) return;
  bulkSendActive = true;
  bulkSessionSent = 0;
  bulkSessionSkipped = 0;
  setBulkSendUi(true);
  const first = currentCity();
  updateBulkStatus(first ? `Starting with ${first.city}, ${first.state}…` : "Starting bulk send…");
  processBulkSendStep();
}

function skipCurrent() {
  const city = currentCity();
  if (!city) return;
  skippedIds.add(city.id);
  if (currentIndex >= activeQueue().length - 1) currentIndex = 0;
  renderCurrentCity();
}

function bindEvents() {
  $("#btn-send")?.addEventListener("click", sendCurrentEmail);
  $("#btn-skip")?.addEventListener("click", skipCurrent);
  $("#btn-bulk-start")?.addEventListener("click", startBulkSend);
  $("#btn-bulk-stop")?.addEventListener("click", () => {
    stopBulkSend(bulkSessionSent ? `Bulk send stopped — ${bulkSessionSent} sent this run.` : "Bulk send stopped.");
  });
}

async function init() {
  bindEvents();
  try {
    await loadQueue();
  } catch (err) {
    $("#request-loading").innerHTML = `<p class="load-error">Could not load queue. (${err.message})</p>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}