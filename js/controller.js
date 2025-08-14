'use strict';

import { Chatbox } from './chatbox.js';
import { startMessage, messageSubmit, messageStop } from './config.js';
import { showLogin, showLogout, triggerError } from './utils.js';
import { log } from './utils.js';
import { hooks, registerPlugin } from './hooks.js';
import { formattingPlugins } from './plugins/formatting.js';
import { alternativeNavigationPlugin, messageModificationPlugin } from './plugins/ui-controls.js';
import { avatarsPlugin } from './plugins/avatars.js';
import { mcpPlugin } from './plugins/mcp.js';
import { errorBubblePlugin } from './plugins/error-bubble.js';
import Store from './store.js';
import ApiService from './services/api-service.js';
import ChatService from './services/chat-service.js';
import ChatListView from './views/chatlist-view.js';
import SettingsView from './views/settings-view.js';

/**
 * @class Controller
 * Main application orchestrator. Initializes services and views,
 * and handles the main application logic that isn't delegated.
 */
class Controller {
    constructor() {
        log(5, 'Controller: Constructor called');
        this.store = new Store({
            receiving: false,
            regenerateLastAnswer: false,
            controller: new AbortController(),
            apiKey: localStorage.getItem('gptChat_apiKey') || '',
            editingPos: null,
            chats: [],
            currentChat: null,
        });
        this.store.set('controllerInstance', this);

        this.apiService = new ApiService(this.store);
        this.chatService = new ChatService(this.store);
        this.chatListView = new ChatListView(this.chatService);
        this.settingsView = new SettingsView(this.store, this.apiService, this);

        this.chatlog = null;
        this.boundUpdate = null;

        this.ui = {
            chatlogEl: null,
            messageEl: document.getElementById('messageInput'),
            submitButton: document.getElementById('submitButton'),
            newChatButton: document.getElementById('newChatButton'),
            saveChatButton: document.getElementById('saveChatButton'),
            loadChatButton: document.getElementById('loadChatButton'),
            temperatureEl: document.getElementById('temperature'),
            topPEl: document.getElementById('topP'),
        };

        this.store.subscribe('receiving', (val) => {
            this.ui.submitButton.innerHTML = val ? messageStop : messageSubmit;
        });
        this.store.subscribe('chats', (chats) => this.chatListView.render(chats, this.store.get('currentChat')));
        this.store.subscribe('currentChat', (chat) => {
            this.onChatSwitched(chat);
            this.chatListView.render(this.store.get('chats'), chat);
        });
    }

    /**
     * Initializes the application, setting up plugins, error handlers, views, and services.
     */
    async init() {
        log(3, 'Controller: init called');
        registerPlugin(mcpPlugin);
        formattingPlugins.forEach(registerPlugin);
        registerPlugin(alternativeNavigationPlugin);
        registerPlugin(messageModificationPlugin);
        registerPlugin(avatarsPlugin);
        registerPlugin(errorBubblePlugin);

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

        this.ui.chatlogEl = new Chatbox(null, document.getElementById('chat'), this.store);
        this.ui.chatlogEl.onUpdate = () => this.chatService.persistChats();
        this.settingsView.init();
        this.chatService.init();

        const hasStoredKey = localStorage.getItem('gptChat_apiKey') !== null;
        if (hasStoredKey) {
            let success = this.loadModelsFromStorage();
            if (!success) {
                success = await this.loadModels();
            }
            if (success) {
                showLogout();
            } else {
                this.settingsView.ui.settingsEl.classList.add('open');
                setTimeout(() => this.settingsView.ui.apiKeyEl.focus(), 100);
                triggerError('Please login with correct API Endpoint and API Key.');
            }
        } else {
            showLogin();
            this.settingsView.populateModels([]);
            this.settingsView.ui.settingsEl.classList.add('open');
            setTimeout(() => this.settingsView.ui.endpointEl.focus(), 100);
            triggerError('Please login with correct API Endpoint and API Key.');
        }
        window.addEventListener('beforeunload', () => this.chatService.persistChats());
        this.setUpEventListeners();
    }

    /**
     * Handles the logic when the active chat is switched.
     * @param {Object} chat - The new active chat object.
     */
    onChatSwitched(chat) {
        log(3, 'Controller: onChatSwitched called for chat', chat?.id);
        if (!chat) {
            this.ui.chatlogEl.chatlog = null;
            this.ui.chatlogEl.update();
            return;
        }

        const oldChatlog = this.chatlog;
        if (oldChatlog && this.boundUpdate) {
            oldChatlog.unsubscribe(this.boundUpdate);
        }

        this.chatlog = chat.chatlog;
        this.ui.chatlogEl.chatlog = this.chatlog;
        this.boundUpdate = this.ui.chatlogEl.update.bind(this.ui.chatlogEl, false);
        this.chatlog.subscribe(this.boundUpdate);
        this.ui.chatlogEl.update();

        if (window.innerWidth <= 1037) {
            document.getElementById('chatListContainer').style.display = 'none';
        }
    }

    /**
     * Loads models from local storage if available.
     * @returns {boolean} True if models were loaded from storage, false otherwise.
     */
    loadModelsFromStorage() {
        log(3, 'Controller: loadModelsFromStorage called');
        const storedModels = localStorage.getItem('gptChat_models');
        if (storedModels) {
            let models;
            try {
                models = JSON.parse(storedModels);
            } catch (err) {
                log(1, 'Controller: Failed to parse stored models', err);
                triggerError('Failed to parse stored models:', err);
                return false;
            }
            this.settingsView.populateModels(models);
            return true;
        }
        return false;
    }

    /**
     * Fetches models from the API and populates the settings view.
     * @returns {Promise<boolean>} True if models were loaded successfully, false otherwise.
     */
    async loadModels() {
        log(3, 'Controller: loadModels called');
        const endpoint = this.settingsView.ui.endpointEl.value;
        const apiKey = this.store.get('apiKey');
        try {
            const models = await this.apiService.getModels(endpoint, apiKey);
            localStorage.setItem('gptChat_models', JSON.stringify(models));
            this.settingsView.populateModels(models);
            return true;
        } catch (err) {
            log(1, 'Controller: Failed to load models', err);
            triggerError('Failed to load models:', err);
            if (localStorage.getItem('gptChat_apiKey') !== null) {
                localStorage.removeItem('gptChat_apiKey');
                localStorage.removeItem('gptChat_models');
                this.store.set('apiKey', '');
                showLogin();
                this.settingsView.populateModels([]);
                triggerError('Session invalid, logged out.');
            }
            return false;
        }
    }

    /**
     * Sets up the main event listeners for the application.
     */
    setUpEventListeners() {
        log(3, 'Controller: setUpEventListeners called');
        this.ui.submitButton.addEventListener('click', () => {
            log(4, 'Controller: Submit button clicked, receiving:', this.store.get('receiving'));
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
            if (event.keyCode === 13 && (event.shiftKey || event.ctrlKey || event.altKey)) {
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
            if (event.key === 'Escape') this.store.get('controller').abort();
        });
        this.ui.newChatButton.addEventListener('click', () => {
            log(4, 'Controller: New chat button clicked');
            if (this.store.get('receiving')) this.store.get('controller').abort();
            this.ui.messageEl.value = startMessage;
            this.ui.messageEl.style.height = 'auto';
            this.chatService.createNewChat();
        });
        this.ui.saveChatButton.addEventListener('click', () => {
            log(4, 'Controller: Save chat button clicked');
            const current = this.store.get('currentChat');
            if (!current) return;
            const jsonData = JSON.stringify({ title: current.title, data: current.chatlog.toJSON() });
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
            log(4, 'Controller: Load chat button clicked');
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
            log(5, 'Controller: Toggle chat list clicked');
            const cl = document.getElementById('chatListContainer');
            cl.style.display = cl.style.display === 'block' ? 'none' : 'block';
        });
    }

    /**
     * Generates an AI response for the given chatlog.
     * @param {Object} options - Options for the generation (e.g., model, temperature).
     * @param {Chatlog} targetChatlog - The chatlog to generate a response for.
     */
    async generateAIResponse(options = {}, targetChatlog = this.chatlog) {
        log(3, 'Controller: generateAIResponse called');
        if (this.store.get('receiving')) return;
        let model = options.model || document.querySelector('input[name="model"]:checked')?.value;
        if (model === 'custom') {
            model = (options.model || this.settingsView.ui.customModelInput.value.trim());
            if (!model) {
                log(2, 'Controller: No custom model ID');
                triggerError('Please enter a custom model ID.');
                return;
            }
        }
        if (!model) {
            log(2, 'Controller: No model selected');
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
            payload = hooks.beforeApiCall.reduce((p, fn) => fn(p, this.ui.chatlogEl) || p, payload);

            const endpoint = this.settingsView.ui.endpointEl.value;
            const apiKey = this.store.get('apiKey');
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
                log(5, 'Controller: Received chunk', delta);
                hooks.onChunkReceived.forEach(fn => fn(delta));
                targetMessage.appendContent(delta);
                if (targetChatlog === this.chatlog) {
                    targetChatlog.notify();
                }
            }
            const lastMessage = targetChatlog.getLastMessage();
            hooks.onMessageComplete.forEach(fn => fn(lastMessage, targetChatlog, this.ui.chatlogEl));

        } catch (error) {
            if (error.name === 'AbortError') {
                log(3, 'Controller: Response aborted');
                this.store.set('controller', new AbortController());
                const lastMessage = targetChatlog.getLastMessage();
                if (lastMessage && lastMessage.value === null) {
                    // Remove dangling null message on abort
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
            log(1, 'Controller: generateAIResponse error', error);
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
            this.store.set('receiving', false);
            if (targetMessage.value !== null) {
                targetMessage.metadata = { model, temperature, top_p: topP };
            }
            if (targetChatlog === this.chatlog) {
                targetChatlog.notify();
            }
            this.chatService.persistChats();
        }
    }

    /**
     * Submits a user message to the chatlog and generates an AI response if the user message is the last message in the chat.
     * @param {string} message - The user's message.
     * @param {string} userRole - The role of the user (e.g., 'user', 'system').
     */
    async submitUserMessage(message, userRole) {
        log(3, 'Controller: submitUserMessage called with role', userRole);
        const currentChatlog = this.chatService.getCurrentChatlog();
        if (!currentChatlog) return;
        const editedPos = this.store.get('editingPos');
        if (editedPos !== null) {
            log(4, 'Controller: Editing message at pos', editedPos);
            const msg = currentChatlog.getNthMessage(editedPos);
            if (msg) {
                msg.value.role = userRole;
                msg.setContent(message.trim());
                msg.cache = null;
                this.ui.chatlogEl.update();
            }
            this.store.set('editingPos', null);
            document.getElementById('user').checked = true;
            const editedMsg = currentChatlog.getNthMessage(editedPos);
            if (editedMsg.value.role !== 'assistant' && editedMsg.answerAlternatives === null && currentChatlog.getFirstMessage() !== editedMsg) {
                currentChatlog.addMessage({ role: 'assistant', content: null });
                this.ui.chatlogEl.update();
                await this.generateAIResponse({}, currentChatlog);
            }
            return;
        }
        if (!this.store.get('regenerateLastAnswer') && !message) return;
        if (this.store.get('receiving')) return;
        if (userRole === 'assistant') {
            let modifiedContent = message;
            for (let fn of hooks.beforeUserMessageAdd) {
                const result = fn(modifiedContent, userRole);
                if (result === false) return;
                if (typeof result === 'string') modifiedContent = result;
            }
            const newMessage = currentChatlog.addMessage({ role: userRole, content: modifiedContent });
            hooks.afterMessageAdd.forEach(fn => fn(newMessage));
            this.ui.chatlogEl.update();
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
        this.ui.chatlogEl.update();
        await this.generateAIResponse({}, currentChatlog);
    }
}

export default Controller;
