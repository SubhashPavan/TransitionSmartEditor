import { useEffect, useMemo, useRef, useState } from 'react'
import { X, MoveVertical, Search, ChevronRight, Check, Layers } from 'lucide-react'

/**
 * MoveBlockModal — pick a target section to move a block into.
 *
 * Reads the doc's live outline (h1/h2/h3/h4 headings) from the canvas
 * root at open time. Reviewer picks a section, chooses whether to insert
 * at the beginning or end, and confirms.
 *
 * Props:
 *   block     — { id, kind, text, el }
 *   onCancel  — close without moving
 *   onMove    — ({ targetHeadingId, placement: 'start'|'end' }) => void
 */
export default function MoveBlockModal({ block, onCancel, onMove }) {
  const [query, setQuery]         = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [placement, setPlacement] = useState('end')
  const inputRef = useRef(null)

  const sections = useMemo(() => scanHeadings(), [])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30)
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  // Which section does the block currently live under? Used for the
  // "current" indicator and to prevent no-op moves.
  const currentSectionId = useMemo(() => findCurrentSection(block?.el, sections), [block?.el, sections])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? sections.filter(s => s.text.toLowerCase().includes(q))
    : sections

  const confirmMove = () => {
    if (!selectedId) return
    onMove?.({ targetHeadingId: selectedId, placement })
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md">
            <MoveVertical size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold text-slate-900">Move to section</div>
            <div className="text-[11.5px] text-slate-500 truncate">
              <span className="uppercase tracking-widest font-semibold text-slate-400 mr-1">{block?.kind || 'block'}</span>
              · "{(block?.text || '').slice(0, 60)}{block?.text?.length > 60 ? '…' : ''}"
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
          <Search size={13} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            className="flex-1 h-8 outline-none text-[12.5px] text-slate-900 placeholder:text-slate-400"
          />
          <span className="text-[10.5px] text-slate-400 tabular-nums">{filtered.length} of {sections.length}</span>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 px-4 text-[11.5px] text-slate-400 italic leading-snug">
              No sections match. Add an <b>H1</b>–<b>H4</b> to the doc first, then try again.
            </div>
          ) : (
            filtered.map(s => (
              <SectionRow
                key={s.id}
                section={s}
                selected={selectedId === s.id}
                current={currentSectionId === s.id}
                onClick={() => setSelectedId(s.id)}
              />
            ))
          )}
        </div>

        {/* Placement */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center gap-3 flex-shrink-0">
          <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-500">Placement</span>
          <RadioChip label="Start of section" value="start" active={placement === 'start'} onClick={() => setPlacement('start')} />
          <RadioChip label="End of section"   value="end"   active={placement === 'end'}   onClick={() => setPlacement('end')} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmMove}
            disabled={!selectedId || selectedId === currentSectionId}
            className="h-9 px-5 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm inline-flex items-center gap-1.5 transition-all"
          >
            <Check size={13} /> Move here
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */
function SectionRow({ section, selected, current, onClick }) {
  const indent = ((section.level || 1) - 1) * 16 + 12
  return (
    <button
      onClick={onClick}
      style={{ paddingLeft: indent }}
      className={`w-full pr-4 py-2 flex items-center gap-2 text-left group transition-colors ${
        selected
          ? 'bg-brand-50 ring-1 ring-brand-200'
          : 'hover:bg-slate-50'
      }`}
    >
      <ChevronRight size={11} className={`flex-shrink-0 transition-transform ${
        selected ? 'text-brand-600 rotate-90' : 'text-slate-300 group-hover:text-slate-500'
      }`} />
      <Layers size={11} className={`flex-shrink-0 ${selected ? 'text-brand-500' : 'text-slate-400'}`} />
      <span className={`flex-1 text-[12.5px] truncate ${
        selected ? 'text-brand-900 font-semibold' : 'text-slate-800'
      }`}>
        {section.text}
      </span>
      {current && (
        <span className="text-[9.5px] uppercase tracking-widest font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          current
        </span>
      )}
      {selected && (
        <Check size={11} className="text-brand-600 flex-shrink-0" />
      )}
    </button>
  )
}

function RadioChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-brand-500 text-white shadow-sm'
          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-slate-300'}`}></span>
      {label}
    </button>
  )
}

/* ────────────────────────────────────────────────────────
   Helpers — read the doc's outline live
──────────────────────────────────────────────────────── */
function scanHeadings() {
  const root = document.querySelector('.docx-preview-host') || document.querySelector('.uploaded-doc')
  if (!root) return []
  const out = []
  const seen = new Set()
  const push = (el, level) => {
    if (!el || seen.has(el)) return
    const text = (el.textContent || '').trim()
    if (!text) return
    if (!el.id) el.id = `move-target-h-${out.length}`
    seen.add(el)
    out.push({ id: el.id, text, level, el })
  }
  root.querySelectorAll('h1, h2, h3, h4').forEach(el => push(el, parseInt(el.tagName.slice(1), 10) || 2))
  if (out.length === 0) {
    // docx-preview styles headings as classed p/div; catch those too
    root.querySelectorAll('p[class], div[class]').forEach(el => {
      const cls = (el.className || '').toString().toLowerCase()
      const m = cls.match(/heading[-_ ]?(\d)/)
      const level = m ? parseInt(m[1], 10) : /title/.test(cls) ? 1 : /heading/.test(cls) ? 2 : null
      if (level != null) push(el, level)
    })
  }
  return out
}

/** Find the heading (by DOM order) that the block currently sits under. */
function findCurrentSection(blockEl, sections) {
  if (!blockEl || sections.length === 0) return null
  let current = null
  for (const s of sections) {
    if (!s.el) continue
    const pos = s.el.compareDocumentPosition(blockEl)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) current = s.id
    else break
  }
  return current
}
