from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.greenhouse_tools import search_mars_kb
from tools.simulation_tools import get_current_state

MODEL = BedrockModel(model_id="amazon.nova-micro-v1:0", region_name="us-east-1")

SYSTEM_PROMPT = """You are the Resource Manager for a Martian greenhouse.
Your #1 job is to ensure water, nutrients, and fuel NEVER run out before the mission ends.

Water is extremely scarce on Mars. Every crop consumes water daily:
- Radish: 0.15 L/day, Lettuce: 0.2 L/day, Kale: 0.25 L/day
- Wheat/Pea/Carrot: 0.3 L/day, Soybean: 0.4 L/day
- Potato: 0.5 L/day, Tomato: 0.6 L/day
Crew uses ~10L/day but 85% is recycled (net 1.5L/day crew draw).

CRITICAL DECISION FRAMEWORK:
1. Call get_current_state to see exact resource levels and crop list.
2. Calculate: water_days = water_l / (sum of all crop water/day + 1.5).
3. Compare water_days to mission days remaining.
4. If water_days < mission_days_remaining: RECOMMEND REMOVING CROPS.
   Prioritize removing the highest water consumers first (tomato, potato, soybean).
5. If water_days > mission_days_remaining × 1.5: resources are healthy,
   can recommend planting more if seed reserve exists.

Fuel powers grow lights (0.3 kW/m² × light_hours) and life support (3 kW × 24h).
If fuel is low, recommend reducing light_hours.

Always return structured JSON:
{
  "resource_type": str,
  "current_level": float,
  "unit": str,
  "consumption_rate": float,
  "days_remaining": float,
  "status": "nominal" | "low" | "critical",
  "recommended_action": str
}"""


def create_resource_manager():
    return Agent(
        system_prompt=SYSTEM_PROMPT,
        model=MODEL,
        max_iterations=5,
        tools=[search_mars_kb, get_current_state],
    )
