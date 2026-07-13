import { useState } from 'react'
import { X, Copy, Send, Check, Mail, Link2, ShieldCheck } from 'lucide-react'
import * as api from '../lib/api'

/**
 * ShareModal — the "Send for review" dialog.
 * The author enters the reviewer's email (optional), picks permissions,
 * and clicks "Create share link". We snapshot the current doc HTML and
 * POST it to /api/share; the backend returns a token. We turn the token
 * into a magic link (`window.location.origin + /review/<token>`) which
 * the author can copy or open directly.
 */
export default function ShareModal({ open, onClose, getDocHtml, getDocTitle, authorName, onShareCreated }) {
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [permissions, setPermissions] = useState('comment')
  const [creating, setCreating] = useState(false)
  const [share, setShare] = useState(null)   // {token, share_url, ...}
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const magicLink = share
    ? `${window.location.origin}${share.share_url}`
    : ''

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const html = (getDocHtml?.() || '').toString()
      if (!html.trim()) {
        setError('Nothing to share — the document is empty.')
        setCreating(false)
        return
      }
      const res = await api.createShare({
        docHtml:       html,
        docTitle:      getDocTitle?.() || 'SOP',
        author:        authorName || 'Author',
        reviewerEmail: reviewerEmail.trim() || null,
        permissions,
      })
      setShare(res)
      onShareCreated?.(res.token)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(magicLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked — user can still select the text */ }
  }

  const reset = () => {
    setShare(null); setReviewerEmail(''); setError(null); setCopied(false)
  }

  return (
    <div
      className="fixed inset-0 z-[92] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[520px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
            <Send size={18} className="text-brand-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900">Send for review</div>
            <div className="text-[11.5px] text-slate-500">Create a magic link — the reviewer opens it, reads the SOP, and posts feedback back to you.</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {!share && (
            <>
              <div>
                <label className="text-[11px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-1.5 mb-1.5">
                  <Mail size={11} /> Reviewer email
                  <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  placeholder="e.g. reviewer@company.internal"
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="text-[10.5px] text-slate-400 mt-1">
                  We record the invited email so the feedback trail is traceable. The reviewer still enters their name when they arrive.
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-1.5 block">Permission</label>
                <div className="grid grid-cols-2 gap-2">
                  <PermCard
                    active={permissions === 'comment'}
                    onClick={() => setPermissions('comment')}
                    title="Comment"
                    subtitle="Read + attach feedback comments"
                    icon={<Send size={12} />}
                  />
                  <PermCard
                    active={permissions === 'read'}
                    onClick={() => setPermissions('read')}
                    title="Read only"
                    subtitle="No feedback — just review"
                    icon={<ShieldCheck size={12} />}
                  />
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-800">
                  {error}
                </div>
              )}
            </>
          )}

          {share && (
            <>
              <div>
                <div className="text-[11px] font-bold text-emerald-700 tracking-widest uppercase flex items-center gap-1.5 mb-2">
                  <Check size={11} /> Link created
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-2">
                  <Link2 size={14} className="text-emerald-700 flex-shrink-0" />
                  <input
                    readOnly
                    value={magicLink}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 bg-transparent text-[12px] font-mono text-slate-800 outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className="h-8 px-3 rounded-md bg-white border border-emerald-200 text-emerald-700 text-[11.5px] font-semibold inline-flex items-center gap-1 hover:bg-emerald-50 transition-colors"
                  >
                    {copied ? (<><Check size={11} /> Copied</>) : (<><Copy size={11} /> Copy</>)}
                  </button>
                </div>
                <div className="text-[10.5px] text-slate-500 mt-2">
                  Share this link inside your network — it's a magic URL scoped to <b>/review/{share.token}</b> on this host.
                  {reviewerEmail && <> Invited: <b>{reviewerEmail}</b>.</>}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-[11.5px] text-slate-600 leading-relaxed">
                <b className="block mb-0.5 text-slate-700">What happens next</b>
                Your reviewer opens the link, enters their name, and starts adding comments.
                As they post feedback, it'll appear in your comments panel here — no refresh needed.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2 justify-end">
          {!share && (
            <>
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={creating}
                className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 shadow-sm inline-flex items-center gap-1.5 transition-colors"
              >
                {creating ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                    Creating…
                  </>
                ) : (
                  <><Send size={12} /> Create share link</>
                )}
              </button>
            </>
          )}
          {share && (
            <>
              <button
                onClick={reset}
                className="h-9 px-4 rounded-md text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Share with another reviewer
              </button>
              <button
                onClick={() => window.open(magicLink, '_blank')}
                className="h-9 px-4 rounded-md text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 inline-flex items-center gap-1.5 transition-colors"
              >
                Open link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PermCard({ active, onClick, title, subtitle, icon }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
        active
          ? 'border-brand-500 bg-brand-50/60 shadow-sm'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={active ? 'text-brand-700' : 'text-slate-500'}>{icon}</span>
        <span className={`text-[12.5px] font-semibold ${active ? 'text-brand-900' : 'text-slate-800'}`}>{title}</span>
      </div>
      <div className="text-[10.5px] text-slate-500 leading-snug">{subtitle}</div>
    </button>
  )
}
