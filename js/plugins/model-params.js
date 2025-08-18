'use strict';

import { log } from '../utils/logger.js';
import { hooks } from '../hooks.js';

// Helper function to get the correct storage for settings
function getStorage(configService, chatService, chatId, agentId) {
    if (agentId) {
        const chat = chatService.chats.find(c => c.id === chatId);
        const agent = chat?.agents?.find(a => a.id === agentId);
        if (agent) {
            if (!agent.modelSettings) agent.modelSettings = {};
            return agent.modelSettings;
        }
    }
    if (chatId) {
        const chat = chatService.chats.find(c => c.id === chatId);
        if (chat) {
            if (!chat.modelSettings) chat.modelSettings = {};
            return chat.modelSettings;
        }
    }
    // For global settings, return the configService itself.
    return configService;
}

function populateModelList(fieldset, idSuffix, currentModel, configService) {
    // Clear existing model radio buttons, but keep the legend
    const legend = fieldset.querySelector('legend');
    fieldset.innerHTML = '';
    if (legend) {
        fieldset.appendChild(legend);
    }

    const models = JSON.parse(configService.getItem('models', '[]'));
    models.forEach(model => {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = `${model.id}${idSuffix}`;
        radio.name = `model${idSuffix}`;
        radio.value = model.id;
        const label = document.createElement('label');
        label.htmlFor = `${model.id}${idSuffix}`;
        label.textContent = model.id;
        const modelRow = document.createElement('div');
        modelRow.classList.add('model-list-row');
        modelRow.appendChild(radio);
        modelRow.appendChild(label);
        fieldset.appendChild(modelRow);
    });

    if (models.length > 0 && currentModel) {
        const modelRadio = fieldset.querySelector(`input[value="${currentModel}"]`);
        if (modelRadio) modelRadio.checked = true;
    }
}


export const modelParamsPlugin = {
    id: 'model-params',
    name: 'Model Parameters',
    description: 'Manages model parameters (model, temperature, top_p, seed) and their UI.',
    init: function(app) {
        this.app = app;
        this.configService = app.configService;
        this.chatService = app.chatService;

        // Bind 'this' for hooks that need access to the plugin instance
        this.hooks.onModelSettingsRender = this.hooks.onModelSettingsRender.bind(this);
        this.hooks.onModelSettingsChanged = this.hooks.onModelSettingsChanged.bind(this);
        this.hooks.onGetModelSettings = this.hooks.onGetModelSettings.bind(this);
        this.hooks.onUpdateModelSettings = this.hooks.onUpdateModelSettings.bind(this);
    },
    hooks: {
        onModelSettingsRender: function(modelSettingsEl, modelSettings, chatId, agentId) {
            const idSuffix = chatId ? `_${chatId}` : (agentId ? `_${agentId}` : '_global');
            const containerId = `model-params-container${idSuffix}`;

            // If the container already exists, just update the model list.
            if (document.getElementById(containerId)) {
                const fieldset = document.getElementById(`modelsFieldset${idSuffix}`);
                if (fieldset) {
                    populateModelList(fieldset, idSuffix, modelSettings.model, this.configService);
                }
                return;
            }

            const container = document.createElement('div');
            container.id = containerId;
            if (agentId) {
                container.classList.add('agent-model-settings-group');
            }
            container.innerHTML = `
                <fieldset id="modelsFieldset${idSuffix}" class="model-list-fieldset">
                    <legend>Model&nbsp;<button id="refreshModelsButton${idSuffix}" title="Refresh models" class="toolButton small"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/></svg></button></legend>
                </fieldset>
                <p>
                    <label for="temperature${idSuffix}">Temperature</label>
                    <button id="resetTemperature${idSuffix}" class="toolButton small" title="Reset temperature">&#x21BA;</button><br>
                    <input type="range" id="temperature${idSuffix}" min="0" max="2.0" step="0.1">
                    <span id="temperatureValue${idSuffix}"></span>
                </p>
                <p>
                    <label for="topP${idSuffix}">Top-p (nucleus sampling)</label>
                    <button id="resetTopP${idSuffix}" class="toolButton small" title="Reset Top-p">&#x21BA;</button><br>
                    <input type="range" id="topP${idSuffix}" min="0" max="1.0" step="0.05">
                    <span id="topPValue${idSuffix}"></span>
                </p>
                <p>
                    <label for="seed${idSuffix}">Seed</label>
                    <button id="resetSeed${idSuffix}" class="toolButton small" title="Reset seed">&#x21BA;</button><br>
                    <input type="range" id="seed${idSuffix}" min="0" max="999999999" step="1">
                    <span id="seedValue${idSuffix}"></span>
                </p>
            `;
            modelSettingsEl.appendChild(container);

            const ui = {
                modelsFieldset: document.getElementById(`modelsFieldset${idSuffix}`),
                refreshModelsButton: document.getElementById(`refreshModelsButton${idSuffix}`),
                temperatureEl: document.getElementById(`temperature${idSuffix}`),
                temperatureValue: document.getElementById(`temperatureValue${idSuffix}`),
                topPEl: document.getElementById(`topP${idSuffix}`),
                topPValue: document.getElementById(`topPValue${idSuffix}`),
                seedEl: document.getElementById(`seed${idSuffix}`),
                seedValue: document.getElementById(`seedValue${idSuffix}`),
                resetTemperatureBtn: document.getElementById(`resetTemperature${idSuffix}`),
                resetTopPBtn: document.getElementById(`resetTopP${idSuffix}`),
                resetSeedBtn: document.getElementById(`resetSeed${idSuffix}`),
            };

            // Set initial values
            ui.temperatureEl.value = modelSettings.temperature ?? 0.5;
            ui.topPEl.value = modelSettings.top_p ?? 1.0;
            ui.seedEl.value = modelSettings.seed ?? 0;

            const updateSliderValues = () => {
                ui.temperatureValue.textContent = ui.temperatureEl.value;
                ui.topPValue.textContent = ui.topPEl.value;
                ui.seedValue.textContent = ui.seedEl.value === '0' ? 'off' : ui.seedEl.value;
            };

            updateSliderValues();

            populateModelList(ui.modelsFieldset, idSuffix, modelSettings.model, this.configService);

            // Event Listeners
            const changeHandler = () => {
                const updatedSettings = {
                    model: ui.modelsFieldset.querySelector(`input[name="model${idSuffix}"]:checked`)?.value,
                    temperature: parseFloat(ui.temperatureEl.value),
                    top_p: parseFloat(ui.topPEl.value),
                    seed: ui.seedEl.value,
                };
                hooks.onModelSettingsChanged.forEach(fn => fn(modelSettingsEl, updatedSettings, chatId, agentId));
            };

            ui.modelsFieldset.addEventListener('change', changeHandler);
            ui.temperatureEl.addEventListener('input', () => { updateSliderValues(); changeHandler(); });
            ui.topPEl.addEventListener('input', () => { updateSliderValues(); changeHandler(); });
            ui.seedEl.addEventListener('input', () => { updateSliderValues(); changeHandler(); });

            ui.resetTemperatureBtn.addEventListener('click', () => { ui.temperatureEl.value = 0.5; updateSliderValues(); changeHandler(); });
            ui.resetTopPBtn.addEventListener('click', () => { ui.topPEl.value = 1.0; updateSliderValues(); changeHandler(); });
            ui.resetSeedBtn.addEventListener('click', () => { ui.seedEl.value = 0; updateSliderValues(); changeHandler(); });

            // The global settings panel has the main refresh button
            if (!chatId && !agentId) {
                 ui.refreshModelsButton.addEventListener('click', () => this.app.loadModels());
            } else {
                ui.refreshModelsButton.style.display = 'none';
            }
        },

        onModelSettings: (payload, modelSettings) => {
            if (modelSettings.model) payload.model = modelSettings.model;
            if (modelSettings.temperature != null) payload.temperature = modelSettings.temperature;
            if (modelSettings.top_p != null) payload.top_p = modelSettings.top_p;
            if (modelSettings.seed && modelSettings.seed !== '0') {
                payload.seed = parseInt(modelSettings.seed, 10);
            }
        },

        onGetModelSettings: function(settings) {
            settings.model = this.configService.getItem('model', 1.0);
            settings.temperature = parseFloat(this.configService.getItem('temperature', 0.5));
            settings.top_p = parseFloat(this.configService.getItem('top_p', 1.0));
            settings.seed = this.configService.getItem('seed', '0');
        },

        onUpdateModelSettings: function(key, value) {
            if (key === 'model' || key === 'temperature' || key === 'top_p' || key === 'seed') {
                this.configService.setItem(key, value);
            }
        },

        onModelSettingsExport: (modelSettingsExport, modelSettings) => {
            if (modelSettings.model) modelSettingsExport.model = modelSettings.model;
            if (modelSettings.temperature != null) modelSettingsExport.temperature = modelSettings.temperature;
            if (modelSettings.top_p != null) modelSettingsExport.top_p = modelSettings.top_p;
            if (modelSettings.seed) modelSettingsExport.seed = modelSettings.seed;
        },

        onModelSettingsImport: (modelSettingsImport, modelSettings) => {
            if (modelSettingsImport.model) modelSettings.model = modelSettingsImport.model;
            if (modelSettingsImport.temperature != null) modelSettings.temperature = modelSettingsImport.temperature;
            if (modelSettingsImport.top_p != null) modelSettings.top_p = modelSettingsImport.top_p;
            if (modelSettingsImport.seed) modelSettings.seed = modelSettingsImport.seed;
        },

        onModelSettingsChanged: function(modelSettingsEl, updatedSettings, chatId, agentId) {
            log(4, 'Model settings changed for', { chatId, agentId });
            const storage = getStorage(this.configService, this.chatService, chatId, agentId);

            if (chatId || agentId) {
                // Chat or Agent scope: update properties directly on the object
                Object.assign(storage, updatedSettings);
                this.chatService.persistChats();
            } else {
                // Global scope: use the generic setItem on configService
                Object.entries(updatedSettings).forEach(([key, value]) => {
                    if (value !== undefined) {
                        this.configService.setItem(key, value);
                    }
                });
            }
        },
    }
};
