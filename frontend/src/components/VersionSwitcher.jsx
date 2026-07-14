import { useState, useRef, useEffect } from 'react'
import {
  GitBranch, ChevronDown, ChevronRight,
  Sparkles, Pencil, ShieldCheck, Check, History, Lock,
} from 'lucide-react'

/**
 * Version switcher — pinned to the title bar. Shows the three-version
 * model with checkpoints nested under Human Edits:
 *
 *   ✨ AI Base            (immutable, read-only)
 *   ✏️  Human Edits        (live editable — this is where checkpoints live)
 *       ├ 📌 Checkpoint N
 *       ├ 📌 Checkpoint N-1
 *       └ ...
 *   ✅ Approved Final     (upload target)
 *
 * The versions array is flat — checkpoints are marked with `isCheckpoint: true`
 * and are rendered indented under Human Edits.
 */
export default function VersionSwitcher({
  current,
  versions,
  onSelect,
}) {
  const [open, setOpen] = useState(false)
  const [checkpointsExpanded, setCheckpointsExpanded] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!versions || versions.length === 0) return null

  const active = versions.find(v => v.id === current) || versions.find(v => v.id === 'current') || versions[0]
  const activeIsCheckpoint = active.isCheckpoint

  // Split into three groups
  const ai        = versions.find(v => v.id === 'ai')
  const human     = versions.find(v => v.id === 'current')
  const cps       = versions.filter(v => v.isCheckpoint)
  const approved  = versions.find(v => v.isApproved)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-white/95 text-slate-800 px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-2 hover:bg-white shadow-sm transition-colors"
        title="Switch document version"
      >
        <GitBranch size={12} className="text-brand-600" />
        <span className="text-slate-500 uppercase tracking-wider text-[9.5px]">Version ·</span>
        <VersionIcon icon={active.icon} className="text-slate-600" size={11} />
        <span className="max-w-[160px] truncate">{active.name}</span>
        <ChevronDown size={11} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[380px] bg-white rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.20)] border border-slate-100 overflow-hidden z-40 animate-fade-in">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="text-[10.5px] tracking-widest uppercase text-slate-500 font-bold">Document Versions</div>
            <div className="text-[11px] text-slate-500 mt-0.5">AI Base is immutable. Edits happen on Human Edits. Approved is offline.</div>
          </div>

          <div className="p-1.5 max-h-[440px] overflow-y-auto">
            {/* AI Base */}
            {ai && (
              <VersionRow
                version={ai}
                active={current === 'ai'}
                onSelect={() => { onSelect(ai.id); setOpen(false) }}
              />
            )}

            {/* Human Edits + nested checkpoints */}
            {human && (
              <>
                <VersionRow
                  version={human}
                  active={current === 'current'}
                  onSelect={() => { onSelect(human.id); setOpen(false) }}
                />
                {cps.length > 0 && (
                  <div className="ml-3 pl-3 border-l border-slate-200 mt-1 mb-1">
                    <button
                      onClick={() => setCheckpointsExpanded(e => !e)}
                      className="w-full flex items-center gap-1 text-[10.5px] text-slate-500 font-bold tracking-widest uppercase px-2 py-1 hover:text-slate-700 transition-colors"
                    >
                      {checkpointsExpanded
                        ? <ChevronDown  size={9} />
                        : <ChevronRight size={9} />}
                      Checkpoints ({cps.length})
                    </button>
                    {checkpointsExpanded && cps.map(cp => (
                      <CheckpointRow
                        key={cp.id}
                        cp={cp}
                        active={current === cp.id}
                        onSelect={() => { onSelect(cp.id); setOpen(false) }}
                      />
                    ))}
                  </div>
                )}
                {cps.length === 0 && (
                  <div className="ml-3 pl-3 border-l border-slate-200 mt-1 mb-2 px-2 py-1.5 text-[10.5px] text-slate-400 italic">
                    No checkpoints yet. Click <b>Save Checkpoint</b> in the Review tab to snapshot the current draft.
                  </div>
                )}
              </>
            )}

            {/* Approved Final */}
            {approved && (
              <VersionRow
                version={approved}
                active={current === 'approved'}
                onSelect={() => { onSelect(approved.id); setOpen(false) }}
              />
            )}
          </div>

        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */

function VersionRow({ version, active, onSelect }) {
  const iconTone = version.id === 'ai'       ? 'bg-purple-100 text-purple-700'
                 : version.id === 'current'  ? 'bg-brand-100 text-brand-700'
                 : version.id === 'approved' ? (version.disabled ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-700')
                 : 'bg-slate-100 text-slate-600'

  return (
    <button
      onClick={onSelect}
      disabled={version.disabled}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
        active
          ? 'bg-brand-50 ring-1 ring-brand-200'
          : version.disabled
          ? 'text-slate-400 cursor-not-allowed'
          : 'hover:bg-slate-50'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconTone}`}>
        <VersionIcon icon={version.icon} size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-800 flex items-center gap-1.5">
          {version.name}
          {active && <Check size={12} className="text-brand-600" />}
          {version.id === 'ai' && <Lock size={10} className="text-slate-400" />}
        </div>
        <div className="text-[11px] text-slate-500 leading-snug">{version.description}</div>
        {version.meta && (
          <div className="text-[10px] text-slate-400 mt-1 tabular-nums">{version.meta}</div>
        )}
      </div>
    </button>
  )
}

function CheckpointRow({ cp, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
        active ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-slate-50'
      }`}
    >
      <History size={11} className={active ? 'text-amber-700 mt-0.5' : 'text-slate-500 mt-0.5'} />
      <div className="flex-1 min-w-0">
        <div className={`text-[11.5px] font-medium flex items-center gap-1 ${active ? 'text-amber-900' : 'text-slate-800'}`}>
          <span className="truncate">{cp.name}</span>
          {active && <Check size={10} className="text-amber-600" />}
        </div>
        {cp.meta && (
          <div className="text-[9.5px] text-slate-500 mt-0.5 tabular-nums">{cp.meta}</div>
        )}
      </div>
    </button>
  )
}

function VersionIcon({ icon, size = 14, className = '' }) {
  switch (icon) {
    case 'sparkles':    return <Sparkles    size={size} className={className} />
    case 'pencil':      return <Pencil      size={size} className={className} />
    case 'shieldcheck': return <ShieldCheck size={size} className={className} />
    case 'history':     return <History     size={size} className={className} />
    default:            return <GitBranch   size={size} className={className} />
  }
}

/* Legacy export for any importers still on the old shape — no longer used
   by Editor.jsx; kept as a safety net that returns an empty list. */
export const DEFAULT_VERSIONS = []
