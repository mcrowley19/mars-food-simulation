import json
from strands import tool
from state import get_state, update_state, _SESSION_KEY_CTX

VALID_ENV_PARAMS = {"temp_c", "co2_ppm", "humidity_pct", "light_hours"}


def _crop_defaults():
    from setup_modes import CROP_DEFAULTS
    return CROP_DEFAULTS


def _session_key():
    """Always resolve the current session key explicitly."""
    return _SESSION_KEY_CTX.get()


def _get_crop(crop_index):
    """Fetch state and validate crop_index. Returns (state, crops, error_msg)."""
    state = get_state(session_key=_session_key())
    crops = state.get("crops", [])
    if crop_index < 0 or crop_index >= len(crops):
        return state, crops, f"Error: crop_index {crop_index} out of range (0-{len(crops)-1})"
    return state, crops, None


def _get_crops_for_replant(crop_index):
    state = get_state(session_key=_session_key())
    crops = state.get("crops", [])
    if crop_index < 0 or crop_index > len(crops):
        return state, crops, f"Error: crop_index {crop_index} out of range"
    return state, crops, None


@tool
def get_current_state() -> str:
    """Return the full current greenhouse simulation state as a JSON string."""
    return json.dumps(get_state(session_key=_session_key()), default=str)


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
    from setup_modes import estimate_seed_return
    seeds_gained = estimate_seed_return(crop["name"], yield_kg)

    harvested_entry = {
        "name": crop["name"],
        "yield_kg": yield_kg,
        "harvested_on_day": state.get("mission_day", 0),
        "age_at_harvest": crop["age_days"],
        "seeds_gained": seeds_gained,
    }

    if "harvested" not in state:
        state["harvested"] = []
    state["harvested"].append(harvested_entry)
    reserve = state.get("seed_reserve", {})
    reserve[crop["name"]] = reserve.get(crop["name"], 0) + seeds_gained
    state["seed_reserve"] = reserve
    crops.pop(crop_index)
    state["crops"] = crops
    update_state(state, session_key=_session_key())
    return (
        f"Harvested {crop['name']} (index {crop_index}): {yield_kg}kg yield, "
        f"+{seeds_gained} seeds on day {state.get('mission_day', '?')}"
    )


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
    update_state(state, session_key=_session_key())
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
    update_state(state, session_key=_session_key())
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
    update_state(state, session_key=_session_key())
    return f"Updated {crops[crop_index]['name']} nutrients: {old_val} → {new_nutrient_per_day_kg} kg/day"


@tool
def set_environment_param(param: str, value: float) -> str:
    """Adjust a greenhouse environment parameter. Valid params: temp_c, co2_ppm, humidity_pct, light_hours."""
    if param not in VALID_ENV_PARAMS:
        return f"Error: invalid param '{param}'. Valid: {sorted(VALID_ENV_PARAMS)}"
    state = get_state(session_key=_session_key())
    env = state.get("environment", {})
    old_val = env.get(param)
    env[param] = value
    state["environment"] = env
    update_state(state, session_key=_session_key())
    return f"Environment {param}: {old_val} → {value}"


@tool
def add_alert(severity: str, message: str) -> str:
    """Add an alert to the simulation. Severity: info, warning, critical."""
    if severity not in ("info", "warning", "critical"):
        return f"Error: severity must be info, warning, or critical"
    state = get_state(session_key=_session_key())
    alert = {"severity": severity, "message": message, "day": state.get("mission_day", 0)}
    if "alerts" not in state:
        state["alerts"] = []
    state["alerts"].append(alert)
    update_state(state, session_key=_session_key())
    return f"Alert added: [{severity}] {message}"


@tool
def plant_from_reserve(crop_name: str, count: int) -> str:
    """Plant seeds from the seed reserve into active growing slots.
    Use this to stagger plantings over time rather than planting everything at once.
    The seed_reserve tracks available unplanted seeds per crop type."""
    name = crop_name.lower().strip()
    defaults_map = _crop_defaults()
    if name not in defaults_map:
        return f"Error: unknown crop '{name}'. Valid: {sorted(defaults_map.keys())}"
    if count <= 0:
        return "Error: count must be positive"

    state = get_state(session_key=_session_key())
    reserve = state.get("seed_reserve", {})
    available = reserve.get(name, 0)
    if available <= 0:
        return f"Error: no '{name}' seeds in reserve. Reserve: {reserve}"
    actual = min(count, available)

    # Check floor space
    crops = state.get("crops", [])
    floor = state.get("floor_space_m2", 0)
    space_per_plant = 0.25
    if (len(crops) + actual) * space_per_plant > floor:
        max_new = int(floor / space_per_plant) - len(crops)
        if max_new <= 0:
            return f"Error: no floor space available ({len(crops)} plants using {len(crops) * space_per_plant} of {floor} m²)"
        actual = min(actual, max_new)

    defaults = defaults_map[name]
    for _ in range(actual):
        crops.append({
            "name": name,
            "age_days": 0,
            "maturity_days": defaults["maturity_days"],
            "water_per_day_l": defaults["water_per_day_l"],
            "nutrient_per_day_kg": defaults["nutrient_per_day_kg"],
            "status": "growing",
        })
    reserve[name] = available - actual
    if reserve[name] <= 0:
        del reserve[name]
    state["crops"] = crops
    state["seed_reserve"] = reserve
    update_state(state, session_key=_session_key())
    return f"Planted {actual} {name} from reserve (remaining reserve: {reserve})"
