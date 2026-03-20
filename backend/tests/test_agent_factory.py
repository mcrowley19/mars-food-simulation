"""build_agent only forwards kwargs accepted by strands.Agent."""
from __future__ import annotations

import inspect
import unittest
from unittest import mock

import agents.agent_factory as agent_factory


class TestAgentFactory(unittest.TestCase):
    def test_filters_kwargs_using_signature(self):
        """Use a fixed signature so the test does not depend on MagicMock accepting **kwargs."""
        sig = inspect.Signature(
            [
                inspect.Parameter("model", inspect.Parameter.KEYWORD_ONLY),
                inspect.Parameter("max_iterations", inspect.Parameter.KEYWORD_ONLY),
            ]
        )
        with mock.patch.object(agent_factory.inspect, "signature", return_value=sig):
            with mock.patch.object(agent_factory, "Agent") as AgentCls:
                AgentCls.return_value = mock.sentinel.instance
                agent_factory.build_agent(
                    model=mock.sentinel.m,
                    max_iterations=7,
                    not_a_real_strands_arg="drop_me",
                )
                kwargs = AgentCls.call_args.kwargs
                self.assertEqual(kwargs, {"model": mock.sentinel.m, "max_iterations": 7})


if __name__ == "__main__":
    unittest.main()
