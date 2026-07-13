import { useEffect, useMemo, useState } from 'react'
import {
  X, Sparkles, Video, Layers, ChevronRight, Search, Check,
  Plus, StickyNote, ArrowRight,
} from 'lucide-react'

/**
 * GenerateFromVideoModal — after the reviewer marks a segment in the
 * VideoPlayer and clicks "Generate SOP from segment", this dialog picks:
 *   1. Where the generated steps should land (existing section or new)
 *   2. Placement inside that section (start/end)
 *   3. Notes are pre-filled from the player and still editable
 *
 * Then the reviewer clicks Generate — the parent posts to the LLM (with
 * the segment + notes) and appends the steps into the chosen section.
 *
 * Props:
 *   source     — { id, name, url }
 *   startSec, endSec, notes — the segment + notes from the player
 *   onCancel   — dismiss without generating
 *   onGenerate — ({ targetHeadingId | newSectionName, placement, notes,
 *                    startSec, endSec, source }) => Promise<string> or void
 */
export default function GenerateFromVideoModal({
  source, startSec, endSec, notes: notesFromPlayer = '',
  onCancel, onGenerate,
}) {
  const [notes, setNotes]     = useState(notesFromPlayer)
  const [query, setQuery]     = useState('')
  const [targetId, setTargetId] = useState(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [placement, setPlacement] = useState('end')
  const [status, setStatus] = useState('idle')   // 'idle' | 'generating' | 'error'
  const [error, setError]   = useState('')

  const sections = useMemo(() => scanHeadings(), [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const q = query.trim().toLowerCase()
  const filtered = q ? sections.filter(s => s.text.toLowerCase().includes(q)) : sections

  const isNew = targetId === '__NEW__'
  const canGenerate = (targetId && !isNew) || (isNew && newSectionName.trim().length > 1)

  const doGenerate = async () => {
    if (!canGenerate) return
    setStatus('generating')
    setError('')
    try {
      await onGenerate?.({
        source,
        startSec,
        endSec,
        notes,
        targetHeadingId: isNew ? null : targetId,
        newSectionName: isNew ? newSectionName.trim() : null,
        placement,
      })
      // Parent closes on success
    } catch (e) {
      setError(String(e?.message || e))
      setStatus('idle')
    }
  }

  const duration = (endSec != null && startSec != null) ? (endSec - startSec) : 0

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white w-[720px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-700 text-white flex items-center justify-center shadow-md">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold text-slate-900">Generate SOP from video segment</div>
            <div className="text-[11.5px] text-slate-500 truncate flex items-center gap-1">
              <Video size={11} className="text-slate-400" />
              {source?.name}
              <span className="mx-1 text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-600">{formatTime(startSec)} → {formatTime(endSec)}</span>
              <span className="text-slate-400"> ({formatTime(duration)} long)</span>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0 divide-x divide-slate-100">
          {/* Target section picker */}
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
              <Search size={12} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sections…"
                className="flex-1 h-7 outline-none text-[12.5px] text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {/* Create new section */}
              <button
                onClick={() => setTargetId('__NEW__')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isNew ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center flex-shrink-0">
                  <Plus size={13} className="text-emerald-700" />
                </div>
                <span className={`flex-1 text-[12.5px] font-semibold ${isNew ? 'text-brand-900' : 'text-slate-800'}`}>
                  Create new section
                </span>
                {isNew && <Check size={12} className="text-brand-600" />}
              </button>

              {isNew && (
                <div className="px-3 py-2 bg-brand-50/40 border-y border-brand-100/60">
                  <input
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder='e.g. "3.5 Bulk Contact Update"'
                    autoFocus
                    className="w-full h-8 px-3 rounded border border-brand-200 text-[12px] text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              )}

              <div className="text-[9.5px] font-bold tracking-widest uppercase text-slate-400 px-3 pt-3 pb-1">
                Or insert into an existing section
              </div>

              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-[11.5px] text-slate-400 italic">
                  No headings match. Add an <b>H1</b>–<b>H4</b> to the doc first.
                </div>
              ) : (
                filtered.map(s => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    selected={targetId === s.id}
                    onClick={() => setTargetId(s.id)}
                  />
                ))
              )}
            </div>

            {/* Placement radios */}
            {targetId && !isNew && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mr-1">Insert</span>
                <RadioChip label="At start" active={placement === 'start'} onClick={() => setPlacement('start')} />
                <RadioChip label="At end"   active={placement === 'end'}   onClick={() => setPlacement('end')} />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
              <StickyNote size={13} className="text-amber-500" />
              <div>
                <div className="text-[12px] font-semibold text-slate-900">Notes for the AI</div>
                <div className="text-[10.5px] text-slate-500">Concrete details = better steps.</div>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='e.g. "Show clicks on the Company Profile tab, red-outline the Save button, capture the confirmation modal…"'
              className="flex-1 min-h-0 p-3 outline-none resize-none text-[12.5px] text-slate-900 placeholder:text-slate-400 leading-snug"
            />
            <div className="px-3 py-2 border-t border-slate-100 bg-amber-50/40 text-[10.5px] text-amber-800 leading-snug">
              💡 <b>Tip:</b> Mention the exact UI element names, error text, or steps you saw. The AI leans heavily on notes for accuracy.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end flex-shrink-0">
          {status === 'error' && (
            <span className="mr-auto text-[11.5px] text-red-600 truncate">Failed: {error}</span>
          )}
          <button
            onClick={onCancel}
            disabled={status === 'generating'}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={doGenerate}
            disabled={!canGenerate || status === 'generating'}
            className="h-9 px-5 rounded-md text-[12.5px] font-semibold bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-all"
          >
            {status === 'generating'
              ? <><Sparkles size={13} className="animate-pulse" /> Generating…</>
              : <><ArrowRight size={13} /> Generate & insert</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */
function SectionRow({ section, selected, onClick }) {
  const indent = ((section.level || 1) - 1) * 16 + 12
  return (
    <button
      onClick={onClick}
      style={{ paddingLeft: indent }}
      className={`w-full pr-4 py-2 flex items-center gap-2 text-left group transition-colors ${
        selected ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
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
      {selected && <Check size={11} className="text-brand-600 flex-shrink-0" />}
    </button>
  )
}

function RadioChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-brand-500 text-white shadow-sm'
          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-slate-300'}`}></span>
      {label}
    </button>
  )
}

/* ────────────────────────────────────────────────────────
   Helpers — pull the doc outline for the section picker
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
    if (!el.id) el.id = `gen-target-h-${out.length}`
    seen.add(el)
    out.push({ id: el.id, text, level })
  }
  root.querySelectorAll('h1, h2, h3, h4').forEach(el => push(el, parseInt(el.tagName.slice(1), 10) || 2))
  if (out.length === 0) {
    root.querySelectorAll('p[class], div[class]').forEach(el => {
      const cls = (el.className || '').toString().toLowerCase()
      const m = cls.match(/heading[-_ ]?(\d)/)
      const level = m ? parseInt(m[1], 10) : /title/.test(cls) ? 1 : /heading/.test(cls) ? 2 : null
      if (level != null) push(el, level)
    })
  }
  return out
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00'
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  const dec = Math.round((s - Math.floor(s)) * 10)
  return `${m}:${String(r).padStart(2, '0')}.${dec}`
}
