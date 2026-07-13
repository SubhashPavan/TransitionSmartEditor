"""
CDN-origin streaming proxy for Azure Blob-backed video sources.

This is what the browser talks to (via `/api/stream/{source_id}`) instead
of receiving raw SAS URLs. A downstream CDN (Azure Front Door, Cloudflare,
CloudFront) can be dropped in front to cache byte ranges at edge.

Design:
  • HTTP Range header is forwarded verbatim to Blob — Blob returns the
    matching bytes and Content-Range, we stream them straight through.
  • Full-file requests get a 200 with Content-Length; range requests get
    a 206 with Content-Range. Both cases stream in ~256 KB chunks so
    we never buffer the whole file in memory.
  • Cache-Control is set aggressively (public, immutable, 1-day max-age)
    so a real CDN caches per (URL, Range) tuple. Videos don't change
    at their source_id — new versions get a new blob.
  • ETag comes from the blob's `etag` so browsers + CDNs can revalidate.
  • CORS is left to the FastAPI middleware.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from azure.core.exceptions import ResourceNotFoundError, HttpResponseError

import blob as blob_mod
import config


CHUNK_SIZE = 256 * 1024      # bytes per chunk we forward to the client
DEFAULT_CACHE = "public, max-age=86400, immutable"


@dataclass
class StreamRange:
    start: int
    end:   int       # inclusive
    total: int


class RangeError(Exception):
    pass


def parse_range(range_header: str | None, total_size: int) -> StreamRange | None:
    """
    Parse a `Range: bytes=<start>-<end>` header. Returns None if the header
    is missing (caller should treat as full-file). Raises RangeError on
    a malformed / unsatisfiable range so the caller can 416.

    We only implement single-range byte requests — the video streaming
    case never needs multipart ranges in practice.
    """
    if not range_header:
        return None
    m = re.match(r"^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$", range_header, re.IGNORECASE)
    if not m:
        raise RangeError(f"Malformed Range header: {range_header!r}")

    start_str, end_str = m.group(1), m.group(2)
    if start_str == "" and end_str == "":
        raise RangeError("Empty range")

    if start_str == "":
        # Suffix range: "bytes=-N" → last N bytes
        n = int(end_str)
        if n <= 0:
            raise RangeError("Invalid suffix range")
        start = max(0, total_size - n)
        end = total_size - 1
    else:
        start = int(start_str)
        end = int(end_str) if end_str else total_size - 1

    if start < 0 or start >= total_size or end < start:
        raise RangeError(f"Unsatisfiable range: {start}-{end} for size {total_size}")
    end = min(end, total_size - 1)
    return StreamRange(start=start, end=end, total=total_size)


def stream_source_bytes(source_id: str,
                        range_header: str | None) -> tuple[Iterable[bytes], dict, int]:
    """
    Fetch a Blob source and return (byte_generator, response_headers, status_code).

    Raises FileNotFoundError if the source doesn't exist. Raises RangeError
    when the client's Range header is unsatisfiable — the FastAPI route
    translates this to 404 / 416 respectively.
    """
    src = blob_mod.get_source(source_id)
    if not src:
        raise FileNotFoundError(source_id)

    client = blob_mod.blob_client(src.blob_name)

    # We need the actual current size + etag (blob may have grown/changed
    # since list_sources cached it).
    try:
        props = client.get_blob_properties()
    except ResourceNotFoundError as e:
        raise FileNotFoundError(source_id) from e

    total = props.size or 0
    etag = (props.etag or "").strip('"')
    content_type = (
        (props.content_settings.content_type if props.content_settings else None)
        or src.content_type
        or "application/octet-stream"
    )

    rng = parse_range(range_header, total)

    if rng is None:
        # Full-file response
        headers = {
            "Content-Type":   content_type,
            "Content-Length": str(total),
            "Accept-Ranges":  "bytes",
            "Cache-Control":  DEFAULT_CACHE,
            "ETag":           f'"{etag}"' if etag else "",
            "X-Origin":       "sop-editor-stream",
        }
        return _blob_range_generator(client, 0, total - 1), headers, 200

    # Ranged response — 206 Partial Content
    length = rng.end - rng.start + 1
    headers = {
        "Content-Type":   content_type,
        "Content-Length": str(length),
        "Content-Range":  f"bytes {rng.start}-{rng.end}/{total}",
        "Accept-Ranges":  "bytes",
        "Cache-Control":  DEFAULT_CACHE,
        "ETag":           f'"{etag}"' if etag else "",
        "X-Origin":       "sop-editor-stream",
    }
    return _blob_range_generator(client, rng.start, rng.end), headers, 206


def _blob_range_generator(client, start: int, end_inclusive: int) -> Iterable[bytes]:
    """
    Stream the byte range [start, end_inclusive] from Blob in CHUNK_SIZE
    pieces. Uses the SDK's `download_blob(offset, length)` which under the
    hood makes a single ranged request to Blob storage — we then walk its
    chunks and yield them without ever holding the whole payload in RAM.
    """
    length = end_inclusive - start + 1
    if length <= 0:
        return
    try:
        stream = client.download_blob(offset=start, length=length, max_concurrency=1)
    except HttpResponseError as e:
        raise RuntimeError(f"Blob download failed: {e}") from e

    for chunk in stream.chunks():
        # `chunks()` iterator size follows the SDK's internal setting;
        # we further slice into CHUNK_SIZE so the client sees smooth
        # progress in dev tools and CDNs can cache in predictable pieces.
        if len(chunk) <= CHUNK_SIZE:
            yield chunk
            continue
        for i in range(0, len(chunk), CHUNK_SIZE):
            yield chunk[i:i + CHUNK_SIZE]
