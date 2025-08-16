/**
 * @fileoverview Utility functions for chat management.
 */

'use strict';

import { log } from './logger.js';
import { Message } from '../components/chatlog.js';

/**
 * Generates a string with the current date and time prompt.
 * @returns {string} The formatted date and time prompt.
 */
export function getDatePrompt() {
    const now = new Date();
    return `\n\nKnowledge cutoff: none\nCurrent date: ${now.toISOString().slice(0, 10)}\nCurrent time: ${now.toTimeString().slice(0, 5)}`;
}

/**
 * Resets the editing state of a message in the chat.
 * If a new message was being composed, it's discarded.
 * If an existing message was being edited, it's restored.
 * @param {import('../state/store.js').default} store - The application's state store.
 * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog instance.
 * @param {import('../components/chatbox.js').Chatbox} chatbox - The chatbox instance.
 */
export function resetEditing(store, chatlog, chatbox) {
    const currentEditingPos = store.get('editingPos');
    if (currentEditingPos !== null) {
        const prevMsg = chatlog.getNthMessage(currentEditingPos);
        if (prevMsg) {
            if (prevMsg.value.content === null) {
                chatlog.deleteMessage(prevMsg); // Discard uncommitted new alternative
            } else {
                prevMsg.cache = null; // Restore original for previous edit
            }
        }
        store.set('editingPos', null);
        chatbox.update(false);
    }
}

/**
 * Adds a new message to the chat log.
 * This is the preferred way to add a message to the chat log.
 * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog to add the message to.
 * @param {Object} value - The value of the message to add.
 * @returns {Message} The newly added message.
 */
export function addMessageToChat(chatlog, value) {
    log(4, 'addMessageToChat called with value', value);
    const message = chatlog.addMessage(value);
    chatlog.notify();
    return message;
}

/**
 * Adds a new alternative to an existing message.
 * This is the preferred way to add an alternative message.
 * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog instance.
 * @param {Message | null} existingMessage - The message to add an alternative to. If null, the last message is used.
 * @param {Object} newValue - The value for the new alternative message.
 * @returns {Message | null} The newly created alternative message, or null if no target message was found.
 */
export function addAlternativeToChat(chatlog, existingMessage, newValue) {
    log(4, 'addAlternativeToChat called for', existingMessage);
    const targetMessage = existingMessage || chatlog.getLastMessage();
    if (!targetMessage) {
        log(2, "addAlternativeToChat: Cannot add alternative, no message found.");
        return null;
    }
    const newMessage = chatlog.addAlternative(targetMessage, newValue);
    chatlog.notify();
    return newMessage;
}
