/**
 * @fileoverview A plugin for adding flow controls to messages.
 */

'use strict';

import { createControlButton } from '../utils/ui.js';

/**
 * @typedef {import('../components/chatbox.js').ChatBox} ChatBox
 * @typedef {import('../components/chatlog.js').Chatlog} Chatlog
 * @typedef {import('../components/chatlog.js').Message} Message
 */

let app;

/**
 * Plugin to add flow controls.
 * @type {import('../hooks.js').Plugin}
 */
export const flowControlsPlugin = {
    name: 'flowControls',
    init: (appInstance) => {
        app = appInstance;
    },
    hooks: {
        /**
         * Renders flow controls for a message.
         * @param {HTMLElement} container - The container for the controls.
         * @param {Message} message - The message object.
         */
        onRenderMessageControls: function(container, message) {
            if (message.value.role !== 'user') return;

            const summarizeBtn = createControlButton(
                'Summarize & Clear',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" fill="currentColor" /></svg>',
                () => {
                    if (app) {
                        app.summarizeAndClear(message.value.content);
                    }
                }
            );

            const spacer = document.createElement('span');
            spacer.innerHTML = `&nbsp;&nbsp;&nbsp;`;

            container.appendChild(spacer);
            container.appendChild(summarizeBtn);
        }
    }
};
