# TransitionSmart Review Studio

A Word-like editor for AI-generated Standard Operating Procedures, with an integrated video review pipeline, agentic RAG chat over source transcripts, and a share-to-reviewer feedback loop.

## What's in the box

- **Word-like editor** — track changes, inline comments (Word-style right-margin balloons), checkpoints, versions, undo/redo across blocks, list toggling, section outline that auto-updates.
- **docx-preview render** with post-processing to paginate large documents Word never emitted `w:lastRenderedPageBreak` markers for.
- **Video player** (YouTube-style) — overlay controls, keyboard shortcuts (`Space/K` play, `←/→` ±5s, `J/L` ±10s, `M` mute, `F` fullscreen, `S` snapshot, `I/O` mark in/out, `0-9` jump to N/10, `?` cheatsheet). Snapshot capture writes numbered "moment" cards with per-moment notes into a slide-in sidebar.
- **CDN-origin streaming proxy** — `/api/stream/{source_id}` forwards HTTP `Range` requests to Azure Blob and streams response bytes back with aggressive cache headers so a real CDN (Azure Front Door / Cloudflare) can cache byte ranges at edge. No SAS token ever reaches the browser; no 60-min token expiry mid-scrub.
- **Frame browser** on screenshot enlarge — thumbnails of nearby keyframes + Gemini-vision-scored semantic search ("show me the Certifications tab with data filled in").
- **Agentic RAG chat** — GPT-4o with `search_transcript` / `list_sources` tools over a local in-memory transcript index (embeddings from `text-embedding-3-large`, cached to disk). Answers cite the source clip timestamps as clickable pills that open the modal player at that moment.
- **Share to reviewer** — magic link `/review/<token>`, reviewer opens it, sees the SOP read-only, selects text → floating "+ Add comment" chip → inline compose bubble → posts via `/api/share/{token}/comments`. Author polls every 5 s, injects the reviewer's comment inline as a `.ts-comment` span so it appears in their editor as a Word-style margin balloon (author + timestamp), read-only, resolve-only.
- **Section-linked outline** — every heading tied to a video segment gets a small ▶ button in the left rail that opens the video player, auto-seeked to the segment start, autoplaying, in fullscreen.

## Layout

```
backend/                    # Python FastAPI on :8004
  app.py                    # Route surface — health, sources, stream, chat, share, frames, generate-from-segment
  blob.py                   # Azure Blob wrapper (list / SAS / raw client for streaming)
  stream.py                 # HTTP-Range proxy — the CDN origin
  frames.py                 # Keyframe list + Gemini-vision frame search
  rag.py                    # Local transcript index — embed with Azure text-embedding-3-large, pickle-cached
  chat.py                   # GPT-4o tool loop for the agentic RAG chat
  share.py                  # Reviewer share record store + comment CRUD
  gemini.py                 # google-genai wrapper — Files API upload + segment-scoped generation
  llm.py                    # Azure OpenAI chat wrapper for block actions
  config.py                 # Env → module constants
frontend/                   # React + Vite on :5190
  src/pages/
    Editor.jsx              # Main authoring page
    Landing.jsx             # Upload / open sample entry
    Reviewer.jsx            # /review/<token> page — read-only + inline comment bubble
  src/components/
    Canvas.jsx              # Sample doc block editor
    DocxPreviewCanvas.jsx   # Uploaded .docx renderer via docx-preview
    VideoPlayer.jsx         # YouTube-style overlay player + moments capture
    FloatingChat.jsx        # Agentic RAG chat panel
    CommentMargin.jsx       # Word-style right-margin comment balloons
    ShareModal.jsx          # Send-for-review magic-link dialog
    Ribbon.jsx              # Word-like top ribbon (Home / Insert / Layout / etc.)
    LeftRail.jsx            # Outline + section play buttons
    SourcesPanel.jsx        # Right-side videos/documents/images browser
```

## Running locally

### Backend

```bash
cd backend
cp .env.example .env       # then paste your Azure/Gemini/Qdrant keys into .env
pip install -r requirements.txt
python app.py              # http://localhost:8004
```

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5190
```

Vite proxies `/api/*` to `http://localhost:8004`.

## Env vars

See [`backend/.env.example`](backend/.env.example) for the full list. Required for base features:

- `BLOB_CONNECTION_STRING` — Azure Blob container the videos live in
- `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` + `AZURE_OPENAI_DEPLOYMENT` — for GPT-4o block actions + agentic chat
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` — for the local RAG index
- `GEMINI_API_KEY` — for video-segment-scoped SOP generation + semantic frame search
- `QDRANT_URL` + `QDRANT_API_KEY` — optional, only if you want Qdrant instead of the local in-memory index

## Notes

- The backend uses `uvicorn --reload` when run via `python app.py`.
- Video transcripts + keyframes are read from `../video_parser/outputs/<source_key>/` (relative to `backend/`). Point `TRANSCRIPTS_ROOT` / `KEYFRAMES_ROOT` in `rag.py` / `frames.py` if your video-parser output lives elsewhere.
- The local RAG index caches embeddings to `backend/.cache/rag_index.pkl` so restarts are instant.
