'use strict';

import { hooks } from './hooks.js';
import { DEBUG_LEVEL } from './config.js';

export function getDatePrompt() {
    const now = new Date();
    return `\n\nKnowledge cutoff: none\nCurrent date: ${now.toISOString().slice(0, 10)}\nCurrent time: ${now.toTimeString().slice(0, 5)}`;
}

export function showLogin() {
    document.getElementById('session-login').style.display = 'block';
    document.getElementById('session-logout').style.display = 'none';
}

export function showLogout() {
    document.getElementById('session-login').style.display = 'none';
    document.getElementById('session-logout').style.display = 'block';
}

export function triggerError(...args) {
    log(1, ...args);
    hooks.onError.forEach(fn => fn(...args));
}

export function log(level, ...args) {
    if (DEBUG_LEVEL < level) return;
    const prefixes = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'FULLTRACE'];
    const prefix = `[${prefixes[level]}]`;
    const consoles = [console.log, console.error, console.warn, console.info, console.log, console.log, console.log];
    consoles[level](prefix, ...args);
}
