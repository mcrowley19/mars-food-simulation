from strands import Agent, tool
from strands.models.bedrock import BedrockModel
from agents.crop_planner import create_crop_planner
from agents.env_monitor import create_env_monitor
from agents.resource_manager import create_resource_manager
from agents.harvest_optimizer import create_harvest_optimizer
from agents.fault_handler import create_fault_handler

crop_planner = create_crop_planner()
env_monitor = create_env_monitor()
resource_manager = create_resource_manager()
harvest_optimizer = create_harvest_optimizer()
fault_handler = create_fault_handler()


@tool
def delegate_to_crop_planner(task: str) -> str:
    """Delegate a crop planning or scheduling task."""
    return str(crop_planner(task))


@tool
def delegate_to_env_monitor(task: str) -> str:
    """Delegate an environment monitoring or adjustment task."""
    return str(env_monitor(task))


@tool
def delegate_to_resource_manager(task: str) -> str:
    """Delegate a water or nutrient management task."""
    return str(resource_manager(task))


@tool
def delegate_to_harvest_optimizer(task: str) -> str:
    """Delegate a harvest timing or scheduling optimization task."""
    return str(harvest_optimizer(task))


@tool
def delegate_to_fault_handler(task: str) -> str:
    """Delegate a system failure, equipment issue, or emergency response task."""
    return str(fault_handler(task))


orchestrator = Agent(
    model=BedrockModel(model_id="amazon.nova-pro-v1:0", region_name="us-east-1"),
    system_prompt="""You are the Mission Orchestrator for a Martian greenhouse.
    Coordinate specialist agents to manage a 450-day crop mission for 4 astronauts.
    Delegate tasks to the right specialist and synthesize their outputs into
    clear mission reports.

    Available specialists:
    - Crop Planner: crop selection, planting schedules, nutritional coverage
    - Environment Monitor: temperature, CO2, humidity, lighting adjustments
    - Resource Manager: water and nutrient optimization, consumption tracking
    - Harvest Optimizer: harvest timing, replanting schedules, yield planning
    - Fault Handler: equipment failures, dust storms, emergency triage""",
    tools=[
        delegate_to_crop_planner,
        delegate_to_env_monitor,
        delegate_to_resource_manager,
        delegate_to_harvest_optimizer,
        delegate_to_fault_handler,
    ]
)
