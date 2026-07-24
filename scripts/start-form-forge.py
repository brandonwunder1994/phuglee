"""Start Form Forge without opening a browser — Distress OS orchestration only."""
from __future__ import annotations

import os
import sys
import threading
import time
import traceback
from pathlib import Path

FORGE_ROOT = Path(__file__).resolve().parent.parent / "modules" / "form-forge"

sys.path.insert(0, str(FORGE_ROOT))

from review_portal.app import app  # noqa: E402
from review_portal.data_guard import ensure_daily_snapshot, verify_integrity  # noqa: E402
from review_portal.govlist_pdf_promote import ensure_govlist_pdf_promote_on_boot  # noqa: E402

PORT = int(os.environ.get("FORM_FORGE_PORT", "8787"))
HOST = os.environ.get("FORM_FORGE_HOST", "127.0.0.1")
BOOT_LOG = Path(os.environ.get("FORGE_BOOT_LOG", "/tmp/forge-boot.log"))


def _log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        BOOT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with BOOT_LOG.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def _run_backup_check() -> None:
    """Run snapshot/integrity off the critical path so Flask binds immediately."""
    try:
        # Volume-safe: merge Government List PDF cities into registry + fill queue.
        ensure_govlist_pdf_promote_on_boot()
        snap = ensure_daily_snapshot()
        report = verify_integrity()
        _log(f"Data backup: {snap}")
        _log(
            f"Forms secured: {report['pdf_count']} PDFs | "
            f"{report['manifest_count']} manifest | "
            f"{report['layout_count']} layouts"
        )
        if not report["ok"]:
            _log("WARNING: integrity check found issues")
    except Exception as exc:
        _log(f"Backup check skipped: {exc}")


def _serve() -> None:
    production = os.environ.get("NODE_ENV") == "production"
    bind_host = HOST if HOST not in ("", "*") else "0.0.0.0"

    if production:
        try:
            from waitress import serve

            _log(f"Form Forge (waitress) binding {bind_host}:{PORT}")
            serve(app, host=bind_host, port=PORT, threads=8, channel_timeout=120)
            return
        except Exception as exc:
            _log(f"Waitress failed ({exc}); falling back to Flask")

    _log(f"Form Forge (flask) binding {bind_host}:{PORT}")
    # Distress OS loads env via Node; skip Flask dotenv so a Windows-1252 root .env
    # cannot crash boot (UnicodeDecodeError on non-UTF-8).
    app.run(
        host=bind_host,
        port=PORT,
        debug=False,
        use_reloader=False,
        threaded=True,
        load_dotenv=False,
    )


def main() -> None:
    _log(f"Form Forge starting on {HOST}:{PORT} (python {sys.version.split()[0]})")
    threading.Thread(target=_run_backup_check, name="forge-backup", daemon=True).start()

    while True:
        try:
            _serve()
            break
        except KeyboardInterrupt:
            _log("Form Forge stopped.")
            break
        except Exception as exc:
            _log(f"Server error: {exc}")
            traceback.print_exc()
            _log("Restarting in 2 seconds…")
            time.sleep(2)


if __name__ == "__main__":
    main()