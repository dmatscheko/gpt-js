/**
 * @fileoverview Service for handling AI response generation.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';
import * as UIManager from '../ui-manager.js';
import { defaultEndpoint } from '../config.js';

/**
 * @class AIService
 * Manages the generation of AI responses, including handling settings,
 * API calls, and streaming.
 */
class AIService {
    /**
     * @param {import('../state/store.js').default} store - The application's state store.
     * @param {import('./config-service.js').default} configService - The configuration service.
     * @param {import('./api-service.js').default} apiService - The API service.
     */
    constructor(store, configService, apiService) {
        this.store = store;
        this.configService = configService;
        this.apiService = apiService;
    }

    /**
     * Generates an AI response.
     * @param {import('../components/chatlog.js').Chatlog} targetChatlog - The chatlog to generate a response for.
     * @param {Object} [options={}] - Options for the generation.
     */
    async generateResponse(targetChatlog, options = {}) {
        log(3, 'AIService: generateResponse called');
        if (this.store.get('receiving')) return;

        const currentChat = this.store.get('currentChat');
        if (!currentChat || !targetChatlog) {
            triggerError('Cannot generate AI response without a current chat and target chatlog.');
            return;
        }

        // 1. Get settings from all scopes
        const globalSettings = this.configService.getModelSettings();
        const chatSettings = currentChat.modelSettings || {};

        let agentSettings = {};
        const activeAgentId = currentChat.activeAgentId;
        if (activeAgentId) {
            const agent = currentChat.agents.find(a => a.id === activeAgentId);
            if (agent && agent.useCustomModelSettings) {
                agentSettings = agent.modelSettings || {};
            }
        }

        // 2. Merge settings (agent > chat > global > options)
        const mergedSettings = { ...globalSettings, ...chatSettings, ...agentSettings, ...options };

        if (!mergedSettings.model) {
            log(2, 'AIService: No model selected');
            triggerError('Please select a model.');
            return;
        }

        this.store.set('receiving', true);
        const targetMessage = targetChatlog.getLastMessage();
        try {
            let payload = {
                messages: targetChatlog.getActiveMessageValues().filter(m => m.content !== null),
                stream: true
            };

            // 3. Apply settings to payload via hook
            hooks.onModelSettings.forEach(fn => fn(payload, mergedSettings));

            // Don't send a request if there are no messages or only a system prompt.
            if (payload.messages.length === 0) return;
            if (payload.messages.length === 1 && payload.messages[0]?.role === 'system') {
                this.store.set('receiving', false);
                return;
            }

            if (payload.messages[0]?.role === 'system') {
                let systemContent = payload.messages[0].content;
                for (let fn of hooks.onModifySystemPrompt) {
                    systemContent = fn(systemContent) || systemContent;
                }
                payload.messages[0].content = systemContent;
            }
            // const chatBox = this.store.get('ui').chatBox; // Hooks might need this
            payload = hooks.beforeApiCall.reduce((p, fn) => fn(p, null) || p, payload);

            const endpoint = this.configService.getItem('endpoint', defaultEndpoint);
            const apiKey = this.configService.getItem('apiKey', '');
            const abortSignal = this.store.get('controller').signal;
            const reader = await this.apiService.streamAPIResponse(payload, endpoint, apiKey, abortSignal);

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
                if (delta === '') continue;
                log(5, 'AIService: Received chunk', delta);
                hooks.onChunkReceived.forEach(fn => fn(delta));
                targetMessage.appendContent(delta);
                const pos = targetChatlog.getMessagePos(targetMessage);
                UIManager.updateMessageContent(pos, targetMessage);
            }
        } catch (error) {
            this.store.set('receiving', false); // Ensure receiving is false on error
            if (error.name === 'AbortError') {
                log(3, 'AIService: Response aborted');
                hooks.onCancel.forEach(fn => fn());
                this.store.set('controller', new AbortController());
                const lastMessage = targetChatlog.getLastMessage();
                if (lastMessage && lastMessage.value === null) {
                    const lastAlternatives = targetChatlog.getLastAlternatives();
                    lastAlternatives.messages.pop();
                    lastAlternatives.activeMessageIndex = lastAlternatives.messages.length - 1;
                    UIManager.renderEntireChat(targetChatlog);
                } else if (lastMessage) {
                    lastMessage.appendContent('\n\n[Response aborted by user]');
                    const pos = targetChatlog.getMessagePos(lastMessage);
                    UIManager.updateMessageContent(pos, lastMessage);
                }
                return;
            }
            log(1, 'AIService: generateResponse error', error);
            triggerError(error.message);
            const lastMessage = targetChatlog.getLastMessage();
            if (lastMessage.value === null) {
                lastMessage.value = { role: 'assistant', content: `[Error: ${error.message}. Retry or check connection.]` };
                hooks.afterMessageAdd.forEach(fn => fn(lastMessage));
                const pos = targetChatlog.getMessagePos(lastMessage);
                UIManager.addMessage(lastMessage, targetChatlog, pos);
            } else {
                lastMessage.appendContent(`\n\n[Error: ${error.message}. Retry or check connection.]`);
                const pos = targetChatlog.getMessagePos(lastMessage);
                UIManager.updateMessageContent(pos, lastMessage);
            }
        } finally {
            this.store.set('receiving', false);
            const lastMessage = targetChatlog.getLastMessage();

            if (lastMessage && lastMessage.value !== null) {
                lastMessage.cache = null; // Clear cache since we are done
                lastMessage.metadata = { model: mergedSettings.model, temperature: mergedSettings.temperature, top_p: mergedSettings.top_p };
                hooks.onMessageComplete.forEach(fn => fn(lastMessage, targetChatlog, null));
                const pos = targetChatlog.getMessagePos(lastMessage);
                UIManager.updateMessageContent(pos, lastMessage); // Final update
            }
        }
    }
}

export default AIService;
