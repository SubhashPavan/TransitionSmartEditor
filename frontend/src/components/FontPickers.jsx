import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Search, Star } from 'lucide-react'
import { applyFontFamily, applyFontSize } from '../lib/editorCommands'

/* ═══════════════════════════════════════════════════════════════════
   Font catalog — grouped for the picker
   Includes:
     • Windows / Mac / Linux system fonts
     • Common web-safe fallbacks
     • Google-font staples we auto-load via <link> (safe defaults)
═══════════════════════════════════════════════════════════════════ */

export const FONT_GROUPS = [
  {
    label: 'Theme fonts',
    fonts: ['Calibri', 'Calibri Light', 'Cambria', 'Segoe UI', 'Segoe UI Variable', 'Aptos', 'Aptos Display'],
  },
  {
    label: 'Modern sans-serif',
    fonts: [
      'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
      'Nunito', 'Nunito Sans', 'Source Sans Pro', 'Work Sans',
      'IBM Plex Sans', 'DM Sans', 'Rubik', 'Karla', 'Barlow',
    ],
  },
  {
    label: 'Classic sans-serif',
    fonts: [
      'Arial', 'Arial Black', 'Arial Narrow', 'Verdana', 'Tahoma',
      'Helvetica', 'Helvetica Neue', 'Trebuchet MS', 'Century Gothic',
      'Franklin Gothic', 'Franklin Gothic Medium', 'Gill Sans',
      'Impact', 'Optima',
    ],
  },
  {
    label: 'Serif',
    fonts: [
      'Times New Roman', 'Georgia', 'Palatino', 'Palatino Linotype',
      'Garamond', 'Book Antiqua', 'Cambria', 'Constantia', 'Sitka',
      'Merriweather', 'Playfair Display', 'Lora', 'PT Serif',
      'Crimson Text', 'Cormorant Garamond', 'EB Garamond',
    ],
  },
  {
    label: 'Monospace',
    fonts: [
      'Consolas', 'Courier New', 'Courier', 'Lucida Console',
      'Monaco', 'Menlo', 'Fira Code', 'Source Code Pro',
      'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono',
    ],
  },
  {
    label: 'Handwriting & display',
    fonts: [
      'Comic Sans MS', 'Segoe Print', 'Segoe Script',
      'Dancing Script', 'Pacifico', 'Great Vibes',
      'Bebas Neue', 'Oswald', 'Anton', 'Righteous', 'Lobster',
    ],
  },
]

// Flatten for quick lookup
export const ALL_FONTS = FONT_GROUPS.flatMap(g => g.fonts)

/* ═══════════════════════════════════════════════════════════════════
   Ensure the Google-font subset we reference is available so the
   preview + application actually render in those faces.
═══════════════════════════════════════════════════════════════════ */
const GOOGLE_FAMILIES = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Nunito', 'Nunito Sans', 'Source Sans Pro', 'Work Sans',
  'IBM Plex Sans', 'DM Sans', 'Rubik', 'Karla', 'Barlow',
  'Merriweather', 'Playfair Display', 'Lora', 'PT Serif',
  'Crimson Text', 'Cormorant Garamond', 'EB Garamond',
  'Fira Code', 'Source Code Pro', 'JetBrains Mono',
  'IBM Plex Mono', 'Roboto Mono',
  'Dancing Script', 'Pacifico', 'Great Vibes',
  'Bebas Neue', 'Oswald', 'Anton', 'Righteous', 'Lobster',
]
let googleLoaded = false
function ensureGoogleFontsLoaded() {
  if (googleLoaded || typeof document === 'undefined') return
  googleLoaded = true
  const families = GOOGLE_FAMILIES.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`).join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
  document.head.appendChild(link)
}

/* ═══════════════════════════════════════════════════════════════════
   Detect the current font at the caret via queryCommandValue,
   then fall back to the block's computed style.
═══════════════════════════════════════════════════════════════════ */
function detectCurrentFont() {
  try {
    const v = document.queryCommandValue('fontName')
    if (v) {
      const primary = v.split(',')[0].trim().replace(/^["']|["']$/g, '')
      if (primary) return primary
    }
  } catch { /* noop */ }
  const el = document.activeElement
  if (el && el.isContentEditable) {
    const cs = getComputedStyle(el)
    return cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function detectCurrentFontSize() {
  const el = document.activeElement
  if (el && el.isContentEditable) {
    const cs = getComputedStyle(el)
    const px = parseFloat(cs.fontSize) || 0
    return Math.round(px)
  }
  return null
}

/* ═══════════════════════════════════════════════════════════════════
   FontFamilyDropdown — Word-style: shows currently applied font,
   opens a searchable list, each item rendered in its own typeface.
═══════════════════════════════════════════════════════════════════ */

export function FontFamilyDropdown() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('Calibri')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState([])
  const rootRef = useRef(null)
  const searchRef = useRef(null)

  // Load Google fonts once so the previews & applied fonts render properly
  useEffect(() => { ensureGoogleFontsLoaded() }, [])

  // Auto-detect the current font from wherever the caret sits
  useEffect(() => {
    const sync = () => {
      const f = detectCurrentFont()
      if (f) setCurrent(f)
    }
    sync()
    document.addEventListener('selectionchange', sync)
    document.addEventListener('focusin', sync)
    return () => {
      document.removeEventListener('selectionchange', sync)
      document.removeEventListener('focusin', sync)
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    const off = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [])

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  const pick = (font) => {
    applyFontFamily(font)
    setCurrent(font)
    setRecent(prev => [font, ...prev.filter(f => f !== font)].slice(0, 5))
    setOpen(false)
  }

  const q = query.trim().toLowerCase()
  const filter = (list) => q ? list.filter(f => f.toLowerCase().includes(q)) : list

  return (
    <div className="relative" ref={rootRef}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen(o => !o) }}
        title={current}
        className="w-[192px] h-7 pl-2.5 pr-6 rounded border border-slate-200 text-[12.5px] bg-white text-slate-800 flex items-center justify-between hover:border-slate-300"
      >
        <span
          className="truncate"
          style={{ fontFamily: `'${current}', sans-serif` }}
        >
          {current}
        </span>
        <ChevronDown size={11} className="text-slate-400 -mr-4 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[280px] max-h-[440px] bg-white rounded-xl shadow-[0_10px_40px_rgba(15,23,42,0.15)] border border-slate-100 overflow-hidden z-50 flex flex-col">
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
            <Search size={12} className="text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              className="flex-1 outline-none text-[12px] bg-transparent placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400 tabular-nums">{ALL_FONTS.length} fonts</span>
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1 py-1">
            {/* Recently used */}
            {!q && recent.length > 0 && (
              <FontGroup label="Recently used" fonts={recent} current={current} pick={pick} showStar />
            )}
            {/* Groups */}
            {FONT_GROUPS.map(group => {
              const list = filter(group.fonts)
              if (list.length === 0) return null
              return (
                <FontGroup
                  key={group.label}
                  label={group.label}
                  fonts={list}
                  current={current}
                  pick={pick}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function FontGroup({ label, fonts, current, pick, showStar }) {
  return (
    <div className="py-1">
      <div className="px-3 pt-1 pb-0.5 text-[9.5px] tracking-widest uppercase font-bold text-slate-400">{label}</div>
      {fonts.map(f => {
        const active = f === current
        return (
          <button
            key={f}
            onMouseDown={(e) => { e.preventDefault(); pick(f) }}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors ${
              active ? 'bg-brand-50' : 'hover:bg-slate-50'
            }`}
          >
            <span
              className={`text-[15px] truncate ${active ? 'text-brand-700' : 'text-slate-800'}`}
              style={{ fontFamily: `'${f}', sans-serif` }}
            >
              {f}
            </span>
            {active
              ? <Check size={12} className="text-brand-600 flex-shrink-0" />
              : (showStar ? <Star size={10} className="text-slate-300 flex-shrink-0" /> : null)}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FontSizeDropdown — auto-detects current size, offers full list.
═══════════════════════════════════════════════════════════════════ */

const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

export function FontSizeDropdown() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(12)
  const rootRef = useRef(null)

  useEffect(() => {
    const sync = () => {
      const px = detectCurrentFontSize()
      if (px) setCurrent(px)
    }
    sync()
    document.addEventListener('selectionchange', sync)
    document.addEventListener('focusin', sync)
    return () => {
      document.removeEventListener('selectionchange', sync)
      document.removeEventListener('focusin', sync)
    }
  }, [])

  useEffect(() => {
    const off = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [])

  const pick = (px) => {
    applyFontSize(px)
    setCurrent(px)
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen(o => !o) }}
        className="w-[76px] h-7 pl-2.5 pr-6 rounded border border-slate-200 text-[12.5px] bg-white text-slate-800 flex items-center justify-between hover:border-slate-300 tabular-nums"
      >
        {current}
        <ChevronDown size={11} className="text-slate-400 -mr-4" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-16 max-h-[280px] bg-white rounded-lg shadow-[0_10px_30px_rgba(15,23,42,0.15)] border border-slate-100 overflow-y-auto z-50">
          {FONT_SIZES.map(sz => (
            <button
              key={sz}
              onMouseDown={(e) => { e.preventDefault(); pick(sz) }}
              className={`w-full text-left px-3 py-1.5 text-[12px] tabular-nums transition-colors ${
                sz === current ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
