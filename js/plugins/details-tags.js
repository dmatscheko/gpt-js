/**
 * @fileoverview A plugin for creating collapsible sections.
 */

'use strict';

import { log } from '../utils/logger.js';

/**
 * @typedef {import('../hooks.js').Plugin} Plugin
 */

/**
 * Plugin to add details tags for tool calls and system prompt sections.
 * @type {Plugin}
 */
export const detailsTagsPlugin = {
    name: 'details_tags',
    hooks: {
        /**
         * Handles custom collapsible sections.
         * @param {string} text - The text content to format.
         * @returns {string} The formatted text.
         */
        onFormatContent: function (text) {
            log(5, 'detailsTagsPlugin: onFormatContent called');

            // Wrap --- SECTION --- in <details>
            text = text.replace(/(?:\\n|^)--- (.*?) ---\\n([\\s\\S]*?)\\n--- END \\1 ---/g, (match, title, content) => {
                const summary = title.trim();
                const newContent = `\\n<details class="system-prompt-section"><summary>${summary}</summary><div class="system-prompt-content">\\n--- ${summary} ---\\n${content.trim()}\\n--- END ${summary} ---</div></details>`;
                return newContent;
            });

            // Wrap
