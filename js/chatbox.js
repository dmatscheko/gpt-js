'use strict';

import { log } from './utils.js';
import { hooks } from './hooks.js';

// Responsible for displaying the chat messages in the UI.
class Chatbox {
    constructor(chatlog, container, store) {
        log(5, 'Chatbox: Constructor called');
        this.chatlog = chatlog;
        this.container = container;
        this.store = store;
        this.onUpdate = null; // Callback for after updates.
    }

    // Updates the HTML content inside the chat window, optionally scrolling to the bottom.
    update(scroll = true) {
        log(5, 'Chatbox: update called, scroll:', scroll);
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

    // Checks if the chat container is scrolled to the bottom.
    #isScrolledToBottom() {
        log(5, 'Chatbox: #isScrolledToBottom called');
        const { scrollHeight, clientHeight, scrollTop } = this.container.parentElement;
        return scrollHeight - clientHeight <= scrollTop + 5;
    }

    // Formats a single message as an HTML element.
    formatMessage(message, pos, msgIdx, msgCnt) {
        log(5, 'Chatbox: formatMessage called for pos', pos);
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

        const formattedContent = this.#formatContent(message.value.content, message);
        if (formattedContent) {
            el.appendChild(formattedContent);
        }

        hooks.onRenderMessage.forEach(fn => fn(el, message, this));
        return el;
    }

    // Formats message content.
    #formatContent(text, message) {
        log(5, 'Chatbox: #formatContent called');
        if (!text) return null;
        try {
            text = text.trim();
            let html = text;
            hooks.onFormatContent.forEach(fn => { html = fn(html); });
            const wrapper = document.createElement('div');
            wrapper.classList.add('content');
            wrapper.innerHTML = html;
            hooks.onPostFormatContent.forEach(fn => { fn(wrapper, message); });
            return wrapper;
        } catch (error) {
            log(1, 'Chatbox: Formatting error', error);
            triggerError('Formatting error:', error);
            const wrapper = document.createElement('div');
            wrapper.classList.add('content');
            wrapper.innerHTML = `<p>Error formatting content: ${error.message}</p><pre>${text}</pre>`;
            return wrapper;
        }
    }
}

export { Chatbox };
