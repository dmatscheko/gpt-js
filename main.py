"""
This script serves the static files for the chat application and runs an MCP proxy.
"""

import os
import json
import http.server
import socketserver
import threading
import webbrowser
import logging
import argparse
import signal
import sys
from fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom HTTP request handler to serve static files and the API configuration.
    """

    def log_message(self, format, *args):
        """Logs an HTTP request."""
        logging.info(f"WEB: {format % args}")

    def do_GET(self):
        """Handles GET requests."""
        if self.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            config = {"mcp_endpoint": "http://127.0.0.1:3000/mcp"}
            self.wfile.write(json.dumps(config).encode("utf-8"))
        else:
            super().do_GET()


def run_file_server():
    """
    Runs the static file server.
    """

    class ReuseTCPServer(socketserver.TCPServer):
        """
        A TCP server that allows address reuse.
        """

        allow_reuse_address = True

    with ReuseTCPServer(("", 8000), CustomHandler) as server:
        logging.info("WEB: Serving static files at http://localhost:8000")
        server.serve_forever()


def load_config():
    """
    Loads the MCP configuration from a JSON file.
    """
    path = os.getenv("MCP_CONFIG", "mcp_config.json")
    if not os.path.exists(path):
        logging.warning(f"{path} not found, using empty config")
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logging.error(f"JSON decode error in {path}: {e}")
        return {}
    except Exception as e:
        logging.error(f"Error loading {path}: {e}")
        return {}


def setup_proxy(mcp_servers):
    """
    Sets up the MCP proxy.
    """
    if not mcp_servers:
        return None
    proxy = FastMCP.as_proxy({"mcpServers": mcp_servers}, name="Composite Proxy")
    cors = [
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["MCP-Session-ID", "X-MCP-Session-ID"],
        )
    ]
    return proxy, cors


def shutdown(sig, frame):
    """
    Shuts down the application gracefully.
    """
    logging.info("Shutting down gracefully")
    sys.exit(0)


def main():
    """
    Main function to run the application.
    """
    parser = argparse.ArgumentParser(description="Run MCP proxy and web server")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s - %(levelname)s - %(message)s")

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    mcp_servers = load_config()
    proxy_info = setup_proxy(mcp_servers)

    threading.Thread(target=run_file_server, daemon=True).start()
    webbrowser.open("http://localhost:8000")

    if proxy_info:
        proxy, cors = proxy_info
        logging.info("MCP: Starting proxy at http://127.0.0.1:3000/mcp")
        proxy.run(transport="http", host="127.0.0.1", port=3000, middleware=cors)


if __name__ == "__main__":
    main()
