from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
def handler(payload, context):
    from agents.orchestrator import get_orchestrator
    orchestrator = get_orchestrator()
    response = orchestrator(payload["prompt"])
    return {"response": str(response)}

if __name__ == "__main__":
    app.run()
