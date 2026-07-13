import { useRef, useState } from 'react'
import { Upload, Video, FileText, Pencil, Target, BarChart3, Brain, FileCheck2, Loader2 } from 'lucide-react'
import mammoth from 'mammoth'

const INFOSYS_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Infosys_logo.svg/1280px-Infosys_logo.svg.png'

export default function Landing({ onEnter }) {
  const fileInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  const handleFile = async (file) => {
    setError(null)
    if (!file) return
    if (!/\.docx$/i.test(file.name)) {
      setError('Please choose a .docx file (mammoth only reads modern Word format).')
      return
    }
    setParsing(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      onEnter({
        fileName: file.name,
        html: result.value,
        arrayBuffer,  // keep the raw .docx for docx-preview (template-fidelity rendering)
        messages: result.messages,
      })
    } catch (e) {
      setError('Could not parse this file. Try a modern Word .docx or use the sample instead.')
      console.error(e)
    } finally {
      setParsing(false)
    }
  }

  const openSample = () => {
    onEnter(null)  // null = use built-in Ariba sample
  }

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-sky-50 overflow-y-auto">
      {/* Top brand strip */}
      <div className="px-11 py-5 flex justify-between items-center border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-3.5">
          <img src={INFOSYS_LOGO} alt="Infosys" className="h-5 [filter:brightness(0.2)]" />
          <span className="text-slate-300">|</span>
          <span className="text-xs font-bold text-brand-600 tracking-[3px] uppercase">
            TransitionSmart Review Studio
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Need help?
          <a href="#" className="ml-3 text-brand-600 font-medium hover:underline">Documentation</a>
          <a href="#" className="ml-3 text-brand-600 font-medium hover:underline">Watch Demo</a>
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-3xl w-full bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-12 text-center border border-slate-100">
          <div className="text-[11px] tracking-[3px] uppercase text-brand-600 font-bold mb-3.5">
            Review Studio · SOP Editor
          </div>
          <h1 className="text-[32px] font-bold text-slate-900 -tracking-[0.5px] mb-3 leading-[1.2]">
            Review your AI-generated SOP,<br />
            <span className="bg-gradient-to-r from-brand-600 to-purple-600 bg-clip-text text-transparent">
              with AI still by your side.
            </span>
          </h1>
          <p className="text-[14px] text-slate-600 max-w-xl mx-auto mb-8 leading-relaxed">
            Upload a TransitionSmart-generated .docx and open it in a Word-like editor with intelligent
            fix-in-place actions, confidence-driven navigation, and real-time review telemetry.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            disabled={parsing}
            className={`w-full border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer group ${
              dragging
                ? 'border-brand-500 bg-brand-50 shadow-inner-sm'
                : parsing
                ? 'border-brand-300 bg-brand-50/50'
                : 'border-slate-300 bg-gradient-to-br from-slate-50 to-sky-50 hover:border-brand-500 hover:from-sky-50 hover:to-white'
            }`}
          >
            {parsing ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)]">
                  <Loader2 size={26} strokeWidth={2.25} className="animate-spin" />
                </div>
                <div className="text-[16px] font-semibold text-slate-900 mb-1">Parsing your document…</div>
                <div className="text-[12px] text-slate-500">Reading structure, styles, and images</div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] group-hover:scale-105 transition-transform">
                  <Upload size={26} strokeWidth={2.25} />
                </div>
                <div className="text-[16px] font-semibold text-slate-900 mb-1">
                  Drop your SOP <span className="font-mono text-[15px]">.docx</span> here
                </div>
                <div className="text-[12px] text-slate-500">
                  or <b className="text-brand-600">click to browse</b> · TransitionSmart-generated files unlock full AI features
                </div>
              </>
            )}
          </button>

          {error && (
            <div className="mt-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] text-left">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-[11px] text-slate-400 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <button
            onClick={openSample}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-semibold transition-colors"
          >
            <FileCheck2 size={14} className="text-emerald-600" />
            Open sample: Ariba Supplier Management SOP
          </button>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <OptionCard
              icon={<Video size={16} className="text-purple-600" />}
              title="Attach source video"
              desc="Unlocks screenshot regeneration & semantic search"
            />
            <OptionCard
              icon={<FileText size={16} className="text-emerald-600" />}
              title="Attach client template"
              desc="Locks output to fonts, headers, numbering"
            />
          </div>
        </div>
      </div>

      {/* Feature pills */}
      <div className="max-w-3xl mx-auto mb-8 grid grid-cols-4 gap-3 px-6 pb-6 w-full">
        <FeaturePill icon={<Pencil size={16} className="text-brand-600" />} label="Word-perfect editor" />
        <FeaturePill icon={<Target size={16} className="text-orange-500" />} label="One-click fixes" />
        <FeaturePill icon={<BarChart3 size={16} className="text-emerald-600" />} label="Review telemetry" />
        <FeaturePill icon={<Brain size={16} className="text-purple-600" />} label="AI copilot always on" />
      </div>
    </div>
  )
}

function OptionCard({ icon, title, desc }) {
  return (
    <div className="p-3.5 border border-slate-200 rounded-lg bg-white flex gap-3 items-start cursor-pointer hover:border-brand-500 hover:bg-brand-50/50 transition-all group">
      <div className="w-9 h-9 flex-shrink-0 bg-slate-50 rounded-lg flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
        {icon}
      </div>
      <div className="text-left">
        <div className="text-[13px] font-semibold text-slate-900 mb-0.5">{title}</div>
        <div className="text-[11px] text-slate-500 leading-snug">{desc}</div>
      </div>
    </div>
  )
}

function FeaturePill({ icon, label }) {
  return (
    <div className="bg-white/70 backdrop-blur-sm p-3 rounded-lg text-center border border-slate-200 shadow-sm">
      <div className="mb-1.5 flex justify-center">{icon}</div>
      <div className="text-[11px] text-slate-700 font-semibold tracking-wide">{label}</div>
    </div>
  )
}
