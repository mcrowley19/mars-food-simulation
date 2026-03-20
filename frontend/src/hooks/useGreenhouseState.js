import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getSessionId } from '../utils/session'
import { API_BASE_URL } from '../utils/api'
import { applyStateResponse, mergeTickSnapshot } from '../utils/greenhouseStateMerge'

export default function useGreenhouseState(setupComplete, pollMs = 1000) {
  const [state, setState] = useState(null)
  const intervalRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  /** When many /state requests overlap, only the latest-started "wins" for full snapshots; older bodies may still carry new agent_logs. */
  const fetchSeqRef = useRef(0)
  /** Coalesce overlapping refreshSimState calls (e.g. post-tick burst + poll) into one in-flight request + at most one follow-up. */
  const stateFetchInFlightRef = useRef(false)
  const stateFetchQueuedRef = useRef(false)
  const fetchStateRef = useRef(() => {})

  /**
   * Apply a full snapshot from POST /simulate-tick (same shape as GET /state).
   * Bumps fetch sequence so slower in-flight GETs cannot overwrite with older mission_day.
   */
  const applyAuthoritativeSnapshot = useCallback((data) => {
    if (!data || typeof data !== 'object') return
    fetchSeqRef.current += 1
    setState((prev) => mergeTickSnapshot(prev, data))
  }, [])

  const fetchState = useCallback(() => {
    if (stateFetchInFlightRef.current) {
      stateFetchQueuedRef.current = true
      return
    }

    const seq = ++fetchSeqRef.current
    const sessionId = getSessionId()
    stateFetchInFlightRef.current = true

    const releaseAndDrain = () => {
      stateFetchInFlightRef.current = false
      if (stateFetchQueuedRef.current) {
        stateFetchQueuedRef.current = false
        fetchStateRef.current()
      }
    }

    fetch(`${API_BASE_URL}/state`, {
      headers: { 'x-session-id': sessionId },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        const stale = seq !== fetchSeqRef.current
        setState(prev => applyStateResponse(prev, data, stale))
      })
      .catch(() => {
        // Quick retry to avoid long "0 values" startup windows on cold API starts.
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null
            fetchStateRef.current()
          }, 1200)
        }
      })
      .finally(releaseAndDrain)
  }, [])

  useLayoutEffect(() => {
    fetchStateRef.current = fetchState
  }, [fetchState])

  useEffect(() => {
    if (!setupComplete) {
      // Clearing client state when setup is torn down; intentional sync reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset session snapshot when leaving greenhouse flow
      setState(null)
      stateFetchInFlightRef.current = false
      stateFetchQueuedRef.current = false
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
    const safePollMs = Math.max(800, Number(pollMs) || 1000)
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

  return [state, fetchState, applyAuthoritativeSnapshot]
}
