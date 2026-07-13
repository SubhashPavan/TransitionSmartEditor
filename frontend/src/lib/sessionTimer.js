/**
 * Session timer — captures reviewer time on a per-document basis.
 *
 * Model:
 *   Session = the whole engagement with one document across multiple visits
 *   Lap     = one continuous period of active work inside a session.
 *             A new lap starts when the user returns after being idle
 *             (no keyboard/mouse for IDLE_THRESHOLD_MS) or when they
 *             re-open the editor after leaving.
 *
 * Persistence:
 *   • Always writes to localStorage keyed by docName so the session
 *     survives page reloads and users returning tomorrow.
 *   • Also calls syncToRemote(session) — a placeholder that logs today.
 *     Plug your real API in there (see PLACEHOLDER_REMOTE_SYNC below).
 *
 * Activity signal:
 *   Any of: mousemove, keydown, click, touchstart, wheel, focus, or
 *   an explicit onEdit call. Selection changes and hover-only interactions
 *   are ignored so we don't count a stationary user as "active".
 */

const IDLE_THRESHOLD_MS = 2 * 60 * 1000       // 2 min without input → lap closes
const HEARTBEAT_MS      = 5 * 1000            // check idle + persist every 5s
const STORAGE_PREFIX    = 'ts-session:'

// ────────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────────

function storageKey(docKey) { return `${STORAGE_PREFIX}${docKey || 'untitled'}` }

function loadSession(docKey) {
  try {
    const raw = localStorage.getItem(storageKey(docKey))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveLocal(session) {
  try {
    localStorage.setItem(storageKey(session.docKey), JSON.stringify(session))
  } catch { /* quota, private mode — swallow */ }
}

/**
 * ═══ PLACEHOLDER_REMOTE_SYNC ═══
 * Replace this with your real backend call — e.g.:
 *   await fetch(`${API_BASE}/sessions/${session.sessionId}`, {
 *     method: 'PUT',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(session),
 *   })
 * Called on every heartbeat + on beforeunload. Idempotent by sessionId.
 * Keep it non-blocking — never throw upstream.
 */
async function syncToRemote(session) {
  // No-op stub. Uncomment to see calls in the console while wiring up the API.
  // console.debug('[sessionTimer] would sync', {
  //   sessionId: session.sessionId,
  //   docKey: session.docKey,
  //   totalMs: totalActiveMs(session),
  //   laps: session.laps.length,
  // })
}

// ────────────────────────────────────────────────────────────
// Session shape helpers
// ────────────────────────────────────────────────────────────

function newSession(docKey, docName) {
  return {
    sessionId: `s-${Date.now()}-${Math.floor((Date.now() % 1) * 1e6)}`,
    docKey,
    docName,
    createdAt: Date.now(),
    laps: [],
  }
}

/** Sum of finalised lap active-ms + current lap running-ms if any. */
export function totalActiveMs(session, now = Date.now()) {
  if (!session) return 0
  let total = 0
  for (const lap of session.laps) {
    if (lap.end != null) total += lap.activeMs
    else                 total += Math.max(0, (lap.lastActiveAt || now) - lap.start)
  }
  return total
}

// ────────────────────────────────────────────────────────────
// Public API — used by the useSessionTimer React hook
// ────────────────────────────────────────────────────────────

/**
 * Start (or resume) tracking for a document. Returns a controller with
 * `stop()` and `snapshot()`. The onTick callback fires every heartbeat
 * so React state can re-render the counter.
 */
export function startTracking({ docKey, docName, onTick }) {
  let session = loadSession(docKey) || newSession(docKey, docName)
  // Keep docName up to date in case the user re-uploads with a different name.
  session.docName = docName || session.docName

  // Clean up any zero/near-zero laps left by earlier bugs (mount+unmount races,
  // StrictMode double-invocation, HMR reloads). These don't represent real work.
  session.laps = (session.laps || []).filter(l => l.end == null || l.activeMs >= 1000)

  // Don't open a lap on start — wait for the FIRST real activity signal.
  // Opening one immediately produced phantom 0-second laps every time the
  // Editor re-mounted (React strict mode dev, HMR, navigation).
  let currentLap = null
  saveLocal(session)

  const onActivity = () => {
    const now = Date.now()
    if (!currentLap) {
      currentLap = openLap(session, now)
    }
    currentLap.lastActiveAt = now
  }

  const events = ['mousedown', 'keydown', 'click', 'touchstart', 'wheel', 'focus']
  events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true, capture: true }))

  const beat = setInterval(() => {
    const now = Date.now()
    if (currentLap && now - (currentLap.lastActiveAt || currentLap.start) >= IDLE_THRESHOLD_MS) {
      closeLap(currentLap)
      currentLap = null
    }
    saveLocal(session)
    syncToRemote(session)
    onTick?.(session, currentLap)
  }, HEARTBEAT_MS)

  const onUnload = () => {
    if (currentLap) closeLap(currentLap)
    saveLocal(session)
    // Best-effort synchronous ping for the API someday:
    // navigator.sendBeacon('/api/sessions', new Blob([JSON.stringify(session)], {type:'application/json'}))
  }
  window.addEventListener('beforeunload', onUnload)

  // Kick one tick immediately so the counter is live
  onTick?.(session, currentLap)

  return {
    snapshot: () => structuredCopy(session),
    /** Explicit edit → also counts as activity (in case the user is typing
        with no mouse movement and the mousedown never fires again). */
    markEdit: () => onActivity(),
    stop: () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity, { capture: true }))
      window.removeEventListener('beforeunload', onUnload)
      clearInterval(beat)
      if (currentLap) closeLap(currentLap)
      // Belt & suspenders: drop any 0-duration laps before persisting so
      // they don't accumulate across sessions.
      session.laps = session.laps.filter(l => l.end == null || l.activeMs >= 1000)
      saveLocal(session)
      syncToRemote(session)
    },
  }
}

// ────────────────────────────────────────────────────────────
// Lap helpers (internal)
// ────────────────────────────────────────────────────────────

function openLap(session, startAt = Date.now()) {
  const lap = { start: startAt, lastActiveAt: startAt, end: null, activeMs: 0 }
  session.laps.push(lap)
  return lap
}

function closeLap(lap) {
  const end = lap.lastActiveAt || Date.now()
  lap.end = end
  // Floor at 1s — a single activity ping (say the user clicked once then
  // walked away) still represents "the user was here", not a phantom.
  lap.activeMs = Math.max(1000, end - lap.start)
}

/** Shallow clone the session so callers don't mutate our internal state. */
function structuredCopy(session) {
  if (typeof structuredClone === 'function') return structuredClone(session)
  return JSON.parse(JSON.stringify(session))
}

// ────────────────────────────────────────────────────────────
// Formatters (used by TitleBar / Telemetry)
// ────────────────────────────────────────────────────────────

export function formatMs(ms) {
  if (ms == null || isNaN(ms)) return '0m'
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatMsShort(ms) {
  if (ms == null || isNaN(ms)) return '0m'
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
