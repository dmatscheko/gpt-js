/**
 * @fileoverview Main entry point for the application.
 */

'use strict';

import App from './app.js';
import { hooks } from './hooks.js';

document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    hooks.onAppReady.forEach(fn => fn(app));
    await app.init();
});
