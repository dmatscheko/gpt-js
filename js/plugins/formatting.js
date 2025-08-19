/**
 * @fileoverview A collection of plugins for formatting message content.
 */

'use strict';

import { triggerError, log } from '../utils/logger.js';

/**
 * @typedef {import('../hooks.js').Plugin} Plugin
 */

/**
 * A collection of plugins for formatting message content.
 * Each plugin applies transformations like SVG normalization, thinking tags, Markdown, KaTeX, and clip badges.
 * @type {Plugin[]}
 */
export const formattingPlugins = [
    {
        name: 'svg_normalization',
        hooks: {
            /**
             * Normalizes SVG content. Wraps SVGs in code blocks and fixes data URIs.
             * @param {string} text - The text content to format.
             * @param {int} pos - The position of the message.
             * @returns {string} The formatted text.
             */
            onFormatContent: function (text, pos) {
                log(5, 'formattingPlugins: svg_normalization onFormatContent called');
                text = text.replace(/((?:```\w*?\s*?)|(?:<render_component[^>]*?>\s*?)|)(<svg[^>]*?>)([\s\S]*?)(<\/svg>(?:\s*?```|\s*?<\/render_component>|)|$)/gi,
                    (match, prefix, svgStart, content, closing) => {
                        let output = '```svg\n' + svgStart;
                        if (closing?.startsWith('</svg>')) {
                            output += content + '</svg>\n```';
                        } else {
                            // Incomplete: don't add </svg> or closing ```.
                            output += content;
                        }
                        return output;
                    }
                );
                text = text.replace(/\(data:image\/svg\+xml,([a-z0-9_"'%+-]+?)\)/gmi, (match, g1) => {
                    let data = decodeURIComponent(g1);
                    data = data.replace(/<svg\s/gmi, '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ');
                    return `(data:image/svg+xml,${encodeURIComponent(data)})`;
                });
                return text;
            }
        }
    },
    {
        name: 'preDetailsWrapper',
        hooks: {
            /**
             * Wraps system prompt sections and tool calls in in special tags for later wrapping in <details> tags.
             * @param {string} text - The text content to format.
             * @param {int} pos - The position of the message.
             * @returns {string} The formatted text.
             */
            onFormatContent: function (text, pos) {
                // Wrap tool calls in special tags to be able to later wrap in <details>
                text = text.replace(/<dma:tool_call[^>]+?name="([^>]*?)"[^>]*?(?:\/>|>[\s\S]*?<\/dma:tool_call\s*>)/gi, (match, name) => {
                    const title = name ? name : '';
                    return `\n-#--#- TOOL CALL -#--#- ${title.trim()} -#--#-\n\`\`\`html\n${match.trim()}\n\`\`\`\n-#--#- END TOOL CALL -#--#-\n`;
                });
                // Wrap tool responses in special tags to be able to later wrap in <details>
                text = text.replace(/<dma:tool_response[^>]+?name="([^>]*?)"[^>]*?(?:\/>|>[\s\S]*?<\/dma:tool_response\s*>)/gi, (match, name) => {
                    const title = name ? name : '';
                    return `\n-#--#- TOOL RESPONSE -#--#- ${title.trim()} -#--#-\n\`\`\`html\n${match.trim()}\n\`\`\`\n-#--#- END TOOL RESPONSE -#--#-\n`;
                });
                return text;
            }
        }
    },
    {
        name: 'markdown',
        hooks: {
            /**
             * Renders Markdown using markdown-it and syntax highlighting with highlight.js.
             * @param {string} text - The text content to format.
             * @param {int} pos - The position of the message.
             * @returns {string} The formatted text.
             */
            onFormatContent: function (text, pos) {
                log(5, 'formattingPlugins: markdown onFormatContent called');
                const mdSettings = {
                    html: false, // Disable HTML tags in source.
                    xhtmlOut: false, // Use '/' to close single tags (<br />).
                    breaks: false, // Convert '\n' in paragraphs into <br>.
                    langPrefix: 'language-', // CSS language prefix for fenced blocks.
                    linkify: true, // Autoconvert URL-like text to links.
                    typographer: false, // Enable some language-neutral replacement + quotes beautification.
                    quotes: `""''`, // Double + single quotes replacement pairs.
                    // Highlight function for code blocks.
                    highlight: function (code, language) { // This needs to be a regular function, because arrow functions do not bind their own "this"-context and this.langPrefix would not be accessible.
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
                            triggerError('Highlight error:', error, code);
                        }
                        return `<pre class="hljs ${this.langPrefix}${language}" data-plaintext="${encodeURIComponent(code.trim())}"><code>${value}</code></pre>`;
                    }
                };
                const md = window.markdownit(mdSettings);
                md.validateLink = link => !['javascript:', 'dma:'].some(prefix => link.startsWith(prefix));
                return md.render(text);
            }
        }
    },
    {
        name: 'think',
        hooks: {
            /**
             * Handles <think> tags. Converts them to collapsible HTML details elements.
             * @param {string} text - The text content to format.
             * @param {int} pos - The position of the message.
             * @returns {string} The formatted text.
             */
            onFormatContent: function (text, pos) {
                log(5, 'formattingPlugins: think onFormatContent called');
                text = text.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g, '<details class="think"><summary>Thinking</summary><div class="think-content">$1</div></details>');
                // Unmatched <think> at the end with open details.
                text = text.replace(/&lt;think&gt;([\s\S]*)$/, '<details open class="think"><summary>Thinking</summary><div class="think-content">$1</div></details>');
                return text;
            }
        }
    },
    {
        name: 'detailsWrapper',
        hooks: {
            /**
             * Wraps system prompt sections and tool calls in <details> tags.
             * @param {string} text - The text content to format.
             * @param {int} pos - The position of the message.
             * @returns {string} The formatted text.
             */
            onFormatContent: function (text, pos) {
                log(5, 'formattingPlugins: detailsWrapper onFormatContent called');
                // Wrap system prompt sections in <details>
                text = text.replace(/<p>--- (.*?) ---(?:<\/p>|\n)([\s\S]*?)(?:<p>|\n)--- END \1 ---<\/p>/g, (match, title, content) => {
                    return `<details class="system-prompt-section"><summary>${title}</summary><div class="system-prompt-content"><p>--- ${title} ---</p>${content}<p>--- END ${title} ---</p></div></details>`;
                });

                const open = (pos === 0) ? ' open' : '';
                // Wrap tool calls in <details>
                text = text.replace(/-#--#- TOOL CALL -#--#- (.*?) -#--#-<\/p>([\s\S]*?)<p>-#--#- END TOOL CALL -#--#-/g, (match, name, content) => {
                    const title = name ? ': ' + name : '';
                    return `<details${open} class="tool-call"><summary>Tool Call${title}</summary>${content}</details>`;
                });
                // Wrap tool responses in <details>
                text = text.replace(/-#--#- TOOL RESPONSE -#--#- (.*?) -#--#-<\/p>([\s\S]*?)<p>-#--#- END TOOL RESPONSE -#--#-/g, (match, name, content) => {
                    const title = name ? ': ' + name : '';
                    return `<details${open} class="tool-response"><summary>Tool Response${title}</summary>${content}</details>`;
                });

                return text;
            }
        }
    },
    {
        name: 'katex',
        hooks: {
            /**
             * Renders LaTeX math with KaTeX.
             * @param {HTMLElement} wrapper - The wrapper element containing the content.
             */
            onPostFormatContent: function (wrapper) {
                log(5, 'formattingPlugins: katex onPostFormatContent called');
                const origFormulas = [];
                const ktSettings = {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        // { left: '\\(', right: '\\)', display: false },
                        { left: '\\begin{equation}', right: '\\end{equation}', display: true },
                        // { left: '\\begin{align}', right: '\\end{align}', display: true },
                        // { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
                        // { left: '\\begin{gather}', right: '\\end{gather}', display: true },
                        // { left: '\\begin{CD}', right: '\\end{CD}', display: true },
                        // { left: '\\[', right: '\\]', display: true }
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

                        // const pe = formula.parentElement;
                        // const ppe = pe.parentElement;
                        // ppe.insertBefore(div, pe);
                        // ppe.removeChild(pe);
                        // div.appendChild(pe);
                    }
                });
            }
        }
    },
    {
        name: 'clipbadge',
        hooks: {
            /**
             * Adds copy-to-clipboard badges to code blocks and tables.
             * @param {HTMLElement} el - The message element.
             * @param {import('../components/chatlog.js').Message} message - The message object.
             */
            onRenderMessage: function (el, message) {
                log(5, 'formattingPlugins: clipbadge onRenderMessage called');
                el.classList.add('hljs-nobg', 'hljs-message');
                el.dataset.plaintext = encodeURIComponent(message.value.content.trim());
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
    }
];
/**
 * @class ClipBadge
 * Provides copy-to-clipboard badges for code blocks and tables.
 * It is a heavily modified version of this:
 * https://unpkg.com/highlightjs-badge@0.1.9/highlightjs-badge.js
 *
 * Use like this:
 *
 * const cb = new ClipBadge({
 * templateSelector: '#my-badge-template',
 * contentSelector: '#my-clip-snippets',
 * autoRun: true,
 * copyIconClass: 'fa fa-copy',
 * copyIconContent: ' Copy',
 * checkIconClass: 'fa fa-check text-success',
 * checkIconContent: ' Copied!',
 * onBeforeCodeCopied: (text, code) => {
 * // Modify the text or code element before copying
 * return text;
 * },
 * codeButtonContent: 'Code',
 * imageButtonContent: 'Image'
 * });
 */
class ClipBadge {
    /**
     * @param {Object} [options={}] - The options for the clip badge.
     */
    constructor(options = {}) {
        this.settings = { ...this.defaults, ...options };
        log(5, 'ClipBadge: Constructor called with options', options);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    defaults = {
        templateSelector: '#clip-badge-template',
        contentSelector: 'body',
        autoRun: true,
        copyIconClass: '',
        copyIconContent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-4H4a2 2 0 0 1-2-2V4zm8 12v4h10V10h-4v4a2 2 0 0 1-2 2h-4zm4-2V4H4v10h10z" fill="currentColor"/></svg>',
        checkIconClass: 'text-success',
        checkIconContent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.664 5.253a1 1 0 0 1 .083 1.411l-10.666 12a1 1 0 0 1-1.495 0l-5.333-6a1 1 0 0 1 1.494-1.328l4.586 5.159 9.92-11.16a1 1 0 0 1 1.411-.082z" fill="currentColor"/></svg>&nbsp;Copied!',
        onBeforeCodeCopied: null,
        codeButtonContent: 'Code',
        imageButtonContent: 'Image'
    };
    /**
     * Initializes the ClipBadge by appending styles and template.
     */
    init() {
        log(4, 'ClipBadge: init called');
        const node = this.getTemplate();
        document.head.appendChild(node.content.querySelector('style').cloneNode(true));
        this.settings.template = node.content.querySelector('.clip-badge').cloneNode(true);
        if (this.settings.autoRun) this.addAll();
    }
    /**
     * Adds badges to all highlighted elements in the content selector.
     */
    addAll() {
        log(5, 'ClipBadge: addAll called');
        const content = document.querySelector(this.settings.contentSelector);
        content.querySelectorAll('.hljs, .hljs-nobg').forEach(el => this.addBadge(el));
    }
    /**
     * Adds badges to highlighted elements within a specific container.
     * @param {HTMLElement} container - The container to add badges to.
     */
    addTo(container) {
        log(5, 'ClipBadge: addTo called for container', container);
        container.querySelectorAll('.hljs, .hljs-nobg').forEach(el => this.addBadge(el));
        if (container.classList.contains('hljs') || container.classList.contains('hljs-nobg')) this.addBadge(container);
    }
    /**
     * Adds a copy badge to a highlighted element.
     * @param {HTMLElement} highlightEl - The element to add the badge to.
     */
    addBadge(highlightEl) {
        log(5, 'ClipBadge: addBadge called for element', highlightEl);
        if (highlightEl.classList.contains('clip-badge-pre')) return;
        highlightEl.classList.add('clip-badge-pre');
        const badge = this.createBadgeElement(highlightEl);
        highlightEl.insertAdjacentElement('afterbegin', badge);
    }
    /**
     * Creates the badge element.
     * @param {HTMLElement} highlightEl - The highlighted element.
     * @returns {HTMLElement} The badge element.
     */
    createBadgeElement(highlightEl) {
        const plainText = decodeURIComponent(highlightEl.dataset.plaintext) || highlightEl.textContent;
        let language = highlightEl.className.match(/\blanguage-(?<lang>[a-z0-9_-]+)\b/i)?.groups?.lang || 'unknown';
        let svgText = '';
        let htmlText = '';
        if (language.toLowerCase() === 'svg' && plainText) {
            svgText = highlightEl.innerHTML;
            highlightEl.innerHTML = plainText;
        } else if (language === 'table') {
            language = '';
            htmlText = highlightEl.innerHTML;
        }
        if (highlightEl.classList.contains('hljs-message')) {
            language = '';
            const right = highlightEl.querySelector('small > span > span.right');
            if (right) {
                language = right.textContent;
                right.remove();
            }
        }
        const badge = this.settings.template.cloneNode(true);
        badge.classList.add('clip-badge');
        badge.querySelector('.clip-badge-language').textContent = language;
        if (svgText) {
            this.handleSvg(badge, highlightEl, plainText, svgText);
        }
        this.handleCopy(badge, highlightEl, plainText, htmlText);
        return badge;
    }
    /**
     * Handles the logic for SVG code blocks.
     * @param {HTMLElement} badge - The badge element.
     * @param {HTMLElement} highlightEl - The highlighted element.
     * @param {string} plainText - The plain text content.
     * @param {string} svgText - The SVG text content.
     */
    handleSvg(badge, highlightEl, plainText, svgText) {
        const swapBtn = badge.querySelector('.clip-badge-swap');
        swapBtn.classList.add('clip-badge-swap-enabled');
        swapBtn.dataset.showing = 'html';
        swapBtn.innerHTML = this.settings.codeButtonContent;
        swapBtn.addEventListener('click', () => {
            log(5, 'ClipBadge: Swap button clicked, current showing', swapBtn.dataset.showing);
            if (swapBtn.dataset.showing === 'html') {
                swapBtn.dataset.showing = 'text';
                swapBtn.innerHTML = this.settings.imageButtonContent;
                highlightEl.innerHTML = svgText;
            } else {
                swapBtn.dataset.showing = 'html';
                swapBtn.innerHTML = this.settings.codeButtonContent;
                highlightEl.innerHTML = plainText;
            }
            highlightEl.insertAdjacentElement('afterbegin', badge);
        });
    }
    /**
     * Handles the copy to clipboard logic.
     * @param {HTMLElement} badge - The badge element.
     * @param {HTMLElement} highlightEl - The highlighted element.
     * @param {string} plainText - The plain text content.
     * @param {string} htmlText - The HTML text content.
     */
    handleCopy(badge, highlightEl, plainText, htmlText) {
        const copyIcon = badge.querySelector('.clip-badge-copy-icon');
        copyIcon.className = this.settings.copyIconClass;
        copyIcon.classList.add('clip-badge-copy-icon');
        copyIcon.innerHTML = this.settings.copyIconContent;
        copyIcon.addEventListener('click', event => {
            log(5, 'ClipBadge: Copy icon clicked');
            event.preventDefault();
            event.stopPropagation();
            if (copyIcon.classList.contains('text-success')) return;
            let textToCopy = plainText;
            if (this.settings.onBeforeCodeCopied) {
                textToCopy = this.settings.onBeforeCodeCopied(plainText, highlightEl);
            }
            const setCopied = () => {
                copyIcon.className = this.settings.checkIconClass;
                copyIcon.classList.add('clip-badge-copy-icon');
                copyIcon.innerHTML = this.settings.checkIconContent;
                setTimeout(() => {
                    copyIcon.className = this.settings.copyIconClass;
                    copyIcon.classList.add('clip-badge-copy-icon');
                    copyIcon.innerHTML = this.settings.copyIconContent;
                }, 2000);
            };
            if (navigator.clipboard?.write) {
                const clipboardData = { 'text/plain': new Blob([textToCopy], { type: 'text/plain' }) };
                if (htmlText) clipboardData['text/html'] = new Blob([htmlText], { type: 'text/html' });
                navigator.clipboard.write([new ClipboardItem(clipboardData)]).then(setCopied).catch(err => {
                    log(1, 'ClipBadge: Clipboard API failed', err);
                    triggerError('Clipboard API failed:', err);
                });
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.top = '0';
                textArea.style.left = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    if (document.execCommand('copy')) setCopied();
                    else {
                        log(1, 'ClipBadge: Fallback copy failed');
                        triggerError('Fallback copy failed.');
                    }
                } catch (err) {
                    log(1, 'ClipBadge: Fallback copy error', err);
                    triggerError('Fallback copy error:', err);
                }
                document.body.removeChild(textArea);
            }
        });
    }
    /**
     * Retrieves the badge template from the DOM or creates a default one.
     * @returns {HTMLTemplateElement} The template element.
     */
    getTemplate() {
        log(5, 'ClipBadge: getTemplate called');
        let node = document.querySelector(this.settings.templateSelector);
        if (!node) {
            node = document.createElement('template');
            node.innerHTML = `
<style>
.clip-badge-pre { position: relative; }
@media print { .clip-badge { display: none; } }
.clip-badge {
    display: flex;
    flex-flow: row nowrap;
    align-items: flex-start;
    white-space: normal;
    color: white;
    font-size: 12px;
    opacity: 0.3;
    transition: opacity linear 0.4s;
    position: absolute;
    right: 0;
    top: 0;
}
.hljs-message > .clip-badge { border-radius: 0 16px 0 7px; }
.clip-badge.active { opacity: 0.8; }
.clip-badge:hover { opacity: .95; }
.clip-badge a, .clip-badge a:hover { text-decoration: none; }
.clip-badge-language {
    margin-right: 10px;
    margin-top: 2px;
    font-weight: 600;
    color: goldenrod;
}
.hljs-message > div > div.clip-badge-language {
    color: white;
    font-weight: 200;
}
.clip-badge-copy-icon {
    height: 1.2em;
    font-size: 1em;
    cursor: pointer;
    padding: 5px 8px;
    user-select: none;
    background: #444;
    border-radius: 0 5px 0 7px;
}
.hljs-message > div > div.clip-badge-copy-icon { border-radius: 0 16px 0 7px; }
.hljs-table > div > div.clip-badge-copy-icon { border-radius: 0 4px 0 7px; }
.clip-badge-copy-icon * { cursor: pointer; vertical-align: top; }
.text-success { color: limegreen !important; }
.clip-badge-swap {
    cursor: pointer;
    background: #444;
    border-radius: 0 0 7px 7px;
    padding: 0 7px 3px;
    margin-right: 5px;
    display: none;
}
.clip-badge-swap-enabled { display: block; }
</style>
<div class="clip-badge">
    <div class="clip-badge-language"></div>
    <div class="clip-badge-swap" title="Swap view"></div>
    <div class="clip-badge-copy-icon" title="Copy to clipboard"></div>
</div>
`;
        }
        return node;
    }
}
