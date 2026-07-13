import { useEffect, useRef, useState } from 'react'
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Highlighter, Palette, IndentIncrease, IndentDecrease,
  Copy, Scissors, Clipboard, Paintbrush,
  Search, Save, Replace, MousePointer2,
  Download, ChevronDown, ChevronUp, X, Eraser, CaseSensitive,
  Table, Image as ImageIcon, Link,
  Baseline, ChevronsUp, ChevronsDown,
  BarChart3, Mic,
  Maximize2, ZoomIn, ZoomOut, Grid3x3, PanelLeft,
  FileText, Printer, Settings,
  ListTree, GitCompareArrows, MessageSquarePlus, Check, SpellCheck,
  FileImage, Hash, BookOpen, Bookmark,
  Sigma,
  Ruler, Rows3, Columns3, RotateCw, Ratio,
  PanelLeftOpen, PanelLeftClose,
} from 'lucide-react'
import TocModal from './TocModal'
import FindReplacePanel from './FindReplacePanel'
import { FontFamilyDropdown, FontSizeDropdown } from './FontPickers'
import {
  applyFontColor, applyHighlight,
  applyBlockStyle, applyLineSpacing,
  applyFontSize,
  insertTable, insertLink, insertImage,
  acceptAllChanges, rejectAllChanges, stepToNextChange,
  getDocumentWordCount, getDocumentCharCount,
} from '../lib/editorCommands'

/* Font size step used by Grow/Shrink font buttons */
const SIZE_STEPS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
function currentFontSizePx() {
  const el = document.activeElement
  if (!el || !el.isContentEditable) return 12
  return Math.round(parseFloat(getComputedStyle(el).fontSize) || 12)
}
function growFont() {
  const px = currentFontSizePx()
  const next = SIZE_STEPS.find(s => s > px) || SIZE_STEPS[SIZE_STEPS.length - 1]
  applyFontSize(next)
}
function shrinkFont() {
  const px = currentFontSizePx()
  const prev = [...SIZE_STEPS].reverse().find(s => s < px) || SIZE_STEPS[0]
  applyFontSize(prev)
}
/* Cycle through Sentence case / lowercase / UPPERCASE / Capitalize Each Word */
let caseCycleIndex = 0
function cycleCase() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const text = range.toString()
  if (!text) return
  const variants = [
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),                          // Sentence
    text.toLowerCase(),                                                                    // lower
    text.toUpperCase(),                                                                    // UPPER
    text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),   // Title Case
  ]
  caseCycleIndex = (caseCycleIndex + 1) % variants.length
  document.execCommand('insertText', false, variants[caseCycleIndex])
}
/* Simulated page-break inserter */
function insertPageBreak(kind) {
  const html = kind === 'cover'
    ? '<div style="page-break-before:always;text-align:center;padding:120px 0;"><h1 style="font-size:42px;font-weight:800;color:#1F2937;">Document Title</h1><p style="color:#64748b;margin-top:12px;">Subtitle · Author · Date</p></div>'
    : kind === 'blank'
    ? '<div style="page-break-before:always;min-height:60vh;"></div>'
    : '<hr style="page-break-after:always;border:0;border-top:1px dashed #cbd5e1;margin:24px 0;" />'
  document.execCommand('insertHTML', false, html)
}
const COLORS        = ['#000000', '#1F2937', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563EB', '#7e22ce', '#be185d']
const HIGHLIGHTS    = ['#fff59d', '#a7f3d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff', 'transparent']

/**
 * Move caret to the end of `el`. Used after inserting/wrapping list nodes
 * so typing continues where the user expects.
 */
function placeCaretAtEnd(el) {
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const s = window.getSelection()
  s.removeAllRanges()
  s.addRange(range)
}

/**
 * Replacement for execCommand('insertUnorderedList'/'insertOrderedList') —
 * unreliable across our two editor modes (per-block Editable and whole-doc
 * docx-preview). Walks from the caret up to the nearest paragraph-ish block,
 * turns it into an <li>, and wraps it (plus any adjacent list of the same
 * kind) in a <ul>/<ol>.
 *
 * Behaviors:
 *   - Caret in <p>: converts <p> to <li> inside a fresh <ul>/<ol>.
 *   - Caret in <li> of same-kind list: un-lists back to <p>.
 *   - Caret in <li> of opposite list: flips the parent from <ul> to <ol> (or vice versa).
 *   - Adjacent <li>s in the DOM get merged into one list.
 */
function runListToggle(kind /* 'ul' | 'ol' */) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    flashToast('Click into the document first, then choose Bullets/Numbering.', 'info')
    return
  }
  const range = sel.getRangeAt(0)
  let node = range.startContainer
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement

  const blockTags = new Set(['P','H1','H2','H3','H4','H5','H6','LI','DIV'])
  let block = node
  while (block && !(block.tagName && blockTags.has(block.tagName))) block = block.parentElement
  if (!block) return

  const doc = block.ownerDocument
  const parentList = block.parentElement && /^(UL|OL)$/.test(block.parentElement.tagName)
    ? block.parentElement : null

  if (block.tagName === 'LI' && parentList) {
    if (parentList.tagName.toLowerCase() === kind) {
      const p = doc.createElement('p')
      p.innerHTML = block.innerHTML || '&nbsp;'
      parentList.parentNode.insertBefore(p, parentList.nextSibling)
      block.remove()
      if (parentList.children.length === 0) parentList.remove()
      placeCaretAtEnd(p)
    } else {
      const flipped = doc.createElement(kind)
      flipped.className = 'ts-list'
      while (parentList.firstChild) flipped.appendChild(parentList.firstChild)
      parentList.parentNode.replaceChild(flipped, parentList)
      placeCaretAtEnd(block)
    }
    return
  }

  const li = doc.createElement('li')
  li.innerHTML = block.innerHTML || '&nbsp;'
  const wrapper = doc.createElement(kind)
  wrapper.className = 'ts-list'   // targeted by CSS so bullets/numbers are visible
  wrapper.appendChild(li)
  block.parentNode.replaceChild(wrapper, block)

  const prev = wrapper.previousElementSibling
  if (prev && prev.tagName.toLowerCase() === kind) {
    while (wrapper.firstChild) prev.appendChild(wrapper.firstChild)
    wrapper.remove()
    placeCaretAtEnd(prev.lastElementChild)
  } else {
    const next = wrapper.nextElementSibling
    if (next && next.tagName.toLowerCase() === kind) {
      while (next.firstChild) wrapper.appendChild(next.firstChild)
      next.remove()
    }
    placeCaretAtEnd(li)
  }
}

/* Toast helper — used for buttons that can't be fully wired without a docx
   export pipeline (Margins, Orientation, Citations, etc.). Small, dismisses
   itself, avoids cluttering the codebase with modals for every stub. */
function flashToast(message, tone = 'info') {
  let host = document.getElementById('ribbon-toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'ribbon-toast-host'
    host.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:200;pointer-events:none;'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  const bg = tone === 'warn' ? '#FEF3C7' : tone === 'ok' ? '#D1FAE5' : '#DBEAFE'
  const fg = tone === 'warn' ? '#92400E' : tone === 'ok' ? '#065F46' : '#1E40AF'
  el.style.cssText = `background:${bg};color:${fg};font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(15,23,42,0.20);margin-top:8px;pointer-events:auto;opacity:0;transition:opacity 0.15s;`
  el.textContent = message
  host.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 200)
  }, 2400)
}

/* ── Layout helpers — mutate the live doc canvas so changes are visible now.
     Final page geometry still comes from the .docx export/template. ── */
function _pages() {
  return Array.from(document.querySelectorAll('.docx-preview-host section.docx, .page-shadow'))
}
function setPageStyle(styleObj, msg) {
  const pgs = _pages()
  if (pgs.length === 0) return flashToast('No document is open.', 'warn')
  pgs.forEach(p => Object.entries(styleObj).forEach(([k, v]) => (p.style[k] = v)))
  flashToast(msg || 'Page style updated.', 'ok')
}
function togglePageOrientation() {
  const pgs = _pages()
  if (pgs.length === 0) return flashToast('No document is open.', 'warn')
  const landscape = !pgs[0].classList.contains('page-landscape')
  pgs.forEach(p => {
    p.classList.toggle('page-landscape', landscape)
    if (landscape) { p.style.width = '1056px'; p.style.minHeight = '816px' }
    else           { p.style.width = '816px';  p.style.minHeight = '1056px' }
  })
  flashToast(`Orientation: ${landscape ? 'Landscape' : 'Portrait'}`, 'ok')
}
function togglePageColumns() {
  const pgs = _pages()
  if (pgs.length === 0) return flashToast('No document is open.', 'warn')
  const two = !pgs[0].classList.contains('page-two-col')
  pgs.forEach(p => {
    p.classList.toggle('page-two-col', two)
    p.style.columnCount = two ? '2' : ''
    p.style.columnGap = two ? '32px' : ''
  })
  flashToast(`${two ? 'Two-column' : 'Single-column'} layout`, 'ok')
}
function applyParagraphSpacing(prop, label) {
  const sel = window.getSelection()
  const node = sel?.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel?.anchorNode
  const para = node?.closest?.('p, h1, h2, h3, h4, h5, h6, li')
  if (!para) return flashToast('Click into a paragraph first.', 'warn')
  const px = window.prompt(`${label} spacing in pixels (0–48):`, '12')
  const n = Math.max(0, Math.min(48, parseInt(px || '', 10) || 0))
  para.style[prop] = `${n}px`
  flashToast(`${label} spacing → ${n}px on this paragraph.`, 'ok')
}

/* Print / Export helpers — use the browser's native print dialog for PDF. */
function browserPrint(what = 'Print') {
  window.print()
  flashToast(`${what} dialog opened — pick your printer or "Save as PDF"`, 'ok')
}

/* Format Painter — captures inline styles from the current caret's parent
   element and re-applies them to the next selection. Lives in module scope
   so it survives ribbon re-renders. */
let _paintCache = null
function copyFormatting() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return flashToast('Select some text first, then click Format Painter.', 'warn')
  const node = sel.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode
  if (!node) return
  const cs = getComputedStyle(node)
  _paintCache = {
    fontFamily:     cs.fontFamily,
    fontSize:       cs.fontSize,
    fontWeight:     cs.fontWeight,
    fontStyle:      cs.fontStyle,
    color:          cs.color,
    textDecoration: cs.textDecorationLine,
    backgroundColor: cs.backgroundColor,
  }
  flashToast('Formatting copied. Now select text to apply it.', 'ok')
}
function applyFormatting() {
  if (!_paintCache) return flashToast('Copy formatting first (Format Painter).', 'warn')
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) {
    return flashToast('Select text to paint the formatting onto.', 'warn')
  }
  const range = sel.getRangeAt(0)
  const span = document.createElement('span')
  Object.entries(_paintCache).forEach(([k, v]) => { if (v) span.style[k] = v })
  try {
    span.appendChild(range.extractContents())
    range.insertNode(span)
  } catch (e) {
    return flashToast('Could not paint here.', 'warn')
  }
  _paintCache = null   // one-shot, like Word single-click
  flashToast('Formatting painted.', 'ok')
}

/* Comments — jump to Prev/Next .ts-comment in DOM order. */
let _commentCursor = -1
function stepThroughComments(dir) {
  const comments = Array.from(document.querySelectorAll('.docx-preview-host .ts-comment, .uploaded-doc .ts-comment'))
  if (comments.length === 0) return flashToast('No comments in this doc.', 'warn')
  _commentCursor = ((_commentCursor + dir) + comments.length) % comments.length
  const el = comments[_commentCursor]
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Flash the anchor so it's obvious which one we landed on.
  const prev = el.style.boxShadow
  el.style.transition = 'box-shadow 0.2s'
  el.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.35)'
  setTimeout(() => { el.style.boxShadow = prev || 'none' }, 1200)
  flashToast(`Comment ${_commentCursor + 1} of ${comments.length}`, 'info')
}

/* Speech synthesis — Read Aloud a selection or whole doc */
function readAloud() {
  const s = window.speechSynthesis
  if (!s) return alert('Speech synthesis not supported in this browser.')
  if (s.speaking) { s.cancel(); return }
  const sel = window.getSelection()
  const text = sel && sel.toString().trim() ||
    (document.querySelector('.overflow-y-auto.bg-slate-300')?.textContent || '').slice(0, 4000)
  if (!text) return
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  s.speak(u)
}

export default function Ribbon({ onMetricsClick, onExport, zoom = 100, onZoomIn, onZoomOut, onZoomReset, showLeftRail = true, onToggleLeftRail, trackChanges = true, onToggleTrackChanges, onSaveCheckpoint, onNewComment, onUndo, onRedo, canUndo = false, canRedo = false }) {
  const [activeTab, setActiveTab] = useState('Home')
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false })
  const [tocOpen, setTocOpen] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [colorMenu, setColorMenu] = useState(null)  // 'fore' | 'back' | null
  const [findMode, setFindMode] = useState(null)     // 'find' | 'replace' | null
  const [wordCount, setWordCount] = useState(0)

  const imgInputRef = useRef(null)

  const tabs = ['File', 'Home', 'Insert', 'Layout', 'References', 'Review', 'View']

  useEffect(() => {
    const update = () => {
      try {
        setFmt({
          bold:      document.queryCommandState('bold'),
          italic:    document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        })
      } catch { /* noop */ }
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const exec = (cmd, value = null) => document.execCommand(cmd, false, value)

  const doInsertLink = () => {
    const url = window.prompt('Enter the URL:', 'https://')
    if (url) insertLink(url)
  }

  const doPickImage = () => imgInputRef.current?.click()
  const onImageChosen = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => insertImage(ev.target.result, f.name)
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  return (
    <>
      {/* Tab strip — Word-style: File tab is filled brand-blue (Backstage), others are plain with underline on active */}
      <div className="bg-white px-2 flex items-end gap-0 border-b border-slate-200 h-9">
        {tabs.map(t => {
          const isFile = t === 'File'
          const isActive = activeTab === t
          if (isFile) {
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`h-7 px-4 mt-1 mr-1 rounded-t-md text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
              >
                {t}
              </button>
            )
          }
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`relative px-3.5 h-8 text-[12.5px] transition-colors ${
                isActive
                  ? 'text-slate-900 font-semibold bg-white after:content-[""] after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2.5px] after:bg-brand-500 after:rounded-t'
                  : 'text-slate-700 font-medium hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* Toolbar — no overflow clipping so dropdowns can float above the page */}
      <div className="bg-white px-2 flex items-stretch gap-0 border-b border-slate-200 relative z-30">
        {activeTab === 'File'       && <FileTab onExport={onExport} onSaveCheckpoint={onSaveCheckpoint} />}
        {activeTab === 'Home'       && (
          <HomeTab
            exec={exec}
            fmt={fmt}
            onExport={onExport}
            colorMenu={colorMenu} setColorMenu={setColorMenu}
            onFind={() => setFindMode('find')}
            onReplace={() => setFindMode('replace')}
            trackChanges={trackChanges}
            onToggleTrackChanges={onToggleTrackChanges}
            onMetricsClick={onMetricsClick}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        )}
        {activeTab === 'Insert'     && (
          <InsertTab
            openTablePicker={() => setTablePickerOpen(true)}
            openImagePicker={doPickImage}
            insertLink={doInsertLink}
          />
        )}
        {activeTab === 'Layout'     && <LayoutTab />}
        {activeTab === 'References' && <ReferencesTab openTOC={() => setTocOpen(true)} />}
        {activeTab === 'Review'     && <ReviewTab onMetricsClick={onMetricsClick} trackChanges={trackChanges} onToggleTrackChanges={onToggleTrackChanges} onSaveCheckpoint={onSaveCheckpoint} onNewComment={onNewComment} />}
        {activeTab === 'View'       && <ViewTab
          zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onZoomReset={onZoomReset}
          showLeftRail={showLeftRail} onToggleLeftRail={onToggleLeftRail}
        />}
      </div>

      {/* Hidden file input for image insertion */}
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      {/* Popovers & modals */}
      <TocModal open={tocOpen} onClose={() => setTocOpen(false)} />
      <FindReplacePanel
        open={findMode !== null}
        mode={findMode || 'find'}
        onClose={() => setFindMode(null)}
      />
      {tablePickerOpen && (
        <TableGridPicker
          onClose={() => setTablePickerOpen(false)}
          onPick={(r, c) => { insertTable(r, c); setTablePickerOpen(false) }}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════
   HOME TAB
═══════════════════════════════════════════════ */

function HomeTab({ exec, fmt, onExport, colorMenu, setColorMenu, onFind, onReplace, trackChanges, onToggleTrackChanges, onMetricsClick, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <>
      {/* History — Undo / Redo. Ctrl+Z / Ctrl+Y also work. */}
      <RibbonGroup label="History">
        <div className="flex flex-col items-start gap-px pt-0.5">
          <IconBtn icon={<Undo2 size={13} />} onClick={onUndo} tip="Undo (Ctrl+Z)" />
          <IconBtn icon={<Redo2 size={13} />} onClick={onRedo} tip="Redo (Ctrl+Y)" />
        </div>
      </RibbonGroup>

      {/* Clipboard — Paste as the anchor big button; Cut/Copy/Format Painter stacked. Word convention. */}
      <RibbonGroup label="Clipboard">
        <BigBtn icon={<Clipboard size={22} />} label="Paste" chevron onClick={() => exec('paste')} />
        <div className="flex flex-col items-start gap-px pt-0.5">
          <SmallBtn icon={<Scissors size={13} />} label="Cut" onClick={() => exec('cut')} />
          <SmallBtn icon={<Copy size={13} />} label="Copy" onClick={() => exec('copy')} />
          <SmallBtn
            icon={<Paintbrush size={13} />}
            label="Format Painter"
            onClick={() => (_paintCache ? applyFormatting() : copyFormatting())}
          />
        </div>
      </RibbonGroup>

      {/* Font — two-row icon grid with an internal divider between formatting and color/highlight, just like Word. */}
      <RibbonGroup label="Font">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 items-center">
            <FontFamilyDropdown />
            <FontSizeDropdown />
            <IconBtn icon={<ChevronsUp size={13} />} onClick={growFont} tip="Grow font (Ctrl+])" />
            <IconBtn icon={<ChevronsDown size={13} />} onClick={shrinkFont} tip="Shrink font (Ctrl+[)" />
            <IconBtn icon={<CaseSensitive size={13} />} onClick={cycleCase} tip="Change case" chevron />
            <IconBtn icon={<Eraser size={13} />} onClick={() => exec('removeFormat')} tip="Clear all formatting" />
          </div>
          <div className="flex gap-0.5 items-center relative">
            <IconBtn icon={<Bold size={13} />} onClick={() => exec('bold')} active={fmt.bold} tip="Bold (Ctrl+B)" />
            <IconBtn icon={<Italic size={13} />} onClick={() => exec('italic')} active={fmt.italic} tip="Italic (Ctrl+I)" />
            <IconBtn icon={<Underline size={13} />} onClick={() => exec('underline')} active={fmt.underline} tip="Underline (Ctrl+U)" chevron />
            <IconBtn icon={<Strikethrough size={13} />} onClick={() => exec('strikeThrough')} tip="Strikethrough" />
            <IconBtn icon={<Subscript size={13} />} onClick={() => exec('subscript')} tip="Subscript" />
            <IconBtn icon={<Superscript size={13} />} onClick={() => exec('superscript')} tip="Superscript" />
            <VDivider />
            <IconBtn
              icon={<Highlighter size={13} className="text-yellow-500" />}
              onClick={() => setColorMenu(colorMenu === 'back' ? null : 'back')}
              tip="Highlight color"
              chevron
            />
            {colorMenu === 'back' && (
              <ColorPopover
                colors={HIGHLIGHTS}
                title="Highlight"
                onPick={(c) => { applyHighlight(c); setColorMenu(null) }}
                onClose={() => setColorMenu(null)}
                offset="left-[220px]"
              />
            )}
            <IconBtn
              icon={<Palette size={13} className="text-red-500" />}
              onClick={() => setColorMenu(colorMenu === 'fore' ? null : 'fore')}
              tip="Font color"
              chevron
            />
            {colorMenu === 'fore' && (
              <ColorPopover
                colors={COLORS}
                title="Text color"
                onPick={(c) => { applyFontColor(c); setColorMenu(null) }}
                onClose={() => setColorMenu(null)}
                offset="left-[270px]"
              />
            )}
          </div>
        </div>
      </RibbonGroup>

      {/* Paragraph — two rows with internal dividers matching Word */}
      <RibbonGroup label="Paragraph">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5 items-center">
            <IconBtn icon={<List size={13} />} onClick={() => runListToggle('ul')} tip="Bullets" chevron />
            <IconBtn icon={<ListOrdered size={13} />} onClick={() => runListToggle('ol')} tip="Numbering" chevron />
            <IconBtn
              icon={<ListTree size={13} />}
              tip="Multilevel list"
              chevron
              onClick={() => {
                // Wrap the selection in an ordered list, then indent to make
                // it a second-level sub-item — mimics Word's "multilevel".
                runListToggle('ol')
                exec('indent')
              }}
            />
            <VDivider />
            <IconBtn icon={<IndentDecrease size={13} />} onClick={() => exec('outdent')} tip="Decrease indent" />
            <IconBtn icon={<IndentIncrease size={13} />} onClick={() => exec('indent')} tip="Increase indent" />
          </div>
          <div className="flex gap-0.5 items-center">
            <IconBtn icon={<AlignLeft size={13} />} onClick={() => exec('justifyLeft')} tip="Align left (Ctrl+L)" />
            <IconBtn icon={<AlignCenter size={13} />} onClick={() => exec('justifyCenter')} tip="Center (Ctrl+E)" />
            <IconBtn icon={<AlignRight size={13} />} onClick={() => exec('justifyRight')} tip="Align right (Ctrl+R)" />
            <IconBtn icon={<AlignJustify size={13} />} onClick={() => exec('justifyFull')} tip="Justify (Ctrl+J)" />
            <VDivider />
            <LineSpacingBtn />
          </div>
        </div>
      </RibbonGroup>

      {/* Styles gallery — REAL block-level styling, larger tiles per Word */}
      <RibbonGroup label="Styles">
        <StyleTile name="Normal"    preview="AaBbCc"    preset="normal" onApply={() => applyBlockStyle('normal')} />
        <StyleTile name="No Spacing" preview="AaBbCc"   preset="normal" onApply={() => applyBlockStyle('normal')} />
        <StyleTile name="Heading 1" preview="Heading 1" preset="h1"    onApply={() => applyBlockStyle('heading1')} />
        <StyleTile name="Heading 2" preview="Heading 2" preset="h2"    onApply={() => applyBlockStyle('heading2')} />
        <StyleTile name="Title"     preview="Title"     preset="title" onApply={() => applyBlockStyle('title')} />
        <div className="flex flex-col items-center justify-center h-[56px] px-0.5">
          <IconBtn
            icon={<ChevronDown size={13} />}
            tip="More styles"
            onClick={() => flashToast('Style gallery — use the tiles at left, or Format Painter to copy inline styles.', 'info')}
          />
        </div>
      </RibbonGroup>

      {/* Right side — single tall Big buttons, matching Word's Editing/Dictate/Editor pattern */}
      <div className="ml-auto flex items-stretch">
        <RibbonGroup label="Editing">
          <EditingDropdown onFind={onFind} onReplace={onReplace} />
        </RibbonGroup>

        <RibbonGroup label="Voice">
          <BigBtn icon={<Mic size={22} />} label="Dictate" chevron onClick={readAloud} />
        </RibbonGroup>

        <RibbonGroup label="Tracking">
          <BigBtn
            icon={<GitCompareArrows size={22} className={trackChanges ? 'text-brand-600' : 'text-slate-700'} />}
            label={trackChanges ? 'Track: On' : 'Track: Off'}
            onClick={onToggleTrackChanges}
            active={trackChanges}
          />
        </RibbonGroup>

        <RibbonGroup label="Analytics">
          <BigBtn icon={<BarChart3 size={22} className="text-brand-600" />} label="Analytics" onClick={onMetricsClick} tone="brand" />
        </RibbonGroup>

        <RibbonGroup label="Document">
          <BigBtn icon={<Download size={22} />} label="Export" chevron onClick={onExport} />
        </RibbonGroup>
      </div>
    </>
  )
}

/* Editing "big button + dropdown" — Word replaces the tiny Find/Replace stack
   with a single tall button that opens a small menu. Mirroring that. */
function EditingDropdown({ onFind, onReplace }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <BigBtn icon={<Search size={22} />} label="Editing" chevron onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="absolute top-full right-0 mt-1 w-[200px] bg-white rounded-lg shadow-[0_10px_30px_rgba(15,23,42,0.15)] border border-slate-100 py-1 z-50">
          <button onMouseDown={(e) => { e.preventDefault(); setOpen(false); onFind() }} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-slate-50 flex items-center gap-2">
            <Search size={13} className="text-slate-500" /> Find… <span className="ml-auto text-[10.5px] text-slate-400">Ctrl+F</span>
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); setOpen(false); onReplace() }} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-slate-50 flex items-center gap-2">
            <Replace size={13} className="text-slate-500" /> Replace… <span className="ml-auto text-[10.5px] text-slate-400">Ctrl+H</span>
          </button>
          <div className="h-px bg-slate-100 my-1"></div>
          <button onMouseDown={(e) => { e.preventDefault(); setOpen(false); document.execCommand('selectAll') }} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-slate-50 flex items-center gap-2">
            <MousePointer2 size={13} className="text-slate-500" /> Select All <span className="ml-auto text-[10.5px] text-slate-400">Ctrl+A</span>
          </button>
        </div>
      )}
    </div>
  )
}

/* Line-spacing dropdown */
function LineSpacingBtn() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <IconBtn icon={<Baseline size={13} />} onClick={() => setOpen(o => !o)} chevron tip="Line spacing" />
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-100 py-1 min-w-[120px] z-30">
          {[
            ['1.0', '1'],
            ['1.15', '1.15'],
            ['1.5', '1.5'],
            ['2.0', '2'],
            ['Double', '2'],
          ].map(([label, v]) => (
            <button
              key={label}
              onMouseDown={(e) => { e.preventDefault(); applyLineSpacing(v); setOpen(false) }}
              className="w-full text-left text-[12px] px-3 py-1.5 hover:bg-brand-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   INSERT / LAYOUT / REFERENCES / REVIEW / VIEW / FILE
═══════════════════════════════════════════════ */

function FileTab({ onExport, onSaveCheckpoint }) {
  return (
    <>
      <RibbonGroup label="Actions">
        <BigBtn
          icon={<Save size={22} />}
          label="Save"
          onClick={() => {
            onSaveCheckpoint?.(`Autosave ${new Date().toLocaleString()}`)
            flashToast('Saved as checkpoint.', 'ok')
          }}
        />
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn
            icon={<FileText size={13} />}
            label="Save as"
            chevron
            onClick={() => {
              const label = window.prompt('Save as (checkpoint label):', `Draft ${new Date().toLocaleString()}`)
              if (label) onSaveCheckpoint?.(label)
            }}
          />
          <SmallBtn icon={<Download size={13} />} label="Export .docx" onClick={() => onExport?.()} />
          <SmallBtn icon={<FileText size={13} />} label="Export PDF"  onClick={() => browserPrint('Export PDF')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Print">
        <BigBtn icon={<Printer size={22} />} label="Print" onClick={() => browserPrint('Print')} />
      </RibbonGroup>
      <RibbonGroup label="Settings">
        <SmallBtn
          icon={<Settings size={13} />}
          label="Preferences"
          onClick={() => flashToast('Preferences — coming soon (per-user AI + display settings).', 'info')}
        />
      </RibbonGroup>
    </>
  )
}

function InsertTab({ openTablePicker, openImagePicker, insertLink }) {
  return (
    <>
      <RibbonGroup label="Pages">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<FileText size={13} />} label="Cover Page" onClick={() => insertPageBreak('cover')} />
          <SmallBtn icon={<FileImage size={13} />} label="Blank Page" onClick={() => insertPageBreak('blank')} />
          <SmallBtn icon={<Rows3 size={13} />} label="Page Break" onClick={() => insertPageBreak('break')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Tables">
        <BigBtn icon={<Table size={22} />} label="Table" chevron onClick={openTablePicker} />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <BigBtn icon={<ImageIcon size={22} />} label="Pictures" onClick={openImagePicker} />
      </RibbonGroup>
      <RibbonGroup label="Links">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Link size={13} />} label="Link" onClick={insertLink} />
          <SmallBtn icon={<Bookmark size={13} />} label="Bookmark" onClick={() => {
            const name = prompt('Bookmark name:'); if (!name) return
            document.execCommand('insertHTML', false, `<a id="bm-${encodeURIComponent(name)}" title="Bookmark: ${name}"></a>`)
          }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Header & Footer">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn
            icon={<FileText size={13} />}
            label="Header"
            onClick={() => {
              const text = window.prompt('Header text:', 'Confidential · Document header')
              if (!text) return
              const host = document.querySelector('.docx-preview-host, .uploaded-doc')
              if (host) host.insertAdjacentHTML('afterbegin', `<p style="text-align:center;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px;">${text}</p>`)
              flashToast('Header inserted at top of the doc.', 'ok')
            }}
          />
          <SmallBtn
            icon={<FileText size={13} />}
            label="Footer"
            onClick={() => {
              const text = window.prompt('Footer text:', 'Prepared by TransitionSmart · Page 1')
              if (!text) return
              const host = document.querySelector('.docx-preview-host, .uploaded-doc')
              if (host) host.insertAdjacentHTML('beforeend', `<p style="text-align:center;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px;margin-top:10px;">${text}</p>`)
              flashToast('Footer inserted at bottom of the doc.', 'ok')
            }}
          />
          <SmallBtn
            icon={<Hash size={13} />}
            label="Page Number"
            chevron
            onClick={() => {
              document.execCommand('insertHTML', false, `<span style="color:#64748b;font-variant-numeric:tabular-nums;">Page {N}</span>`)
              flashToast('Page-number placeholder inserted — will render properly on export.', 'ok')
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Sigma size={13} />} label="Equation" onClick={() => { const eq = prompt('Enter equation:', 'a² + b² = c²'); if (eq) document.execCommand('insertHTML', false, `<span style="font-family:'Cambria Math',serif;font-style:italic;">${eq}</span>`) }} />
          <SmallBtn icon={<Hash size={13} />} label="Symbol" chevron onClick={() => { const sym = prompt('Insert symbol (e.g. €, ©, →):', '→'); if (sym) document.execCommand('insertHTML', false, sym) }} />
        </div>
      </RibbonGroup>
    </>
  )
}


function LayoutTab() {
  return (
    <>
      <RibbonGroup label="Page Setup">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Ruler size={13} />}     label="Margins"     chevron onClick={() => setPageStyle({ padding: '54px 72px' }, 'Wide margins applied.')} />
          <SmallBtn icon={<RotateCw size={13} />}  label="Orientation" chevron onClick={() => togglePageOrientation()} />
          <SmallBtn icon={<Ratio size={13} />}     label="Size"        chevron onClick={() => flashToast('Page size — applies on .docx export via the template.', 'info')} />
          <SmallBtn icon={<Columns3 size={13} />}  label="Columns"     chevron onClick={() => togglePageColumns()} />
          <SmallBtn icon={<Rows3 size={13} />}     label="Breaks"      chevron onClick={() => insertPageBreak('break')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Indent">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<IndentDecrease size={13} />} label="Left"  onClick={() => document.execCommand('outdent')} />
          <SmallBtn icon={<IndentIncrease size={13} />} label="Right" onClick={() => document.execCommand('indent')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Spacing">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Baseline size={13} />} label="Before" onClick={() => applyParagraphSpacing('marginTop', 'Above')} />
          <SmallBtn icon={<Baseline size={13} />} label="After"  onClick={() => applyParagraphSpacing('marginBottom', 'Below')} />
          <SmallBtn icon={<Baseline size={13} />} label="Line" chevron onClick={() => { const s = prompt('Line spacing (e.g. 1.5):', '1.5'); if (s) applyLineSpacing(s) }} />
        </div>
      </RibbonGroup>
    </>
  )
}

function ReferencesTab({ openTOC }) {
  return (
    <>
      <RibbonGroup label="Table of Contents">
        <BigBtn icon={<ListTree size={22} />} label="Table of Contents" chevron onClick={openTOC} />
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn
            icon={<FileText size={13} />}
            label="Add Text"
            chevron
            onClick={() => {
              // Word's "Add Text" promotes the current paragraph to a heading
              // so it participates in the TOC.
              document.execCommand('formatBlock', false, 'H2')
              flashToast('Paragraph promoted to Heading 2 (now in TOC).', 'ok')
            }}
          />
          <SmallBtn icon={<ListTree size={13} />} label="Update Table" onClick={openTOC} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Footnotes">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Superscript size={13} />} label="Insert Footnote" onClick={() => document.execCommand('insertHTML', false, `<sup style="color:#dc2626;">[1]</sup>`) } />
          <SmallBtn icon={<Subscript size={13} />} label="Insert Endnote" onClick={() => document.execCommand('insertHTML', false, `<sup style="color:#0369a1;">[i]</sup>`) } />
          <SmallBtn
            icon={<BookOpen size={13} />}
            label="Next Footnote"
            chevron
            onClick={() => {
              const notes = Array.from(document.querySelectorAll('.docx-preview-host sup, .uploaded-doc sup'))
              if (notes.length === 0) return flashToast('No footnotes/endnotes in this doc.', 'warn')
              const y = window.scrollY
              const next = notes.find(el => el.getBoundingClientRect().top + window.scrollY > y + 20) || notes[0]
              next.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Citations & Bibliography">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn
            icon={<BookOpen size={13} />} label="Insert Citation" chevron
            onClick={() => {
              const c = window.prompt('Citation (author, year):', 'Smith, 2024')
              if (c) document.execCommand('insertHTML', false, ` <span style="color:#64748b;">(${c})</span>`)
            }}
          />
          <SmallBtn icon={<ListTree size={13} />} label="Manage Sources" onClick={() => flashToast('Source manager — coming soon.', 'info')} />
          <SmallBtn
            icon={<BookOpen size={13} />} label="Bibliography" chevron
            onClick={() => {
              document.execCommand('insertHTML', false, `<h2>Bibliography</h2><ol><li>Add your references here.</li></ol>`)
              flashToast('Bibliography scaffold inserted.', 'ok')
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Captions">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Bookmark size={13} />} label="Insert Caption" onClick={() => { const c = prompt('Caption text:'); if (c) document.execCommand('insertHTML', false, `<p style="text-align:center;font-style:italic;font-size:11px;color:#64748b;margin:4px 0;">${c}</p>`) }} />
          <SmallBtn
            icon={<ListTree size={13} />}
            label="Cross-reference"
            onClick={() => {
              const headings = Array.from(document.querySelectorAll('.docx-preview-host h1, .docx-preview-host h2, .docx-preview-host h3, .uploaded-doc h1, .uploaded-doc h2, .uploaded-doc h3'))
              if (headings.length === 0) return flashToast('No headings to link to.', 'warn')
              const list = headings.map((h, i) => `${i + 1}. ${h.textContent.trim().slice(0, 60)}`).join('\n')
              const pick = window.prompt(`Cross-reference which heading?\n\n${list}\n\nEnter number:`, '1')
              const i = parseInt(pick, 10) - 1
              if (isNaN(i) || !headings[i]) return
              const target = headings[i]
              if (!target.id) target.id = `xref-${Date.now()}`
              document.execCommand('insertHTML', false, `<a href="#${target.id}" style="color:#2563EB;text-decoration:underline;">${target.textContent.trim().slice(0, 40)}</a>`)
              flashToast('Cross-reference inserted.', 'ok')
            }}
          />
        </div>
      </RibbonGroup>
    </>
  )
}

function ReviewTab({ onMetricsClick, trackChanges, onToggleTrackChanges, onSaveCheckpoint, onNewComment }) {
  const [stats, setStats] = useState({ words: 0, chars: 0 })
  useEffect(() => {
    const update = () => setStats({ words: getDocumentWordCount(), chars: getDocumentCharCount() })
    update()
    const iv = setInterval(update, 2000)
    return () => clearInterval(iv)
  }, [])

  const confirmSaveCheckpoint = () => {
    // Parent opens the CheckpointDialog — no prompt() here anymore.
    onSaveCheckpoint?.()
  }

  return (
    <>
      <RibbonGroup label="Proofing">
        <BigBtn icon={<SpellCheck size={22} />} label="Spelling & Grammar" onClick={() => document.designMode = document.designMode === 'on' ? 'off' : 'on'} />
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<Sigma size={13} />} label={`Word count: ${stats.words}`} />
          <SmallBtn icon={<Sigma size={13} />} label={`Characters: ${stats.chars}`} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Comments">
        <BigBtn icon={<MessageSquarePlus size={22} />} label="New Comment" onClick={onNewComment} />
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<ChevronUp size={13} />}   label="Previous" onClick={() => stepThroughComments(-1)} />
          <SmallBtn icon={<ChevronDown size={13} />} label="Next"     onClick={() => stepThroughComments(+1)} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Tracking">
        <BigBtn
          icon={<GitCompareArrows size={22} className={trackChanges ? 'text-brand-600' : 'text-slate-600'} />}
          label={trackChanges ? 'Track Changes: On' : 'Track Changes: Off'}
          onClick={onToggleTrackChanges}
          active={trackChanges}
        />
      </RibbonGroup>

      <RibbonGroup label="Checkpoints">
        <BigBtn
          icon={<Save size={22} className="text-emerald-600" />}
          label="Save Checkpoint"
          onClick={confirmSaveCheckpoint}
        />
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn icon={<ChevronUp size={13} />} label="Previous edit" onClick={() => stepToNextChange(-1)} />
          <SmallBtn icon={<ChevronDown size={13} />} label="Next edit" onClick={() => stepToNextChange(1)} />
        </div>
      </RibbonGroup>

      <div className="ml-auto pr-1">
        <RibbonGroup label="Analytics">
          <BigBtn icon={<BarChart3 size={22} className="text-brand-600" />} label="Analytics" onClick={onMetricsClick} tone="brand" />
        </RibbonGroup>
      </div>
    </>
  )
}

function ViewTab({ zoom, onZoomIn, onZoomOut, onZoomReset, showLeftRail, onToggleLeftRail }) {
  return (
    <>
      <RibbonGroup label="Zoom">
        <div className="flex items-center gap-0.5">
          <IconBtn icon={<ZoomOut size={13} />} tip="Zoom out (Ctrl+-)" onClick={onZoomOut} />
          <button
            onMouseDown={(e) => { e.preventDefault(); onZoomReset?.() }}
            title="Reset zoom to 100% (Ctrl+0)"
            className="text-[11.5px] text-slate-700 h-6 min-w-[42px] px-1.5 rounded hover:bg-slate-100 tabular-nums font-semibold transition-colors"
          >
            {zoom}%
          </button>
          <IconBtn icon={<ZoomIn size={13} />} tip="Zoom in (Ctrl+=)" onClick={onZoomIn} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Show">
        <div className="flex flex-col items-start gap-0.5">
          <SmallBtn
            icon={showLeftRail ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
            label={showLeftRail ? 'Hide Navigation' : 'Show Navigation'}
            active={showLeftRail}
            onClick={onToggleLeftRail}
          />
          <SmallBtn
            icon={<Grid3x3 size={13} />}
            label="Grid"
            onClick={() => {
              const host = document.querySelector('.docx-preview-host, .uploaded-doc')
              if (!host) return flashToast('No document is open.', 'warn')
              host.classList.toggle('show-grid')
              flashToast(host.classList.contains('show-grid') ? 'Grid on' : 'Grid off', 'ok')
            }}
          />
          <SmallBtn
            icon={<Ruler size={13} />}
            label="Ruler"
            onClick={() => {
              document.body.classList.toggle('show-ruler')
              flashToast(document.body.classList.contains('show-ruler') ? 'Ruler on' : 'Ruler off', 'ok')
            }}
          />
        </div>
      </RibbonGroup>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Popover — color palette
═══════════════════════════════════════════════ */

function ColorPopover({ colors, title, onPick, onClose, offset }) {
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target?.closest?.('.color-popover')) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return (
    <div className={`color-popover absolute top-full mt-1 ${offset} bg-white rounded-lg shadow-lg border border-slate-100 p-2 z-30 w-[172px]`}>
      <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-1.5">{title}</div>
      <div className="grid grid-cols-5 gap-1">
        {colors.map(c => (
          <button
            key={c}
            onMouseDown={(e) => { e.preventDefault(); onPick(c) }}
            title={c}
            className={`w-6 h-6 rounded border ${c === 'transparent' ? 'border-slate-300 bg-white' : 'border-slate-200'}`}
            style={c === 'transparent' ? { backgroundImage: 'linear-gradient(45deg,#f3f4f6 25%,transparent 25%,transparent 75%,#f3f4f6 75%,#f3f4f6),linear-gradient(45deg,#f3f4f6 25%,transparent 25%,transparent 75%,#f3f4f6 75%,#f3f4f6)', backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px' } : { background: c }}
          />
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Table grid picker
═══════════════════════════════════════════════ */

function TableGridPicker({ onPick, onClose }) {
  const [hover, setHover] = useState({ r: 0, c: 0 })
  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-[130px] left-[420px] bg-white rounded-xl shadow-lg border border-slate-100 p-3"
      >
        <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest mb-2">Insert Table</div>
        <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
          {Array.from({ length: 8 * 8 }).map((_, i) => {
            const r = Math.floor(i / 8) + 1
            const c = (i % 8) + 1
            const on = r <= hover.r && c <= hover.c
            return (
              <div
                key={i}
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => onPick(hover.r, hover.c)}
                className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                  on ? 'bg-brand-500 border-brand-600' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              />
            )
          })}
        </div>
        <div className="text-[11px] text-slate-500 text-center mt-2 tabular-nums">
          {hover.r === 0 ? 'Move to pick size' : `${hover.r} × ${hover.c} table`}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Building blocks
═══════════════════════════════════════════════ */

function RibbonGroup({ label, children }) {
  return (
    <div className="flex flex-col items-stretch px-3 border-r border-slate-200/80 last:border-none">
      <div className="flex-1 flex items-start justify-center gap-1 py-1.5 min-h-[72px]">
        {children}
      </div>
      <div className="text-[10.5px] text-slate-500 leading-none pb-1 pt-0.5 font-normal tracking-tight text-center">
        {label}
      </div>
    </div>
  )
}

/* Vertical divider used inside a group between related button clusters (like Word does inside Font, Paragraph). */
function VDivider() {
  return <div className="w-px self-stretch bg-slate-200/70 mx-0.5"></div>
}

function BigBtn({ icon, label, chevron, onClick, tone, active }) {
  const style = tone === 'brand'
    ? 'text-brand-700 hover:bg-brand-50'
    : active
    ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-300'
    : 'text-slate-900 hover:bg-slate-100'
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      className={`min-w-[62px] px-2 py-1 rounded flex flex-col items-center gap-1 transition-colors ${style}`}
    >
      <div className="flex items-center [&_svg]:stroke-[1.5]">{icon}</div>
      <div className="text-[11px] leading-[13px] text-center flex items-center gap-0.5 font-normal max-w-[64px] justify-center">
        {label}
        {chevron && <ChevronDown size={10} className="text-slate-500" />}
      </div>
    </button>
  )
}

function SmallBtn({ icon, label, chevron, onClick, active, primary }) {
  const style = primary
    ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
    : active
    ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-300 font-medium'
    : 'text-slate-900 hover:bg-slate-100'
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      className={`h-[22px] px-1.5 rounded text-[11.5px] inline-flex items-center gap-1 leading-none transition-colors [&_svg]:stroke-[1.75] ${style}`}
    >
      {icon}
      <span>{label}</span>
      {chevron && <ChevronDown size={10} className="text-slate-500" />}
    </button>
  )
}

function IconBtn({ icon, onClick, active, tip, chevron }) {
  const style = active
    ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
    : 'text-slate-900 hover:bg-slate-100'
  return (
    <button
      title={tip}
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      className={`h-[26px] min-w-[26px] px-1 rounded inline-flex items-center justify-center gap-0.5 transition-colors [&_svg]:stroke-[1.75] ${style}`}
    >
      {icon}
      {chevron && <ChevronDown size={10} className="text-slate-500 -ml-0.5" />}
    </button>
  )
}

function FontSelect({ value, onChange, options, width }) {
  return (
    <div className={`relative ${width}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full h-6 pl-1.5 pr-5 rounded border border-slate-200 text-[11px] bg-white text-slate-800 appearance-none hover:border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={10} className="absolute right-1 top-1.5 text-slate-400 pointer-events-none" />
    </div>
  )
}

function StyleTile({ name, preview, preset, onApply }) {
  const previewClass = preset === 'h1'    ? 'text-[13px] font-semibold text-[#2E74B5]'
                     : preset === 'h2'    ? 'text-[12px] font-semibold text-[#2E74B5]'
                     : preset === 'h3'    ? 'text-[11px] font-semibold text-[#1F3864]'
                     : preset === 'title' ? 'text-[13px] font-semibold text-slate-800'
                     : preset === 'quote' ? 'text-[11px] italic text-slate-500'
                     :                      'text-[12px] text-slate-700'
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onApply?.() }}
      className="w-[80px] h-[56px] px-1.5 rounded border border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50/30 transition-all flex flex-col items-center justify-center gap-1"
    >
      <div className={`${previewClass} truncate max-w-full leading-none`}>{preview}</div>
      <div className="text-[9.5px] text-slate-500 tracking-tight leading-none truncate max-w-full">{name}</div>
    </button>
  )
}
