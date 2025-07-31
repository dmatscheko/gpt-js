'use strict';

(function () {

    document.addEventListener('DOMContentLoaded', () => {
        const chatlog = new Chatlog();
        const ui = {
            chatlogEl: new Chatbox(chatlog, document.getElementById('chat')),
            messageEl: document.getElementById('messageInput'),
            submitButton: document.getElementById('submitButton'),
            newChatButton: document.getElementById('newChatButton'),
            saveChatButton: document.getElementById('saveChatButton'),
            loadChatButton: document.getElementById('loadChatButton'),
            settingsButton: document.getElementById('settingsButton'),
            settingsEl: document.getElementById('settings'),
            temperatureEl: document.getElementById('temperature'),
            temperatureValueEl: document.getElementById('temperatureValue'),
            topPEl: document.getElementById('topP'),
            topPValueEl: document.getElementById('topPValue'),
            endpointEl: document.getElementById('endpoint'),
            apiKeyEl: document.getElementById('apiKey'),
            clearApiKeyButton: document.getElementById('clearApiKeyButton')
        };

        getApiKey();
        setUpEventListeners(chatlog, ui);

        ui.apiKeyEl.value = apiKey || '';
        if (!apiKey) {
            ui.settingsEl.classList.add('open');
            setTimeout(() => ui.apiKeyEl.focus(), 100);
        }

        // Load persisted chatlog from localStorage.
        const storedChatlog = localStorage.getItem('gptChat_chatlog');
        if (storedChatlog) {
            try {
                const data = JSON.parse(storedChatlog);
                chatlog.load(data.rootAlternatives);
                ui.chatlogEl.update();
            } catch (error) {
                console.error('Failed to load stored chatlog:', error);
                alert('Failed to load chat history. Starting a new session.');
            }
        }

        // Load stored endpoint.
        const storedEndpoint = localStorage.getItem('gptChat_endpoint');
        if (storedEndpoint) ui.endpointEl.value = storedEndpoint;

        if (apiKey) loadModels(ui);

        if (!chatlog.rootAlternatives) ui.newChatButton.click();
    });

    // Sets up event listeners for UI interactions.
    function setUpEventListeners(chatlog, ui) {
        ui.submitButton.addEventListener('click', () => {
            if (receiving) {
                controller.abort();
                return;
            }
            let model = document.querySelector('input[name="model"]:checked')?.value;
            if (model === 'custom') {
                model = document.getElementById('custom_model').value.trim();
                if (!model) return alert('Please enter a custom model ID.');
            }
            openaiChat(ui.messageEl.value, chatlog, model, Number(ui.temperatureEl.value), Number(ui.topPEl.value), document.querySelector('input[name="user_role"]:checked').value, ui);
            document.getElementById('user').checked = true;
            ui.messageEl.value = '';
            ui.messageEl.style.height = 'auto';
        });

        ui.messageEl.addEventListener('keydown', event => {
            if (event.keyCode === 13 && (event.shiftKey || event.ctrlKey || event.altKey)) {
                event.preventDefault();
                ui.submitButton.click();
            }
        });

        ui.messageEl.addEventListener('input', function () {
            this.style.height = 'auto';
            let height = this.scrollHeight - parseInt(getComputedStyle(this).paddingTop) - parseInt(getComputedStyle(this).paddingBottom);
            if (height > window.innerHeight / 2) {
                height = window.innerHeight / 2;
                this.style.overflowY = 'scroll';
            } else {
                this.style.overflowY = 'hidden';
            }
            if (height > this.clientHeight) this.style.height = `${height}px`;
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') controller.abort();
        });

        ui.newChatButton.addEventListener('click', () => {
            if (receiving) controller.abort();
            ui.messageEl.value = startMessage;
            ui.messageEl.style.height = 'auto';
            chatlog.rootAlternatives = null;
            chatlog.addMessage({ role: 'system', content: firstPrompt + getDatePrompt() });
            ui.chatlogEl.update();
        });

        ui.saveChatButton.addEventListener('click', () => {
            const jsonData = JSON.stringify(chatlog);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chatlog.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        ui.loadChatButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.addEventListener('change', () => {
                const file = input.files[0];
                const reader = new FileReader();
                reader.addEventListener('load', () => {
                    const data = JSON.parse(reader.result);
                    chatlog.load(data.rootAlternatives);
                    ui.chatlogEl.update();
                });
                reader.readAsText(file);
            });
            input.click();
        });

        ui.temperatureValueEl.textContent = ui.temperatureEl.value;
        ui.temperatureEl.addEventListener('input', () => ui.temperatureValueEl.textContent = ui.temperatureEl.value);

        ui.topPValueEl.textContent = ui.topPEl.value;
        ui.topPEl.addEventListener('input', () => ui.topPValueEl.textContent = ui.topPEl.value);

        ui.endpointEl.addEventListener('input', () => localStorage.setItem('gptChat_endpoint', ui.endpointEl.value));

        ui.settingsButton.addEventListener('click', () => ui.settingsEl.classList.toggle('open'));

        ui.apiKeyEl.addEventListener('input', () => {
            localStorage.setItem('gptChat_apiKey', ui.apiKeyEl.value);
            apiKey = ui.apiKeyEl.value;
        });

        ui.clearApiKeyButton.addEventListener('click', () => {
            localStorage.removeItem('gptChat_apiKey');
            apiKey = '';
            ui.apiKeyEl.value = '';
        });

        document.getElementById('refreshModelsButton').addEventListener('click', () => loadModels(ui));

        // Save selected model to localStorage on change.
        const saveModel = () => {
            let model = document.querySelector('input[name="model"]:checked')?.value;
            if (model === 'custom') model = document.getElementById('custom_model')?.value.trim();
            if (model) localStorage.setItem('gptChat_model', model);
        };
        document.getElementById('modelsFieldset').addEventListener('change', saveModel);
        document.getElementById('custom_model')?.addEventListener('input', () => {
            if (document.getElementById('model_custom')?.checked) saveModel();
        });
    }

}());