/**
 * @fileoverview Service for managing application configuration.
 */

'use strict';

import { defaultEndpoint } from '../config.js';
import { log } from '../utils/logger.js';

/**
 * @class ConfigService
 * Manages application configuration, such as API endpoint, key, and model.
 */
class ConfigService {
    /**
     * @param {import('../state/store.js').default} store - The application's state store.
     */
    constructor(store) {
        this.store = store;
    }

    /**
     * Gets an item from localStorage.
     * @param {string} key - The key of the item.
     * @param {*} defaultValue - The default value if the item doesn't exist.
     * @returns {*} The value from localStorage or the default value.
     */
    getItem(key, defaultValue) {
        const value = localStorage.getItem(`aiflow-chat_${key}`);
        return value !== null ? value : defaultValue;
    }

    /**
     * Sets an item in localStorage.
     * @param {string} key - The key of the item.
     * @param {*} value - The value to set.
     */
    setItem(key, value) {
        localStorage.setItem(`aiflow-chat_${key}`, value);
    }

    /**
     * Removes an item from localStorage.
     * @param {string} key - The key of the item to remove.
     */
    removeItem(key) {
        localStorage.removeItem(`aiflow-chat_${key}`);
    }

    /**
     * Gets all model-related settings as an object by using hooks.
     * @returns {Object} An object containing all model settings.
     */
    getModelSettings() {
        const settings = {};
        hooks.onGetModelSettings.forEach(fn => fn(settings));
        return settings;
    }

    /**
     * Updates multiple model-related settings from an object by using hooks.
     * @param {Object} settings - An object containing settings to update.
     */
    updateModelSettings(settings) {
        Object.entries(settings).forEach(([key, value]) => {
            hooks.onUpdateModelSettings.forEach(fn => fn(key, value));
        });
    }
}

export default ConfigService;
