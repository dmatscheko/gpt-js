'use strict';

export const hooks = {
    beforeUserMessageAdd: [], // (content, role) => modifiedContent or false to cancel
    afterMessageAdd: [], // (messageObj)
    beforeApiCall: [], // (payload) => modifiedPayload
    onChunkReceived: [], // (deltaContent)
    onMessageComplete: [], // (messageObj)
    onRenderMessage: [], // (el, message)
    onError: [], // (error)
};
