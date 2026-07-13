import { useEffect } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

/**
 * DeleteImageDialog — shared modal for confirming image deletion.
 * Used from both the enlarge-modal Delete button and the hover-quick-actions
 * delete button on image thumbnails. Escape cancels, Enter confirms.
 */
export default function DeleteImageDialog({ src, alt, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white w-[440px] max-w-[calc(100vw-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900">Delete this image?</div>
            <div className="text-[11.5px] text-slate-500">The image is removed from the document. The paragraph around it stays put.</div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
            <img src={src} alt={alt || ''} className="max-w-full max-h-[180px] object-contain" />
          </div>
          {alt && (
            <div className="mt-2 text-[11.5px] text-slate-600 italic truncate" title={alt}>"{alt}"</div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-red-500 text-white hover:bg-red-600 shadow-sm inline-flex items-center gap-1.5 transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}
