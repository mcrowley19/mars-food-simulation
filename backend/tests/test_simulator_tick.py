"""Simulation tick invariants (no DynamoDB / Bedrock)."""
from __future__ import annotations

import copy
import unittest

from setup_modes import manual_setup
from agents.simulator import run_simulation_tick, _kb_params_cache
from state import set_request_session, reset_request_session

# Deterministic params — random events disabled for stable assertions.
STUB_KB_PARAMS = {
    "crew_kcal_per_day": 2500,
    "crew_water_l_per_day": 9.0,
    "urine_recovery": 0.85,
    "opt_temp": (18.0, 26.0),
    "opt_co2": (800, 1200),
    "opt_humidity": (50, 70),
    "opt_light_hours": (12, 16),
    "opt_light_int": 0.9,
    "dust_storm_prob": 0.0,
    "water_fault_prob": 0.0,
    "co2_spike_prob": 0.0,
}


def _small_valid_manual_state():
    return manual_setup(
        {
            "water_l": 5000,
            "fertilizer_kg": 200,
            "soil_kg": 1000,
            "floor_space_m2": 50,
            "mission_days": 450,
            "astronaut_count": 4,
            "seed_amounts": {"lettuce": 10},
            "food_supplies_kcal": 500_000,
            "fuel_kg": 50_000,
        }
    )


class TestSimulatorTick(unittest.TestCase):
    def setUp(self):
        self._session_token = set_request_session("unit-test-sim")
        _kb_params_cache["unit-test-sim"] = STUB_KB_PARAMS.copy()

    def tearDown(self):
        reset_request_session(self._session_token)
        _kb_params_cache.pop("unit-test-sim", None)

    def test_mission_day_increments_by_one(self):
        s = _small_valid_manual_state()
        self.assertEqual(s["mission_day"], 1)
        nxt = run_simulation_tick(copy.deepcopy(s))
        self.assertEqual(nxt["mission_day"], 2)

    def test_ten_ticks_mission_day_is_eleven(self):
        s = _small_valid_manual_state()
        for _ in range(10):
            s = run_simulation_tick(copy.deepcopy(s))
        self.assertEqual(s["mission_day"], 11)

    def test_requires_setup_complete(self):
        s = _small_valid_manual_state()
        s["setup_complete"] = False
        with self.assertRaises(ValueError):
            run_simulation_tick(s)

    def test_resources_keys_present_after_tick(self):
        s = _small_valid_manual_state()
        nxt = run_simulation_tick(copy.deepcopy(s))
        self.assertIn("water_l", nxt["resources"])
        self.assertIn("nutrients_kg", nxt["resources"])
        self.assertIn("fuel_kg", nxt["resources"])

    def test_crops_have_health_fields_after_tick(self):
        s = _small_valid_manual_state()
        self.assertTrue(len(s["crops"]) > 0)
        nxt = run_simulation_tick(copy.deepcopy(s))
        for c in nxt["crops"]:
            self.assertIn("health", c)
            self.assertIn("age_days", c)
            self.assertGreaterEqual(c["age_days"], 1)


if __name__ == "__main__":
    unittest.main()
