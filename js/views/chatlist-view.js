'use strict';

import { log } from '../utils.js';

/**
 * @class ChatListView
 * Manages the rendering and interaction of the chat list in the UI.
 */
class ChatListView {
    /**
     * @param {import('../services/chat-service.js').default} chatService - The chat service instance.
     */
    constructor(chatService) {
        this.chatService = chatService;
        this.listEl = document.getElementById('chatList');
    }

    /**
     * Renders the list of chats.
     * @param {Array<Object>} chats - The array of chat objects.
     * @param {Object} currentChat - The currently active chat object.
     */
    render(chats, currentChat) {
        log(5, 'ChatListView: render called');
        this.listEl.innerHTML = '';

        chats.forEach(chat => {
            const li = document.createElement('li');
            li.classList.add('chat-item');
            if (chat.id === currentChat?.id) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => this.chatService.switchChat(chat.id));

            const titleSpan = document.createElement('span');
            titleSpan.textContent = chat.title;
            li.appendChild(titleSpan);

            this.addEditButton(li, chat, titleSpan);
            this.addDeleteButton(li, chat);

            this.listEl.appendChild(li);
        });
    }

    /**
     * Adds an edit button to a chat list item.
     * @param {HTMLElement} parent - The parent list item element.
     * @param {Object} chat - The chat object.
     * @param {HTMLElement} titleSpan - The span element containing the chat title.
     */
    addEditButton(parent, chat, titleSpan) {
        const editBtn = document.createElement('button');
        editBtn.classList.add('toolButton', 'small');
        editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = chat.title;
            input.addEventListener('blur', () => {
                this.chatService.updateChatTitle(chat.id, input.value);
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
        parent.appendChild(editBtn);
    }

    /**
     * Adds a delete button to a chat list item.
     * @param {HTMLElement} parent - The parent list item element.
     * @param {Object} chat - The chat object.
     */
    addDeleteButton(parent, chat) {
        const delBtn = document.createElement('button');
        delBtn.classList.add('toolButton', 'small');
        delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.chatService.deleteChat(chat.id);
        });
        parent.appendChild(delBtn);
    }
}

export default ChatListView;
