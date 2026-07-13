import { useState } from 'react'
import { Camera, X, Sparkles, Search, Upload, Trash2, Check, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'

export default function ScreenshotEditorPanel({ onClose }) {
  const [pickedCandidate, setPickedCandidate] = useState(1)

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13.5px] font-semibold text-slate-900 flex items-center gap-2">
          <Camera size={14} className="text-brand-600" />
          Screenshot Editor
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Current preview */}
      <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-3 mb-4 border border-slate-100 shadow-sm">
        <div className="rounded-lg overflow-hidden shadow-sm border border-slate-100">
          <svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" className="block w-full">
            <rect width="600" height="200" fill="#f8fafc"/>
            <rect y="0" width="600" height="34" fill="#f47b30"/>
            <text x="14" y="22" fill="#fff" fontSize="12" fontWeight="600">SAP Ariba</text>
            <rect x="0" y="34" width="70" height="166" fill="#0F172A"/>
            <rect x="12" y="100" width="46" height="30" fill="#f47b30" rx="3"/>
            <rect x="6" y="94" width="58" height="46" fill="none" stroke="#ef4444" strokeWidth="2.5" rx="3"/>
          </svg>
        </div>
        <div className="flex justify-between items-center mt-2.5 text-[11px]">
          <span className="text-slate-500">Frame at <b className="text-slate-700 tabular-nums">00:31</b></span>
          <span className="text-red-600 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 ring-2 ring-red-100"></span>
            62% confidence
          </span>
        </div>
      </div>

      <SubHead>Better candidates from the source video</SubHead>

      <div className="grid grid-cols-3 gap-2">
        {CANDIDATES.map((c, i) => (
          <Candidate
            key={i}
            time={c.time}
            variant={c.variant}
            selected={pickedCandidate === i}
            onSelect={() => setPickedCandidate(i)}
          />
        ))}
      </div>

      <div className="flex gap-1 mt-2.5">
        <NudgeBtn icon={<ChevronsLeft size={12} />}>−5s</NudgeBtn>
        <NudgeBtn icon={<ChevronLeft size={12} />}>−1s</NudgeBtn>
        <NudgeBtn icon={<ChevronRight size={12} />} iconRight>+1s</NudgeBtn>
        <NudgeBtn icon={<ChevronsRight size={12} />} iconRight>+5s</NudgeBtn>
      </div>

      <SubHead>Describe what you're looking for</SubHead>

      <div className="flex bg-white border border-slate-200 rounded-xl px-3 py-2 items-center gap-2 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-sm">
        <Sparkles size={14} className="text-purple-500 flex-shrink-0" />
        <input
          type="text"
          placeholder="e.g. Journals icon highlighted…"
          className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12px] text-slate-900 placeholder:text-slate-400"
        />
        <button className="bg-brand-500 text-white h-7 px-2.5 rounded-md text-[11px] font-semibold hover:bg-brand-600 inline-flex items-center gap-1 flex-shrink-0 shadow-sm shadow-brand-500/25">
          <Search size={11} /> Search
        </button>
      </div>

      <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
        <ActionBtn tone="danger" icon={<Trash2 size={12} />}>Delete</ActionBtn>
        <ActionBtn icon={<Upload size={12} />}>Upload</ActionBtn>
        <ActionBtn tone="primary" icon={<Check size={12} />}>Apply</ActionBtn>
      </div>
    </div>
  )
}

/* ─── helpers ─── */

function SubHead({ children }) {
  return (
    <div className="text-[9.5px] font-bold text-slate-400 tracking-widest uppercase mt-5 mb-2">
      {children}
    </div>
  )
}

function NudgeBtn({ children, icon, iconRight }) {
  return (
    <button className="flex-1 h-7 px-1 bg-white border border-slate-100 rounded-lg text-[11px] text-slate-700 hover:bg-slate-50 hover:border-slate-200 inline-flex items-center justify-center gap-1 font-medium transition-all shadow-sm tabular-nums">
      {!iconRight && icon}{children}{iconRight && icon}
    </button>
  )
}

function ActionBtn({ children, tone, icon }) {
  const styles = {
    danger:  'text-red-600 hover:bg-red-50 border-red-100',
    primary: 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/20',
  }
  return (
    <button className={`flex-1 h-9 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 transition-all ${styles[tone] || ''}`}>
      {icon}{children}
    </button>
  )
}

const CANDIDATES = [
  { time: '00:28', variant: 'thumb1' },
  { time: '00:32', variant: 'thumb2' },
  { time: '00:35', variant: 'thumb3' },
  { time: '00:41', variant: 'thumb4' },
  { time: '00:44', variant: 'thumb5' },
  { time: '00:48', variant: 'thumb6' },
]

function Candidate({ time, variant, selected, onSelect }) {
  const border = selected
    ? 'border-brand-500 border-2 ring-2 ring-brand-100'
    : 'border-slate-100 border hover:border-brand-300 hover:-translate-y-0.5'
  return (
    <div
      onClick={onSelect}
      className={`rounded-lg overflow-hidden cursor-pointer relative bg-white transition-all shadow-sm ${border}`}
    >
      <CandidateSVG variant={variant} />
      <div className="absolute bottom-1.5 right-1.5 text-[9px] text-white bg-slate-900/85 px-1.5 py-0.5 rounded-md font-medium tabular-nums backdrop-blur">
        {time}
      </div>
      {selected && (
        <div className="absolute top-1.5 left-1.5 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center shadow-md">
          <Check size={10} className="text-white" strokeWidth={3.5} />
        </div>
      )}
    </div>
  )
}

function CandidateSVG({ variant }) {
  const common = <>
    <rect width="200" height="120" fill="#f8fafc"/>
    <rect width="200" height="20" fill="#f47b30"/>
    <rect x="0" y="20" width="30" height="100" fill="#0F172A"/>
  </>
  const mid = {
    thumb1: <>
      <rect x="6" y="55" width="18" height="14" fill="#f47b30" rx="2"/>
      <rect x="4" y="53" width="22" height="18" fill="none" stroke="#ef4444" strokeWidth="1.5" rx="2"/>
    </>,
    thumb2: <>
      <rect x="4" y="52" width="22" height="20" fill="#f47b30" rx="2"/>
      <rect x="2" y="50" width="26" height="24" fill="none" stroke="#22c55e" strokeWidth="2" rx="2"/>
      <rect x="35" y="30" width="160" height="12" fill="#ffffff" stroke="#cbd5e1" rx="2"/>
      <rect x="35" y="50" width="160" height="12" fill="#ffffff" stroke="#cbd5e1" rx="2"/>
      <rect x="35" y="70" width="160" height="12" fill="#ffffff" stroke="#cbd5e1" rx="2"/>
      <rect x="35" y="90" width="160" height="12" fill="#ffffff" stroke="#cbd5e1" rx="2"/>
    </>,
    thumb3: <>
      <rect x="6" y="55" width="18" height="14" fill="#f47b30" rx="2"/>
      <rect x="45" y="35" width="140" height="10" fill="#e2e8f0" rx="2"/>
      <rect x="45" y="55" width="140" height="10" fill="#e2e8f0" rx="2"/>
    </>,
    thumb4: <>
      <rect x="30" y="35" width="140" height="70" fill="#ffffff" stroke="#e2e8f0" rx="4"/>
    </>,
    thumb5: <>
      <rect x="30" y="30" width="140" height="80" fill="#ffffff" stroke="#e2e8f0" rx="3"/>
      <rect x="40" y="42" width="60" height="10" fill="#e2e8f0" rx="2"/>
      <rect x="40" y="58" width="120" height="8" fill="#f1f5f9" rx="2"/>
      <rect x="40" y="72" width="120" height="8" fill="#f1f5f9" rx="2"/>
    </>,
    thumb6: <>
      <circle cx="100" cy="70" r="20" fill="#22c55e"/>
      <text x="100" y="76" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">✓</text>
    </>,
  }
  return (
    <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" className="block w-full">
      {common}
      {mid[variant]}
    </svg>
  )
}
