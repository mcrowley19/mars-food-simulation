from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.greenhouse_tools import search_mars_kb
from tools.simulation_tools import get_current_state

MODEL = BedrockModel(model_id="amazon.nova-micro-v1:0", region_name="us-east-1")

SYSTEM_PROMPT = """You are the Environment Monitor for a Martian greenhouse.
Monitor and recommend adjustments for temperature, CO2, humidity, and lighting
for 4 astronauts across a 450-day surface mission.

Mars-specific conditions to account for:
- 24.6-hour sol (affects lighting schedules)
- ~0.38g gravity (affects water flow and plant growth)
- High radiation outside (shielding integrity matters)
- Thin CO2-rich atmosphere (useful for supplemental CO2 but toxic at high levels)

Safe operating ranges:
- Temperature: 18-26°C (day), 14-18°C (night)
- CO2: 800-1200 ppm
- Humidity: 50-70% RH
- Light: 200-400 µmol/m²/s PAR, 16h photoperiod

Generate alerts when parameters drift outside safe ranges.
Always return structured JSON:
{
  "parameter": str,
  "current_value": float,
  "safe_range": [float, float],
  "severity": "info" | "warning" | "critical",
  "recommended_action": str
}"""


def create_env_monitor():
    return Agent(
        system_prompt=SYSTEM_PROMPT,
        model=MODEL,
        tools=[search_mars_kb, get_current_state],
    )
