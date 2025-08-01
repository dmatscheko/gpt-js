import { Chatbox } from './chatbox.js';
import { Chatlog, Alternatives } from './chatlog.js';
import { firstPrompt, startMessage, defaultEndpoint, messageSubmit, messageStop } from './config.js';
import { openaiChat, populateModels, loadModels, loadModelsFromStorage, getDatePrompt, showLogin, showLogout } from './utils.js';
import { hooks, registerPlugin } from './hooks.js';
import { formattingPlugins } from './plugins/formatting.js';
import { avatarsPlugin } from './plugins/avatars.js';

'use strict';

(function () {
    formattingPlugins.forEach(registerPlugin);
    registerPlugin(avatarsPlugin);

    document.addEventListener('DOMContentLoaded', async () => {
        const state = {
            receiving: false,
            regenerateLastAnswer: false,
            controller: new AbortController(),
            apiKey: localStorage.getItem('gptChat_apiKey') || '',
        };

        let chats = [];
        let currentChatId = null;
        let chatlog = new Chatlog();

        const ui = {
            chatlogEl: new Chatbox(chatlog, document.getElementById('chat'), state),
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

        const persistChats = () => {
            if (currentChatId) {
                const current = chats.find(c => c.id === currentChatId);
                if (current) {
                    current.data = chatlog.toJSON();
                }
            }
            localStorage.setItem('gptChat_chats', JSON.stringify(chats));
            localStorage.setItem('gptChat_currentChatId', currentChatId);
        };

        ui.chatlogEl.onUpdate = persistChats;

        const createNewChat = () => {
            const id = Date.now().toString();
            const title = 'New Chat';
            const newChatlog = new Chatlog();
            newChatlog.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
            chats.push({ id, title, data: newChatlog.toJSON() });
            switchChat(id);
            updateChatList();
        };

        const switchChat = (id) => {
            persistChats(); // Save current before switching
            currentChatId = id;
            const newCurrent = chats.find(c => c.id === id);
            chatlog = new Chatlog();
            if (newCurrent.data) {
                chatlog.load(newCurrent.data);
            }
            ui.chatlogEl.chatlog = chatlog;
            ui.chatlogEl.update();
            updateChatList();
            if (window.innerWidth <= 1037) {
                document.getElementById('chatListContainer').style.display = 'none';
            }
        };

        const updateChatList = () => {
            const list = document.getElementById('chatList');
            list.innerHTML = '';
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.classList.add('chat-item');
                if (chat.id === currentChatId) li.classList.add('active');
                li.addEventListener('click', () => switchChat(chat.id)); // Clicking the li (except buttons) switches chats

                const titleSpan = document.createElement('span');
                titleSpan.textContent = chat.title;
                li.appendChild(titleSpan);

                const editBtn = document.createElement('button');
                editBtn.classList.add('toolButton', 'small');
                editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>'; // Pencil icon
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent switching chats
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = chat.title;
                    input.addEventListener('blur', () => {
                        chat.title = input.value.trim() || 'Untitled Chat'; // Fallback if empty
                        persistChats();
                        updateChatList(); // Refresh list to show updated span
                    });
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') input.blur(); // Save on Enter
                        if (e.key === 'Escape') {
                            input.value = chat.title; // Revert on Escape
                            input.blur();
                        }
                    });
                    titleSpan.replaceWith(input);
                    input.focus();
                    input.select(); // Highlight text for easy editing
                });
                li.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.classList.add('toolButton', 'small');
                delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chats = chats.filter(c => c.id !== chat.id);
                    if (currentChatId === chat.id) {
                        if (chats.length > 0) {
                            switchChat(chats[0].id);
                        } else {
                            createNewChat();
                        }
                    } else {
                        updateChatList();
                        persistChats();
                    }
                });
                li.appendChild(delBtn);

                list.appendChild(li);
            });
        };

        const loadChats = () => {
            const storedChats = localStorage.getItem('gptChat_chats');
            let migrated = false;
            let legacyLoaded = false;

            if (storedChats) {
                chats = JSON.parse(storedChats);
            } else {
                const oldChatlog = localStorage.getItem('gptChat_chatlog');
                if (oldChatlog) {
                    const parsed = JSON.parse(oldChatlog);
                    let rootData;
                    if (parsed.rootAlternatives) {
                        rootData = parsed.rootAlternatives;
                    } else {
                        const tempLog = new Chatlog();
                        parsed.forEach(msg => tempLog.addMessage(msg));
                        rootData = tempLog.toJSON();
                    }
                    chats = [{ id: Date.now().toString(), title: 'Legacy Chat', data: rootData }];
                    localStorage.removeItem('gptChat_chatlog');
                    legacyLoaded = true;
                } else {
                    chats = [];
                }
            }

            chats.forEach(chat => {
                if (Array.isArray(chat.data)) {
                    const temp = new Chatlog();
                    chat.data.forEach(msg => temp.addMessage(msg));
                    chat.data = temp.toJSON();
                    migrated = true;
                }

                const tempLog = new Chatlog();
                tempLog.load(chat.data);
                const first = tempLog.getFirstMessage();
                if (!first || first.value.role !== 'system') {
                    const oldRoot = tempLog.rootAlternatives;
                    tempLog.rootAlternatives = new Alternatives();
                    const sysMsg = tempLog.rootAlternatives.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
                    sysMsg.answerAlternatives = oldRoot;
                    chat.data = tempLog.toJSON();
                    migrated = true;
                }
            });

            if (migrated || legacyLoaded) {
                localStorage.setItem('gptChat_chats', JSON.stringify(chats));
            }

            currentChatId = localStorage.getItem('gptChat_currentChatId');
        };

        loadChats();

        if (chats.length === 0) {
            createNewChat();
        } else {
            if (!currentChatId || !chats.find(c => c.id === currentChatId)) {
                currentChatId = chats[0].id;
            }
            const currentChat = chats.find(c => c.id === currentChatId);
            chatlog = new Chatlog();
            if (currentChat.data) {
                chatlog.load(currentChat.data);
            }
            ui.chatlogEl.chatlog = chatlog;
            ui.chatlogEl.update();
        }

        updateChatList();

        const hasStoredKey = localStorage.getItem('gptChat_apiKey') !== null;
        if (hasStoredKey) {
            let success = loadModelsFromStorage(ui);
            if (!success) {
                success = await loadModels(ui, state);
            }
            if (success) {
                showLogout();
            } else {
                ui.settingsEl.classList.add('open');
                setTimeout(() => ui.apiKeyEl.focus(), 100);
            }
        } else {
            showLogin();
            populateModels(ui, []);
            ui.settingsEl.classList.add('open');
            setTimeout(() => ui.endpointEl.focus(), 100);
        }

        ui.endpointEl.value = localStorage.getItem('gptChat_endpoint') || defaultEndpoint;

        window.addEventListener('beforeunload', persistChats);

        // Sets up event listeners for UI interactions.
        function setUpEventListeners(ui, state, createNewChat, persistChats, switchChat, updateChatList) {
            ui.submitButton.addEventListener('click', () => {
                if (state.receiving) {
                    state.controller.abort();
                    return;
                }

                let model = document.querySelector('input[name="model"]:checked')?.value;
                if (model === 'custom') {
                    model = document.getElementById('custom_model').value.trim();
                    if (!model) return alert('Please enter a custom model ID.');
                }

                openaiChat(ui.messageEl.value, ui.chatlogEl.chatlog, model, Number(ui.temperatureEl.value), Number(ui.topPEl.value), document.querySelector('input[name="user_role"]:checked').value, ui, state);
                document.getElementById('user').checked = true;
                ui.messageEl.value = '';
                ui.messageEl.style.height = 'auto';
            });

            ui.messageEl.addEventListener('keydown', event => {
                if (event.keyCode === 13 && (event.shiftKey || event.ctrlKey || event.altKey)) {
                    event.preventDefault();
                    ui.submitButton.click();
                }
            });

            ui.messageEl.addEventListener('input', function () {
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
                if (event.key === 'Escape') state.controller.abort();
            });

            ui.newChatButton.addEventListener('click', () => {
                if (state.receiving) state.controller.abort();
                ui.messageEl.value = startMessage;
                ui.messageEl.style.height = 'auto';
                createNewChat();
            });

            ui.saveChatButton.addEventListener('click', () => {
                const current = chats.find(c => c.id === currentChatId);
                if (!current) return;
                const jsonData = JSON.stringify({ title: current.title, data: current.data });
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${current.title.replace(/\s/g, '_')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });

            ui.loadChatButton.addEventListener('click', () => {
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
                            const id = Date.now().toString();
                            const title = loaded.title || 'Imported Chat';
                            chats.push({ id, title, data });
                            switchChat(id);
                            updateChatList();
                            persistChats();
                        } catch (error) {
                            console.error('Failed to parse loaded chatlog:', error);
                            alert('Invalid chatlog file.');
                        }
                    });
                    reader.readAsText(file);
                });
                input.click();
            });

            ui.temperatureValueEl.textContent = ui.temperatureEl.value;
            ui.temperatureEl.addEventListener('input', () => ui.temperatureValueEl.textContent = ui.temperatureEl.value);

            ui.topPValueEl.textContent = ui.topPEl.value;
            ui.topPEl.addEventListener('input', () => ui.topPValueEl.textContent = ui.topPEl.value);

            ui.endpointEl.addEventListener('input', () => localStorage.setItem('gptChat_endpoint', ui.endpointEl.value));

            ui.settingsButton.addEventListener('click', () => ui.settingsEl.classList.toggle('open'));

            document.getElementById('refreshModelsButton').addEventListener('click', async () => await loadModels(ui, state));

            // Save selected model to localStorage on change.
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
                const key = ui.apiKeyEl.value.trim();
                localStorage.setItem('gptChat_apiKey', key);
                state.apiKey = key;
                localStorage.setItem('gptChat_endpoint', ui.endpointEl.value);
                if (await loadModels(ui, state)) {
                    showLogout();
                }
            });

            document.getElementById('logout-btn').addEventListener('click', () => {
                localStorage.removeItem('gptChat_apiKey');
                localStorage.removeItem('gptChat_models');
                state.apiKey = '';
                ui.apiKeyEl.value = '';
                ui.endpointEl.value = defaultEndpoint;
                localStorage.setItem('gptChat_endpoint', defaultEndpoint);
                showLogin();
                populateModels(ui, []);
            });

            document.getElementById('toggleChatList').addEventListener('click', () => {
                const cl = document.getElementById('chatListContainer');
                cl.style.display = cl.style.display === 'block' ? 'none' : 'block';
            });
        }

        setUpEventListeners(ui, state, createNewChat, persistChats, switchChat, updateChatList);
    });
}());
