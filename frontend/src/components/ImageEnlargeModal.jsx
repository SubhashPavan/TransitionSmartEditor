import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  X, ZoomIn, ZoomOut, Download, Crop, Wand2, Trash2,
  Film, ChevronLeft, ChevronRight, MousePointerClick,
  Search, Sparkles, Check,
} from 'lucide-react'
import ImageCropModal from './ImageCropModal'
import ImageAnnotateModal from './ImageAnnotateModal'
import DeleteImageDialog from './DeleteImageDialog'
import * as api from '../lib/api'

/**
 * ImageEnlargeModal — fullscreen preview + editor + frame browser.
 *
 * Layout (top → bottom):
 *   1. Toolbar: caption + edit actions + zoom + download + close
 *   2. Big image preview
 *   3. FILM STRIP — horizontal thumbnails at nearby timestamps.
 *      Click to jump to that frame. Current frame highlighted.
 *   4. SECTION TIMELINE — frozen strip for the parent section's time
 *      range (e.g. "04:22 → 10:27" for a 6m 5s step), with the current
 *      frame marked. Non-interactive — pure orientation for the reviewer.
 *
 * Both the film strip and section timeline hide gracefully when no
 * source-video timestamp / section range is known (uploaded doc images).
 */
export default function ImageEnlargeModal({
  src, alt, onClose,
  onDelete, onApplySrc,
  sourceTimeSec,          // seconds — where in the video this frame lives
  sourceKey,              // "ariba_part01" — folder under video_parser/outputs
  sectionRange,           // "MM:SS - MM:SS" — the parent section's range
}) {
  const [scale, setScale] = useState(1)
  const [cropOpen, setCropOpen]         = useState(false)
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Currently-shown image src. Starts as the block's src, swaps when the
  // reviewer picks a different frame from the strip.
  const [currentSrc, setCurrentSrc] = useState(src)
  const [currentTime, setCurrentTime] = useState(sourceTimeSec)
  useEffect(() => { setCurrentSrc(src); setCurrentTime(sourceTimeSec) }, [src, sourceTimeSec])

  // Semantic search over the section's frames.
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)   // null | array
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const swapFrame = (frame) => {
    setCurrentSrc(frame.url || frame.src)
    setCurrentTime(frame.time_sec ?? frame.timeSec ?? currentTime)
  }
  const applyAsNewSrc = () => {
    if (currentSrc && currentSrc !== src) onApplySrc?.(currentSrc, 'Frame swap')
    onClose()
  }
  const parsedRange = useMemo(() => parseSectionRange(sectionRange), [sectionRange])

  const runSearch = useCallback(async () => {
    if (!sourceKey || !searchQuery.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const [startSec, endSec] = parsedRange || [null, null]
      const res = await api.searchFramesByDescription({
        sourceKey,
        description: searchQuery.trim(),
        startSec, endSec,
        topK: 6,
      })
      setSearchResults(res.items || [])
    } catch (e) {
      setSearchError(String(e?.message || e))
    } finally {
      setSearching(false)
    }
  }, [sourceKey, searchQuery, parsedRange])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'image.png'
    a.click()
  }

  const handleDelete       = () => setDeleteConfirmOpen(true)
  const confirmDelete      = () => { onDelete?.(); setDeleteConfirmOpen(false); onClose() }
  const cancelDelete       = () => setDeleteConfirmOpen(false)

  const showFrameBrowser = sourceTimeSec != null

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-sm flex flex-col animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Slim caption strip + zoom / close controls in the top-right */}
      <div className="flex items-center gap-2 px-4 py-2.5 text-white flex-shrink-0">
        <div className="text-[12.5px] font-semibold truncate max-w-[360px]">{alt || 'Image preview'}</div>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarBtn onClick={() => setScale(s => Math.max(0.25, +(s - 0.25).toFixed(2)))} icon={<ZoomOut size={13} />} label="Zoom out" iconOnly />
          <span className="text-[11px] tabular-nums w-12 text-center">{Math.round(scale * 100)}%</span>
          <ToolbarBtn onClick={() => setScale(s => Math.min(4, +(s + 0.25).toFixed(2)))} icon={<ZoomIn size={13} />} label="Zoom in" iconOnly />
          <div className="mx-1 h-4 w-px bg-white/20"></div>
          <ToolbarBtn onClick={download} icon={<Download size={13} />} label="Download" iconOnly />
          <ToolbarBtn onClick={onClose}  icon={<X size={14} />}       label="Close (Esc)" iconOnly />
        </div>
      </div>

      {/* Image + floating action bar on top of it.
          Clicks on the empty dark area around the image dismiss the modal.
          The image itself and the floating action bar swallow their own
          clicks (stopPropagation on the bar, and the img is not === currentTarget). */}
      <div
        className="flex-1 overflow-auto p-6 flex items-center justify-center min-h-0 relative"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Floating primary actions — sits over the top-center of the image */}
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-900/85 backdrop-blur border border-white/15 rounded-2xl px-2 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          <BigActionBtn onClick={() => setCropOpen(true)}     icon={<Crop size={18} />}  label="Crop" />
          <BigActionBtn onClick={() => setAnnotateOpen(true)} icon={<Wand2 size={18} />} label="Annotate" />
          {onDelete && (
            <BigActionBtn onClick={handleDelete} icon={<Trash2 size={18} />} label="Delete" tone="danger" />
          )}
        </div>

        <img
          src={currentSrc}
          alt={alt || ''}
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.12s ease' }}
          className="max-w-full max-h-full object-contain shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded"
        />

        {/* "Use this frame" — appears when the reviewer has picked a
            different frame than the one they opened with. */}
        {currentSrc && currentSrc !== src && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={applyAsNewSrc}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold shadow-[0_10px_30px_rgba(16,185,129,0.4)] transition-colors"
            >
              <Check size={14} /> Use this frame in the SOP
            </button>
          </div>
        )}
      </div>

      {/* Bottom panel — semantic search + film strip + section timeline. */}
      {showFrameBrowser && (
        <div className="flex-shrink-0 bg-slate-900/95 border-t border-white/10 backdrop-blur">
          <DescriptionSearchBar
            sourceKey={sourceKey}
            value={searchQuery}
            onChange={setSearchQuery}
            onRun={runSearch}
            searching={searching}
            error={searchError}
            resultsCount={searchResults?.length}
          />
          {searchResults != null && searchResults.length > 0 && (
            <FrameResultRow
              title="Best matches"
              icon={<Sparkles size={11} className="text-brand-300" />}
              frames={searchResults}
              currentTime={currentTime}
              onPick={swapFrame}
            />
          )}
          <RealFilmStrip
            sourceKey={sourceKey}
            currentTime={currentTime}
            onPick={swapFrame}
          />
          <SectionTimeline
            sectionRange={sectionRange}
            currentTime={currentTime}
          />
        </div>
      )}

      {/* Delete confirmation — in-app dialog, no browser confirm() */}
      {deleteConfirmOpen && (
        <DeleteImageDialog
          src={src}
          alt={alt}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}

      {/* Nested modals */}
      {cropOpen && (
        <ImageCropModal
          src={src}
          onCancel={() => setCropOpen(false)}
          onApply={(newSrc) => { onApplySrc?.(newSrc, 'Cropped'); setCropOpen(false) }}
        />
      )}
      {annotateOpen && (
        <ImageAnnotateModal
          src={src}
          onCancel={() => setAnnotateOpen(false)}
          onApply={(newSrc) => { onApplySrc?.(newSrc, 'Annotated'); setAnnotateOpen(false) }}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Real film strip — actual JPEG thumbnails from the backend.
   Fetches the 12 frames closest to `currentTime` and swaps
   the main preview when the reviewer clicks one.
──────────────────────────────────────────────────────── */
function RealFilmStrip({ sourceKey, currentTime, onPick }) {
  const [frames, setFrames] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!sourceKey || currentTime == null) { setFrames([]); setStatus('nokey'); return }
    let cancelled = false
    setStatus('loading')
    api.listFramesNear({ sourceKey, nearSec: currentTime, n: 12 })
      .then(res => { if (!cancelled) { setFrames(res.items || []); setStatus('ready') } })
      .catch(e => { if (!cancelled) setStatus(`err:${e?.message || e}`) })
    return () => { cancelled = true }
  }, [sourceKey, currentTime])

  if (status === 'nokey') return null   // no source key → can't fetch

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center gap-2 text-white/70 text-[9.5px] tracking-widest uppercase font-bold mb-2">
        <Film size={11} />
        Nearby frames
        <span className="text-white/40 normal-case tracking-normal font-normal ml-2">
          click a thumb to swap it in
        </span>
      </div>
      {status === 'loading' && (
        <div className="text-[11px] text-white/40 py-3">Loading frames…</div>
      )}
      {status.startsWith('err:') && (
        <div className="text-[11px] text-red-300 py-3">Couldn't load frames: {status.slice(4)}</div>
      )}
      {status === 'ready' && frames.length === 0 && (
        <div className="text-[11px] text-white/40 py-3">No pre-extracted frames for this source.</div>
      )}
      {status === 'ready' && frames.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
          {frames.map((f) => {
            const isCurrent = Math.abs(f.time_sec - currentTime) < 0.1
            return (
              <FrameThumb
                key={f.name}
                frame={f}
                isCurrent={isCurrent}
                onPick={() => !isCurrent && onPick(f)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Single thumbnail button — used by the nearby-frames strip AND the
 * semantic-search results row. Renders the JPEG served from
 * /api/frames/<source>/<name> with a time badge.
 */
function FrameThumb({ frame, isCurrent, onPick }) {
  return (
    <button
      onClick={onPick}
      disabled={isCurrent}
      className={`flex-shrink-0 relative rounded-md overflow-hidden border-2 transition-all group bg-slate-800 ${
        isCurrent
          ? 'border-brand-500 shadow-[0_0_0_2px_rgba(37,99,235,0.35)] cursor-default'
          : 'border-white/10 hover:border-white/60 hover:-translate-y-0.5'
      }`}
      style={{ width: 128, aspectRatio: '16 / 9' }}
    >
      <img
        src={frame.url}
        alt={frame.name}
        loading="lazy"
        className="w-full h-full object-cover"
      />
      <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded font-mono text-[10px] tabular-nums ${
        isCurrent ? 'bg-brand-500 text-white' : 'bg-black/80 text-white/95'
      }`}>
        {formatTime(frame.time_sec)}
      </div>
      {isCurrent && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-[8.5px] font-bold tracking-widest uppercase">
          Current
        </div>
      )}
    </button>
  )
}

/**
 * FrameResultRow — a horizontal strip used for search results, styled
 * with a distinct header + tint so it's clearly separated from the
 * "nearby frames" strip below.
 */
function FrameResultRow({ title, icon, frames, currentTime, onPick }) {
  return (
    <div className="px-4 pt-3 pb-2 bg-brand-950/40 border-b border-white/5">
      <div className="flex items-center gap-2 text-brand-200 text-[9.5px] tracking-widest uppercase font-bold mb-2">
        {icon}
        {title}
        <span className="text-brand-200/40 normal-case tracking-normal font-normal ml-2">
          ranked by Gemini
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
        {frames.map((f, i) => {
          const isCurrent = currentTime != null && Math.abs(f.time_sec - currentTime) < 0.1
          return (
            <div key={f.name} className="relative flex-shrink-0">
              <FrameThumb frame={f} isCurrent={isCurrent} onPick={() => onPick(f)} />
              {/* Rank badge in top-left */}
              <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                {i + 1}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * DescriptionSearchBar — free-text input; when submitted, calls
 * /api/frames/search which uses Gemini vision to pick the frames
 * that best match the description. The results render as a top
 * row above the "nearby frames" strip.
 */
function DescriptionSearchBar({ sourceKey, value, onChange, onRun, searching, error, resultsCount }) {
  if (!sourceKey) return null
  return (
    <div className="px-4 pt-3 pb-2 border-b border-white/5">
      <div className="flex items-center gap-2 text-white/70 text-[9.5px] tracking-widest uppercase font-bold mb-2">
        <Search size={11} />
        Find a better frame
        <span className="text-white/40 normal-case tracking-normal font-normal ml-2">
          describe what should be on-screen, Gemini finds the best frames in this section
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !searching) onRun() }}
          placeholder='e.g. "the Certifications tab is visible with a filled row"'
          className="flex-1 h-9 rounded-md bg-white/5 border border-white/10 text-white text-[12.5px] px-3 outline-none placeholder:text-white/30 focus:border-brand-500 focus:bg-white/10"
          disabled={searching}
        />
        <button
          onClick={onRun}
          disabled={searching || !value.trim()}
          className="h-9 px-4 rounded-md bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          {searching ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Sparkles size={12} /> Find
            </>
          )}
        </button>
      </div>
      {error && <div className="mt-2 text-[11px] text-red-300">{error}</div>}
      {resultsCount === 0 && !searching && !error && (
        <div className="mt-2 text-[11px] text-white/40">No matches in this section.</div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Section timeline — frozen strip for the parent step / section
──────────────────────────────────────────────────────── */
function SectionTimeline({ sectionRange, currentTime }) {
  const parsed = useMemo(() => parseSectionRange(sectionRange), [sectionRange])
  if (!parsed) return null

  const [start, end] = parsed
  const duration = end - start
  const clamped  = Math.max(start, Math.min(end, currentTime))
  const pct      = ((clamped - start) / duration) * 100

  // 5 evenly-spaced tick labels along the strip
  const ticks = 5
  const tickTimes = Array.from({ length: ticks }, (_, i) => start + (duration * i) / (ticks - 1))

  return (
    <div className="px-4 pb-4 pt-2 border-t border-white/5">
      <div className="flex items-center gap-2 text-white/70 text-[9.5px] tracking-widest uppercase font-bold mb-2">
        <ChevronLeft size={10} />
        Section timeline
        <ChevronRight size={10} />
        <span className="text-white/40 normal-case tracking-normal font-normal ml-2 tabular-nums">
          {formatTime(start)} → {formatTime(end)} · {formatDuration(duration)}
        </span>
      </div>

      <div className="relative h-2 bg-white/10 rounded-full">
        {/* Filled portion up to current */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-600 to-brand-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
        {/* Current-frame marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full ring-2 ring-brand-500 shadow-[0_2px_8px_rgba(37,99,235,0.6)]"
          style={{ left: `${pct}%`, marginLeft: -7 }}
        />
        {/* Live time label under the marker */}
        <div
          className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${pct}%` }}
        >
          <span className="text-[10px] font-semibold text-white bg-brand-500 px-1.5 py-0.5 rounded tabular-nums">
            {formatTime(currentTime)}
          </span>
        </div>
      </div>

      {/* Tick labels along the bottom */}
      <div className="relative mt-5 h-3 text-[9px] text-white/50 tabular-nums">
        {tickTimes.map((t, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2"
            style={{ left: `${((t - start) / duration) * 100}%` }}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────── */
function ToolbarBtn({ onClick, icon, label, iconOnly, tone }) {
  const bg = tone === 'danger'
    ? 'bg-red-500/20 hover:bg-red-500/40 text-red-200 hover:text-red-100'
    : 'bg-white/10 hover:bg-white/20 text-white'
  return (
    <button
      onClick={onClick}
      title={label}
      className={`h-8 ${iconOnly ? 'w-8 justify-center' : 'px-2.5 gap-1'} rounded-md ${bg} flex items-center transition-colors text-[11.5px] font-semibold`}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </button>
  )
}

/**
 * BigActionBtn — the prominent floating buttons that sit over the top
 * of the image. Icon-forward, larger tap area, keeps the modal feeling
 * like a real editor rather than a preview.
 */
function BigActionBtn({ onClick, icon, label, tone }) {
  const bg = tone === 'danger'
    ? 'bg-red-500/25 hover:bg-red-500/50 text-red-100 border-red-400/40'
    : 'bg-white/10 hover:bg-white/25 text-white border-white/20'
  return (
    <button
      onClick={onClick}
      title={label}
      className={`h-11 px-4 rounded-xl border ${bg} inline-flex items-center gap-2 text-[13px] font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/** Parse "04:22 - 10:27" → [262, 627] (seconds). Handles various dashes. */
function parseSectionRange(range) {
  if (!range) return null
  const norm = range.replace(/[–—−]/g, '-')
  const parts = norm.split('-').map(s => s.trim())
  if (parts.length !== 2) return null
  const toSec = (mmss) => {
    const bits = mmss.split(':').map(Number)
    if (bits.length === 2) return bits[0] * 60 + bits[1]
    if (bits.length === 3) return bits[0] * 3600 + bits[1] * 60 + bits[2]
    return NaN
  }
  const a = toSec(parts[0])
  const b = toSec(parts[1])
  if (isNaN(a) || isNaN(b) || b <= a) return null
  return [a, b]
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '—'
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`
}

function formatDuration(sec) {
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}
