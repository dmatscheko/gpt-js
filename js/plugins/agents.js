/**
 * @fileoverview Plugin for agents and flow management.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';

// --- Helper Functions ---
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'})[c]);
}

function parseAgentCalls(content) {
    const toolCalls = [];
    const fullRegex = /(<dma:function_call\s*[^>]*?name="(\w+)_agent"[^>]*?\/>)|(<dma:function_call\s*[^>]*?name="(\w+)_agent"[^>]*?>[\s\S]*?<\/dma:function_call\s*>)/gi;
    let match;
    while ((match = fullRegex.exec(content)) !== null) {
        const snippet = match[1] || match[3];
        const agentName = match[2] || match[4];
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${snippet}</root>`, 'application/xml');
        const functionCallNode = doc.querySelector('dma\\:function_call');
        if (functionCallNode) {
            const promptNode = functionCallNode.querySelector('parameter[name="prompt"]');
            const prompt = promptNode ? promptNode.textContent.trim() : '';
            toolCalls.push({ agentName, prompt, callId: `agent_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` });
        }
    }
    return toolCalls;
}

// --- Agent Tab Functions ---
function renderAgentList(store) {
    const agentList = document.getElementById('agent-list');
    agentList.innerHTML = '';
    const chat = store.get('currentChat');
    if (!chat || !chat.agents) return;
    chat.agents.forEach(agent => {
        const card = document.createElement('div');
        const isActive = agent.id === chat.activeAgentId;
        card.className = `agent-card ${isActive ? 'active' : ''}`;
        card.innerHTML = `
            <h3>${agent.name}</h3><p>${agent.description}</p>
            <div class="agent-card-buttons">
                <button class="activate-agent-btn" data-id="${agent.id}">${isActive ? 'Deactivate' : 'Activate'}</button>
                <button class="edit-agent-btn" data-id="${agent.id}">Edit</button>
                <button class="delete-agent-btn" data-id="${agent.id}">Delete</button>
            </div>`;
        agentList.appendChild(card);
    });
}

function showAgentForm(agent) {
    const formContainer = document.getElementById('agent-form-container');
    const form = document.getElementById('agent-form');
    form.reset();
    document.getElementById('agent-id').value = agent ? agent.id : '';
    if (agent) {
        document.getElementById('agent-name').value = agent.name;
        document.getElementById('agent-description').value = agent.description;
        document.getElementById('agent-system-prompt').value = agent.systemPrompt;
        document.getElementById('agent-available-as-tool').checked = agent.availableAsTool;
    }
    formContainer.style.display = 'block';
}

function hideAgentForm() {
    document.getElementById('agent-form-container').style.display = 'none';
}

// --- Flow Tab Functions ---
function renderFlow(store) {
    const chat = store.get('currentChat');
    const nodeContainer = document.getElementById('flow-node-container');
    const svgLayer = document.getElementById('flow-svg-layer');
    nodeContainer.innerHTML = '';
    svgLayer.innerHTML = '';

    if (!chat || !chat.flow) return;

    // Render nodes
    (chat.flow.steps || []).forEach(step => {
        const node = document.createElement('div');
        node.className = 'flow-step-card';
        node.dataset.id = step.id;
        node.style.left = `${step.x}px`;
        node.style.top = `${step.y}px`;

        const agentOptions = (chat.agents || []).map(a => `<option value="${a.id}" ${step.agentId === a.id ? 'selected' : ''}>${a.name}</option>`).join('');
        node.innerHTML = `
            <div class="connector top" data-id="${step.id}" data-type="in"></div>
            <h4>Step</h4>
            <label>Agent:</label>
            <select class="flow-step-agent" data-id="${step.id}"><option value="">Select Agent</option>${agentOptions}</select>
            <label>Prompt:</label>
            <textarea class="flow-step-prompt" rows="3" data-id="${step.id}">${step.prompt || ''}</textarea>
            <button class="delete-flow-step-btn" data-id="${step.id}">Delete Step</button>
            <div class="connector bottom" data-id="${step.id}" data-type="out"></div>
        `;
        nodeContainer.appendChild(node);
    });

    // Render connections
    (chat.flow.connections || []).forEach(conn => {
        const fromNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.from}"]`);
        const toNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.to}"]`);
        if (fromNode && toNode) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const outConnector = fromNode.querySelector('.connector.bottom');
            const inConnector = toNode.querySelector('.connector.top');
            line.setAttribute('x1', fromNode.offsetLeft + outConnector.offsetLeft + outConnector.offsetWidth / 2);
            line.setAttribute('y1', fromNode.offsetTop + outConnector.offsetTop + outConnector.offsetHeight / 2);
            line.setAttribute('x2', toNode.offsetLeft + inConnector.offsetLeft + inConnector.offsetWidth / 2);
            line.setAttribute('y2', toNode.offsetTop + inConnector.offsetTop + inConnector.offsetHeight / 2);
            line.setAttribute('stroke', 'black');
            line.setAttribute('stroke-width', '2');
            line.dataset.from = conn.from;
            line.dataset.to = conn.to;
            svgLayer.appendChild(line);
        }
    });
}


const agentsPlugin = {
    name: 'agents',
    app: null,
    store: null,
    dragInfo: { active: false, target: null, offsetX: 0, offsetY: 0 },
    connectionInfo: { active: false, fromNode: null, fromConnector: null, tempLine: null },

    init: function(app) {
        this.app = app;
        this.store = app.store;

        // Tab switching
        document.getElementById('tabs').addEventListener('click', e => this.handleTabClick(e));

        // Agent UI
        document.getElementById('add-agent-btn').addEventListener('click', () => showAgentForm(null));
        document.getElementById('cancel-agent-form').addEventListener('click', hideAgentForm);
        document.getElementById('agent-form').addEventListener('submit', e => this.saveAgent(e));
        document.getElementById('agent-list').addEventListener('click', e => this.handleAgentListClick(e));

        // Flow UI
        document.getElementById('add-flow-step-btn').addEventListener('click', () => this.addFlowStep());
        document.getElementById('run-flow-btn').addEventListener('click', () => this.runFlow());

        const canvas = document.getElementById('flow-canvas');
        canvas.addEventListener('mousedown', e => this.handleFlowCanvasMouseDown(e));
        canvas.addEventListener('mousemove', e => this.handleFlowCanvasMouseMove(e));
        canvas.addEventListener('mouseup', e => this.handleFlowCanvasMouseUp(e));
        canvas.addEventListener('change', e => this.handleFlowStepChange(e));

        // Store Subscription
        this.store.subscribe('currentChat', () => {
            renderAgentList(this.store);
            renderFlow(this.store);
        });
    },

    handleTabClick(e) {
        if (e.target.classList.contains('tab-button')) {
            const tabName = e.target.dataset.tab;
            document.querySelectorAll('#tabs .tab-button, #tab-content .tab-pane').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`${tabName}-tab-pane`).classList.add('active');
        }
    },

    saveAgent(e) {
        e.preventDefault();
        const id = document.getElementById('agent-id').value;
        const agentData = {
            id: id || `agent-${Date.now()}`,
            name: document.getElementById('agent-name').value,
            description: document.getElementById('agent-description').value,
            systemPrompt: document.getElementById('agent-system-prompt').value,
            availableAsTool: document.getElementById('agent-available-as-tool').checked,
        };
        const chat = this.store.get('currentChat');
        if (!chat.agents) chat.agents = [];
        const index = chat.agents.findIndex(a => a.id === agentData.id);
        if (index > -1) chat.agents[index] = agentData;
        else chat.agents.push(agentData);
        this.store.set('currentChat', { ...chat });
        hideAgentForm();
    },

    handleAgentListClick(e) {
        const id = e.target.dataset.id;
        if (!id) return;
        const chat = this.store.get('currentChat');
        const agent = chat.agents.find(a => a.id === id);
        if (e.target.classList.contains('activate-agent-btn')) {
            chat.activeAgentId = chat.activeAgentId === id ? null : id;
        } else if (e.target.classList.contains('edit-agent-btn')) {
            showAgentForm(agent);
        } else if (e.target.classList.contains('delete-agent-btn')) {
            if (confirm(`Delete agent "${agent.name}"?`)) {
                chat.agents = chat.agents.filter(a => a.id !== id);
                if (chat.activeAgentId === id) chat.activeAgentId = null;
            }
        }
        this.store.set('currentChat', { ...chat });
    },

    addFlowStep() {
        const chat = this.store.get('currentChat');
        if (!chat.flow) chat.flow = { steps: [], connections: [] };
        const newStep = { id: `step-${Date.now()}`, agentId: '', prompt: '', x: 50, y: 50 };
        chat.flow.steps.push(newStep);
        this.store.set('currentChat', { ...chat });
    },

    handleFlowStepChange(e) {
        const id = e.target.dataset.id;
        const chat = this.store.get('currentChat');
        const step = chat.flow.steps.find(s => s.id === id);
        if (!step) return;
        if (e.target.classList.contains('flow-step-agent')) step.agentId = e.target.value;
        if (e.target.classList.contains('flow-step-prompt')) step.prompt = e.target.value;
        this.store.set('currentChat', { ...chat });
    },

    handleFlowCanvasMouseDown(e) {
        const target = e.target;
        if (target.classList.contains('connector')) {
            this.connectionInfo.active = true;
            this.connectionInfo.fromNode = target.closest('.flow-step-card');
            this.connectionInfo.fromConnector = target;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'red');
            line.setAttribute('stroke-width', '2');
            this.connectionInfo.tempLine = line;
            document.getElementById('flow-svg-layer').appendChild(line);
        } else if (target.closest('.flow-step-card')) {
            if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
            e.preventDefault();
            this.dragInfo.active = true;
            this.dragInfo.target = target.closest('.flow-step-card');
            this.dragInfo.offsetX = e.clientX - this.dragInfo.target.offsetLeft;
            this.dragInfo.offsetY = e.clientY - this.dragInfo.target.offsetTop;
        }
    },

    handleFlowCanvasMouseMove(e) {
        if (this.dragInfo.active) {
            const newX = e.clientX - this.dragInfo.offsetX;
            const newY = e.clientY - this.dragInfo.offsetY;
            this.dragInfo.target.style.left = `${newX}px`;
            this.dragInfo.target.style.top = `${newY}px`;
            const chat = this.store.get('currentChat');
            const step = chat.flow.steps.find(s => s.id === this.dragInfo.target.dataset.id);
            if (step) {
                step.x = newX;
                step.y = newY;
            }
            renderFlow(this.store);
        } else if (this.connectionInfo.active) {
            const fromRect = this.connectionInfo.fromConnector.getBoundingClientRect();
            const canvasRect = document.getElementById('flow-canvas-wrapper').getBoundingClientRect();
            const startX = fromRect.left - canvasRect.left + fromRect.width / 2 + document.getElementById('flow-canvas-wrapper').scrollLeft;
            const startY = fromRect.top - canvasRect.top + fromRect.height / 2 + document.getElementById('flow-canvas-wrapper').scrollTop;
            this.connectionInfo.tempLine.setAttribute('x1', startX);
            this.connectionInfo.tempLine.setAttribute('y1', startY);
            this.connectionInfo.tempLine.setAttribute('x2', e.clientX - canvasRect.left + document.getElementById('flow-canvas-wrapper').scrollLeft);
            this.connectionInfo.tempLine.setAttribute('y2', e.clientY - canvasRect.top + document.getElementById('flow-canvas-wrapper').scrollTop);
        }
    },

    handleFlowCanvasMouseUp(e) {
        if (this.dragInfo.active) {
            this.store.set('currentChat', { ...this.store.get('currentChat') });
        } else if (this.connectionInfo.active) {
            const toConnector = e.target;
            if (toConnector.classList.contains('connector') && toConnector !== this.connectionInfo.fromConnector) {
                const toNode = toConnector.closest('.flow-step-card');
                const fromId = this.connectionInfo.fromNode.dataset.id;
                const toId = toNode.dataset.id;
                const chat = this.store.get('currentChat');
                if (!chat.flow.connections) chat.flow.connections = [];
                chat.flow.connections.push({ from: fromId, to: toId });
                this.store.set('currentChat', { ...chat });
            }
            this.connectionInfo.tempLine.remove();
        }
        this.dragInfo.active = false;
        this.connectionInfo.active = false;
    },

    async runFlow() {
        log(3, 'Starting flow execution...');
        const chat = this.store.get('currentChat');
        const { steps, connections } = chat.flow;
        if (!steps || steps.length === 0) {
            triggerError('Flow has no steps.');
            return;
        }

        const stepIds = new Set(steps.map(s => s.id));
        const nodesWithIncoming = new Set(connections.map(c => c.to));
        const startingNodes = steps.filter(s => !nodesWithIncoming.has(s.id));

        if (startingNodes.length !== 1) {
            triggerError('Flow must have exactly one starting node.');
            return;
        }

        let currentNode = startingNodes[0];
        let stepCounter = 0;
        const maxSteps = 20;

        while (currentNode && stepCounter < maxSteps) {
            stepCounter++;
            const { agentId, prompt } = currentNode;
            if (!agentId || !prompt) {
                triggerError(`Step is not fully configured.`);
                return;
            }

            chat.activeAgentId = agentId;
            this.store.set('currentChat', { ...chat });

            await this.app.submitUserMessage(prompt, 'user');

            const nextConnection = connections.find(c => c.from === currentNode.id);
            currentNode = nextConnection ? steps.find(s => s.id === nextConnection.to) : null;
        }

        if (stepCounter >= maxSteps) {
            triggerError('Flow execution stopped: Maximum step limit reached.');
        }

        chat.activeAgentId = null;
        this.store.set('currentChat', { ...chat });
        log(3, 'Flow execution complete.');
    },

    hooks: {
        onModifySystemPrompt: (systemContent) => {
            const store = agentsPlugin.store;
            if (!store) return systemContent;
            const chat = store.get('currentChat');
            if (!chat || !chat.activeAgentId) return systemContent;
            const agent = chat.agents.find(a => a.id === chat.activeAgentId);
            if (!agent) return systemContent;
            let modified = systemContent + `\n\n--- AGENT DEFINITION ---\n${agent.systemPrompt}\n--- END AGENT DEFINITION ---\n`;
            const tools = chat.agents.filter(a => a.availableAsTool && a.id !== chat.activeAgentId);
            if (tools.length > 0) {
                modified += '\n\n--- AVAILABLE AGENT TOOLS ---\n';
                tools.forEach(t => { modified += `- ${t.name}: ${t.description}\n`; });
                modified += 'To call an agent tool, use: <dma:function_call name="agent_name_agent"><parameter name="prompt">...</parameter></dma:function_call>\n';
                modified += '--- END AVAILABLE AGENT TOOLS ---\n';
            }
            return modified;
        },
        onMessageComplete: async (message, chatlog, chatbox) => {
            if (message.value.role !== 'assistant') return;
            const agentCalls = parseAgentCalls(message.value.content);
            if (agentCalls.length === 0) return;
            const app = agentsPlugin.app;
            const store = agentsPlugin.store;
            const currentChat = store.get('currentChat');
            const toolResults = await Promise.all(agentCalls.map(async (call) => {
                const agentToCall = currentChat.agents.find(a => a.name.toLowerCase().replace(/\s+/g, '_') === call.agentName);
                if (!agentToCall) return { id: call.callId, error: `Agent "${call.agentName}" not found.` };
                const payload = {
                    model: app.configService.getModel() || document.querySelector('input[name="model"]:checked')?.value,
                    messages: [{ role: 'system', content: agentToCall.systemPrompt }, { role: 'user', content: call.prompt }],
                    temperature: Number(app.ui.temperatureEl.value), top_p: Number(app.ui.topPEl.value), stream: true
                };
                try {
                    const reader = await app.apiService.streamAPIResponse(payload, app.configService.getEndpoint(), app.configService.getApiKey(), new AbortController().signal);
                    let responseContent = '';
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const valueStr = new TextDecoder().decode(value);
                        valueStr.split('\n').forEach(chunk => {
                            if (chunk.startsWith('data: ')) {
                                chunk = chunk.substring(6);
                                if (chunk.trim() !== '[DONE]') {
                                    try { responseContent += JSON.parse(chunk).choices[0]?.delta?.content || ''; } catch (e) { log(2, 'Error parsing agent response chunk', e); }
                                }
                            }
                        });
                    }
                    return { id: call.callId, content: responseContent };
                } catch (error) {
                    log(1, 'Agent call failed', error);
                    return { id: call.callId, error: error.message || 'Unknown error during agent execution.' };
                }
            }));
            let toolContents = '';
            toolResults.forEach(tr => {
                const inner = tr.error ? `<error>\n${escapeXml(tr.error)}\n</error>` : `<content>\n${escapeXml(tr.content)}\n</content>`;
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

export { agentsPlugin };
