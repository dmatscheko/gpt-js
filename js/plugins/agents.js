/**
 * @fileoverview Plugin for agents and flow management.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';

// --- Helper Functions ---
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
    const currentChat = store.get('currentChat');
    if (!currentChat || !currentChat.agents) return;
    const activeAgentId = currentChat.activeAgentId;
    currentChat.agents.forEach(agent => {
        const card = document.createElement('div');
        const isActive = agent.id === activeAgentId;
        card.className = `agent-card ${isActive ? 'active' : ''}`;
        card.innerHTML = `
            <h3>${agent.name}</h3>
            <p>${agent.description}</p>
            <div class="agent-card-buttons">
                <button class="activate-agent-btn" data-id="${agent.id}">${isActive ? 'Deactivate' : 'Activate'}</button>
                <button class="edit-agent-btn" data-id="${agent.id}">Edit</button>
                <button class="delete-agent-btn" data-id="${agent.id}">Delete</button>
            </div>
        `;
        agentList.appendChild(card);
    });
}

function showAgentForm(agent) {
    const agentFormContainer = document.getElementById('agent-form-container');
    const agentForm = document.getElementById('agent-form');
    agentForm.reset();
    if (agent) {
        document.getElementById('agent-id').value = agent.id;
        document.getElementById('agent-name').value = agent.name;
        document.getElementById('agent-description').value = agent.description;
        document.getElementById('agent-system-prompt').value = agent.systemPrompt;
        document.getElementById('agent-available-as-tool').checked = agent.availableAsTool;
    } else {
        document.getElementById('agent-id').value = '';
    }
    agentFormContainer.style.display = 'block';
}

function hideAgentForm() {
    const agentFormContainer = document.getElementById('agent-form-container');
    const agentForm = document.getElementById('agent-form');
    agentForm.reset();
    agentFormContainer.style.display = 'none';
}

// --- Flow Tab Functions ---
function renderFlowStepList(store) {
    const stepList = document.getElementById('flow-step-list');
    stepList.innerHTML = '';
    const currentChat = store.get('currentChat');
    if (!currentChat || !currentChat.flow || !currentChat.flow.steps) return;
    const agents = currentChat.agents || [];
    currentChat.flow.steps.forEach((step, index) => {
        const card = document.createElement('div');
        card.className = 'flow-step-card';
        card.dataset.id = step.id;
        const agentOptions = agents.map(agent => `<option value="${agent.id}" ${step.agentId === agent.id ? 'selected' : ''}>${agent.name}</option>`).join('');
        card.innerHTML = `
            <h4>Step ${index + 1}</h4>
            <label>Agent:</label>
            <select class="flow-step-agent" data-id="${step.id}"><option value="">Select an agent</option>${agentOptions}</select>
            <label>Prompt:</label>
            <textarea class="flow-step-prompt" rows="3" data-id="${step.id}">${step.prompt}</textarea>
            <div class="flow-step-card-buttons">
                <button class="delete-flow-step-btn" data-id="${step.id}">Delete</button>
                <button class="move-flow-step-up-btn" data-id="${step.id}" ${index === 0 ? 'disabled' : ''}>Up</button>
                <button class="move-flow-step-down-btn" data-id="${step.id}" ${index === currentChat.flow.steps.length - 1 ? 'disabled' : ''}>Down</button>
            </div>
        `;
        stepList.appendChild(card);
    });
}

const agentsPlugin = {
    name: 'agents',
    app: null,
    store: null,

    init: function(app) {
        this.app = app;
        this.store = app.store;
        log(3, 'Agents plugin initialized');

        // Tab switching
        document.getElementById('tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-button')) {
                const tabName = e.target.dataset.tab;
                document.querySelectorAll('#tabs .tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#tab-content .tab-pane').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${tabName}-tab-pane`).classList.add('active');
            }
        });

        // Agent UI
        document.getElementById('add-agent-btn').addEventListener('click', () => showAgentForm(null));
        document.getElementById('cancel-agent-form').addEventListener('click', hideAgentForm);
        document.getElementById('agent-form').addEventListener('submit', (e) => {
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
        });
        document.getElementById('agent-list').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            const chat = this.store.get('currentChat');
            const agent = chat.agents.find(a => a.id === id);
            if (e.target.classList.contains('activate-agent-btn')) {
                chat.activeAgentId = chat.activeAgentId === id ? null : id;
                this.store.set('currentChat', { ...chat });
            } else if (e.target.classList.contains('edit-agent-btn')) {
                showAgentForm(agent);
            } else if (e.target.classList.contains('delete-agent-btn')) {
                if (confirm(`Delete agent "${agent.name}"?`)) {
                    chat.agents = chat.agents.filter(a => a.id !== id);
                    if (chat.activeAgentId === id) chat.activeAgentId = null;
                    this.store.set('currentChat', { ...chat });
                }
            }
        });

        // Flow UI
        document.getElementById('add-flow-step-btn').addEventListener('click', () => {
            const chat = this.store.get('currentChat');
            if (!chat.flow) chat.flow = { steps: [] };
            chat.flow.steps.push({ id: `step-${Date.now()}`, agentId: '', prompt: '' });
            this.store.set('currentChat', { ...chat });
        });
        document.getElementById('run-flow-btn').addEventListener('click', () => alert('Running flows is not implemented yet.'));
        const flowStepList = document.getElementById('flow-step-list');
        flowStepList.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            const chat = this.store.get('currentChat');
            const step = chat.flow.steps.find(s => s.id === id);
            if (!step) return;
            if (e.target.classList.contains('flow-step-agent')) step.agentId = e.target.value;
            if (e.target.classList.contains('flow-step-prompt')) step.prompt = e.target.value;
            this.store.set('currentChat', { ...chat });
        });
        flowStepList.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            const chat = this.store.get('currentChat');
            const steps = chat.flow.steps;
            const index = steps.findIndex(s => s.id === id);
            if (e.target.classList.contains('delete-flow-step-btn')) steps.splice(index, 1);
            if (e.target.classList.contains('move-flow-step-up-btn') && index > 0) [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
            if (e.target.classList.contains('move-flow-step-down-btn') && index < steps.length - 1) [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
            this.store.set('currentChat', { ...chat });
        });

        // Store Subscription
        this.store.subscribe('currentChat', (chat) => {
            if (chat) {
                renderAgentList(this.store);
                renderFlowStepList(this.store);
            } else {
                document.getElementById('agent-list').innerHTML = '';
                document.getElementById('flow-step-list').innerHTML = '';
            }
        });
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
                if (!agentToCall) {
                    return { id: call.callId, error: `Agent "${call.agentName}" not found.` };
                }

                const payload = {
                    model: app.configService.getModel() || document.querySelector('input[name="model"]:checked')?.value,
                    messages: [
                        { role: 'system', content: agentToCall.systemPrompt },
                        { role: 'user', content: call.prompt }
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
                        const chunks = valueStr.split('\n');
                        chunks.forEach(chunk => {
                            if (chunk.startsWith('data: ')) {
                                chunk = chunk.substring(6);
                                if (chunk.trim() !== '[DONE]') {
                                    try {
                                        const data = JSON.parse(chunk);
                                        responseContent += data.choices[0]?.delta?.content || '';
                                    } catch (e) { log(2, 'Error parsing agent response chunk', e); }
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
