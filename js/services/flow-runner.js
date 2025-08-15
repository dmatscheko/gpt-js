/**
 * @fileoverview Service for executing agent flows.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';

class FlowRunner {
    constructor(flow, agents, chatService, app) {
        this.flow = flow;
        this.agents = agents;
        this.chatService = chatService;
        this.app = app;
        this.stepLimit = 10; // Configurable safety limit
    }

    async run() {
        log(3, 'FlowRunner: Starting flow execution.');
        const startNode = this.findStartNode();
        if (!startNode) {
            triggerError("Flow execution failed: Flow must have exactly one starting node (a node with no incoming connections).");
            return;
        }

        let currentNode = startNode;
        let executionCount = 0;

        while (currentNode && executionCount < this.stepLimit) {
            executionCount++;
            await this.executeNode(currentNode);

            const nextNodeId = this.findNextNodeId(currentNode.id);
            if (nextNodeId) {
                currentNode = this.flow.nodes.find(n => n.id === nextNodeId);
            } else {
                log(3, 'FlowRunner: Flow execution finished.');
                currentNode = null;
            }
        }

        if (executionCount >= this.stepLimit) {
            log(2, 'FlowRunner: Flow execution stopped: Step limit reached.');
            const chatlog = this.chatService.getCurrentChatlog();
            chatlog.addMessage({ role: 'system', content: 'Flow execution stopped: Step limit reached.' });
            this.app.ui.chatBox.update();
        }
    }

    findStartNode() {
        if (!this.flow.nodes || this.flow.nodes.length === 0) return null;
        const nodesWithIncomingConnections = new Set(this.flow.connections.map(c => c.to));
        const startNodes = this.flow.nodes.filter(n => !nodesWithIncomingConnections.has(n.id));

        if (startNodes.length !== 1) {
            return null;
        }
        return startNodes[0];
    }

    findNextNodeId(nodeId) {
        const connection = this.flow.connections.find(c => c.from === nodeId);
        return connection ? connection.to : null;
    }

    async executeNode(node) {
        log(4, `FlowRunner: Executing node ${node.id}`);
        const agent = this.agents.find(a => a.id === node.agentId);
        if (!agent) {
            triggerError(`Agent with ID ${node.agentId} not found for node ${node.id}`);
            return;
        }

        const chatlog = this.chatService.getCurrentChatlog();

        if (node.text) {
             const newMessage = chatlog.addMessage({ role: 'user', content: node.text });
             this.app.hooks.afterMessageAdd.forEach(fn => fn(newMessage));
        }

        chatlog.addMessage({ role: 'assistant', content: null });
        this.app.ui.chatBox.update();

        await this.app.generateAIResponse({ agentSystemPrompt: agent.systemPrompt });
    }
}

export default FlowRunner;
