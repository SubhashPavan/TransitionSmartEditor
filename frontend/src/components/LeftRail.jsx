import { useEffect, useState, useCallback } from 'react'
import { ListTree, ChevronRight, Play } from 'lucide-react'

/**
 * Left rail — pure document outline. No stat chips, no version indicator,
 * no fake filters. Just headings scanned from the actual rendered doc.
 * Clicking a heading scrolls the canvas to it. Refreshes on interval so
 * new / renamed headings appear automatically.
 */
export default function LeftRail({ docState, currentVersion, getSectionVideo, onPlaySectionVideo }) {
  const [outline, setOutline] = useState([])

  // Scan the canvas DOM for headings and track-change spans.
  //
  // docx-preview emits Word "Heading 1"/"Heading 2"/… styles as classed
  // paragraphs (e.g. `<p class="heading1">` or `<p class="Heading-1">`)
  // rather than real <h1>/<h2> elements. So we need to detect BOTH:
  //   1. Real semantic tags (<h1>…<h4>) — from mammoth or authored docs
  //   2. docx-preview's styled paragraphs (class starts with "heading"/"title")
  //   3. As a fallback: large-font-size + bold paragraphs
  const scan = useCallback(() => {
    const root =
      document.querySelector('.docx-preview-host') ||
      document.querySelector('.uploaded-doc') ||
      document.querySelector('[data-canvas-inner]')
    if (!root) {
      setOutline([])
      return
    }

    const list = []
    const seen = new Set()

    /** Add an element to the outline if it isn't already there. Defensively
     *  strips any injected `.dp-play-section` chip's text so the outline
     *  label stays clean — sectionLinks lookup needs the pristine heading
     *  string to match. */
    const pushHeading = (el, level, idx) => {
      if (!el || seen.has(el)) return
      let raw = el.textContent || ''
      if (el.querySelector?.('.dp-play-section')) {
        const clone = el.cloneNode(true)
        clone.querySelectorAll('.dp-play-section').forEach(c => c.remove())
        raw = clone.textContent || ''
      }
      const text = raw.trim()
      if (!text) return
      seen.add(el)
      if (!el.id) el.id = `outline-h-${idx}-${list.length}`
      list.push({
        id: el.id,
        text: text.length > 68 ? text.slice(0, 65) + '…' : text,
        level: Math.max(1, Math.min(4, level)),
        el,
      })
    }

    // 1) Real semantic headings first (preserves document order for later merge)
    root.querySelectorAll('h1, h2, h3, h4').forEach((el, idx) => {
      pushHeading(el, parseInt(el.tagName.slice(1), 10) || 2, idx)
    })

    // 2) Docx-preview's styled paragraphs. Match any class containing
    //    "heading" or "title" (case-insensitive) — covers "heading1",
    //    "Heading-1", "heading-2", "Title", "docTitle", etc.
    root.querySelectorAll('p[class], div[class]').forEach((el, idx) => {
      const cls = (el.className || '').toString().toLowerCase()
      if (!cls) return
      let level = null
      // Digit hint: "heading1", "heading-2", "heading_3"…
      const m = cls.match(/heading[-_ ]?(\d)/)
      if (m) level = parseInt(m[1], 10)
      else if (/(^|\s)heading/.test(cls))  level = 2
      else if (/title/.test(cls))          level = 1
      else if (/(^|\s)subtitle/.test(cls)) level = 2
      if (level != null) pushHeading(el, level, idx)
    })

    // 3) Last-ditch: unstyled p elements that VISUALLY look like headings —
    //    bold + noticeably bigger font than body. Only if nothing landed above.
    if (list.length === 0) {
      root.querySelectorAll('p').forEach((el, idx) => {
        const text = (el.textContent || '').trim()
        if (!text || text.length > 200) return
        const cs = window.getComputedStyle(el)
        const size = parseFloat(cs.fontSize) || 0
        const weight = parseInt(cs.fontWeight, 10) || 400
        if (size >= 18 && weight >= 600) pushHeading(el, size >= 24 ? 1 : 2, idx)
        else if (size >= 15 && weight >= 700) pushHeading(el, 3, idx)
      })
    }

    // Sort by document order (querySelectorAll already returns document order,
    // but merging semantic + styled might reorder — re-sort via compareDocumentPosition)
    list.sort((a, b) => {
      if (a.el === b.el) return 0
      const pos = a.el.compareDocumentPosition(b.el)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })

    setOutline(list)
  }, [])

  useEffect(() => {
    // Poll for the host until it exists, then attach a MutationObserver so
    // outline updates are immediate. Keep a low-frequency safety poll in
    // case an observer misses a mutation (rare, but cheap insurance).
    let observer = null
    let poll = null
    let debounceTimer = null
    const scheduleScan = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(scan, 60)
    }
    const attach = () => {
      const root =
        document.querySelector('.docx-preview-host') ||
        document.querySelector('.uploaded-doc') ||
        document.querySelector('[data-canvas-inner]')
      if (!root) { poll = setTimeout(attach, 300); return }
      scan()
      observer = new MutationObserver(scheduleScan)
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,   // text edits inside a heading
      })
    }
    attach()
    // Safety net: re-scan every 1s in case the observer misses something.
    const iv = setInterval(scan, 1000)
    return () => {
      observer?.disconnect()
      if (poll) clearTimeout(poll)
      clearTimeout(debounceTimer)
      clearInterval(iv)
    }
  }, [scan, currentVersion])

  const jumpTo = (item) => {
    item.el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="bg-white border-r border-slate-100 flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-1 flex items-center gap-1.5 text-[10.5px] tracking-widest text-slate-400 uppercase font-bold">
        <ListTree size={11} className="text-slate-400" />
        Outline
      </div>
      <div className="px-2 pb-3 overflow-y-auto flex-1 space-y-px">
        {outline.length === 0 ? (
          <div className="px-3 py-6 text-[11px] text-slate-400 italic text-center leading-snug">
            No headings detected yet. Apply <b>Heading 1</b> or <b>Heading 2</b> from the ribbon Styles to build the outline.
          </div>
        ) : (
          outline.map((item, i) => {
            const link = typeof getSectionVideo === 'function' ? getSectionVideo(item.text) : null
            return (
              <OutlineItem
                key={item.id + i}
                item={item}
                videoLink={link}
                onJump={() => jumpTo(item)}
                onPlay={link && onPlaySectionVideo
                  ? () => onPlaySectionVideo({
                      sourceId:   link.source_id,
                      sourceName: link.source_name || link.source_id,
                      startSec:   link.start_sec,
                      endSec:     link.end_sec,
                      fullscreen: true,   // outline plays open in fullscreen
                    })
                  : null}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

function OutlineItem({ item, videoLink, onJump, onPlay }) {
  const pad =
    item.level === 1 ? 'pl-2.5'
    : item.level === 2 ? 'pl-6'
    : item.level === 3 ? 'pl-9'
    : 'pl-12'
  const size =
    item.level === 1 ? 'text-[12.5px] font-semibold text-slate-900'
    : item.level === 2 ? 'text-[12px] text-slate-700'
    : 'text-[11.5px] text-slate-600'
  return (
    <div className={`w-full ${pad} pr-2 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-slate-50 transition-colors group`}>
      {/* Segment play button — appears BEFORE the heading text when the
          section is linked to a video segment. Clicking opens the video
          player in fullscreen at the exact timestamp. */}
      {onPlay && videoLink ? (
        <button
          onClick={onPlay}
          title={`Play ${videoLink.source_name || videoLink.source_id} · ${formatSec(videoLink.start_sec)} – ${formatSec(videoLink.end_sec)}`}
          className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 hover:brightness-110 text-white flex items-center justify-center shadow-sm transition-all hover:scale-105"
        >
          <Play size={9} fill="white" strokeWidth={0} className="translate-x-[0.5px]" />
        </button>
      ) : item.level > 1 ? (
        <ChevronRight size={10} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
      ) : null}
      <button
        onClick={onJump}
        className={`${size} flex-1 truncate text-left`}
        title={item.text}
      >
        {item.text}
      </button>
    </div>
  )
}

function formatSec(s) {
  if (s == null || isNaN(s)) return '—'
  const t = Math.max(0, Math.floor(s))
  const m = Math.floor(t / 60), r = t % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

