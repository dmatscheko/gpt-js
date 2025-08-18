"""
This is an MCP server that provides a tool to get the current date and time.
"""

from fastmcp import FastMCP
import datetime

# Create an MCP server instance
mcp = FastMCP("Date and Time Server")


@mcp.tool()
def get_current_datetime() -> str:
    """
    Get the current date and time in ISO format.
    """
    return datetime.datetime.now().isoformat()


if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
