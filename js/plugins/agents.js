/**
 * @fileoverview Plugin for agents and flow management.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';
import { parseFunctionCalls } from '../utils/parsers.js';
import { addAlternativeToChat } from '../utils/chat.js';
import { createControlButton } from '../utils/ui.js';
import { processToolCalls, exportJson, importJson } from '../utils/shared.js';
import { defaultEndpoint } from '../config.js';

const INTERACTIVE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'LABEL'];

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

function showAgentForm(agent, store) {
    const formContainer = document.getElementById('agent-form-container');
    const form = document.getElementById('agent-form');
    form.reset();
    document.getElementById('agent-id').value = agent ? agent.id : '';

    const modelSettingsEl = document.getElementById('agent-model-settings');
    const useCustomSettingsCheckbox = document.getElementById('agent-use-custom-settings');

    modelSettingsEl.innerHTML = ''; // Clear previous settings

    if (agent) {
        document.getElementById('agent-name').value = agent.name;
        document.getElementById('agent-description').value = agent.description;
        document.getElementById('agent-system-prompt').value = agent.systemPrompt;
        document.getElementById('agent-available-as-tool').checked = agent.availableAsTool;
        useCustomSettingsCheckbox.checked = agent.useCustomModelSettings || false;

        modelSettingsEl.style.display = useCustomSettingsCheckbox.checked ? 'block' : 'none';

        const chat = store.get('currentChat');
        if (useCustomSettingsCheckbox.checked) {
            if (!agent.modelSettings) agent.modelSettings = {};
            hooks.onModelSettingsRender.forEach(fn => fn(modelSettingsEl, agent.modelSettings, chat.id, agent.id));
        }
    } else {
        useCustomSettingsCheckbox.checked = false;
        modelSettingsEl.style.display = 'none';
    }

    // Use a fresh listener to avoid duplicates
    const newCheckbox = useCustomSettingsCheckbox.cloneNode(true);
    useCustomSettingsCheckbox.parentNode.replaceChild(newCheckbox, useCustomSettingsCheckbox);
    newCheckbox.addEventListener('change', (e) => {
        modelSettingsEl.style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked && agent) {
             const chat = store.get('currentChat');
             if (!agent.modelSettings) agent.modelSettings = {};
             hooks.onModelSettingsRender.forEach(fn => fn(modelSettingsEl, agent.modelSettings, chat.id, agent.id));
        }
    });
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
    marker.setAttribute('refX', '15');
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
        if (step.type) {
            node.classList.add(`flow-step-${step.type}`);
        }
        if (step.isMinimized) {
            node.classList.add('minimized');
        }
        node.dataset.id = step.id;
        node.style.left = `${step.x}px`;
        node.style.top = `${step.y}px`;
        let content = '';
        const type = step.type || 'agent'; // Default to agent for old steps
        const agentOptions = (chat.agents || []).map(a => `<option value="${a.id}" ${step.agentId === a.id ? 'selected' : ''}>${a.name}</option>`).join('');

        switch (type) {
            case 'simple-prompt':
                content = `
                    <h4>Simple Prompt</h4>
                    <div class="flow-step-content">
                        <label>Agent:</label>
                        <select class="flow-step-agent flow-step-input" data-id="${step.id}"><option value="">Select Agent</option>${agentOptions}</select>
                        <label>Prompt:</label>
                        <textarea class="flow-step-prompt flow-step-input" rows="3" data-id="${step.id}">${step.prompt || ''}</textarea>
                    </div>
                `;
                break;
            case 'clear-history':
                content = `
                    <h4>Clear History</h4>
                    <div class="flow-step-content">
                        <label>From answer #:</label>
                        <input type="number" class="flow-step-clear-from flow-step-input" data-id="${step.id}" value="${step.clearFrom || 1}" min="1">
                        <div class="clear-history-to-container" style="${step.clearToBeginning ? 'display: none;' : ''}">
                            <label>To answer #:</label>
                            <input type="number" class="flow-step-clear-to flow-step-input" data-id="${step.id}" value="${step.clearTo || 1}" min="1">
                        </div>
                        <label class="flow-step-checkbox-label">
                            <input type="checkbox" class="flow-step-clear-beginning flow-step-input" data-id="${step.id}" ${step.clearToBeginning ? 'checked' : ''}>
                            Clear to beginning
                        </label>
                        <small>(1 is the last answer)<br><br></small>
                    </div>
                `;
                break;
            case 'conditional-stop':
                content = `
                    <h4>Conditional Stop</h4>
                    <div class="flow-step-content">
                        <label>Last Response Condition:</label>
                        <select class="flow-step-condition-type flow-step-input" data-id="${step.id}">
                            <option value="contains" ${step.conditionType === 'contains' ? 'selected' : ''}>Contains String</option>
                            <option value="matches" ${step.conditionType === 'matches' ? 'selected' : ''}>Matches String</option>
                            <option value="regex" ${step.conditionType === 'regex' ? 'selected' : ''}>Matches Regex</option>
                        </select>
                        <textarea class="flow-step-condition flow-step-input" rows="2" data-id="${step.id}" placeholder="Enter value...">${step.condition || ''}</textarea>
                        <label>On Match:</label>
                        <select class="flow-step-on-match flow-step-input" data-id="${step.id}">
                            <option value="stop" ${step.onMatch === 'stop' ? 'selected' : ''}>Stop flow</option>
                            <option value="continue" ${step.onMatch === 'continue' ? 'selected' : ''}>Must match to continue</option>
                        </select>
                    </div>
                `;
                break;
            case 'branching-prompt':
                content = `
                    <h4>Branching Prompt</h4>
                    <div class="flow-step-content">
                        <label>Last Response Condition:</label>
                        <select class="flow-step-condition-type flow-step-input" data-id="${step.id}">
                            <option value="contains" ${step.conditionType === 'contains' ? 'selected' : ''}>Contains String</option>
                            <option value="matches" ${step.conditionType === 'matches' ? 'selected' : ''}>Matches String</option>
                            <option value="regex" ${step.conditionType === 'regex' ? 'selected' : ''}>Matches Regex</option>
                        </select>
                        <textarea class="flow-step-condition flow-step-input" rows="2" data-id="${step.id}" placeholder="Enter value...">${step.condition || ''}</textarea>
                    </div>
                `;
                break;
            case 'multi-prompt':
                content = `
                    <h4>Multi Prompt</h4>
                    <div class="flow-step-content">
                        <label>Agent:</label>
                        <select class="flow-step-agent flow-step-input" data-id="${step.id}"><option value="">Select Agent</option>${agentOptions}</select>
                        <label>Prompt:</label>
                        <textarea class="flow-step-prompt flow-step-input" rows="3" data-id="${step.id}">${step.prompt || ''}</textarea>
                        <label>Number of alternatives:</label>
                        <input type="number" class="flow-step-count flow-step-input" data-id="${step.id}" value="${step.count || 1}" min="1" max="10">
                    </div>
                `;
                break;
            case 'consolidator':
                content = `
                    <h4>Alternatives Consolidator</h4>
                    <div class="flow-step-content">
                        <label>Agent:</label>
                        <select class="flow-step-agent flow-step-input" data-id="${step.id}"><option value="">Select Agent</option>${agentOptions}</select>
                        <label>Text before alternatives:</label>
                        <textarea class="flow-step-pre-prompt flow-step-input" rows="2" data-id="${step.id}">${step.prePrompt || ''}</textarea>
                        <label>Text after alternatives:</label>
                        <textarea class="flow-step-post-prompt flow-step-input" rows="2" data-id="${step.id}">${step.postPrompt || ''}</textarea>
                    </div>
                `;
                break;
            case 'echo-answer':
                content = `
                    <h4>Echo Answer</h4>
                    <div class="flow-step-content">
                        <label>Agent:</label>
                        <select class="flow-step-agent flow-step-input" data-id="${step.id}"><option value="">Select Agent</option>${agentOptions}</select>
                        <label>Text before AI answer:</label>
                        <textarea class="flow-step-pre-prompt flow-step-input" rows="2" data-id="${step.id}">${step.prePrompt || ''}</textarea>
                        <label>Text after AI answer:</label>
                        <textarea class="flow-step-post-prompt flow-step-input" rows="2" data-id="${step.id}">${step.postPrompt || ''}</textarea>
                        <label class="flow-step-checkbox-label"><input type="checkbox" class="flow-step-delete-ai flow-step-input" data-id="${step.id}" ${step.deleteAIAnswer ? 'checked' : ''}> Delete original AI answer</label>
                        <label class="flow-step-checkbox-label"><input type="checkbox" class="flow-step-delete-user flow-step-input" data-id="${step.id}" ${step.deleteUserMessage ? 'checked' : ''}> Delete original user message</label>
                    </div>
                `;
                break;
        }

        let outputConnectors = '';
        if (type === 'branching-prompt') {
            outputConnectors = `
                <div class="connector-group">
                    <div class="connector bottom" data-id="${step.id}" data-type="out" data-output-name="pass"><span class="connector-label">Pass</span></div>
                    <div class="connector bottom" data-id="${step.id}" data-type="out" data-output-name="fail"><span class="connector-label">Fail</span></div>
                </div>
            `;
        } else {
            outputConnectors = `<div class="connector bottom" data-id="${step.id}" data-type="out" data-output-name="default"></div>`;
        }


        node.innerHTML = `
            <button class="minimize-flow-step-btn" data-id="${step.id}">${step.isMinimized ? '+' : '-'}</button>
            <div class="connector top" data-id="${step.id}" data-type="in"></div>
            ${content}
            <div class="flow-step-content">
                <button class="delete-flow-step-btn agents-flow-btn" data-id="${step.id}">Delete Step</button>
            </div>
            ${outputConnectors}
        `;
        nodeContainer.appendChild(node);
    });

    (chat.flow.connections || []).forEach(conn => {
        const fromNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.from}"]`);
        const toNode = nodeContainer.querySelector(`.flow-step-card[data-id="${conn.to}"]`);
        if (fromNode && toNode) {
            const outConnector = fromNode.querySelector(`.connector.bottom[data-output-name="${conn.outputName || 'default'}"]`);
            const inConnector = toNode.querySelector('.connector.top');
            if (!outConnector) {
                console.error('Could not find output connector for connection:', conn);
                return;
            }
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
            const deleteBtn = createControlButton(
                'Delete Connection',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>');
            deleteBtn.classList.add('delete-connection-btn');
            deleteBtn.dataset.from = conn.from;
            deleteBtn.dataset.to = conn.to;
            deleteBtn.dataset.outputName = conn.outputName || 'default';
            deleteBtn.style.position = 'absolute';
            deleteBtn.style.left = `${(x1 + x2) / 2 - 12}px`;
            deleteBtn.style.top = `${(y1 + y2) / 2 - 12}px`;
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
    panInfo: { active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 },
    connectionInfo: { active: false, fromNode: null, fromConnector: null, tempLine: null },
    multiMessageInfo: { active: false, step: null, counter: 0, messageToBranchFrom: null },

    init: function(app) {
        this.app = app;
        this.store = app.store;

        // Dynamically add tabs
        const tabs = document.getElementById('main-tabs');
        const agentsTabButton = document.createElement('button');
        agentsTabButton.classList.add('tab-button');
        agentsTabButton.dataset.tab = 'agents';
        agentsTabButton.textContent = 'Agents';
        tabs.appendChild(agentsTabButton);

        const flowTabButton = document.createElement('button');
        flowTabButton.classList.add('tab-button');
        flowTabButton.dataset.tab = 'flow';
        flowTabButton.textContent = 'Flow';
        tabs.appendChild(flowTabButton);

        // Dynamically add tab panes
        const tabContent = document.getElementById('tab-content');
        const agentsTabPane = document.createElement('div');
        agentsTabPane.classList.add('tab-pane');
        agentsTabPane.id = 'agents-tab-pane';
        agentsTabPane.innerHTML = `
            <div class="agents-flow-toolbar">
                <button id="add-agent-btn" class="agents-flow-btn">Add Agent</button>
                <button id="export-agents-btn" class="agents-flow-btn">Export Agents</button>
                <button id="import-agents-btn" class="agents-flow-btn">Import Agents</button>
            </div>
            <div id="agent-list"></div>
            <div id="agent-form-container" style="display: none;">
                <form id="agent-form">
                    <input type="hidden" id="agent-id" value="">
                    <label for="agent-name">Name:</label>
                    <input type="text" id="agent-name" required>
                    <label for="agent-description">Description:</label>
                    <textarea id="agent-description" rows="2"></textarea>
                    <label for="agent-system-prompt">System Prompt:</label>
                    <textarea id="agent-system-prompt" rows="5"></textarea>
                    <label>
                        <input type="checkbox" id="agent-available-as-tool">
                        Available as a tool
                    </label>
                    <label>
                        <input type="checkbox" id="agent-use-custom-settings">
                        Custom Model Parameters
                    </label>
                    <div id="agent-model-settings" style="display: none;"></div>
                    <div id="agent-form-buttons">
                        <button type="submit" class="agents-flow-btn">Save Agent</button>
                        <button type="button" id="cancel-agent-form" class="agents-flow-btn">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        tabContent.appendChild(agentsTabPane);

        const flowTabPane = document.createElement('div');
        flowTabPane.classList.add('tab-pane');
        flowTabPane.id = 'flow-tab-pane';
        flowTabPane.innerHTML = `
            <div class="agents-flow-toolbar">
                <div class="dropdown">
                    <button id="add-flow-step-btn-dropdown" class="agents-flow-btn">Add Step &#9662;</button>
                    <div id="add-step-dropdown-content" class="dropdown-content">
                        <a href="#" data-step-type="simple-prompt">Simple Prompt</a>
                        <a href="#" data-step-type="multi-prompt">Multi Prompt</a>
                        <a href="#" data-step-type="consolidator">Alt. Consolidator</a>
                        <a href="#" data-step-type="echo-answer">Echo Answer</a>
                        <a href="#" data-step-type="clear-history">Clear History</a>
                        <a href="#" data-step-type="branching-prompt">Branching Prompt</a>
                        <a href="#" data-step-type="conditional-stop">Conditional Stop</a>
                    </div>
                </div>
                <button id="run-flow-btn" class="agents-flow-btn">Run Flow</button>
                <button id="export-flow-btn" class="agents-flow-btn">Export Flow</button>
                <button id="import-flow-btn" class="agents-flow-btn">Load Flow</button>
            </div>
            <div id="flow-canvas-wrapper">
                <div id="flow-canvas">
                    <svg id="flow-svg-layer"></svg>
                    <div id="flow-node-container"></div>
                </div>
            </div>
        `;
        tabContent.appendChild(flowTabPane);

        // --- Event Listeners ---
        // Tab switching
        document.getElementById('tabs').addEventListener('click', e => this.handleTabClick(e));
        // Agent UI
        document.getElementById('add-agent-btn').addEventListener('click', () => showAgentForm(null, this.store));
        document.getElementById('cancel-agent-form').addEventListener('click', hideAgentForm);
        document.getElementById('agent-form').addEventListener('submit', e => this.saveAgent(e));
        document.getElementById('agent-list').addEventListener('click', e => this.handleAgentListClick(e));
        document.getElementById('export-agents-btn').addEventListener('click', () => this.exportAgents());
        document.getElementById('import-agents-btn').addEventListener('click', () => this.importAgents());
        // Flow UI
        document.getElementById('add-flow-step-btn-dropdown').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('add-step-dropdown-content').classList.toggle('show');
        });
        document.getElementById('add-step-dropdown-content').addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                const stepType = e.target.dataset.stepType;
                this.addFlowStep(stepType);
                document.getElementById('add-step-dropdown-content').classList.remove('show');
            }
        });
        document.getElementById('run-flow-btn').addEventListener('click', () => this.toggleFlow());
        document.getElementById('export-flow-btn').addEventListener('click', () => this.exportFlow());
        document.getElementById('import-flow-btn').addEventListener('click', () => this.importFlow());

        window.addEventListener('click', (e) => {
            if (!e.target.matches('#add-flow-step-btn-dropdown')) {
                const dropdown = document.getElementById('add-step-dropdown-content');
                if (dropdown.classList.contains('show')) {
                    dropdown.classList.remove('show');
                }
            }
        });
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
        const chat = this.store.get('currentChat');
        if (!chat.agents) chat.agents = [];

        const existingAgent = id ? chat.agents.find(a => a.id === id) : null;

        const useCustomSettings = document.getElementById('agent-use-custom-settings').checked;
        const agentData = {
            id: id || `agent-${Date.now()}`,
            name: document.getElementById('agent-name').value,
            description: document.getElementById('agent-description').value,
            systemPrompt: document.getElementById('agent-system-prompt').value,
            availableAsTool: document.getElementById('agent-available-as-tool').checked,
            useCustomModelSettings: useCustomSettings,
            modelSettings: existingAgent ? existingAgent.modelSettings : {},
        };

        if (!useCustomSettings) {
            agentData.modelSettings = {};
        }

        const index = existingAgent ? chat.agents.findIndex(a => a.id === id) : -1;

        if (index > -1) {
            chat.agents[index] = agentData;
        } else {
            chat.agents.push(agentData);
        }
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
            showAgentForm(agent, this.store);
        } else if (e.target.classList.contains('delete-agent-btn')) {
            if (confirm(`Delete agent?`)) {
                chat.agents = chat.agents.filter(a => a.id !== id);
                if (chat.activeAgentId === id) chat.activeAgentId = null;
            }
        }
        this.store.set('currentChat', { ...chat });
    },

    addFlowStep(type = 'simple-prompt') {
        const chat = this.store.get('currentChat');
        if (!chat.flow) chat.flow = { steps: [], connections: [] };
        const newStep = {
            id: `step-${Date.now()}`,
            type: type,
            x: 50,
            y: 50,
            isMinimized: false,
        };
        switch (type) {
            case 'simple-prompt':
                newStep.agentId = '';
                newStep.prompt = '';
                break;
            case 'clear-history':
                newStep.clearFrom = 2;
                newStep.clearTo = 1;
                newStep.clearToBeginning = true;
                break;
            case 'conditional-stop':
                newStep.conditionType = 'contains';
                newStep.condition = '';
                newStep.onMatch = 'stop';
                break;
            case 'multi-prompt':
                newStep.agentId = '';
                newStep.prompt = '';
                newStep.count = 2;
                break;
            case 'branching-prompt':
                newStep.conditionType = 'contains';
                newStep.condition = '';
                break;
            case 'consolidator':
                newStep.agentId = '';
                newStep.prePrompt = 'Please choose the best of the following answers:';
                newStep.postPrompt = 'Explain your choice.';
                break;
            case 'echo-answer':
                newStep.agentId = '';
                newStep.prePrompt = 'Is this idea and code correct? Be concise.\n\n\n';
                newStep.postPrompt = '';
                newStep.deleteAIAnswer = true;
                newStep.deleteUserMessage = true;
                break;
        }
        chat.flow.steps.push(newStep);
        this.store.set('currentChat', { ...chat });
    },

    handleFlowStepChange(e) {
        const id = e.target.dataset.id;
        const chat = this.store.get('currentChat');
        const step = chat.flow.steps.find(s => s.id === id);
        if (!step) return;

        const target = e.target;
        if (target.classList.contains('flow-step-agent')) step.agentId = target.value;
        if (target.classList.contains('flow-step-prompt')) step.prompt = target.value;
        if (target.classList.contains('flow-step-condition')) step.condition = target.value;
        if (target.classList.contains('flow-step-condition-type')) step.conditionType = target.value;
        if (target.classList.contains('flow-step-on-match')) step.onMatch = target.value;
        if (target.classList.contains('flow-step-count')) step.count = parseInt(target.value, 10);
        if (target.classList.contains('flow-step-pre-prompt')) step.prePrompt = target.value;
        if (target.classList.contains('flow-step-post-prompt')) step.postPrompt = target.value;
        if (target.classList.contains('flow-step-delete-ai')) step.deleteAIAnswer = target.checked;
        if (target.classList.contains('flow-step-delete-user')) step.deleteUserMessage = target.checked;
        if (target.classList.contains('flow-step-clear-from')) step.clearFrom = parseInt(target.value, 10);
        if (target.classList.contains('flow-step-clear-to')) step.clearTo = parseInt(target.value, 10);
        if (target.classList.contains('flow-step-clear-beginning')) {
            step.clearToBeginning = target.checked;
            renderFlow(this.store);
        }


        this.store.set('currentChat', { ...chat });
    },

    handleFlowCanvasClick(e) {
        const chat = this.store.get('currentChat');
        let chatModified = false;

        const minimizeBtn = e.target.closest('.minimize-flow-step-btn');
        if (minimizeBtn) {
            const stepId = minimizeBtn.dataset.id;
            const step = chat.flow.steps.find(s => s.id === stepId);
            if (step) {
                step.isMinimized = !step.isMinimized;
                chatModified = true;
            }
        }

        const stepDeleteBtn = e.target.closest('.delete-flow-step-btn');
        if (stepDeleteBtn) {
            const stepId = stepDeleteBtn.dataset.id;
            if (stepId && confirm('Are you sure you want to delete this step?')) {
                chat.flow.steps = chat.flow.steps.filter(s => s.id !== stepId);
                chat.flow.connections = (chat.flow.connections || []).filter(c => c.from !== stepId && c.to !== stepId);
                chatModified = true;
            }
        }

        const connDeleteBtn = e.target.closest('.delete-connection-btn');
        if (connDeleteBtn) {
            const fromId = connDeleteBtn.dataset.from;
            const toId = connDeleteBtn.dataset.to;
            const outputName = connDeleteBtn.dataset.outputName;
            if (fromId && toId) {
                chat.flow.connections = (chat.flow.connections || []).filter(c =>
                    !(c.from === fromId && c.to === toId && (c.outputName || 'default') === outputName)
                );
                chatModified = true;
            }
        }

        if (chatModified) {
            this.store.set('currentChat', { ...chat });
        }
    },

    handleFlowCanvasMouseDown(e) {
        const target = e.target;
        const canvasWrapper = document.getElementById('flow-canvas-wrapper');

        // Prevent interference with form elements inside a step card
        if (target.closest('.flow-step-card') && INTERACTIVE_TAGS.includes(target.tagName)) {
            return;
        }

        if (target.classList.contains('connector')) {
            this.connectionInfo.active = true;
            this.connectionInfo.fromNode = target.closest('.flow-step-card');
            this.connectionInfo.fromConnector = target;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'red');
            line.setAttribute('stroke-width', '2');
            this.connectionInfo.tempLine = line;
            document.getElementById('flow-svg-layer').appendChild(line);
        } else if (target.closest('.flow-step-card') && !INTERACTIVE_TAGS.includes(target.tagName)) {
            e.preventDefault();
            this.dragInfo.active = true;
            this.dragInfo.target = target.closest('.flow-step-card');
            this.dragInfo.offsetX = e.clientX - this.dragInfo.target.offsetLeft;
            this.dragInfo.offsetY = e.clientY - this.dragInfo.target.offsetTop;
        } else if (e.target.id === 'flow-canvas' || e.target.id === 'flow-node-container' || e.target.id === 'flow-svg-layer') {
            e.preventDefault();
            this.panInfo.active = true;
            this.panInfo.startX = e.clientX;
            this.panInfo.startY = e.clientY;
            this.panInfo.scrollLeft = canvasWrapper.scrollLeft;
            this.panInfo.scrollTop = canvasWrapper.scrollTop;
            e.target.closest('#flow-canvas').classList.add('panning');
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
        } else if (this.panInfo.active) {
            e.preventDefault();
            const canvasWrapper = document.getElementById('flow-canvas-wrapper');
            const dx = e.clientX - this.panInfo.startX;
            const dy = e.clientY - this.panInfo.startY;
            canvasWrapper.scrollLeft = this.panInfo.scrollLeft - dx;
            canvasWrapper.scrollTop = this.panInfo.scrollTop - dy;
        }
    },

    handleFlowCanvasMouseUp(e) {
        if (this.dragInfo.active) {
            this.store.set('currentChat', { ...this.store.get('currentChat') });
        } else if (this.connectionInfo.active) {
            const toConnector = e.target.classList.contains('connector') ? e.target : e.target.closest('.connector');
            if (toConnector && toConnector.dataset.type === 'in' && toConnector !== this.connectionInfo.fromConnector) {
                const toNode = toConnector.closest('.flow-step-card');
                const fromNode = this.connectionInfo.fromNode;
                const fromConnector = this.connectionInfo.fromConnector;
                const chat = this.store.get('currentChat');

                if (!chat.flow.connections) chat.flow.connections = [];

                const newConnection = {
                    from: fromNode.dataset.id,
                    to: toNode.dataset.id,
                    outputName: fromConnector.dataset.outputName
                };

                // Prevent duplicate connections from the same output port
                const connectionExists = chat.flow.connections.some(c =>
                    c.from === newConnection.from && c.outputName === newConnection.outputName
                );

                if (!connectionExists) {
                    chat.flow.connections.push(newConnection);
                    this.store.set('currentChat', { ...chat });
                } else {
                    log(2, "Connection from this output port already exists.");
                }
            }
            this.connectionInfo.tempLine.remove();
        } else if (this.panInfo.active) {
            document.getElementById('flow-canvas').classList.remove('panning');
        }
        this.dragInfo.active = false;
        this.connectionInfo.active = false;
        this.panInfo.active = false;
    },

    exportFlow() {
        const chat = this.store.get('currentChat');
        if (!chat || !chat.flow) {
            triggerError('No flow to export.');
            return;
        }
        const filenameBase = `flow_${chat.title.replace(/\s/g, '_')}`;
        exportJson(chat.flow, filenameBase);
    },

    importFlow() {
        importJson('application/json', (importedFlow) => {
            if (importedFlow && Array.isArray(importedFlow.steps) && Array.isArray(importedFlow.connections)) {
                const chat = this.store.get('currentChat');
                chat.flow = importedFlow;
                this.store.set('currentChat', { ...chat });
            } else {
                triggerError('Invalid flow file format.');
            }
        });
    },

    exportAgents() {
        const chat = this.store.get('currentChat');
        if (!chat || !chat.agents || chat.agents.length === 0) {
            triggerError('No agents to export.');
            return;
        }
        const filenameBase = `agents_${chat.title.replace(/\s/g, '_')}`;
        exportJson(chat.agents, filenameBase);
    },

    importAgents() {
        importJson('application/json', (importedAgents) => {
            if (!Array.isArray(importedAgents)) {
                triggerError('Invalid agents file format. Expected a JSON array.');
                return;
            }

            const chat = this.store.get('currentChat');
            if (!chat.agents) chat.agents = [];

            const existingAgentIds = new Set(chat.agents.map(a => a.id));

            importedAgents.forEach(importedAgent => {
                if (existingAgentIds.has(importedAgent.id)) {
                    const index = chat.agents.findIndex(a => a.id === importedAgent.id);
                    chat.agents[index] = importedAgent;
                } else {
                    chat.agents.push(importedAgent);
                }
            });

            this.store.set('currentChat', { ...chat });
        });
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
        this.multiMessageInfo = { active: false, step: null, counter: 0, messageToBranchFrom: null };
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

        this.currentStepId = step.id;
        const chat = this.store.get('currentChat');
        const type = step.type || 'simple-prompt'; // Default to agent for old steps
        const chatlog = this.app.ui.chatBox.chatlog;

        switch (type) {
            case 'simple-prompt':
                if (!step.agentId || !step.prompt) {
                    triggerError(`Agent step is not fully configured.`);
                    return this.stopFlow('Step not configured.');
                }
                chat.activeAgentId = step.agentId;
                this.store.set('currentChat', { ...chat });
                this.app.submitUserMessage(step.prompt, 'user');
                break;
            case 'clear-history': {
                const chChatlog = this.app.ui.chatBox.chatlog;
                const chMessages = chChatlog.getActiveMessageValues();
                const userMessageIndices = chMessages
                    .map((msg, i) => msg.role === 'user' ? i : -1)
                    .filter(i => i !== -1);

                const clearFrom = step.clearFrom || 1;
                const clearTo = step.clearToBeginning ? userMessageIndices.length : (step.clearTo || 1);

                const fromIndex = userMessageIndices.length - clearTo;
                const toIndex = userMessageIndices.length - clearFrom;

                if (fromIndex < 0 || toIndex < 0 || fromIndex > toIndex) {
                     this.stopFlow('Invalid range for Clear History.');
                     break;
                }

                const startMsgIndex = userMessageIndices[fromIndex];
                const endMsgIndex = (toIndex + 1 < userMessageIndices.length) ? userMessageIndices[toIndex + 1] : chMessages.length;

                for (let i = endMsgIndex - 1; i >= startMsgIndex; i--) {
                    chChatlog.deleteNthMessage(i);
                }

                const nextStep = this.getNextStep(step.id);
                if (nextStep) {
                    this.executeStep(nextStep);
                } else {
                    this.stopFlow('Flow execution complete.');
                }
                break;
            }
            case 'branching-prompt':
                const bpLastMessage = this.app.ui.chatBox.chatlog.getLastMessage()?.value.content || '';
                let bpIsMatch = false;
                const bpCondition = step.condition || '';

                try {
                    switch(step.conditionType) {
                        case 'regex':
                            bpIsMatch = new RegExp(bpCondition).test(bpLastMessage);
                            break;
                        case 'matches':
                            bpIsMatch = (bpLastMessage === bpCondition);
                            break;
                        case 'contains':
                        default:
                            bpIsMatch = bpLastMessage.includes(bpCondition);
                            break;
                    }
                } catch (e) {
                    triggerError(`Invalid regex in branching step: ${e.message}`);
                    return this.stopFlow('Invalid regex.');
                }

                const outputName = bpIsMatch ? 'pass' : 'fail';
                const nextStep = this.getNextStep(step.id, outputName);
                if (nextStep) {
                    this.executeStep(nextStep);
                } else {
                    this.stopFlow('Flow execution complete.');
                }
                break;
            case 'multi-prompt':
                if (!step.agentId || !step.prompt) {
                    triggerError(`Multi-Message step is not fully configured.`);
                    return this.stopFlow('Step not configured.');
                }
                this.multiMessageInfo.active = true;
                this.multiMessageInfo.step = step;
                this.multiMessageInfo.counter = 1;
                chat.activeAgentId = step.agentId;
                this.store.set('currentChat', { ...chat });

                chatlog.addMessage({ role: 'user', content: step.prompt });
                const assistantMessageToBranchFrom = chatlog.addMessage(null);
                this.multiMessageInfo.messageToBranchFrom = assistantMessageToBranchFrom;

                this.app.generateAIResponse({}, chatlog);
                break;
            case 'conditional-stop':
                const lastMessage = this.app.ui.chatBox.chatlog.getLastMessage()?.value.content || '';
                let isMatch = false;
                const condition = step.condition || '';

                try {
                    switch(step.conditionType) {
                        case 'regex':
                            isMatch = new RegExp(condition).test(lastMessage);
                            break;
                        case 'matches':
                            isMatch = (lastMessage === condition);
                            break;
                        case 'contains':
                        default:
                            isMatch = lastMessage.includes(condition);
                            break;
                    }
                } catch (e) {
                    triggerError(`Invalid regex in conditional step: ${e.message}`);
                    return this.stopFlow('Invalid regex.');
                }

                let shouldContinue = true;
                if (isMatch) {
                    if (step.onMatch === 'stop') {
                        this.stopFlow('Flow stopped by conditional match.');
                        shouldContinue = false;
                    }
                } else {
                    if (step.onMatch === 'continue') {
                        this.stopFlow('Flow stopped: condition not met.');
                        shouldContinue = false;
                    }
                }

                if (shouldContinue) {
                    const nextStep = this.getNextStep(step.id);
                    if (nextStep) {
                        this.executeStep(nextStep);
                    } else {
                        this.stopFlow('Flow execution complete.');
                    }
                }
                break;
            case 'consolidator':
                const activeMessages = chatlog.getActiveMessageValues().map((_, i) => chatlog.getNthMessage(i));

                let sourceMessage = null;
                for (let i = activeMessages.length - 1; i >= 0; i--) {
                    const msg = activeMessages[i];
                    if (msg && msg.answerAlternatives && msg.answerAlternatives.messages.length > 1) {
                        sourceMessage = msg;
                        break;
                    }
                }

                if (!sourceMessage) {
                    triggerError(`Consolidator could not find a preceding step with alternatives.`);
                    return this.stopFlow('Invalid flow structure for Consolidator.');
                }

                const consolidatedContent = sourceMessage.answerAlternatives.messages.map((alternativeStartMessage, i) => {
                    let turnContent = '';
                    let currentMessageInTurn = alternativeStartMessage;
                    while (currentMessageInTurn) {
                        if (currentMessageInTurn.value) {
                            const { role, content } = currentMessageInTurn.value;
                            turnContent += `**${role.charAt(0).toUpperCase() + role.slice(1)}:**\n${content}\n\n`;
                        }

                        if (currentMessageInTurn.answerAlternatives && currentMessageInTurn.answerAlternatives.messages.length > 0) {
                            // In a non-branching chain (like agent-tool-agent), there should only be one message.
                            // We assume the first message is the continuation of the chain.
                            currentMessageInTurn = currentMessageInTurn.answerAlternatives.messages[0];
                        } else {
                            currentMessageInTurn = null;
                        }
                    }
                    return `--- ALTERNATIVE ${i + 1} ---\n${turnContent.trim()}`;
                }).join('\n\n');

                const finalPrompt = `${step.prePrompt || ''}\n\n${consolidatedContent}\n\n${step.postPrompt || ''}`;
                chat.activeAgentId = step.agentId;
                this.store.set('currentChat', { ...chat });
                this.app.submitUserMessage(finalPrompt, 'user');
                break;
            case 'echo-answer': {
                const rlaChatlog = this.app.ui.chatBox.chatlog;
                const rlaMessages = rlaChatlog.getActiveMessageValues().map((msg, i) => ({
                    ...rlaChatlog.getNthMessage(i),
                    originalIndex: i
                }));

                let lastMessage = rlaMessages[rlaMessages.length - 1];
                let endOfAiAnswerRange = rlaMessages.length - 1;

                if (lastMessage && (lastMessage.value.role === 'user' || lastMessage.value.role === 'system')) {
                    endOfAiAnswerRange--;
                }

                let startOfAiAnswerRange = -1;
                let userMessageIndexToDelete = -1;
                for (let i = endOfAiAnswerRange; i >= 0; i--) {
                    const msg = rlaMessages[i].value;
                    if (msg.role === 'user' || msg.role === 'system') {
                        startOfAiAnswerRange = i + 1;
                        userMessageIndexToDelete = i;
                        break;
                    }
                }
                if (startOfAiAnswerRange === -1) { // No user/system message found before
                    const firstMessage = rlaChatlog.getFirstMessage();
                    const hasSystemPrompt = firstMessage && firstMessage.value.role === 'system';
                    startOfAiAnswerRange = hasSystemPrompt ? 1 : 0;
                }

                const aiAnswerMessages = rlaMessages.slice(startOfAiAnswerRange, endOfAiAnswerRange + 1);

                if (aiAnswerMessages.length === 0) {
                    triggerError('Reformat step could not find an AI answer to process.');
                    return this.stopFlow('No AI answer found.');
                }

                let fullAnswerText = '';
                const messagesToDelete = new Set();

                for (const msg of aiAnswerMessages) {
                    let contentToAppend = '';
                    if (msg.value) {
                        if (msg.value.content) {
                            let content = msg.value.content;
                            if (typeof content !== 'string') {
                                content = JSON.stringify(content, null, 2);
                            }
                            contentToAppend += content;
                        }
                        if (msg.value.tool_calls) {
                            contentToAppend += JSON.stringify(msg.value.tool_calls, null, 2);
                        }
                    }

                    if (contentToAppend) {
                        fullAnswerText += contentToAppend + '\n\n';
                    }
                    messagesToDelete.add(msg.originalIndex);
                }

                fullAnswerText = fullAnswerText.trim();
                const newPrompt = `${step.prePrompt || ''}\n\n${fullAnswerText}\n\n${step.postPrompt || ''}`;

                if (step.deleteAIAnswer) {
                    const indicesToDelete = Array.from(messagesToDelete).sort((a, b) => b - a);
                    for (const index of indicesToDelete) {
                        rlaChatlog.deleteNthMessage(index);
                    }

                    if (step.deleteUserMessage && userMessageIndexToDelete !== -1) {
                         const userMessage = rlaChatlog.getNthMessage(userMessageIndexToDelete);
                        if (userMessage && userMessage.value.role === 'user') {
                            rlaChatlog.deleteNthMessage(userMessageIndexToDelete);
                        }
                    }
                }

                chat.activeAgentId = step.agentId;
                this.store.set('currentChat', { ...chat });
                this.app.submitUserMessage(newPrompt, 'user');
                break;
            }
        }
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
    getNextStep(stepId, outputName = 'default') {
        const chat = this.store.get('currentChat');
        const connection = chat.flow.connections.find(c => c.from === stepId && (c.outputName || 'default') === outputName);
        return connection ? chat.flow.steps.find(s => s.id === connection.to) : null;
    },

    // --- Hooks Definition ---
    hooks: {
        onModifySystemPrompt: (systemContent) => {
            const store = agentsPlugin.store;
            if (!store) return systemContent;
            let cleanedContent = systemContent
                .replace(/\n\n--- AGENT DEFINITION ---\n[\s\S]*?\n--- END AGENT DEFINITION ---/g, '')
                .replace(/\n\n--- AGENT TOOLS ---\n[\s\S]*?\n--- END AGENT TOOLS ---/g, '');
            const chat = store.get('currentChat');
            if (!chat || !chat.activeAgentId) return cleanedContent;
            const agent = chat.agents.find(a => a.id === chat.activeAgentId);
            if (!agent) return cleanedContent;
            let modified = cleanedContent + `\n\n--- AGENT DEFINITION ---\n${agent.systemPrompt}\n--- END AGENT DEFINITION ---`;
            const tools = chat.agents.filter(a => a.availableAsTool && a.id !== chat.activeAgentId);
            if (tools.length > 0) {
                modified += '\n\n--- AGENT TOOLS ---\n';

                modified += `### Agent Tools:

To call an agent tool, use: <dma:tool_call name="agent_name_agent"><parameter name="prompt">...</parameter></dma:tool_call>
### Available Tools:\n\n`;

                tools.forEach(t => { modified += `- ${t.name}: ${t.description}\n`; });
                modified += '\n--- END AGENT TOOLS ---';
            }
            return modified;
        },
        onMessageComplete: async (message, chatlog, chatbox) => {
            if (!message.value) return; // Defend against null message value
            const { toolCalls } = parseFunctionCalls(message.value.content);

            // --- Multi-Message Continuation ---
            if (agentsPlugin.flowRunning && agentsPlugin.multiMessageInfo.active) {
                if (toolCalls.length > 0) return; // Wait for tool calls to complete

                const { step, counter, messageToBranchFrom } = agentsPlugin.multiMessageInfo;
                if (counter < step.count) {
                    agentsPlugin.multiMessageInfo.counter++;
                    const chat = agentsPlugin.store.get('currentChat');
                    chat.activeAgentId = step.agentId;
                    agentsPlugin.store.set('currentChat', { ...chat });
                    addAlternativeToChat(chatlog, messageToBranchFrom, null);
                    agentsPlugin.app.generateAIResponse({}, chatlog);
                    return;
                } else {
                    agentsPlugin.multiMessageInfo = { active: false, step: null, counter: 0, messageToBranchFrom: null };
                }
            }

            // --- Agent Tool Call Processing ---
            const context = {
                app: agentsPlugin.app,
                store: agentsPlugin.store,
            };
            await processToolCalls(message, chatlog, chatbox, filterAgentCalls, executeAgentCall, context);

            // --- Flow Continuation ---
            // Re-parse *after* processToolCalls might have added its own messages.
            const newToolCalls = parseFunctionCalls(message.value.content).toolCalls;
            if (agentsPlugin.flowRunning && newToolCalls.length === 0) {
                const currentChat = agentsPlugin.store.get('currentChat');
                const currentStep = currentChat.flow.steps.find(s => s.id === agentsPlugin.currentStepId);

                if (currentStep && currentStep.type === 'prompt-and-clear') {
                    const activeMessages = chatlog.getActiveMessageValues();
                    const userMessageIndex = activeMessages.length - 2;
                    const firstMessage = chatlog.getFirstMessage();
                    const hasSystemPrompt = firstMessage && firstMessage.value.role === 'system';
                    const startIndex = hasSystemPrompt ? 1 : 0;
                    for (let i = userMessageIndex - 1; i >= startIndex; i--) {
                        chatlog.deleteNthMessage(i);
                    }
                }

                const { steps, connections } = currentChat.flow;
                const nextConnection = connections.find(c => c.from === agentsPlugin.currentStepId);
                const nextStep = nextConnection ? steps.find(s => s.id === nextConnection.to) : null;
                if (nextStep) {
                    agentsPlugin.executeStep(nextStep);
                } else {
                    agentsPlugin.stopFlow('Flow execution complete.');
                }
            }
        }
    }
};
function filterAgentCalls(call) {
    return call.name.endsWith('_agent');
}

async function executeAgentCall(call, context) {
    const { app, store } = context;
    const currentChat = store.get('currentChat');
    const agentToCall = currentChat.agents.find(a => `${a.name.toLowerCase().replace(/\s+/g, '_')}_agent` === call.name);

    if (!agentToCall) {
        return { id: call.id, error: `Agent "${call.name}" not found.` };
    }
    const prompt = call.params.prompt;
    if (typeof prompt !== 'string') {
        return { id: call.id, error: `Agent call to "${call.name}" is missing the "prompt" parameter.` };
    }

    const payload = {
        model: app.configService.getItem('model', ''),
        messages: [
            { role: 'system', content: agentToCall.systemPrompt },
            { role: 'user', content: prompt }
        ],
        temperature: Number(app.ui.temperatureEl.value),
        top_p: Number(app.ui.topPEl.value),
        stream: true
    };

    try {
        const reader = await app.apiService.streamAPIResponse(payload, app.configService.getItem('endpoint', defaultEndpoint), app.configService.getItem('apiKey', ''), new AbortController().signal);
        let responseContent = '';
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            chunk.split('\n').forEach(line => {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data.trim() !== '[DONE]') {
                        try {
                            responseContent += JSON.parse(data).choices[0]?.delta?.content || '';
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
}
export { agentsPlugin };
