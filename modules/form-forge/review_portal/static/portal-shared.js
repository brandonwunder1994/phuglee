/**
 * Shared utilities for City Tracker and Request PDFs pages.
 */
window.PortalShared = {
  $(selector) {
    return document.querySelector(selector);
  },

  escHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  isValidContactEmail(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    const lowered = text.toLowerCase();
    if (["nan", "none", "null", "n/a", "na", "#n/a"].includes(lowered)) return false;
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(text);
  },

  formatDayDate(iso) {
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
  },

  cityPdfUrl(city) {
    if (city?.pdf_file_url) return city.pdf_file_url;
    const path = city?.pdf?.user_filled_path;
    if (!path) return "";
    return `/api/file/${String(path).replace(/\\/g, "/")}`;
  },

  isPdfLinkUrl(url) {
    const text = String(url || "").trim();
    if (!text) return false;
    const path = text.split("?")[0].split("#")[0];
    return path.toLowerCase().endsWith(".pdf");
  },

  pdfPreviewUrl(url) {
    if (!url) return "";
    const base = url.split("#")[0];
    return `${base}#view=FitH&toolbar=0&navpanes=0`;
  },

  async postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },

  async postForm(url, formData) {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },

  COLLECT_SELECTION_KEY: "phuglee-collect-selected-cities",

  getCollectCitySelection() {
    try {
      const raw = sessionStorage.getItem(this.COLLECT_SELECTION_KEY);
      if (!raw) return null;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids) || !ids.length) return null;
      return new Set(ids);
    } catch (_) {
      return null;
    }
  },

  filterByCollectSelection(items) {
    const selection = this.getCollectCitySelection();
    if (!selection) return items || [];
    return (items || []).filter((item) => selection.has(item.id));
  },

  collectSelectionCount() {
    const selection = this.getCollectCitySelection();
    return selection ? selection.size : 0;
  },

  showToast(message, { ok = true, duration = 5000 } = {}) {
    if (!message) return;
    let root = document.getElementById("portal-toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "portal-toast-root";
      root.className = "portal-toast-root";
      root.setAttribute("aria-live", "polite");
      root.setAttribute("aria-atomic", "true");
      document.body.appendChild(root);
    }
    const toast = document.createElement("div");
    toast.className = `portal-toast ${ok ? "ok" : "err"}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    window.setTimeout(() => {
      toast.classList.remove("visible");
      window.setTimeout(() => toast.remove(), 280);
    }, duration);
  },

  /**
   * When opened from Collect bulk desk (?returnTo=collect), show sticky return bar.
   * When embed=1 or inside an iframe, quiet chrome instead (parent is Request).
   */
  injectReturnToCollect() {
    try {
      const params = new URLSearchParams(window.location.search);
      const embedded =
        params.get("embed") === "1" ||
        (window.self !== window.top && params.get("returnTo") === "collect");
      if (embedded) {
        document.documentElement.classList.add("forge-embed-in-collect");
        document.body.classList.add("forge-embed-in-collect");
        return;
      }
      if (params.get("returnTo") !== "collect") return;
      if (document.getElementById("forge-return-collect")) return;
      // Full-page fill opens with ?open= — send operators back to the needs-fill list.
      const fromFill = !!params.get("open");
      const backHref = fromFill ? "/collect#/fill/pdf" : "/collect";
      const note = fromFill ? "PDF needs fill" : "Request desk";
      const bar = document.createElement("div");
      bar.id = "forge-return-collect";
      bar.className = "forge-return-collect";
      bar.setAttribute("role", "navigation");
      bar.setAttribute("aria-label", "Back to Request desk");
      bar.innerHTML =
        `<a class="forge-return-collect-link" href="${backHref}">← Request</a>` +
        `<span class="forge-return-collect-note">${note}</span>`;
      document.body.insertBefore(bar, document.body.firstChild);
    } catch (_) {
      /* ignore */
    }
  },
};

(function bootReturnToCollect() {
  function run() {
    if (window.PortalShared && typeof window.PortalShared.injectReturnToCollect === "function") {
      window.PortalShared.injectReturnToCollect();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();