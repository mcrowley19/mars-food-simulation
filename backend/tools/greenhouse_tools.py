from strands import tool
from tools.mcp_client import get_mars_kb_client


@tool
def search_mars_kb(query: str, max_results: int = 5) -> str:
    """Search the Mars greenhouse knowledge base for crop data, growing conditions, nutritional information, and mission protocols."""
    with get_mars_kb_client() as mcp:
        tools = mcp.list_tools_sync()
        mcp_tool = tools[0]
        result = mcp_tool.mcp_client.call_tool_sync(
            "tool-call", mcp_tool.tool_name, {"query": query, "max_results": max_results}
        )
        if result["status"] == "success":
            return result["content"][0]["text"]
        return f"Knowledge base query failed: {result}"
