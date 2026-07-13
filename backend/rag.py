"""
In-process retrieval over the video-parser transcript JSONs.

We keep it simple: on first use we load every
`video_parser/outputs/<source_key>/video_transcript.json`, chunk the segments
into ~200-word windows (each carrying its own start/end timestamp), and
embed them with Azure OpenAI's text-embedding-3-large deployment. The
embedding matrix is pickled to CACHE_DIR so restarts hit disk once.

Queries hit the same embedding deployment for the question, then cosine-
similarity against the corpus in numpy — fast enough for tens of thousands
of chunks on a laptop. The API surface matches what the chat agent needs:

  index.sources()               → ["ariba_part01", …]
  index.search(q, k, filter)    → [{source_key, start, end, text, score}, …]

There's no external vector DB dependency. If a Qdrant-backed index ever
comes back online, swap this module's implementation without touching
the callers.
"""
from __future__ import annotations

import json
import math
import pickle
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import config

TRANSCRIPTS_ROOT = Path(__file__).resolve().parents[2] / "video_parser" / "outputs"
CACHE_FILE = config.CACHE_DIR / "rag_index.pkl"

# Rough word budget per chunk. Bigger chunks → more context per hit but
# also fuzzier match; ~200 words works well for spoken transcripts.
WORDS_PER_CHUNK = 200
# Batch size for embedding API calls. Azure OpenAI accepts up to 2048
# tokens per input and 16 inputs per request in most deployments.
EMBED_BATCH_SIZE = 16


@dataclass
class Chunk:
    source_key: str
    start:      float          # seconds
    end:        float
    text:       str
    speaker:    str | None


@dataclass
class Hit(Chunk):
    score: float


# ─── Loading + chunking ───────────────────────────────────

def _iter_transcripts() -> Iterable[tuple[str, dict]]:
    if not TRANSCRIPTS_ROOT.exists():
        return
    for d in sorted(TRANSCRIPTS_ROOT.iterdir()):
        if not d.is_dir():
            continue
        f = d / "video_transcript.json"
        if not f.is_file():
            continue
        try:
            yield d.name, json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue


def _chunk_segments(source_key: str, doc: dict) -> list[Chunk]:
    """
    Merge consecutive whisper-style segments into ~200-word windows so
    each embedded chunk carries enough context to answer thematic questions.
    """
    segs = doc.get("segments") or []
    if not segs:
        return []

    chunks: list[Chunk] = []
    buf_text: list[str] = []
    buf_start: float | None = None
    buf_end:   float | None = None
    buf_speakers: set[str] = set()
    buf_words = 0

    def flush():
        if not buf_text:
            return
        chunks.append(Chunk(
            source_key=source_key,
            start=buf_start or 0.0,
            end=buf_end or 0.0,
            text=" ".join(buf_text).strip(),
            speaker=", ".join(sorted(buf_speakers)) if buf_speakers else None,
        ))

    for s in segs:
        text = (s.get("text") or "").strip()
        if not text:
            continue
        words = len(text.split())
        if buf_start is None:
            buf_start = float(s.get("start") or 0.0)
        buf_end = float(s.get("end") or buf_end or 0.0)
        spk = s.get("speaker_id") or s.get("speaker")
        if spk:
            buf_speakers.add(spk)
        buf_text.append(text)
        buf_words += words
        if buf_words >= WORDS_PER_CHUNK:
            flush()
            buf_text = []
            buf_start = None
            buf_end = None
            buf_speakers = set()
            buf_words = 0
    flush()
    return chunks


# ─── Embeddings ───────────────────────────────────────────

def _azure_client():
    from openai import AzureOpenAI
    return AzureOpenAI(
        api_key       = config.AZURE_OPENAI_KEY,
        api_version   = config.AZURE_OPENAI_API_VERSION,
        azure_endpoint= config.AZURE_OPENAI_ENDPOINT,
    )


def _embed_batch(client, texts: list[str]) -> list[list[float]]:
    resp = client.embeddings.create(
        model=config.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
        input=texts,
    )
    return [d.embedding for d in resp.data]


def _l2norm(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


# ─── Index ────────────────────────────────────────────────

class _Index:
    """Single shared instance loaded on first use."""

    def __init__(self):
        self.chunks: list[Chunk] = []
        self.vectors: list[list[float]] = []   # normalized embeddings
        self.loaded = False

    def _load_from_cache(self) -> bool:
        if not CACHE_FILE.is_file():
            return False
        try:
            with CACHE_FILE.open("rb") as fh:
                data = pickle.load(fh)
            self.chunks  = data["chunks"]
            self.vectors = data["vectors"]
            return True
        except Exception:
            return False

    def _save_to_cache(self) -> None:
        try:
            with CACHE_FILE.open("wb") as fh:
                pickle.dump({"chunks": self.chunks, "vectors": self.vectors}, fh)
        except Exception:
            pass

    def build(self) -> None:
        """Chunk every transcript on disk and embed it. Cached to disk."""
        # First try the cache to avoid re-embedding on every restart.
        if not self.chunks and self._load_from_cache():
            self.loaded = True
            return

        raw_chunks: list[Chunk] = []
        for key, doc in _iter_transcripts():
            raw_chunks.extend(_chunk_segments(key, doc))

        if not raw_chunks:
            self.loaded = True
            return

        client = _azure_client()
        vectors: list[list[float]] = []
        for i in range(0, len(raw_chunks), EMBED_BATCH_SIZE):
            batch = raw_chunks[i:i + EMBED_BATCH_SIZE]
            embs = _embed_batch(client, [c.text for c in batch])
            for e in embs:
                vectors.append(_l2norm(e))

        self.chunks = raw_chunks
        self.vectors = vectors
        self._save_to_cache()
        self.loaded = True

    def sources(self) -> list[str]:
        return sorted({c.source_key for c in self.chunks})

    def search(self,
               query: str,
               k: int = 6,
               source_filter: str | None = None) -> list[Hit]:
        if not self.loaded:
            self.build()
        if not self.chunks:
            return []
        client = _azure_client()
        qvec = _l2norm(_embed_batch(client, [query])[0])
        scored: list[tuple[float, int]] = []
        for i, v in enumerate(self.vectors):
            if source_filter and self.chunks[i].source_key != source_filter:
                continue
            # cosine sim = dot on unit vectors
            s = sum(a * b for a, b in zip(qvec, v))
            scored.append((s, i))
        scored.sort(key=lambda t: t[0], reverse=True)
        top = scored[:k]
        return [Hit(**self.chunks[i].__dict__, score=s) for s, i in top]


_INSTANCE = _Index()


def ensure_built() -> None:
    _INSTANCE.build()


def sources() -> list[str]:
    if not _INSTANCE.loaded:
        _INSTANCE.build()
    return _INSTANCE.sources()


def search(query: str, k: int = 6, source_filter: str | None = None) -> list[dict]:
    hits = _INSTANCE.search(query, k=k, source_filter=source_filter)
    return [
        {
            "source_key": h.source_key,
            "start_sec":  h.start,
            "end_sec":    h.end,
            "text":       h.text,
            "speaker":    h.speaker,
            "score":      h.score,
        }
        for h in hits
    ]


def status() -> dict:
    return {
        "loaded":       _INSTANCE.loaded,
        "chunk_count":  len(_INSTANCE.chunks),
        "sources":      _INSTANCE.sources() if _INSTANCE.loaded else [],
        "cache_file":   str(CACHE_FILE),
        "cache_exists": CACHE_FILE.is_file(),
    }
