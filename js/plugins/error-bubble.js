'use strict';
let timeoutId = null;
export const errorBubblePlugin = {
    name: 'error-bubble',
    hooks: {
        onError: function (error) {
            console.error(error);
            const bubble = document.getElementById('error-bubble');
            if (!bubble) return;
            const content = document.getElementById('error-bubble-content');
            const messageEl = document.createElement('p');
            messageEl.textContent = error.message || error.toString();
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
