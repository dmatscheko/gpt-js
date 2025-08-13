# GPT JS Chat

An HTML/JS-based chat application that interacts with AI models via the OpenAI-compatible API.

Key capabilities include:
- **AI Interactions**: Stream responses from AI models. Generate text, tables, code, formulas (via LaTeX), and simple SVG images/charts.
- **Tool Support**: Integrate external tools (e.g., web search) using MCP for real-time data fetching.
- **Formatting & Usability**: Render Markdown, highlight code, display math equations, and add citations for tool outputs.
- **Chat Management**: Multiple chats with save/load, editing/deleting messages, alternative responses, and branching conversations.

### Usage

#### Online Demo
Test a (sometimes outdated version) at: [https://huggingface.co/spaces/dma123/gpt-js](https://huggingface.co/spaces/dma123/gpt-js).

#### Local Setup
1. Clone the repo: `git clone https://github.com/dmatscheko/gpt-js.git`
2. Run a simple HTTP server: `python -m http.server 8000` (or use any static file server).
3. Open `http://localhost:8000` in your browser.

#### With MCP (for Tools)
To enable advanced tools like web/X search:
1. Clone the repo: `git clone https://github.com/dmatscheko/gpt-js.git`
2. Install dependencies: `uv sync` (requires uv; alternatively, use pip for fastmcp).
3. Customize tools via `mcp_config.json`.
4. Run: `uv run main.py` (or `python main.py`). This starts a local MCP proxy at `http://127.0.0.1:3000/mcp` and auto-configures the app.

#### Controls
- **Input**: Type messages; use Shift+Enter (or Ctrl/Alt+Enter) to submit. Press Esc to abort AI responses.
- **Chats**: Sidebar for multiple chats; edit titles, add/delete messages, navigate alternatives.
- **Settings**: Tune sampling (temperature/top-p), manage API endpoints, refresh models, select role (user/system/assistant/tool).
- **Avatars**: Click message avatars to upload custom images (stored locally).

### Screenshot
This screenshot was "randomly selected" because its output was ok-ish ;)
![screenshot.png](screenshot.png)
