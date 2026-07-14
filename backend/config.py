"""
sop-editor backend — configuration.

All Azure credentials and tunables load from .env. This module is imported
once at process start; downstream modules read the module-level constants.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

# ── Server ──────────────────────────────────────────────
API_HOST     = os.getenv("API_HOST", "0.0.0.0")
API_PORT     = int(os.getenv("API_PORT", "8001"))
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5190").split(",")
    if o.strip()
]
# Optional single regex to match Vercel preview URLs, e.g.
# https://ts-sop-editor-git-.*\.vercel\.app
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip()

# ── Azure Blob ──────────────────────────────────────────
BLOB_CONNECTION_STRING = os.getenv("BLOB_CONNECTION_STRING", "")
BLOB_CONTAINER         = os.getenv("BLOB_CONTAINER", "video-demo")
# Prefix so sop-editor blobs don't collide with other TS assets in the same container.
BLOB_PREFIX            = os.getenv("BLOB_PREFIX", "sop-editor").strip("/")

# ── Azure OpenAI ────────────────────────────────────────
AZURE_OPENAI_ENDPOINT   = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_KEY        = os.getenv("AZURE_OPENAI_KEY", "")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")

# ── LLM tuning ──────────────────────────────────────────
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
LLM_MAX_TOKENS  = int(os.getenv("LLM_MAX_TOKENS", "1200"))

# ── Gemini (multimodal video) ───────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# ── Qdrant (video transcript vector index) ──────────────
QDRANT_URL     = os.getenv("QDRANT_URL", "")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
QDRANT_COLLECTION_PREFIX = os.getenv("QDRANT_COLLECTION_PREFIX", "video-sop-")

# Azure OpenAI embedding deployment (must match the one used at ingest time)
AZURE_OPENAI_EMBEDDING_DEPLOYMENT   = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-large")
AZURE_OPENAI_EMBEDDING_DIMENSIONS   = int(os.getenv("AZURE_OPENAI_EMBEDDING_DIMENSIONS", "3072"))

# Where to cache downloaded video files & Gemini file URIs across restarts.
CACHE_DIR = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent / ".cache")))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def blob_key(name: str) -> str:
    """Prefix an object name with the sop-editor sandbox prefix."""
    name = name.lstrip("/")
    return f"{BLOB_PREFIX}/{name}" if BLOB_PREFIX else name
