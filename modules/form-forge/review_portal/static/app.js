let forms = [];
let saveLocations = null;
let currentId = null;
let filter = "all";
let defaults = {};
let elements = [];
let selectedId = null;
let editingId = null;
let pdfDoc = null;
let pdfScale = 1.35;
const PAGE_LABEL_H = 28;
let pageMetrics = [];
let carryState = null;
let resizeState = null;
let pickerOpen = false;
let editorMode = "edit";
let signatureVersion = Date.now();
let sigPadReady = false;
let uid = 0;
let dirty = false;
let draftTimer = null;
let currentFormMeta = null;
let officeBoundaries = {};
let undoStack = [];
let dragMoveState = null;
let openFormToken = 0;
let loadInFlight = null;
let pdfRenderToken = 0;
const SNAP_PX = 8;
const DRAFT_PREFIX = "formforge-draft-";
const DRAFT_PURGE_KEY = "formforge-draft-purged";
const DRAFT_PURGE_VERSION = "5";
const QUICK_FILL_KINDS = ["date", "name", "fulladdress", "phone", "email", "text", "signature"];
const CHECKLIST_FIELDS = [
  { key: "date", label: "Date", test: (el) => el.type === "date" || el.label === "Date" },
  { key: "name", label: "Name", test: (el) => el.label === "Name" },
  { key: "address", label: "Address", test: (el) => ["Street", "Street Address", "Full Address", "City", "City, State Zip"].includes(el.label) },
  { key: "request", label: "Request", test: (el) => el.label === "Request" },
  { key: "signature", label: "Signature", test: (el) => el.type === "signature" },
];

const DEFAULT_REQUEST_TEXT =
  "I am requesting information about any code violations related to tall grass and trash/debris over the past 30 days.";
const CUSTOM_PLACEHOLDER = "Custom text here";
const DEFAULT_SIG = { width: 130, height: 28 };
const MAX_SIG = { width: 220, height: 70 };

const $ = (s) => document.querySelector(s);
const listEl = $("#form-list");
const workspace = $("#workspace");
const statsEl = $("#stats");

/** When Records Desk is embedded under Distress OS (/forge), API + file URLs must be prefixed. */
function modulePrefix() {
  if (typeof window !== "undefined" && window.__DISTRESS_OS_MODULE_PREFIX__) {
    return String(window.__DISTRESS_OS_MODULE_PREFIX__).replace(/\/$/, "");
  }
  const p = (typeof location !== "undefined" && location.pathname) || "";
  if (p === "/forge" || p.startsWith("/forge/")) return "/forge";
  return "";
}

function withModulePrefix(path) {
  if (!path || typeof path !== "string") return path;
  if (/^https?:\/\//i.test(path) || path.startsWith("//")) return path;
  const prefix = modulePrefix();
  if (!prefix) return path;
  if (path === prefix || path.startsWith(prefix + "/")) return path;
  return path.startsWith("/") ? prefix + path : `${prefix}/${path}`;
}

function normalizeSignatureSize(width, height, pageMetric) {
  const w = width || DEFAULT_SIG.width;
  const h = height || DEFAULT_SIG.height;
  if (!pageMetric || w <= 0 || h <= 0 || w > MAX_SIG.width || h > MAX_SIG.height ||
      w > pageMetric.displayWidth * 0.35 || h > pageMetric.displayHeight * 0.12) {
    return { ...DEFAULT_SIG };
  }
  return { width: w, height: h };
}

function fullAddressStr() {
  const street = defaults.street || "";
  const city = defaults.city || "";
  const state = defaults.state || "";
  const zip = defaults.zip || "";
  if (street && city) return `${street}, ${city}, ${state} ${zip}`.trim();
  return defaults.full_address || "";
}

function cityStateZipStr() {
  const city = defaults.city || "";
  const state = defaults.state || "";
  const zip = defaults.zip || "";
  if (!city) return "";
  const tail = [state, zip].filter(Boolean).join(" ");
  return tail ? `${city}, ${tail}` : city;
}

function pdfYFromElement(el) {
  const m = pageMetrics[el.page];
  if (!m) return 0;
  return (el.yPx / m.displayHeight) * m.height;
}

function isInOfficeZone(el) {
  const cutoff = officeBoundaries[el.page];
  if (cutoff == null) return false;
  return pdfYFromElement(el) >= cutoff - 2;
}

function filterOfficeElements(els) {
  if (!els?.length || !Object.keys(officeBoundaries).length) return els;
  return els.filter((el) => !isInOfficeZone(el));
}

function defaultTextForLabel(label) {
  switch (label) {
    case "Date": return todayStr();
    case "Name": return defaults.name || "";
    case "Phone": return defaults.phone || "";
    case "Email": return defaults.email || "";
    case "Street":
    case "Street Address": return defaults.street || "";
    case "City": return defaults.city || "";
    case "State": return defaults.state || "";
    case "Zip": return defaults.zip || "";
    case "Full Address": return fullAddressStr();
    case "City, State Zip": return cityStateZipStr();
    case "Request":
    case "Request Text":
      return defaults.request_text || DEFAULT_REQUEST_TEXT;
    case "Reason": return defaults.reason || "Personal Research";
    case "Last 30 Days": return defaults.last_30_days_text || "The Last 30 Days";
    case "Signature": return defaults.signature_name || defaults.name || "";
    default: return null;
  }
}

/** Fill preset fields from Your Info — only touches fields the user has not edited yet. */
function applyDefaultsToElements(els) {
  if (!els?.length) return els;
  return filterOfficeElements(els).map((el) => {
    if (el.userEdited) return el;
    if (el.type === "signature") {
      const text = defaultTextForLabel("Signature");
      return text ? { ...el, text } : el;
    }
    if (el.type === "date") return { ...el, text: todayStr() };
    if (el.type === "text" && !isCustomField(el) && el.label !== "N/A") {
      const text = defaultTextForLabel(el.label);
      if (text != null) return fitTextBoxToContent({ ...el, text });
    }
    return el;
  });
}

function markUserEdited(el) {
  if (el) el.userEdited = true;
}

const FIELD_GROUPS = [
  {
    id: "sign-date",
    label: "Signature & Date",
    layout: "row",
    fields: [
      { kind: "signature", label: "Signature" },
      { kind: "date", label: "Date" },
    ],
  },
  {
    id: "contact",
    label: "Name & Contact",
    fields: [
      { kind: "name", label: "Name" },
      { kind: "phone", label: "Phone" },
      { kind: "email", label: "Email" },
    ],
  },
  {
    id: "address",
    label: "Address",
    fields: [
      { kind: "fulladdress", label: "Full Address" },
      { kind: "street", label: "Street Address" },
      { kind: "citystatezip", label: "City, State Zip" },
      { kind: "city", label: "City" },
      { kind: "state", label: "State" },
      { kind: "zip", label: "Zip" },
    ],
  },
  {
    id: "request",
    label: "Request",
    fields: [
      { kind: "text", label: "Request Text" },
      { kind: "reason", label: "Reason" },
      { kind: "last30", label: "Last 30 Days" },
    ],
  },
  {
    id: "other",
    label: "Other",
    fields: [
      { kind: "custom", label: "Custom Text" },
      { kind: "na", label: "N/A" },
      { kind: "checkbox", label: "Checkbox" },
    ],
  },
];

const FIELD_OPTIONS = FIELD_GROUPS.flatMap((g) => [...g.fields, ...(g.more || [])]);

const REPEATABLE_FIELD_KINDS = new Set(["date", "name", "custom", "checkbox"]);

const LABEL_TO_KIND = {
  Date: "date",
  Name: "name",
  Phone: "phone",
  Email: "email",
  Street: "street",
  "Street Address": "street",
  "Full Address": "fulladdress",
  "City, State Zip": "citystatezip",
  City: "city",
  State: "state",
  Zip: "zip",
  Request: "text",
  "Request Text": "text",
  Reason: "reason",
  "Last 30 Days": "last30",
  "N/A": "na",
  Signature: "signature",
  Check: "checkbox",
};

function elementFieldKind(el) {
  if (!el) return null;
  if (el.type === "checkbox") return "checkbox";
  if (el.type === "signature") return "signature";
  if (el.type === "date") return "date";
  if (isCustomField(el)) return "custom";
  return LABEL_TO_KIND[el.label] || null;
}

function placedFieldKinds() {
  const kinds = new Set();
  for (const el of elements) {
    const kind = elementFieldKind(el);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function isFieldKindAvailable(kind) {
  if (REPEATABLE_FIELD_KINDS.has(kind)) return true;
  return !placedFieldKinds().has(kind);
}

function todayStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function newId() { return `el-${++uid}`; }
function signatureImgSrc() { return `/api/signature.png?v=${signatureVersion}`; }

function ensureElementIds(els) {
  const seen = new Set();
  for (const el of els) {
    if (!el.id || seen.has(el.id)) el.id = newId();
    seen.add(el.id);
  }
  return els;
}

function nextCustomLabel() {
  const count = elements.filter(isCustomField).length + 1;
  return `Custom ${count}`;
}

function markDirty() {
  dirty = true;
  scheduleDraftSave();
}

function scheduleDraftSave() {
  if (!currentId || editorMode !== "edit") return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(currentId), 800);
}

function saveDraft(formId) {
  if (!formId || !elements.length) return;
  try {
    localStorage.setItem(DRAFT_PREFIX + formId, JSON.stringify({ elements, savedAt: Date.now() }));
    const pill = document.getElementById("autosave-pill");
    if (pill) {
      pill.hidden = false;
      clearTimeout(pill._hide);
      pill._hide = setTimeout(() => { pill.hidden = true; }, 2000);
    }
  } catch (_) { /* storage full */ }
}

function loadDraft(formId) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + formId);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.elements || null;
  } catch (_) { return null; }
}

function clearDraft(formId) {
  try { localStorage.removeItem(DRAFT_PREFIX + formId); } catch (_) {}
  dirty = false;
}

/** Drop browser drafts for cities not stamped/saved — removes stale auto-prefill overlays. */
function clearDraftsForUnsavedForms() {
  if (!forms?.length) return;
  const savedIds = new Set(forms.filter((f) => f.status === "completed").map((f) => f.id));
  let removed = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const formId = key.slice(DRAFT_PREFIX.length);
      if (!savedIds.has(formId)) {
        localStorage.removeItem(key);
        removed++;
      }
    }
    localStorage.setItem(DRAFT_PURGE_KEY, DRAFT_PURGE_VERSION);
  } catch (_) { /* private browsing */ }
  return removed;
}

function overlayCoordsFromClient(cx, cy, rect, _el, pointerOffset = { x: 0, y: 0 }) {
  return {
    xPx: Math.max(0, cx - rect.left - pointerOffset.x),
    yPx: Math.max(0, cy - rect.top - pointerOffset.y),
  };
}

function overlayCoordsFromGhost(overlay, ghost) {
  const rect = overlay.getBoundingClientRect();
  const g = ghost.getBoundingClientRect();
  return {
    xPx: Math.max(0, g.left - rect.left),
    yPx: Math.max(0, g.top - rect.top),
  };
}

function snapPosition(xPx, yPx, page, excludeId, { enabled = false } = {}) {
  if (!enabled) return { xPx, yPx, snapped: false };
  let sx = xPx, sy = yPx;
  const others = elements.filter((e) => e.page === page && e.id !== excludeId);
  for (const o of others) {
    if (Math.abs(o.xPx - xPx) <= SNAP_PX) sx = o.xPx;
    if (Math.abs(o.yPx - yPx) <= SNAP_PX) sy = o.yPx;
    const ow = o.widthPx || (o.type === "signature" ? o.width : 0) || 0;
    const oh = o.heightPx || (o.type === "signature" ? o.height : 0) || 0;
    if (Math.abs((o.xPx + ow) - xPx) <= SNAP_PX) sx = o.xPx + ow;
    if (Math.abs((o.yPx + oh) - yPx) <= SNAP_PX) sy = o.yPx + oh;
  }
  return { xPx: sx, yPx: sy, snapped: sx !== xPx || sy !== yPx };
}

function updateProgress(s) {
  const total = s.total || 1;
  const done = s.completed || 0;
  const pct = Math.round((done / total) * 100);
  const ring = document.getElementById("progress-ring");
  const text = document.getElementById("progress-text");
  const pctEl = document.getElementById("progress-pct");
  const sub = document.getElementById("progress-sub");
  if (ring) ring.style.setProperty("--pct", pct);
  if (text) text.textContent = `${done} of ${total} stamped`;
  if (pctEl) pctEl.textContent = pct + "%";
  if (sub) sub.textContent = `${s.pending || 0} remaining`;
}

function playStampAnimation() {
  const stamp = document.getElementById("stamp-overlay");
  if (!stamp) return;
  stamp.classList.add("active");
  clearTimeout(stamp._t);
  stamp._t = setTimeout(() => stamp.classList.remove("active"), 1200);
}

function pushUndo() {
  if (!currentId || editorMode !== "edit") return;
  undoStack.push(JSON.stringify(elements));
  if (undoStack.length > 40) undoStack.shift();
  const undoBtn = document.getElementById("btn-undo");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
}

function undo() {
  if (!undoStack.length) return;
  elements = JSON.parse(undoStack.pop());
  selectedId = null;
  editingId = null;
  dirty = true;
  scheduleDraftSave();
  renderElements();
  renderProps();
  updateFieldChecklist();
  const undoBtn = document.getElementById("btn-undo");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
}

function updateFieldChecklist() {
  const panel = document.getElementById("field-checklist");
  if (!panel) return;
  const doneCount = CHECKLIST_FIELDS.filter((f) => elements.some(f.test)).length;
  panel.innerHTML = `
    <div class="checklist-head">
      <span class="checklist-title">Progress</span>
      <span class="checklist-count">${doneCount}/${CHECKLIST_FIELDS.length}</span>
    </div>
    <div class="checklist-pills">
      ${CHECKLIST_FIELDS.map((f) => {
        const ok = elements.some(f.test);
        return `<span class="check-pill${ok ? " done" : ""}" title="${esc(f.label)}">${ok ? "✓ " : ""}${esc(f.label)}</span>`;
      }).join("")}
    </div>`;
  refreshToolboxFields();
}

function refreshToolboxFields() {
  const container = document.querySelector(".field-groups");
  if (!container || editorMode !== "edit") return;
  container.innerHTML = toolGroupsHtml() || `<p class="toolbox-done">All one-time fields placed. You can still add Date, Name, Custom Text, or Checkbox.</p>`;
  bindToolboxDnD();
  document.querySelectorAll(".tool-btn[data-add]").forEach((btn) => {
    btn.onclick = () => startCarryNew(btn.dataset.add);
  });
}

function renderUpNext() {
  const card = document.getElementById("up-next-card");
  if (!card) return;
  const next = forms.find((f) => f.status === "pending" && f.raw_path);
  if (!next) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const cityEl = document.getElementById("up-next-city");
  if (cityEl) cityEl.textContent = `${next.city}, ${next.state}`;
  const goBtn = document.getElementById("up-next-go");
  if (goBtn) {
    goBtn.onclick = () => {
      if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
      openForm(next.id, { preferSaved: false });
    };
  }
}

function quickFill(f) {
  if (!f || editorMode !== "edit") return;
  showSaveMsg("Click the PDF or drag fields from the toolbox — your info is filled in when you place them.", "ok");
}

function initSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const settingsBtn = document.getElementById("btn-settings");
  const closeBtn = document.getElementById("settings-close");
  const saveBtn = document.getElementById("settings-save");
  if (!modal || !settingsBtn || !closeBtn || !saveBtn) return;

  const open = () => {
    $("#set-name").value = defaults.name || "";
    $("#set-phone").value = defaults.phone || "";
    $("#set-email").value = defaults.email || "";
    $("#set-street").value = defaults.street || "";
    $("#set-city").value = defaults.city || "";
    $("#set-state").value = defaults.state || "";
    $("#set-zip").value = defaults.zip || "";
    $("#set-request").value = defaults.request_text || DEFAULT_REQUEST_TEXT;
    $("#set-last30").value = defaults.last_30_days_text || "";
    $("#set-desktop").value = defaults.desktop_folder || "";
    $("#settings-msg").textContent = "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  };
  settingsBtn.onclick = open;
  closeBtn.onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  saveBtn.onclick = async (e) => {
    e.preventDefault();
    const msg = $("#settings-msg");
    msg.textContent = "Saving…";
    msg.className = "save-msg";
    saveBtn.disabled = true;
    const body = {
      name: $("#set-name").value,
      phone: $("#set-phone").value,
      email: $("#set-email").value,
      street: $("#set-street").value,
      city: $("#set-city").value,
      state: $("#set-state").value,
      zip: $("#set-zip").value,
      request_text: $("#set-request").value,
      last_30_days_text: $("#set-last30").value,
      paths: { desktop_folder: $("#set-desktop").value },
    };
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) {
        defaults = data.settings;
        if (currentId && editorMode === "edit" && elements.length) {
          elements = applyDefaultsToElements(elements);
          renderElements();
          renderProps();
          updateFieldChecklist();
        }
        msg.textContent = "Saved! Unedited fields picked up your new info.";
        msg.className = "save-msg ok";
        setTimeout(close, 700);
      } else {
        msg.textContent = data.error || `Save failed (${res.status})`;
        msg.className = "save-msg err";
      }
    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "Save failed — is the app still running?";
      msg.className = "save-msg err";
    } finally {
      saveBtn.disabled = false;
    }
  };
}

function initSignaturePad() {
  if (sigPadReady) return;
  const modal = document.getElementById("sig-modal");
  const canvas = document.getElementById("sig-canvas");
  const sigBtn = document.getElementById("btn-draw-signature");
  const sigClose = document.getElementById("sig-close");
  const sigClear = document.getElementById("sig-clear");
  const sigSave = document.getElementById("sig-save");
  const msg = document.getElementById("sig-msg");
  if (!modal || !canvas || !sigBtn || !sigClose || !sigClear || !sigSave) return;
  sigPadReady = true;
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let activePointer = null;

  function resizeCanvas() {
    const cssW = Math.min(480, canvas.parentElement?.clientWidth || 480);
    const cssH = Math.round(cssW * (140 / 480));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }

  function fillWhite() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }

  function canvasHasInk() {
    const { width, height } = canvas;
    if (!width || !height) return false;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return true;
    }
    return false;
  }

  function startStroke(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    drawing = true;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function extendStroke(e) {
    if (!drawing || e.pointerId !== activePointer) return;
    e.preventDefault();
    const p = canvasPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endStroke(e) {
    if (!drawing || (e.pointerId !== undefined && e.pointerId !== activePointer)) return;
    drawing = false;
    activePointer = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
  }

  canvas.addEventListener("pointerdown", startStroke);
  canvas.addEventListener("pointermove", extendStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  function openPad() {
    resizeCanvas();
    fillWhite();
    msg.textContent = "";
    msg.className = "save-msg";
    const img = new Image();
    img.onload = () => {
      fillWhite();
      const cssW = parseFloat(canvas.style.width) || 480;
      const cssH = parseFloat(canvas.style.height) || 140;
      ctx.drawImage(img, 0, 0, cssW, cssH);
    };
    img.onerror = () => fillWhite();
    img.src = signatureImgSrc();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closePad() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    drawing = false;
    activePointer = null;
  }

  sigBtn.onclick = openPad;
  sigClose.onclick = closePad;
  modal.addEventListener("click", (e) => { if (e.target === modal) closePad(); });
  modal.querySelector(".modal-card")?.addEventListener("click", (e) => e.stopPropagation());
  sigClear.onclick = () => { fillWhite(); msg.textContent = ""; msg.className = "save-msg"; };
  sigSave.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasHasInk()) {
      msg.textContent = "Draw your signature first.";
      msg.className = "save-msg err";
      return;
    }
    sigSave.disabled = true;
    msg.textContent = "Saving…";
    msg.className = "save-msg";
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/png") }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) {
        signatureVersion = Date.now();
        msg.textContent = "Signature saved!";
        msg.className = "save-msg ok";
        renderElements();
        setTimeout(closePad, 600);
      } else {
        msg.textContent = data.error || `Save failed (${res.status}). Is the app running?`;
        msg.className = "save-msg err";
      }
    } catch (err) {
      msg.textContent = err.message || "Save failed — is the app running?";
      msg.className = "save-msg err";
    } finally {
      sigSave.disabled = false;
    }
  };
}

function showListError(message) {
  if (!listEl) return;
  listEl.innerHTML = `<li class="list-error">${esc(message)}</li>`;
}

function showWorkspaceError(title, message, retryFn) {
  workspace.innerHTML = `<div class="empty-state miss-panel">
    <h2>${esc(title)}</h2>
    <p>${message}</p>
    ${retryFn ? `<button type="button" class="btn accent sm" id="ws-retry">Try again</button>` : ""}
    <p class="tip">If this keeps happening, run: <code>python run_review_portal.py</code></p>
  </div>`;
  document.getElementById("ws-retry")?.addEventListener("click", retryFn);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(withModulePrefix(url), { cache: "no-store", ...options });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.clone().json();
      detail = data.error || "";
    } catch (_) { /* not json */ }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res;
}

function destroyPdfDoc() {
  if (pdfDoc?.destroy) {
    try { pdfDoc.destroy(); } catch (_) { /* already destroyed */ }
  }
  pdfDoc = null;
}

async function load(options = {}) {
  const { reopen = true, reopenOptions = {} } = options;
  if (loadInFlight) await loadInFlight;
  loadInFlight = (async () => {
  showListError("Loading cities…");
  try {
    const [formsRes, defRes] = await Promise.all([
      apiFetch("/api/forms"),
      apiFetch("/api/settings"),
    ]);
    const data = await formsRes.json();
    defaults = await defRes.json();
    forms = Array.isArray(data.items) ? data.items : [];
    const purgeNeeded = localStorage.getItem(DRAFT_PURGE_KEY) !== DRAFT_PURGE_VERSION;
    const draftsCleared = clearDraftsForUnsavedForms();
    if (!forms.length) {
      showListError("No cities in queue. Run: python scripts/build_raw_editor_queue.py");
      renderStats(data.stats || {});
      return;
    }
    saveLocations = data.save_locations || null;
    renderStats(data.stats || {});
    renderList();
    if (purgeNeeded && draftsCleared > 0) {
      console.info(`Cleared ${draftsCleared} stale draft(s) on unsaved cities.`);
    }
    const openId = new URLSearchParams(location.search).get("open");
    if (openId && forms.some((f) => f.id === openId)) {
      await openForm(openId, { preferSaved: true, skipDirtyCheck: true });
    } else if (reopen && currentId) {
      await openForm(currentId, reopenOptions);
    }
  } catch (err) {
    console.error(err);
    showListError(
      (err.message || "Could not load cities") +
        ". Start the app with: python run_review_portal.py then open http://127.0.0.1:8787"
    );
    showWorkspaceError("Could not connect", esc(err.message || "Server not responding") + ".", () => load(options));
    updateProgress({ total: 0, completed: 0 });
  } finally {
    loadInFlight = null;
  }
  })();
  return loadInFlight;
}

function renderStats(s) {
  updateProgress(s);
  statsEl.innerHTML = `
    <div class="stat-pill"><strong>${s.pending || 0}</strong><span>To Do</span></div>
    <div class="stat-pill"><strong>${s.completed || 0}</strong><span>Done</span></div>
    <div class="stat-pill"><strong>${s.missing_pdf || 0}</strong><span>No PDF</span></div>`;
  renderUpNext();
}

function badge(item) {
  if (item.status === "completed") return '<span class="badge done">Done</span>';
  if (item.status === "missing_pdf") return '<span class="badge miss">No PDF</span>';
  return '<span class="badge flat">Edit</span>';
}

function renderList() {
  if (!listEl) return;
  if (!Array.isArray(forms)) { showListError("City list is broken — refresh the page."); return; }
  const searchEl = $("#search");
  const q = (searchEl?.value || "").toLowerCase();
  const filtered = forms.filter((f) => {
    const matchQ = !q || `${f.city} ${f.state}`.toLowerCase().includes(q);
    const matchF = filter === "all" || (filter === "pending" && f.status === "pending") ||
      (filter === "completed" && f.status === "completed") || (filter === "missing" && f.status === "missing_pdf");
    return matchQ && matchF;
  });
  const countEl = document.getElementById("list-count");
  if (countEl) countEl.textContent = `${filtered.length} shown`;

  const grouped = {};
  for (const f of filtered) {
    const st = f.state || "Other";
    if (!grouped[st]) grouped[st] = [];
    grouped[st].push(f);
  }
  const states = Object.keys(grouped).sort();

  listEl.innerHTML = states.map((st) => {
    const cities = grouped[st].map((f) =>
      `<li data-id="${f.id}" class="city-item ${f.id === currentId ? "active" : ""}">
        <span class="city">${esc(f.city)}</span>${badge(f)}
      </li>`).join("");
    return `<li class="state-group">
      <button type="button" class="state-toggle" data-state="${esc(st)}">
        ${esc(st)} <span class="state-count">${grouped[st].length}</span>
      </button>
      <ul class="state-cities">${cities}</ul>
    </li>`;
  }).join("");

  listEl.querySelectorAll(".state-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.classList.toggle("collapsed");
    });
  });
  listEl.querySelectorAll("li.city-item").forEach((li) => li.addEventListener("click", () => {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
    const item = forms.find((x) => x.id === li.dataset.id);
    openForm(li.dataset.id, { preferSaved: item?.status === "completed" });
  }));

  if (currentId) {
    const active = listEl.querySelector(`li.city-item[data-id="${currentId}"]`);
    if (active) {
      const toggle = active.closest(".state-group")?.querySelector(".state-toggle");
      if (toggle) toggle.classList.remove("collapsed");
    }
  }
}

function presetForKind(kind) {
  const presets = {
    date: { type: "date", text: todayStr(), label: "Date", widthPx: 90 },
    text: { type: "text", text: defaults.request_text || DEFAULT_REQUEST_TEXT, label: "Request", fontsize: 10 },
    custom: { type: "text", text: CUSTOM_PLACEHOLDER, label: "Custom", isCustom: true, fontsize: 10 },
    name: { type: "text", text: defaults.name || "", label: "Name", widthPx: 140 },
    phone: { type: "text", text: defaults.phone || "", label: "Phone", widthPx: 110 },
    email: { type: "text", text: defaults.email || "", label: "Email", widthPx: 240, fontsize: 9 },
    street: { type: "text", text: defaults.street || "", label: "Street Address", widthPx: 150 },
    city: { type: "text", text: defaults.city || "", label: "City", widthPx: 100 },
    state: { type: "text", text: defaults.state || "", label: "State", widthPx: 40 },
    zip: { type: "text", text: defaults.zip || "", label: "Zip", widthPx: 60 },
    citystatezip: { type: "text", text: cityStateZipStr(), label: "City, State Zip", widthPx: 180, fontsize: 10 },
    fulladdress: { type: "text", text: fullAddressStr(), label: "Full Address", widthPx: 280, fontsize: 10 },
    reason: { type: "text", text: defaults.reason || "Personal Research", label: "Reason", widthPx: 160, fontsize: 10 },
    na: { type: "text", text: "N/A", label: "N/A", widthPx: 48, fontsize: 10 },
    last30: {
      type: "text",
      text: defaults.last_30_days_text || "The Last 30 Days",
      label: "Last 30 Days",
      widthPx: 220,
      fontsize: 9,
    },
    checkbox: { type: "checkbox", text: "", label: "Check", checked: true, fontsize: 22, boxSizePx: CHECKBOX_SIZE_PX },
    signature: { type: "signature", text: defaults.signature_name || defaults.name || "", label: "Signature", width: 130, height: 28, fontsize: 10 },
  };
  const preset = presets[kind];
  return preset ? { ...preset } : undefined;
}

const TEXT_BOX_PAD_X = 8;
const TEXT_BOX_PAD_Y = 2;
const CUSTOM_GRIP_W = 16;
const CHECKBOX_SIZE_PX = 30;

function checkboxMark(checked) {
  return checked ? "X" : "";
}

function checkboxFontSize(boxPx) {
  return Math.max(14, Math.round((boxPx || CHECKBOX_SIZE_PX) * 0.72));
}
let _measureCanvas = null;

function textBoxLineHeight(fontsize) {
  return Math.ceil((fontsize || 10) * 1.2);
}

function measureTextWidth(text, fontsize) {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  ctx.font = `${fontsize || 10}px Helvetica, Arial, sans-serif`;
  const lines = String(text || " ").split("\n");
  return Math.max(...lines.map((line) => ctx.measureText(line || " ").width), 0);
}

/** Shrink height to content; auto-width Request text to end of line. */
function fitTextBoxToContent(el, opts = {}) {
  if (!isTextBox(el)) return el;
  const size = el.fontsize || 10;
  const lineH = textBoxLineHeight(size);
  const lines = String(el.text || "").split("\n");
  const lineCount = Math.max(1, lines.length);

  el.heightPx = Math.max(14, lineCount * lineH + TEXT_BOX_PAD_Y);

  const autoWidth = opts.autoWidth || isRequestField(el) || isCustomField(el);
  if (autoWidth) {
    el.widthPx = Math.max(40, Math.min(920, Math.ceil(measureTextWidth(el.text, size)) + TEXT_BOX_PAD_X));
  } else if (!el.widthPx) {
    el.widthPx = Math.max(40, Math.ceil(measureTextWidth(el.text || " ", size)) + TEXT_BOX_PAD_X);
  }
  return el;
}

function baseElement(preset) {
  const el = { id: newId(), page: 0, xPx: 40, yPx: 80, fontsize: 10, ...preset };
  if (isCustomField(el)) el.label = nextCustomLabel();
  if (isTextBox(el)) fitTextBoxToContent(el);
  return el;
}

function isTextBox(el) { return el && (el.type === "text" || el.type === "date"); }

function isCustomField(el) {
  return el && (el.isCustom === true || el.label === "Custom" || /^Custom \d+$/.test(el.label || ""));
}

function isRequestField(el) {
  return el && (el.label === "Request" || el.label === "Request Text");
}

function hasDragGrip(el) {
  return isCustomField(el) || isRequestField(el);
}

function layoutHasDragGrip(label) {
  return label === "Request" || label === "Request Text" || label === "Custom" || /^Custom \d+$/.test(label || "");
}

function isInlineEditableField(el) {
  return isCustomField(el) || isRequestField(el);
}

function isFieldActive(el) {
  if (!el?.id) return false;
  if (editingId) return el.id === editingId;
  return el.id === selectedId;
}

function bindGripFieldEditActivate(body, el) {
  if (!isInlineEditableField(el) || !body) return;
  body.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".inline-field-edit")) return;
    if (editingId !== el.id) {
      e.stopPropagation();
      beginInlineTextEdit(el.id);
    }
  });
}

function createCustomDragGrip() {
  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "field-drag-handle";
  grip.title = "Drag to move";
  grip.setAttribute("aria-label", "Drag to move");
  grip.textContent = "⋮⋮";
  grip.addEventListener("click", (e) => e.stopPropagation());
  return grip;
}

function gripNodeWidth(el) {
  const textW = el.widthPx || 120;
  return hasDragGrip(el) ? textW + CUSTOM_GRIP_W : textW;
}

function attachInlineTextarea(body, el, node) {
  node.classList.add("editing");
  const ta = document.createElement("textarea");
  ta.className = "inline-field-edit";
  ta.dataset.inlineEdit = el.id;
  ta.value = isPlaceholderText(el) ? "" : el.text;
  ta.placeholder = "Type your text…";
  ta.style.fontSize = el.fontsize + "px";
  ta.addEventListener("mousedown", (e) => e.stopPropagation());
  ta.addEventListener("click", (e) => e.stopPropagation());
  ta.addEventListener("input", () => {
    if (isCustomField(el)) el.text = ta.value.trim() ? ta.value : CUSTOM_PLACEHOLDER;
    else el.text = ta.value;
    markUserEdited(el);
    fitTextBoxToContent(el, { autoWidth: true });
    node.style.width = gripNodeWidth(el) + "px";
    node.style.height = el.heightPx + "px";
    if (isCustomField(el)) node.classList.toggle("placeholder", isPlaceholderText(el));
    markDirty();
  });
  ta.addEventListener("blur", () => {
    if (editingId === el.id) endInlineTextEdit(true);
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); endInlineTextEdit(true); }
    e.stopPropagation();
  });
  body.appendChild(ta);
}

function focusInlineEditor(elId) {
  const node = document.querySelector(`.draggable[data-id="${CSS.escape(elId)}"]`);
  const input = node?.querySelector(".inline-field-edit");
  if (!input || editingId !== elId) return;
  input.focus();
  const el = elements.find((e) => e.id === elId);
  if (el && isCustomField(el)) input.setSelectionRange(input.value.length, input.value.length);
  else input.select();
}

function isPlaceholderText(el) {
  return isCustomField(el) && (!el.text || el.text === CUSTOM_PLACEHOLDER);
}

function beginInlineTextEdit(elId) {
  if (editorMode !== "edit") return;
  cancelCarry();
  if (editingId && editingId !== elId) endInlineTextEdit(true);
  editingId = elId;
  selectedId = elId;
  renderElements();
  renderProps();
  requestAnimationFrame(() => focusInlineEditor(elId));
}

function endInlineTextEdit(commit = true) {
  const endingId = editingId;
  if (!endingId) return;
  editingId = null;
  const el = elements.find((e) => e.id === endingId);
  const node = document.querySelector(`.draggable[data-id="${CSS.escape(endingId)}"]`);
  const input = node?.querySelector(".inline-field-edit");
  if (commit && el && input) {
    const val = input.value.trim();
    if (isCustomField(el)) el.text = val || CUSTOM_PLACEHOLDER;
    else el.text = val;
    markUserEdited(el);
    fitTextBoxToContent(el, { autoWidth: isRequestField(el) || isCustomField(el) });
    markDirty();
  }
  renderElements();
  renderProps();
}

function maybeAutoEditCustom(el) {
  if (isCustomField(el)) selectElement(el.id);
}

function applyGhostStyle(ghost, elOrPreset) {
  if (!ghost || !elOrPreset) return;
  ghost.className = "carry-ghost";
  if (elOrPreset.label === "Request") ghost.classList.add("request-text");
  if (isTextBox(elOrPreset)) ghost.classList.add("text-box");
  ghost.style.fontSize = (elOrPreset.fontsize || 10) + "px";

  if (elOrPreset.type === "signature") {
    ghost.style.width = (elOrPreset.width || 130) + "px";
    ghost.style.height = (elOrPreset.height || 28) + "px";
    ghost.textContent = elOrPreset.label || "Signature";
    return;
  }
  if (elOrPreset.type === "checkbox") {
    const sz = elOrPreset.boxSizePx || CHECKBOX_SIZE_PX;
    ghost.style.width = sz + "px";
    ghost.style.height = sz + "px";
    ghost.style.fontSize = checkboxFontSize(sz) + "px";
    ghost.textContent = checkboxMark(elOrPreset.checked);
    return;
  }
  if (isTextBox(elOrPreset)) {
    const sized = elOrPreset.id ? elOrPreset : fitTextBoxToContent({ ...elOrPreset });
    const grip = hasDragGrip(elOrPreset) ? CUSTOM_GRIP_W : 0;
    ghost.style.width = ((sized.widthPx || 120) + grip) + "px";
    ghost.style.height = (sized.heightPx || 14) + "px";
    ghost.textContent = sized.text || sized.label || "";
    if (isCustomField(elOrPreset)) ghost.classList.add("custom-text");
    if (isRequestField(elOrPreset)) ghost.classList.add("request-text");
    return;
  }
  ghost.style.width = "";
  ghost.style.height = "";
  ghost.textContent = elOrPreset.text || elOrPreset.label || "";
}

function fieldBtnHtml(f, { compact = false } = {}) {
  if (!isFieldKindAvailable(f.kind)) return "";
  const cls = ["tool-btn", f.featured ? "featured" : "", compact ? "compact" : ""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-add="${f.kind}" draggable="true" title="Drag onto PDF or click to carry">${esc(f.label)}</button>`;
}

function toolGroupsHtml() {
  return FIELD_GROUPS.map((group) => {
    const available = group.fields.filter((f) => isFieldKindAvailable(f.kind));
    const moreAvailable = (group.more || []).filter((f) => isFieldKindAvailable(f.kind));
    if (!available.length && !moreAvailable.length) return "";
    const btns = available.map((f) => fieldBtnHtml(f, { compact: group.layout === "row" })).join("");
    const more = moreAvailable.length
      ? `<details class="field-group-more">
          <summary>Split into city · state · zip</summary>
          <div class="field-group-list">${moreAvailable.map((f) => fieldBtnHtml(f)).join("")}</div>
        </details>`
      : "";
    return `<section class="field-group field-group-${group.id}">
      <h4 class="field-group-label">${esc(group.label)}</h4>
      <div class="field-group-list ${group.layout === "row" ? "is-row" : ""}">${btns}</div>
      ${more}
    </section>`;
  }).filter(Boolean).join("");
}

function pickerGroupsHtml() {
  const groups = FIELD_GROUPS.map((group) => {
    const all = [...group.fields, ...(group.more || [])].filter((f) => isFieldKindAvailable(f.kind));
    if (!all.length) return "";
    return `<div class="picker-group">
      <div class="picker-group-label">${esc(group.label)}</div>
      <div class="picker-group-grid">${all.map((f) =>
        `<button type="button" class="picker-btn${f.featured ? " featured" : ""}" data-kind="${f.kind}">${esc(f.label)}</button>`
      ).join("")}</div>
    </div>`;
  }).filter(Boolean);
  if (!groups.length) {
    return `<p class="picker-empty">All one-time fields are on the form. Remove one to add it again, or add Date, Name, Custom Text, or Checkbox.</p>`;
  }
  return groups.join("");
}

function bindToolboxDnD() {
  document.querySelectorAll(".tool-btn[data-add]").forEach((btn) => {
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", btn.dataset.add);
      e.dataTransfer.effectAllowed = "copy";
    });
  });
}

function bindOverlayDnD(overlay) {
  overlay.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    overlay.classList.add("drag-over");
  });
  overlay.addEventListener("dragleave", () => overlay.classList.remove("drag-over"));
  overlay.addEventListener("drop", (e) => {
    e.preventDefault();
    overlay.classList.remove("drag-over");
    if (editorMode !== "edit") return;
    const moveId = e.dataTransfer.getData("application/x-field-move");
    const kind = e.dataTransfer.getData("text/plain");
    if (moveId) {
      pushUndo();
      moveFieldTo(moveId, e.clientX, e.clientY);
      return;
    }
    if (kind && isFieldKindAvailable(kind)) {
      pushUndo();
      placeFieldAt(kind, e.clientX, e.clientY);
    }
  });
}

function moveFieldTo(fieldId, cx, cy) {
  const el = elements.find((e) => e.id === fieldId);
  if (!el) return;
  const overlay = overlayAtPoint(cx, cy);
  if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  const page = +overlay.dataset.page;
  const { xPx, yPx } = overlayCoordsFromClient(cx, cy, rect);
  const snapped = snapPosition(xPx, yPx, page, el.id);
  el.page = page;
  el.xPx = snapped.xPx;
  el.yPx = snapped.yPx;
  selectedId = el.id;
  markDirty();
  renderElements();
  renderProps();
  updateFieldChecklist();
}

function bindFieldDrag(node, el, overlay) {
  node.addEventListener("pointerdown", (e) => {
    if (editorMode !== "edit") return;
    if (e.button !== 0) return;
    if (e.target.closest(".resize-handle, .field-delete-btn, .inline-field-edit")) return;
    const fromGrip = !!e.target.closest(".field-drag-handle");
    if (hasDragGrip(el) && !e.shiftKey && !fromGrip) return;
    if (editingId === el.id && !fromGrip && !e.shiftKey) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = fromGrip || e.shiftKey;
    const threshold = dragging ? 0 : 5;

    if (dragging) {
      e.preventDefault();
      if (editingId === el.id) endInlineTextEdit(true);
      pushUndo();
      selectedId = el.id;
      node.setPointerCapture?.(e.pointerId);
    }

    function onMove(ev) {
      if (!dragging && (Math.abs(ev.clientX - startX) > threshold || Math.abs(ev.clientY - startY) > threshold)) {
        dragging = true;
        if (editingId === el.id) endInlineTextEdit(true);
        pushUndo();
        selectedId = el.id;
        node.setPointerCapture?.(ev.pointerId);
      }
      if (!dragging) return;
      ev.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const { xPx, yPx } = overlayCoordsFromClient(ev.clientX, ev.clientY, rect);
      const snapped = snapPosition(xPx, yPx, el.page, el.id);
      el.xPx = snapped.xPx;
      el.yPx = snapped.yPx;
      node.style.left = el.xPx + "px";
      node.style.top = el.yPx + "px";
      markDirty();
    }

    function onUp(ev) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      node.releasePointerCapture?.(ev.pointerId);
      if (dragging) {
        node.dataset.wasDragged = "1";
        renderElements();
        renderProps();
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function layoutToScreenElements(layoutEls, { userEdited = true } = {}) {
  return layoutEls.map((el) => {
    const m = pageMetrics[el.page];
    if (!m) return null;
    const textLeftPx = (el.x / m.width) * m.displayWidth;
    const screen = {
      id: newId(), page: el.page,
      xPx: textLeftPx - (layoutHasDragGrip(el.label) ? CUSTOM_GRIP_W : 0),
      yPx: (el.y / m.height) * m.displayHeight,
      fontsize: el.fontsize || 10, type: el.type, text: el.text || "", label: el.label, checked: el.checked,
      userEdited,
    };
    if (el.box_width) screen.widthPx = (el.box_width / m.width) * m.displayWidth;
    if (el.box_height) screen.heightPx = (el.box_height / m.height) * m.displayHeight;
    if (el.type === "signature") {
      const norm = normalizeSignatureSize((el.width / m.width) * m.displayWidth, (el.height / m.height) * m.displayHeight, m);
      screen.width = norm.width; screen.height = norm.height;
      if (el.x <= 2 && el.y <= 2) return null;
    }
    if (el.type === "checkbox" && el.box_size) screen.boxSizePx = (el.box_size / m.width) * m.displayWidth;
    if (isTextBox(screen)) { screen.widthPx = screen.widthPx || 120; screen.heightPx = screen.heightPx || 28; }
    return screen;
  }).filter(Boolean);
}

function draftToScreenElements(draftEls) {
  return draftEls.map((el) => ({ ...el, id: el.id || newId(), userEdited: true }));
}

async function loadLayoutForEdit(formId) {
  const form = forms.find((f) => f.id === formId);
  const isSaved = form?.status === "completed";

  if (!isSaved) {
    clearDraft(formId);
    elements = [];
    renderElements();
    return false;
  }

  const draft = loadDraft(formId);
  if (draft && draft.length) {
    elements = applyDefaultsToElements(filterOfficeElements(draftToScreenElements(draft)));
    renderElements();
    showSaveMsg(`Restored <strong>${elements.length}</strong> fields from your draft.`, "ok");
    return true;
  }
  const res = await fetch(`/api/layout/${formId}`);
  if (!res.ok) return false;
  const data = await res.json();
  const restored = applyDefaultsToElements(filterOfficeElements(layoutToScreenElements(data.elements || [])));
  if (!restored.length) return false;
  elements = restored;
  renderElements();
  showSaveMsg(`Loaded <strong>${restored.length}</strong> saved field positions.`, "ok");
  return true;
}

async function tryAutofill(formId) {
  const res = await fetch(`/api/autofill/${formId}`);
  if (!res.ok) return;
  const data = await res.json();
  if (data.office_boundaries) officeBoundaries = data.office_boundaries;
  if (!data.elements?.length) return;
  const restored = applyDefaultsToElements(layoutToScreenElements(data.elements, { userEdited: false }));
  if (!restored.length) return;
  elements = restored;
  markDirty();
  renderElements();
  updateFieldChecklist();
  showSaveMsg(`Auto-placed <strong>${restored.length}</strong> fields with your info. Drag to adjust.`, "ok");
}

function showSaveMsg(html, cls) {
  const sm = document.getElementById("save-msg");
  if (sm) { sm.innerHTML = html; sm.className = "save-msg " + (cls || ""); }
}

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

function deskContactPanelHtml(form) {
  const email = form.contact_email || form.email || "";
  if (!email) return "";
  const checked = form.contact_email_wrong ? "checked" : "";
  const invalid = Boolean(form.contact_email_invalid);
  const emailLine = invalid
    ? `<p class="desk-contact-email invalid-email-value">${esc(email)}</p>`
    : `<p class="desk-contact-email"><a href="mailto:${esc(email)}">${esc(email)}</a></p>`;
  const note = form.contact_email_wrong
    ? '<p class="desk-wrong-email-note">Research a new address, then update it in City Tracker → Record Response.</p>'
    : "";
  const invalidNote = invalid
    ? '<p class="desk-invalid-email-note">Invalid email on file — fix via City Tracker → Record Response before sending.</p>'
    : "";
  return `
    <div class="desk-contact-panel">
      <h4>City contact email</h4>
      ${emailLine}
      <label class="wrong-email-toggle">
        <input type="checkbox" id="desk-wrong-email" ${checked} />
        <span>Mark email as wrong (blocks all sends)</span>
      </label>
      ${note}
      ${invalidNote}
    </div>`;
}

function bindDeskWrongEmailToggle(form) {
  const toggle = document.getElementById("desk-wrong-email");
  if (!toggle) return;
  toggle.onchange = async () => {
    const wrong = toggle.checked;
    toggle.disabled = true;
    try {
      const res = await fetch(`/api/portal/city/${form.id}/contact-email-wrong`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrong }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      form.contact_email_wrong = Boolean(data.contact_email_wrong);
      if (data.city?.tracking) form.tracking = data.city.tracking;
      if (data.city?.apology_email) form.apology_email = data.city.apology_email;
      showSaveMsg(
        wrong ? "Email marked wrong — all sends blocked until you update the address." : "Wrong-email flag cleared.",
        "ok"
      );
      const emailDeskBtn = document.getElementById("btn-send-email-desk");
      const emailSideBtn = document.getElementById("btn-send-email-desk-side");
      setEmailButtonState(emailDeskBtn, form.tracking);
      setEmailButtonState(emailSideBtn, form.tracking);
      const hint = document.getElementById("desk-email-hint");
      const blocked = form.tracking?.email?.blocked_reason || "";
      if (hint) {
        hint.textContent = blocked;
        hint.hidden = !blocked;
      }
    } catch (err) {
      toggle.checked = !wrong;
      showSaveMsg(err.message, "err");
    } finally {
      toggle.disabled = false;
    }
  };
}

function setEmailButtonState(button, tracking) {
  if (!button) return;
  const email = tracking?.email || {};
  button.classList.remove("status-sent", "status-blocked");
  if (!email.can_send) {
    const isWrong = email.state === "wrong_email";
    const isInvalid = email.state === "invalid_email";
    button.textContent = isWrong
      ? "Wrong email"
      : isInvalid
        ? "Invalid email"
        : email.sent_label || "Email Sent";
    button.disabled = true;
    button.classList.add(isWrong || isInvalid || email.state === "cooldown" ? "status-blocked" : "status-sent");
    button.title = email.blocked_reason || "";
    return;
  }
  button.textContent = "Send Email Request";
  button.disabled = false;
  button.title = "";
}

async function sendApologyFromDesk(form) {
  if (form.contact_email_wrong) {
    showSaveMsg("Contact email is marked wrong — update the address before sending.", "err");
    return;
  }
  if (!form.apology_email?.show_button) return;
  const recipient = form.contact_email || form.email || prompt("Recipient email:");
  if (!recipient) return;
  if (
    !confirm(
      `Send the corrected FOIA PDF with an apology to ${recipient}? This one-time button will disappear after sending.`
    )
  ) {
    return;
  }
  const btn =
    document.getElementById("btn-send-apology-desk") ||
    document.getElementById("btn-send-apology-desk-side");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }
  try {
    const res = await fetch(`/api/form/${form.id}/send-apology-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "code_violation",
        email: recipient,
        notes: "One-time apology resend from Records Desk",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email failed");
    const sentAt = data.event?.logged_at;
    showSaveMsg(sentAt ? `Apology email sent on ${formatDayDate(sentAt)}.` : "Apology email sent.", "ok");
    const detailRes = await fetch(`/api/form/${form.id}`);
    if (detailRes.ok) {
      currentFormMeta = await detailRes.json();
      openForm(form.id, { preferSaved: true, skipDirtyCheck: true });
    }
  } catch (err) {
    showSaveMsg(esc(err.message || "Email failed"), "err");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Send 3rd Email with Apology";
    }
  }
}

async function sendEmailFromDesk(form) {
  if (form.contact_email_wrong) {
    showSaveMsg("Contact email is marked wrong — update the address before sending.", "err");
    return;
  }
  const tracking = form.tracking || {};
  if (tracking.email && !tracking.email.can_send) {
    showSaveMsg(esc(tracking.email.blocked_reason || "Email send is not available yet."), "err");
    return;
  }
  const recipient = form.contact_email || form.email || prompt("Recipient email:");
  if (!recipient) return;
  if (!confirm(`Send the completed PDF to ${recipient}? The date field will be updated to today before sending.`)) {
    return;
  }
  const btn = document.getElementById("btn-send-email-desk");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }
  try {
    const res = await fetch(`/api/form/${form.id}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "code_violation",
        email: recipient,
        notes: "Sent from Records Desk",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email failed");
    const sentAt = data.event?.logged_at;
    showSaveMsg(sentAt ? `Email sent on ${formatDayDate(sentAt)}.` : "Email sent.", "ok");
    const detailRes = await fetch(`/api/form/${form.id}`);
    if (detailRes.ok) {
      currentFormMeta = await detailRes.json();
      setEmailButtonState(btn, currentFormMeta.tracking);
    }
  } catch (err) {
    showSaveMsg(esc(err.message || "Email failed"), "err");
    setEmailButtonState(btn, form.tracking);
  }
}

function nextPendingId(curId) {
  const idx = forms.findIndex((f) => f.id === curId);
  for (let i = idx + 1; i < forms.length; i++) if (forms[i].status === "pending" && forms[i].raw_path) return forms[i].id;
  for (let i = 0; i < idx; i++) if (forms[i].status === "pending" && forms[i].raw_path) return forms[i].id;
  return null;
}

async function openForm(id, options = {}) {
  if (!options.skipDirtyCheck && dirty && currentId && currentId !== id) {
    if (!confirm("You have unsaved changes. Leave anyway?")) return;
  }
  const token = ++openFormToken;
  cancelCarry(); closeFieldPicker();
  currentId = id; elements = []; selectedId = null; editingId = null; dirty = false;
  officeBoundaries = {};
  undoStack = [];
  renderList();

  let f;
  try {
    const res = await apiFetch(`/api/form/${id}`);
    f = await res.json();
  } catch (err) {
    console.error(err);
    if (token !== openFormToken) return;
    showWorkspaceError("Could not open form", esc(err.message || "Server not responding"), () => openForm(id, { ...options, skipDirtyCheck: true }));
    return;
  }
  if (token !== openFormToken) return;
  currentFormMeta = f;
  officeBoundaries = f.office_boundaries || {};
  const hasSaved = !!(f.user_filled_path && f.status === "completed");
  editorMode = options.preferSaved && hasSaved ? "saved" : "edit";
  const displayPath = editorMode === "saved" ? f.user_filled_path : f.raw_path;

  if (!f.raw_path) {
    const foiaUrl = f.url || f.portal_url || "";
    const canImport = !!foiaUrl;
    workspace.innerHTML = `<div class="empty-state miss-panel miss-panel--attach">
      <p class="miss-kicker">Records Desk</p>
      <h2>Attach the blank form</h2>
      <p class="miss-place"><strong>${esc(f.city)}</strong><span>${esc(f.state)}</span></p>
      <p class="tip miss-lead">${canImport
        ? "This city already has a FOIA PDF link. Attach it here so you can place fields and save — same as the original batch."
        : "No FOIA PDF URL on file. Upload a blank PDF to start filling."}</p>
      ${canImport ? `
      <div class="miss-primary">
        <button type="button" class="btn accent miss-primary-btn" id="btn-import-foia-pdf">Attach FOIA PDF</button>
        <p class="miss-hint" id="import-foia-hint">Fetches the city form and stores it as this city's blank.</p>
      </div>
      <div class="miss-secondary">
        <a href="${esc(foiaUrl)}" target="_blank" rel="noopener" class="btn ghost sm">Preview FOIA link</a>
        <label class="upload-blank-btn miss-upload"><span class="btn ghost sm">Upload blank instead</span><input type="file" id="upload-blank-pdf" accept=".pdf" /></label>
        <label class="upload-blank-btn miss-upload"><span class="btn ghost sm">Upload filled PDF</span><input type="file" id="upload-pdf-missing" accept=".pdf" /></label>
      </div>
      ` : `
      <div class="miss-primary">
        <label class="upload-blank-btn miss-upload-main"><span class="btn accent miss-primary-btn">Upload Blank PDF</span><input type="file" id="upload-blank-pdf" accept=".pdf" /></label>
        <label class="upload-blank-btn miss-upload"><span class="btn ghost sm">Upload filled PDF</span><input type="file" id="upload-pdf-missing" accept=".pdf" /></label>
      </div>
      `}
      <p class="save-msg" id="save-msg" hidden></p>
    </div>`;
    $("#upload-blank-pdf").onchange = (e) => uploadBlankPdf(f, e.target.files[0]);
    $("#upload-pdf-missing").onchange = (e) => uploadPdf(f, e.target.files[0]);
    const importBtn = $("#btn-import-foia-pdf");
    if (importBtn) {
      importBtn.onclick = () => importBlankFromFoiaUrl(f);
      // Direct .pdf links: attach automatically on open
      if (/\.pdf($|[?#])/i.test(foiaUrl)) {
        importBlankFromFoiaUrl(f, { auto: true });
      }
    }
    return;
  }

  const fillableBanner = f.fillable && editorMode === "edit" ? `
    <div class="fillable-banner">
      <span>This PDF has fillable fields (${f.field_count || "?"})</span>
      <button type="button" class="btn ghost sm" id="btn-autofill">Auto-place fields</button>
    </div>` : "";

  workspace.innerHTML = `
    <div class="editor-layout">
      <div class="pdf-panel">
        <div class="toolbar-top">
          ${editorMode === "edit" ? `
          <div class="command-bar">
            <button type="button" class="btn quick sm" id="btn-quick-fill">Quick Fill</button>
            <button type="button" class="btn ghost sm" id="btn-undo" disabled>Undo</button>
            ${f.fillable ? `<button type="button" class="btn ghost sm" id="btn-autofill-cmd">Autofill</button>` : ""}
            <span class="command-spacer"></span>
            <div class="zoom-controls">
              <button class="zoom-btn" id="zoom-out" title="Zoom out">−</button>
              <span class="zoom-label" id="zoom-label">${Math.round(pdfScale * 100)}%</span>
              <button class="zoom-btn" id="zoom-in" title="Zoom in">+</button>
            </div>
            <span class="command-divider"></span>
            <button type="button" class="btn seal sm" id="btn-save">Stamp &amp; Save</button>
            <button type="button" class="btn seal sm" id="btn-save-next">Save &amp; Next</button>
            ${hasSaved && f.apology_email?.show_button ? `<button type="button" class="btn apology sm" id="btn-send-apology-desk">Send 3rd Email with Apology</button>` : ""}
            ${hasSaved ? `<button type="button" class="btn ghost sm" id="btn-view-saved-top">View saved</button>` : ""}
            <p class="save-msg save-msg-inline" id="save-msg"></p>
          </div>
          ${fillableBanner}` : `
          <div class="command-bar">
            <button type="button" class="btn seal sm" id="btn-reedit">Edit Form</button>
            ${(f.url || f.portal_url) ? `<a class="btn ghost sm" href="${esc(f.url || f.portal_url)}" target="_blank" rel="noopener">FOIA PDF</a>` : ""}
            ${f.apology_email?.show_button ? `<button type="button" class="btn apology sm" id="btn-send-apology-desk">Send 3rd Email with Apology</button>` : ""}
            ${(f.contact_email || f.email) ? `<button type="button" class="btn ghost sm" id="btn-send-email-desk">Send Email Request</button>` : ""}
            <button type="button" class="btn ghost sm" id="btn-view-saved-top">View saved</button>
            <p class="save-msg save-msg-inline" id="save-msg"></p>
          </div>`}
          <div class="toolbar">
            <span class="page-hint" id="page-hint">Loading…</span>
            <span class="carry-hint" id="carry-hint"></span>
            ${hasSaved ? `<span class="view-badge ${editorMode}">${editorMode === "saved" ? "Viewing saved" : "Editing"}</span>` : ""}
          </div>
        </div>
        <div class="pdf-scroll-view" id="pdf-pages"></div>
      </div>
      <aside class="toolbox ${editorMode === "saved" ? "readonly-mode" : ""}">
        ${editorMode === "saved" ? `
        <h3>${esc(f.city)}, ${esc(f.state)}</h3>
        <p class="tip">Stamped to your Desktop and project folder. Click <strong>Edit Form</strong> to adjust.</p>
        ${deskContactPanelHtml(f)}
        ${(f.url || f.portal_url) ? `<a class="btn ghost sm" href="${esc(f.url || f.portal_url)}" target="_blank" rel="noopener">FOIA PDF</a>` : ""}
        ${(f.apology_email?.show_button || f.contact_email || f.email) ? `
        <div class="desk-email-actions">
          ${f.apology_email?.show_button ? `<button type="button" class="btn apology sm" id="btn-send-apology-desk-side">Send 3rd Email with Apology</button>` : ""}
          ${(f.contact_email || f.email) ? `<button type="button" class="btn seal sm" id="btn-send-email-desk-side">Send Email Request</button>` : ""}
          <p class="desk-email-hint" id="desk-email-hint"></p>
        </div>` : ""}
        ` : `
        <div class="toolbox-head">
          <h3>${esc(f.city)}, ${esc(f.state)}</h3>
          <p class="toolbox-hint">Click the PDF or drag a field below</p>
        </div>
        ${deskContactPanelHtml(f)}
        <div class="field-checklist" id="field-checklist"></div>
        <div class="field-groups">${toolGroupsHtml()}</div>
        <button class="btn ghost sm" id="btn-cancel-carry" style="display:none">Cancel placement (Esc)</button>
        <div class="props" id="props-panel"><h4>Selected field</h4><p class="none-selected">Click a placed field to edit size or text.</p></div>
        <div class="tool-actions">
          <button type="button" class="btn ghost sm" id="btn-draw-signature-inline">Draw Signature</button>
          <button class="btn danger sm" id="btn-delete" disabled>Remove Field</button>
          <p class="save-hint">Draft auto-saves · Stamp &amp; Save when ready</p>
        </div>`}
      </aside>
    </div>`;

  if (editorMode === "edit") {
    bindToolboxDnD();
    document.querySelectorAll("[data-add]").forEach((btn) => btn.onclick = () => startCarryNew(btn.dataset.add));
    document.getElementById("btn-quick-fill")?.addEventListener("click", () => quickFill(f));
    document.getElementById("btn-undo")?.addEventListener("click", undo);
    document.getElementById("btn-autofill-cmd")?.addEventListener("click", () => { pushUndo(); tryAutofill(f.id); });
    const sigBtn = document.getElementById("btn-draw-signature-inline");
    if (sigBtn) sigBtn.onclick = () => document.getElementById("btn-draw-signature").click();
    const cancelCarryBtn = document.getElementById("btn-cancel-carry");
    if (cancelCarryBtn) cancelCarryBtn.onclick = cancelCarry;
    const deleteBtn = document.getElementById("btn-delete");
    if (deleteBtn) deleteBtn.onclick = deleteSelected;
    bindSaveButtons();
    const uploadPdfInput = document.getElementById("upload-pdf");
    if (uploadPdfInput) uploadPdfInput.onchange = (e) => uploadPdf(f, e.target.files[0]);
    const autofillBtn = document.getElementById("btn-autofill");
    if (autofillBtn) autofillBtn.onclick = () => { pushUndo(); tryAutofill(f.id); };
    const zoomIn = document.getElementById("zoom-in");
    const zoomOut = document.getElementById("zoom-out");
    if (zoomIn) zoomIn.onclick = () => changeZoom(0.15);
    if (zoomOut) zoomOut.onclick = () => changeZoom(-0.15);
    updateFieldChecklist();
  }

  document.getElementById("btn-reedit")?.addEventListener("click", () => openForm(f.id, { preferSaved: false, skipDirtyCheck: true }));
  document.querySelectorAll("#btn-view-saved-top").forEach((btn) => btn.onclick = () => openForm(f.id, { preferSaved: true }));
  const apologyDeskBtn = document.getElementById("btn-send-apology-desk");
  const apologySideBtn = document.getElementById("btn-send-apology-desk-side");
  if (apologyDeskBtn) apologyDeskBtn.onclick = () => sendApologyFromDesk(f);
  if (apologySideBtn) apologySideBtn.onclick = () => sendApologyFromDesk(f);

  const emailDeskBtn = document.getElementById("btn-send-email-desk");
  const emailSideBtn = document.getElementById("btn-send-email-desk-side");
  bindDeskWrongEmailToggle(f);
  if (emailDeskBtn || emailSideBtn) {
    setEmailButtonState(emailDeskBtn, f.tracking);
    setEmailButtonState(emailSideBtn, f.tracking);
    const hint = document.getElementById("desk-email-hint");
    const blocked = f.tracking?.email?.blocked_reason || "";
    if (hint) {
      hint.textContent = blocked;
      hint.hidden = !blocked;
    }
    const sendHandler = () => sendEmailFromDesk(f);
    if (emailDeskBtn) emailDeskBtn.onclick = sendHandler;
    if (emailSideBtn) emailSideBtn.onclick = sendHandler;
  }

  try {
    const rendered = await renderPdf(displayPath, editorMode === "saved" || options.bustCache, token);
    if (!rendered || token !== openFormToken) return;

    if (editorMode === "edit") {
      await loadLayoutForEdit(f.id);
    }
    if (token !== openFormToken) return;
    if (options.savedMessage) showSaveMsg(options.savedMessage, "ok");
    if (editorMode === "saved") document.querySelectorAll(".overlay").forEach((ov) => { ov.style.pointerEvents = "none"; });
  } catch (err) {
    console.error(err);
    if (token !== openFormToken) return;
    showWorkspaceError("PDF failed to load", esc(err.message || "Could not render this PDF."), () => openForm(id, { ...options, skipDirtyCheck: true, bustCache: true }));
  }
}

async function changeZoom(delta) {
  pdfScale = Math.max(0.6, Math.min(2.5, pdfScale + delta));
  const label = document.getElementById("zoom-label");
  if (label) label.textContent = Math.round(pdfScale * 100) + "%";
  if (currentFormMeta) {
    const path = editorMode === "saved" ? currentFormMeta.user_filled_path : currentFormMeta.raw_path;
    const els = elements.map((e) => ({ ...e }));
    const token = openFormToken;
    const ok = await renderPdf(path, false, token);
    if (!ok || token !== openFormToken) return;
    elements = els;
    renderElements();
  }
}

async function renderPdf(rawPath, bustCache = false, formToken = openFormToken) {
  const wrap = $("#pdf-pages");
  if (!wrap) return false;
  const renderToken = ++pdfRenderToken;
  wrap.innerHTML = '<p class="loading-pdf">Loading pages…</p>';
  pageMetrics = [];
  destroyPdfDoc();
  const filePath = String(rawPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const url = withModulePrefix(`/api/file/${filePath}${bustCache ? `?t=${Date.now()}` : ""}`);
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(url).promise;
  } catch (err) {
    const detail = err?.message || "PDF file could not be loaded";
    throw new Error(
      detail.includes("Missing") || detail.includes("404")
        ? `Missing PDF at ${url}. Hard-refresh (Ctrl+Shift+R) or re-attach the FOIA PDF.`
        : detail
    );
  }
  if (renderToken !== pdfRenderToken || formToken !== openFormToken) {
    try { pdf.destroy(); } catch (_) {}
    return false;
  }
  pdfDoc = pdf;
  wrap.innerHTML = "";

  for (let n = 1; n <= pdf.numPages; n++) {
    if (renderToken !== pdfRenderToken || formToken !== openFormToken) return false;
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: pdfScale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    const layer = document.createElement("div");
    layer.className = "page-layer";
    layer.dataset.page = n - 1;
    layer.style.width = viewport.width + "px";
    const label = document.createElement("div");
    label.className = "page-label";
    label.textContent = `Page ${n} / ${pdf.numPages}`;
    layer.appendChild(label);
    layer.appendChild(canvas);
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.dataset.page = n - 1;
    overlay.style.top = PAGE_LABEL_H + "px";
    overlay.addEventListener("click", onOverlayClick);
    bindOverlayDnD(overlay);
    layer.appendChild(overlay);
    wrap.appendChild(layer);

    const overlayW = overlay.offsetWidth || viewport.width;
    const overlayH = overlay.offsetHeight || viewport.height;
    layer.style.height = PAGE_LABEL_H + overlayH + "px";
    pageMetrics[n - 1] = { width: viewport.width / pdfScale, height: viewport.height / pdfScale, displayWidth: overlayW, displayHeight: overlayH };
  }
  if (renderToken !== pdfRenderToken || formToken !== openFormToken) return false;
  $("#page-hint").textContent = `${pdf.numPages} pages — scroll down for more`;
  renderElements();
  return true;
}

function onOverlayClick(e) {
  if (e.target.closest(".draggable") || e.target.closest(".resize-handle") || e.target.closest(".inline-field-edit")) return;
  if (editingId) endInlineTextEdit(true);
  if (carryState) { dropAt(e.clientX, e.clientY); return; }
  showFieldPicker(e.clientX, e.clientY);
}

function renderElements() {
  ensureElementIds(elements);
  document.querySelectorAll(".overlay").forEach((ov) => {
    const page = +ov.dataset.page;
    ov.classList.toggle("drop-ready", !!carryState);
    ov.innerHTML = "";
    elements.filter((e) => e.page === page).forEach((el) => {
      if (carryState?.mode === "move" && carryState.el?.id === el.id) return;
      ov.appendChild(createElementNode(el, ov));
    });
  });
}

function createElementNode(el, overlay) {
  const node = document.createElement("div");
  const active = isFieldActive(el);
  node.className = `draggable ${el.type}${active ? " selected" : ""}`;
  node.style.left = el.xPx + "px"; node.style.top = el.yPx + "px";
  node.dataset.id = el.id;

  if (el.type === "signature") {
    node.classList.add("signature");
    const img = document.createElement("img");
    img.src = signatureImgSrc(); img.draggable = false;
    img.style.width = (el.width || 130) + "px"; img.style.height = (el.height || 28) + "px";
    img.onerror = () => { node.textContent = "Draw signature ↑"; node.classList.add("sig-missing"); };
    node.appendChild(img);
  } else if (el.type === "checkbox") {
    node.classList.add("checkbox-el");
    const sz = el.boxSizePx || CHECKBOX_SIZE_PX;
    node.style.width = sz + "px";
    node.style.height = sz + "px";
    node.style.fontSize = checkboxFontSize(sz) + "px";
    node.textContent = checkboxMark(el.checked);
  } else if (hasDragGrip(el)) {
    node.classList.add("text-box", "grip-field");
    if (isCustomField(el)) {
      node.classList.add("custom-text");
      if (isPlaceholderText(el)) node.classList.add("placeholder");
    }
    if (isRequestField(el)) node.classList.add("request-text");
    node.style.fontSize = el.fontsize + "px";
    node.style.width = gripNodeWidth(el) + "px";
    node.style.height = (el.heightPx || 28) + "px";

    node.appendChild(createCustomDragGrip());
    const body = document.createElement("div");
    body.className = isCustomField(el) ? "custom-field-body" : "request-field-body";
    if (el.id === editingId) attachInlineTextarea(body, el, node);
    else body.textContent = el.text;
    node.appendChild(body);
    bindGripFieldEditActivate(body, el);
  } else {
    node.style.fontSize = el.fontsize + "px";
    if (isTextBox(el)) {
      node.classList.add("text-box");
      node.style.width = (el.widthPx || 120) + "px";
      node.style.height = (el.heightPx || 28) + "px";
    }

    if (el.id === editingId && isTextBox(el)) {
      node.classList.add("editing");
      const ta = document.createElement("textarea");
      ta.className = "inline-field-edit";
      ta.dataset.inlineEdit = el.id;
      ta.value = el.text;
      ta.placeholder = "Type your text…";
      ta.style.fontSize = el.fontsize + "px";
      ta.addEventListener("mousedown", (e) => e.stopPropagation());
      ta.addEventListener("click", (e) => e.stopPropagation());
      ta.addEventListener("input", () => {
        el.text = ta.value;
        markUserEdited(el);
        fitTextBoxToContent(el);
        node.style.width = el.widthPx + "px";
        node.style.height = el.heightPx + "px";
        markDirty();
      });
      ta.addEventListener("blur", () => {
        if (editingId === el.id) endInlineTextEdit(true);
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); endInlineTextEdit(true); }
        e.stopPropagation();
      });
      node.appendChild(ta);
    } else {
      node.textContent = el.text;
    }
  }

  bindFieldDrag(node, el, overlay);

  node.addEventListener("click", (e) => {
    if (node.dataset.wasDragged) { delete node.dataset.wasDragged; return; }
    if (e.target.closest(".field-drag-handle")) return;
    e.stopPropagation(); closeFieldPicker();
    if (carryState?.mode === "new") { dropAt(e.clientX, e.clientY); return; }
    if (hasDragGrip(el)) {
      if (editingId !== el.id) beginInlineTextEdit(el.id);
      return;
    }
    if (selectedId === el.id && !carryState && e.shiftKey) { startCarryMove(el, e, overlay); return; }
    if (selectedId === el.id && !carryState && !isTextBox(el)) { startCarryMove(el, e, overlay); return; }
    if (selectedId === el.id && !carryState && isTextBox(el)) { startCarryMove(el, e, overlay); return; }
    selectElement(el.id);
  });

  node.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (!isTextBox(el) || isInlineEditableField(el)) return;
    beginInlineTextEdit(el.id);
  });

  if (isFieldActive(el)) {
    const delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "field-delete-btn"; delBtn.textContent = "×";
    delBtn.onclick = (e) => { e.stopPropagation(); deleteElement(el.id); };
    node.appendChild(delBtn);
    if (isTextBox(el) || el.type === "signature") {
      const handle = document.createElement("div");
      handle.className = "resize-handle";
      handle.onmousedown = (e) => startResize(e, el);
      handle.onclick = (e) => e.stopPropagation();
      node.appendChild(handle);
    }
  }
  return node;
}

function selectElement(id) {
  if (editingId && editingId !== id) endInlineTextEdit(true);
  selectedId = id; renderElements(); renderProps();
  const del = document.getElementById("btn-delete");
  if (del) del.disabled = !id;
}

function deleteElement(id) {
  pushUndo();
  elements = elements.filter((e) => e.id !== id);
  if (selectedId === id) selectElement(null); else renderElements();
  updateFieldChecklist();
  markDirty();
}

function deleteSelected() { if (selectedId) deleteElement(selectedId); }

function renderProps() {
  const panel = $("#props-panel");
  if (!panel) return;
  const el = elements.find((e) => e.id === selectedId);
  if (!el) { panel.innerHTML = `<h4>Selected</h4><p class="none-selected">Click a field to edit it.</p>`; return; }

  const inlineOnPdf = editingId === el.id && isTextBox(el);
  const textEdit = el.type !== "checkbox" && el.type !== "signature" && !inlineOnPdf
    ? `<label class="prop-label">Text<textarea id="prop-text" rows="3">${esc(el.text)}</textarea></label>`
    : inlineOnPdf
      ? isCustomField(el)
        ? `<p class="tip">Editing <strong>${esc(el.label)}</strong>. Click the text to type · drag the <strong>⋮⋮</strong> grip to move.</p>`
        : `<p class="tip">Editing <strong>${esc(el.label)}</strong> on the PDF. Click another box to switch. Hold Shift and drag to move.</p>`
      : "";
  const fontCtrl = el.type !== "signature"
    ? `<label class="prop-label">Size <input type="range" id="prop-size" min="6" max="24" value="${el.fontsize}" /></label>` : "";
  const widthMax = (isRequestField(el) || isCustomField(el)) ? 920 : 400;
  const boxCtrl = isTextBox(el)
    ? `<label class="prop-label">Width <input type="range" id="prop-width" min="40" max="${widthMax}" value="${el.widthPx || 120}" /></label>
       <label class="prop-label">Height <input type="range" id="prop-height" min="14" max="200" value="${el.heightPx || 14}" /></label>` : "";

  panel.innerHTML = `<h4>${esc(el.label || el.type)}</h4>${textEdit}${fontCtrl}${boxCtrl}
    <button type="button" class="btn danger sm" id="prop-delete">Remove</button>`;

  document.getElementById("prop-delete")?.addEventListener("click", () => deleteElement(el.id));
  $("#prop-text")?.addEventListener("input", (e) => {
    el.text = e.target.value;
    markUserEdited(el);
    if (isRequestField(el) || isCustomField(el)) fitTextBoxToContent(el, { autoWidth: true });
    else fitTextBoxToContent(el);
    renderElements();
    markDirty();
  });

  $("#prop-size")?.addEventListener("input", (e) => {
    el.fontsize = +e.target.value;
    if (isRequestField(el)) fitTextBoxToContent(el, { autoWidth: true });
    else fitTextBoxToContent(el);
    renderElements(); renderProps(); markDirty();
  });
  $("#prop-width")?.addEventListener("input", (e) => { el.widthPx = +e.target.value; renderElements(); markDirty(); });
  $("#prop-height")?.addEventListener("input", (e) => { el.heightPx = +e.target.value; renderElements(); markDirty(); });
}

function elementsToPdfCoords() {
  return elements.map((el) => {
    const page = Number(el.page);
    const m = pageMetrics[page];
    if (!m) return null;
    const textLeftPx = el.xPx + (hasDragGrip(el) ? CUSTOM_GRIP_W : 0);
    const out = {
      type: el.type, page, x: (textLeftPx / m.displayWidth) * m.width, y: (el.yPx / m.displayHeight) * m.height,
      y_mode: "top", text: el.text, fontsize: el.fontsize, label: el.label, checked: el.checked,
    };
    if (isTextBox(el)) { out.box_width = (el.widthPx / m.displayWidth) * m.width; out.box_height = (el.heightPx / m.displayHeight) * m.height; }
    if (el.type === "signature") { out.width = ((el.width || 130) / m.displayWidth) * m.width; out.height = ((el.height || 28) / m.displayHeight) * m.height; }
    if (el.type === "checkbox") out.box_size = ((el.boxSizePx || CHECKBOX_SIZE_PX) / m.displayWidth) * m.width;
    return out;
  }).filter(Boolean);
}

function describeMappingFailure() {
  const pages = [...new Set(elements.map((el) => Number(el.page)))];
  const missing = pages.filter((p) => !pageMetrics[p]);
  if (missing.length) {
    return `Fields are on page(s) ${missing.map((p) => p + 1).join(", ")} but the PDF only has ${pageMetrics.length} page(s). Refresh and try again.`;
  }
  return "Fields could not be mapped to the PDF. Refresh the page and try again.";
}

function pageMetricsReady() {
  if (!pageMetrics.length || !elements.length) return false;
  return elements.every((el) => pageMetrics[Number(el.page)]);
}

async function waitForPageMetrics(maxMs = 8000) {
  if (pageMetricsReady()) return true;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 80));
    if (pageMetricsReady()) return true;
  }
  return pageMetricsReady();
}

function setSaveButtonsBusy(busy) {
  ["btn-save", "btn-save-next"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function bindSaveButtons() {
  const saveBtn = document.getElementById("btn-save");
  const saveNextBtn = document.getElementById("btn-save-next");
  if (saveBtn) {
    saveBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveForm(currentFormMeta, false);
    };
  }
  if (saveNextBtn) {
    saveNextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveForm(currentFormMeta, true);
    };
  }
}

async function saveForm(f, andNext = false) {
  if (!f?.id) {
    showSaveMsg("No form selected — pick a city from the list first.", "err");
    return;
  }
  if (editorMode !== "edit") {
    showSaveMsg("Switch to Edit Form before saving.", "err");
    return;
  }
  if (!elements.length) {
    showSaveMsg("Add at least one field on the PDF first.", "err");
    return;
  }
  if (!pageMetrics.length) {
    showSaveMsg("PDF is still loading — wait a moment and try again.", "err");
    return;
  }
  if (!pageMetricsReady()) {
    showSaveMsg("PDF pages are still rendering — wait a moment and try again.", "err");
    const ready = await waitForPageMetrics();
    if (!ready) {
      showSaveMsg(describeMappingFailure(), "err");
      return;
    }
  }
  const coords = elementsToPdfCoords();
  if (!coords.length) {
    showSaveMsg(describeMappingFailure(), "err");
    return;
  }

  setSaveButtonsBusy(true);
  showSaveMsg("Saving PDF…", "");
  let savedOk = false;
  let successMsg = "";
  try {
    const res = await fetch(`/api/save/${f.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elements: coords }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) {
      showSaveMsg(data.error || `Save failed (${res.status})`, "err");
      return;
    }
    savedOk = true;
    playStampAnimation();
    clearDraft(f.id);
    dirty = false;
    successMsg = `Stamped!<br><span class="path-line">${esc(data.desktop_path || data.path)}</span><br>${esc(data.message || "")}`;
    showSaveMsg(successMsg, "ok");
  } catch (err) {
    console.error(err);
    showSaveMsg(err.message || "Save failed — check that the app is still running.", "err");
    return;
  } finally {
    setSaveButtonsBusy(false);
  }

  if (!savedOk) return;

  try {
    await load({ reopen: false });
    if (andNext) {
      const nextId = nextPendingId(f.id);
      if (nextId) {
        await openForm(nextId, { skipDirtyCheck: true, preferSaved: false });
        return;
      }
    }
    await openForm(f.id, { preferSaved: true, bustCache: true, skipDirtyCheck: true });
  } catch (err) {
    console.error(err);
    showSaveMsg(
      `${successMsg}<br><span class="path-line">Saved successfully, but the list could not refresh. Reload the page or pick the next city from the list.</span>`,
      "ok"
    );
  }
}

async function importBlankFromFoiaUrl(f, { auto = false } = {}) {
  if (!f?.id) return;
  const btn = $("#btn-import-foia-pdf");
  const msg = $("#save-msg");
  const hint = $("#import-foia-hint");
  if (btn) {
    btn.disabled = true;
    btn.textContent = auto ? "Attaching FOIA PDF…" : "Attaching…";
  }
  if (hint) {
    hint.textContent = auto
      ? "Found a direct PDF link — attaching automatically…"
      : "Downloading city FOIA PDF…";
  }
  if (msg) {
    msg.hidden = false;
    msg.textContent = "";
    msg.className = "save-msg";
  }
  try {
    const res = await fetch(
      withModulePrefix(`/api/import-blank-from-url/${encodeURIComponent(f.id)}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: f.url || f.portal_url || "" }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
    if (msg) {
      msg.textContent = data.message || "FOIA PDF attached.";
      msg.className = "save-msg ok";
    }
    // Reload form into editor with raw_path present
    await openForm(f.id, { skipDirtyCheck: true });
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Attach FOIA PDF";
    }
    if (hint) {
      hint.textContent =
        "Could not auto-attach (city may block downloads or the link is a web page). Use Preview FOIA link → save → Upload blank instead.";
    }
    if (msg) {
      msg.hidden = false;
      msg.textContent = err.message || "Import failed";
      msg.className = "save-msg err";
    }
    if (!auto) showSaveMsg(esc(err.message || "Import failed"), "err");
  }
}

async function uploadBlankPdf(f, file) {
  if (!file) return;
  const fd = new FormData(); fd.append("pdf", file);
  const res = await fetch(withModulePrefix(`/api/upload-blank/${f.id}`), { method: "POST", body: fd });
  const data = await res.json();
  if (res.ok) { await load(); openForm(f.id, { skipDirtyCheck: true }); }
  else showSaveMsg(data.error || "Upload failed", "err");
}

async function uploadPdf(f, file) {
  if (!file) return;
  const fd = new FormData(); fd.append("pdf", file);
  const res = await fetch(withModulePrefix(`/api/save/${f.id}`), { method: "POST", body: fd });
  const data = await res.json();
  if (res.ok) { clearDraft(f.id); await load(); openForm(f.id, { preferSaved: true, skipDirtyCheck: true }); }
  else showSaveMsg(data.error || "Upload failed", "err");
}

// --- Carry / picker / drop ---
function getGhostEl() {
  let g = document.getElementById("carry-ghost");
  if (!g) { g = document.createElement("div"); g.id = "carry-ghost"; g.className = "carry-ghost"; document.body.appendChild(g); }
  return g;
}
function hideGhost() {
  const g = document.getElementById("carry-ghost");
  if (!g) return;
  g.style.display = "none";
  g.style.width = "";
  g.style.height = "";
  g.style.fontSize = "";
  g.className = "carry-ghost";
  g.textContent = "";
}
function cancelCarry() { carryState = null; hideGhost(); updateCarryHint(); document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active-tool")); renderElements(); }
function updateCarryHint() {
  const hint = document.getElementById("carry-hint");
  const cancelBtn = document.getElementById("btn-cancel-carry");
  if (!hint) return;
  if (!carryState) { hint.textContent = ""; if (cancelBtn) cancelBtn.style.display = "none"; document.body.classList.remove("carrying"); return; }
  document.body.classList.add("carrying");
  if (cancelBtn) cancelBtn.style.display = "block";
  hint.textContent = carryState.mode === "new" ? "Click PDF to drop (Esc cancel)" : "Click to move (Esc cancel)";
}
function onCarryMove(e) {
  if (!carryState) return;
  const ghost = getGhostEl();
  const ox = carryState.offsetX ?? 0;
  const oy = carryState.offsetY ?? 0;
  ghost.style.left = (e.clientX - ox) + "px";
  ghost.style.top = (e.clientY - oy) + "px";
}
function startCarryNew(kind) {
  if (!isFieldKindAvailable(kind)) return;
  closeFieldPicker();
  const preset = presetForKind(kind); if (!preset) return;
  const sized = isTextBox(preset) ? fitTextBoxToContent({ ...preset }) : { ...preset };
  carryState = { mode: "new", kind, preset: sized, offsetX: 0, offsetY: 0 };
  const ghost = getGhostEl();
  ghost.style.display = "block";
  applyGhostStyle(ghost, carryState.preset);
  updateCarryHint(); renderElements();
}
function startCarryMove(el, clickEvent, overlay) {
  closeFieldPicker(); if (resizeState) return;
  const rect = overlay.getBoundingClientRect();
  carryState = { mode: "move", el, offsetX: clickEvent.clientX - rect.left - el.xPx, offsetY: clickEvent.clientY - rect.top - el.yPx };
  selectedId = el.id;
  const ghost = getGhostEl();
  ghost.style.display = "block";
  applyGhostStyle(ghost, el);
  updateCarryHint(); renderProps(); renderElements();
}
function overlayAtPoint(cx, cy) {
  let found = null;
  document.querySelectorAll(".overlay").forEach((ov) => {
    const r = ov.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) found = ov;
  });
  return found;
}
function dropAt(cx, cy) {
  const overlay = overlayAtPoint(cx, cy);
  if (!overlay || !carryState) return false;
  pushUndo();
  const rect = overlay.getBoundingClientRect();
  const page = +overlay.dataset.page;
  const excludeId = carryState.mode === "move" ? carryState.el.id : null;
  const wasNew = carryState.mode === "new";
  const ghost = document.getElementById("carry-ghost");
  let xPx;
  let yPx;
  if (wasNew && ghost && ghost.style.display !== "none") {
    ({ xPx, yPx } = overlayCoordsFromGhost(overlay, ghost));
  } else {
    ({ xPx, yPx } = overlayCoordsFromClient(
      cx,
      cy,
      rect,
      carryState.mode === "move" ? carryState.el : carryState.preset,
      { x: carryState.offsetX ?? 0, y: carryState.offsetY ?? 0 },
    ));
  }
  const snapped = snapPosition(xPx, yPx, page, excludeId);
  xPx = snapped.xPx; yPx = snapped.yPx;

  let placedId = null;
  if (wasNew) {
    const el = baseElement(carryState.preset);
    el.page = page; el.xPx = xPx; el.yPx = yPx;
    elements.push(el);
    placedId = el.id;
    selectedId = el.id;
  } else {
    carryState.el.page = page; carryState.el.xPx = xPx; carryState.el.yPx = yPx;
    placedId = carryState.el.id;
    selectedId = carryState.el.id;
  }
  cancelCarry(); renderElements(); renderProps(); updateFieldChecklist(); markDirty();
  return true;
}
function placeFieldAt(kind, cx, cy) {
  if (!isFieldKindAvailable(kind)) return;
  const preset = presetForKind(kind); if (!preset) return;
  const overlay = overlayAtPoint(cx, cy); if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  const page = +overlay.dataset.page;
  const el = baseElement(preset);
  const coords = overlayCoordsFromClient(cx, cy, rect, el);
  const snapped = snapPosition(coords.xPx, coords.yPx, page, null, { enabled: false });
  el.page = page; el.xPx = snapped.xPx; el.yPx = snapped.yPx;
  elements.push(el); selectedId = el.id;
  renderElements(); renderProps(); updateFieldChecklist(); markDirty();
}
function getFieldPickerEl() {
  let picker = document.getElementById("field-picker");
  if (!picker) {
    picker = document.createElement("div"); picker.id = "field-picker"; picker.className = "field-picker";
    picker.innerHTML = `<div class="field-picker-head"><span>Place field</span><button class="picker-close">×</button></div><div class="field-picker-body"></div>`;
    document.body.appendChild(picker);
    picker.querySelector(".picker-close").onclick = (e) => { e.stopPropagation(); closeFieldPicker(); };
    picker.addEventListener("click", (e) => e.stopPropagation());
  }
  const body = picker.querySelector(".field-picker-body");
  body.innerHTML = pickerGroupsHtml();
  body.querySelectorAll(".picker-btn").forEach((btn) => btn.onclick = (e) => {
    e.stopPropagation(); const pos = picker._placeAt;
    if (pos) placeFieldAt(btn.dataset.kind, pos.clientX, pos.clientY);
    closeFieldPicker();
  });
  return picker;
}
function positionFieldPicker(picker, cx, cy) {
  const margin = 12;
  picker.style.visibility = "hidden";
  picker.classList.add("open");
  const pw = picker.offsetWidth;
  const ph = picker.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = cx - pw / 2;
  let top = cy - ph / 2;
  left = Math.max(margin, Math.min(left, vw - pw - margin));
  top = Math.max(margin, Math.min(top, vh - ph - margin));

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.style.visibility = "";
}

function showFieldPicker(cx, cy) {
  closeFieldPicker();
  const picker = getFieldPickerEl();
  picker._placeAt = { clientX: cx, clientY: cy };
  positionFieldPicker(picker, cx, cy);
  pickerOpen = true;
}
function closeFieldPicker() {
  const picker = document.getElementById("field-picker");
  if (picker) { picker.classList.remove("open"); picker._placeAt = null; }
  pickerOpen = false;
}
function startResize(e, el) {
  e.preventDefault(); e.stopPropagation();
  const isSig = el.type === "signature";
  resizeState = { el, isSig, startX: e.clientX, startY: e.clientY, startW: isSig ? el.width || 130 : el.widthPx || 120, startH: isSig ? el.height || 28 : el.heightPx || 28 };
  document.addEventListener("mousemove", onResize);
  document.addEventListener("mouseup", endResize);
}
function onResize(e) {
  if (!resizeState) return;
  const el = resizeState.el;
  if (resizeState.isSig) {
    el.width = Math.max(50, Math.min(MAX_SIG.width, resizeState.startW + (e.clientX - resizeState.startX)));
    el.height = Math.max(14, Math.min(MAX_SIG.height, resizeState.startH + (e.clientY - resizeState.startY)));
  } else {
    el.widthPx = Math.max(40, resizeState.startW + (e.clientX - resizeState.startX));
    el.heightPx = Math.max(18, resizeState.startH + (e.clientY - resizeState.startY));
  }
  renderElements(); renderProps(); markDirty();
}
function endResize() {
  resizeState = null;
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("mouseup", endResize);
}

function nudgeSelected(dx, dy) {
  const el = elements.find((e) => e.id === selectedId);
  if (!el) return;
  const snapped = snapPosition(el.xPx + dx, el.yPx + dy, el.page, el.id);
  el.xPx = Math.max(0, snapped.xPx); el.yPx = Math.max(0, snapped.yPx);
  renderElements(); markDirty();
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

document.addEventListener("pointermove", onCarryMove);
document.addEventListener("mousedown", (e) => {
  if (!pickerOpen) return;
  const picker = document.getElementById("field-picker");
  if (picker && !picker.contains(e.target)) closeFieldPicker();
});
document.addEventListener("keydown", (e) => {
  const typing = e.target.matches("input, textarea, [contenteditable=true]");
  if (e.key === "Escape") {
    if (editingId) { e.preventDefault(); endInlineTextEdit(true); return; }
    if (pickerOpen) closeFieldPicker();
    else cancelCarry();
    return;
  }
  if (!typing && (e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); deleteSelected(); return; }
  if (!typing && selectedId && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
    if (e.key === "ArrowRight") nudgeSelected(step, 0);
    if (e.key === "ArrowUp") nudgeSelected(0, -step);
    if (e.key === "ArrowDown") nudgeSelected(0, step);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (currentFormMeta && editorMode === "edit") saveForm(currentFormMeta); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); if (currentFormMeta && editorMode === "edit") saveForm(currentFormMeta, true); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !typing) { e.preventDefault(); undo(); return; }
});
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

document.querySelectorAll(".filter").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active"); filter = btn.dataset.filter; renderList();
}));
if ($("#search")) $("#search").addEventListener("input", renderList);

function initMobileCitiesRail() {
  const rail = document.getElementById("forge-mobile-rail");
  const toggle = document.getElementById("forge-cities-toggle");
  const hint = document.getElementById("forge-mobile-rail-hint");
  if (!rail || !toggle) return;

  const mq = window.matchMedia("(max-width: 640px)");
  const syncRail = () => {
    const phone = mq.matches;
    rail.hidden = !phone;
    if (!phone) {
      document.body.classList.remove("forge-sidebar-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Cities";
      if (hint) hint.textContent = "Tap to open queue";
    }
  };

  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("forge-sidebar-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close cities" : "Cities";
    if (hint) hint.textContent = open ? "Select a city, then close" : "Tap to open queue";
  });

  document.getElementById("form-list")?.addEventListener("click", (ev) => {
    if (!mq.matches) return;
    if (!ev.target.closest("li, button, a")) return;
    // After picking a city on phone, free the canvas
    window.setTimeout(() => {
      if (!document.body.classList.contains("forge-sidebar-open")) return;
      document.body.classList.remove("forge-sidebar-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Cities";
      if (hint) hint.textContent = "Tap to open queue";
    }, 180);
  });

  syncRail();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", syncRail);
  else if (typeof mq.addListener === "function") mq.addListener(syncRail);
}

function boot() {
  initSignaturePad();
  initSettingsModal();
  initMobileCitiesRail();
  window.FormForgeSettings?.init({
    onYourInfo: () => document.getElementById("btn-settings")?.click(),
    onSignature: () => document.getElementById("btn-draw-signature")?.click(),
  });
  const settingsParam = new URLSearchParams(location.search).get("settings");
  if (settingsParam === "info") {
    setTimeout(() => document.getElementById("btn-settings")?.click(), 0);
  } else if (settingsParam === "signature") {
    setTimeout(() => document.getElementById("btn-draw-signature")?.click(), 0);
  }
  load();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}