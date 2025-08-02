import { ClipBadge } from '../clipbadge.js';
import { hooks } from '../hooks.js';

'use strict';

export const formattingPlugins = [
    {
        name: 'svg_normalization',
        hooks: {
            onFormatContent: function (text) {
                text = text.replace(/```\w*\s*<svg\s/gmi, '```svg\n<svg ');
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
                            hooks.onError.forEach(fn => fn(error));
                        }
                        return `<pre class="hljs ${this.langPrefix}${language}" data-plaintext="${encodeURIComponent(code.trim())}"><code>${value}</code></pre>`;
                    }
                };
                const md = window.markdownit(mdSettings);
                md.validateLink = link => !link.startsWith('javascript:');
                return md.render(text);
            }
        }
    },
    {
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
    },
    {
        name: 'clipbadge',
        hooks: {
            onRenderMessage: function (el, message, chatbox) {
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
