'use strict';

export const hooks = {
    beforeUserMessageAdd: [], // Called before adding a user/system message to the chatlog. Allows modifying content or cancelling addition. Args: (content, role) => modifiedContent or false to cancel.
    afterMessageAdd: [], // Called after a message is added to the chatlog. Args: (messageObj).
    beforeApiCall: [], // Called before making the API call, allows modifying the payload. Args: (payload, chatbox) => modifiedPayload.
    onChunkReceived: [], // Called when a streaming chunk is received from the API. Args: (deltaContent).
    onMessageComplete: [], // Called when an assistant message is fully streamed/completed. Args: (messageObj, chatbox).
    onError: [], // Called on API or processing errors. Args: (error).
    onFormatContent: [], // Called during content formatting (e.g., for Markdown, etc.). Args: (text, pos) => html.
    onPostFormatContent: [], // Called after content is formatted into a wrapper element. Args: (wrapperEl, messageObj, pos).
    onRenderMessage: [], // Called when rendering a message element, allows modifying the DOM element. Args: (el, message).
    onRenderMessageControls: [], // Called to add controls (buttons) to a message element. Args: (containerEl, message, chatlog, chatbox).
    onSettingsRender: [], // Called when the settings panel is opened, allows adding elements to it. Args: (settingsEl).
    onModifySystemPrompt: [], // Called to modify the system prompt before API call. Args: (systemContent) => modifiedSystemContent.
    onStateChange: [], // Called on central state changes (e.g., receiving, apiKey). Args: (key, value).
    onChatUpdated: [], // Called when chatlog updates. Args: (chatlog).
    onGenerateAIResponse: [], // Called to request an AI response. Args: (options, chatlog).
    onCancel: [], // Called when the user cancels an AI response.
    onLogout: [], // Called when the user clicks the logout button. Args: (settingsEl).
    /**
     * Renders model settings UI elements for the chat with ID chatId (or main settings if null), and optionally for agentId.
     * @param {HTMLElement} modelSettingsEl - The container element for settings UI.
     * @param {Object} modelSettings - The settings data object (global, per-chat, or per-agent).
     * @param {string|null} chatId - The chat ID or null for global.
     * @param {string|null} agentId - The agent ID or null if not agent-specific.
     */
    onModelSettingsRender: [],
    /**
     * Modifies the API payload with model settings.
     * @param {Object} payload - The API payload to modify.
     * @param {Object} modelSettings - The merged settings (global + per-chat + per-agent).
     */
    onModelSettings: [],
    /**
     * Exports model settings to storage/JSON.
     * @param {Object} modelSettingsExport - The export data structure.
     * @param {Object} modelSettings - The settings to export.
     */
    onModelSettingsExport: [],
    /**
     * Imports model settings from storage/JSON.
     * @param {Object} modelSettingsImport - The imported data.
     * @param {Object} modelSettings - The settings object to populate.
     */
    onModelSettingsImport: [],
    /**
     * Aggregates settings from various plugins.
     * @param {Object} settings - The settings object to be populated.
     */
    onGetModelSettings: [],
    /**
     * Delegates the update of a specific setting to the relevant plugin.
     * @param {string} key - The setting key.
     * @param {*} value - The setting value.
     */
    onUpdateModelSettings: [],
    /**
     * Handles changes to model settings, persisting them.
     * @param {HTMLElement} modelSettingsEl - The settings UI element.
     * @param {Object} modelSettings - The updated settings.
     * @param {string|null} chatId - The chat ID or null.
     * @param {string|null} agentId - The agent ID or null.
     */
    onModelSettingsChanged: [],
};

window.hooks = hooks; // TODO: only for testing: remove

export function registerPlugin(plugin, app) {
    if (plugin.init) {
        plugin.init(app);
    }
    Object.entries(plugin.hooks || {}).forEach(([hookName, fn]) => {
        if (hooks[hookName]) {
            hooks[hookName].push(fn);
        } else {
            console.warn(`Unknown hook ${hookName} in plugin`);
        }
    });
}
