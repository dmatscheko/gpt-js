import os
import json
import http.server
import socketserver
import threading
import webbrowser
import sys
import logging
from fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

TRACE_LEVEL = 5
logging.addLevelName(TRACE_LEVEL, "TRACE")


def trace(self, message, *args, **kws):
    if self.isEnabledFor(TRACE_LEVEL):
        self._log(TRACE_LEVEL, message, args, **kws)


logging.Logger.trace = trace


def module_trace(message, *args, **kws):
    logging.log(TRACE_LEVEL, message, *args, **kws)


logging.trace = module_trace


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        logging.info(f"WEB: {format % args}")

    def do_GET(self):
        logging.debug(f"Handling GET request for path {self.path}")
        logging.trace(f"GET headers: {self.headers}")
        if self.path == "/js/config.js":
            logging.trace("Serving modified /js/config.js")
            try:
                with open("js/config.js", "r") as f:
                    content = f.read()
                logging.trace(f"Original content: {content[:100]}...")
                content = content.replace("export const autoMcpEndpoint = '';", "export const autoMcpEndpoint = 'http://127.0.0.1:3000/mcp';")
                logging.trace(f"Modified content: {content[:100]}...")
                self.send_response(200)
                self.send_header("Content-type", "application/javascript")
                self.send_header("Content-Length", len(content))
                self.end_headers()
                self.wfile.write(content.encode("utf-8"))
                logging.trace("Modified config.js sent")
            except Exception as e:
                logging.error(f"Error serving /js/config.js: {str(e)}")
                self.send_error(500, str(e))
        else:
            super().do_GET()


def run_file_server():
    PORT = 8000

    class MyTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    logging.trace("Starting file server")
    with MyTCPServer(("", PORT), CustomHandler) as server:
        logging.info(f"WEB: Serving static files from the current directory at http://localhost:{PORT}.")
        server.serve_forever()


if __name__ == "__main__":
    if "-h" in sys.argv:
        print(f"Usage: python {sys.argv[0]} [-v] [-vv] [-h]")
        print("Options:")
        print(" -v Enable debug logging")
        print(" -vv Enable trace logging")
        print(" -h Show this help message and exit")
        sys.exit(0)
    if "-vv" in sys.argv:
        log_level = TRACE_LEVEL
    elif "-v" in sys.argv:
        log_level = logging.DEBUG
    else:
        log_level = logging.INFO
    logging.basicConfig(level=log_level)
    # Load config from file
    config_path = os.getenv("MCP_CONFIG", "mcp_config.json")
    logging.debug(f"Loading config from {config_path}")
    logging.trace(f"Config path: {config_path}")
    mcp_servers = {}
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                mcp_servers = json.load(f)
            logging.debug(f"Loaded mcp_servers from {config_path}: {mcp_servers}")
        except Exception as e:
            logging.error(f"Error loading {config_path}: {str(e)}")
    else:
        logging.warning(f"{config_path} not found, using empty mcp_servers configuration.")
    if not mcp_servers:
        logging.warning("No valid backends configured.")
    if mcp_servers:
        proxy = FastMCP.as_proxy({"mcpServers": mcp_servers}, name="Composite Proxy")
        logging.info("FastMCP proxy created.")
        # Define custom middleware
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
    else:
        logging.info("No MCP backends. Only starting web server.")

    threading.Thread(target=run_file_server, daemon=True).start()
    logging.trace("File server thread started")
    webbrowser.open("http://localhost:8000")
    logging.trace("Browser opened")

    if mcp_servers:
        logging.info("MCP: Starting MCP proxy at http://127.0.0.1:3000/mcp")
        proxy.run(transport="http", host="127.0.0.1", port=3000, middleware=cors)
