import { useEffect, useRef, useState } from 'react'
import { Save, X, History, Info } from 'lucide-react'

/**
 * CheckpointDialog — modal that opens when the user clicks "Save Checkpoint".
 *
 * Word doesn't have this concept, but it's how our reviewers freeze a
 * snapshot of the Human Edits so they can revert to it later. This dialog
 * asks for a name + optional note, shows the running checkpoint list for
 * context, and confirms before actually snapshotting.
 *
 * Props:
 *   open              — controls visibility
 *   onClose           — parent closes the dialog
 *   onSave(label)     — parent commits the checkpoint (does the DOM snapshot)
 *   checkpointCount   — how many checkpoints already exist (for the default name)
 *   editCount         — how many blocks the reviewer has touched
 *   sessionActiveMs   — elapsed session time (shown so they know they've done real work)
 *   recentCheckpoints — the last few checkpoints for the "Recent" list
 */
export default function CheckpointDialog({
  open,
  onClose,
  onSave,
  checkpointCount = 0,
  editCount = 0,
  sessionActiveMs = 0,
  recentCheckpoints = [],
}) {
  const [label, setLabel] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // Pre-fill with a sensible default the user can accept with Enter
    setLabel(`Checkpoint ${checkpointCount + 1}`)
    // Focus + select all so typing overwrites the default in one keystroke
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
  }, [open, checkpointCount])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const trimmed = label.trim()
    if (!trimmed) return
    onSave(trimmed)
    setLabel('')
    onClose()
  }

  if (!open) return null

  const activeMinutes = Math.floor(sessionActiveMs / 60000)

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[480px] max-w-[calc(100vw-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.30)] overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center">
            <Save size={16} className="text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900">Save Checkpoint</div>
            <div className="text-[11.5px] text-slate-500">Freeze the current Human Edits so you can revert here later.</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            {/* Snapshot context */}
            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-[11.5px] text-slate-600">
              <Info size={12} className="text-slate-400 flex-shrink-0" />
              <span>
                Snapshot includes <b>{editCount}</b> block{editCount === 1 ? '' : 's'} edited
                {activeMinutes > 0 && <> · <b>{activeMinutes}m</b> of active review time</>}
              </span>
            </div>

            {/* Name field */}
            <label className="block text-[10.5px] font-bold tracking-widest uppercase text-slate-500 mb-1.5">
              Checkpoint name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "Post-legal review" or "Draft 2"'
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
            />
            <div className="mt-1.5 text-[10.5px] text-slate-400">
              Enter to save · Escape to cancel
            </div>

            {/* Recent checkpoints */}
            {recentCheckpoints.length > 0 && (
              <div className="mt-4">
                <div className="text-[10.5px] font-bold tracking-widest uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <History size={11} />
                  Recent checkpoints
                </div>
                <div className="rounded-lg border border-slate-100 max-h-[132px] overflow-y-auto divide-y divide-slate-100">
                  {recentCheckpoints.slice(0, 4).map(cp => (
                    <div key={cp.id} className="px-3 py-1.5 flex items-center gap-2 text-[11.5px]">
                      <History size={11} className="text-slate-400 flex-shrink-0" />
                      <span className="flex-1 truncate text-slate-800">{cp.label || cp.name}</span>
                      <span className="text-[10.5px] text-slate-400 tabular-nums">
                        {new Date(cp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-md text-[12px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="h-8 px-4 rounded-md text-[12px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm inline-flex items-center gap-1.5 transition-colors"
            >
              <Save size={12} /> Save Checkpoint
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
