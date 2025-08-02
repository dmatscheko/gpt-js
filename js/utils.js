import { hooks } from './hooks.js';
import { messageSubmit, messageStop } from './config.js';

'use strict';

// Streams an OpenAI API chat completion into the last (null) message in the chatlog.
export async function streamAPIResponse(payload, chatbox) {
    const state = chatbox.state;
    const chatlog = chatbox.chatlog;
    const headers = {
        'Content-Type': 'application/json'
    };
    if (state.apiKey) {
        headers['Authorization'] = `Bearer ${state.apiKey}`;
    }

    const endpoint = document.getElementById('endpoint').value;
    const response = await fetch(endpoint, {
        signal: state.controller.signal,
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`API error: ${response.statusText} (${response.status})`);

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
        let delta = '';
        chunks.forEach(chunk => {
            if (!chunk.startsWith('data: ')) return;
            chunk = chunk.substring(6);
            if (chunk === '' || chunk === '[DONE]') return;
            const data = JSON.parse(chunk);
            if (data.error) throw new Error(data.error.message);
            delta += data.choices[0].delta.content || '';
        });

        if (delta === '') continue;

        hooks.onChunkReceived.forEach(fn => fn(delta));

        const lastMessage = chatlog.getLastMessage();
        if (lastMessage.value === null) {
            lastMessage.value = { role: 'assistant', content: delta };
        } else {
            lastMessage.value.content += delta;
        }
        lastMessage.cache = null;
        chatbox.update();
    }

    const lastMessage = chatlog.getLastMessage();
    hooks.onMessageComplete.forEach(fn => fn(lastMessage, chatbox));
}

// Generates an AI response by preparing payload, streaming from API via streamAPIResponse(), and handling state/errors/metadata.
export async function generateAIResponse(chatbox, options = {}) {
    const state = chatbox.state;
    if (state.receiving) return; // Caller should handle abort if needed
    let model = options.model || document.querySelector('input[name="model"]:checked')?.value;
    if (model === 'custom') {
        model = (options.model || document.getElementById('custom_model').value.trim());
        if (!model) throw new Error('Please enter a custom model ID.');
    }
    if (!model) throw new Error('Please select a model.');
    const temperature = options.temperature ?? Number(document.getElementById('temperature').value);
    const topP = options.top_p ?? Number(document.getElementById('topP').value);
    state.receiving = true;
    const submitButton = document.getElementById('submitButton');
    submitButton.innerHTML = messageStop;
    try {
        let payload = {
            model,
            messages: chatbox.chatlog.getActiveMessageValues(),
            temperature,
            top_p: topP,
            stream: true
        };
        if (payload.messages.length <= 1) return;
        if (payload.messages[0]?.role === 'system') {
            let systemContent = payload.messages[0].content;
            for (let fn of hooks.onModifySystemPrompt) {
                systemContent = fn(systemContent) || systemContent;
            }
            payload.messages[0].content = systemContent;
        }
        for (let fn of hooks.beforeApiCall) {
            const modified = fn(payload);
            if (modified) payload = modified;
        }
        await streamAPIResponse(payload, chatbox);
    } catch (error) {
        console.error('AI response error:', error);
        hooks.onError.forEach(fn => fn(error));
        if (error.name === 'AbortError') {
            state.controller = new AbortController();
            return;
        }
        if (error.message.includes('API key')) {
            document.getElementById('settings').classList.add('open');
            setTimeout(() => document.getElementById('apiKey').focus(), 100);
        }
        const lastMessage = chatbox.chatlog.getLastMessage();
        if (lastMessage.value === null) {
            lastMessage.value = { role: 'assistant', content: `${error}` };
            hooks.afterMessageAdd.forEach(fn => fn(lastMessage));
        } else {
            lastMessage.value.content += `\n\n${error}`;
        }
        lastMessage.cache = null;
    } finally {
        state.receiving = false;
        submitButton.innerHTML = messageSubmit;
        const lastMessage = chatbox.chatlog.getLastMessage();
        if (lastMessage.value !== null) {
            lastMessage.metadata = { model, temperature, top_p: topP };
        }
        chatbox.update();
    }
}

// Submits a user/system/assistant message to the chatlog and generates an AI response via generateAIResponse() if applicable.
export async function submitUserMessage(message, userRole, chatbox) {
    const state = chatbox.state;
    if (!state.regenerateLastAnswer && !message) return;
    if (state.receiving) return;
    const chatlog = chatbox.chatlog;
    if (userRole === 'assistant') {
        let modifiedContent = message;
        for (let fn of hooks.beforeUserMessageAdd) {
            const result = fn(modifiedContent, userRole);
            if (result === false) return;
            if (typeof result === 'string') modifiedContent = result;
        }
        const newMessage = chatlog.addMessage({ role: userRole, content: modifiedContent });
        hooks.afterMessageAdd.forEach(fn => fn(newMessage));
        chatbox.update();
        return;
    }
    if (!state.regenerateLastAnswer) {
        message = message.trim();
        let modifiedContent = message;
        for (let fn of hooks.beforeUserMessageAdd) {
            const result = fn(modifiedContent, userRole);
            if (result === false) return;
            if (typeof result === 'string') modifiedContent = result;
        }
        const newMessage = chatlog.addMessage({ role: userRole, content: modifiedContent });
        hooks.afterMessageAdd.forEach(fn => fn(newMessage));
        chatlog.addMessage(null);
    }
    state.regenerateLastAnswer = false;
    chatbox.update();
    await generateAIResponse(chatbox);
}
// Generates a prompt suffix with the current date and time.
export function getDatePrompt() {
    const now = new Date();
    return `\n\nKnowledge cutoff: none\nCurrent date: ${now.toISOString().slice(0, 10)}\nCurrent time: ${now.toTimeString().slice(0, 5)}`;
}
// Populates the models fieldset with the given models array.
export function populateModels(ui, models) {
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
export function loadModelsFromStorage(ui) {
    const storedModels = localStorage.getItem('gptChat_models');
    if (storedModels) {
        let models;
        try {
            models = JSON.parse(storedModels);
        } catch (err) {
            console.error('Failed to parse stored models:', err);
            return false;
        }
        populateModels(ui, models);
        return true;
    }
    return false;
}
// Loads available models from the API and populates the UI.
export async function loadModels(ui, state) {
    const modelsUrl = ui.endpointEl.value.replace(/\/chat\/completions$/, '/models');
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (state.apiKey) {
            headers['Authorization'] = `Bearer ${state.apiKey}`;
        }
        const resp = await fetch(modelsUrl, {
            method: 'GET',
            headers
        });
        if (!resp.ok) throw new Error(`${resp.statusText} (${resp.status})`);
        const data = await resp.json();
        let models = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));
        localStorage.setItem('gptChat_models', JSON.stringify(models));
        populateModels(ui, models);
        return true;
    } catch (err) {
        console.error('Failed to load models:', err);
        hooks.onError.forEach(fn => fn(err));
        if (localStorage.getItem('gptChat_apiKey') !== null) {
            localStorage.removeItem('gptChat_apiKey');
            localStorage.removeItem('gptChat_models');
            state.apiKey = '';
            ui.apiKeyEl.value = '';
            showLogin();
            populateModels(ui, []);
        }
        return false;
    }
}
export function showLogin() {
    document.getElementById('session-login').style.display = 'block';
    document.getElementById('session-logout').style.display = 'none';
}
export function showLogout() {
    document.getElementById('session-login').style.display = 'none';
    document.getElementById('session-logout').style.display = 'block';
}
