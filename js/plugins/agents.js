'use strict';

import { log } from '../utils/logger.js';

function createAgentForm(agent = {}, onSave, onCancel) {
    const form = document.createElement('div');
    form.classList.add('agent-form');
    form.innerHTML = `
        <h3>${agent.id ? 'Edit' : 'Add'} Agent</h3>
        <input type="text" id="agent-name" placeholder="Agent Name" value="${agent.name || ''}" required>
        <textarea id="agent-description" placeholder="Agent Description">${agent.description || ''}</textarea>
        <textarea id="agent-system-prompt" placeholder="System Prompt">${agent.systemPrompt || ''}</textarea>
        <label style="display: block; margin-top: 10px;">
            <input type="checkbox" id="agent-is-tool" ${agent.isTool ? 'checked' : ''}>
            Available as a tool for other agents
        </label>
        <div style="margin-top: 10px;">
            <button id="save-agent-btn">Save</button>
            <button id="cancel-agent-btn">Cancel</button>
        </div>
    `;

    form.querySelector('#save-agent-btn').addEventListener('click', () => {
        const newAgentData = {
            id: agent.id || Date.now().toString(),
            name: form.querySelector('#agent-name').value,
            description: form.querySelector('#agent-description').value,
            systemPrompt: form.querySelector('#agent-system-prompt').value,
            isTool: form.querySelector('#agent-is-tool').checked,
        };
        onSave(newAgentData);
    });

    form.querySelector('#cancel-agent-btn').addEventListener('click', onCancel);

    return form;
}

function renderAgentsTab(chat, chatService) {
    const container = document.getElementById('agents-tab');
    if (!container) return;
    container.innerHTML = ''; // Clear previous content

    const header = document.createElement('h2');
    header.textContent = 'Agents';
    container.appendChild(header);

    const formContainer = document.createElement('div');
    formContainer.id = 'agent-form-container';
    container.appendChild(formContainer);

    const agentList = document.createElement('div');
    agentList.id = 'agent-list';
    container.appendChild(agentList);

    const agents = chat.agents || [];

    if (agents.length > 0) {
        agents.forEach(agent => {
            const agentEl = document.createElement('div');
            agentEl.classList.add('agent-item');
            agentEl.innerHTML = `
                <h3>${agent.name}</h3>
                <p>${agent.description}</p>
                <button class="edit-agent-btn" data-id="${agent.id}">Edit</button>
                <button class="delete-agent-btn" data-id="${agent.id}">Delete</button>
            `;
            agentList.appendChild(agentEl);
        });
    } else {
        const p = document.createElement('p');
        p.textContent = 'No agents defined for this chat.';
        agentList.appendChild(p);
    }

    const addAgentBtn = document.createElement('button');
    addAgentBtn.id = 'add-agent-btn';
    addAgentBtn.textContent = 'Add Agent';
    container.appendChild(addAgentBtn);

    addAgentBtn.addEventListener('click', () => {
        const form = createAgentForm(null, (newAgent) => {
            chat.agents.push(newAgent);
            chatService.persistChats();
            renderAgentsTab(chat, chatService); // Re-render
        }, () => {
            formContainer.innerHTML = ''; // Clear form
        });
        formContainer.innerHTML = '';
        formContainer.appendChild(form);
    });

    agentList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('edit-agent-btn')) {
            const agentId = target.dataset.id;
            const agent = agents.find(a => a.id === agentId);
            if (agent) {
                const form = createAgentForm(agent, (updatedAgent) => {
                    const index = agents.findIndex(a => a.id === updatedAgent.id);
                    if (index !== -1) {
                        agents[index] = updatedAgent;
                    }
                    chatService.persistChats();
                    renderAgentsTab(chat, chatService);
                }, () => {
                    formContainer.innerHTML = '';
                });
                formContainer.innerHTML = '';
                formContainer.appendChild(form);
            }
        }

        if (target.classList.contains('delete-agent-btn')) {
            const agentId = target.dataset.id;
            if (window.confirm('Are you sure you want to delete this agent?')) {
                const index = agents.findIndex(a => a.id === agentId);
                if (index !== -1) {
                    agents.splice(index, 1);
                    chatService.persistChats();
                    renderAgentsTab(chat, chatService);
                }
            }
        }
    });
}


function renderConnections(flow, container) {
    const svg = container.querySelector('#flow-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous connections

    if (flow.connections && flow.connections.length > 0) {
        flow.connections.forEach(conn => {
            const fromNodeEl = container.querySelector(`.flow-node[data-id="${conn.from}"]`);
            const toNodeEl = container.querySelector(`.flow-node[data-id="${conn.to}"]`);

            if (fromNodeEl && toNodeEl) {
                const outConnector = fromNodeEl.querySelector('.flow-connector-out');
                const inConnector = toNodeEl.querySelector('.flow-connector-in');

                const x1 = fromNodeEl.offsetLeft + outConnector.offsetLeft + outConnector.offsetWidth / 2;
                const y1 = fromNodeEl.offsetTop + outConnector.offsetTop + outConnector.offsetHeight / 2;
                const x2 = toNodeEl.offsetLeft + inConnector.offsetLeft + inConnector.offsetWidth / 2;
                const y2 = toNodeEl.offsetTop + inConnector.offsetTop + inConnector.offsetHeight / 2;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const curve = `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`;
                path.setAttribute('d', curve);
                path.setAttribute('stroke', '#333');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('fill', 'none');
                svg.appendChild(path);
            }
        });
    }
}

class FlowExecutor {
    constructor(app) {
        this.app = app;
        this.MAX_STEPS = 100;
    }

    async run(flow, agents) {
        console.log("Running flow...", flow);
        this.stepCount = 0;

        const startNodes = this.findStartNodes(flow);

        if (startNodes.length === 0) {
            alert("Cannot run flow: No start node found (a node with no incoming connections).");
            return;
        }

        console.log("Start nodes:", startNodes.map(n => n.name));

        for (const startNode of startNodes) {
            await this.executeNode(startNode, flow, agents);
        }
    }

    findStartNodes(flow) {
        if (!flow || !flow.connections) return flow.nodes || [];
        const incomingConnections = new Set(flow.connections.map(c => c.to));
        return flow.nodes.filter(n => !incomingConnections.has(n.id));
    }

    async executeNode(node, flow, agents) {
        this.stepCount++;
        if (this.stepCount > this.MAX_STEPS) {
            alert(`Flow execution stopped: Maximum step limit of ${this.MAX_STEPS} reached. This is a safety measure to prevent infinite loops.`);
            this.app.store.set('receiving', false); // Ensure UI is unlocked
            return;
        }

        console.log(`Executing node: ${node.name}`);
        const agent = agents.find(a => a.id === node.agentId);
        if (!agent) {
            const errorMsg = `Agent with id ${node.agentId} not found for node ${node.name}`;
            console.error(errorMsg);
            alert(errorMsg);
            return;
        }

        const chatlog = this.app.chatService.getCurrentChatlog();
        if (!chatlog) {
            alert("Error: Could not find current chatlog.");
            return;
        }

        this.app.store.set('receiving', true);

        // Add a user message to represent the flow step
        chatlog.addMessage({ role: 'user', content: `--- Executing Flow Step: ${node.name} ---\n${node.message}` });

        // Prepare the payload for the API call
        const messages = chatlog.getActiveMessageValues();
        // Create a temporary clone of messages to avoid modifying the original chatlog's system prompt permanently
        const executionMessages = JSON.parse(JSON.stringify(messages));
        executionMessages[0].content = agent.systemPrompt;

        const payload = {
            model: this.app.configService.getModel(),
            messages: executionMessages,
            stream: true,
            temperature: Number(this.app.ui.temperatureEl.value),
            top_p: Number(this.app.ui.topPEl.value),
        };

        // Add a placeholder for the assistant's response
        const assistantMsg = chatlog.addMessage({ role: 'assistant', content: null });
        chatlog.notify();

        try {
            const reader = await this.app.apiService.streamAPIResponse(
                payload,
                this.app.configService.getEndpoint(),
                this.app.configService.getApiKey(),
                this.app.store.get('controller').signal
            );

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const valueStr = new TextDecoder().decode(value);
                if (valueStr.startsWith('{')) {
                    const data = JSON.parse(valueStr);
                    if (data.error) throw new Error(data.error.message);
                }
                const chunks = valueStr.split('\n');
                let delta = '';
                chunks.forEach(chunk => {
                    if (!chunk.startsWith('data: ')) return;
                    chunk = chunk.substring(6);
                    if (chunk === '' || chunk === '[DONE]') return;
                    const data = JSON.parse(chunk);
                    if (data.error) throw new Error(data.error.message);
                    delta += data.choices[0].delta.content || '';
                });
                if (delta) {
                    assistantMsg.appendContent(delta);
                    chatlog.notify();
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Flow execution error:", error);
                assistantMsg.setContent(`[Error during flow execution: ${error.message}]`);
                chatlog.notify();
            } else {
                assistantMsg.appendContent('\n\n[Response aborted by user]');
                assistantMsg.cache = null;
                chatlog.notify();
            }
        } finally {
            this.app.store.set('receiving', false);
            this.app.chatService.persistChats();
        }

        const nextNodes = this.findNextNodes(node, flow);
        for (const nextNode of nextNodes) {
            await this.executeNode(nextNode, flow, agents);
        }
    }

    findNextNodes(currentNode, flow) {
        if (!flow || !flow.connections) return [];
        const nextNodeIds = flow.connections
            .filter(c => c.from === currentNode.id)
            .map(c => c.to);

        return flow.nodes.filter(n => nextNodeIds.includes(n.id));
    }
}


function renderFlowTab(chat, chatService, app) {
    const container = document.getElementById('flow-tab');
    if (!container) return;
    container.innerHTML = ''; // Clear previous content

    const header = document.createElement('h2');
    header.textContent = 'Flow';
    container.appendChild(header);

    const flowContainer = document.createElement('div');
    flowContainer.id = 'flow-container';
    container.appendChild(flowContainer);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'flow-svg';
    flowContainer.appendChild(svg);

    const flow = chat.flow || { nodes: [], connections: [] };

    // Render nodes
    if (flow.nodes && flow.nodes.length > 0) {
        flow.nodes.forEach(node => {
            const nodeEl = document.createElement('div');
            nodeEl.classList.add('flow-node');
            nodeEl.dataset.id = node.id;
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;

            nodeEl.innerHTML = `
                <div class="flow-node-title">${node.name || 'Unnamed Step'}</div>
                <div class="flow-node-content">${node.message || 'No message'}</div>
                <div class="flow-connector-in"></div>
                <div class="flow-connector-out"></div>
            `;
            flowContainer.appendChild(nodeEl);
        });
    } else {
        const p = document.createElement('p');
        p.textContent = 'No flow steps defined for this chat. Add a step to get started.';
        flowContainer.appendChild(p);
    }

    renderConnections(flow, flowContainer);

    // TODO: Render connections

    const addStepBtn = document.createElement('button');
    addStepBtn.id = 'add-step-btn';
    addStepBtn.textContent = 'Add Step';
    container.appendChild(addStepBtn);

    addStepBtn.addEventListener('click', () => {
        // TODO: Implement logic to add a new step
        const newNode = {
            id: Date.now().toString(),
            name: 'New Step',
            message: 'Hello!',
            x: 50,
            y: 50,
            agentId: null // User will need to configure this
        };
        if (!chat.flow) {
            chat.flow = { nodes: [], connections: [] };
        }
        chat.flow.nodes.push(newNode);
        chatService.persistChats();
        renderFlowTab(chat, chatService);
    });

    const runFlowBtn = document.createElement('button');
    runFlowBtn.id = 'run-flow-btn';
    runFlowBtn.textContent = 'Run Flow';
    container.appendChild(runFlowBtn);

    runFlowBtn.addEventListener('click', () => {
        const executor = new FlowExecutor(app);
        executor.run(chat.flow, chat.agents);
    });

    // Drag and drop logic
    let draggedNode = null;
    let offsetX, offsetY;

    flowContainer.addEventListener('mousedown', (event) => {
        const target = event.target;

        // Handle connection drawing
        if (target.classList.contains('flow-connector-out')) {
            event.stopPropagation();
            const fromNode = target.closest('.flow-node');
            const fromNodeId = fromNode.dataset.id;

            const svg = flowContainer.querySelector('#flow-svg');
            const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempLine.setAttribute('stroke', '#333');
            tempLine.setAttribute('stroke-width', '2');
            tempLine.setAttribute('fill', 'none');
            tempLine.style.pointerEvents = 'none'; // Make sure line doesn't intercept mouse events
            svg.appendChild(tempLine);

            const startX = fromNode.offsetLeft + target.offsetLeft + target.offsetWidth / 2;
            const startY = fromNode.offsetTop + target.offsetTop + target.offsetHeight / 2;

            function onConnectionDrawMove(e) {
                const rect = flowContainer.getBoundingClientRect();
                const endX = e.clientX - rect.left;
                const endY = e.clientY - rect.top;
                const curve = `M ${startX} ${startY} C ${startX} ${startY + 50}, ${endX} ${endY - 50}, ${endX} ${endY}`;
                tempLine.setAttribute('d', curve);
            }

            function onConnectionDrawUp(e) {
                tempLine.remove();
                document.removeEventListener('mousemove', onConnectionDrawMove);
                document.removeEventListener('mouseup', onConnectionDrawUp);

                const toConnector = e.target.closest('.flow-connector-in');
                if (toConnector) {
                    const toNode = toConnector.closest('.flow-node');
                    const toNodeId = toNode.dataset.id;

                    const newConnection = { from: fromNodeId, to: toNodeId };
                    if (!chat.flow.connections) {
                        chat.flow.connections = [];
                    }
                    // Avoid duplicate connections
                    const exists = chat.flow.connections.some(c => c.from === fromNodeId && c.to === toNodeId);
                    if (!exists) {
                        chat.flow.connections.push(newConnection);
                        chatService.persistChats();
                        renderFlowTab(chat, chatService);
                    }
                }
            }

            document.addEventListener('mousemove', onConnectionDrawMove);
            document.addEventListener('mouseup', onConnectionDrawUp);
            return; // Exit to not trigger node dragging
        }

        // Handle node dragging
        const nodeTarget = target.closest('.flow-node');
        if (nodeTarget) {
            draggedNode = nodeTarget;
            draggedNode.style.cursor = 'grabbing';
            offsetX = event.clientX - draggedNode.offsetLeft;
            offsetY = event.clientY - draggedNode.offsetTop;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    });

    function onMouseMove(event) {
        if (!draggedNode) return;
        let x = event.clientX - offsetX;
        let y = event.clientY - offsetY;

        // Snap to grid or constrain to container if needed
        x = Math.max(0, x);
        y = Math.max(0, y);

        draggedNode.style.left = `${x}px`;
        draggedNode.style.top = `${y}px`;
        renderConnections(flow, flowContainer);
    }

    function onMouseUp() {
        if (!draggedNode) return;
        draggedNode.style.cursor = 'grab';

        const nodeId = draggedNode.dataset.id;
        const node = flow.nodes.find(n => n.id === nodeId);
        if (node) {
            node.x = draggedNode.offsetLeft;
            node.y = draggedNode.offsetTop;
            chatService.persistChats();
        }

        draggedNode = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function parseFunctionCalls(content) {
    log(5, 'agentsPlugin: parseFunctionCalls called');
    const toolCalls = [];
    const positions = [];
    const fullRegex = /(<dma:function_call\s*[^>]*?\/>)|(<dma:function_call\s*[^>]*?>[\s\S]*?<\/dma:function_call\s*>)/gi;
    let match;
    while ((match = fullRegex.exec(content)) !== null) {
        let snippet;
        if (match[1]) {
            snippet = match[1];
        } else if (match[2]) {
            snippet = match[2];
        } else {
            continue;
        }
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${snippet}</root>`, 'application/xml');
        if (doc.documentElement.localName === 'parsererror') {
            log(2, 'agentsPlugin: Invalid XML snippet in parseFunctionCalls');
            continue;
        }
        const functionCallNode = doc.querySelector('dma\\:function_call');
        if (functionCallNode) {
            const name = functionCallNode.getAttribute('name');
            const toolCallId = functionCallNode.getAttribute('tool_call_id');
            const params = {};
            functionCallNode.querySelectorAll('parameter').forEach(param => {
                let value = param.textContent.trim();
                value = value.replace(/<\\\/dma:function_call>/g, '</dma:function_call>').replace(/<\\\/parameter>/g, '</parameter>');
                params[param.getAttribute('name')] = value;
            });
            toolCalls.push({ name, params, id: toolCallId });
            positions.push({ start: startIndex, end: endIndex });
        }
    }
    log(4, 'agentsPlugin: Parsed tool calls', toolCalls.length);
    return { toolCalls, positions };
}

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

export const agentsPlugin = {
    name: 'agents',
    init: function(app) {
        this.app = app;
        app.store.subscribe('currentChat', (chat) => {
            if (chat) {
                renderAgentsTab(chat, app.chatService);
                renderFlowTab(chat, app.chatService, app);
            } else {
                const agentsContainer = document.getElementById('agents-tab');
                if (agentsContainer) {
                    agentsContainer.innerHTML = '<p>No chat selected.</p>';
                }
                const flowContainer = document.getElementById('flow-tab');
                if (flowContainer) {
                    flowContainer.innerHTML = '<p>No chat selected.</p>';
                }
            }
        });
    },
    hooks: {
        beforeApiCall: function(payload, chatbox) {
            const currentChat = this.app.store.get('currentChat');
            if (!currentChat || !currentChat.agents || currentChat.agents.length === 0) {
                return payload;
            }

            const agentsAsTools = currentChat.agents
                .filter(agent => agent.isTool)
                .map(agent => ({
                name: agent.name.replace(/\s+/g, '_').toLowerCase(),
                description: agent.description,
                inputSchema: {
                    type: 'object',
                    properties: {
                        prompt: {
                            type: 'string',
                            description: `The prompt to send to the ${agent.name} agent.`
                        }
                    },
                    required: ['prompt']
                }
            }));

            if (agentsAsTools.length > 0) {
                const toolsHeader = `

## Available Agents (as Tools):

You can call other agents as tools. Use the same format as for other tools.

`;
                const toolsSection = generateToolsSection(agentsAsTools);

                if (payload.messages[0] && payload.messages[0].role === 'system') {
                    payload.messages[0].content += toolsHeader + toolsSection;
                }
            }

            return payload;
        },
        onMessageComplete: async function(message, chatlog, chatbox) {
            if (!message.value || message.value.role !== 'assistant') return;

            const currentChat = this.app.store.get('currentChat');
            if (!currentChat || !currentChat.agents || currentChat.agents.length === 0) {
                return;
            }

            const agentToolNames = currentChat.agents.map(a => a.name.replace(/\s+/g, '_').toLowerCase());
            const { toolCalls, positions } = parseFunctionCalls(message.value.content);
            const agentCalls = toolCalls.filter(tc => agentToolNames.includes(tc.name));

            if (agentCalls.length === 0) {
                return;
            }

            log(3, 'agentsPlugin: Found agent calls', agentCalls.length);

            agentCalls.forEach((ac, index) => {
                if (!ac.id) ac.id = `agent_call_${index + 1}_${Math.random().toString(36).substring(2, 7)}`;
            });

            let content = message.value.content;
            for (let i = positions.length - 1; i >= 0; i--) {
                const pos = positions[i];
                const call = toolCalls[i];
                if (agentCalls.includes(call)) {
                    const gtIndex = content.indexOf('>', pos.start);
                    let startTag = content.slice(pos.start, gtIndex + 1);
                    if (!startTag.includes('tool_call_id')) {
                         const insert = ` tool_call_id="${call.id}"`;
                        startTag = startTag.slice(0, -1) + insert + '>';
                        content = content.slice(0, pos.start) + startTag + content.slice(gtIndex + 1);
                    }
                }
            }
            message.value.content = content;
            message.cache = null;
            chatbox.update(false);

            const toolResults = [];

            for (const call of agentCalls) {
                const targetAgent = currentChat.agents.find(a => a.name.replace(/\s+/g, '_').toLowerCase() === call.name);
                const prompt = call.params.prompt || '';
                let responseContent = '';
                let responseError = null;

                try {
                    const payload = {
                        model: this.app.configService.getModel(),
                        messages: [
                            { role: 'system', content: targetAgent.systemPrompt },
                            { role: 'user', content: prompt }
                        ],
                        stream: true
                    };

                    const reader = await this.app.apiService.streamAPIResponse(
                        payload,
                        this.app.configService.getEndpoint(),
                        this.app.configService.getApiKey(),
                        new AbortController().signal
                    );

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const valueStr = new TextDecoder().decode(value);
                        if (valueStr.startsWith('{')) {
                            const data = JSON.parse(valueStr);
                            if (data.error) throw new Error(data.error.message);
                        }
                        const chunks = valueStr.split('\n');
                        chunks.forEach(chunk => {
                            if (!chunk.startsWith('data: ')) return;
                            chunk = chunk.substring(6);
                            if (chunk === '' || chunk === '[DONE]') return;
                            const data = JSON.parse(chunk);
                            if (data.error) throw new Error(data.error.message);
                            responseContent += data.choices[0].delta.content || '';
                        });
                    }
                } catch (error) {
                    log(1, 'agentsPlugin: Sub-agent call error', error);
                    responseError = error.message || 'Unknown error';
                }

                toolResults.push({ id: call.id, content: responseContent, error: responseError });
            }

            let toolContents = '';
            toolResults.forEach(tr => {
                const inner = tr.error
                    ? `<error>\n${escapeXml(tr.error)}\n</error>`
                    : `<content>\n${escapeXml(tr.content)}\n</content>`;
                toolContents += `<dma:tool_response tool_call_id="${tr.id}">\n${inner}\n</dma:tool_response>\n`;
            });

            if (toolContents) {
                chatlog.addMessage({ role: 'tool', content: toolContents });
                chatlog.addMessage(null);
                chatbox.update();
                hooks.onGenerateAIResponse.forEach(fn => fn({}, chatlog));
            }
        }
    }
};
