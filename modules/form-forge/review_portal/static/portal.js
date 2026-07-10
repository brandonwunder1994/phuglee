const { $, escHtml, formatDayDate, cityPdfUrl, pdfPreviewUrl, postJson, postForm, showToast } = window.PortalShared;

let cities = [];
let cityDetails = new Map();
let submissionKpi = null;
let selectedId = null;
let filterState = "all";
let filterPathway = "all";
let filterCv = "all";
let search = "";
let quickApology = false;
let quickWrongEmail = false;
let quickInvalidEmail = false;
let quickPortalErrors = false;
let portalErrorCount = 0;
let searchDebounceTimer = null;
let urlSyncTimer = null;
let syncingUrl = false;
let urlSyncEnabled = false;
let pendingCityFromUrl = null;

function formatStatus(status) {
  if (!status || status === "pending") return "Pending";
  if (status === "other_contact") return "City gave other contact";
  if (status === "needs_clarification") return "Needs clarification — respond to get list";
  if (status === "other_source") return "Contact another source";
  if (status === "no") return "No records of this kind";
  return status.replace(/_/g, " ");
}

function statusClass(status) {
  if (!status || status === "pending") return "pending";
  if (status === "yes") return "yes";
  if (status === "denied") return "denied";
  if (status === "needs_clarification" || status === "other_source") return "other";
  return "other";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (_) {
    return iso;
  }
}

function setButtonState(button, { label, disabled = false, variant = "default", title = "" }) {
  if (!button) return;
  button.textContent = label;
  button.disabled = disabled;
  button.title = title;
  button.classList.remove("status-sent", "status-blocked", "status-ready");
  if (variant === "sent") button.classList.add("status-sent");
  if (variant === "blocked") button.classList.add("status-blocked");
  if (variant === "ready") button.classList.add("status-ready");
}

function yesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function cityHasCompletedPdf(city) {
  if (city.has_completed_pdf === true) return true;
  const pdf = city.pdf || {};
  return pdf.status === "completed" && Boolean(pdf.user_filled_path || city.pdf_file_url);
}

function cityTrackerType(city) {
  if (city.lacks_portal_and_email) return "no_contact";
  if (city.is_email_only || city.pathway === "email_only") return "email_only";
  if (cityHasCompletedPdf(city)) return "pdf_completed";
  if (city.pathway === "hybrid") return "hybrid";
  return "online";
}

function cityTypeTag(city) {
  if (city.lacks_portal_and_email) return "No contact";
  if (city.is_email_only || city.pathway === "email_only") return "Email only";
  return city.pathway === "email_pdf" ? "PDF" : "Portal";
}

function foiaPdfUrl(city) {
  return (city?.portal_url || city?.url || "").trim();
}

function showFoiaPdfButton(city) {
  return Boolean(foiaPdfUrl(city)) && (city.pathway === "email_pdf" || cityHasCompletedPdf(city));
}

function showOnlinePortalLink(city) {
  return Boolean(city.portal_url) && city.pathway !== "email_pdf";
}

function filteredCities() {
  const q = search.trim().toLowerCase();
  return cities.filter((city) => {
    if (quickApology && !city.apology_email?.show_button) return false;
    if (quickWrongEmail && !city.contact_email_wrong) return false;
    if (quickInvalidEmail && !city.contact_email_invalid) return false;
    if (quickPortalErrors && !city.portal_error) return false;
    if (filterState !== "all" && city.state !== filterState) return false;
    if (filterPathway !== "all" && cityTrackerType(city) !== filterPathway) return false;
    const cvStatus =
      city.cv_response_status || city.requests?.code_violation?.response_status || "pending";
    if (filterCv !== "all" && cvStatus !== filterCv) return false;
    if (!q) return true;
    const hay = `${city.city} ${city.state} ${city.id}`.toLowerCase();
    return hay.includes(q);
  });
}

function workflowStatusClass(status) {
  if (status === "done") return "is-done";
  if (status === "blocked") return "is-blocked";
  return "is-active";
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.min(100, Math.max(0, Math.round(n)))}%`;
}

function workflowTotals(workflows) {
  if (!workflows?.length) {
    return { sent: 0, total: 0, pending: 0, remaining: 0, pct: 0 };
  }
  const sent = workflows.reduce((sum, wf) => sum + (wf.sent || 0), 0);
  const total = workflows.reduce((sum, wf) => sum + (wf.total || 0), 0);
  const pending = workflows.reduce((sum, wf) => sum + (wf.pending || 0), 0);
  const remaining = Math.max(0, total - sent);
  const pct = total ? Math.round((sent / total) * 100) : 100;
  return { sent, total, pending, remaining, pct };
}

function workflowOverallPct(workflows) {
  return workflowTotals(workflows).pct;
}

function renderTotalStrip(workflows) {
  const strip = $("#tracker-total-strip");
  if (!strip) return;
  if (!workflows?.length) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const { sent, total, pending, remaining, pct } = workflowTotals(workflows);
  const sentEl = $("#tracker-total-sent");
  const allEl = $("#tracker-total-all");
  const pctEl = $("#tracker-total-pct");
  const remainingEl = $("#tracker-total-remaining");
  const bar = $("#tracker-total-bar");
  const fill = $("#tracker-total-bar-fill");
  if (sentEl) sentEl.textContent = String(sent);
  if (allEl) allEl.textContent = String(total);
  if (pctEl) pctEl.textContent = formatPct(pct);
  if (remainingEl) {
    remainingEl.textContent =
      pending > 0 ? `${remaining} remaining (${pending} ready now)` : `${remaining} remaining`;
  }
  if (bar) {
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-label", `${sent} of ${total} sent this month`);
  }
  if (fill) fill.style.width = `${pct}%`;
}

function renderWorkflowCards(workflows) {
  const grid = $("#tracker-workflow-grid");
  if (!grid) return;
  if (!workflows?.length) {
    grid.innerHTML = `<p class="tracker-dashboard-empty">Workflow stats unavailable.</p>`;
    return;
  }
  grid.innerHTML = workflows
    .map((wf) => {
      const statusClass = workflowStatusClass(wf.status);
      const pctLabel = formatPct(wf.pct);
      const blockedNote =
        wf.blocked > 0 ? `<span class="tracker-wf-blocked">${wf.blocked} on hold</span>` : "";
      return `
        <a href="${wf.href}" class="tracker-wf-card ${statusClass}" title="Open ${wf.label} — ${pctLabel} complete">
          <div class="tracker-wf-top">
            <span class="tracker-wf-label">${wf.label}</span>
            <span class="tracker-wf-pct" aria-label="${pctLabel} complete">${pctLabel}</span>
          </div>
          <div class="tracker-wf-bar" role="progressbar" aria-valuenow="${wf.pct || 0}" aria-valuemin="0" aria-valuemax="100" aria-label="${wf.label} progress">
            <div class="tracker-wf-bar-fill" style="width: ${wf.pct}%"></div>
          </div>
          <div class="tracker-wf-counts">
            <strong>${wf.sent}</strong>
            <span>of ${wf.total} sent</span>
            <span class="tracker-wf-status">${wf.status_label}</span>
          </div>
          ${blockedNote}
        </a>`;
    })
    .join("");
}

function responseStatusClass(status) {
  if (!status || status === "pending") return "is-pending";
  if (status === "yes") return "is-yes";
  if (status === "denied" || status === "no" || status === "wont_give") return "is-no";
  return "is-other";
}

function formatResponseDate(value) {
  if (!value) return "Date unknown";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    const dt = new Date(year, month - 1, day);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return formatDayDate(text) || text;
}

function renderResponseKpis(responses) {
  const lead = $("#tracker-response-lead");
  const kpis = $("#tracker-response-kpis");
  const feed = $("#tracker-response-feed");
  if (!lead || !kpis || !feed) return;

  const summary = responses?.summary || {};
  const cv = summary.code_violation || {};
  const water = summary.water_shutoff || {};
  const totalResponded = responses?.total_responded ?? 0;
  const totalPending = responses?.total_pending ?? 0;
  const totalRequested = responses?.total_requested ?? 0;
  const monthLabel = responses?.month_label || submissionKpi?.current_month_label || "This month";

  if (totalResponded > 0) {
    lead.textContent = `${monthLabel}: ${totalResponded} cities have replied · ${totalPending} still awaiting a response`;
  } else if (totalRequested > 0) {
    lead.textContent = `${monthLabel}: ${totalRequested} requests sent · no city replies logged yet`;
  } else {
    lead.textContent = `${monthLabel}: no requests logged yet — send requests to start tracking replies here`;
  }

  const cards = [
    {
      key: "cv-lists",
      label: "CV lists received",
      value: cv.list_received ?? 0,
      meta: `${cv.responded ?? 0} total CV replies`,
      tone: "yes",
    },
    {
      key: "cv-pending",
      label: "CV awaiting reply",
      value: cv.pending ?? 0,
      meta: `${cv.requested ?? 0} CV requests sent`,
      tone: "pending",
    },
    {
      key: "water-replied",
      label: "Water replied",
      value: water.responded ?? 0,
      meta: `${water.list_received ?? 0} lists received`,
      tone: water.responded > 0 ? "yes" : "pending",
    },
    {
      key: "water-pending",
      label: "Water awaiting reply",
      value: water.pending ?? 0,
      meta: `${water.requested ?? 0} water requests sent`,
      tone: "pending",
    },
  ];

  kpis.innerHTML = cards
    .map(
      (card) => `
    <div class="tracker-response-kpi tracker-response-kpi-${card.tone}">
      <span class="tracker-response-kpi-value">${card.value}</span>
      <span class="tracker-response-kpi-label">${card.label}</span>
      <span class="tracker-response-kpi-meta">${card.meta}</span>
    </div>`
    )
    .join("");

  const items = responses?.feed || [];
  feed.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "tracker-response-empty";
    empty.textContent =
      totalRequested > 0
        ? "No responses logged yet — cities are still pending."
        : "Responses will appear here as cities reply to your requests.";
    feed.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const statusClass = responseStatusClass(item.response_status);
    li.innerHTML = `
      <a href="${item.href}" class="tracker-response-item ${statusClass}">
        <span class="tracker-response-city">${item.city}, ${item.state}</span>
        <span class="tracker-response-detail">
          <span class="tracker-response-type">${item.request_label}</span>
          <span class="tracker-response-status">${item.response_label}</span>
        </span>
        <span class="tracker-response-date">${formatResponseDate(item.response_at)}</span>
      </a>`;
    feed.appendChild(li);
  });
}

function renderAttentionItems(items) {
  const wrap = $("#tracker-attention");
  if (!wrap) return;
  if (!items?.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <span class="tracker-attention-label">Needs attention</span>
    <ul class="tracker-attention-list">
      ${items
        .map(
          (item) => `
        <li>
          <a href="${item.href}" class="tracker-attention-link" title="${item.hint || item.label}">
            <span class="tracker-attention-count">${item.count}</span>
            <span class="tracker-attention-text">${item.label}</span>
          </a>
        </li>`
        )
        .join("")}
    </ul>`;
}

function renderSubmissionKpi() {
  const title = $("#kpi-month-title");
  const sub = $("#kpi-tracker-sub");
  const list = $("#kpi-month-list");
  const history = $("#tracker-history");
  if (!sub || !list) return;
  if (!submissionKpi) {
    if (title) title.textContent = "This month";
    sub.textContent = "Monthly stats unavailable.";
    list.innerHTML = "";
    renderTotalStrip([]);
    renderWorkflowCards([]);
    renderResponseKpis(null);
    renderAttentionItems([]);
    return;
  }

  const month = submissionKpi.current_month_label || "This month";
  if (title) title.textContent = month;

  const workflows = submissionKpi.workflows || [];
  const attention = submissionKpi.attention || [];
  const { sent: monthSent, total: monthTotal, pending: activePending } = workflowTotals(workflows);

  if (activePending > 0) {
    sub.textContent = `${activePending} cities ready to send across all workflows`;
  } else if (monthSent >= monthTotal) {
    sub.textContent = `All ${monthTotal} monthly requests logged`;
  } else {
    sub.textContent = `${monthTotal - monthSent} cities still need a request this month`;
  }

  renderTotalStrip(workflows);
  renderWorkflowCards(workflows);
  renderResponseKpis(submissionKpi.responses);
  renderAttentionItems(attention);

  const months = (submissionKpi.months || []).filter(
    (entry) => entry.month !== submissionKpi.current_month
  );
  list.innerHTML = "";
  if (!months.length) {
    if (history) history.hidden = true;
    return;
  }
  if (history) history.hidden = false;
  months.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "cv-month-row";
    const monthTotal = entry.total_submitted || 0;
    const emailPct = monthTotal ? Math.round((entry.email_sent / monthTotal) * 100) : 0;
    const onlinePct = monthTotal ? Math.round((entry.online_submitted / monthTotal) * 100) : 0;
    li.innerHTML = `
      <span class="cv-month-name">${entry.label}</span>
      <span class="cv-month-sent"><strong>${entry.email_sent}</strong> email <em>${emailPct}%</em></span>
      <span class="cv-month-coverage">${entry.online_submitted} online <em>${onlinePct}%</em></span>
      <span class="cv-month-total">${monthTotal} total</span>
    `;
    list.appendChild(li);
  });
}

function populateStateFilter() {
  const select = $("#filter-state");
  const states = [...new Set(cities.map((c) => c.state))].sort();
  states.forEach((state) => {
    const opt = document.createElement("option");
    opt.value = state;
    opt.textContent = state;
    select.appendChild(opt);
  });
}

function clearDetailPanel() {
  selectedId = null;
  $("#detail-empty").hidden = false;
  $("#detail-card").hidden = true;
  $("#action-msg").hidden = true;
}

function syncSelectionWithFilters(items) {
  if (!selectedId) return;
  if (items.some((city) => city.id === selectedId)) return;
  if (items.length) {
    void selectCity(items[0].id);
    return;
  }
  clearDetailPanel();
}

function renderList() {
  const list = $("#city-list");
  list.innerHTML = "";
  const items = filteredCities();
  syncSelectionWithFilters(items);
  if (!items.length) {
    const li = document.createElement("li");
    if (filtersAreActive()) {
      li.className = "portal-empty-filters";
      li.innerHTML = `
        <p>No cities match the current filters.</p>
        <button type="button" class="btn ghost sm portal-empty-clear">Clear all filters</button>
      `;
      list.appendChild(li);
      li.querySelector(".portal-empty-clear")?.addEventListener("click", clearAllFilters);
    } else {
      li.className = "load-error";
      li.textContent = "No cities loaded.";
      list.appendChild(li);
    }
    return;
  }
  items.forEach((city) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = city.id === selectedId ? "active" : "";
    btn.id = `city-option-${city.id}`;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", city.id === selectedId ? "true" : "false");

    const typeLabel = cityTypeTag(city);
    const apologyTag = city.apology_email?.show_button
      ? '<span class="status-chip apology">Apology</span>'
      : "";
    const wrongEmailTag = city.contact_email_wrong
      ? '<span class="status-chip wrong-email">Wrong email</span>'
      : "";
    const invalidEmailTag = city.contact_email_invalid
      ? '<span class="status-chip invalid-email">Invalid email</span>'
      : "";

    btn.innerHTML = `
      <span class="city-line-title">${escHtml(city.city)}</span>
      <span class="city-line-meta">
        <span>${escHtml(city.state)}</span>
        <span class="status-chip other">${escHtml(typeLabel)}</span>
        ${apologyTag}
        ${wrongEmailTag}
        ${invalidEmailTag}
      </span>
    `;
    btn.addEventListener("click", () => selectCity(city.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
  updateListboxActiveDescendant();
}

function updateListboxActiveDescendant() {
  const list = $("#city-list");
  if (!list) return;
  list.setAttribute("aria-activedescendant", selectedId ? `city-option-${selectedId}` : "");
}

function scrollSelectedCityIntoView() {
  const btn = selectedId ? document.getElementById(`city-option-${selectedId}`) : null;
  btn?.scrollIntoView({ block: "nearest" });
}

function visibleCityIds() {
  return filteredCities().map((city) => city.id);
}

function moveCitySelection(delta) {
  const ids = visibleCityIds();
  if (!ids.length) return;
  let idx = selectedId ? ids.indexOf(selectedId) : -1;
  if (idx === -1) {
    idx = delta > 0 ? 0 : ids.length - 1;
  } else {
    idx = Math.max(0, Math.min(ids.length - 1, idx + delta));
  }
  void selectCity(ids[idx]).then(scrollSelectedCityIntoView);
}

function selectFirstCity() {
  const ids = visibleCityIds();
  if (!ids.length) return;
  void selectCity(ids[0]).then(scrollSelectedCityIntoView);
}

function selectLastCity() {
  const ids = visibleCityIds();
  if (!ids.length) return;
  void selectCity(ids[ids.length - 1]).then(scrollSelectedCityIntoView);
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.isContentEditable);
}

function bindCityListKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "ArrowDown" || (event.key === "j" && !event.ctrlKey && !event.metaKey)) {
      event.preventDefault();
      moveCitySelection(1);
    } else if (event.key === "ArrowUp" || (event.key === "k" && !event.ctrlKey && !event.metaKey)) {
      event.preventDefault();
      moveCitySelection(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectFirstCity();
    } else if (event.key === "End") {
      event.preventDefault();
      selectLastCity();
    }
  });
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  search = params.get("q") || "";
  filterState = params.get("state") || "all";
  filterPathway = params.get("pathway") || "all";
  filterCv = params.get("cv") || "all";
  quickApology = false;
  quickWrongEmail = false;
  quickInvalidEmail = false;
  quickPortalErrors = false;
  const quick = params.get("quick") || "";
  quick.split(",").forEach((token) => {
    const key = token.trim();
    if (key === "apology") quickApology = true;
    else if (key === "wrong_email") quickWrongEmail = true;
    else if (key === "invalid_email") quickInvalidEmail = true;
    else if (key === "portal_errors") quickPortalErrors = true;
    else if (key === "cv_pending") filterCv = "pending";
    else if (key === "pdf") filterPathway = "pdf_completed";
    else if (key === "online") filterPathway = "online";
    else if (key === "email_only") filterPathway = "email_only";
    else if (key === "no_contact") filterPathway = "no_contact";
  });
  const searchInput = $("#search-input");
  if (searchInput) searchInput.value = search;
  const stateSelect = $("#filter-state");
  if (stateSelect) stateSelect.value = filterState;
  const pathwaySelect = $("#filter-pathway");
  if (pathwaySelect) pathwaySelect.value = filterPathway;
  const cvSelect = $("#filter-cv");
  if (cvSelect) cvSelect.value = filterCv;
}

function buildUrlSearchParams() {
  const params = new URLSearchParams();
  if (selectedId) params.set("city", selectedId);
  if (search.trim()) params.set("q", search.trim());
  if (filterState !== "all") params.set("state", filterState);
  if (filterPathway !== "all") params.set("pathway", filterPathway);
  if (filterCv !== "all") params.set("cv", filterCv);
  const quick = [];
  if (quickApology) quick.push("apology");
  if (quickWrongEmail) quick.push("wrong_email");
  if (quickInvalidEmail) quick.push("invalid_email");
  if (quickPortalErrors) quick.push("portal_errors");
  if (quick.length) params.set("quick", quick.join(","));
  return params;
}

function syncUrlFromFilters() {
  if (syncingUrl) return;
  const params = buildUrlSearchParams();
  const query = params.toString();
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    history.replaceState(null, "", next);
  }
}

function captureCityFromUrl() {
  const params = new URLSearchParams(window.location.search);
  pendingCityFromUrl = params.get("city") || null;
}

function scheduleUrlSync() {
  if (!urlSyncEnabled) return;
  window.clearTimeout(urlSyncTimer);
  urlSyncTimer = window.setTimeout(syncUrlFromFilters, 120);
}

function renderDetail(city) {
  $("#detail-empty").hidden = true;
  $("#detail-card").hidden = false;

  $("#detail-state").textContent = city.state;
  $("#detail-city").textContent = city.city;

  const chips = $("#detail-chips");
  chips.innerHTML = "";
  const typeChip = document.createElement("span");
  typeChip.className = "status-chip other";
  typeChip.textContent = cityTypeTag(city);
  chips.appendChild(typeChip);
  if (city.contact_email_wrong) {
    const wrongChip = document.createElement("span");
    wrongChip.className = "status-chip wrong-email";
    wrongChip.textContent = "Wrong email";
    chips.appendChild(wrongChip);
  }
  if (city.contact_email_invalid) {
    const invalidChip = document.createElement("span");
    invalidChip.className = "status-chip invalid-email";
    invalidChip.textContent = "Invalid email";
    chips.appendChild(invalidChip);
  }
  if (city.portal_error) {
    const portalErrorChip = document.createElement("span");
    portalErrorChip.className = "status-chip portal-error";
    portalErrorChip.textContent = "Portal error";
    chips.appendChild(portalErrorChip);
  }

  const contactBlock = $("#contact-email-block");
  const contactEl = $("#detail-contact-email");
  const wrongToggle = $("#detail-wrong-email");
  const wrongNote = $("#detail-wrong-email-note");
  const invalidNote = $("#detail-invalid-email-note");
  const hasContactEmail = Boolean((city.contact_email || "").trim());
  if (contactBlock) contactBlock.hidden = !hasContactEmail;
  if (contactEl && hasContactEmail) {
    contactEl.classList.toggle("invalid-email-value", Boolean(city.contact_email_invalid));
    if (city.contact_email_invalid) {
      contactEl.textContent = city.contact_email;
    } else {
      contactEl.innerHTML = `<a href="mailto:${escHtml(city.contact_email)}">${escHtml(city.contact_email)}</a>`;
    }
  }
  if (wrongToggle) {
    wrongToggle.checked = Boolean(city.contact_email_wrong);
    wrongToggle.disabled = false;
  }
  if (wrongNote) wrongNote.hidden = !city.contact_email_wrong;
  if (invalidNote) invalidNote.hidden = !city.contact_email_invalid;

  const portalTitle = $("#portal-block-title");
  const urlEl = $("#detail-url");
  const foiaBtn = $("#btn-foia-pdf");
  const showFoia = showFoiaPdfButton(city);
  const showPortal = showOnlinePortalLink(city);
  const foiaUrl = foiaPdfUrl(city);

  const foiaOnly = showFoia && !showPortal;

  if (portalTitle) {
    if (foiaOnly) {
      portalTitle.hidden = true;
    } else if (showPortal) {
      portalTitle.hidden = false;
      portalTitle.textContent = "Portal";
    } else if (city.contact_email) {
      portalTitle.hidden = false;
      portalTitle.textContent = "Contact";
    } else {
      portalTitle.hidden = true;
    }
  }

  if (foiaBtn) {
    if (showFoia) {
      foiaBtn.href = foiaUrl;
      foiaBtn.hidden = false;
    } else {
      foiaBtn.href = "#";
      foiaBtn.hidden = true;
    }
  }

  if (urlEl) {
    if (foiaOnly) {
      urlEl.hidden = true;
      urlEl.textContent = "";
    } else if (showPortal) {
      urlEl.hidden = false;
      urlEl.innerHTML = `<a href="${city.portal_url}" target="_blank" rel="noopener">${city.portal_url}</a>`;
    } else if (city.contact_email) {
      urlEl.hidden = false;
      urlEl.innerHTML = `<a href="mailto:${city.contact_email}">${city.contact_email}</a>`;
    } else {
      urlEl.hidden = true;
      urlEl.textContent = "";
    }
  }

  const notes = $("#detail-notes");
  if (city.url_notes) {
    notes.textContent = city.url_notes;
    notes.hidden = false;
  } else {
    notes.hidden = true;
  }

  const cvReq = city.requests?.code_violation || {};
  const tracking = city.tracking || {};

  $("#detail-water-req").textContent = yesNo(city.requests?.water_shutoff?.requested);
  $("#detail-water-res").textContent = formatStatus(city.requests?.water_shutoff?.response_status);
  $("#detail-cv-req").textContent = yesNo(cvReq.requested);
  $("#detail-cv-res").textContent = formatStatus(cvReq.response_status);
  $("#detail-city-replied").textContent = yesNo(tracking.city_replied);
  $("#detail-response-date").textContent = cvReq.response_at ? formatDayDate(cvReq.response_at) : "—";
  const avgTurnaround = tracking.average_turnaround_days;
  $("#detail-turnaround").textContent =
    avgTurnaround != null ? `${avgTurnaround} days` : "—";

  const nextRequestEl = $("#detail-next-request");
  const nextLabel = tracking.next_request_available_label;
  if (nextRequestEl) {
    if (nextLabel) {
      nextRequestEl.hidden = false;
      nextRequestEl.textContent = `Next request available: ${nextLabel}`;
    } else {
      nextRequestEl.hidden = true;
      nextRequestEl.textContent = "";
    }
  }

  const openBtn = $("#btn-detail-open-portal");
  if (showPortal) {
    openBtn.href = city.portal_url;
    openBtn.style.display = "";
  } else {
    openBtn.href = "#";
    openBtn.style.display = "none";
  }

  const portalBlock = $("#portal-block");
  if (portalBlock) {
    portalBlock.hidden = !showPortal && !city.contact_email && !city.url_notes;
  }

  const pdfBlock = $("#pdf-block");
  const pdfStatus = $("#detail-pdf-status");
  const thumbCard = $("#pdf-thumb-card");
  const previewBtn = $("#btn-preview-pdf");
  const pdf = city.pdf || {};
  const pdfUrl = cityPdfUrl(city);
  const showPdf = cityHasCompletedPdf(city) && pdfUrl;
  const showPdfBlock = showPdf || showFoia;

  if (pdfBlock) pdfBlock.hidden = !showPdfBlock;

  if (showPdf) {
    if (pdfStatus) {
      pdfStatus.hidden = false;
      pdfStatus.textContent = pdf.saved_at
        ? `Completed ${formatDate(pdf.saved_at)}`
        : "Completed PDF on file";
    }
    if (thumbCard) thumbCard.hidden = false;
    if (previewBtn) previewBtn.hidden = false;
    const thumb = $("#pdf-thumb-frame");
    if (thumb) thumb.src = pdfUrl;
  } else {
    if (pdfStatus) pdfStatus.hidden = true;
    if (thumbCard) thumbCard.hidden = true;
    if (previewBtn) previewBtn.hidden = true;
    const thumb = $("#pdf-thumb-frame");
    if (thumb) thumb.removeAttribute("src");
  }

  renderActionButtons(city);
  renderResponseLists(city);

  const hist = $("#submission-history");
  hist.innerHTML = "";
  const subs = city.submissions || [];
  if (!subs.length) {
    const li = document.createElement("li");
    li.textContent = "No submissions logged yet.";
    hist.appendChild(li);
  } else {
    subs.forEach((entry) => {
      const li = document.createElement("li");
      const label = entry.action === "submitted" ? "Submitted" : "Response";
      const statusLabel = entry.response_status ? formatStatus(entry.response_status) : formatStatus(entry.request_type);
      li.innerHTML = `
        <strong>${label}</strong>
        · ${statusLabel} · ${entry.channel || "—"}
        <div class="hist-meta">${formatDate(entry.logged_at)}</div>
      `;
      hist.appendChild(li);
    });
  }

  renderContactNotes(city);
}

function renderContactNotes(city) {
  const block = $("#contact-notes-block");
  const list = $("#contact-notes");
  if (!block || !list) return;

  const noteEntries = (city.submissions || []).filter((entry) => entry.notes);
  if (!noteEntries.length) {
    block.hidden = true;
    list.innerHTML = "";
    return;
  }

  block.hidden = false;
  list.innerHTML = "";
  noteEntries.forEach((entry) => {
    const li = document.createElement("li");
    const context = entry.response_status
      ? formatStatus(entry.response_status)
      : entry.action === "submitted"
        ? "Submission"
        : "Update";
    const contactLine =
      entry.new_contact_email
        ? `<div class="note-contact">New contact: ${escHtml(entry.new_contact_email)}</div>`
        : "";
    li.innerHTML = `
      <div class="note-meta">${formatDate(entry.logged_at)} · ${escHtml(context)}</div>
      ${contactLine}
      <p class="note-body">${escHtml(entry.notes)}</p>
    `;
    list.appendChild(li);
  });
}

function mergeSummaryFromDetail(city) {
  const idx = cities.findIndex((c) => c.id === city.id);
  if (idx === -1) return;
  cities[idx] = {
    id: city.id,
    city: city.city,
    state: city.state,
    pathway: city.pathway,
    is_email_only: city.is_email_only,
    lacks_portal_and_email: city.lacks_portal_and_email,
    has_completed_pdf: city.has_completed_pdf,
    cv_response_status: city.requests?.code_violation?.response_status || "pending",
    apology_email: { show_button: Boolean(city.apology_email?.show_button) },
    contact_email_wrong: Boolean(city.contact_email_wrong),
    contact_email_invalid: Boolean(city.contact_email_invalid),
  };
  cityDetails.set(city.id, city);
}

function applyCityUpdate(city) {
  if (!city?.id) return;
  mergeSummaryFromDetail(city);
  renderList();
  if (selectedId === city.id) {
    renderDetail(city);
  }
}

async function refreshKpiAndBadges() {
  try {
    const kpiRes = await fetch("/api/portal/kpi");
    if (kpiRes.ok) {
      submissionKpi = await kpiRes.json();
      renderSubmissionKpi();
    }
  } catch (_) {
    submissionKpi = null;
    renderSubmissionKpi();
  }
  await fetchPendingPdfBadge();
}

async function applyActionResult(data) {
  if (data?.city) applyCityUpdate(data.city);
  await refreshKpiAndBadges();
}

function cityDetail(id) {
  if (!id) return null;
  return cityDetails.get(id) || null;
}

async function loadCityDetail(id, { force = false } = {}) {
  if (!id) return;
  const summary = cities.find((c) => c.id === id);
  $("#detail-empty").hidden = true;
  $("#detail-card").hidden = false;
  if (summary) {
    $("#detail-state").textContent = summary.state;
    $("#detail-city").textContent = summary.city;
  } else {
    $("#detail-state").textContent = "";
    $("#detail-city").textContent = "Loading…";
  }

  if (!force && cityDetails.has(id)) {
    renderDetail(cityDetails.get(id));
    return;
  }

  try {
    const res = await fetch(`/api/portal/city/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const city = await res.json();
    mergeSummaryFromDetail(city);
    if (selectedId === id) renderDetail(city);
  } catch (err) {
    if (selectedId === id) {
      showMsg(`Could not load city details. (${err.message})`, false);
      clearDetailPanel();
    }
  }
}

async function selectCity(id) {
  if (!cities.some((c) => c.id === id)) return;
  selectedId = id;
  renderList();
  $("#action-msg").hidden = true;
  scheduleUrlSync();
  await loadCityDetail(id);
}

function renderActionButtons(city) {
  const tracking = city.tracking || {};
  const email = tracking.email || {};
  const online = tracking.online || {};
  const warningEl = $("#action-warning");

  const submitBtn = $("#btn-submit-online");
  const emailBtn = $("#btn-send-email");
  const apologyBtn = $("#btn-send-apology");
  const showApology = Boolean(city.apology_email?.show_button);
  const showOnline = Boolean(city.portal_url) && city.pathway !== "email_pdf";
  const showEmailOnly = Boolean(city.is_email_only) && !cityHasCompletedPdf(city);
  const showEmail =
    !showApology &&
    !showEmailOnly &&
    cityHasCompletedPdf(city) &&
    (city.pathway === "email_pdf" || city.pathway === "hybrid" || city.contact_email);

  if (submitBtn) submitBtn.style.display = showOnline ? "" : "none";
  if (emailBtn) emailBtn.style.display = showEmail || showEmailOnly ? "" : "none";
  if (apologyBtn) {
    apologyBtn.hidden = !showApology;
    apologyBtn.disabled = false;
    apologyBtn.textContent = "Send 3rd Email with Apology";
  }

  if (showOnline) {
    if (!online.can_submit) {
      setButtonState(submitBtn, {
        label: online.submitted_label || "Form Submitted",
        disabled: true,
        variant: "sent",
        title: online.blocked_reason || "",
      });
    } else {
      setButtonState(submitBtn, {
        label: "Submit Online Form",
        disabled: false,
        variant: "ready",
      });
    }
  }

  if (showEmail || showEmailOnly) {
    if (!email.can_send) {
      const label =
        email.state === "wrong_email"
          ? "Wrong email"
          : email.state === "invalid_email"
            ? "Invalid email"
            : email.sent_label || "Email Sent";
      const variant =
        email.state === "wrong_email" ||
        email.state === "invalid_email" ||
        email.state === "cooldown"
          ? "blocked"
          : "sent";
      setButtonState(emailBtn, {
        label,
        disabled: true,
        variant,
        title: email.blocked_reason || "",
      });
    } else {
      setButtonState(emailBtn, {
        label: showEmailOnly ? "Send Email Only Request" : "Send Email Request",
        disabled: false,
        variant: "ready",
      });
    }
  }

  if (warningEl) {
    const warning = email.blocked_reason || online.blocked_reason || "";
    if (warning) {
      warningEl.hidden = false;
      warningEl.textContent = warning;
    } else {
      warningEl.hidden = true;
      warningEl.textContent = "";
    }
  }
}

function updatePendingPdfBadge(count) {
  const badge = $("#portal-request-pdfs-count");
  const btn = $("#portal-request-pdfs-btn");
  if (!badge || !btn) return;
  if (count > 0) {
    badge.hidden = false;
    badge.textContent = String(count);
    btn.title = `${count} PDF request${count === 1 ? "" : "s"} ready to send this month`;
  } else {
    badge.hidden = true;
    badge.textContent = "";
    btn.title = "All PDF requests sent this month";
  }
}

function updatePendingEmailOnlyBadge(count) {
  const badge = $("#portal-email-only-count");
  const btn = $("#portal-email-only-btn");
  if (!badge || !btn) return;
  if (count > 0) {
    badge.hidden = false;
    badge.textContent = String(count);
    btn.title = `${count} email-only request${count === 1 ? "" : "s"} ready to send this month`;
  } else {
    badge.hidden = true;
    badge.textContent = "";
    btn.title = "All email-only requests sent this month";
  }
}

function updatePendingOnlineBadge(count) {
  const badge = $("#portal-submit-portals-count");
  const btn = $("#portal-submit-portals-btn");
  if (!badge || !btn) return;
  if (count > 0) {
    badge.hidden = false;
    badge.textContent = String(count);
    btn.title = `${count} portal submission${count === 1 ? "" : "s"} ready this month`;
  } else {
    badge.hidden = true;
    badge.textContent = "";
    btn.title = "All portal submissions done this month";
  }
}

function adjustPendingOnlineBadge(delta) {
  const badge = $("#portal-submit-portals-count");
  const btn = $("#portal-submit-portals-btn");
  if (!badge || !btn || !Number.isFinite(delta) || delta === 0) return;
  const current = badge.hidden ? 0 : Number.parseInt(badge.textContent || "0", 10);
  if (!Number.isFinite(current)) return;
  updatePendingOnlineBadge(Math.max(0, current + delta));
}

let workflowBadgeRefreshTimer = null;

function scheduleWorkflowBadgeRefresh() {
  window.clearTimeout(workflowBadgeRefreshTimer);
  workflowBadgeRefreshTimer = window.setTimeout(() => {
    void fetchPendingPdfBadge();
  }, 2500);
}

async function fetchPortalErrorCount() {
  try {
    const res = await fetch("/api/portal/portal-errors");
    if (!res.ok) return;
    const data = await res.json();
    portalErrorCount = data.total || 0;
    updatePortalErrorAlert();
  } catch (_) {
    updatePortalErrorAlert();
  }
}

async function fetchPendingPdfBadge() {
  try {
    const [pdfRes, emailOnlyRes, onlineRes] = await Promise.all([
      fetch("/api/portal/pending-pdf-requests"),
      fetch("/api/portal/pending-email-only-requests"),
      fetch("/api/portal/pending-online-requests"),
    ]);
    if (pdfRes.ok) {
      const pending = await pdfRes.json();
      updatePendingPdfBadge(pending.total_pending || 0);
    } else {
      updatePendingPdfBadge(0);
    }
    if (emailOnlyRes.ok) {
      const pending = await emailOnlyRes.json();
      updatePendingEmailOnlyBadge(pending.total_pending || 0);
    } else {
      updatePendingEmailOnlyBadge(0);
    }
    if (onlineRes.ok) {
      const pending = await onlineRes.json();
      updatePendingOnlineBadge(pending.total_pending || 0);
    } else {
      updatePendingOnlineBadge(0);
    }
  } catch (_) {
    updatePendingPdfBadge(0);
    updatePendingEmailOnlyBadge(0);
    updatePendingOnlineBadge(0);
  }
}

async function refresh() {
  const list = $("#city-list");
  try {
    const [citiesRes, kpiRes] = await Promise.all([
      fetch("/api/portal/cities/summary"),
      fetch("/api/portal/kpi"),
    ]);
    if (!citiesRes.ok) throw new Error(`Server returned ${citiesRes.status}`);
    const data = await citiesRes.json();
    cities = data.items || [];
    cityDetails = new Map();
    if (kpiRes.ok) {
      submissionKpi = await kpiRes.json();
    } else {
      submissionKpi = null;
    }
    renderSubmissionKpi();
    updatePortalErrorAlert();
    applyFilters();
    if (selectedId && cities.some((c) => c.id === selectedId)) {
      await loadCityDetail(selectedId, { force: true });
    } else if (selectedId) {
      clearDetailPanel();
    }
    await fetchPendingPdfBadge();
  } catch (err) {
    if (list) {
      list.innerHTML = `<li class="load-error">Could not load cities. Start the server with <code>python run_review_portal.py</code> then open <code>http://127.0.0.1:8787/portal</code>. (${err.message})</li>`;
    }
  }
}

function showMsg(text, ok = true) {
  showToast(text, { ok });
  const el = $("#action-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  el.hidden = false;
}

async function submitOnlineForm() {
  if (!selectedId) return;
  await loadCityDetail(selectedId);
  const city = cityDetail(selectedId);
  if (!city?.portal_url) {
    showMsg("No portal URL on file for this city.", false);
    return;
  }
  const tracking = city.tracking || {};
  if (tracking.online && !tracking.online.can_submit) {
    showMsg(tracking.online.blocked_reason || "Online form is not available yet.", false);
    return;
  }
  if (!confirm(`Open ${city.city}'s online portal and mark this request as submitted?`)) return;
  const portalUrl = city.portal_url;
  if (portalUrl) window.open(portalUrl, "_blank", "noopener");
  const submitBtn = $("#btn-submit-online");
  setButtonState(submitBtn, { label: "Logging submission…", disabled: true, variant: "sent" });
  try {
    const data = await postJson(`/api/portal/city/${selectedId}/submit`, {
      request_type: "code_violation",
      notes: "Submitted from City Tracker",
      light: true,
    });
    const sentAt = data.event?.logged_at;
    showMsg(
      sentAt ? `Online form marked submitted on ${formatDayDate(sentAt)}.` : "Online form marked as submitted."
    );
    await refreshKpiAndBadges();
    await loadCityDetail(selectedId, { force: true });
    window.dispatchEvent(
      new CustomEvent("portal-workflow-updated", { detail: { onlineDelta: -1 } })
    );
  } catch (err) {
    showMsg(err.message, false);
    if (city) renderActionButtons(city);
  }
}

async function sendApologyEmail() {
  if (!selectedId) return;
  await loadCityDetail(selectedId);
  const city = cityDetail(selectedId);
  if (!city?.apology_email?.show_button) return;
  const recipient = city?.contact_email || prompt("Recipient email:");
  if (!recipient) return;
  if (
    !confirm(
      `Send the corrected FOIA PDF with an apology to ${recipient}? This one-time button will disappear after sending.`
    )
  ) {
    return;
  }
  const apologyBtn = $("#btn-send-apology");
  if (apologyBtn) {
    apologyBtn.disabled = true;
    apologyBtn.textContent = "Sending…";
  }
  try {
    const data = await postJson(`/api/portal/city/${selectedId}/send-apology-email`, {
      request_type: "code_violation",
      email: recipient,
      notes: "One-time apology resend from City Tracker",
    });
    const sentAt = data.event?.logged_at;
    showMsg(sentAt ? `Apology email sent on ${formatDayDate(sentAt)}.` : "Apology email sent.");
    await applyActionResult(data);
  } catch (err) {
    showMsg(err.message, false);
    if (city) renderActionButtons(city);
  }
}

async function openEmailConfirmDialog() {
  if (!selectedId) return;
  await loadCityDetail(selectedId);
  const city = cityDetail(selectedId);
  if (!city) return;
  if (city.apology_email?.show_button) {
    showMsg("Send the apology email first — this city received an incorrect PDF earlier.", false);
    return;
  }
  const tracking = city.tracking || {};
  if (tracking.email && !tracking.email.can_send) {
    showMsg(tracking.email.blocked_reason || "Email send is not available yet.", false);
    return;
  }

  const dialog = $("#email-confirm-dialog");
  const cityEl = $("#email-confirm-city");
  const recipientInput = $("#email-confirm-recipient");
  if (!dialog || !cityEl || !recipientInput) return;

  cityEl.textContent = `${city.city}, ${city.state}`;
  recipientInput.value = city.contact_email || "";
  dialog.showModal();
  if (!recipientInput.value) {
    recipientInput.focus();
  } else {
    $("#email-confirm-approve")?.focus();
  }
}

function closeEmailConfirmDialog() {
  const dialog = $("#email-confirm-dialog");
  if (dialog?.open) dialog.close();
}

async function executeSendEmailToCity() {
  if (!selectedId) return;
  const city = cityDetail(selectedId);
  const recipient = ($("#email-confirm-recipient")?.value || "").trim();
  if (!recipient) {
    showMsg("Enter a recipient email before sending.", false);
    return;
  }

  closeEmailConfirmDialog();

  const emailBtn = $("#btn-send-email");
  if (emailBtn) {
    emailBtn.disabled = true;
    emailBtn.textContent = "Sending…";
  }
  const endpoint = city?.is_email_only
    ? `/api/portal/city/${selectedId}/send-email-only`
    : `/api/portal/city/${selectedId}/send-email`;
  try {
    const data = await postJson(endpoint, {
      request_type: "code_violation",
      email: recipient,
      notes: city?.is_email_only
        ? "Sent from City Tracker (email only)"
        : "Sent from City Tracker",
    });
    const sentAt = data.event?.logged_at;
    showMsg(sentAt ? `Email sent on ${formatDayDate(sentAt)}.` : "Email sent.");
    await applyActionResult(data);
  } catch (err) {
    showMsg(err.message, false);
    if (city) renderActionButtons(city);
  }
}

function toggleOtherContactFields() {
  const status = $("#response-status")?.value || "";
  const panel = $("#other-contact-fields");
  const emailInput = $("#response-new-email");
  const sourcePanel = $("#other-source-fields");
  const isOtherContact = status === "other_contact";
  const isOtherSource = status === "other_source";
  if (panel) panel.hidden = !isOtherContact;
  if (emailInput) emailInput.required = isOtherContact;
  if (sourcePanel) sourcePanel.hidden = !isOtherSource;
}

function openResponseDialog() {
  if (!selectedId) return;
  const form = $("#response-form");
  if (form) form.reset();
  toggleOtherContactFields();
  $("#response-dialog").showModal();
}

function selectedCity() {
  return cityDetail(selectedId);
}

function openPdfPreview() {
  const city = selectedCity();
  const pdfUrl = city ? cityPdfUrl(city) : "";
  if (!city || !cityHasCompletedPdf(city) || !pdfUrl) return;
  const dialog = $("#pdf-preview-dialog");
  const frame = $("#pdf-dialog-frame");
  const title = $("#pdf-dialog-title");
  const tab = $("#pdf-dialog-tab");
  if (!dialog || !frame) return;
  if (title) title.textContent = `${city.city}, ${city.state} — Completed PDF`;
  const previewUrl = pdfPreviewUrl(pdfUrl);
  frame.src = previewUrl;
  if (tab) tab.href = pdfUrl;
  dialog.showModal();
}

function closePdfPreview() {
  const dialog = $("#pdf-preview-dialog");
  if (dialog?.open) dialog.close();
  const frame = $("#pdf-dialog-frame");
  if (frame) frame.removeAttribute("src");
}

function requestTypeLabel(type) {
  if (type === "water_shutoff") return "Water shutoffs";
  return "Code violations";
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderResponseLists(city) {
  const block = $("#response-lists-block");
  const list = $("#response-lists");
  if (!block || !list) return;
  const files = city.response_lists || [];
  if (!files.length) {
    block.hidden = true;
    list.innerHTML = "";
    return;
  }
  block.hidden = false;
  list.innerHTML = "";
  files.forEach((file) => {
    const li = document.createElement("li");
    const sizeLabel = formatFileSize(file.size_bytes);
    const dateLabel = file.uploaded_at ? formatDate(file.uploaded_at) : "";
    const typeLabel = file.file_type_label || "Other";
    const typeClass = file.file_type ? `type-${file.file_type}` : "type-other";
    li.innerHTML = `
      <a class="response-list-link" href="${escHtml(file.download_url)}" target="_blank" rel="noopener">
        <span class="response-list-top">
          <span class="response-list-name">${escHtml(file.filename || "List file")}</span>
          <span class="response-list-type ${typeClass}">${escHtml(typeLabel)}</span>
        </span>
        <span class="response-list-meta">${escHtml(requestTypeLabel(file.request_type))}${file.response_status ? ` · ${escHtml(formatStatus(file.response_status))}` : ""}${sizeLabel ? ` · ${escHtml(sizeLabel)}` : ""}</span>
        ${dateLabel ? `<span class="response-list-date">${escHtml(dateLabel)}</span>` : ""}
      </a>`;
    list.appendChild(li);
  });
}

async function saveResponse(event) {
  event.preventDefault();
  if (!selectedId) return;

  const responseStatus = $("#response-status").value;
  const fields = {
    request_type: $("#response-type").value,
    response_status: responseStatus,
    response_raw: $("#response-raw").value,
    response_at: $("#response-date").value,
    notes: $("#response-notes").value,
  };
  if (responseStatus === "other_contact") {
    fields.new_contact_email = ($("#response-new-email").value || "").trim();
    if (!fields.new_contact_email) {
      showMsg("Enter the new contact email.", false);
      return;
    }
  }
  if (responseStatus === "other_source") {
    const sourceNotes = ($("#response-other-source-notes")?.value || "").trim();
    if (!sourceNotes) {
      showMsg("Enter who/where to contact for the other source.", false);
      return;
    }
    fields.notes = [fields.notes, sourceNotes].filter(Boolean).join(" · ");
    fields.response_raw = fields.response_raw || sourceNotes;
  }

  const listFile = $("#response-list-file")?.files?.[0];

  try {
    let data;
    if (listFile) {
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value != null && value !== "") formData.append(key, value);
      });
      formData.append("list_file", listFile);
      data = await postForm(`/api/portal/city/${selectedId}/response`, formData);
    } else {
      data = await postJson(`/api/portal/city/${selectedId}/response`, fields);
    }
    $("#response-dialog").close();
    let msg = "Response recorded.";
    if (data.list_file?.filename) {
      const typeLabel = data.list_file.file_type_label ? ` ${data.list_file.file_type_label}` : "";
      msg = `Response recorded —${typeLabel} list saved (${data.list_file.filename}).`;
    }
    if (data.email_sent) {
      msg = "Contact updated and FOIA PDF sent to the new email.";
      if (data.list_file?.filename) {
        const typeLabel = data.list_file.file_type_label ? ` ${data.list_file.file_type_label}` : "";
        msg += `${typeLabel} list saved (${data.list_file.filename}).`;
      }
    } else if (responseStatus === "other_contact" && data.email_error) {
      msg = `Contact updated, but email was not sent: ${data.email_error}`;
    }
    showMsg(msg, !data.email_error || data.email_sent);
    await applyActionResult(data);
  } catch (err) {
    showMsg(err.message, false);
  }
}

function activeFilterCount() {
  let count = 0;
  if (search.trim()) count += 1;
  if (filterState !== "all") count += 1;
  if (filterPathway !== "all") count += 1;
  if (filterCv !== "all") count += 1;
  if (quickApology) count += 1;
  if (quickWrongEmail) count += 1;
  if (quickInvalidEmail) count += 1;
  if (quickPortalErrors) count += 1;
  return count;
}

function filtersAreActive() {
  return activeFilterCount() > 0;
}

function updateFilterCount(items) {
  const el = $("#portal-filter-count");
  if (!el) return;
  const total = cities.length;
  const shown = items ? items.length : filteredCities().length;
  if (!total) {
    el.textContent = "No cities loaded";
    return;
  }
  el.textContent = filtersAreActive() ? `${shown} of ${total} cities` : `${total} cities`;
}

function updateFilterActiveIndicator() {
  const badge = $("#portal-filter-active");
  const clearBtn = $("#portal-filter-clear");
  const count = activeFilterCount();
  if (badge) {
    if (count) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }
  if (clearBtn) clearBtn.hidden = count === 0;
}

function updateQuickChipStates() {
  document.querySelectorAll(".portal-filter-chip").forEach((btn) => {
    const key = btn.dataset.quick || "";
    let active = false;
    if (key === "apology") active = quickApology;
    else if (key === "cv_pending") active = filterCv === "pending";
    else if (key === "needs_clarification") active = filterCv === "needs_clarification";
    else if (key === "other_source") active = filterCv === "other_source";
    else if (key === "pdf") active = filterPathway === "pdf_completed";
    else if (key === "online") active = filterPathway === "online";
    else if (key === "email_only") active = filterPathway === "email_only";
    else if (key === "no_contact") active = filterPathway === "no_contact";
    else if (key === "wrong_email") active = quickWrongEmail;
    else if (key === "invalid_email") active = quickInvalidEmail;
    else if (key === "portal_errors") active = quickPortalErrors;
    btn.classList.toggle("active", active);
  });
}

function clearAllFilters() {
  search = "";
  filterState = "all";
  filterPathway = "all";
  filterCv = "all";
  quickApology = false;
  quickWrongEmail = false;
  quickInvalidEmail = false;
  quickPortalErrors = false;
  const searchInput = $("#search-input");
  if (searchInput) searchInput.value = "";
  const stateSelect = $("#filter-state");
  if (stateSelect) stateSelect.value = "all";
  const pathwaySelect = $("#filter-pathway");
  if (pathwaySelect) pathwaySelect.value = "all";
  const cvSelect = $("#filter-cv");
  if (cvSelect) cvSelect.value = "all";
  applyFilters();
}

function toggleQuickFilter(key) {
  if (key === "apology") {
    quickApology = !quickApology;
  } else if (key === "cv_pending") {
    filterCv = filterCv === "pending" ? "all" : "pending";
    const cvSelect = $("#filter-cv");
    if (cvSelect) cvSelect.value = filterCv;
  } else if (key === "needs_clarification") {
    filterCv = filterCv === "needs_clarification" ? "all" : "needs_clarification";
    const cvSelect = $("#filter-cv");
    if (cvSelect) cvSelect.value = filterCv;
  } else if (key === "other_source") {
    filterCv = filterCv === "other_source" ? "all" : "other_source";
    const cvSelect = $("#filter-cv");
    if (cvSelect) cvSelect.value = filterCv;
  } else if (key === "pdf") {
    filterPathway = filterPathway === "pdf_completed" ? "all" : "pdf_completed";
    const pathwaySelect = $("#filter-pathway");
    if (pathwaySelect) pathwaySelect.value = filterPathway;
  } else if (key === "online") {
    filterPathway = filterPathway === "online" ? "all" : "online";
    const pathwaySelect = $("#filter-pathway");
    if (pathwaySelect) pathwaySelect.value = filterPathway;
  } else if (key === "email_only") {
    filterPathway = filterPathway === "email_only" ? "all" : "email_only";
    const pathwaySelect = $("#filter-pathway");
    if (pathwaySelect) pathwaySelect.value = filterPathway;
  } else if (key === "no_contact") {
    filterPathway = filterPathway === "no_contact" ? "all" : "no_contact";
    const pathwaySelect = $("#filter-pathway");
    if (pathwaySelect) pathwaySelect.value = filterPathway;
  } else if (key === "wrong_email") {
    quickWrongEmail = !quickWrongEmail;
  } else if (key === "invalid_email") {
    quickInvalidEmail = !quickInvalidEmail;
  } else if (key === "portal_errors") {
    quickPortalErrors = !quickPortalErrors;
  }
  applyFilters();
}

function updatePortalErrorAlert() {
  const alert = $("#portal-error-alert");
  const text = $("#portal-error-alert-text");
  portalErrorCount = cities.filter((city) => city.portal_error).length;
  if (!alert || !text) return;
  if (!portalErrorCount) {
    alert.hidden = true;
    return;
  }
  alert.hidden = false;
  text.textContent =
    portalErrorCount === 1
      ? "1 portal URL needs fixing"
      : `${portalErrorCount} portal URLs need fixing`;
}

async function toggleWrongEmailFlag(wrong) {
  if (!selectedId) return;
  const toggle = $("#detail-wrong-email");
  if (toggle) toggle.disabled = true;
  try {
    const data = await postJson(`/api/portal/city/${selectedId}/contact-email-wrong`, { wrong });
    applyCityUpdate(data.city);
    showMsg(
      wrong
        ? "Email marked wrong — all sends blocked until you update the address."
        : "Wrong-email flag cleared.",
      true
    );
  } catch (err) {
    showMsg(err.message, false);
    if (toggle) toggle.checked = !wrong;
  } finally {
    if (toggle) toggle.disabled = false;
  }
}

function applyFilters() {
  const items = filteredCities();
  updateFilterActiveIndicator();
  updateQuickChipStates();
  updateFilterCount(items);
  renderList();
  scheduleUrlSync();
}

function setFilterPanelOpen(open) {
  const trigger = $("#portal-filter-trigger");
  const panel = $("#portal-filter-panel");
  if (!trigger || !panel) return;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  panel.hidden = !open;
  if (open) {
    $("#search-input")?.focus();
  }
}

function bindFilterMenu() {
  const menu = $("#portal-filter-menu");
  const trigger = $("#portal-filter-trigger");
  const panel = $("#portal-filter-panel");
  if (!menu || !trigger || !panel) return;

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = trigger.getAttribute("aria-expanded") === "true";
    setFilterPanelOpen(!open);
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    setFilterPanelOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setFilterPanelOpen(false);
  });
}

function bindEvents() {
  bindFilterMenu();
  bindCityListKeyboard();

  $("#search-input")?.addEventListener("input", (e) => {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      search = e.target.value;
      applyFilters();
    }, 200);
  });
  $("#city-list")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      void loadCityDetail(selectedId, { force: false });
    }
  });
  $("#filter-state")?.addEventListener("change", (e) => {
    filterState = e.target.value;
    applyFilters();
  });
  $("#filter-pathway")?.addEventListener("change", (e) => {
    filterPathway = e.target.value;
    applyFilters();
  });
  $("#filter-cv")?.addEventListener("change", (e) => {
    filterCv = e.target.value;
    applyFilters();
  });
  $("#portal-filter-clear")?.addEventListener("click", clearAllFilters);
  $("#portal-filter-chips")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-quick]");
    if (!chip) return;
    e.stopPropagation();
    toggleQuickFilter(chip.dataset.quick);
  });
  $("#btn-submit-online").addEventListener("click", submitOnlineForm);
  $("#btn-send-apology")?.addEventListener("click", sendApologyEmail);
  $("#btn-send-email").addEventListener("click", openEmailConfirmDialog);
  $("#email-confirm-deny")?.addEventListener("click", closeEmailConfirmDialog);
  $("#email-confirm-approve")?.addEventListener("click", executeSendEmailToCity);
  $("#email-confirm-dialog")?.addEventListener("cancel", closeEmailConfirmDialog);
  $("#portal-request-pdfs-btn")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  $("#portal-submit-portals-btn")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  $("#detail-wrong-email")?.addEventListener("change", (e) => {
    void toggleWrongEmailFlag(e.target.checked);
  });
  $("#btn-record-response").addEventListener("click", openResponseDialog);
  $("#response-status")?.addEventListener("change", toggleOtherContactFields);
  $("#response-form").addEventListener("submit", saveResponse);
  $("#response-cancel").addEventListener("click", () => $("#response-dialog").close());
  $("#pdf-thumb-card")?.addEventListener("click", openPdfPreview);
  $("#btn-preview-pdf")?.addEventListener("click", openPdfPreview);
  $("#pdf-dialog-close")?.addEventListener("click", closePdfPreview);
  $("#pdf-preview-dialog")?.addEventListener("close", closePdfPreview);
}

async function openCityFromQuery(cityIdOverride = null) {
  const cityId =
    cityIdOverride || pendingCityFromUrl || new URLSearchParams(window.location.search).get("city");
  if (!cityId) return;
  const visible = filteredCities();
  if (visible.some((c) => c.id === cityId)) {
    syncingUrl = true;
    await selectCity(cityId);
    syncingUrl = false;
    scrollSelectedCityIntoView();
    return;
  }
  if (cities.some((c) => c.id === cityId)) {
    clearAllFilters();
    syncingUrl = true;
    await selectCity(cityId);
    syncingUrl = false;
    scrollSelectedCityIntoView();
  }
}

async function init() {
  document.body.dataset.portalReady = "0";
  captureCityFromUrl();
  bindEvents();
  window.addEventListener("portal-workflow-updated", (event) => {
    const detail = event.detail || {};
    if (detail.onlineDelta) {
      adjustPendingOnlineBadge(detail.onlineDelta);
    }
    if (detail.refreshBadges || detail.onlineDelta === undefined || detail.portalErrorDelta) {
      scheduleWorkflowBadgeRefresh();
      void fetchPortalErrorCount();
    }
    void fetch("/api/portal/kpi")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          submissionKpi = data;
          renderSubmissionKpi();
        }
      });
  });
  await refresh();
  await fetchPortalErrorCount();
  populateStateFilter();
  readFiltersFromUrl();
  applyFilters();
  await openCityFromQuery(pendingCityFromUrl);
  pendingCityFromUrl = null;
  urlSyncEnabled = true;
  syncUrlFromFilters();
  document.body.dataset.portalReady = "1";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}