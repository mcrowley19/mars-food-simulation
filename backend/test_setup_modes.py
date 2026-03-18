import json
from setup_modes import manual_setup, ai_optimised_setup

REQUIRED_FIELDS = [
    "key", "mission_day", "crops", "environment", "resources",
    "harvest_schedule", "alerts", "active_events", "agent_last_actions",
    "water_l", "fertilizer_kg", "soil_kg", "floor_space_m2",
    "mission_days", "astronaut_count", "seed_amounts",
    "setup_complete", "setup_mode", "ai_setup_reasoning",
]


def validate_state(state: dict, label: str):
    missing = [f for f in REQUIRED_FIELDS if f not in state]
    if missing:
        print(f"  FAIL — missing fields: {missing}")
        return False
    if not state["setup_complete"]:
        print(f"  FAIL — setup_complete is False")
        return False
    print(f"  PASS — all {len(REQUIRED_FIELDS)} required fields present, setup_complete=True")
    return True


print("=" * 60)
print("TEST 1: manual_setup")
print("=" * 60)

manual_params = {
    "water_l": 5000,
    "fertilizer_kg": 200,
    "soil_kg": 1000,
    "floor_space_m2": 50,
    "mission_days": 450,
    "astronaut_count": 4,
    "seed_amounts": {
        "lettuce": 40,
        "potato": 30,
        "kale": 20,
        "tomato": 15,
        "radish": 25,
        "soybean": 20,
    },
}

state = manual_setup(manual_params)
state["setup_mode"] = "manual"
print(json.dumps(state, indent=2, default=str))
print()
validate_state(state, "manual_setup")

# Test validation: invalid seed type
print("\nValidation test — invalid seed type:")
try:
    manual_setup({**manual_params, "seed_amounts": {"banana": 10}})
    print("  FAIL — should have raised ValueError")
except ValueError as e:
    print(f"  PASS — caught: {e}")

# Test validation: negative value
print("\nValidation test — negative water_l:")
try:
    manual_setup({**manual_params, "water_l": -100})
    print("  FAIL — should have raised ValueError")
except ValueError as e:
    print(f"  PASS — caught: {e}")

# Test validation: not enough floor space
print("\nValidation test — insufficient floor space:")
try:
    manual_setup({**manual_params, "floor_space_m2": 1})
    print("  FAIL — should have raised ValueError")
except ValueError as e:
    print(f"  PASS — caught: {e}")

print()
print("=" * 60)
print("TEST 2: ai_optimised_setup")
print("=" * 60)

ai_state = ai_optimised_setup()
print(json.dumps(ai_state, indent=2, default=str))
print()
print(f"AI reasoning: {ai_state.get('ai_setup_reasoning', 'MISSING')}")
print()
validate_state(ai_state, "ai_optimised_setup")
