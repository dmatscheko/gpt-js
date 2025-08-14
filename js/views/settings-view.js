'use strict';

import { log, showLogin, showLogout } from '../utils.js';
import { defaultEndpoint } from '../config.js';
import { hooks } from '../hooks.js';

/**
 * @class SettingsView
 * Manages the settings panel UI and its interactions.
 */
class SettingsView {
    /**
     * @param {import('../store.js').default} store - The application's state store.
     * @param {import('../services/api-service.js').default} apiService - The API service instance.
     * @param {import('../controller.js').default} controller - The main controller instance.
     */
    constructor(store, apiService, controller) {
        this.store = store;
        this.apiService = apiService;
        this.controller = controller; // For calling loadModels

        this.ui = {
            settingsButton: document.getElementById('settingsButton'),
            settingsEl: document.getElementById('settings'),
            modelsFieldset: document.getElementById('modelsFieldset'),
            temperatureEl: document.getElementById('temperature'),
            temperatureValueEl: document.getElementById('temperatureValue'),
            topPEl: document.getElementById('topP'),
            topPValueEl: document.getElementById('topPValue'),
            endpointEl: document.getElementById('endpoint'),
            apiKeyEl: document.getElementById('apiKey'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            refreshModelsBtn: document.getElementById('refreshModelsButton'),
            customModelInput: null, // will be created dynamically
        };

        this.store.subscribe('apiKey', (key) => {
            this.ui.apiKeyEl.value = key;
            if (key) {
                showLogout();
            } else {
                showLogin();
            }
        });
    }

    /**
     * Initializes the settings view by setting up event listeners and populating initial values.
     */
    init() {
        this.setUpEventListeners();
        this.ui.temperatureValueEl.textContent = this.ui.temperatureEl.value;
        this.ui.topPValueEl.textContent = this.ui.topPEl.value;
        this.ui.endpointEl.value = localStorage.getItem('gptChat_endpoint') || defaultEndpoint;

        const storedModels = localStorage.getItem('gptChat_models');
        if (storedModels) {
            try {
                this.populateModels(JSON.parse(storedModels));
            } catch(e) {
                log(1, "Could not parse stored models", e);
                this.populateModels([]);
            }
        } else {
            this.populateModels([]);
        }
    }

    /**
     * Populates the model selection list in the settings panel.
     * @param {Array<Object>} models - The array of model objects.
     */
    populateModels(models) {
        log(4, 'SettingsView: populateModels called with', models.length, 'models');
        this.ui.modelsFieldset.querySelectorAll('input[type="radio"][name="model"], label[for^="model_"], br, p').forEach(el => el.remove());

        if (!models.length) {
            const p = document.createElement('p');
            p.textContent = 'No models available.';
            this.ui.modelsFieldset.appendChild(p);
        } else {
            models.forEach(model => {
                const safeId = model.id.replace(/[^a-z0-9_-]/gi, '_');
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'model';
                input.value = model.id;
                input.id = `model_${safeId}`;
                const label = document.createElement('label');
                label.htmlFor = `model_${safeId}`;
                label.textContent = model.id;
                this.ui.modelsFieldset.appendChild(input);
                this.ui.modelsFieldset.appendChild(label);
                this.ui.modelsFieldset.appendChild(document.createElement('br'));
            });
        }

        const customInput = document.createElement('input');
        customInput.type = 'radio';
        customInput.name = 'model';
        customInput.value = 'custom';
        customInput.id = 'model_custom';
        const customLabel = document.createElement('label');
        customLabel.htmlFor = 'model_custom';
        customLabel.textContent = 'Custom: ';
        const customText = document.createElement('input');
        customText.type = 'text';
        customText.id = 'custom_model';
        customText.placeholder = 'Enter model ID';
        this.ui.customModelInput = customText;
        customLabel.appendChild(customText);
        this.ui.modelsFieldset.appendChild(customInput);
        this.ui.modelsFieldset.appendChild(customLabel);
        this.ui.modelsFieldset.appendChild(document.createElement('br'));

        const storedModel = localStorage.getItem('gptChat_model');
        if (storedModel) {
            let radio = this.ui.modelsFieldset.querySelector(`input[value="${storedModel}"]`);
            if (radio) {
                radio.checked = true;
            } else {
                customInput.checked = true;
                customText.value = storedModel;
            }
        } else {
            const defaultRadio = this.ui.modelsFieldset.querySelector('input[value="gpt-3.5-turbo"]') || this.ui.modelsFieldset.querySelector('input[name="model"]');
            if (defaultRadio) defaultRadio.checked = true;
        }

        this.ui.customModelInput.addEventListener('input', () => {
            if (customInput.checked) this.saveModelSelection();
        });
    }

    /**
     * Saves the selected model to local storage.
     */
    saveModelSelection() {
        let model = document.querySelector('input[name="model"]:checked')?.value;
        if (model === 'custom') {
            model = this.ui.customModelInput?.value.trim();
        }
        if (model) {
            localStorage.setItem('gptChat_model', model);
        }
    }

    /**
     * Sets up event listeners for the settings panel.
     */
    setUpEventListeners() {
        this.ui.settingsButton.addEventListener('click', () => {
            this.ui.settingsEl.classList.toggle('open');
            if (this.ui.settingsEl.classList.contains('open')) {
                hooks.onSettingsRender.forEach(fn => fn(this.ui.settingsEl));
            }
        });

        this.ui.temperatureEl.addEventListener('input', () => this.ui.temperatureValueEl.textContent = this.ui.temperatureEl.value);
        this.ui.topPEl.addEventListener('input', () => this.ui.topPValueEl.textContent = this.ui.topPEl.value);
        this.ui.endpointEl.addEventListener('input', () => localStorage.setItem('gptChat_endpoint', this.ui.endpointEl.value));
        this.ui.modelsFieldset.addEventListener('change', () => this.saveModelSelection());

        this.ui.refreshModelsBtn.addEventListener('click', async () => {
            await this.controller.loadModels();
        });

        this.ui.loginBtn.addEventListener('click', async () => {
            const key = this.ui.apiKeyEl.value.trim();
            localStorage.setItem('gptChat_apiKey', key);
            this.store.set('apiKey', key);
            localStorage.setItem('gptChat_endpoint', this.ui.endpointEl.value);
            if (await this.controller.loadModels()) {
                showLogout();
            }
        });

        this.ui.logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('gptChat_apiKey');
            localStorage.removeItem('gptChat_models');
            this.store.set('apiKey', '');
            this.ui.endpointEl.value = defaultEndpoint;
            localStorage.setItem('gptChat_endpoint', defaultEndpoint);
            this.populateModels([]);
        });
    }
}

export default SettingsView;
