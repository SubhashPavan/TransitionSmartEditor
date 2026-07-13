import { useEffect, useRef, useState } from 'react'
import {
  Send, User, MessageSquarePlus, X, ShieldCheck, ExternalLink,
} from 'lucide-react'
import * as api from '../lib/api'
import CommentMargin from '../components/CommentMargin'

/**
 * Reviewer — the read-only + comment-only view of a shared SOP. Rendered
 * at /review/<token>. On first load, asks the reviewer for a display name
 * (persisted in localStorage per share). Reviewer can:
 *   - Read the SOP
 *   - Select text and click "Comment" to attach a note to that snippet
 *   - See existing comments in a right-side panel
 * All actions post through /api/share endpoints — the author's editor
 * polls the same endpoint to see feedback come in.
 */
export default function Reviewer({ token }) {
  const [status, setStatus] = useState('loading')      // loading | ready | notfound | err
  const [errorMsg, setErrorMsg] = useState(null)
  const [share, setShare] = useState(null)             // {token, doc_html, doc_title, author, comments, ...}
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem(`ts-reviewer-${token}`) || '')
  const [nameDraft, setNameDraft] = useState('')

  // Selection tracking for "Add comment" flow — preserve the Range and the
  // on-screen position of the selection so we can float a chip next to it.
  // The chip is a single button; clicking it opens the inline compose bubble.
  const [pendingAnchor, setPendingAnchor] = useState(null)   // {text, range, chipRect}
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const docRef = useRef(null)
  // Track which comment IDs have already been injected inline so we don't
  // wrap the same text twice on each poll tick.
  const injectedIdsRef = useRef(new Set())

  // Load + poll for new comments every 5s so the author's replies show up.
  useEffect(() => {
    let cancelled = false
    async function pull(initial) {
      try {
        const rec = await api.getShare(token, { includeHtml: initial })
        if (cancelled) return
        setShare(prev => initial ? rec : { ...(prev || rec), comments: rec.comments })
        if (initial) setStatus('ready')
      } catch (e) {
        if (cancelled) return
        if (String(e?.message || '').includes('404')) setStatus('notfound')
        else { setErrorMsg(String(e?.message || e)); setStatus('err') }
      }
    }
    pull(true)
    const iv = setInterval(() => pull(false), 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [token])

  /* ─── Selection → floating "+ Comment" chip near the selection ─── */
  useEffect(() => {
    if (!reviewerName) return
    const onUp = () => {
      // The composer intercepts its own mouseups already; ignore them so the
      // chip doesn't reappear while the reviewer is typing.
      if (composerOpen) return
      const sel = window.getSelection()
      const text = (sel?.toString() || '').trim()
      if (!text || sel.rangeCount === 0 || !docRef.current) {
        setPendingAnchor(null)
        return
      }
      const anchor = sel.anchorNode
      const anchorEl = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor
      if (!docRef.current.contains(anchorEl)) { setPendingAnchor(null); return }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      // Position the chip just above the selection, horizontally centered.
      const chipRect = {
        top: Math.max(8, rect.top - 40),
        left: Math.max(8, Math.min(window.innerWidth - 200, rect.left + rect.width / 2 - 90)),
      }
      setPendingAnchor({ text: text.slice(0, 200), range: range.cloneRange(), chipRect })
    }
    const onScroll = () => setPendingAnchor(null)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [reviewerName, composerOpen])

  /* ─── One-time: set the doc's innerHTML manually ───
   * We do this ourselves (not via dangerouslySetInnerHTML) so React can
   * re-render the page for comment updates without wiping any inline
   * .ts-comment spans we've injected. Runs once per doc_html change. */
  const appliedHtmlRef = useRef(null)
  useEffect(() => {
    if (!share?.doc_html || !docRef.current || !reviewerName) return
    if (appliedHtmlRef.current === share.doc_html) return   // already applied
    docRef.current.innerHTML = share.doc_html
    appliedHtmlRef.current = share.doc_html
    injectedIdsRef.current.clear()   // doc reset → hydrate all comments again
  }, [share?.doc_html, reviewerName])

  /* ─── Hydrate persisted comments as inline .ts-comment spans ─── */
  useEffect(() => {
    if (!docRef.current || !reviewerName) return
    const comments = share?.comments || []
    comments.forEach(c => {
      if (!c.anchor_text || injectedIdsRef.current.has(c.id)) return
      const wrapped = wrapFirstTextMatch(docRef.current, c.anchor_text, c.id, c.text, c.author)
      if (wrapped) injectedIdsRef.current.add(c.id)
    })
  }, [share?.comments, reviewerName, appliedHtmlRef.current])

  const saveName = () => {
    const n = nameDraft.trim()
    if (!n) return
    localStorage.setItem(`ts-reviewer-${token}`, n)
    setReviewerName(n)
  }

  const submitComment = async () => {
    const text = commentDraft.trim()
    if (!text || !pendingAnchor) return
    try {
      const c = await api.addShareComment(token, {
        text, author: reviewerName || 'Reviewer',
        anchorText: pendingAnchor.text,
      })
      // Wrap the preserved selection Range inline so a Word-style margin
      // balloon renders immediately — CommentMargin picks it up on its next scan.
      wrapRangeAsComment(pendingAnchor.range, c.id, text, reviewerName)
      injectedIdsRef.current.add(c.id)
      // Optimistically add to local state — poll will reconcile
      setShare(prev => prev ? { ...prev, comments: [...(prev.comments || []), c] } : prev)
      setCommentDraft('')
      setPendingAnchor(null)
      setComposerOpen(false)
      window.getSelection()?.removeAllRanges()
    } catch (e) {
      alert('Failed to send comment: ' + String(e?.message || e))
    }
  }

  const cancelComposer = () => {
    setPendingAnchor(null)
    setCommentDraft('')
    setComposerOpen(false)
    window.getSelection()?.removeAllRanges()
  }


  /* ── Render states ── */
  if (status === 'loading') {
    return <FullscreenMsg title="Loading review…" subtitle="Fetching the shared document." />
  }
  if (status === 'notfound') {
    return <FullscreenMsg title="Review link not found" subtitle="The link may have expired or been revoked. Ask the author to resend." />
  }
  if (status === 'err') {
    return <FullscreenMsg title="Couldn't load" subtitle={errorMsg} tone="danger" />
  }
  if (!reviewerName) {
    return (
      <NamePrompt
        share={share}
        value={nameDraft}
        onChange={setNameDraft}
        onSubmit={saveName}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAFAF9] text-slate-900 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 h-12 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-sm">
          TS
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{share?.doc_title || 'Untitled SOP'}</div>
          <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck size={10} /> Review mode — you can read + comment, not edit
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-slate-600">
          <User size={12} className="text-slate-400" />
          <b>{reviewerName}</b>
          <span className="text-slate-400">·</span>
          <span>Author: {share?.author || '—'}</span>
        </div>
      </div>

      {/* Doc — full width. Feedback lives entirely in inline .ts-comment
          spans + right-margin balloons (CommentMargin). Leaving ~360px of
          padding-right on the scroll container gives the margin balloons
          real estate to render into. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto py-6 px-6" style={{ paddingRight: 380 }}>
          <div
            ref={docRef}
            className="max-w-[820px] mx-auto bg-white rounded shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06)] px-12 py-10 uploaded-doc"
          />
        </div>
      </div>

      {/* Floating "+ Add comment" chip — appears above any text selection
          inside the doc. Click to open the inline composer bubble. */}
      {pendingAnchor && !composerOpen && (
        <button
          onMouseDown={(e) => e.preventDefault()}   // don't blur the selection
          onClick={() => setComposerOpen(true)}
          style={{ position: 'fixed', top: pendingAnchor.chipRect.top, left: pendingAnchor.chipRect.left, zIndex: 50 }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-slate-900 text-white text-[11.5px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:bg-brand-600 transition-colors"
        >
          <MessageSquarePlus size={12} /> Add comment
        </button>
      )}

      {/* Inline composer bubble — opens where the chip was, right next to
          the selected text. Contains the quoted anchor + textarea + Send. */}
      {pendingAnchor && composerOpen && (
        <div
          style={{ position: 'fixed', top: pendingAnchor.chipRect.top, left: pendingAnchor.chipRect.left, width: 320, zIndex: 60 }}
          className="bg-white rounded-lg shadow-[0_20px_50px_rgba(15,23,42,0.25)] border border-slate-200 overflow-hidden animate-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 border-b border-slate-100">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[9px] font-semibold flex items-center justify-center">
              {reviewerInitials(reviewerName)}
            </div>
            <div className="text-[11.5px] font-semibold text-slate-800 truncate flex-1">{reviewerName}</div>
            <button onClick={cancelComposer} className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              <X size={12} />
            </button>
          </div>
          <div className="px-3 pt-2 pb-1 text-[10.5px] italic text-slate-500 truncate" title={pendingAnchor.text}>
            on “{pendingAnchor.text}”
          </div>
          <div className="px-3 pb-3">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment() }
                else if (e.key === 'Escape') { e.preventDefault(); cancelComposer() }
              }}
              rows={3}
              autoFocus
              placeholder="Type your feedback… (Ctrl+Enter to send)"
              className="w-full text-[12px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
            />
            <div className="flex items-center gap-1 mt-2 justify-end">
              <button
                onClick={cancelComposer}
                className="h-7 px-2.5 rounded text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitComment}
                disabled={!commentDraft.trim()}
                className="h-7 px-3 rounded text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 transition-colors"
              >
                <Send size={11} /> Send
              </button>
            </div>
          </div>
        </div>
      )}

      <UploadedDocStyles />
      {/* Word-style margin balloons for every .ts-comment span in the doc. */}
      <CommentMargin />
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Inline comment injection
──────────────────────────────────────────────────────── */

/**
 * Wrap the reviewer's live Range in a <span class="ts-comment"> so both
 * the inline anchor highlight and the margin balloon (via CommentMargin)
 * appear immediately. Silently no-ops if the range no longer resolves.
 */
function wrapRangeAsComment(range, commentId, commentText, author) {
  if (!range || range.collapsed) return
  try {
    const span = range.startContainer.ownerDocument.createElement('span')
    span.className = 'ts-comment'
    span.setAttribute('data-comment-id',   commentId || '')
    span.setAttribute('data-comment-text', commentText || '')
    if (author) span.setAttribute('data-comment-author', author)
    range.surroundContents(span)
  } catch {
    // surroundContents throws if the range crosses element boundaries
    // in a way we can't cleanly wrap. Fall back to a text-search wrap.
    const host = range.commonAncestorContainer?.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer
    const text = range.toString()
    if (host && text) wrapFirstTextMatch(host, text, commentId, commentText, author)
  }
}

/**
 * Find the first occurrence of `needle` inside `root`'s text nodes and
 * wrap it in a .ts-comment span. Used to hydrate persisted comments
 * whose original Range is gone (e.g. after a fresh page load).
 *
 * CSS `text-transform: uppercase` makes `Selection.toString()` return the
 * transformed casing in most browsers, but the source text nodes stay in
 * their original case — so we search case-insensitively and slice using
 * the source indices. Returns true on success.
 */
function wrapFirstTextMatch(root, needle, commentId, commentText, author) {
  if (!root || !needle) return false
  const needleLower = needle.toLowerCase()
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.parentElement?.closest?.('.ts-comment')) return NodeFilter.FILTER_REJECT
      return n.textContent.toLowerCase().includes(needleLower)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP
    },
  })
  const node = walker.nextNode()
  if (!node) return false
  const idx = node.textContent.toLowerCase().indexOf(needleLower)
  if (idx < 0) return false
  const range = root.ownerDocument.createRange()
  range.setStart(node, idx)
  range.setEnd(node, idx + needle.length)
  const span = root.ownerDocument.createElement('span')
  span.className = 'ts-comment'
  span.setAttribute('data-comment-id',   commentId || '')
  span.setAttribute('data-comment-text', commentText || '')
  if (author) span.setAttribute('data-comment-author', author)
  try {
    range.surroundContents(span)
    return true
  } catch {
    return false
  }
}

/* ────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────── */

/** "Priya K." → "PK", "John Doe" → "JD", "Pavan" → "PA". */
function reviewerInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function NamePrompt({ share, value, onChange, onSubmit }) {
  const emailHint = share?.reviewer_email || ''
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.15)] border border-slate-200 p-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center mb-4">
          <ShieldCheck size={18} />
        </div>
        <div className="text-[16px] font-semibold text-slate-900 mb-1">Review this SOP</div>
        <div className="text-[12.5px] text-slate-600 mb-5">
          <b>{share?.author || 'The author'}</b> shared <b>{share?.doc_title || 'a document'}</b> with you. Add your name to leave feedback.
        </div>
        {emailHint && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-[11.5px] text-slate-600">
            Invited: <b>{emailHint}</b>
          </div>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onSubmit() }}
          placeholder="Your name — e.g. Priya K."
          className="w-full h-11 rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          autoFocus
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="mt-4 w-full h-10 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          Enter review <ExternalLink size={12} />
        </button>
        <div className="mt-3 text-center text-[10.5px] text-slate-400">
          Nothing about you leaves this network — the name is only used to label your feedback.
        </div>
      </div>
    </div>
  )
}

function FullscreenMsg({ title, subtitle, tone }) {
  const bg = tone === 'danger'
    ? 'bg-gradient-to-br from-red-50 to-white'
    : 'bg-gradient-to-br from-slate-50 to-white'
  const iconClr = tone === 'danger' ? 'text-red-500' : 'text-slate-400'
  return (
    <div className={`h-screen flex items-center justify-center ${bg}`}>
      <div className="text-center max-w-md px-6">
        <div className={`w-12 h-12 rounded-full mx-auto mb-4 border-2 border-current inline-flex items-center justify-center ${iconClr}`}>
          <ShieldCheck size={20} />
        </div>
        <div className="text-[16px] font-semibold text-slate-900 mb-1">{title}</div>
        {subtitle && <div className="text-[12.5px] text-slate-500">{subtitle}</div>}
      </div>
    </div>
  )
}

/**
 * Inline styles for the shared HTML — the author's canvas uses `.uploaded-doc`
 * as its scope selector so we reuse that here for visual parity.
 */
function UploadedDocStyles() {
  return (
    <style>{`
      .uploaded-doc h1 { font-size: 26px; font-weight: 700; color: #2E74B5; margin: 12px 0 6px; }
      .uploaded-doc h2 { font-size: 20px; font-weight: 700; color: #2E74B5; margin: 18px 0 8px; }
      .uploaded-doc h3 { font-size: 16px; font-weight: 700; color: #1F3864; margin: 14px 0 6px; }
      .uploaded-doc h4 { font-size: 14px; font-weight: 700; color: #1F3864; margin: 12px 0 4px; }
      .uploaded-doc p  { margin: 0 0 10px; }
      .uploaded-doc ul, .uploaded-doc ol { margin: 0 0 10px 24px; }
      .uploaded-doc li { margin: 2px 0; }
      .uploaded-doc table { border-collapse: collapse; margin: 10px 0; width: 100%; }
      .uploaded-doc td, .uploaded-doc th { border: 1px solid #cbd5e1; padding: 4px 8px; }
      .uploaded-doc img { max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; }
      .uploaded-doc svg { max-width: 100%; height: auto; }
    `}</style>
  )
}
