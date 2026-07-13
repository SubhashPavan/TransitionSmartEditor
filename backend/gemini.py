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
