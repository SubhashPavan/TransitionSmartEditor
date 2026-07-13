import { Play, AlertCircle, FileWarning, Link2, Sparkles, ShieldCheck, Pencil, History, RotateCcw } from 'lucide-react'
import sopData from '../data/sopContent.json'
import { useMemo, useState } from 'react'
import Editable from './Editable'
import FloatingZoom from './FloatingZoom'
import DocxPreviewCanvas from './DocxPreviewCanvas'

/**
 * Canvas — renders one of:
 *   • The interactive Ariba sample (no displayDoc passed / html null)
 *   • An uploaded/AI/checkpoint/approved doc via UploadedHtmlCanvas
 *
 * displayDoc carries { html, fileName, editable, banner, checkpointId? }
 * — the parent computed which version to show. Canvas just renders it.
 */
export default function Canvas({
  selection, onSelect,
  displayDoc,
  currentVersion,
  editedBlocks, onEdit,
  zoom = 100, onZoomIn, onZoomOut, onZoomReset, onZoomSet,
  trackChanges = true,
  onRestoreCheckpoint,
  onBlockAction,
  onBeforeMutation,
  getSectionVideo,
  onPlaySectionVideo,
}) {
  const zoomProps = { zoom, onZoomIn, onZoomOut, onZoomReset, onZoomSet }
  const sel = Array.isArray(selection) ? selection : (selection ? [selection] : [])
  const edited = editedBlocks || new Set()
  const zoomStyle = { zoom: `${zoom}%` }
  const tcClass = trackChanges ? '' : 'track-changes-off'

  // Route:
  //   • Fidelity render (docx-preview) → any version with arrayBuffer
  //     - Read-only versions (AI, Approved) stay read-only
  //     - Human Edits gets contentEditable + track-changes hooks on top
  //   • Block render (paginated) → checkpoints (only have HTML snapshots)
  //   • Interactive sample → when no displayDoc
  if (displayDoc?.arrayBuffer && displayDoc.useFidelityRender) {
    return (
      <div className={`relative h-full min-h-0 overflow-hidden ${tcClass}`}>
        <DocxPreviewCanvas
          arrayBuffer={displayDoc.arrayBuffer}
          banner={displayDoc.banner}
          zoom={zoom}
          editable={displayDoc.editable}
          checkpointId={displayDoc.checkpointId}
          onRestoreCheckpoint={onRestoreCheckpoint}
          selection={sel}
          onSelect={onSelect}
          editedBlocks={edited}
          onEdit={(blockId) => onEdit?.(blockId || 'docx-preview-body')}
          onBlockAction={onBlockAction}
          onBeforeMutation={onBeforeMutation}
          getSectionVideo={getSectionVideo}
          onPlaySectionVideo={onPlaySectionVideo}
        />
        <FloatingZoom {...zoomProps} />
      </div>
    )
  }

  if (displayDoc?.html) {
    return (
      <div className={`relative h-full min-h-0 overflow-hidden ${tcClass}`}>
        <UploadedHtmlCanvas
          doc={displayDoc}
          selection={sel}
          onSelect={onSelect}
          editedBlocks={edited}
          onEdit={onEdit}
          zoom={zoom}
          readOnly={!displayDoc.editable}
          banner={displayDoc.banner}
          checkpointId={displayDoc.checkpointId}
          onRestoreCheckpoint={onRestoreCheckpoint}
        />
        <FloatingZoom {...zoomProps} />
      </div>
    )
  }

  const readOnly = currentVersion === 'ai'

  return (
    <div className={`relative h-full min-h-0 overflow-hidden ${tcClass}`}>
    <div
      style={zoomStyle}
      data-canvas-inner="sample"
      className={`h-full overflow-y-auto bg-slate-300 py-3 pb-16 font-['Calibri','Segoe_UI',sans-serif] ${readOnly ? 'select-text' : ''}`}
    >

      {readOnly && (
        <div className="sticky top-0 z-10 px-4 py-2 bg-purple-100/95 backdrop-blur border-b border-purple-200 flex items-center gap-2 text-[12px] text-purple-900">
          <Sparkles size={13} className="text-purple-700" />
          <b>AI Base version</b> · read-only. Switch to <b>Human Edits</b> in the title bar to make changes.
        </div>
      )}

      {/* ═══════ COVER PAGE ═══════ */}
      <Page num="">
        <div className="flex flex-col items-center justify-center min-h-[820px]">
          <div className="w-40 h-14 bg-gradient-to-br from-orange-500 to-orange-700 text-white flex items-center justify-center font-bold tracking-[4px] text-lg mb-8 shadow-md rounded">
            SAP ARIBA
          </div>
          <div className="w-2/3 h-px bg-slate-300 mb-8" />
          <div className="text-[11px] tracking-[3px] uppercase text-slate-500 font-semibold mb-4">
            Standard Operating Procedure
          </div>
          <Editable
            as="h1"
            className="text-center text-[36px] font-bold text-slate-900 leading-tight mb-2 max-w-[560px]"
            text="Ariba Supplier Information & Performance Management"
          />
          <Editable
            as="div"
            className="text-center text-[16px] text-slate-600 italic mb-16"
            text="End-to-end guide for supplier onboarding, mass updates, and performance review"
          />
          <div className="text-[12px] text-slate-700 border-t border-slate-300 pt-5 min-w-[360px] max-w-[500px] w-2/3">
            <MetaRow label="Version"        value="1.0" />
            <MetaRow label="Effective Date" value="May 2026" />
            <MetaRow label="Document ID"    value="TS-ARIBA-SIPM-001" />
            <MetaRow label="Owner"          value="Procurement Operations Team" />
            <MetaRow label="Prepared by"    value="Infosys BPM · TransitionSmart Studio" />
            <MetaRow label="Reviewed by"    value="Priya K., Team Lead" />
          </div>
        </div>
      </Page>

      {/* ═══════ TABLE OF CONTENTS PAGE ═══════ */}
      <Page num="ii">
        <h1 className="text-[26px] font-bold text-slate-900 border-b-2 border-slate-800 pb-2 mb-4">
          Table of Contents
        </h1>
        <div className="text-[13px] leading-[2] mt-4">
          <TocRow label="Disclaimer"  page="iii" bold />
          <TocRow label="Audit Log"   page="iv" bold />
          {sopData.sections
            .filter(s => s.section_type !== 'header')
            .map((s, i) => (
              <TocRow
                key={s.section_number}
                sectionId={sectionAnchorId(s.section_number)}
                label={`${s.section_number} ${s.section_title}`}
                page={i + 1}
                indent={!s.section_number.endsWith('.0')}
              />
            ))
          }
        </div>
      </Page>

      {/* ═══════ DISCLAIMER PAGE ═══════ */}
      <Page num="iii">
        <div className="text-center pt-[180px]">
          <div className="inline-block text-red-800 border-2 border-red-800 px-8 py-2 mb-8 font-bold tracking-[6px] text-lg">
            DISCLAIMER
          </div>
          <Editable
            as="p"
            className="text-slate-700 max-w-md mx-auto text-[13px] leading-relaxed"
            text="This document is generated by TransitionSmart, an AI-powered documentation platform. All content, screenshots, and instructions are derived from source video recordings and are subject to human review before final publication."
          />
          <Editable
            as="p"
            className="text-slate-500 max-w-md mx-auto text-[11px] mt-6 italic"
            text="Confidential — for internal Infosys BPM & client use only."
          />
        </div>
      </Page>

      {/* ═══════ AUDIT LOG PAGE ═══════ */}
      <Page num="iv">
        <h1 className="text-[24px] font-bold text-slate-900 border-b-2 border-slate-800 pb-2 mb-4">
          Audit Log
        </h1>
        <p className="text-slate-600 text-[12px] mb-5 italic">
          Auto-generated coverage report for this SOP. Section names below are clickable.
        </p>

        <TableTitle>Summary Metrics</TableTitle>
        <table className="w-full text-[11.5px] border-collapse mb-5">
          <tbody>
            {[
              ['Total Sections', String(sopData.sections.length)],
              ['Total SOP Steps', '40'],
              ['Total Screenshots', '38'],
              ['Missing Screenshots', '2'],
              ['Source Videos', '3'],
              ['Total Runtime', '01:14:22'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 w-1/2">{k}</td>
                <td className="border border-slate-300 px-3 py-1.5 text-slate-900">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <TableTitle>Phase Coverage &amp; Step Breakdown</TableTitle>
        <table className="w-full text-[10.5px] border-collapse mb-5">
          <thead>
            <tr className="bg-slate-800 text-white">
              {['Section', 'Video', 'Time Range', 'Type', 'Steps', 'Shots', 'Status'].map(h => (
                <th key={h} className="border border-slate-300 px-2 py-1.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                <td className="border border-slate-300 px-2 py-1 text-[#185ABD] underline"><Link2 size={9} className="inline mr-0.5" />{r.section}</td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.video}</td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.time}</td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.type}</td>
                <td className="border border-slate-300 px-2 py-1 text-center text-slate-900">{r.steps}</td>
                <td className="border border-slate-300 px-2 py-1 text-center text-slate-900">{r.shots}</td>
                <td className="border border-slate-300 px-2 py-1"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <TableTitle>Steps Missing Screenshots (2)</TableTitle>
        <table className="w-full text-[10.5px] border-collapse mb-5">
          <thead>
            <tr className="bg-slate-800 text-white">
              {['Section', 'Step', 'Step Title'].map(h => (
                <th key={h} className="border border-slate-300 px-2 py-1.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-[#185ABD] underline">3.3 Buyer-Initiated Mass Update</td>
              <td className="border border-slate-300 px-2 py-1">Step 4</td>
              <td className="border border-slate-300 px-2 py-1">Configure Recipient List</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="border border-slate-300 px-2 py-1 text-[#185ABD] underline">4.1 Performance Reporting</td>
              <td className="border border-slate-300 px-2 py-1">Step 2</td>
              <td className="border border-slate-300 px-2 py-1">Filter by Vendor Category</td>
            </tr>
          </tbody>
        </table>

        <div className="bg-amber-50 border-l-4 border-amber-500 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2">
          <FileWarning size={13} className="mt-0.5 flex-shrink-0" />
          <span><b>Coverage note:</b> 38 of 40 steps have screenshots (95%). Remaining 2 need reviewer attention.</span>
        </div>
      </Page>

      {/* ═══════ REAL SOP SECTIONS — rendered from actual sop_content.json ═══════ */}
      {sopData.sections
        .filter(s => s.section_type !== 'header')
        .map((section, i) => (
          <SectionPage
            key={section.section_number}
            section={section}
            pageNum={i + 1}
            selection={selection}
            onSelect={onSelect}
            edited={edited}
            onEdit={onEdit}
          />
        ))}
    </div>
    <FloatingZoom {...zoomProps} />
    </div>
  )
}

/* Convert section_number "3.2" -> anchor id "section-3-2" */
function sectionAnchorId(num) {
  return `section-${String(num).replace(/\./g, '-')}`
}

/**
 * Parse a "MM:SS - MM:SS" (or "H:MM:SS - H:MM:SS") range into [startSec, endSec].
 * Returns [null, null] when the input isn't a valid range.
 */
function parseTimeRange(range) {
  if (!range || typeof range !== 'string') return [null, null]
  const parts = range.split(/[-–—]/).map(s => s.trim())
  if (parts.length !== 2) return [null, null]
  const toSec = (s) => {
    const bits = s.split(':').map(Number)
    if (bits.some(isNaN)) return null
    if (bits.length === 2) return bits[0] * 60 + bits[1]
    if (bits.length === 3) return bits[0] * 3600 + bits[1] * 60 + bits[2]
    return null
  }
  return [toSec(parts[0]), toSec(parts[1])]
}

/* Metadata rows on cover page — value is editable */
function MetaRow({ label, value }) {
  return (
    <div className="flex py-1">
      <span className="w-[140px] text-slate-500 font-semibold">{label}</span>
      <Editable as="span" className="text-slate-900 flex-1" text={value} />
    </div>
  )
}

/* Table-of-contents row — clickable + scrolls to section */
function TocRow({ label, page, sectionId, bold, indent }) {
  const handle = () => {
    if (!sectionId) return
    const el = document.getElementById(sectionId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const cursor = sectionId ? 'cursor-pointer hover:text-[#185ABD]' : ''
  return (
    <div
      onClick={handle}
      className={`flex items-baseline ${bold ? 'font-semibold text-slate-900' : 'text-slate-800'} ${cursor} ${indent ? 'pl-6' : ''}`}
    >
      <span>{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-400 mx-2 mb-1.5"></span>
      <span className="text-slate-500 text-[12px]">{page}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Page wrapper
═══════════════════════════════════════════════════════════════════ */

function Page({ children, num }) {
  return (
    <div className="page-shadow bg-white w-full mb-3 px-[72px] py-[54px] relative text-[13.5px] leading-[1.6] text-slate-900">
      {children}
      <div className="absolute bottom-4 right-8 text-[10px] text-slate-400">{num}</div>
    </div>
  )
}

function TableTitle({ children }) {
  return <h3 className="text-[13px] font-bold text-slate-800 mt-3 mb-2">{children}</h3>
}

/* ═══════════════════════════════════════════════════════════════════
   SectionPage — renders one section from the real sop_content.json
═══════════════════════════════════════════════════════════════════ */

function SectionPage({ section, pageNum, selection, onSelect, edited, onEdit }) {
  const sectionRange = section?.time_range && section.time_range !== 'n/a' ? section.time_range : null

  const isTopLevel = section.section_number.endsWith('.0')
  const HeadingTag = isTopLevel ? 'h1' : 'h2'
  const headingClass = isTopLevel
    ? 'text-[26px] font-bold text-[#2E74B5] leading-tight mt-0 mb-3'
    : 'text-[20px] font-bold text-[#2E74B5] leading-tight mt-4 mb-3'

  const anchorId = sectionAnchorId(section.section_number)

  // Parse "MM:SS - MM:SS" → [startSec, endSec] so InlineVideoPanel can
  // pre-seek + auto-pause at the section boundary.
  const [startSec, endSec] = parseTimeRange(sectionRange)
  // sopContent.json doesn't always populate `video` — infer it from the
  // section number until the parser fills the field. Sections 3.1–3.5
  // come from ariba_part01; 3.6+ / 4.x from ariba_part02.
  const inferredVideo = section.video || (section.section_number && parseFloat(section.section_number) >= 3.6
    ? 'ariba_part02'
    : 'ariba_part01')

  return (
    <div id={anchorId}>
    <Page num={pageNum}>
      <Editable
        as={HeadingTag}
        className={`${headingClass} ${edited?.has(`${section.section_number}-heading`) ? 'human-edited' : ''}`}
        text={`${section.section_number} ${section.section_title}`}
        onInput={() => onEdit?.(`${section.section_number}-heading`)}
      />

      {section.time_range && section.time_range !== 'n/a' && (
        <div className="text-[10px] text-slate-400 italic mb-2 flex items-center gap-1.5">
          <Play size={9} className="text-slate-400" /> Source: <b className="not-italic text-slate-500">{inferredVideo}</b> · {section.time_range}
        </div>
      )}

      <MarkdownBody
        content={section.content}
        sectionNum={section.section_number}
        sectionRange={sectionRange}
        selection={selection}
        onSelect={onSelect}
        edited={edited}
        onEdit={onEdit}
      />
    </Page>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MarkdownBody — parses the real markdown content and renders it
   as editable Word-like blocks. Supports:
   - **N. Step N: Title** step headings
   - ![Screenshot](path) images with italic caption after
   - --- horizontal rules
   - **bold**, *italic* inline
   - - / * bullets
   - Regular paragraphs
═══════════════════════════════════════════════════════════════════ */

function MarkdownBody({ content, sectionNum, sectionRange, selection, onSelect, edited, onEdit }) {
  const lines = content.split('\n')
  const blocks = []
  let i = 0
  let stepCounter = 0
  const K = (kind, idx) => `${sectionNum}-${kind}-${idx}`  // section-scoped unique block key

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    if (!line) { i++; continue }

    // Skip H2/H3 (already in section title)
    if (line.startsWith('## ') || line.startsWith('### ')) {
      // Render as sub-heading
      const level = line.startsWith('### ') ? 3 : 2
      const text = line.replace(/^#+\s+/, '')
      blocks.push({ kind: 'sub-heading', level, text, key: K('sub', i) })
      i++
      continue
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line) || /^_{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      blocks.push({ kind: 'hr', key: K('hr', i) })
      i++
      continue
    }

    // Step heading (**N. Step N: Title** or **N. Title**)
    const stepMatch = line.match(/^\*\*(\d+)\.\s+(?:Step\s+\d+:\s*)?(.+?)\*\*$/)
    if (stepMatch) {
      stepCounter += 1
      const stepId = `${sectionNum}-step-${stepMatch[1]}`
      const num = stepMatch[1]
      const title = stepMatch[2]

      // Peek ahead: collect until next step / hr / image / eof — that's the instruction
      let instruction = []
      let images = []
      i++
      while (i < lines.length) {
        const nextRaw = lines[i]
        const next = nextRaw.trim()
        // Stop at next step or hr
        if (next.match(/^\*\*\d+\.\s/) || /^-{3,}$/.test(next)) break
        // Image?
        const imgMatch = next.match(/^!\[.*?\]\((.+?)\)/)
        if (imgMatch) {
          // Look ahead for italic caption
          let caption = null
          if (i + 1 < lines.length) {
            const cap = lines[i + 1].trim()
            if (cap.startsWith('*') && cap.endsWith('*') && !cap.startsWith('**')) {
              caption = cap.slice(1, -1)
              i++
            }
          }
          images.push({ path: imgMatch[1], caption, key: `${stepId}-img-${i}` })
          i++
          continue
        }
        // Regular line — accumulate as instruction
        if (next) instruction.push(next)
        i++
      }

      blocks.push({
        kind: 'step',
        id: stepId,
        num,
        title,
        instruction: instruction.join(' '),
        images,
        confidence: pseudoConfidence(stepId),
        key: `step-${stepId}`,
      })
      continue
    }

    // Bold-labeled paragraph (e.g., "**Expected Result:** ..." or "**Next:** ...")
    if (line.startsWith('**') && line.includes(':**')) {
      blocks.push({ kind: 'labeled-para', text: line, key: K('labeled', i) })
      i++
      continue
    }

    // Bullet
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [line.slice(2).trim()]
      const start = i
      i++
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        items.push(lines[i].trim().slice(2).trim())
        i++
      }
      blocks.push({ kind: 'bullets', items, key: K('bullets', start) })
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      const start = i
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push({ kind: 'numbered', items, key: K('numbered', start) })
      continue
    }

    // Standalone image (rare outside a step)
    const imgMatch = line.match(/^!\[.*?\]\((.+?)\)/)
    if (imgMatch) {
      let caption = null
      const start = i
      if (i + 1 < lines.length) {
        const cap = lines[i + 1].trim()
        if (cap.startsWith('*') && cap.endsWith('*') && !cap.startsWith('**')) {
          caption = cap.slice(1, -1)
          i++
        }
      }
      blocks.push({ kind: 'image', path: imgMatch[1], caption, key: K('img', start) })
      i++
      continue
    }

    // Regular paragraph
    blocks.push({ kind: 'p', text: line, key: K('p', i) })
    i++
  }

  return (
    <div>
      {blocks.map(b => (
        <BlockRenderer
          key={b.key}
          block={b}
          sectionRange={sectionRange}
          selection={selection}
          onSelect={onSelect}
          edited={edited}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Block renderer — turns parsed blocks into editable JSX
═══════════════════════════════════════════════════════════════════ */

function BlockRenderer({ block, sectionRange, selection, onSelect, edited, onEdit }) {
  // selection is an array — check membership
  const sel = Array.isArray(selection) ? selection : (selection ? [selection] : [])
  const isSelected = (kind) =>
    sel.some(s => s?.type === kind && s?.id === block.key)
  const selectRing = (active) => active ? 'block-selected' : ''
  const isEdited = (key) => edited?.has(key)
  const editedRing = (key) => isEdited(key) ? 'human-edited' : ''
  const notifyEdit = (key) => () => onEdit?.(key)

  const selectBlock = (type, extra = {}) => (e) => {
    if (window.getSelection().toString().length === 0) {
      onSelect(
        { type, id: block.key, text: block.text || '', kind: block.kind, ...extra },
        e
      )
    }
  }

  switch (block.kind) {
    case 'p':
      return (
        <Editable
          as="p"
          onClick={selectBlock('paragraph')}
          onInput={notifyEdit(block.key)}
          className={`mb-3 px-1.5 py-0.5 -mx-1.5 text-[13px] leading-[1.65] text-slate-900 text-justify cursor-text hover:bg-slate-50 transition-colors ${selectRing(isSelected('paragraph'))} ${editedRing(block.key)}`}
          html={inlineMarkdown(block.text)}
        />
      )

    case 'labeled-para':
      return (
        <Editable
          as="p"
          onClick={selectBlock('paragraph')}
          onInput={notifyEdit(block.key)}
          className={`mb-2 px-1.5 py-0.5 -mx-1.5 text-[13px] leading-[1.6] text-slate-900 cursor-text hover:bg-slate-50 transition-colors ${selectRing(isSelected('paragraph'))} ${editedRing(block.key)}`}
          html={inlineMarkdown(block.text)}
        />
      )

    case 'sub-heading':
      return (
        <Editable
          as="div"
          onClick={selectBlock('heading')}
          onInput={notifyEdit(block.key)}
          className={`px-1.5 py-0.5 -mx-1.5 cursor-text hover:bg-slate-50 transition-colors ${
            block.level === 3
              ? 'text-[15px] font-bold text-slate-800 mt-4 mb-2'
              : 'text-[18px] font-bold text-[#2E74B5] mt-4 mb-2'
          } ${selectRing(isSelected('heading'))} ${editedRing(block.key)}`}
          text={block.text}
        />
      )

    case 'hr':
      return <hr className="my-4 border-t border-slate-300" />

    case 'bullets':
      return (
        <ul
          onClick={selectBlock('list')}
          onInput={notifyEdit(block.key)}
          className={`mb-3 px-1.5 py-0.5 -mx-1.5 pl-6 list-disc text-[13px] leading-[1.6] text-slate-900 cursor-text hover:bg-slate-50 transition-colors ${selectRing(isSelected('list'))} ${editedRing(block.key)}`}
        >
          {block.items.map((item, i) => (
            <Editable
              key={i}
              as="li"
              html={inlineMarkdown(item)}
            />
          ))}
        </ul>
      )

    case 'numbered':
      return (
        <ol
          onClick={selectBlock('list')}
          onInput={notifyEdit(block.key)}
          className={`mb-3 px-1.5 py-0.5 -mx-1.5 pl-6 list-decimal text-[13px] leading-[1.6] text-slate-900 cursor-text hover:bg-slate-50 transition-colors ${selectRing(isSelected('list'))} ${editedRing(block.key)}`}
        >
          {block.items.map((item, i) => (
            <Editable
              key={i}
              as="li"
              html={inlineMarkdown(item)}
            />
          ))}
        </ol>
      )

    case 'image':
      return <Figure path={block.path} caption={block.caption} confidence={78} confTone="med" />

    case 'step': {
      const confBar = {
        hi: 'border-l-transparent',
        med: 'border-l-amber-500',
        lo: 'border-l-red-500 bg-red-50/40',
      }
      const dotColor = { hi: 'bg-emerald-500', med: 'bg-amber-500', lo: 'bg-red-500' }

      // Individual selection keys — title and instruction are separately selectable
      const titleKey = `${block.id}-title`
      const instrKey = `${block.id}-instr`
      const titleSelected = sel.some(s => s?.id === titleKey)
      const instrSelected = sel.some(s => s?.id === instrKey)

      const clickTitle = (e) => {
        if (window.getSelection().toString().length === 0) {
          onSelect({ type: 'heading',   id: titleKey, text: block.title,       kind: 'step-title' }, e)
        }
      }
      const clickInstr = (e) => {
        if (window.getSelection().toString().length === 0) {
          onSelect({ type: 'paragraph', id: instrKey, text: block.instruction, kind: 'step-instr' }, e)
        }
      }

      return (
        <div
          className={`my-3 py-1 pr-2.5 pl-3 rounded-md border-l-[3px] ${confBar[block.confidence]} transition-colors`}
        >
          <div
            onClick={clickTitle}
            className={`flex items-baseline gap-2 mb-1 cursor-text px-1.5 -mx-1.5 py-0.5 rounded hover:bg-slate-50 ${titleSelected ? 'block-selected' : ''} ${isEdited(titleKey) ? 'human-edited' : ''}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${dotColor[block.confidence]} translate-y-[-2px] flex-shrink-0`} />
            <Editable
              as="div"
              onInput={notifyEdit(titleKey)}
              className="font-bold text-slate-900 text-[14px] flex-1"
              text={`Step ${block.num}: ${block.title}`}
            />
          </div>
          <Editable
            as="p"
            onClick={clickInstr}
            onInput={notifyEdit(instrKey)}
            className={`text-slate-900 text-[13px] leading-[1.65] pl-4 mb-2 text-justify cursor-text px-1.5 py-0.5 rounded hover:bg-slate-50 ${instrSelected ? 'block-selected' : ''} ${isEdited(instrKey) ? 'human-edited' : ''}`}
            html={inlineMarkdown(block.instruction)}
          />
          {block.images.map((img, i) => (
            <div key={img.key} className="pl-4">
              <Figure
                path={img.path}
                caption={img.caption}
                confidence={pseudoScreenshotConf(block.id + i)}
                confTone={pseudoScreenshotTone(block.id + i)}
                selected={sel.some(s => s?.type === 'screenshot' && s?.id === img.key)}
                onSelect={(e) => {
                  e.stopPropagation()
                  // Pass the frame path as `src` so the image panel can
                  // parse the `frame_XXs.jpg` timestamp for its timeline.
                  // sectionRange (e.g. "04:22 - 10:27") is piped through
                  // so the enlarge modal can render the frozen section timeline.
                  onSelect({
                    type: 'screenshot',
                    id:   img.key,
                    src:  img.path,
                    alt:  img.caption || '',
                    sectionRange,
                  }, null)
                }}
              />
            </div>
          ))}
        </div>
      )
    }

    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Figure — screenshot placeholder + italic centered caption
═══════════════════════════════════════════════════════════════════ */

function Figure({ path, caption, confidence, confTone, selected, onSelect }) {
  const badgeColor = confTone === 'hi' ? 'bg-emerald-600' : confTone === 'med' ? 'bg-amber-600' : 'bg-red-600'
  const border = selected
    ? 'border-[#185ABD] border-2 shadow-[0_6px_20px_rgba(24,90,189,0.30)]'
    : 'border-slate-300 border hover:shadow-[0_4px_14px_rgba(24,90,189,0.12)]'

  // Extract frame time from path e.g. "frame_447.60s.jpg" -> "07:27"
  const timeMatch = path && path.match(/frame_(\d+(?:\.\d+)?)s/)
  const timeStr = timeMatch ? secondsToTime(parseFloat(timeMatch[1])) : null

  return (
    <div className="my-3">
      <div
        onClick={onSelect}
        className={`rounded-md bg-white block relative cursor-pointer overflow-hidden transition-all ${border}`}
      >
        <ScreenshotPlaceholder path={path} />
        <div className={`absolute top-2 right-2 ${badgeColor} text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm font-semibold`}>
          <span className="w-1.5 h-1.5 rounded-full bg-white/90"></span> {confidence}%
        </div>
        {timeStr && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded font-mono">
            <Play size={8} fill="white" className="inline mr-0.5" />
            {timeStr}
          </div>
        )}
      </div>
      {caption && (
        <Editable
          as="div"
          className="text-center text-[11px] italic text-slate-600 mt-1.5"
          text={caption}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Screenshot placeholder — mimics a keyframe capture
═══════════════════════════════════════════════════════════════════ */

function ScreenshotPlaceholder({ path }) {
  // Deterministically pick a variant from the path so screenshots aren't identical
  const variants = ['profile', 'sourcing', 'reporting', 'contacts']
  const hash = path ? path.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0
  const variant = variants[hash % variants.length]
  return <SarapAribaSVG variant={variant} />
}

function SarapAribaSVG({ variant }) {
  const commonHeader = <>
    <rect width="600" height="320" fill="#f8fafc" />
    <rect y="0" width="600" height="38" fill="#f47b30" />
    <text x="14" y="24" fill="#fff" fontSize="12" fontWeight="700">SAP Ariba</text>
  </>

  if (variant === 'profile') {
    return (
      <svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto">
        {commonHeader}
        <text x="510" y="24" fill="#ffe7d3" fontSize="11">Supplier ▾</text>
        <rect y="38" width="600" height="34" fill="#0F172A" />
        <text x="20" y="60" fill="#fff" fontSize="11" fontWeight="600">Basic</text>
        <text x="80" y="60" fill="#94a3b8" fontSize="11">Marketing</text>
        <text x="160" y="60" fill="#94a3b8" fontSize="11">Contacts</text>
        <text x="230" y="60" fill="#94a3b8" fontSize="11">Certifications</text>
        <rect x="16" y="55" width="46" height="4" fill="#f47b30" />
        <rect x="6" y="49" width="66" height="22" fill="none" stroke="#ef4444" strokeWidth="2.5" rx="3" />
        <rect x="30" y="94" width="540" height="200" fill="#fff" stroke="#e2e8f0" rx="4" />
        <text x="46" y="118" fill="#0F172A" fontSize="14" fontWeight="700">Basic Information</text>
        <text x="46" y="150" fill="#64748b" fontSize="10">Company Name</text>
        <rect x="46" y="156" width="240" height="24" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
        <text x="54" y="172" fill="#0F172A" fontSize="11">ACME Manufacturing Ltd.</text>
        <text x="306" y="150" fill="#64748b" fontSize="10">Website</text>
        <rect x="306" y="156" width="240" height="24" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
        <text x="314" y="172" fill="#0F172A" fontSize="11">acme-mfg.com</text>
        <text x="46" y="204" fill="#64748b" fontSize="10">Primary Address</text>
        <rect x="46" y="210" width="500" height="24" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
        <text x="54" y="226" fill="#0F172A" fontSize="11">1200 Industrial Way, Chicago IL 60601</text>
        <rect x="46" y="255" width="90" height="26" fill="#f47b30" rx="3" />
        <text x="91" y="272" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">Save</text>
      </svg>
    )
  }
  if (variant === 'sourcing') {
    return (
      <svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto">
        {commonHeader}
        <text x="510" y="24" fill="#ffe7d3" fontSize="11">Buyer ▾</text>
        <rect y="38" width="600" height="34" fill="#0F172A" />
        <text x="20" y="60" fill="#fff" fontSize="11" fontWeight="600">Create Sourcing Project</text>
        <rect x="30" y="94" width="540" height="200" fill="#fff" stroke="#e2e8f0" rx="4" />
        <text x="46" y="118" fill="#0F172A" fontSize="14" fontWeight="700">New Mass Update Campaign</text>
        <text x="46" y="150" fill="#64748b" fontSize="10">Project Name</text>
        <rect x="46" y="156" width="500" height="26" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
        <text x="54" y="173" fill="#0F172A" fontSize="11">Q2 Supplier Data Refresh</text>
        <rect x="42" y="152" width="508" height="34" fill="none" stroke="#ef4444" strokeWidth="2.5" rx="3" />
        <text x="46" y="206" fill="#64748b" fontSize="10">Recipient List</text>
        <rect x="46" y="212" width="500" height="26" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
        <text x="54" y="228" fill="#94a3b8" fontSize="11">Select suppliers by category…</text>
        <rect x="46" y="256" width="90" height="26" fill="#f47b30" rx="3" />
        <text x="91" y="273" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">Create</text>
        <rect x="146" y="256" width="90" height="26" fill="#fff" stroke="#cbd5e1" rx="3" />
        <text x="191" y="273" textAnchor="middle" fill="#334155" fontSize="11">Cancel</text>
      </svg>
    )
  }
  if (variant === 'reporting') {
    return (
      <svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto">
        {commonHeader}
        <text x="510" y="24" fill="#ffe7d3" fontSize="11">Analyst ▾</text>
        <rect y="38" width="600" height="34" fill="#0F172A" />
        <text x="20" y="60" fill="#fff" fontSize="11" fontWeight="600">Performance Dashboard</text>
        <g transform="translate(30, 94)">
          <rect width="255" height="90" fill="#eff6ff" stroke="#93c5fd" rx="4" />
          <text x="14" y="24" fill="#1e40af" fontSize="11" fontWeight="600">On-Time Delivery</text>
          <text x="14" y="60" fill="#0F172A" fontSize="28" fontWeight="800">94.2%</text>
          <text x="14" y="76" fill="#22c55e" fontSize="10">▲ +2.1% vs prev qtr</text>
          <rect x="270" width="255" height="90" fill="#fef3c7" stroke="#fcd34d" rx="4" />
          <text x="284" y="24" fill="#a16207" fontSize="11" fontWeight="600">Quality Score</text>
          <text x="284" y="60" fill="#0F172A" fontSize="28" fontWeight="800">87.5</text>
          <text x="284" y="76" fill="#dc2626" fontSize="10">▼ -1.4% vs prev qtr</text>
        </g>
        <g transform="translate(30, 200)">
          <rect width="525" height="90" fill="#fff" stroke="#e2e8f0" rx="4" />
          <text x="14" y="20" fill="#0F172A" fontSize="11" fontWeight="600">Top 5 Suppliers by Volume</text>
          {['ACME', 'GlobalTech', 'NovaPart', 'PrimeSup', 'CoreMfg'].map((n, i) => (
            <g key={n} transform={`translate(14, ${34 + i * 10})`}>
              <text fill="#64748b" fontSize="9">{n}</text>
              <rect x="70" y="-7" width={140 - i * 20} height="7" fill="#f47b30" />
            </g>
          ))}
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto">
      {commonHeader}
      <text x="510" y="24" fill="#ffe7d3" fontSize="11">Supplier ▾</text>
      <rect y="38" width="600" height="34" fill="#0F172A" />
      <text x="20" y="60" fill="#fff" fontSize="11" fontWeight="600">Contacts</text>
      <rect x="30" y="94" width="540" height="200" fill="#fff" stroke="#e2e8f0" rx="4" />
      <text x="46" y="118" fill="#0F172A" fontSize="14" fontWeight="700">Company Contact Personnel</text>
      {['Accounts Payable', 'Customer Care Manager', 'Technical Contact'].map((role, i) => (
        <g key={role} transform={`translate(46, ${150 + i * 40})`}>
          <text fill="#64748b" fontSize="10">{role}</text>
          <rect y="8" width="500" height="22" fill="#f8fafc" stroke="#cbd5e1" rx="3" />
          <text x="8" y="24" fill="#0F172A" fontSize="11">
            {i === 0 ? 'ap@acme-mfg.com' : i === 1 ? 'ccm@acme-mfg.com' : 'tech@acme-mfg.com'}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════════════ */

function StatusPill({ status }) {
  const map = {
    'complete':  'bg-emerald-100 text-emerald-800 border-emerald-300',
    'missing':   'bg-amber-100 text-amber-900 border-amber-300',
    'no-video':  'bg-slate-100 text-slate-700 border-slate-300',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold border ${map[status]}`}>
      {status === 'complete' ? '✓ complete' : status === 'missing' ? '⚠ missing' : '− n/a'}
    </span>
  )
}

// Convert **bold** and *italic* into <b>/<i> tags for safe rendering
function inlineMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<![*])\*([^*]+?)\*(?![*])/g, '<i>$1</i>')
}

function pseudoConfidence(id) {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const mod = hash % 10
  if (mod < 6) return 'hi'
  if (mod < 8) return 'med'
  return 'lo'
}

function pseudoScreenshotConf(id) {
  const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return 60 + (hash % 40)
}

function pseudoScreenshotTone(id) {
  const c = pseudoScreenshotConf(id)
  if (c >= 85) return 'hi'
  if (c >= 70) return 'med'
  return 'lo'
}

function secondsToTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/* ═══════════════════════════════════════════════════════════════════
   Coverage table data
═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   UploadedHtmlCanvas — renders mammoth-parsed .docx HTML
   inside a Word-like page frame. Editable via contentEditable.
═══════════════════════════════════════════════════════════════════ */

function UploadedHtmlCanvas({ doc, banner, selection, onSelect, editedBlocks, onEdit, zoom = 100, readOnly = false, checkpointId, onRestoreCheckpoint }) {
  const bannerBg = {
    brand:   'bg-brand-100/95 border-brand-200 text-brand-900',
    emerald: 'bg-emerald-100/95 border-emerald-200 text-emerald-900',
    purple:  'bg-purple-100/95 border-purple-200 text-purple-900',
    amber:   'bg-amber-100/95 border-amber-200 text-amber-900',
  }[banner?.tone] || 'bg-slate-100 border-slate-200 text-slate-900'

  const bannerIcon = banner?.kind === 'ai'         ? <Sparkles size={13} />
                   : banner?.kind === 'approved'   ? <ShieldCheck size={13} />
                   : banner?.kind === 'checkpoint' ? <History size={13} />
                   : <Pencil size={13} />

  const sel = Array.isArray(selection) ? selection : (selection ? [selection] : [])

  // Parse mammoth HTML into an array of top-level blocks so each is
  // individually clickable and selectable. Then chunk blocks into
  // simulated "pages" — Word-like page breaks based on estimated content
  // height. Each block contributes a rough vertical cost; when a page's
  // budget is exhausted, we start a new page container.
  const { pages } = useMemo(() => {
    if (!doc?.html) return { pages: [] }
    const parser = new DOMParser()
    const parsed = parser.parseFromString(`<div>${doc.html}</div>`, 'text/html')
    const container = parsed.body.firstElementChild
    if (!container) return { pages: [] }

    const allBlocks = Array.from(container.children).map((el, idx) => ({
      id:   `upl-${idx}`,
      tag:  el.tagName.toLowerCase(),
      html: el.innerHTML,
      text: el.textContent || '',
    }))

    // Rough per-block height estimate (in px) — matches the CSS we ship.
    // This isn't perfectly accurate but gives believable page breaks.
    const CONTENT_HEIGHT = 912  // Letter page 11" × 96dpi = 1056 minus ~144 padding
    const estimateBlockHeight = (b) => {
      const tag = b.tag
      if (tag === 'h1') return 60
      if (tag === 'h2') return 44
      if (tag === 'h3') return 34
      if (tag === 'h4') return 30
      if (tag === 'hr') return 20
      if (tag === 'table') {
        // Rough: count <tr> and estimate 26px each + 24 padding
        const rows = (b.html.match(/<tr/gi) || []).length || 1
        return Math.min(600, 40 + rows * 26)
      }
      if (tag === 'ul' || tag === 'ol') {
        const items = (b.html.match(/<li/gi) || []).length || 1
        return 10 + items * 22
      }
      // p / div / blockquote / pre — estimate by character count → wrapped lines
      const chars = b.text.length
      const LINE_CHARS = 92   // approx per line at 13.5px in ~640px content width
      const lines = Math.max(1, Math.ceil(chars / LINE_CHARS))
      return 10 + lines * 22
    }

    // Split blocks into page-sized chunks
    const pages = []
    let current = { blocks: [], used: 0 }
    for (const b of allBlocks) {
      const h = estimateBlockHeight(b)
      // If this single block would fill more than a page (like a big table),
      // put it on its own page rather than let it start half-in half-out.
      if (h > CONTENT_HEIGHT * 0.85 && current.blocks.length > 0) {
        pages.push(current)
        current = { blocks: [b], used: h }
        continue
      }
      if (current.used + h > CONTENT_HEIGHT && current.blocks.length > 0) {
        pages.push(current)
        current = { blocks: [b], used: h }
      } else {
        current.blocks.push(b)
        current.used += h
      }
    }
    if (current.blocks.length > 0) pages.push(current)

    return { pages }
  }, [doc?.html])

  return (
    <div
      style={{ zoom: `${zoom}%` }}
      className={`h-full overflow-y-auto bg-slate-300 py-3 pb-16 font-['Calibri','Segoe_UI',sans-serif] ${readOnly ? 'select-text' : ''}`}
    >
      {banner && (
        <div className={`sticky top-0 z-10 px-4 py-2 backdrop-blur border-b flex items-center gap-2 text-[12px] ${bannerBg}`}>
          {bannerIcon}
          <b>{banner.title}</b>
          <span>· {banner.msg}</span>
          {checkpointId && onRestoreCheckpoint && (
            <button
              onClick={() => onRestoreCheckpoint(checkpointId)}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
            >
              <RotateCcw size={11} /> Restore this checkpoint
            </button>
          )}
        </div>
      )}

      {/* Each page is its own Word-sized paper. Blocks flow into pages
          based on estimated height so long docs read like a real Word file. */}
      <div className="max-w-[820px] mx-auto">
      {pages.map((pg, pageIdx) => (
        <div
          key={pageIdx}
          className={`page-shadow bg-white mb-4 px-[72px] py-[54px] relative text-[13.5px] leading-[1.6] text-slate-900 uploaded-doc ${readOnly ? 'uploaded-doc-readonly' : ''}`}
          style={{ width: '816px', minHeight: '1056px' }}
        >
          {pg.blocks.map((b) => (
            <UploadedBlock
              key={b.id}
              block={b}
              readOnly={readOnly}
              selected={sel.some(s => s?.id === b.id)}
              imageSelected={sel.some(s => s?.type === 'image' && s?.id?.startsWith(b.id))}
              edited={editedBlocks?.has(b.id)}
              onEdit={() => onEdit?.(b.id)}
              onClick={(e) => {
                if (window.getSelection().toString().length !== 0) return
                if (e.target?.tagName === 'IMG') {
                  onSelect?.(
                    {
                      type: 'image',
                      id:   `${b.id}-img`,
                      src:  e.target.src,
                      alt:  e.target.alt || '',
                      kind: 'image',
                    },
                    e
                  )
                  return
                }
                onSelect?.(
                  { type: TAG_TO_TYPE[b.tag] || 'paragraph', id: b.id, text: b.text, kind: b.tag },
                  e
                )
              }}
            />
          ))}
          <div className="absolute bottom-4 right-8 text-[10px] text-slate-400 tabular-nums">
            Page {pageIdx + 1} of {pages.length}
          </div>
        </div>
      ))}
      </div>

      {/* Word-like typography for parsed content */}
      <style>{`
        .uploaded-doc h1 { font-size: 26px; font-weight: 700; color: #2E74B5; margin: 12px 0 6px; }
        .uploaded-doc h2 { font-size: 20px; font-weight: 700; color: #2E74B5; margin: 18px 0 8px; }
        .uploaded-doc h3 { font-size: 16px; font-weight: 700; color: #1F3864; margin: 14px 0 6px; }
        .uploaded-doc h4 { font-size: 14px; font-weight: 700; color: #1F3864; margin: 12px 0 4px; }
        .uploaded-doc p  { margin: 0 0 10px; }
        .uploaded-doc ul, .uploaded-doc ol { margin: 0 0 10px 24px; }
        .uploaded-doc li { margin: 2px 0; }
        .uploaded-doc table { border-collapse: collapse; margin: 10px 0; width: 100%; }
        .uploaded-doc td, .uploaded-doc th { border: 1px solid #cbd5e1; padding: 4px 8px; }
        .uploaded-doc img {
          max-width: 100%; height: auto; margin: 8px 0;
          cursor: zoom-in; border-radius: 4px;
          transition: outline 0.15s ease, box-shadow 0.15s ease;
        }
        .uploaded-doc img:hover {
          outline: 2px solid rgba(37,99,235,0.35);
          outline-offset: 2px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.10);
        }
        .uploaded-doc .upl-hover:hover { background-color: rgba(15,23,42,0.03); border-radius: 4px; }
      `}</style>
    </div>
  )
}

/**
 * Individual uploaded-doc block — each <p>, <h1>, <ul>, <table>, etc.
 * gets its own click handler and .block-selected highlight.
 * When readOnly, contentEditable is disabled and edits are blocked.
 */
function UploadedBlock({ block, selected, edited, onClick, onEdit, readOnly = false }) {
  const cursor = readOnly ? 'cursor-default' : 'cursor-text'
  const activeClass = selected ? 'block-selected' : ''
  const editedClass = edited ? 'human-edited' : ''
  const pad = 'px-1.5 -mx-1.5 py-0.5 upl-hover transition-colors'

  return (
    <Editable
      as={block.tag}
      html={block.html}
      onClick={onClick}
      onInput={onEdit}
      contentEditable={!readOnly}
      className={`${pad} ${cursor} ${activeClass} ${editedClass}`}
    />
  )
}

// Map HTML tag → our selection "type" so the right rail routes to the right panel
const TAG_TO_TYPE = {
  h1:  'heading',
  h2:  'heading',
  h3:  'heading',
  h4:  'heading',
  h5:  'heading',
  h6:  'heading',
  p:   'paragraph',
  ul:  'list',
  ol:  'list',
  li:  'list',
  table: 'paragraph',
  blockquote: 'paragraph',
  pre: 'paragraph',
}

const COVERAGE = [
  { section: '1.0 Objectives',                              video: '—',            time: 'n/a',            type: 'template',  steps: '—', shots: '—', status: 'no-video' },
  { section: '2.0 Process Overview',                        video: '—',            time: 'n/a',            type: 'template',  steps: '—', shots: '—', status: 'no-video' },
  { section: '3.1 Introduction to Procurement Challenges',  video: 'ariba_part01', time: '00:00 - 02:49',  type: 'narrative', steps: '0', shots: '0', status: 'complete' },
  { section: '3.2 Supplier Self-Service Profile Demo',      video: 'ariba_part01', time: '04:22 - 10:27',  type: 'process',   steps: '6', shots: '6', status: 'complete' },
  { section: '3.3 Buyer-Initiated Mass Update Campaign',    video: 'ariba_part01', time: '11:22 - 15:31',  type: 'process',   steps: '5', shots: '4', status: 'missing' },
  { section: '3.4 Reviewing Supplier Performance Metrics',  video: 'ariba_part02', time: '00:00 - 06:14',  type: 'process',   steps: '4', shots: '4', status: 'complete' },
  { section: '4.1 Performance Reporting Configuration',     video: 'ariba_part02', time: '06:14 - 10:00',  type: 'process',   steps: '3', shots: '2', status: 'missing' },
]
