/**
 * @fileoverview Plugin for MCP (Model Context Protocol) integration.
 */

'use strict';

import { log } from '../utils/logger.js';
import { hooks } from '../hooks.js';
import { processToolCalls } from '../utils/shared.js';
import * as UIManager from '../ui-manager.js';


/**
 * The header for the tools section in the system prompt.
 * @type {string}
 */
const toolsHeader = `### MCP Tools:

You can use tool calls. Make sure to follow the following XML-inspired format:
<dma:tool_call name="example_tool_name">
<parameter name="example_arg_name1">
example_arg_value1
</parameter>
<parameter name="example_arg_name2">
example_arg_value2
</parameter>
</dma:tool_call>
Do not escape any of the tool call arguments. The arguments will be parsed as normal text. There is one exception: If you need to write </dma:tool_call> or </parameter> as value inside a <parameter>, write it like <\/dma:tool_call> or <\/parameter>.

You can use multiple tools in one message, but either use tools or write an answer in a message. Use tools only if you need them.

IMPORTANT: Write files only if explicitely instructed to do so.

#### Available Tools:\n\n`;

/**
 * @typedef {import('../hooks.js').Plugin} Plugin
 */

/**
 * Plugin for MCP (Model Context Protocol) integration, handling tools and citations.
 * @type {Plugin}
 */
export const mcpPlugin = {
    name: 'mcp',
    configService: null,
    mcpUrl: null,
    mcpSessionId: null,
    tools: [],
    cachedToolsSection: '',
    isInitialized: false,
    initPromise: null,

    init: function(app) {
        this.configService = app.configService;

        // Bind all methods to this instance
        Object.keys(this.hooks).forEach(hookName => {
            this.hooks[hookName] = this.hooks[hookName].bind(this);
        });
        this.filterMcpCalls = this.filterMcpCalls.bind(this);
        this.executeMcpCall = this.executeMcpCall.bind(this);
        this.generateToolsSection = this.generateToolsSection.bind(this);
        this.initMcpSession = this.initMcpSession.bind(this);
        this.sendMcpRequest = this.sendMcpRequest.bind(this);
        this.mcpJsonRpc = this.mcpJsonRpc.bind(this);
        this.continueInit = this.continueInit.bind(this);

        this.mcpUrl = this.configService.getItem('mcpServer');

        if (!this.mcpUrl) {
            // Attempt to get from the fetched /api/config
            fetch('/api/config').then(response => response.json()).then(config => {
                if (config.mcp_endpoint) {
                    this.mcpUrl = config.mcp_endpoint;
                    this.configService.setItem('mcpServer', this.mcpUrl);
                    this.continueInit();
                }
            }).catch(error => log(2, 'mcpPlugin: Could not fetch /api/config', error));
        } else {
            this.continueInit();
        }
    },

    continueInit: function() {
        if (!this.mcpUrl) return;
        this.mcpSessionId = this.configService.getItem(`mcpSession_${this.mcpUrl}`) || null;
        if (!this.cachedToolsSection) {
            log(4, 'mcpPlugin: Pre-fetching tools from MCP', this.mcpUrl);
            this.mcpJsonRpc('tools/list').then(response => {
                this.tools = Array.isArray(response.tools) ? response.tools : [];
                this.cachedToolsSection = this.generateToolsSection(this.tools);
                log(3, 'mcpPlugin: Tools section cached successfully');
            }).catch(error => {
                log(1, 'mcpPlugin: Failed to pre-fetch tools', error);
                this.cachedToolsSection = '';
            });
        }
    },

    hooks: {
        /**
         * Renders a settings input for the MCP server URL.
         * @param {HTMLElement} settingsEl - The settings element.
         */
        onSettingsRender: function (settingsEl) {
            log(5, 'mcpPlugin: onSettingsRender called');
            if (settingsEl.querySelector('#mcpServer')) return;
            const p = document.createElement('p');
            const label = document.createElement('label');
            label.style = 'margin-top: 16px; margin-bottom: 4px; margin-left: 4px; display: block;';
            label.htmlFor = 'mcpServer';
            label.textContent = 'MCP Server URL';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'mcpServer';
            input.placeholder = 'e.g., http://localhost:3000/mcp';
            input.value = this.configService.getItem('mcpServer', '');
            input.addEventListener('input', () => this.configService.setItem('mcpServer', input.value));
            p.appendChild(label);
            p.appendChild(input);
            settingsEl.appendChild(p);
        },
        /**
         * Appends tool descriptions to the system prompt before API calls if MCP is configured.
         * @param {Object} payload - The API payload.
         * @param {import('../app.js').default} app - The main application instance.
         * @returns {Object} The modified payload.
         */
        beforeApiCall: function (payload, app) {
            log(5, 'mcpPlugin: beforeApiCall called');
            if (!app) return payload;

            const mcpUrl = this.configService.getItem('mcpServer');
            const chatlog = app.store.get('currentChat')?.chatlog;
            if (!chatlog) return payload;

            const systemMessage = chatlog.getFirstMessage();
            if (!systemMessage) return payload;

            // Always remove the old tools section first
            let content = systemMessage.value.content;
            const originalContent = content;
            content = content.replace(/\n\n\n--- MCP TOOLS ---\n[\s\S]*?\n--- END MCP TOOLS ---/g, ''); // Due to truncation, the ending \n is not always there.

            // If MCP is configured and we have tools, add the new section
            if (mcpUrl && this.cachedToolsSection) {
                log(3, 'mcpPlugin: Adding tools section to system prompt');
                content += '\n\n\n--- MCP TOOLS ---\n' + toolsHeader + this.cachedToolsSection + '\n--- END MCP TOOLS ---';
            }

            if (content !== originalContent) {
                systemMessage.value.content = content;
                UIManager.renderEntireChat();
            }

            return payload;
        },
        /**
         * Processes completed assistant messages: parses tool calls, executes them via MCP,
         * adds tool outputs to chatlog, and auto-continues the assistant response.
         * @param {import('../components/chatlog.js').Message} message - The completed message.
         * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog.
         * @param {import('../app.js').default} app - The main application instance.
         */
        onMessageComplete: async function (message, chatlog, app) {
            if (!message.value || message.value.role !== 'assistant' || message !== chatlog.getLastMessage()) {
                return;
            }
            const context = { message, plugin: this }; // Pass message for metadata updates
            await processToolCalls(message, chatlog, app, this.filterMcpCalls, this.executeMcpCall, context, this.tools);
        },
        /**
         * Replaces citation XML tags with HTML superscript links.
         * @param {HTMLElement} wrapper - The wrapper element containing the content.
         * @param {import('../components/chatlog.js').Message} message - The message object.
         */
        onPostFormatContent: function (wrapper, message) {
            log(5, 'mcpPlugin: onPostFormatContent called');
            wrapper.querySelectorAll('dma\\:render[type="render_inline_citation"]').forEach(node => {
                const argNode = node.querySelector('argument[name="citation_id"]');
                const id = argNode ? parseInt(argNode.textContent.trim()) : null;
                if (!id) {
                    log(2, 'mcpPlugin: Invalid citation_id, removing node');
                    node.parentNode.removeChild(node);
                    return;
                }
                const source = message.metadata?.sources?.[id - 1];
                const sup = document.createElement('sup');
                const a = document.createElement('a');
                if (source) {
                    a.href = source.url;
                    a.title = source.title || 'Source';
                } else {
                    log(2, 'mcpPlugin: Citation not found for id', id);
                    a.title = 'Citation not found';
                    a.style.color = 'red';
                }
                a.textContent = `[${id}]`;
                sup.appendChild(a);
                node.parentNode.replaceChild(sup, node);
            });
        },
        /**
         * Clears the MCP server API endpoint.
         * @param {HTMLElement} settingsEl - The settings element.
         */
        onLogout: function (settingsEl) {
            const mcpSettings = settingsEl.querySelector('#mcpServer');
            if (!mcpSettings) return;
            mcpSettings.value = '';
        }
    },

    filterMcpCalls: function(call) {
        // In this context, any non-agent call is considered an MCP call.
        return !call.name.endsWith('_agent');
    },

    executeMcpCall: async function(call, context) {
        const { message } = context;
        log(4, 'mcpPlugin: Executing tool', call.name, 'with params', call.params);
        try {
            const result = await this.mcpJsonRpc('tools/call', { name: call.name, arguments: call.params });

            // Add sources to metadata for certain tools
            if (call.name === 'web_search' || call.name === 'browse_page' || call.name.startsWith('x_')) {
                message.metadata = { ...message.metadata || {}, sources: result.sources || [] };
                log(4, 'mcpPlugin: Added sources to metadata', result.sources?.length || 0);
            }

            let content = '';
            let error = null;

            if (result.isError) {
                if (result.content && Array.isArray(result.content)) {
                    content = result.content.map(part => part.type === 'text' ? part.text : '').filter(t => t).join('\n');
                }
                error = content || 'Unknown error';
                content = null;
            } else {
                if (result.content && Array.isArray(result.content)) {
                    content = result.content.map(part => part.type === 'text' ? part.text : '').filter(t => t).join('\n');
                } else if (result.structuredContent) {
                    content = JSON.stringify(result.structuredContent);
                } else {
                    content = JSON.stringify(result);
                }
                if (result.sources && result.sources.length > 0) {
                    content += '\n\nReferences:\n' + result.sources.map((s, i) => `[${i + 1}] ${s.title || 'Source'} - ${s.url}`).join('\n');
                }
            }
            return { id: call.id, content, error };
        } catch (err) {
            log(1, 'mcpPlugin: Tool execution error', err);
            return { id: call.id, content: null, error: err.message || 'Unknown error' };
        }
    },

    /**
     * Generates the tools Markdown section from a list of tools.
     * @param {Object[]} tools - The list of tools.
     * @returns {string} The Markdown section.
     */
    generateToolsSection: function(tools) {
        const sections = [];
        tools.forEach((tool, idx) => {
            const desc = tool.description || 'No description provided.';
            const action = tool.name;
            const displayName = action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            let argsStr = '';
            const properties = tool.inputSchema?.properties || {};
            const requiredSet = new Set(tool.inputSchema?.required || []);
            Object.entries(properties).forEach(([name, arg]) => {
                const argDesc = arg.description || arg.title || 'No description.';
                const argType = arg.type || 'unknown';
                const required = requiredSet.has(name) ? '(required)' : '(optional)';
                const defaultStr = arg.default !== undefined ? ` (default: ${JSON.stringify(arg.default)})` : '';
                argsStr += `   - \`${name}\`: ${argDesc} (type: ${argType})${required}${defaultStr}\n`;
            });
            const section = `${idx + 1}. **${displayName}**\n - **Description**: ${desc}\n - **Action** (dma:tool_call name): \`${action}\`\n - **Arguments** (parameter name): \n${argsStr}`;
            sections.push(section);
        });
        return sections.join('\n');
    },

    /**
     * Initializes the MCP session.
     */
    initMcpSession: async function() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            if (this.isInitialized) return;
            log(4, 'mcpPlugin: Initializing MCP session');
            const initParams = {
                protocolVersion: '2025-03-26', // Latest from spec; adjust if needed
                capabilities: {
                    roots: { listChanged: false }, // Minimal; add more if client supports
                    sampling: {} // Declare if client uses sampling
                },
                clientInfo: {
                    name: 'AIFlowChatClient',
                    version: '1.0.0'
                }
            };
            const initData = await this.sendMcpRequest('initialize', initParams, true); // No session for init
            if (initData.protocolVersion !== '2025-03-26') {
                throw new Error(`Protocol version mismatch: requested 2025-03-26, got ${initData.protocolVersion}`);
            }
            log(4, 'mcpPlugin: Negotiated capabilities', initData.capabilities);
            // Check if session_id was set from header
            if (!this.mcpSessionId) {
                throw new Error('No session ID returned in initialize response header');
            }
            this.configService.setItem(`mcpSession_${this.mcpUrl}`, this.mcpSessionId);
            // Send initialized notification
            await this.sendMcpRequest('notifications/initialized', {}, false, true); // Notification: no id
            this.isInitialized = true;
            log(4, 'mcpPlugin: MCP session initialized', this.mcpSessionId);
        })();
        await this.initPromise;
        this.initPromise = null; // Reset for future calls if needed
    },

    /**
     * Sends a JSON-RPC request to the MCP server.
     * @param {string} method - The JSON-RPC method.
     * @param {Object} [params={}] - The JSON-RPC parameters.
     * @param {boolean} [isInit=false] - Whether this is an initialization request.
     * @param {boolean} [isNotification=false] - Whether this is a notification.
     * @returns {Promise<Object|null>} The JSON-RPC result.
     */
    sendMcpRequest: async function(method, params = {}, isInit = false, isNotification = false) {
        const url = this.configService.getItem('mcpServer');
        if (!url) throw new Error('No MCP server URL set');
        const body = {
            jsonrpc: '2.0',
            method,
            params
        };
        if (!isNotification) {
            body.id = Math.floor(Math.random() * 1000000);
        }
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };
        if (this.mcpSessionId && !isInit) {
            headers['mcp-session-id'] = this.mcpSessionId;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!resp.ok) {
                const errorText = await resp.text();
                log(1, 'mcpPlugin: MCP response not ok', resp.status, resp.statusText, errorText);
                throw new Error(`MCP error: ${resp.statusText} - ${errorText}`);
            }
            const respHeaders = Object.fromEntries(resp.headers.entries());
            log(5, 'mcpPlugin: Full response headers', respHeaders);
            // Handle session_id from header if in response
            const headerSession = resp.headers.get('mcp-session-id');
            log(5, 'mcpPlugin: Checked mcp-session-id header', headerSession);
            if (headerSession) {
                this.mcpSessionId = headerSession;
                this.configService.setItem(`mcpSession_${this.mcpUrl}`, this.mcpSessionId);
            }
            if (isNotification) {
                // Notifications do not expect a response body or result
                return null;
            }
            const contentType = resp.headers.get('Content-Type') || '';
            if (contentType.includes('application/json')) {
                const data = await resp.json();
                if (data.error) {
                    log(1, 'mcpPlugin: MCP JSON-RPC error', data.error);
                    throw new Error(data.error.message || 'MCP call failed');
                }
                return data.result;
            } else if (contentType.includes('text/event-stream')) {
                // Parse SSE: Collect data from 'message' events
                const reader = resp.body.getReader();
                let buffer = '';
                let result = null;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += new TextDecoder().decode(value);
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Last incomplete line
                    for (const line of lines) {
                        if (line.startsWith('event: message')) {
                            // Next line should be data:
                        } else if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            try {
                                const partial = JSON.parse(dataStr);
                                if (partial.jsonrpc) {
                                    result = partial.result; // Assume last message has full result
                                }
                            } catch {} // Ignore partial JSON
                        }
                    }
                }
                if (result) return result;
                throw new Error('Invalid SSE response: No valid JSON-RPC result');
            } else {
                throw new Error(`Unexpected Content-Type: ${contentType}`);
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('MCP request timed out');
            }
            throw error;
        }
    },

    /**
     * Performs a JSON-RPC call to the MCP server.
     * @param {string} method - The JSON-RPC method.
     * @param {Object} [params={}] - The JSON-RPC parameters.
     * @param {boolean} [retry=false] - Whether to retry on session errors.
     * @returns {Promise<Object>} The JSON-RPC result.
     */
    mcpJsonRpc: async function(method, params = {}, retry = false) {
        log(5, 'mcpPlugin: mcpJsonRpc called with method', method, 'params', params);
        try {
            await this.initMcpSession(); // Ensure lifecycle is complete
            const result = await this.sendMcpRequest(method, params);
            log(4, 'mcpPlugin: MCP JSON-RPC success', result);
            return result;
        } catch (error) {
            log(1, 'mcpPlugin: MCP JSON-RPC failure', error);
            // Handle session-related errors by resetting and retrying once
            if (error.message.includes('Missing session ID') || error.message.includes('No valid session ID') || error.message.includes('Invalid session ID')) {
                this.configService.removeItem(`mcpSession_${this.mcpUrl}`);
                this.mcpSessionId = null;
                this.isInitialized = false;
                if (!retry) {
                    log(3, 'mcpPlugin: Retrying MCP call after session re-init');
                    return this.mcpJsonRpc(method, params, true);
                }
            }
            throw new AggregateError(
                [error],
                `Failed to perform MCP JSON-RPC call.\nURL: ${this.mcpUrl}, Method: ${method}, Params: ${JSON.stringify(params)}.\nOriginal error: ${error.message || 'Unknown'}.`
            );
        }
    }
};
