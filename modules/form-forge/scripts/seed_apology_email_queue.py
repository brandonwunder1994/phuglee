"""Seed the one-time apology email queue from manually completed forms on 2026-07-04."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "completed-forms-manifest.json"
QUEUE_PATH = ROOT / "data" / "apology-email-queue.json"


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    city_ids = sorted(manifest.keys())
    existing = {"pending": [], "sent": {}}
    if QUEUE_PATH.exists():
        try:
            existing = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    sent = dict(existing.get("sent") or {})
    pending = [cid for cid in city_ids if cid not in sent]
    payload = {"pending": pending, "sent": sent}
    QUEUE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Seeded apology queue: {len(pending)} pending, {len(sent)} already sent")


if __name__ == "__main__":
    main()