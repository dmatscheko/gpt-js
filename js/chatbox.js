"use strict";


/*
TODO:

.fade-out {
  opacity: 1;
  transition: opacity 1s ease-out;
}

.fade-out.hide {
  opacity: 0;
}

const element = document.querySelector('.fade-out');
element.classList.add('hide');

*/

class Chatbox {
    constructor(chatlog, container) {
        this.container = container;
        this.codebadge = new ClipBadge({ autoRun: false });

        const div = document.createElement('div');
        div.id = 'msg_mod';
        document.body.appendChild(div);
        this.optionsEl = div;
        div.innerHTML =
        `<button id="msg_mod-prev-btn" title="Previous Message" class="toolbtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 7.766c0-1.554-1.696-2.515-3.029-1.715l-7.056 4.234c-1.295.777-1.295 2.653 0 3.43l7.056 4.234c1.333.8 3.029-.16 3.029-1.715V7.766zM9.944 12L17 7.766v8.468L9.944 12zM6 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg>
        </button>
        <button id="msg_mod-next-btn" title="Next Message" class="toolbtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7.766c0-1.554 1.696-2.515 3.029-1.715l7.056 4.234c1.295.777 1.295 2.653 0 3.43L8.03 17.949c-1.333.8-3.029-.16-3.029-1.715V7.766zM14.056 12L7 7.766v8.468L14.056 12zM18 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1z" fill="currentColor"/></svg>
        </button><br>
        <button id="msg_mod-add-btn" title="New Message" class="toolbtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z" fill="currentColor"/></svg>
        </button>`;

        this.timeout = { id: 0 };
        const timeout = this.timeout;

        function mouseenter(event) {
            clearTimeout(timeout.id);
            div.style.display = 'block';
        }

        function mouseleave(event) {
            timeout.id = setTimeout(() => { div.style.display = 'none' }, 1000);
        }

        div.addEventListener('mouseenter', mouseenter);
        div.addEventListener('mouseleave', mouseleave);

        document.getElementById('msg_mod-add-btn').addEventListener('click', ()=>{
            console.log(div.dataset.pos, chatlog, chatlog.getNthAlternatives(div.dataset.pos));
            // TODO: if clicked on user message, then create an empty user message to show that it got "deleted" from that chain
            chatlog.getNthAlternatives(div.dataset.pos).addMessage({});
            // TODO: if clicked on assistant message, regenerate the answer and add it to the message list
            // ...
            console.log(div.dataset.pos, chatlog, chatlog.getNthAlternatives(div.dataset.pos));
        });
    }

    // Updates the HTML inside the chat window
    update(chatlog) {
        const messages = this.#chatlogToChat(chatlog);

        const optionsEl = this.optionsEl;
        const timeout = this.timeout;

        function mouseenter(event) {
            clearTimeout(timeout.id);
            const rect = this.getBoundingClientRect();
            optionsEl.style.display = 'block'; // The element has to be visible first, otherwise clientWidth would be 0
            optionsEl.style.top = rect.top + 'px';
            optionsEl.style.left = (rect.left - optionsEl.clientWidth) + 'px';
            optionsEl.dataset.pos = this.dataset.pos;
        }

        function mouseleave(event) {
            timeout.id = setTimeout(() => { optionsEl.style.display = 'none' }, 1000);
        }

        const should_scroll_down =
            this.container.parentElement.scrollHeight - this.container.parentElement.clientHeight <=
            this.container.parentElement.scrollTop + 5;

        this.container.innerHTML = '';
        let pos = 1;
        for (const message of messages) {
            const ping = document.createElement('div');
            ping.classList.add('ping');
            const pong = document.createElement('div');
            pong.classList.add('pong');
            const row = document.createElement('div');
            row.classList.add('row');
            row.appendChild(ping);
            row.appendChild(pong);
            [ping.innerHTML, pong.innerHTML] = message;
            ping.dataset.pos = pos;
            pos++;
            pong.dataset.pos = pos;
            pos++;
            ping.addEventListener('mouseenter', mouseenter);
            ping.addEventListener('mouseleave', mouseleave);
            pong.addEventListener('mouseenter', mouseenter);
            pong.addEventListener('mouseleave', mouseleave);
            this.container.appendChild(row);
        }
        if (this.codebadge) this.codebadge.addTo(this.container);

        if (should_scroll_down) {
            this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
        }
    }


    // Formats the active chatlog path as array of pairs of HTML formatted messages
    #chatlogToChat(chatlog) {
        let result = [];

        // Trace the active path through the chatlog
        let message = chatlog.getFirstMessage();
        if (message !== null) message = message.getAnswerMessage(); // Ignore the prompt message
        while (message !== null) {
            const messageObj = message.value;
            message = message.getAnswerMessage();
            const answerObj = message !== null ? message.value : { role: 'assistant', content: '🤔...' };
            result.push([
                `<small><b>${messageObj.role}</b><br><br></small>${this.#formatCodeBlocks(messageObj.content)}`,
                `<small><b>${answerObj.role}</b><br><br></small>${this.#formatCodeBlocks(answerObj.content)}`
            ]);
            message = message !== null ? message.getAnswerMessage() : null;
        }
        return result;
    }


    // Adds syntax highlighting and renders latex formulas
    #formatCodeBlocks(text) {
        if (!text) return text;
        text = text.trim();

        text = text.replaceAll(/!--MATCH_SVG_A###/ismg, '!-- NO MATCH_SVG_A###'); // partially prevent XSS -- scripts can still be created inside SVGs.
        text = text.replaceAll(/<svg\s.*?<\/svg>/ismg, (match) => {
            return '<!--MATCH_SVG_A###' + btoa(unescape(encodeURIComponent(match))) + '###MATCH_SVG_B-->';
        });

        const defaults = {
            html: false, // Whether to allow HTML tags in the source
            xhtmlOut: false, // Whether to use XHTML-style self-closing tags (e.g. <br />)
            breaks: false, // Whether to convert line breaks into <br> tags
            langPrefix: 'language-', // The prefix for CSS classes applied to code blocks
            linkify: true, // Whether to automatically convert URLs to links
            typographer: false, // Whether to use typographic replacements for quotation marks and the like
            _highlight: true, // Whether to syntax-highlight code blocks using highlight.js
            _strict: false, // Whether to enforce strict parsing rules
            _view: 'html' // The default view mode for the renderer (html | src | debug)
        };
        defaults.highlight = function (code, language) {
            let value = '';
            try {
                if (language && hljs.getLanguage(language)) {
                    value = hljs.highlight(code, { language, ignoreIllegals: true }).value;
                } else {
                    const highlighted = hljs.highlightAuto(code);
                    language = highlighted.language ? highlighted.language : 'unknown';
                    value = highlighted.value;
                }
            } catch (error) {
                // ignore error here
                // console.error(error, code);
            }
            return `<pre class="hljs"><code class="${this.langPrefix}${language}">${value}</code></pre>`;
        };
        const md = window.markdownit(defaults);
        text = md.render(text);

        function renderMathInString(str) {
            const delimiters = [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                // { left: "\\(", right: "\\)", display: false },
                { left: "\\begin{equation}", right: "\\end{equation}", display: true },
                // { left: "\\begin{align}", right: "\\end{align}", display: true },
                // { left: "\\begin{alignat}", right: "\\end{alignat}", display: true },
                // { left: "\\begin{gather}", right: "\\end{gather}", display: true },
                // { left: "\\begin{CD}", right: "\\end{CD}", display: true },
                // { left: "\\[", right: "\\]", display: true }
            ];
            const ignoredTags = ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'table', 'svg'];
            const wrapper = document.createElement('div');
            wrapper.innerHTML = str;
            renderMathInElement(wrapper, { delimiters, ignoredTags, throwOnError: false });
            return wrapper.innerHTML;
        }
        text = renderMathInString(text);

        text = text.replaceAll(/(?:<|&lt;)!--MATCH_SVG_A###([A-Za-z0-9\/=%+-]+?)###MATCH_SVG_B--(?:>|&gt;)/ig, (match, p1) => {
            return decodeURIComponent(escape(atob(p1)));
        });

        return text;
    }

}
