import { Sparkles, MousePointerClick, Camera, MessageSquare } from 'lucide-react'

export default function EmptyStatePanel() {
  return (
    <div className="p-5 flex-1 flex flex-col">
      <div className="p-4 text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-brand-100 to-purple-100 rounded-2xl flex items-center justify-center shadow-inner-sm">
          <Sparkles size={22} className="text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="text-[14px] font-semibold text-slate-900 mb-1">AI is standing by</div>
        <div className="text-[12px] text-slate-500 leading-relaxed max-w-[220px] mx-auto">
          Select something to fix, or type a request in the chat below.
        </div>
      </div>

      <div className="mt-2 space-y-2">
        <HintTile
          icon={<MousePointerClick size={14} className="text-brand-600" />}
          title="Click any block"
          desc="Rewrite, split, merge, move, or delete"
        />
        <HintTile
          icon={<Camera size={14} className="text-emerald-600" />}
          title="Click a screenshot"
          desc="Swap with a better frame from the video"
        />
        <HintTile
          icon={<MessageSquare size={14} className="text-purple-600" />}
          title="Type in the chat bar"
          desc={'"Find and replace" · "Add step here"'}
        />
      </div>

      {/* Multi-select hint */}
      <div className="mt-4 mx-1 p-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40">
        <div className="text-[11px] text-brand-700 font-semibold mb-0.5 flex items-center gap-1.5">
          <span className="inline-flex items-center px-1.5 h-4 rounded bg-white text-brand-600 border border-brand-200 text-[9px] font-bold tracking-wider">CTRL</span>
          <span>+ click</span>
          <span className="text-slate-400 font-normal">to select multiple</span>
        </div>
        <div className="text-[11px] text-slate-600 leading-snug">
          Rewrite, delete, or merge several blocks in one action.
        </div>
      </div>
    </div>
  )
}

function HintTile({ icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-slate-50/60 border border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all cursor-pointer">
      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-slate-100">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{desc}</div>
      </div>
    </div>
  )
}
