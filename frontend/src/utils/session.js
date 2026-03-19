const SESSION_STORAGE_KEY = 'mars-food-session-id'

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSessionId() {
  if (typeof window === 'undefined') return 'server'
  let value = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!value) {
    value = createSessionId()
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, value)
  }
  return value
}
