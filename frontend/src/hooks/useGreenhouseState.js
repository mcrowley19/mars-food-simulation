import { useState, useEffect, useRef, useCallback } from 'react'
import { getSessionId } from '../utils/session'
import { API_BASE_URL } from '../utils/api'

export default function useGreenhouseState(setupComplete, pollMs = 1000) {
  const [state, setState] = useState(null)
  const intervalRef = useRef(null)
  const retryTimeoutRef = useRef(null)

  const fetchState = useCallback(() => {
    const doFetch = () => {
      const sessionId = getSessionId()
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
              doFetch()
            }, 1200)
          }
        })
    }
    doFetch()
  }, [])

  useEffect(() => {
    if (!setupComplete) {
      // Clearing client state when setup is torn down; intentional sync reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset session snapshot when leaving greenhouse flow
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

    fetchState()
    const safePollMs = Math.max(250, Number(pollMs) || 1000)
    intervalRef.current = setInterval(fetchState, safePollMs)

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
  }, [setupComplete, pollMs, fetchState])

  return [state, fetchState]
}
