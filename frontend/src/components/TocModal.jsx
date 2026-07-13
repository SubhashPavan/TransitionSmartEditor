import { useEffect, useState } from 'react'
import { X, ListTree, RefreshCw, ArrowRight } from 'lucide-react'
import { collectHeadings } from '../lib/editorCommands'

export default function TocModal({ open, onClose }) {
  const [toc, setToc] = useState([])

  useEffect(() => {
    if (open) setToc(collectHeadings())
  }, [open])

  if (!open) return null

  const jump = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 text-[14px] font-semibold text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <ListTree size={16} className="text-brand-600" />
            </div>
            Table of Contents
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {toc.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-[13px]">
              No headings found in this document.
              <div className="text-[11.5px] text-slate-400 mt-1">Apply <b>Heading 1</b> / <b>Heading 2</b> styles from the ribbon to build a TOC.</div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {toc.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { jump(h.id); onClose() }}
                  className={`w-full flex items-baseline gap-2 px-2.5 py-1.5 rounded-md hover:bg-brand-50 group text-left ${
                    h.level === 1 ? 'font-semibold text-slate-900'
                    : h.level === 2 ? 'font-medium text-slate-800 pl-6'
                    : 'text-slate-600 pl-10'
                  } text-[12.5px] transition-colors`}
                >
                  <span className="flex-1 truncate">{h.text}</span>
                  <span className="flex-1 border-b border-dotted border-slate-300 mx-2 mb-1"></span>
                  <span className="text-slate-400 text-[11px] tabular-nums group-hover:text-brand-600">{i + 1}</span>
                  <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 text-brand-500 -mb-0.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => setToc(collectHeadings())}
            className="text-[11.5px] text-slate-500 hover:text-brand-600 inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            <RefreshCw size={11} /> Refresh
          </button>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {toc.length} entries · {toc.filter(h => h.level === 1).length} sections
          </span>
        </div>
      </div>
    </div>
  )
}
