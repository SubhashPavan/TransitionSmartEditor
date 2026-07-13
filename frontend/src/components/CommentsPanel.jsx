import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageSquarePlus, X, Trash2, ChevronRight, Check, Reply } from 'lucide-react'

/**
 * Comments panel — Word-style margin bubbles.
 *
 * Flow (matches Word):
 *   1. Reviewer selects text and clicks New Comment.
 *   2. The Editor wraps that selection in an empty `.ts-comment.ts-comment-pending`
 *      span (anchor locked, text empty), then opens this panel.
 *   3. This panel spots the pending comment (empty `data-comment-text`) and
 *      renders it in EDIT mode: inline textarea, focused automatically,
 *      Save + Cancel buttons.
 *   4. Save writes the typed text into the span's data-comment-text.
 *      Cancel unwraps the span (removes the anchor).
 *
 * Existing comments show as read-only bubbles; each has "Reply / Edit / Delete"
 * hover actions. Reply appends "· <you>: <text>" to the comment — cheap thread
 * approximation without a full data model.
 */
export default function CommentsPanel({ open, onClose }) {
  const [comments, setComments] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [draftText, setDraftText] = useState('')
  const textareaRef = useRef(null)

  const refresh = useCallback(() => {
    const spans = document.querySelectorAll('.ts-comment')
    const list = Array.from(spans).map(el => ({
      id: el.getAttribute('data-comment-id') || '',
      text: el.getAttribute('data-comment-text') || '',
      anchor: el.textContent || '',
      isPending: el.classList.contains('ts-comment-pending'),
      el,
    }))
    setComments(list)
    // Auto-enter edit mode for whichever comment is pending
    const pending = list.find(c => c.isPending)
    if (pending && editingId !== pending.id) {
      setEditingId(pending.id)
      setDraftText(pending.text)
    }
  }, [editingId])

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setDraftText('')
      return
    }
    refresh()
    const iv = setInterval(refresh, 1500)
    return () => clearInterval(iv)
  }, [open, refresh])

  // Focus the textarea whenever we enter edit mode
  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(draftText.length, draftText.length)
    }
  }, [editingId])

  const scrollTo = (el) => {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'background-color 0.3s ease'
    const prev = el.style.backgroundColor
    el.style.backgroundColor = 'rgba(37, 99, 235, 0.35)'
    setTimeout(() => { el.style.backgroundColor = prev || '' }, 1200)
  }

  const saveComment = (comment) => {
    const trimmed = draftText.trim()
    if (!trimmed) {
      // Empty save = same as cancel for a pending comment (unwrap)
      if (comment.isPending) cancelPending(comment)
      else setEditingId(null)
      return
    }
    comment.el.setAttribute('data-comment-text', trimmed)
    comment.el.setAttribute('title', trimmed)
    comment.el.classList.remove('ts-comment-pending')
    setEditingId(null)
    setDraftText('')
    refresh()
  }

  const cancelPending = (comment) => {
    if (!comment?.el) return
    // Unwrap the span so the anchor text stays but the comment is removed
    const parent = comment.el.parentNode
    if (parent) {
      while (comment.el.firstChild) parent.insertBefore(comment.el.firstChild, comment.el)
      parent.removeChild(comment.el)
    }
    setEditingId(null)
    setDraftText('')
    refresh()
  }

  const startEdit = (comment) => {
    setEditingId(comment.id)
    setDraftText(comment.text)
  }

  const startReply = (comment) => {
    const existing = comment.text
    setEditingId(comment.id)
    setDraftText(existing ? `${existing}\n\n— Reply: ` : '')
  }

  const deleteComment = (comment) => {
    if (!comment.el) return
    if (!window.confirm(`Delete comment "${comment.text}"?`)) return
    const parent = comment.el.parentNode
    if (!parent) return
    while (comment.el.firstChild) parent.insertBefore(comment.el.firstChild, comment.el)
    parent.removeChild(comment.el)
    refresh()
  }

  if (!open) return null

  return (
    <div className="fixed top-[92px] right-6 bottom-6 z-40 w-[340px] bg-white rounded-xl shadow-[0_20px_60px_rgba(15,23,42,0.20)] border border-slate-200 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
        <MessageSquarePlus size={14} className="text-brand-600" />
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold text-slate-900">Comments</div>
          <div className="text-[10.5px] text-slate-500">{comments.length} comment{comments.length === 1 ? '' : 's'}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {comments.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="text-[12px] text-slate-400 mb-2">No comments yet.</div>
            <div className="text-[11px] text-slate-500 leading-snug">
              Select text in the document, then click <b>New Comment</b> in the Review tab.
              A comment bubble will appear here for you to type in.
            </div>
          </div>
        ) : (
          comments.map((c, i) => (
            <CommentBubble
              key={c.id || i}
              comment={c}
              isEditing={editingId === c.id}
              draftText={draftText}
              setDraftText={setDraftText}
              textareaRef={editingId === c.id ? textareaRef : null}
              onScrollTo={() => scrollTo(c.el)}
              onSave={() => saveComment(c)}
              onCancel={() => c.isPending ? cancelPending(c) : setEditingId(null)}
              onEdit={() => startEdit(c)}
              onReply={() => startReply(c)}
              onDelete={() => deleteComment(c)}
            />
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 flex-shrink-0 text-[10.5px] text-slate-500 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-orange-400"></span>
        <span>PK · Priya K.</span>
        <span className="ml-auto text-slate-400">Ctrl+Enter to post</span>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Single comment "bubble" — read or edit mode, Word-like.
──────────────────────────────────────────────────────────── */
function CommentBubble({
  comment, isEditing, draftText, setDraftText, textareaRef,
  onScrollTo, onSave, onCancel, onEdit, onReply, onDelete,
}) {
  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      className={`mb-2 rounded-lg border transition-colors ${
        comment.isPending
          ? 'border-brand-300 bg-brand-50/60 shadow-[0_2px_10px_rgba(37,99,235,0.10)]'
          : isEditing
          ? 'border-amber-300 bg-amber-50/50'
          : 'border-slate-100 hover:border-brand-200 hover:bg-brand-50/20'
      }`}
    >
      {/* Author strip */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[9px] font-semibold flex items-center justify-center">
          PK
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-slate-800 leading-none">Priya K.</div>
          <div className="text-[9.5px] text-slate-400 leading-none mt-0.5">
            {comment.isPending ? 'Draft — not posted yet' : 'Just now'}
          </div>
        </div>
      </div>

      {/* Anchor preview */}
      <button
        onClick={onScrollTo}
        className="w-full text-left px-3 pt-1 pb-1.5 group"
        title="Scroll to this text"
      >
        <div className="flex items-start gap-1">
          <ChevronRight size={10} className="text-brand-500 mt-1 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
          <div className="text-[10.5px] text-slate-600 italic truncate flex-1">
            "{comment.anchor}"
          </div>
        </div>
      </button>

      {/* Body — edit or read */}
      {isEditing ? (
        <div className="px-3 pb-3">
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your comment…"
            rows={3}
            className="w-full text-[12px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
          />
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={onSave}
              disabled={!draftText.trim()}
              className="flex-1 h-7 rounded-md text-[11.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm inline-flex items-center justify-center gap-1 transition-colors"
            >
              <Check size={11} /> Post
            </button>
            <button
              onClick={onCancel}
              className="h-7 px-3 rounded-md text-[11.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 pb-2 text-[12px] text-slate-900 leading-snug whitespace-pre-wrap">
            {comment.text || <span className="italic text-slate-400">(empty comment)</span>}
          </div>
          <div className="px-2 pb-2 flex items-center gap-0.5 opacity-70">
            <IconAction icon={<Reply size={11} />}  label="Reply"  onClick={onReply} />
            <IconAction icon={<MessageSquarePlus size={11} />} label="Edit" onClick={onEdit} />
            <IconAction icon={<Trash2 size={11} />} label="Delete" onClick={onDelete} tone="danger" />
          </div>
        </>
      )}
    </div>
  )
}

function IconAction({ icon, label, onClick, tone }) {
  const cls = tone === 'danger'
    ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
    : 'text-slate-500 hover:text-brand-700 hover:bg-brand-50'
  return (
    <button
      onClick={onClick}
      className={`text-[10.5px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${cls}`}
    >
      {icon} {label}
    </button>
  )
}
