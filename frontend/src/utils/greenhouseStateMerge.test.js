import { describe, it, expect } from 'vitest'
import {
  applyStateResponse,
  countAgentLogEntries,
  mergeTickSnapshot,
  unionAgentKeyed,
} from './greenhouseStateMerge.js'

describe('unionAgentKeyed', () => {
  it('merges disjoint keys', () => {
    expect(unionAgentKeyed({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('next wins on collision', () => {
    expect(unionAgentKeyed({ x: [1] }, { x: [2, 3] })).toEqual({ x: [2, 3] })
  })

  it('treats null/undefined as empty', () => {
    expect(unionAgentKeyed(null, { a: 1 })).toEqual({ a: 1 })
    expect(unionAgentKeyed({ a: 1 }, undefined)).toEqual({ a: 1 })
  })
})

describe('countAgentLogEntries', () => {
  it('sums array lengths', () => {
    expect(
      countAgentLogEntries({ a: [1, 2], b: [3] }),
    ).toBe(3)
  })

  it('ignores non-arrays', () => {
    expect(countAgentLogEntries({ a: 'x' })).toBe(0)
  })
})

describe('applyStateResponse', () => {
  const basePrev = {
    mission_day: 5,
    resources: { water_l: 100 },
    agent_logs: { orchestrator: [{ day: 5, task: 't', response: 'r' }] },
    agent_logs_parsed: {
      orchestrator: [{ day: 5, response_lines: ['old'] }],
      crop_planner: [{ day: 5, response_lines: ['plan'] }],
    },
  }

  it('returns prev when data is null', () => {
    expect(applyStateResponse(basePrev, null, false)).toBe(basePrev)
  })

  it('returns data when prev is null', () => {
    const d = { mission_day: 1 }
    expect(applyStateResponse(null, d, false)).toBe(d)
  })

  it('rejects older mission_day', () => {
    const data = { mission_day: 4, resources: { water_l: 999 } }
    expect(applyStateResponse(basePrev, data, false)).toBe(basePrev)
  })

  it('advances sol with full data replace (no log union)', () => {
    const data = {
      mission_day: 6,
      resources: { water_l: 50 },
      agent_logs: { orchestrator: [] },
      agent_logs_parsed: {},
    }
    const out = applyStateResponse(basePrev, data, false)
    expect(out).toBe(data)
    expect(out.mission_day).toBe(6)
    expect(out.resources.water_l).toBe(50)
  })

  it('same sol fresh: keeps agent tab missing from payload', () => {
    const data = {
      mission_day: 5,
      resources: { water_l: 42 },
      agent_logs: { orchestrator: [{ day: 5, task: 'n', response: 'new' }] },
      agent_logs_parsed: {
        orchestrator: [{ day: 5, response_lines: ['fresh'] }],
      },
    }
    const out = applyStateResponse(basePrev, data, false)
    expect(out.resources.water_l).toBe(42)
    expect(out.agent_logs_parsed.crop_planner).toEqual([
      { day: 5, response_lines: ['plan'] },
    ])
    expect(out.agent_logs_parsed.orchestrator[0].response_lines).toEqual(['fresh'])
  })

  it('same sol fresh: server wins on shared agent', () => {
    const data = {
      mission_day: 5,
      resources: { water_l: 1 },
      agent_logs: { orchestrator: [{ r: 2 }] },
      agent_logs_parsed: {
        orchestrator: [{ response_lines: ['server wins'] }],
      },
    }
    const out = applyStateResponse(basePrev, data, false)
    expect(out.agent_logs.orchestrator).toEqual([{ r: 2 }])
    expect(out.agent_logs_parsed.orchestrator).toEqual([
      { response_lines: ['server wins'] },
    ])
  })

  it('stale with more entries: merges so data wins per agent, prev fills missing agents', () => {
    const prev = {
      mission_day: 5,
      resources: { water_l: 100 },
      agent_logs: { a: [1], b: [1] },
      agent_logs_parsed: { a: [{ x: 1 }], b: [{ x: 1 }] },
    }
    const data = {
      mission_day: 5,
      resources: { water_l: 0 },
      agent_logs: { a: [1, 2, 3] },
      agent_logs_parsed: { a: [{ x: 9 }] },
    }
    const out = applyStateResponse(prev, data, true)
    expect(out.resources.water_l).toBe(100)
    expect(out.agent_logs).toEqual({ a: [1, 2, 3], b: [1] })
    expect(out.agent_logs_parsed).toEqual({ a: [{ x: 9 }], b: [{ x: 1 }] })
  })

  it('stale with fewer entries: prev wins conflicts, data only adds new keys', () => {
    const prev = {
      mission_day: 5,
      resources: { water_l: 100 },
      agent_logs: { a: [9, 9], b: [1] },
      agent_logs_parsed: { a: [{ keep: true }], b: [{ keep: true }] },
    }
    const data = {
      mission_day: 5,
      resources: { water_l: 0 },
      agent_logs: { a: [1], c: [2] },
      agent_logs_parsed: { a: [{ stale: true }], c: [{ new: true }] },
    }
    const out = applyStateResponse(prev, data, true)
    expect(out.resources.water_l).toBe(100)
    expect(out.agent_logs.a).toEqual([9, 9])
    expect(out.agent_logs.c).toEqual([2])
    expect(out.agent_logs_parsed.a).toEqual([{ keep: true }])
    expect(out.agent_logs_parsed.c).toEqual([{ new: true }])
  })

  it('coerces string mission_day', () => {
    const prev = { mission_day: '5', agent_logs: {}, agent_logs_parsed: {} }
    const data = { mission_day: 5, resources: { x: 1 }, agent_logs: {}, agent_logs_parsed: {} }
    const out = applyStateResponse(prev, data, false)
    expect(out.resources.x).toBe(1)
  })

  it('falls through to data when days not comparable', () => {
    const prev = { mission_day: NaN, agent_logs: { x: [1] }, agent_logs_parsed: {} }
    const data = { mission_day: 5, agent_logs: {}, agent_logs_parsed: {} }
    const out = applyStateResponse(prev, data, false)
    expect(out).toBe(data)
  })
})

describe('mergeTickSnapshot', () => {
  it('returns data when prev is null', () => {
    const d = { mission_day: 3 }
    expect(mergeTickSnapshot(null, d)).toBe(d)
  })

  it('returns prev when data is invalid', () => {
    const p = { mission_day: 1 }
    expect(mergeTickSnapshot(p, null)).toBe(p)
  })

  it('new sol: full tick payload', () => {
    const prev = {
      mission_day: 4,
      agent_logs: { a: [1] },
      agent_logs_parsed: { a: [{}] },
    }
    const data = { mission_day: 5, agent_logs: {}, agent_logs_parsed: {} }
    expect(mergeTickSnapshot(prev, data)).toBe(data)
  })

  it('same sol: unions agent keys like GET /state', () => {
    const prev = {
      mission_day: 5,
      calories_available: 100,
      agent_logs: {},
      agent_logs_parsed: { specialist: [{ response_lines: ['keep me'] }] },
    }
    const data = {
      mission_day: 5,
      calories_available: 200,
      agent_logs: { orchestrator: [{ r: 1 }] },
      agent_logs_parsed: {
        orchestrator: [{ response_lines: ['tick'] }],
      },
    }
    const out = mergeTickSnapshot(prev, data)
    expect(out.calories_available).toBe(200)
    expect(out.agent_logs_parsed.specialist[0].response_lines).toEqual(['keep me'])
    expect(out.agent_logs_parsed.orchestrator[0].response_lines).toEqual(['tick'])
  })
})

describe('documented tradeoff: server cannot clear logs same-sol via empty object', () => {
  it('empty agent_logs from server still preserves prev agents (tab preservation)', () => {
    const prev = {
      mission_day: 2,
      agent_logs: { x: [1] },
      agent_logs_parsed: { x: [{ response_lines: ['a'] }] },
    }
    const data = {
      mission_day: 2,
      agent_logs: {},
      agent_logs_parsed: {},
    }
    const out = applyStateResponse(prev, data, false)
    expect(out.agent_logs_parsed.x).toBeDefined()
  })
})
