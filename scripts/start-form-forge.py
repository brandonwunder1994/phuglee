"""Start Form Forge without opening a browser — Distress OS orchestration only."""
from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

FORGE_ROOT = Path(__file__).resolve().parent.parent / "modules" / "form-forge"
if not FORGE_ROOT.exists():
    FORGE_ROOT = Path(__file__).resolve().parent.parent.parent / "city-list-requests"

sys.path.insert(0, str(FORGE_ROOT))

from review_portal.app import app  # noqa: E402
from review_portal.data_guard import ensure_daily_snapshot, verify_integrity  # noqa: E402

PORT = 8787
HOST = "127.0.0.1"


def main() -> None:
    print(f"\n  Form Forge (Distress OS): http://{HOST}:{PORT}\n")
    try:
        snap = ensure_daily_snapshot()
        report = verify_integrity()
        print(f"  Data backup: {snap}")
        print(
            f"  Forms secured: {report['pdf_count']} PDFs | "
            f"{report['manifest_count']} manifest | "
            f"{report['layout_count']} layouts"
        )
        if not report["ok"]:
            print("  WARNING: integrity check found issues")
    except Exception as exc:
        print(f"  Backup check skipped: {exc}")

    while True:
        try:
            app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
            break
        except KeyboardInterrupt:
            print("\n  Form Forge stopped.")
            break
        except Exception as exc:
            print(f"\n  Server error: {exc}")
            traceback.print_exc()
            print("  Restarting in 2 seconds…")
            time.sleep(2)


if __name__ == "__main__":
    main()