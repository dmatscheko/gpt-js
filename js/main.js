/**
 * @fileoverview Main entry point for the application.
 */

'use strict';

import App from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();
});
