import random
import math


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
    crop_water_use = sum(c.get("water_per_day_l", 0) for c in crops)
    res["water_l"] = max(0, res["water_l"] - crop_water_use - crew_water_use)

    crop_nutrient_use = sum(c.get("nutrient_per_day_kg", 0) for c in crops)
    res["nutrients_kg"] = max(0, res["nutrients_kg"] - crop_nutrient_use)

    # --- Age crops ---
    for crop in crops:
        crop["age_days"] = crop.get("age_days", 0) + 1
        if crop["age_days"] >= crop.get("maturity_days", 9999):
            crop["status"] = "ready_to_harvest"

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
            yield_kg = round(base_yield_kg.get(crop["name"], 0.1) * min(progress, 1.0), 3)
            seeds_gained = estimate_seed_return(crop["name"], yield_kg)
            state["harvested"].append({
                "name": crop["name"],
                "yield_kg": yield_kg,
                "harvested_on_day": day,
                "age_at_harvest": crop["age_days"],
                "seeds_gained": seeds_gained,
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
            # Plant 1-3 seeds per batch depending on availability and space
            batch = min(reserve[crop_name], slots_available, 3)
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

    # Crew eats every day
    state["calories_available"] = round(
        max(0, state.get("calories_available", 0) - calories_needed_per_day), 1
    )

    # --- Advance mission day ---
    state["mission_day"] = day + 1

    return state
