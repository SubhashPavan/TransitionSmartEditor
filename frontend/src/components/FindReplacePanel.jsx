import { useEffect, useRef, useState } from 'react'
import { X, Search, Replace, ChevronUp, ChevronDown } from 'lucide-react'
import { findAll, findNext, replaceCurrent, replaceAll, clearFind } from '../lib/editorCommands'

/**
 * Word-style Find & Replace panel — floats top-right of the editor.
 * Live-highlights matches as you type, arrow keys cycle, R replaces.
 */
export default function FindReplacePanel({ open, mode = 'find', onClose }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [count, setCount] = useState(0)
  const [current, setCurrent] = useState(0)
  const [showReplace, setShowReplace] = useState(mode === 'replace')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setShowReplace(mode === 'replace')
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      clearFind()
      setQuery('')
      setReplacement('')
      setCount(0)
      setCurrent(0)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const n = findAll(query)
    setCount(n)
    setCurrent(0)
    if (n > 0) {
      const info = findNext(1)
      if (info) setCurrent(info.index)
    }
  }, [query, open])

  const goNext = () => {
    const info = findNext(1)
    if (info) setCurrent(info.index)
  }
  const goPrev = () => {
    const info = findNext(-1)
    if (info) setCurrent(info.index)
  }
  const doReplaceOne = () => {
    if (replaceCurrent(replacement)) {
      // Refresh matches (positions shift after replace)
      const n = findAll(query)
      setCount(n)
      const info = findNext(1)
      if (info) setCurrent(info.index)
    }
  }
  const doReplaceAll = () => {
    const n = replaceAll(replacement)
    setCount(0)
    setCurrent(0)
    alert(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`)
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() }
  }

  if (!open) return null

  return (
    <div className="fixed top-[92px] right-6 z-40 bg-white rounded-xl shadow-[0_10px_40px_rgba(15,23,42,0.20)] border border-slate-200 p-3 w-[380px]">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
          <Search size={14} className="text-brand-600" />
          {showReplace ? 'Find & Replace' : 'Find'}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Find in document…"
            className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12.5px] text-slate-900 placeholder:text-slate-400"
          />
          {query && (
            <span className="text-[10.5px] text-slate-500 tabular-nums flex-shrink-0">
              {count === 0 ? 'No matches' : `${current}/${count}`}
            </span>
          )}
        </div>
        <button
          title="Previous (Shift+Enter)"
          onClick={goPrev}
          disabled={count === 0}
          className="w-7 h-7 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-colors"
        >
          <ChevronUp size={14} strokeWidth={2.25} />
        </button>
        <button
          title="Next (Enter)"
          onClick={goNext}
          disabled={count === 0}
          className="w-7 h-7 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-colors"
        >
          <ChevronDown size={14} strokeWidth={2.25} />
        </button>
      </div>

      {showReplace ? (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replace with…"
              className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12.5px] text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={doReplaceOne}
            disabled={count === 0}
            className="h-7 px-2.5 rounded text-[11.5px] font-semibold border border-slate-200 text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            Replace
          </button>
          <button
            onClick={doReplaceAll}
            disabled={count === 0}
            className="h-7 px-2.5 rounded text-[11.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-30 disabled:hover:bg-brand-500 shadow-sm transition-colors"
          >
            All
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowReplace(true)}
          className="mt-2 text-[11.5px] text-brand-600 font-medium hover:text-brand-700 inline-flex items-center gap-1 transition-colors"
        >
          <Replace size={11} /> Show replace
        </button>
      )}
    </div>
  )
}
