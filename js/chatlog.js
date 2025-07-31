'use strict';

class Message {
    constructor(value) {
        this.value = value;
        this.metadata = null;
        this.cache = null;
        this.answerAlternatives = null;
    }

    getAnswerMessage() {
        return this.answerAlternatives ? this.answerAlternatives.getActiveMessage() : null;
    }

    toJSON() {
        return {
            value: this.value,
            metadata: this.metadata,
            answerAlternatives: this.answerAlternatives
        };
    }
}

class Alternatives {
    constructor() {
        this.messages = [];
        this.activeMessageIndex = -1;
    }

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

    setActiveMessage(value) {
        const index = this.messages.findIndex(msg => msg.value === value);
        if (index !== -1) this.activeMessageIndex = index;
    }

    getActiveMessage() {
        return this.activeMessageIndex !== -1 ? this.messages[this.activeMessageIndex] || null : null;
    }

    next() {
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
            this.clearCache();
        }
        this.activeMessageIndex = (this.activeMessageIndex + 1) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    prev() {
        if (this.activeMessageIndex === -1) return null;
        if (!this.messages[this.activeMessageIndex] || this.messages[this.activeMessageIndex].value === null) {
            this.messages.splice(this.activeMessageIndex, 1);
            this.clearCache();
        }
        this.activeMessageIndex = (this.activeMessageIndex - 1 + this.messages.length) % this.messages.length;
        return this.messages[this.activeMessageIndex];
    }

    clearCache() {
        this.messages.forEach(msg => { if (msg) msg.cache = null; });
    }
}

class Chatlog {
    constructor() {
        this.rootAlternatives = null;
    }

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

    getFirstMessage() {
        return this.rootAlternatives ? this.rootAlternatives.getActiveMessage() : null;
    }

    getLastMessage() {
        const lastAlternatives = this.getLastAlternatives();
        return lastAlternatives ? lastAlternatives.getActiveMessage() : null;
    }

    getNthMessage(n) {
        const alternatives = this.getNthAlternatives(parseInt(n));
        return alternatives ? alternatives.getActiveMessage() : null;
    }

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

    getActiveMessageValues() {
        const result = [];
        let message = this.getFirstMessage();
        while (message && message.value) {
            result.push(message.value);
            message = message.getAnswerMessage();
        }
        return result;
    }

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

    clearCache() {
        this.load(this.rootAlternatives);  // Rebuild to clear caches.
    }
}
