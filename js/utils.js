'use strict';

// Fetches a chat completion from the OpenAI API with streaming support.
async function openaiChat(message, chatlog, model, temperature, topP, userRole, ui) {
    if (!regenerateLastAnswer && !message) return;
    if (receiving) return;
    receiving = true;

    if (userRole === 'assistant') {
        chatlog.addMessage({ role: userRole, content: message });
        ui.chatlogEl.update();
        receiving = false;
        return;
    }

    ui.submitButton.innerHTML = messageStop;
    let entryCreated = false;
    try {
        if (!regenerateLastAnswer) {
            message = message.trim();
            chatlog.addMessage({ role: userRole, content: message });
            chatlog.addMessage(null);
        }
        regenerateLastAnswer = false;
        ui.chatlogEl.update();

        const payload = {
            model,
            messages: chatlog.getActiveMessageValues(),
            temperature,
            top_p: topP,
            stream: true
        };

        if (payload.messages.length <= 1) return;

        const headers = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(ui.endpointEl.value, {
            signal: controller.signal,
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API error: ${response.statusText}`);

        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const valueStr = new TextDecoder().decode(value);
            if (valueStr.startsWith('{')) {
                const data = JSON.parse(valueStr);
                if (data.error) throw new Error(data.error.message);
            }
            const chunks = valueStr.split('\n');
            let content = '';
            chunks.forEach(chunk => {
                if (!chunk.startsWith('data: ')) return;
                chunk = chunk.substring(6);
                if (chunk === '' || chunk === '[DONE]') return;
                const data = JSON.parse(chunk);
                if (data.error) throw new Error(data.error.message);
                content += data.choices[0].delta.content || '';
            });

            if (content === '') continue;

            if (!entryCreated) {
                const lastMessage = chatlog.addMessage({ role: 'assistant', content });
                entryCreated = true;
                lastMessage.metadata = { model, temperature, top_p: topP };
            } else {
                const lastMessage = chatlog.getLastMessage();
                lastMessage.value.content += content;
                lastMessage.cache = null;
            }
            ui.chatlogEl.update();
        }
    } catch (error) {
        console.error('OpenAI chat error:', error);
        if (error.name === 'AbortError') {
            controller = new AbortController();
            return;
        }
        if (error.message.includes('API key')) {
            ui.settingsEl.classList.add('open');
            setTimeout(() => ui.apiKeyEl.focus(), 100);
            alert('Invalid API key. Please check your settings.');
        } else {
            alert(`Chat error: ${error.message}`);
        }

        if (!entryCreated) {
            chatlog.addMessage({ role: 'assistant', content: `${error}` });
            entryCreated = true;
        } else {
            chatlog.getLastMessage().value.content += `\n\n${error}`;
        }
    } finally {
        receiving = false;
        ui.submitButton.innerHTML = messageSubmit;
        if (entryCreated) {
            const lastMessage = chatlog.getLastMessage();
            lastMessage.metadata = { model, temperature, top_p: topP };
        }
        ui.chatlogEl.update();
    }
}

// Generates a prompt suffix with the current date and time.
function getDatePrompt() {
    const now = new Date();
    return `\n\nKnowledge cutoff: none\nCurrent date: ${now.toISOString().slice(0, 10)}\nCurrent time: ${now.toTimeString().slice(0, 5)}`;
}

// Populates the models fieldset with the given models array.
function populateModels(ui, models) {
    const fieldset = document.getElementById('modelsFieldset');
    fieldset.querySelectorAll('input[type="radio"][name="model"], label[for^="model_"], br, p').forEach(el => el.remove());

    if (!models.length) {
        const p = document.createElement('p');
        p.textContent = 'No models available.';
        fieldset.appendChild(p);
        return;
    }

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
        fieldset.appendChild(input);
        fieldset.appendChild(label);
        fieldset.appendChild(document.createElement('br'));
    });

    // Add custom model input option.
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
    customLabel.appendChild(customText);
    fieldset.appendChild(customInput);
    fieldset.appendChild(customLabel);
    fieldset.appendChild(document.createElement('br'));

    // Restore previously selected model.
    const storedModel = localStorage.getItem('gptChat_model');
    if (storedModel) {
        let radio = fieldset.querySelector(`input[value="${storedModel}"]`);
        if (radio) radio.checked = true;
        else {
            customInput.checked = true;
            customText.value = storedModel;
        }
    } else {
        const defaultRadio = fieldset.querySelector('input[value="gpt-3.5-turbo"]') || fieldset.querySelector('input[name="model"]');
        if (defaultRadio) defaultRadio.checked = true;
    }
}

// Loads models from local storage and populates the UI if available.
function loadModelsFromStorage(ui) {
    const storedModels = localStorage.getItem('gptChat_models');
    if (storedModels) {
        const models = JSON.parse(storedModels);
        populateModels(ui, models);
        return true;
    }
    return false;
}

// Loads available models from the API and populates the UI.
async function loadModels(ui) {
    const modelsUrl = ui.endpointEl.value.replace(/\/chat\/completions$/, '/models');
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const resp = await fetch(modelsUrl, {
            method: 'GET',
            headers
        });
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();
        let models = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));
        localStorage.setItem('gptChat_models', JSON.stringify(models));
        populateModels(ui, models);
        return true;
    } catch (err) {
        console.error('Failed to load models:', err);
        alert(`Failed to load models: ${err.message}`);
        if (localStorage.getItem('gptChat_apiKey') !== null) {
            localStorage.removeItem('gptChat_apiKey');
            localStorage.removeItem('gptChat_models');
            apiKey = '';
            ui.apiKeyEl.value = '';
            showLogin();
            populateModels(ui, []);
            alert('Session invalid, logged out.');
        }
        return false;
    }
}

// Retrieves the API key from localStorage.
function getApiKey() {
    apiKey = localStorage.getItem('gptChat_apiKey') || '';
}

let apiKey = '';
