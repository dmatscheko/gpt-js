'use strict';

import Controller from './controller.js';

document.addEventListener('DOMContentLoaded', async () => {
    const controller = new Controller();
    await controller.init();
});
