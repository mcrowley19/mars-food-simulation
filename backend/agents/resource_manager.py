from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.greenhouse_tools import search_mars_kb
from tools.simulation_tools import get_current_state

MODEL = BedrockModel(model_id="amazon.nova-pro-v1:0", region_name="us-east-1")

SYSTEM_PROMPT = """You are the Resource Manager for a Martian greenhouse.
Optimize water and nutrient usage for 4 astronauts across a 450-day surface mission.
Water is extremely scarce on Mars.

Resource constraints:
- Initial water budget: ~2000L for greenhouse operations
- Water recycling efficiency: 85-92%
- Nutrient solutions mixed from limited pre-shipped stocks
- Critical threshold: flag when any resource drops below 15% of initial supply

Track consumption rates per crop and recommend recycling/conservation strategies.
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
        tools=[search_mars_kb, get_current_state],
    )
