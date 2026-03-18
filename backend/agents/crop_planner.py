from strands import Agent
from tools.mcp_client import get_mars_kb_client

SYSTEM_PROMPT = """You are the Crop Planner for a Martian greenhouse.
Your job: select and schedule crops to maximize nutritional coverage
for 4 astronauts across a 450-day surface mission.
Query the knowledge base for yield, growth cycles, and nutritional data.
Always return structured JSON with: crop_name, planting_date, 
harvest_date, expected_yield_kg, key_nutrients."""

def create_crop_planner():
    with get_mars_kb_client() as mcp:
        tools = mcp.list_tools_sync()
        return Agent(
            system_prompt=SYSTEM_PROMPT,
            tools=tools
        )