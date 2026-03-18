# backend/api.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import boto3, json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str

@app.post("/invoke")
def invoke_agent(req: PromptRequest):
    client = boto3.client("bedrock-agentcore-runtime", region_name="us-east-1")
    response = client.invoke_agent_runtime(
        agentRuntimeArn="<your-arn>",
        payload=json.dumps({"prompt": req.prompt})
    )
    return {"response": response["body"]}