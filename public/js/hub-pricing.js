(function () {
  const countEl = document.getElementById('hub-city-count');
  if (!countEl) return;

  function formatCount(n) {
    return Number(n).toLocaleString('en-US');
  }

  async function loadCityCount() {
    try {
      const res = await fetch('/forge/api/coverage', { cache: 'no-store' });
      if (!res.ok) throw new Error('coverage unavailable');
      const data = await res.json();
      const total = data.total_cities;
      if (typeof total === 'number' && total > 0) {
        countEl.textContent = formatCount(total);
      }
    } catch (_) {
      countEl.textContent = '500+';
    }
  }

  loadCityCount();
})();