function register(ctx) {
  const {
    router, sendJson, readBody, imageryCache,
    resolveMapsKey, fetchStreetViewPayload, resolveSatellite, sendImageError
  } = ctx;

  router.getPrefix('/api/cached-imagery/', async (req, res, url) => {
    const cachedImageryMatch = url.pathname.match(/^\/api\/cached-imagery\/(streetview|satellite)\/([a-f0-9]{16}\.(jpg|jpeg|png|webp))$/i);
    if (!cachedImageryMatch) return false;
    const [, type, filename] = cachedImageryMatch;
    const file = imageryCache.readCachedFile(type, filename);
    if (!file) {
      const entry = imageryCache.lookupEntryByFilename(type, filename);
      if (entry?.address && type === 'streetview') {
        const q = new URLSearchParams({
          address: entry.address,
          fast: '1',
          size: '400x300'
        });
        if (entry.viewMeta?.panoId) q.set('pano', entry.viewMeta.panoId);
        if (entry.viewMeta?.heading != null) q.set('heading', String(entry.viewMeta.heading));
        res.writeHead(302, { Location: `/api/sv-image?${q.toString()}` });
        res.end();
        return true;
      }
      sendImageError(res, 404, 'Cached image not found');
      return true;
    }
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.end(file.body);
    return true;
  });

  router.get('/api/imagery/status', async (req, res, url) => {
    sendJson(res, 200, { ok: true, ...imageryCache.getStats() });
    return true;
  });

  router.get('/api/imagery/lookup', async (req, res, url) => {
    const address = url.searchParams.get('address');
    if (!address) {
      sendJson(res, 400, { ok: false, error: 'Missing address' });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      address,
      imagery: imageryCache.buildImageryRecord(address)
    });
    return true;
  });

  router.get('/api/imagery/index-map', async (req, res, url) => {
    sendJson(res, 200, {
      ok: true,
      count: Object.keys(imageryCache.buildImageryIndexMap()).length,
      map: imageryCache.buildImageryIndexMap()
    });
    return true;
  });

  router.post('/api/imagery/cache-one', async (req, res, url) => {
    let raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
      return true;
    }
    const address = body?.address;
    const type = body?.type || 'streetview';
    if (!address) {
      sendJson(res, 400, { ok: false, error: 'Missing address' });
      return true;
    }

    if (imageryCache.hasCachedImagery(address, type)) {
      sendJson(res, 200, {
        ok: true,
        alreadyCached: true,
        url: imageryCache.getCachedUrl(address, type),
        imagery: imageryCache.buildImageryRecord(address)
      });
      return true;
    }

    const entry = imageryCache.getEntry(address, type);
    if (entry?.status === 'unavailable') {
      sendJson(res, 200, {
        ok: false,
        unavailable: true,
        error: entry.error || 'Imagery unavailable',
        imagery: imageryCache.buildImageryRecord(address)
      });
      return true;
    }

    if (body?.base64) {
      const buf = Buffer.from(body.base64, 'base64');
      const saved = imageryCache.saveImageryBuffer(address, type, buf, body.mimeType || 'image/jpeg', {
        viewMeta: body.viewMeta || null,
        source: body.source || 'client_upload'
      });
      sendJson(res, saved.ok ? 200 : 500, {
        ...saved,
        imagery: imageryCache.buildImageryRecord(address)
      });
      return true;
    }

    const key = resolveMapsKey(body?.key);
    if (!key) {
      sendJson(res, 400, { ok: false, error: 'Missing Maps API key for fetch' });
      return true;
    }

    if (type === 'satellite') {
      const sat = await resolveSatellite(address, key);
      if (!sat.ok) {
        sendJson(res, 200, { ok: false, error: sat.error, hint: sat.hint || null });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        url: sat.cachedUrl,
        imagery: sat.imagery || imageryCache.buildImageryRecord(address)
      });
      return true;
    }

    const viewMeta = body?.viewMeta || null;
    if (viewMeta && typeof ctx.fetchStreetViewFromViewMeta === 'function') {
      const fast = await ctx.fetchStreetViewFromViewMeta(address, key, viewMeta);
      if (fast?.ok) {
        sendJson(res, 200, {
          ok: true,
          url: fast.cachedUrl,
          imagery: fast.imagery || imageryCache.buildImageryRecord(address),
          source: 'viewmeta_fast'
        });
        return true;
      }
      if (fast && !fast.ok && fast.unavailable) {
        sendJson(res, 200, {
          ok: false,
          unavailable: true,
          error: fast.error || 'Imagery unavailable',
          imagery: imageryCache.buildImageryRecord(address)
        });
        return true;
      }
    }

    const sv = await fetchStreetViewPayload(address, key);
    if (!sv.ok) {
      sendJson(res, 200, {
        ok: false,
        unavailable: !!sv.unavailable,
        error: sv.error,
        hint: sv.hint || null,
        imagery: sv.imagery || imageryCache.buildImageryRecord(address)
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      url: sv.cachedUrl,
      imagery: sv.imagery || imageryCache.buildImageryRecord(address)
    });
    return true;
  });
}

module.exports = { register };