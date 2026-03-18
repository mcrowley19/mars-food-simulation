from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamablehttp_client

MARS_KB_URL = "https://kb-start-hack-gateway-buyjtibfpg.gateway.bedrock-agentcore.us-east-2.amazonaws.com/mcp"

def get_mars_kb_client():
    return MCPClient(lambda: streamablehttp_client(MARS_KB_URL))
