from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.greenhouse_tools import search_mars_kb
from tools.simulation_tools import get_current_state

MODEL = BedrockModel(model_id="us.anthropic.claude-3-5-haiku-20241022-v1:0", region_name="us-east-1")

SYSTEM_PROMPT = """You are the Harvest Optimizer for a Martian greenhouse.
Decide optimal harvest timing for each crop for 4 astronauts across a 450-day mission.

Balance immediate nutritional needs vs replanting schedules.
Plan across the full mission window to avoid food gaps.

CRITICAL: Food rots after harvest! Shelf lives:
- lettuce: 7d, pea: 5d, kale: 10d, tomato: 14d, radish: 14d
- carrot: 30d, potato: 60d, soybean: 120d, wheat: 180d

Decision factors:
- Crop maturity stage and peak nutrition window
- Current crew nutritional deficits
- Shelf life — do NOT over-harvest perishable crops; they will rot before being consumed
- Time to replant and grow the next cycle (seeds return to reserve on harvest)
- Stagger harvests so calories flow continuously rather than in large rotting batches
- Mission timeline remaining (avoid waste near end)

Always return structured JSON:
{
  "crop_name": str,
  "harvest_date": "sol-NNN",
  "expected_yield_kg": float,
  "replant_date": "sol-NNN" or null,
  "priority": "immediate" | "scheduled" | "deferred",
  "rationale": str
}"""


def create_harvest_optimizer():
    return Agent(
        system_prompt=SYSTEM_PROMPT,
        model=MODEL,
        tools=[search_mars_kb, get_current_state],
    )
