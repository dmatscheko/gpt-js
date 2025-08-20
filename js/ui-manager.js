/**
 * @fileoverview Manages all direct DOM manipulation for the chat interface.
 */

'use strict';

import { log } from './utils/logger.js';
import { hooks } from './hooks.js';

let chatContainer;
let appInstance;
let currentChatlog;

/**
 * Initializes the UI manager with the main chat container and app instance.
 * @param {HTMLElement} container - The element where chat messages are displayed.
 * @param {import('./app.js').default} app - The main application instance.
 */
export function init(container, app) {
    chatContainer = container;
    appInstance = app;
    log(4, 'UIManager: Initialized with container and app instance');
}

/**
 * Sets the active chatlog for the UI manager and triggers a re-render.
 * @param {import('./components/chatlog.js').Chatlog | null} newChatlog - The new chatlog.
 */
export function setChatlog(newChatlog) {
    currentChatlog = newChatlog;
    renderEntireChat();
}


/**
 * Renders an entire chatlog from scratch, clearing the existing view.
 */
export function renderEntireChat() {
    log(4, 'UIManager: renderEntireChat called');
    if (!chatContainer) {
        log(1, 'UIManager: Not initialized. Call init() first.');
        return;
    }
    if (!currentChatlog) {
        chatContainer.innerHTML = '';
        return;
    }

    const fragment = document.createDocumentFragment();
    let alternative = currentChatlog.rootAlternatives;
    let lastRole = 'assistant';
    let pos = 0;

    while (alternative) {
        const message = alternative.getActiveMessage();
        if (!message) break;

        const msgIdx = alternative.activeMessageIndex;
        const msgCnt = alternative.messages.length;

        if (!message.value) {
            const role = lastRole === 'assistant' ? 'user' : 'assistant';
            const messageEl = _formatMessage({ value: { role, content: '🤔...' } }, pos, msgIdx, msgCnt, currentChatlog);
            fragment.appendChild(messageEl);
            break;
        }
        if (message.value.content === null) {
            const messageEl = _formatMessage({ value: { role: message.value.role, content: '🤔...' } }, pos, msgIdx, msgCnt, currentChatlog);
            fragment.appendChild(messageEl);
            break;
        }

        const messageEl = _formatMessage(message, pos, msgIdx, msgCnt, currentChatlog);
        fragment.appendChild(messageEl);

        lastRole = message.value.role;
        alternative = message.answerAlternatives;
        pos++;
    }

    chatContainer.replaceChildren(fragment);
    chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
}

/**
 * Formats the content of a message.
 * @param {string} text - The text content to format.
 * @param {import('./components/chatlog.js').Message} message - The message being formatted.
 * @param {number} pos - The position of the message.
 * @returns {HTMLElement | null} The formatted content element or null.
 */
function _formatContent(text, message, pos) {
    log(5, 'UIManager: _formatContent called');
    if (!text) return null;
    try {
        text = text.trim();
        let html = text;
        hooks.onFormatContent.forEach(fn => { html = fn(html, pos); });
        const wrapper = document.createElement('div');
        wrapper.classList.add('content');
        wrapper.innerHTML = html;
        hooks.onPostFormatContent.forEach(fn => { fn(wrapper, message, pos); });
        return wrapper;
    } catch (error) {
        log(1, 'UIManager: Formatting error', error);
        // triggerError is not defined here yet, need to decide how to handle errors.
        const wrapper = document.createElement('div');
        wrapper.classList.add('content');
        wrapper.innerHTML = `<p>Error formatting content: ${error.message}</p><pre>${text}</pre>`;
        return wrapper;
    }
}

/**
 * Formats a single message as an HTML element.
 * @param {import('./components/chatlog.js').Message} message - The message to format.
 * @param {number} pos - The position of the message in the chat.
 * @param {number} msgIdx - The index of the message in its alternatives.
 * @param {number} msgCnt - The total number of alternatives.
 * @param {import('./components/chatlog.js').Chatlog} chatlog - The chatlog being rendered.
 * @returns {HTMLElement} The formatted message element.
 */
function _formatMessage(message, pos, msgIdx, msgCnt, chatlog) {
    log(5, 'UIManager: _formatMessage called for pos', pos);
    const el = document.createElement('div');
    el.classList.add('message', message.value.role === 'assistant' ? 'pong' : 'ping');
    if (message.value.role === 'system') el.classList.add('system');
    el.dataset.pos = pos;

    const msgTitleStrip = document.createElement('small');
    const roleEl = document.createElement('b');
    roleEl.textContent = message.value.role;
    msgTitleStrip.appendChild(roleEl);

    if (message.metadata?.model) {
        const modelEl = document.createElement('span');
        modelEl.classList.add('right');
        modelEl.textContent = ` ${message.metadata.model}         `;
        msgTitleStrip.appendChild(modelEl);
    }

    const controlsContainer = document.createElement('span');
    controlsContainer.classList.add('message-controls', 'nobreak');
    // Pass the app instance to the hooks so they can access the store and other services.
    hooks.onRenderMessageControls.forEach(fn => fn(controlsContainer, message, chatlog, appInstance));
    msgTitleStrip.appendChild(controlsContainer);

    el.appendChild(msgTitleStrip);
    el.appendChild(document.createElement('br'));
    el.appendChild(document.createElement('br'));

    const formattedContent = _formatContent(message.value.content, message, pos);
    if (formattedContent) {
        el.appendChild(formattedContent);
    }

    hooks.onRenderMessage.forEach(fn => fn(el, message, null));
    return el;
}


/**
 * Adds a new message to the chatlog and the DOM.
 * @param {object} messageValue - The value of the message to add (e.g., {role: 'user', content: '...'})
 * @returns {import('./components/chatlog.js').Message} The newly created message object.
 */
export function addMessage(messageValue) {
    log(4, 'UIManager: addMessage called with value', messageValue);
    if (!currentChatlog || !chatContainer) return null;

    const newMessage = currentChatlog.addMessage(messageValue);
    const position = currentChatlog.getMessagePos(newMessage);

    const alternatives = currentChatlog.getNthAlternatives(position);
    if (!alternatives) return null;

    const msgIdx = alternatives.activeMessageIndex;
    const msgCnt = alternatives.messages.length;

    const messageEl = _formatMessage(newMessage, position, msgIdx, msgCnt, currentChatlog);

    const existingEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (existingEl) {
        existingEl.replaceWith(messageEl);
    } else {
        chatContainer.appendChild(messageEl);
    }
    chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
    return newMessage;
}

/**
 * Deletes a message from the chatlog and the DOM.
 * @param {import('./components/chatlog.js').Message} message - The message object to remove.
 */
export function deleteMessage(message) {
    log(4, 'UIManager: deleteMessage called for', message);
    if (!currentChatlog) return;
    currentChatlog.deleteMessage(message);
    renderEntireChat();
}

/**
 * Updates the content of the last message in the DOM during streaming.
 */
export function updateMessage(message) {
    if (!currentChatlog || !chatContainer) return;
    const position = currentChatlog.getMessagePos(message);
    if (position === -1) return;

    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (!messageEl) return;

    const alternatives = currentChatlog.getNthAlternatives(position);
    if (!alternatives) return;
    const msgIdx = alternatives.activeMessageIndex;
    const msgCnt = alternatives.messages.length;

    const newMessageEl = _formatMessage(message, position, msgIdx, msgCnt);
    messageEl.replaceWith(newMessageEl);
}

export function streamUpdate() {
    log(5, 'UIManager: streamUpdate called');
    if (!currentChatlog || !chatContainer) return;

    const lastMessage = currentChatlog.getLastMessage();
    if (!lastMessage) return;

    const position = currentChatlog.getMessagePos(lastMessage);
    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (!messageEl) return;

    const shouldScrollDown = (chatContainer.parentElement.scrollHeight - chatContainer.parentElement.clientHeight) <= (chatContainer.parentElement.scrollTop + 5);

    let contentWrapper = messageEl.querySelector('.content');
    if (!contentWrapper) {
        contentWrapper = document.createElement('div');
        contentWrapper.classList.add('content');
        messageEl.appendChild(contentWrapper);
    }

    const formattedContent = _formatContent(lastMessage.value.content, lastMessage, position);
    if (formattedContent) {
        const currentContent = messageEl.querySelector('.content');
        if (currentContent) {
            currentContent.replaceWith(formattedContent);
        }
    }

    if (shouldScrollDown) {
        chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
    }
}

/**
 * Toggles the visual state of a message to indicate editing.
 * @param {import('./components/chatlog.js').Message} message - The message to toggle.
 * @param {boolean} isEditing - True if the message is being edited.
 */
export function toggleMessageEditMode(message, isEditing) {
    log(4, 'UIManager: toggleMessageEditMode called for', message);
    if (!currentChatlog || !chatContainer) return;

    const position = currentChatlog.getMessagePos(message);
    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (!messageEl) return;

    if (isEditing) {
        const contentWrapper = messageEl.querySelector('.content');
        if (contentWrapper) {
            contentWrapper.innerHTML = '🤔...';
        }
    } else {
        // Restore the original content by re-rendering the whole chat
        renderEntireChat();
    }
}
