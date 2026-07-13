import { useMemo, useState } from 'react'
import {
  X, BarChart3, Sparkles, Pencil, ShieldCheck, ChevronDown, Info,
} from 'lucide-react'
import { computeMetrics, formatDelta, htmlToText } from '../lib/textMetrics'
import { snapshotCurrentDocumentHtml } from '../lib/docLoader'
import { formatMs, totalActiveMs } from '../lib/sessionTimer'

/**
 * Telemetry panel — 3-column comparison against the AI Base.
 *
 * Columns:
 *   AI Base (baseline)  |  Human Edits  |  Approved Final
 *
 * The Human column defaults to the latest checkpoint. A dropdown lets
 * the reviewer compare any specific checkpoint. If there are no
 * checkpoints yet, we compute Human from the live canvas DOM.
 *
 * Deltas are always relative to the AI Base column. The Approved column
 * shows delta vs AI Base too (not vs Human).
 */

export default function MetricsOverlay({ onClose, editedBlocks, docState, sessionSnap, sessionActiveMs = 0 }) {
  // Which Human snapshot to compare against — default is the latest checkpoint
  // or the live canvas DOM if there are no checkpoints yet.
  const [humanSource, setHumanSource] = useState('live')  // 'live' | cp-id

  const humanHtml = useMemo(() => {
    if (humanSource === 'live') {
      return snapshotCurrentDocumentHtml() || docState?.humanHtml
    }
    const cp = docState?.checkpoints?.find(c => c.id === humanSource)
    return cp?.html || docState?.humanHtml
  }, [humanSource, docState])

  const aiMetrics       = useMemo(() => computeMetrics(docState?.aiHtml),       [docState?.aiHtml])
  const humanMetrics    = useMemo(() => computeMetrics(humanHtml),              [humanHtml])
  const approvedMetrics = useMemo(() => computeMetrics(docState?.approvedHtml), [docState?.approvedHtml])

  const editCount = editedBlocks?.size || 0
  const checkpointCount = docState?.checkpoints?.length || 0

  const hasApproved = !!docState?.approvedHtml
  const hasAi = !!docState?.aiHtml

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-end animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[720px] h-screen overflow-y-auto shadow-[-20px_0_60px_rgba(15,23,42,0.15)] animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center">
              <BarChart3 size={16} className="text-brand-600" />
            </div>
            Analytics — 3-way comparison
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Compare-against selector */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/40 flex items-center gap-3 text-[12px]">
          <Info size={13} className="text-slate-500 flex-shrink-0" />
          <span className="text-slate-600">All deltas shown vs. <b className="text-slate-900">AI Base</b>. Human column:</span>
          <div className="relative">
            <select
              value={humanSource}
              onChange={(e) => setHumanSource(e.target.value)}
              className="h-7 rounded border border-slate-200 pl-2.5 pr-7 text-[12px] bg-white text-slate-800 appearance-none hover:border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
            >
              <option value="live">Latest (live)</option>
              {(docState?.checkpoints || []).map(cp => (
                <option key={cp.id} value={cp.id}>
                  {cp.label} — {new Date(cp.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="p-6 flex-1">
          {!hasAi && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12px]">
              <b>No document loaded.</b> Metrics show 0 across the board until a .docx is opened.
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 mb-2 text-[10.5px] tracking-widest uppercase text-slate-400 font-bold">
            <div>Metric</div>
            <ColumnHeader label="AI Base" icon={<Sparkles size={11} className="text-purple-600" />} tone="purple" />
            <ColumnHeader label="Human"   icon={<Pencil size={11} className="text-brand-600" />} tone="brand" />
            <ColumnHeader label="Approved" icon={<ShieldCheck size={11} className="text-emerald-600" />} tone="emerald" disabled={!hasApproved} />
          </div>

          {/* Comparison rows */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <MetricRow
              name="Word count"
              desc="Total words in the document"
              base={aiMetrics.words}
              human={humanMetrics.words}
              approved={hasApproved ? approvedMetrics.words : null}
              kind="pct"
            />
            <MetricRow
              name="Sentences"
              desc="Full sentence count"
              base={aiMetrics.sentences}
              human={humanMetrics.sentences}
              approved={hasApproved ? approvedMetrics.sentences : null}
              kind="pct"
            />
            <MetricRow
              name="Reading grade"
              desc="Flesch-Kincaid grade level · lower is easier"
              base={aiMetrics.grade}
              human={humanMetrics.grade}
              approved={hasApproved ? approvedMetrics.grade : null}
              kind="grade"
              format={(v) => v == null ? '—' : v.toFixed(1)}
            />
            <MetricRow
              name="Passive voice"
              desc="Approximate % of sentences in passive"
              base={aiMetrics.passive}
              human={humanMetrics.passive}
              approved={hasApproved ? approvedMetrics.passive : null}
              kind="pp"
              format={(v) => v == null ? '—' : `${v}%`}
            />
            <MetricRow
              name="Sections"
              desc="Top-level headings (h1/h2)"
              base={aiMetrics.sections}
              human={humanMetrics.sections}
              approved={hasApproved ? approvedMetrics.sections : null}
              kind="count"
            />
            <MetricRow
              name="Pages"
              desc="Real .docx pages when known, else estimated"
              base={aiMetrics.pages}
              human={humanMetrics.pages}
              approved={hasApproved ? approvedMetrics.pages : null}
              kind="count"
            />
            <MetricRow
              name="Screenshots"
              desc="Embedded images (img elements)"
              base={aiMetrics.images}
              human={humanMetrics.images}
              approved={hasApproved ? approvedMetrics.images : null}
              kind="count"
            />
            <MetricRow
              name="Complex sentences"
              desc=">25 words or 3+ commas — % of sentences"
              base={aiMetrics.complexPct}
              human={humanMetrics.complexPct}
              approved={hasApproved ? approvedMetrics.complexPct : null}
              kind="pp"
              format={(v) => v == null ? '—' : `${v}%`}
            />
            <MetricRow
              name="Spelling flags"
              desc="Heuristic — suspicious tokens, not a full dictionary check"
              base={aiMetrics.spelling}
              human={humanMetrics.spelling}
              approved={hasApproved ? approvedMetrics.spelling : null}
              kind="count"
            />
            <MetricRow
              name="Characters"
              desc="Character length (incl. spaces)"
              base={aiMetrics.chars}
              human={humanMetrics.chars}
              approved={hasApproved ? approvedMetrics.chars : null}
              kind="pct"
              last
            />
          </div>

          {/* Human-only stats — no meaningful AI/Approved column */}
          <Eyebrow>Human Activity</Eyebrow>
          <div className="grid grid-cols-3 gap-3">
            <ActivityCard label="Blocks edited" value={editCount} note={editCount === 0 ? 'No edits yet' : 'Since load'} />
            <ActivityCard label="Checkpoints saved" value={checkpointCount} note={checkpointCount === 0 ? 'None yet' : 'In this session'} />
            <ActivityCard label="Active time" value={formatMs(sessionActiveMs)} note={sessionSnap?.laps?.length ? `${sessionSnap.laps.length} lap${sessionSnap.laps.length === 1 ? '' : 's'}` : 'Live'} />
          </div>

          {/* Full session breakdown — laps, idle gaps, first-visit ts */}
          <SessionBreakdown snap={sessionSnap} />


          {/* Authorship across all 3 versions, inferred from .ts-inserted spans */}
          <Eyebrow>AI vs Human Authorship — All 3 Versions</Eyebrow>
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <AuthorshipRow label="AI Base"        aiPct={aiMetrics.aiPct}        humanPct={aiMetrics.humanPct}        available={hasAi} />
            <AuthorshipRow label="Human Edits"    aiPct={humanMetrics.aiPct}     humanPct={humanMetrics.humanPct}     available={true} />
            <AuthorshipRow label="Approved Final" aiPct={approvedMetrics.aiPct}  humanPct={approvedMetrics.humanPct}  available={hasApproved} last />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────
   Sub-components
──────────────────────────────────────────────────────── */

function ColumnHeader({ label, icon, tone, disabled }) {
  const bg = disabled ? 'bg-slate-50 text-slate-400 border-slate-200'
           : tone === 'purple'  ? 'bg-purple-50 text-purple-700 border-purple-200'
           : tone === 'brand'   ? 'bg-brand-50 text-brand-700 border-brand-200'
           : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
           : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border justify-center ${bg}`}>
      {icon}
      <span className="text-[10.5px]">{label}</span>
    </div>
  )
}

function MetricRow({ name, desc, base, human, approved, kind, format, last }) {
  const fmt = format || ((v) => v == null ? '—' : String(v))
  const humanDelta    = formatDelta(base, human, kind)
  const approvedDelta = formatDelta(base, approved, kind)

  const toneColor = (t) => t === 'better' ? 'text-emerald-600'
                        : t === 'worse'  ? 'text-amber-600'
                        : 'text-slate-400'

  return (
    <div className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 items-center px-4 py-3 ${last ? '' : 'border-b border-slate-100'}`}>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-900">{name}</div>
        <div className="text-[10.5px] text-slate-500 leading-snug">{desc}</div>
      </div>
      <ValueCell value={fmt(base)}     tone="base" />
      <ValueCell value={fmt(human)}    delta={humanDelta.text}    deltaColor={toneColor(humanDelta.tone)} />
      <ValueCell value={approved == null ? '—' : fmt(approved)} delta={approved == null ? null : approvedDelta.text} deltaColor={approved == null ? '' : toneColor(approvedDelta.tone)} />
    </div>
  )
}

function ValueCell({ value, delta, deltaColor, tone }) {
  return (
    <div className={`text-center`}>
      <div className={`text-[16px] font-bold tabular-nums ${tone === 'base' ? 'text-slate-900' : 'text-slate-800'}`}>
        {value}
      </div>
      {tone === 'base' ? (
        <div className="text-[9.5px] uppercase tracking-widest text-slate-400 font-bold">baseline</div>
      ) : delta != null && delta !== '—' ? (
        <div className={`text-[10.5px] tabular-nums font-semibold ${deltaColor}`}>{delta}</div>
      ) : (
        <div className="text-[10.5px] text-slate-300">—</div>
      )}
    </div>
  )
}

function ActivityCard({ label, value, note }) {
  return (
    <div className="border border-slate-100 rounded-xl px-4 py-3 shadow-sm bg-white">
      <div className="text-[9.5px] font-bold tracking-widest uppercase text-slate-400 mb-1">{label}</div>
      <div className="text-[22px] font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{note}</div>
    </div>
  )
}

/**
 * A single row in the 3-way authorship comparison — one per version.
 * Shows AI/human split as a stacked bar with the two percentages.
 * If the version isn't loaded (no Approved uploaded yet, etc.) the
 * row is dimmed with a "Not loaded" placeholder.
 */
function AuthorshipRow({ label, aiPct = 0, humanPct = 0, available, last }) {
  if (!available) {
    return (
      <div className={`grid grid-cols-[140px_1fr_100px] gap-3 items-center px-4 py-3 ${last ? '' : 'border-b border-slate-100'} opacity-50`}>
        <div className="text-[12px] font-semibold text-slate-700">{label}</div>
        <div className="text-[10.5px] italic text-slate-400">Not loaded</div>
        <div className="text-[10.5px] text-slate-400 text-right">—</div>
      </div>
    )
  }
  return (
    <div className={`grid grid-cols-[140px_1fr_100px] gap-3 items-center px-4 py-3 ${last ? '' : 'border-b border-slate-100'}`}>
      <div className="text-[12px] font-semibold text-slate-900">{label}</div>
      <div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
          <div className="bg-gradient-to-r from-brand-500 to-brand-600" style={{ width: `${aiPct}%` }}></div>
          <div className="bg-gradient-to-r from-orange-400 to-orange-500" style={{ width: `${humanPct}%` }}></div>
        </div>
      </div>
      <div className="text-[10.5px] text-slate-600 tabular-nums text-right leading-tight">
        <div><span className="text-brand-600 font-semibold">{aiPct}%</span> AI</div>
        <div><span className="text-orange-600 font-semibold">{humanPct}%</span> Human</div>
      </div>
    </div>
  )
}

function Eyebrow({ children }) {
  return (
    <div className="text-[10.5px] tracking-widest uppercase text-slate-400 font-bold mb-3 mt-6">
      {children}
    </div>
  )
}

/**
 * SessionBreakdown — shows every lap of the reviewer's session with
 * start/end times, duration, and whether the lap is still open.
 * The bar at the top scales to total active time so a viewer can see
 * how fragmented the session is at a glance.
 */
function SessionBreakdown({ snap }) {
  if (!snap || !snap.laps || snap.laps.length === 0) {
    return (
      <>
        <Eyebrow>Session Laps</Eyebrow>
        <div className="border border-slate-100 rounded-xl px-4 py-3 bg-white shadow-sm text-[11.5px] text-slate-500 italic">
          No laps yet — the timer starts on your first click or keypress in the document.
        </div>
      </>
    )
  }

  const total = totalActiveMs(snap)
  const created = new Date(snap.createdAt).toLocaleString()
  const openLap = snap.laps.find(l => l.end == null)

  return (
    <>
      <Eyebrow>Session Laps</Eyebrow>
      <div className="border border-slate-100 rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div>
            <div className="text-[10.5px] font-bold tracking-widest uppercase text-slate-400">
              Started
            </div>
            <div className="text-[12px] text-slate-800 tabular-nums">{created}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10.5px] font-bold tracking-widest uppercase text-slate-400">
              Total active
            </div>
            <div className="text-[16px] font-bold text-slate-900 tabular-nums">{formatMs(total)}</div>
          </div>
        </div>

        {snap.laps.map((lap, i) => {
          const dur = lap.end != null ? lap.activeMs : Math.max(0, (lap.lastActiveAt || Date.now()) - lap.start)
          const pct = total > 0 ? (dur / total) * 100 : 0
          const isOpen = lap === openLap
          return (
            <div key={i} className={`px-4 py-2.5 ${i < snap.laps.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10.5px] font-bold text-slate-500 tabular-nums w-8">#{i + 1}</div>
                <div className="flex-1 text-[11.5px] text-slate-700 tabular-nums">
                  {new Date(lap.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span className="text-slate-400 mx-1">→</span>
                  {lap.end != null
                    ? new Date(lap.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : <span className="text-emerald-600 font-semibold">live</span>}
                </div>
                <div className={`text-[12px] font-bold tabular-nums ${isOpen ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {formatMs(dur)}
                  {isOpen && <span className="ml-1 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>}
                </div>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isOpen ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-brand-400 to-brand-500'}`}
                  style={{ width: `${pct}%` }}
                ></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Placeholder banner where the DB sync will live */}
      <div className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-[10.5px] text-slate-500 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>Session data persists in <b>localStorage</b> keyed by document. Backend sync placeholder: <code className="text-[10px] bg-slate-100 px-1 rounded">syncToRemote()</code> in <code className="text-[10px] bg-slate-100 px-1 rounded">lib/sessionTimer.js</code></span>
      </div>
    </>
  )
}
