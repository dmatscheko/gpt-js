'use strict';

let timeoutId = null;
export const errorBubblePlugin = {
    name: 'error-bubble',
    hooks: {
        onError: function (...args) {
            if (args.length === 0) {
                // Optional: Handle no arguments with a default message
                args = ['Unknown error'];
            }

            const formattedParts = args.map(arg => {
                if (arg instanceof Error) {
                    // Use only the error message for user-facing display
                    return arg.message;
                } else if (typeof arg === 'object' && arg !== null) {
                    // Stringify objects
                    return JSON.stringify(arg, null, 2);
                } else {
                    // Convert primitives to strings
                    return String(arg);
                }
            });

            const message = formattedParts.join(' ');
            const bubble = document.getElementById('error-bubble');
            if (!bubble) return;
            const content = document.getElementById('error-bubble-content');
            const messageEl = document.createElement('p');
            messageEl.textContent = message;
            content.appendChild(messageEl);
            bubble.style.display = 'block';
            bubble.classList.remove('hiding');
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(hideBubble, 10000);
        }
    }
};

function hideBubble() {
    const bubble = document.getElementById('error-bubble');
    if (!bubble) return;
    bubble.classList.add('hiding');
    bubble.addEventListener('animationend', () => {
        bubble.style.display = 'none';
        bubble.classList.remove('hiding');
        document.getElementById('error-bubble-content').innerHTML = '';
    }, { once: true });
}
document.getElementById('error-bubble-close').addEventListener('click', hideBubble);
