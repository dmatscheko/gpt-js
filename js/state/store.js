/**
 * @fileoverview A simple reactive state store with a pub-sub mechanism.
 */

'use strict';

import { hooks } from '../hooks.js';
import { log } from '../utils/logger.js';

/**
 * @class Store
 * A simple reactive state store with a pub-sub mechanism for observing changes.
 */
class Store {
    /**
     * @param {Object} initialState - The initial state of the store.
     */
    constructor(initialState) {
        log(5, 'Store: Constructor called with initialState', initialState);
        this.state = initialState;
        this.subscribers = {};
    }

    /**
     * Gets a value from the store by key.
     * @param {string} key - The key of the value to get.
     * @returns {*} The value associated with the key.
     */
    get(key) {
        log(5, 'Store: get called for key', key);
        return this.state[key];
    }

    /**
     * Gets a shallow copy of the entire state object.
     * @returns {Object} A copy of the state.
     */
    getState() {
        log(5, 'Store: getState called');
        return { ...this.state };
    }

    /**
     * Sets a value in the store and notifies subscribers.
     * @param {string} key - The key of the value to set.
     * @param {*} value - The value to set.
     */
    set(key, value) {
        log(5, 'Store: set called for key', key, 'value', value);
        this.state[key] = value;
        if (this.subscribers[key]) {
            this.subscribers[key].forEach(cb => cb(value));
        }
        hooks.onStateChange.forEach(fn => fn(key, value));
    }

    /**
     * Subscribes to changes for a specific key.
     * @param {string} key - The key to subscribe to.
     * @param {Function} cb - The callback to execute when the value changes.
     */
    subscribe(key, cb) {
        log(5, 'Store: subscribe called for key', key);
        if (!this.subscribers[key]) this.subscribers[key] = [];
        this.subscribers[key].push(cb);
    }

    /**
     * Unsubscribes from changes for a specific key.
     * @param {string} key - The key to unsubscribe from.
     * @param {Function} cb - The callback to remove.
     */
    unsubscribe(key, cb) {
        log(5, 'Store: unsubscribe called for key', key);
        if (!this.subscribers[key]) return;
        this.subscribers[key] = this.subscribers[key].filter(subCb => subCb !== cb);
        if (this.subscribers[key].length === 0) delete this.subscribers[key];
    }
}

export default Store;
