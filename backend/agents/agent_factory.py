"""Construct strands Agent with only kwargs supported by the installed library."""
from __future__ import annotations

import inspect

from strands import Agent


def build_agent(**kwargs):
    params = inspect.signature(Agent.__init__).parameters
    safe = {k: v for k, v in kwargs.items() if k in params}
    return Agent(**safe)
