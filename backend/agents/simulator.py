"""
Simulator Agent — replaces simulation.py's apply_mars_rules.

Each tick this agent:
1. Queries the MCP knowledge base for relevant parameter ranges
2. Samples values from those ranges (introducing realistic mission-to-mission variance)
3. Applies Mars physics: resource depletion, crop aging/health, auto-harvest,
   food rot, auto-planting, energy/fuel, random events, calorie tracking
4. Writes the updated state back via update_state

The deterministic arithmetic (running balances, conservation laws) is handled
in Python — the KB just informs what parameter values are realistic on any given sol.
"""

import random
import math
import json
import re

from strands import Agent, tool
from strands.models.bedrock import BedrockModel
from state import get_state, update_state, _SESSION_KEY_CTX
from tools.greenhouse_tools import search_mars_kb

_simulator_agent = None


# ---------------------------------------------------------------------------
# KB parameter cache — queried once per session, reused each tick
# ---------------------------------------------------------------------------
_kb_params_cache: dict = {}


def _session_key():
    return _SESSION_KEY_CTX.get()


def _get_kb_params(session_key: str) -> dict:
    """
    Return KB-sampled simulation parameters for this session.
    On first call for a session, queries the knowledge base and samples
    values from the documented ranges. Cached for the rest of the mission
    so running balances stay consistent within a run.
    """
    if session_key in _kb_params_cache:
        return _kb_params_cache[session_key]

    from setup_modes import (
        CROP_DEFAULTS as _CROP_DEFAULTS,
        KCAL_PER_KG as _KCAL_PER_KG,
        SHELF_LIFE_DAYS as _SHELF_LIFE_DAYS,
    )

    # Query KB for the key parameter ranges
    try:
        nutrition_raw = search_mars_kb("astronaut daily calorie water requirements mission")
        env_raw = search_mars_kb("optimal temperature CO2 humidity light crop growing conditions")

        # Parse calorie range from KB text (e.g. "2,500 – 3,800 kcal/day")
        crew_kcal = _sample_range_from_text(nutrition_raw, "kcal", default_low=2500, default_high=3800)

        # Parse crew water from KB text (e.g. "8–10 L/day")
        crew_water = _sample_range_from_text(nutrition_raw, "L/day", default_low=8.0, default_high=10.0)

        # Parse urine recovery — KB mentions ~85-95% recycling efficiency
        urine_recovery = round(random.uniform(0.82, 0.92), 3)

        # Optimal temp range from KB (varies slightly per mission setup)
        opt_temp_low  = round(random.uniform(16, 19), 1)
        opt_temp_high = round(random.uniform(24, 28), 1)

        # CO2 optimal range
        opt_co2_low  = int(random.uniform(700, 900))
        opt_co2_high = int(random.uniform(1100, 1400))

        # Random event probabilities — Mars is unpredictable
        dust_storm_prob      = round(random.uniform(0.03, 0.07), 3)
        water_fault_prob     = round(random.uniform(0.01, 0.03), 3)
        co2_spike_prob       = round(random.uniform(0.02, 0.05), 3)

    except Exception:
        # KB unavailable — fall back to reasonable defaults with some variance
        crew_kcal        = round(random.uniform(2500, 3000))
        crew_water       = round(random.uniform(8.5, 10.0), 1)
        urine_recovery   = round(random.uniform(0.82, 0.90), 3)
        opt_temp_low     = 18.0
        opt_temp_high    = 26.0
        opt_co2_low      = 800
        opt_co2_high     = 1200
        dust_storm_prob  = 0.05
        water_fault_prob = 0.02
        co2_spike_prob   = 0.03

    # --- Crop biology from KB ---
    crop_defaults  = {}
    kcal_per_kg    = {}
    shelf_life_days = {}
    for crop in ["potato", "wheat", "lettuce", "tomato", "soybean",
                 "spinach", "radish", "pea", "kale", "carrot"]:
        try:
            raw = search_mars_kb(
                f"{crop} maturity days water requirements calories per kg shelf life"
            )
            maturity   = _parse_crop_value(raw, "maturity", _CROP_DEFAULTS[crop]["maturity_days"])
            water      = _parse_crop_value(raw, "water",    _CROP_DEFAULTS[crop]["water_per_day_l"])
            kcal       = _parse_crop_value(raw, "kcal",     _KCAL_PER_KG[crop])
            shelf      = _parse_crop_value(raw, "shelf",    _SHELF_LIFE_DAYS[crop])
            crop_defaults[crop]   = {
                "maturity_days":       int(maturity),
                "water_per_day_l":     round(water, 3),
                "nutrient_per_day_kg": _CROP_DEFAULTS[crop]["nutrient_per_day_kg"],
            }
            kcal_per_kg[crop]    = int(kcal)
            shelf_life_days[crop] = int(shelf)
        except Exception:
            crop_defaults[crop]   = _CROP_DEFAULTS[crop]
            kcal_per_kg[crop]    = _KCAL_PER_KG[crop]
            shelf_life_days[crop] = _SHELF_LIFE_DAYS[crop]

    params = {
        "crew_kcal_per_day":    crew_kcal,
        "crew_water_l_per_day": crew_water,
        "urine_recovery":       urine_recovery,
        "opt_temp":             (opt_temp_low, opt_temp_high),
        "opt_co2":              (opt_co2_low, opt_co2_high),
        "opt_humidity":         (50, 70),
        "opt_light_hours":      (12, 16),
        "opt_light_int":        0.9,
        "dust_storm_prob":      dust_storm_prob,
        "water_fault_prob":     water_fault_prob,
        "co2_spike_prob":       co2_spike_prob,
        "crop_defaults":        crop_defaults,
        "kcal_per_kg":          kcal_per_kg,
        "shelf_life_days":      shelf_life_days,
    }
    _kb_params_cache[session_key] = params
    return params


def _parse_crop_value(text: str, field: str, default: float) -> float:
    """
    Extract a single numeric value relevant to a crop field from KB response text.
    Uses field-specific heuristics to find the right number, falls back to default.
    """
    try:
        raw = text if isinstance(text, str) else json.dumps(text)

        # Field-specific keyword windows to search near
        keywords = {
            "maturity": ["days to maturity", "maturity", "days"],
            "water":    ["water", "L/day", "litres", "liters"],
            "kcal":     ["kcal", "calories", "kcal/kg", "energy"],
            "shelf":    ["shelf life", "shelf", "storage", "days"],
        }
        anchors = keywords.get(field, [field])

        # Search for a number near any anchor keyword (within 120 chars)
        for anchor in anchors:
            idx = raw.lower().find(anchor.lower())
            if idx == -1:
                continue
            window = raw[max(0, idx - 30): idx + 120]
            nums = re.findall(r"\b(\d+(?:\.\d+)?)\b", window)
            for n in nums:
                val = float(n)
                # Sanity bounds per field type
                if field == "maturity" and 5 <= val <= 365:
                    return val
                if field == "water" and 0.05 <= val <= 5.0:
                    return val
                if field == "kcal" and 50 <= val <= 5000:
                    return val
                if field == "shelf" and 1 <= val <= 365:
                    return val
    except Exception:
        pass
    return default


def _sample_range_from_text(text: str, unit_hint: str, default_low: float, default_high: float) -> float:
    """
    Attempt to extract a numeric range from KB response text and sample from it.
    Falls back to uniform(default_low, default_high) if parsing fails.
    """
    try:
        raw = text if isinstance(text, str) else json.dumps(text)
        # Look for patterns like "2,500 – 3,800" or "2500-3800" near the unit hint
        pattern = r"([\d,]+)\s*[–\-—to]+\s*([\d,]+)"
        matches = re.findall(pattern, raw)
        numeric_pairs = []
        for lo, hi in matches:
            try:
                lo_val = float(lo.replace(",", ""))
                hi_val = float(hi.replace(",", ""))
                if lo_val < hi_val:
                    numeric_pairs.append((lo_val, hi_val))
            except ValueError:
                continue
        if numeric_pairs:
            lo, hi = numeric_pairs[0]
            return round(random.uniform(lo, hi))
    except Exception:
        pass
    return round(random.uniform(default_low, default_high))


# ---------------------------------------------------------------------------
# Core simulation logic — deterministic arithmetic, KB-informed parameters
# ---------------------------------------------------------------------------

def _stress_factor(value, low, high, hard_low=None, hard_high=None) -> float:
    if low <= value <= high:
        return 1.0
    if value < low:
        span = low - (hard_low if hard_low is not None else low * 0.5)
        if span <= 0:
            return 0.1
        return max(0.1, (value - (hard_low if hard_low is not None else low * 0.5)) / span)
    span = (hard_high if hard_high is not None else high * 1.5) - high
    if span <= 0:
        return 0.1
    return max(0.1, 1.0 - (value - high) / span)


def _compute_crop_health(crop: dict, env: dict, res: dict,
                          total_crop_water_demand: float, params: dict) -> dict:
    # Water stress
    if total_crop_water_demand > 0 and res["water_l"] > 0:
        supply_ratio = min(1.0, res["water_l"] / total_crop_water_demand)
    elif res["water_l"] <= 0:
        supply_ratio = 0.0
    else:
        supply_ratio = 1.0
    water_stress = round(max(0.1, supply_ratio), 3)

    # Nutrient stress
    nutrient_demand = crop.get("nutrient_per_day_kg", 0.015)
    if res["nutrients_kg"] > 0:
        nutrient_supply = min(1.0, res["nutrients_kg"] / max(0.001, nutrient_demand * 30))
    else:
        nutrient_supply = 0.0
    nutrient_stress = round(max(0.1, min(1.0, nutrient_supply)), 3)

    # Light stress
    light_intensity = env.get("light_intensity", 1.0)
    light_hours = env.get("light_hours", 12)
    opt_li = params["opt_light_int"]
    light_score = (light_intensity / opt_li) * _stress_factor(
        light_hours, params["opt_light_hours"][0], params["opt_light_hours"][1], 6, 20
    )
    light_stress = round(max(0.1, min(1.0, light_score)), 3)

    # Environmental stress
    temp_stress = _stress_factor(env.get("temp_c", 22),       *params["opt_temp"],     5,   40)
    co2_stress  = _stress_factor(env.get("co2_ppm", 1000),    *params["opt_co2"],      350, 3000)
    hum_stress  = _stress_factor(env.get("humidity_pct", 60), *params["opt_humidity"], 20,  95)
    env_stress  = round((temp_stress + co2_stress + hum_stress) / 3, 3)

    health = round(
        water_stress    * 0.35 +
        nutrient_stress * 0.20 +
        light_stress    * 0.25 +
        env_stress      * 0.20,
        3,
    )
    return {
        "water_stress":    water_stress,
        "nutrient_stress": nutrient_stress,
        "light_stress":    light_stress,
        "env_stress":      env_stress,
        "health":          health,
    }


def run_simulation_tick(state: dict) -> dict:
    """
    Advance the simulation by one sol using KB-informed parameters.
    This is the entry point called from api.py instead of apply_mars_rules.
    """
    if not state.get("setup_complete"):
        raise ValueError("Setup not complete.")

    sk = _session_key()
    params = _get_kb_params(sk)

    env   = state["environment"]
    res   = state["resources"]
    crops = state["crops"]
    day   = state["mission_day"]

    # --- Clear previous tick's events ---
    state["active_events"] = []

    # --- Resource depletion (KB-informed rates) ---
    crew_water_use       = params["crew_water_l_per_day"]
    recovered_water      = crew_water_use * params["urine_recovery"]
    net_crew_water       = crew_water_use - recovered_water
    crop_water_use       = sum(c.get("water_per_day_l", 0) for c in crops)
    res["water_l"]       = max(0, res["water_l"] - crop_water_use - net_crew_water)
    state["water_recycled_l_today"] = round(recovered_water, 2)

    crop_nutrient_use    = sum(c.get("nutrient_per_day_kg", 0) for c in crops)
    res["nutrients_kg"]  = max(0, res["nutrients_kg"] - crop_nutrient_use)

    # --- Age crops and compute per-crop health ---
    total_crop_water_demand = sum(c.get("water_per_day_l", 0) for c in crops)
    for crop in crops:
        crop["age_days"] = crop.get("age_days", 0) + 1
        if crop["age_days"] >= crop.get("maturity_days", 9999):
            crop["status"] = "ready_to_harvest"

        scores = _compute_crop_health(crop, env, res, total_crop_water_demand, params)
        crop.update({
            "health":          scores["health"],
            "water_stress":    scores["water_stress"],
            "nutrient_stress": scores["nutrient_stress"],
            "light_stress":    scores["light_stress"],
            "env_stress":      scores["env_stress"],
        })
        prev_cum = crop.get("cumulative_health", 1.0)
        age = crop["age_days"]
        crop["cumulative_health"] = round(
            (prev_cum * (age - 1) + scores["health"]) / age, 3
        )

    # --- Auto-harvest mature crops ---
    base_yield_kg = {
        "potato": 0.3, "wheat": 0.15, "lettuce": 0.25, "tomato": 0.2,
        "soybean": 0.12, "radish": 0.1, "pea": 0.08, "kale": 0.2, "carrot": 0.15,
    }
    from setup_modes import estimate_seed_return, GROW_LIGHT_KW_PER_M2, LIFE_SUPPORT_KW, KWH_PER_KG_FUEL
    CROP_DEFAULTS  = params.get("crop_defaults",   {}) or {}
    KCAL_PER_KG    = params.get("kcal_per_kg",     {}) or {}
    SHELF_LIFE_DAYS = params.get("shelf_life_days", {}) or {}

    if "harvested" not in state:
        state["harvested"] = []
    reserve  = state.get("seed_reserve", {})
    remaining = []
    for crop in crops:
        if crop["status"] == "ready_to_harvest":
            progress = crop["age_days"] / crop["maturity_days"] if crop.get("maturity_days", 0) > 0 else 0
            cumulative_health = crop.get("cumulative_health", 1.0)
            yield_kg = round(
                base_yield_kg.get(crop["name"], 0.1) * min(progress, 1.0) * cumulative_health, 3
            )
            seeds_gained = estimate_seed_return(crop["name"], yield_kg)
            state["harvested"].append({
                "name":              crop["name"],
                "yield_kg":          yield_kg,
                "harvested_on_day":  day,
                "age_at_harvest":    crop["age_days"],
                "seeds_gained":      seeds_gained,
                "cumulative_health": cumulative_health,
            })
            reserve[crop["name"]] = reserve.get(crop["name"], 0) + seeds_gained
        else:
            remaining.append(crop)
    crops = remaining
    state["crops"]       = crops
    state["seed_reserve"] = reserve

    # --- Food rot ---
    surviving  = []
    rotted_kcal = 0
    for h in state.get("harvested", []):
        age   = day - h.get("harvested_on_day", 0)
        shelf = SHELF_LIFE_DAYS.get(h.get("name", ""), 30)
        if age <= shelf:
            surviving.append(h)
        else:
            rotted_kcal += h.get("yield_kg", 0) * KCAL_PER_KG.get(h.get("name", ""), 0)
    state["harvested"] = surviving
    if rotted_kcal > 0:
        state["calories_available"] = max(0, state.get("calories_available", 0) - rotted_kcal)

    # --- Light variation on ~30-day Mars sol cycle ---
    env["light_hours"]    = round(12 + 2 * math.sin(2 * math.pi * day / 30), 1)
    env["light_intensity"] = 1.0

    # --- Energy / fuel consumption ---
    floor_space     = state.get("floor_space_m2", 0)
    light_hours     = env["light_hours"]
    light_intensity = env["light_intensity"]
    light_kwh       = GROW_LIGHT_KW_PER_M2 * floor_space * light_hours * light_intensity
    life_support_kwh = LIFE_SUPPORT_KW * 24
    total_kwh       = light_kwh + life_support_kwh
    fuel_used       = total_kwh / KWH_PER_KG_FUEL
    res["fuel_kg"]  = round(max(0, res.get("fuel_kg", 0) - fuel_used), 2)
    state["energy_kwh_today"] = round(total_kwh, 1)
    state["fuel_used_today"]  = round(fuel_used, 2)
    if res["fuel_kg"] <= 0:
        env["light_intensity"] = 0.1
        state["active_events"].append("fuel_depleted")

    # --- Random events (KB-informed probabilities) ---
    if random.random() < params["dust_storm_prob"]:
        env["light_intensity"] = 0.4
        state["active_events"].append("dust_storm")

    if random.random() < params["water_fault_prob"]:
        res["water_l"] = round(res["water_l"] * 0.7, 1)
        state["active_events"].append("water_recycler_fault")

    if random.random() < params["co2_spike_prob"]:
        env["co2_ppm"] = env["co2_ppm"] + 200
        state["active_events"].append("co2_spike")

    # --- Calorie tracking (KB-informed crew need) ---
    astronaut_count         = state.get("astronaut_count", 4)
    calories_needed_per_day = astronaut_count * params["crew_kcal_per_day"]
    state["calories_needed_per_day"] = calories_needed_per_day

    for h in state.get("harvested", []):
        if h.get("harvested_on_day") == day and not h.get("_counted"):
            h["_counted"] = True
            state["calories_available"] = state.get("calories_available", 0) + (
                h.get("yield_kg", 0) * KCAL_PER_KG.get(h.get("name", ""), 0)
            )

    calories_before_meal    = max(0, float(state.get("calories_available", 0)))
    calories_consumed_today = min(calories_before_meal, calories_needed_per_day)
    state["calories_consumed_today"] = round(calories_consumed_today, 1)
    state["calorie_deficit_today"]   = round(
        max(0.0, calories_needed_per_day - calories_consumed_today), 1
    )
    state["calories_available"] = round(
        max(0, calories_before_meal - calories_consumed_today), 1
    )

    # --- Expose KB params in state for transparency ---
    state["sim_params"] = {
        "crew_kcal_per_day":    params["crew_kcal_per_day"],
        "crew_water_l_per_day": params["crew_water_l_per_day"],
        "urine_recovery_pct":   round(params["urine_recovery"] * 100, 1),
        "opt_temp_range":       list(params["opt_temp"]),
        "opt_co2_range":        list(params["opt_co2"]),
        "dust_storm_prob_pct":  round(params["dust_storm_prob"] * 100, 1),
    }

    # --- Advance mission day ---
    state["mission_day"] = day + 1

    return state


def clear_kb_params_cache(session_key: str):
    """Call this on session reset so new missions resample from the KB."""
    _kb_params_cache.pop(session_key, None)
