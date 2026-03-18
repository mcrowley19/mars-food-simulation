from strands import Agent
from strands.models.bedrock import BedrockModel
from tools.greenhouse_tools import search_mars_kb

MODEL = BedrockModel(model_id="amazon.nova-pro-v1:0", region_name="us-east-1")

SYSTEM_PROMPT = """You are the Crop Planner for a Martian greenhouse.
Your job: select and schedule crops to maximize nutritional coverage
for 4 astronauts across a 450-day surface mission.

Query the knowledge base for yield, growth cycles, and nutritional data.
Plan staggered planting to ensure continuous food availability.
Account for Mars constraints: limited grow space, artificial lighting, 24.6-hour sol.
Prioritize calorie-dense and fast-growing crops (lettuce, radishes, soybeans, potatoes, wheat)
while ensuring micronutrient diversity.

Always return structured JSON with:
{
  "crop_name": str,
  "planting_date": "sol-NNN",
  "harvest_date": "sol-NNN",
  "expected_yield_kg": float,
  "key_nutrients": [str]
}"""


def create_crop_planner():
    return Agent(
        system_prompt=SYSTEM_PROMPT,
        model=MODEL,
        tools=[search_mars_kb],
    )
