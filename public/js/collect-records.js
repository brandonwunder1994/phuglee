(function () {
  'use strict';

  const FORGE = '/forge';
  const SELECTION_KEY = 'phuglee-collect-selected-cities';

  const WORKFLOW_LABELS = {
    '/forge/portal/request-pdfs': 'Send PDF Emails',
    '/forge/portal/email-only': 'Emails Only',
    '/forge/portal/submit-portals': 'Online Portals'
  };

  const startDialog = document.getElementById('start-requests-dialog');
  const stepCities = document.getElementById('collect-step-cities');
  const stepWorkflow = document.getElementById('collect-step-workflow');
  const stepConfirm = document.getElementById('collect-step-confirm');
  const cityListEl = document.getElementById('collect-city-list');
  const citySearchEl = document.getElementById('collect-city-search');
  const cityCountLabel = document.getElementById('collect-city-count-label');
  const cityStatusEl = document.getElementById('collect-city-status');
  const titleEl = document.getElementById('start-requests-title');
  const btnCitiesContinue = document.getElementById('btn-collect-step-cities');
  const confirmCitiesEl = document.getElementById('collect-confirm-cities');
  const confirmWorkflowEl = document.getElementById('collect-confirm-workflow');

  let allCities = [];
  let selectedIds = new Set();
  let searchQuery = '';

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
  }

  function setCityStatus(message, tone) {
    if (!cityStatusEl) return;
    cityStatusEl.textContent = message || '';
    cityStatusEl.className = 'collect-status' + (tone ? ' ' + tone : '');
  }

  function pathwayLabel(city) {
    if (city.is_email_only) return 'Email only';
    if (city.has_completed_pdf || city.pathway === 'email_pdf') return 'PDF email';
    if (city.pathway === 'hybrid') return 'Portal + PDF';
    return 'Portal';
  }

  function pathwayClass(city) {
    if (city.is_email_only) return 'collect-city-badge--email';
    if (city.has_completed_pdf || city.pathway === 'email_pdf') return 'collect-city-badge--pdf';
    return 'collect-city-badge--portal';
  }

  function filteredCities() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCities;
    return allCities.filter(function (city) {
      return (
        city.city.toLowerCase().includes(q) ||
        city.state.toLowerCase().includes(q) ||
        city.id.toLowerCase().includes(q)
      );
    });
  }

  function updateSelectionLabel() {
    if (!cityCountLabel) return;
    const n = selectedIds.size;
    const visible = filteredCities().length;
    if (!allCities.length) {
      cityCountLabel.textContent = 'No cities available';
      return;
    }
    cityCountLabel.textContent =
      n + ' selected · ' + visible + ' shown of ' + allCities.length + ' cities';
    if (btnCitiesContinue) btnCitiesContinue.disabled = n === 0;
  }

  function renderCityList() {
    if (!cityListEl) return;
    const cities = filteredCities();

    if (!allCities.length) {
      cityListEl.innerHTML = '<p class="collect-city-empty">No cities loaded yet.</p>';
      updateSelectionLabel();
      return;
    }

    if (!cities.length) {
      cityListEl.innerHTML = '<p class="collect-city-empty">No cities match your search.</p>';
      updateSelectionLabel();
      return;
    }

    const byState = {};
    cities.forEach(function (city) {
      if (!byState[city.state]) byState[city.state] = [];
      byState[city.state].push(city);
    });

    const states = Object.keys(byState).sort(function (a, b) {
      return a.localeCompare(b, 'en', { sensitivity: 'base' });
    });

    let html = '';
    states.forEach(function (state) {
      html += '<section class="collect-city-state-group">';
      html += '<h3 class="collect-city-state-name">' + escapeHtml(state) + '</h3>';
      html += '<ul class="collect-city-state-list">';
      byState[state]
        .sort(function (a, b) {
          return a.city.localeCompare(b.city, 'en', { sensitivity: 'base' });
        })
        .forEach(function (city) {
          const checked = selectedIds.has(city.id) ? ' checked' : '';
          const badgeClass = pathwayClass(city);
          html +=
            '<li>' +
            '<label class="collect-city-row">' +
            '<input type="checkbox" class="collect-city-check" data-city-id="' +
            escapeHtml(city.id) +
            '"' +
            checked +
            ' />' +
            '<span class="collect-city-row-body">' +
            '<span class="collect-city-name">' +
            escapeHtml(city.city) +
            '</span>' +
            '<span class="collect-city-badge ' +
            badgeClass +
            '">' +
            escapeHtml(pathwayLabel(city)) +
            '</span>' +
            '</span>' +
            '</label>' +
            '</li>';
        });
      html += '</ul></section>';
    });

    cityListEl.innerHTML = html;
    updateSelectionLabel();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showWizardStep(step) {
    if (stepCities) stepCities.hidden = step !== 'cities';
    if (stepWorkflow) stepWorkflow.hidden = step !== 'workflow';
    if (stepConfirm) stepConfirm.hidden = step !== 'confirm';
    if (titleEl) {
      if (step === 'cities') titleEl.textContent = 'Choose your cities';
      else if (step === 'workflow') titleEl.textContent = 'Pick your workflow';
      else titleEl.textContent = 'Confirm and open Form Forge';
    }
  }

  function selectedWorkflowHref() {
    const picked = document.querySelector('input[name="request-workflow"]:checked');
    return picked ? picked.value : '/forge/portal/request-pdfs';
  }

  function selectedCityNames() {
    return allCities
      .filter(function (city) {
        return selectedIds.has(city.id);
      })
      .map(function (city) {
        return city.city + ', ' + city.state;
      });
  }

  function fillConfirmSummary() {
    const names = selectedCityNames();
    const href = selectedWorkflowHref();
    if (confirmCitiesEl) {
      if (!names.length) {
        confirmCitiesEl.textContent = 'None selected';
      } else if (names.length <= 4) {
        confirmCitiesEl.textContent = names.join(' · ');
      } else {
        confirmCitiesEl.textContent =
          names.slice(0, 3).join(' · ') + ' · +' + (names.length - 3) + ' more (' + names.length + ' total)';
      }
    }
    if (confirmWorkflowEl) {
      confirmWorkflowEl.textContent = WORKFLOW_LABELS[href] || href;
    }
  }

  async function loadCities() {
    setCityStatus('Loading cities…', 'busy');
    if (cityListEl) {
      cityListEl.innerHTML = '<p class="collect-city-loading">Loading cities…</p>';
    }

    try {
      let items = null;
      let usedBackup = false;

      try {
        const res = await fetch(FORGE + '/api/portal/cities/summary', { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not load cities');
        const data = await res.json();
        items = data.items || [];
      } catch (_) {
        // Form Forge may be down — use the same backup list Filter uses
        const fallback = await fetch('/api/bridge/cities?all=1', { cache: 'no-store' });
        if (!fallback.ok) throw new Error('Could not load cities');
        const data = await fallback.json();
        items = data.cities || [];
        usedBackup = true;
      }

      allCities = (items || []).slice().sort(function (a, b) {
        if (a.state !== b.state) {
          return a.state.localeCompare(b.state, 'en', { sensitivity: 'base' });
        }
        return a.city.localeCompare(b.city, 'en', { sensitivity: 'base' });
      });
      setCityStatus(
        usedBackup
          ? 'Showing backup city list (Form Forge offline). You can still pick cities.'
          : ''
      );
      renderCityList();
    } catch (err) {
      allCities = [];
      if (cityListEl) {
        cityListEl.innerHTML =
          '<p class="collect-city-empty">Could not load cities. Make sure Distress OS is running.</p>';
      }
      setCityStatus(err.message || 'Failed to load cities', 'err');
      updateSelectionLabel();
    }
  }

  function openStartRequestsDialog() {
    selectedIds = new Set();
    searchQuery = '';
    if (citySearchEl) citySearchEl.value = '';
    showWizardStep('cities');
    openDialog(startDialog);
    loadCities();
  }

  function persistSelection() {
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify([...selectedIds]));
    } catch (_) {
      /* ignore quota errors */
    }
  }

  function launchFormForge() {
    if (!selectedIds.size) return;
    persistSelection();
    const href = selectedWorkflowHref();
    closeDialog(startDialog);
    window.location.href = href;
  }

  document.getElementById('btn-start-requests')?.addEventListener('click', openStartRequestsDialog);

  document.getElementById('btn-collect-step-cities')?.addEventListener('click', function () {
    if (!selectedIds.size) return;
    showWizardStep('workflow');
  });

  document.getElementById('btn-collect-step-back')?.addEventListener('click', function () {
    showWizardStep('cities');
  });

  document.getElementById('btn-confirm-workflow')?.addEventListener('click', function () {
    if (!selectedIds.size) return;
    fillConfirmSummary();
    showWizardStep('confirm');
  });

  document.getElementById('btn-collect-confirm-back')?.addEventListener('click', function () {
    showWizardStep('workflow');
  });

  document.getElementById('btn-collect-launch')?.addEventListener('click', launchFormForge);

  citySearchEl?.addEventListener('input', function () {
    searchQuery = citySearchEl.value || '';
    renderCityList();
  });

  document.getElementById('collect-city-select-all')?.addEventListener('click', function () {
    filteredCities().forEach(function (city) {
      selectedIds.add(city.id);
    });
    renderCityList();
  });

  document.getElementById('collect-city-clear')?.addEventListener('click', function () {
    selectedIds.clear();
    renderCityList();
  });

  cityListEl?.addEventListener('change', function (event) {
    const input = event.target;
    if (!input.classList.contains('collect-city-check')) return;
    const id = input.getAttribute('data-city-id');
    if (!id) return;
    if (input.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectionLabel();
  });

  document.querySelectorAll('[data-close-dialog]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const dialog = btn.closest('dialog');
      closeDialog(dialog);
    });
  });

  startDialog?.addEventListener('click', function (event) {
    if (event.target === startDialog) closeDialog(startDialog);
  });

  window.PhugleeCollectSelection = {
    key: SELECTION_KEY,
    save: persistSelection,
    getIds: function () {
      return [...selectedIds];
    }
  };
})();
