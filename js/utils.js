'use strict';

(function (globals) {

    // Fetches a chat completion from OpenAI API with streaming.
    async function openaiChat(message, chatlog, model, temperature, top_p, user_role, ui) {
        if (!regenerateLastAnswer && !message) return;
        if (receiving) return;
        receiving = true;

        if (user_role === 'assistant') {
            chatlog.addMessage({ role: user_role, content: message });
            ui.chatlogEl.update();
            receiving = false;
            return;
        }

        ui.submitBtn.innerHTML = message_stop;
        let entryCreated = false;
        try {
            if (!regenerateLastAnswer) {
                message = message.trim();
                chatlog.addMessage({ role: user_role, content: message });
                chatlog.addMessage(null);
            }
            regenerateLastAnswer = false;
            ui.chatlogEl.update();

            const payload = {
                model,
                messages: chatlog.getActiveMessageValues(),
                temperature,
                top_p,
                stream: true
            };

            if (payload.messages.length <= 1) return;

            const response = await fetch(ui.endpointEl.value, {
                signal: controller.signal,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api_key}`
                },
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
                    lastMessage.metadata = { model, temperature, top_p };
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
                setTimeout(() => ui.api_key.focus(), 100);
            }

            if (!entryCreated) {
                chatlog.addMessage({ role: 'assistant', content: `${error}` });
                entryCreated = true;
            } else {
                chatlog.getLastMessage().value.content += `\n\n${error}`;
            }
        } finally {
            receiving = false;
            ui.submitBtn.innerHTML = message_submit;
            if (entryCreated) {
                const lastMessage = chatlog.getLastMessage();
                lastMessage.metadata = { model, temperature, top_p };
            }
            ui.chatlogEl.update();
        }
    }

    // Generates a prompt suffix with current date and time.
    globals.getDatePrompt = () => {
        const now = new Date();
        return `\n\nKnowledge cutoff: none\nCurrent date: ${now.toISOString().slice(0, 10)}\nCurrent time: ${now.toTimeString().slice(0, 5)}`;
    };

    // Loads available models from the API.
    globals.loadModels = async (ui) => {
        const modelsUrl = ui.endpointEl.value.replace(/\/chat\/completions$/, '/models');
        try {
            const resp = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${globals.api_key}`
                }
            });
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            let models = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));
            const fieldset = document.getElementById('models-fieldset');
            fieldset.querySelectorAll('input[type="radio"][name="model"], label[for^="model_"], br').forEach(el => el.remove());

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

            // Custom model input.
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

            // Restore selected model.
            const storedModel = localStorage.getItem('model');
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
        } catch (err) {
            console.error('Failed to load models:', err);
            alert(`Failed to load models: ${err.message}`);
        }
    };

    // Sets up all event listeners for the UI.
    globals.setUpEventListeners = (chatlog, ui) => {
        ui.submitBtn.addEventListener('click', () => {
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
                ui.submitBtn.click();
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

        ui.newChatBtn.addEventListener('click', () => {
            if (receiving) controller.abort();
            ui.messageEl.value = start_message;
            ui.messageEl.style.height = 'auto';
            chatlog.rootAlternatives = null;
            chatlog.addMessage({ role: 'system', content: first_prompt + getDatePrompt() });
            ui.chatlogEl.update();
        });

        ui.saveChatBtn.addEventListener('click', () => {
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

        ui.loadChatBtn.addEventListener('click', () => {
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

        ui.endpointEl.addEventListener('input', () => localStorage.setItem('endpoint', ui.endpointEl.value));

        ui.settingsBtn.addEventListener('click', () => ui.settingsEl.classList.toggle('open'));

        ui.api_key.addEventListener('input', () => {
            localStorage.api_key = ui.api_key.value;
            globals.api_key = ui.api_key.value;
        });

        ui.clear_api_key_btn.addEventListener('click', () => {
            localStorage.removeItem('api_key');
            globals.api_key = '';
            ui.api_key.value = '';
        });

        document.getElementById('refresh-models-btn').addEventListener('click', () => globals.loadModels(ui));

        // Save model selection.
        const saveModel = () => {
            let model = document.querySelector('input[name="model"]:checked')?.value;
            if (model === 'custom') model = document.getElementById('custom_model')?.value.trim();
            if (model) localStorage.setItem('model', model);
        };
        document.getElementById('models-fieldset').addEventListener('change', saveModel);
        document.getElementById('custom_model')?.addEventListener('input', () => {
            if (document.getElementById('model_custom')?.checked) saveModel();
        });
    };

    globals.getApiKey = () => {
        globals.api_key = localStorage.api_key || '';
    };

}(this));
