/**
 * @fileoverview Manages the tabbed interface in the chat area.
 */

'use strict';

import { log } from '../utils/logger.js';

class TabManager {
    /**
     * @param {HTMLElement} container - The container element to render the tabs into.
     */
    constructor(container) {
        this.container = container;
        this.tabs = [];
        this.activeTab = null;

        this.tabBar = document.createElement('div');
        this.tabBar.className = 'tab-bar';

        this.tabContent = document.createElement('div');
        this.tabContent.className = 'tab-content';

        this.container.appendChild(this.tabBar);
        this.container.appendChild(this.tabContent);
    }

    /**
     * Adds a new tab.
     * @param {string} id - A unique ID for the tab.
     * @param {string} title - The title to display on the tab.
     * @param {HTMLElement} contentEl - The HTML element that represents the content of the tab.
     * @param {boolean} [isActive=false] - Whether this tab should be active initially.
     */
    addTab(id, title, contentEl, isActive = false) {
        log(4, `TabManager: Adding tab "${title}"`);
        const tab = {
            id,
            title,
            contentEl,
            button: document.createElement('button'),
        };

        tab.button.className = 'tab-button';
        tab.button.textContent = title;
        tab.button.addEventListener('click', () => this.switchTab(id));

        this.tabBar.appendChild(tab.button);
        this.tabContent.appendChild(contentEl);
        this.tabs.push(tab);

        if (isActive || this.tabs.length === 1) {
            this.switchTab(id);
        } else {
            contentEl.style.display = 'none';
        }
    }

    /**
     * Switches to a specific tab.
     * @param {string} id - The ID of the tab to switch to.
     */
    switchTab(id) {
        log(4, `TabManager: Switching to tab "${id}"`);
        const newActiveTab = this.tabs.find(tab => tab.id === id);
        if (!newActiveTab || newActiveTab === this.activeTab) return;

        if (this.activeTab) {
            this.activeTab.button.classList.remove('active');
            this.activeTab.contentEl.style.display = 'none';
        }

        newActiveTab.button.classList.add('active');
        newActiveTab.contentEl.style.display = 'block';
        this.activeTab = newActiveTab;
    }
}

export default TabManager;
