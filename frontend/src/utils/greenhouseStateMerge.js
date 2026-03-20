/**
 * Pure merge helpers for GET /state and POST /simulate-tick snapshots.
 * Kept separate from the hook so behavior can be unit-tested.
 */

export function countAgentLogEntries(agentLogs) {
  if (!agentLogs || typeof agentLogs !== 'object') return 0
  return Object.values(agentLogs).reduce(
    (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
    0,
  )
}

/**
 * Backend sometimes omits an agent from agent_logs_parsed (e.g. all lines hidden). Fresh GET /state
 * would then drop tabs. Spread order: `next` wins on key collision, `base` keeps agents only in base.
 */
export function unionAgentKeyed(base, next) {
  const b = base && typeof base === 'object' ? base : {}
  const n = next && typeof next === 'object' ? next : {}
  return { ...b, ...n }
}

/**
 * Merge richer agent_logs from a late / stale response without regressing mission_day or dropping sim fields.
 */
export function applyStateResponse(prev, data, seqStale) {
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
        agent_logs: unionAgentKeyed(prev.agent_logs, data.agent_logs),
        agent_logs_parsed: unionAgentKeyed(prev.agent_logs_parsed, data.agent_logs_parsed),
      }
    }
    return {
      ...prev,
      agent_logs: unionAgentKeyed(data.agent_logs, prev.agent_logs),
      agent_logs_parsed: unionAgentKeyed(data.agent_logs_parsed, prev.agent_logs_parsed),
    }
  }

  if (nDayOk && pDayOk && nDay === pDay) {
    return {
      ...data,
      agent_logs: unionAgentKeyed(prev.agent_logs, data.agent_logs),
      agent_logs_parsed: unionAgentKeyed(prev.agent_logs_parsed, data.agent_logs_parsed),
    }
  }

  return data
}

/**
 * Same-sol POST /simulate-tick body: keep agent tabs if tick payload omits an agent (parsed hidden).
 */
export function mergeTickSnapshot(prev, data) {
  if (!data || typeof data !== 'object') return prev
  if (!prev) return data
  const pDay = Number(prev.mission_day)
  const nDay = Number(data.mission_day)
  if (Number.isFinite(pDay) && Number.isFinite(nDay) && nDay === pDay) {
    return {
      ...data,
      agent_logs: unionAgentKeyed(prev.agent_logs, data.agent_logs),
      agent_logs_parsed: unionAgentKeyed(prev.agent_logs_parsed, data.agent_logs_parsed),
    }
  }
  return data
}
