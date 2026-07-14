import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDocx, snapshotCurrentDocumentHtml } from '../lib/docLoader'
import { startTracking, totalActiveMs } from '../lib/sessionTimer'

/**
 * Mock step generator — turns a video segment + notes into a few plausible
 * SOP paragraphs. Parses the notes to preserve structure the reviewer
 * gave us. Replace this with a real LLM call when the backend is wired;
 * the prompt shape stays the same.
 *
 * Parsing rules:
 *   • Numbered lines (1., 2., ...) become numbered steps.
 *   • Bullet lines (-, *, •)      become numbered steps.
 *   • Lines with [MM:SS] tokens keep the timestamp cited in the step.
 *   • Plain prose is folded into a single step at the end.
 */
function mockGenerateStepsForSegment(source, startSec, endSec, notes) {
  const fmt = (s) => {
    const m = Math.floor(s / 60), r = Math.floor(s % 60)
    return `${m}:${String(r).padStart(2, '0')}`
  }

  const clean = (notes || '').trim()
  const lines = clean.split(/\n+/).map(l => l.trim()).filter(Boolean)

  // Pull structured lines first
  const structured = []
  const prose = []
  for (const line of lines) {
    const m = line.match(/^(?:(?:step\s*)?(\d+)[.)]|[-*•])\s*(.+)$/i)
    if (m) structured.push(m[2].trim())
    else prose.push(line)
  }

  const cite = (t) => t ? ` (see ${fmt(startSec + Math.max(0, (t / 100) * (endSec - startSec)))})` : ''

  const steps = []

  // Opener always gives context
  steps.push(
    `Open ${source.name} at ${fmt(startSec)}. This section of the walkthrough runs to ${fmt(endSec)} — keep the video ` +
    `visible while following along or refer back for details.`
  )

  if (structured.length > 0) {
    // Turn each structured line into a fleshed-out step
    structured.forEach((line, i) => {
      const stamp = (line.match(/\[(\d{1,2}:\d{2})\]/) || [])[1]
      const stripped = line.replace(/\[\d{1,2}:\d{2}\]/g, '').trim()
      steps.push(
        `Step ${i + 1}: ${sentenceCase(stripped)}${stamp ? ` (video @ ${stamp})` : ''}. ` +
        `Confirm the on-screen state matches before moving on.`
      )
    })
  } else if (prose.length > 0) {
    // No structure — fold prose into a single walkthrough step
    steps.push(
      `Follow the walkthrough exactly as demonstrated between ${fmt(startSec)} and ${fmt(endSec)}. ` +
      `Reviewer notes for this segment: ${prose.join(' ').slice(0, 240)}${prose.join(' ').length > 240 ? '…' : ''}`
    )
  } else {
    // No notes — generic guidance
    steps.push(
      `Follow the walkthrough exactly as shown from ${fmt(startSec)} to ${fmt(endSec)}. ` +
      `Populate every mandatory field marked with a red asterisk.`
    )
  }

  // Closer — always add a verification step
  steps.push(
    `Verify the expected confirmation appears after saving. If it does not, re-check the required inputs and retry — ` +
    `then proceed to the next section.`
  )

  return steps
}

/** Simple sentence-case helper — capitalises the first letter, leaves the rest alone. */
function sentenceCase(s) {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

/** Snap through zoom steps rather than free % increments */
const ZOOM_STEPS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200]
function roundStep(z, dir) {
  const idx = ZOOM_STEPS.findIndex(s => s >= z)
  const cur = idx === -1 ? ZOOM_STEPS.length - 1 : idx
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, cur + dir))
  return ZOOM_STEPS[next]
}
import TitleBar from '../components/TitleBar'
import Ribbon from '../components/Ribbon'
import LeftRail from '../components/LeftRail'
import Canvas from '../components/Canvas'
import FloatingChat from '../components/FloatingChat'
import MetricsOverlay from '../components/MetricsOverlay'
import ExportPrompt from '../components/ExportPrompt'
import CommentsPanel from '../components/CommentsPanel'
import CommentMargin from '../components/CommentMargin'
import ContextMenu from '../components/ContextMenu'
import CheckpointDialog from '../components/CheckpointDialog'
import ShareModal from '../components/ShareModal'
import ImageEnlargeModal from '../components/ImageEnlargeModal'
import AIActionModal from '../components/AIActionModal'
import MoveBlockModal from '../components/MoveBlockModal'
import SourcesPanel from '../components/SourcesPanel'
import VideoPlayer from '../components/VideoPlayer'
import GenerateFromVideoModal from '../components/GenerateFromVideoModal'
import * as api from '../lib/api'
import { exportAsWord, exportAsPdf } from '../lib/exportDoc'
import sopData from '../data/sopContent.json'

/**
 * The three-version model.
 *
 *   aiHtml       — the immutable AI-generated baseline. Set once from
 *                  the upload/blob-URL, never changes. Any read/write
 *                  to this version is intentionally blocked.
 *   humanHtml    — the live working copy. This is where all edits and
 *                  tracked changes happen. It's mutable, but the state
 *                  is set-once-then-DOM-owned (Editable component owns
 *                  the DOM; snapshotCurrentDocumentHtml() reads it back
 *                  when the user commits a checkpoint).
 *   checkpoints  — an append-only list of {id,label,timestamp,html}
 *                  snapshots taken from humanHtml. Restoring one
 *                  overwrites humanHtml and forces the canvas to remount.
 *   approvedHtml — the offline-signed .docx uploaded separately by
 *                  the reviewer. Read-only.
 *
 * currentVersion values:
 *   'ai'         → renders aiHtml, read-only
 *   'current'    → renders humanHtml, editable (this is the default)
 *   'cp-<ts>'    → renders a specific checkpoint's html, read-only
 *   'approved'   → renders approvedHtml, read-only
 */

export default function Editor({ uploadedDoc, onExit }) {
  const [selection, setSelection] = useState([])
  const [metricsOpen, setMetricsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('current')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [checkpointDialogOpen, setCheckpointDialogOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  // Tokens of shares created from this editor session, so we can poll for
  // reviewer feedback and surface a badge on the Share button.
  const [activeShareToken, setActiveShareToken] = useState(() => localStorage.getItem('ts-active-share-token') || null)
  const [reviewerFeedback, setReviewerFeedback] = useState([])
  const [ctxMenu, setCtxMenu] = useState(null)   // { x, y, hasSelection, selectionText } | null
  // Image clicks bypass the right rail entirely — they open the enlarge
  // modal directly, which now hosts every image action (crop, annotate,
  // delete, filmstrip, section timeline). Escape closes and returns to
  // the doc.
  const [enlargedImage, setEnlargedImage] = useState(null)
  // Command handed to the FloatingChat when a block-hover action fires
  // ({ prompt, selection }). The FloatingChat picks it up and auto-opens.
  const [chatCommand, setChatCommand] = useState(null)
  // Dedicated action modals for text-block operations.
  const [aiAction,   setAiAction]   = useState(null)   // { action, block }
  const [moveTarget, setMoveTarget] = useState(null)   // { block }

  // Sources panel + video player + generate flow
  const [showSourcesPanel, setShowSourcesPanel] = useState(true)
  const [sources,          setSources]          = useState([])     // fetched from backend
  const [sourcesError,     setSourcesError]     = useState('')
  const [playingVideo,     setPlayingVideo]     = useState(null)   // { source, startTime?, autoMarkIn?, autoMarkOut? }
  const [genFromVideo,     setGenFromVideo]     = useState(null)   // { source, startSec, endSec, notes }

  // Section → source-segment index. Keyed by normalized heading text so the
  // link survives docx-preview re-tagging (heading DOM ids change per render).
  // Persisted to localStorage so links survive reloads inside the same doc session.
  const [sectionLinks, setSectionLinks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sop-editor:section-links') || '{}') }
    catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem('sop-editor:section-links', JSON.stringify(sectionLinks)) } catch {}
  }, [sectionLinks])

  /**
   * Seed sectionLinks from sopContent.json so every section that has a
   * time_range on disk shows a play button in the outline without needing
   * the user to hit "Generate steps" first. Only fills entries that are
   * missing — user-generated links win.
   */
  useEffect(() => {
    const parseRange = (r) => {
      if (!r || typeof r !== 'string') return null
      const parts = r.split(/[-–—]/).map(s => s.trim())
      if (parts.length !== 2) return null
      const toSec = s => {
        const b = s.split(':').map(Number)
        if (b.some(isNaN)) return null
        if (b.length === 2) return b[0] * 60 + b[1]
        if (b.length === 3) return b[0] * 3600 + b[1] * 60 + b[2]
        return null
      }
      const a = toSec(parts[0]), b = toSec(parts[1])
      return a != null && b != null ? [a, b] : null
    }
    setSectionLinks(prev => {
      let next = prev
      for (const s of (sopData.sections || [])) {
        if (!s.time_range || s.time_range === 'n/a') continue
        const rng = parseRange(s.time_range)
        if (!rng) continue
        const heading = `${s.section_number} ${s.section_title}`
        const key = (heading || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 200)
        if (next[key]) continue    // user-generated link wins
        const inferredVideo = s.video ||
          (parseFloat(s.section_number || '0') >= 3.6 ? 'ariba_part02' : 'ariba_part01')
        // Map video-parser folder key → Blob source_id for the modal player.
        const sourceId = inferredVideo === 'ariba_part02' ? 'ariba.mp4' : 'ariba.mp4'
        if (next === prev) next = { ...prev }
        next[key] = {
          source_id:   sourceId,
          source_name: inferredVideo,
          start_sec:   rng[0],
          end_sec:     rng[1],
        }
      }
      return next
    })
  }, [])

  // Fetch the artifact list on mount — Videos/Documents/Images tabs use this.
  useEffect(() => {
    let cancelled = false
    api.listSources()
      .then(items => {
        if (cancelled) return
        // Normalize backend shape → the SourcesPanel row shape
        const mapped = items.map(it => ({
          id:          it.id,
          kind:        it.kind,
          name:        it.name,
          description: it.content_type ? `${it.content_type} · ${Math.round((it.size_bytes || 0) / (1024*1024))} MB` : '',
          size_bytes:  it.size_bytes,
        }))
        setSources(mapped)
      })
      .catch(e => { if (!cancelled) setSourcesError(String(e?.message || e)) })
    return () => { cancelled = true }
  }, [])

  /**
   * Find the first occurrence of `needle` inside `root` and wrap it in a
   * <span class="ts-comment"> so CommentMargin renders a Word-style margin
   * balloon anchored to that text. Used when reviewer feedback arrives —
   * we can't rely on a live Range (the reviewer isn't here), so we
   * text-search the doc for the anchor snippet and wrap the first match.
   * Returns true on success.
   */
  const wrapFirstTextMatchInAuthorDoc = (root, needle, commentId, commentText, author) => {
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
    span.setAttribute('data-comment-id',     commentId || '')
    span.setAttribute('data-comment-text',   commentText || '')
    span.setAttribute('data-comment-author', author || 'Reviewer')
    span.setAttribute('data-comment-source', 'reviewer')   // so future UI can style differently
    try { range.surroundContents(span); return true } catch { return false }
  }

  // ═════ UNDO / REDO ═════
  // Simple snapshot-based history — we grab the full canvas HTML before
  // every structural change (delete, merge, move, AI-replace) and after
  // debounced text edits. Ctrl+Z / Ctrl+Y restore snapshots.
  const undoStack = useRef([])
  const redoStack = useRef([])
  const debounceTimer = useRef(null)
  const [undoTick, setUndoTick] = useState(0)  // bumped whenever stacks change so ribbon re-renders

  const canvasHostEl = () =>
    document.querySelector('.docx-preview-host') ||
    document.querySelector('.uploaded-doc') ||
    document.querySelector('[data-canvas-inner]')

  // Poll for reviewer feedback every 5s whenever a share is active. The
  // Share button in the titlebar shows the unresolved-comment count.
  // Injected comment IDs are tracked so re-polling doesn't wrap the same
  // text twice.
  const injectedReviewerCommentIds = useRef(new Set())
  useEffect(() => {
    if (!activeShareToken) return
    let cancelled = false
    let iv = null
    const pull = async () => {
      try {
        const rec = await api.getShare(activeShareToken, { includeHtml: false })
        if (cancelled) return
        setReviewerFeedback(rec.comments || [])
        // Inject any brand-new comment as a Word-style .ts-comment span in
        // the author's editor so the margin balloon renders inline.
        const host = canvasHostEl()
        if (host) {
          for (const c of (rec.comments || [])) {
            if (!c?.anchor_text) continue
            // Resolved comments should not re-appear inline. Also remember
            // them as "injected" so they never get re-wrapped later.
            if (c.resolved) { injectedReviewerCommentIds.current.add(c.id); continue }
            if (injectedReviewerCommentIds.current.has(c.id)) continue
            const ok = wrapFirstTextMatchInAuthorDoc(host, c.anchor_text, c.id, c.text, c.author)
            if (ok) injectedReviewerCommentIds.current.add(c.id)
          }
        }
      } catch (e) {
        // Share may have been deleted upstream — drop it locally so we stop polling.
        if (String(e?.message || '').includes('404')) {
          setActiveShareToken(null)
          localStorage.removeItem('ts-active-share-token')
        }
      }
    }
    pull()
    iv = setInterval(pull, 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [activeShareToken])

  const unresolvedFeedbackCount = reviewerFeedback.filter(c => !c.resolved).length

  /**
   * Walk the current doc canvas and return a flat list of {id, text} for
   * every heading — h1..h4 plus paragraphs styled as headings. Used by
   * VideoPlayer's section picker so the reviewer can drop generated steps
   * into any existing section without re-typing the heading name.
   */
  const collectHeadings = () => {
    const host = canvasHostEl()
    if (!host) return []
    const seen = new Set()
    const out = []
    const nodes = host.querySelectorAll(
      'h1, h2, h3, h4, p[class*="heading" i], div[class*="heading" i], p[class*="title" i]'
    )
    for (const el of nodes) {
      if (seen.has(el)) continue
      // Strip injected .dp-play-section text if present.
      let text = ''
      if (el.querySelector?.('.dp-play-section')) {
        const c = el.cloneNode(true); c.querySelectorAll('.dp-play-section').forEach(x => x.remove())
        text = (c.textContent || '').trim()
      } else {
        text = (el.textContent || '').trim()
      }
      if (!text) continue
      seen.add(el)
      out.push({ id: el.id || null, text: text.length > 120 ? text.slice(0, 117) + '…' : text })
    }
    return out
  }

  /* ─── Cross-block-merge helpers (used by Backspace/Delete at block boundary) ─── */

  const isCaretAtStart = (block, range) => {
    // Range must be at offset 0 of the very first text/leaf position of block
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    // Skip empty text nodes at start
    let first = walker.nextNode()
    while (first && first.nodeType === Node.TEXT_NODE && first.textContent === '') {
      first = walker.nextNode()
    }
    if (!first) return true   // block is empty
    if (first.nodeType === Node.TEXT_NODE) {
      return range.startContainer === first && range.startOffset === 0
    }
    // First leaf is an element (e.g., <br>)
    return range.startContainer === block && range.startOffset === 0
  }

  const isCaretAtEnd = (block, range) => {
    // Walk to the last text node in the block; caret must be at its end
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let last = null, n
    while ((n = walker.nextNode())) last = n
    if (!last) {
      // block has no text; caret at (block, block.childNodes.length) counts as end
      return range.startContainer === block && range.startOffset === (block.childNodes.length || 0)
    }
    return range.startContainer === last && range.startOffset === last.textContent.length
  }

  /* Walk document order to find the previous / next contentEditable block in the host. */
  const previousEditable = (block, host) => {
    const all = host.querySelectorAll('[contenteditable="true"]')
    const arr = Array.from(all)
    const idx = arr.indexOf(block)
    return idx > 0 ? arr[idx - 1] : null
  }
  const nextEditable = (block, host) => {
    const all = host.querySelectorAll('[contenteditable="true"]')
    const arr = Array.from(all)
    const idx = arr.indexOf(block)
    return (idx >= 0 && idx < arr.length - 1) ? arr[idx + 1] : null
  }

  const takeSnapshot = () => {
    const host = canvasHostEl()
    return host ? host.innerHTML : null
  }

  /**
   * Backspace/Delete merge across block boundaries — Word-style. Each of
   * our blocks is its own contentEditable, so the browser won't cross the
   * boundary on its own. When the caret is at the very start of a block
   * and the user hits Backspace, we splice the block's content onto the
   * previous block and remove the empty one. Delete at end-of-block does
   * the same in reverse. Returns true if we handled it.
   */
  const tryCrossBlockMerge = (e, host) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return false     // Actual text selected → let browser delete it

    // Walk from the caret to the nearest contentEditable block
    let block = range.startContainer
    if (block.nodeType === Node.TEXT_NODE) block = block.parentElement
    while (block && block !== host) {
      if (block.getAttribute && block.getAttribute('contenteditable') === 'true') break
      block = block.parentElement
    }
    if (!block || block === host) return false

    const atStart = isCaretAtStart(block, range)
    const atEnd   = isCaretAtEnd(block, range)
    if (e.key === 'Backspace' && !atStart) return false
    if (e.key === 'Delete'    && !atEnd)   return false

    // Find the neighbour contentEditable block in the direction we need
    const neighbour = e.key === 'Backspace'
      ? previousEditable(block, host)
      : nextEditable(block, host)
    if (!neighbour) return false

    // Snapshot BEFORE mutating so Ctrl+Z restores both blocks
    pushHistory(false)

    // Merge: append `block`'s children onto `neighbour` (or the reverse for Delete)
    const target = e.key === 'Backspace' ? neighbour : block
    const source = e.key === 'Backspace' ? block     : neighbour

    // Position caret at the merge point BEFORE moving so it lands correctly
    const joinRange = document.createRange()
    joinRange.selectNodeContents(target)
    joinRange.collapse(false)   // end of target = where source content will attach

    // If source has content, append it. Skip pure-whitespace (empty <p></p>) sources.
    const srcContent = source.textContent.trim()
    if (srcContent.length > 0) {
      while (source.firstChild) target.appendChild(source.firstChild)
    }
    source.remove()

    // Restore caret at the join point
    const s2 = window.getSelection()
    s2.removeAllRanges()
    s2.addRange(joinRange)

    // Snapshot the post-merge state so a following typing edit can undo cleanly
    pushHistory(false)
    return true
  }

  const applySnapshot = (html) => {
    const host = canvasHostEl()
    if (!host) return
    // Defensive: refuse to apply a snapshot that would wipe the doc. If a
    // suspicious snapshot slipped into the stack (empty or near-empty), we
    // treat undo as a no-op instead of blanking the editor.
    if (!html || html.length < 500) {
      console.warn('[undo] refusing to apply tiny snapshot (would wipe doc)', html?.length)
      return
    }
    host.innerHTML = html
  }

  // Minimum snapshot size we'll accept when seeding history. Anything
  // smaller means the doc hasn't loaded yet — we don't want a tiny
  // snapshot at the bottom of the stack that undo could later restore.
  const MIN_SEED_SIZE = 2000

  // Push the current canvas state onto the undo stack.
  // For text edits pass `debounced` so we only snapshot after typing pauses.
  const pushHistory = useCallback((debounced = false) => {
    const commit = () => {
      const snap = takeSnapshot()
      if (snap == null) return
      const stack = undoStack.current
      // Skip duplicates
      if (stack[stack.length - 1] === snap) return
      // First entry (the seed) must be substantial — otherwise a
      // partially-rendered snapshot ends up at the bottom of the stack
      // and undo eventually restores an empty doc.
      if (stack.length === 0 && snap.length < MIN_SEED_SIZE) return
      stack.push(snap)
      if (stack.length > 50) stack.shift()   // cap depth
      redoStack.current = []                 // any new action clears redo
      setUndoTick(t => t + 1)
    }
    clearTimeout(debounceTimer.current)
    if (debounced) debounceTimer.current = setTimeout(commit, 500)
    else commit()
  }, [])

  const undo = useCallback(() => {
    // Flush any pending debounced snapshot first so we don't skip the last edit
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      pushHistory(false)
    }
    const stack = undoStack.current
    // Need at least 2 entries: pop the current one, restore the prior one.
    // With only 1 entry (the seed) there's nothing to restore TO.
    if (stack.length < 2) return
    const current = takeSnapshot()
    if (current != null) redoStack.current.push(current)
    stack.pop()
    const prev = stack[stack.length - 1]
    if (prev != null) applySnapshot(prev)
    setUndoTick(t => t + 1)
  }, [pushHistory])

  const redo = useCallback(() => {
    const stack = redoStack.current
    if (stack.length === 0) return
    const current = takeSnapshot()
    if (current != null) undoStack.current.push(current)
    const next = stack.pop()
    if (next != null) applySnapshot(next)
    setUndoTick(t => t + 1)
  }, [])

  // Global input + keyboard listeners
  useEffect(() => {
    const onInput = (e) => {
      // Only track edits inside the doc canvas — ignore ribbon inputs
      const host = canvasHostEl()
      if (!host || !host.contains(e.target)) return
      pushHistory(true)
    }
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      // Word-style cross-block merge:
      //   Backspace at start of a block → merge into previous block
      //   Delete    at end   of a block → pull next block into this one
      // Each of our blocks is its own contentEditable so the browser
      // won't cross the boundary on its own. We do it explicitly.
      if (!mod && (e.key === 'Backspace' || e.key === 'Delete')) {
        const host = canvasHostEl()
        if (host && tryCrossBlockMerge(e, host)) {
          e.preventDefault()
          return
        }
      }
      if (!mod) return
      // Ctrl+Z or Cmd+Z (without shift) → undo
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Ctrl+Y or Ctrl+Shift+Z → redo
      else if (e.key === 'y' || e.key === 'Y' || ((e.key === 'Z' || e.key === 'z') && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('input',   onInput, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('input',   onInput, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [pushHistory, undo, redo])

  const canUndo = undoStack.current.length > 1
  const canRedo = redoStack.current.length > 0

  // ═════ SESSION TIMER ═════
  // Real elapsed-time tracking. See lib/sessionTimer.js for the model.
  // sessionSnap is the latest snapshot; sessionActiveMs is the live counter
  // that ticks on every heartbeat so the UI re-renders.
  const [sessionSnap, setSessionSnap] = useState(null)
  const [sessionActiveMs, setSessionActiveMs] = useState(0)
  const timerRef = useRef(null)

  // ═════ THE 3-VERSION STATE MODEL ═════
  // Each version stores BOTH mammoth HTML (for our block-based editor)
  // AND the raw .docx arrayBuffer (for docx-preview's page-fidelity render).
  const [docState, setDocState] = useState({
    aiHtml:         uploadedDoc?.html || null,          // immutable — mammoth HTML
    aiBuffer:       uploadedDoc?.arrayBuffer || null,   // immutable — raw .docx
    humanHtml:      uploadedDoc?.html || null,          // live editable
    approvedHtml:   null,                               // uploaded offline final
    approvedBuffer: null,                               // raw .docx of approved version
    checkpoints:    [],                                 // snapshots of humanHtml
    fileName:       uploadedDoc?.fileName || null,
  })

  // Bumping this forces the Canvas to remount — needed when we restore
  // a checkpoint (Editable owns the DOM after first mount, so we can't
  // just swap innerHTML from props).
  const [canvasKey, setCanvasKey] = useState(0)

  // Seed the initial undo snapshot once the doc mounts so the very first
  // Ctrl+Z has somewhere to fall back to. Retries a few times because the
  // canvas DOM may not exist yet on first render (sample doc has no
  // uploaded HTML, so we can't wait for docState — we wait for the host).
  useEffect(() => {
    let cancelled = false
    let tries = 0
    const trySeed = () => {
      if (cancelled) return
      const host = canvasHostEl()
      if (host && undoStack.current.length === 0) {
        pushHistory(false)
        return
      }
      if (tries++ < 20) setTimeout(trySeed, 250)   // up to ~5s of waiting
    }
    trySeed()
    return () => { cancelled = true }
  }, [docState.humanHtml, docState.aiHtml, canvasKey, pushHistory])

  // Populate state if uploadedDoc arrives after mount (initial load from App)
  useEffect(() => {
    if (uploadedDoc?.html && !docState.aiHtml) {
      setDocState({
        aiHtml:         uploadedDoc.html,
        aiBuffer:       uploadedDoc.arrayBuffer || null,
        humanHtml:      uploadedDoc.html,
        approvedHtml:   null,
        approvedBuffer: null,
        checkpoints:    [],
        fileName:       uploadedDoc.fileName,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedDoc])

  // Document zoom — Word-style default 125%. Ctrl+= / Ctrl+- keyboard shortcuts.
  const [zoom, setZoom] = useState(125)
  const [showLeftRail, setShowLeftRail] = useState(true)
  const [trackChanges, setTrackChanges] = useState(true)
  const zoomIn    = useCallback(() => setZoom(z => Math.min(200, roundStep(z, +1))), [])
  const zoomOut   = useCallback(() => setZoom(z => Math.max( 50, roundStep(z, -1))), [])
  const resetZoom = useCallback(() => setZoom(100), [])
  const setZoomTo = useCallback((p) => setZoom(Math.min(200, Math.max(50, p))), [])

  const [editedBlocks, setEditedBlocks] = useState(() => new Set())

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault()
        setTrackChanges(t => !t)
        return
      }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn() }
      else if (e.key === '-')             { e.preventDefault(); zoomOut() }
      else if (e.key === '0')             { e.preventDefault(); resetZoom() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, resetZoom])

  const markEdited = useCallback((blockId) => {
    // Any edit is also an activity signal for the timer.
    timerRef.current?.markEdit()
    if (!blockId) return
    setEditedBlocks(prev => {
      if (prev.has(blockId)) return prev
      const next = new Set(prev)
      next.add(blockId)
      return next
    })
  }, [])

  // Start the timer once we know which document this is. Keyed by fileName
  // so someone returning to the same doc tomorrow resumes the same session
  // (and totalActiveMs accumulates across visits).
  useEffect(() => {
    const docKey = uploadedDoc?.fileName || 'untitled'
    const docName = uploadedDoc?.fileName || 'Untitled'
    const controller = startTracking({
      docKey,
      docName,
      onTick: (snap) => {
        setSessionSnap(snap)
        setSessionActiveMs(totalActiveMs(snap))
      },
    })
    timerRef.current = controller
    return () => {
      controller.stop()
      timerRef.current = null
    }
  }, [uploadedDoc?.fileName])

  // ═════ CHECKPOINT LIFECYCLE ═════

  const saveCheckpoint = useCallback((label) => {
    const html = snapshotCurrentDocumentHtml()
    if (!html) {
      alert('Nothing to snapshot yet — the document canvas is empty.')
      return null
    }
    const timestamp = new Date().toISOString()
    const cp = {
      id: `cp-${Date.now()}`,
      label: (label && label.trim()) || `Checkpoint ${new Date().toLocaleString()}`,
      timestamp,
      html,
      editCount: editedBlocks.size,
    }
    setDocState(prev => ({ ...prev, checkpoints: [cp, ...prev.checkpoints] }))
    return cp
  }, [editedBlocks.size])

  const restoreCheckpoint = useCallback((cpId) => {
    const cp = docState.checkpoints.find(c => c.id === cpId)
    if (!cp) return
    if (!window.confirm(`Restore "${cp.label}"?\n\nCurrent unsaved edits will be discarded.\nRestoring will make this the new working copy.`)) return
    setDocState(prev => ({ ...prev, humanHtml: cp.html }))
    setEditedBlocks(new Set())
    setCurrentVersion('current')
    setCanvasKey(k => k + 1)  // force Canvas remount so it picks up new humanHtml
  }, [docState.checkpoints])

  const handleUploadApproved = useCallback(async (file) => {
    if (!file) return
    try {
      const { html, arrayBuffer } = await loadDocx(file)
      setDocState(prev => ({ ...prev, approvedHtml: html, approvedBuffer: arrayBuffer }))
      setCurrentVersion('approved')
      setCanvasKey(k => k + 1)
    } catch (e) {
      alert('Could not parse the approved .docx.')
      console.error(e)
    }
  }, [])

  // ═════ RESOLVE WHICH DOC TO RENDER + BANNER ═════

  const displayDoc = useMemo(() => {
    const fileName = docState.fileName || 'Untitled.docx'

    if (currentVersion === 'ai') {
      return {
        html: docState.aiHtml,
        arrayBuffer: docState.aiBuffer,   // for docx-preview page-fidelity render
        fileName,
        editable: false,
        useFidelityRender: true,
        banner: {
          tone: 'purple', kind: 'ai',
          title: 'AI Base version',
          msg: 'This is the immutable AI-generated baseline. Switch to Human Edits to make changes.',
        },
      }
    }

    if (currentVersion === 'approved') {
      return {
        html: docState.approvedHtml,
        arrayBuffer: docState.approvedBuffer,
        fileName: `Approved · ${fileName}`,
        editable: false,
        useFidelityRender: true,
        banner: {
          tone: 'emerald', kind: 'approved',
          title: 'Approved Final',
          msg: 'The offline-approved version. Read-only.',
        },
      }
    }

    if (currentVersion?.startsWith('cp-')) {
      const cp = docState.checkpoints.find(c => c.id === currentVersion)
      if (cp) {
        return {
          html: cp.html,          // checkpoints only have HTML (snapshot of DOM)
          fileName,
          editable: false,
          useFidelityRender: false,   // checkpoints don't have raw .docx, use block render
          checkpointId: cp.id,
          banner: {
            tone: 'amber', kind: 'checkpoint',
            title: `Checkpoint · ${cp.label}`,
            msg: `Snapshotted ${new Date(cp.timestamp).toLocaleString()} · ${cp.editCount} edits at that point.`,
          },
        }
      }
    }

    // Default: Human Edits. When the raw .docx buffer is available, render
    // with docx-preview for template fidelity AND keep it editable — best
    // of both worlds. If no buffer (rare — sample doc, checkpoint restore),
    // fall back to the paginated block editor.
    return {
      html: docState.humanHtml,
      arrayBuffer: docState.aiBuffer,          // reuse AI buffer for template render
      fileName,
      editable: true,
      useFidelityRender: !!docState.aiBuffer,  // fidelity only if we have the .docx bytes
      banner: null,
    }
  }, [currentVersion, docState])

  // Version list for the switcher — dynamically enriched with meta
  const versions = useMemo(() => {
    const list = [
      {
        id: 'ai',
        name: 'AI Base',
        description: 'Immutable AI-generated baseline',
        meta: docState.aiHtml ? 'Original · read-only' : 'Not loaded',
        icon: 'sparkles',
        disabled: !docState.aiHtml,
      },
      {
        id: 'current',
        name: 'Human Edits',
        description: 'Live working copy — where all editing happens',
        meta: `${editedBlocks.size} edits · ${docState.checkpoints.length} checkpoints`,
        icon: 'pencil',
        disabled: !docState.humanHtml,
      },
      // Checkpoints inline under Human Edits
      ...docState.checkpoints.map(cp => ({
        id: cp.id,
        name: cp.label,
        description: 'Checkpoint',
        meta: `${new Date(cp.timestamp).toLocaleString()} · ${cp.editCount} edits`,
        icon: 'history',
        isCheckpoint: true,
      })),
      {
        id: 'approved',
        name: 'Approved Final',
        description: 'Offline-signed final .docx',
        meta: docState.approvedHtml ? 'Uploaded · read-only' : 'Not uploaded yet',
        icon: 'shieldcheck',
        disabled: !docState.approvedHtml,
        isApproved: true,
      },
    ]
    return list
  }, [docState, editedBlocks.size])

  const handleSelect = (block, event) => {
    if (!block) { setSelection([]); return }
    // Image / screenshot clicks skip the side panel and go straight to
    // the enlarge modal. Every image action lives in that modal now.
    if (block.type === 'image' || block.type === 'screenshot') {
      openImage(block)
      return
    }
    const multi = event && (event.ctrlKey || event.metaKey || event.shiftKey)
    setSelection(prev => {
      if (multi && prev.length > 0) {
        const idx = prev.findIndex(b => b.id === block.id)
        if (idx >= 0) return prev.filter((_, i) => i !== idx)
        return [...prev, block]
      }
      return [block]
    })
  }

  const openImage = (block) => {
    // Extract the source-video timestamp AND the source-video folder key
    // from the frame filename if present. Frame paths look like
    // `.../outputs/ariba_part01/keyframes/frame_447.60s.jpg`.
    const hay = [block.src || '', block.alt || ''].join(' ')
    const timeMatch = hay.match(/frame_(\d+(?:\.\d+)?)s/)
    const keyMatch  = hay.match(/outputs[\\/]+([\w.-]+)[\\/]+keyframes/)
    setEnlargedImage({
      id:            block.id,
      src:           block.src,
      alt:           block.alt || '',
      sourceTimeSec: timeMatch ? parseFloat(timeMatch[1]) : null,
      sourceKey:     keyMatch ? keyMatch[1] : null,
      sectionRange:  block.sectionRange || null,
    })
  }

  const closeImage      = () => setEnlargedImage(null)

  const deleteEnlarged = () => {
    if (!enlargedImage) return
    const findEl = () => {
      let el = document.querySelector(`[data-block-id="${enlargedImage.id}"]`)
      if (el && el.tagName === 'IMG') return el
      if (el) {
        const inner = el.querySelector('img')
        if (inner) return inner
      }
      return document.querySelector(`img[src="${CSS.escape(enlargedImage.src || '')}"]`)
    }
    const el = findEl()
    if (el) el.remove()
  }

  const applyEnlargedSrc = (newSrc /* , verb */) => {
    if (!enlargedImage) return
    // Swap the DOM image's src
    const el = document.querySelector(`img[src="${CSS.escape(enlargedImage.src || '')}"]`)
    if (el) el.setAttribute('src', newSrc)
    // Update the modal's preview so the change is visible immediately
    setEnlargedImage(prev => prev ? { ...prev, src: newSrc } : prev)
  }

  // Word-like comment flow:
  //   1. Reviewer selects text.
  //   2. Clicks New Comment (ribbon Review tab OR right-click → New Comment).
  //   3. The selection is wrapped in an EMPTY .ts-comment span so the anchor
  //      is locked in, and the CommentsPanel opens with a focused textarea.
  //   4. Save writes the text into the span's data-comment-text; Cancel unwraps it.
  //
  // Wrapping is done manually via Range.surroundContents (with a fallback for
  // multi-element ranges). execCommand('insertHTML') is unreliable inside
  // docx-preview's structure and silently no-ops in some browsers.
  //
  // `preservedRange` is the range we captured earlier (right-click case),
  // so we can restore the selection if focus drifted while the menu was open.
  /**
   * Handle block-level actions from the canvas. Works for single AND
   * multi-select — the canvas passes either a single block object or an
   * array of them.
   *   • rewrite / rephrase / add-detail → open AIActionModal (synth-combines
   *                                        multi-select into one prompt)
   *   • move   → open MoveBlockModal (moves the whole group)
   *   • merge  → concatenate all blocks into the first, remove the rest
   *   • delete → handled inline in the canvas for single blocks; for multi
   *              we delete straight through since the pill is already an
   *              intentional multi-select gesture
   */
  const handleBlockAction = (action, payload) => {
    const blocks = Array.isArray(payload) ? payload : [payload]
    if (blocks.length === 0) return

    // Keep selection consistent with the acted-on set
    setSelection(blocks.map(b => ({
      id: b.id,
      kind: b.kind,
      text: b.text,
      type: /^h[1-6]$/.test(b.kind || '') ? 'heading'
          : (['ul','ol','li'].includes(b.kind)) ? 'list' : 'paragraph',
    })))

    if (action === 'move') {
      // Move dialog takes a "primary" block for display; on confirm we move
      // ALL blocks under the target.
      setMoveTarget({ block: blocks[0], group: blocks })
      return
    }

    if (action === 'merge') {
      if (blocks.length < 2) return
      // Sort by DOM order so the merged text reads top-to-bottom
      const sorted = [...blocks].sort((a, b) => {
        if (!a.el || !b.el) return 0
        const pos = a.el.compareDocumentPosition(b.el)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      })
      const combined = sorted.map(b => (b.text || '').trim()).filter(Boolean).join(' ')
      const first = sorted[0].el
      if (!first) return
      pushHistory(false)                         // ← snapshot BEFORE mutating
      first.textContent = combined
      for (let i = 1; i < sorted.length; i++) sorted[i].el?.remove()
      markEdited(sorted[0].id)
      pushHistory(false)                         // ← snapshot AFTER for redo path
      setSelection([])
      return
    }

    if (action === 'delete') {
      if (!window.confirm(`Delete ${blocks.length} blocks? The paragraphs around them stay put.`)) return
      pushHistory(false)                         // ← snapshot before
      blocks.forEach(b => b.el?.remove())
      pushHistory(false)                         // ← snapshot after
      setSelection([])
      return
    }

    if (['rewrite', 'rephrase', 'add-detail'].includes(action)) {
      // For multi, synthesize a combined "block" so the AI acts on one
      // consolidated snippet. On accept we overwrite the first block and
      // remove the rest — the reviewer's intent was to consolidate.
      if (blocks.length === 1) {
        setAiAction({ action, block: blocks[0], group: blocks })
      } else {
        const combined = blocks.map(b => (b.text || '').trim()).filter(Boolean).join(' ')
        const synth = { id: blocks[0].id, kind: `${blocks.length} ${blocks[0].kind}s`, text: combined, el: blocks[0].el }
        setAiAction({ action, block: synth, group: blocks })
      }
    }
  }

  /** Apply the AI-generated text back onto the DOM. For multi-select this
   *  writes into the first block and removes the rest — consolidating the
   *  group into a single revised paragraph. */
  const applyAiOutput = (newText) => {
    const group = aiAction?.group
    if (!group?.length) { setAiAction(null); return }
    const first = group[0]?.el
    if (!first) { setAiAction(null); return }
    pushHistory(false)                           // ← snapshot before AI replace
    first.textContent = newText
    for (let i = 1; i < group.length; i++) group[i].el?.remove()
    markEdited(group[0].id)
    pushHistory(false)                           // ← snapshot after for redo
    setAiAction(null)
    setSelection([])
  }

  /** Move one or more block DOM elements under the chosen heading. */
  const applyMove = ({ targetHeadingId, placement }) => {
    const group = moveTarget?.group?.length ? moveTarget.group : [moveTarget?.block]
    if (!group.length || !group[0]?.el) { setMoveTarget(null); return }
    const heading = document.getElementById(targetHeadingId)
    if (!heading || !heading.parentNode) { setMoveTarget(null); return }

    // Sort by DOM order so the moved group keeps its reading sequence.
    const sorted = [...group].filter(b => b?.el).sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })

    const insertAt = placement === 'start'
      ? heading.nextSibling
      : (() => {
          let cursor = heading.nextSibling
          while (cursor) {
            if (cursor.nodeType === Node.ELEMENT_NODE && /^h[1-4]$/i.test(cursor.tagName)) return cursor
            cursor = cursor.nextSibling
          }
          return null   // append at end of parent
        })()

    pushHistory(false)                           // ← snapshot before move
    for (const b of sorted) {
      if (insertAt) heading.parentNode.insertBefore(b.el, insertAt)
      else          heading.parentNode.appendChild(b.el)
    }
    sorted.forEach(b => markEdited(b.id))
    pushHistory(false)                           // ← snapshot after for redo
    setMoveTarget(null)
    setSelection([])
    sorted[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /**
   * Open a video → resolve its Blob SAS URL first, then mount the player.
   * We do this here (not in SourcesPanel) so the panel stays presentation-only.
   */
  const openVideoStream = (src) => {
    // Route <video> straight through our streaming proxy — no round-trip
    // SAS fetch, no token to expire, and a CDN in front can cache byte
    // ranges at edge.
    setPlayingVideo({
      source: {
        ...src,
        url: api.streamProxyUrl(src.id),
        contentType: src.content_type || 'video/mp4',
      },
    })
  }

  /**
   * Open the player at a specific segment — used by the ▶ button on section
   * headings and anywhere else we want to replay a source segment. Seeks
   * to startSec and auto-marks in/out so the segment strip is already selected.
   */
  const openVideoAtSegment = ({ sourceId, sourceName, startSec, endSec, fullscreen }) => {
    const known = sources.find(s => s.id === sourceId)
    setPlayingVideo({
      source: {
        id:   sourceId,
        name: sourceName || known?.name || sourceId,
        url:  api.streamProxyUrl(sourceId),
        contentType: known?.content_type || 'video/mp4',
      },
      startTime:   startSec,
      autoMarkIn:  startSec,
      autoMarkOut: endSec,
      fullscreen:  !!fullscreen,
    })
  }

  const normalizeHeading = (text) => (text || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 200)

  /** Look up which source-segment (if any) is linked to a heading text. */
  const getSectionVideo = (headingText) => sectionLinks[normalizeHeading(headingText)] || null

  /**
   * Video → SOP generation flow. Player fires this when the reviewer
   * hits "Generate SOP from segment" after marking in/out and adding notes.
   */
  const handleGenerateFromSegment = ({ source, startSec, endSec, notes }) => {
    setGenFromVideo({ source, startSec, endSec, notes: notes || '' })
    setPlayingVideo(null)
  }

  /**
   * Snapshot-driven flow: the reviewer captured a stream of moments in the
   * video player, picked a target section, and hit Generate. We POST the
   * moments (screenshots + notes) to Gemini and insert the returned steps
   * as new paragraphs under the chosen heading. Snapshotting before, plus
   * pushHistory bookends, keeps undo/redo intact.
   */
  const handleGenerateFromMoments = async ({ source, sectionTitle, moments }) => {
    if (!moments?.length || !sectionTitle) throw new Error('Missing moments or section')
    const res = await api.generateFromMoments({
      sourceId:     source?.id,
      sourceKey:    source?.name || source?.id,
      sectionTitle,
      moments,
    })
    const steps = (res?.steps || []).filter(s => s && s.trim())
    if (!steps.length) throw new Error('Gemini returned no steps')

    // Find the heading in the canvas whose text matches sectionTitle.
    const host = canvasHostEl()
    if (!host) throw new Error('Editor canvas not mounted')
    const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    const target = norm(sectionTitle)
    const headings = Array.from(host.querySelectorAll('h1, h2, h3, h4, p[class*="heading" i], div[class*="heading" i]'))
    // The outline scan already strips .dp-play-section text — do the same here.
    const findText = (el) => {
      if (!el.querySelector?.('.dp-play-section')) return (el.textContent || '').trim()
      const c = el.cloneNode(true); c.querySelectorAll('.dp-play-section').forEach(x => x.remove())
      return (c.textContent || '').trim()
    }
    const heading = headings.find(h => norm(findText(h)) === target)
      || headings.find(h => norm(findText(h)).startsWith(target))
    if (!heading) throw new Error(`No heading matching "${sectionTitle}"`)

    // Snapshot before the mutation for undo.
    pushHistory(false)

    // Insert steps right after the heading, before the next heading (or at end).
    let anchor = heading
    const doc = heading.ownerDocument
    for (const step of steps) {
      const p = doc.createElement('p')
      p.className = 'ts-inserted'   // mark as human-generated so track-changes highlights it
      p.textContent = step
      anchor.parentNode.insertBefore(p, anchor.nextSibling)
      anchor = p
    }
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    pushHistory(false)
    markEdited(heading.getAttribute('data-block-id') || 'moments-generated')
    return res
  }

  /** Called from GenerateFromVideoModal when the reviewer confirms.
   *  Sends the segment + notes to the backend, which forwards to Gemini
   *  with the video attached. Returns concrete on-screen steps. */
  const applyGeneratedSteps = async ({ source, startSec, endSec, notes, targetHeadingId, newSectionName, placement }) => {
    let steps
    try {
      const targetHead = targetHeadingId ? document.getElementById(targetHeadingId)?.textContent?.trim() : null
      const res = await api.generateFromSegment({
        sourceId: source.id,
        startSec, endSec,
        notes,
        targetContext: newSectionName || targetHead || null,
      })
      steps = res.steps
    } catch (e) {
      alert(`Generation failed: ${e?.message || e}`)
      throw e
    }
    pushHistory(false)

    const host = canvasHostEl()
    if (!host) { setGenFromVideo(null); return }

    // Build the new fragment: heading (if new) + step paragraphs
    const container = document.createElement('div')
    if (newSectionName) {
      const h = document.createElement('h2')
      h.textContent = newSectionName
      container.appendChild(h)
    }
    steps.forEach(text => {
      const p = document.createElement('p')
      p.textContent = text
      container.appendChild(p)
    })

    // Save the section → source-segment link so the ▶ button appears next to
    // the heading. Key by normalized heading text — DOM ids change per render.
    const linkKey = normalizeHeading(newSectionName || (document.getElementById(targetHeadingId)?.textContent || ''))
    if (linkKey && source?.id) {
      setSectionLinks(prev => ({
        ...prev,
        [linkKey]: {
          source_id:   source.id,
          source_name: source.name || source.id,
          start_sec:   startSec,
          end_sec:     endSec,
        },
      }))
    }

    if (newSectionName) {
      // Append the new section at the end of the doc
      host.appendChild(container)
    } else {
      const heading = document.getElementById(targetHeadingId)
      if (!heading || !heading.parentNode) return
      const insertAt = placement === 'start'
        ? heading.nextSibling
        : (() => {
            let cursor = heading.nextSibling
            while (cursor) {
              if (cursor.nodeType === Node.ELEMENT_NODE && /^h[1-4]$/i.test(cursor.tagName)) return cursor
              cursor = cursor.nextSibling
            }
            return null
          })()
      const parent = heading.parentNode
      while (container.firstChild) {
        if (insertAt) parent.insertBefore(container.firstChild, insertAt)
        else          parent.appendChild(container.firstChild)
      }
    }
    pushHistory(false)
    setGenFromVideo(null)
    // Scroll the first inserted node into view
    if (newSectionName) container.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const handleNewComment = (preservedRange = null) => {
    let range = preservedRange
    if (!range) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0)
    } else {
      // Restore the captured range as the live selection
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }

    if (!range || range.collapsed) {
      // No selection — open the panel so existing comments are visible
      setCommentsOpen(true)
      return
    }

    // Sanity-check the range is inside our editable canvas.
    const container = range.commonAncestorContainer
    const parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
    const canvasRoot = parent?.closest?.('.docx-preview-host, .uploaded-doc')
    if (!canvasRoot) {
      setCommentsOpen(true)
      return
    }

    const id = `c-${Date.now()}`
    const span = document.createElement('span')
    span.className = 'ts-comment ts-comment-pending'
    span.setAttribute('data-comment-id', id)
    span.setAttribute('data-comment-text', '')

    try {
      // Simple case — range fits in one text node
      range.surroundContents(span)
    } catch {
      // Multi-element range → extract + wrap fallback
      try {
        const contents = range.extractContents()
        span.appendChild(contents)
        range.insertNode(span)
      } catch (err) {
        console.warn('Could not wrap comment anchor:', err)
        setCommentsOpen(true)
        return
      }
    }

    // Collapse the selection to the end of the new span so the user's
    // next click doesn't accidentally re-select it.
    const sel = window.getSelection()
    sel.removeAllRanges()
    const after = document.createRange()
    after.setStartAfter(span)
    after.collapse(true)
    sel.addRange(after)

    setCommentsOpen(true)
  }

  const editStats = {
    edits: editedBlocks.size,
    minutes: 42,
    total: 40,
    approved: 28,
    checkpoints: docState.checkpoints.length,
  }

  // Right-click on the canvas area — open the custom context menu instead of
  // the browser's default. We only intercept clicks inside the canvas host
  // (docx-preview / uploaded-doc), so right-click in the ribbon / rails still
  // gets the native menu for text inputs, links, etc.
  const handleContextMenu = (e) => {
    const target = e.target
    const canvasRoot =
      target?.closest?.('.docx-preview-host') ||
      target?.closest?.('.uploaded-doc') ||
      target?.closest?.('[data-canvas-inner]')
    if (!canvasRoot) return   // outside the doc — allow native menu

    e.preventDefault()
    const sel = window.getSelection()
    const selText = sel?.toString().trim() || ''
    // Clone the range NOW so if focus drifts while the menu is open we can
    // still wrap the exact text the user right-clicked on.
    const capturedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: selText.length > 0,
      selectionText: selText,
      capturedRange,
    })
  }

  const runContextAction = (action) => {
    switch (action) {
      case 'new-comment':      handleNewComment(ctxMenu?.capturedRange); break
      case 'copy':             document.execCommand('copy'); break
      case 'cut':              document.execCommand('cut'); break
      case 'paste':            document.execCommand('paste'); break
      case 'delete':           document.execCommand('delete'); break
      case 'highlight':        document.execCommand('backColor', false, '#fff59d'); break
      case 'find':             /* Rely on the ribbon's find modal — no direct hook here */ break
      case 'select-paragraph': {
        const sel = window.getSelection()
        const node = sel?.anchorNode
        const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
        const para = el?.closest?.('p, h1, h2, h3, h4, li')
        if (para) {
          const range = document.createRange()
          range.selectNodeContents(para)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        break
      }
      default: break
    }
  }

  return (
    <>
      <div className="h-screen flex flex-col bg-[#faf9f8]">
        <TitleBar
          onMetricsClick={() => setMetricsOpen(true)}
          onExit={onExit}
          docName={displayDoc.fileName}
          currentVersion={currentVersion}
          versions={versions}
          onVersionSelect={setCurrentVersion}
          onUploadApproved={handleUploadApproved}
          onRestoreCheckpoint={restoreCheckpoint}
          editCount={editedBlocks.size}
          sessionActiveMs={sessionActiveMs}
          onSaveCheckpoint={() => setCheckpointDialogOpen(true)}
          checkpointCount={docState.checkpoints.length}
          onShare={() => setShareModalOpen(true)}
          reviewFeedbackCount={unresolvedFeedbackCount}
        />
        <Ribbon
          onMetricsClick={() => setMetricsOpen(true)}
          onExport={() => setExportOpen(true)}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={resetZoom}
          showLeftRail={showLeftRail}
          onToggleLeftRail={() => setShowLeftRail(s => !s)}
          trackChanges={trackChanges}
          onToggleTrackChanges={() => setTrackChanges(t => !t)}
          onSaveCheckpoint={() => setCheckpointDialogOpen(true)}
          onNewComment={handleNewComment}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <div
          className="flex-1 grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `${showLeftRail ? '236px' : '0'} 1fr ${showSourcesPanel ? '340px' : '0'}` }}
          onContextMenu={handleContextMenu}
        >
          {showLeftRail && (
            <LeftRail
              docState={docState}
              currentVersion={currentVersion}
              editCount={editedBlocks.size}
              getSectionVideo={getSectionVideo}
              onPlaySectionVideo={openVideoAtSegment}
            />
          )}
          {!showLeftRail && <div />}
          <Canvas
            key={canvasKey}
            selection={selection}
            onSelect={handleSelect}
            displayDoc={displayDoc}
            currentVersion={currentVersion}
            editedBlocks={editedBlocks}
            onEdit={markEdited}
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={resetZoom}
            onZoomSet={setZoomTo}
            trackChanges={trackChanges}
            onRestoreCheckpoint={restoreCheckpoint}
            onBlockAction={handleBlockAction}
            onBeforeMutation={() => pushHistory(false)}
            getSectionVideo={getSectionVideo}
            onPlaySectionVideo={openVideoAtSegment}
          />
          {showSourcesPanel && (
            <SourcesPanel
              sources={sources}
              error={sourcesError}
              onOpenVideo={openVideoStream}
              onOpenDocument={(s) => alert(`Would open ${s.name}`)}
              onOpenImage={(s) => alert(`Would open image ${s.name}`)}
            />
          )}
        </div>
      </div>
      <FloatingChat
        selection={selection}
        command={chatCommand}
        onCommandConsumed={() => setChatCommand(null)}
        onPlaySegment={({ sourceKey, startSec, endSec }) => {
          // Map the transcript source_key (e.g. "ariba_part01") to the
          // Blob source_id (e.g. "ariba.mp4") — same table InlineVideoPanel uses.
          const idMap = { ariba_part01: 'ariba.mp4', ariba_part02: 'ariba.mp4' }
          const sourceId = idMap[sourceKey] || sourceKey
          openVideoAtSegment({ sourceId, sourceName: sourceKey, startSec, endSec })
        }}
      />

      {aiAction && (
        <AIActionModal
          action={aiAction.action}
          block={aiAction.block}
          onCancel={() => setAiAction(null)}
          onAccept={applyAiOutput}
          onGenerate={async ({ action, tone, length, missingHint, block }) => {
            return api.aiBlockAction({
              action,
              blockText: block?.text || '',
              blockKind: block?.kind,
              tone,
              length,
              missingHint,
            })
          }}
        />
      )}
      {moveTarget && (
        <MoveBlockModal
          block={moveTarget.block}
          onCancel={() => setMoveTarget(null)}
          onMove={applyMove}
        />
      )}
      {playingVideo && (
        <VideoPlayer
          source={playingVideo.source}
          startTime={playingVideo.startTime}
          openFullscreen={playingVideo.fullscreen}
          availableSections={collectHeadings()}
          onClose={() => setPlayingVideo(null)}
          onGenerate={handleGenerateFromMoments}
        />
      )}
      {genFromVideo && (
        <GenerateFromVideoModal
          source={genFromVideo.source}
          startSec={genFromVideo.startSec}
          endSec={genFromVideo.endSec}
          notes={genFromVideo.notes}
          onCancel={() => setGenFromVideo(null)}
          onGenerate={applyGeneratedSteps}
        />
      )}


      {metricsOpen && (
        <MetricsOverlay
          onClose={() => setMetricsOpen(false)}
          editedBlocks={editedBlocks}
          docState={docState}
          sessionSnap={sessionSnap}
          sessionActiveMs={sessionActiveMs}
        />
      )}
      <ExportPrompt
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        editStats={editStats}
        onExport={(format) => {
          const host = canvasHostEl()
          const html = host?.innerHTML || ''
          const title = displayDoc?.fileName || 'SOP Document'
          if (!html) {
            alert('Nothing to export yet — the document is empty.')
            return
          }
          if (format === 'pdf') exportAsPdf({ html, title })
          else exportAsWord({ html, title })
        }}
      />
      <CommentsPanel open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <CommentMargin
        onResolveShareComment={(commentId) => {
          // Reviewer comment resolve — call backend so the share record
          // stays in sync, then drop the local injected-id so the poll
          // doesn't re-inject the anchor on the next tick.
          if (!activeShareToken) return
          injectedReviewerCommentIds.current.delete(commentId)
          api.resolveShareComment(activeShareToken, commentId, true).catch(() => {})
          setReviewerFeedback(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c))
        }}
      />
      {enlargedImage && (
        <ImageEnlargeModal
          src={enlargedImage.src}
          alt={enlargedImage.alt}
          sourceTimeSec={enlargedImage.sourceTimeSec}
          sourceKey={enlargedImage.sourceKey}
          sectionRange={enlargedImage.sectionRange}
          onClose={closeImage}
          onDelete={deleteEnlarged}
          onApplySrc={applyEnlargedSrc}
        />
      )}
      <CheckpointDialog
        open={checkpointDialogOpen}
        onClose={() => setCheckpointDialogOpen(false)}
        onSave={saveCheckpoint}
        checkpointCount={docState.checkpoints.length}
        editCount={editedBlocks.size}
        sessionActiveMs={sessionActiveMs}
        recentCheckpoints={docState.checkpoints}
      />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        authorName="Priya K."
        getDocTitle={() => displayDoc.fileName || 'Ariba Supplier Management SOP'}
        getDocHtml={() => canvasHostEl()?.innerHTML || ''}
        onShareCreated={(token) => {
          setActiveShareToken(token)
          localStorage.setItem('ts-active-share-token', token)
        }}
      />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          hasSelection={ctxMenu.hasSelection}
          selectionText={ctxMenu.selectionText}
          onAction={runContextAction}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}
