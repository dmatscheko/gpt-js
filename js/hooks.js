'use strict';

export const hooks = {
    beforeUserMessageAdd: [], // (content, role) => modifiedContent or false to cancel
    afterMessageAdd: [], // (messageObj)
    beforeApiCall: [], // (payload) => modifiedPayload
    onChunkReceived: [], // (deltaContent)
    onMessageComplete: [], // (messageObj)
    onRenderMessage: [], // (el, message)
    onError: [], // (error)
    onFormatContent: [], // (text) => html
    onPostFormatContent: [] // (wrapperEl)
};

export function registerPlugin(plugin) {
    Object.entries(plugin.hooks || {}).forEach(([hookName, fn]) => {
        if (hooks[hookName]) {
            hooks[hookName].push(fn);
        } else {
            console.warn(`Unknown hook ${hookName} in plugin`);
        }
    });
}
