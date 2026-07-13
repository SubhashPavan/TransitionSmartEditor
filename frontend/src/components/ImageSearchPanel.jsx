import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Image as ImageIcon, X, Sparkles, Search, Upload, Trash2, Check,
  Wand2, Crop, Maximize2, MousePointerClick, Play, Minus, Plus,
} from 'lucide-react'
import ImageEnlargeModal from './ImageEnlargeModal'
import ImageCropModal from './ImageCropModal'
import ImageAnnotateModal from './ImageAnnotateModal'

/**
 * Image editor panel — shown in the right rail when a user clicks an
 * <img> in the document. Provides:
 *   • Thumbnail + enlarge
 *   • Frame stepper (±10s / ±5s / ±2s) — for images sourced from a video
 *   • Crop, annotate, upload replacement, delete
 *   • AI/semantic search for a completely different image
 *
 * Everything except the frame stepper works client-side. The stepper's
 * "grab a new frame" call needs a backend that can look up the source
 * video for this doc and re-extract at the new timestamp; we render the
 * UI now and stub the request with a toast so the flow's ready.
 */
export default function ImageSearchPanel({ image, onClose }) {
  const [query, setQuery] = useState('')
  const [enlargeOpen, setEnlargeOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [currentSrc, setCurrentSrc] = useState(image?.src || '')
  const [selectedTime, setSelectedTime] = useState(null)   // seconds picked on the timeline

  useEffect(() => setCurrentSrc(image?.src || ''), [image?.src])

  // Detect the source-video timestamp from the image alt/path if present.
  // Our TransitionSmart samples embed it as "frame_447.60s.jpg".
  const sourceTimeSec = useMemo(() => {
    const hay = [image?.alt || '', image?.src || ''].join(' ')
    const m = hay.match(/frame_(\d+(?:\.\d+)?)s/)
    return m ? parseFloat(m[1]) : null
  }, [image?.src, image?.alt])

  // Reset the timeline selection when a new image is picked
  useEffect(() => { setSelectedTime(sourceTimeSec) }, [sourceTimeSec])

  const flash = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  /* ─── Actions ─── */

  const doDelete = () => {
    if (!image?.id) { onClose(); return }
    if (!window.confirm('Delete this image block? The paragraph it lives in will stay — only the image is removed.')) return
    // The image was tagged with data-block-id="<blockid>-img" during selection,
    // but sometimes selection gives us just the block id. Try both.
    const findEl = () => {
      // Direct id
      let el = document.querySelector(`[data-block-id="${image.id}"]`)
      if (el && el.tagName === 'IMG') return el
      // Nearest IMG under the block
      if (el) {
        const inner = el.querySelector('img')
        if (inner) return inner
      }
      // Fall back to src match
      return document.querySelector(`img[src="${CSS.escape(image.src || '')}"]`)
    }
    const el = findEl()
    if (el) {
      el.remove()
      flash('Image deleted.')
      onClose()
    } else {
      flash('Could not find the image element to delete.')
    }
  }

  const doApplySrc = (newSrc, verb = 'Updated') => {
    if (!newSrc) return
    setCurrentSrc(newSrc)
    // Push into the actual DOM
    const el = document.querySelector(`img[src="${CSS.escape(currentSrc)}"]`)
    if (el) {
      el.setAttribute('src', newSrc)
      flash(`${verb} · applied to document`)
    } else {
      flash(`${verb} · (couldn't locate original img in DOM — kept in preview)`)
    }
  }

  const doUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => doApplySrc(ev.target.result, 'Uploaded')
      reader.readAsDataURL(file)
    }
    input.click()
  }

  // Confirm the currently-selected timestamp — would POST to the backend
  // to re-extract the frame from the source video at that time.
  const grabFrameAtSelectedTime = () => {
    if (selectedTime == null) return
    // Backend hook: POST { docId, imageId, newTime: selectedTime }
    // Response: { newSrc }. For now, show a placeholder toast.
    flash(`Would fetch frame @ ${selectedTime.toFixed(1)}s from source video. Backend hook needed.`)
  }

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-[13.5px] font-semibold text-slate-900 flex items-center gap-2">
          <ImageIcon size={14} className="text-brand-600" />
          Image
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Flash notice */}
      {notice && (
        <div className="text-[11px] bg-brand-50 border border-brand-100 text-brand-800 rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0">
          <MousePointerClick size={11} />
          {notice}
        </div>
      )}

      {/* Thumbnail */}
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex-shrink-0">
        <div className="relative group">
          {currentSrc ? (
            <img
              src={currentSrc}
              alt={image?.alt || ''}
              onClick={() => setEnlargeOpen(true)}
              className="block w-full h-auto max-h-[220px] object-contain bg-white cursor-zoom-in"
              title="Click to enlarge"
            />
          ) : (
            <div className="h-[160px] flex items-center justify-center text-slate-400 text-[12px]">
              <ImageIcon size={22} className="mr-2 opacity-40" />
              No preview available
            </div>
          )}
          {currentSrc && (
            <button
              onClick={() => setEnlargeOpen(true)}
              className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur text-white h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Enlarge"
            >
              <Maximize2 size={12} />
            </button>
          )}
        </div>
        <div className="px-3 py-2 flex justify-between items-center text-[11px] border-t border-slate-100 bg-slate-50/60">
          <span className="text-slate-500 truncate max-w-[180px]" title={image?.alt}>
            {image?.alt || 'Uncaptioned image'}
          </span>
          <span className="text-slate-400 font-medium tabular-nums">
            {imageSize(currentSrc)}
          </span>
        </div>
      </div>

      {/* Frame timeline — scrub to any timestamp in a window around the current frame */}
      <FrameTimeline
        sourceTimeSec={sourceTimeSec}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        onGrab={grabFrameAtSelectedTime}
      />

      {/* Editor actions */}
      <div>
        <SubHead>Edit</SubHead>
        <div className="grid grid-cols-2 gap-1.5">
          <QuickAction icon={<Crop size={13} className="text-brand-500" />}       onClick={() => setCropOpen(true)}>Crop</QuickAction>
          <QuickAction icon={<Wand2 size={13} className="text-purple-500" />}     onClick={() => setAnnotateOpen(true)}>Annotate</QuickAction>
          <QuickAction icon={<Maximize2 size={13} className="text-slate-500" />}  onClick={() => setEnlargeOpen(true)}>Enlarge</QuickAction>
          <QuickAction icon={<Upload size={13} className="text-emerald-500" />}   onClick={doUpload}>Upload replacement</QuickAction>
        </div>
      </div>

      {/* AI semantic search */}
      <div>
        <SubHead>Or search for a different image</SubHead>
        <div className="flex bg-white border border-slate-200 rounded-xl px-3 py-2 items-center gap-2 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-sm">
          <Sparkles size={14} className="text-purple-500 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. supplier profile screen highlighted"
            className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12px] text-slate-900 placeholder:text-slate-400"
          />
          <button
            onClick={() => flash('Semantic search — backend hook needed.')}
            className="bg-brand-500 text-white h-7 px-2.5 rounded-md text-[11px] font-semibold hover:bg-brand-600 inline-flex items-center gap-1 flex-shrink-0 shadow-sm shadow-brand-500/25"
          >
            <Search size={11} /> Search
          </button>
        </div>

        {/* Mock suggestions */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {SUGGESTIONS.map((s, i) => (
            <SuggestionThumb
              key={i}
              label={s.label}
              tone={s.tone}
              onClick={() => flash(`Would replace with "${s.label}". Backend hook needed.`)}
            />
          ))}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex gap-2 pt-3 border-t border-slate-100 mt-auto">
        <ActionBtn tone="danger" icon={<Trash2 size={12} />} onClick={doDelete}>Delete</ActionBtn>
        <ActionBtn tone="primary" icon={<Check size={12} />} onClick={onClose}>Done</ActionBtn>
      </div>

      {/* Modals */}
      {enlargeOpen && currentSrc && (
        <ImageEnlargeModal
          src={currentSrc}
          alt={image?.alt}
          onClose={() => setEnlargeOpen(false)}
          onDelete={doDelete}
          onApplySrc={(newSrc, verb) => doApplySrc(newSrc, verb)}
          sourceTimeSec={sourceTimeSec}
          sectionRange={image?.sectionRange}
          onPickFrameTime={(t) => flash(`Would fetch frame @ ${t.toFixed(1)}s from source video. Backend hook needed.`)}
        />
      )}
      {cropOpen && currentSrc && (
        <ImageCropModal
          src={currentSrc}
          onCancel={() => setCropOpen(false)}
          onApply={(newSrc) => { doApplySrc(newSrc, 'Cropped'); setCropOpen(false) }}
        />
      )}
      {annotateOpen && currentSrc && (
        <ImageAnnotateModal
          src={currentSrc}
          onCancel={() => setAnnotateOpen(false)}
          onApply={(newSrc) => { doApplySrc(newSrc, 'Annotated'); setAnnotateOpen(false) }}
        />
      )}
    </div>
  )
}

/* ─── helpers ─── */

function SubHead({ children }) {
  return (
    <div className="text-[9.5px] font-bold text-slate-400 tracking-widest uppercase mb-2">
      {children}
    </div>
  )
}

/**
 * FrameTimeline — a scrubbable strip showing timestamps in a window
 * around the current frame. The reviewer drags or clicks the playhead
 * anywhere in the window, sees the exact timestamp update live, then
 * hits "Grab this frame" to request that frame from the backend.
 *
 * Window default: ±30s around the current frame. Users needing to
 * jump further use the Nudge buttons to shift the window.
 */
function FrameTimeline({ sourceTimeSec, selectedTime, setSelectedTime, onGrab }) {
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [hoverTime, setHoverTime] = useState(null)
  const [windowStart, setWindowStart] = useState(0)
  const WINDOW_S = 60   // total window duration in seconds (±30s)

  // Demo mode: no real source video linked. Show the UI with a
  // placeholder timestamp so the reviewer can see how it looks and
  // gets a clear "link a source" call-to-action.
  const isDemo = sourceTimeSec == null
  const effectiveCurrentTime = isDemo ? 30 : sourceTimeSec
  const effectiveSelectedTime = selectedTime ?? effectiveCurrentTime

  // Re-center the window whenever the effective source time changes
  useEffect(() => {
    setWindowStart(Math.max(0, effectiveCurrentTime - WINDOW_S / 2))
  }, [effectiveCurrentTime])

  const windowEnd = windowStart + WINDOW_S
  const pct = (t) => Math.max(0, Math.min(100, ((t - windowStart) / WINDOW_S) * 100))
  const timeAt = (clientX) => {
    const bb = trackRef.current.getBoundingClientRect()
    const pctX = Math.max(0, Math.min(1, (clientX - bb.left) / bb.width))
    return windowStart + pctX * WINDOW_S
  }

  const onDown = (e) => {
    if (isDemo) return
    setDragging(true)
    setSelectedTime(clamp(timeAt(e.clientX), 0))
  }
  const onMove = (e) => {
    if (isDemo) return
    const t = clamp(timeAt(e.clientX), 0)
    setHoverTime(t)
    if (dragging) setSelectedTime(t)
  }
  const onUp    = () => setDragging(false)
  const onLeave = () => { setHoverTime(null); setDragging(false) }

  const shiftWindow = (deltaSec) => setWindowStart(v => Math.max(0, v + deltaSec))
  const nudgeSel    = (deltaSec) => setSelectedTime(v => clamp((v ?? sourceTimeSec) + deltaSec, 0))

  // Time labels along the track (every 10s)
  const marks = []
  for (let t = Math.ceil(windowStart / 10) * 10; t <= windowEnd; t += 10) {
    marks.push(t)
  }

  return (
    <div className={`rounded-xl border p-3 ${isDemo ? 'border-slate-200 bg-slate-50/60' : 'border-brand-100 bg-brand-50/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <SubHead>Source frame</SubHead>
        <span className={`text-[10.5px] tabular-nums ${isDemo ? 'text-slate-400 italic' : 'text-slate-500'}`}>
          {isDemo ? 'demo — no source video linked' : `current: ${formatTime(sourceTimeSec)}`}
        </span>
      </div>

      {/* Timeline strip */}
      <div
        ref={trackRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
        className={`relative h-10 bg-white rounded-md border border-slate-200 select-none overflow-hidden ${isDemo ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* Second ticks */}
        <div className="absolute inset-0 pointer-events-none flex">
          {Array.from({ length: WINDOW_S }).map((_, i) => (
            <div key={i} className="flex-1 border-l border-slate-100 first:border-l-0" />
          ))}
        </div>

        {/* Current frame marker (dashed, purple) */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${pct(effectiveCurrentTime)}%` }}
        >
          <div className="absolute inset-y-1 w-px border-l-2 border-dashed border-purple-500"></div>
        </div>

        {/* Hover marker (live only) */}
        {!isDemo && hoverTime != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-300 pointer-events-none"
            style={{ left: `${pct(hoverTime)}%` }}
          />
        )}

        {/* Selected playhead */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${pct(effectiveSelectedTime)}%` }}
        >
          <div className={`absolute inset-y-0 w-[3px] -translate-x-1/2 rounded ${isDemo ? 'bg-slate-400' : 'bg-brand-500'}`}></div>
          <div className={`absolute top-full -translate-x-1/2 mt-1 whitespace-nowrap text-[10px] font-semibold tabular-nums bg-white px-1.5 py-0.5 rounded shadow-sm ${isDemo ? 'text-slate-500 border border-slate-200' : 'text-brand-700 border border-brand-100'}`}>
            {formatTime(effectiveSelectedTime)}
          </div>
        </div>

        {/* Time labels along the bottom */}
        <div className="absolute bottom-0.5 inset-x-0 pointer-events-none flex text-[9px] text-slate-400 tabular-nums">
          {marks.map(t => (
            <span
              key={t}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(t)}%` }}
            >
              {formatTime(t)}
            </span>
          ))}
        </div>
      </div>

      {/* Fine controls */}
      <div className="mt-6 flex items-center gap-1">
        <NudgeBtn onClick={() => shiftWindow(-WINDOW_S)} label="◀◀" title="Shift window backward" disabled={isDemo} />
        <NudgeBtn onClick={() => nudgeSel(-1)}   label="−1s"   disabled={isDemo} />
        <NudgeBtn onClick={() => nudgeSel(-0.1)} label="−0.1s" disabled={isDemo} />
        <button
          onClick={() => setSelectedTime(effectiveCurrentTime)}
          disabled={isDemo}
          className="flex-1 h-7 rounded-md text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Snap to current frame"
        >
          Reset
        </button>
        <NudgeBtn onClick={() => nudgeSel(+0.1)} label="+0.1s" disabled={isDemo} />
        <NudgeBtn onClick={() => nudgeSel(+1)}   label="+1s"   disabled={isDemo} />
        <NudgeBtn onClick={() => shiftWindow(+WINDOW_S)} label="▶▶" title="Shift window forward" disabled={isDemo} />
      </div>

      {/* Confirm — different affordance in demo mode */}
      {isDemo ? (
        <button
          onClick={onGrab}
          className="mt-2 w-full h-8 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[11.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors"
          title="Link this image to a source video to enable frame-stepping"
        >
          <Play size={11} />
          Link a source video to enable
        </button>
      ) : (
        <button
          onClick={onGrab}
          disabled={selectedTime == null || Math.abs(selectedTime - sourceTimeSec) < 0.05}
          className="mt-2 w-full h-8 rounded-md bg-brand-500 text-white text-[12px] font-semibold hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Play size={11} />
          Grab frame at {formatTime(effectiveSelectedTime)}
        </button>
      )}
    </div>
  )
}

function NudgeBtn({ onClick, label, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="h-7 px-1.5 rounded-md text-[10.5px] font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-700 transition-colors tabular-nums"
    >
      {label}
    </button>
  )
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}
function clamp(v, min) { return v < min ? min : v }

function QuickAction({ icon, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="h-10 px-3 border border-slate-100 rounded-lg bg-white text-[12px] text-left inline-flex items-center gap-2 transition-all shadow-sm hover:shadow text-slate-800 hover:bg-brand-50 hover:border-brand-200"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  )
}

function ActionBtn({ children, tone, icon, onClick }) {
  const styles = {
    danger:  'text-red-600 hover:bg-red-50 border-red-100',
    primary: 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/20',
  }
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 transition-all ${styles[tone] || ''}`}
    >
      {icon}{children}
    </button>
  )
}

function SuggestionThumb({ label, tone, onClick }) {
  const bg = {
    orange: 'from-orange-400 to-orange-600',
    blue:   'from-blue-400 to-blue-600',
    slate:  'from-slate-400 to-slate-600',
    purple: 'from-purple-400 to-purple-600',
    emerald:'from-emerald-400 to-emerald-600',
    pink:   'from-pink-400 to-pink-600',
  }[tone] || 'from-slate-300 to-slate-500'
  return (
    <button
      onClick={onClick}
      className="relative rounded-lg overflow-hidden aspect-[4/3] bg-white border border-slate-100 hover:border-brand-300 hover:-translate-y-0.5 transition-all shadow-sm"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${bg} opacity-30`} />
      <div className="absolute inset-0 flex items-center justify-center">
        <ImageIcon size={22} className="text-white/70" />
      </div>
      <div className="absolute bottom-1 left-1 right-1 text-[9px] text-white bg-slate-900/85 px-1.5 py-0.5 rounded font-medium truncate">
        {label}
      </div>
    </button>
  )
}

function imageSize(src) {
  if (!src) return '—'
  if (src.startsWith('data:')) {
    const bytes = (src.length * 3) / 4
    if (bytes < 1024) return `${Math.round(bytes)} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return 'External'
}

const SUGGESTIONS = [
  { label: 'Profile screen',    tone: 'orange'  },
  { label: 'Contact form',      tone: 'blue'    },
  { label: 'Dashboard',         tone: 'emerald' },
  { label: 'Marketing tab',     tone: 'purple'  },
  { label: 'Approval workflow', tone: 'pink'    },
  { label: 'Reports view',      tone: 'slate'   },
]
