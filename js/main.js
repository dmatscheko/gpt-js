import { Chatbox } from './chatbox.js';
import { Chatlog } from './chatlog.js';
import { firstPrompt, startMessage, defaultEndpoint, messageSubmit, messageStop } from './config.js';
import { openaiChat, populateModels, loadModels, loadModelsFromStorage, getDatePrompt, showLogin, showLogout } from './utils.js';
import { hooks, registerPlugin } from './hooks.js';
import { ClipBadge } from './clipbadge.js';

'use strict';

(function () {

    registerPlugin({
        name: 'markdown',
        hooks: {
            onFormatContent: function (text) {
                const mdSettings = {
                    html: false,
                    xhtmlOut: false,
                    breaks: false,
                    langPrefix: 'language-',
                    linkify: true,
                    typographer: false,
                    quotes: `""''`,
                    highlight: function (code, language) {
                        let value = '';
                        try {
                            if (language && hljs.getLanguage(language)) {
                                value = hljs.highlight(code, { language, ignoreIllegals: true }).value;
                            } else {
                                const highlighted = hljs.highlightAuto(code);
                                language = highlighted.language || 'unknown';
                                value = highlighted.value;
                            }
                        } catch (error) {
                            console.error('Highlight error:', error, code);
                        }
                        return `<pre class="hljs ${this.langPrefix}${language}" data-plaintext="${encodeURIComponent(code.trim())}"><code>${value}</code></pre>`;
                    }
                };
                const md = window.markdownit(mdSettings);
                md.validateLink = link => !link.startsWith('javascript:');
                return md.render(text);
            }
        }
    });

    registerPlugin({
        name: 'katex',
        hooks: {
            onPostFormatContent: function (wrapper) {
                const origFormulas = [];
                const ktSettings = {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\begin{equation}', right: '\\end{equation}', display: true }
                    ],
                    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'table', 'svg'],
                    throwOnError: false,
                    preProcess: math => {
                        origFormulas.push(math);
                        return math;
                    }
                };
                renderMathInElement(wrapper, ktSettings);
                wrapper.querySelectorAll('.katex').forEach((elem, i) => {
                    if (i >= origFormulas.length) return;
                    const formula = elem.parentElement;
                    if (formula.classList.contains('katex-display')) {
                        const div = document.createElement('div');
                        div.classList.add('hljs', 'language-latex');
                        div.dataset.plaintext = encodeURIComponent(origFormulas[i].trim());
                        const pe = formula.parentElement;
                        pe.insertBefore(div, formula);
                        div.appendChild(formula);
                    }
                });
            }
        }
    });

    registerPlugin({
        name: 'clipbadge',
        hooks: {
            onRenderMessage: function (el, message) {
                const tableToCSV = (table) => {
                    const separator = ';';
                    const rows = table.querySelectorAll('tr');
                    return Array.from(rows).map(row =>
                        Array.from(row.querySelectorAll('td, th')).map(col =>
                            `"${col.innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s)/gm, ' ').replace(/"/g, '""')}"`
                        ).join(separator)
                    ).join('\n');
                };
                el.querySelectorAll('table').forEach(table => {
                    const div = document.createElement('div');
                    div.classList.add('hljs-nobg', 'hljs-table', 'language-table');
                    div.dataset.plaintext = encodeURIComponent(tableToCSV(table));
                    const pe = table.parentElement;
                    pe.insertBefore(div, table);
                    div.appendChild(table);
                });
                const clipBadge = new ClipBadge({ autoRun: false });
                clipBadge.addTo(el);
            }
        }
    });

    document.addEventListener('DOMContentLoaded', async () => {
        const state = {
            receiving: false,
            regenerateLastAnswer: false,
            controller: new AbortController(),
            apiKey: localStorage.getItem('gptChat_apiKey') || '',
        };

        const chatlog = new Chatlog();
        const ui = {
            chatlogEl: new Chatbox(chatlog, document.getElementById('chat'), state),
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
            apiKeyEl: document.getElementById('apiKey')
        };

        setUpEventListeners(chatlog, ui, state);

        ui.endpointEl.value = localStorage.getItem('gptChat_endpoint') || defaultEndpoint;
        ui.apiKeyEl.value = state.apiKey;

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

        const hasStoredKey = localStorage.getItem('gptChat_apiKey') !== null;
        if (hasStoredKey) {
            let success = loadModelsFromStorage(ui);
            if (!success) {
                success = await loadModels(ui, state);
            }
            if (success) {
                showLogout();
                if (!chatlog.rootAlternatives) ui.newChatButton.click();
            } else {
                ui.settingsEl.classList.add('open');
                setTimeout(() => ui.apiKeyEl.focus(), 100);
            }
        } else {
            showLogin();
            populateModels(ui, []);
            ui.settingsEl.classList.add('open');
            setTimeout(() => ui.endpointEl.focus(), 100);
        }
    });

    // Sets up event listeners for UI interactions.
    function setUpEventListeners(chatlog, ui, state) {
        ui.submitButton.addEventListener('click', () => {
            if (state.receiving) {
                state.controller.abort();
                return;
            }
            let model = document.querySelector('input[name="model"]:checked')?.value;
            if (model === 'custom') {
                model = document.getElementById('custom_model').value.trim();
                if (!model) return alert('Please enter a custom model ID.');
            }
            openaiChat(ui.messageEl.value, chatlog, model, Number(ui.temperatureEl.value), Number(ui.topPEl.value), document.querySelector('input[name="user_role"]:checked').value, ui, state);
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
            if (event.key === 'Escape') state.controller.abort();
        });

        ui.newChatButton.addEventListener('click', () => {
            if (state.receiving) state.controller.abort();
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
                    try {
                        const data = JSON.parse(reader.result);
                        chatlog.load(data.rootAlternatives);
                        ui.chatlogEl.update();
                    } catch (error) {
                        console.error('Failed to parse loaded chatlog:', error);
                        alert('Invalid chatlog file.');
                    }
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

        document.getElementById('refreshModelsButton').addEventListener('click', async () => await loadModels(ui, state));

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

        document.getElementById('login-btn').addEventListener('click', async () => {
            const key = ui.apiKeyEl.value.trim();
            localStorage.setItem('gptChat_apiKey', key);
            state.apiKey = key;
            localStorage.setItem('gptChat_endpoint', ui.endpointEl.value);
            if (await loadModels(ui, state)) {
                showLogout();
                if (!chatlog.rootAlternatives) ui.newChatButton.click();
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('gptChat_apiKey');
            localStorage.removeItem('gptChat_models');
            state.apiKey = '';
            ui.apiKeyEl.value = '';
            ui.endpointEl.value = defaultEndpoint;
            localStorage.setItem('gptChat_endpoint', defaultEndpoint);
            showLogin();
            populateModels(ui, []);
        });
    }

}());
