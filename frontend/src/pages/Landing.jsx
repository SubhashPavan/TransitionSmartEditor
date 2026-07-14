import { useState } from 'react'
import { Video, FileText, Pencil, Target, BarChart3, Brain, FileCheck2, Loader2, ArrowRight } from 'lucide-react'
import mammoth from 'mammoth'

const INFOSYS_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Infosys_logo.svg/1280px-Infosys_logo.svg.png'

/**
 * The demo Landing page. The reviewer can't upload their own SOP — this is
 * a fixed showcase of the Ariba Supplier Management SOP that we ship in
 * `public/sop-demo.docx`. Clicking the CTA fetches that .docx, parses it
 * with mammoth, and hands the result to the Editor.
 */
const DEMO_DOC_URL  = '/sop-demo.docx'
const DEMO_DOC_NAME = 'Ariba Supplier Management SOP.docx'

export default function Landing({ onEnter }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const openDemo = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(DEMO_DOC_URL)
      if (!res.ok) throw new Error(`Failed to fetch demo SOP: ${res.status}`)
      const arrayBuffer = await res.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      onEnter({
        fileName: DEMO_DOC_NAME,
        html: result.value,
        arrayBuffer,
        messages: result.messages,
      })
    } catch (e) {
      console.error(e)
      setError('Could not load the demo SOP. Refresh the page and try again.')
      setLoading(false)
    }
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
            Open the Ariba Supplier Management SOP in a Word-like editor with intelligent
            fix-in-place actions, confidence-driven navigation, and real-time review telemetry.
          </p>

          <button
            onClick={openDemo}
            disabled={loading}
            className={`w-full rounded-xl p-10 text-center transition-all group border-2 ${
              loading
                ? 'border-brand-300 bg-brand-50/50'
                : 'border-brand-200 bg-gradient-to-br from-brand-50 to-sky-50 hover:border-brand-500 hover:shadow-[0_10px_30px_rgba(37,99,235,0.15)]'
            }`}
          >
            {loading ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)]">
                  <Loader2 size={26} strokeWidth={2.25} className="animate-spin" />
                </div>
                <div className="text-[16px] font-semibold text-slate-900 mb-1">Loading the demo SOP…</div>
                <div className="text-[12px] text-slate-500">Reading structure, styles, and images</div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] group-hover:scale-105 transition-transform">
                  <FileCheck2 size={26} strokeWidth={2.25} />
                </div>
                <div className="text-[17px] font-semibold text-slate-900 mb-1">
                  Open Ariba Supplier Management SOP
                </div>
                <div className="text-[12px] text-slate-500 inline-flex items-center gap-1">
                  Start reviewing the AI-generated draft
                  <ArrowRight size={12} className="text-brand-600 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </>
            )}
          </button>

          {error && (
            <div className="mt-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] text-left">
              {error}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <OptionCard
              icon={<Video size={16} className="text-purple-600" />}
              title="Source videos attached"
              desc="Screenshot regeneration & semantic frame search enabled"
            />
            <OptionCard
              icon={<FileText size={16} className="text-emerald-600" />}
              title="Ariba template applied"
              desc="Locked to fonts, headers, numbering from the source"
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
    <div className="p-3.5 border border-slate-200 rounded-lg bg-white flex gap-3 items-start">
      <div className="w-9 h-9 flex-shrink-0 bg-slate-50 rounded-lg flex items-center justify-center">
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
