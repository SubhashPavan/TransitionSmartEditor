/**
 * Pure functions for computing document-level metrics from HTML.
 * All comparisons in the Telemetry panel run through these — the
 * "AI Base" column uses aiHtml, the "Human" column uses the latest
 * checkpoint (or the live humanHtml), the "Approved" column uses
 * approvedHtml. Deltas are always relative to the AI Base column.
 */

/** Strip HTML tags → plain text. Also collapses whitespace. */
export function htmlToText(html) {
  if (!html) return ''
  try {
    const p = new DOMParser().parseFromString(html, 'text/html')
    // Remove markup that isn't real content (tracked deletions especially)
    p.querySelectorAll('.ts-deleted, script, style').forEach(el => el.remove())
    const text = (p.body.textContent || '').replace(/\s+/g, ' ').trim()
    return text
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

export function wordCount(text) {
  if (!text) return 0
  return text.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length
}

export function charCount(text) {
  return text ? text.length : 0
}

export function sentenceCount(text) {
  if (!text) return 0
  return text.split(/[.!?]+\s/).filter(s => s.trim().length > 0).length || 1
}

/**
 * Rough syllable count per word — good enough for a readability signal,
 * not linguistically perfect. Follows a vowel-cluster heuristic and
 * handles trailing silent "e".
 */
function countSyllables(word) {
  if (!word) return 0
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
  return groups ? Math.max(1, groups.length) : 1
}

/**
 * Flesch-Kincaid Grade Level. Lower = easier.
 * Formula: 0.39*(words/sentences) + 11.8*(syllables/words) − 15.59
 */
export function fleschGrade(text) {
  if (!text) return null
  const words = text.split(/\s+/).filter(w => /[a-z]/i.test(w))
  if (words.length === 0) return null
  const sents = sentenceCount(text)
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0)
  const grade = 0.39 * (words.length / sents) + 11.8 * (syllables / words.length) - 15.59
  return Math.max(0, Math.round(grade * 10) / 10)
}

/**
 * Approximate passive-voice percentage: sentences containing
 * "was/were/be/been/being/is/are + past-participle-ish word".
 * Not linguistically precise — just a signal.
 */
export function passivePercent(text) {
  if (!text) return 0
  const sentences = text.split(/[.!?]+\s/).filter(s => s.trim().length > 0)
  if (sentences.length === 0) return 0
  const passiveRe = /\b(?:was|were|be|been|being|is|are|am)\s+\w+(?:ed|en)\b/i
  const passive = sentences.filter(s => passiveRe.test(s)).length
  return Math.round((passive / sentences.length) * 100)
}

/** Count top-level headings (h1/h2) in the document. */
export function sectionCount(html) {
  if (!html) return 0
  try {
    const p = new DOMParser().parseFromString(html, 'text/html')
    return p.querySelectorAll('h1, h2').length
  } catch {
    return 0
  }
}

/** Count embedded images in the document. */
export function imageCount(html) {
  if (!html) return 0
  try {
    const p = new DOMParser().parseFromString(html, 'text/html')
    return p.querySelectorAll('img').length
  } catch {
    return (html.match(/<img\b/gi) || []).length
  }
}

/**
 * Estimate page count.
 *   • docx-preview: it emits <section class="docx"> per page → count them
 *   • Otherwise: estimate from character count using ~2400 chars/page
 *     (roughly 12pt Calibri, single-spaced, standard Letter margins)
 */
export function pageCount(html) {
  if (!html) return 0
  try {
    const p = new DOMParser().parseFromString(html, 'text/html')
    const explicit = p.querySelectorAll('section.docx').length
    if (explicit > 0) return explicit
  } catch { /* fall through */ }
  const text = htmlToText(html)
  return Math.max(1, Math.ceil(text.length / 2400))
}

/**
 * Rough sentence-complexity signal: % of sentences longer than 25 words
 * OR containing 3+ commas. Not a linguistic model — just enough to
 * highlight when a version reads heavier than the baseline.
 */
export function complexSentences(text) {
  if (!text) return { count: 0, percent: 0 }
  const sentences = text.split(/[.!?]+\s/).filter(s => s.trim().length > 0)
  if (sentences.length === 0) return { count: 0, percent: 0 }
  const complex = sentences.filter(s => {
    const words = s.trim().split(/\s+/).filter(Boolean).length
    const commas = (s.match(/,/g) || []).length
    return words > 25 || commas >= 3
  }).length
  return {
    count: complex,
    percent: Math.round((complex / sentences.length) * 100),
  }
}

/**
 * Spelling-flag heuristic. NOT a real spell-checker (no shipped dictionary).
 * Flags obviously suspicious tokens:
 *   • letter+digit mixes ("th3", "1st" is OK, "hello5world" not)
 *   • 3+ same letters in a row ("shoooot")
 *   • ≥4 consonants in a row ("shrpk", "mbtdz")
 *   • no vowels and >3 chars ("bcdfg")
 * Returns a rough count. Better than "0" but not authoritative.
 */
export function spellingFlags(text) {
  if (!text) return 0
  const words = text.split(/[\s.,;:!?()"[\]{}<>\/\\-]+/).filter(Boolean)
  let flags = 0
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!w || w.length < 3) continue

    // Rules that shouldn't count as misspellings
    if (/^\d+(st|nd|rd|th)$/.test(w)) continue           // 1st, 22nd
    if (/^[a-z]$/.test(w))            continue

    // Suspicious patterns
    if (/[a-z]\d[a-z]|[a-z]\d\d[a-z]/.test(w)) { flags++; continue }   // th3re, h3llo
    if (/([a-z])\1{2,}/.test(w))               { flags++; continue }   // shoooot
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(w)) { flags++; continue }   // absurd cluster
    if (w.length > 3 && !/[aeiouy]/.test(w))   { flags++; continue }   // no vowels
    if (w.length > 20)                         { flags++; continue }   // improbably long
  }
  return flags
}

/**
 * AI vs Human authorship split for a given HTML.
 * Uses `.ts-inserted` char count as "human-written" and the rest as
 * "AI-authored". If there are no track-change spans (as on AI Base
 * or Approved Final), split is 100/0.
 */
export function authorshipSplit(html) {
  if (!html) return { aiChars: 0, humanChars: 0, aiPct: 0, humanPct: 0 }
  try {
    const p = new DOMParser().parseFromString(html, 'text/html')
    const inserted = p.querySelectorAll('.ts-inserted')
    const humanChars = Array.from(inserted).reduce((sum, el) => sum + (el.textContent?.length || 0), 0)
    const totalChars = htmlToText(html).length
    const aiChars = Math.max(0, totalChars - humanChars)
    const total = aiChars + humanChars
    return {
      aiChars,
      humanChars,
      aiPct:    total === 0 ? 0 : Math.round((aiChars    / total) * 100),
      humanPct: total === 0 ? 0 : Math.round((humanChars / total) * 100),
    }
  } catch {
    return { aiChars: 0, humanChars: 0, aiPct: 0, humanPct: 0 }
  }
}

/**
 * Full metric bundle for one version's HTML.
 */
export function computeMetrics(html) {
  const text = htmlToText(html)
  const complex = complexSentences(text)
  const author  = authorshipSplit(html)
  return {
    words:     wordCount(text),
    chars:     charCount(text),
    sentences: sentenceCount(text),
    grade:     fleschGrade(text),
    passive:   passivePercent(text),
    sections:  sectionCount(html),
    images:    imageCount(html),
    pages:     pageCount(html),
    complexPct: complex.percent,
    complexCount: complex.count,
    spelling:  spellingFlags(text),
    aiPct:     author.aiPct,
    humanPct:  author.humanPct,
  }
}

/**
 * Delta helper: format the difference of a metric relative to base.
 * `kind` controls formatting: "pct", "pp", "grade", "count", "text".
 */
export function formatDelta(base, target, kind = 'count') {
  if (base == null || target == null) return { text: '—', tone: 'neutral' }
  if (base === target) return { text: '=', tone: 'neutral' }
  const diff = target - base

  if (kind === 'pct') {
    const pct = base === 0 ? 0 : Math.round((diff / base) * 1000) / 10
    return {
      text: `${diff > 0 ? '+' : ''}${pct}%`,
      tone: diff < 0 ? 'better' : 'worse',   // shorter = better
    }
  }
  if (kind === 'pp') {
    return {
      text: `${diff > 0 ? '+' : ''}${diff}pp`,
      tone: diff < 0 ? 'better' : 'worse',
    }
  }
  if (kind === 'grade') {
    return {
      text: `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff).toFixed(1)}`,
      tone: diff < 0 ? 'better' : 'worse',
    }
  }
  // count
  return {
    text: `${diff > 0 ? '+' : ''}${diff}`,
    tone: 'neutral',
  }
}
