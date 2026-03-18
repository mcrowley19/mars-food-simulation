import random
import math


def apply_mars_rules(state: dict) -> dict:
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

    # --- Advance mission day ---
    state["mission_day"] = day + 1

    return state
