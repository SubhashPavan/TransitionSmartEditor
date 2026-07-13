import {
  Pencil, X, Play, Type as TypeIcon, List as ListIcon,
  Feather, Scissors, GraduationCap, Plus, Repeat, Languages,
  ArrowUpDown, Split, Merge, FolderInput, Flag, Trash2,
  Check, Sparkles,
} from 'lucide-react'

const TYPE_LABEL = {
  step:      { icon: <Pencil size={14} className="text-brand-600" />,   title: 'Step Editor',      what: 'step' },
  paragraph: { icon: <TypeIcon size={14} className="text-brand-600" />, title: 'Paragraph Editor', what: 'paragraph' },
  heading:   { icon: <TypeIcon size={14} className="text-brand-600" />, title: 'Heading Editor',   what: 'heading' },
  list:      { icon: <ListIcon size={14} className="text-brand-600" />, title: 'List Editor',      what: 'list' },
}

export default function StepEditorPanel({ id, type = 'step', text, onClose }) {
  const label = TYPE_LABEL[type] || TYPE_LABEL.step
  const preview = pickPreview(type)
  const isStep = type === 'step'

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13.5px] font-semibold text-slate-900 flex items-center gap-2">
          {label.icon}{label.title}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Current preview */}
      {text && (
        <div className="mb-4 px-3.5 py-3 bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-xl shadow-sm">
          <div className="text-[9.5px] font-bold text-slate-400 tracking-widest uppercase mb-1.5">Current {label.what}</div>
          <div className="text-[12px] text-slate-700 leading-relaxed line-clamp-3 italic">
            {text.length > 160 ? text.slice(0, 160) + '…' : text}
          </div>
        </div>
      )}

      <SubHead>Quick rewrites</SubHead>
      <QuickGrid>
        <QuickAction icon={<Feather size={13} className="text-brand-500" />}>Simpler</QuickAction>
        <QuickAction icon={<Scissors size={13} className="text-brand-500" />}>Shorter</QuickAction>
        <QuickAction icon={<GraduationCap size={13} className="text-brand-500" />}>More formal</QuickAction>
        <QuickAction icon={<Plus size={13} className="text-brand-500" />}>Add detail</QuickAction>
        <QuickAction icon={<Repeat size={13} className="text-brand-500" />}>Rephrase</QuickAction>
        <QuickAction icon={<Languages size={13} className="text-brand-500" />}>Translate</QuickAction>
      </QuickGrid>

      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 mt-3 shadow-sm">
        <div className="text-[9.5px] font-bold text-emerald-700 tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
          <Sparkles size={11} />
          AI Preview · "Shorter"
        </div>
        <div className="text-[12.5px] text-emerald-950 leading-relaxed">
          {preview}
        </div>
      </div>

      <SubHead>Structural actions</SubHead>
      <QuickGrid>
        <QuickAction icon={<ArrowUpDown size={13} className="text-slate-500" />}>Move up/down</QuickAction>
        <QuickAction icon={<Split size={13} className="text-slate-500" />}>Split {label.what}</QuickAction>
        <QuickAction icon={<Merge size={13} className="text-slate-500" />}>Merge next</QuickAction>
        <QuickAction icon={<FolderInput size={13} className="text-slate-500" />}>Move to section</QuickAction>
        <QuickAction icon={<Flag size={13} className="text-amber-500" />}>Flag for lead</QuickAction>
        <QuickAction icon={<Trash2 size={13} />} danger>Delete {label.what}</QuickAction>
      </QuickGrid>

      {isStep && (
        <>
          <SubHead>Source video (00:24 – 00:38)</SubHead>
          <div className="rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 text-white p-3 flex items-center gap-3 shadow-md">
            <button className="w-11 h-11 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0 hover:brightness-110 transition-all shadow-md">
              <Play size={16} fill="white" strokeWidth={0} />
            </button>
            <div className="flex-1 text-[11px] min-w-0">
              <div className="text-purple-200 font-semibold tabular-nums">00:24 → 00:38 · 14s</div>
              <div className="text-slate-300 mt-0.5 italic truncate">"...open the Journals module from the left panel..."</div>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
        <ActionBtn tone="danger" icon={<X size={12} />}>Reject</ActionBtn>
        <ActionBtn>Keep</ActionBtn>
        <ActionBtn tone="primary" icon={<Check size={12} />}>Apply</ActionBtn>
      </div>
    </div>
  )
}

function pickPreview(type) {
  switch (type) {
    case 'paragraph': return `This paragraph outlines the mandatory fields needed when creating a supplier profile.`
    case 'heading':   return `Supplier Profile Setup`
    case 'list':      return `Company Name · Website · Primary Address · Product Categories`
    default:          return `Click the Journals icon in the left sidebar. The workspace opens with recent entries.`
  }
}

function SubHead({ children }) {
  return (
    <div className="text-[9.5px] font-bold text-slate-400 tracking-widest uppercase mt-5 mb-2">
      {children}
    </div>
  )
}

function QuickGrid({ children }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>
}

function QuickAction({ icon, children, danger }) {
  return (
    <button className={`h-10 px-3 border border-slate-100 rounded-lg bg-white text-[12px] text-left inline-flex items-center gap-2 transition-all shadow-sm hover:shadow ${
      danger
        ? 'text-red-600 hover:bg-red-50 hover:border-red-200'
        : 'text-slate-800 hover:bg-brand-50 hover:border-brand-200'
    }`}>
      {icon}
      <span className="truncate">{children}</span>
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
