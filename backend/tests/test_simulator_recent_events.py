"""recent_events rolling history + active_events (no Bedrock)."""
from __future__ import annotations

import copy
import unittest

from setup_modes import manual_setup, CROP_DEFAULTS, KCAL_PER_KG, SHELF_LIFE_DAYS
from agents.simulator import run_simulation_tick, _kb_params_cache
from state import set_request_session, reset_request_session

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
    "crop_defaults": CROP_DEFAULTS,
    "kcal_per_kg": KCAL_PER_KG,
    "shelf_life_days": SHELF_LIFE_DAYS,
}


def _base_state():
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


class TestSimulatorRecentEvents(unittest.TestCase):
    def setUp(self):
        self._session_token = set_request_session("unit-test-recent")
        _kb_params_cache["unit-test-recent"] = STUB_KB_PARAMS.copy()

    def tearDown(self):
        reset_request_session(self._session_token)
        _kb_params_cache.pop("unit-test-recent", None)

    def test_recent_events_list_exists_after_tick(self):
        s = _base_state()
        self.assertNotIn("recent_events", s)
        nxt = run_simulation_tick(copy.deepcopy(s))
        self.assertIn("recent_events", nxt)
        self.assertIsInstance(nxt["recent_events"], list)

    def test_prunes_entries_older_than_five_sols(self):
        s = _base_state()
        s["mission_day"] = 10
        s["recent_events"] = [
            {"event": "dust_storm", "day": 1},
            {"event": "co2_spike", "day": 6},
        ]
        nxt = run_simulation_tick(copy.deepcopy(s))
        days = {e["day"] for e in nxt["recent_events"]}
        self.assertNotIn(1, days, "sol 1 event should be pruned (10-1 > 5)")
        self.assertIn(6, days, "sol 6 event should remain (10-6 <= 5)")

    def test_dust_storm_recorded_in_active_and_recent(self):
        s = _base_state()
        params = STUB_KB_PARAMS.copy()
        params["dust_storm_prob"] = 1.0
        _kb_params_cache["unit-test-recent"] = params
        nxt = run_simulation_tick(copy.deepcopy(s))
        self.assertIn("dust_storm", nxt["active_events"])
        recent = nxt["recent_events"]
        self.assertTrue(any(e.get("event") == "dust_storm" for e in recent))
        storm = next(e for e in recent if e.get("event") == "dust_storm")
        self.assertEqual(storm["day"], 1)

    def test_fuel_depleted_in_active_and_recent(self):
        s = _base_state()
        s["resources"]["fuel_kg"] = 0
        nxt = run_simulation_tick(copy.deepcopy(s))
        self.assertIn("fuel_depleted", nxt["active_events"])
        self.assertTrue(
            any(e.get("event") == "fuel_depleted" for e in nxt["recent_events"]),
        )
        fd = next(e for e in nxt["recent_events"] if e.get("event") == "fuel_depleted")
        self.assertEqual(fd["day"], 1)


if __name__ == "__main__":
    unittest.main()
