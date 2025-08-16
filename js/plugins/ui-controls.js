/**
 * @fileoverview A plugin for adding UI controls to messages.
 */

'use strict';

import { triggerError, log } from '../utils/logger.js';
import { createControlButton } from '../utils/ui.js';
import { resetEditing, addAlternativeToChat } from '../utils/chat.js';
import { hooks } from '../hooks.js';

/**
 * @typedef {import('../components/chatbox.js').ChatBox} ChatBox
 * @typedef {import('../components/chatlog.js').Chatlog} Chatlog
 * @typedef {import('../components/chatlog.js').Message} Message
 */

/**
 * Plugin to add navigation controls for alternative messages.
 * @type {import('../hooks.js').Plugin}
 */
export const alternativeNavigationPlugin = {
    name: 'alternativeNavigation',
    hooks: {
        /**
         * Renders navigation controls for alternative messages.
         * @param {HTMLElement} container - The container for the controls.
         * @param {Message} message - The message object.
         * @param {Chatlog} chatlog - The chatlog instance.
         */
        onRenderMessageControls: function(container, message, chatlog) {
            const alternatives = chatlog.findAlternativesForMessage(message);
            if (!alternatives || alternatives.messages.length <= 1) return;

            const prevBtn = createControlButton(
                'Previous Message',
                '<svg width="16" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 7.766c0-1.554-1.696-2.515-3.029-1.715l-7.056 4.234c-1.295.777-1.295 2.653 0 3.43l7.056 4.234c1.333.8 3.029-.16 3.029-1.715V7.766zM9.944 12L17 7.766v8.468L9.944 12zM6 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
                () => chatlog.cycleAlternatives(message, 'prev')
            );

            const nextBtn = createControlButton(
                'Next Message',
                '<svg width="16" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7.766c0-1.554 1.696-2.515 3.029-1.715l7.056 4.234c1.295.777 1.295 2.653 0 3.43L8.03 17.949c-1.333.8-3.029-.16-3.029-1.715V7.766zM14.056 12L7 7.766v8.468L14.056 12zM18 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
                () => chatlog.cycleAlternatives(message, 'next')
            );

            const status = document.createElement('span');
            status.innerHTML = `&nbsp;${alternatives.activeMessageIndex + 1}/${alternatives.messages.length}&nbsp;`;

            const spacer = document.createElement('span');
            spacer.innerHTML = `&nbsp;&nbsp;&nbsp;`;

            container.appendChild(spacer);
            container.appendChild(prevBtn);
            container.appendChild(status);
            container.appendChild(nextBtn);
        }
    }
};

/**
 * Plugin to add message modification controls (add, edit, delete).
 * @type {import('../hooks.js').Plugin}
 */
export const messageModificationPlugin = {
    name: 'messageModification',
    hooks: {
        /**
         * Renders modification controls for a message.
         * @param {HTMLElement} container - The container for the controls.
         * @param {Message} message - The message object.
         * @param {Chatlog} chatlog - The chatlog instance.
         * @param {ChatBox} chatbox - The ChatBox instance.
         */
        onRenderMessageControls: function(container, message, chatlog, chatbox) {
            const store = chatbox.store;
            const ui = store.get('ui');
            const messageInput = ui.messageEl;

            const addBtn = createControlButton(
                'New Message',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
                () => {
                    log(4, 'Add button clicked for message', message);
                    resetEditing(store, chatlog, chatbox);
                    if (message.value.role === 'assistant') {
                        // Regenerate AI message
                        addAlternativeToChat(chatlog, message, { role: message.value.role, content: null });
                        hooks.onGenerateAIResponse.forEach(fn => fn({}, chatlog));
                    } else {
                        if (messageInput.value !== '' && messageInput.value !== message.value.content.trim()) {
                            triggerError("Chat input is not empty.");
                            return;
                        }
                        // Add a new editable alternative for user/system/tool messages with placeholder
                        const pos = chatlog.getMessagePos(message);
                        const originalContent = message.value.content;
                        addAlternativeToChat(chatlog, message, { role: message.value.role, content: null });
                        messageInput.value = originalContent ? originalContent.trim() : '';
                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                        store.set('editingPos', pos);
                        const roleRadio = document.getElementById(message.value.role);
                        if (roleRadio) roleRadio.checked = true;
                        messageInput.focus();
                    }
                }
            );

            const editBtn = createControlButton(
                'Edit Message',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>',
                () => {
                    log(4, 'Edit button clicked for message', message);
                    if (messageInput.value !== '' && messageInput.value !== message.value.content.trim()) {
                        triggerError("Chat input is not empty.");
                        return;
                    }
                    resetEditing(store, chatlog, chatbox);
                    messageInput.value = message.value.content.trim();
                    messageInput.dispatchEvent(new Event('input', { bubbles: true }));

                    const pos = chatlog.getMessagePos(message);
                    store.set('editingPos', pos);

                    const roleRadio = document.getElementById(message.value.role);
                    if (roleRadio) roleRadio.checked = true;

                    const alternatives = chatlog.findAlternativesForMessage(message);
                    message.cache = chatbox.formatMessage({ value: { role: message.value.role, content: '🤔...' } }, pos, alternatives.activeMessageIndex, alternatives.messages.length);
                    chatbox.update(false);

                    messageInput.focus();
                }
            );

            const delBtn = createControlButton(
                'Delete Message',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4V4zm2 2h6V4H9v2zM6.074 8l.857 12H17.07l.857-12H6.074zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
                () => {
                    log(4, 'Delete button clicked for message', message);
                    chatlog.deleteMessage(message);
                }
            );

            const spacer = document.createElement('span');
            spacer.innerHTML = `&nbsp;&nbsp;&nbsp;`;

            container.appendChild(spacer);
            container.appendChild(addBtn);
            container.appendChild(editBtn);
            container.appendChild(delBtn);
        }
    }
};
