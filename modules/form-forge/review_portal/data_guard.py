"""Durable writes, versioned backups, snapshots, and integrity checks for completed forms."""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT / "data" / "backups"
VERSIONS_ROOT = BACKUP_ROOT / "versions"
SNAPSHOTS_ROOT = BACKUP_ROOT / "snapshots"
LATEST_MIRROR = BACKUP_ROOT / "latest-mirror"
USER_FILLED = ROOT / "forms" / "user-filled"
LAYOUTS_DIR = ROOT / "data" / "form-layouts"
MANIFEST_PATH = ROOT / "data" / "completed-forms-manifest.json"
LOG_PATH = ROOT / "data" / "completed-forms-log.jsonl"
QUEUE_PATH = ROOT / "data" / "review-queue.json"
SETTINGS_PATH = ROOT / "config" / "settings.json"

PROTECTED_COPY_PATTERNS = (
    "user-filled",
    "form-layouts",
    "completed-forms-manifest.json",
    "completed-forms-log.jsonl",
    "review-queue.json",
    "portal-registry.json",
    "import-report.json",
    "submission-log.jsonl",
)


def fsync_file(path: Path) -> None:
    with path.open("rb") as fh:
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            pass


def atomic_write_bytes(dest: Path, data: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        tmp.write_bytes(data)
        fsync_file(tmp)
        tmp.replace(dest)
        fsync_file(dest)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def atomic_write_text(dest: Path, text: str, encoding: str = "utf-8") -> None:
    atomic_write_bytes(dest, text.encode(encoding))


def atomic_replace_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    src.replace(dest)
    fsync_file(dest)


def write_json_atomic(path: Path, data: object) -> None:
    atomic_write_text(path, json.dumps(data, indent=2))


def append_jsonl(path: Path, entry: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry) + "\n"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(line)
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            pass


def version_before_overwrite(path: Path, category: str) -> Path | None:
    if not path.exists() or path.stat().st_size == 0:
        return None
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = path.stem
    dest_dir = VERSIONS_ROOT / category / slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    backup = dest_dir / f"{ts}{path.suffix}"
    shutil.copy2(path, backup)
    fsync_file(backup)
    _prune_old_versions(dest_dir, keep=10)
    return backup


def _prune_old_versions(folder: Path, keep: int = 10) -> None:
    files = sorted(folder.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[keep:]:
        try:
            old.unlink()
        except OSError:
            pass


def mirror_completed_pdf(project_pdf: Path, state: str, slug: str) -> None:
    if not project_pdf.exists():
        return
    mirror = LATEST_MIRROR / "user-filled" / state / f"{slug}.pdf"
    mirror.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(project_pdf, mirror)
    fsync_file(mirror)


def mirror_layout(form_id: str) -> None:
    src = LAYOUTS_DIR / f"{form_id}.json"
    if not src.exists():
        return
    dest = LATEST_MIRROR / "form-layouts" / f"{form_id}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    fsync_file(dest)


def snapshot_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def create_full_snapshot(label: str | None = None) -> Path:
    """Copy all protected data to data/backups/snapshots/{timestamp}/."""
    ts = snapshot_timestamp()
    snap = SNAPSHOTS_ROOT / (f"{ts}-{label}" if label else ts)
    snap.mkdir(parents=True, exist_ok=False)

    if USER_FILLED.exists():
        shutil.copytree(USER_FILLED, snap / "user-filled")
    if LAYOUTS_DIR.exists():
        shutil.copytree(LAYOUTS_DIR, snap / "form-layouts")

    for rel in (
        "data/completed-forms-manifest.json",
        "data/completed-forms-log.jsonl",
        "data/review-queue.json",
        "data/portal-registry.json",
        "data/import-report.json",
        "data/submission-log.jsonl",
        "config/settings.json",
    ):
        src = ROOT / rel
        if src.exists():
            dest = snap / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

    marker = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "label": label or "auto",
        "path": str(snap),
    }
    write_json_atomic(snap / "snapshot-meta.json", marker)
    _prune_old_snapshots(keep=30)
    return snap


def _prune_old_snapshots(keep: int = 30) -> None:
    if not SNAPSHOTS_ROOT.exists():
        return
    snaps = sorted(SNAPSHOTS_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in snaps[keep:]:
        shutil.rmtree(old, ignore_errors=True)


def latest_snapshot_path() -> Path | None:
    if not SNAPSHOTS_ROOT.exists():
        return None
    snaps = sorted(SNAPSHOTS_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    return snaps[0] if snaps else None


def ensure_daily_snapshot() -> Path | None:
    """Create at most one automatic snapshot per calendar day."""
    today = datetime.now().date().isoformat()
    if SNAPSHOTS_ROOT.exists():
        for snap in sorted(SNAPSHOTS_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            meta_file = snap / "snapshot-meta.json"
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                    if meta.get("created_at", "")[:10] == today:
                        return snap
                except json.JSONDecodeError:
                    pass
            if datetime.fromtimestamp(snap.stat().st_mtime).date().isoformat() == today:
                return snap
    return create_full_snapshot(label="daily")


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def load_log_ids() -> set[str]:
    ids: set[str] = set()
    if not LOG_PATH.exists():
        return ids
    for line in LOG_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            ids.add(json.loads(line)["id"])
        except (json.JSONDecodeError, KeyError):
            continue
    return ids


def verify_integrity() -> dict:
    manifest = load_manifest()
    log_ids = load_log_ids()
    pdfs = {p.stem: p for p in USER_FILLED.rglob("*.pdf")}
    layouts = {p.stem for p in LAYOUTS_DIR.glob("*.json")} if LAYOUTS_DIR.exists() else set()

    missing_pdf = sorted(set(manifest) - set(pdfs))
    orphan_pdf = sorted(set(pdfs) - set(manifest))
    missing_layout = sorted(set(manifest) - layouts)
    stale_log_ids = sorted(log_ids - set(manifest) - set(pdfs))

    queue_completed = 0
    if QUEUE_PATH.exists():
        queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        queue_completed = sum(1 for i in queue.get("items", []) if i.get("status") == "completed")

    ok = not missing_pdf and not orphan_pdf
    return {
        "ok": ok,
        "manifest_count": len(manifest),
        "pdf_count": len(pdfs),
        "layout_count": len(layouts),
        "log_unique_ids": len(log_ids),
        "queue_completed": queue_completed,
        "missing_pdf_for_manifest": missing_pdf,
        "orphan_pdfs": orphan_pdf,
        "missing_layout_for_manifest": missing_layout,
        "stale_log_ids": stale_log_ids,
        "latest_snapshot": str(latest_snapshot_path() or ""),
        "backup_root": str(BACKUP_ROOT),
    }


def seed_latest_mirror() -> dict[str, int]:
    """Sync all existing completed PDFs and layouts into the rolling latest-mirror."""
    pdf_count = 0
    layout_count = 0
    if USER_FILLED.exists():
        for pdf in USER_FILLED.rglob("*.pdf"):
            mirror_completed_pdf(pdf, pdf.parent.name, pdf.stem)
            pdf_count += 1
    if LAYOUTS_DIR.exists():
        for layout in LAYOUTS_DIR.glob("*.json"):
            mirror_layout(layout.stem)
            layout_count += 1
    return {"pdfs": pdf_count, "layouts": layout_count}


def recover_project_pdf_from_desktop(desktop_pdf: Path, project_pdf: Path) -> bool:
    if project_pdf.exists() or not desktop_pdf.exists():
        return False
    project_pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(desktop_pdf, project_pdf)
    fsync_file(project_pdf)
    return True