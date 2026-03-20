import { useState, useEffect, useRef, useCallback } from 'react'
import { getSessionId } from '../utils/session'
import { API_BASE_URL } from '../utils/api'

function countAgentLogEntries(agentLogs) {
  if (!agentLogs || typeof agentLogs !== 'object') return 0
  return Object.values(agentLogs).reduce(
    (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
    0,
  )
}

/** Merge richer agent_logs from a late / stale response without regressing mission_day or dropping sim fields. */
function applyStateResponse(prev, data, seqStale) {
  if (!data || typeof data !== 'object') return prev
  if (!prev) return data

  const pDay = Number(prev.mission_day)
  const nDay = Number(data.mission_day)
  const pDayOk = Number.isFinite(pDay)
  const nDayOk = Number.isFinite(nDay)

  if (nDayOk && pDayOk && nDay < pDay) return prev
  if (nDayOk && pDayOk && nDay > pDay) return data

  if (seqStale) {
    const pc = countAgentLogEntries(prev.agent_logs)
    const nc = countAgentLogEntries(data.agent_logs)
    if (nc > pc) {
      return {
        ...prev,
        agent_logs: data.agent_logs,
        agent_logs_parsed: data.agent_logs_parsed,
      }
    }
    return prev
  }

  return data
}

export default function useGreenhouseState(setupComplete, pollMs = 1000) {
  const [state, setState] = useState(null)
  const intervalRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  /** When many /state requests overlap, only the latest-started "wins" for full snapshots; older bodies may still carry new agent_logs. */
  const fetchSeqRef = useRef(0)

  /**
   * Apply a full snapshot from POST /simulate-tick (same shape as GET /state).
   * Bumps fetch sequence so slower in-flight GETs cannot overwrite with older mission_day.
   */
  const applyAuthoritativeSnapshot = useCallback((data) => {
    if (!data || typeof data !== 'object') return
    fetchSeqRef.current += 1
    setState(data)
  }, [])

  const fetchState = useCallback(() => {
    const doFetch = () => {
      const seq = ++fetchSeqRef.current
      const sessionId = getSessionId()
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

  return [state, fetchState, applyAuthoritativeSnapshot]
}
