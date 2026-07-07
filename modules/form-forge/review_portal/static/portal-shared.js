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
};