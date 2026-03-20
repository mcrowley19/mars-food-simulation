const SESSION_STORAGE_KEY = 'mars-food-session-id'

/** When sessionStorage is blocked (strict private mode / some Firefox-based browsers), keep id in memory for the tab. */
let memoryFallbackSessionId = null

function createSessionId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* non-secure contexts or locked crypto */
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSessionId() {
  if (typeof window === 'undefined') return 'server'
  try {
    let value = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!value) {
      value = createSessionId()
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, value)
    }
    return value
  } catch {
    if (!memoryFallbackSessionId) memoryFallbackSessionId = createSessionId()
    return memoryFallbackSessionId
  }
}

export function clearSessionId() {
  memoryFallbackSessionId = null
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
