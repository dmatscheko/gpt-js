/**
 * @fileoverview The SettingsPanel component provides the UI for application settings.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';
import { hooks } from '../hooks.js';

/**
 * @class SettingsPanel
 * Manages the settings panel UI.
 */
class SettingsPanel {
    /**
     * @param {Object} options - The options for the settings panel.
     * @param {Function} options.configService - The configuration service.
     * @param {Function} options.app - The main app object.
     */
    constructor({ configService, app }) {
        this.configService = configService;
        this.app = app;

        this.ui = {
            settingsEl: document.getElementById('settings'),
            settingsButton: document.getElementById('settingsButton'),
            endpointEl: document.getElementById('endpoint'),
            apiKeyEl: document.getElementById('apiKey'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
        };

        this.init();
    }

    /**
     * Initializes the settings panel by setting up event listeners.
     */
    init() {
        log(3, 'SettingsPanel: init called');
        this.ui.settingsButton.addEventListener('click', () => this.toggle());

        // Other Buttons
        this.ui.loginBtn.addEventListener('click', () => this.handleLogin());
        this.ui.logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    /**
     * Toggles the visibility of the settings panel.
     */
    toggle(state = 'toggle') {
        let isOpen;
        switch (state) {
            case 'open':
                this.ui.settingsEl.classList.add('open');
                isOpen = true;
                break;
            case 'close':
                this.ui.settingsEl.classList.remove('open');
                break;
            case 'toggle':
            default:
                isOpen = this.ui.settingsEl.classList.toggle('open');
                break;
        }
        if (isOpen) {
            const globalSettings = this.configService.getModelSettings();
            // Pass null for chatId and agentId to indicate global scope
            const container = document.getElementById('global-model-settings-container');
            hooks.onModelSettingsRender.forEach(fn => fn(container, globalSettings, null, null));
        }
    }

    /**
     * Handles the login button click.
     */
    handleLogin() {
        log(4, 'SettingsPanel: handleLogin called');
        const apiKey = this.ui.apiKeyEl.value.trim();
        const endpoint = this.ui.endpointEl.value.trim();
        if (!endpoint) {
            triggerError('Please enter an API Endpoint.');
            return;
        }
        if (apiKey) {
            this.configService.setItem('apiKey', apiKey);
        } else {
            this.configService.removeItem('apiKey');
        }
        if (endpoint) {
            this.configService.setItem('endpoint', endpoint);
        } else {
            this.configService.removeItem('endpoint');
        }
        this.app.handleLogin();
    }

    /**
     * Handles the logout button click.
     */
    handleLogout() {
        this.ui.apiKeyEl.value = '';
        this.ui.endpointEl.value = '';
        this.configService.removeItem('apiKey');
        this.configService.removeItem('endpoint');
        this.app.handleLogin();
        hooks.onLogout.forEach(fn => fn(this.ui.settingsEl));
    }

    /**
     * Sets the API key in the input field.
     * @param {string} apiKey - The API key to set.
     */
    setApiKey(apiKey) {
        this.ui.apiKeyEl.value = apiKey;
    }

    /**
     * Sets the endpoint in the input field.
     * @param {string} endpoint - The endpoint to set.
     */
    setEndpoint(endpoint) {
        this.ui.endpointEl.value = endpoint;
    }

}

export default SettingsPanel;
