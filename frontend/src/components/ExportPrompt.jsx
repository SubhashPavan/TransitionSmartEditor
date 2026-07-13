import { X, Download, Sparkles, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react'

/**
 * Export dialog that nudges the reviewer to actually use the editor
 * instead of downloading a mostly-untouched AI draft.
 *
 * Behavior depends on how much they've edited:
 *   - < 5 edits    → warning ("looks like you barely touched it")
 *   - 5–20 edits   → encourage more ("you've made a start — dig deeper")
 *   - > 20 edits   → celebrate ("great — one more pass?")
 */
export default function ExportPrompt({ open, onClose, onConfirm, editStats }) {
  if (!open) return null

  const edits = editStats?.edits ?? 0
  const minutes = editStats?.minutes ?? 0
  const total = editStats?.total ?? 40
  const reviewed = editStats?.approved ?? 0

  const level = edits < 5 ? 'low' : edits < 20 ? 'mid' : 'high'
  const config = COPY[level]

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-slide-in-right">

        {/* Colored top strip */}
        <div className={`h-1 ${config.stripe}`}></div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconBg}`}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-slate-900 leading-tight mb-1">{config.title}</h2>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">{config.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Stats card */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-5">
            <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-3">Your session at a glance</div>
            <div className="grid grid-cols-4 gap-3">
              <StatBox value={edits} label="Edits" tone={edits < 5 ? 'warn' : 'ok'} />
              <StatBox value={`${minutes}m`} label="Time" />
              <StatBox value={`${reviewed}/${total}`} label="Reviewed" tone={reviewed / total >= 0.75 ? 'ok' : 'warn'} />
              <StatBox value={`${Math.round((reviewed / total) * 100)}%`} label="Coverage" tone={reviewed / total >= 0.75 ? 'ok' : 'warn'} />
            </div>
          </div>

          {/* Main callout / persuasion */}
          <div className={`rounded-xl p-4 mb-5 border ${config.calloutClass}`}>
            <div className="flex items-start gap-2">
              <Sparkles size={14} className={`mt-0.5 flex-shrink-0 ${config.calloutIcon}`} />
              <div>
                <div className={`text-[13px] font-semibold ${config.calloutTitle} mb-1`}>{config.calloutHead}</div>
                <div className={`text-[12px] leading-relaxed ${config.calloutBody}`}>{config.calloutText}</div>
              </div>
            </div>
          </div>

          {/* Quick actions to encourage editing */}
          {level !== 'high' && (
            <div className="mb-5">
              <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-2">Do this first</div>
              <div className="space-y-1.5">
                <SuggestionRow onClose={onClose} label="Filter by low-confidence steps" desc="6 items flagged for reviewer attention" />
                <SuggestionRow onClose={onClose} label="Check the 2 steps missing screenshots" desc="in sections 3.3 and 4.1" />
                <SuggestionRow onClose={onClose} label="Run one Rephrase pass on Section 3" desc="tightens language & tone consistency" />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-lg bg-brand-500 text-white text-[12.5px] font-semibold hover:bg-brand-600 shadow-sm shadow-brand-500/30 transition-all inline-flex items-center justify-center gap-2"
            >
              <Sparkles size={13} />
              Stay & keep editing
            </button>
            <button
              onClick={onConfirm}
              className="h-10 px-4 rounded-lg text-slate-700 text-[12.5px] font-semibold hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5"
            >
              <Download size={13} />
              Export anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── helpers ─── */

function StatBox({ value, label, tone }) {
  const color = tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-900'
  return (
    <div className="text-center">
      <div className={`text-[20px] font-bold leading-none tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">{label}</div>
    </div>
  )
}

function SuggestionRow({ label, desc, onClose }) {
  return (
    <button
      onClick={onClose}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-white hover:bg-brand-50/40 hover:border-brand-200 transition-all text-left group"
    >
      <div className="w-6 h-6 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center flex-shrink-0">
        <Sparkles size={11} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-slate-900">{label}</div>
        <div className="text-[10.5px] text-slate-500">{desc}</div>
      </div>
      <ArrowRight size={12} className="text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}

/* ─── copy variants (based on how much editing has happened) ─── */

const COPY = {
  low: {
    stripe: 'bg-amber-500',
    icon: <AlertTriangle size={22} className="text-amber-700" />,
    iconBg: 'bg-amber-100',
    title: "Exporting an AI draft, mostly untouched?",
    subtitle: "You've made very few edits. TransitionSmart is at its best when a human closes the loop — before the document reaches the client.",
    calloutHead: "You're paying for AI accuracy today — not tomorrow.",
    calloutText: "If you download without editing, you're implicitly accepting whatever the model produced — including any wrong screenshots or low-confidence steps. The more you refine here, the better every future SOP the system generates for you.",
    calloutClass: 'border-amber-200 bg-amber-50/60',
    calloutIcon:  'text-amber-600',
    calloutTitle: 'text-amber-900',
    calloutBody:  'text-amber-800',
  },
  mid: {
    stripe: 'bg-brand-500',
    icon: <TrendingUp size={22} className="text-brand-700" />,
    iconBg: 'bg-brand-100',
    title: "Halfway there — worth one more pass?",
    subtitle: "You've made a real dent. A quick sweep for consistency will push this from good to client-ready.",
    calloutHead: "The editor exists to lift your throughput, not just polish text.",
    calloutText: "Each edit you make here trains the system for the next document. Skipping the last 20% typically means the reviewer downstream (or the client) does that work manually.",
    calloutClass: 'border-brand-200 bg-brand-50/60',
    calloutIcon:  'text-brand-600',
    calloutTitle: 'text-brand-900',
    calloutBody:  'text-brand-800',
  },
  high: {
    stripe: 'bg-emerald-500',
    icon: <Sparkles size={22} className="text-emerald-700" />,
    iconBg: 'bg-emerald-100',
    title: "Ready to export.",
    subtitle: "You've done thorough work here. Confidence signals are strong, coverage is solid.",
    calloutHead: "Your reviewer effort is measurable and captured.",
    calloutText: "The metrics from this session (edits, screenshot swaps, rewrites) feed the model so the next SOP starts closer to done. Thanks for the loop-closure.",
    calloutClass: 'border-emerald-200 bg-emerald-50/60',
    calloutIcon:  'text-emerald-600',
    calloutTitle: 'text-emerald-900',
    calloutBody:  'text-emerald-800',
  },
}
