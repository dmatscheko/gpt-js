'use strict';

export const hooks = {
    beforeUserMessageAdd: [], // Called before adding a user/system message to the chatlog. Allows modifying content or cancelling addition. Args: (content, role) => modifiedContent or false to cancel.
    afterMessageAdd: [], // Called after a message is added to the chatlog. Args: (messageObj).
    beforeApiCall: [], // Called before making the API call, allows modifying the payload. Args: (payload, chatbox) => modifiedPayload.
    onChunkReceived: [], // Called when a streaming chunk is received from the API. Args: (deltaContent).
    onMessageComplete: [], // Called when an assistant message is fully streamed/completed. Args: (messageObj, chatbox).
    onError: [], // Called on API or processing errors. Args: (error).
    onFormatContent: [], // Called during content formatting (e.g., for Markdown, etc.). Args: (text) => html.
    onPostFormatContent: [], // Called after content is formatted into a wrapper element. Args: (wrapperEl, messageObj).
    onRenderMessage: [], // Called when rendering a message element, allows modifying the DOM element. Args: (el, message).
    onRenderMessageControls: [], // Called to add controls (buttons) to a message element. Args: (containerEl, message, chatlog, chatbox).
    onSettingsRender: [], // Called when the settings panel is opened, allows adding elements to it. Args: (settingsEl).
    onModifySystemPrompt: [], // Called to modify the system prompt before API call. Args: (systemContent) => modifiedSystemContent.
    onStateChange: [], // Called on central state changes (e.g., receiving, apiKey). Args: (key, value).
    onChatUpdated: [], // Called when chatlog updates. Args: (chatlog).
    onGenerateAIResponse: [], // Called to request an AI response. Args: (options, chatlog).
    onCancel: [], // Called when the user cancels an AI response.
};

window.hooks = hooks; // TODO: only for testing: remove

export function registerPlugin(plugin) {
    Object.entries(plugin.hooks || {}).forEach(([hookName, fn]) => {
        if (hooks[hookName]) {
            hooks[hookName].push(fn);
        } else {
            console.warn(`Unknown hook ${hookName} in plugin`);
        }
    });
}
