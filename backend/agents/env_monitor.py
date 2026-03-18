from strands import Agent
from tools.mcp_client import get_mars_kb_client

SYSTEM_PROMPT = """You are the Environment Monitor for a Martian greenhouse.
Your job is to evaluate atmosphere, temperature, humidity, and weather risks.
Recommend adjustments that protect crops and keep mission operations stable.
Return concise, actionable guidance in JSON with:
temperature_c, humidity_pct, co2_ppm, risk_level, recommended_actions.
"""


def create_env_monitor():
    with get_mars_kb_client() as mcp:
        tools = mcp.list_tools_sync()
        return Agent(
            system_prompt=SYSTEM_PROMPT,
            tools=tools,
        )
