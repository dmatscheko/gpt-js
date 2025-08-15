/**
 * @fileoverview Plugin for MCP (Model Context Protocol) integration.
 */

'use strict';

import { log } from '../utils/logger.js';
import { hooks } from '../hooks.js';

/**
 * The MCP server URL.
 * @type {string|null}
 */
let mcpUrl = null;

/**
 * The MCP session ID.
 * @type {string|null}
 */
let mcpSessionId = null;

/**
 * The cached tools section.
 * @type {string}
 */
let cachedToolsSection = '';

(async () => {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            if (config.mcp_endpoint) {
                if (localStorage.getItem('gptChat_mcpServer') == null || localStorage.getItem('gptChat_mcpServer') == '') {
                    localStorage.setItem('gptChat_mcpServer', config.mcp_endpoint);
                }
                mcpUrl = config.mcp_endpoint;
            }
        }
    } catch (error) {
        log(2, 'mcpPlugin: Could not fetch /api/config', error);
    }

    if (!mcpUrl) return;
    mcpSessionId = localStorage.getItem(`gptChat_mcpSession_${mcpUrl}`) || null;
    if (!cachedToolsSection) {
        log(4, 'mcpPlugin: Pre-fetching tools from MCP', mcpUrl);
        mcpJsonRpc('tools/list').then(response => {
            const toolsArray = Array.isArray(response.tools) ? response.tools : [];
            cachedToolsSection = generateToolsSection(toolsArray);
            log(3, 'mcpPlugin: Tools section cached successfully');
        }).catch(error => {
            log(1, 'mcpPlugin: Failed to pre-fetch tools', error);
            cachedToolsSection = '';
        });
    }

})();

/**
 * Whether the MCP session is initialized.
 * @type {boolean}
 */
let isInitialized = false;

/**
 * The header for the tools section in the system prompt.
 * @type {string}
 */
const toolsHeader = `

## Tools:

You use tools via function calls to help you solve questions. Make sure to use the following format for function calls, including the <dma:function_call> and </dma:function_call> tags. Function call should follow the following XML-inspired format:
<dma:function_call name="example_tool_name">
<parameter name="example_arg_name1">
example_arg_value1
</parameter>
<parameter name="example_arg_name2">
example_arg_value2
</parameter>
</dma:function_call>
Do not escape any of the function call arguments. The arguments will be parsed as normal text. There is one exception: If you need to write </dma:function_call> or </parameter> as value inside a <parameter>, write it like <\/dma:function_call> or <\/parameter>.

You can use multiple tools in parallel by calling them together.

### Available Tools:

`;

/**
 * @typedef {import('../hooks.js').Plugin} Plugin
 */

/**
 * Plugin for MCP (Model Context Protocol) integration, handling tools and citations.
 * @type {Plugin}
 */
export const mcpPlugin = {
    name: 'mcp',
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
            input.value = localStorage.getItem('gptChat_mcpServer') || '';
            input.addEventListener('input', () => localStorage.setItem('gptChat_mcpServer', input.value));
            p.appendChild(label);
            p.appendChild(input);
            settingsEl.appendChild(p);
        },
        /**
         * Appends tool descriptions to the system prompt before API calls if MCP is configured.
         * @param {Object} payload - The API payload.
         * @param {import('../app.js').default} app - The main App instance.
         * @returns {Object} The modified payload.
         */
        beforeApiCall: function (payload, app) {
            log(5, 'mcpPlugin: beforeApiCall called');
            const mcpUrl = localStorage.getItem('gptChat_mcpServer');
            if (!mcpUrl || !cachedToolsSection) return;
            log(3, 'mcpPlugin: Appending tools section to system prompt');
            const systemMessage = app.ui.chatBox.chatlog.getFirstMessage();
            if (systemMessage && !systemMessage.value.content.includes('## Tools:')) {
                systemMessage.value.content += toolsHeader + cachedToolsSection;
                systemMessage.cache = null;
                app.ui.chatBox.update();
            }
            return payload;
        },
        /**
         * Processes completed assistant messages: parses tool calls, executes them via MCP,
         * adds tool outputs to chatlog, and auto-continues the assistant response.
         * @param {import('../components/chatlog.js').Message} message - The completed message.
         * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog.
         * @param {import('../app.js').default} app - The main App instance.
         */
        onMessageComplete: function (message, chatlog, app) {
            log(5, 'mcpPlugin: onMessageComplete called for role', message.value?.role);
            if (!message.value || message.value.role !== 'assistant') return;
            const lastMessage = chatlog.getLastMessage();
            if (message !== lastMessage) return;
            const { toolCalls, positions } = parseFunctionCalls(message.value.content);
            if (toolCalls.length > 0) {
                log(3, 'mcpPlugin: Found tool calls', toolCalls.length);
                toolCalls.forEach((tc, index) => {
                    tc.id = `tool_${index + 1}_${Math.random().toString(36).substring(2, 7)}`;
                });
                // Add/override tool_call_id attributes (in reverse to avoid index shifts).
                let content = message.value.content;
                for (let i = positions.length - 1; i >= 0; i--) {
                    const pos = positions[i];
                    const gtIndex = content.indexOf('>', pos.start);
                    let startTag = content.slice(pos.start, gtIndex + 1);
                    // Remove existing tool_call_id attributes
                    startTag = startTag.replace(/\s+tool_call_id\s*=\s*["'][^"']*["']/g, '');
                    // Insert new tool_call_id
                    const insert = ` tool_call_id="${toolCalls[i].id}"`;
                    startTag = startTag.slice(0, -1) + insert + '>';
                    content = content.slice(0, pos.start) + startTag + content.slice(gtIndex + 1);
                }
                message.value.content = content;
                message.cache = null;
                app.ui.chatBox.update(false);
                // Execute all tool calls in parallel.
                Promise.all(toolCalls.map(async (tc, index) => {
                    log(4, 'mcpPlugin: Executing tool', tc.name, 'with params', tc.params);
                    try {
                        const result = await mcpJsonRpc('tools/call', { name: tc.name, arguments: tc.params });
                        // Add sources to metadata for certain tools.
                        if (tc.name === 'web_search' || tc.name === 'browse_page' || tc.name.startsWith('x_')) {
                            message.metadata = { ...message.metadata || {}, sources: result.sources || [] };
                            log(4, 'mcpPlugin: Added sources to metadata', result.sources?.length || 0);
                        }
                        let trContent = '';
                        if (result.isError) {
                            if (result.content && Array.isArray(result.content)) {
                                trContent = result.content.map(part => part.type === 'text' ? part.text : '').filter(t => t).join('\n');
                            }
                            return { content: null, error: trContent || 'Unknown error' };
                        } else {
                            if (result.content && Array.isArray(result.content)) {
                                trContent = result.content.map(part => part.type === 'text' ? part.text : '').filter(t => t).join('\n');
                            } else if (result.structuredContent) {
                                trContent = JSON.stringify(result.structuredContent);
                            } else {
                                trContent = JSON.stringify(result);
                            }
                            if (result.sources && result.sources.length > 0) {
                                trContent += '\n\nReferences:\n' + result.sources.map((s, i) => `[${i + 1}] ${s.title || 'Source'} - ${s.url}`).join('\n');
                            }
                            return { content: trContent, error: null };
                        }
                    } catch (error) {
                        log(1, 'mcpPlugin: Tool execution error', error);
                        return { content: null, error: error.message || 'Unknown error' };
                    }
                })).then(toolResults => {
                    log(4, 'mcpPlugin: Processing tool results', toolResults.length);
                    message.cache = null;
                    // Add tool results as XML-like tags in a single tool message.
                    let toolContents = '';
                    toolResults.forEach((tr, index) => {
                        const id = toolCalls[index].id;
                        let inner = '';
                        if (tr.error) {
                            inner = `<error>\n${escapeXml(tr.error)}\n</error>`;
                        } else {
                            inner = `<content>\n${escapeXml(tr.content)}\n</content>`;
                        }
                        toolContents += `<dma:tool_response tool_call_id="${id}">\n${inner}\n</dma:tool_response>\n`;
                    });
                    if (toolContents !== '') {
                        chatlog.addMessage({ role: 'tool', content: toolContents });
                    }
                    // Auto-continue by streaming new assistant response.
                    chatlog.addMessage(null); // Add placeholder for new response.
                    app.ui.chatBox.update();
                    app.generateAIResponse({}, chatlog);
                });
            }
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
        }
    }
};

/**
 * Generates the tools Markdown section from a list of tools.
 * @param {Object[]} tools - The list of tools.
 * @returns {string} The Markdown section.
 */
function generateToolsSection(tools) {
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
        const section = `${idx + 1}. **${displayName}**\n - **Description**: ${desc}\n - **Action** (dma:function_call name): \`${action}\`\n - **Arguments** (parameter name): \n${argsStr}\n`;
        sections.push(section);
    });
    return sections.join('\n');
}

/**
 * Parses <dma:function_call> tags and extracts tool calls.
 * @param {string} content - The content to parse.
 * @returns {{toolCalls: Object[], positions: Object[]}} The parsed tool calls and their positions.
 */
function parseFunctionCalls(content) {
    log(5, 'mcpPlugin: parseFunctionCalls called');
    const toolCalls = [];
    const positions = [];
    const fullRegex = /(<dma:function_call\s*[^>]*?\/>)|(<dma:function_call\s*[^>]*?>[\s\S]*?<\/dma:function_call\s*>)/gi;
    let match;
    while ((match = fullRegex.exec(content)) !== null) {
        let snippet;
        if (match[1]) {
            // Self-closing tag
            snippet = match[1];
        } else if (match[2]) {
            // Non-self-closing tag
            snippet = match[2];
        } else {
            continue;
        }
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${snippet}</root>`, 'application/xml');
        if (doc.documentElement.localName === 'parsererror') {
            log(2, 'mcpPlugin: Invalid XML snippet in parseFunctionCalls');
            continue;
        }
        const functionCallNode = doc.querySelector('dma\\:function_call');
        if (functionCallNode) {
            const name = functionCallNode.getAttribute('name');
            const params = {};
            functionCallNode.querySelectorAll('parameter').forEach(param => {
                let value = param.textContent.trim();
                // Unescape escaped (not meant for execution) function calls.
                value = value.replace(/<\\\/dma:function_call>/g, '</dma:function_call>').replace(/<\\\/parameter>/g, '</parameter>');
                params[param.getAttribute('name')] = value;
            });
            toolCalls.push({ name, params });
            positions.push({ start: startIndex, end: endIndex });
        }
    }
    log(4, 'mcpPlugin: Parsed tool calls', toolCalls.length);
    return { toolCalls, positions };
}

/**
 * Initializes the MCP session.
 */
async function initMcpSession() {
    if (isInitialized) return;
    log(4, 'mcpPlugin: Initializing MCP session');
    const initParams = {
        protocolVersion: '2025-03-26', // Latest from spec; adjust if needed
        capabilities: {
            roots: { listChanged: false }, // Minimal; add more if client supports
            sampling: {} // Declare if client uses sampling
        },
        clientInfo: {
            name: 'GptChatClient',
            version: '1.0.0'
        }
    };
    const initData = await sendMcpRequest('initialize', initParams, true); // No session for init
    if (initData.protocolVersion !== '2025-03-26') {
        throw new Error(`Protocol version mismatch: requested 2025-03-26, got ${initData.protocolVersion}`);
    }
    log(4, 'mcpPlugin: Negotiated capabilities', initData.capabilities);
    // Check if session_id was set from header
    if (!mcpSessionId) {
        throw new Error('No session ID returned in initialize response header');
    }
    localStorage.setItem(`gptChat_mcpSession_${mcpUrl}`, mcpSessionId);
    // Send initialized notification
    await sendMcpRequest('notifications/initialized', {}, false, true); // Notification: no id
    isInitialized = true;
    log(4, 'mcpPlugin: MCP session initialized', mcpSessionId);
}

/**
 * Sends a JSON-RPC request to the MCP server.
 * @param {string} method - The JSON-RPC method.
 * @param {Object} [params={}] - The JSON-RPC parameters.
 * @param {boolean} [isInit=false] - Whether this is an initialization request.
 * @param {boolean} [isNotification=false] - Whether this is a notification.
 * @returns {Promise<Object|null>} The JSON-RPC result.
 */
async function sendMcpRequest(method, params = {}, isInit = false, isNotification = false) {
    const url = localStorage.getItem('gptChat_mcpServer');
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
    if (mcpSessionId && !isInit) {
        headers['mcp-session-id'] = mcpSessionId;
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
            mcpSessionId = headerSession;
            localStorage.setItem(`gptChat_mcpSession_${mcpUrl}`, mcpSessionId);
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
}

/**
 * Performs a JSON-RPC call to the MCP server.
 * @param {string} method - The JSON-RPC method.
 * @param {Object} [params={}] - The JSON-RPC parameters.
 * @param {boolean} [retry=false] - Whether to retry on session errors.
 * @returns {Promise<Object>} The JSON-RPC result.
 */
async function mcpJsonRpc(method, params = {}, retry = false) {
    log(5, 'mcpPlugin: mcpJsonRpc called with method', method, 'params', params);
    try {
        await initMcpSession(); // Ensure lifecycle is complete
        const result = await sendMcpRequest(method, params);
        log(4, 'mcpPlugin: MCP JSON-RPC success', result);
        return result;
    } catch (error) {
        log(1, 'mcpPlugin: MCP JSON-RPC failure', error);
        // Handle session-related errors by resetting and retrying once
        if (error.message.includes('Missing session ID') || error.message.includes('No valid session ID') || error.message.includes('Invalid session ID')) {
            localStorage.removeItem(`gptChat_mcpSession_${mcpUrl}`);
            mcpSessionId = null;
            isInitialized = false;
            if (!retry) {
                log(3, 'mcpPlugin: Retrying MCP call after session re-init');
                return mcpJsonRpc(method, params, true);
            }
        }
        throw new AggregateError(
            [error],
            `Failed to perform MCP JSON-RPC call.\nURL: ${mcpUrl}, Method: ${method}, Params: ${JSON.stringify(params)}.\nOriginal error: ${error.message || 'Unknown'}.`
        );
    }
}

/**
 * Escapes XML special characters.
 * @param {string} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}
