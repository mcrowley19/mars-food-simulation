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
    if "harvested" not in state:
        state["harvested"] = []
    reserve = state.get("seed_reserve", {})
    remaining = []
    for crop in crops:
        if crop["status"] == "ready_to_harvest":
            progress = crop["age_days"] / crop["maturity_days"] if crop.get("maturity_days", 0) > 0 else 0
            yield_kg = round(base_yield_kg.get(crop["name"], 0.1) * min(progress, 1.0), 3)
            state["harvested"].append({
                "name": crop["name"],
                "yield_kg": yield_kg,
                "harvested_on_day": day,
                "age_at_harvest": crop["age_days"],
            })
            # Return a seed to the reserve for future planting
            reserve[crop["name"]] = reserve.get(crop["name"], 0) + 1
        else:
            remaining.append(crop)
    crops = remaining
    state["crops"] = crops
    state["seed_reserve"] = reserve

    # --- Food rot: remove harvested food past its shelf life ---
    from setup_modes import SHELF_LIFE_DAYS
    state["harvested"] = [
        h for h in state["harvested"]
        if (day - h.get("harvested_on_day", 0)) <= SHELF_LIFE_DAYS.get(h.get("name", ""), 30)
    ]

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

    # --- Calorie tracking ---
    from setup_modes import KCAL_PER_KG, CREW_KCAL_PER_DAY
    astronaut_count = state.get("astronaut_count", 4)
    calories_needed_per_day = astronaut_count * CREW_KCAL_PER_DAY
    harvested = state.get("harvested", [])
    harvest_calories = sum(
        h.get("yield_kg", 0) * KCAL_PER_KG.get(h.get("name", ""), 0)
        for h in harvested
    )
    food_supplies = state.get("food_supplies_kcal", 0)
    # Crew consumes calories_needed_per_day each day from food supplies first
    days_elapsed = day - 1  # day hasn't been incremented yet
    consumed = days_elapsed * calories_needed_per_day
    remaining_supplies = max(0, food_supplies - consumed)
    state["calories_available"] = round(remaining_supplies + harvest_calories, 1)
    state["calories_needed_per_day"] = calories_needed_per_day

    # --- Advance mission day ---
    state["mission_day"] = day + 1

    return state
