import json
import re
from agents.crop_planner import create_crop_planner

VALID_SEEDS = {"potato", "wheat", "lettuce", "tomato", "soybean", "spinach", "radish", "pea", "kale", "carrot"}
SPACE_PER_PLANT_M2 = 0.25

# ---------------------------------------------------------------------------
# Hardcoded fallback tables — used when the KB is unreachable
# ---------------------------------------------------------------------------

CROP_DEFAULTS = {
    "potato":  {"maturity_days": 90,  "water_per_day_l": 0.5, "nutrient_per_day_kg": 0.02},
    "wheat":   {"maturity_days": 120, "water_per_day_l": 0.3, "nutrient_per_day_kg": 0.015},
    "lettuce": {"maturity_days": 30,  "water_per_day_l": 0.2, "nutrient_per_day_kg": 0.01},
    "tomato":  {"maturity_days": 70,  "water_per_day_l": 0.6, "nutrient_per_day_kg": 0.025},
    "soybean": {"maturity_days": 80,  "water_per_day_l": 0.4, "nutrient_per_day_kg": 0.02},
    "spinach": {"maturity_days": 40,  "water_per_day_l": 0.22,"nutrient_per_day_kg": 0.011},
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
    "spinach": 230,
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
    "spinach": 7,
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
    "spinach": 170,
    "radish": 140,
    "pea": 110,
    "kale": 160,
    "carrot": 180,
}

# ---------------------------------------------------------------------------
# KB-enriched crop tables — fetched once at first use, cached in-process
# ---------------------------------------------------------------------------

_kb_crop_cache: dict | None = None


def _get_kb_crop_tables() -> tuple[dict, dict, dict]:
    """
    Return (crop_defaults, kcal_per_kg, shelf_life_days) enriched from the KB.
    Falls back to the hardcoded tables if the KB is unreachable or parsing fails.
    Result is cached in-process so it is only fetched once per server lifetime.
    """
    global _kb_crop_cache
    if _kb_crop_cache is not None:
        return _kb_crop_cache["crop_defaults"], _kb_crop_cache["kcal_per_kg"], _kb_crop_cache["shelf_life_days"]

    crop_defaults  = {}
    kcal_per_kg    = {}
    shelf_life_days = {}

    for crop in VALID_SEEDS:
        try:
            from tools.greenhouse_tools import search_mars_kb
            raw = search_mars_kb(
                f"{crop} maturity days water requirements calories per kg shelf life"
            )
            maturity = _kb_extract(raw, "maturity", 5,   365,  CROP_DEFAULTS[crop]["maturity_days"])
            water    = _kb_extract(raw, "water",    0.05, 5.0,  CROP_DEFAULTS[crop]["water_per_day_l"])
            kcal     = _kb_extract(raw, "kcal",     50,   5000, KCAL_PER_KG[crop])
            shelf    = _kb_extract(raw, "shelf",    1,    365,  SHELF_LIFE_DAYS[crop])
            crop_defaults[crop]  = {
                "maturity_days":       int(maturity),
                "water_per_day_l":     round(float(water), 3),
                "nutrient_per_day_kg": CROP_DEFAULTS[crop]["nutrient_per_day_kg"],
            }
            kcal_per_kg[crop]    = int(kcal)
            shelf_life_days[crop] = int(shelf)
        except Exception:
            crop_defaults[crop]  = CROP_DEFAULTS[crop]
            kcal_per_kg[crop]    = KCAL_PER_KG[crop]
            shelf_life_days[crop] = SHELF_LIFE_DAYS[crop]

    _kb_crop_cache = {
        "crop_defaults":   crop_defaults,
        "kcal_per_kg":     kcal_per_kg,
        "shelf_life_days": shelf_life_days,
    }
    return crop_defaults, kcal_per_kg, shelf_life_days


def _kb_extract(text: str, field: str, lo_bound: float, hi_bound: float, default: float) -> float:
    """Pull a single plausible number for a crop field out of KB response text."""
    keywords = {
        "maturity": ["days to maturity", "maturity", "days"],
        "water":    ["water", "L/day", "litres", "liters"],
        "kcal":     ["kcal", "calories", "kcal/kg", "energy"],
        "shelf":    ["shelf life", "shelf", "storage", "days"],
    }
    raw = text if isinstance(text, str) else json.dumps(text)
    for anchor in keywords.get(field, [field]):
        idx = raw.lower().find(anchor.lower())
        if idx == -1:
            continue
        window = raw[max(0, idx - 30): idx + 120]
        for n in re.findall(r"\b(\d+(?:\.\d+)?)\b", window):
            val = float(n)
            if lo_bound <= val <= hi_bound:
                return val
    return default


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
    kb_defaults, _, _ = _get_kb_crop_tables()
    if not seed_amounts:
        return astronaut_count * CREW_KCAL_PER_DAY * 30
    fastest_maturity = min(
        kb_defaults[s]["maturity_days"]
        for s in seed_amounts
        if s in kb_defaults
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
        "calories_consumed_today": 0,
        "calorie_deficit_today": 0,
        "setup_complete": False,
        "agents_initialised": False,
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
    kb_defaults, _, _ = _get_kb_crop_tables()
    crops = []
    reserve = {}
    for seed_type, count in seed_amounts.items():
        initial = max(1, _math.ceil(count * 2 / 3))
        to_reserve = count - initial
        defaults = kb_defaults.get(seed_type, CROP_DEFAULTS.get(seed_type, {}))
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
    from strands import Agent
    from strands.models.bedrock import BedrockModel
    # Use a no-tools agent for setup — all crop data is embedded in the prompt,
    # so there is no need to query the KB. This avoids the agent looping through
    # repeated KB/validation calls and timing out.
    agent = Agent(
        model=BedrockModel(model_id="amazon.nova-micro-v1:0", region_name="us-east-1"),
        tools=[],
    )

    crew_kcal_day = astronaut_count * CREW_KCAL_PER_DAY
    min_food_kcal = crew_kcal_day * 120  # survive until crops ramp up
    safe_food_kcal = int(min_food_kcal * 1.25)

    prompt = f"""You are planning a Mars greenhouse mission for {astronaut_count} astronauts over {mission_days} days.
All crop data you need is provided below. Do NOT use any tools. Respond with ONLY the JSON object.

HARD CONSTRAINT: The total weight of ALL supplies (water_l + fertilizer_kg + soil_kg + fuel_kg + food weight + seeds) must not exceed {max_cargo_kg} kg.
Food weight in kg = food_supplies_kcal / 1500 (packed food is ~1.5 kcal per gram).
Seeds weigh roughly 0.05 kg each. Keep this cargo limit in mind when choosing quantities.

The ONLY valid seed types are: potato, wheat, lettuce, tomato, soybean, spinach, radish, pea, kale, carrot

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

PRIORITY ORDER (allocate cargo in this order — water first):
1. WATER (highest priority — without water everyone dies within days):
    Each crop consumes water daily: radish 0.15L, lettuce 0.2L, spinach 0.22L, kale 0.25L, wheat/pea/carrot 0.3L, soybean 0.4L, potato 0.5L, tomato 0.6L.
   Crew uses 10L/day each but 85% is recycled (net {round(astronaut_count * 10 * 0.15, 1)}L/day crew draw for {astronaut_count} astronauts).
   Crops are replanted continuously so water draw is sustained the whole mission.
   Calculate minimum water: (sum(crop_water_per_day × count) + {round(astronaut_count * 10 * 0.15, 1)}) × {mission_days} × 1.25.
   This is the MINIMUM water_l. If cargo is tight, reduce food or seeds first — NEVER cut water.

2. FUEL (second priority — no fuel means no lights, crops die):
   Grow lights use 0.3 kW/m² running ~12h/day. Life support uses 3 kW constant (24h).
   Generator yields 3.5 kWh/kg fuel. Calculate: daily_kwh = (0.3 × floor_space_m2 × 12) + (3.0 × 24).
   fuel_kg = ceil((daily_kwh × {mission_days}) / 3.5 × 1.15). Never reduce below this.

3. FOOD SUPPLIES (third priority):
   {astronaut_count} astronauts consume {crew_kcal_day} kcal/day. Bring at least {safe_food_kcal} kcal.
   Food rots (lettuce 7d, wheat 180d). If cargo is tight, reduce food before water.

4. SEEDS & FLOOR SPACE (lowest priority — fit within remaining cargo):
   Prioritize low-water crops: wheat (0.3L/day, 3390 kcal/kg), kale (0.25L/day), radish (0.15L/day, fast 25d).
   Avoid water-hungry crops if cargo is tight: tomato (0.6L/day), potato (0.5L/day).
   floor_space_m2 must be ≥ total_plants × 0.25. More floor space = more fuel needed.

Rules:
- seed_amounts must only contain seeds from the valid list above
- All numeric values must be greater than 0
- TOTAL CARGO MUST NOT EXCEED {max_cargo_kg} kg. Add up: water_l (1 kg/L) + fertilizer_kg + soil_kg + fuel_kg + (food_supplies_kcal / 1500) + (total_seeds × 0.05). If it exceeds {max_cargo_kg}, cut food_supplies_kcal first, then seeds. NEVER reduce water_l or fuel_kg below their calculated minimums.
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

    # Auto-correct all values so the AI's plan never fails validation
    import math as _math
    kb_defaults, _, _ = _get_kb_crop_tables()

    # Water: must cover all crop draw + crew net draw for the full mission.
    # Crops are replanted so peak draw ≈ initial planting draw sustained throughout.
    crop_water_day = sum(
        kb_defaults.get(k, CROP_DEFAULTS.get(k, {})).get("water_per_day_l", 0.3) * v
        for k, v in valid_seeds.items()
    )
    crew_water_net = astronaut_count * 10 * (1 - 0.85)  # 85% recycling per astronaut
    min_water = _math.ceil((crop_water_day + crew_water_net) * mission_days * 1.25)
    water_l = max(float(parsed["water_l"]), min_water)

    total_plants = sum(valid_seeds.values())
    min_floor = total_plants * SPACE_PER_PLANT_M2
    floor_space = max(float(parsed["floor_space_m2"]), min_floor)

    daily_kwh = GROW_LIGHT_KW_PER_M2 * floor_space * 12 + LIFE_SUPPORT_KW * 24
    min_fuel = _math.ceil((daily_kwh * mission_days) / KWH_PER_KG_FUEL)
    fuel_kg = max(float(parsed["fuel_kg"]), min_fuel)

    min_kcal = min_food_supplies_kcal(astronaut_count, valid_seeds)
    food_kcal = max(float(parsed["food_supplies_kcal"]), min_kcal)

    # Run through manual_setup for validation
    params = {
        "water_l": water_l,
        "fertilizer_kg": float(parsed["fertilizer_kg"]),
        "soil_kg": float(parsed["soil_kg"]),
        "floor_space_m2": floor_space,
        "food_supplies_kcal": food_kcal,
        "fuel_kg": fuel_kg,
        "mission_days": mission_days,
        "astronaut_count": astronaut_count,
        "seed_amounts": valid_seeds,
    }

    state = manual_setup(params)
    state["setup_mode"] = "ai_optimised"
    state["ai_setup_reasoning"] = reasoning

    return state
