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
export function resetEditing(store, chatlog) {
    const currentEditingPos = store.get('editingPos');
    if (currentEditingPos !== null) {
        const prevMsg = chatlog?.getNthMessage(currentEditingPos);
        if (prevMsg) {
            if (prevMsg.value.content === null) {
                chatlog.deleteMessage(prevMsg); // Discard uncommitted new alternative
            } else {
                prevMsg.cache = null; // Restore original for previous edit
            }
        }
        store.set('editingPos', null);
        // The caller is now responsible for updating the UI
    }
}
