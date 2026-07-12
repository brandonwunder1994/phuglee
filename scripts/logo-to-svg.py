#!/usr/bin/env python3
"""
logo-to-svg.py — Internal brand tool: raster logo → clean transparent SVG.

Removes near-black backgrounds, extracts the letterform silhouette, and
emits a crisp multi-path SVG suitable for dark UI (cream fill by default).

Usage:
  python scripts/logo-to-svg.py "C:\\Users\\brand\\Desktop\\The Other Guys.jpg"
  python scripts/logo-to-svg.py input.png -o public/images/the-other-guys.svg
  python scripts/logo-to-svg.py input.jpg --fill "#f4efe6" --threshold 28

Dependencies: Pillow, numpy, scikit-image (already used in this repo).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def _require_skimage():
    try:
        from skimage import measure, morphology  # noqa: F401
        from skimage.filters import gaussian
        from scipy import ndimage  # noqa: F401
    except ImportError as exc:
        print(
            "Missing dependency. Install with:\n"
            "  pip install scikit-image scipy pillow numpy",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc


def load_rgba(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    return np.asarray(img, dtype=np.uint8)


def luminance(rgba: np.ndarray) -> np.ndarray:
    r = rgba[..., 0].astype(np.float32)
    g = rgba[..., 1].astype(np.float32)
    b = rgba[..., 2].astype(np.float32)
    a = rgba[..., 3].astype(np.float32) / 255.0
    # Treat fully transparent as black background
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return lum * a


def extract_letter_mask(
    rgba: np.ndarray,
    threshold: float = 28.0,
    close_radius: int = 1,
    mode: str = "ink",
) -> np.ndarray:
    """
    Build a boolean mask of the logo ink.

    Modes
    -----
    ink (default)
        Keeps bright / cream pixels only (the visible rim lettering).
        Black letter fills + black background become transparent — correct for
        dark UI where the original black fill would already disappear.
    silhouette
        Near-black regions connected to the image border are background;
        everything else (cream + enclosed dark letter bodies) becomes a solid
        silhouette. Counters may fill in — prefer `ink` for outlined logos.
    """
    from scipy import ndimage
    from skimage.morphology import closing, disk

    h, w = rgba.shape[:2]
    lum = luminance(rgba)
    alpha = rgba[..., 3]

    if mode == "silhouette":
        is_dark = (lum <= threshold) | (alpha < 8)
        labeled, n = ndimage.label(is_dark)
        if n == 0:
            return lum > max(threshold * 3, 80)

        border = np.zeros_like(is_dark, dtype=bool)
        border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
        border_labels = set(np.unique(labeled[border]))
        border_labels.discard(0)
        is_bg = np.isin(labeled, list(border_labels))
        letter = ~is_bg
    else:
        # Bright ink on dark ground (cream outline logos like "The Other Guys")
        ink_cut = max(threshold * 2.5, 70.0)
        letter = (lum >= ink_cut) & (alpha >= 8)

    if close_radius > 0:
        letter = closing(letter, disk(close_radius))

    # Drop tiny islands (noise / JPEG artifacts)
    labeled_l, n_l = ndimage.label(letter)
    if n_l:
        sizes = ndimage.sum(letter, labeled_l, index=range(1, n_l + 1))
        min_size = max(24, int((h * w) * 0.00005))
        keep = {i + 1 for i, s in enumerate(sizes) if s >= min_size}
        letter = np.isin(labeled_l, list(keep)) if keep else letter

    return letter


def _rdp(points: np.ndarray, epsilon: float) -> np.ndarray:
    """Ramer–Douglas–Peucker polyline simplification."""
    if len(points) < 3 or epsilon <= 0:
        return points

    start, end = points[0], points[-1]
    se = end - start
    se_len = float(np.linalg.norm(se))
    if se_len < 1e-9:
        dists = np.linalg.norm(points - start, axis=1)
    else:
        # perpendicular distance to line segment
        nums = np.abs(se[0] * (start[1] - points[:, 1]) - (start[0] - points[:, 0]) * se[1])
        dists = nums / se_len

    idx = int(np.argmax(dists))
    if dists[idx] > epsilon:
        left = _rdp(points[: idx + 1], epsilon)
        right = _rdp(points[idx:], epsilon)
        return np.vstack([left[:-1], right])
    return np.vstack([start, end])


def mask_to_svg_paths(
    mask: np.ndarray,
    simplify: float = 1.2,
) -> tuple[list[str], int, int]:
    """Trace mask contours → SVG path `d` strings. Returns (paths, width, height)."""
    from skimage import measure

    h, w = mask.shape
    # pad so border-touching shapes close cleanly
    padded = np.pad(mask.astype(float), 1, mode="constant", constant_values=0)
    contours = measure.find_contours(padded, 0.5)

    paths: list[str] = []
    for contour in contours:
        # undo pad; skimage returns (row, col) = (y, x)
        pts = (contour - 1.0)[:, ::-1]
        if len(pts) < 4:
            continue

        # True geometric simplification (keeps letter corners)
        epsilon = max(0.35, float(simplify) * 0.65)
        pts = _rdp(pts, epsilon)
        if len(pts) < 3:
            continue

        parts = [f"M {pts[0, 0]:.2f} {pts[0, 1]:.2f}"]
        for x, y in pts[1:]:
            parts.append(f"L {x:.2f} {y:.2f}")
        parts.append("Z")
        paths.append(" ".join(parts))

    return paths, w, h


def crop_mask(mask: np.ndarray, pad: int = 8) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return mask, (0, 0, mask.shape[1], mask.shape[0])
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(mask.shape[0], int(ys.max()) + 1 + pad)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(mask.shape[1], int(xs.max()) + 1 + pad)
    return mask[y0:y1, x0:x1], (x0, y0, x1, y1)


def write_svg(
    paths: list[str],
    width: int,
    height: int,
    out: Path,
    fill: str = "#f4efe6",
    title: str = "Logo",
) -> None:
    # evenodd so counters (holes in O, R, A, etc.) punch out correctly
    path_els = "\n".join(
        f'  <path d="{d}" fill="{fill}" fill-rule="evenodd"/>' for d in paths
    )
    # Prefer a single compound path for correct hole winding with evenodd
    if len(paths) > 1:
        compound = " ".join(paths)
        path_els = f'  <path d="{compound}" fill="{fill}" fill-rule="evenodd"/>'

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="{width}" height="{height}"
     viewBox="0 0 {width} {height}"
     role="img"
     aria-label="{title}"
     preserveAspectRatio="xMidYMid meet">
  <title>{title}</title>
{path_els}
</svg>
'''
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")


def write_transparent_png(mask: np.ndarray, rgba_src: np.ndarray, bbox, out: Path, cream_rgb=(244, 239, 230)) -> None:
    """Optional diagnostic PNG: cream letterforms on transparent bg."""
    x0, y0, x1, y1 = bbox
    crop = mask
    h, w = crop.shape
    out_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    out_rgba[crop, 0] = cream_rgb[0]
    out_rgba[crop, 1] = cream_rgb[1]
    out_rgba[crop, 2] = cream_rgb[2]
    out_rgba[crop, 3] = 255
    Image.fromarray(out_rgba, "RGBA").save(out)


def convert(
    src: Path,
    dest: Path,
    fill: str = "#f4efe6",
    threshold: float = 28.0,
    simplify: float = 1.2,
    title: str = "The Other Guys",
    also_png: bool = True,
    mode: str = "ink",
) -> Path:
    _require_skimage()
    rgba = load_rgba(src)
    mask = extract_letter_mask(rgba, threshold=threshold, mode=mode)
    cropped, bbox = crop_mask(mask, pad=10)
    paths, w, h = mask_to_svg_paths(cropped, simplify=simplify)
    if not paths:
        raise SystemExit(f"No letterforms detected in {src} (try lowering --threshold)")

    write_svg(paths, w, h, dest, fill=fill, title=title)

    if also_png:
        png_path = dest.with_suffix(".png")
        write_transparent_png(cropped, rgba, bbox, png_path)
        print(f"Wrote transparent PNG: {png_path}")

    print(f"Wrote SVG: {dest}  ({w}×{h}, {len(paths)} contour group(s), mode={mode})")
    return dest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert a logo raster (black bg) to a clean transparent SVG."
    )
    parser.add_argument("input", type=Path, help="Source image (.jpg/.png)")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output .svg path (default: public/images/<slug>.svg)",
    )
    parser.add_argument("--fill", default="#f4efe6", help="SVG fill color (Phuglee cream default)")
    parser.add_argument(
        "--threshold",
        type=float,
        default=28.0,
        help="Luminance cutoff for near-black background (0–255)",
    )
    parser.add_argument(
        "--simplify",
        type=float,
        default=1.2,
        help="Contour point stride (>1 = simpler paths)",
    )
    parser.add_argument("--title", default="The Other Guys", help="SVG <title> / aria-label")
    parser.add_argument(
        "--mode",
        choices=("ink", "silhouette"),
        default="ink",
        help="ink = bright outline only (best for cream-on-black logos); "
        "silhouette = solid letter bodies",
    )
    parser.add_argument("--no-png", action="store_true", help="Skip companion transparent PNG")
    args = parser.parse_args(argv)

    src = args.input.expanduser().resolve()
    if not src.is_file():
        print(f"Input not found: {src}", file=sys.stderr)
        return 1

    if args.output:
        dest = args.output.expanduser().resolve()
    else:
        # Prefer project public/images when run from repo
        repo_images = Path(__file__).resolve().parent.parent / "public" / "images"
        slug = src.stem.lower().replace(" ", "-")
        dest = (repo_images if repo_images.is_dir() else src.parent) / f"{slug}.svg"

    convert(
        src,
        dest,
        fill=args.fill,
        threshold=args.threshold,
        simplify=args.simplify,
        title=args.title,
        also_png=not args.no_png,
        mode=args.mode,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
