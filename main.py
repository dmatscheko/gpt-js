import os
import json
import http.server
import socketserver
import asyncio
import threading
import webbrowser
import atexit
import time
from fastmcp import Client
import sys
import logging
import concurrent.futures

TRACE_LEVEL = 5
logging.addLevelName(TRACE_LEVEL, "TRACE")


def trace(self, message, *args, **kws):
    if self.isEnabledFor(TRACE_LEVEL):
        self._log(TRACE_LEVEL, message, args, **kws)


logging.Logger.trace = trace


def module_trace(message, *args, **kws):
    logging.log(TRACE_LEVEL, message, *args, **kws)


logging.trace = module_trace

# Load config from file
config_path = os.getenv("MCP_CONFIG", "mcp_config.json")
CONFIG = {"backends": []}
if os.path.exists(config_path):
    with open(config_path) as f:
        CONFIG = json.load(f)

tool_map = {}  # tool_name -> client (though single client)
tools_list = []  # list of tool dicts
client = None  # Unified FastMCP client
httpd = None  # Global reference to the file server

# Persistent event loop running in a background thread
loop = asyncio.new_event_loop()
threading.Thread(target=loop.run_forever, daemon=True).start()


async def initialize():
    global client, tool_map, tools_list
    logging.trace(f"CONFIG backends: {CONFIG.get('backends', [])}")
    mcp_servers = {}
    for b in CONFIG.get("backends", []):
        name = b.get("name")
        if not name:
            logging.error("Backend missing 'name'; skipping.")
            continue
        server_config = {}
        if "url" in b:
            logging.debug(f"Configuring remote backend {name} with url {b['url']}")
            server_config["url"] = b["url"]
            server_config.update(b.get("headers", {}))
            if "auth" in b:
                server_config["auth"] = b["auth"]
        elif "command" in b:
            logging.debug(f"Configuring stdio backend {name} with command {b['command']}")
            server_config["command"] = b["command"]
            server_config["args"] = b.get("args", [])
            server_config["env"] = b.get("env", {})
            if "cwd" in b:
                server_config["cwd"] = b["cwd"]
        else:
            logging.error(f"Backend {name} has no 'url' or 'command'; skipping.")
            continue
        mcp_servers[name] = server_config
    if not mcp_servers:
        logging.warning("No valid backends configured.")
        return
    config = {"mcpServers": mcp_servers}
    logging.trace(f"FastMCP config: {config}")
    try:
        client = Client(config)
        await client.__aenter__()
        logging.debug("Unified client initialized and connected.")
        logging.trace("Fetching all tools")
        tools = await client.list_tools()
        logging.trace(f"Tools fetched: {tools}")
        logging.debug(f"Got {len(tools)} tools across all backends")
        for tool in tools:
            logging.trace(f"Processing tool {tool.name}")
            if tool.name in tool_map:
                logging.warning(f"Tool name conflict '{tool.name}'; skipping.")
                continue
            tool_map[tool.name] = client
            tools_list.append(tool.model_dump())
            logging.trace(f"Added tool {tool.name}")
    except Exception as e:
        logging.error(f"Error initializing unified client: {e}")


async def cleanup():
    logging.debug("Cleaning up client")
    global client
    if client:
        logging.trace("Exiting client context")
        await client.__aexit__(None, None, None)
        logging.trace("Client context exited")


def shutdown():
    logging.debug("Shutting down")
    # Use thread-safe call to run cleanup on the persistent loop
    future = asyncio.run_coroutine_threadsafe(cleanup(), loop)
    future.result()  # Block until done

    # Stop the loop
    def stop_loop():
        loop.stop()

    future = loop.call_soon_threadsafe(stop_loop)
    # Wait for loop to stop (optional, but ensures clean shutdown)
    while loop.is_running():
        time.sleep(0.1)


def generate_tools_section():
    logging.trace("Generating tools section")
    sections = []
    for idx, tool in enumerate(tools_list, start=1):
        logging.trace(f"Processing tool {idx}: {tool['name']}")
        desc = tool.get("description", "No description provided.")
        action = tool["name"]
        args_str = ""
        for arg in tool.get("arguments", []):
            logging.trace(f"Processing arg {arg['name']}")
            arg_desc = arg.get("description", "No description.")
            arg_type = arg.get("type", "unknown")
            required = "(required)" if arg.get("required", True) else "(optional)"
            default_str = f" (default: {arg.get('default')})" if "default" in arg else ""
            args_str += f" - `{arg['name']}`: {arg_desc} (type: {arg_type}){required}{default_str}\n"
        section = (
            f"{idx}. **{action.capitalize().replace('_', ' ')}**\n - **Description:**: {desc}\n - **Action**: `{action}`\n - **Arguments**: \n{args_str}\n"
        )
        sections.append(section)
    result = "\n".join(sections)
    logging.trace(f"Generated section: {result[:100]}...")
    return result


# Synchronous, using thread-safe call to the loop
def call_tool(tool_name, tool_args):
    logging.debug(f"Calling tool {tool_name} with args {tool_args}")
    logging.trace(f"Tool args details: {tool_args}")
    global client
    if not client:
        raise ValueError("Client not initialized")
    try:
        # Run the async call_tool on the persistent loop
        async def _inner_call():
            return await client.call_tool(tool_name, tool_args)

        future = asyncio.run_coroutine_threadsafe(_inner_call(), loop)
        response = future.result()  # Block until result is ready
        logging.trace(f"Response received: {response}")
        logging.debug(f"Got response for tool {tool_name}")
        return response.data  # Assuming response has .data for the result
    except Exception as e:
        logging.trace(f"Error in response: {e}")
        raise ValueError(str(e))


class MCPHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logging.info(f"MCP: {format % args}")

    def do_OPTIONS(self):
        logging.debug("Handling OPTIONS request")
        logging.trace(f"OPTIONS path: {self.path}")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8000")
        self.send_header("Access-Control-Allow-Methods", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.end_headers()

    def do_POST(self):
        if self.path != "/mcp":
            logging.trace(f"Invalid path for POST: {self.path}")
            self.send_error(404)
            return
        logging.trace(f"POST headers: {self.headers}")
        try:
            content_length = int(self.headers["Content-Length"])
            logging.trace(f"Content length: {content_length}")
            body = self.rfile.read(content_length).decode("utf-8")
            logging.trace(f"Body: {body}")
            data = json.loads(body)
            logging.trace(f"Parsed data: {data}")
            if not isinstance(data, dict) or data.get("jsonrpc") != "2.0" or "method" not in data:
                raise ValueError("Invalid Request")
            method = data["method"]
            logging.debug(f"Received POST with method {method}")
            params = data.get("params", {})
            logging.trace(f"Params: {params}")
            req_id = data.get("id")
            logging.trace(f"Request ID: {req_id}")
            if method == "get_tools_section":
                result = generate_tools_section()
            elif method == "get_tools":
                result = tools_list
                logging.trace(f"Returning tools list: {len(result)} tools")
            elif method == "call_tool":
                tool_name = params.get("name")
                tool_args = params.get("arguments")
                logging.trace(f"Tool name: {tool_name}, args: {tool_args}")
                if not tool_name or tool_name not in tool_map:
                    raise ValueError("Tool not found")
                # Call the synchronous wrapper
                result = call_tool(tool_name, tool_args)
            else:
                raise ValueError("Method not found")
            resp = {"jsonrpc": "2.0", "result": result, "id": req_id}
            logging.trace(f"Response prepared: {resp}")
            status = 200
        except json.JSONDecodeError:
            logging.debug("JSON parse error in POST")
            resp = {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}, "id": None}
            status = 400
        except ValueError as e:
            logging.error(f"Value error in POST: {str(e)}")
            resp = {"jsonrpc": "2.0", "error": {"code": -32601, "message": str(e)}, "id": data.get("id") if "data" in locals() else None}
            status = 400
        except Exception as e:
            logging.error(f"Unexpected error in POST: {str(e)}")
            resp = {"jsonrpc": "2.0", "error": {"code": -32000, "message": str(e)}, "id": data.get("id") if "data" in locals() else None}
            status = 500
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8000")
        self.send_header("Content-Type", "application/json")
        resp_str = json.dumps(resp)
        logging.trace(f"Response string: {resp_str[:100]}...")
        self.send_header("Content-Length", len(resp_str))
        self.end_headers()
        self.wfile.write(resp_str.encode("utf-8"))
        logging.trace("Response sent")

    def do_GET(self):
        logging.debug("Handling GET request in MCPHandler")
        logging.trace(f"GET path: {self.path}")
        self.send_error(404)


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

    global httpd
    logging.trace("Starting file server")
    with MyTCPServer(("", PORT), CustomHandler) as server:
        httpd = server
        logging.info(f"WEB: Serving static files from the current directory at http://localhost:{PORT}.")
        server.serve_forever()


def run_mcp_server():
    PORT = 3000

    class MyTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    logging.trace("Starting MCP server")
    with MyTCPServer(("", PORT), MCPHandler) as server:
        logging.info(f"MCP: MCP server at http://localhost:{PORT}/mcp")
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
    logging.debug(f"Loading config from {config_path}")
    logging.trace(f"Config path: {config_path}")
    atexit.register(shutdown)
    logging.trace("Shutdown registered")
    # Run initialize on the persistent loop
    future = asyncio.run_coroutine_threadsafe(initialize(), loop)
    future.result()  # Block until initialization completes
    logging.trace("Initialization complete")
    threading.Thread(target=run_file_server, daemon=True).start()
    threading.Thread(target=run_mcp_server, daemon=True).start()
    logging.trace("Threads started")
    webbrowser.open("http://localhost:8000")
    logging.trace("Browser opened")
    while True:
        time.sleep(1)
