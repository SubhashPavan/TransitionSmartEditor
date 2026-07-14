import { useEffect, useRef, useState, useCallback } from 'react'
import {
  X, Play, Pause, SkipBack, SkipForward, StickyNote,
  Sparkles, Volume2, VolumeX, Volume1, Maximize2, Info, ListChecks,
  Clock, ChevronRight, Camera, Trash2, Keyboard, Settings, Gauge,
} from 'lucide-react'

/**
 * VideoPlayer — modal video player with a scrubber, mark-in / mark-out
 * (segment selection), a notes column, and a "Generate SOP from this
 * segment" button.
 *
 * Streaming:
 *   • Accepts direct URLs (blob:, https:, and .m3u8 HLS manifests).
 *   • For .m3u8 URLs, lazy-loads hls.js and attaches it. Safari uses
 *     native HLS so no hls.js there.
 *   • preload="auto" only while this player is mounted; the SourcesPanel
 *     uses preload="metadata" for inactive rows.
 *
 * Props:
 *   source      — { id, name, url, description }
 *   startTime   — optional seek to this second on open
 *   onClose     — dismiss the player
 *   onGenerate  — ({ source, startSec, endSec, notes }) => void
 *                 fires when the reviewer hits "Generate SOP from segment"
 */
export default function VideoPlayer({
  source, startTime, openFullscreen, onClose,
  // Sections available to receive generated steps — [{id, text}]. Provided
  // by Editor from its LeftRail outline scan.
  availableSections,
  // (sourceId, sourceKey, sectionTitle, moments) → Promise — Editor
  // POSTs to /api/generate-from-moments and inserts the returned steps
  // under the matching heading in the doc.
  onGenerate,
}) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const notesRef = useRef(null)
  const modalRef = useRef(null)   // outer container — this is what we fullscreen
                                  // so the moments sidebar stays visible

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted]     = useState(false)
  const [time, setTime]       = useState(0)
  const [duration, setDuration] = useState(0)
  const [notes, setNotes]     = useState('')
  const [hoverTime, setHoverTime] = useState(null)
  const [scrubbing, setScrubbing] = useState(false)
  // Snapshot-and-note moments — each `S` press captures the current frame
  // as a data URL + timestamp; the reviewer can add a note per moment.
  // The whole batch gets sent to Gemini when they click "Generate SOP".
  const [moments, setMoments] = useState([])   // [{ id, time_sec, dataUrl, note }]
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [targetSection, setTargetSection] = useState('')
  const [generating, setGenerating]       = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [playbackRate, setPlaybackRate]   = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [volume, setVolume]               = useState(1)         // 0..1
  const [volSliderOpen, setVolSliderOpen] = useState(false)
  const momentsScrollRef = useRef(null)
  const hideControlsTimer = useRef(null)
  const volHideTimer = useRef(null)

  // Auto-hide controls after 2.5 s of mouse idle while playing.
  const bumpControls = useCallback(() => {
    setControlsVisible(true)
    clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false)
    }, 2500)
  }, [])
  useEffect(() => {
    if (!playing) setControlsVisible(true)   // always show when paused
  }, [playing])
  // Auto-open the sidebar whenever the reviewer captures their first moment.
  useEffect(() => {
    if (moments.length > 0) setSidebarOpen(true)
  }, [moments.length])

  /** Insert `[MM:SS] ` at the notes cursor (or append). Great for jotting
   *  moment-by-moment observations without hand-typing timestamps. */
  const insertTimestampInNotes = () => {
    const stamp = `[${formatTime(time).split('.')[0]}] `
    const ta = notesRef.current
    if (!ta) { setNotes(n => `${n}${n && !n.endsWith('\n') ? '\n' : ''}${stamp}`); return }
    const start = ta.selectionStart, end = ta.selectionEnd
    const before = notes.slice(0, start)
    const after  = notes.slice(end)
    const glue = before && !before.endsWith('\n') ? '\n' : ''
    const next = `${before}${glue}${stamp}${after}`
    setNotes(next)
    setTimeout(() => {
      ta.focus()
      const pos = (before + glue + stamp).length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  /**
   * Capture the currently-visible frame as a JPEG data URL, pause playback,
   * and drop a new moment card into the sidebar. The reviewer can type a
   * note per card (what to say about this frame). Later "Generate SOP"
   * sends the whole batch to Gemini alongside the transcript context.
   */
  const captureSnapshot = useCallback(() => {
    const video = videoRef.current
    // Always open the sidebar so the reviewer sees SOMETHING happen even if
    // the frame capture fails (video not loaded, cross-origin taint, etc.).
    setSidebarOpen(true)
    if (!video) return
    // Pause so the reviewer's next action doesn't slip past the moment.
    try { video.pause() } catch { /* noop */ }
    let dataUrl = ''
    try {
      const w = video.videoWidth  || 1280
      const h = video.videoHeight || 720
      const canvas = document.createElement('canvas')
      // Cap thumbnail width at 720 to keep data-URL size reasonable when we
      // eventually POST it to /api/generate-from-moments.
      const scale = Math.min(1, 720 / w)
      canvas.width  = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      dataUrl = canvas.toDataURL('image/jpeg', 0.72)
    } catch (err) {
      // Cross-origin video without CORS headers taints the canvas — capture
      // fails but we still create the moment so the reviewer can jot a note.
      console.warn('Snapshot capture failed (adding note-only moment):', err)
    }
    const m = {
      id:       (crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      time_sec: video.currentTime || 0,
      dataUrl,
      note:     '',
    }
    setMoments(prev => [...prev, m])
    // Scroll the moments strip so the new card is visible.
    setTimeout(() => {
      const el = momentsScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 30)
  }, [])

  const updateMomentNote = (id, note) =>
    setMoments(prev => prev.map(m => m.id === id ? { ...m, note } : m))
  const removeMoment = (id) => setMoments(prev => prev.filter(m => m.id !== id))
  const jumpToMoment = (m) => {
    const video = videoRef.current
    if (!video) return
    try { video.currentTime = m.time_sec } catch { /* noop */ }
  }

  /**
   * Send the captured moments to the parent's onGenerate handler, which
   * hits /api/generate-from-moments and inserts the returned steps into
   * the chosen doc section.
   */
  const handleGenerate = async () => {
    if (!targetSection || moments.length === 0 || !onGenerate) return
    setGenerating(true); setGenerateError(null)
    try {
      await onGenerate({
        source,
        sectionTitle: targetSection,
        moments: moments.map(m => ({
          time_sec: m.time_sec,
          note:     m.note,
          dataUrl:  m.dataUrl,
        })),
      })
      // On success, dismiss the player so the reviewer sees the freshly-inserted
      // steps in the doc without the video overlay blocking the view.
      onClose?.()
    } catch (e) {
      setGenerateError(String(e?.message || e))
    } finally {
      setGenerating(false)
    }
  }

  /** Notes analysis — used to show the reviewer whether their notes will
   *  produce useful steps. Counts explicit step markers, timestamps, and words. */
  const notesInsight = (() => {
    const stepLines  = (notes.match(/^\s*(?:step\s*)?\d+[.)]/gim) || []).length
    const bulletLines = (notes.match(/^\s*[-*•]/gm) || []).length
    const stampCount = (notes.match(/\[\d{1,2}:\d{2}\]/g) || []).length
    const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
    return { stepLines, bulletLines, stampCount, words, hasStructure: stepLines + bulletLines > 0 }
  })()

  /* ─── HLS handling ─── */
  useEffect(() => {
    let hls
    const el = videoRef.current
    if (!el || !source?.url) return

    const isHls = /\.m3u8($|\?)/i.test(source.url)
    if (isHls && !el.canPlayType('application/vnd.apple.mpegurl')) {
      // Lazy-load hls.js only if it's installed. To enable adaptive HLS
      // streaming in Chrome/Firefox: `npm i hls.js` in the frontend dir,
      // then this dynamic import will resolve. Until then, non-Safari
      // browsers get raw src fallback (works fine for CDN-hosted MP4s).
      loadHlsIfAvailable().then((Hls) => {
        if (!Hls || !Hls.isSupported()) { el.src = source.url; return }
        hls = new Hls({ enableWorker: true, lowLatencyMode: false })
        hls.loadSource(source.url)
        hls.attachMedia(el)
      })
    } else {
      el.src = source.url
    }
    return () => { hls?.destroy?.() }
  }, [source?.url])

  /* ─── Player events ─── */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTime = () => setTime(el.currentTime)
    const onMeta = () => {
      setDuration(el.duration || 0)
      // Seek when startTime is defined — including 0 (the previous `&&`
      // short-circuit skipped that case). Then auto-play: this is the "I
      // clicked a segment button, take me straight there" YouTube feel.
      if (startTime != null && !isNaN(startTime)) {
        el.currentTime = startTime
        setTime(startTime)
      }
      // Autoplay — the user opened the player deliberately from a click.
      // Browsers require the play() call to come from a click gesture,
      // and this mount IS under that click. If the browser still rejects
      // (autoplay policy), start muted and retry.
      const tryPlay = () => el.play?.().catch(() => {
        try { el.muted = true; setMuted(true); el.play?.() } catch { /* noop */ }
      })
      tryPlay()
    }
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate',      onTime)
    el.addEventListener('loadedmetadata',  onMeta)
    el.addEventListener('play',            onPlay)
    el.addEventListener('pause',           onPause)
    // If metadata was already loaded before we attached (rare but possible
    // with cached streams), fire the handler synchronously.
    if (el.readyState >= 1) onMeta()
    return () => {
      el.removeEventListener('timeupdate',     onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('play',           onPlay)
      el.removeEventListener('pause',          onPause)
    }
  }, [startTime])

  /**
   * Hard cleanup on unmount — Chrome can leave a decoded audio buffer
   * playing for a second or two after a <video> element is removed
   * from the DOM. Pausing and clearing the src explicitly stops that
   * so we never hear phantom audio after Esc / clicking Close.
   */
  useEffect(() => {
    return () => {
      const el = videoRef.current
      if (!el) return
      try {
        el.pause()
        // Detach the media pipeline. Setting src='' then calling load()
        // is the browser-vetted way to release the decoder + audio
        // graph immediately.
        el.removeAttribute('src')
        el.load()
      } catch { /* noop */ }
    }
  }, [])

  /* ─── Keyboard shortcuts — YouTube-style + S for snapshot ───
   *   Space / K → play/pause
   *   ← / →     → seek 5s
   *   J / L     → seek 10s
   *   0-9       → jump to N/10 of the video (YouTube convention)
   *   M         → mute toggle
   *   F         → fullscreen
   *   S         → snapshot the current frame + open a moment card
   *   I / O     → mark in / mark out (segment boundaries)
   *   ?         → show shortcut cheatsheet
   *   Esc       → close
   * Ignored when typing in inputs/textareas.
   */
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return
      const k = e.key
      if (k === 'Escape') { e.preventDefault(); onClose() }
      else if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); togglePlay() }
      else if (k === 'ArrowLeft')  { e.preventDefault(); seek(-5) }
      else if (k === 'ArrowRight') { e.preventDefault(); seek(+5) }
      else if (k === 'j' || k === 'J') { e.preventDefault(); seek(-10) }
      else if (k === 'l' || k === 'L') { e.preventDefault(); seek(+10) }
      else if (k === 'm' || k === 'M') { e.preventDefault(); toggleMute() }
      else if (k === 'f' || k === 'F') { e.preventDefault(); fullscreen() }
      else if (k === 's' || k === 'S') { e.preventDefault(); captureSnapshot() }
      else if (k === '?' || (k === '/' && e.shiftKey)) {
        e.preventDefault(); setShowShortcuts(s => !s)
      }
      else if (/^[0-9]$/.test(k) && duration > 0) {
        e.preventDefault()
        seekTo((parseInt(k, 10) / 10) * duration)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, duration, captureSnapshot])

  /* ─── Handlers ─── */
  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) el.play(); else el.pause()
  }
  const seek = (delta) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(duration || 0, el.currentTime + delta))
  }
  const seekTo = (t) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(duration || 0, t))
  }
  const toggleMute = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }
  const setPlaybackRateSafely = (rate) => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = rate
    setPlaybackRate(rate)
    setShowSpeedMenu(false)
  }
  const applyVolume = (v) => {
    const el = videoRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(1, v))
    el.volume = clamped
    // Any nonzero drag also unmutes — otherwise the reviewer can't tell
    // why it's silent even after cranking the slider.
    if (clamped > 0 && el.muted) { el.muted = false; setMuted(false) }
    if (clamped === 0 && !el.muted) { el.muted = true; setMuted(true) }
    setVolume(clamped)
  }
  const openVolSlider = () => {
    clearTimeout(volHideTimer.current)
    setVolSliderOpen(true)
  }
  const closeVolSlider = () => {
    clearTimeout(volHideTimer.current)
    volHideTimer.current = setTimeout(() => setVolSliderOpen(false), 400)
  }
  // Fullscreen the WHOLE modal (video + sidebar), not just the <video>.
  // Fullscreening just the video hides the moments sidebar behind it, so
  // pressing S captured the frame but the reviewer couldn't see the panel.
  const fullscreen = () => {
    const el = modalRef.current || videoRef.current
    if (!el) return
    if (document.fullscreenElement) {
      try { document.exitFullscreen?.() } catch { /* noop */ }
    } else {
      try { el.requestFullscreen?.() } catch { /* denied */ }
    }
  }

  // Auto-enter fullscreen when the parent asks us to (outline play button).
  // The browser only grants the request if it happens under a user gesture,
  // and this component mounts on that same click.
  useEffect(() => {
    if (!openFullscreen) return
    const modal = modalRef.current
    const vid   = videoRef.current
    if (!modal || !vid) return
    const go = () => { try { modal.requestFullscreen?.() } catch { /* denied */ } }
    if (vid.readyState >= 1) go()
    else vid.addEventListener('loadedmetadata', go, { once: true })
  }, [openFullscreen])

  const timeAt = (clientX) => {
    const bb = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - bb.left) / bb.width)) * duration
  }
  const onTrackDown = (e) => { setScrubbing(true); seekTo(timeAt(e.clientX)) }
  const onTrackMove = (e) => {
    setHoverTime(timeAt(e.clientX))
    if (scrubbing) seekTo(timeAt(e.clientX))
  }
  const onTrackUp   = () => setScrubbing(false)


  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[92] bg-black flex animate-fade-in"
      onMouseMove={bumpControls}
    >
      {/* ═══════ Video stage ═══════
          `flex-1 min-w-0` always — the sidebar (when mounted) claims 380 px
          on its own and this container shrinks to fill the rest. Clicking
          the video toggles play like YouTube. */}
      <div
        className="relative bg-black flex-1 min-w-0"
        onDoubleClick={fullscreen}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          controls={false}
          preload="auto"
          onClick={togglePlay}
        />

        {/* Big center play/pause chip — YouTube shows a large one when paused */}
        {!playing && (
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-black/60 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur transition-all animate-fade-in"
            title="Play (Space)"
          >
            <Play size={36} fill="currentColor" className="ml-1.5" />
          </button>
        )}

        {/* ═══ Top overlay — title + close + right-side icons ═══ */}
        <div
          className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 via-black/40 to-transparent px-5 pt-4 pb-8 flex items-center gap-2 pointer-events-none transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex-1 min-w-0 pointer-events-auto">
            <div className="text-[14px] font-semibold text-white truncate">{source?.name || 'Video'}</div>
            {source?.description && <div className="text-[11.5px] text-white/70 truncate">{source.description}</div>}
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <OverlayBtn onClick={() => setShowShortcuts(s => !s)} icon={<Keyboard size={16} />} title="Keyboard shortcuts (?)" active={showShortcuts} />
            <OverlayBtn onClick={() => setSidebarOpen(v => !v)} icon={<Camera size={16} />} title="Moments panel" active={sidebarOpen} badge={moments.length || null} />
            <OverlayBtn onClick={fullscreen} icon={<Maximize2 size={16} />} title="Fullscreen (F)" />
            <OverlayBtn onClick={onClose} icon={<X size={18} />} title="Close (Esc)" />
          </div>
        </div>

        {/* ═══ Bottom overlay — scrubber + transport ═══ */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent pt-10 pb-3 px-5 pointer-events-none transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Scrubber — thin like YouTube, expands on hover */}
          <div
            ref={trackRef}
            onMouseDown={onTrackDown}
            onMouseMove={onTrackMove}
            onMouseUp={onTrackUp}
            onMouseLeave={() => { setHoverTime(null); setScrubbing(false) }}
            className="relative h-1 hover:h-1.5 transition-all bg-white/25 rounded-full cursor-pointer group/track pointer-events-auto"
          >
            <div className="absolute inset-y-0 left-0 bg-brand-500 rounded-full" style={{ width: `${pctOf(time, duration)}%` }} />
            {/* Little brand-blue tick per captured moment — YouTube's chapter markers */}
            {moments.map(m => (
              <div key={m.id} className="absolute -top-1 -bottom-1 w-1 bg-white/95 rounded-full" style={{ left: `calc(${pctOf(m.time_sec, duration)}% - 2px)` }} />
            ))}
            {/* Playhead — becomes visible on hover, always on when scrubbing */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-brand-500 shadow ring-2 ring-white transition-opacity ${
                scrubbing ? 'opacity-100' : 'opacity-0 group-hover/track:opacity-100'
              }`}
              style={{ left: `calc(${pctOf(time, duration)}% - 7px)` }}
            />
            {hoverTime != null && (
              <div
                className="absolute -top-7 -translate-x-1/2 text-[10.5px] text-white bg-black/85 px-1.5 py-0.5 rounded font-mono tabular-nums pointer-events-none"
                style={{ left: `${pctOf(hoverTime, duration)}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Transport row */}
          <div className="mt-2 flex items-center gap-1 text-white pointer-events-auto">
            <OverlayIconBtn onClick={togglePlay} icon={playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />} title="Play / Pause (Space)" />
            <OverlayIconBtn onClick={() => seek(-10)} icon={<SkipBack size={16} />} title="Back 10s (J)" />
            <OverlayIconBtn onClick={() => seek(+10)} icon={<SkipForward size={16} />} title="Forward 10s (L)" />
            {/* Mute button + horizontal volume slider (YouTube pattern:
                slider appears next to the mute button on hover, stays
                interactive while dragging). */}
            <div
              className="relative flex items-center"
              onMouseEnter={openVolSlider}
              onMouseLeave={closeVolSlider}
            >
              <OverlayIconBtn
                onClick={toggleMute}
                icon={muted || volume === 0
                  ? <VolumeX size={17} />
                  : (volume < 0.5 ? <Volume1 size={17} /> : <Volume2 size={17} />)}
                title={muted ? 'Unmute (M)' : 'Mute (M)'}
              />
              <div
                className={`overflow-hidden transition-[width] duration-150 ease-out ${volSliderOpen ? 'w-24 pl-1' : 'w-0'}`}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => applyVolume(parseFloat(e.target.value))}
                  className="w-full h-1 accent-brand-500 bg-white/25 rounded-full cursor-pointer"
                />
              </div>
            </div>
            <span className="mx-2 text-[12.5px] font-mono tabular-nums">
              <span className="font-semibold">{formatTime(time).split('.')[0]}</span>
              <span className="text-white/50"> / {formatTime(duration).split('.')[0]}</span>
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={captureSnapshot}
                className="h-8 px-3 rounded-md text-[12px] font-semibold bg-brand-500 hover:bg-brand-600 text-white inline-flex items-center gap-1.5 shadow transition-colors"
                title="Snapshot the current frame (S)"
              >
                <Camera size={13} />
                Snapshot
                <kbd className="ml-0.5 px-1 py-[1px] rounded bg-white/25 text-white text-[10px] font-mono">S</kbd>
              </button>
              {/* Playback speed — YouTube's settings gear collapsed to a
                  single popover with the standard 6 speeds. */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(v => !v)}
                  title="Playback speed"
                  className={`h-9 min-w-[44px] px-2 rounded-md text-[11.5px] font-semibold tabular-nums inline-flex items-center gap-1 transition-colors ${
                    showSpeedMenu || playbackRate !== 1
                      ? 'bg-white/25 text-white'
                      : 'text-white hover:bg-white/15'
                  }`}
                >
                  <Gauge size={13} />
                  {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                </button>
                {showSpeedMenu && (
                  <div
                    className="absolute bottom-full right-0 mb-2 min-w-[130px] bg-slate-900/95 backdrop-blur border border-white/15 rounded-lg shadow-xl overflow-hidden animate-fade-in"
                    onMouseLeave={() => setShowSpeedMenu(false)}
                  >
                    <div className="px-3 py-2 border-b border-white/10 text-[10.5px] font-bold uppercase tracking-widest text-white/50">
                      Playback speed
                    </div>
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                      <button
                        key={r}
                        onClick={() => setPlaybackRateSafely(r)}
                        className={`w-full px-3 py-1.5 text-left text-[12px] tabular-nums inline-flex items-center gap-2 transition-colors ${
                          playbackRate === r
                            ? 'bg-brand-500/25 text-white'
                            : 'text-white/85 hover:bg-white/10'
                        }`}
                      >
                        <span className="w-4">
                          {playbackRate === r ? '•' : ' '}
                        </span>
                        {r === 1 ? 'Normal (1×)' : `${r}×`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <OverlayIconBtn onClick={fullscreen} icon={<Maximize2 size={17} />} title="Fullscreen (F)" />
            </div>
          </div>

        </div>
      </div>

      {/* ═══════ Slide-in sidebar — Moments + Notes ═══════
          Only takes space when `sidebarOpen`. Toggle via the Camera icon
          in the top overlay OR is auto-opened on first snapshot capture. */}
      {sidebarOpen && (
        <div className="w-[380px] flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden animate-slide-in-right">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-slate-100 bg-white flex-shrink-0">
            <Camera size={14} className="text-brand-600" />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900">Moments</div>
              <div className="text-[10.5px] text-slate-500">
                Press <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9.5px] font-mono">S</kbd> to grab a frame + jot a note.
              </div>
            </div>
            {moments.length > 0 && (
              <span className="text-[10.5px] font-semibold text-brand-700 bg-brand-100 rounded-full px-2 py-0.5 tabular-nums">
                {moments.length}
              </span>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              title="Hide panel"
              className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div
            ref={momentsScrollRef}
            className="flex-shrink-0 max-h-[40%] overflow-y-auto px-3 py-2 space-y-2 border-b border-slate-100"
          >
            {moments.length === 0 ? (
              <div className="text-center py-6 text-[11.5px] text-slate-400 italic leading-snug">
                No moments yet. Hit <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9.5px] font-mono">S</kbd> while watching.
              </div>
            ) : (
              moments.map((m, i) => (
                <MomentCard
                  key={m.id}
                  m={m}
                  index={i + 1}
                  onJump={() => jumpToMoment(m)}
                  onNote={(note) => updateMomentNote(m.id, note)}
                  onRemove={() => removeMoment(m.id)}
                />
              ))
            )}
          </div>

          {/* Generate SOP steps — spacer + picker + button pinned to bottom */}
          <div className="mt-auto flex-shrink-0 p-3 border-t border-slate-100 bg-slate-50/60 space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              Insert into section
            </label>
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Pick a section —</option>
              {(availableSections || []).map(s => (
                <option key={s.id} value={s.text}>
                  {s.text.length > 60 ? s.text.slice(0, 57) + '…' : s.text}
                </option>
              ))}
            </select>
            {generateError && (
              <div className="px-2 py-1.5 rounded bg-red-50 border border-red-200 text-[11px] text-red-800">
                {generateError}
              </div>
            )}
            <button
              disabled={!targetSection || moments.length === 0 || generating}
              onClick={handleGenerate}
              className="w-full h-10 rounded-md bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 shadow transition-colors"
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Generating steps…
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Generate SOP steps
                  {moments.length > 0 && <span className="text-white/80 text-[11px]">· {moments.length} moment{moments.length === 1 ? '' : 's'}</span>}
                </>
              )}
            </button>
            <div className="text-[10.5px] text-slate-500 leading-snug">
              Gemini turns each captured moment (screenshot + your note) into an imperative step and drops the batch into the chosen section.
            </div>
          </div>
        </div>
      )}

      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Overlay-style control primitives (dark background, light text)
──────────────────────────────────────────────────────── */
function OverlayBtn({ onClick, icon, title, active, badge }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
        active ? 'bg-white/20 text-white' : 'bg-black/25 hover:bg-black/45 text-white/90'
      }`}
    >
      {icon}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-brand-500 text-white text-[9.5px] font-bold flex items-center justify-center tabular-nums">
          {badge}
        </span>
      )}
    </button>
  )
}

function OverlayIconBtn({ onClick, icon, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-md text-white hover:bg-white/15 flex items-center justify-center transition-colors"
    >
      {icon}
    </button>
  )
}

function OverlayPill({ active, icon, label, title, onClick, tone }) {
  const toneCls =
    tone === 'emerald' ? (active ? 'bg-emerald-500/90 text-white' : 'bg-white/15 hover:bg-white/25 text-white') :
    tone === 'rose'    ? (active ? 'bg-rose-500/90 text-white'    : 'bg-white/15 hover:bg-white/25 text-white') :
    (active ? 'bg-brand-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white')
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-8 px-2.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 tabular-nums shadow-sm transition-colors ${toneCls}`}
    >
      {icon} {label}
    </button>
  )
}

/**
 * Small cheatsheet overlay — YouTube-style shortcut chart. Toggled with
 * the keyboard button in the top strip or by pressing `?`.
 */
function ShortcutOverlay({ onClose }) {
  const rows = [
    ['Play / Pause',        ['Space', 'K']],
    ['Seek ±5s',            ['← / →']],
    ['Seek ±10s',           ['J / L']],
    ['Jump to N/10',        ['0 – 9']],
    ['Mute / Unmute',       ['M']],
    ['Fullscreen',          ['F']],
    ['Snapshot moment',     ['S']],
    ['Toggle cheatsheet',   ['?']],
    ['Close player',        ['Esc']],
  ]
  return (
    <div
      className="absolute inset-0 z-10 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.35)] w-[420px] max-w-[92vw] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center">
            <Keyboard size={14} />
          </div>
          <div className="flex-1 text-[13px] font-semibold text-slate-900">Keyboard shortcuts</div>
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="px-4 py-3">
          <ul className="space-y-1.5">
            {rows.map(([label, keys], i) => (
              <li key={i} className="flex items-center gap-3 text-[12px]">
                <span className="flex-1 text-slate-700">{label}</span>
                <span className="flex items-center gap-1">
                  {keys.map((k, j) => (
                    <kbd key={j} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10.5px] font-mono text-slate-800">
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10.5px] text-slate-500">
          Same conventions as YouTube — press <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono">?</kbd> anytime to toggle this.
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */
function StepIndicator({ done, n, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold ${
        done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
      }`}>
        {done ? '✓' : n}
      </span>
      <span className={done ? 'text-slate-500 line-through decoration-1' : 'font-semibold'}>{label}</span>
    </span>
  )
}

function MarkBtn({ active, label, onClick, tone, icon }) {
  const activeBg = tone === 'emerald'
    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
    : 'bg-rose-100 border-rose-300 text-rose-800'
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2 rounded-md text-[10.5px] font-semibold inline-flex items-center gap-1 border transition-colors ${
        active ? activeBg : 'border-slate-200 text-slate-700 hover:bg-slate-100'
      }`}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * One captured moment — thumbnail, timestamp badge, note textarea, delete.
 * Click the thumbnail to seek the main player back to that moment.
 */
function MomentCard({ m, index, onJump, onNote, onRemove }) {
  return (
    <div className="group flex gap-2 rounded-lg border border-slate-200 hover:border-brand-300 bg-white p-2 shadow-sm transition-colors">
      <button
        onClick={onJump}
        className="flex-shrink-0 relative w-[92px] aspect-video rounded overflow-hidden border border-slate-200 hover:border-brand-500 transition-colors"
        title={`Jump to ${formatTime(m.time_sec).split('.')[0]}`}
      >
        <img src={m.dataUrl} alt={`Moment ${index}`} className="w-full h-full object-cover" />
        <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono tabular-nums">
          {formatTime(m.time_sec).split('.')[0]}
        </span>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-brand-500 text-white text-[9px] font-bold flex items-center justify-center">
          {index}
        </span>
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <textarea
          value={m.note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="What's happening here?"
          rows={2}
          className="w-full text-[11.5px] text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
        />
        <button
          onClick={onRemove}
          className="self-end text-[10px] text-slate-400 hover:text-red-600 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove moment"
        >
          <Trash2 size={9} /> Remove
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────── */
function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00'
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = Math.floor(s % 60)
  const dec = Math.round((s - Math.floor(s)) * 10)
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
  return `${base}.${dec}`
}
function pctOf(t, d) {
  if (!d || d <= 0) return 0
  return Math.max(0, Math.min(100, (t / d) * 100))
}

/**
 * Optional hls.js loader. Uses a runtime string to defeat Vite's static
 * import analysis so the build doesn't fail when hls.js isn't installed.
 * Returns the Hls class if available, else null.
 */
async function loadHlsIfAvailable() {
  try {
    const specifier = 'hls' + '.js'   // split literal keeps Vite from pre-resolving
    const mod = await import(/* @vite-ignore */ specifier)
    return mod?.default || mod?.Hls || null
  } catch {
    return null
  }
}
