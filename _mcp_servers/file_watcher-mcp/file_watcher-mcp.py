from fastmcp import FastMCP
import os
import sys
import time
from pydantic import Field
from typing import Annotated, Optional

# Global variable for the watched directory
_watched_dir: Optional[str] = None

def set_watched_dir(real_dir: str) -> None:
    """Configure the watched directory."""
    global _watched_dir
    _watched_dir = os.path.abspath(os.path.expanduser(real_dir))

# Server setup
mcp = FastMCP(
    name="File Watcher Server",
    instructions="A server that provides a tool to wait for a file to appear in a specific directory, read its content, and then delete it.",
)


@mcp.tool
def wait_for_and_read_file(
    filename: Annotated[str, Field(description="The name of the file to wait for in the watched directory.")],
    timeout: Annotated[Optional[str], Field(description="The maximum number of seconds to wait for the file.")] = "60",
) -> str:
    """
    Waits for a specific file to appear in the watched directory, reads its content,
    deletes it, and returns the content.
    """
    if _watched_dir is None:
        return "Error: The watched directory is not configured."

    file_path = os.path.join(_watched_dir, filename)

    timeout_seconds = 60
    if timeout is not None:
        try:
            timeout_seconds = int(timeout)
        except (ValueError, TypeError):
            pass


    start_time = time.time()
    while not os.path.exists(file_path):
        if time.time() - start_time > timeout_seconds:
            return f"Error: Timed out after {timeout_seconds} seconds waiting for {filename}"
        time.sleep(1)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        os.remove(file_path)
        return content
    except Exception as e:
        return f"Error reading or deleting file {filename}: {e}"


# Run the server with the watched directory from command-line arguments.
if len(sys.argv) != 2:
    print("Usage: file-watcher-mcp <watched-directory>")
    sys.exit(1)

real_dir = sys.argv[1]
if not os.path.isdir(real_dir):
    print(f"Error: {real_dir} is not a directory")
    sys.exit(1)

set_watched_dir(real_dir)
print(f"MCP File Watcher Server running on stdio\nWatching directory: {_watched_dir}")

if __name__ == "__main__":
    mcp.run()
