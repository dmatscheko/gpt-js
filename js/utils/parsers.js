'use strict';

import { log } from './logger.js';

/**
 * Parses <dma:tool_call> tags and extracts tool calls.
 * @param {string} content - The content to parse.
 * @returns {{toolCalls: Object[], positions: Object[], isSelfClosings: boolean[]}} The parsed tool calls, their positions, and self-closing flags.
 */
export function parseFunctionCalls(content) {
    log(5, 'parseFunctionCalls called');
    const toolCalls = [];
    const positions = [];
    const isSelfClosings = [];
    const functionCallRegex = /<dma:tool_call\s+([^>]+?)\/>|<dma:tool_call\s+([^>]*?)>([\s\S]*?)<\/dma:tool_call\s*>/gi;
    const nameRegex = /name="([^"]*)"/;
    const paramsRegex = /<parameter\s+name="([^"]*)">([\s\S]*?)<\/parameter>/g;

    for (const match of content.matchAll(functionCallRegex)) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        const [, selfAttrs, openAttrs, innerContent] = match;

        const isSelfClosing = innerContent === undefined;
        const attributes = isSelfClosing ? selfAttrs : openAttrs;
        const contentInner = isSelfClosing ? '' : innerContent;

        const nameMatch = nameRegex.exec(attributes);
        if (!nameMatch) continue;

        const [, name] = nameMatch;
        const params = {};

        if (!isSelfClosing) {
            let paramMatch;
            while ((paramMatch = paramsRegex.exec(contentInner)) !== null) {
                const [, paramName, paramValue] = paramMatch;
                let value = paramValue.trim();
                value = value.replace(/<\\\/dma:tool_call>/g, '</dma:tool_call>').replace(/<\\\/parameter>/g, '</parameter>');
                params[paramName] = value;
                log(5, "mcpPlugin: parseFunctionCalls value", value);
            }
        }

        toolCalls.push({ name, params });
        positions.push({ start: startIndex, end: endIndex });
        isSelfClosings.push(isSelfClosing);
    }

    log(4, 'mcpPlugin: Parsed tool calls', toolCalls.length);
    return { toolCalls, positions, isSelfClosings };
}

/**
 * Escapes XML special characters.
 * @param {string} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"\\]/g, c => ({
        '<':'&lt;',
        '>':'&gt;',
        '&':'&amp;',
        '\'':'&apos;',
        '"':'&quot;',
        '\\':'&bsol;'
    })[c]);
}
