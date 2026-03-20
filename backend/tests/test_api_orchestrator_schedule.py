"""Keep orchestrator throttling logic aligned with api.py."""
from __future__ import annotations

import unittest


def _should_invoke_orchestrator(mission_day: int, interval: int) -> bool:
    """Mirror of api.simulate_tick scheduling (mission_day is post-tick)."""
    return interval <= 1 or mission_day % interval == 0


class TestOrchestratorSchedule(unittest.TestCase):
    def test_module_interval_is_one(self):
        import api

        self.assertEqual(api._ORCHESTRATOR_MISSION_DAY_INTERVAL, 1)

    def test_pattern_for_module_interval(self):
        import api

        n = api._ORCHESTRATOR_MISSION_DAY_INTERVAL
        self.assertEqual(n, 1)
        for day in range(1, 20):
            self.assertTrue(
                _should_invoke_orchestrator(day, n),
                f"expected orchestrator on mission day {day}",
            )

    def test_interval_one_always_invokes(self):
        for day in range(1, 15):
            self.assertTrue(_should_invoke_orchestrator(day, 1))


if __name__ == "__main__":
    unittest.main()
