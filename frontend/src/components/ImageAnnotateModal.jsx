import { useEffect, useRef, useState } from 'react'
import {
  X, Wand2, Square, Circle, ArrowRight, Highlighter, Undo2, Check, Trash2,
} from 'lucide-react'

/**
 * ImageAnnotateModal — overlay shapes on an image (rectangle, circle,
 * arrow, highlight) via SVG, then flatten to a data URL on Apply.
 *
 * Shapes are stored in DISPLAY coords while editing. On apply we
 * scale them to natural coords and render the whole thing to a canvas.
 */

const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#111827']

export default function ImageAnnotateModal({ src, onCancel, onApply }) {
  const imgRef = useRef(null)
  const boxRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [display, setDisplay] = useState({ w: 0, h: 0 })
  const [tool, setTool]       = useState('rect')     // 'rect' | 'circle' | 'arrow' | 'highlight'
  const [color, setColor]     = useState('#EF4444')
  const [shapes, setShapes]   = useState([])          // finalised shapes
  const [draft, setDraft]     = useState(null)         // in-progress shape

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const onImgLoad = () => {
    const img = imgRef.current
    if (!img) return
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setDisplay({ w: img.clientWidth, h: img.clientHeight })
  }

  const getPos = (e) => {
    const bb = boxRef.current.getBoundingClientRect()
    return { x: e.clientX - bb.left, y: e.clientY - bb.top }
  }

  const onMouseDown = (e) => {
    const { x, y } = getPos(e)
    setDraft({ tool, color, x1: x, y1: y, x2: x, y2: y })
  }
  const onMouseMove = (e) => {
    if (!draft) return
    const { x, y } = getPos(e)
    setDraft({ ...draft, x2: x, y2: y })
  }
  const onMouseUp = () => {
    if (!draft) return
    const dx = Math.abs(draft.x2 - draft.x1)
    const dy = Math.abs(draft.y2 - draft.y1)
    if (dx > 4 || dy > 4) setShapes(prev => [...prev, draft])
    setDraft(null)
  }

  const undo   = () => setShapes(prev => prev.slice(0, -1))
  const clear  = () => setShapes([])

  const apply = () => {
    if (shapes.length === 0) {
      if (!window.confirm('No annotations added. Apply anyway?')) return
    }
    const scaleX = natural.w / display.w
    const scaleY = natural.h / display.h

    const canvas = document.createElement('canvas')
    canvas.width  = natural.w
    canvas.height = natural.h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgRef.current, 0, 0, natural.w, natural.h)

    // Line thickness scaled with natural size so shapes read at any zoom.
    const strokeWidth = Math.max(2, Math.round(natural.w / 400))
    for (const s of shapes) {
      const x1 = s.x1 * scaleX, y1 = s.y1 * scaleY
      const x2 = s.x2 * scaleX, y2 = s.y2 * scaleY
      ctx.strokeStyle = s.color
      ctx.fillStyle   = s.color
      ctx.lineWidth   = strokeWidth
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      if (s.tool === 'rect') {
        ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1))
      } else if (s.tool === 'circle') {
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const rx = Math.abs(x2 - x1) / 2
        const ry = Math.abs(y2 - y1) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (s.tool === 'arrow') {
        drawArrow(ctx, x1, y1, x2, y2, strokeWidth)
      } else if (s.tool === 'highlight') {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.fillStyle = s.color
        ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1))
        ctx.restore()
      }
    }
    const dataUrl = canvas.toDataURL('image/png')
    onApply(dataUrl)
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      {/* Top strip — matches ImageEnlargeModal / ImageCropModal so the three feel continuous */}
      <div className="flex items-center gap-3 px-4 py-2.5 text-white flex-shrink-0 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
          <Wand2 size={16} className="text-purple-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Annotate</div>
          <div className="text-[10.5px] text-white/60">Draw shapes, arrows, and highlights on the image.</div>
        </div>
        <button
          onClick={onCancel}
          className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Cancel (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tool strip */}
      <div className="px-4 py-2 border-b border-white/5 bg-slate-900/60 flex items-center gap-1.5 flex-shrink-0">
        <ToolBtn active={tool === 'rect'}      onClick={() => setTool('rect')}      icon={<Square size={12} />}      label="Rectangle" />
        <ToolBtn active={tool === 'circle'}    onClick={() => setTool('circle')}    icon={<Circle size={12} />}      label="Circle" />
        <ToolBtn active={tool === 'arrow'}     onClick={() => setTool('arrow')}     icon={<ArrowRight size={12} />}  label="Arrow" />
        <ToolBtn active={tool === 'highlight'} onClick={() => setTool('highlight')} icon={<Highlighter size={12} />} label="Highlight" />
        <div className="mx-2 h-6 w-px bg-white/15"></div>
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={undo}
            disabled={shapes.length === 0}
            className="h-7 px-2 rounded-md text-[11px] font-semibold text-white/80 hover:text-white hover:bg-white/10 inline-flex items-center gap-1 transition-colors disabled:opacity-30"
            title="Undo last shape"
          >
            <Undo2 size={11} /> Undo
          </button>
          <button
            onClick={clear}
            disabled={shapes.length === 0}
            className="h-7 px-2 rounded-md text-[11px] font-semibold text-red-300 hover:text-red-100 hover:bg-red-500/20 inline-flex items-center gap-1 transition-colors disabled:opacity-30"
          >
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto p-8 flex items-center justify-center min-h-0">
        <div
          ref={boxRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="relative inline-block select-none"
          style={{ cursor: 'crosshair' }}
        >
          <img
            ref={imgRef}
            src={src}
            onLoad={onImgLoad}
            className="block max-w-full max-h-[calc(100vh-220px)] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded"
            draggable={false}
            alt=""
          />
          <svg
            className="absolute inset-0 pointer-events-none"
            width={display.w}
            height={display.h}
            viewBox={`0 0 ${display.w} ${display.h}`}
          >
            {shapes.map((s, i) => <ShapeSvg key={i} shape={s} />)}
            {draft && <ShapeSvg shape={draft} />}
          </svg>
        </div>
      </div>

      {/* Bottom action bar — floating pill, matches ImageEnlargeModal */}
      <div className="flex-shrink-0 flex justify-center pb-6">
        <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur border border-white/15 rounded-2xl px-2 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="text-[11.5px] text-white/70 px-2 tabular-nums">
            {shapes.length} shape{shapes.length === 1 ? '' : 's'}
          </div>
          <BigBtn onClick={onCancel} icon={<X size={16} />}     label="Cancel" />
          <BigBtn onClick={apply}    icon={<Check size={16} />} label="Apply annotations" tone="primary" />
        </div>
      </div>
    </div>
  )
}

function ToolBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
        active ? 'bg-purple-500 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
      }`}
      title={label}
    >
      {icon} {label}
    </button>
  )
}

function BigBtn({ onClick, icon, label, tone }) {
  const bg = tone === 'primary'
    ? 'bg-purple-500 hover:bg-purple-600 text-white border-purple-400'
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

/** SVG rendering of a shape for the live preview overlay. */
function ShapeSvg({ shape }) {
  const s = shape
  const x = Math.min(s.x1, s.x2)
  const y = Math.min(s.y1, s.y2)
  const w = Math.abs(s.x2 - s.x1)
  const h = Math.abs(s.y2 - s.y1)
  if (s.tool === 'rect') {
    return <rect x={x} y={y} width={w} height={h} stroke={s.color} strokeWidth="2.5" fill="none" />
  }
  if (s.tool === 'circle') {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} stroke={s.color} strokeWidth="2.5" fill="none" />
  }
  if (s.tool === 'arrow') {
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
    const headLen = 12
    const hx1 = s.x2 - headLen * Math.cos(angle - Math.PI / 6)
    const hy1 = s.y2 - headLen * Math.sin(angle - Math.PI / 6)
    const hx2 = s.x2 - headLen * Math.cos(angle + Math.PI / 6)
    const hy2 = s.y2 - headLen * Math.sin(angle + Math.PI / 6)
    return (
      <>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth="2.5" strokeLinecap="round" />
        <polygon points={`${s.x2},${s.y2} ${hx1},${hy1} ${hx2},${hy2}`} fill={s.color} />
      </>
    )
  }
  if (s.tool === 'highlight') {
    return <rect x={x} y={y} width={w} height={h} fill={s.color} opacity="0.35" />
  }
  return null
}

/** Draw an arrow on a 2D canvas — used at apply time when flattening. */
function drawArrow(ctx, x1, y1, x2, y2, strokeWidth) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = Math.max(12, strokeWidth * 4)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  // Head
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}
