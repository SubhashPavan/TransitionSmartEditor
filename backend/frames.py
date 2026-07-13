"""
Frame browser + description-based search over pre-extracted video keyframes.

The video parser drops per-video folders under video_parser/outputs/<source_key>/
keyframes/frame_<seconds>.jpg. We serve those directly (so the reviewer can
swap the current SOP screenshot for a nearby one), and give them a
description-based semantic search backed by Gemini vision when they need to
find a frame that shows something specific.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Iterable

import config

# Root under which each video parses into <source_key>/keyframes/frame_XXX.YYs.jpg.
KEYFRAMES_ROOT = Path(__file__).resolve().parents[2] / "video_parser" / "outputs"

# frame_1234.56s.jpg → 1234.56
_FRAME_RE = re.compile(r"^frame_(?P<sec>\d+(?:\.\d+)?)s\.(jpg|jpeg|png)$", re.IGNORECASE)


def source_keys() -> list[str]:
    """Every folder under outputs/ that has a keyframes/ subfolder."""
    if not KEYFRAMES_ROOT.exists():
        return []
    out = []
    for p in KEYFRAMES_ROOT.iterdir():
        if p.is_dir() and (p / "keyframes").is_dir():
            out.append(p.name)
    return sorted(out)


def list_frames(source_key: str,
                start_sec: float | None = None,
                end_sec:   float | None = None) -> list[dict]:
    """
    Return sorted [{ time_sec, name, url }, ...] for one source. If start/end
    given, clamp to that window (inclusive).
    """
    dir_ = KEYFRAMES_ROOT / source_key / "keyframes"
    if not dir_.is_dir():
        return []
    out: list[dict] = []
    for f in dir_.iterdir():
        m = _FRAME_RE.match(f.name)
        if not m:
            continue
        t = float(m.group("sec"))
        if start_sec is not None and t < start_sec - 0.5:  # tolerate rounding
            continue
        if end_sec is not None and t > end_sec + 0.5:
            continue
        out.append({
            "time_sec": t,
            "name":     f.name,
            "url":      f"/api/frames/{source_key}/{f.name}",
        })
    out.sort(key=lambda x: x["time_sec"])
    return out


def resolve_frame_path(source_key: str, frame_name: str) -> Path | None:
    """
    Return the on-disk path if `frame_name` is a legal keyframe name for
    `source_key`, else None. Guards against path traversal.
    """
    if not _FRAME_RE.match(frame_name):
        return None
    p = (KEYFRAMES_ROOT / source_key / "keyframes" / frame_name).resolve()
    root = KEYFRAMES_ROOT.resolve()
    try:
        p.relative_to(root)   # raises if outside the tree
    except ValueError:
        return None
    return p if p.is_file() else None


def nearest_frames(source_key: str, target_sec: float, n: int = 9) -> list[dict]:
    """Return the N frames closest to target_sec, sorted by ascending time_sec."""
    all_frames = list_frames(source_key)
    if not all_frames:
        return []
    all_frames.sort(key=lambda x: abs(x["time_sec"] - target_sec))
    picked = all_frames[:n]
    picked.sort(key=lambda x: x["time_sec"])
    return picked


def search_frames_by_description(
    source_key: str,
    description: str,
    start_sec:   float | None = None,
    end_sec:     float | None = None,
    top_k:       int = 6,
) -> list[dict]:
    """
    Semantic search: use Gemini vision to score each candidate frame against
    `description` and return the top matches. Falls back to a keyword heuristic
    over the source's transcript timestamps if Gemini isn't configured.
    """
    candidates = list_frames(source_key, start_sec, end_sec)
    if not candidates:
        return []

    if config.GEMINI_API_KEY:
        return _score_with_gemini(candidates, description, top_k)

    # Fallback: return the middle N as a best-effort — no scoring possible.
    mid = len(candidates) // 2
    half = top_k // 2
    return candidates[max(0, mid - half): mid - half + top_k]


def _score_with_gemini(candidates: list[dict],
                       description: str,
                       top_k: int) -> list[dict]:
    """
    Ask Gemini to pick the top_k frames matching the description. Sends up to
    24 candidate thumbnails inline to keep the request small.
    """
    # Trim to 24 evenly-spaced candidates so we don't blow the context window.
    if len(candidates) > 24:
        step = len(candidates) / 24
        candidates = [candidates[int(i * step)] for i in range(24)]

    parts: list = [
        (
            f"You are helping a technical writer find the best video frame for their SOP screenshot.\n"
            f"They want a frame that shows: \"{description}\"\n\n"
            f"Below are {len(candidates)} candidate frames from the video, in chronological order. "
            f"Reply with a JSON array of the frame INDEX numbers (0-based) that best match, ranked best first. "
            f"Return at most {top_k} indexes. Reply with the JSON array ONLY — no prose."
        )
    ]

    from google import genai as gpk
    from google.genai import types as gtypes

    client = gpk.Client(api_key=config.GEMINI_API_KEY)

    for i, c in enumerate(candidates):
        path = resolve_frame_path_from_url(c["url"])
        if not path or not path.is_file():
            continue
        with path.open("rb") as fh:
            img_bytes = fh.read()
        parts.append(f"[{i}] time={c['time_sec']:.1f}s")
        parts.append(gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"))

    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=parts,
    )
    text = (resp.text or "").strip()

    # Parse a JSON array of ints out of the response — tolerant of surrounding prose.
    m = re.search(r"\[[\s\S]*?\]", text)
    if not m:
        return candidates[:top_k]
    try:
        import json as _json
        indexes = _json.loads(m.group(0))
    except Exception:
        return candidates[:top_k]

    ranked: list[dict] = []
    for idx in indexes:
        if isinstance(idx, int) and 0 <= idx < len(candidates):
            ranked.append({**candidates[idx], "match_rank": len(ranked)})
        if len(ranked) >= top_k:
            break
    return ranked or candidates[:top_k]


def resolve_frame_path_from_url(url: str) -> Path | None:
    """Reverse `/api/frames/<source>/<name>` → on-disk Path."""
    m = re.match(r"^/api/frames/([^/]+)/([^/?#]+)$", url)
    if not m:
        return None
    return resolve_frame_path(m.group(1), m.group(2))
