'use strict';

import { hooks } from './hooks.js';
import { log } from './utils.js';

// Reactive state store with pub-sub for changes.
class Store {
    constructor(initialState) {
        log(5, 'Store: Constructor called with initialState', initialState);
        this.state = initialState;
        this.subscribers = {};
    }

    get(key) {
        log(5, 'Store: get called for key', key);
        return this.state[key];
    }

    getState() {
        log(5, 'Store: getState called');
        return { ...this.state };
    }

    set(key, value) {
        log(5, 'Store: set called for key', key, 'value', value);
        this.state[key] = value;
        if (this.subscribers[key]) {
            this.subscribers[key].forEach(cb => cb(value));
        }
        hooks.onStateChange.forEach(fn => fn(key, value));
    }

    subscribe(key, cb) {
        log(5, 'Store: subscribe called for key', key);
        if (!this.subscribers[key]) this.subscribers[key] = [];
        this.subscribers[key].push(cb);
    }

    unsubscribe(key, cb) {
        log(5, 'Store: unsubscribe called for key', key);
        if (!this.subscribers[key]) return;
        this.subscribers[key] = this.subscribers[key].filter(subCb => subCb !== cb);
        if (this.subscribers[key].length === 0) delete this.subscribers[key];
    }
}

export default Store;
