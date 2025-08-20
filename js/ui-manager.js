/**
 * @fileoverview Manages all direct DOM manipulation for the chat interface.
 */

'use strict';

import { log } from './utils/logger.js';
import { hooks } from './hooks.js';

let chatContainer;

/**
 * Initializes the UI manager with the main chat container.
 * @param {HTMLElement} container - The element where chat messages are displayed.
 */
export function init(container) {
    chatContainer = container;
    log(4, 'UIManager: Initialized with container', chatContainer);
}

/**
 * Renders an entire chatlog from scratch, clearing the existing view.
 * @param {import('./components/chatlog.js').Chatlog} chatlog - The chatlog to render.
 */
export function renderEntireChat(chatlog) {
    log(4, 'UIManager: renderEntireChat called');
    if (!chatContainer) {
        log(1, 'UIManager: Not initialized. Call init() first.');
        return;
    }
    if (!chatlog) {
        chatContainer.innerHTML = '';
        return;
    }

    const fragment = document.createDocumentFragment();
    let alternative = chatlog.rootAlternatives;
    let lastRole = 'assistant';
    let pos = 0;

    while (alternative) {
        const message = alternative.getActiveMessage();
        if (!message) break;

        const msgIdx = alternative.activeMessageIndex;
        const msgCnt = alternative.messages.length;

        if (!message.value) {
            const role = lastRole === 'assistant' ? 'user' : 'assistant';
            const messageEl = _formatMessage({ value: { role, content: '🤔...' } }, pos, msgIdx, msgCnt, chatlog);
            fragment.appendChild(messageEl);
            break;
        }
        if (message.value.content === null) {
            const messageEl = _formatMessage({ value: { role: message.value.role, content: '🤔...' } }, pos, msgIdx, msgCnt, chatlog);
            fragment.appendChild(messageEl);
            break;
        }

        const messageEl = _formatMessage(message, pos, msgIdx, msgCnt, chatlog);
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
    // The last parameter `this` (the chatbox instance) is no longer available.
    // Hooks might need to be adapted if they rely on it. Passing null for now.
    hooks.onRenderMessageControls.forEach(fn => fn(controlsContainer, message, chatlog, null));
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
 * Adds a single message to the DOM at a specific position.
 * @param {import('./components/chatlog.js').Message} message - The message object to render.
 * @param {import('./components/chatlog.js').Chatlog} chatlog - The chatlog the message belongs to.
 * @param {number} position - The position (index) to insert the message at.
 */
export function addMessage(message, chatlog, position) {
    log(4, 'UIManager: addMessage called for position', position);
    if (!chatContainer) {
        log(1, 'UIManager: Not initialized. Call init() first.');
        return;
    }
    // For simplicity, we find the alternatives and active index again.
    // This could be optimized by passing them in.
    const alternatives = chatlog.getNthAlternatives(position);
    if (!alternatives) return;

    const msgIdx = alternatives.activeMessageIndex;
    const msgCnt = alternatives.messages.length;

    const messageEl = _formatMessage(message, position, msgIdx, msgCnt, chatlog);

    // If there's already an element at this position (e.g., the '🤔...' bubble), replace it.
    const existingEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (existingEl) {
        existingEl.replaceWith(messageEl);
    } else {
        chatContainer.appendChild(messageEl);
    }
    chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
}

/**
 * Removes a message from the DOM at a specific position.
 * @param {number} position - The position (index) of the message to remove.
 */
export function removeMessage(position) {
    log(4, 'UIManager: removeMessage called for position', position);
    if (!chatContainer) return;
    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (messageEl) {
        messageEl.remove();
    }
}

/**
 * Updates the content of an existing message in the DOM.
 * @param {number} position - The position (index) of the message to update.
 * @param {import('./components/chatlog.js').Message} message - The message object with the updated content.
 */
export function updateMessageContent(position, message) {
    log(5, 'UIManager: updateMessageContent called for position', position);
    if (!chatContainer) return;

    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (!messageEl) return;

    const shouldScrollDown = (chatContainer.parentElement.scrollHeight - chatContainer.parentElement.clientHeight) <= (chatContainer.parentElement.scrollTop + 5);

    let contentWrapper = messageEl.querySelector('.content');
    if (!contentWrapper) {
        contentWrapper = document.createElement('div');
        contentWrapper.classList.add('content');
        messageEl.appendChild(contentWrapper);
    }

    // Re-run formatting logic
    const formattedContent = _formatContent(message.value.content, message, position);
    if (formattedContent) {
        contentWrapper.replaceWith(formattedContent);
    }

    if (shouldScrollDown) {
        chatContainer.parentElement.scrollTop = chatContainer.parentElement.scrollHeight;
    }
}

/**
 * Toggles the visual state of a message to indicate editing.
 * @param {number} position - The position (index) of the message.
 * @param {boolean} isEditing - True if the message is being edited.
 * @param {import('./components/chatlog.js').Message} originalMessage - The original message data to restore if needed.
 */
export function toggleMessageEditMode(position, isEditing, originalMessage) {
    log(4, 'UIManager: toggleMessageEditMode called for position', position);
    if (!chatContainer) return;

    const messageEl = chatContainer.querySelector(`.message[data-pos="${position}"]`);
    if (!messageEl) return;

    if (isEditing) {
        const contentWrapper = messageEl.querySelector('.content');
        if (contentWrapper) {
            contentWrapper.innerHTML = '🤔...';
        }
    } else {
        // Restore the original content by re-rendering
        updateMessageContent(position, originalMessage);
    }
}
