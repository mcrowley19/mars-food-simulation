from strands import Agent
from tools.mcp_client import get_mars_kb_client

SYSTEM_PROMPT = """You are the Resource Manager for a Martian greenhouse.
Your job is to optimize water, nutrient, and substrate usage while sustaining yield.
Produce resource allocation plans and conservation recommendations.
Return structured JSON with:
water_liters_per_day, nutrient_mix, substrate_usage_kg, bottlenecks, recommendations.
"""


def create_resource_manager():
    with get_mars_kb_client() as mcp:
        tools = mcp.list_tools_sync()
        return Agent(
            system_prompt=SYSTEM_PROMPT,
            tools=tools,
        )
