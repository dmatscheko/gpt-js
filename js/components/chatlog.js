/**
 * @fileoverview Defines the data structures for the chat history.
 */

'use strict';

import { log } from '../utils/logger.js';
import { hooks } from '../hooks.js';

/**
 * @class Message
 * Represents a single message in the chatlog.
 */
class Message {
    /**
     * @param {Object} value - The message value, e.g., { role: 'user', content: 'Hello' }.
     */
    constructor(value) {
        log(5, 'Message: Constructor called with value', value);
        this.value = value;
        this.metadata = null;
        this.cache = null;
        this.answerAlternatives = null;
    }

    /**
     * Retrieves the active answer message if alternatives exist.
     * @returns {Message | null} The active answer message or null.
     */
    getAnswerMessage() {
        log(5, 'Message: getAnswerMessage called');
        return this.answerAlternatives ? this.answerAlternatives.getActiveMessage() : null;
    }

    /**
     * Serializes the message to a JSON-compatible object.
     * @returns {Object} The serialized message.
     */
    toJSON() {
        log(6, 'Message: toJSON called');
        return {
            value: this.value,
            metadata: this.metadata,
            answerAlternatives: this.answerAlternatives
        };
    }

    /**
     * Sets the content of the message.
     * @param {string} content - The new content.
     */
    setContent(content) {
        log(5, 'Message: setContent called');
        this.value.content = content;
        this.cache = null;
    }

    /**
     * Appends a delta to the content of the message.
     * @param {string} delta - The content to append.
     */
    appendContent(delta) {
        log(5, 'Message: appendContent called with delta', delta);
        if (this.value === null) {
            this.value = { role: 'assistant', content: delta };
        } else {
            if (!this.value.content) this.value.content = '';
            this.value.content += delta;
        }
        this.cache = null;
    }
}

/**
 * @class Alternatives
 * Manages a set of alternative messages at a given point in the chatlog.
 */
class Alternatives {
    constructor() {
        log(5, 'Alternatives: Constructor called');
        this.messages = [];
        this.activeMessageIndex = -1;
    }

    /**
     * Adds a new message or updates the active one if it's null.
     * @param {Object} value - The value for the new message.
     * @returns {Message} The new or updated message.
     */
    addMessage(value) {
        log(5, 'Alternatives: addMessage called with value', value);
        this.clearCache();
        const current = this.getActiveMessage();
        if (current) {
            if (current && current.value === null) {
                current.value = value;
                return current;
            }
        }
        const newMessage = new Message(value);
        this.activeMessageIndex = this.messages.push(newMessage) - 1;
        return newMessage;
    }

    /**
     * Gets the currently active message.
     * @returns {Message | null} The active message or null.
     */
    getActiveMessage() {
        log(5, 'Alternatives: getActiveMessage called');
        return this.activeMessageIndex !== -1 ? this.messages[this.activeMessageIndex] || null : null;
    }

    /**
     * Cycles to the next alternative message.
     * @returns {Message | null} The next message.
     */
    next() {
        log(5, 'Alternatives: next called');
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
        }
        this.activeMessageIndex = (this.activeMessageIndex + 1) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    /**
     * Cycles to the previous alternative message.
     * @returns {Message | null} The previous message.
     */
    prev() {
        log(5, 'Alternatives: prev called');
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
        }
        this.activeMessageIndex = (this.activeMessageIndex - 1 + this.messages.length) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    /**
     * Clears the cache for all messages in this set of alternatives.
     */
    clearCache() {
        log(5, 'Alternatives: clearCache called');
        this.messages.forEach(msg => { if (msg) msg.cache = null; });
    }

    /**
     * Serializes the alternatives to a JSON-compatible object.
     * @returns {Object} The serialized alternatives.
     */
    toJSON() {
        log(6, 'Alternatives: toJSON called');
        return {
            messages: this.messages.map(msg => msg ? msg.toJSON() : null),
            activeMessageIndex: this.activeMessageIndex
        };
    }
}

/**
 * @class Chatlog
 * Manages the entire chat history as a tree of alternatives.
 */
class Chatlog {
    constructor() {
        log(5, 'Chatlog: Constructor called');
        this.rootAlternatives = null;
    }

    /**
     * Adds a message to the chatlog.
     * @param {Object} value - The value of the message to add.
     * @returns {Message} The newly added message.
     */
    addMessage(value) {
        log(4, 'Chatlog: addMessage called with role', value?.role);
        const lastMessage = this.getLastMessage();
        if (!lastMessage) {
            this.rootAlternatives = new Alternatives();
            const msg = this.rootAlternatives.addMessage(value);
            hooks.onChatUpdated.forEach(fn => fn(this));
            return msg;
        }
        if (lastMessage.value === null) {
            lastMessage.value = value;
            hooks.onChatUpdated.forEach(fn => fn(this));
            return lastMessage;
        }
        lastMessage.answerAlternatives = new Alternatives();
        const msg = lastMessage.answerAlternatives.addMessage(value);
        hooks.onChatUpdated.forEach(fn => fn(this));
        return msg;
    }

    /**
     * Gets the position of a message in the active path.
     * @param {Message} message - The message to find.
     * @returns {number} The position of the message.
     */
    getMessagePos(message) {
        log(5, 'Chatlog: getMessagePos called');
        let pos = 0;
        let current = this.rootAlternatives;
        while (current) {
            const activeMessage = current.getActiveMessage();
            if (!activeMessage || !activeMessage.answerAlternatives || activeMessage === message) return pos;
            current = activeMessage.answerAlternatives;
            pos++;
        }
        return 0;
    }

    /**
     * Gets the first message in the active path.
     * @returns {Message | null} The first message.
     */
    getFirstMessage() {
        log(5, 'Chatlog: getFirstMessage called');
        return this.rootAlternatives ? this.rootAlternatives.getActiveMessage() : null;
    }

    /**
     * Gets the last message in the active path.
     * @returns {Message | null} The last message.
     */
    getLastMessage() {
        log(5, 'Chatlog: getLastMessage called');
        const lastAlternatives = this.getLastAlternatives();
        return lastAlternatives ? lastAlternatives.getActiveMessage() : null;
    }

    /**
     * Gets the nth message in the active path.
     * @param {number} n - The index of the message to get.
     * @returns {Message | null} The nth message.
     */
    getNthMessage(n) {
        log(5, 'Chatlog: getNthMessage called for n', n);
        const alternatives = this.getNthAlternatives(parseInt(n));
        return alternatives ? alternatives.getActiveMessage() : null;
    }

    /**
     * Gets the alternatives at the nth position in the active path.
     * @param {number} n - The index of the alternatives to get.
     * @returns {Alternatives | null} The nth alternatives.
     */
    getNthAlternatives(n) {
        log(5, 'Chatlog: getNthAlternatives called for n', n);
        let pos = 0;
        let current = this.rootAlternatives;
        while (current) {
            if (pos >= n) return current;
            const activeMessage = current.getActiveMessage();
            if (!activeMessage || !activeMessage.answerAlternatives) break;
            current = activeMessage.answerAlternatives;
            pos++;
        }
        return null;
    }

    /**
     * Gets the last set of alternatives in the active path.
     * @returns {Alternatives | null} The last alternatives.
     */
    getLastAlternatives() {
        log(5, 'Chatlog: getLastAlternatives called');
        let current = this.rootAlternatives;
        let last = current;
        while (current) {
            last = current;
            const activeMessage = current.getActiveMessage();
            if (!activeMessage || !activeMessage.answerAlternatives) break;
            current = activeMessage.answerAlternatives;
        }
        return last;
    }

    /**
     * Returns an array of active message values along the path.
     * @returns {Array<Object>} The active message values.
     */
    getActiveMessageValues() {
        log(5, 'Chatlog: getActiveMessageValues called');
        const result = [];
        let message = this.getFirstMessage();
        while (message && message.value) {
            result.push(message.value);
            message = message.getAnswerMessage();
        }
        return result;
    }

    /**
     * Loads the chatlog from serialized alternatives data.
     * @param {Object} alternativesData - The serialized alternatives data.
     */
    load(alternativesData) {
        log(5, 'Chatlog: load called');
        let msgCount = 0;
        const buildAlternatives = (data) => {
            if (!data) return null;
            const alt = new Alternatives();
            alt.activeMessageIndex = data.activeMessageIndex;
            data.messages.forEach(parsedMsg => {
                if (!parsedMsg) return;
                const msg = new Message(parsedMsg.value);
                msg.metadata = parsedMsg.metadata;
                msg.answerAlternatives = buildAlternatives(parsedMsg.answerAlternatives);
                alt.messages.push(msg);
                msgCount++;
            });
            return alt;
        };
        this.rootAlternatives = buildAlternatives(alternativesData);
        this.clean();
        log(3, 'Chatlog: Loaded with message count', msgCount);
        hooks.onChatUpdated.forEach(fn => fn(this));
    }

    /**
     * Removes messages with null values (incomplete messages).
     */
    clean() {
        log(4, 'Chatlog: clean called');
        if (!this.rootAlternatives) return;
        const badMessages = [];
        const stack = [this.rootAlternatives];
        while (stack.length > 0) {
            const alt = stack.pop();
            alt.messages.forEach(msg => {
                if (msg.value === null || (msg.value && msg.value.content === null)) {
                    badMessages.push(msg);
                }
                if (msg.answerAlternatives) stack.push(msg.answerAlternatives);
            });
        }
        badMessages.forEach(msg => this.deleteMessage(msg));
        hooks.onChatUpdated.forEach(fn => fn(this));
    }

    /**
     * Clears all caches in the chatlog.
     */
    clearCache() {
        log(4, 'Chatlog: clearCache called');
        this.load(this.rootAlternatives);
    }

    /**
     * Finds the Alternatives object that contains the given message.
     * @param {Message} messageToFind - The message to find.
     * @returns {Alternatives | null} The Alternatives object or null if not found.
     */
    findAlternativesForMessage(messageToFind) {
        if (!this.rootAlternatives) return null;
        const stack = [this.rootAlternatives];
        while (stack.length > 0) {
            const alts = stack.pop();
            if (alts.messages.includes(messageToFind)) {
                return alts;
            }
            alts.messages.forEach(msg => {
                if (msg.answerAlternatives) {
                    stack.push(msg.answerAlternatives);
                }
            });
        }
        return null;
    }

    /**
     * Finds the parent message of a given Alternatives object.
     * @param {Alternatives} alternativesToFind - The alternatives object to find the parent of.
     * @returns {Message | null} The parent message or null if it's the root.
     */
    findParentOfAlternatives(alternativesToFind) {
        if (!this.rootAlternatives || this.rootAlternatives === alternativesToFind) {
            return null;
        }
        const stack = [this.rootAlternatives];
        while (stack.length > 0) {
            const alts = stack.pop();
            for (const msg of alts.messages) {
                if (msg.answerAlternatives === alternativesToFind) {
                    return msg;
                }
                if (msg.answerAlternatives) {
                    stack.push(msg.answerAlternatives);
                }
            }
        }
        return null;
    }

    /**
     * Deletes a specific message from the chatlog and all subsequent messages.
     * @param {Message} message - The message object to delete.
     */
    deleteMessage(message) {
        log(4, 'Chatlog: deleteMessage called for', message);
        const alternatives = this.findAlternativesForMessage(message);
        if (!alternatives) return;

        const index = alternatives.messages.indexOf(message);
        if (index === -1) return;

        alternatives.messages.splice(index, 1);

        if (alternatives.messages.length === 0) {
            const parent = this.findParentOfAlternatives(alternatives);
            if (parent) {
                parent.answerAlternatives = null;
            } else if (alternatives === this.rootAlternatives) {
                this.rootAlternatives = null;
            }
        } else {
            if (alternatives.activeMessageIndex === index) {
                alternatives.activeMessageIndex = Math.max(0, alternatives.messages.length - 1);
            } else if (alternatives.activeMessageIndex > index) {
                alternatives.activeMessageIndex--;
            }
        }

        alternatives.clearCache();
        hooks.onChatUpdated.forEach(fn => fn(this));
    }

    /**
     * Deletes only the message at the nth position, preserving subsequent messages by relinking.
     * @param {number} pos - The position of the message to delete.
     */
    deleteNthMessage(pos) {
        log(4, 'Chatlog: deleteNthMessage called for pos', pos);
        const msgToDelete = this.getNthMessage(pos);
        if (!msgToDelete) return;

        const childAlternatives = msgToDelete.answerAlternatives;

        if (pos === 0) {
            // If we're deleting the root message, its children become the new root
            this.rootAlternatives = childAlternatives;
        } else {
            // If we're deleting a message in the middle, link its parent to its children
            const parentMsg = this.getNthMessage(pos - 1);
            if (parentMsg) {
                parentMsg.answerAlternatives = childAlternatives;
            }
        }
        hooks.onChatUpdated.forEach(fn => fn(this));
    }

    /**
     * Cycles through the alternative messages for a given message.
     * @param {Message} message - The message whose alternatives to cycle.
     * @param {'next' | 'prev'} direction - The direction to cycle.
     */
    cycleAlternatives(message, direction) {
        log(4, `Chatlog: cycleAlternatives called for`, message, `direction: ${direction}`);
        const alternatives = this.findAlternativesForMessage(message);
        if (!alternatives) return;

        if (direction === 'next') {
            alternatives.next();
        } else if (direction === 'prev') {
            alternatives.prev();
        }

        hooks.onChatUpdated.forEach(fn => fn(this));
    }

    /**
     * Adds a new alternative message at the same level as the given message.
     * @param {Message} message - The message to add an alternative to.
     * @param {Object} newValue - The value for the new message.
     * @returns {Message} The newly created message.
     */
    addAlternative(message, newValue) {
        log(4, `Chatlog: addAlternative called for`, message);
        const alternatives = this.findAlternativesForMessage(message);
        if (!alternatives) return null;

        const newMessage = alternatives.addMessage(newValue);
        hooks.onChatUpdated.forEach(fn => fn(this));
        return newMessage;
    }

    /**
     * Serializes the chatlog to a JSON-compatible object.
     * @returns {Object} The serialized chatlog.
     */
    toJSON() {
        log(5, 'Chatlog: toJSON called');
        return this.rootAlternatives ? this.rootAlternatives.toJSON() : null;
    }
}

export { Chatlog, Message, Alternatives };
