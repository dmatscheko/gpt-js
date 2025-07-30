(function (globals) {
    'use strict';


    // Interact with OpenAI API
    async function openaiChat(message, chatlog, model, temperature, top_p, user_role, ui) {
        if (!regenerateLastAnswer && !message) return;
        if (receiving) return;
        receiving = true;

        if (user_role === 'assistant') {
            const prompt_msg = {
                role: user_role,
                content: message
            };
            chatlog.addMessage(prompt_msg);
            ui.chatlogEl.update();
            receiving = false;
            return;
        }

        ui.submitBtn.innerHTML = message_stop;
        let entryCreated = false;
        try {
            if (!regenerateLastAnswer) {
                message = message.trim();
                const prompt_msg = {
                    role: user_role,
                    content: message
                };
                chatlog.addMessage(prompt_msg);
                chatlog.addMessage(null);
            }
            regenerateLastAnswer = false;
            ui.chatlogEl.update();
            // chatlog.getFirstMessage().value.content = first_prompt + getDatePrompt();
            const payload = {
                model,
                messages: chatlog.getActiveMessageValues(),
                temperature,
                top_p,
                stream: true,
            };

            // do not send initial prompt without other messages
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
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const value_str = new TextDecoder().decode(value);
                if (value_str.startsWith('{')) {
                    const data = JSON.parse(value_str);
                    if ('error' in data) throw new Error(data.error.message);
                }
                const chunks = value_str.split('\n');
                let content = '';
                chunks.forEach(chunk => {
                    if (chunk.startsWith('data: ')) chunk = chunk.substring(6)
                    if (chunk === '' || chunk === '[DONE]') return;
                    const data = JSON.parse(chunk);
                    if ('error' in data) throw new Error(data.error.message);
                    content += data.choices[0].delta.content || '';
                });
                
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
            console.error(error);
            if (('' + error).startsWith('AbortError: ')) {
                controller = new AbortController();
                return;
            }
            if (('' + error).startsWith("Error: You didn't provide an API key.") || ('' + error).startsWith('Error: Incorrect API key provided:')) {
                ui.settingsEl.classList.add('open');
                setTimeout(() => ui.api_key.focus(), 100);
            }

            if (!entryCreated) {
                chatlog.addMessage({ role: 'assistant', content: '' + error });
                entryCreated = true;
            } else {
                chatlog.getLastMessage().value.content += `\n\n${error}`;
            }
        } finally {
            receiving = false;
            ui.submitBtn.innerHTML = message_submit;
            if (entryCreated) {
                chatlog.getLastMessage().metadata = { model, temperature, top_p };
            }

            ui.chatlogEl.update();
        }
    }


    // Returns the current date and time as prompt part
    globals.getDatePrompt = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const datePrompt = `\nKnowledge cutoff: none\nCurrent date: ${year}-${month}-${day}\nCurrent time: ${hours}:${minutes}`;
        return datePrompt;
    }

    globals.loadModels = function(ui) {
        const endpoint = ui.endpointEl.value;
        let modelsUrl = endpoint.replace(/\/chat\/completions$/, '/models');
        fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${globals.api_key}`
            }
        }).then(resp => {
            if (!resp.ok) throw new Error('Failed to fetch models: ' + resp.statusText);
            return resp.json();
        }).then(data => {
            let models = data.data || [];
            models = models.sort((a, b) => a.id.localeCompare(b.id));
            const fieldset = document.getElementById('models-fieldset');
            const toRemove = fieldset.querySelectorAll('input[type="radio"][name="model"], label[for^="model_"], br');
            toRemove.forEach(el => el.remove());
            if (models.length === 0) {
                const p = document.createElement('p');
                p.textContent = 'No models available.';
                fieldset.appendChild(p);
                return;
            }
            models.forEach((model, i) => {
                const safeId = model.id.replace(/[^a-z0-9_-]/gi, '_');
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'model';
                input.value = model.id;
                input.id = `model_${safeId}`;
                if (i === 0 || model.id === 'gpt-3.5-turbo') input.checked = true;
                const label = document.createElement('label');
                label.setAttribute('for', `model_${safeId}`);
                label.textContent = model.id;
                fieldset.appendChild(input);
                fieldset.appendChild(label);
                fieldset.appendChild(document.createElement('br'));
            });
        }).catch(err => {
            console.error(err);
            alert('Failed to load models: ' + err.message);
        });
    }

    // Sets up event listeners for the chat interface
    // ChatApp.prototype.setUpEventListeners = () => {
    globals.setUpEventListeners = (chatlog, ui) => {

        ui.submitBtn.addEventListener('click', () => {
            if (receiving) {
                controller.abort();
                return;
            }
            openaiChat(ui.messageEl.value, chatlog, document.querySelector('input[name="model"]:checked').value, Number(ui.temperatureEl.value), Number(ui.topPEl.value), document.querySelector('input[name="user_role"]:checked').value, ui);
            document.getElementById('user').checked = true;
            ui.messageEl.value = '';
            ui.messageEl.style.height = 'auto';
        });

        ui.messageEl.addEventListener('keydown', (event) => {
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

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                controller.abort();
            }
        });

        ui.newChatBtn.addEventListener('click', () => {
            if (receiving) {
                controller.abort();
                return;
            }
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
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        ui.loadChatBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', () => {
                const file = input.files[0];
                const reader = new FileReader();

                reader.addEventListener('load', () => {
                    const jsonData = reader.result;
                    const data = JSON.parse(jsonData);
                    chatlog.load(data.rootAlternatives);
                    ui.chatlogEl.update();
                });

                reader.readAsText(file);
                document.body.removeChild(input);
            });

            input.click();
        });

        ui.temperatureValueEl.textContent = ui.temperatureEl.value;
        ui.temperatureEl.addEventListener('input', () => {
            ui.temperatureValueEl.textContent = ui.temperatureEl.value;
        });

        ui.topPValueEl.textContent = ui.topPEl.value;
        ui.topPEl.addEventListener('input', () => {
            ui.topPValueEl.textContent = ui.topPEl.value;
        });

        ui.endpointEl.addEventListener('input', () => {
            try {
                localStorage.setItem('endpoint', ui.endpointEl.value);
            } catch (error) {
                console.error(error);
            }
        });

        ui.settingsBtn.addEventListener('click', () => {
            ui.settingsEl.classList.toggle('open');
        });

        ui.api_key.addEventListener('input', () => {
            try {
                localStorage.api_key = ui.api_key.value;
                globals.api_key = ui.api_key.value;
            } catch (error) {
                console.error(error);
            }
        });

        ui.clear_api_key_btn.addEventListener('click', () => {
            try {
                localStorage.removeItem('api_key');
                globals.api_key = '';
                ui.api_key.value = '';
            } catch (error) {
                console.error(error);
            }
        });

        ui.refreshModelsBtn = document.getElementById('refresh-models-btn');
        ui.refreshModelsBtn.addEventListener('click', () => globals.loadModels(ui));

    }


    globals.getApiKey = () => {
        try {
            globals.api_key = localStorage.api_key;
        } catch (error) {
            console.error(error);
        }
        if (typeof globals.api_key === 'undefined') {
            globals.api_key = '';
        }
    }


}(this));