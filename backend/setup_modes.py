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

# --- Energy model ---
# Grow lights consume ~0.3 kW per m² of growing area at full intensity.
# They run for light_hours per day (default ~12-16h).
GROW_LIGHT_KW_PER_M2 = 0.3
# Life support baseline: heating, air recycling, water pumps, comms.
LIFE_SUPPORT_KW = 3.0  # constant draw
# Fuel consumption: methane/LOX generator yields ~3.5 kWh per kg of fuel.
KWH_PER_KG_FUEL = 3.5

# Shelf life in days after harvest before food rots and loses all caloric value
SHELF_LIFE_DAYS = {
    "potato": 60,
    "wheat": 180,
    "lettuce": 7,
    "tomato": 14,
    "soybean": 120,
    "radish": 14,
    "pea": 5,
    "kale": 10,
    "carrot": 30,
}


SEED_RETURN_PER_KG = {
    # Approximate viable-seed return rates by crop for simulation pacing.
    "potato": 12,
    "wheat": 120,
    "lettuce": 90,
    "tomato": 220,
    "soybean": 95,
    "radish": 140,
    "pea": 110,
    "kale": 160,
    "carrot": 180,
}


def estimate_seed_return(crop_name: str, yield_kg: float) -> int:
    """
    Estimate how many viable seeds are produced from a harvested crop yield.
    Returns an integer count suitable for seed_reserve accounting.
    """
    name = str(crop_name or "").lower().strip()
    kg = max(0.0, float(yield_kg or 0.0))
    if kg <= 0:
        return 0
    rate = SEED_RETURN_PER_KG.get(name, 60)
    # Ensure non-zero harvests still contribute at least one seed.
    return max(1, int(round(kg * rate)))


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
        "seed_reserve": {},
        "food_supplies_kcal": 0,
        "fuel_kg": 0,
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
    fuel_kg = params.get("fuel_kg", 0)

    # Validate no negative numbers
    for field in ["water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "mission_days", "astronaut_count"]:
        if params[field] < 0:
            raise ValueError(f"{field} cannot be negative")

    if food_supplies_kcal < 0:
        raise ValueError("food_supplies_kcal cannot be negative")
    if fuel_kg < 0:
        raise ValueError("fuel_kg cannot be negative")

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

    # Validate fuel covers mission energy needs
    import math as _math
    light_area = floor_space_m2  # grow lights cover the entire floor
    daily_light_kwh = GROW_LIGHT_KW_PER_M2 * light_area * 12  # ~12h avg light
    daily_life_support_kwh = LIFE_SUPPORT_KW * 24
    daily_kwh = daily_light_kwh + daily_life_support_kwh
    min_fuel = _math.ceil((daily_kwh * mission_days) / KWH_PER_KG_FUEL)
    if fuel_kg < min_fuel:
        raise ValueError(
            f"Not enough fuel: {daily_kwh:.0f} kWh/day × {mission_days} days "
            f"requires at least {min_fuel:,} kg of fuel. Provided: {fuel_kg:,} kg"
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
    state["fuel_kg"] = fuel_kg
    state["calories_available"] = float(food_supplies_kcal)
    state["calories_needed_per_day"] = astronaut_count * CREW_KCAL_PER_DAY
    state["resources"]["water_l"] = water_l
    state["resources"]["nutrients_kg"] = fertilizer_kg
    state["resources"]["fuel_kg"] = fuel_kg
    state["setup_complete"] = True

    # Plant an initial batch (2/3 of seeds) and reserve the rest for staggered planting
    import math as _math
    crops = []
    reserve = {}
    for seed_type, count in seed_amounts.items():
        initial = max(1, _math.ceil(count * 2 / 3))
        to_reserve = count - initial
        defaults = CROP_DEFAULTS.get(seed_type, {})
        for _ in range(initial):
            crops.append({
                "name": seed_type,
                "age_days": 0,
                "maturity_days": defaults.get("maturity_days", 60),
                "water_per_day_l": defaults.get("water_per_day_l", 0.3),
                "nutrient_per_day_kg": defaults.get("nutrient_per_day_kg", 0.015),
                "status": "growing",
            })
        if to_reserve > 0:
            reserve[seed_type] = to_reserve
    state["crops"] = crops
    state["seed_reserve"] = reserve

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


def ai_optimised_setup(astronaut_count: int = 4, mission_days: int = 450, max_cargo_kg: float = 50000) -> dict:
    agent = create_crop_planner()

    crew_kcal_day = astronaut_count * CREW_KCAL_PER_DAY
    min_food_kcal = crew_kcal_day * 120  # survive until crops ramp up
    safe_food_kcal = int(min_food_kcal * 1.25)

    prompt = f"""You are planning a Mars greenhouse mission for {astronaut_count} astronauts over {mission_days} days.
Query the knowledge base for crop data, then determine the optimal setup.

HARD CONSTRAINT: The total weight of ALL supplies (water_l + fertilizer_kg + soil_kg + fuel_kg + food weight + seeds) must not exceed {max_cargo_kg} kg.
Food weight in kg = food_supplies_kcal / 1500 (packed food is ~1.5 kcal per gram).
Seeds weigh roughly 0.05 kg each. Keep this cargo limit in mind when choosing quantities.

The ONLY valid seed types are: potato, wheat, lettuce, tomato, soybean, radish, pea, kale, carrot

You must return ONLY a JSON object (no markdown, no explanation outside the JSON) in this exact shape:
{{
  "seed_amounts": {{"lettuce": 40, "potato": 20, ...}},
  "water_l": 5000,
  "fertilizer_kg": 200,
  "soil_kg": 1000,
  "floor_space_m2": 50,
  "food_supplies_kcal": {safe_food_kcal},
  "fuel_kg": 35000,
  "reasoning": "explanation of choices"
}}

Rules:
- seed_amounts must only contain seeds from the valid list above
- All numeric values must be greater than 0
- floor_space_m2 must be enough for all plants (0.25 m² per plant)
- water_l, fertilizer_kg, soil_kg must be enough for the full {mission_days}-day mission
- food_supplies_kcal is pre-packed food (kcal). {astronaut_count} astronauts consume {crew_kcal_day} kcal/day total. Crops take 25-120 days to mature and early harvests are small. Food rots (shelf life varies: lettuce 7d, wheat 180d). Bring at least {safe_food_kcal} kcal. If the crew runs out of calories they die.
- Optimize for nutritional completeness for {astronaut_count} astronauts
- Bring LOTS of seeds (100+ total). Prioritize calorie-dense crops with long shelf life: wheat (3390 kcal/kg, 180d shelf), soybean (1470 kcal/kg, 120d shelf), potato (770 kcal/kg, 60d shelf). Include some fast-growing crops (radish 25d, lettuce 30d) for early harvests.
- fuel_kg is generator fuel. Grow lights use 0.3 kW/m² running ~12h/day. Life support uses 3 kW constant (24h). Generator yields 3.5 kWh/kg fuel. Calculate: daily_kwh = (0.3 × floor_space_m2 × 12) + (3.0 × 24). fuel_kg = ceil((daily_kwh × {mission_days}) / 3.5 × 1.15). Fuel is HEAVY — balance floor space against fuel cost.
- TOTAL CARGO MUST NOT EXCEED {max_cargo_kg} kg. Add up: water_l (1 kg/L) + fertilizer_kg + soil_kg + fuel_kg + (food_supplies_kcal / 1500) + (total_seeds × 0.05). If it exceeds {max_cargo_kg}, reduce quantities.
- Do NOT wrap the JSON in markdown code fences"""

    result = str(agent(prompt))
    print(f"[AI Setup] Raw agent response (first 1000 chars): {result[:1000]}")

    parsed = _extract_json(result)

    required_keys = {"seed_amounts", "water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "food_supplies_kcal", "fuel_kg"}
    missing = required_keys - set(parsed.keys())
    if missing:
        raise ValueError(f"AI response missing keys: {missing}")

    reasoning = parsed.get("reasoning", "No reasoning provided.")
    if "reasoning" in parsed:
        parsed.pop("reasoning")

    # Validate that numeric fields are non-zero
    for field in ["water_l", "fertilizer_kg", "soil_kg", "floor_space_m2", "food_supplies_kcal", "fuel_kg"]:
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
        "fuel_kg": float(parsed["fuel_kg"]),
        "mission_days": mission_days,
        "astronaut_count": astronaut_count,
        "seed_amounts": valid_seeds,
    }

    state = manual_setup(params)
    state["setup_mode"] = "ai_optimised"
    state["ai_setup_reasoning"] = reasoning

    return state
