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
        "setup_complete": False,
        "setup_mode": None,
        "ai_setup_reasoning": None,
    }


def manual_setup(params: dict) -> dict:
    water_l = params["water_l"]
    fertilizer_kg = params["fertilizer_kg"]
    soil_kg = params["soil_kg"]
    floor_space_m2 = params["floor_space_m2"]
    mission_days = params["mission_days"]
    astronaut_count = params["astronaut_count"]
    seed_amounts = params["seed_amounts"]

    # Validate no negative numbers
    for field in ["water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "mission_days", "astronaut_count"]:
        if params[field] < 0:
            raise ValueError(f"{field} cannot be negative")

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

    state = _blank_state()
    state["water_l"] = water_l
    state["fertilizer_kg"] = fertilizer_kg
    state["soil_kg"] = soil_kg
    state["floor_space_m2"] = floor_space_m2
    state["mission_days"] = mission_days
    state["astronaut_count"] = astronaut_count
    state["seed_amounts"] = seed_amounts
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
  "reasoning": "explanation of choices"
}

Rules:
- seed_amounts must only contain seeds from the valid list above
- floor_space_m2 must be enough for all plants (0.25 m² per plant)
- water_l, fertilizer_kg, soil_kg must be enough for the full 450-day mission
- Optimize for nutritional completeness for 4 astronauts"""

    result = str(agent(prompt))

    # Extract JSON from response
    json_match = re.search(r'\{[\s\S]*\}', result)
    if not json_match:
        raise ValueError(f"AI agent did not return valid JSON. Response: {result[:500]}")

    parsed = json.loads(json_match.group())

    required_keys = {"seed_amounts", "water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "reasoning"}
    missing = required_keys - set(parsed.keys())
    if missing:
        raise ValueError(f"AI response missing keys: {missing}")

    reasoning = parsed.pop("reasoning")

    # Run through manual_setup for validation
    params = {
        "water_l": float(parsed["water_l"]),
        "fertilizer_kg": float(parsed["fertilizer_kg"]),
        "soil_kg": float(parsed["soil_kg"]),
        "floor_space_m2": float(parsed["floor_space_m2"]),
        "mission_days": 450,
        "astronaut_count": 4,
        "seed_amounts": {k: int(v) for k, v in parsed["seed_amounts"].items()},
    }

    state = manual_setup(params)
    state["setup_mode"] = "ai_optimised"
    state["ai_setup_reasoning"] = reasoning

    return state
