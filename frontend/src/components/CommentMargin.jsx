import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, Reply, Pencil, Trash2, Check, X } from 'lucide-react'

/**
 * CommentMargin — Word-style right-margin balloons.
 *
 * Scans .ts-comment anchors, for each one renders a small card in the
 * grey area to the right of the page (or the viewport edge if there's
 * no page container), vertically stacked so balloons never overlap.
 * A soft SVG leader line goes from the anchor's right edge to the top-
 * left of its balloon.
 *
 * Fully DOM-driven — no state to sync with CommentsPanel. The anchor's
 * `data-comment-text` attribute is the source of truth.
 */
/**
 * Optional `onResolveShareComment` prop: `(commentId, anchorEl) => void`
 * Called when the author clicks the green "Resolve" button on a comment
 * that came from a shared reviewer (`data-comment-source="reviewer"`).
 * The parent (Editor) hits the /api/share/.../comments/{id} endpoint and
 * clears the local unresolved-count badge. This component always removes
 * the span optimistically.
 */
export default function CommentMargin({ onResolveShareComment }) {
  const [balloons, setBalloons] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const rafRef = useRef(0)

  const scan = useCallback(() => {
    // Prefer the docx-preview page rect for margin placement; fall back to
    // the .page-shadow (sample doc) or the whole canvas if none.
    const pageEl = document.querySelector('.docx-preview-host section.docx-fidelity') ||
                   document.querySelector('.docx-preview-host') ||
                   document.querySelector('.page-shadow') ||
                   document.querySelector('.uploaded-doc')
    if (!pageEl) { setBalloons([]); return }

    const pageRect = pageEl.getBoundingClientRect()
    const marginLeft = Math.min(window.innerWidth - 260, pageRect.right + 20)
    const width      = Math.min(240, Math.max(200, window.innerWidth - marginLeft - 12))

    const anchors = Array.from(document.querySelectorAll('.ts-comment'))
    // Order by vertical position so stacking is consistent.
    anchors.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)

    let cursorY = -Infinity
    const list = []
    for (const el of anchors) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue   // detached / display:none
      const id   = el.getAttribute('data-comment-id') || `c-${list.length}`
      const text = el.getAttribute('data-comment-text') || ''
      const author = el.getAttribute('data-comment-author') || 'Priya K.'
      const source = el.getAttribute('data-comment-source') || null   // 'reviewer' | null
      const isPending = el.classList.contains('ts-comment-pending')
      const anchorText = (el.textContent || '').slice(0, 60)

      // Preferred top: align to anchor top. Stack below the previous balloon
      // if it would overlap (12 px gutter).
      const preferredTop = r.top
      const top = Math.max(preferredTop, cursorY + 12)
      const anchorRight = Math.min(r.right, marginLeft - 12)

      list.push({
        id, text, author, source, isPending, anchorText,
        top, left: marginLeft, width,
        anchorX: anchorRight, anchorY: r.top + r.height / 2,
        el,
      })
      // Estimate rendered card height: header 30 + text 18*lines + padding
      const lines = Math.max(2, Math.ceil((text.length || 20) / 32))
      cursorY = top + 30 + lines * 18 + 20
    }
    setBalloons(list)
  }, [])

  const scheduleScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(scan)
  }, [scan])

  useEffect(() => {
    scan()   // synchronous first scan so we don't wait for a raf
    // Periodic re-scan catches text edits + docx-preview streaming.
    const iv = setInterval(scan, 800)
    window.addEventListener('scroll', scan, true)
    window.addEventListener('resize', scan)
    return () => {
      clearInterval(iv)
      window.removeEventListener('scroll', scan, true)
      window.removeEventListener('resize', scan)
      cancelAnimationFrame(rafRef.current)
    }
  }, [scan])

  /* ─── Editing ─── */
  const startEdit = (b) => { setEditingId(b.id); setDraft(b.text) }
  const saveEdit  = (b) => {
    const t = draft.trim()
    if (!t) return cancelEdit(b)
    b.el.setAttribute('data-comment-text', t)
    b.el.classList.remove('ts-comment-pending')
    setEditingId(null); setDraft('')
    scheduleScan()
  }
  const cancelEdit = (b) => {
    if (b.isPending) deleteComment(b)   // pending → discard cleanly
    setEditingId(null); setDraft('')
  }
  const deleteComment = (b) => {
    if (!b.el) return
    // Unwrap the span → anchor text stays, comment is gone
    const parent = b.el.parentNode
    if (parent) {
      while (b.el.firstChild) parent.insertBefore(b.el.firstChild, b.el)
      parent.removeChild(b.el)
    }
    scheduleScan()
  }
  /**
   * Reviewer-comment specific: mark resolved on the backend AND remove the
   * inline anchor + margin balloon locally so the author's view stays tidy.
   * We don't hand-hold the network error case here — the parent's periodic
   * poll would re-inject the span if the resolve failed, which surfaces the
   * problem clearly.
   */
  const resolveShareComment = (b) => {
    if (!b.el) return
    const commentId = b.el.getAttribute('data-comment-id')
    if (commentId && typeof onResolveShareComment === 'function') {
      try { onResolveShareComment(commentId, b.el) } catch { /* swallow */ }
    }
    deleteComment(b)
  }
  const scrollToAnchor = (b) => {
    b.el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const prev = b.el.style.boxShadow
    b.el.style.transition = 'box-shadow 0.2s'
    b.el.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.35)'
    setTimeout(() => { b.el.style.boxShadow = prev || 'none' }, 1200)
  }

  // Auto-open editor for any pending balloon that lands on screen.
  useEffect(() => {
    const pending = balloons.find(b => b.isPending)
    if (pending && editingId !== pending.id) {
      setEditingId(pending.id)
      setDraft(pending.text || '')
    }
  }, [balloons, editingId])

  if (balloons.length === 0) return null

  return (
    <>
      {/* Leader lines — one SVG element covers the whole viewport */}
      <svg
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 29 }}
        width="100%" height="100%"
      >
        {balloons.map(b => {
          const startX = b.anchorX
          const startY = b.anchorY
          const endX   = b.left
          const endY   = b.top + 18
          const midX   = startX + (endX - startX) * 0.65
          return (
            <path
              key={`ln-${b.id}`}
              d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
              stroke={b.isPending ? '#9CA3AF' : '#93C5FD'}
              strokeWidth="1.5"
              fill="none"
              strokeDasharray={b.isPending ? '4 4' : '0'}
            />
          )
        })}
      </svg>

      {/* Balloons */}
      {balloons.map(b => (
        <div
          key={b.id}
          style={{ position: 'fixed', top: b.top, left: b.left, width: b.width, zIndex: 30 }}
          className={`bg-white rounded-lg shadow-[0_4px_14px_rgba(15,23,42,0.10)] border-l-4 ${
            b.isPending ? 'border-slate-400' : 'border-brand-500'
          } border-y border-r border-slate-100`}
        >
          {/* Header — avatar + name are per-comment via data-comment-author.
              Reviewer-authored comments (from the shared review link) are
              read-only: only a "Resolve" action, no Edit / Delete. */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full text-white text-[9px] font-semibold flex items-center justify-center flex-shrink-0 ${
              b.source === 'reviewer'
                ? 'bg-gradient-to-br from-brand-500 to-brand-700'
                : 'bg-gradient-to-br from-orange-400 to-orange-600'
            }`}>{initialsOf(b.author)}</div>
            <button onClick={() => scrollToAnchor(b)} className="text-[10.5px] font-semibold text-slate-800 truncate flex-1 text-left hover:text-brand-700 transition-colors" title={b.anchorText}>
              {b.author}
              {b.source === 'reviewer' && (
                <span className="ml-1 px-1 py-[1px] rounded bg-brand-100 text-brand-700 text-[8.5px] font-bold tracking-widest uppercase align-middle">Reviewer</span>
              )}
            </button>
            {editingId !== b.id && !b.isPending && (
              <div className="flex items-center gap-0.5 opacity-80">
                {b.source === 'reviewer' ? (
                  <IconMini onClick={() => resolveShareComment(b)} icon={<Check size={10} />} title="Mark resolved" tone="ok" />
                ) : (
                  <>
                    <IconMini onClick={() => startEdit(b)}     icon={<Pencil size={10} />} title="Edit" />
                    <IconMini onClick={() => deleteComment(b)} icon={<Trash2 size={10} />} title="Delete" tone="danger" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Anchor preview */}
          <div className="px-3 pb-1 text-[9.5px] text-slate-500 italic truncate" title={b.anchorText}>
            on "{b.anchorText}"
          </div>

          {/* Body / editor */}
          {editingId === b.id ? (
            <div className="px-3 pb-2.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(b) }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(b) }
                }}
                placeholder={b.isPending ? 'Type your comment…' : 'Edit comment…'}
                rows={2}
                autoFocus
                className="w-full text-[11.5px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
              />
              <div className="flex items-center gap-1 mt-1.5 justify-end">
                <button
                  onClick={() => cancelEdit(b)}
                  className="h-6 px-2 rounded text-[10.5px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit(b)}
                  disabled={!draft.trim()}
                  className="h-6 px-2.5 rounded text-[10.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition-colors"
                >
                  <Check size={10} /> Post
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 pb-2.5 text-[11.5px] text-slate-800 leading-snug whitespace-pre-wrap">
              {b.text || <span className="italic text-slate-400">(empty)</span>}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function IconMini({ icon, onClick, title, tone }) {
  const cls =
    tone === 'danger' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' :
    tone === 'ok'     ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 bg-emerald-50/60' :
    'text-slate-400 hover:text-brand-700 hover:bg-brand-50'
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-5 h-5 rounded inline-flex items-center justify-center transition-colors ${cls}`}
    >
      {icon}
    </button>
  )
}

/** "Priya K." → "PK", "John Doe" → "JD", "Pavan" → "PA". */
function initialsOf(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
