"""Orchestrator factory returns a new agent each call (no shared conversation state)."""
from __future__ import annotations

import unittest
from unittest import mock

from agents import orchestrator as orch


class TestOrchestratorFresh(unittest.TestCase):
    def test_get_orchestrator_returns_distinct_instances(self):
        first, second = object(), object()

        with mock.patch.object(orch, "BedrockModel", return_value=mock.MagicMock()):
            with mock.patch.object(
                orch,
                "build_agent",
                side_effect=[first, second],
            ) as factory:
                a = orch.get_orchestrator()
                b = orch.get_orchestrator()

        self.assertIs(a, first)
        self.assertIs(b, second)
        self.assertIsNot(a, b)
        self.assertEqual(factory.call_count, 2)

    def test_lazy_calls_get_agent_each_time(self):
        """_lazy does not cache sub-agents; each call builds a new specialist."""
        with mock.patch.object(orch, "_get_agent", side_effect=[object(), object()]) as get_agent:
            c1 = orch._lazy("crop_planner")
            c2 = orch._lazy("crop_planner")

        self.assertIsNot(c1, c2)
        self.assertEqual(get_agent.call_count, 2)
        get_agent.assert_has_calls(
            [mock.call("crop_planner"), mock.call("crop_planner")],
        )


if __name__ == "__main__":
    unittest.main()
