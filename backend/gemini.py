"""
Gemini helper for the sop-editor backend.

For each source video we:
  1. Download the .mp4 from Azure Blob to a local cache (first request only).
  2. Upload that file to the Gemini Files API (first request only, per 48h).
  3. Reference the uploaded file URI in each generation call, telling Gemini
     to focus on a specific `start_offset` / `end_offset` — real video-segment
     understanding, not a text hint.

Caching:
  • Local .mp4 cached at CACHE_DIR/<source_id>
  • Gemini file URI cached at CACHE_DIR/gemini_files.json
    { source_id: { file_name, uri, mime_type, uploaded_at } }

  Files uploaded to Gemini expire after 48 hours. Before each generation we
  refresh the state; if the file is missing / expired we re-upload.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from datetime import datetime, timezone
from threading import Lock

from google import genai
from google.genai import types as gtypes

import config
import blob as blob_mod


_CACHE_FILE = config.CACHE_DIR / "gemini_files.json"
_lock = Lock()
_client: genai.Client | None = None


def _cli() -> genai.Client:
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _load_cache() -> dict:
    if not _CACHE_FILE.exists():
        return {}
    try:
        return json.loads(_CACHE_FILE.read_text())
    except Exception:
        return {}


def _save_cache(d: dict) -> None:
    _CACHE_FILE.write_text(json.dumps(d, indent=2))


# ── Local mp4 cache ─────────────────────────────────────

def _local_path_for(source_id: str) -> Path:
    return config.CACHE_DIR / source_id


def _download_blob_if_needed(source_id: str) -> Path:
    """Ensure the source blob exists locally. Returns the local path."""
    local = _local_path_for(source_id)
    src = blob_mod.get_source(source_id)
    if not src:
        raise ValueError(f"Source '{source_id}' not found in Blob")

    # Fast path: local size matches blob size → skip re-download.
    if local.exists() and local.stat().st_size == src.size_bytes:
        return local

    # Stream blob to disk
    client = blob_mod.blob_client(src.blob_name)
    with local.open("wb") as fh:
        stream = client.download_blob()
        for chunk in stream.chunks():
            fh.write(chunk)
    return local


# ── Gemini file cache ───────────────────────────────────

def _ensure_uploaded(source_id: str) -> gtypes.File:
    """Return a live Gemini File for this source, uploading if needed."""
    with _lock:
        cache = _load_cache()
        entry = cache.get(source_id)
        client = _cli()

        # Re-verify a cached file is still ACTIVE.
        if entry:
            try:
                remote = client.files.get(name=entry["file_name"])
                if remote.state and remote.state.name in ("ACTIVE",):
                    return remote
                # Any other state (FAILED, PROCESSING that stalled, missing) → re-upload.
            except Exception:
                pass  # Cache miss on remote — will re-upload below.

        # Upload path
        local_path = _download_blob_if_needed(source_id)
        src = blob_mod.get_source(source_id)
        mime = (src.content_type or "video/mp4") if src else "video/mp4"

        uploaded = client.files.upload(
            file=str(local_path),
            config={"mime_type": mime, "display_name": source_id},
        )

        # Wait for it to become ACTIVE (video processing).
        wait_start = time.time()
        while uploaded.state and uploaded.state.name == "PROCESSING":
            if time.time() - wait_start > 300:
                raise RuntimeError(f"Gemini processing timeout for '{source_id}'")
            time.sleep(2)
            uploaded = client.files.get(name=uploaded.name)

        if not uploaded.state or uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file for '{source_id}' ended in state {uploaded.state}")

        cache[source_id] = {
            "file_name":  uploaded.name,
            "uri":        uploaded.uri,
            "mime_type":  uploaded.mime_type,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_cache(cache)
        return uploaded


# ── Generation ──────────────────────────────────────────

def generate_segment_steps(
    *,
    source_id: str,
    start_sec: float,
    end_sec: float,
    notes: str,
    target_context: str | None = None,
) -> tuple[str, dict]:
    """Send the video segment + reviewer notes to Gemini and get back SOP steps.

    Returns (raw_text, meta). Meta includes cached file info and the prompt
    that was actually sent, useful for debugging.
    """
    file_obj = _ensure_uploaded(source_id)

    fmt = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"
    prompt_lines = [
        "You are an SOP writer. Watch the referenced segment of the video and generate a numbered list of SOP steps.",
        "",
        f"Video: {source_id}",
        f"Segment: {fmt(start_sec)} → {fmt(end_sec)}   ({int(end_sec - start_sec)}s)",
    ]
    if target_context:
        prompt_lines.append(f"Target section: {target_context}")
    prompt_lines += ["", "Reviewer notes (verbatim — treat numbered lines as your step outline, [MM:SS] as timestamp cites):"]
    prompt_lines.append(notes.strip() if notes.strip() else "(none — infer from what you see in the segment)")
    prompt_lines += [
        "",
        "Requirements:",
        "  • Sequential imperative steps (Step 1., Step 2., …).",
        "  • Ground every step in a visible on-screen element or action.",
        "  • Cite timestamps like (video @ MM:SS) where relevant.",
        "  • End with a verification step.",
        "  • Return plain text only. No preamble. No markdown fences.",
    ]
    prompt = "\n".join(prompt_lines)

    # Build the video part with segment offsets — Gemini processes only this range.
    video_part = gtypes.Part(
        file_data=gtypes.FileData(file_uri=file_obj.uri, mime_type=file_obj.mime_type),
        video_metadata=gtypes.VideoMetadata(
            start_offset=f"{int(start_sec)}s",
            end_offset=f"{int(end_sec)}s",
            fps=1.0,     # 1 frame per second is plenty for SOP screens
        ),
    )
    contents = [gtypes.Content(role="user", parts=[video_part, gtypes.Part(text=prompt)])]

    resp = _cli().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=gtypes.GenerateContentConfig(
            temperature=config.LLM_TEMPERATURE,
            max_output_tokens=1400,
        ),
    )

    text = (resp.text or "").strip()
    meta = {
        "file_name":  file_obj.name,
        "file_uri":   file_obj.uri,
        "prompt":     prompt,
        "start_sec":  start_sec,
        "end_sec":    end_sec,
        "model":      config.GEMINI_MODEL,
    }
    return text, meta


import base64 as _b64
import re as _re


def _decode_data_url(data_url: str) -> tuple[bytes, str] | None:
    """`data:image/jpeg;base64,AAA...` → (bytes, mime_type). None on garbage."""
    if not data_url or not data_url.startswith("data:"):
        return None
    m = _re.match(r"^data:([^;,]+)(;base64)?,(.*)$", data_url, _re.DOTALL)
    if not m:
        return None
    mime = m.group(1) or "application/octet-stream"
    is_b64 = bool(m.group(2))
    payload = m.group(3) or ""
    try:
        raw = _b64.b64decode(payload, validate=False) if is_b64 else payload.encode("utf-8")
    except Exception:
        return None
    return raw, mime


def generate_steps_from_moments(
    *,
    source_id: str | None,
    section_title: str,
    moments: list[dict],           # [{time_sec, note, image_data_url}]
    transcript_snippets: list[dict] | None = None,   # [{time_sec, text}] — optional context around each moment
) -> tuple[str, dict]:
    """
    Given a list of user-captured moments (screenshots + notes) for a section,
    have Gemini write imperative SOP steps that describe what to do at each
    moment, using the transcript snippets for background language.

    Pure text prompt + inline image parts — no video file upload needed for
    this path, since the user has already curated exactly which frames matter.
    """
    if not moments:
        raise ValueError("moments list is empty")

    parts: list = []
    prompt_lines = [
        "You are an SOP writer. A reviewer has captured a series of moments (screenshots + notes) while watching a knowledge-transfer video.",
        "Turn those moments into an ordered SOP for the section below. Each moment is one step — in order. Ground every step in what's visible in the accompanying screenshot AND what the reviewer said in their note.",
        "",
        f"Section: {section_title}",
    ]
    if source_id:
        prompt_lines.append(f"Source video: {source_id}")
    prompt_lines += [
        "",
        f"Number of moments: {len(moments)}",
        "",
        "Requirements:",
        "  • Write one imperative step paragraph per moment, in order.",
        "  • Start each with 'Step N: <short title>.' then 1–3 sentences of the how-to.",
        "  • Reference on-screen elements visible in the screenshot (button names, tab names, field labels).",
        "  • Weave in the reviewer's note verbatim if it clarifies the intent.",
        "  • Cite the video timestamp inline like (video @ MM:SS).",
        "  • End the whole list with a verification step: 'Expected result: …'.",
        "  • Return plain text only. No preamble, no markdown fences.",
    ]
    parts.append(gtypes.Part(text="\n".join(prompt_lines)))

    def _fmt(t: float) -> str:
        s = int(t)
        return f"{s // 60}:{s % 60:02d}"

    # For each moment: prose label + inline image + note + transcript context.
    for i, m in enumerate(moments, start=1):
        t = float(m.get("time_sec") or 0)
        note = (m.get("note") or "").strip()
        header = [f"\n— MOMENT {i} @ {_fmt(t)} —"]
        if note:
            header.append(f"Reviewer note: {note}")
        # Pull the transcript window closest to this timestamp
        if transcript_snippets:
            near = min(
                (s for s in transcript_snippets if s.get("text")),
                key=lambda s: abs(float(s.get("time_sec") or 0) - t),
                default=None,
            )
            if near:
                header.append(f"Transcript around this moment: {(near.get('text') or '')[:400]}")
        parts.append(gtypes.Part(text="\n".join(header)))

        decoded = _decode_data_url(m.get("image_data_url") or "")
        if decoded:
            raw, mime = decoded
            parts.append(gtypes.Part.from_bytes(data=raw, mime_type=mime))

    contents = [gtypes.Content(role="user", parts=parts)]
    resp = _cli().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=gtypes.GenerateContentConfig(
            temperature=config.LLM_TEMPERATURE,
            max_output_tokens=2000,
        ),
    )
    text = (resp.text or "").strip()
    meta = {
        "model":            config.GEMINI_MODEL,
        "moment_count":     len(moments),
        "section_title":    section_title,
        "source_id":        source_id,
        "prompt_preview":   parts[0].text[:400] if parts and hasattr(parts[0], 'text') else '',
    }
    return text, meta
