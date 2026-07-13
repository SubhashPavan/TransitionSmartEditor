import { useState } from 'react'
import { Minus, Plus, RotateCcw, ChevronDown, Check } from 'lucide-react'

const PRESETS = [50, 75, 90, 100, 110, 125, 150, 175, 200]

export default function FloatingZoom({ zoom, onZoomIn, onZoomOut, onZoomReset, onZoomSet }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="absolute bottom-4 right-6 z-20 flex items-center gap-0 bg-white/95 backdrop-blur rounded-full shadow-[0_6px_20px_rgba(15,23,42,0.20)] border border-slate-200 pl-1 pr-1 py-1 select-none">
      <button
        onClick={onZoomOut}
        title="Zoom out (Ctrl+-)"
        className="w-7 h-7 rounded-full text-slate-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-colors"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>

      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="h-7 min-w-[54px] px-2 rounded-full text-slate-800 hover:bg-slate-100 text-[12px] font-semibold tabular-nums transition-colors inline-flex items-center gap-1"
          title="Zoom level"
        >
          {zoom}%
          <ChevronDown size={10} className="text-slate-400" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute bottom-full right-0 mb-2 w-[128px] bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20">
              {PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => { onZoomSet?.(p); setOpen(false) }}
                  className={`w-full px-3 py-1.5 text-[12px] flex items-center justify-between tabular-nums transition-colors ${
                    p === zoom ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{p}%</span>
                  {p === zoom && <Check size={12} className="text-brand-600" />}
                </button>
              ))}
              <div className="my-1 border-t border-slate-100"></div>
              <button
                onClick={() => { onZoomReset?.(); setOpen(false) }}
                className="w-full px-3 py-1.5 text-[12px] hover:bg-slate-50 text-slate-700 inline-flex items-center gap-2"
              >
                <RotateCcw size={11} /> Reset to 100%
              </button>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onZoomIn}
        title="Zoom in (Ctrl+=)"
        className="w-7 h-7 rounded-full text-slate-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-colors"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  )
}
