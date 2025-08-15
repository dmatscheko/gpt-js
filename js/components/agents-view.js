/**
 * @fileoverview Component for managing agents in a chat.
 */

'use strict';

import { log } from '../utils/logger.js';

class AgentsView {
    constructor(container, { onAdd, onUpdate, onDelete }) {
        this.container = container;
        this.onAdd = onAdd;
        this.onUpdate = onUpdate;
        this.onDelete = onDelete;
        this.agents = [];
        this.editingAgentId = null;
    }

    render(agents) {
        this.agents = agents || [];
        this.container.innerHTML = `
            <div class="agents-view">
                <h2>Agents</h2>
                <div class="agent-list"></div>
                <button class="add-agent-btn">Add Agent</button>
                <div class="agent-form-container" style="display: none;"></div>
            </div>
        `;

        this.agentListEl = this.container.querySelector('.agent-list');
        this.formContainerEl = this.container.querySelector('.agent-form-container');

        this.container.querySelector('.add-agent-btn').addEventListener('click', () => {
            this.editingAgentId = null;
            this.renderForm();
        });

        this.renderAgentList();
    }

    renderAgentList() {
        this.agentListEl.innerHTML = '';
        if (this.agents.length === 0) {
            this.agentListEl.innerHTML = '<p>No agents defined for this chat.</p>';
            return;
        }

        this.agents.forEach(agent => {
            const agentCard = document.createElement('div');
            agentCard.className = 'agent-card';
            agentCard.innerHTML = `
                <h3>${agent.name}</h3>
                <p>${agent.description}</p>
                <div class="agent-card-buttons">
                    <button class="edit-agent-btn">Edit</button>
                    <button class="delete-agent-btn">Delete</button>
                </div>
            `;
            agentCard.querySelector('.edit-agent-btn').addEventListener('click', () => {
                this.editingAgentId = agent.id;
                this.renderForm(agent);
            });
            agentCard.querySelector('.delete-agent-btn').addEventListener('click', () => {
                if (confirm(`Are you sure you want to delete the agent "${agent.name}"?`)) {
                    this.onDelete(agent.id);
                }
            });
            this.agentListEl.appendChild(agentCard);
        });
    }

    renderForm(agent = {}) {
        const { id, name = '', description = '', systemPrompt = '', isTool = false } = agent;
        this.formContainerEl.innerHTML = `
            <form class="agent-form">
                <input type="hidden" name="id" value="${id || ''}">
                <label>Name:</label>
                <input type="text" name="name" value="${name}" required>
                <label>Description:</label>
                <textarea name="description">${description}</textarea>
                <label>System Prompt:</label>
                <textarea name="systemPrompt" rows="5">${systemPrompt}</textarea>
                <label>
                    <input type="checkbox" name="isTool" ${isTool ? 'checked' : ''}>
                    Available as a tool
                </label>
                <div class="agent-form-buttons">
                    <button type="submit">Save</button>
                    <button type="button" class="cancel-btn">Cancel</button>
                </div>
            </form>
        `;
        this.formContainerEl.style.display = 'block';

        const form = this.formContainerEl.querySelector('.agent-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = {
                id: this.editingAgentId || `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: formData.get('name'),
                description: formData.get('description'),
                systemPrompt: formData.get('systemPrompt'),
                isTool: formData.get('isTool') === 'on',
            };

            if (this.editingAgentId) {
                this.onUpdate(data);
            } else {
                this.onAdd(data);
            }
            this.formContainerEl.style.display = 'none';
        });

        form.querySelector('.cancel-btn').addEventListener('click', () => {
            this.formContainerEl.style.display = 'none';
        });
    }
}

export default AgentsView;
