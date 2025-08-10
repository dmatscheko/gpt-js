'use strict';

import { log } from '../utils.js';

// This plugin enables AI models to use external tools via function calls,
// handles tool execution via a remote MCP (Model Context Protocol) server, and renders citations in the chat UI.

import { autoMcpEndpoint } from '../config.js';
if (autoMcpEndpoint !== '' && (localStorage.getItem('gptChat_mcpServer') == null || localStorage.getItem('gptChat_mcpServer') == '')) {
    localStorage.setItem('gptChat_mcpServer', autoMcpEndpoint);
}

let cachedToolsSection = '';

// Pre-fetch tools section asynchronously as soon as the module is loaded if MCP URL is set.
// This ensures it's likely available by the time beforeApiCall is invoked for the first time.
const mcpUrl = localStorage.getItem('gptChat_mcpServer');
if (mcpUrl && !cachedToolsSection) {
    log(4, 'mcpPlugin: Pre-fetching tools section from MCP', mcpUrl);
    mcpJsonRpc('get_tools_section').then(response => {
        cachedToolsSection = response;
        log(3, 'mcpPlugin: Tools section cached successfully');
    }).catch(error => {
        log(1, 'mcpPlugin: Failed to pre-fetch tools section', error);
        cachedToolsSection = ''; // Fallback to empty if fetch fails
    });
}

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

export const mcpPlugin = {
    name: 'mcp',
    hooks: {
        // Renders a settings input for the MCP server URL if not already present.
        onSettingsRender: function (settingsEl) {
            log(5, 'mcpPlugin: onSettingsRender called');
            if (settingsEl.querySelector('#mcpServer')) return;

            const p = document.createElement('p');
            const label = document.createElement('label');
            label.for = 'mcpServer';
            label.textContent = 'MCP Server URL';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'mcpServer';
            input.placeholder = 'e.g., http://localhost:3000/mcp';
            input.value = localStorage.getItem('gptChat_mcpServer') || '';
            input.addEventListener('input', () => localStorage.setItem('gptChat_mcpServer', input.value));
            p.appendChild(label);
            p.appendChild(document.createElement('br'));
            p.appendChild(input);
            settingsEl.appendChild(p);
        },
        // Appends tool descriptions to the system prompt before API calls if MCP is configured and tools are not already included.
        beforeApiCall: function (payload, chatbox) {
            log(5, 'mcpPlugin: beforeApiCall called');
            const mcpUrl = localStorage.getItem('gptChat_mcpServer');
            if (!mcpUrl || !cachedToolsSection) return;
            log(3, 'mcpPlugin: Appending tools section to system prompt');
            // Persist to chatlog and invalidate cache
            const systemMessage = chatbox.chatlog.getFirstMessage();
            if (systemMessage && !systemMessage.value.content.includes('## Tools:')) {
                systemMessage.value.content += toolsHeader + cachedToolsSection;
                systemMessage.cache = null;
                chatbox.update(true);  // Update UI immediately and scroll
            }
            return payload;
        },
        // Processes completed assistant messages: parses tool calls, executes them via MCP, marks calls as handled in content,
        // inserts result/error tags inline after each call, adds tool messages to chatlog, and auto-continues the response.
        onMessageComplete: function (message, chatbox) {
            log(5, 'mcpPlugin: onMessageComplete called for role', message.value?.role);
            if (!message.value || message.value.role !== 'assistant') return;

            const { toolCalls, positions } = parseFunctionCalls(message.value.content);
            if (toolCalls.length > 0) {
                log(3, 'mcpPlugin: Found tool calls', toolCalls.length);

                // Assign unique IDs to each tool call
                toolCalls.forEach((tc, index) => {
                    tc.id = `tool_${index + 1}_${Math.random().toString(36).substring(2, 7)}`;
                });

                // Modify content to add tool_call_id attributes (in reverse to avoid index shifts)
                let content = message.value.content;
                for (let i = positions.length - 1; i >= 0; i--) {
                    const pos = positions[i];
                    const gtIndex = content.indexOf('>', pos.start);
                    const insert = ` tool_call_id="${toolCalls[i].id}"`;
                    content = content.slice(0, gtIndex) + insert + content.slice(gtIndex);
                }
                message.value.content = content;
                message.cache = null;  // Invalidate cache after modification
                chatbox.update(false);  // Update UI (no scroll)

                Promise.all(toolCalls.map(async (tc, index) => {
                    log(4, 'mcpPlugin: Executing tool', tc.name, 'with params', tc.params);
                    try {
                        const result = await mcpJsonRpc('call_tool', { name: tc.name, arguments: tc.params });
                        if (tc.name === 'web_search' || tc.name === 'browse_page' || tc.name.startsWith('x_')) {
                            message.metadata = { ...message.metadata || {}, sources: result.sources || [] };
                            log(4, 'mcpPlugin: Added sources to metadata', result.sources?.length || 0);
                        }
                        // Conditionally stringify based on result type to avoid extra quotes on strings.
                        // Use String() for non-objects to handle numbers/booleans safely.
                        const content = (typeof result === 'object' && result !== null) ? JSON.stringify(result) : String(result);
                        return { content, error: null };
                    } catch (error) {
                        log(1, 'mcpPlugin: Tool execution error', error);
                        return { content: null, error: error.message || 'Unknown error' };
                    }
                })).then(toolResults => {
                    log(4, 'mcpPlugin: Processing tool results', toolResults.length);
                    // Modify content: add handled="true" to start tags (no result/error insertion inline)
                    let content = message.value.content;
                    for (let i = positions.length - 1; i >= 0; i--) {
                        const pos = positions[i];
                        const gtIndex = content.indexOf('>', pos.start);
                        const insert = ' handled="true"';
                        content = content.slice(0, gtIndex) + insert + content.slice(gtIndex);
                    }
                    message.value.content = content;
                    message.cache = null;  // Invalidate again after second modification
                    // Add tool results as XML-like tags in a single tool message
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
                        chatbox.chatlog.addMessage({ role: 'tool', content: toolContents });
                    }
                    // Auto-continue by streaming new assistant response
                    const controller = chatbox.store.get('controllerInstance');
                    const chatlog = chatbox.chatlog;
                    chatlog.addMessage(null);
                    chatbox.update();  // Final update (with scroll, as new messages added)
                    controller.generateAIResponse();
                });
            }
        },
        // Formats rendered content: replaces citation XML tags with HTML superscript links using message metadata sources.
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
                    a.style.color = 'red'; // Visual indicator
                }
                a.textContent = `[${id}]`;
                sup.appendChild(a);
                node.parentNode.replaceChild(sup, node);
            });
        }
    }
};

// Robust parser for <dma:function_call> tags that extracts tool calls without full-content XML parsing,
// handles unescaping of special tags, and returns positions for later content modifications.
function parseFunctionCalls(content) {
    log(5, 'mcpPlugin: parseFunctionCalls called');
    const toolCalls = [];
    const positions = []; // Track start/end indices for each call
    // Regex to match <dma:function_call ...> allowing attributes and whitespace

    const startRegex = /<dma:function_call\s*(?:[^>]*?)>/gi;
    let match;
    let lastIndex = 0;
    while ((match = startRegex.exec(content)) !== null) {
        const startIndex = match.index;
        const endIndex = content.indexOf('</dma:function_call>', startIndex);
        if (endIndex === -1) break;

        const snippet = content.substring(startIndex, endIndex + 20); // 20 = length of </dma:function_call>
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${snippet}</root>`, 'application/xml'); // Wrap snippet only

        if (doc.documentElement.localName === 'parsererror') {
            log(2, 'mcpPlugin: Invalid XML snippet in parseFunctionCalls');
            // Skip invalid snippet, move past to avoid infinite loop
            lastIndex = startIndex + snippet.length;
            continue;
        }

        const functionCallNode = doc.querySelector('dma\\:function_call');
        if (functionCallNode) {
            if (functionCallNode.getAttribute('handled') === 'true') {
                log(4, 'mcpPlugin: Skipping already handled tool call');
                lastIndex = endIndex + 20;
                continue;
            }
            const name = functionCallNode.getAttribute('name');
            const params = {};
            functionCallNode.querySelectorAll('parameter').forEach(param => {
                let value = param.textContent.trim();
                // Unescape special cases as per instructions
                value = value.replace(/<\\\/dma:function_call>/g, '</dma:function_call>').replace(/<\\\/parameter>/g, '</parameter');
                params[param.getAttribute('name')] = value;
            });
            toolCalls.push({ name, params });
            positions.push({ start: startIndex, end: endIndex + 20 });
        }
        lastIndex = endIndex + 20;
    }

    log(4, 'mcpPlugin: Parsed tool calls', toolCalls.length);
    return { toolCalls, positions };
}

// Performs JSON-RPC calls to the MCP server for tool execution,
// throwing detailed errors on failure.
async function mcpJsonRpc(method, params = {}) {
    log(5, 'mcpPlugin: mcpJsonRpc called with method', method, 'params', params);
    const url = localStorage.getItem('gptChat_mcpServer');
    if (!url) throw new Error('No MCP server URL set');

    const body = {
        jsonrpc: '2.0',
        method,
        params,
        id: Math.floor(Math.random() * 1000000)
    };

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errorText = await resp.text(); // Fetch body for more details
            log(1, 'mcpPlugin: MCP response not ok', resp.status, resp.statusText, errorText);
            throw new Error(`MCP error: ${resp.statusText} - ${errorText}`);
        }
        const data = await resp.json();
        if (data.error) {
            log(1, 'mcpPlugin: MCP JSON-RPC error', data.error);
            throw new Error(data.error.message || 'MCP call failed');
        }
        log(4, 'mcpPlugin: MCP JSON-RPC success', data.result);
        return data.result;
    } catch (error) {
        log(1, 'mcpPlugin: MCP JSON-RPC failure', error);
        throw new AggregateError(
            [error],
            `Failed to perform MCP JSON-RPC call.\nURL: ${url}, Method: ${method}, Params: ${JSON.stringify(params)}.\nOriginal error: ${error.message || 'Unknown'}.`
        );
    }
}

// Escape XML special characters for safe insertion into tags
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
