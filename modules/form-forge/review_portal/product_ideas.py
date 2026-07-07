"""Product idea backlog stored in data/product-ideas.json."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from review_portal.data_guard import write_json_atomic

ROOT = Path(__file__).resolve().parents[1]
IDEAS_PATH = ROOT / "data" / "product-ideas.json"

DEFAULT_IDEAS = [
    {
        "id": "tiered-service-model",
        "text": (
            "Add a done-for-you service where you fill out all the PDFs needed for the person you are "
            "selling this to, OR sell the PDF fill-out tool and system as an add-on. Two tiers: "
            "Lite (access to 5 cities) and Pro (unlimited access plus tools to help manage the city "
            "data they are pulling)."
        ),
        "created_at": "2026-07-05T00:00:00+00:00",
    },
    {
        "id": "product-walkthroughs",
        "text": "Walkthroughs on how to use the tool to get the most out of it.",
        "created_at": "2026-07-05T00:00:01+00:00",
    },
]


class ProductIdeasError(ValueError):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_store() -> dict:
    return {"version": 1, "ideas": list(DEFAULT_IDEAS)}


def load_ideas() -> dict:
    if not IDEAS_PATH.exists():
        data = _default_store()
        save_ideas(data)
        return data
    import json

    raw = json.loads(IDEAS_PATH.read_text(encoding="utf-8"))
    ideas = raw.get("ideas")
    if not isinstance(ideas, list):
        return _default_store()
    return {"version": raw.get("version", 1), "ideas": ideas}


def save_ideas(data: dict) -> None:
    write_json_atomic(IDEAS_PATH, data)


def list_ideas() -> list[dict]:
    data = load_ideas()
    ideas = sorted(data.get("ideas", []), key=lambda item: item.get("created_at", ""), reverse=True)
    return [
        {
            "id": item.get("id", ""),
            "text": item.get("text", ""),
            "created_at": item.get("created_at", ""),
        }
        for item in ideas
        if str(item.get("text", "")).strip()
    ]


def add_idea(text: str) -> dict:
    cleaned = str(text or "").strip()
    if not cleaned:
        raise ProductIdeasError("Idea text is required")
    if len(cleaned) > 4000:
        raise ProductIdeasError("Idea text is too long (max 4000 characters)")

    data = load_ideas()
    idea = {"id": f"idea-{uuid4().hex[:12]}", "text": cleaned, "created_at": _now_iso()}
    ideas = list(data.get("ideas") or [])
    ideas.insert(0, idea)
    data["ideas"] = ideas
    save_ideas(data)
    return idea