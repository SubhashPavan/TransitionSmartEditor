import { useLayoutEffect, useRef } from 'react'
import { rememberSelection } from '../lib/editorCommands'

/**
 * A contentEditable primitive that plays nicely with React.
 *
 * Also remembers the current caret position for the ribbon,
 * and only fires onInput for *real* content edits (text add/delete),
 * so pure formatting (Bold, Italic, alignment…) doesn't mark blocks
 * as human-edited.
 *
 * On real text insertion, wraps the newly-typed run in a
 * <span class="ts-inserted"> so ONLY the changed characters are
 * highlighted — not the whole paragraph.
 */

/* inputType values that represent an actual content change */
const CONTENT_INPUT_TYPES = new Set([
  'insertText',
  'insertReplacementText',
  'insertLineBreak',
  'insertParagraph',
  'insertFromPaste',
  'insertFromDrop',
  'insertFromYank',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteEntireSoftLine',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'deleteByCut',
  'deleteByDrag',
])

const INSERT_TYPES = new Set([
  'insertText',
  'insertReplacementText',
  'insertFromPaste',
  'insertFromDrop',
  'insertFromYank',
])

const DELETE_TYPES = new Set([
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteEntireSoftLine',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'deleteByCut',
  'deleteByDrag',
])

/**
 * Intercept a delete before the browser removes the text. Instead of
 * deleting, wrap the affected range in <span class="ts-deleted"> with
 * strikethrough — so the reviewer can see what the human took out.
 * Returns true if we handled the delete (caller should preventDefault).
 *
 * Special case: if the range is *entirely inside an existing .ts-inserted*
 * span (i.e., the user is undoing their own just-typed run), let the
 * browser delete normally.
 */
function trackDeletion(nativeEvent) {
  if (!nativeEvent.getTargetRanges) return false
  const targetRanges = nativeEvent.getTargetRanges()
  if (!targetRanges || targetRanges.length === 0) return false

  // Build a live Range from the first static range
  const sr = targetRanges[0]
  const range = document.createRange()
  try {
    range.setStart(sr.startContainer, sr.startOffset)
    range.setEnd(sr.endContainer, sr.endOffset)
  } catch { return false }

  if (range.collapsed) return false

  // If range is entirely inside a .ts-inserted, allow default delete
  const commonAncestor = range.commonAncestorContainer
  const ancestorEl = commonAncestor.nodeType === Node.TEXT_NODE
    ? commonAncestor.parentElement
    : commonAncestor
  if (ancestorEl?.closest?.('.ts-inserted')) return false

  try {
    const fragment = range.extractContents()
    // Strip any nested .ts-deleted so we don't nest markers on repeat delete
    const doc = range.startContainer.ownerDocument
    const span = doc.createElement('span')
    span.className = 'ts-deleted'
    span.appendChild(fragment)
    range.insertNode(span)

    // Put caret after the strikethrough span
    const newRange = doc.createRange()
    newRange.setStartAfter(span)
    newRange.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(newRange)
    return true
  } catch {
    return false
  }
}

/**
 * Wrap the last-inserted `data` characters in a <span class="ts-inserted">
 * so ONLY those characters are visually marked — the rest of the block
 * stays unmarked.
 */
function wrapLastInsertion(rootEl, insertedText) {
  if (!rootEl || !insertedText) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const range = sel.getRangeAt(0)
  if (!range.collapsed) return

  const container = range.endContainer
  const offset = range.endOffset

  // Text nodes only
  if (container.nodeType !== Node.TEXT_NODE) return

  // Already inside a ts-inserted run — the browser will keep typing into it, do nothing
  const parentEl = container.parentElement
  if (parentEl?.closest?.('.ts-inserted')) return

  const len = insertedText.length
  if (offset < len) return  // safety

  const raw = container.textContent
  const before   = raw.slice(0, offset - len)
  const inserted = raw.slice(offset - len, offset)
  const after    = raw.slice(offset)

  const doc = container.ownerDocument
  const parent = container.parentNode
  const nextSibling = container.nextSibling
  parent.removeChild(container)

  const beforeNode = doc.createTextNode(before)
  const span = doc.createElement('span')
  span.className = 'ts-inserted'
  span.textContent = inserted
  const afterNode = doc.createTextNode(after)

  parent.insertBefore(afterNode,  nextSibling)
  parent.insertBefore(span,       afterNode)
  parent.insertBefore(beforeNode, span)

  // Put the caret at the END of the inserted text, still INSIDE the span,
  // so subsequent keystrokes extend the same run.
  const newRange = doc.createRange()
  newRange.setStart(span.firstChild, span.firstChild.length)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)
}

export default function Editable({
  as: Tag = 'p',
  html,
  text,
  className,
  style,
  onClick,
  onMouseDown,
  onKeyDown,
  onInput,
  onFocus,
  onKeyUp,
  contentEditable = true,
  ...rest
}) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (html !== undefined && html !== null) {
      el.innerHTML = html
    } else if (text !== undefined && text !== null) {
      el.textContent = text
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFocus = (e) => {
    rememberSelection()
    onFocus?.(e)
  }
  const handleKeyUp = (e) => {
    rememberSelection()
    onKeyUp?.(e)
  }
  const handleClick = (e) => {
    setTimeout(rememberSelection, 0)
    onClick?.(e)
  }

  const handleInput = (e) => {
    const native = e.nativeEvent
    // Ignore formatting/style events (Bold, Italic, alignment, etc.)
    if (native && native.inputType && !CONTENT_INPUT_TYPES.has(native.inputType)) {
      return
    }
    // Wrap the just-typed run inline
    if (native && INSERT_TYPES.has(native.inputType) && native.data) {
      try {
        wrapLastInsertion(ref.current, native.data)
      } catch { /* swallow — DOM state can be weird during composition */ }
    }
    onInput?.(e)
  }

  /**
   * Fires BEFORE the browser applies a change. For delete operations,
   * we intercept and wrap the affected range in a .ts-deleted strikethrough,
   * preventing the actual removal so reviewers see what was taken out.
   */
  const handleBeforeInput = (e) => {
    const native = e.nativeEvent
    if (!native || !native.inputType) return
    if (!DELETE_TYPES.has(native.inputType)) return
    const handled = trackDeletion(native)
    if (handled) {
      e.preventDefault()
      // Report the edit so the counter still ticks up
      onInput?.(e)
      // preventDefault above cancels the native `input` event that would
      // otherwise follow. Editor's undo pipeline listens for native input
      // events at document root — without one, no snapshot gets pushed and
      // Ctrl+Z can't restore this deletion. Dispatch a synthetic one that
      // bubbles so the pipeline still fires.
      try {
        ref.current?.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: native.inputType,
        }))
      } catch { /* older browsers may not accept the InputEvent init */ }
    }
  }

  return (
    <Tag
      ref={ref}
      className={className}
      style={style}
      onClick={handleClick}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onKeyUp={handleKeyUp}
      onBeforeInput={handleBeforeInput}
      onInput={handleInput}
      onFocus={handleFocus}
      contentEditable={contentEditable}
      suppressContentEditableWarning
      {...rest}
    />
  )
}
