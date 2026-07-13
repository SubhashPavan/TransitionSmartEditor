import { useEffect, useRef, useState } from 'react'
import { X, Crop, RotateCcw, Check } from 'lucide-react'

/**
 * ImageCropModal — drag a rectangle on top of the image, hit Apply, and
 * we produce a new data-URL of just that crop via a hidden canvas.
 *
 * The image is drawn into a display box that scales it down proportionally.
 * We track the crop rectangle in DISPLAY coords, then convert to NATURAL
 * coords using the same scale factor before drawing the final canvas.
 */
export default function ImageCropModal({ src, onCancel, onApply }) {
  const imgRef = useRef(null)
  const boxRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [display, setDisplay] = useState({ w: 0, h: 0 })
  const [rect, setRect] = useState(null)  // { x, y, w, h } in display coords
  const [dragging, setDragging] = useState(null) // { startX, startY }

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
    // Default crop = full image
    setRect({ x: 0, y: 0, w: img.clientWidth, h: img.clientHeight })
  }

  const onMouseDown = (e) => {
    const box = boxRef.current
    if (!box) return
    const bb = box.getBoundingClientRect()
    const x = e.clientX - bb.left
    const y = e.clientY - bb.top
    setDragging({ startX: x, startY: y })
    setRect({ x, y, w: 0, h: 0 })
  }

  const onMouseMove = (e) => {
    if (!dragging) return
    const box = boxRef.current
    if (!box) return
    const bb = box.getBoundingClientRect()
    const x = e.clientX - bb.left
    const y = e.clientY - bb.top
    const nx = Math.min(dragging.startX, x)
    const ny = Math.min(dragging.startY, y)
    const nw = Math.abs(x - dragging.startX)
    const nh = Math.abs(y - dragging.startY)
    // Clamp to display box
    setRect({
      x: Math.max(0, nx),
      y: Math.max(0, ny),
      w: Math.min(display.w - nx, nw),
      h: Math.min(display.h - ny, nh),
    })
  }

  const onMouseUp = () => setDragging(null)

  const resetCrop = () => {
    setRect({ x: 0, y: 0, w: display.w, h: display.h })
  }

  const apply = () => {
    if (!rect || rect.w < 4 || rect.h < 4) {
      alert('Crop rectangle is too small. Drag on the image first.')
      return
    }
    const scaleX = natural.w / display.w
    const scaleY = natural.h / display.h
    const sx = rect.x * scaleX
    const sy = rect.y * scaleY
    const sw = rect.w * scaleX
    const sh = rect.h * scaleY

    const canvas = document.createElement('canvas')
    canvas.width  = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    onApply(dataUrl)
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      {/* Top strip — mirrors ImageEnlargeModal so the two feel continuous */}
      <div className="flex items-center gap-3 px-4 py-2.5 text-white flex-shrink-0 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-400/30 flex items-center justify-center">
          <Crop size={16} className="text-brand-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Crop Image</div>
          <div className="text-[10.5px] text-white/60">Drag a rectangle on the image, then click Apply.</div>
        </div>
        <button
          onClick={onCancel}
          className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Cancel (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Canvas area — takes the full remaining height */}
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
            className="block max-w-full max-h-[calc(100vh-180px)] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded"
            draggable={false}
            alt=""
          />
          {/* Dim overlays around the crop rectangle */}
          {rect && rect.w > 0 && rect.h > 0 && (
            <>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(15,23,42,0.55)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y}px, ${rect.x}px ${rect.y}px, ${rect.x}px ${rect.y + rect.h}px, ${rect.x + rect.w}px ${rect.y + rect.h}px, ${rect.x + rect.w}px ${rect.y}px, 0 ${rect.y}px)` }} />
              <div
                className="absolute border-2 border-brand-400 pointer-events-none"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: '0 0 0 1px rgba(255,255,255,0.7)' }}
              >
                <div className="absolute -top-6 left-0 bg-brand-500 text-white text-[10px] px-1.5 py-0.5 rounded tabular-nums">
                  {Math.round(rect.w * (natural.w / display.w))} × {Math.round(rect.h * (natural.h / display.h))} px
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom action bar — floating pill, same look as enlarge modal's actions */}
      <div className="flex-shrink-0 flex justify-center pb-6">
        <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur border border-white/15 rounded-2xl px-2 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <BigBtn onClick={resetCrop} icon={<RotateCcw size={16} />} label="Reset" />
          <BigBtn onClick={onCancel}  icon={<X size={16} />}         label="Cancel" />
          <BigBtn onClick={apply}     icon={<Check size={16} />}     label="Apply crop" tone="primary" />
        </div>
      </div>
    </div>
  )
}

function BigBtn({ onClick, icon, label, tone }) {
  const bg = tone === 'primary'
    ? 'bg-brand-500 hover:bg-brand-600 text-white border-brand-400'
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
