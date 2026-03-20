"""manual_setup validation and shape checks (no Bedrock)."""
from __future__ import annotations

import unittest

from setup_modes import manual_setup, min_food_supplies_kcal, _extract_json

REQUIRED_TOP_LEVEL = [
    "key",
    "mission_day",
    "crops",
    "environment",
    "resources",
    "harvest_schedule",
    "alerts",
    "active_events",
    "agent_last_actions",
    "water_l",
    "fertilizer_kg",
    "soil_kg",
    "floor_space_m2",
    "mission_days",
    "astronaut_count",
    "seed_amounts",
    "setup_complete",
    "setup_mode",
    "ai_setup_reasoning",
]

_VALID_BASE = {
    "water_l": 5000,
    "fertilizer_kg": 200,
    "soil_kg": 1000,
    "floor_space_m2": 50,
    "mission_days": 450,
    "astronaut_count": 4,
    "seed_amounts": {"lettuce": 20, "radish": 10},
    "food_supplies_kcal": 500_000,
    "fuel_kg": 50_000,
}


class TestManualSetup(unittest.TestCase):
    def test_valid_state_has_required_fields(self):
        state = manual_setup(_VALID_BASE)
        state["setup_mode"] = "manual"
        missing = [f for f in REQUIRED_TOP_LEVEL if f not in state]
        self.assertEqual(missing, [], f"missing keys: {missing}")
        self.assertTrue(state["setup_complete"])

    def test_invalid_seed_type(self):
        with self.assertRaises(ValueError):
            manual_setup({**_VALID_BASE, "seed_amounts": {"banana": 10}})

    def test_negative_water(self):
        with self.assertRaises(ValueError):
            manual_setup({**_VALID_BASE, "water_l": -1})

    def test_insufficient_floor_space(self):
        with self.assertRaises(ValueError):
            manual_setup({**_VALID_BASE, "floor_space_m2": 1})

    def test_min_food_supplies_no_seeds(self):
        k = min_food_supplies_kcal(4, {})
        self.assertEqual(k, 4 * 2500 * 30)


class TestExtractJson(unittest.TestCase):
    def test_plain_object(self):
        text = '{"seed_amounts": {"lettuce": 1}, "water_l": 1, "fertilizer_kg": 1, "soil_kg": 1, "floor_space_m2": 10}'
        obj = _extract_json(text)
        self.assertEqual(obj["water_l"], 1)

    def test_with_markdown_fence(self):
        text = """Here you go:
```json
{"seed_amounts": {"lettuce": 2}, "water_l": 100, "fertilizer_kg": 1, "soil_kg": 1, "floor_space_m2": 20}
```
"""
        obj = _extract_json(text)
        self.assertEqual(obj["water_l"], 100)


if __name__ == "__main__":
    unittest.main()
