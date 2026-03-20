/**
 * Manual-setup defaults for 4 astronauts.
 * Mission length is 450 sols; water / food / fuel / fertilizer defaults are sized for 450 + 50 sol buffer.
 */

/** Shown in UI and sent as `mission_days` — actual simulated mission length. */
export const DEFAULT_MISSION_DAYS = 450

/** Extra sols folded into default supply masses only (not mission duration). */
const DEFAULT_SUPPLY_BUFFER_SOLS = 50

const SUPPLY_PLANNING_DAYS = DEFAULT_MISSION_DAYS + DEFAULT_SUPPLY_BUFFER_SOLS

/** KB / simulator can sample crew kcal up to ~3800; use worst case for packed reserves. */
const CREW_KCAL_WORST_CASE = 3800
const DEFAULT_ASTRONAUTS = 4

/** Packed food: worst-case daily kcal × supply planning horizon (450 + buffer) + margin. */
export const DEFAULT_PACKED_FOOD_KCAL = Math.ceil(
  DEFAULT_ASTRONAUTS * CREW_KCAL_WORST_CASE * SUPPLY_PLANNING_DAYS * 1.12,
)

/** Grow lights scale with floor area in backend fuel validation (≥ seeds × 0.25 m²/plant). */
export const DEFAULT_FLOOR_SPACE_M2 = 20

/** ceil(daily_kWh × supply planning days / 3.5) + ~15% headroom (setup_modes.py energy model). */
export const DEFAULT_FUEL_KG = Math.ceil(
  (((0.3 * DEFAULT_FLOOR_SPACE_M2 * 12 + 3.0 * 24) * SUPPLY_PLANNING_DAYS) / 3.5) *
    1.15,
)

/**
 * Water: all 40 seed packs as high-draw crops (0.6 L/plant·d) + crew net (10 L/astro, 82% recycle),
 * × supply planning days × 1.25 for recycler faults / variance.
 */
export const DEFAULT_WATER_L = Math.ceil(
  (40 * 0.6 + DEFAULT_ASTRONAUTS * 10 * (1 - 0.82)) * SUPPLY_PLANNING_DAYS * 1.25,
)

/** Upper-ish nutrient draw ~0.02 kg/plant·d × 40 plants × supply planning days with headroom. */
export const DEFAULT_FERTILIZER_KG = Math.ceil(0.02 * 40 * SUPPLY_PLANNING_DAYS * 1.2)

export const DEFAULT_SOIL_KG = 2000
