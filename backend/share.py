"""
Shareable review links + reviewer comments.

Flow:
  1. Author POSTs the current doc HTML to /api/share with an optional
     reviewer email. Server writes it into shares.json under a random
     token and returns a magic link `/review/<token>`.
  2. Reviewer opens the link. Frontend GETs /api/share/<token> to render
     the doc read-only + a comment margin. Reviewer name is captured on
     first load (falls back to email if provided).
  3. Reviewer adds comments via POST /api/share/<token>/comments — each
     comment has {id, author, text, anchor_text, created_at, resolved}.
  4. Author's editor polls GET /api/share/<token> to fetch new comments
     and shows them in its own margin.

The store is a plain JSON file in CACHE_DIR — good enough for a single-
process demo, keeps the code trivial and inspectable. Concurrent writes
are guarded by a global lock so overlapping requests can't corrupt it.
"""
from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path

import config

_STORE = config.CACHE_DIR / "shares.json"
_LOCK = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load() -> dict:
    if not _STORE.exists():
        return {}
    try:
        return json.loads(_STORE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict) -> None:
    tmp = _STORE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(_STORE)


def create_share(doc_html: str,
                 doc_title: str = "",
                 author: str = "Author",
                 reviewer_email: str | None = None,
                 permissions: str = "comment") -> dict:
    """
    Persist a doc snapshot for review. Returns the record.
    `permissions` is 'comment' or 'read' — 'comment' is the default.
    """
    token = secrets.token_urlsafe(9)   # ~12 chars — short, still unguessable
    rec = {
        "token":          token,
        "doc_html":       doc_html,
        "doc_title":      doc_title or "Untitled SOP",
        "author":         author,
        "reviewer_email": reviewer_email or None,
        "permissions":    permissions,
        "created_at":     _now_iso(),
        "comments":       [],
    }
    with _LOCK:
        data = _load()
        data[token] = rec
        _save(data)
    return rec


def get_share(token: str) -> dict | None:
    with _LOCK:
        return _load().get(token)


def list_shares() -> list[dict]:
    """Return every share record (metadata only — strips doc_html)."""
    with _LOCK:
        data = _load()
    out: list[dict] = []
    for token, rec in data.items():
        out.append({
            "token":          token,
            "doc_title":      rec.get("doc_title"),
            "author":         rec.get("author"),
            "reviewer_email": rec.get("reviewer_email"),
            "permissions":    rec.get("permissions"),
            "created_at":     rec.get("created_at"),
            "comment_count":  len(rec.get("comments", [])),
        })
    out.sort(key=lambda r: r["created_at"], reverse=True)
    return out


def add_comment(token: str,
                text: str,
                author: str = "Reviewer",
                anchor_text: str | None = None,
                anchor_id:   str | None = None) -> dict | None:
    """
    Append a comment to a share. Returns the new comment on success, None
    if the share doesn't exist. `anchor_text` is a short snippet of the
    reviewed doc the comment attaches to (for display in the author's UI).
    """
    with _LOCK:
        data = _load()
        rec = data.get(token)
        if not rec:
            return None
        comment = {
            "id":          secrets.token_urlsafe(6),
            "author":      author or "Reviewer",
            "text":        text,
            "anchor_text": (anchor_text or "")[:200] or None,
            "anchor_id":   anchor_id,
            "created_at":  _now_iso(),
            "resolved":    False,
        }
        rec.setdefault("comments", []).append(comment)
        data[token] = rec
        _save(data)
    return comment


def resolve_comment(token: str, comment_id: str, resolved: bool = True) -> dict | None:
    with _LOCK:
        data = _load()
        rec = data.get(token)
        if not rec:
            return None
        for c in rec.get("comments", []):
            if c.get("id") == comment_id:
                c["resolved"] = bool(resolved)
                data[token] = rec
                _save(data)
                return c
    return None


def update_doc_html(token: str, doc_html: str) -> bool:
    """Author pushed a new snapshot of the doc to the same share URL."""
    with _LOCK:
        data = _load()
        rec = data.get(token)
        if not rec:
            return False
        rec["doc_html"] = doc_html
        rec["updated_at"] = _now_iso()
        data[token] = rec
        _save(data)
    return True
