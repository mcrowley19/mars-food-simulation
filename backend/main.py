from bedrock_agentcore.runtime import BedrockAgentCoreApp
from agents.orchestrator import orchestrator

app = BedrockAgentCoreApp()

@app.entrypoint
def handler(payload, context):
    response = orchestrator(payload["prompt"])
    return {"response": str(response)}

if __name__ == "__main__":
    app.run()