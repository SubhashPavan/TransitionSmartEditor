"""
sop-editor backend — FastAPI application.

Runs on port 8001 by default. Endpoints:

  GET  /api/health                     — sanity check + service status
  GET  /api/sources                    — list videos / documents / images in the sandbox
  GET  /api/sources/{id}/stream-url    — signed short-lived direct-download URL
  POST /api/generate-from-segment      — video segment + notes → generated SOP steps
  POST /api/ai/block-action            — Rewrite / Rephrase / Add detail on a block

The sop-editor frontend at localhost:5190 talks to this via /api (proxy).
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

import config
import blob as blob_mod
import llm
import gemini as gm
import frames as frames_mod
import share as share_mod
import stream as stream_mod
import chat as chat_mod
import rag as rag_mod

app = FastAPI(title="sop-editor backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "ok": True,
        "openai_configured": bool(config.AZURE_OPENAI_ENDPOINT and config.AZURE_OPENAI_KEY),
        "gemini_configured": bool(config.GEMINI_API_KEY),
        "blob_configured":   bool(config.BLOB_CONNECTION_STRING),
        "container":         config.BLOB_CONTAINER,
        "prefix":            config.BLOB_PREFIX,
        "openai_deployment": config.AZURE_OPENAI_DEPLOYMENT,
        "gemini_model":      config.GEMINI_MODEL,
    }


# ─────────────────────────────────────────────────────────
# Sources — Videos / Documents / Images from Blob
# ─────────────────────────────────────────────────────────
@app.get("/api/sources")
def list_sources():
    try:
        sources = blob_mod.list_sources()
    except Exception as e:
        raise HTTPException(500, f"Failed to list sources: {e}") from e
    return {"items": [s.to_dict() for s in sources]}


# ─────────────────────────────────────────────────────────
# Streaming CDN origin
# Instead of handing the browser a short-lived SAS URL directly, we proxy
# the bytes through /api/stream/{source_id}. The proxy forwards HTTP Range
# headers to Blob and streams the response back with CDN-friendly cache
# headers — a real CDN (Azure Front Door / Cloudflare) in front will cache
# byte ranges at edge. No SAS token leaks to the client; no 60-minute
# token expiry breaking mid-scrub.
# ─────────────────────────────────────────────────────────
@app.get("/api/stream/{source_id}")
def stream_source(source_id: str, request: Request):
    range_header = request.headers.get("range")
    try:
        gen, headers, status = stream_mod.stream_source_bytes(source_id, range_header)
    except FileNotFoundError:
        raise HTTPException(404, f"Source '{source_id}' not found")
    except stream_mod.RangeError as e:
        # 416 Range Not Satisfiable
        raise HTTPException(416, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return StreamingResponse(gen, status_code=status, headers=headers,
                             media_type=headers.get("Content-Type"))


@app.head("/api/stream/{source_id}")
def stream_source_head(source_id: str):
    """HEAD lets clients + CDNs discover size + range support cheaply."""
    src = blob_mod.get_source(source_id)
    if not src:
        raise HTTPException(404, f"Source '{source_id}' not found")
    try:
        client = blob_mod.blob_client(src.blob_name)
        props  = client.get_blob_properties()
    except Exception as e:
        raise HTTPException(502, f"Blob error: {e}") from e
    headers = {
        "Content-Type":   (props.content_settings.content_type if props.content_settings else src.content_type) or "application/octet-stream",
        "Content-Length": str(props.size or 0),
        "Accept-Ranges":  "bytes",
        "Cache-Control":  stream_mod.DEFAULT_CACHE,
        "ETag":           f'"{(props.etag or "").strip(chr(34))}"',
        "X-Origin":       "sop-editor-stream",
    }
    from fastapi.responses import Response
    return Response(status_code=200, headers=headers)


@app.get("/api/sources/{source_id}/stream-url")
def source_stream_url(source_id: str, ttl_minutes: int = Query(60, ge=1, le=1440)):
    src = blob_mod.get_source(source_id)
    if not src:
        raise HTTPException(404, f"Source '{source_id}' not found")
    try:
        return {"url": blob_mod.sas_url(src.blob_name, ttl_minutes=ttl_minutes),
                "content_type": src.content_type,
                "size_bytes":   src.size_bytes,
                "expires_in_seconds": ttl_minutes * 60}
    except Exception as e:
        raise HTTPException(500, f"Failed to sign URL: {e}") from e


# ─────────────────────────────────────────────────────────
# Segment → SOP generation
# ─────────────────────────────────────────────────────────
class SegmentReq(BaseModel):
    source_id: str
    start_sec: float = Field(..., ge=0)
    end_sec:   float = Field(..., ge=0)
    notes:     str   = ""
    target_context: str | None = None   # optional: the heading text the steps land under


@app.post("/api/generate-from-segment")
def generate_from_segment(req: SegmentReq):
    src = blob_mod.get_source(req.source_id)
    if not src:
        raise HTTPException(404, f"Source '{req.source_id}' not found")
    if src.kind != "video":
        raise HTTPException(400, f"Source '{req.source_id}' is not a video")
    if req.end_sec <= req.start_sec:
        raise HTTPException(422, "end_sec must be greater than start_sec")
    if not config.GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY is not configured on the backend")

    try:
        text, meta = gm.generate_segment_steps(
            source_id=req.source_id,
            start_sec=req.start_sec,
            end_sec=req.end_sec,
            notes=req.notes or "",
            target_context=req.target_context,
        )
    except Exception as e:
        raise HTTPException(502, f"Gemini error: {e}") from e

    # Split into paragraphs so the frontend can insert each step as its own <p>.
    steps = [line.strip() for line in text.split("\n") if line.strip()]
    return {
        "steps":  steps,
        "raw":    text,
        "source": src.to_dict(),
        "model":  meta["model"],
        "file_uri": meta["file_uri"],
        "prompt": meta["prompt"],
    }


# ─────────────────────────────────────────────────────────
# Block action — Rewrite / Rephrase / Add detail
# ─────────────────────────────────────────────────────────
class BlockActionReq(BaseModel):
    action: Literal["rewrite", "rephrase", "add-detail"]
    block_text: str
    block_kind: str = "paragraph"
    tone: str | None = None
    length: str | None = None
    missing_hint: str | None = None   # only used for add-detail


BLOCK_SYSTEM = (
    "You are a technical editor. You rewrite short blocks of SOP content. "
    "Return ONLY the revised text — no preamble, no explanations, no markdown fences. "
    "Preserve the original meaning; do not fabricate specifics."
)


def _build_block_prompt(req: BlockActionReq) -> str:
    tone = (req.tone or "").strip()
    length = (req.length or "").strip()
    hint = (req.missing_hint or "").strip()
    if req.action == "rewrite":
        parts = ["Rewrite the following block."]
        if tone:   parts.append(f"Tone: {tone.lower()}.")
        if length: parts.append(f"Length: {length.lower()}.")
    elif req.action == "rephrase":
        parts = ["Rephrase the following block for readability, preserving the same content and structure."]
        if tone: parts.append(f"Tone: {tone.lower()}.")
    else:  # add-detail
        parts = ["Extend the following block by adding useful, concrete detail. Keep the original text intact and add new sentences."]
        if length: parts.append(f"Add: {length}.")
        if tone:   parts.append(f"Tone: {tone.lower()}.")
        if hint:   parts.append(f"The reader is missing: {hint}.")
    parts.append(f"\nBlock kind: {req.block_kind}\n---\n{req.block_text}\n---")
    return " ".join(parts)


@app.post("/api/ai/block-action")
def block_action(req: BlockActionReq):
    if not (req.block_text or "").strip():
        raise HTTPException(422, "block_text is empty")
    prompt = _build_block_prompt(req)
    try:
        text = llm.chat(
            [
                {"role": "system", "content": BLOCK_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=(1400 if req.action == "add-detail" else 700),
        )
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}") from e
    return {"text": text, "prompt": prompt}


# ─────────────────────────────────────────────────────────
# Frame browser — nearby keyframes + description search
# ─────────────────────────────────────────────────────────
@app.get("/api/frames/sources")
def frame_sources():
    """List the source keys we have keyframes for (folder names under outputs/)."""
    return {"items": frames_mod.source_keys()}


@app.get("/api/frames/{source_key}")
def list_frames(source_key: str,
                start_sec: float | None = Query(None, ge=0),
                end_sec:   float | None = Query(None, ge=0),
                near_sec:  float | None = Query(None, ge=0),
                n:         int = Query(9, ge=1, le=100)):
    """
    List frames for `source_key`. Query params:
      - start_sec / end_sec: clamp to this window
      - near_sec + n: return the N frames closest to `near_sec` instead
    """
    if near_sec is not None:
        items = frames_mod.nearest_frames(source_key, near_sec, n)
    else:
        items = frames_mod.list_frames(source_key, start_sec, end_sec)
    return {"items": items, "source_key": source_key}


@app.get("/api/frames/{source_key}/{frame_name}")
def get_frame(source_key: str, frame_name: str):
    path = frames_mod.resolve_frame_path(source_key, frame_name)
    if not path:
        raise HTTPException(404, "Frame not found")
    return FileResponse(str(path), media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=3600"})


class FrameSearchReq(BaseModel):
    source_key:  str
    description: str
    start_sec:   float | None = None
    end_sec:     float | None = None
    top_k:       int = 6


@app.post("/api/frames/search")
def search_frames(req: FrameSearchReq):
    """
    Semantic frame search: given a description, return matching frames
    (ranked by Gemini vision). Useful when none of the nearby frames
    are quite right and the reviewer wants to describe what they want.
    """
    if not (req.description or "").strip():
        raise HTTPException(422, "description is empty")
    try:
        items = frames_mod.search_frames_by_description(
            source_key=req.source_key,
            description=req.description,
            start_sec=req.start_sec,
            end_sec=req.end_sec,
            top_k=req.top_k,
        )
    except Exception as e:
        raise HTTPException(502, f"Frame search failed: {e}") from e
    return {"items": items, "source_key": req.source_key,
            "description": req.description}


# ─────────────────────────────────────────────────────────
# Share to reviewer + feedback comments
# ─────────────────────────────────────────────────────────
class CreateShareReq(BaseModel):
    doc_html:       str
    doc_title:      str = ""
    author:         str = "Author"
    reviewer_email: str | None = None
    permissions:    Literal["comment", "read"] = "comment"


@app.post("/api/share")
def create_share(req: CreateShareReq):
    if not (req.doc_html or "").strip():
        raise HTTPException(422, "doc_html is empty")
    rec = share_mod.create_share(
        doc_html=req.doc_html,
        doc_title=req.doc_title,
        author=req.author,
        reviewer_email=req.reviewer_email,
        permissions=req.permissions,
    )
    return {
        "token":     rec["token"],
        # The frontend renders the review page at /review/<token> under the
        # same origin as the editor (see App.jsx routing).
        "share_url": f"/review/{rec['token']}",
        "created_at": rec["created_at"],
    }


@app.get("/api/share/{token}")
def get_share(token: str, include_html: bool = Query(True)):
    rec = share_mod.get_share(token)
    if not rec:
        raise HTTPException(404, "Share not found")
    out = {
        "token":          rec["token"],
        "doc_title":      rec.get("doc_title"),
        "author":         rec.get("author"),
        "reviewer_email": rec.get("reviewer_email"),
        "permissions":    rec.get("permissions", "comment"),
        "created_at":     rec.get("created_at"),
        "updated_at":     rec.get("updated_at"),
        "comments":       rec.get("comments", []),
    }
    if include_html:
        out["doc_html"] = rec.get("doc_html", "")
    return out


@app.get("/api/share")
def list_shares():
    return {"items": share_mod.list_shares()}


class AddCommentReq(BaseModel):
    text:        str
    author:      str = "Reviewer"
    anchor_text: str | None = None
    anchor_id:   str | None = None


@app.post("/api/share/{token}/comments")
def add_comment(token: str, req: AddCommentReq):
    if not (req.text or "").strip():
        raise HTTPException(422, "text is empty")
    c = share_mod.add_comment(
        token=token, text=req.text, author=req.author,
        anchor_text=req.anchor_text, anchor_id=req.anchor_id,
    )
    if c is None:
        raise HTTPException(404, "Share not found")
    return c


class ResolveCommentReq(BaseModel):
    resolved: bool = True


@app.patch("/api/share/{token}/comments/{comment_id}")
def resolve_comment(token: str, comment_id: str, req: ResolveCommentReq):
    c = share_mod.resolve_comment(token, comment_id, req.resolved)
    if c is None:
        raise HTTPException(404, "Comment not found")
    return c


class UpdateShareReq(BaseModel):
    doc_html: str


@app.put("/api/share/{token}")
def update_share(token: str, req: UpdateShareReq):
    """Author pushes a fresh snapshot to the same share URL (edits + resends)."""
    ok = share_mod.update_doc_html(token, req.doc_html)
    if not ok:
        raise HTTPException(404, "Share not found")
    return {"token": token, "ok": True}


# ─────────────────────────────────────────────────────────
# Agentic RAG chat over the video transcripts
# ─────────────────────────────────────────────────────────
class ChatMsg(BaseModel):
    role:    Literal["user", "assistant"]
    content: str


class ChatReq(BaseModel):
    question: str
    source_key: str | None = None
    history:  list[ChatMsg] = Field(default_factory=list)


@app.post("/api/chat")
def chat(req: ChatReq):
    """
    Agentic-RAG chat. GPT-4o runs a tool loop over the local transcript index
    (rag.py). Returns {answer, citations: [{source_key, start_sec, end_sec, text}]}
    so the frontend can render clickable "▶ ariba_part01 · 04:22" chips.
    """
    if not (req.question or "").strip():
        raise HTTPException(422, "question is empty")
    try:
        return chat_mod.answer(
            user_question=req.question,
            history=[m.model_dump() for m in req.history],
            default_source_key=req.source_key,
        )
    except Exception as e:
        raise HTTPException(502, f"Chat failed: {e}") from e


@app.get("/api/chat/status")
def chat_status():
    """RAG index diagnostics — chunk count, sources indexed, cache state."""
    return rag_mod.status()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.API_HOST, port=config.API_PORT, reload=True)
