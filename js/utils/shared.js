/**
 * @fileoverview Shared utility functions for the application.
 */

'use strict';

import { log, triggerError } from './logger.js';
import { parseFunctionCalls, escapeXml } from './parsers.js';
import { hooks } from '../hooks.js';
import * as UIManager from '../ui-manager.js';

/**
 * Processes tool calls found in a message, filters them, executes them,
 * and adds the results back to the chat.
 *
 * @param {import('../components/chatlog.js').Message} message - The message containing the tool calls.
 * @param {import('../components/chatlog.js').Chatlog} chatlog - The chatlog instance.
 * @param {import('../app.js').default} app - The main application instance.
 * @param {function(object): boolean} filterCallback - A function to filter which tool calls to process.
 * @param {function(object): Promise<object>} executeCallback - An async function to execute a tool call and return the result.
 * @param {object} context - Additional context to pass to the callbacks.
 * @param {Array<object>} [tools=[]] - A list of available tools with their schemas.
 */
export async function processToolCalls(message, chatlog, app, filterCallback, executeCallback, context, tools = []) {
    if (message.value.role !== 'assistant') return;

    const { toolCalls, positions, isSelfClosings } = parseFunctionCalls(message.value.content, tools);
    if (toolCalls.length === 0) return;

    const applicableCalls = toolCalls.filter(filterCallback);
    if (applicableCalls.length === 0) return;

    // Assign unique IDs to each applicable call for tracking.
    applicableCalls.forEach(call => {
        call.id = `tool_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    });

    const toolResults = await Promise.all(
        applicableCalls.map(call => executeCallback(call, context))
    );

    // Add/override tool_call_id attributes (in reverse to avoid index shifts).
    let content = message.value.content;
    for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        const gtIndex = content.indexOf('>', pos.start);
        let startTag = content.slice(pos.start, gtIndex + 1);
        // Remove existing tool_call_id attributes
        startTag = startTag.replace(/\s+tool_call_id\s*=\s*["'][^"']*["']/g, '');
        // Insert new tool_call_id
        const insert = ` tool_call_id="${toolCalls[i].id}"`;
        const endSlice = isSelfClosings[i] ? -2 : -1;
        const endTag = isSelfClosings[i] ? '/>' : '>';
        startTag = startTag.slice(0, endSlice) + insert + endTag;
        content = content.slice(0, pos.start) + startTag + content.slice(gtIndex + 1);
    }
    message.value.content = content;
    UIManager.updateMessage(message);

    let toolContents = '';
    toolResults.forEach((tr, i) => {
        const inner = tr.error
            ? `<error>\n${tr.error}\n</error>`
            : `<content>\n${tr.content}\n</content>`;
        toolContents += `<dma:tool_response name="${applicableCalls[i].name}" tool_call_id="${tr.id}">\n${inner}\n</dma:tool_response>\n`;
    });

    if (toolContents) {
        UIManager.addMessage({ role: 'tool', content: toolContents });
        UIManager.addMessage({ role: 'assistant', content: null });
        hooks.onGenerateAIResponse.forEach(fn => fn({}, chatlog));
    }
}

/**
 * Creates a JSON file from the given data and triggers a download.
 *
 * @param {object|Array} data - The JSON data to export.
 * @param {string} filenameBase - The base name for the downloaded file.
 */
export function exportJson(data, filenameBase) {
    if (!data) {
        triggerError('No data to export.');
        return;
    }

    try {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `${filenameBase}_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        triggerError(`Failed to export data: ${error.message}`);
        log(1, 'Export failed', error);
    }
}

/**
 * Creates a file input to import a JSON file and processes its content.
 *
 * @param {string} accept - The accept attribute for the file input (e.g., 'application/json').
 * @param {function(object): void} onParsedData - The callback function to handle the parsed JSON data.
 */
export function importJson(accept, onParsedData) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsedData = JSON.parse(event.target.result);
                onParsedData(parsedData);
            } catch (error) {
                triggerError(`Failed to import file: ${error.message}`);
                log(1, 'Import failed', error);
            }
        };
        reader.readAsText(file);
    });
    input.click();
}
