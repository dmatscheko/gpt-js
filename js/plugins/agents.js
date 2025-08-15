/**
 * @fileoverview Plugin for managing AI agents and flows.
 */

'use strict';

import { log } from '../utils/logger.js';
import AgentsView from '../components/agents-view.js';
import FlowView from '../components/flow-view.js';
import { Chatlog } from '../components/chatlog.js';

async function handleAgentToolCall(message, chatlog, app) {
    const content = message.value.content;
    const toolCallRegex = /<dma:function_call id="([^"]+)" name="([^"]+)">\s*<parameter name="prompt">([\s\S]*?)<\/parameter>\s*<\/dma:function_call>/;
    const match = content.match(toolCallRegex);

    if (!match) return;

    log(3, 'Agent tool call detected.');

    const callId = match[1];
    const agentName = match[2];
    const prompt = match[3];

    const toolAgents = getToolAgents(app);
    const calledAgent = toolAgents.find(a => `${a.name.replace(/\s+/g, '_').toLowerCase()}_agent` === agentName);

    if (!calledAgent) {
        log(2, `Could not find agent: ${agentName}`);
        return;
    }

    message.setContent(content.replace(toolCallRegex, `\n[Calling agent: ${agentName}...]`));
    app.ui.chatBox.update();

    let toolResult = '';
    try {
        const tempChatlog = new Chatlog();
        const systemMessage = app.chatService.getCurrentChatlog().getNthMessage(0);
        let tempSystemContent = systemMessage.value.content.replace(/<dma:agent_definition>[\s\S]*?<\/dma:agent_definition>\n?/, '');
        tempSystemContent += `\n<dma:agent_definition>\n${calledAgent.systemPrompt}\n</dma:agent_definition>`;

        tempChatlog.addMessage({ role: 'system', content: tempSystemContent });
        tempChatlog.addMessage({ role: 'user', content: prompt });

        const payload = {
            model: app.configService.getModel(),
            messages: tempChatlog.getActiveMessageValues(),
            temperature: Number(app.ui.temperatureEl.value),
            top_p: Number(app.ui.topPEl.value),
            stream: true
        };

        const endpoint = app.configService.getEndpoint();
        const apiKey = app.configService.getApiKey();
        const reader = await app.apiService.streamAPIResponse(payload, endpoint, apiKey, new AbortController().signal);

        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const valueStr = decoder.decode(value);
            const chunks = valueStr.split('\n');
            chunks.forEach(chunk => {
                if (chunk.startsWith('data: ')) {
                    chunk = chunk.substring(6);
                    if (chunk && chunk !== '[DONE]') {
                        const data = JSON.parse(chunk);
                        if (data.choices[0].delta.content) {
                            toolResult += data.choices[0].delta.content;
                        }
                    }
                }
            });
        }
    } catch (error) {
        log(1, "Error during sub-agent execution:", error);
        toolResult = `Error executing agent: ${error.message}`;
    }

    chatlog.addMessage({
        role: 'tool',
        content: toolResult,
        tool_call_id: callId,
        name: agentName
    });

    chatlog.addMessage({ role: 'assistant', content: null });
    app.ui.chatBox.update();

    await app.generateAIResponse();
}

function getToolAgents(app) {
    const currentChat = app.store.get('currentChat');
    if (currentChat && currentChat.agents) {
        return currentChat.agents.filter(a => a.isTool);
    }
    return [];
}

function formatToolsForPrompt(toolAgents) {
    if (toolAgents.length === 0) return '';

    const toolList = toolAgents.map(agent => `
<dma:tool>
    <dma:name>${agent.name.replace(/\s+/g, '_').toLowerCase()}_agent</dma:name>
    <dma:description>${agent.description}</dma:description>
    <dma:parameters>
        <dma:parameter name="prompt" type="string" required="true">The prompt or question for the agent.</dma:parameter>
    </dma:parameters>
</dma:tool>
    `).join('');

    return `
You can use the following tools provided by other agents:
<dma:tools>${toolList}</dma:tools>
To call an agent tool, use the following syntax and include a unique ID for the call:
<dma:function_call id="call_..." name="agent_name"><parameter name="prompt">Your prompt for the agent.</parameter></dma:function_call>
    `;
}


const agentsPlugin = {
    hooks: {
        onRegisterTab: (tabManager, app) => {
            log(3, 'Agents plugin: Registering tabs');
            const chatService = app.chatService;
            const store = app.store;

            // Agents Tab
            const agentsContent = document.createElement('div');
            const agentsView = new AgentsView(agentsContent, {
                onAdd: (agent) => chatService.addAgent(agent),
                onUpdate: (agent) => chatService.updateAgent(agent),
                onDelete: (agentId) => chatService.deleteAgent(agentId),
            });
            tabManager.addTab('agents', 'Agents', agentsContent);

            // Flow Tab
            const flowContent = document.createElement('div');
            const flowView = new FlowView(flowContent, {
                onUpdate: (flow) => chatService.updateFlow(flow),
            }, app);
            tabManager.addTab('flow', 'Flow', flowContent);

            // Re-render views when chat changes
            store.subscribe('currentChat', (chat) => {
                if (chat) {
                    agentsView.render(chat.agents);
                    flowView.render(chat.flow, chat.agents);
                }
            });
        },
        onModifySystemPrompt: (systemContent, app) => {
            const toolAgents = getToolAgents(app);
            if (toolAgents.length > 0) {
                const toolPrompt = formatToolsForPrompt(toolAgents);
                return systemContent + '\n' + toolPrompt;
            }
            return systemContent;
        },
    }
};

export { agentsPlugin };
