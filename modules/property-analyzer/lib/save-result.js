function isServerAheadRejection(body, incomingCount = 0) {
  if (!body?.rejected) return false;
  const kept = Number(body.kept) || 0;
  const incoming = Number(body.incoming ?? incomingCount) || 0;
  return kept > 0 && incoming <= kept;
}

function interpretServerBackupResponse(res, body = {}, opts = {}) {
  if (body.rejected) {
    const kept = body.kept ?? '?';
    const incoming = body.incoming ?? '?';
    if (isServerAheadRejection(body, opts.incomingCount)) {
      return { ok: true, reconciled: true, body };
    }
    return {
      ok: false,
      rejected: true,
      error: `Server kept newer backup (${kept} results, refused ${incoming})`,
      body
    };
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    return {
      ok: false,
      error: body.error || `Server save failed (HTTP ${status})`,
      body
    };
  }
  return { ok: true, body };
}

module.exports = { interpretServerBackupResponse, isServerAheadRejection };