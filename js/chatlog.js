'use strict';

// Represents a single message in the chatlog.
class Message {
    constructor(value) {
        this.value = value;
        this.metadata = null;
        this.cache = null;
        this.answerAlternatives = null;
    }

    // Retrieves the active answer message if alternatives exist.
    getAnswerMessage() {
        return this.answerAlternatives ? this.answerAlternatives.getActiveMessage() : null;
    }

    // Serializes the message to JSON.
    toJSON() {
        return {
            value: this.value,
            metadata: this.metadata,
            answerAlternatives: this.answerAlternatives
        };
    }
}

// Manages alternative messages at a given point in the chatlog.
class Alternatives {
    constructor() {
        this.messages = [];
        this.activeMessageIndex = -1;
    }

    // Adds a new message or updates the active one if it's null.
    addMessage(value) {
        const current = this.getActiveMessage();
        if (current && current.value === null) {
            current.value = value;
            return current;
        }
        this.clearCache();
        const newMessage = new Message(value);
        this.activeMessageIndex = this.messages.push(newMessage) - 1;
        return newMessage;
    }

    // Sets the active message by value.
    setActiveMessage(value) {
        const index = this.messages.findIndex(msg => msg.value === value);
        if (index !== -1) this.activeMessageIndex = index;
    }

    // Gets the currently active message.
    getActiveMessage() {
        return this.activeMessageIndex !== -1 ? this.messages[this.activeMessageIndex] || null : null;
    }

    // Cycles to the next alternative message.
    next() {
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
            this.clearCache();
        }
        this.activeMessageIndex = (this.activeMessageIndex + 1) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    // Cycles to the previous alternative message.
    prev() {
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
            this.clearCache();
        }
        this.activeMessageIndex = (this.activeMessageIndex - 1 + this.messages.length) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    // Clears the cache for all messages in this set of alternatives.
    clearCache() {
        this.messages.forEach(msg => { if (msg) msg.cache = null; });
    }
}

// Manages the entire chat history as a tree of alternatives.
class Chatlog {
    constructor() {
        this.rootAlternatives = null;
    }

    // Adds a message to the chatlog, creating alternatives if needed.
    addMessage(value) {
        const lastMessage = this.getLastMessage();
        if (!lastMessage) {
            this.rootAlternatives = new Alternatives();
            return this.rootAlternatives.addMessage(value);
        }
        if (lastMessage.value === null) {
            lastMessage.value = value;
            return lastMessage;
        }
        lastMessage.answerAlternatives = new Alternatives();
        return lastMessage.answerAlternatives.addMessage(value);
    }

    // Gets the first message in the active path.
    getFirstMessage() {
        return this.rootAlternatives ? this.rootAlternatives.getActiveMessage() : null;
    }

    // Gets the last message in the active path.
    getLastMessage() {
        const lastAlternatives = this.getLastAlternatives();
        return lastAlternatives ? lastAlternatives.getActiveMessage() : null;
    }

    // Gets the nth message in the active path.
    getNthMessage(n) {
        const alternatives = this.getNthAlternatives(parseInt(n));
        return alternatives ? alternatives.getActiveMessage() : null;
    }

    // Gets the alternatives at the nth position in the active path.
    getNthAlternatives(n) {
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

    // Gets the last set of alternatives in the active path.
    getLastAlternatives() {
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

    // Returns an array of active message values along the path.
    getActiveMessageValues() {
        const result = [];
        let message = this.getFirstMessage();
        while (message && message.value) {
            result.push(message.value);
            message = message.getAnswerMessage();
        }
        return result;
    }

    // Loads the chatlog from serialized alternatives data.
    load(alternativesData) {
        let msgCount = 0;
        const buildAlternatives = (data) => {
            if (!data) return null;
            const alt = new Alternatives();
            alt.activeMessageIndex = data.activeMessageIndex;
            data.messages.forEach(parsedMsg => {
                const msg = new Message(parsedMsg.value);
                msg.metadata = parsedMsg.metadata;
                msg.answerAlternatives = buildAlternatives(parsedMsg.answerAlternatives);
                alt.messages.push(msg);
                msgCount++;
            });
            return alt;
        };
        this.rootAlternatives = buildAlternatives(alternativesData);
    }

    // Clears all caches in the chatlog by reloading the structure.
    clearCache() {
        this.load(this.rootAlternatives);
    }
}
