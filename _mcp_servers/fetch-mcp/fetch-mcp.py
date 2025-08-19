"""
This is an MCP server that provides a tool to get a web page.
"""

import urllib3
from fastmcp import FastMCP
import requests
from typing import Annotated

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

mcp = FastMCP("Web Page Fetcher")


@mcp.tool
def fetch_web_page(url: Annotated[str, "The URL that should be fetched."]) -> str:
    """
    Fetch the content of a web page given its URL. Supports HTTP and HTTPS, ignoring invalid SSL certificates.
    """
    response = requests.get(url, verify=False)
    response.raise_for_status()  # Raise an error for bad status codes
    return response.text


if __name__ == "__main__":
    mcp.run()
