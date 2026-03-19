import { compassDir } from './constants'

export function computeHud(sunPhase, fps, anim, camera, ss, events) {
  const cropsArr = ss?.crops || []
  const breakdown = {}
  cropsArr.forEach(c => { breakdown[c.name] = (breakdown[c.name] || 0) + 1 })
  return {
    angle: (sunPhase * 360).toFixed(1),
    dir: compassDir(sunPhase * 360),
    fps,
    dome: anim.dome ? anim.dome.userData.domeId : '—',
    zoom: camera.zoom.toFixed(2),
    missionDay: ss?.mission_day || 0,
    waterL: ss?.resources?.water_l ?? 0,
    nutrientsKg: ss?.resources?.nutrients_kg ?? 0,
    cropsGrowing: cropsArr.filter(c => c.status === 'growing').length,
    cropsReady: cropsArr.filter(c => c.status === 'ready_to_harvest').length,
    activeEvents: events,
    tempC: ss?.environment?.temp_c ?? 22,
    co2Ppm: ss?.environment?.co2_ppm ?? 800,
    humidityPct: ss?.environment?.humidity_pct ?? 65,
    lightHours: ss?.environment?.light_hours ?? 12,
    harvestedCount: Array.isArray(ss?.harvested) ? ss.harvested.length : 0,
    agentStatus: ss?.agent_last_actions?.orchestrator || '',
    cropBreakdown: breakdown,
    caloriesAvailable: ss?.calories_available ?? 0,
    caloriesNeededPerDay: ss?.calories_needed_per_day ?? 0,
    seedReserve: ss?.seed_reserve ?? {},
    fuelKg: ss?.resources?.fuel_kg ?? 0,
    energyKwhToday: ss?.energy_kwh_today ?? 0,
    fuelUsedToday: ss?.fuel_used_today ?? 0,
  }
}
