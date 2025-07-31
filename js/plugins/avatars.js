'use strict';

// Default SVG avatars for user (ping) and assistant (pong).
const avatarPing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<circle cx="40" cy="40" r="40" fill="#FFC107" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<path d="M 25 55 Q 40 65, 55 55" fill="none" stroke="white" stroke-width="4" />
</svg>`;
const avatarPong = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<rect x="2" y="2" width="76" height="76" fill="#2196F3" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<rect x="15" y="50" width="50" height="5" fill="#ffffff" />
<rect x="25" y="60" width="30" height="5" fill="#ffffff" />
</svg>`;

export const avatarsPlugin = {
    name: 'avatars',
    hooks: {
        onRenderMessage: function (el, message, chatbox) {
            let type = 'ping';
            if (message.value.role === 'assistant') type = 'pong';

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
                    chatbox.chatlog.clearCache();
                    chatbox.update(false);
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
                        chatbox.chatlog.clearCache();
                        chatbox.update(false);
                    });
                    reader.readAsDataURL(file);
                });
                input.click();
            });

            el.insertAdjacentElement('afterbegin', avatar);
        }
    }
};
