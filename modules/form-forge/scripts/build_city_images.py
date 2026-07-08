#!/usr/bin/env python3
"""Curate hero images for coverage city profiles (Wikimedia → Pexels → Unsplash → gradient)."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_PATH = ROOT / "data" / "coverage-map-bootstrap.json"
OUT_JSON = ROOT / "data" / "city-images.json"
OUT_DIR = ROOT / "review_portal" / "static" / "city-images"

PEXELS_KEY = os.environ.get("PEXELS_API_KEY", "")
UNSPLASH_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")

WIKI_UA = "PhugleeCoverageBot/1.0 (city profile images; contact: support@phuglee.local)"
REQUEST_GAP_SEC = 1.1


def load_cities() -> list[dict]:
    data = json.loads(BOOTSTRAP_PATH.read_text(encoding="utf-8"))
    return data.get("cities", [])


def slugify(city_id: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", city_id.lower())


def http_json(url: str, headers: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": WIKI_UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def download_file(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": WIKI_UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            dest.write_bytes(resp.read())
        return dest.stat().st_size > 4000
    except Exception:
        return False


def score_photo(width: int, height: int, alt: str, query: str) -> int:
    if width < 1200 or height < 675:
        return 0
    ratio = width / max(height, 1)
    if ratio < 1.2 or ratio > 2.4:
        return 1
    alt_l = (alt or "").lower()
    q = query.lower()
    city_part = q.split()[0]
    score = 2
    if city_part in alt_l:
        score += 3
    for word in ("skyline", "downtown", "city", "aerial", "buildings"):
        if word in alt_l:
            score += 1
    return score


def search_wikimedia(city: str, state: str) -> dict | None:
    query = f"{city}, {state}"
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": 8,
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": 1920,
            "format": "json",
        }
    )
    data = http_json(f"https://commons.wikimedia.org/w/api.php?{params}")
    if not data:
        return None
    pages = data.get("query", {}).get("pages", {})
    best = None
    best_score = 0
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        w = int(info.get("width") or 0)
        h = int(info.get("height") or 0)
        title = page.get("title", "")
        s = score_photo(w, h, title, query)
        if s > best_score:
            best_score = s
            meta = (info.get("extmetadata") or {}).get("Artist", {}).get("value", "Wikimedia")
            best = {
                "url": info.get("url") or info.get("thumburl"),
                "credit": re.sub("<[^>]+>", "", meta)[:80] or "Wikimedia Commons",
                "credit_url": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page.get('title', ''))}",
                "source": "Wikimedia Commons",
            }
    return best if best_score >= 3 else None


def search_pexels(city: str, state: str) -> dict | None:
    if not PEXELS_KEY:
        return None
    query = urllib.parse.quote(f"{city} {state} skyline")
    data = http_json(
        f"https://api.pexels.com/v1/search?query={query}&per_page=5&orientation=landscape",
        headers={"Authorization": PEXELS_KEY, "User-Agent": WIKI_UA},
    )
    if not data:
        return None
    photos = data.get("photos") or []
    best = None
    best_score = 0
    for photo in photos:
        w = int(photo.get("width") or 0)
        h = int(photo.get("height") or 0)
        alt = photo.get("alt") or ""
        s = score_photo(w, h, alt, f"{city} {state}")
        if s > best_score:
            best_score = s
            src = photo.get("src") or {}
            best = {
                "url": src.get("large2x") or src.get("large") or src.get("original"),
                "credit": photo.get("photographer") or "Pexels",
                "credit_url": photo.get("photographer_url") or photo.get("url"),
                "source": "Pexels",
            }
    return best if best_score >= 2 else None


def search_unsplash(city: str, state: str) -> dict | None:
    if not UNSPLASH_KEY:
        return None
    query = urllib.parse.quote(f"{city},{state},skyline")
    data = http_json(
        f"https://api.unsplash.com/search/photos?query={query}&per_page=5&orientation=landscape",
        headers={"Authorization": f"Client-ID {UNSPLASH_KEY}", "User-Agent": WIKI_UA},
    )
    if not data:
        return None
    results = data.get("results") or []
    best = None
    best_score = 0
    for photo in results:
        w = int(photo.get("width") or 0)
        h = int(photo.get("height") or 0)
        alt = photo.get("alt_description") or photo.get("description") or ""
        s = score_photo(w, h, alt, f"{city} {state}")
        if s > best_score:
            best_score = s
            urls = photo.get("urls") or {}
            user = photo.get("user") or {}
            best = {
                "url": urls.get("regular") or urls.get("full"),
                "credit": user.get("name") or "Unsplash",
                "credit_url": user.get("links", {}).get("html") or photo.get("links", {}).get("html"),
                "source": "Unsplash",
            }
    return best if best_score >= 2 else None


def curate_city(city: dict) -> dict:
    name = city["city"]
    state = city["state"]
    for finder in (search_wikimedia, search_pexels, search_unsplash):
        hit = finder(name, state)
        time.sleep(REQUEST_GAP_SEC)
        if hit and hit.get("url"):
            return {"type": "photo", **hit}
    return {"type": "gradient"}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if OUT_JSON.exists():
        existing = json.loads(OUT_JSON.read_text(encoding="utf-8")).get("cities", {})

    cities = load_cities()
    manifest: dict[str, dict] = dict(existing)
    updated = 0

    for i, city in enumerate(cities, start=1):
        cid = city["id"]
        if cid in manifest and manifest[cid].get("local"):
            continue

        print(f"[{i}/{len(cities)}] {city['city']}, {city['state']} …", flush=True)
        meta = curate_city(city)
        if meta.get("type") == "photo" and meta.get("url"):
            filename = f"{slugify(cid)}.jpg"
            dest = OUT_DIR / filename
            if download_file(meta["url"], dest):
                manifest[cid] = {
                    "local": filename,
                    "credit": meta.get("credit", ""),
                    "credit_url": meta.get("credit_url", ""),
                    "source": meta.get("source", ""),
                    "type": "photo",
                }
                updated += 1
            else:
                manifest[cid] = {"type": "gradient"}
        else:
            manifest[cid] = {"type": "gradient"}

        if i % 10 == 0:
            OUT_JSON.write_text(json.dumps({"cities": manifest}, indent=2), encoding="utf-8")

    OUT_JSON.write_text(json.dumps({"cities": manifest}, indent=2), encoding="utf-8")
    photos = sum(1 for m in manifest.values() if m.get("local"))
    print(f"Done — {photos} photos, {len(manifest) - photos} gradients ({updated} new downloads)")


if __name__ == "__main__":
    main()