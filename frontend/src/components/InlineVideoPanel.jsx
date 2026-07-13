import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play, Pause, Video, ChevronUp, Sparkles, Scissors, StickyNote, RotateCw,
} from 'lucide-react'
import * as api from '../lib/api'

/**
 * InlineVideoPanel — a compact video + notes panel rendered directly under
 * a linked section heading. The reviewer expands it, watches the segment
 * without leaving the doc, jots timestamped observations, and can drop
 * mark-in / mark-out points that feed straight back into the generator.
 *
 * Props:
 *   sourceKey     — the video-parser folder key ("ariba_part01"). For now
 *                   we map every key to the single uploaded video below;
 *                   swap this when we have per-key uploads.
 *   sourceId      — Azure Blob source_id override (usually derived from
 *                   sourceKey → BLOB_SOURCE_MAP). Optional.
 *   startSec/endSec — the section's segment in the source video (seconds).
 *   sectionTitle  — heading text; used as the notes storage key.
 *   onGenerate    — ({ sourceId, startSec, endSec, notes }) => void
 *                   fires when the reviewer clicks "Generate steps from
 *                   this segment" — same contract as the modal player.
 */

// Which uploaded Blob source to use for a given video-parser folder key.
// Today only ariba.mp4 is uploaded, so both parts share it. Once separate
// files land in Blob under their own IDs, add the mapping here.
const BLOB_SOURCE_MAP = {
  ariba_part01: 'ariba.mp4',
  ariba_part02: 'ariba.mp4',
}

export default function InlineVideoPanel({
  sourceKey,
  sourceId,
  startSec = 0,
  endSec,
  sectionTitle,
  onGenerate,
}) {
  const resolvedSourceId = sourceId || BLOB_SOURCE_MAP[sourceKey] || sourceKey
  const [expanded, setExpanded] = useState(false)
  // With the new streaming proxy, the video URL is stable and known up-
  // front — no round trip needed to fetch a SAS token. The <video> element
  // uses HTTP byte-range against /api/stream/<id>, which the backend
  // forwards to Blob with CDN-friendly cache headers.
  const streamUrl = api.streamProxyUrl(resolvedSourceId)
  const status = expanded ? 'ready' : 'idle'
  const errorMsg = null
  const [playing, setPlaying]   = useState(false)
  const [currentT, setCurrentT] = useState(startSec)
  const [markIn, setMarkIn]     = useState(startSec)
  const [markOut, setMarkOut]   = useState(endSec ?? null)
  const [notes, setNotes]       = useState('')
  const [generating, setGenerating] = useState(false)

  const videoRef = useRef(null)
  const notesRef = useRef(null)

  // Persist notes per section title so they survive reload + collapse.
  const notesKey = `ts-inline-notes:${sectionTitle || sourceKey || 'unknown'}`
  useEffect(() => {
    try { setNotes(localStorage.getItem(notesKey) || '') } catch { /* noop */ }
  }, [notesKey])
  useEffect(() => {
    try { localStorage.setItem(notesKey, notes) } catch { /* noop */ }
  }, [notesKey, notes])

  /* Seek to startSec once the video loads. */
  useEffect(() => {
    if (status !== 'ready' || !videoRef.current) return
    const el = videoRef.current
    const doSeek = () => { try { el.currentTime = startSec } catch { /* noop */ } }
    if (el.readyState >= 1) doSeek()
    else el.addEventListener('loadedmetadata', doSeek, { once: true })
  }, [status, startSec])

  /* Auto-pause at endSec so the reviewer doesn't blow past the segment. */
  useEffect(() => {
    const el = videoRef.current
    if (!el || endSec == null) return
    const onTime = () => {
      setCurrentT(el.currentTime)
      if (playing && el.currentTime >= endSec) {
        el.pause()
        setPlaying(false)
      }
    }
    el.addEventListener('timeupdate', onTime)
    return () => el.removeEventListener('timeupdate', onTime)
  }, [endSec, playing])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) }
    else           { el.pause(); setPlaying(false) }
  }

  const restart = () => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = startSec
    el.play()
    setPlaying(true)
  }

  const setMarkInHere  = () => setMarkIn(Math.floor(currentT * 10) / 10)
  const setMarkOutHere = () => setMarkOut(Math.floor(currentT * 10) / 10)

  const insertTimestamp = () => {
    const stamp = `[${formatTime(currentT).split('.')[0]}] `
    const ta = notesRef.current
    if (!ta) { setNotes(n => n + (n && !n.endsWith('\n') ? '\n' : '') + stamp); return }
    const start = ta.selectionStart, end = ta.selectionEnd
    const before = notes.slice(0, start), after = notes.slice(end)
    const glue = before && !before.endsWith('\n') ? '\n' : ''
    const next = before + glue + stamp + after
    setNotes(next)
    setTimeout(() => {
      ta.focus()
      const pos = (before + glue + stamp).length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  const generateFromHere = async () => {
    if (!onGenerate) return
    setGenerating(true)
    try {
      await onGenerate({
        sourceId:   resolvedSourceId,
        sourceName: sectionTitle,
        startSec:   markIn ?? startSec,
        endSec:     markOut ?? endSec ?? (startSec + 60),
        notes,
        targetContext: sectionTitle,
      })
    } finally {
      setGenerating(false)
    }
  }

  // Collapsed view: a single button — matches the "Source: xxx" microcopy.
  if (!expanded) {
    return (
      <div className="my-2 flex items-center gap-2">
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-brand-50 border border-brand-200 text-brand-700 text-[11px] font-semibold hover:bg-brand-100 transition-colors"
        >
          <Video size={11} /> Watch this segment inline
          <span className="text-brand-400 font-normal">·</span>
          <span className="tabular-nums text-brand-500">
            {formatTime(startSec)}{endSec != null ? `–${formatTime(endSec)}` : ''}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="my-3 rounded-lg border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2 text-[11px]">
        <Video size={12} className="text-brand-500" />
        <b className="text-slate-800">{sourceKey || 'Source video'}</b>
        <span className="text-slate-400">·</span>
        <span className="tabular-nums text-slate-600">
          {formatTime(startSec)}{endSec != null ? ` → ${formatTime(endSec)}` : ''}
        </span>
        <button
          onClick={() => setExpanded(false)}
          title="Collapse"
          className="ml-auto h-6 w-6 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
        >
          <ChevronUp size={12} />
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(240px, 1fr)' }}>
        {/* Player */}
        <div className="p-3 bg-black flex flex-col gap-2">
          {status === 'loading' && (
            <div className="aspect-video rounded-md bg-slate-800 flex items-center justify-center text-slate-400 text-[11.5px]">
              Loading stream…
            </div>
          )}
          {status === 'err' && (
            <div className="aspect-video rounded-md bg-red-900/40 border border-red-500/40 flex items-center justify-center text-red-200 text-[11.5px] px-3 text-center">
              Couldn't load video: {errorMsg}
            </div>
          )}
          {status === 'ready' && streamUrl && (
            <video
              ref={videoRef}
              src={streamUrl}
              preload="metadata"
              controls={false}
              className="w-full rounded-md bg-black aspect-video"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          )}
          {status === 'ready' && (
            <div className="flex items-center gap-1.5">
              <IconBtn onClick={togglePlay} icon={playing ? <Pause size={12} /> : <Play size={12} />} label={playing ? 'Pause' : 'Play'} tone="brand" />
              <IconBtn onClick={restart}    icon={<RotateCw size={12} />} label="Restart segment" />
              <span className="ml-auto text-white/80 text-[10.5px] tabular-nums font-mono">
                {formatTime(currentT)}{endSec != null ? ` / ${formatTime(endSec)}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Notes + segment controls */}
        <div className="p-3 border-l border-slate-100 bg-white flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <ChipBtn onClick={setMarkInHere}  icon={<Scissors size={10} />} label={`Mark in ${formatTime(markIn ?? startSec)}`} />
            <ChipBtn onClick={setMarkOutHere} icon={<Scissors size={10} />} label={`Mark out ${markOut != null ? formatTime(markOut) : '—'}`} />
            <ChipBtn onClick={insertTimestamp} icon={<StickyNote size={10} />} label="Timestamp" />
          </div>

          <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-1.5">
            <StickyNote size={9} /> Notes for this section
          </div>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What should this section cover? Jot bullet points, timestamps, or step ideas — Gemini will use these when you generate."
            className="flex-1 min-h-[92px] text-[12px] leading-snug text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
          />

          <div className="flex items-center gap-1 justify-end">
            <span className="mr-auto text-[10px] text-slate-400 tabular-nums">
              {notes.trim() ? `${notes.trim().split(/\s+/).length} words` : 'no notes yet'}
            </span>
            {onGenerate && (
              <button
                onClick={generateFromHere}
                disabled={generating}
                className="h-7 px-2.5 rounded-md bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
              >
                {generating ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> Generate steps
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────── */

function IconBtn({ onClick, icon, label, tone }) {
  const base = 'h-6 w-6 rounded flex items-center justify-center transition-colors'
  const cls = tone === 'brand'
    ? `${base} bg-brand-500 hover:bg-brand-600 text-white`
    : `${base} bg-white/10 hover:bg-white/25 text-white`
  return (
    <button onClick={onClick} title={label} className={cls}>{icon}</button>
  )
}

function ChipBtn({ onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-semibold tabular-nums transition-colors whitespace-nowrap"
    >
      {icon} {label}
    </button>
  )
}

function formatTime(s) {
  if (s == null || isNaN(s)) return '—'
  const t = Math.max(0, s)
  const m = Math.floor(t / 60)
  const r = t % 60
  const rr = r < 10 ? `0${r.toFixed(1)}` : r.toFixed(1)
  return `${m}:${rr}`
}
