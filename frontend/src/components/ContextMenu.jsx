import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  MessageSquarePlus, Copy, Scissors, ClipboardPaste, Search, Highlighter,
  Trash2, ChevronRight,
} from 'lucide-react'

/**
 * Right-click context menu — Word-style.
 * Items rendered depend on what's under the cursor:
 *   • Text selection present → New Comment, Copy, Cut, Search, Highlight
 *   • No selection            → Paste, Select paragraph
 * All actions are dispatched by the parent via `onAction`.
 */
export default function ContextMenu({ x, y, hasSelection, selectionText, onAction, onClose }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Clamp to viewport so the menu never opens off-screen
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: Math.min(x, vw - w - 6),
      top:  Math.min(y, vh - h - 6),
    })
  }, [x, y])

  // Close on outside click / escape
  useEffect(() => {
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) onClose() }
    const onKey  = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  const preview = selectionText
    ? `"${selectionText.length > 30 ? selectionText.slice(0, 27) + '…' : selectionText}"`
    : null

  return (
    <div
      ref={menuRef}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[80] w-[220px] bg-white rounded-lg shadow-[0_10px_40px_rgba(15,23,42,0.20)] border border-slate-200 py-1 animate-fade-in"
      onContextMenu={(e) => e.preventDefault()}
    >
      {preview && (
        <div className="px-3 py-1.5 border-b border-slate-100 text-[10.5px] text-slate-500 italic truncate">
          {preview}
        </div>
      )}

      {hasSelection && (
        <>
          <MenuItem
            icon={<MessageSquarePlus size={13} className="text-brand-600" />}
            label="New Comment"
            shortcut=""
            emphasize
            onClick={() => { onAction('new-comment'); onClose() }}
          />
          <MenuDivider />
          <MenuItem
            icon={<Copy size={13} />} label="Copy" shortcut="Ctrl+C"
            onClick={() => { onAction('copy'); onClose() }}
          />
          <MenuItem
            icon={<Scissors size={13} />} label="Cut" shortcut="Ctrl+X"
            onClick={() => { onAction('cut'); onClose() }}
          />
        </>
      )}

      <MenuItem
        icon={<ClipboardPaste size={13} />} label="Paste" shortcut="Ctrl+V"
        onClick={() => { onAction('paste'); onClose() }}
      />

      {hasSelection && (
        <>
          <MenuDivider />
          <MenuItem
            icon={<Highlighter size={13} className="text-yellow-500" />}
            label="Highlight"
            onClick={() => { onAction('highlight'); onClose() }}
          />
          <MenuItem
            icon={<Search size={13} />}
            label="Find in document" shortcut="Ctrl+F"
            onClick={() => { onAction('find'); onClose() }}
          />
        </>
      )}

      <MenuDivider />
      <MenuItem
        icon={<Trash2 size={13} className="text-slate-400" />}
        label={hasSelection ? 'Delete selection' : 'Select paragraph'}
        onClick={() => {
          onAction(hasSelection ? 'delete' : 'select-paragraph')
          onClose()
        }}
      />
    </div>
  )
}

function MenuItem({ icon, label, shortcut, emphasize, onClick }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-brand-50 flex items-center gap-2.5 transition-colors ${
        emphasize ? 'font-semibold text-slate-900' : 'text-slate-800'
      }`}
    >
      <span className="w-4 flex justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10.5px] text-slate-400 tabular-nums">{shortcut}</span>
      )}
    </button>
  )
}

function MenuDivider() {
  return <div className="h-px bg-slate-100 my-1"></div>
}
