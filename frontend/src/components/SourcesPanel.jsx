import { useEffect, useMemo, useState } from 'react'
import {
  Video, FileText, Image as ImageIcon, Play, Clock, ChevronRight,
  Search, Sparkles, StickyNote,
} from 'lucide-react'

/**
 * SourcesPanel — right-side tabbed panel listing the source artifacts that
 * fed into this SOP. Reviewer picks a video/doc/image to inspect. Selecting
 * a video opens the VideoPlayer (parent-controlled) with a notes column and
 * a "Generate SOP from this segment" button.
 *
 * Streaming strategy (see readme comments at the bottom of the file):
 *   • Videos delivered as .m3u8 HLS URLs from a CDN. hls.js on non-Safari.
 *   • preload="metadata" on inactive rows so we only fetch the header
 *     until the user actually clicks Play.
 *   • Blob-URL fallback for local development is transparent — the
 *     <video src=""> interface is the same.
 */

const TABS = [
  { key: 'video',    label: 'Videos',    icon: <Video    size={12} /> },
  { key: 'document', label: 'Documents', icon: <FileText size={12} /> },
  { key: 'image',    label: 'Images',    icon: <ImageIcon size={12} /> },
]

export default function SourcesPanel({ sources = [], error = '', onOpenVideo, onOpenDocument, onOpenImage, docOutline = [] }) {
  const [tab, setTab] = useState('video')
  const [query, setQuery] = useState('')

  const byKind = useMemo(() => {
    const g = { video: [], document: [], image: [] }
    for (const s of sources) if (g[s.kind]) g[s.kind].push(s)
    return g
  }, [sources])

  const q = query.trim().toLowerCase()
  const list = (byKind[tab] || []).filter(s => !q || s.name.toLowerCase().includes(q))

  return (
    <div className="bg-white border-l border-slate-100 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="px-2 pt-2 flex items-center gap-0.5 border-b border-slate-100">
        {TABS.map(t => {
          const count = (byKind[t.key] || []).length
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 h-8 px-2 rounded-t-md inline-flex items-center justify-center gap-1.5 text-[11.5px] font-semibold transition-colors ${
                active
                  ? 'bg-white text-slate-900 border-b-2 border-brand-500 -mb-px'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              {t.label}
              <span className={`text-[9.5px] tabular-nums rounded-full px-1.5 py-0.5 ${
                active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5">
        <Search size={12} className="text-slate-400 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab}s…`}
          className="flex-1 h-7 outline-none text-[12px] text-slate-900 placeholder:text-slate-400"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="mx-3 my-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-[11.5px] text-red-800 leading-snug">
            <div className="font-semibold mb-0.5">Backend unreachable</div>
            <div className="opacity-80">{error}</div>
            <div className="opacity-70 mt-1">Is the sop-editor backend running on port 8002?</div>
          </div>
        ) : list.length === 0 ? (
          <EmptyState kind={tab} />
        ) : tab === 'video' ? (
          list.map(s => <VideoRow key={s.id} source={s} onOpen={() => onOpenVideo?.(s)} />)
        ) : tab === 'document' ? (
          list.map(s => <DocRow key={s.id} source={s} onOpen={() => onOpenDocument?.(s)} />)
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3">
            {list.map(s => (
              <ImageThumb key={s.id} source={s} onOpen={() => onOpenImage?.(s)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer — quick hint */}
      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400 leading-snug bg-slate-50/50">
        Click a video to scrub, mark a segment, add notes, and generate steps into any section of the SOP.
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Row sub-components
──────────────────────────────────────────────────────── */

function VideoRow({ source, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left group"
    >
      {/* Poster thumbnail (uses posterUrl if present, else gradient placeholder) */}
      <div className="w-20 h-12 rounded-md bg-gradient-to-br from-slate-800 to-slate-700 flex-shrink-0 relative overflow-hidden">
        {source.posterUrl && (
          <img src={source.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <Play size={16} className="absolute inset-0 m-auto text-white drop-shadow" fill="white" />
        {source.duration && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-1 rounded font-mono tabular-nums">
            {formatDuration(source.duration)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-slate-900 truncate">{source.name}</div>
        <div className="text-[10.5px] text-slate-500 truncate mt-0.5">{source.description || '—'}</div>
        {source.tags?.length > 0 && (
          <div className="flex gap-1 mt-1">
            {source.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 tracking-widest uppercase font-semibold">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-500 mt-1 flex-shrink-0 transition-colors" />
    </button>
  )
}

function DocRow({ source, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left group"
    >
      <div className="w-8 h-10 rounded bg-gradient-to-br from-brand-100 to-brand-200 flex-shrink-0 flex items-center justify-center">
        <FileText size={14} className="text-brand-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-slate-900 truncate">{source.name}</div>
        <div className="text-[10.5px] text-slate-500 truncate">{source.description || '—'}</div>
      </div>
      <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
    </button>
  )
}

function ImageThumb({ source, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="relative rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:border-brand-400 hover:-translate-y-0.5 transition-all shadow-sm aspect-video"
    >
      {source.url ? (
        <img src={source.url} alt={source.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-400">
          <ImageIcon size={22} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
        <div className="text-[9px] font-semibold text-white truncate">{source.name}</div>
      </div>
    </button>
  )
}

function EmptyState({ kind }) {
  const map = {
    video: { icon: <Video size={20} />, msg: 'No source videos linked yet.', hint: 'Attach an .mp4 or .m3u8 URL on landing to unlock frame-stepping and segment generation.' },
    document: { icon: <FileText size={20} />, msg: 'No reference documents.', hint: 'Client templates, requirements docs, and past SOPs will show up here.' },
    image: { icon: <ImageIcon size={20} />, msg: 'No source images.', hint: 'Standalone images extracted from source materials appear here.' },
  }
  const info = map[kind] || map.video
  return (
    <div className="p-6 flex flex-col items-center text-center gap-2 text-slate-400">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
        {info.icon}
      </div>
      <div className="text-[12px] font-semibold text-slate-500">{info.msg}</div>
      <div className="text-[10.5px] leading-snug max-w-[220px]">{info.hint}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────── */

function formatDuration(sec) {
  if (!sec) return ''
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

/* ────────────────────────────────────────────────────────
   Streaming notes
──────────────────────────────────────────────────────────
 * Production wiring for the `url` on each video source:
 *
 *   1. Backend: users upload source videos → S3/R2 → run through a
 *      transcoder (MediaConvert, ffmpeg, Cloudflare Stream) → emit HLS
 *      manifests (.m3u8 + .ts segments) at multiple bitrates.
 *
 *   2. Frontend: video sources arrive with `url` pointing to the .m3u8
 *      manifest on the CDN (CloudFront / Cloudflare / Fastly).
 *
 *   3. VideoPlayer detects .m3u8 URLs and attaches hls.js (npm i hls.js).
 *      Safari plays HLS natively — no extra library needed there.
 *
 *   4. Bandwidth: hls.js reads the master manifest, picks the best
 *      variant for the client's available bandwidth, and streams that
 *      variant's segments only. Rewinds/scrubs fetch specific segments
 *      via HTTP range requests — no need to redownload from t=0.
 *
 *   5. All non-playing videos in this panel use preload="metadata" — the
 *      browser fetches only the moov/mvhd atoms (~500 kB for MP4) so the
 *      duration + poster are known without loading the whole file.
 *
 *   6. Optional: <link rel="preconnect" href="https://your-cdn"> in
 *      index.html so the TCP handshake to the CDN happens before the
 *      first <video> tag mounts. Saves ~150 ms on cold clicks.
 */
