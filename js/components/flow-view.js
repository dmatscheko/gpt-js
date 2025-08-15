/**
 * @fileoverview Component for the flow editor canvas.
 */

'use strict';

import { log } from '../utils/logger.js';
import FlowRunner from '../services/flow-runner.js';

class FlowView {
    constructor(container, { onUpdate }, app) {
        this.container = container;
        this.onUpdate = onUpdate;
        this.app = app;
        this.flow = { nodes: [], connections: [] };
        this.agents = [];

        this.isDragging = false;
        this.draggedNode = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.isConnecting = false;
        this.startConnector = null;
        this.tempLine = null;
    }

    render(flow, agents) {
        this.flow = flow || { nodes: [], connections: [] };
        this.agents = agents || [];
        this.container.innerHTML = `
            <div class="flow-view">
                <div class="flow-controls">
                    <button class="add-step-btn">Add Step</button>
                    <button class="run-flow-btn">Run Flow</button>
                </div>
                <div class="flow-canvas-wrapper">
                    <svg class="flow-connections"></svg>
                    <div class="flow-canvas"></div>
                </div>
            </div>
        `;

        this.canvas = this.container.querySelector('.flow-canvas');
        this.svg = this.container.querySelector('.flow-connections');

        this.container.querySelector('.add-step-btn').addEventListener('click', () => this.addNode());
        this.container.querySelector('.run-flow-btn').addEventListener('click', () => this.runFlow());

        this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.onCanvasMouseLeave());

        this.renderNodes();
        this.renderConnections();
    }

    renderNodes() {
        this.canvas.innerHTML = '';
        this.flow.nodes.forEach(node => {
            const nodeEl = this.createNodeElement(node);
            this.canvas.appendChild(nodeEl);
        });
    }

    createNodeElement(node) {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'flow-node';
        nodeEl.dataset.id = node.id;
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;

        const agentOptions = this.agents.map(agent =>
            `<option value="${agent.id}" ${node.agentId === agent.id ? 'selected' : ''}>${agent.name}</option>`
        ).join('');

        nodeEl.innerHTML = `
            <div class="flow-node-header">Step</div>
            <div class="flow-node-content">
                <textarea class="node-text" placeholder="Enter message...">${node.text || ''}</textarea>
                <select class="node-agent-select">
                    <option value="">-- Select Agent --</option>
                    ${agentOptions}
                </select>
            </div>
            <div class="flow-connector top" data-node-id="${node.id}"></div>
            <div class="flow-connector bottom" data-node-id="${node.id}"></div>
        `;

        nodeEl.querySelector('.node-text').addEventListener('change', (e) => this.updateNodeData(node.id, 'text', e.target.value));
        nodeEl.querySelector('.node-agent-select').addEventListener('change', (e) => this.updateNodeData(node.id, 'agentId', e.target.value));

        return nodeEl;
    }

    renderConnections() {
        this.svg.innerHTML = '';
        this.flow.connections.forEach(conn => {
            const fromNodeEl = this.canvas.querySelector(`.flow-node[data-id="${conn.from}"]`);
            const toNodeEl = this.canvas.querySelector(`.flow-node[data-id="${conn.to}"]`);
            if (fromNodeEl && toNodeEl) {
                const fromRect = fromNodeEl.querySelector('.bottom').getBoundingClientRect();
                const toRect = toNodeEl.querySelector('.top').getBoundingClientRect();
                const canvasRect = this.canvas.getBoundingClientRect();

                const x1 = fromRect.left + fromRect.width / 2 - canvasRect.left;
                const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top;
                const x2 = toRect.left + toRect.width / 2 - canvasRect.left;
                const y2 = toRect.top + toRect.height / 2 - canvasRect.top;

                this.drawConnection(x1, y1, x2, y2);
            }
        });
    }

    drawConnection(x1, y1, x2, y2) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`);
        path.setAttribute('stroke', '#ccc');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        this.svg.appendChild(path);
    }

    addNode() {
        const newNode = {
            id: `node-${crypto.randomUUID()}`,
            x: 50,
            y: 50,
            text: '',
            agentId: null,
        };
        this.flow.nodes.push(newNode);
        this.onUpdate(this.flow);
        this.renderNodes();
    }

    updateNodeData(nodeId, key, value) {
        const node = this.flow.nodes.find(n => n.id === nodeId);
        if (node) {
            node[key] = value;
            this.onUpdate(this.flow);
        }
    }

    onCanvasMouseDown(e) {
        const nodeEl = e.target.closest('.flow-node');
        if (nodeEl) {
            this.isDragging = true;
            this.draggedNode = nodeEl;
            const rect = nodeEl.getBoundingClientRect();
            this.dragOffsetX = e.clientX - rect.left;
            this.dragOffsetY = e.clientY - rect.top;
        }

        if (e.target.classList.contains('flow-connector')) {
            this.isConnecting = true;
            this.startConnector = e.target;
        }
    }

    onCanvasMouseMove(e) {
        if (this.isDragging && this.draggedNode) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left - this.dragOffsetX;
            const y = e.clientY - canvasRect.top - this.dragOffsetY;
            this.draggedNode.style.left = `${x}px`;
            this.draggedNode.style.top = `${y}px`;
            this.renderConnections();
        }

        if (this.isConnecting && this.startConnector) {
            if (!this.tempLine) {
                this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.tempLine.setAttribute('stroke', '#aaa');
                this.tempLine.setAttribute('stroke-width', '2');
                this.tempLine.setAttribute('fill', 'none');
                this.svg.appendChild(this.tempLine);
            }
            const fromRect = this.startConnector.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            const x1 = fromRect.left + fromRect.width / 2 - canvasRect.left;
            const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top;
            const x2 = e.clientX - canvasRect.left;
            const y2 = e.clientY - canvasRect.top;
            this.tempLine.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`);
        }
    }

    onCanvasMouseUp(e) {
        if (this.isDragging && this.draggedNode) {
            const nodeId = this.draggedNode.dataset.id;
            const node = this.flow.nodes.find(n => n.id === nodeId);
            if (node) {
                node.x = parseInt(this.draggedNode.style.left, 10);
                node.y = parseInt(this.draggedNode.style.top, 10);
                this.onUpdate(this.flow);
            }
        }
        this.isDragging = false;
        this.draggedNode = null;

        if (this.isConnecting) {
            const endConnector = e.target.closest('.flow-connector');
            if (endConnector && this.startConnector && endConnector !== this.startConnector) {
                const fromNodeId = this.startConnector.dataset.nodeId;
                const toNodeId = endConnector.dataset.nodeId;
                if (fromNodeId !== toNodeId) {
                    this.flow.connections.push({ from: fromNodeId, to: toNodeId });
                    this.onUpdate(this.flow);
                    this.renderConnections();
                }
            }
            if (this.tempLine) {
                this.tempLine.remove();
                this.tempLine = null;
            }
        }
        this.isConnecting = false;
        this.startConnector = null;
    }

    onCanvasMouseLeave() {
        this.isDragging = false;
        this.draggedNode = null;
        if (this.isConnecting) {
            if (this.tempLine) {
                this.tempLine.remove();
                this.tempLine = null;
            }
        }
        this.isConnecting = false;
        this.startConnector = null;
    }

    runFlow() {
        log(3, 'FlowView: "Run Flow" button clicked.');
        if (this.app) {
            const runner = new FlowRunner(this.flow, this.agents, this.app.chatService, this.app);
            runner.run();
        } else {
            log(1, 'FlowView: App instance not available.');
        }
    }
}

export default FlowView;
