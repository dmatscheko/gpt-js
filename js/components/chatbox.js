/**
 * @fileoverview The ChatBox component is responsible for displaying chat messages.
 */

'use strict';

import { log } from '../utils/logger.js';
import { hooks } from '../hooks.js';
import { triggerError } from '../utils/logger.js';

/**
 * @class ChatBox
 * Responsible for displaying the chat messages in the UI.
 */
class ChatBox {
    /**
     * @param {import('../state/store.js').default} store - The application's state store.
     */
    constructor(store) {
        log(5, 'ChatBox: Constructor called');
        this.store = store;
        this.container = document.getElementById('chat');
        this.chatlog = null;
        this.onUpdate = null; // Callback for after updates.
        this.boundUpdate = this.update.bind(this);
    }

    /**
     * Sets the chatlog for the chatbox to display.
     * @param {import('./chatlog.js').Chatlog} chatlog - The chatlog to display.
     */
    setChatlog(chatlog) {
        if (this.chatlog) {
            this.chatlog.unsubscribe(this.boundUpdate);
        }
        this.chatlog = chatlog;
        if (this.chatlog) {
            this.chatlog.subscribe(this.boundUpdate);
        }
        this.update();
    }

    /**
     * Updates the HTML content of the chat window.
     * @param {boolean} [scroll=true] - Whether to scroll to the bottom.
     */
    update(scroll = true) {
        log(5, 'ChatBox: update called, scroll:', scroll);
        if (!this.chatlog) {
            this.container.innerHTML = '';
            return;
        }

        const shouldScrollDown = scroll && this.#isScrolledToBottom();
        const fragment = document.createDocumentFragment();
        let alternative = this.chatlog.rootAlternatives;
        let lastRole = 'assistant';
        let pos = 0;
        // Traverse the active path through the chatlog.
        while (alternative) {
            const message = alternative.getActiveMessage();
            if (!message) break;
            if (message.cache) {
                fragment.appendChild(message.cache); // Use cached element if available.
                lastRole = message.value.role;
                alternative = message.answerAlternatives;
                pos++;
                continue;
            }
            const msgIdx = alternative.activeMessageIndex;
            const msgCnt = alternative.messages.length;
            if (!message.value) {
                const role = lastRole === 'assistant' ? 'user' : 'assistant';
                const messageEl = this.formatMessage({ value: { role, content: '🤔...' } }, pos, msgIdx, msgCnt);
                fragment.appendChild(messageEl);
                break;
            }
            if (message.value.content === null) {
                const messageEl = this.formatMessage({ value: { role: message.value.role, content: '🤔...' } }, pos, msgIdx, msgCnt);
                fragment.appendChild(messageEl);
                break;
            }
            const messageEl = this.formatMessage(message, pos, msgIdx, msgCnt);
            fragment.appendChild(messageEl);
            message.cache = messageEl; // Cache the element.
            lastRole = message.value.role;
            alternative = message.answerAlternatives;
            pos++;
        }
        this.container.replaceChildren(fragment);
        if (shouldScrollDown) {
            this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
        }
        if (this.onUpdate) this.onUpdate();
    }

    /**
     * Checks if the chat container is scrolled to the bottom.
     * @returns {boolean} True if scrolled to the bottom.
     * @private
     */
    #isScrolledToBottom() {
        log(5, 'ChatBox: #isScrolledToBottom called');
        const { scrollHeight, clientHeight, scrollTop } = this.container.parentElement;
        return scrollHeight - clientHeight <= scrollTop + 5;
    }

    /**
     * Formats a single message as an HTML element.
     * @param {import('./chatlog.js').Message} message - The message to format.
     * @param {number} pos - The position of the message in the chat.
     * @param {number} msgIdx - The index of the message in its alternatives.
     * @param {number} msgCnt - The total number of alternatives.
     * @returns {HTMLElement} The formatted message element.
     */
    formatMessage(message, pos, msgIdx, msgCnt) {
        log(5, 'ChatBox: formatMessage called for pos', pos);
        const el = document.createElement('div');
        el.classList.add('message', message.value.role === 'assistant' ? 'pong' : 'ping');
        if (message.value.role === 'system') el.classList.add('system');
        el.dataset.pos = pos;

        // Create header
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

        // Create a container for controls and call the hook
        const controlsContainer = document.createElement('span');
        controlsContainer.classList.add('message-controls', 'nobreak');
        hooks.onRenderMessageControls.forEach(fn => fn(controlsContainer, message, this.chatlog, this));
        msgTitleStrip.appendChild(controlsContainer);

        el.appendChild(msgTitleStrip);
        el.appendChild(document.createElement('br'));
        el.appendChild(document.createElement('br'));

        const formattedContent = this.#formatContent(message.value.content, message, pos);
        if (formattedContent) {
            el.appendChild(formattedContent);
        }

        hooks.onRenderMessage.forEach(fn => fn(el, message, this));
        return el;
    }

    /**
     * Formats the content of a message.
     * @param {string} text - The text content to format.
     * @param {import('./chatlog.js').Message} message - The message being formatted.
     * @returns {HTMLElement | null} The formatted content element or null.
     * @private
     */
    #formatContent(text, message, pos) {
        log(5, 'ChatBox: #formatContent called');
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
            log(1, 'ChatBox: Formatting error', error);
            triggerError('Formatting error:', error);
            const wrapper = document.createElement('div');
            wrapper.classList.add('content');
            wrapper.innerHTML = `<p>Error formatting content: ${error.message}</p><pre>${text}</pre>`;
            return wrapper;
        }
    }
}

export { ChatBox };
