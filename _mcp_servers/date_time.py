from fastmcp import FastMCP
import datetime

mcp = FastMCP("Date and Time Server")


@mcp.tool()
def get_current_datetime() -> str:
    """Get the current date and time in ISO format."""
    return datetime.datetime.now().isoformat()


if __name__ == "__main__":
    mcp.run()
