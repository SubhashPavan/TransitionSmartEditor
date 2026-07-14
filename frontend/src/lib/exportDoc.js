/**
 * Client-side export for the SOP editor. Two formats:
 *   - PDF  → browser's native print dialog (Save as PDF)
 *   - DOCX → HTML wrapped in Word-compatible MSO metadata, saved as .doc
 *            (Word opens it as a real editable document, no server round-trip)
 *
 * Inline images (data: URLs from snapshots) survive the round-trip; external
 * <img src="…"> URLs will still work in Word as long as the machine is online.
 */

function safeFilename(name, ext) {
  const base = (name || 'sop-document').replace(/\.(docx?|pdf|html?)$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sop-document'
  return `${base}.${ext}`
}

function stripEditorChrome(html) {
  const tpl = document.createElement('div')
  tpl.innerHTML = html
  // Kill anything reviewer/editor-only that shouldn't ship in the doc.
  tpl.querySelectorAll('.dp-play-section, .ts-comment-badge, .floating-comment-chip, .dp-video-inline').forEach(el => el.remove())
  // Comment spans → keep the inner text, drop the yellow highlight wrapper.
  tpl.querySelectorAll('.ts-comment').forEach(el => {
    const parent = el.parentNode
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  // Track-changes: keep inserted text as normal, drop deleted text entirely.
  tpl.querySelectorAll('.ts-deleted').forEach(el => el.remove())
  tpl.querySelectorAll('.ts-inserted').forEach(el => {
    const parent = el.parentNode
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  return tpl.innerHTML
}

function collectCss() {
  // Pull whatever <style> tags the docx-preview host injected — that's what
  // gives paragraphs their fonts and spacing. Skip cross-origin sheets.
  const chunks = []
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules
      if (!rules) continue
      for (const rule of rules) chunks.push(rule.cssText)
    } catch { /* CORS-locked sheet, skip */ }
  }
  return chunks.join('\n')
}

/** Trigger a download of `blob` as `filename`. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Export the doc HTML as a Word-openable .doc file. Uses the well-known
 * "HTML with MSO XML prelude" trick — Word treats the file as a native doc
 * and users can save-as .docx from inside Word.
 */
export function exportAsWord({ html, title }) {
  const cleaned = stripEditorChrome(html)
  const css = collectCss()
  // Force a print-ish body width and inline sane defaults so the doc doesn't
  // land in Word as a wall of 8pt sans-serif.
  const wrapped = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8"/>
      <title>${(title || 'SOP Document').replace(/[<>&]/g, '')}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page WordSection1 { size: 8.5in 11in; margin: 1in 1in 1in 1in; }
        div.WordSection1 { page: WordSection1; }
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
        h1 { font-size: 20pt; font-weight: 700; color: #0f172a; margin: 18pt 0 8pt; }
        h2 { font-size: 16pt; font-weight: 700; color: #0f172a; margin: 14pt 0 6pt; }
        h3 { font-size: 13pt; font-weight: 600; color: #0f172a; margin: 12pt 0 4pt; }
        p { margin: 0 0 8pt; line-height: 1.4; }
        ul, ol { margin: 0 0 8pt 24pt; }
        li { margin: 0 0 4pt; }
        img { max-width: 6.5in; height: auto; }
        table { border-collapse: collapse; margin: 8pt 0; }
        td, th { border: 1px solid #94a3b8; padding: 4pt 6pt; }
        ${css}
      </style>
    </head>
    <body>
      <div class="WordSection1">
        ${cleaned}
      </div>
    </body>
    </html>
  `
  // application/msword makes Windows/Explorer route this to Word by default.
  const blob = new Blob(['﻿', wrapped], { type: 'application/msword' })
  downloadBlob(blob, safeFilename(title, 'doc'))
}

/**
 * Export as PDF via the browser's print dialog. Uses a hidden iframe so we
 * only print the doc content (not the whole editor chrome). "Save as PDF"
 * is the default destination in modern Chromium.
 */
export function exportAsPdf({ html, title }) {
  const cleaned = stripEditorChrome(html)
  const css = collectCss()
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(`<!doctype html><html><head>
    <meta charset="utf-8"/>
    <title>${(title || 'SOP Document').replace(/[<>&]/g, '')}</title>
    <style>
      @page { size: Letter; margin: 0.75in; }
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
      h1 { font-size: 22pt; color: #0f172a; margin: 18pt 0 8pt; }
      h2 { font-size: 16pt; color: #0f172a; margin: 14pt 0 6pt; }
      h3 { font-size: 13pt; color: #0f172a; margin: 12pt 0 4pt; }
      p { line-height: 1.45; margin: 0 0 8pt; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; margin: 8pt 0; }
      td, th { border: 1px solid #94a3b8; padding: 4pt 6pt; }
      ${css}
    </style>
  </head><body>${cleaned}</body></html>`)
  doc.close()
  // Give the browser a beat to lay out images before firing print.
  setTimeout(() => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch (e) {
      console.warn('Print failed:', e)
    }
    // Remove the iframe after the print dialog closes (best-effort).
    setTimeout(() => iframe.remove(), 1500)
  }, 300)
}
