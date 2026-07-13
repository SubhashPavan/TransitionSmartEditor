import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Paperclip, AtSign } from 'lucide-react'

const SUGGESTIONS = [
  'Ask AI to fix, find, rewrite anything…',
  'e.g. "Make step 3 more concise"',
  'e.g. "Rename Save button to Submit everywhere"',
  'e.g. "Add a validation step after step 8"',
  'e.g. "Show all steps with low confidence"',
]

export default function ChatBar() {
  const inputRef = useRef(null)
  const [placeholder, setPlaceholder] = useState(SUGGESTIONS[0])

  useEffect(() => {
    let i = 0
    const iv = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        i = (i + 1) % SUGGESTIONS.length
        setPlaceholder(SUGGESTIONS[i])
      }
    }, 3500)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="bg-white border-t border-slate-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-purple-700 text-white flex items-center justify-center shadow-md shadow-purple-500/30 flex-shrink-0">
          <Sparkles size={16} strokeWidth={2.25} />
        </div>

        <div className="flex-1 relative">
          <input
            ref={inputRef}
            placeholder={placeholder}
            className="w-full pl-4 pr-16 h-10 border border-slate-200 rounded-xl text-[13px] bg-slate-50/60 outline-none focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-400"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button className="w-7 h-7 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center transition-colors" title="Attach">
              <Paperclip size={13} />
            </button>
            <button className="w-7 h-7 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center transition-colors" title="Mention section">
              <AtSign size={13} />
            </button>
          </div>
        </div>

        <div className="hidden lg:flex gap-1.5 overflow-x-auto whitespace-nowrap">
          <ChatSuggest>Rephrase</ChatSuggest>
          <ChatSuggest>Find &amp; replace</ChatSuggest>
          <ChatSuggest>Low-confidence only</ChatSuggest>
        </div>

        <button className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white border-none flex items-center justify-center hover:brightness-110 shadow-md shadow-brand-500/30 flex-shrink-0 transition-all" title="Send">
          <Send size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}

function ChatSuggest({ children }) {
  return (
    <span className="text-[11px] px-2.5 h-7 bg-white text-slate-700 border border-slate-200 rounded-full inline-flex items-center cursor-pointer hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-all">
      {children}
    </span>
  )
}
