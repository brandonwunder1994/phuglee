(function () {
  function closeMenu(menu) {
    const dropdown = menu.querySelector(".settings-dropdown");
    const trigger = menu.querySelector(".settings-trigger");
    if (!dropdown || !trigger) return;
    dropdown.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu(menu) {
    const dropdown = menu.querySelector(".settings-dropdown");
    const trigger = menu.querySelector(".settings-trigger");
    if (!dropdown || !trigger) return;
    dropdown.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function ensureIdeasModal() {
    if (document.getElementById("ideas-modal")) return;

    const modal = document.createElement("dialog");
    modal.id = "ideas-modal";
    modal.className = "ideas-modal";
    modal.setAttribute("aria-labelledby", "ideas-modal-title");
    modal.innerHTML = `
      <div class="ideas-modal-card">
        <div class="ideas-modal-head">
          <h2 id="ideas-modal-title">Product ideas</h2>
          <button type="button" class="picker-close" id="ideas-modal-close" aria-label="Close ideas">×</button>
        </div>
        <p class="ideas-modal-sub">Capture feature ideas for Form Forge. New ideas are saved to this project.</p>
        <ul class="ideas-list" id="ideas-list" aria-live="polite"></ul>
        <form class="ideas-form" id="ideas-form">
          <label class="ideas-label" for="ideas-input">Add an idea</label>
          <textarea id="ideas-input" rows="4" placeholder="Describe a feature, tier, or improvement…"></textarea>
          <div class="ideas-form-actions">
            <button type="submit" class="btn seal sm" id="ideas-save">Add idea</button>
          </div>
          <p class="ideas-msg" id="ideas-msg" hidden></p>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeIdeasModal();
    });
    modal.querySelector("#ideas-modal-close")?.addEventListener("click", closeIdeasModal);
    modal.querySelector("#ideas-form")?.addEventListener("submit", submitIdea);
  }

  function formatIdeaDate(iso) {
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

  function renderIdeas(items) {
    const list = document.getElementById("ideas-list");
    if (!list) return;
    list.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "ideas-empty";
      li.textContent = "No ideas yet — add your first one below.";
      list.appendChild(li);
      return;
    }
    items.forEach((idea) => {
      const li = document.createElement("li");
      li.className = "ideas-item";
      li.innerHTML = `
        <p class="ideas-text"></p>
        <span class="ideas-date"></span>
      `;
      li.querySelector(".ideas-text").textContent = idea.text;
      li.querySelector(".ideas-date").textContent = formatIdeaDate(idea.created_at);
      list.appendChild(li);
    });
  }

  async function loadIdeas() {
    const res = await fetch("/api/ideas");
    if (!res.ok) throw new Error(`Could not load ideas (${res.status})`);
    const data = await res.json();
    return data.items || [];
  }

  async function openIdeasModal() {
    ensureIdeasModal();
    const modal = document.getElementById("ideas-modal");
    const msg = document.getElementById("ideas-msg");
    if (!modal) return;
    if (msg) msg.hidden = true;
    modal.showModal();
    const list = document.getElementById("ideas-list");
    if (list) list.innerHTML = '<li class="ideas-empty">Loading ideas…</li>';
    try {
      renderIdeas(await loadIdeas());
    } catch (err) {
      if (list) {
        list.innerHTML = `<li class="ideas-empty">Could not load ideas. ${err.message}</li>`;
      }
    }
  }

  function closeIdeasModal() {
    const modal = document.getElementById("ideas-modal");
    if (modal?.open) modal.close();
  }

  async function submitIdea(event) {
    event.preventDefault();
    const input = document.getElementById("ideas-input");
    const msg = document.getElementById("ideas-msg");
    const saveBtn = document.getElementById("ideas-save");
    const text = input?.value?.trim() || "";
    if (!text) {
      if (msg) {
        msg.textContent = "Enter an idea before saving.";
        msg.className = "ideas-msg error";
        msg.hidden = false;
      }
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    if (msg) {
      msg.textContent = "Saving…";
      msg.className = "ideas-msg";
      msg.hidden = false;
    }
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save idea");
      if (input) input.value = "";
      renderIdeas(await loadIdeas());
      if (msg) {
        msg.textContent = "Idea saved.";
        msg.className = "ideas-msg ok";
        msg.hidden = false;
      }
    } catch (err) {
      if (msg) {
        msg.textContent = err.message;
        msg.className = "ideas-msg error";
        msg.hidden = false;
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function init(options = {}) {
    const menu = document.getElementById("settings-menu");
    if (!menu) return;

    const trigger = menu.querySelector(".settings-trigger");
    const dropdown = menu.querySelector(".settings-dropdown");
    if (!trigger || !dropdown) return;

    ensureIdeasModal();

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !dropdown.hidden;
      if (isOpen) closeMenu(menu);
      else openMenu(menu);
    });

    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) closeMenu(menu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu(menu);
    });

    menu.querySelectorAll("[data-settings-action]").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = item.dataset.settingsAction;
        if (action === "your-info" && typeof options.onYourInfo === "function") {
          event.preventDefault();
          options.onYourInfo();
          closeMenu(menu);
        } else if (action === "signature" && typeof options.onSignature === "function") {
          event.preventDefault();
          options.onSignature();
          closeMenu(menu);
        } else if (action === "ideas") {
          event.preventDefault();
          openIdeasModal();
          closeMenu(menu);
        }
      });
    });

    menu.querySelectorAll(".settings-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!item.dataset.settingsAction) closeMenu(menu);
      });
    });
  }

  window.FormForgeSettings = { init, closeMenu, openMenu, openIdeasModal, closeIdeasModal };
})();