/**
 * @fileoverview A plugin for displaying error messages in a bubble UI element.
 */

'use strict';

import { log } from '../utils/logger.js';

/**
 * The timeout ID for the error bubble.
 * @type {number|null}
 */
let timeoutId = null;

/**
 * Hides the error bubble.
 */
function hideBubble() {
    log(5, 'errorBubblePlugin: Hiding error bubble');
    const bubble = document.getElementById('error-bubble');
    if (!bubble) return;
    bubble.classList.add('hiding');
    bubble.addEventListener('animationend', () => {
        bubble.style.display = 'none';
        bubble.classList.remove('hiding');
        document.getElementById('error-bubble-content').innerHTML = '';
    }, { once: true }); // One-time listener.
}

/**
 * Plugin for displaying error messages in a bubble UI element.
 * @type {import('../hooks.js').Plugin}
 */
export const errorBubblePlugin = {
    name: 'error-bubble',
    hooks: {
        /**
         * Displays an error message in the error bubble.
         * @param {...*} args - The error arguments to display.
         */
        onError: function (...args) {
            log(5, 'errorBubblePlugin: onError called with args', args);
            if (args.length === 0) {
                args = ['Unknown error'];
            }
            // Format each argument into a string for display.
            const formattedParts = args.map(arg => {
                if (arg instanceof Error) {
                    return arg.message;
                } else if (typeof arg === 'object' && arg !== null) {
                    return JSON.stringify(arg, null, 2);
                } else {
                    return String(arg);
                }
            });
            const bubble = document.getElementById('error-bubble');
            if (!bubble) return;
            const content = document.getElementById('error-bubble-content');
            content.style.padding = '15px 5px 0 5px';
            formattedParts.forEach(part => {
                const messageEl = document.createElement('div');
                messageEl.style.wordBreak = 'break-word';
                messageEl.style.margin = '0 0 15px 0'; // Spacing between parts
                messageEl.style.backgroundColor = '#772222a0';
                messageEl.style.padding = '5px';
                messageEl.style.borderRadius = '10px';
                // Split the part into lines and create elements for each
                const lines = part.split('\n');
                lines.forEach((line, index) => {
                    const lineEl = document.createElement('div');
                    lineEl.textContent = line;
                    lineEl.style.whiteSpace = 'pre-wrap';
                    if (index < lines.length - 1) {
                        lineEl.style.marginBottom = '10px';
                    }
                    messageEl.appendChild(lineEl);
                });
                content.appendChild(messageEl);
            });
            bubble.style.display = 'block';
            bubble.classList.remove('hiding');
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(hideBubble, 20000);
        }
    }
};

document.getElementById('error-bubble-close').addEventListener('click', hideBubble);
