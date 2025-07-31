import { ClipBadge } from '../clipbadge.js';

export const formattingPlugins = [
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
    }
];
