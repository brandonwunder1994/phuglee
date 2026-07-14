(function () {
  const params = new URLSearchParams(location.search);
  const token = String(params.get('token') || '').trim();
  const $ = (id) => document.getElementById(id);

  const state = {
    token,
    uploaded: 0,
    done: false,
    previews: []
  };

  function showError(msg) {
    const el = $('pu-error');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  function setStatus(msg, ok) {
    const el = $('pu-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-ok', !!ok);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.code = data.code;
      throw err;
    }
    return data;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  function addPreview(file) {
    const url = URL.createObjectURL(file);
    state.previews.push(url);
    const box = $('pu-thumbs');
    if (!box) return;
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      box.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name || 'Upload';
      box.appendChild(img);
    }
  }

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length || state.done) return;
    $('pu-done').disabled = true;
    let saved = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}…`);
      try {
        if (file.size > 40 * 1024 * 1024) {
          throw new Error('File over 40MB');
        }
        const contentBase64 = await fileToBase64(file);
        await api(`/api/leads/public/photo-upload/${encodeURIComponent(token)}`, {
          method: 'POST',
          body: JSON.stringify({
            files: [{
              contentBase64,
              mimeType: file.type || 'image/jpeg',
              name: file.name || `photo-${Date.now()}.jpg`
            }]
          })
        });
        saved += 1;
        state.uploaded += 1;
        addPreview(file);
      } catch (err) {
        failed += 1;
        console.warn(err);
      }
    }
    setStatus(
      failed
        ? `Saved ${saved}${failed ? ` · ${failed} failed` : ''}`
        : `Saved ${saved} file${saved === 1 ? '' : 's'}`,
      saved > 0 && !failed
    );
    if (!state.done) $('pu-done').disabled = state.uploaded < 1;
  }

  async function markDone() {
    if (state.done || state.uploaded < 1) return;
    $('pu-done').disabled = true;
    setStatus('Sending Done alert…');
    try {
      await api(`/api/leads/public/photo-upload/${encodeURIComponent(token)}/done`, {
        method: 'POST',
        body: '{}'
      });
      state.done = true;
      setStatus('Done — team notified. Thank you!', true);
      $('pu-done').textContent = 'Done ✓';
      $('pu-file').disabled = true;
    } catch (err) {
      setStatus('');
      showError(err.message || 'Could not mark done');
      $('pu-done').disabled = false;
    }
  }

  async function boot() {
    if (!token) {
      showError('Missing upload token. Use the link from your text message.');
      return;
    }
    try {
      const meta = await api(`/api/leads/public/photo-upload/${encodeURIComponent(token)}`);
      $('pu-address').textContent = [meta.address, meta.city, meta.state].filter(Boolean).join(', ') || 'Property';
      $('pu-meta').textContent = [
        meta.photographerName ? `Hi ${meta.photographerName.split(/\s+/)[0]}` : '',
        meta.shootDate ? `Shoot ${meta.shootDate}${meta.shootTime ? ' · ' + meta.shootTime : ''}` : ''
      ].filter(Boolean).join(' · ');
      const ul = $('pu-check-list');
      ul.innerHTML = (meta.checklist || []).map((c) => `<li>${c}</li>`).join('');
      if (meta.done) {
        state.done = true;
        state.uploaded = Math.max(1, meta.mediaCount || 1);
        $('pu-done').disabled = true;
        $('pu-done').textContent = 'Already marked done';
        setStatus('This shoot was already finished. Thanks!', true);
        $('pu-file').disabled = true;
      }
    } catch (err) {
      showError(err.message || 'Invalid or expired upload link');
    }

    const drop = $('pu-drop');
    const input = $('pu-file');
    drop?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => uploadFiles(input.files));
    ['dragenter', 'dragover'].forEach((ev) => {
      drop?.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('is-drag');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      drop?.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove('is-drag');
      });
    });
    drop?.addEventListener('drop', (e) => {
      uploadFiles(e.dataTransfer?.files);
    });
    $('pu-done')?.addEventListener('click', () => markDone());
  }

  boot();
})();
