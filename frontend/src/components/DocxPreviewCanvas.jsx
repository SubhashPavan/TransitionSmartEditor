import { useEffect, useRef, useState, useCallback } from 'react'
import { renderAsync } from 'docx-preview'
import {
  Sparkles, ShieldCheck, History, Pencil, RotateCcw, Trash2, Maximize2,
  Wand2, RefreshCw, Plus, MoveVertical, Layers, MoreHorizontal, Combine,
} from 'lucide-react'
import DeleteImageDialog from './DeleteImageDialog'

/**
 * DocxPreviewCanvas — renders the raw .docx arrayBuffer with docx-preview.
 *
 * Preserves everything mammoth throws away:
 *   • Real page dimensions from the .docx (US Letter / A4 / custom)
 *   • Cover pages, headers, footers, page numbers
 *   • Section breaks (each page rendered as its own container)
 *   • Fonts, colors, table styles, embedded images
 *   • Tabs, indents, list numbering
 *
 * When editable=true, we wrap the rendered output in a contentEditable
 * container and attach the same track-changes handlers we use for the
 * block editor. Human edits go through .ts-inserted / .ts-deleted spans
 * exactly like before, but now on top of a template-faithful page.
 */

/* Reused from Editable.jsx — inline text-run tracking */
const CONTENT_INPUT_TYPES = new Set([
  'insertText', 'insertReplacementText', 'insertLineBreak', 'insertParagraph',
  'insertFromPaste', 'insertFromDrop', 'insertFromYank',
  'deleteContentBackward', 'deleteContentForward',
  'deleteWordBackward', 'deleteWordForward',
  'deleteSoftLineBackward', 'deleteSoftLineForward',
  'deleteEntireSoftLine', 'deleteHardLineBackward', 'deleteHardLineForward',
  'deleteByCut', 'deleteByDrag',
])
const INSERT_TYPES = new Set([
  'insertText', 'insertReplacementText',
  'insertFromPaste', 'insertFromDrop', 'insertFromYank',
])
const DELETE_TYPES = new Set([
  'deleteContentBackward', 'deleteContentForward',
  'deleteWordBackward', 'deleteWordForward',
  'deleteSoftLineBackward', 'deleteSoftLineForward',
  'deleteEntireSoftLine', 'deleteHardLineBackward', 'deleteHardLineForward',
  'deleteByCut', 'deleteByDrag',
])

function wrapLastInsertion(_rootEl, insertedText) {
  if (!insertedText) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return
  const container = range.endContainer
  const offset = range.endOffset
  if (container.nodeType !== Node.TEXT_NODE) return
  const parentEl = container.parentElement
  if (parentEl?.closest?.('.ts-inserted')) return
  const len = insertedText.length
  if (offset < len) return
  const raw = container.textContent
  const before   = raw.slice(0, offset - len)
  const inserted = raw.slice(offset - len, offset)
  const after    = raw.slice(offset)
  const doc = container.ownerDocument
  const parent = container.parentNode
  const nextSibling = container.nextSibling
  parent.removeChild(container)
  const beforeNode = doc.createTextNode(before)
  const span = doc.createElement('span')
  span.className = 'ts-inserted'
  span.textContent = inserted
  const afterNode = doc.createTextNode(after)
  parent.insertBefore(afterNode,  nextSibling)
  parent.insertBefore(span,       afterNode)
  parent.insertBefore(beforeNode, span)
  const newRange = doc.createRange()
  newRange.setStart(span.firstChild, span.firstChild.length)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)
}

function trackDeletion(nativeEvent) {
  if (!nativeEvent.getTargetRanges) return false
  const targetRanges = nativeEvent.getTargetRanges()
  if (!targetRanges || targetRanges.length === 0) return false
  const sr = targetRanges[0]
  const range = document.createRange()
  try {
    range.setStart(sr.startContainer, sr.startOffset)
    range.setEnd(sr.endContainer, sr.endOffset)
  } catch { return false }
  if (range.collapsed) return false
  const commonAncestor = range.commonAncestorContainer
  const ancestorEl = commonAncestor.nodeType === Node.TEXT_NODE
    ? commonAncestor.parentElement
    : commonAncestor
  if (ancestorEl?.closest?.('.ts-inserted')) return false
  try {
    const fragment = range.extractContents()
    const doc = range.startContainer.ownerDocument
    const span = doc.createElement('span')
    span.className = 'ts-deleted'
    span.appendChild(fragment)
    range.insertNode(span)
    const newRange = doc.createRange()
    newRange.setStartAfter(span)
    newRange.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(newRange)
    return true
  } catch {
    return false
  }
}

/* Map a docx-preview DOM element to our selection "type" so the
   right rail routes to the correct editor panel. */
function tagToType(tag) {
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'ul' || tag === 'ol' || tag === 'li') return 'list'
  if (tag === 'table') return 'paragraph'  // routes to text panel
  if (tag === 'img') return 'image'
  return 'paragraph'
}

function HoverActionBtn({ onClick, icon, label, tone }) {
  const bg = tone === 'danger'
    ? 'bg-red-500/20 hover:bg-red-500/50 text-red-200 hover:text-white'
    : 'bg-white/10 hover:bg-white/25 text-white'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      className={`h-7 px-2 rounded-md ${bg} inline-flex items-center gap-1 text-[11px] font-semibold transition-colors`}
    >
      {icon} <span>{label}</span>
    </button>
  )
}

/**
 * ChipBtn — small pill button with icon + text label used inside the
 * horizontal block-selection toolbar. Tinted per tone; text is compact.
 */
function ChipBtn({ onClick, icon, label, tone }) {
  const styles = {
    purple:  'text-purple-200  hover:bg-purple-500/30  hover:text-white',
    brand:   'text-brand-200   hover:bg-brand-500/30   hover:text-white',
    emerald: 'text-emerald-200 hover:bg-emerald-500/30 hover:text-white',
    amber:   'text-amber-200   hover:bg-amber-500/30   hover:text-white',
    danger:  'text-red-200     hover:bg-red-500/30     hover:text-white',
    default: 'text-white/85    hover:bg-white/15       hover:text-white',
  }
  const s = styles[tone] || styles.default
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      className={`h-7 px-2 rounded-full ${s} inline-flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function BlockActionBtn({ onClick, icon, label, tone }) {
  const styles = {
    purple:  { text: 'text-purple-100',  hover: 'hover:bg-purple-500/25',  iconTint: 'text-purple-300' },
    brand:   { text: 'text-brand-100',   hover: 'hover:bg-brand-500/25',   iconTint: 'text-brand-300' },
    emerald: { text: 'text-emerald-100', hover: 'hover:bg-emerald-500/25', iconTint: 'text-emerald-300' },
    danger:  { text: 'text-red-200',     hover: 'hover:bg-red-500/25',     iconTint: 'text-red-400' },
    default: { text: 'text-white/85',    hover: 'hover:bg-white/12',       iconTint: 'text-white/70' },
  }
  const s = styles[tone] || styles.default
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      className={`group w-full h-8 pl-2 pr-2.5 rounded-lg ${s.hover} inline-flex items-center gap-2 text-[12px] font-semibold transition-colors whitespace-nowrap ${s.text}`}
    >
      <span className={`w-6 h-6 rounded-md bg-white/5 group-hover:bg-white/10 flex items-center justify-center ${s.iconTint} transition-colors`}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

function blockKindLabel(el) {
  if (!el) return 'Block'
  const tag = el.tagName.toLowerCase()
  const map = {
    p:  'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
    h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
    ul: 'List',       ol: 'Numbered list', li: 'List item',
    table: 'Table',   figure: 'Figure',    blockquote: 'Quote',
  }
  return map[tag] || tag.toUpperCase()
}

/**
 * DeleteBlockDialog — modal for confirming text-block deletion.
 * Shows the block's tag + a short preview of its text so the reviewer
 * knows what's about to disappear. Enter confirms, Escape cancels.
 */
function DeleteBlockDialog({ block, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel, onConfirm])

  const preview = (block.text || '').slice(0, 200)
  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white w-[460px] max-w-[calc(100vw-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900">Delete this {block.kind || 'block'}?</div>
            <div className="text-[11.5px] text-slate-500">The block is removed from the document.</div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-700 leading-snug max-h-[140px] overflow-y-auto">
            {preview || <span className="italic text-slate-400">(empty)</span>}
            {block.text?.length > 200 && <span className="text-slate-400">…</span>}
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-red-500 text-white hover:bg-red-600 shadow-sm inline-flex items-center gap-1.5 transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Walk the docx-preview rendered DOM and tag every content-bearing block
 * with a stable data-block-id so click handlers can identify what the
 * user selected.
 *
 * docx-preview's DOM structure varies by version — sometimes `<section
 * class="docx">` wrappers, sometimes plain paragraphs at the top level.
 * We tag any block-level content element regardless of nesting.
 */
/**
 * Walk headings and — for those linked to a video segment — inject a small
 * ▶ "Play section" chip that opens the player at the exact source segment.
 *
 * Idempotent: existing chips get updated in place; unlinked-but-previously-
 * decorated headings have their chip removed.
 */
function decorateHeadingsWithVideo(host, getSectionVideo, onPlaySectionVideo) {
  if (!host || typeof getSectionVideo !== 'function' || typeof onPlaySectionVideo !== 'function') return
  const headings = host.querySelectorAll(
    'h1, h2, h3, h4, p[class*="heading" i], p[class*="Heading" i], div[class*="heading" i], p[class*="title" i]'
  )
  headings.forEach(el => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const link = text ? getSectionVideo(text) : null
    const existing = el.querySelector(':scope > .dp-play-section')

    if (!link) {
      if (existing) existing.remove()
      return
    }
    // Build or refresh the chip
    const label = `${formatShortTime(link.start_sec)} → ${formatShortTime(link.end_sec)}`
    let chip = existing
    if (!chip) {
      chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'dp-play-section'
      chip.contentEditable = 'false'
      chip.addEventListener('mousedown', (e) => e.preventDefault())
      chip.addEventListener('click', (e) => {
        e.stopPropagation()
        onPlaySectionVideo({
          sourceId:   chip.dataset.sourceId,
          sourceName: chip.dataset.sourceName,
          startSec:   parseFloat(chip.dataset.startSec),
          endSec:     parseFloat(chip.dataset.endSec),
        })
      })
      el.appendChild(chip)
    }
    chip.dataset.sourceId   = link.source_id
    chip.dataset.sourceName = link.source_name || link.source_id
    chip.dataset.startSec   = String(link.start_sec)
    chip.dataset.endSec     = String(link.end_sec)
    chip.title = `Play ${link.source_name || link.source_id} · ${label}`
    // ▶ icon + short label
    chip.innerHTML = `<span aria-hidden="true" style="margin-right:6px">▶</span><span>${label}</span>`
  })
}

function formatShortTime(sec) {
  if (sec == null || isNaN(sec)) return '—'
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function tagBlocks(host) {
  if (!host) return 0
  const blocks = host.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, li, table, figure, img')
  let tagged = 0
  blocks.forEach((el, idx) => {
    if (!el.getAttribute('data-block-id')) {
      el.setAttribute('data-block-id', `dp-${idx}`)
      el.classList.add('dp-block')
      tagged++
    }
  })
  return tagged
}

/**
 * The SOP docx sometimes has per-section attribution lines like
 * "Source: ariba_part02 / 00:00 to 00:19" that our video pipeline emitted.
 * We walk the rendered DOM, find those lines, insert an anchor <div> right
 * after each, and let the React tree render a real <InlineVideoPanel />
 * into every anchor via createPortal. Idempotent — anchors already
 * present are skipped.
 *
 * Returns an array of {mountEl, sourceKey, startSec, endSec, sectionTitle}
 * that DocxPreviewCanvas turns into portals.
 */
const SOURCE_LINE_RE = /Source:\s*([A-Za-z0-9_.-]+)\s*[\/·]\s*(\d+:\d{2})\s*(?:to|-|–|—|→)\s*(\d+:\d{2})/i

function timeToSec(mmss) {
  const parts = mmss.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function findVideoMountsInDocx(host) {
  if (!host) return []
  const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      // Skip anything already inside a mount anchor to avoid re-parsing our own labels.
      if (n.parentElement?.closest?.('.dp-video-anchor')) return NodeFilter.FILTER_REJECT
      return SOURCE_LINE_RE.test(n.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })
  const mounts = []
  let node
  while ((node = walker.nextNode())) {
    const m = node.textContent.match(SOURCE_LINE_RE)
    if (!m) continue
    const line = node.parentElement?.closest('p, div') || node.parentElement
    if (!line || !line.parentElement) continue
    // Reuse an existing anchor for this line if present, else insert one.
    let anchor = line.nextElementSibling
    if (!anchor || !anchor.classList?.contains?.('dp-video-anchor')) {
      anchor = host.ownerDocument.createElement('div')
      anchor.className = 'dp-video-anchor'
      anchor.setAttribute('contenteditable', 'false')
      line.parentElement.insertBefore(anchor, line.nextSibling)
    }
    // The nearest heading above the line becomes the section title.
    const heading = findPrecedingHeading(line)
    mounts.push({
      key:       anchor.dataset.mountKey || (anchor.dataset.mountKey = `vm-${mounts.length}-${Date.now()}`),
      mountEl:   anchor,
      sourceKey: m[1],
      startSec:  timeToSec(m[2]) ?? 0,
      endSec:    timeToSec(m[3]) ?? null,
      sectionTitle: (heading?.textContent || '').trim().slice(0, 200),
    })
  }
  return mounts
}

function findPrecedingHeading(el) {
  // Walk backward through siblings + ancestors until we find an h1-h4 or
  // a paragraph with a Word heading-style class.
  let cur = el
  while (cur) {
    let sib = cur.previousElementSibling
    while (sib) {
      if (/^H[1-4]$/.test(sib.tagName)) return sib
      const cls = (sib.className || '').toString().toLowerCase()
      if (/heading|title/.test(cls)) return sib
      sib = sib.previousElementSibling
    }
    cur = cur.parentElement
    if (!cur || cur.classList?.contains?.('docx-preview-host')) break
  }
  return null
}

/**
 * docx-preview relies on Word-written <w:lastRenderedPageBreak/> hints to
 * split content into pages. python-docx (and most AI-generated docs) omit
 * these hints, so the whole body ends up in one giant section that scrolls
 * for tens of thousands of pixels — the user sees "only a few pages".
 *
 * This walks every rendered section and, if it's more than ~1.5 pages
 * tall, splits it into clones at content-boundary elements every ~1050px.
 * The result: real per-page shadows, proper stacking, honest page count.
 * Marks each section with data-dp-paginated so it only runs once per section.
 */
function paginateOversizedSections(host) {
  if (!host) return
  const PAGE_H = 1050          // ~US Letter (11") minus top/bottom margins at 96dpi
  const SPLIT_MIN = PAGE_H * 1.4
  const sections = Array.from(host.querySelectorAll('section.docx-fidelity'))
  sections.forEach(sec => {
    if (sec.dataset.dpPaginated === 'true') return
    if (sec.getBoundingClientRect().height < SPLIT_MIN) {
      sec.dataset.dpPaginated = 'true'
      return
    }
    const article = sec.querySelector('article') || sec
    if (!article || article.children.length < 2) {
      sec.dataset.dpPaginated = 'true'
      return
    }

    let currentSection = sec
    let currentArticle = article
    let accum = 0
    // Snapshot the children up-front; we'll be moving them as we go.
    const children = Array.from(currentArticle.children)
    for (const child of children) {
      const ch = child.getBoundingClientRect().height
      const wouldOverflow = accum > 0 && (accum + ch) > PAGE_H
      if (wouldOverflow) {
        // Close current section and start a new one right after it.
        const newSec = sec.cloneNode(false)       // copy attrs (class, style), no kids
        newSec.dataset.dpPaginated = 'true'
        const newArt = article.cloneNode(false)
        newSec.appendChild(newArt)
        currentSection.parentNode.insertBefore(newSec, currentSection.nextSibling)
        currentSection = newSec
        currentArticle = newArt
        accum = 0
      }
      currentArticle.appendChild(child)   // move from original article to whichever is current
      accum += ch
    }
    sec.dataset.dpPaginated = 'true'
  })
}

export default function DocxPreviewCanvas({
  arrayBuffer,
  banner,
  zoom = 100,
  editable = false,
  checkpointId,
  onRestoreCheckpoint,
  onEdit,
  selection = [],
  onSelect,
  editedBlocks,
  onBlockAction,        // (action: 'rewrite'|'rephrase'|'add-detail'|'move'|'delete', block: { id, text, kind }) => void
  onBeforeMutation,     // () => void — called right before ANY structural DOM change so parent can snapshot for undo
  getSectionVideo,      // (headingText: string) => { source_id, start_sec, end_sec, source_name } | null
  onPlaySectionVideo,   // ({ sourceId, sourceName, startSec, endSec }) => void
}) {
  const containerRef = useRef(null)
  const cleanupObserver = useRef(null)
  const hoverHideTimer  = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  // Anchor divs where <InlineVideoPanel> portals mount. Populated after
  // every scan of the docx-preview DOM.
  const [videoMounts, setVideoMounts] = useState([])
  const rescanVideoMounts = useCallback(() => {
    const host = containerRef.current
    if (!host) return
    setVideoMounts(findVideoMountsInDocx(host))
  }, [])

  // Image hover state — { el, rect } while the mouse is over an <img> or
  // over the floating actions bar. Null the rest of the time.
  const [hoveredImg, setHoveredImg] = useState(null)
  // Delete confirmation for the currently-hovered image
  const [pendingDelete, setPendingDelete] = useState(null)

  // Text-block hover state — same pattern, but for any .dp-block that
  // isn't an image (paragraphs, headings, lists, tables). The floating
  // bar sits to the right of the block and offers AI-driven rewrite /
  // rephrase / add-detail / move / delete actions.
  const [hoveredBlock, setHoveredBlock] = useState(null)
  const blockHideTimer = useRef(null)
  const [pendingBlockDelete, setPendingBlockDelete] = useState(null)

  useEffect(() => {
    let cancelled = false
    const el = containerRef.current
    if (!el || !arrayBuffer) return
    setStatus('loading')
    setError(null)
    el.innerHTML = ''

    renderAsync(arrayBuffer, el, null, {
      className: 'docx-fidelity',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      trimXmlDeclaration: true,
      useBase64URL: true,
      renderChanges: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: false,
      debug: false,
    })
      .then(() => {
        if (cancelled) return
        setStatus('ready')
        const host = containerRef.current
        if (host) {
          host.classList.add('uploaded-doc')  // reuses our snapshot selector
          if (editable) {
            host.setAttribute('contenteditable', 'true')
            host.setAttribute('spellcheck', 'true')
          } else {
            host.removeAttribute('contenteditable')
          }
          const n = tagBlocks(host)
          console.debug(`[DocxPreviewCanvas] tagged ${n} blocks on initial render`)
          // Split any oversized sections BEFORE decorating so headings + tags
          // land in their post-split section.
          paginateOversizedSections(host)
          tagBlocks(host)   // re-tag any newly-created wrappers
          // The per-heading ▶ chip is now handled by the outline in LeftRail.
          rescanVideoMounts()

          // docx-preview may still be streaming content in for very large
          // docs. Re-tag + re-decorate whenever new nodes land — but pause
          // the observer while we mutate to avoid feedback loops.
          let scheduled = false
          const observer = new MutationObserver(() => {
            if (scheduled) return
            scheduled = true
            requestAnimationFrame(() => {
              scheduled = false
              observer.disconnect()
              tagBlocks(host)
              paginateOversizedSections(host)
              // The per-heading ▶ chip is now handled by the outline in LeftRail.
              rescanVideoMounts()
              observer.observe(host, { childList: true, subtree: true })
            })
          })
          observer.observe(host, { childList: true, subtree: true })
          // Clean up on next arrayBuffer/editable change
          cleanupObserver.current = () => observer.disconnect()
        }
      })
      .catch((e) => {
        if (cancelled) return
        console.error('docx-preview render failed:', e)
        setError(String(e?.message || e))
        setStatus('error')
      })

    return () => {
      cancelled = true
      cleanupObserver.current?.()
      cleanupObserver.current = null
    }
  }, [arrayBuffer, editable])

  // (Was: re-inject per-heading ▶ chip via decorateHeadingsWithVideo.
  //  The outline in LeftRail now owns that UI, so we don't touch headings.)

  // Sync .block-selected + .human-edited classes when selection or edited set changes.
  // Also pin the floating block-action pill to the single selected block so the
  // user sees actions after clicking, not only after hovering.
  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.querySelectorAll('.block-selected').forEach(el => el.classList.remove('block-selected'))
    const sel = Array.isArray(selection) ? selection : [selection].filter(Boolean)
    sel.forEach(s => {
      if (!s?.id) return
      const el = host.querySelector(`[data-block-id="${s.id}"]`)
      if (el) el.classList.add('block-selected')
    })
    // Pin the pill to the LAST selected non-image block. Works for both
    // single- and multi-select — the toolbar shows a count chip and a
    // Merge button when there are 2+.
    if (sel.length >= 1) {
      const anchor = sel[sel.length - 1]
      const el = host.querySelector(`[data-block-id="${anchor.id}"]`)
      if (el && el.tagName !== 'IMG') {
        setHoveredBlock({ el, rect: el.getBoundingClientRect(), pinned: true, count: sel.length })
      }
    } else if (hoveredBlock?.pinned) {
      // Selection cleared → drop the pinned pill
      setHoveredBlock(null)
    }
  }, [selection, status])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const host = containerRef.current
    if (!host || !editedBlocks) return
    host.querySelectorAll('.human-edited').forEach(el => el.classList.remove('human-edited'))
    editedBlocks.forEach(id => {
      const el = host.querySelector(`[data-block-id="${id}"]`)
      if (el) el.classList.add('human-edited')
    })
  }, [editedBlocks, status])

  /* ─── Image hover: show a floating Delete + Enlarge bar ─── */
  const showImgHover = useCallback((img) => {
    clearTimeout(hoverHideTimer.current)
    const rect = img.getBoundingClientRect()
    setHoveredImg({ el: img, rect })
  }, [])

  const scheduleHideHover = useCallback(() => {
    clearTimeout(hoverHideTimer.current)
    hoverHideTimer.current = setTimeout(() => setHoveredImg(null), 180)
  }, [])

  const showBlockHover = useCallback((block) => {
    clearTimeout(blockHideTimer.current)
    const rect = block.getBoundingClientRect()
    setHoveredBlock({ el: block, rect })
  }, [])
  const scheduleHideBlockHover = useCallback(() => {
    clearTimeout(blockHideTimer.current)
    blockHideTimer.current = setTimeout(() => setHoveredBlock(null), 220)
  }, [])

  const handleContainerMouseOver = (e) => {
    // Only images get a hover pill. Block pill appears ONLY on selection —
    // no distracting bars flashing as the mouse moves through the doc.
    if (e.target?.tagName === 'IMG') showImgHover(e.target)
  }
  const handleContainerMouseOut = (e) => {
    if (e.target?.tagName === 'IMG') scheduleHideHover()
  }

  // Keep both floating bars aligned as the page scrolls / resizes
  useEffect(() => {
    if (!hoveredImg?.el && !hoveredBlock?.el) return
    const sync = () => {
      setHoveredImg(prev => prev ? { ...prev, rect: prev.el.getBoundingClientRect() } : prev)
      setHoveredBlock(prev => prev ? { ...prev, rect: prev.el.getBoundingClientRect() } : prev)
    }
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [hoveredImg?.el, hoveredBlock?.el])

  const requestDelete = () => {
    if (!hoveredImg?.el) return
    setPendingDelete({ src: hoveredImg.el.src, alt: hoveredImg.el.alt || '', el: hoveredImg.el })
    setHoveredImg(null)
  }
  const confirmDelete = () => {
    onBeforeMutation?.()
    pendingDelete?.el?.remove()
    setPendingDelete(null)
    onBeforeMutation?.()
  }

  const requestEnlarge = () => {
    if (!hoveredImg?.el) return
    // Route through the parent's onSelect so Editor opens its ImageEnlargeModal
    // (the same flow that fires when the user clicks the image directly).
    const el = hoveredImg.el
    onSelect?.(
      { type: 'image', id: el.getAttribute('data-block-id') || `dp-img-${Date.now()}`, src: el.src, alt: el.alt || '', kind: 'image' },
      null
    )
    setHoveredImg(null)
  }

  /* ─── Block-level actions ─── */
  const blockPayload = (el) => ({
    id:   el.getAttribute('data-block-id'),
    kind: el.tagName.toLowerCase(),
    text: (el.textContent || '').trim(),
    el,
  })

  const dispatchBlockAction = (action) => {
    if (!hoveredBlock?.el) return
    const host = containerRef.current
    if (!host) return
    // Collect every currently-selected block from the DOM (fallback to the
    // anchor if selection tracking hasn't caught up yet).
    const nodes = host.querySelectorAll('.block-selected')
    const blocks = (nodes.length ? Array.from(nodes) : [hoveredBlock.el]).map(blockPayload)

    if (action === 'delete') {
      // Multi-select delete removes each block from the DOM. Fires the same
      // confirmation dialog either way — parent decides whether to show one.
      if (blocks.length === 1) {
        setPendingBlockDelete(blocks[0])
      } else {
        // Multi-delete: parent gets the array, still fires the dialog
        onBlockAction?.('delete', blocks)
      }
      setHoveredBlock(null)
      return
    }
    onBlockAction?.(action, blocks.length === 1 ? blocks[0] : blocks)
    setHoveredBlock(null)
  }

  const confirmBlockDelete = () => {
    onBeforeMutation?.()
    pendingBlockDelete?.el?.remove()
    setPendingBlockDelete(null)
    onBeforeMutation?.()
  }

  const handleContainerClick = (e) => {
    // Ignore clicks that are actually a native text drag-select
    if (window.getSelection().toString().length !== 0) return
    const target = e.target
    if (!target) return

    // Image click → route to Image Search panel with image-specific payload
    if (target.tagName === 'IMG') {
      const id = target.getAttribute('data-block-id') || `dp-img-${Date.now()}`
      onSelect?.(
        { type: 'image', id, src: target.src, alt: target.alt || '', kind: 'image' },
        e
      )
      return
    }
    // Walk up to nearest block
    const block = target.closest('[data-block-id]')
    if (!block) { onSelect?.(null); return }
    const tag = block.tagName.toLowerCase()
    const id = block.getAttribute('data-block-id')
    onSelect?.(
      { type: tagToType(tag), id, text: block.textContent || '', kind: tag },
      e
    )
  }

  const handleBeforeInput = (e) => {
    if (!editable) return
    const native = e.nativeEvent
    if (!native || !native.inputType) return
    if (!DELETE_TYPES.has(native.inputType)) return
    const handled = trackDeletion(native)
    if (handled) {
      e.preventDefault()
      onEdit?.()
    }
  }

  const handleInput = (e) => {
    if (!editable) return
    const native = e.nativeEvent
    if (native && native.inputType && !CONTENT_INPUT_TYPES.has(native.inputType)) return
    if (native && INSERT_TYPES.has(native.inputType) && native.data) {
      try { wrapLastInsertion(containerRef.current, native.data) }
      catch { /* IME/composition states can throw — swallow */ }
    }
    // Find nearest block and report its id so the edited-count updates
    const sel = window.getSelection()
    const node = sel?.anchorNode
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
    const block = el?.closest?.('[data-block-id]')
    const blockId = block?.getAttribute('data-block-id') || 'docx-preview-body'
    onEdit?.(blockId)
  }

  const bannerBg = {
    brand:   'bg-brand-100/95 border-brand-200 text-brand-900',
    emerald: 'bg-emerald-100/95 border-emerald-200 text-emerald-900',
    purple:  'bg-purple-100/95 border-purple-200 text-purple-900',
    amber:   'bg-amber-100/95 border-amber-200 text-amber-900',
  }[banner?.tone] || 'bg-slate-100 border-slate-200 text-slate-900'

  const bannerIcon = banner?.kind === 'ai'         ? <Sparkles size={13} />
                   : banner?.kind === 'approved'   ? <ShieldCheck size={13} />
                   : banner?.kind === 'checkpoint' ? <History size={13} />
                   : <Pencil size={13} />

  return (
    <div
      style={{ zoom: `${zoom}%` }}
      className="h-full overflow-y-auto bg-slate-300 py-3 pb-16 relative"
    >
      {banner && (
        <div className={`sticky top-0 z-10 px-4 py-2 backdrop-blur border-b flex items-center gap-2 text-[12px] ${bannerBg}`}>
          {bannerIcon}
          <b>{banner.title}</b>
          <span>· {banner.msg}</span>
          {checkpointId && onRestoreCheckpoint && (
            <button
              onClick={() => onRestoreCheckpoint(checkpointId)}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
            >
              <RotateCcw size={11} /> Restore this checkpoint
            </button>
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center justify-center py-24 text-slate-500 text-[12px]">
          Rendering pages with full template fidelity…
        </div>
      )}

      {status === 'error' && (
        <div className="mx-auto max-w-md mt-8 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[12px]">
          <b>Couldn't render this document with page fidelity.</b>
          <div className="mt-1 text-[11px]">{error}</div>
        </div>
      )}

      <div
        ref={containerRef}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onClick={handleContainerClick}
        onMouseOver={handleContainerMouseOver}
        onMouseOut={handleContainerMouseOut}
        suppressContentEditableWarning
        className={`docx-preview-host mx-auto ${editable ? 'docx-preview-editable' : ''}`}
      />

      {/* Floating hover action bar — appears in the top-right of the currently
          hovered <img>. Stays visible while the mouse is over it (via its
          own onMouseEnter/Leave), so the user can actually reach the buttons. */}
      {hoveredImg && (() => {
        const r = hoveredImg.rect
        const style = { top: r.top + 8, left: Math.max(8, r.right - 96) }
        return (
          <div
            style={style}
            className="fixed z-40 flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-white/15 rounded-lg px-1.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-fade-in"
            onMouseEnter={() => clearTimeout(hoverHideTimer.current)}
            onMouseLeave={scheduleHideHover}
          >
            <HoverActionBtn onClick={requestEnlarge} icon={<Maximize2 size={13} />} label="Enlarge" />
            <HoverActionBtn onClick={requestDelete} icon={<Trash2 size={13} />} label="Delete" tone="danger" />
          </div>
        )
      })()}

      {/* Delete confirmation for hover-triggered deletes */}
      {pendingDelete && (
        <DeleteImageDialog
          src={pendingDelete.src}
          alt={pendingDelete.alt}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Block selection action bar — icons + labels, horizontal, hugs the
          top-right of the last selected block. Adapts to multi-select by
          showing a count chip and a Merge button. */}
      {hoveredBlock && (() => {
        const isMulti = (hoveredBlock.count || 1) > 1
        const r      = hoveredBlock.rect
        const PILL_W = isMulti ? 484 : 396
        const PILL_H = 36
        const MARGIN = 8

        let left = r.right - PILL_W + 8
        let top  = r.top - PILL_H - 4
        if (top < MARGIN) top = r.bottom + 4
        left = Math.max(MARGIN, Math.min(window.innerWidth - PILL_W - MARGIN, left))
        top  = Math.max(MARGIN, Math.min(window.innerHeight - PILL_H - MARGIN, top))

        const style = { top, left, width: PILL_W, height: PILL_H }
        return (
          <div
            style={style}
            className="fixed z-40 flex items-center gap-0.5 bg-slate-900/95 backdrop-blur border border-white/15 rounded-full px-1 shadow-[0_10px_30px_rgba(0,0,0,0.55)] animate-fade-in"
          >
            {isMulti && (
              <>
                <span className="text-[10.5px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap">
                  {hoveredBlock.count} selected
                </span>
                <div className="w-px h-4 bg-white/15 mx-0.5"></div>
              </>
            )}
            <ChipBtn onClick={() => dispatchBlockAction('rewrite')}    icon={<Wand2 size={12} />}        label="Rewrite"    tone="purple" />
            <ChipBtn onClick={() => dispatchBlockAction('rephrase')}   icon={<RefreshCw size={12} />}    label="Rephrase"   tone="brand" />
            <ChipBtn onClick={() => dispatchBlockAction('add-detail')} icon={<Plus size={12} />}         label="Add detail" tone="emerald" />
            {isMulti && (
              <ChipBtn onClick={() => dispatchBlockAction('merge')}    icon={<Combine size={12} />}     label="Merge"      tone="amber" />
            )}
            <ChipBtn onClick={() => dispatchBlockAction('move')}       icon={<MoveVertical size={12} />} label="Move" />
            <div className="w-px h-4 bg-white/15 mx-0.5"></div>
            <ChipBtn onClick={() => dispatchBlockAction('delete')}     icon={<Trash2 size={12} />}       label="Delete"     tone="danger" />
          </div>
        )
      })()}

      {/* Delete confirmation for a text block */}
      {pendingBlockDelete && (
        <DeleteBlockDialog
          block={pendingBlockDelete}
          onCancel={() => setPendingBlockDelete(null)}
          onConfirm={confirmBlockDelete}
        />
      )}

      <style>{`
        .docx-preview-host .docx-wrapper {
          background: transparent;
          padding: 0;
        }
        .docx-preview-host section.docx-fidelity {
          box-shadow: 0 1px 2px rgba(15,23,42,0.04),
                      0 4px 12px rgba(15,23,42,0.06),
                      0 12px 40px rgba(15,23,42,0.04);
          margin: 0 auto 12px;
          background: white;
        }
        .docx-preview-editable [contenteditable="true"],
        .docx-preview-editable {
          outline: none;
        }
        .docx-preview-editable section.docx-fidelity { caret-color: #2563EB; }

        /* ▶ Play-section chip injected next to any linked heading. */
        .docx-preview-host .dp-play-section {
          display: inline-flex;
          align-items: center;
          gap: 0;
          margin-left: 10px;
          padding: 2px 10px;
          height: 22px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          font-family: 'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
          background: linear-gradient(135deg,#2563EB,#7C3AED);
          color: #fff;
          border: none;
          cursor: pointer;
          vertical-align: middle;
          box-shadow: 0 2px 6px rgba(37,99,235,0.35);
          user-select: none;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .docx-preview-host .dp-play-section:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37,99,235,0.45);
        }
        .docx-preview-host .dp-play-section:active {
          transform: translateY(0);
        }

        /* Block hover + selection markers on docx-preview blocks —
           subtle so they don't fight docx-preview's own layout, but
           enough to signal "click me to edit". */
        .docx-preview-host .dp-block {
          transition: background-color 0.12s ease, box-shadow 0.12s ease;
          cursor: text;
          border-radius: 3px;
        }
        .docx-preview-host .dp-block:hover {
          background-color: rgba(15, 23, 42, 0.04);
        }
        /* .block-selected — Word/Google-Docs style: soft blue background
           + thick left border via box-shadow so parent overflow can't
           clip it. Works even inside table cells and article containers. */
        .docx-preview-host .dp-block.block-selected {
          background-color: rgba(37, 99, 235, 0.08) !important;
          box-shadow: inset 3px 0 0 #2563EB !important;
          outline: 1px solid rgba(37, 99, 235, 0.15);
          outline-offset: 0;
        }
        /* Images get their own selection ring */
        .docx-preview-host img.dp-block { cursor: zoom-in; }
        .docx-preview-host img.dp-block:hover {
          outline: 2px solid rgba(37, 99, 235, 0.35);
          outline-offset: 2px;
        }
        .docx-preview-host img.dp-block.block-selected {
          outline: 3px solid #2563EB !important;
          outline-offset: 2px;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15) !important;
          background: transparent !important;
        }

        /* Lists created via the Ribbon inside docx-preview also inherit
           .ts-list — the global rule in index.css restores markers/indent. */
      `}</style>
    </div>
  )
}
