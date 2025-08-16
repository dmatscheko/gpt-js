/**
 * @fileoverview The SettingsPanel component provides the UI for application settings.
 */

'use strict';

import { log, triggerError } from '../utils/logger.js';

/**
 * @class SettingsPanel
 * Manages the settings panel UI.
 */
class SettingsPanel {
    /**
     * @param {Object} options - The options for the settings panel.
     * @param {Function} options.onApiKeyChange - Callback for when the API key changes.
     * @param {Function} options.onEndpointChange - Callback for when the endpoint changes.
     * @param {Function} options.onRefreshModels - Callback for when the refresh models button is clicked.
     * @param {Function} options.onModelChange - Callback for when the model changes.
     */
    constructor({ onApiKeyChange, onEndpointChange, onRefreshModels, onModelChange }) {
        this.onApiKeyChange = onApiKeyChange;
        this.onEndpointChange = onEndpointChange;
        this.onRefreshModels = onRefreshModels;
        this.onModelChange = onModelChange;

        this.ui = {
            settingsEl: document.getElementById('settings'),
            settingsButton: document.getElementById('settingsButton'),
            modelsFieldset: document.getElementById('modelsFieldset'),
            customModelInput: document.getElementById('customModel'),
            temperatureEl: document.getElementById('temperature'),
            temperatureValue: document.getElementById('temperatureValue'),
            topPEl: document.getElementById('topP'),
            topPValue: document.getElementById('topPValue'),
            seedEl: document.getElementById('seed'),
            seedValue: document.getElementById('seedValue'),
            endpointEl: document.getElementById('endpoint'),
            apiKeyEl: document.getElementById('apiKey'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            refreshModelsButton: document.getElementById('refreshModelsButton'),
        };

        this.init();
    }

    /**
     * Initializes the settings panel by setting up event listeners.
     */
    init() {
        log(3, 'SettingsPanel: init called');
        this.ui.settingsButton.addEventListener('click', () => this.toggle());
        this.ui.temperatureEl.addEventListener('input', () => this.updateSliderValues());
        this.ui.topPEl.addEventListener('input', () => this.updateSliderValues());
        this.ui.seedEl.addEventListener('input', () => this.updateSliderValues());
        this.ui.loginBtn.addEventListener('click', () => this.handleLogin());
        this.ui.logoutBtn.addEventListener('click', () => this.handleLogout());
        this.ui.refreshModelsButton.addEventListener('click', () => this.onRefreshModels());
        this.ui.modelsFieldset.addEventListener('change', (e) => {
            if (e.target.name === 'model') {
                this.handleModelChange();
            }
        });

        this.updateSliderValues();
    }

    /**
     * Toggles the visibility of the settings panel.
     */
    toggle() {
        this.ui.settingsEl.classList.toggle('open');
    }

    /**
     * Updates the displayed values for the temperature and top-p sliders.
     */
    updateSliderValues() {
        this.ui.temperatureValue.textContent = this.ui.temperatureEl.value;
        this.ui.topPValue.textContent = this.ui.topPEl.value;
        const seed = this.ui.seedEl.value;
        this.ui.seedValue.textContent = seed === '0' ? 'off' : seed;
    }

    /**
     * Gets the current seed value.
     * @returns {number|null} The seed value, or null if not set.
     */
    getSeed() {
        const seed = this.ui.seedEl.value;
        return seed === '0' ? null : parseInt(seed, 10);
    }

    /**
     * Handles the login button click.
     */
    handleLogin() {
        log(4, 'SettingsPanel: handleLogin called');
        const apiKey = this.ui.apiKeyEl.value.trim();
        log(4, 'SettingsPanel: apiKeyEl.value is', apiKey);
        const endpoint = this.ui.endpointEl.value.trim();
        if (!endpoint) {
            triggerError('Please enter an API Endpoint.');
            return;
        }
        this.onApiKeyChange(apiKey);
        this.onEndpointChange(endpoint);
        this.toggle();
    }

    /**
     * Handles the logout button click.
     */
    handleLogout() {
        this.ui.apiKeyEl.value = '';
        this.onApiKeyChange('');
    }

    /**
     * Handles the model change event.
     */
    handleModelChange() {
        let model = document.querySelector('input[name="model"]:checked')?.value;
        if (model === 'custom') {
            model = this.ui.customModelInput?.value.trim();
        }
        if (model) {
            this.onModelChange(model);
        }
    }

    /**
     * Populates the models list in the settings panel.
     * @param {Array<Object>} models - The list of models to populate.
     */
    populateModels(models) {
        log(3, 'SettingsPanel: populateModels called');
        // Clear existing models, but keep the legend
        const legend = this.ui.modelsFieldset.querySelector('legend');
        this.ui.modelsFieldset.innerHTML = '';
        if (legend) {
            this.ui.modelsFieldset.appendChild(legend);
        }

        models.forEach(model => {
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.id = model.id;
            radio.name = 'model';
            radio.value = model.id;
            const label = document.createElement('label');
            label.htmlFor = model.id;
            label.textContent = model.id;
            this.ui.modelsFieldset.appendChild(radio);
            this.ui.modelsFieldset.appendChild(label);
            this.ui.modelsFieldset.appendChild(document.createElement('br'));
        });

        // Add custom model option
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = 'customModel';
        radio.name = 'model';
        radio.value = 'custom';
        const label = document.createElement('label');
        label.htmlFor = 'customModel';
        label.textContent = 'Custom:';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'customModelInput';
        input.placeholder = 'Enter model ID';
        this.ui.modelsFieldset.appendChild(radio);
        this.ui.modelsFieldset.appendChild(label);
        this.ui.modelsFieldset.appendChild(input);
    }

    /**
     * Sets the selected model in the UI.
     * @param {string} modelId - The ID of the model to select.
     */
    setSelectedModel(modelId) {
        const modelRadio = this.ui.modelsFieldset.querySelector(`input[value="${modelId}"]`);
        if (modelRadio) {
            modelRadio.checked = true;
        } else {
            const customRadio = this.ui.modelsFieldset.querySelector('input[value="custom"]');
            if (customRadio) {
                customRadio.checked = true;
                const customInput = this.ui.modelsFieldset.querySelector('#customModelInput');
                if (customInput) {
                    customInput.value = modelId;
                }
            }
        }
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
