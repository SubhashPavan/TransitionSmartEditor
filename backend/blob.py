"""
Thin wrapper around Azure Blob for the sop-editor backend.

Provides:
  • upload_local(name, path)     — upload a local file into the sandbox
  • list_sources()               — list blobs under the sandbox, grouped by kind
  • sas_url(name, ttl_minutes)   — short-lived signed URL for direct client download
  • blob_client(name)            — raw client for streaming edge cases
"""
from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Literal

from azure.storage.blob import (
    BlobServiceClient, BlobSasPermissions, generate_blob_sas, ContentSettings,
)

import config

_service_client: BlobServiceClient | None = None


def _svc() -> BlobServiceClient:
    global _service_client
    if _service_client is None:
        if not config.BLOB_CONNECTION_STRING:
            raise RuntimeError("BLOB_CONNECTION_STRING is not configured")
        _service_client = BlobServiceClient.from_connection_string(config.BLOB_CONNECTION_STRING)
    return _service_client


def blob_client(name: str):
    """Return a BlobClient for a name that's already prefixed with the sandbox."""
    return _svc().get_blob_client(container=config.BLOB_CONTAINER, blob=name)


# ─── Uploads ──────────────────────────────────────────────

def upload_local(name: str, local_path: str, *, overwrite: bool = True) -> str:
    """Upload a local file. `name` is the sandboxed blob name (already prefixed).
    Returns the blob name it landed at."""
    ctype, _ = mimetypes.guess_type(local_path)
    with open(local_path, "rb") as fh:
        blob_client(name).upload_blob(
            fh,
            overwrite=overwrite,
            content_settings=ContentSettings(content_type=ctype or "application/octet-stream"),
        )
    return name


# ─── Listing ──────────────────────────────────────────────

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m3u8"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
DOC_EXT   = {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"}


@dataclass
class Source:
    id: str
    kind: Literal["video", "document", "image"]
    name: str
    blob_name: str
    size_bytes: int
    content_type: str | None
    last_modified: str | None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "size_bytes": self.size_bytes,
            "content_type": self.content_type,
            "last_modified": self.last_modified,
        }


def _classify(ext: str) -> Literal["video", "document", "image"] | None:
    if ext in VIDEO_EXT: return "video"
    if ext in IMAGE_EXT: return "image"
    if ext in DOC_EXT:   return "document"
    return None


def list_sources() -> list[Source]:
    """List every artifact inside the sop-editor sandbox, classified by extension."""
    container = _svc().get_container_client(config.BLOB_CONTAINER)
    prefix = config.BLOB_PREFIX + "/" if config.BLOB_PREFIX else ""
    out: list[Source] = []
    for blob in container.list_blobs(name_starts_with=prefix):
        base = blob.name[len(prefix):] if prefix else blob.name
        if "/" in base:
            # Nested keys (e.g. checkpoints/xxx) are skipped from the sources list.
            continue
        ext = ("." + base.rsplit(".", 1)[-1].lower()) if "." in base else ""
        kind = _classify(ext)
        if not kind:
            continue
        out.append(Source(
            id=base,
            kind=kind,
            name=base,
            blob_name=blob.name,
            size_bytes=blob.size or 0,
            content_type=(blob.content_settings.content_type if blob.content_settings else None),
            last_modified=blob.last_modified.isoformat() if blob.last_modified else None,
        ))
    # Videos first for the panel default tab
    out.sort(key=lambda s: (s.kind != "video", s.name))
    return out


def get_source(source_id: str) -> Source | None:
    for s in list_sources():
        if s.id == source_id:
            return s
    return None


# ─── SAS URLs ─────────────────────────────────────────────

def sas_url(blob_name: str, *, ttl_minutes: int = 60) -> str:
    """Signed short-lived URL. The browser can then stream the blob directly
    (byte-range requests supported natively by Azure Blob)."""
    svc = _svc()
    account_name = svc.account_name
    account_key = svc.credential.account_key  # type: ignore[attr-defined]
    expiry = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    token = generate_blob_sas(
        account_name=account_name,
        container_name=config.BLOB_CONTAINER,
        blob_name=blob_name,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=expiry,
    )
    return f"https://{account_name}.blob.core.windows.net/{config.BLOB_CONTAINER}/{blob_name}?{token}"
