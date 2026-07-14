import { useEffect, useMemo, useState } from 'react'
import {
  X, Wand2, Check, RotateCcw, Sparkles, ArrowRight,
  ChevronDown, Copy,
} from 'lucide-react'

/**
 * AIActionModal — the single AI-Edit dialog. What used to be three
 * separate actions (rewrite / rephrase / add detail) is now one flow:
 * a free-text instruction plus tone/length controls, driving the same
 * two-column preview + accept UX.
 *
 * Props:
 *   action        — always 'edit' (kept as a prop so future actions can slot in)
 *   block         — { id, kind, text, el }
 *   onCancel      — close without applying
 *   onAccept(newText) — parent overwrites block content with the accepted text
 *   onGenerate    — real LLM adapter, async ({action, instruction, tone, length, block}) → text
 */
const EDIT_CONFIG = {
  title:    'AI Edit',
  subtitle: 'Rewrite, rephrase, or expand — tell the AI what to change',
  icon:     <Wand2 size={18} />,
  tone:     'from-brand-500 to-purple-600',
  accent:   'brand',
  tones:    ['Same', 'Formal', 'Casual', 'Technical', 'Simpler'],
  lengths:  ['Same', 'Shorter', 'Longer', 'Expand with detail'],
  quickPrompts: [
    { label: 'Make it clearer',     text: 'Make this clearer and easier to follow.' },
    { label: 'Tighten wording',     text: 'Tighten the wording and cut redundant phrasing.' },
    { label: 'Add a concrete example', text: 'Add a concrete example that illustrates the point.' },
    { label: 'Add compliance context', text: 'Add relevant compliance / audit context.' },
    { label: 'Fix grammar & tone',  text: 'Fix grammar and tighten the professional tone.' },
  ],
}

export default function AIActionModal({ block, onCancel, onAccept, onGenerate }) {
  const config = EDIT_CONFIG
  const [tone, setTone]     = useState(config.tones[0])
  const [length, setLength] = useState(config.lengths[0])
  const [instruction, setInstruction] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle')  // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError]   = useState('')
  const [history, setHistory] = useState([])    // stack of prior outputs for "Show previous"

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const originalText = block?.text || ''

  const runGenerate = async () => {
    setStatus('loading')
    setError('')
    try {
      const gen = onGenerate
        ? await onGenerate({ action: 'edit', instruction, tone, length, originalText, block })
        : await mockGenerate(originalText, { instruction, tone, length })
      if (output) setHistory(h => [output, ...h].slice(0, 5))
      setOutput(gen)
      setStatus('ready')
    } catch (e) {
      setError(String(e?.message || e))
      setStatus('error')
    }
  }

  const accept = () => {
    if (!output) return
    onAccept?.(output)
  }

  const copyOutput = () => {
    if (!output) return
    navigator.clipboard?.writeText(output).catch(() => {})
  }

  const accentBg = {
    purple:  'bg-purple-500 hover:bg-purple-600 shadow-purple-500/30',
    brand:   'bg-brand-500 hover:bg-brand-600 shadow-brand-500/30',
    emerald: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30',
  }[config.accent] || 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/30'

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white w-[880px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.tone} text-white flex items-center justify-center shadow-md`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold text-slate-900">{config.title}</div>
            <div className="text-[11.5px] text-slate-500">
              {config.subtitle} · <span className="uppercase tracking-widest font-semibold text-slate-400">{block?.kind || 'block'}</span>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Instruction row — free-text, drives everything */}
        <div className="px-5 py-3 bg-brand-50/40 border-b border-brand-100/60 flex items-center gap-3 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-700 flex-shrink-0">
            Instruction
          </span>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runGenerate() } }}
            placeholder='e.g. "make it more concise", "add compliance context", "expand with an Ariba screen example"'
            className="flex-1 min-w-0 h-9 px-3 rounded-md border border-brand-200 text-[12.5px] text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
          />
          <button
            onClick={runGenerate}
            disabled={status === 'loading'}
            className="h-9 px-3.5 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/30 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            title="Enter also regenerates"
          >
            <RotateCcw size={12} className={status === 'loading' ? 'animate-spin' : ''} />
            {status === 'loading' ? 'Working…' : output ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {/* Tone / length controls + quick-prompt chips */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-4 flex-shrink-0 flex-wrap">
          <ControlChip label="Tone"   value={tone}   options={config.tones}   onChange={setTone} />
          <ControlChip label="Length" value={length} options={config.lengths} onChange={setLength} />
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {config.quickPrompts.map(qp => (
              <button
                key={qp.label}
                onClick={() => setInstruction(qp.text)}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                title={qp.text}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0 divide-x divide-slate-100">
          {/* Original */}
          <div className="p-5 overflow-y-auto flex flex-col">
            <SectionHead label="Original" />
            <div className="flex-1 mt-2 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-[13px] leading-[1.65] text-slate-800 whitespace-pre-wrap">
              {originalText || <span className="italic text-slate-400">(empty block)</span>}
            </div>
          </div>

          {/* AI suggestion */}
          <div className="p-5 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between">
              <SectionHead label="AI suggestion" />
              {status === 'ready' && output && (
                <button
                  onClick={copyOutput}
                  className="text-[10.5px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                  title="Copy to clipboard"
                >
                  <Copy size={11} /> Copy
                </button>
              )}
            </div>
            <div className={`flex-1 mt-2 rounded-lg border px-4 py-3 text-[13px] leading-[1.65] whitespace-pre-wrap transition-colors ${
              status === 'loading' ? 'bg-slate-50/60 border-slate-100 text-slate-400 italic' :
              status === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
              'bg-white border-slate-200 text-slate-900'
            }`}>
              {status === 'loading' && (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={12} className="animate-pulse text-purple-500" />
                  Generating…
                </span>
              )}
              {status === 'error' && `Failed to generate: ${error}`}
              {status === 'ready' && (output || <span className="italic text-slate-400">(empty response)</span>)}
            </div>

            {/* Diff hint */}
            {status === 'ready' && output && (
              <div className="mt-2 text-[10.5px] text-slate-500 flex items-center gap-1.5 tabular-nums">
                <ArrowRight size={10} />
                {countWords(originalText)}w → {countWords(output)}w
                {history.length > 0 && <> · {history.length} previous version{history.length === 1 ? '' : 's'} in this session</>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={accept}
            disabled={status !== 'ready' || !output}
            className={`h-9 px-5 rounded-md text-[12.5px] font-semibold text-white shadow-sm inline-flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${accentBg}`}
          >
            <Check size={13} /> Replace block
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */
function ControlChip({ label, value, options, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
      <span className="uppercase tracking-widest font-bold text-slate-400 text-[10px]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 pl-2.5 pr-7 rounded border border-slate-200 text-[12px] bg-white text-slate-800 appearance-none hover:border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </label>
  )
}

function SectionHead({ label }) {
  return (
    <div className="text-[9.5px] font-bold tracking-widest uppercase text-slate-500">{label}</div>
  )
}

/* ────────────────────────────────────────────────────────
   Stub generator — swap for a real LLM adapter via `onGenerate`.
   Only runs in standalone/dev use; production always hits the API.
──────────────────────────────────────────────────────── */
async function mockGenerate(text, { instruction, tone, length }) {
  await new Promise(r => setTimeout(r, 550 + Math.random() * 300))
  if (!text) return ''
  let out = text
  const swaps = { 'in order to': 'to', 'utilize': 'use', 'demonstrates': 'shows', 'facilitates': 'enables', 'various': 'several', 'assist': 'help' }
  for (const [k, v] of Object.entries(swaps)) out = out.replace(new RegExp(`\\b${k}\\b`, 'gi'), v)
  if (tone === 'Formal') out = out.replace(/\b(get|got)\b/g, 'obtain').replace(/\b(kind of|sort of)\b/gi, '')
  if (tone === 'Casual') out = out.replace(/\butilize\b/g, 'use').replace(/\bcommence\b/g, 'start')
  if (length === 'Shorter') {
    const words = out.split(/\s+/)
    out = words.slice(0, Math.max(3, Math.floor(words.length * 0.7))).join(' ') + '.'
  }
  if (length === 'Longer') {
    out = out + ' This step is important because it directly impacts downstream reliability.'
  }
  if (length === 'Expand with detail') {
    const hint = (instruction || '').trim()
    out = out + (hint ? ` Specifically, ${hint.replace(/[.!?]+$/, '')}.` : '') +
      ' In practice this involves coordinating with adjacent teams and validating against the source-of-truth dataset.'
  }
  return out
}

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}
