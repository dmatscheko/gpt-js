'use strict';

(function (globals) {

    document.addEventListener('DOMContentLoaded', () => {
        const chatlog = new Chatlog();
        const ui = {
            chatlogEl: new Chatbox(chatlog, document.getElementById('chat')),
            messageEl: document.getElementById('message-inp'),
            submitBtn: document.getElementById('submit-btn'),
            newChatBtn: document.getElementById('new_chat-btn'),
            saveChatBtn: document.getElementById('save_chat-btn'),
            loadChatBtn: document.getElementById('load_chat-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsEl: document.getElementById('settings'),
            temperatureEl: document.getElementById('temperature'),
            temperatureValueEl: document.getElementById('temperature-value'),
            topPEl: document.getElementById('top_p'),
            topPValueEl: document.getElementById('top_p-value'),
            endpointEl: document.getElementById('endpoint'),
            api_key: document.getElementById('api_key'),
            clear_api_key_btn: document.getElementById('clear_api_key-btn')
        };

        getApiKey();
        setUpEventListeners(chatlog, ui);

        ui.api_key.value = globals.api_key || '';
        if (!globals.api_key) {
            ui.settingsEl.classList.add('open');
            setTimeout(() => ui.api_key.focus(), 100);
        }

        // Load persisted chatlog.
        const storedChatlog = localStorage.getItem('chatlog');
        if (storedChatlog) {
            try {
                const data = JSON.parse(storedChatlog);
                chatlog.load(data.rootAlternatives);
                ui.chatlogEl.update();
            } catch (error) {
                console.error('Failed to load stored chatlog:', error);
            }
        }

        // Load endpoint.
        const storedEndpoint = localStorage.getItem('endpoint');
        if (storedEndpoint) ui.endpointEl.value = storedEndpoint;

        if (globals.api_key) loadModels(ui);

        if (!chatlog.rootAlternatives) ui.newChatBtn.click();
    });

}(this));
