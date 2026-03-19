import { useState, useEffect, useRef } from 'react'
import { getSessionId } from '../utils/session'
import { API_BASE_URL } from '../utils/api'

export default function useGreenhouseState(setupComplete) {
  const [state, setState] = useState(null)
  const intervalRef = useRef(null)
  const retryTimeoutRef = useRef(null)

  useEffect(() => {
    if (!setupComplete) {
      setState(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      return
    }

    const sessionId = getSessionId()
    const fetchState = () => {
      fetch(`${API_BASE_URL}/state`, {
        headers: { 'x-session-id': sessionId },
      })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(setState)
        .catch(() => {
          // Quick retry to avoid long "0 values" startup windows on cold API starts.
          if (!retryTimeoutRef.current) {
            retryTimeoutRef.current = setTimeout(() => {
              retryTimeoutRef.current = null
              fetchState()
            }, 1200)
          }
        })
    }

    fetchState()
    intervalRef.current = setInterval(fetchState, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [setupComplete])

  return state
}
