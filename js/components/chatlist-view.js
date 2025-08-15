/**
 * @fileoverview The ChatListView component displays the list of chats.
 */

'use strict';

import { log } from '../utils/logger.js';
import { createControlButton } from '../utils/ui.js';

/**
 * @class ChatListView
 * Manages the chat list UI.
 */
class ChatListView {
    /**
     * @param {Object} options - The options for the chat list view.
     * @param {Function} options.onChatSelected - Callback for when a chat is selected.
     * @param {Function} options.onChatDeleted - Callback for when a chat is deleted.
     * @param {Function} options.onTitleEdited - Callback for when a chat title is edited.
     */
    constructor({ onChatSelected, onChatDeleted, onTitleEdited }) {
        this.onChatSelected = onChatSelected;
        this.onChatDeleted = onChatDeleted;
        this.onTitleEdited = onTitleEdited;

        this.ui = {
            chatList: document.getElementById('chatList'),
        };
    }

    /**
     * Renders the chat list.
     * @param {Array<Object>} chats - The list of chats to render.
     * @param {Object} currentChat - The currently active chat.
     */
    render(chats, currentChat) {
        log(3, 'ChatListView: render called');
        this.ui.chatList.innerHTML = '';
        chats.forEach(chat => {
            const li = document.createElement('li');
            li.dataset.id = chat.id;
            li.classList.add('chat-item');
            li.classList.toggle('active', chat.id === currentChat?.id);

            const titleEl = document.createElement('span');
            titleEl.textContent = chat.title;
            titleEl.addEventListener('click', () => this.onChatSelected(chat.id));

            const editButton = createControlButton(
                'Edit Title',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>',
                () => this.editTitle(li, titleEl, chat)
            );

            const deleteButton = createControlButton(
                'Delete Chat',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
                () => this.onChatDeleted(chat.id)
            );

            li.appendChild(titleEl);
            li.appendChild(editButton);
            li.appendChild(deleteButton);
            this.ui.chatList.appendChild(li);
        });
    }

    /**
     * Handles the editing of a chat title.
     * @param {HTMLElement} li - The list item element.
     * @param {HTMLElement} titleEl - The title element.
     * @param {Object} chat - The chat object.
     */
    editTitle(li, titleEl, chat) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = chat.title;

        let handled = false;
        const saveHandler = () => {
            if (handled) return;
            handled = true;
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== chat.title) {
                this.onTitleEdited(chat.id, newTitle);
            }
            if (li.contains(input)) {
                li.replaceChild(titleEl, input);
            }
        };

        input.addEventListener('blur', saveHandler);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveHandler();
            } else if (e.key === 'Escape') {
                if (handled) return;
                handled = true;
                if (li.contains(input)) {
                    li.replaceChild(titleEl, input);
                }
            }
        });

        li.replaceChild(input, titleEl);
        input.focus();
    }
}

export default ChatListView;
