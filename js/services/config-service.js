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
        this.endpoint = localStorage.getItem('gptChat_endpoint') || defaultEndpoint;
        this.apiKey = localStorage.getItem('gptChat_apiKey') || '';
        this.model = localStorage.getItem('gptChat_model') || '';
        this.store.set('apiKey', this.apiKey);
    }

    /**
     * Gets the API endpoint.
     * @returns {string} The API endpoint.
     */
    getEndpoint() {
        return this.endpoint;
    }

    /**
     * Sets the API endpoint.
     * @param {string} endpoint - The new API endpoint.
     */
    setEndpoint(endpoint) {
        log(3, 'ConfigService: setEndpoint called');
        this.endpoint = endpoint;
        localStorage.setItem('gptChat_endpoint', endpoint);
    }

    /**
     * Gets the API key.
     * @returns {string} The API key.
     */
    getApiKey() {
        return this.apiKey;
    }

    /**
     * Sets the API key.
     * @param {string} apiKey - The new API key.
     */
    setApiKey(apiKey) {
        log(3, 'ConfigService: setApiKey called');
        this.apiKey = apiKey;
        localStorage.setItem('gptChat_apiKey', apiKey);
        this.store.set('apiKey', apiKey);
    }

    /**
     * Gets the selected model.
     * @returns {string} The selected model.
     */
    getModel() {
        return this.model;
    }

    /**
     * Sets the selected model.
     * @param {string} model - The new selected model.
     */
    setModel(model) {
        log(3, 'ConfigService: setModel called');
        this.model = model;
        localStorage.setItem('gptChat_model', model);
    }
}

export default ConfigService;
