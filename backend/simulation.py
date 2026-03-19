import random
import math

URINE_RECOVERY_EFFICIENCY = 0.85

# Optimal environmental ranges for crop health scoring
OPTIMAL_TEMP_C      = (18, 26)
OPTIMAL_CO2_PPM     = (800, 1200)
OPTIMAL_HUMIDITY    = (50, 70)
OPTIMAL_LIGHT_HOURS = (12, 16)
OPTIMAL_LIGHT_INT   = 0.9   # anything >= this is full health


def _stress_factor(value, low, high, hard_low=None, hard_high=None):
    """Return 0.0 (full stress) to 1.0 (no stress) based on how far value is from the optimal band.
    Outside hard limits the factor bottoms out at 0.1."""
    if low <= value <= high:
        return 1.0
    if value < low:
        span = low - (hard_low if hard_low is not None else low * 0.5)
        if span <= 0:
            return 0.1
        return max(0.1, (value - (hard_low if hard_low is not None else low * 0.5)) / span)
    # value > high
    span = (hard_high if hard_high is not None else high * 1.5) - high
    if span <= 0:
        return 0.1
    return max(0.1, 1.0 - (value - high) / span)


def compute_crop_health(crop: dict, env: dict, res: dict, total_crop_water_demand: float) -> dict:
    """Compute per-crop health scores (0–1) for water, nutrient, and light stress.
    Returns a dict with individual stress factors and a composite health score."""
    # Water stress: how well-supplied is this crop given available water?
    # If total demand > supply, all crops share the shortfall proportionally.
    water_demand = crop.get("water_per_day_l", 0.3)
    if total_crop_water_demand > 0 and res["water_l"] > 0:
        supply_ratio = min(1.0, res["water_l"] / total_crop_water_demand)
    elif res["water_l"] <= 0:
        supply_ratio = 0.0
    else:
        supply_ratio = 1.0
    water_stress = round(max(0.1, supply_ratio), 3)

    # Nutrient stress: same proportional logic
    nutrient_demand = crop.get("nutrient_per_day_kg", 0.015)
    total_nutrient_demand = max(0.001, nutrient_demand)  # use per-crop for simplicity
    if res["nutrients_kg"] > 0:
        nutrient_supply = min(1.0, res["nutrients_kg"] / max(0.001, total_nutrient_demand * 30))
    else:
        nutrient_supply = 0.0
    nutrient_stress = round(max(0.1, min(1.0, nutrient_supply)), 3)

    # Light stress: intensity × hours proportion vs optimal
    light_intensity = env.get("light_intensity", 1.0)
    light_hours = env.get("light_hours", 12)
    light_score = (light_intensity / OPTIMAL_LIGHT_INT) * _stress_factor(
        light_hours, OPTIMAL_LIGHT_HOURS[0], OPTIMAL_LIGHT_HOURS[1], 6, 20
    )
    light_stress = round(max(0.1, min(1.0, light_score)), 3)

    # Environmental stress: temp, CO2, humidity
    temp_stress = _stress_factor(env.get("temp_c", 22), *OPTIMAL_TEMP_C, 5, 40)
    co2_stress  = _stress_factor(env.get("co2_ppm", 800), *OPTIMAL_CO2_PPM, 350, 3000)
    hum_stress  = _stress_factor(env.get("humidity_pct", 65), *OPTIMAL_HUMIDITY, 20, 95)
    env_stress  = round((temp_stress + co2_stress + hum_stress) / 3, 3)

    # Composite health: weighted average (water most important, then light, then nutrient, then env)
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


def apply_mars_rules(state: dict) -> dict:
    if not state.get("setup_complete"):
        raise ValueError("Setup not complete. Call /setup/manual or /setup/ai-optimised first.")

    env = state["environment"]
    res = state["resources"]
    crops = state["crops"]
    day = state["mission_day"]

    # --- Clear previous tick's events ---
    state["active_events"] = []

    # --- Resource depletion ---
    crew_water_use = 10
    # Closed-loop life support recovers most crew wastewater as potable water.
    recovered_urine_water = crew_water_use * URINE_RECOVERY_EFFICIENCY
    net_crew_water_use = crew_water_use - recovered_urine_water
    crop_water_use = sum(c.get("water_per_day_l", 0) for c in crops)
    res["water_l"] = max(0, res["water_l"] - crop_water_use - net_crew_water_use)
    state["water_recycled_l_today"] = round(recovered_urine_water, 2)

    crop_nutrient_use = sum(c.get("nutrient_per_day_kg", 0) for c in crops)
    res["nutrients_kg"] = max(0, res["nutrients_kg"] - crop_nutrient_use)

    # --- Age crops and compute per-crop health ---
    total_crop_water_demand = sum(c.get("water_per_day_l", 0) for c in crops)
    for crop in crops:
        crop["age_days"] = crop.get("age_days", 0) + 1
        if crop["age_days"] >= crop.get("maturity_days", 9999):
            crop["status"] = "ready_to_harvest"

        # Compute today's health scores and accumulate stress
        health_scores = compute_crop_health(crop, env, res, total_crop_water_demand)
        crop["health"]          = health_scores["health"]
        crop["water_stress"]    = health_scores["water_stress"]
        crop["nutrient_stress"] = health_scores["nutrient_stress"]
        crop["light_stress"]    = health_scores["light_stress"]
        crop["env_stress"]      = health_scores["env_stress"]
        # cumulative_stress: rolling average health across the crop's lifetime
        prev_cum = crop.get("cumulative_health", 1.0)
        age = crop["age_days"]
        crop["cumulative_health"] = round(
            (prev_cum * (age - 1) + health_scores["health"]) / age, 3
        )

    # --- Auto-harvest mature crops; return seed to reserve ---
    base_yield_kg = {
        "potato": 0.3, "wheat": 0.15, "lettuce": 0.25, "tomato": 0.2,
        "soybean": 0.12, "radish": 0.1, "pea": 0.08, "kale": 0.2, "carrot": 0.15,
    }
    from setup_modes import estimate_seed_return
    if "harvested" not in state:
        state["harvested"] = []
    reserve = state.get("seed_reserve", {})
    remaining = []
    for crop in crops:
        if crop["status"] == "ready_to_harvest":
            progress = crop["age_days"] / crop["maturity_days"] if crop.get("maturity_days", 0) > 0 else 0
            # Yield is scaled by cumulative health — stress reduces actual output
            cumulative_health = crop.get("cumulative_health", 1.0)
            yield_kg = round(
                base_yield_kg.get(crop["name"], 0.1) * min(progress, 1.0) * cumulative_health, 3
            )
            seeds_gained = estimate_seed_return(crop["name"], yield_kg)
            state["harvested"].append({
                "name": crop["name"],
                "yield_kg": yield_kg,
                "harvested_on_day": day,
                "age_at_harvest": crop["age_days"],
                "seeds_gained": seeds_gained,
                "cumulative_health": cumulative_health,
            })
            # Return crop-specific seed counts based on harvested output.
            reserve[crop["name"]] = reserve.get(crop["name"], 0) + seeds_gained
        else:
            remaining.append(crop)
    crops = remaining
    state["crops"] = crops
    state["seed_reserve"] = reserve

    # --- Food rot: remove harvested food past its shelf life, subtract lost calories ---
    from setup_modes import SHELF_LIFE_DAYS, CROP_DEFAULTS, KCAL_PER_KG
    surviving = []
    rotted_kcal = 0
    for h in state.get("harvested", []):
        age = day - h.get("harvested_on_day", 0)
        shelf = SHELF_LIFE_DAYS.get(h.get("name", ""), 30)
        if age <= shelf:
            surviving.append(h)
        else:
            rotted_kcal += h.get("yield_kg", 0) * KCAL_PER_KG.get(h.get("name", ""), 0)
    state["harvested"] = surviving
    if rotted_kcal > 0:
        state["calories_available"] = max(0, state.get("calories_available", 0) - rotted_kcal)

    # --- Smart auto-planting from reserve ---
    # Plant seeds in staggered waves: for each crop type in reserve, plant a small
    # batch at intervals tied to its shelf life so harvests stay continuous.
    # E.g. if lettuce shelf life is 7 days, plant a batch every 7 days.
    reserve = state.get("seed_reserve", {})
    floor_space = state.get("floor_space_m2", 0)
    space_per_plant = 0.25
    crops = state["crops"]
    max_plants = int(floor_space / space_per_plant) if space_per_plant > 0 else 0

    if reserve and len(crops) < max_plants:
        for crop_name in list(reserve.keys()):
            if reserve[crop_name] <= 0:
                continue
            shelf = SHELF_LIFE_DAYS.get(crop_name, 30)
            maturity = CROP_DEFAULTS.get(crop_name, {}).get("maturity_days", 60)
            # Plant a batch every `shelf` days so new harvests overlap with expiry
            # Check if we already have a young batch (age < shelf) of this type growing
            young_of_type = [
                c for c in crops
                if c["name"] == crop_name and c["age_days"] < maturity and c["age_days"] % shelf < 2
            ]
            # Only plant if no very young seedlings of this type exist (age < 3 days)
            seedlings = [c for c in crops if c["name"] == crop_name and c["age_days"] < 3]
            if seedlings:
                continue
            # Determine batch size: enough to sustain crew until next batch
            # but leave room for other crops
            slots_available = max_plants - len(crops)
            if slots_available <= 0:
                break
            # Plant a meaningful batch to sustain calorie production
            batch = min(reserve[crop_name], slots_available, 8)
            defaults = CROP_DEFAULTS.get(crop_name, {})
            for _ in range(batch):
                crops.append({
                    "name": crop_name,
                    "age_days": 0,
                    "maturity_days": defaults.get("maturity_days", 60),
                    "water_per_day_l": defaults.get("water_per_day_l", 0.3),
                    "nutrient_per_day_kg": defaults.get("nutrient_per_day_kg", 0.015),
                    "status": "growing",
                })
            reserve[crop_name] -= batch
            if reserve[crop_name] <= 0:
                del reserve[crop_name]

    state["crops"] = crops
    state["seed_reserve"] = reserve

    # --- Light variation on ~30-day Mars sol cycle ---
    env["light_hours"] = round(12 + 2 * math.sin(2 * math.pi * day / 30), 1)
    env["light_intensity"] = 1.0

    # --- Energy / fuel consumption ---
    from setup_modes import GROW_LIGHT_KW_PER_M2, LIFE_SUPPORT_KW, KWH_PER_KG_FUEL
    floor_space = state.get("floor_space_m2", 0)
    light_hours = env["light_hours"]
    light_intensity = env["light_intensity"]
    light_kwh = GROW_LIGHT_KW_PER_M2 * floor_space * light_hours * light_intensity
    life_support_kwh = LIFE_SUPPORT_KW * 24
    total_kwh = light_kwh + life_support_kwh
    fuel_used = total_kwh / KWH_PER_KG_FUEL
    res["fuel_kg"] = round(max(0, res.get("fuel_kg", 0) - fuel_used), 2)
    state["energy_kwh_today"] = round(total_kwh, 1)
    state["fuel_used_today"] = round(fuel_used, 2)
    if res["fuel_kg"] <= 0:
        # No fuel = no lights, intensity drops to ambient Mars light (~10%)
        env["light_intensity"] = 0.1
        state["active_events"].append("fuel_depleted")

    # --- Random events ---
    if random.random() < 0.05:
        env["light_intensity"] = 0.4
        state["active_events"].append("dust_storm")

    if random.random() < 0.02:
        res["water_l"] = round(res["water_l"] * 0.7, 1)
        state["active_events"].append("water_recycler_fault")

    if random.random() < 0.03:
        env["co2_ppm"] = env["co2_ppm"] + 200
        state["active_events"].append("co2_spike")

    # --- Calorie tracking (running balance) ---
    from setup_modes import CREW_KCAL_PER_DAY
    astronaut_count = state.get("astronaut_count", 4)
    calories_needed_per_day = astronaut_count * CREW_KCAL_PER_DAY
    state["calories_needed_per_day"] = calories_needed_per_day

    # Add calories from today's harvests
    for h in state.get("harvested", []):
        if h.get("harvested_on_day") == day and not h.get("_counted"):
            h["_counted"] = True
            state["calories_available"] = state.get("calories_available", 0) + (
                h.get("yield_kg", 0) * KCAL_PER_KG.get(h.get("name", ""), 0)
            )

    # Crew eats every day (track actual intake and deficit for downstream nutrition HUD).
    calories_before_meal = max(0, float(state.get("calories_available", 0)))
    calories_consumed_today = min(calories_before_meal, calories_needed_per_day)
    state["calories_consumed_today"] = round(calories_consumed_today, 1)
    state["calorie_deficit_today"] = round(
        max(0.0, calories_needed_per_day - calories_consumed_today),
        1,
    )
    state["calories_available"] = round(
        max(0, calories_before_meal - calories_consumed_today),
        1,
    )

    # --- Advance mission day ---
    state["mission_day"] = day + 1

    return state
