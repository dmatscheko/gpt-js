/**
 * @fileoverview Plugin for agents and flow management.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';
import { parseFunctionCalls } from '../utils/parsers.js';

// --- Helper Functions ---
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'})[c]);
}

// --- UI Rendering Functions ---
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
                <button class="agents-flow-btn activate-agent-btn" data-id="${agent.id}">${isActive ? 'Deactivate' : 'Activate'}</button>
                <button class="agents-flow-btn edit-agent-btn" data-id="${agent.id}">Edit</button>
                <button class="agents-flow-btn delete-agent-btn" data-id="${agent.id}">Delete</button>
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

function renderFlow(store) {
    const chat = store.get('currentChat');
    const nodeContainer = document.getElementById('flow-node-container');
    const svgLayer = document.getElementById('flow-svg-layer');
    nodeContainer.innerHTML = '';
    svgLayer.innerHTML = '';
    if (!chat || !chat.flow) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', 'var(--text-color)');
    marker.appendChild(path);
    defs.appendChild(marker);
    svgLayer.appendChild(defs);

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
            <button class="delete-flow-step-btn agents-flow-btn" data-id="${step.id}">Delete Step</button>
            <div class="connector bottom" data-id="${step.id}" data-type="out"></div>
        `;
        nodeContainer.appendChild(node);
    });

    (chat.flow.connections || []).forEach(conn => {
        const fromNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.from}"]`);
        const toNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.to}"]`);
        if (fromNode && toNode) {
            const outConnector = fromNode.querySelector('.connector.bottom');
            const inConnector = toNode.querySelector('.connector.top');
            const x1 = fromNode.offsetLeft + outConnector.offsetLeft + outConnector.offsetWidth / 2;
            const y1 = fromNode.offsetTop + outConnector.offsetTop + outConnector.offsetHeight / 2;
            const x2 = toNode.offsetLeft + inConnector.offsetLeft + inConnector.offsetWidth / 2;
            const y2 = toNode.offsetTop + inConnector.offsetTop + inConnector.offsetHeight / 2;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'var(--text-color)');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            svgLayer.appendChild(line);

            // Create a proper HTML button for deleting connections
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&#x1F5D1;'; // Trash can emoji
            deleteBtn.className = 'delete-connection-btn agents-flow-btn';
            deleteBtn.dataset.from = conn.from;
            deleteBtn.dataset.to = conn.to;
            deleteBtn.style.position = 'absolute';
            deleteBtn.style.left = `${(x1 + x2) / 2 - 15}px`;
            deleteBtn.style.top = `${(y1 + y2) / 2 - 15}px`;
            deleteBtn.style.zIndex = '10';
            nodeContainer.appendChild(deleteBtn);
        }
    });
}

// --- Main Plugin Object ---
const agentsPlugin = {
    name: 'agents',
    app: null,
    store: null,
    flowRunning: false,
    currentStepId: null,
    stepCounter: 0,
    maxSteps: 20,
    dragInfo: { active: false, target: null, offsetX: 0, offsetY: 0 },
    connectionInfo: { active: false, fromNode: null, fromConnector: null, tempLine: null },

    init: function(app) {
        this.app = app;
        this.store = app.store;

        // --- Event Listeners ---
        // Tab switching
        document.getElementById('tabs').addEventListener('click', e => this.handleTabClick(e));
        // Agent UI
        document.getElementById('add-agent-btn').addEventListener('click', () => showAgentForm(null));
        document.getElementById('cancel-agent-form').addEventListener('click', hideAgentForm);
        document.getElementById('agent-form').addEventListener('submit', e => this.saveAgent(e));
        document.getElementById('agent-list').addEventListener('click', e => this.handleAgentListClick(e));
        // Flow UI
        document.getElementById('add-flow-step-btn').addEventListener('click', () => this.addFlowStep());
        document.getElementById('run-flow-btn').addEventListener('click', () => this.toggleFlow());
        const canvas = document.getElementById('flow-canvas');
        canvas.addEventListener('mousedown', e => this.handleFlowCanvasMouseDown(e));
        canvas.addEventListener('mousemove', e => this.handleFlowCanvasMouseMove(e));
        canvas.addEventListener('mouseup', e => this.handleFlowCanvasMouseUp(e));
        canvas.addEventListener('change', e => this.handleFlowStepChange(e));
        canvas.addEventListener('click', e => this.handleFlowCanvasClick(e));

        // --- Store Subscription ---
        this.store.subscribe('currentChat', () => {
            renderAgentList(this.store);
            setTimeout(() => renderFlow(this.store), 0);
        });

        // --- Hooks ---
        hooks.onCancel.push(() => {
            if (this.flowRunning) this.stopFlow('Execution cancelled by user.');
        });
    },

    // --- Event Handlers ---
    handleTabClick(e) {
        if (e.target.classList.contains('tab-button')) {
            const tabName = e.target.dataset.tab;
            if (tabName === 'flow') {
                setTimeout(() => renderFlow(this.store), 0);
            }
            document.querySelectorAll('#tabs .tab-button, #tab-content .tab-pane').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`${tabName}-tab-pane`).classList.add('active');
        }
    },

    saveAgent(e) {
        e.preventDefault();
        const id = document.getElementById('agent-id').value;
        const agentData = { id: id || `agent-${Date.now()}`, name: document.getElementById('agent-name').value, description: document.getElementById('agent-description').value, systemPrompt: document.getElementById('agent-system-prompt').value, availableAsTool: document.getElementById('agent-available-as-tool').checked };
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
        if (e.target.classList.contains('activate-agent-btn')) {
            chat.activeAgentId = chat.activeAgentId === id ? null : id;
        } else if (e.target.classList.contains('edit-agent-btn')) {
            const agent = chat.agents.find(a => a.id === id);
            showAgentForm(agent);
        } else if (e.target.classList.contains('delete-agent-btn')) {
            if (confirm(`Delete agent?`)) {
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

    handleFlowCanvasClick(e) {
        const target = e.target;

        // Prevent interference with form elements inside a step card
        if (target.closest('.flow-step-card') && ['TEXTAREA', 'SELECT', 'OPTION', 'LABEL'].includes(target.tagName)) {
            return;
        }

        const chat = this.store.get('currentChat');
        let chatModified = false;

        if (target.classList.contains('delete-flow-step-btn')) {
            const stepId = target.dataset.id;
            if (stepId && confirm('Are you sure you want to delete this step?')) {
                chat.flow.steps = chat.flow.steps.filter(s => s.id !== stepId);
                chat.flow.connections = (chat.flow.connections || []).filter(c => c.from !== stepId && c.to !== stepId);
                chatModified = true;
            }
        } else if (target.classList.contains('delete-connection-btn')) {
            const fromId = target.dataset.from;
            const toId = target.dataset.to;
            if (fromId && toId && confirm('Are you sure you want to delete this connection?')) {
                chat.flow.connections = (chat.flow.connections || []).filter(c => !(c.from === fromId && c.to === toId));
                chatModified = true;
            }
        }

        if (chatModified) {
            this.store.set('currentChat', { ...chat });
        }
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
        } else if (target.closest('.flow-step-card') && !['SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) {
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
            const step = this.store.get('currentChat').flow.steps.find(s => s.id === this.dragInfo.target.dataset.id);
            if (step) { step.x = newX; step.y = newY; }
            renderFlow(this.store);
        } else if (this.connectionInfo.active) {
            const fromRect = this.connectionInfo.fromConnector.getBoundingClientRect();
            const canvasWrapper = document.getElementById('flow-canvas-wrapper');
            const canvasRect = canvasWrapper.getBoundingClientRect();
            const startX = fromRect.left - canvasRect.left + fromRect.width / 2 + canvasWrapper.scrollLeft;
            const startY = fromRect.top - canvasRect.top + fromRect.height / 2 + canvasWrapper.scrollTop;
            this.connectionInfo.tempLine.setAttribute('x1', startX);
            this.connectionInfo.tempLine.setAttribute('y1', startY);
            this.connectionInfo.tempLine.setAttribute('x2', e.clientX - canvasRect.left + canvasWrapper.scrollLeft);
            this.connectionInfo.tempLine.setAttribute('y2', e.clientY - canvasRect.top + canvasWrapper.scrollTop);
        }
    },

    handleFlowCanvasMouseUp(e) {
        if (this.dragInfo.active) {
            this.store.set('currentChat', { ...this.store.get('currentChat') });
        } else if (this.connectionInfo.active) {
            const toConnector = e.target;
            if (toConnector.classList.contains('connector') && toConnector !== this.connectionInfo.fromConnector) {
                const toNode = toConnector.closest('.flow-step-card');
                const chat = this.store.get('currentChat');
                if (!chat.flow.connections) chat.flow.connections = [];
                chat.flow.connections.push({ from: this.connectionInfo.fromNode.dataset.id, to: toNode.dataset.id });
                this.store.set('currentChat', { ...chat });
            }
            this.connectionInfo.tempLine.remove();
        }
        this.dragInfo.active = false;
        this.connectionInfo.active = false;
    },

    // --- Flow Execution Logic ---
    toggleFlow() {
        if (this.flowRunning) this.stopFlow();
        else this.startFlow();
    },

    updateRunButton(isRunning) {
        document.getElementById('run-flow-btn').textContent = isRunning ? 'Stop Flow' : 'Run Flow';
    },

    stopFlow(message = 'Flow stopped.') {
        this.flowRunning = false;
        this.currentStepId = null;
        this.updateRunButton(false);
        const chat = this.store.get('currentChat');
        if (chat) {
            chat.activeAgentId = null;
            this.store.set('currentChat', { ...chat });
        }
        log(3, message);
    },

    executeStep(step) {
        if (!this.flowRunning) return;
        if (this.stepCounter++ >= this.maxSteps) {
            triggerError('Flow execution stopped: Maximum step limit reached.');
            this.stopFlow();
            return;
        }
        const { agentId, prompt } = step;
        if (!agentId || !prompt) {
            triggerError(`Step is not fully configured.`);
            this.stopFlow('Step not configured.');
            return;
        }
        this.currentStepId = step.id;
        const chat = this.store.get('currentChat');
        chat.activeAgentId = agentId;
        this.store.set('currentChat', { ...chat });
        this.app.submitUserMessage(prompt, 'user');
    },

    startFlow() {
        log(3, 'Starting flow execution...');
        const chat = this.store.get('currentChat');
        const { steps, connections } = chat.flow;
        if (!steps || steps.length === 0) {
            triggerError('Flow has no steps.');
            return;
        }
        const nodesWithIncoming = new Set((connections || []).map(c => c.to));
        const startingNodes = steps.filter(s => !nodesWithIncoming.has(s.id));
        if (startingNodes.length !== 1) {
            triggerError('Flow must have exactly one starting node.');
            return;
        }
        this.flowRunning = true;
        this.stepCounter = 0;
        this.updateRunButton(true);
        this.executeStep(startingNodes[0]);
    },

    hooks: { /* ... */ }
};

// --- Hooks Definition ---
agentsPlugin.hooks.onModifySystemPrompt = (systemContent) => {
    const store = agentsPlugin.store;
    if (!store) return systemContent;
    let cleanedContent = systemContent
        .replace(/--- AGENT DEFINITION ---[\s\S]*?--- END AGENT DEFINITION ---\n?/g, '')
        .replace(/--- AVAILABLE AGENT TOOLS ---[\s\S]*?--- END AVAILABLE AGENT TOOLS ---\n?/g, '');
    const chat = store.get('currentChat');
    if (!chat || !chat.activeAgentId) return cleanedContent;
    const agent = chat.agents.find(a => a.id === chat.activeAgentId);
    if (!agent) return cleanedContent;
    let modified = cleanedContent + `\n\n--- AGENT DEFINITION ---\n${agent.systemPrompt}\n--- END AGENT DEFINITION ---\n`;
    const tools = chat.agents.filter(a => a.availableAsTool && a.id !== chat.activeAgentId);
    if (tools.length > 0) {
        modified += '\n--- AVAILABLE AGENT TOOLS ---\n';
        tools.forEach(t => { modified += `- ${t.name}: ${t.description}\n`; });
        modified += 'To call an agent tool, use: <dma:function_call name="agent_name_agent"><parameter name="prompt">...</parameter></dma:function_call>\n';
        modified += '--- END AVAILABLE AGENT TOOLS ---\n';
    }
    return modified;
};
agentsPlugin.hooks.onMessageComplete = async (message, chatlog, chatbox) => {
    if (message.value.role !== 'assistant') return;

    const app = agentsPlugin.app;
    const store = agentsPlugin.store;
    const currentChat = store.get('currentChat');

    // Parse the message content for any function calls once.
    const { toolCalls } = parseFunctionCalls(message.value.content);

    // Filter for agent-specific function calls.
    const agentCalls = toolCalls.filter(call => call.name.endsWith('_agent'));

    if (agentCalls.length > 0) {
        // Assign unique IDs to each agent call for tracking.
        agentCalls.forEach(call => {
            call.id = `agent_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        });

        const toolResults = await Promise.all(agentCalls.map(async (call) => {
            const agentToCall = currentChat.agents.find(a => `${a.name.toLowerCase().replace(/\s+/g, '_')}_agent` === call.name);

            if (!agentToCall) {
                return { id: call.id, error: `Agent "${call.name}" not found.` };
            }
            const prompt = call.params.prompt;
            if (typeof prompt !== 'string') {
                return { id: call.id, error: `Agent call to "${call.name}" is missing the "prompt" parameter.` };
            }

            const payload = {
                model: app.configService.getModel() || document.querySelector('input[name="model"]:checked')?.value,
                messages: [
                    { role: 'system', content: agentToCall.systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: Number(app.ui.temperatureEl.value),
                top_p: Number(app.ui.topPEl.value),
                stream: true
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
                                try {
                                    responseContent += JSON.parse(chunk).choices[0]?.delta?.content || '';
                                } catch (e) {
                                    log(2, 'Error parsing agent response chunk', e);
                                }
                            }
                        }
                    });
                }
                return { id: call.id, content: responseContent };
            } catch (error) {
                log(1, 'Agent call failed', error);
                return { id: call.id, error: error.message || 'Unknown error during agent execution.' };
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
        return; // Stop processing to prevent flow continuation.
    }

    // Flow continuation logic: Only proceed if there are no tool calls of any kind.
    if (agentsPlugin.flowRunning && toolCalls.length === 0) {
        const { steps, connections } = currentChat.flow;
        const nextConnection = connections.find(c => c.from === agentsPlugin.currentStepId);
        const nextStep = nextConnection ? steps.find(s => s.id === nextConnection.to) : null;
        if (nextStep) {
            agentsPlugin.executeStep(nextStep);
        } else {
            agentsPlugin.stopFlow('Flow execution complete.');
        }
    }
};

export { agentsPlugin };
