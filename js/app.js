/**
 * @fileoverview Main application class.
 */

'use strict';

import Store from './state/store.js';
import ApiService from './services/api-service.js';
import ChatService from './services/chat-service.js';
import ConfigService from './services/config-service.js';
import SettingsPanel from './components/settings-panel.js';
import { ChatBox } from './components/chatbox.js';
import ChatListView from './components/chatlist-view.js';
import { log, triggerError } from './utils/logger.js';
import { resetEditing } from './utils/chat.js';
import { showLogin, showLogout } from './utils/ui.js';
import { hooks, registerPlugin } from './hooks.js';
import { formattingPlugins } from './plugins/formatting.js';
import { alternativeNavigationPlugin, messageModificationPlugin } from './plugins/ui-controls.js';
import { avatarsPlugin } from './plugins/avatars.js';
import { mcpPlugin } from './plugins/mcp.js';
import { errorBubblePlugin } from './plugins/error-bubble.js';
import { agentsPlugin } from './plugins/agents.js';
import { startMessage, messageSubmit, messageStop } from './config.js';

/**
 * @class App
 * Main application orchestrator.
 */
class App {
    constructor() {
        log(5, 'App: Constructor called');
        this.ui = {
            chatBox: null,
            messageEl: document.getElementById('messageInput'),
            submitButton: document.getElementById('submitButton'),
            newChatButton: document.getElementById('newChatButton'),
            saveChatButton: document.getElementById('saveChatButton'),
            loadChatButton: document.getElementById('loadChatButton'),
            temperatureEl: document.getElementById('temperature'),
            topPEl: document.getElementById('topP'),
        };
        this.store = new Store({
            receiving: false,
            regenerateLastAnswer: false,
            controller: new AbortController(),
            editingPos: null,
            chats: [],
            currentChat: null,
            ui: this.ui,
        });

        this.configService = new ConfigService(this.store);
        this.apiService = new ApiService(this.store);
        this.chatService = new ChatService(this.store);

        this.settingsPanel = new SettingsPanel({
            onApiKeyChange: (apiKey) => this.handleApiKeyChange(apiKey),
            onEndpointChange: (endpoint) => this.handleEndpointChange(endpoint),
            onRefreshModels: () => this.loadModels(),
            onModelChange: (model) => this.configService.setModel(model),
        });

        this.chatListView = new ChatListView({
            onChatSelected: (chatId) => this.chatService.switchChat(chatId),
            onChatDeleted: (chatId) => this.chatService.deleteChat(chatId),
            onTitleEdited: (chatId, newTitle) => this.chatService.updateChatTitle(chatId, newTitle),
        });

        this.ui.chatBox = new ChatBox(this.store);

        this.store.subscribe('receiving', (val) => {
            this.ui.submitButton.innerHTML = val ? messageStop : messageSubmit;
        });
        this.store.subscribe('chats', (chats) => this.chatListView.render(chats, this.store.get('currentChat')));
        this.store.subscribe('currentChat', (chat) => {
            this.onChatSwitched(chat);
            this.chatListView.render(this.store.get('chats'), chat);
        });
        hooks.onGenerateAIResponse.push((options, chatlog) => this.generateAIResponse(options, chatlog));
    }

    /**
     * Initializes the application.
     */
    async init() {
        log(3, 'App: init called');
        this.registerPlugins();
        this.setupGlobalErrorHandlers();

        this.ui.chatBox.onUpdate = () => this.chatService.persistChats();

        this.chatService.init();

        this.settingsPanel.setApiKey(this.configService.getApiKey());
        this.settingsPanel.setEndpoint(this.configService.getEndpoint());

        await this.handleLogin();

        hooks.onSettingsRender.forEach(fn => fn(this.settingsPanel.ui.settingsEl));

        window.addEventListener('beforeunload', () => this.chatService.persistChats());
        this.setUpEventListeners();
    }

    /**
     * Registers all the plugins.
     */
    registerPlugins() {
        registerPlugin(agentsPlugin, this);
        registerPlugin(mcpPlugin, this);
        formattingPlugins.forEach(plugin => registerPlugin(plugin, this));
        registerPlugin(alternativeNavigationPlugin, this);
        registerPlugin(messageModificationPlugin, this);
        registerPlugin(avatarsPlugin, this);
        registerPlugin(errorBubblePlugin, this);
    }

    /**
     * Sets up global error handlers.
     */
    setupGlobalErrorHandlers() {
        window.addEventListener('error', (event) => {
            log(1, 'Global error', event.error || event.message);
            triggerError(event.error || new Error(event.message));
            event.preventDefault();
        });
        window.addEventListener('unhandledrejection', (event) => {
            log(1, 'Global unhandled rejection', event.reason);
            triggerError(event.reason);
            event.preventDefault();
        });
    }

    /**
     * Handles the login process.
     */
    async handleLogin() {
        const endpoint = this.configService.getEndpoint();
        if (endpoint) {
            const success = await this.loadModels();
            if (success) {
                showLogout();
            } else {
                showLogin();
                this.settingsPanel.toggle();
            }
        } else {
            showLogin();
            this.settingsPanel.populateModels([]);
            this.settingsPanel.toggle();
        }
    }

    /**
     * Handles the API key change.
     * @param {string} apiKey - The new API key.
     */
    handleApiKeyChange(apiKey) {
        this.configService.setApiKey(apiKey);
    }

    /**
     * Handles the endpoint change.
     * @param {string} endpoint - The new endpoint.
     */
    handleEndpointChange(endpoint) {
        this.configService.setEndpoint(endpoint);
        this.handleLogin();
    }

    /**
     * Handles chat switching.
     * @param {Object} chat - The chat to switch to.
     */
    onChatSwitched(chat) {
        log(3, 'App: onChatSwitched called for chat', chat?.id);
        this.ui.chatBox.setChatlog(chat?.chatlog || null);
        if (window.innerWidth <= 1037) {
            document.getElementById('chatListContainer').style.display = 'none';
        }
    }

    /**
     * Fetches models from the API.
     * @returns {Promise<boolean>} True if models were loaded successfully.
     */
    async loadModels() {
        log(3, 'App: loadModels called');
        const endpoint = this.configService.getEndpoint();
        const apiKey = this.configService.getApiKey();
        if (!endpoint) {
            return false;
        }
        try {
            const models = await this.apiService.getModels(endpoint, apiKey);
            localStorage.setItem('gptChat_models', JSON.stringify(models));
            this.settingsPanel.populateModels(models);
            this.settingsPanel.setSelectedModel(this.configService.getModel());
            return true;
        } catch (err) {
            log(1, 'App: Failed to load models', err);
            triggerError('Failed to load models:', err);
            if (localStorage.getItem('gptChat_apiKey') !== null) {
                this.configService.setApiKey('');
                localStorage.removeItem('gptChat_models');
                showLogin();
                this.settingsPanel.populateModels([]);
                triggerError('Session invalid, logged out.');
            }
            return false;
        }
    }

    /**
     * Sets up the main event listeners.
     */
    setUpEventListeners() {
        log(3, 'App: setUpEventListeners called');
        this.ui.submitButton.addEventListener('click', () => {
            log(4, 'App: Submit button clicked, receiving:', this.store.get('receiving'));
            if (this.store.get('receiving')) {
                this.store.get('controller').abort();
                return;
            }
            this.submitUserMessage(this.ui.messageEl.value, document.querySelector('input[name="user_role"]:checked').value);
            document.getElementById('user').checked = true;
            this.ui.messageEl.value = '';
            this.ui.messageEl.style.height = 'auto';
        });
        this.ui.messageEl.addEventListener('keydown', event => {
            if (event.keyCode === 13 && (event.shiftKey || event.ctrlKey || event.altKey)) { // TODO: change event.keyCode to something not deprecated
                event.preventDefault();
                this.ui.submitButton.click();
            }
        });
        this.ui.messageEl.addEventListener('input', function () {
            this.style.height = 'auto';
            let height = this.scrollHeight - parseInt(getComputedStyle(this).paddingTop) - parseInt(getComputedStyle(this).paddingBottom);
            if (height > window.innerHeight / 2) {
                height = window.innerHeight / 2;
                this.style.overflowY = 'scroll';
            } else {
                this.style.overflowY = 'hidden';
            }
            if (height > this.clientHeight) this.style.height = `${height}px`;
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                this.store.get('controller').abort();
                resetEditing(this.store, this.ui.chatBox.chatlog, this.ui.chatBox);
            }
        });
        this.ui.newChatButton.addEventListener('click', () => {
            log(4, 'App: New chat button clicked');
            if (this.store.get('receiving')) this.store.get('controller').abort();
            this.ui.messageEl.value = startMessage;
            this.ui.messageEl.style.height = 'auto';
            this.chatService.createNewChat();
        });
        this.ui.saveChatButton.addEventListener('click', () => {
            log(4, 'App: Save chat button clicked');
            const current = this.store.get('currentChat');
            if (!current) return;
            const jsonData = JSON.stringify({
                title: current.title,
                data: current.chatlog.toJSON(),
                agents: current.agents || [],
                flow: current.flow || { steps: [], connections: [] }
            });
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${current.title.replace(/\s/g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        this.ui.loadChatButton.addEventListener('click', () => {
            log(4, 'App: Load chat button clicked');
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => this.chatService.importChat(e.target.result);
                reader.readAsText(file);
            });
            input.click();
        });

        document.getElementById('toggleChatList').addEventListener('click', () => {
            log(5, 'App: Toggle chat list clicked');
            const cl = document.getElementById('chatListContainer');
            cl.style.display = cl.style.display === 'block' ? 'none' : 'block';
        });
    }

    /**
     * Generates an AI response.
     * @param {Object} [options={}] - Options for the generation.
     * @param {Chatlog} [targetChatlog=this.chatlog] - The chatlog to generate a response for.
     */
    async generateAIResponse(options = {}, targetChatlog = this.ui.chatBox.chatlog) {
        log(3, 'App: generateAIResponse called');
        if (this.store.get('receiving')) return;
        let model = options.model || this.configService.getModel() || document.querySelector('input[name="model"]:checked')?.value;
        if (model === 'custom') {
            model = (options.model || this.settingsPanel.ui.customModelInput.value.trim());
            if (!model) {
                log(2, 'App: No custom model ID');
                triggerError('Please enter a custom model ID.');
                return;
            }
        }
        if (!model) {
            log(2, 'App: No model selected');
            triggerError('Please select a model.');
            return;
        }
        const temperature = options.temperature ?? Number(this.ui.temperatureEl.value);
        const topP = options.top_p ?? Number(this.ui.topPEl.value);
        this.store.set('receiving', true);
        const targetMessage = targetChatlog.getLastMessage();
        try {
            let payload = {
                model,
                messages: targetChatlog.getActiveMessageValues(),
                temperature,
                top_p: topP,
                stream: true
            };
            if (payload.messages.length <= 1) return;
            if (payload.messages[0]?.role === 'system') {
                let systemContent = payload.messages[0].content;
                for (let fn of hooks.onModifySystemPrompt) {
                    systemContent = fn(systemContent) || systemContent;
                }
                payload.messages[0].content = systemContent;
            }
            payload = hooks.beforeApiCall.reduce((p, fn) => fn(p, this.ui.chatBox) || p, payload);

            const endpoint = this.configService.getEndpoint();
            const apiKey = this.configService.getApiKey();
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
                log(5, 'App: Received chunk', delta);
                hooks.onChunkReceived.forEach(fn => fn(delta));
                targetMessage.appendContent(delta);
                targetChatlog.notify();
            }
            // Set receiving to false before calling hooks, in case a hook triggers another generation
            this.store.set('receiving', false);
            const lastMessage = targetChatlog.getLastMessage();
            hooks.onMessageComplete.forEach(fn => fn(lastMessage, targetChatlog, this.ui.chatBox));

        } catch (error) {
            this.store.set('receiving', false); // Ensure receiving is false on error
            if (error.name === 'AbortError') {
                log(3, 'App: Response aborted');
                hooks.onCancel.forEach(fn => fn());
                this.store.set('controller', new AbortController());
                const lastMessage = targetChatlog.getLastMessage();
                if (lastMessage && lastMessage.value === null) {
                    const lastAlternatives = targetChatlog.getLastAlternatives();
                    lastAlternatives.messages.pop();
                    lastAlternatives.activeMessageIndex = lastAlternatives.messages.length - 1;
                    targetChatlog.notify();
                } else if (lastMessage) {
                    lastMessage.appendContent('\n\n[Response aborted by user]');
                    lastMessage.cache = null;
                }
                return;
            }
            log(1, 'App: generateAIResponse error', error);
            triggerError(error.message);
            const lastMessage = targetChatlog.getLastMessage();
            if (lastMessage.value === null) {
                lastMessage.value = { role: 'assistant', content: `${error.message}` };
                hooks.afterMessageAdd.forEach(fn => fn(lastMessage));
            } else {
                lastMessage.appendContent(`\n\n${error.message}`);
            }
            lastMessage.cache = null;
        } finally {
            if (targetMessage.value !== null) {
                targetMessage.metadata = { model, temperature, top_p: topP };
            }
            targetChatlog.notify();
            this.chatService.persistChats();
        }
    }

    /**
     * Submits a user message.
     * @param {string} message - The message to submit.
     * @param {string} userRole - The role of the user.
     */
    async submitUserMessage(message, userRole) {
        log(3, 'App: submitUserMessage called with role', userRole);
        // Ensure we are acting on the chatlog instance currently displayed in the UI
        const currentChatlog = this.ui.chatBox.chatlog;
        if (!currentChatlog) return;

        const editedPos = this.store.get('editingPos');
        log(4, 'App: editingPos is', editedPos);
        if (editedPos !== null) {
            log(4, 'App: Editing message at pos', editedPos);
            const msg = currentChatlog.getNthMessage(editedPos);
            if (msg) {
                msg.value.role = userRole;
                msg.setContent(message.trim());
                msg.cache = null;
                this.ui.chatBox.update();
            }
            this.store.set('editingPos', null);
            document.getElementById('user').checked = true;
            const editedMsg = currentChatlog.getNthMessage(editedPos);
            if (editedMsg.value.role !== 'assistant' && editedMsg.answerAlternatives === null && currentChatlog.getFirstMessage() !== editedMsg) {
                currentChatlog.addMessage({ role: 'assistant', content: null });
                this.ui.chatBox.update();
                await this.generateAIResponse({}, currentChatlog);
            }
            return;
        }

        if (!this.store.get('regenerateLastAnswer') && !message) return;
        // Allow flow to submit messages even if another response is being generated
        if (this.store.get('receiving') && !agentsPlugin.flowRunning) return;

        if (userRole === 'assistant') {
            let modifiedContent = message;
            for (let fn of hooks.beforeUserMessageAdd) {
                const result = fn(modifiedContent, userRole);
                if (result === false) return;
                if (typeof result === 'string') modifiedContent = result;
            }
            const newMessage = currentChatlog.addMessage({ role: userRole, content: modifiedContent });
            hooks.afterMessageAdd.forEach(fn => fn(newMessage));
            this.ui.chatBox.update();
            return;
        }

        if (!this.store.get('regenerateLastAnswer')) {
            message = message.trim();
            let modifiedContent = message;
            for (let fn of hooks.beforeUserMessageAdd) {
                const result = fn(modifiedContent, userRole);
                if (result === false) return;
                if (typeof result === 'string') modifiedContent = result;
            }
            const newMessage = currentChatlog.addMessage({ role: userRole, content: modifiedContent });
            hooks.afterMessageAdd.forEach(fn => fn(newMessage));
            currentChatlog.addMessage(null);
        }

        this.store.set('regenerateLastAnswer', false);
        this.ui.chatBox.update(); // Initial update to show user message

        await this.generateAIResponse({}, currentChatlog);

        // Final update to ensure UI is consistent after response generation, especially for flows.
        this.ui.chatBox.update();
    }
}

export default App;
