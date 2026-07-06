(function () {
  const FORGE = '/forge';

  const startDialog = document.getElementById('start-requests-dialog');
  const fillerDialog = document.getElementById('pdf-filler-dialog');
  const fillerStatus = document.getElementById('pdf-filler-status');
  const fillerForm = document.getElementById('pdf-filler-form');

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    }
  }

  function selectedWorkflowHref() {
    const picked = document.querySelector('input[name="request-workflow"]:checked');
    return picked ? picked.value : '/forge/portal/request-pdfs';
  }

  function setFillerStatus(message, tone) {
    if (!fillerStatus) return;
    fillerStatus.textContent = message || '';
    fillerStatus.className = 'collect-status' + (tone ? ' ' + tone : '');
  }

  async function loadCurrentSettings() {
    try {
      const res = await fetch(`${FORGE}/api/settings`);
      if (!res.ok) return;
      const data = await res.json();
      const nameInput = document.getElementById('filler-name');
      const phoneInput = document.getElementById('filler-phone');
      const emailInput = document.getElementById('filler-email');
      if (nameInput) nameInput.value = data.name || '';
      if (phoneInput) phoneInput.value = data.phone || '';
      if (emailInput) emailInput.value = data.email || '';
    } catch (_) {
      /* forge may be starting — fields stay empty */
    }
  }

  document.getElementById('btn-start-requests')?.addEventListener('click', () => {
    openDialog(startDialog);
  });

  document.getElementById('btn-pdf-filler-info')?.addEventListener('click', async () => {
    setFillerStatus('');
    await loadCurrentSettings();
    openDialog(fillerDialog);
  });

  document.getElementById('btn-confirm-workflow')?.addEventListener('click', () => {
    const href = selectedWorkflowHref();
    closeDialog(startDialog);
    window.location.href = href;
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('dialog');
      closeDialog(dialog);
    });
  });

  [startDialog, fillerDialog].forEach((dialog) => {
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  document.getElementById('btn-save-filler')?.addEventListener('click', async () => {
    if (!fillerForm?.reportValidity()) return;

    const name = document.getElementById('filler-name')?.value.trim() || '';
    const phone = document.getElementById('filler-phone')?.value.trim() || '';
    const email = document.getElementById('filler-email')?.value.trim() || '';
    const saveBtn = document.getElementById('btn-save-filler');

    setFillerStatus('Updating all city PDFs with your info — this may take a minute…', 'busy');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const res = await fetch(`${FORGE}/api/settings/bulk-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not update PDFs');
      }

      const count = data.results?.updated_count ?? 0;
      const skipped = data.results?.skipped_count ?? 0;
      const errors = data.results?.error_count ?? 0;
      let message = `Done! Updated ${count} city PDF${count === 1 ? '' : 's'} with your contact info.`;
      if (skipped) message += ` ${skipped} skipped (no form on file yet).`;
      if (errors) message += ` ${errors} had errors — check Records Desk.`;
      setFillerStatus(message, errors ? 'err' : 'ok');

      window.setTimeout(() => closeDialog(fillerDialog), 2200);
    } catch (err) {
      setFillerStatus(err.message || 'Something went wrong. Try again.', 'err');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
})();