/**
 * @fileoverview Logging and error handling utilities.
 */

'use strict';

import { hooks } from '../hooks.js';
import { DEBUG_LEVEL } from '../config.js';

/**
 * Logs a message to the console if the level is high enough.
 * @param {number} level - The log level.
 * @param {...*} args - The arguments to log.
 */
export function log(level, ...args) {
    if (DEBUG_LEVEL < level) return;
    const prefixes = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'FULLTRACE'];
    const prefix = `[${prefixes[level]}]`;
    const consoles = [console.log, console.error, console.warn, console.info, console.log, console.log, console.log];
    consoles[level](prefix, ...args);
}

/**
 * Triggers an error by logging it and notifying error listeners.
 * @param {...*} args - The arguments to include in the error.
 */
export function triggerError(...args) {
    log(1, ...args);
    hooks.onError.forEach(fn => fn(...args));
}
