import json
import re
from agents.crop_planner import create_crop_planner

VALID_SEEDS = {"potato", "wheat", "lettuce", "tomato", "soybean", "radish", "pea", "kale", "carrot"}
SPACE_PER_PLANT_M2 = 0.25

CROP_DEFAULTS = {
    "potato":  {"maturity_days": 90,  "water_per_day_l": 0.5, "nutrient_per_day_kg": 0.02},
    "wheat":   {"maturity_days": 120, "water_per_day_l": 0.3, "nutrient_per_day_kg": 0.015},
    "lettuce": {"maturity_days": 30,  "water_per_day_l": 0.2, "nutrient_per_day_kg": 0.01},
    "tomato":  {"maturity_days": 70,  "water_per_day_l": 0.6, "nutrient_per_day_kg": 0.025},
    "soybean": {"maturity_days": 80,  "water_per_day_l": 0.4, "nutrient_per_day_kg": 0.02},
    "radish":  {"maturity_days": 25,  "water_per_day_l": 0.15,"nutrient_per_day_kg": 0.008},
    "pea":     {"maturity_days": 60,  "water_per_day_l": 0.3, "nutrient_per_day_kg": 0.015},
    "kale":    {"maturity_days": 55,  "water_per_day_l": 0.25,"nutrient_per_day_kg": 0.012},
    "carrot":  {"maturity_days": 75,  "water_per_day_l": 0.3, "nutrient_per_day_kg": 0.015},
}

KCAL_PER_KG = {
    "potato": 770,
    "wheat": 3390,
    "lettuce": 150,
    "tomato": 180,
    "soybean": 1470,
    "radish": 160,
    "pea": 810,
    "kale": 490,
    "carrot": 410,
}

CREW_KCAL_PER_DAY = 2500


def min_food_supplies_kcal(astronaut_count: int, seed_amounts: dict) -> int:
    """Minimum kcal of food supplies needed to survive until the first harvest."""
    if not seed_amounts:
        # No crops planted — need food for the entire mission, but we can't
        # know mission length here so just require 30 days' worth.
        return astronaut_count * CREW_KCAL_PER_DAY * 30
    fastest_maturity = min(
        CROP_DEFAULTS[s]["maturity_days"]
        for s in seed_amounts
        if s in CROP_DEFAULTS
    )
    return astronaut_count * CREW_KCAL_PER_DAY * fastest_maturity


def _blank_state():
    return {
        "key": "unset",
        "mission_day": 1,
        "crops": [],
        "environment": {
            "temp_c": 22,
            "co2_ppm": 800,
            "humidity_pct": 65,
            "light_hours": 12,
            "light_intensity": 1.0,
        },
        "resources": {
            "water_l": 0,
            "nutrients_kg": 0,
        },
        "harvest_schedule": [],
        "alerts": [],
        "active_events": [],
        "agent_last_actions": {},
        "agent_logs": {},
        "water_l": 0,
        "fertilizer_kg": 0,
        "soil_kg": 0,
        "floor_space_m2": 0,
        "mission_days": 0,
        "astronaut_count": 0,
        "seed_amounts": {},
        "food_supplies_kcal": 0,
        "setup_complete": False,
        "setup_mode": None,
        "ai_setup_reasoning": None,
        "ai_setup_in_progress": False,
        "ai_setup_error": None,
    }


def manual_setup(params: dict) -> dict:
    water_l = params["water_l"]
    fertilizer_kg = params["fertilizer_kg"]
    soil_kg = params["soil_kg"]
    floor_space_m2 = params["floor_space_m2"]
    mission_days = params["mission_days"]
    astronaut_count = params["astronaut_count"]
    seed_amounts = params["seed_amounts"]
    food_supplies_kcal = params.get("food_supplies_kcal", 0)

    # Validate no negative numbers
    for field in ["water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "mission_days", "astronaut_count"]:
        if params[field] < 0:
            raise ValueError(f"{field} cannot be negative")

    if food_supplies_kcal < 0:
        raise ValueError("food_supplies_kcal cannot be negative")

    # Validate seed types
    for seed_type in seed_amounts:
        if seed_type not in VALID_SEEDS:
            raise ValueError(f"Invalid seed type '{seed_type}'. Valid types: {sorted(VALID_SEEDS)}")
        if seed_amounts[seed_type] < 0:
            raise ValueError(f"Seed amount for '{seed_type}' cannot be negative")

    # Validate floor space fits total seed count
    total_plants = sum(seed_amounts.values())
    required_space = total_plants * SPACE_PER_PLANT_M2
    if required_space > floor_space_m2:
        raise ValueError(
            f"Not enough floor space: {total_plants} plants need {required_space} m² "
            f"but only {floor_space_m2} m² available"
        )

    # Validate food supplies cover the gap until first harvest
    min_kcal = min_food_supplies_kcal(astronaut_count, seed_amounts)
    if food_supplies_kcal < min_kcal:
        raise ValueError(
            f"Not enough food supplies: crew needs at least {min_kcal:,} kcal to survive "
            f"until the first crop harvest. Provided: {food_supplies_kcal:,} kcal"
        )

    state = _blank_state()
    state["water_l"] = water_l
    state["fertilizer_kg"] = fertilizer_kg
    state["soil_kg"] = soil_kg
    state["floor_space_m2"] = floor_space_m2
    state["mission_days"] = mission_days
    state["astronaut_count"] = astronaut_count
    state["seed_amounts"] = seed_amounts
    state["food_supplies_kcal"] = food_supplies_kcal
    state["calories_available"] = float(food_supplies_kcal)
    state["resources"]["water_l"] = water_l
    state["resources"]["nutrients_kg"] = fertilizer_kg
    state["setup_complete"] = True

    # Populate crops array from seed_amounts
    crops = []
    for seed_type, count in seed_amounts.items():
        defaults = CROP_DEFAULTS.get(seed_type, {})
        for _ in range(count):
            crops.append({
                "name": seed_type,
                "age_days": 0,
                "maturity_days": defaults.get("maturity_days", 60),
                "water_per_day_l": defaults.get("water_per_day_l", 0.3),
                "nutrient_per_day_kg": defaults.get("nutrient_per_day_kg", 0.015),
                "status": "growing",
            })
    state["crops"] = crops

    return state


def _extract_json(text: str) -> dict:
    """Extract a JSON object from agent text, trying multiple strategies."""
    # Strategy 1: find all top-level { ... } blocks and pick the one with expected keys
    candidates = []
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                candidates.append(text[start:i + 1])
                start = -1

    required = {"seed_amounts", "water_l", "fertilizer_kg", "soil_kg", "floor_space_m2"}
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict) and required.issubset(obj.keys()):
                return obj
        except (json.JSONDecodeError, TypeError):
            continue

    # Strategy 2: try any candidate that parses as a dict
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, TypeError):
            continue

    raise ValueError(f"No valid JSON object found in agent response. Response: {text[:500]}")


def ai_optimised_setup() -> dict:
    agent = create_crop_planner()

    prompt = """You are planning a Mars greenhouse mission for 4 astronauts over 450 days.
Query the knowledge base for crop data, then determine the optimal setup.

The ONLY valid seed types are: potato, wheat, lettuce, tomato, soybean, radish, pea, kale, carrot

You must return ONLY a JSON object (no markdown, no explanation outside the JSON) in this exact shape:
{
  "seed_amounts": {"lettuce": 40, "potato": 20, ...},
  "water_l": 5000,
  "fertilizer_kg": 200,
  "soil_kg": 1000,
  "floor_space_m2": 50,
  "food_supplies_kcal": 250000,
  "reasoning": "explanation of choices"
}

Rules:
- seed_amounts must only contain seeds from the valid list above
- All numeric values must be greater than 0
- floor_space_m2 must be enough for all plants (0.25 m² per plant)
- water_l, fertilizer_kg, soil_kg must be enough for the full 450-day mission
- food_supplies_kcal is the amount of pre-packed food (in kcal) the crew brings along. It must be enough to feed 4 astronauts (2500 kcal/day each) until the fastest crop matures. For example if the fastest crop takes 25 days: 4 × 2500 × 25 = 250000 kcal minimum. Include a safety margin.
- Optimize for nutritional completeness for 4 astronauts
- Do NOT wrap the JSON in markdown code fences"""

    result = str(agent(prompt))
    print(f"[AI Setup] Raw agent response (first 1000 chars): {result[:1000]}")

    parsed = _extract_json(result)

    required_keys = {"seed_amounts", "water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "food_supplies_kcal"}
    missing = required_keys - set(parsed.keys())
    if missing:
        raise ValueError(f"AI response missing keys: {missing}")

    reasoning = parsed.get("reasoning", "No reasoning provided.")
    if "reasoning" in parsed:
        parsed.pop("reasoning")

    # Validate that numeric fields are non-zero
    for field in ["water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "food_supplies_kcal"]:
        val = float(parsed[field])
        if val <= 0:
            raise ValueError(f"AI returned {field}={val}, expected a positive number")

    # Validate seed_amounts is a non-empty dict with positive values
    seeds = parsed.get("seed_amounts", {})
    if not seeds or not isinstance(seeds, dict):
        raise ValueError(f"AI returned empty or invalid seed_amounts: {seeds}")

    # Filter to only valid seed types
    valid_seeds = {k: int(v) for k, v in seeds.items() if k in VALID_SEEDS and int(v) > 0}
    if not valid_seeds:
        raise ValueError(f"AI returned no valid seeds. Got: {seeds}")

    # Run through manual_setup for validation
    params = {
        "water_l": float(parsed["water_l"]),
        "fertilizer_kg": float(parsed["fertilizer_kg"]),
        "soil_kg": float(parsed["soil_kg"]),
        "floor_space_m2": float(parsed["floor_space_m2"]),
        "food_supplies_kcal": float(parsed["food_supplies_kcal"]),
        "mission_days": 450,
        "astronaut_count": 4,
        "seed_amounts": valid_seeds,
    }

    state = manual_setup(params)
    state["setup_mode"] = "ai_optimised"
    state["ai_setup_reasoning"] = reasoning

    return state
