import mammoth from 'mammoth'

/**
 * Load a .docx from any source (File object OR a blob/http URL) and
 * return the parsed HTML + filename. Same shape either way, so the
 * caller doesn't care how the document arrived.
 */
export async function loadDocx(source) {
  let arrayBuffer, fileName
  if (source instanceof File) {
    arrayBuffer = await source.arrayBuffer()
    fileName = source.name
  } else if (typeof source === 'string') {
    // Blob URL or HTTP URL — fetch it
    const res = await fetch(source)
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status}`)
    arrayBuffer = await res.arrayBuffer()
    // Try to pull a filename out of the URL or Content-Disposition
    const cd = res.headers.get('content-disposition') || ''
    const nameFromCd = /filename="?([^"]+)"?/i.exec(cd)?.[1]
    fileName = nameFromCd || decodeURIComponent(source.split('/').pop().split('?')[0]) || 'document.docx'
  } else {
    throw new Error('loadDocx expects a File or a URL string')
  }

  const result = await mammoth.convertToHtml({ arrayBuffer })
  return {
    html: result.value,
    fileName,
    arrayBuffer,       // keep raw .docx for docx-preview (page-fidelity rendering)
    messages: result.messages,
  }
}

/**
 * Capture the currently-rendered document HTML from the canvas.
 * Used for checkpoints — the DOM is the source of truth for edits,
 * so we snapshot straight from it.
 */
export function snapshotCurrentDocumentHtml() {
  const root =
    document.querySelector('.uploaded-doc') ||
    document.querySelector('[data-canvas-inner]')
  if (!root) return ''
  return root.innerHTML
}
