/**
 * @fileoverview Service for managing chat sessions.
 */

'use strict';

import { Chatlog, Alternatives } from '../components/chatlog.js';
import { firstPrompt } from '../config.js';
import { log, triggerError } from '../utils/logger.js';
import { getDatePrompt, resetEditing } from '../utils/chat.js';

/**
 * @class ChatService
 * Manages chat sessions, including creating, switching, loading, and persisting chats.
 */
class ChatService {
    /**
     * @param {import('../state/store.js').default} store - The application's state store.
     */
    constructor(store) {
        this.store = store;
        this.chats = [];
        this.currentChatId = null;
    }

    /**
     * Initializes the chat service by loading chats from storage or creating a new one.
     */
    init() {
        this.loadChats();
        const initialId = this.currentChatId || this.chats[0]?.id;
        if (this.chats.length === 0) {
            this.createNewChat();
        } else {
            this.switchChat(initialId);
        }
    }

    /**
     * Creates a new chat session.
     * @returns {Object} The new chat object.
     */
    createNewChat() {
        log(3, 'ChatService: createNewChat called');
        const id = Date.now().toString();
        const title = 'New Chat';
        const chatlog = new Chatlog();
        chatlog.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
        const newChat = { id, title, chatlog, agents: [], flow: {} };
        this.chats.push(newChat);
        this.store.set('chats', this.chats);
        this.switchChat(id);
        return newChat;
    }

    /**
     * Switches the active chat session.
     * @param {string} id - The ID of the chat to switch to.
     */
    switchChat(id) {
        log(3, 'ChatService: switchChat called for id', id);
        if (this.currentChatId === id) return;

        const ui = this.store.get('ui');
        resetEditing(this.store, ui.chatBox.chatlog, ui.chatBox);

        this.persistChats();
        this.currentChatId = id;
        const currentChat = this.chats.find(c => c.id === id);
        this.store.set('currentChat', currentChat);
    }

    /**
     * Deletes a chat session.
     * @param {string} chatId - The ID of the chat to delete.
     */
    deleteChat(chatId) {
        log(4, 'ChatService: deleteChat called for', chatId);
        this.chats = this.chats.filter(c => c.id !== chatId);
        this.store.set('chats', this.chats);

        if (this.currentChatId === chatId) {
            if (this.chats.length > 0) {
                this.switchChat(this.chats[0].id);
            } else {
                this.createNewChat();
            }
        }
        this.persistChats();
    }

    /**
     * Updates the title of a chat session.
     * @param {string} chatId - The ID of the chat to update.
     * @param {string} newTitle - The new title for the chat.
     */
    updateChatTitle(chatId, newTitle) {
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            chat.title = newTitle.trim() || 'Untitled Chat';
            this.persistChats();
            this.store.set('chats', [...this.chats]);
        }
    }

    /**
     * Gets the chatlog of the currently active chat.
     * @returns {Chatlog | null} The active chatlog, or null if there is no active chat.
     */
    getCurrentChatlog() {
        const chat = this.chats.find(c => c.id === this.currentChatId);
        return chat ? chat.chatlog : null;
    }

    /**
     * Persists all chat sessions to local storage.
     */
    persistChats() {
        log(5, 'ChatService: persistChats called');
        const serializedChats = this.chats.map(c => ({
            id: c.id,
            title: c.title,
            data: c.chatlog.toJSON(),
            agents: c.agents || [],
            flow: c.flow || {},
        }));
        localStorage.setItem('gptChat_chats', JSON.stringify(serializedChats));
        localStorage.setItem('gptChat_currentChatId', this.currentChatId);
    }

    /**
     * Loads chat sessions from local storage.
     */
    loadChats() {
        log(3, 'ChatService: loadChats called');
        const storedChats = localStorage.getItem('gptChat_chats');
        let migrated = false;
        let legacyLoaded = false;
        if (storedChats) {
            const parsed = JSON.parse(storedChats);
            this.chats = parsed.map(chatData => {
                const chatlog = new Chatlog();
                chatlog.load(chatData.data || null);
                const first = chatlog.getFirstMessage();
                if (!first || first.value.role !== 'system') {
                    log(4, 'ChatService: Adding missing system prompt in loadChats');
                    const oldRoot = chatlog.rootAlternatives;
                    chatlog.rootAlternatives = new Alternatives();
                    const sysMsg = chatlog.rootAlternatives.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
                    sysMsg.answerAlternatives = oldRoot;
                }
                return {
                    id: chatData.id,
                    title: chatData.title,
                    chatlog,
                    agents: chatData.agents || [],
                    flow: chatData.flow || {},
                };
            });
        } else {
            const oldChatlog = localStorage.getItem('gptChat_chatlog');
            if (oldChatlog) {
                log(3, 'ChatService: Loading legacy chatlog');
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
        if (migrated || legacyLoaded) {
            log(3, 'ChatService: Persisting migrated/legacy chats');
            this.persistChats();
        }
        this.currentChatId = localStorage.getItem('gptChat_currentChatId');
        // Set 'currentChat' in store if currentChatId is valid, to select the first chat on page load if available
        let currentChat = null;
        if (this.currentChatId) {
            currentChat = this.chats.find(c => c.id === this.currentChatId);
        }
        if (currentChat) {
            this.store.set('currentChat', currentChat);
        } else {
            // Invalid ID; clear it so init() can fall back to first chat
            this.currentChatId = null;
        }
        this.store.set('chats', this.chats);
    }

    /**
     * Imports a chat from a JSON file content.
     * @param {string} fileContent - The content of the JSON file.
     */
    importChat(fileContent) {
        try {
            let loaded = JSON.parse(fileContent);
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
            this.store.set('chats', this.chats);
            this.switchChat(id);
            this.persistChats();
        } catch (error) {
            log(1, 'ChatService: Invalid chatlog file', error);
            triggerError('Invalid chatlog file. Failed to parse loaded chatlog:', error);
        }
    }

    addAgent(agentData) {
        const chat = this.chats.find(c => c.id === this.currentChatId);
        if (chat) {
            if (!chat.agents) chat.agents = [];
            chat.agents.push(agentData);
            this.persistChats();
            this.store.set('currentChat', { ...chat }); // Trigger update
        }
    }

    updateAgent(updatedAgent) {
        const chat = this.chats.find(c => c.id === this.currentChatId);
        if (chat && chat.agents) {
            const index = chat.agents.findIndex(a => a.id === updatedAgent.id);
            if (index !== -1) {
                chat.agents[index] = updatedAgent;
                this.persistChats();
                this.store.set('currentChat', { ...chat }); // Trigger update
            }
        }
    }

    deleteAgent(agentId) {
        const chat = this.chats.find(c => c.id === this.currentChatId);
        if (chat && chat.agents) {
            chat.agents = chat.agents.filter(a => a.id !== agentId);
            this.persistChats();
            this.store.set('currentChat', { ...chat }); // Trigger update
        }
    }

    updateFlow(flowData) {
        const chat = this.chats.find(c => c.id === this.currentChatId);
        if (chat) {
            chat.flow = flowData;
            this.persistChats();
            // We don't need to trigger a store update here,
            // as the flow view is responsible for its own rendering.
        }
    }
}

export default ChatService;
