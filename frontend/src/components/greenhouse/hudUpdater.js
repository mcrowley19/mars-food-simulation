import { compassDir } from './constants'

const KCAL_PER_KG = {
  potato: 770,
  wheat: 3390,
  lettuce: 150,
  tomato: 180,
  soybean: 1470,
  radish: 160,
  pea: 810,
  kale: 490,
  carrot: 410,
}

// Approximate vitamin content per kg edible yield.
const VITAMIN_PER_KG = {
  potato: { A: 20, C: 200, D: 0, E: 1, K: 20, B9: 150, B12: 0 },
  wheat: { A: 0, C: 0, D: 0, E: 13, K: 20, B9: 380, B12: 0 },
  lettuce: { A: 7400, C: 90, D: 0, E: 2, K: 1200, B9: 380, B12: 0 },
  tomato: { A: 420, C: 140, D: 0, E: 5, K: 80, B9: 150, B12: 0 },
  soybean: { A: 20, C: 60, D: 0, E: 9, K: 470, B9: 375, B12: 0 },
  radish: { A: 70, C: 150, D: 0, E: 1, K: 15, B9: 25, B12: 0 },
  pea: { A: 380, C: 400, D: 0, E: 1, K: 250, B9: 65, B12: 0 },
  kale: { A: 10000, C: 1200, D: 0, E: 15, K: 3900, B9: 140, B12: 0 },
  carrot: { A: 8300, C: 60, D: 0, E: 6, K: 130, B9: 190, B12: 0 },
}

const DAILY_VITAMIN_TARGETS = {
  A: 900, // ug RAE
  C: 90, // mg
  D: 20, // ug
  E: 15, // mg
  K: 120, // ug
  B9: 400, // ug
  B12: 2.4, // ug
}

// Nutrition quality of prepackaged rations by vitamin (0..1 of target at full calorie intake).
const RATION_VITAMIN_QUALITY = {
  A: 0.82,
  C: 0.74,
  D: 0.48,
  E: 0.71,
  K: 0.63,
  B9: 0.77,
  B12: 0.88,
}

// Approximate vitamin degradation in stored rations per 100 mission sols.
const RATION_VITAMIN_DEGRADATION_PER_100_SOLS = {
  A: 0.08,
  C: 0.18,
  D: 0.05,
  E: 0.06,
  K: 0.1,
  B9: 0.12,
  B12: 0.04,
}

function baselineVitaminCoverageFromConsumption(ss) {
  const consumed = Math.max(
    0,
    Number(ss?.calories_consumed_today ?? ss?.calories_needed_per_day ?? 0),
  )
  const needed = Math.max(1, Number(ss?.calories_needed_per_day) || 1)
  const missionDay = Math.max(1, Number(ss?.mission_day) || 1)
  const intakeRatio = Math.max(0, Math.min(1.2, consumed / needed))
  // Stored rations are calorie-complete but not vitamin-perfect across all micronutrients.
  return Object.fromEntries(
    Object.keys(DAILY_VITAMIN_TARGETS).map((k) => {
      const baseQuality = Number(RATION_VITAMIN_QUALITY[k] ?? 0.7)
      const degradationPer100 = Number(RATION_VITAMIN_DEGRADATION_PER_100_SOLS[k] ?? 0.08)
      const retention = Math.max(0.35, 1 - (missionDay / 100) * degradationPer100)
      const quality = baseQuality * retention
      const pct = intakeRatio * quality * 100
      return [k, Math.round(Math.max(0, Math.min(160, pct)) * 10) / 10]
    }),
  )
}

function computeVitaminLevels(ss) {
  const baselineCoverage = baselineVitaminCoverageFromConsumption(ss)
  const harvested = Array.isArray(ss?.harvested) ? ss.harvested : []
  const caloriesConsumed = Math.max(
    0,
    Number(ss?.calories_consumed_today ?? ss?.calories_needed_per_day ?? 0),
  )
  if (harvested.length === 0 || caloriesConsumed <= 0) {
    return baselineCoverage
  }

  const inventoryKcalByCrop = {}
  harvested.forEach((entry) => {
    const crop = String(entry?.name || '').toLowerCase()
    const kg = Math.max(0, Number(entry?.yield_kg) || 0)
    const kcalPerKg = KCAL_PER_KG[crop] || 0
    if (!crop || kcalPerKg <= 0 || kg <= 0) return
    inventoryKcalByCrop[crop] = (inventoryKcalByCrop[crop] || 0) + kg * kcalPerKg
  })

  const totalInventoryKcal = Object.values(inventoryKcalByCrop).reduce((a, b) => a + b, 0)
  if (totalInventoryKcal <= 0) {
    return baselineCoverage
  }

  const crewCount = Math.max(1, Number(ss?.astronaut_count) || 4)
  const vitaminIntake = Object.fromEntries(Object.keys(DAILY_VITAMIN_TARGETS).map((k) => [k, 0]))

  Object.entries(inventoryKcalByCrop).forEach(([crop, cropKcal]) => {
    const share = cropKcal / totalInventoryKcal
    const consumedKcal = caloriesConsumed * share
    const kcalPerKg = KCAL_PER_KG[crop] || 1
    const consumedKg = consumedKcal / kcalPerKg
    const profile = VITAMIN_PER_KG[crop] || {}
    Object.keys(vitaminIntake).forEach((vitKey) => {
      vitaminIntake[vitKey] += consumedKg * (profile[vitKey] || 0)
    })
  })

  const harvestCoverage = {}
  Object.entries(DAILY_VITAMIN_TARGETS).forEach(([vitKey, targetPerPerson]) => {
    const target = targetPerPerson * crewCount
    const pct = target > 0 ? (vitaminIntake[vitKey] / target) * 100 : 0
    harvestCoverage[vitKey] = Math.round(Math.max(0, Math.min(200, pct)) * 10) / 10
  })

  // Blend harvest-derived vitamins with ration profile.
  // Harvest influence scales with how much edible crop inventory exists relative to daily consumption.
  const harvestCoverageDays = totalInventoryKcal / Math.max(1, caloriesConsumed)
  const harvestWeight = Math.max(0.15, Math.min(0.9, harvestCoverageDays / 6))
  const baselineWeight = 1 - harvestWeight
  const blendedCoverage = {}
  Object.keys(DAILY_VITAMIN_TARGETS).forEach((vitKey) => {
    const blended =
      (harvestCoverage[vitKey] || 0) * harvestWeight +
      (baselineCoverage[vitKey] || 0) * baselineWeight
    blendedCoverage[vitKey] = Math.round(Math.max(0, Math.min(200, blended)) * 10) / 10
  })
  return blendedCoverage
}

export function computeHud(sunPhase, fps, anim, camera, ss, events) {
  const cropsArr = ss?.crops || []
  const breakdown = {}
  cropsArr.forEach(c => { breakdown[c.name] = (breakdown[c.name] || 0) + 1 })
  const vitaminLevels = computeVitaminLevels(ss)
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
    caloriesConsumedToday: ss?.calories_consumed_today ?? 0,
    seedReserve: ss?.seed_reserve ?? {},
    vitaminLevels,
    fuelKg: ss?.resources?.fuel_kg ?? 0,
    energyKwhToday: ss?.energy_kwh_today ?? 0,
    fuelUsedToday: ss?.fuel_used_today ?? 0,
  }
}
