'use strict';

// TODO: Maybe add token count and answer price to the title.

// Class responsible for displaying the chat messages in the UI.
class Chatbox {
    // Initializes the Chatbox with a chatlog and container element.
    constructor(chatlog, container) {
        this.chatlog = chatlog;
        this.container = container;
        this.clipBadge = new ClipBadge({ autoRun: false });
    }

    // Updates the HTML content inside the chat window, optionally scrolling to the bottom.
    update(scroll = true) {
        const shouldScrollDown = scroll && this.#isScrolledToBottom();

        const fragment = document.createDocumentFragment();
        let alternative = this.chatlog.rootAlternatives;
        let lastRole = 'assistant';
        let pos = 0;

        // Traverse the active path through the chatlog.
        while (alternative) {
            const message = alternative.getActiveMessage();
            if (!message) break;

            if (message.cache) {
                fragment.appendChild(message.cache);
                lastRole = message.value.role;
                alternative = message.answerAlternatives;
                pos++;
                continue;
            }

            const msgIdx = alternative.activeMessageIndex;
            const msgCnt = alternative.messages.length;

            if (!message.value) {
                const role = lastRole === 'assistant' ? 'user' : 'assistant';
                const messageEl = this.#formatMessage({ value: { role, content: '🤔...' } }, pos, msgIdx, msgCnt);
                fragment.appendChild(messageEl);
                break;
            }

            if (message.value.content === null) {
                const messageEl = this.#formatMessage({ value: { role: message.value.role, content: '🤔...' } }, pos, msgIdx, msgCnt);
                fragment.appendChild(messageEl);
                break;
            }

            const messageEl = this.#formatMessage(message, pos, msgIdx, msgCnt);
            fragment.appendChild(messageEl);
            message.cache = messageEl;
            lastRole = message.value.role;

            alternative = message.answerAlternatives;
            pos++;
        }

        this.container.replaceChildren(fragment);

        if (shouldScrollDown) {
            this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
        }

        this.#persistChatlog();
    }

    // Checks if the chat container is scrolled to the bottom.
    #isScrolledToBottom() {
        const { scrollHeight, clientHeight, scrollTop } = this.container.parentElement;
        return scrollHeight - clientHeight <= scrollTop + 5;
    }

    // Persists the chatlog to localStorage.
    #persistChatlog() {
        try {
            localStorage.setItem('gptChat_chatlog', JSON.stringify(this.chatlog));
        } catch (error) {
            console.error('Failed to persist chatlog:', error);
            alert('Failed to save chat history. Please check your browser storage settings.');
        }
    }

    // Formats a single message as an HTML element.
    #formatMessage(message, pos, msgIdx, msgCnt) {
        let type = 'ping';
        if (message.value.role === 'assistant') type = 'pong';
        const el = document.createElement('div');
        el.classList.add('message', type, 'hljs-nobg', 'hljs-message');
        if (message.value.role === 'system') el.classList.add('system');
        el.dataset.plaintext = encodeURIComponent(message.value.content.trim());
        el.dataset.pos = pos;

        el.appendChild(this.#createAvatar(type));

        let msgStat = '';
        if (msgIdx > 0 || msgCnt > 1) {
            msgStat = `<button title="Previous Message" class="msg_mod-prev-btn toolButton small"><svg width="16" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 7.766c0-1.554-1.696-2.515-3.029-1.715l-7.056 4.234c-1.295.777-1.295 2.653 0 3.43l7.056 4.234c1.333.8 3.029-.16 3.029-1.715V7.766zM9.944 12L17 7.766v8.468L9.944 12zM6 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg></button>&nbsp;${msgIdx + 1}/${msgCnt}&nbsp;<button title="Next Message" class="msg_mod-next-btn toolButton small"><svg width="16" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7.766c0-1.554 1.696-2.515 3.029-1.715l7.056 4.234c1.295.777 1.295 2.653 0 3.43L8.03 17.949c-1.333.8-3.029-.16-3.029-1.715V7.766zM14.056 12L7 7.766v8.468L14.056 12zM18 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg></button>&nbsp;&nbsp;`;
        }
        let model = '';
        if (message.metadata?.model) {
            model = `&nbsp;<span class="right">${message.metadata.model}</span>`;
        }
        const msgTitleStrip = document.createElement('small');
        msgTitleStrip.innerHTML = `<span class="nobreak"><button title="New Message" class="msg_mod-add-btn toolButton small"><svg width="16" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z" fill="currentColor"/></svg></button>&nbsp;&nbsp;${msgStat}<b>${message.value.role}</b>${model}</span><br><br>`;
        el.appendChild(msgTitleStrip);

        const formattedContent = this.#formatContent(message.value.content);
        if (formattedContent) {
            el.appendChild(formattedContent);
        } else {
            const div = document.createElement('div');
            div.innerHTML = 'Error: Timeout on API server.';
            el.appendChild(div);
        }

        this.#attachMessageEvents(el, type, pos, message);

        if (msgIdx > 0 || msgCnt > 1) {
            this.#attachNavigationEvents(el);
        }

        if (this.clipBadge) {
            this.#prepareCopyableElements(el);
            this.clipBadge.addTo(el);
        }

        return el;
    }

    // Attaches event listeners to message elements for editing and regeneration.
    #attachMessageEvents(el, type, pos, message) {
        el.querySelector('.msg_mod-add-btn').addEventListener('click', async () => {
            const messageInput = document.getElementById('messageInput');
            let newMessage = null;
            if (type === 'ping') {
                if (pos === 0) {
                    newMessage = { role: 'system', content: firstPrompt + getDatePrompt() };
                } else {
                    if (!messageInput.value) {
                        messageInput.value = message.value.content.trim();
                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                        document.getElementById(message.value.role === 'system' ? 'system' : 'user').checked = true;
                    }
                }
            }
            const alternative = this.chatlog.getNthAlternatives(pos);
            if (alternative) alternative.addMessage(newMessage);
            this.update(false);
            if (type === 'pong') {
                if (receiving) controller.abort();
                setTimeout(() => {
                    regenerateLastAnswer = true;
                    document.getElementById('submitButton').click();
                }, 100);
                return;
            }
            messageInput.focus();
        });
    }

    // Attaches navigation events for switching between alternative messages.
    #attachNavigationEvents(el) {
        el.querySelector('.msg_mod-prev-btn').addEventListener('click', () => {
            this.chatlog.getNthAlternatives(el.dataset.pos).prev();
            this.update(false);
        });

        el.querySelector('.msg_mod-next-btn').addEventListener('click', () => {
            this.chatlog.getNthAlternatives(el.dataset.pos).next();
            this.update(false);
        });
    }

    // Creates and returns an avatar image element for the message type.
    #createAvatar(type) {
        const avatar = document.createElement('img');
        let avatarSrc = localStorage.getItem(`gptChat_${type}Avatar`);
        const isCustom = !!avatarSrc;
        avatar.classList.add('avatar');
        if (localStorage) avatar.classList.add('clickable');
        avatar.src = avatarSrc || `data:image/svg+xml,${encodeURIComponent(type === 'ping' ? avatarPing : avatarPong)}`;

        avatar.addEventListener('click', () => {
            if (!localStorage) return;
            if (isCustom) {
                avatar.src = `data:image/svg+xml,${encodeURIComponent(type === 'ping' ? avatarPing : avatarPong)}`;
                localStorage.removeItem(`gptChat_${type}Avatar`);
                this.chatlog.clearCache();
                this.update(false);
                return;
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.addEventListener('change', () => {
                const file = input.files[0];
                const reader = new FileReader();
                reader.addEventListener('load', () => {
                    localStorage.setItem(`gptChat_${type}Avatar`, reader.result);
                    avatar.src = reader.result;
                    this.chatlog.clearCache();
                    this.update(false);
                });
                reader.readAsDataURL(file);
            });
            input.click();
        });

        return avatar;
    }

    // Prepares tables and other elements for copy-to-clipboard functionality.
    #prepareCopyableElements(parent) {
        const tableToCSV = (table) => {
            const separator = ';';
            const rows = table.querySelectorAll('tr');
            return Array.from(rows).map(row => 
                Array.from(row.querySelectorAll('td, th')).map(col => 
                    `"${col.innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s)/gm, ' ').replace(/"/g, '""')}"`
                ).join(separator)
            ).join('\n');
        };

        parent.querySelectorAll('table').forEach(table => {
            const div = document.createElement('div');
            div.classList.add('hljs-nobg', 'hljs-table', 'language-table');
            div.dataset.plaintext = encodeURIComponent(tableToCSV(table));
            const pe = table.parentElement;
            pe.insertBefore(div, table);
            pe.removeChild(table);
            div.appendChild(table);
        });
    }

    // Formats message content with Markdown, syntax highlighting, and LaTeX rendering.
    #formatContent(text) {
        if (!text) return null;
        text = text.trim();

        // Normalize SVG code blocks for proper rendering.
        text = text.replace(/```\w*\s*<svg\s/gmi, '```svg\n<svg ');
        text = text.replace(/\(data:image\/svg\+xml,([a-z0-9_"'%+-]+?)\)/gmi, (match, g1) => {
            let data = decodeURIComponent(g1);
            data = data.replace(/<svg\s/gmi, '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ');
            return `(data:image/svg+xml,${encodeURIComponent(data)})`;
        });

        const mdSettings = {
            html: false, // Whether to allow HTML tags in the source
            xhtmlOut: false, // Whether to use XHTML-style self-closing tags (e.g. <br />)
            breaks: false, // Whether to convert line breaks into <br> tags
            langPrefix: 'language-', // The prefix for CSS classes applied to code blocks
            linkify: true, // Whether to automatically convert URLs to links
            typographer: false, // Whether to use typographic replacements for quotation marks and the like
            quotes: `""''`, // Which types of quotes to use, if typographer is true
             // This needs to be a regular function, because arrow functions do not bind their own this context and this.langPrefix would not be accessible
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

        text = md.render(text);

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

        const wrapper = document.createElement('div');
        wrapper.classList.add('content');
        wrapper.innerHTML = text;

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
                pe.removeChild(formula);
            }
        });

        return wrapper;
    }
}
