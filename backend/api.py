from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/invoke")
def invoke_agent(req: PromptRequest):
    try:
        from agents.orchestrator import run_orchestrator
        result = run_orchestrator(req.prompt)
        return {"response": str(result)}
    except Exception as e:
        message = str(e)
        if "AccessDeniedException" in message or "explicit deny" in message:
            return {
                "response": (
                    "Agent invocation is currently blocked by AWS IAM policy "
                    "(explicit deny on Bedrock model invocation)."
                )
            }
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=message)
