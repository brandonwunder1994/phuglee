"""Bulk-cache Street View thumbnails on Railway using session viewMeta (one Google call each)."""
import json
import time
import urllib.error
import urllib.request

BASE = "https://phuglee-production.up.railway.app/analyzer"
USER = "admin"
DELAY_SEC = 0.35
PAGE_SIZE = 500


def api_json(path, method="GET", body=None, headers=None):
    hdrs = {"X-Phuglee-User": USER, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=hdrs, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_all_results():
    summary = api_json("/api/session-summary?lite=1")
    if not summary.get("ok") and summary.get("results") is None:
        raise RuntimeError(f"session-summary failed: {summary}")
    total = int(summary.get("results") or 0)
    if not total:
        backup = api_json("/api/session-backup")
        session = backup.get("session") or {}
        return session.get("results") or []
    out = []
    offset = 0
    while offset < total:
        page = api_json(f"/api/session-results?offset={offset}&limit={PAGE_SIZE}")
        chunk = page.get("results") or []
        if not chunk:
            break
        out.extend(chunk)
        offset += len(chunk)
        if not page.get("hasMore"):
            break
    return out


def eligible(result):
    if not result.get("address"):
        return False
    if result.get("skippedStreetView"):
        return False
    if "no_streetview" in (result.get("qualityFlags") or []):
        return False
    return True


def main():
    status = api_json("/api/imagery/status")
    print("Imagery before:", status)

    results = load_all_results()
    print(f"Session results: {len(results)}")

    migrated = 0
    skipped = 0
    failed = 0
    for i, r in enumerate(results):
        if not eligible(r):
            skipped += 1
            continue
        addr = r["address"]
        body = {"address": addr, "type": "streetview", "viewMeta": r.get("viewMeta")}
        try:
            data = api_json("/api/imagery/cache-one", method="POST", body=body)
        except urllib.error.HTTPError as err:
            print(f"HTTP {err.code} {addr[:50]}")
            failed += 1
            time.sleep(DELAY_SEC)
            continue
        if data.get("alreadyCached"):
            skipped += 1
        elif data.get("ok"):
            migrated += 1
            if migrated % 25 == 0:
                print(f"  cached {migrated} … latest {addr[:48]}")
        else:
            failed += 1
        time.sleep(DELAY_SEC)

    after = api_json("/api/imagery/status")
    print(f"\nDone. migrated={migrated} skipped={skipped} failed={failed}")
    print("Imagery after:", after)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())