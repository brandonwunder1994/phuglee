from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from review_portal.data_guard import (
    MANIFEST_PATH,
    append_jsonl,
    fsync_file,
    load_manifest,
    mirror_completed_pdf,
    mirror_layout,
    recover_project_pdf_from_desktop,
    version_before_overwrite,
    write_json_atomic,
)
from review_portal.settings import desktop_dir, load_settings

ROOT = Path(__file__).resolve().parents[1]
USER_FILLED = ROOT / "forms" / "user-filled"
RAW_FORMS = ROOT / "forms" / "raw"
LOG_PATH = ROOT / "data" / "completed-forms-log.jsonl"


def filled_path(state: str, slug: str) -> Path:
    return USER_FILLED / state / f"{slug}.pdf"


def desktop_path(state: str, city: str) -> Path:
    safe = f"{city} - {state}.pdf".replace("/", "-")
    return desktop_dir() / state / safe


def record_save(item: dict, project_rel_path: str, source: str = "editor") -> dict:
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    slug = item["id"]
    state = item["state"]
    city = item["city"]

    src = ROOT / project_rel_path.replace("/", "\\") if "\\" in project_rel_path else ROOT / project_rel_path
    if not src.exists():
        src = filled_path(state, slug)
    if not src.exists():
        raise FileNotFoundError(f"Saved PDF missing before mirror: {src}")
    fsync_file(src)

    desk_root = desktop_dir()
    desk_root.mkdir(parents=True, exist_ok=True)
    desktop = desktop_path(state, city)
    desktop.parent.mkdir(parents=True, exist_ok=True)
    version_before_overwrite(desktop, "desktop")
    shutil.copy2(src, desktop)
    fsync_file(desktop)

    mirror_completed_pdf(src, state, slug)
    if source == "editor":
        mirror_layout(slug)

    entry = {
        "saved_at": now_iso,
        "id": slug,
        "state": state,
        "city": city,
        "email": item.get("email", ""),
        "source": source,
        "project_path": str(src),
        "desktop_path": str(desktop),
    }

    append_jsonl(LOG_PATH, entry)

    manifest = load_manifest()
    manifest[slug] = entry
    write_json_atomic(MANIFEST_PATH, manifest)
    _write_progress_file(manifest)

    return {
        "project_path": str(src),
        "desktop_path": str(desktop),
        "saved_at": now_iso,
        "completed_count": len(manifest),
    }


def _write_progress_file(manifest: dict) -> None:
    progress_path = desktop_dir() / "PROGRESS.txt"
    lines = [
        "COMPLETED CITY FORMS — auto-updated on each save",
        f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"Total completed: {len(manifest)}",
        "",
        "City | State | Saved",
        "-" * 50,
    ]
    for entry in sorted(manifest.values(), key=lambda e: (e["state"], e["city"])):
        lines.append(f"{entry['city']} | {entry['state']} | {entry['saved_at'][:19]}")
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    fsync_file(progress_path)


def sync_queue_from_disk(queue: dict) -> dict:
    manifest = load_manifest()
    completed = 0
    missing = 0
    for item in queue.get("items", []):
        slug = item["id"]
        state = item["state"]
        city = item["city"]
        raw = RAW_FORMS / state / f"{slug}.pdf"
        proj = filled_path(state, slug)
        desk = desktop_path(state, city)

        if raw.exists():
            item["raw_path"] = str(raw.relative_to(ROOT)).replace("\\", "/")

        if not proj.exists() and desk.exists():
            recover_project_pdf_from_desktop(desk, proj)

        if proj.exists():
            item["status"] = "completed"
            item["user_filled_path"] = str(proj.relative_to(ROOT)).replace("\\", "/")
            if desk.exists():
                item["desktop_path"] = str(desk)
            if slug in manifest:
                item["saved_at"] = manifest[slug].get("saved_at")
            completed += 1
        elif raw.exists():
            item["status"] = "pending"
            item.pop("user_filled_path", None)
            item.pop("desktop_path", None)
            item.pop("saved_at", None)
        else:
            item["status"] = "missing_pdf"
            item["raw_path"] = ""
            missing += 1

    queue["stats"] = queue.get("stats", {})
    total = len(queue.get("items", []))
    queue["stats"]["completed"] = completed
    queue["stats"]["missing_pdf"] = missing
    queue["stats"]["pending"] = total - completed - missing
    return queue


def save_locations() -> dict:
    settings = load_settings()
    desk = settings["paths"]["desktop_folder"]
    return {
        "project_folder": str(USER_FILLED),
        "desktop_folder": desk,
        "progress_file": str(Path(desk) / "PROGRESS.txt"),
        "backup_folder": str(ROOT / "data" / "backups"),
    }