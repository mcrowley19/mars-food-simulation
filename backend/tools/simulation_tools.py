import json
from strands import tool
from state import get_state, update_state

VALID_ENV_PARAMS = {"temp_c", "co2_ppm", "humidity_pct", "light_hours"}


def _crop_defaults():
    from setup_modes import CROP_DEFAULTS
    return CROP_DEFAULTS


def _get_crop(crop_index):
    """Fetch state and validate crop_index. Returns (state, crops, error_msg)."""
    state = get_state()
    crops = state.get("crops", [])
    if crop_index < 0 or crop_index >= len(crops):
        return state, crops, f"Error: crop_index {crop_index} out of range (0-{len(crops)-1})"
    return state, crops, None


def _get_crops_for_replant(crop_index):
    state = get_state()
    crops = state.get("crops", [])
    if crop_index < 0 or crop_index > len(crops):
        return state, crops, f"Error: crop_index {crop_index} out of range"
    return state, crops, None


@tool
def get_current_state() -> str:
    """Return the full current greenhouse simulation state as a JSON string."""
    return json.dumps(get_state(), default=str)


@tool
def harvest_crop(crop_index: int) -> str:
    """Harvest a specific crop by its index in the crops array.
    Removes the crop, adds yield to the harvested tracking array."""
    state, crops, err = _get_crop(crop_index)
    if err:
        return err
    crop = crops[crop_index]
    if crop["status"] not in ("ready_to_harvest", "growing"):
        return f"Error: crop '{crop['name']}' has status '{crop['status']}' and cannot be harvested"

    progress = crop["age_days"] / crop["maturity_days"] if crop["maturity_days"] > 0 else 0
    base_yield_kg = {"potato": 0.3, "wheat": 0.15, "lettuce": 0.25, "tomato": 0.2,
                     "soybean": 0.12, "radish": 0.1, "pea": 0.08, "kale": 0.2, "carrot": 0.15}
    yield_kg = round(base_yield_kg.get(crop["name"], 0.1) * min(progress, 1.0), 3)

    harvested_entry = {
        "name": crop["name"],
        "yield_kg": yield_kg,
        "harvested_on_day": state.get("mission_day", 0),
        "age_at_harvest": crop["age_days"],
    }

    if "harvested" not in state:
        state["harvested"] = []
    state["harvested"].append(harvested_entry)
    crops.pop(crop_index)
    state["crops"] = crops
    update_state(state)
    return f"Harvested {crop['name']} (index {crop_index}): {yield_kg}kg yield on day {state.get('mission_day', '?')}"


@tool
def replant_crop(crop_index: int, new_crop_name: str) -> str:
    """Replace a crop slot with a new seedling. Use after harvesting or for dead crops."""
    name = new_crop_name.lower().strip()
    defaults_map = _crop_defaults()
    if name not in defaults_map:
        return f"Error: unknown crop '{name}'. Valid: {sorted(defaults_map.keys())}"
    state, crops, err = _get_crops_for_replant(crop_index)
    if err:
        return err
    defaults = defaults_map[name]
    new_crop = {
        "name": name,
        "age_days": 0,
        "maturity_days": defaults["maturity_days"],
        "water_per_day_l": defaults["water_per_day_l"],
        "nutrient_per_day_kg": defaults["nutrient_per_day_kg"],
        "status": "growing",
    }
    if crop_index == len(crops):
        crops.append(new_crop)
    else:
        crops[crop_index] = new_crop
    state["crops"] = crops
    update_state(state)
    return f"Planted {name} at index {crop_index} (matures in {defaults['maturity_days']} days)"


@tool
def adjust_water_allocation(crop_index: int, new_water_per_day_l: float) -> str:
    """Change a crop's daily water consumption rate."""
    if new_water_per_day_l < 0:
        return "Error: water allocation cannot be negative"
    state, crops, err = _get_crop(crop_index)
    if err:
        return err
    old_val = crops[crop_index]["water_per_day_l"]
    crops[crop_index]["water_per_day_l"] = new_water_per_day_l
    state["crops"] = crops
    update_state(state)
    return f"Updated {crops[crop_index]['name']} water: {old_val} → {new_water_per_day_l} L/day"


@tool
def adjust_nutrient_allocation(crop_index: int, new_nutrient_per_day_kg: float) -> str:
    """Change a crop's daily nutrient consumption rate."""
    if new_nutrient_per_day_kg < 0:
        return "Error: nutrient allocation cannot be negative"
    state, crops, err = _get_crop(crop_index)
    if err:
        return err
    old_val = crops[crop_index]["nutrient_per_day_kg"]
    crops[crop_index]["nutrient_per_day_kg"] = new_nutrient_per_day_kg
    state["crops"] = crops
    update_state(state)
    return f"Updated {crops[crop_index]['name']} nutrients: {old_val} → {new_nutrient_per_day_kg} kg/day"


@tool
def set_environment_param(param: str, value: float) -> str:
    """Adjust a greenhouse environment parameter. Valid params: temp_c, co2_ppm, humidity_pct, light_hours."""
    if param not in VALID_ENV_PARAMS:
        return f"Error: invalid param '{param}'. Valid: {sorted(VALID_ENV_PARAMS)}"
    state = get_state()
    env = state.get("environment", {})
    old_val = env.get(param)
    env[param] = value
    state["environment"] = env
    update_state(state)
    return f"Environment {param}: {old_val} → {value}"


@tool
def add_alert(severity: str, message: str) -> str:
    """Add an alert to the simulation. Severity: info, warning, critical."""
    if severity not in ("info", "warning", "critical"):
        return f"Error: severity must be info, warning, or critical"
    state = get_state()
    alert = {"severity": severity, "message": message, "day": state.get("mission_day", 0)}
    if "alerts" not in state:
        state["alerts"] = []
    state["alerts"].append(alert)
    update_state(state)
    return f"Alert added: [{severity}] {message}"
