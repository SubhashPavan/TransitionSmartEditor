import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, X, Play, Copy, Check } from 'lucide-react'
import * as api from '../lib/api'

/**
 * FloatingChat — a bottom-right chat bubble that expands into a chat panel
 * on click. Replaces the persistent ChatBar that never had context to work with.
 *
 * The panel shows what the AI will act on:
 *   • 1 block selected → "Working on: paragraph — first 60 chars…"
 *   • N blocks selected → "Working on: N blocks (mixed types)"
 *   • Nothing selected  → dimmed hint: "Select text in the doc first, or ask a global question."
 *
 * Send is stubbed — real wiring routes through the parent app's LLM adapter.
 * We use `onAsk({ prompt, selection })` so the caller can route by context.
 */

export default function FloatingChat({ onAsk, command, onCommandConsumed, onPlaySegment }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  // history entries: { role: 'user' | 'ai' | 'error', text, ctx?, citations? }
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  // External command (from block hover-action bar): open the panel and
  // drop the pre-filled prompt into the textarea. `command.at` is a
  // timestamp so the same-text command still fires when re-issued.
  useEffect(() => {
    if (!command) return
    setOpen(true)
    setPrompt(command.prompt || '')
    onCommandConsumed?.()
    setTimeout(() => {
      inputRef.current?.focus()
      const el = inputRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    }, 40)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.at])


  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const send = async (text) => {
    const t = (text ?? prompt).trim()
    if (!t || busy) return
    const newUserMsg = { role: 'user', text: t }
    setHistory(h => [...h, newUserMsg])
    setPrompt('')
    onAsk?.({ prompt: t })
    setBusy(true)

    try {
      // Turn our chat history into what the backend expects (role/content).
      const priorTurns = history.map(m => ({
        role:    m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      })).slice(-8)   // cap so we don't blow context
      const res = await api.chatAsk({
        question:  t,
        history:   priorTurns,
      })
      setHistory(h => [...h, {
        role:      'ai',
        text:      res.answer || '(no answer)',
        citations: res.citations || [],
      }])
    } catch (e) {
      setHistory(h => [...h, {
        role: 'error',
        text: `Chat failed: ${String(e?.message || e)}`,
      }])
    } finally {
      setBusy(false)
    }
  }

  const playCitation = (c) => {
    if (!onPlaySegment) return
    onPlaySegment({
      sourceKey: c.source_key,
      startSec:  c.start_sec,
      endSec:    c.end_sec,
    })
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // A small static set of starter prompts — shown only when there's no history yet.
  const starterPrompts = [
    'Summarize the ariba_part01 video',
    'What are the supplier risk points Guillaume mentions?',
    'List all screens the demo touches',
    'What are the key procurement challenges?',
  ]

  return (
    <>
      {/* Panel (open) — two sizes: normal (~640px wide) and maximized (fills
          most of the viewport). Both anchored to the bubble in the bottom
          right so it feels like it grew out of there. */}
      {open && (
        <div
          className="fixed top-[48px] right-6 bottom-6 w-[min(1100px,calc(100vw-320px))] bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.25)] border border-slate-200 z-40 flex flex-col animate-slide-in-right"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fuchsia-500 via-purple-500 to-purple-700 text-white flex items-center justify-center shadow-md shadow-purple-500/30">
              <Sparkles size={18} strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-slate-900">Ask AI</div>
              <div className="text-[12px] text-slate-500">
                Grounded in the video transcripts. Every claim cited.
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Conversation */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[180px]">
            {history.length === 0 ? (
              <div className="text-center text-[13px] text-slate-400 italic py-8 leading-snug">
                Try one of the suggestions below, or type your own question.
              </div>
            ) : (
              history.map((m, i) => (
                <ChatMessage key={i} m={m} onPlayCitation={playCitation} />
              ))
            )}
            {busy && (
              <div className="flex gap-2 pl-1">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white flex items-center justify-center flex-shrink-0">
                  <Sparkles size={13} />
                </div>
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-[13.5px] italic">
                  <span className="inline-flex items-center gap-2">
                    Searching the transcripts
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Starter prompts — only render before the first exchange */}
          {history.length === 0 && !busy && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
              {starterPrompts.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="text-[12.5px] px-3 h-8 bg-white text-slate-700 border border-slate-200 rounded-full inline-flex items-center hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-100 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="Ask about the videos — e.g. 'When does the demo hit the Mass Update flow?'"
              className="flex-1 min-w-0 text-[14px] text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 outline-none focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none max-h-40"
            />
            <button
              onClick={() => send()}
              disabled={!prompt.trim()}
              className="w-11 h-11 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white flex items-center justify-center hover:brightness-110 shadow-sm shadow-brand-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Send (Enter)"
            >
              <Send size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}

      {/* Bubble — pushed up so it doesn't cover the zoom pill (bottom-4 right-6). */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close Ask AI' : 'Ask AI'}
        className={`fixed bottom-20 right-6 w-14 h-14 rounded-full shadow-[0_10px_30px_rgba(147,51,234,0.35)] z-40 flex items-center justify-center text-white transition-all ${
          open
            ? 'bg-slate-800 hover:bg-slate-900 rotate-90'
            : 'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-purple-700 hover:brightness-110 hover:-translate-y-0.5'
        }`}
      >
        {open ? <X size={22} strokeWidth={2.25} /> : <Sparkles size={22} strokeWidth={2.25} />}
      </button>
    </>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */

function ChatMessage({ m, onPlayCitation }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl bg-brand-500 text-white text-[14px] leading-relaxed">
          {m.text}
        </div>
      </div>
    )
  }
  if (m.role === 'error') {
    return (
      <div className="flex gap-2">
        <div className="w-8 h-8 rounded-md bg-red-500 text-white flex items-center justify-center flex-shrink-0">
          <X size={13} />
        </div>
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[14px] leading-relaxed">
          {m.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white flex items-center justify-center flex-shrink-0">
        <Sparkles size={13} />
      </div>
      <div className="max-w-[88%] flex flex-col gap-2 group/msg">
        <div className="relative px-3.5 py-2.5 pr-10 rounded-xl bg-slate-100 text-slate-800 text-[14px] leading-relaxed">
          <FormattedAnswer text={m.text} />
          <CopyButton text={m.text} />
        </div>
        {m.citations && m.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-1">
            {m.citations.map((c, i) => (
              <button
                key={i}
                onClick={() => onPlayCitation?.(c)}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white border border-slate-200 hover:bg-brand-50 hover:border-brand-300 text-slate-700 hover:text-brand-800 text-[12px] font-semibold tabular-nums transition-colors"
                title={c.text}
              >
                <Play size={11} className="text-brand-500" />
                {c.source_key}
                <span className="text-slate-400 font-normal">·</span>
                {formatSec(c.start_sec)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSec(s) {
  if (s == null || isNaN(s)) return '—'
  const t = Math.max(0, Math.floor(s))
  const m = Math.floor(t / 60), r = t % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Small copy-to-clipboard button that sits in the top-right of an AI
 * response bubble. Idle → outlined; clicked → briefly shows a check mark.
 * Falls back to a manual `document.execCommand('copy')` for older browsers
 * where `navigator.clipboard` is unavailable.
 */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const doCopy = async (e) => {
    e.stopPropagation()
    const payload = (text || '').trim()
    if (!payload) return
    // Try modern clipboard first; on failure (denied / not focused) fall
    // back to the classic textarea + execCommand trick. Either way we
    // flip to the "Copied" state so the user sees deliberate feedback.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
      } else {
        throw new Error('no clipboard api')
      }
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = payload
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch { /* swallow — nothing we can do */ }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <button
      onClick={doCopy}
      title={copied ? 'Copied' : 'Copy response'}
      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md text-slate-400 hover:text-brand-700 hover:bg-white/80 inline-flex items-center justify-center opacity-0 group-hover/msg:opacity-100 transition-opacity"
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  )
}

/* ────────────────────────────────────────────────────────
   FormattedAnswer
   Renders an assistant response with light markdown support:
     - blank lines split into paragraphs
     - lines starting with "1." / "2." / "-" / "*" → styled list items
     - **bold**, *italic*, `code` inline
     - [MM:SS] timestamps highlighted (clickable if a handler is passed)
   Small footprint on purpose — no external markdown lib.
──────────────────────────────────────────────────────── */
function FormattedAnswer({ text, onTimestampClick }) {
  const blocks = splitIntoBlocks(text || '')
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === 'list') {
          return (
            <ul key={i} className={`space-y-1 pl-1 ${b.ordered ? 'list-decimal' : 'list-disc'} ml-4`}>
              {b.items.map((it, j) => (
                <li key={j} className="pl-1">
                  <InlineFormatted text={it} onTimestampClick={onTimestampClick} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="leading-relaxed">
            <InlineFormatted text={b.text} onTimestampClick={onTimestampClick} />
          </p>
        )
      })}
    </div>
  )
}

/** Split a chunk of text into blocks — paragraphs and lists. */
function splitIntoBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let listBuf = null   // { kind:'list', ordered:bool, items:[] }
  let paraBuf = []

  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push({ kind: 'p', text: paraBuf.join(' ') })
      paraBuf = []
    }
  }
  const flushList = () => {
    if (listBuf && listBuf.items.length) blocks.push(listBuf)
    listBuf = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }
    // Ordered: "1. text" or "1) text"
    const ol = line.match(/^(\d{1,2})[.)]\s+(.+)/)
    if (ol) {
      flushPara()
      if (!listBuf || !listBuf.ordered) { flushList(); listBuf = { kind:'list', ordered:true, items:[] } }
      listBuf.items.push(ol[2])
      continue
    }
    // Bullet: "- text" or "* text"
    const ul = line.match(/^[-*•]\s+(.+)/)
    if (ul) {
      flushPara()
      if (!listBuf || listBuf.ordered) { flushList(); listBuf = { kind:'list', ordered:false, items:[] } }
      listBuf.items.push(ul[1])
      continue
    }
    // Plain paragraph text
    flushList()
    paraBuf.push(line)
  }
  flushPara(); flushList()
  return blocks
}

/**
 * Renders inline markdown: **bold**, *italic*, `code`, and [MM:SS] timestamps.
 * The parser is regex-based to keep this dependency-free.
 */
function InlineFormatted({ text, onTimestampClick }) {
  if (!text) return null
  // Split on any of the tokens we care about, keeping the delimiters
  // so we can walk them in order.
  const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\]|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (!p) return null
    // Timestamp: [MM:SS] or [H:MM:SS]
    const tsm = p.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/)
    if (tsm) {
      const mmss = tsm[1]
      const clickable = typeof onTimestampClick === 'function'
      return (
        <span
          key={i}
          className={`inline-flex items-center h-5 px-1.5 mx-0.5 rounded-full bg-brand-50 text-brand-800 text-[11.5px] font-semibold tabular-nums align-baseline ${clickable ? 'cursor-pointer hover:bg-brand-100' : ''}`}
          onClick={clickable ? () => onTimestampClick(mmss) : undefined}
          title={clickable ? 'Jump to this moment' : undefined}
        >
          {mmss}
        </span>
      )
    }
    // Bold **text**
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
    }
    // Italic *text*
    if (p.startsWith('*') && p.endsWith('*') && !p.startsWith('**') && p.length > 2) {
      return <em key={i} className="italic">{p.slice(1, -1)}</em>
    }
    // Code `text`
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-200 text-slate-800 text-[12.5px] font-mono">
          {p.slice(1, -1)}
        </code>
      )
    }
    // Plain text
    return <span key={i}>{p}</span>
  })
}

/* ────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────── */
