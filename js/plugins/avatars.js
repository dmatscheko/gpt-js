/**
 * @fileoverview A plugin for handling user and assistant avatars.
 */

'use strict';

import { triggerError, log } from '../utils/logger.js';

/**
 * Default SVG avatar for the user.
 * @type {string}
 */
const avatarPing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<circle cx="40" cy="40" r="40" fill="#FFC107" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<path d="M 25 55 Q 40 65, 55 55" fill="none" stroke="white" stroke-width="4" />
</svg>`;

/**
 * Default SVG avatar for the assistant.
 * @type {string}
 */
const avatarPong = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<rect x="2" y="2" width="76" height="76" fill="#2196F3" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<rect x="15" y="50" width="50" height="5" fill="#ffffff" />
<rect x="25" y="60" width="30" height="5" fill="#ffffff" />
</svg>`;

/**
 * @typedef {import('../components/chatbox.js').ChatBox} ChatBox
 * @typedef {import('../components/chatlog.js').Message} Message
 */

/**
 * Plugin for handling avatars, allowing custom uploads via localStorage.
 * @type {import('../hooks.js').Plugin}
 */
export const avatarsPlugin = {
    name: 'avatars',
    configService: null,

    init: function(app) {
        this.configService = app.configService;

        // Bind all methods to this instance
        Object.keys(this.hooks).forEach(hookName => {
            this.hooks[hookName] = this.hooks[hookName].bind(this);
        });
    },

    hooks: {
        /**
         * Renders the avatar for a message.
         * @param {HTMLElement} el - The message element.
         * @param {Message} message - The message object.
         * @param {ChatBox} chatbox - The ChatBox instance.
         */
        onRenderMessage: function (el, message, chatbox) {
            log(4, 'avatarsPlugin: Rendering avatar for role', message.value.role);
            let type = 'ping'; // Default to user avatar type.
            if (message.value.role === 'assistant') type = 'pong'; // Switch to assistant type if role is assistant.
            const avatar = document.createElement('img');
            let avatarSrc = this.configService.getItem(`${type}Avatar`);
            const isCustom = !!avatarSrc; // Check if a custom avatar is set.
            avatar.classList.add('avatar', 'clickable');
            avatar.src = avatarSrc || `data:image/svg+xml,${encodeURIComponent(type === 'ping' ? avatarPing : avatarPong)}`;

            avatar.addEventListener('click', () => {
                log(5, 'avatarsPlugin: Avatar clicked for type', type);
                if (isCustom) {
                    log(4, 'avatarsPlugin: Resetting to default avatar for type', type);
                    avatar.src = `data:image/svg+xml,${encodeURIComponent(type === 'ping' ? avatarPing : avatarPong)}`;
                    this.configService.removeItem(`${type}Avatar`);
                    chatbox.chatlog.clearCache();
                    chatbox.update(false);
                    return;
                }
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.addEventListener('change', () => {
                    log(5, 'avatarsPlugin: File input changed');
                    const file = input.files[0];
                    if (!file) return;
                    log(3, 'avatarsPlugin: Selected file', file.name, 'size:', file.size);
                    if (!file.type.startsWith('image/')) {
                        log(2, 'avatarsPlugin: Invalid file type', file.type);
                        triggerError('Invalid file type. Please upload an image.');
                        return;
                    }
                    if (file.size > 1024 * 1024 * 2) { // 2MB limit
                        log(2, 'avatarsPlugin: File too large', file.size);
                        triggerError('File too large. Maximum size is 2MB.');
                        return;
                    }
                    // Read the file as Data URL.
                    const reader = new FileReader();
                    reader.addEventListener('load', () => {
                        log(4, 'avatarsPlugin: File loaded successfully');
                        this.configService.setItem(`${type}Avatar`, reader.result);
                        avatar.src = reader.result;
                        chatbox.chatlog.clearCache();
                        chatbox.update(false);
                    });
                    reader.addEventListener('error', () => {
                        log(1, 'avatarsPlugin: Failed to read file');
                        triggerError('Failed to read avatar file.');
                    });
                    reader.readAsDataURL(file);
                });
                input.click();
            });

            el.insertAdjacentElement('afterbegin', avatar);
        }
    }
};
