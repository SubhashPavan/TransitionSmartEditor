import MultiSelectPanel from './MultiSelectPanel'

/**
 * Right rail — only rendered when a multi-select actually needs a
 * batch-operations panel. All other cases are handled inline:
 *   • Single-block actions → floating pill on the block itself
 *   • Image / screenshot   → fullscreen enlarge modal
 *   • Nothing selected     → no rail at all (parent collapses the column)
 */
export default function RightRail({ selection, clearSelection }) {
  const sel = Array.isArray(selection) ? selection : (selection ? [selection] : [])
  if (sel.length <= 1) return null
  return (
    <div className="bg-white border-l border-slate-100 overflow-y-auto flex flex-col">
      <MultiSelectPanel selection={sel} onClose={clearSelection} />
    </div>
  )
}
