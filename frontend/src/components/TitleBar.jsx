import { CheckCircle2, Minus, Square, X, LogOut, Save, Send } from 'lucide-react'
import VersionSwitcher from './VersionSwitcher'

const INFOSYS_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Infosys_logo.svg/1280px-Infosys_logo.svg.png'

export default function TitleBar({
  onMetricsClick,
  onExit,
  docName = 'Ariba Supplier Information & Performance Management SOP.docx',
  currentVersion,
  versions,
  onVersionSelect,
  onUploadApproved,
  onCompareVersions,
  editCount = 0,
  sessionActiveMs = 0,
  onSaveCheckpoint,
  checkpointCount = 0,
  onShare,
  reviewFeedbackCount = 0,
}) {

  return (
    <div className="relative bg-gradient-to-r from-[#1E293B] via-[#1E40AF] to-[#2563EB] text-white px-4 py-2 flex items-center justify-between text-[12px] select-none">
      <div className="flex items-center gap-3 min-w-0">
        <img src={INFOSYS_LOGO} alt="Infosys" className="h-3.5 [filter:brightness(0)_invert(1)] opacity-90" />
        <div className="h-4 w-px bg-white/25"></div>
        <span className="font-medium tracking-tight text-white/95">TransitionSmart Review Studio</span>
        <div className="h-4 w-px bg-white/25"></div>
        <span className="text-white/85 font-medium truncate max-w-[380px]">{docName}</span>
        <span className="inline-flex items-center gap-1.5 bg-white/12 px-2.5 py-0.5 rounded-full text-[11px] backdrop-blur">
          <CheckCircle2 size={11} className="text-emerald-300" />
          <span className="text-white/90">Saved · 12s ago</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {versions && (
          <VersionSwitcher
            current={currentVersion}
            versions={versions}
            onSelect={onVersionSelect}
            onUploadApproved={onUploadApproved}
            onCompare={onCompareVersions}
          />
        )}
        {onSaveCheckpoint && (
          <button
            onClick={onSaveCheckpoint}
            title="Snapshot the current Human Edits so you can revert here later"
            className="bg-emerald-500/95 text-white px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-500 shadow-sm transition-colors"
          >
            <Save size={11} />
            Save Checkpoint
            {checkpointCount > 0 && (
              <span className="tabular-nums bg-white/25 px-1.5 rounded-full text-[10px]">
                {checkpointCount}
              </span>
            )}
          </button>
        )}
        {onShare && (
          <button
            onClick={onShare}
            title="Create a magic link and send this SOP to a reviewer for feedback"
            className="bg-white/12 hover:bg-white/22 text-white px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Send size={11} />
            Share for review
            {reviewFeedbackCount > 0 && (
              <span className="tabular-nums bg-brand-500 text-white px-1.5 rounded-full text-[10px]">
                {reviewFeedbackCount}
              </span>
            )}
          </button>
        )}
        <div className="ml-2 flex items-center gap-0.5">
          {onExit && (
            <TitlebarBtn label="Back to landing" onClick={onExit}><LogOut size={13} strokeWidth={2.25} /></TitlebarBtn>
          )}
          <TitlebarBtn label="Minimize"><Minus size={14} strokeWidth={2.25} /></TitlebarBtn>
          <TitlebarBtn label="Maximize"><Square size={11} strokeWidth={2.25} /></TitlebarBtn>
          <TitlebarBtn label="Close"><X size={14} strokeWidth={2.25} /></TitlebarBtn>
        </div>
        <div
          className="ml-2 w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-white/25 shadow-sm"
          title="Priya K."
        >
          PK
        </div>
      </div>
    </div>
  )
}

function TitlebarBtn({ children, label, onClick }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="w-7 h-7 rounded-md text-white/90 hover:bg-white/15 hover:text-white transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  )
}
