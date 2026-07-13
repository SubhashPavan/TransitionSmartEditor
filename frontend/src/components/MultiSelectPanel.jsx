import {
  Layers, X, Sparkles, Check,
  Scissors, Feather, GraduationCap, Repeat,
  Merge, Trash2, Flag, FolderInput,
  Type as TypeIcon, List as ListIcon, Pencil, Heading,
} from 'lucide-react'

const TYPE_META = {
  paragraph: { icon: <TypeIcon size={11} />,   label: 'Paragraph', color: 'text-brand-600 bg-brand-50' },
  heading:   { icon: <Heading size={11} />,    label: 'Heading',   color: 'text-purple-600 bg-purple-50' },
  list:      { icon: <ListIcon size={11} />,   label: 'List',      color: 'text-emerald-600 bg-emerald-50' },
  step:      { icon: <Pencil size={11} />,     label: 'Step',      color: 'text-orange-600 bg-orange-50' },
}

export default function MultiSelectPanel({ selection, onClose }) {
  const count = selection.length
  const byType = selection.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13.5px] font-semibold text-slate-900 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/25">
            <Layers size={13} strokeWidth={2.5} />
          </div>
          Multi-select
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Clear selection"
        >
          <X size={14} />
        </button>
      </div>

      {/* Count summary */}
      <div className="bg-gradient-to-br from-brand-50 via-white to-purple-50 border border-brand-100 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-baseline gap-2">
          <div className="text-[28px] font-bold text-brand-700 leading-none tabular-nums">{count}</div>
          <div className="text-[12px] text-slate-600 font-medium">blocks selected</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {Object.entries(byType).map(([t, n]) => {
            const meta = TYPE_META[t]
            if (!meta) return null
            return (
              <span key={t} className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10.5px] font-semibold ${meta.color}`}>
                {meta.icon}
                {n} {meta.label}{n > 1 ? 's' : ''}
              </span>
            )
          })}
        </div>
      </div>

      {/* Selected blocks list — scrollable snippet preview */}
      <SubHead>Selected content</SubHead>
      <div className="space-y-1.5 mb-4 max-h-[180px] overflow-y-auto pr-1">
        {selection.map((s, i) => (
          <SelectionRow key={s.id} index={i + 1} block={s} />
        ))}
      </div>

      <SubHead>Batch rewrites</SubHead>
      <QuickGrid>
        <QuickAction icon={<Scissors size={13} className="text-brand-500" />}>Make shorter</QuickAction>
        <QuickAction icon={<Feather size={13} className="text-brand-500" />}>Simpler</QuickAction>
        <QuickAction icon={<GraduationCap size={13} className="text-brand-500" />}>More formal</QuickAction>
        <QuickAction icon={<Repeat size={13} className="text-brand-500" />}>Rephrase all</QuickAction>
      </QuickGrid>

      {/* Combined AI preview */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 mt-3 shadow-sm">
        <div className="text-[9.5px] font-bold text-emerald-700 tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
          <Sparkles size={11} />
          Combined preview · "Make shorter"
        </div>
        <div className="text-[12px] text-emerald-950 leading-relaxed">
          {count} block{count > 1 ? 's' : ''} rewritten — combined saving ~
          <b>{Math.floor(count * 24)}</b> words. Existing structure preserved.
        </div>
      </div>

      <SubHead>Structural</SubHead>
      <QuickGrid>
        <QuickAction icon={<Merge size={13} className="text-slate-500" />}>Merge into one</QuickAction>
        <QuickAction icon={<FolderInput size={13} className="text-slate-500" />}>Move to section</QuickAction>
        <QuickAction icon={<Flag size={13} className="text-amber-500" />}>Flag for lead</QuickAction>
        <QuickAction icon={<Trash2 size={13} />} danger>Delete all</QuickAction>
      </QuickGrid>

      {/* Actions */}
      <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
        <ActionBtn onClick={onClose}>Cancel</ActionBtn>
        <ActionBtn tone="primary" icon={<Check size={12} />}>Apply to all</ActionBtn>
      </div>

      {/* Modifier-key hint */}
      <div className="mt-3 text-[10.5px] text-slate-400 text-center leading-snug">
        Ctrl / Cmd / Shift + click any block to add or remove it from the selection.
      </div>
    </div>
  )
}

function SelectionRow({ index, block }) {
  const meta = TYPE_META[block.type] || TYPE_META.paragraph
  const snippet = (block.text || '').trim().slice(0, 80) || '(empty)'
  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-white hover:border-slate-200 transition-colors">
      <div className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 tabular-nums flex-shrink-0 mt-0.5">
        {index}
      </div>
      <span className={`inline-flex items-center gap-1 px-1.5 h-4 rounded text-[9px] font-bold flex-shrink-0 mt-1 ${meta.color}`}>
        {meta.icon}
        {meta.label.toUpperCase()}
      </span>
      <div className="text-[11.5px] text-slate-700 leading-snug flex-1 line-clamp-2 italic">
        {snippet}{block.text?.length > 80 ? '…' : ''}
      </div>
    </div>
  )
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

function ActionBtn({ children, tone, icon, onClick }) {
  const styles = {
    primary: 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600 shadow-sm shadow-brand-500/20',
  }
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 transition-all ${styles[tone] || ''}`}
    >
      {icon}{children}
    </button>
  )
}
