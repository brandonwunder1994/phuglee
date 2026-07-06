(function () {
  const forgePill = document.getElementById('status-forge');
  const analyzerPill = document.getElementById('status-analyzer');

  function setPill(el, up, label) {
    if (!el) return;
    el.classList.toggle('up', up);
    el.classList.toggle('down', !up);
    const text = el.querySelector('.shell-status-label');
    if (text) text.textContent = label;
  }

  async function pollHealth() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json();
      const modules = data.modules || {};
      setPill(forgePill, modules.formForge === 'up', 'Forge');
      setPill(analyzerPill, modules.propertyAnalyzer === 'up', 'Analyzer');
    } catch (_) {
      setPill(forgePill, false, 'Forge');
      setPill(analyzerPill, false, 'Analyzer');
    }
  }

  pollHealth();
  setInterval(pollHealth, 15000);
})();