/**
 * Thin wrapper around the sop-editor backend (FastAPI on :8002, proxied
 * via Vite at /api). Every call routes through here so error handling and
 * base-URL logic live in one place.
 */

// In dev, calls are proxied through Vite to the local FastAPI.
// In prod (Vercel), set VITE_API_BASE to the Render backend URL, e.g.
// https://ts-sop-editor-api.onrender.com/api. Falls back to /api so
// local `vite preview` and dev still work with the Vite proxy.
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')

async function req(path, init = {}) {
  const url = `${BASE}${path}`
  let res
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } })
  } catch (e) {
    throw new Error(`Network error calling ${path}: ${e?.message || e}`)
  }
  const ctype = res.headers.get('content-type') || ''
  const body = ctype.includes('application/json') ? await res.json().catch(() => ({})) : await res.text()
  if (!res.ok) {
    const msg = (body && typeof body === 'object' && body.detail) ? body.detail : (typeof body === 'string' ? body : `HTTP ${res.status}`)
    throw new Error(`${path} → ${res.status}: ${msg}`)
  }
  return body
}

/** GET /api/health — sanity check the backend is up and configured. */
export async function health() {
  return req('/health')
}

/** GET /api/sources — list every video/document/image in the sandbox. */
export async function listSources() {
  const r = await req('/sources')
  return r.items || []
}

/** GET /api/sources/{id}/stream-url — signed SAS URL for direct browser streaming.
 *  Legacy path; keep it for external players that want the direct Blob URL. */
export async function getStreamUrl(sourceId, ttlMinutes = 60) {
  return req(`/sources/${encodeURIComponent(sourceId)}/stream-url?ttl_minutes=${ttlMinutes}`)
}

/**
 * The streaming-proxy URL served from THIS host. Uses HTTP byte-range
 * so <video> seek/scrub works out of the box, and is CDN-cacheable via
 * the aggressive Cache-Control the backend sets. Point <video src> here.
 */
export function streamProxyUrl(sourceId) {
  return `${BASE}/stream/${encodeURIComponent(sourceId)}`
}

/**
 * POST /api/generate-from-segment — Gemini 2.5 Flash watches the segment
 * and produces SOP steps using the reviewer notes as an outline.
 */
export async function generateFromSegment({ sourceId, startSec, endSec, notes, targetContext }) {
  return req('/generate-from-segment', {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      start_sec: startSec,
      end_sec: endSec,
      notes: notes || '',
      target_context: targetContext || null,
    }),
  })
}

/**
 * POST /api/generate-from-moments — send captured moments (screenshots +
 * per-moment notes) to Gemini, which weaves them together with the
 * transcript context and returns imperative SOP steps for the given
 * section heading.
 */
export async function generateFromMoments({ sourceId, sourceKey, sectionTitle, moments }) {
  return req('/generate-from-moments', {
    method: 'POST',
    body: JSON.stringify({
      source_id:     sourceId || null,
      source_key:    sourceKey || null,
      section_title: sectionTitle,
      moments:       moments.map(m => ({
        time_sec:       m.time_sec,
        note:           m.note || '',
        image_data_url: m.dataUrl || m.image_data_url || '',
      })),
    }),
  })
}

/**
 * POST /api/ai/block-action — GPT-4o driven single-block edit. The frontend
 * only ever sends `action: "edit"` now; the legacy actions still work on the
 * server side for external callers.
 */
export async function aiBlockAction({ action, blockText, blockKind, tone, length, instruction, missingHint }) {
  const r = await req('/ai/block-action', {
    method: 'POST',
    body: JSON.stringify({
      action:       action || 'edit',
      block_text:   blockText,
      block_kind:   blockKind || 'paragraph',
      tone:         tone || null,
      length:       length || null,
      instruction:  instruction || null,
      missing_hint: missingHint || null,
    }),
  })
  return r.text || ''
}

/**
 * GET /api/frames/{sourceKey}?near_sec=X&n=9 — the N frames closest to
 * `nearSec` from the pre-extracted keyframes folder. Returns
 * `{items: [{time_sec, name, url}], source_key}`.
 */
export async function listFramesNear({ sourceKey, nearSec, n = 9 }) {
  return req(`/frames/${encodeURIComponent(sourceKey)}?near_sec=${nearSec}&n=${n}`)
}

/** Same but a start/end window (all frames inside). */
export async function listFramesInWindow({ sourceKey, startSec, endSec }) {
  return req(`/frames/${encodeURIComponent(sourceKey)}?start_sec=${startSec}&end_sec=${endSec}`)
}

/**
 * POST /api/frames/search — semantic search. Given a description of what
 * the reviewer wants to see, Gemini vision picks the best-matching frames.
 */
export async function searchFramesByDescription({ sourceKey, description, startSec, endSec, topK = 6 }) {
  return req('/frames/search', {
    method: 'POST',
    body: JSON.stringify({
      source_key:  sourceKey,
      description: description,
      start_sec:   startSec ?? null,
      end_sec:     endSec   ?? null,
      top_k:       topK,
    }),
  })
}

/* ═══════════ Share to reviewer + feedback comments ═══════════ */

/**
 * POST /api/share — snapshot the doc + register the reviewer. Returns
 * {token, share_url, created_at}. The magic link is share_url — the
 * reviewer opens it and lands on /review/<token>.
 */
export async function createShare({ docHtml, docTitle, author, reviewerEmail, permissions = 'comment' }) {
  return req('/share', {
    method: 'POST',
    body: JSON.stringify({
      doc_html:       docHtml,
      doc_title:      docTitle || '',
      author:         author || 'Author',
      reviewer_email: reviewerEmail || null,
      permissions,
    }),
  })
}

/**
 * GET /api/share/{token} — fetch a share record. Include HTML when the
 * reviewer opens it; skip it when the author is only polling for new
 * comments (savings on payload).
 */
export async function getShare(token, { includeHtml = true } = {}) {
  return req(`/share/${encodeURIComponent(token)}?include_html=${includeHtml}`)
}

/** POST /api/share/{token}/comments — reviewer posts a comment. */
export async function addShareComment(token, { text, author, anchorText, anchorId }) {
  return req(`/share/${encodeURIComponent(token)}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      author:      author || 'Reviewer',
      anchor_text: anchorText || null,
      anchor_id:   anchorId || null,
    }),
  })
}

/** PATCH /api/share/{token}/comments/{id} — mark a comment resolved/unresolved. */
export async function resolveShareComment(token, commentId, resolved = true) {
  return req(`/share/${encodeURIComponent(token)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ resolved }),
  })
}

/** PUT /api/share/{token} — author pushes a fresh doc snapshot to the same URL. */
export async function updateShare(token, { docHtml }) {
  return req(`/share/${encodeURIComponent(token)}`, {
    method: 'PUT',
    body: JSON.stringify({ doc_html: docHtml }),
  })
}

/* ═══════════ Agentic-RAG chat ═══════════ */

/**
 * POST /api/chat — ask the transcript-index-backed assistant a question.
 * `history` is optional; if you pass earlier {role, content} turns the model
 * remembers them for this call. Returns {answer, citations, tool_trace}.
 */
export async function chatAsk({ question, sourceKey, history }) {
  return req('/chat', {
    method: 'POST',
    body: JSON.stringify({
      question,
      source_key: sourceKey || null,
      history:    (history || []).map(m => ({ role: m.role, content: m.content })),
    }),
  })
}

/** GET /api/chat/status — RAG index diagnostics. */
export async function chatStatus() {
  return req('/chat/status')
}
