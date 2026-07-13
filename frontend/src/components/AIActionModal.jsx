import { useEffect, useMemo, useState } from 'react'
import {
  X, Wand2, RefreshCw, Plus, Check, RotateCcw, Sparkles, ArrowRight,
  ChevronDown, Copy,
} from 'lucide-react'

/**
 * AIActionModal — unified two-column dialog for Rewrite / Rephrase /
 * Add detail. Shows original text on the left and AI-generated variants
 * on the right, with tone and length controls plus regenerate + accept.
 *
 * Backend integration: `onGenerate(prompt) → string` is where you plug
 * the LLM adapter. If left undefined, the modal uses a lightweight
 * client-side stub so the UI is fully browseable.
 *
 * Props:
 *   action        — 'rewrite' | 'rephrase' | 'add-detail'
 *   block         — { id, kind, text, el }
 *   onCancel      — close without applying
 *   onAccept(newText) — parent overwrites block content with the accepted text
 *   onGenerate    — optional real LLM adapter, async prompt → text
 */
const ACTIONS = {
  rewrite: {
    title: 'Rewrite',
    subtitle: 'Turn this block into a cleaner version',
    icon:  <Wand2 size={18} />,
    tone:  'from-purple-500 to-purple-700',
    accent:'purple',
    tones: ['Similar', 'Concise', 'Formal', 'Casual', 'Technical'],
    lengths: ['Match', 'Shorter', 'Longer'],
    prompt: (t, opts) => `Rewrite the following ${opts.blockKind} in a ${opts.tone.toLowerCase()} tone (${opts.length.toLowerCase()} length):\n"${t}"`,
  },
  rephrase: {
    title: 'Rephrase',
    subtitle: 'Same content, different wording',
    icon:  <RefreshCw size={18} />,
    tone:  'from-brand-500 to-brand-700',
    accent:'brand',
    tones: ['Neutral', 'Formal', 'Casual', 'Technical', 'Simpler'],
    lengths: ['Match'],
    prompt: (t, opts) => `Rephrase the following ${opts.blockKind} using ${opts.tone.toLowerCase()} language:\n"${t}"`,
  },
  'add-detail': {
    title: 'Add detail',
    subtitle: 'Expand this with more context and specifics',
    icon:  <Plus size={18} />,
    tone:  'from-emerald-500 to-emerald-700',
    accent:'emerald',
    tones: ['Neutral', 'Technical', 'Illustrative', 'Example-driven'],
    lengths: ['+1 sentence', '+2–3 sentences', 'Paragraph'],
    prompt: (t, opts) => {
      const hint = opts.missingHint?.trim()
      const hintClause = hint ? ` The reader is missing: ${hint}.` : ''
      return `Add ${opts.length.toLowerCase()} of ${opts.tone.toLowerCase()} detail to the following ${opts.blockKind}, keeping the original intact.${hintClause}\n"${t}"`
    },
  },
}

export default function AIActionModal({ action, block, onCancel, onAccept, onGenerate }) {
  const config = ACTIONS[action]
  const [tone, setTone]     = useState(config.tones[0])
  const [length, setLength] = useState(config.lengths[0])
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle')  // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError]   = useState('')
  const [history, setHistory] = useState([])    // stack of prior outputs for "Show previous"
  const [missingHint, setMissingHint] = useState('')  // add-detail only — tells the AI what's missing

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const originalText = block?.text || ''
  const prompt = useMemo(
    () => config.prompt(originalText, { tone, length, missingHint, blockKind: block?.kind || 'block' }),
    [config, originalText, tone, length, missingHint, block?.kind]
  )

  const runGenerate = async () => {
    setStatus('loading')
    setError('')
    try {
      // Prefer the parent's real LLM adapter — pass structured params so it
      // doesn't need to parse our fallback prompt. Fall back to the local
      // mock for standalone use.
      const gen = onGenerate
        ? await onGenerate({ prompt, action, tone, length, missingHint, originalText, block })
        : await mockGenerate(action, originalText, { tone, length, missingHint })
      if (output) setHistory(h => [output, ...h].slice(0, 5))
      setOutput(gen)
      setStatus('ready')
    } catch (e) {
      setError(String(e?.message || e))
      setStatus('error')
    }
  }

  // Auto-run first generation on open — except for Add detail, where we
  // wait for the user to type what's missing so the first result is useful.
  useEffect(() => {
    if (action !== 'add-detail') runGenerate()
    /* eslint-disable-next-line */
  }, [])

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

        {/* Tone / length controls */}
        <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center gap-4 flex-shrink-0 flex-wrap">
          <ControlChip label="Tone" value={tone} options={config.tones} onChange={setTone} />
          {config.lengths.length > 1 && (
            <ControlChip label="Length" value={length} options={config.lengths} onChange={setLength} />
          )}
          <button
            onClick={runGenerate}
            disabled={status === 'loading'}
            className="ml-auto h-8 px-3 rounded-md text-[12px] font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            title="Regenerate with current settings"
          >
            <RotateCcw size={12} className={status === 'loading' ? 'animate-spin' : ''} />
            Regenerate
          </button>
        </div>

        {/* Missing-detail hint — only for the Add detail action */}
        {action === 'add-detail' && (
          <div className="px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100/60 flex items-center gap-3 flex-shrink-0">
            <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-700 flex-shrink-0">
              What's missing?
            </span>
            <input
              value={missingHint}
              onChange={(e) => setMissingHint(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runGenerate() } }}
              placeholder='In one sentence: e.g. "mention the Ariba screen name" or "add compliance context"'
              className="flex-1 min-w-0 h-8 px-3 rounded border border-emerald-200 text-[12px] text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
            />
            <span className="text-[10.5px] text-slate-500 hidden sm:inline">Enter to regenerate</span>
          </div>
        )}

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
   Stub generator — swap for a real LLM adapter via `onGenerate`
──────────────────────────────────────────────────────── */
async function mockGenerate(action, text, { tone, length, missingHint }) {
  // Small artificial delay so the loading spinner is visible
  await new Promise(r => setTimeout(r, 550 + Math.random() * 300))
  if (!text) return ''
  if (action === 'rewrite') {
    const swaps = { 'in order to': 'to', 'utilize': 'use', 'demonstrates': 'shows', 'facilitates': 'enables', 'various': 'several', 'assist': 'help' }
    let out = text
    for (const [k, v] of Object.entries(swaps)) out = out.replace(new RegExp(`\\b${k}\\b`, 'gi'), v)
    if (tone === 'Formal') out = out.replace(/\b(get|got)\b/g, 'obtain').replace(/\b(kind of|sort of)\b/gi, '')
    if (tone === 'Casual') out = out.replace(/\butilize\b/g, 'use').replace(/\bcommence\b/g, 'start')
    if (length === 'Shorter') out = shorten(out, 0.7)
    if (length === 'Longer')  out = out + ' This is particularly important because it directly impacts downstream reliability.'
    return out
  }
  if (action === 'rephrase') {
    const first = text.replace(/^\s*([A-Z][a-z]+)/, (m, w) => tone === 'Casual' ? "Basically, " + w.toLowerCase() : "Notably, " + w.toLowerCase())
    return first
  }
  if (action === 'add-detail') {
    const hint = (missingHint || '').trim()
    const hintPhrase = hint ? ` Specifically, ${hint.replace(/[.!?]+$/, '')}.` : ''
    const tail = length === '+1 sentence'
      ? ` In practice, this typically involves coordinating with adjacent teams and validating the change against the source-of-truth dataset.${hintPhrase}`
      : length === '+2–3 sentences'
      ? ` In practice, this typically involves coordinating with adjacent teams and validating the change against the source-of-truth dataset.${hintPhrase} The result is a repeatable process that reduces manual rework and shortens the review cycle.`
      : ` In practice, this typically involves coordinating with adjacent teams and validating the change against the source-of-truth dataset.${hintPhrase} The result is a repeatable process that reduces manual rework and shortens the review cycle. Teams following this pattern have reported 30–50% reductions in review time, with corresponding improvements in first-pass acceptance rates.`
    return text + tail
  }
  return text
}

function shorten(text, ratio) {
  const words = text.split(/\s+/)
  return words.slice(0, Math.max(3, Math.floor(words.length * ratio))).join(' ') + (ratio < 1 ? '.' : '')
}

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}
