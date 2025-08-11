'use strict';

import { Chatbox } from './chatbox.js';
import { Chatlog, Alternatives } from './chatlog.js';
import { firstPrompt, startMessage, defaultEndpoint, messageSubmit, messageStop } from './config.js';
import { getDatePrompt, showLogin, showLogout, triggerError } from './utils.js';
import { log } from './utils.js';
import { hooks, registerPlugin } from './hooks.js';
import { formattingPlugins } from './plugins/formatting.js';
import { avatarsPlugin } from './plugins/avatars.js';
import { mcpPlugin } from './plugins/mcp.js';
import { errorBubblePlugin } from './plugins/error-bubble.js';
import Store from './store.js';

class Controller {
    constructor() {
        log(5, 'Controller: Constructor called');
        this.store = new Store({
            receiving: false,
            regenerateLastAnswer: false,
            controller: new AbortController(),
            apiKey: localStorage.getItem('gptChat_apiKey') || '',
            editingPos: null
        });
        this.store.set('controllerInstance', this);
        this.chats = [];
        this.currentChatId = null;
        this.chatlog = null;
        this.boundUpdate = null;
        this.ui = {
            chatlogEl: null,
            messageEl: document.getElementById('messageInput'),
            submitButton: document.getElementById('submitButton'),
            newChatButton: document.getElementById('newChatButton'),
            saveChatButton: document.getElementById('saveChatButton'),
            loadChatButton: document.getElementById('loadChatButton'),
            settingsButton: document.getElementById('settingsButton'),
            settingsEl: document.getElementById('settings'),
            temperatureEl: document.getElementById('temperature'),
            temperatureValueEl: document.getElementById('temperatureValue'),
            topPEl: document.getElementById('topP'),
            topPValueEl: document.getElementById('topPValue'),
            endpointEl: document.getElementById('endpoint'),
            apiKeyEl: document.getElementById('apiKey')
        };
        this.store.subscribe('receiving', (val) => {
            this.ui.submitButton.innerHTML = val ? messageStop : messageSubmit;
        });
    }

    async init() {
        log(3, 'Controller: init called');
        registerPlugin(mcpPlugin);
        formattingPlugins.forEach(registerPlugin);
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
        this.ui.chatlogEl.onUpdate = () => this.persistChats();
        this.loadChats();
        const initialId = this.currentChatId || this.chats[0]?.id;
        this.currentChatId = null;
        if (this.chats.length === 0) {
            this.createNewChat();
        } else {
            this.switchChat(initialId);
        }
        this.updateChatList();
        const hasStoredKey = localStorage.getItem('gptChat_apiKey') !== null;
        if (hasStoredKey) {
            let success = this.loadModelsFromStorage();
            if (!success) {
                success = await this.loadModels();
            }
            if (success) {
                showLogout();
            } else {
                this.ui.settingsEl.classList.add('open');
                setTimeout(() => this.ui.apiKeyEl.focus(), 100);
                triggerError('Please login with correct API Endpoint and API Key.');
            }
        } else {
            showLogin();
            this.populateModels([]);
            this.ui.settingsEl.classList.add('open');
            setTimeout(() => this.ui.endpointEl.focus(), 100);
            triggerError('Please login with correct API Endpoint and API Key.');
        }
        this.ui.endpointEl.value = localStorage.getItem('gptChat_endpoint') || defaultEndpoint;
        window.addEventListener('beforeunload', () => this.persistChats());
        this.setUpEventListeners();
    }

    createNewChat() {
        log(3, 'Controller: createNewChat called');
        const id = Date.now().toString();
        const title = 'New Chat';
        const chatlog = new Chatlog();
        chatlog.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
        this.chats.push({ id, title, chatlog });
        this.switchChat(id);
        this.updateChatList();
    }

    switchChat(id) {
        log(3, 'Controller: switchChat called for id', id);
        this.persistChats();
        this.currentChatId = id;
        const oldChatlog = this.chatlog;
        if (oldChatlog && this.boundUpdate) {
            oldChatlog.unsubscribe(this.boundUpdate);
        }
        const newCurrent = this.chats.find(c => c.id === id);
        this.chatlog = newCurrent.chatlog;
        this.ui.chatlogEl.chatlog = this.chatlog;
        this.boundUpdate = this.ui.chatlogEl.update.bind(this.ui.chatlogEl);
        this.chatlog.subscribe(this.boundUpdate);
        this.ui.chatlogEl.update();
        this.updateChatList();
        if (window.innerWidth <= 1037) {
            document.getElementById('chatListContainer').style.display = 'none';
        }
    }

    updateChatList() {
        log(5, 'Controller: updateChatList called');
        const list = document.getElementById('chatList');
        list.innerHTML = '';
        this.chats.forEach(chat => {
            const li = document.createElement('li');
            li.classList.add('chat-item');
            if (chat.id === this.currentChatId) li.classList.add('active');
            li.addEventListener('click', () => this.switchChat(chat.id));
            const titleSpan = document.createElement('span');
            titleSpan.textContent = chat.title;
            li.appendChild(titleSpan);
            const editBtn = document.createElement('button');
            editBtn.classList.add('toolButton', 'small');
            editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>';
            editBtn.addEventListener('click', (e) => {
                log(5, 'Controller: Chat edit button clicked for', chat.id);
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text';
                input.value = chat.title;
                input.addEventListener('blur', () => {
                    chat.title = input.value.trim() || 'Untitled Chat';
                    this.persistChats();
                    this.updateChatList();
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') {
                        input.value = chat.title;
                        input.blur();
                    }
                });
                titleSpan.replaceWith(input);
                input.focus();
                input.select();
            });
            li.appendChild(editBtn);
            const delBtn = document.createElement('button');
            delBtn.classList.add('toolButton', 'small');
            delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';
            delBtn.addEventListener('click', (e) => {
                log(4, 'Controller: Chat delete button clicked for', chat.id);
                e.stopPropagation();
                this.chats = this.chats.filter(c => c.id !== chat.id);
                if (this.currentChatId === chat.id) {
                    if (this.chats.length > 0) {
                        this.switchChat(this.chats[0].id);
                    } else {
                        this.createNewChat();
                    }
                } else {
                    this.updateChatList();
                    this.persistChats();
                }
            });
            li.appendChild(delBtn);
            list.appendChild(li);
        });
    }

    persistChats() {
        log(5, 'Controller: persistChats called');
        const serializedChats = this.chats.map(c => ({
            id: c.id,
            title: c.title,
            data: c.chatlog.toJSON()
        }));
        localStorage.setItem('gptChat_chats', JSON.stringify(serializedChats));
        localStorage.setItem('gptChat_currentChatId', this.currentChatId);
    }

    loadChats() {
        log(3, 'Controller: loadChats called');
        const storedChats = localStorage.getItem('gptChat_chats');
        let migrated = false;
        let legacyLoaded = false;
        if (storedChats) {
            const parsed = JSON.parse(storedChats);
            this.chats = parsed.map(chatData => {
                const chatlog = new Chatlog();
                chatlog.load(chatData.data || null);
                // Ensure system prompt
                const first = chatlog.getFirstMessage();
                if (!first || first.value.role !== 'system') {
                    log(4, 'Controller: Adding missing system prompt in loadChats');
                    const oldRoot = chatlog.rootAlternatives;
                    chatlog.rootAlternatives = new Alternatives();
                    const sysMsg = chatlog.rootAlternatives.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
                    sysMsg.answerAlternatives = oldRoot;
                }
                return { id: chatData.id, title: chatData.title, chatlog };
            });
        } else {
            const oldChatlog = localStorage.getItem('gptChat_chatlog');
            if (oldChatlog) {
                log(3, 'Controller: Loading legacy chatlog');
                const parsed = JSON.parse(oldChatlog);
                let rootData;
                if (parsed.rootAlternatives) {
                    rootData = parsed.rootAlternatives;
                } else {
                    const tempLog = new Chatlog();
                    parsed.forEach(msg => tempLog.addMessage(msg));
                    rootData = tempLog.toJSON();
                }
                const chatlog = new Chatlog();
                chatlog.load(rootData);
                this.chats = [{ id: Date.now().toString(), title: 'Legacy Chat', chatlog }];
                localStorage.removeItem('gptChat_chatlog');
                legacyLoaded = true;
            } else {
                this.chats = [];
            }
        }
        this.chats.forEach(({ chatlog }) => {
            try {
                // System prompt check already done
            } catch (err) {
                log(1, 'Controller: Failed to migrate chat', err);
                triggerError('Failed to migrate chat:', err);
            }
        });
        if (migrated || legacyLoaded) {
            log(3, 'Controller: Persisting migrated/legacy chats');
            this.persistChats();
        }
        this.currentChatId = localStorage.getItem('gptChat_currentChatId');
    }

    populateModels(models) {
        log(4, 'Controller: populateModels called with', models.length, 'models');
        const fieldset = document.getElementById('modelsFieldset');
        fieldset.querySelectorAll('input[type="radio"][name="model"], label[for^="model_"], br, p').forEach(el => el.remove());
        if (!models.length) {
            const p = document.createElement('p');
            p.textContent = 'No models available.';
            fieldset.appendChild(p);
            return;
        }
        models.forEach(model => {
            const safeId = model.id.replace(/[^a-z0-9_-]/gi, '_');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'model';
            input.value = model.id;
            input.id = `model_${safeId}`;
            const label = document.createElement('label');
            label.htmlFor = `model_${safeId}`;
            label.textContent = model.id;
            fieldset.appendChild(input);
            fieldset.appendChild(label);
            fieldset.appendChild(document.createElement('br'));
        });
        const customInput = document.createElement('input');
        customInput.type = 'radio';
        customInput.name = 'model';
        customInput.value = 'custom';
        customInput.id = 'model_custom';
        const customLabel = document.createElement('label');
        customLabel.htmlFor = 'model_custom';
        customLabel.textContent = 'Custom: ';
        const customText = document.createElement('input');
        customText.type = 'text';
        customText.id = 'custom_model';
        customText.placeholder = 'Enter model ID';
        customLabel.appendChild(customText);
        fieldset.appendChild(customInput);
        fieldset.appendChild(customLabel);
        fieldset.appendChild(document.createElement('br'));
        const storedModel = localStorage.getItem('gptChat_model');
        if (storedModel) {
            let radio = fieldset.querySelector(`input[value="${storedModel}"]`);
            if (radio) radio.checked = true;
            else {
                customInput.checked = true;
                customText.value = storedModel;
            }
        } else {
            const defaultRadio = fieldset.querySelector('input[value="gpt-3.5-turbo"]') || fieldset.querySelector('input[name="model"]');
            if (defaultRadio) defaultRadio.checked = true;
        }
    }

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
            this.populateModels(models);
            return true;
        }
        return false;
    }

    async loadModels() {
        log(3, 'Controller: loadModels called');
        const modelsUrl = this.ui.endpointEl.value.replace(/\/chat\/completions$/, '/models');
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            if (this.store.get('apiKey')) {
                headers['Authorization'] = `Bearer ${this.store.get('apiKey')}`;
            }
            const resp = await fetch(modelsUrl, {
                method: 'GET',
                headers
            });
            if (!resp.ok) throw new Error(`${resp.statusText} (${resp.status})`);
            const data = await resp.json();
            let models = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));
            localStorage.setItem('gptChat_models', JSON.stringify(models));
            this.populateModels(models);
            return true;
        } catch (err) {
            log(1, 'Controller: Failed to load models', err);
            triggerError('Failed to load models:', err);
            if (localStorage.getItem('gptChat_apiKey') !== null) {
                localStorage.removeItem('gptChat_apiKey');
                localStorage.removeItem('gptChat_models');
                this.store.set('apiKey', '');
                this.ui.apiKeyEl.value = '';
                showLogin();
                this.populateModels([]);
                triggerError('Session invalid, logged out.');
            }
            return false;
        }
    }

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
            this.createNewChat();
        });
        this.ui.saveChatButton.addEventListener('click', () => {
            log(4, 'Controller: Save chat button clicked');
            const current = this.chats.find(c => c.id === this.currentChatId);
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
                const reader = new FileReader();
                reader.addEventListener('load', () => {
                    try {
                        let loaded = JSON.parse(reader.result);
                        let data = loaded.data;
                        if (!data && loaded.rootAlternatives) {
                            data = loaded.rootAlternatives;
                        } else if (!data && typeof loaded === 'object') {
                            data = loaded;
                        }
                        const chatlog = new Chatlog();
                        chatlog.load(data);
                        const id = Date.now().toString();
                        const title = loaded.title || 'Imported Chat';
                        this.chats.push({ id, title, chatlog });
                        this.switchChat(id);
                        this.updateChatList();
                        this.persistChats();
                    } catch (error) {
                        log(1, 'Controller: Invalid chatlog file', error);
                        triggerError('Invalid chatlog file. Failed to parse loaded chatlog:', error);
                    }
                });
                reader.readAsText(file);
            });
            input.click();
        });
        this.ui.temperatureValueEl.textContent = this.ui.temperatureEl.value;
        this.ui.temperatureEl.addEventListener('input', () => this.ui.temperatureValueEl.textContent = this.ui.temperatureEl.value);
        this.ui.topPValueEl.textContent = this.ui.topPEl.value;
        this.ui.topPEl.addEventListener('input', () => this.ui.topPValueEl.textContent = this.ui.topPEl.value);
        this.ui.endpointEl.addEventListener('input', () => localStorage.setItem('gptChat_endpoint', this.ui.endpointEl.value));
        this.ui.settingsButton.addEventListener('click', () => {
            log(4, 'Controller: Settings button clicked');
            this.ui.settingsEl.classList.toggle('open');
            if (this.ui.settingsEl.classList.contains('open')) {
                hooks.onSettingsRender.forEach(fn => fn(this.ui.settingsEl));
            }
        });
        document.getElementById('refreshModelsButton').addEventListener('click', async () => {
            log(4, 'Controller: Refresh models button clicked');
            await this.loadModels();
        });
        const saveModel = () => {
            let model = document.querySelector('input[name="model"]:checked')?.value;
            if (model === 'custom') model = document.getElementById('custom_model')?.value.trim();
            if (model) localStorage.setItem('gptChat_model', model);
        };
        document.getElementById('modelsFieldset').addEventListener('change', saveModel);
        document.getElementById('custom_model')?.addEventListener('input', () => {
            if (document.getElementById('model_custom')?.checked) saveModel();
        });
        document.getElementById('login-btn').addEventListener('click', async () => {
            log(4, 'Controller: Login button clicked');
            const key = this.ui.apiKeyEl.value.trim();
            localStorage.setItem('gptChat_apiKey', key);
            this.store.set('apiKey', key);
            localStorage.setItem('gptChat_endpoint', this.ui.endpointEl.value);
            if (await this.loadModels()) {
                showLogout();
            }
        });
        document.getElementById('logout-btn').addEventListener('click', () => {
            log(4, 'Controller: Logout button clicked');
            localStorage.removeItem('gptChat_apiKey');
            localStorage.removeItem('gptChat_models');
            this.store.set('apiKey', '');
            this.ui.apiKeyEl.value = '';
            this.ui.endpointEl.value = defaultEndpoint;
            localStorage.setItem('gptChat_endpoint', defaultEndpoint);
            showLogin();
            this.populateModels([]);
        });
        document.getElementById('toggleChatList').addEventListener('click', () => {
            log(5, 'Controller: Toggle chat list clicked');
            const cl = document.getElementById('chatListContainer');
            cl.style.display = cl.style.display === 'block' ? 'none' : 'block';
        });
    }

    async streamAPIResponse(payload, targetChatlog, targetMessage) {
        log(4, 'Controller: streamAPIResponse called with payload model', payload.model);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.store.get('apiKey')) {
            headers['Authorization'] = `Bearer ${this.store.get('apiKey')}`;
        }
        const endpoint = this.ui.endpointEl.value;
        const response = await fetch(endpoint, {
            signal: this.store.get('controller').signal,
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            log(1, 'Controller: API response not ok', response.status, response.statusText);
            if (response.status === 401) {
                triggerError('Invalid API key. Please check your settings.');
                this.ui.settingsEl.classList.add('open');
                setTimeout(() => this.ui.apiKeyEl.focus(), 100);
            } else {
                triggerError(`API error: ${response.statusText} (${response.status})`);
            }
            throw new Error(`API error: ${response.statusText} (${response.status})`);
        }
        const reader = response.body.getReader();
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
    }

    async generateAIResponse(options = {}, targetChatlog = this.chatlog) {
        log(3, 'Controller: generateAIResponse called with options', options, 'targetChatlog id', this.chats.find(c => c.chatlog === targetChatlog)?.id);
        if (this.store.get('receiving')) return;
        let model = options.model || document.querySelector('input[name="model"]:checked')?.value;
        if (model === 'custom') {
            model = (options.model || document.getElementById('custom_model').value.trim());
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
            await this.streamAPIResponse(payload, targetChatlog, targetMessage);
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
            const lastMessage = targetChatlog.getLastMessage();
            if (lastMessage.value === null) {
                lastMessage.value = { role: 'assistant', content: `${error}` };
                hooks.afterMessageAdd.forEach(fn => fn(lastMessage));
            } else {
                lastMessage.appendContent(`\n\n${error}`);
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
            this.persistChats();
        }
    }

    async submitUserMessage(message, userRole) {
        log(3, 'Controller: submitUserMessage called with role', userRole);
        if (this.store.get('editingPos') !== null) {
            log(4, 'Controller: Editing message at pos', this.store.get('editingPos'));
            const msg = this.chatlog.getNthMessage(this.store.get('editingPos'));
            if (msg) {
                msg.value.role = userRole;
                msg.setContent(message.trim());
                msg.cache = null;
                this.ui.chatlogEl.update();
            }
            this.store.set('editingPos', null);
            document.getElementById('user').checked = true;
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
            const newMessage = this.chatlog.addMessage({ role: userRole, content: modifiedContent });
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
            const newMessage = this.chatlog.addMessage({ role: userRole, content: modifiedContent });
            hooks.afterMessageAdd.forEach(fn => fn(newMessage));
            this.chatlog.addMessage(null);
        }
        this.store.set('regenerateLastAnswer', false);
        this.ui.chatlogEl.update();
        await this.generateAIResponse({}, this.chatlog);
    }
}

export default Controller;
