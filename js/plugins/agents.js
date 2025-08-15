/**
 * @fileoverview This plugin adds the 'Agents' and 'Flow' tabs to the UI
 */

'use strict';

import { hooks, registerPlugin } from '../hooks.js';
import { log } from '../utils/logger.js';
import { Chatlog } from '../components/chatlog.js';

const agentsPlugin = {
    agents: [],
    store: null,
    chatService: null,
    app: null,

    renderAgents: function() {
        const agentCardsContainer = document.getElementById('agent-cards-container');
        agentCardsContainer.innerHTML = '';
        this.agents.forEach(agent => {
            const card = document.createElement('div');
            card.className = 'agent-card';
            card.innerHTML = `
                <h4>${agent.name}</h4>
                <p>${agent.description}</p>
                <button class="edit-agent-button" data-id="${agent.id}">Edit</button>
                <button class="delete-agent-button" data-id="${agent.id}">Delete</button>
            `;
            agentCardsContainer.appendChild(card);
        });

        document.querySelectorAll('.edit-agent-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const agentId = e.target.dataset.id;
                const agent = this.agents.find(a => a.id === agentId);
                if (agent) {
                    document.getElementById('agentId').value = agent.id;
                    document.getElementById('agentName').value = agent.name;
                    document.getElementById('agentDescription').value = agent.description;
                    document.getElementById('agentSystemPrompt').value = agent.systemPrompt;
                    document.getElementById('agentAvailableAsTool').checked = agent.availableAsTool;

                    document.getElementById('agent-form-container').style.display = 'block';
                    document.getElementById('agents-container').style.display = 'none';
                }
            });
        });

        document.querySelectorAll('.delete-agent-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const agentId = e.target.dataset.id;
                const currentChat = this.store.get('currentChat');
                if (currentChat) {
                    currentChat.agents = currentChat.agents.filter(a => a.id !== agentId);
                    this.chatService.persistChats();
                    this.renderAgents();
                }
            });
        });
    },

    renderFlow: function() {
        const flowCanvas = document.getElementById('flow-canvas');
        if (!flowCanvas) return;
        flowCanvas.innerHTML = '';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        flowCanvas.appendChild(svg);

        const currentChat = this.store.get('currentChat');
        if (!currentChat || !currentChat.flow) return;

        currentChat.flow.connections.forEach(conn => {
            const fromStep = currentChat.flow.steps.find(s => s.id === conn.from);
            const toStep = currentChat.flow.steps.find(s => s.id === conn.to);
            if (fromStep && toStep) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', fromStep.x + 75);
                line.setAttribute('y1', fromStep.y + 40);
                line.setAttribute('x2', toStep.x + 75);
                line.setAttribute('y2', toStep.y);
                line.setAttribute('stroke', 'white');
                line.setAttribute('stroke-width', '2');
                svg.appendChild(line);
            }
        });

        currentChat.flow.steps.forEach(step => {
            const stepEl = document.createElement('div');
            stepEl.className = 'flow-step';
            stepEl.style.left = `${step.x}px`;
            stepEl.style.top = `${step.y}px`;
            stepEl.dataset.id = step.id;

            const agent = this.agents.find(a => a.id === step.agentId);
            const agentName = agent ? agent.name : 'Select Agent';

            stepEl.innerHTML = `
                <h4>${agentName}</h4>
                <textarea class="step-prompt" placeholder="Enter prompt...">${step.prompt || ''}</textarea>
                <div class="connector top"></div>
                <div class="connector bottom"></div>
            `;
            flowCanvas.appendChild(stepEl);

            stepEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('connector')) return;
                const agentSelector = document.createElement('select');
                agentSelector.innerHTML = `<option value="">Select Agent</option>`;
                this.agents.forEach(agent => {
                    agentSelector.innerHTML += `<option value="${agent.id}">${agent.name}</option>`;
                });
                agentSelector.value = step.agentId;
                stepEl.appendChild(agentSelector);

                agentSelector.addEventListener('change', (e) => {
                    step.agentId = e.target.value;
                    this.chatService.persistChats();
                    this.renderFlow();
                });
            });

            const promptTextArea = stepEl.querySelector('.step-prompt');
            promptTextArea.addEventListener('change', (e) => {
                step.prompt = e.target.value;
                this.chatService.persistChats();
            });
        });

        let draggingStep = null;
        let offsetX, offsetY;

        flowCanvas.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('flow-step')) {
                draggingStep = e.target;
                offsetX = e.clientX - draggingStep.offsetLeft;
                offsetY = e.clientY - draggingStep.offsetTop;
            }
        });

        flowCanvas.addEventListener('mousemove', (e) => {
            if (draggingStep) {
                draggingStep.style.left = `${e.clientX - offsetX}px`;
                draggingStep.style.top = `${e.clientY - offsetY}px`;
            }
        });

        flowCanvas.addEventListener('mouseup', (e) => {
            if (draggingStep) {
                const stepId = draggingStep.dataset.id;
                const step = currentChat.flow.steps.find(s => s.id === stepId);
                if (step) {
                    step.x = draggingStep.offsetLeft;
                    step.y = draggingStep.offsetTop;
                    this.chatService.persistChats();
                    this.renderFlow();
                }
                draggingStep = null;
            }
        });

        let connectingFrom = null;

        flowCanvas.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('connector')) {
                e.stopPropagation();
                const stepEl = e.target.closest('.flow-step');
                connectingFrom = stepEl.dataset.id;
            }
        });

        flowCanvas.addEventListener('mouseup', (e) => {
            if (connectingFrom && e.target.classList.contains('connector')) {
                const toStepEl = e.target.closest('.flow-step');
                const toStepId = toStepEl.dataset.id;
                if (connectingFrom !== toStepId) {
                    const newConnection = {
                        from: connectingFrom,
                        to: toStepId
                    };
                    currentChat.flow.connections.push(newConnection);
                    this.chatService.persistChats();
                    this.renderFlow();
                }
            }
            connectingFrom = null;
        });
    },

    runFlow: async function() {
        const currentChat = this.store.get('currentChat');
        if (!currentChat || !currentChat.flow) return;

        const { steps, connections } = currentChat.flow;
        if (steps.length === 0) return;

        const incomingConnections = new Set(connections.map(c => c.to));
        const startingSteps = steps.filter(s => !incomingConnections.has(s.id));

        if (startingSteps.length !== 1) {
            alert('There must be exactly one starting step (a step with no incoming connections).');
            return;
        }

        let currentStep = startingSteps[0];
        let stepCount = 0;
        const maxSteps = 20; // Safety limit

        const executeStep = async (step) => {
            if (!step || stepCount >= maxSteps) {
                alert('Flow finished or safety limit reached.');
                return;
            }

            stepCount++;
            const agent = this.agents.find(a => a.id === step.agentId);
            if (agent) {
                const chatlog = this.store.get('ui').chatBox.chatlog;
                chatlog.addMessage({ role: 'user', content: step.prompt });

                const tempChatlog = new Chatlog();
                const systemPrompt = agent.systemPrompt;
                tempChatlog.addMessage({ role: 'system', content: systemPrompt });
                tempChatlog.addMessage({ role: 'user', content: step.prompt });

                this.store.set('regenerateLastAnswer', false);
                chatlog.addMessage(null);

                await this.app.generateAIResponse({}, tempChatlog);

                const lastMessage = tempChatlog.getLastMessage();
                const assistantMessage = { role: 'assistant', content: lastMessage.value.content };
                chatlog.addMessage(assistantMessage);
            }

            const nextConnection = connections.find(c => c.from === step.id);
            if (nextConnection) {
                const nextStep = steps.find(s => s.id === nextConnection.to);
                await executeStep(nextStep);
            } else {
                alert('Flow finished.');
            }
        };

        await executeStep(currentStep);
    },

    init: function() {
        log(3, 'Agents plugin initialized');

        const flowTab = document.getElementById('flowTab');
        flowTab.innerHTML = `
            <div id="flow-container">
                <h2>Flow</h2>
                <button id="addStepButton">Add Step</button>
                <button id="runFlowButton">Run Flow</button>
                <div id="flow-canvas"></div>
            </div>
        `;

        const agentsTab = document.getElementById('agentsTab');
        agentsTab.innerHTML = `
            <div id="agents-container">
                <h2>Agents</h2>
                <button id="addAgentButton">Add Agent</button>
                <div id="agent-cards-container"></div>
            </div>
            <div id="agent-form-container" style="display: none;">
                <h3>Add/Edit Agent</h3>
                <form id="agent-form">
                    <input type="hidden" id="agentId" name="agentId">
                    <label for="agentName">Name:</label>
                    <input type="text" id="agentName" name="agentName" required>
                    <label for="agentDescription">Description:</label>
                    <textarea id="agentDescription" name="agentDescription" required></textarea>
                    <label for="agentSystemPrompt">System Prompt:</label>
                    <textarea id="agentSystemPrompt" name="agentSystemPrompt" required></textarea>
                    <label for="agentAvailableAsTool">
                        <input type="checkbox" id="agentAvailableAsTool" name="agentAvailableAsTool">
                        Available as a tool
                    </label>
                    <button type="submit">Save Agent</button>
                    <button type="button" id="cancelAgentForm">Cancel</button>
                </form>
            </div>
        `;

        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        const inputContainer = document.getElementById('inputContainer');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                tabContents.forEach(content => content.classList.remove('active'));
                const tabId = button.dataset.tab;
                document.getElementById(tabId).classList.add('active');

                if (tabId === 'chatTab') {
                    inputContainer.style.display = 'flex';
                } else {
                    inputContainer.style.display = 'none';
                }
            });
        });

        const addAgentButton = document.getElementById('addAgentButton');
        const agentFormContainer = document.getElementById('agent-form-container');
        const agentsContainer = document.getElementById('agents-container');
        const cancelAgentForm = document.getElementById('cancelAgentForm');

        addAgentButton.addEventListener('click', () => {
            agentFormContainer.style.display = 'block';
            agentsContainer.style.display = 'none';
        });

        cancelAgentForm.addEventListener('click', () => {
            agentFormContainer.style.display = 'none';
            agentsContainer.style.display = 'block';
            document.getElementById('agent-form').reset();
        });

        const agentForm = document.getElementById('agent-form');
        agentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const agentId = document.getElementById('agentId').value;
            const agentName = document.getElementById('agentName').value;
            const agentDescription = document.getElementById('agentDescription').value;
            const agentSystemPrompt = document.getElementById('agentSystemPrompt').value;
            const agentAvailableAsTool = document.getElementById('agentAvailableAsTool').checked;

            const currentChat = this.store.get('currentChat');
            if (!currentChat) return;

            if (agentId) {
                // Update existing agent
                const agent = currentChat.agents.find(a => a.id === agentId);
                if (agent) {
                    agent.name = agentName;
                    agent.description = agentDescription;
                    agent.systemPrompt = agentSystemPrompt;
                    agent.availableAsTool = agentAvailableAsTool;
                }
            } else {
                // Add new agent
                const newAgent = {
                    id: `agent-${Date.now()}`,
                    name: agentName,
                    description: agentDescription,
                    systemPrompt: agentSystemPrompt,
                    availableAsTool: agentAvailableAsTool
                };
                currentChat.agents.push(newAgent);
            }

            this.chatService.persistChats();
            this.renderAgents();
            agentFormContainer.style.display = 'none';
            agentsContainer.style.display = 'block';
            agentForm.reset();
        });

        const addStepButton = document.getElementById('addStepButton');
        addStepButton.addEventListener('click', () => {
            const currentChat = this.store.get('currentChat');
            if (!currentChat) return;

            const newStep = {
                id: `step-${Date.now()}`,
                agentId: null,
                x: 50,
                y: 50,
                prompt: ''
            };
            currentChat.flow.steps.push(newStep);
            this.chatService.persistChats();
            this.renderFlow();
        });

        const runFlowButton = document.getElementById('runFlowButton');
        runFlowButton.addEventListener('click', () => {
            this.runFlow();
        });

        this.renderAgents();
        this.renderFlow();
    },

    hooks: {
        onAppReady: (app) => {
            agentsPlugin.app = app;
            agentsPlugin.store = app.store;
            agentsPlugin.chatService = app.chatService;
            app.store.subscribe('currentChat', (chat) => {
                if (chat) {
                    agentsPlugin.agents = chat.agents || [];
                    agentsPlugin.renderAgents();
                    agentsPlugin.renderFlow();
                }
            });
        },
        onModifySystemPrompt: (systemPrompt) => {
            const currentChat = agentsPlugin.store.get('currentChat');
            if (!currentChat) return systemPrompt;

            const availableAgents = currentChat.agents.filter(a => a.availableAsTool);
            if (availableAgents.length === 0) return systemPrompt;

            let agentsPrompt = '\n\nAvailable Agents:\n';
            availableAgents.forEach(agent => {
                agentsPrompt += `- ${agent.name}: ${agent.description}\n`;
                agentsPrompt += `  To call this agent, use the following syntax:\n`;
                agentsPrompt += `  <dma:function_call name="${agent.name.toLowerCase().replace(/\s/g, '_')}_agent"><parameter name="prompt">Your prompt for the agent</parameter></dma:function_call>\n`;
            });

            return systemPrompt + agentsPrompt;
        },
        beforeApiCall: (payload, chatbox) => {
            const lastMessage = payload.messages[payload.messages.length - 1];
            const agentCallMatch = lastMessage.content.match(/<dma:function_call name="(.+?)_agent"><parameter name="prompt">(.+?)<\/parameter><\/dma:function_call>/);

            if (agentCallMatch) {
                const agentName = agentCallMatch[1].replace(/_/g, ' ');
                const prompt = agentCallMatch[2];
                const currentChat = agentsPlugin.store.get('currentChat');
                const agent = currentChat.agents.find(a => a.name.toLowerCase() === agentName);

                if (agent) {
                    const tempChatlog = new Chatlog();
                    const systemPrompt = agent.systemPrompt;
                    tempChatlog.addMessage({ role: 'system', content: systemPrompt });
                    tempChatlog.addMessage({ role: 'user', content: prompt });

                    agentsPlugin.app.generateAIResponse({}, tempChatlog).then(() => {
                        const lastMessage = tempChatlog.getLastMessage();
                        chatbox.chatlog.getLastMessage().value = lastMessage.value;
                        chatbox.chatlog.getLastMessage().cache = null;
                        chatbox.chatlog.notify();
                    });

                    return false; // Prevent the original API call
                }
            }
            return payload;
        }
    }
};

// Bind the context for the methods
agentsPlugin.init = agentsPlugin.init.bind(agentsPlugin);
agentsPlugin.renderAgents = agentsPlugin.renderAgents.bind(agentsPlugin);
agentsPlugin.renderFlow = agentsPlugin.renderFlow.bind(agentsPlugin);
agentsPlugin.runFlow = agentsPlugin.runFlow.bind(agentsPlugin);

registerPlugin(agentsPlugin);

export default agentsPlugin;
