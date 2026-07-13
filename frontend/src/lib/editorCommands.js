/**
 * Real editor commands for a Word-like ribbon.
 *
 * Everything is done via the browser's DOM APIs against
 * whatever `<Editable>` currently owns the caret (i.e.
 * document.activeElement). No React state — the DOM is
 * the source of truth for the document content, exactly
 * matching how Word works.
 *
 * We stash the last-focused contentEditable so the ribbon
 * buttons can still act after the caret moves to the ribbon
 * itself (buttons steal focus otherwise). Every ribbon button
 * calls `preventDefault` on mousedown to avoid losing focus,
 * but this stash is a safety net.
 */

let stashedRange = null
let stashedEditable = null

/** Called from the canvas whenever an editable receives focus or the selection changes there. */
export function rememberSelection() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const anchor = sel.anchorNode
  const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement
  const closest = el?.closest?.('[contenteditable="true"]')
  if (closest) {
    stashedEditable = closest
    stashedRange = sel.getRangeAt(0).cloneRange()
  }
}

/** Restore the stashed range so execCommand acts on the doc, not the ribbon. */
function restoreSelection() {
  if (!stashedRange) return null
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(stashedRange)
  return stashedEditable
}

/** ─── Font family ──────────────────────────────────────────── */
export function applyFontFamily(family) {
  const el = restoreSelection()
  if (!el) return
  try {
    document.execCommand('styleWithCSS', false, true)
    document.execCommand('fontName', false, family)
  } catch { /* noop */ }
}

/** ─── Font size (real px, wraps selection in a span) ───────── */
export function applyFontSize(px) {
  const el = restoreSelection()
  if (!el) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (range.collapsed) {
    // No selection — set future-input font size via a marker span
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    span.appendChild(document.createTextNode('​'))
    range.insertNode(span)
    // Move caret inside the marker
    range.setStart(span.firstChild, 1)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }
  const fragment = range.extractContents()
  const span = document.createElement('span')
  span.style.fontSize = `${px}px`
  span.appendChild(fragment)
  range.insertNode(span)
  // Restore selection over new span
  const newRange = document.createRange()
  newRange.selectNodeContents(span)
  sel.removeAllRanges()
  sel.addRange(newRange)
}

/** ─── Font color ───────────────────────────────────────────── */
export function applyFontColor(color) {
  const el = restoreSelection()
  if (!el) return
  document.execCommand('styleWithCSS', false, true)
  document.execCommand('foreColor', false, color)
}

/** ─── Highlight color ──────────────────────────────────────── */
export function applyHighlight(color) {
  const el = restoreSelection()
  if (!el) return
  document.execCommand('styleWithCSS', false, true)
  document.execCommand('backColor', false, color)
}

/** ─── Line spacing (whole current block) ───────────────────── */
export function applyLineSpacing(spacing) {
  const el = restoreSelection()
  if (!el) return
  el.style.lineHeight = spacing
}

/** ─── Block styles (Heading 1/2/3, Title, Normal, Quote) ───── */
const BLOCK_STYLE_MAP = {
  normal: {
    fontSize: '', fontWeight: '', color: '', fontStyle: '',
    marginTop: '', marginBottom: '', borderLeft: '', paddingLeft: '',
    fontFamily: '',
  },
  heading1: {
    fontSize: '26px', fontWeight: '700', color: '#2E74B5', fontStyle: '',
    marginTop: '12px', marginBottom: '6px', borderLeft: '', paddingLeft: '',
    fontFamily: 'Calibri Light, Segoe UI, sans-serif',
  },
  heading2: {
    fontSize: '20px', fontWeight: '700', color: '#2E74B5', fontStyle: '',
    marginTop: '18px', marginBottom: '8px', borderLeft: '', paddingLeft: '',
    fontFamily: 'Calibri Light, Segoe UI, sans-serif',
  },
  heading3: {
    fontSize: '16px', fontWeight: '700', color: '#1F3864', fontStyle: '',
    marginTop: '14px', marginBottom: '6px', borderLeft: '', paddingLeft: '',
  },
  title: {
    fontSize: '32px', fontWeight: '700', color: '#0F172A', fontStyle: '',
    marginTop: '8px', marginBottom: '12px', borderLeft: '', paddingLeft: '',
  },
  subtitle: {
    fontSize: '18px', fontWeight: '400', color: '#64748B', fontStyle: 'italic',
    marginTop: '2px', marginBottom: '12px', borderLeft: '', paddingLeft: '',
  },
  quote: {
    fontSize: '', fontWeight: '', color: '#475569', fontStyle: 'italic',
    marginTop: '10px', marginBottom: '10px',
    borderLeft: '3px solid #cbd5e1', paddingLeft: '12px',
  },
}

export function applyBlockStyle(styleName) {
  const el = restoreSelection()
  if (!el) return
  const s = BLOCK_STYLE_MAP[styleName]
  if (!s) return
  Object.entries(s).forEach(([k, v]) => { el.style[k] = v })
}

/** ─── Insert a table via HTML at caret ─────────────────────── */
export function insertTable(rows, cols) {
  const el = restoreSelection()
  if (!el) return
  const th = Array.from({ length: cols }).map((_, i) =>
    `<th style="border:1px solid #cbd5e1;padding:6px 10px;background:#f1f5f9;text-align:left;">Header ${i + 1}</th>`
  ).join('')
  const bodyRows = Array.from({ length: rows - 1 }).map(() => {
    const td = Array.from({ length: cols }).map(() =>
      `<td style="border:1px solid #cbd5e1;padding:6px 10px;">&nbsp;</td>`
    ).join('')
    return `<tr>${td}</tr>`
  }).join('')
  const html = `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:13px;"><thead><tr>${th}</tr></thead><tbody>${bodyRows}</tbody></table>`
  document.execCommand('insertHTML', false, html)
}

/** ─── Insert a link (createLink at caret) ─────────────────── */
export function insertLink(url, text) {
  const el = restoreSelection()
  if (!el) return
  if (text) {
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}" style="color:#2563EB;text-decoration:underline;">${escapeHtml(text)}</a>`)
  } else {
    document.execCommand('createLink', false, url)
  }
}

/** ─── Insert image (data URL) at caret ─────────────────────── */
export function insertImage(dataUrl, alt = '') {
  const el = restoreSelection()
  if (!el) return
  document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;margin:8px 0;" />`)
}

/** ─── Scan the current document for headings → build a TOC ─ */
export function collectHeadings() {
  // Look in the visible canvas area only
  const scrollRoot =
    document.querySelector('.uploaded-doc') ||
    document.querySelector('[data-canvas-root]') ||
    document.querySelector('.overflow-y-auto.bg-slate-300') ||
    document
  const nodes = scrollRoot.querySelectorAll('h1, h2, h3, h4')
  const toc = []
  nodes.forEach((n, idx) => {
    const text = (n.textContent || '').trim()
    if (!text) return
    if (!n.id) n.id = `toc-h-${idx}`
    toc.push({
      level: parseInt(n.tagName.slice(1), 10),
      text,
      id: n.id,
    })
  })
  return toc
}

/* ─── HTML escape helper ─── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

/* ═══════════════════════════════════════════════════════════════════
   Track-changes bookkeeping — Accept / Reject / navigate.
   Works against the visible canvas root.
═══════════════════════════════════════════════════════════════════ */

function canvasRoot() {
  return (
    document.querySelector('.uploaded-doc') ||
    document.querySelector('.overflow-y-auto.bg-slate-300') ||
    document.body
  )
}

/** Unwrap a span, promoting its children in its place (keeps their content). */
function unwrap(el) {
  if (!el || !el.parentNode) return
  const parent = el.parentNode
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/** Accept ALL track-changes: keep insertions as plain text, drop deletions. */
export function acceptAllChanges() {
  const root = canvasRoot()
  root.querySelectorAll('.ts-inserted').forEach(unwrap)
  root.querySelectorAll('.ts-deleted').forEach(el => el.parentNode.removeChild(el))
}

/** Reject ALL: bring back deletions as plain text, drop insertions. */
export function rejectAllChanges() {
  const root = canvasRoot()
  root.querySelectorAll('.ts-deleted').forEach(unwrap)
  root.querySelectorAll('.ts-inserted').forEach(el => el.parentNode.removeChild(el))
}

/** Accept just the change currently in view / next to caret. */
export function acceptChange(el) {
  if (!el) return
  if (el.classList.contains('ts-inserted')) unwrap(el)
  else if (el.classList.contains('ts-deleted')) el.parentNode.removeChild(el)
}

/** Reject just the change currently in view / next to caret. */
export function rejectChange(el) {
  if (!el) return
  if (el.classList.contains('ts-inserted')) el.parentNode.removeChild(el)
  else if (el.classList.contains('ts-deleted')) unwrap(el)
}

/** Cycle to the next / previous track-change span, scroll it into view. */
let cursorIdx = -1
export function stepToNextChange(direction = 1) {
  const root = canvasRoot()
  const changes = Array.from(root.querySelectorAll('.ts-inserted, .ts-deleted'))
  if (changes.length === 0) { cursorIdx = -1; return null }
  cursorIdx = (cursorIdx + direction + changes.length) % changes.length
  const target = changes[cursorIdx]
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Brief flash so the user sees where they landed
  target.style.outline = '2px solid #2563EB'
  target.style.outlineOffset = '2px'
  setTimeout(() => {
    target.style.outline = ''
    target.style.outlineOffset = ''
  }, 1200)
  return target
}

/* ═══════════════════════════════════════════════════════════════════
   Document statistics
═══════════════════════════════════════════════════════════════════ */

/** Word count of the visible canvas, ignoring UI chrome. */
export function getDocumentWordCount() {
  const root = canvasRoot()
  const text = root.textContent || ''
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Character count (including spaces). */
export function getDocumentCharCount() {
  const root = canvasRoot()
  return (root.textContent || '').length
}

/* ═══════════════════════════════════════════════════════════════════
   Find & Replace — highlights matches and cycles through them.
═══════════════════════════════════════════════════════════════════ */

let findMatches = []
let findIdx = -1
let findQuery = ''

/** Highlight all matches of `query` (case-insensitive) inside the canvas. */
export function findAll(query) {
  clearFind()
  if (!query) return 0
  const root = canvasRoot()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const matches = []
  const q = query.toLowerCase()
  const nodes = []
  let n
  while ((n = walker.nextNode())) nodes.push(n)
  for (const node of nodes) {
    const text = node.textContent
    const lower = text.toLowerCase()
    let idx = 0
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      matches.push({ node, start: idx, end: idx + q.length })
      idx += q.length
    }
  }
  // Wrap each match in a span (walking backward so offsets stay valid)
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const range = document.createRange()
    try {
      range.setStart(m.node, m.start)
      range.setEnd(m.node, m.end)
      const span = document.createElement('span')
      span.className = 'ts-find-hit'
      span.appendChild(range.extractContents())
      range.insertNode(span)
    } catch { /* noop */ }
  }
  findQuery = query
  findMatches = Array.from(root.querySelectorAll('.ts-find-hit'))
  findIdx = -1
  return findMatches.length
}

/** Scroll to the next find-match and highlight it. */
export function findNext(direction = 1) {
  if (findMatches.length === 0) return null
  findMatches.forEach(m => m.classList.remove('ts-find-current'))
  findIdx = (findIdx + direction + findMatches.length) % findMatches.length
  const target = findMatches[findIdx]
  target.classList.add('ts-find-current')
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return { index: findIdx + 1, total: findMatches.length }
}

/** Replace just the current match. */
export function replaceCurrent(replacement) {
  if (findIdx < 0 || findIdx >= findMatches.length) return false
  const target = findMatches[findIdx]
  const textNode = document.createTextNode(replacement)
  target.parentNode.replaceChild(textNode, target)
  findMatches.splice(findIdx, 1)
  if (findIdx >= findMatches.length) findIdx = findMatches.length - 1
  return true
}

/** Replace every remaining match. */
export function replaceAll(replacement) {
  let count = 0
  for (let i = findMatches.length - 1; i >= 0; i--) {
    const el = findMatches[i]
    el.parentNode.replaceChild(document.createTextNode(replacement), el)
    count += 1
  }
  findMatches = []
  findIdx = -1
  return count
}

/** Remove all find-highlight spans. */
export function clearFind() {
  const root = canvasRoot()
  root.querySelectorAll('.ts-find-hit').forEach(el => {
    const parent = el.parentNode
    parent.replaceChild(document.createTextNode(el.textContent), el)
    parent.normalize?.()
  })
  findMatches = []
  findIdx = -1
  findQuery = ''
}
