/**
 * @fileoverview Custom DevTools formatters for the AIFlow Chat application.
 * To use, enable "Custom formatters" in Chrome DevTools settings (under the "Experiments" tab).
 * Then, you can log objects like the central store and they will appear nicely formatted in the console.
 * e.g., `console.log(window.app.store);`
 */

'use strict';

// A custom formatter for the application's central store.
const storeFormatter = {
    /**
     * @param {*} obj - The object to check.
     * @returns {Array|null} A JSONML array for the header, or null if the object is not a store.
     */
    header: function(obj) {
        // Identify the store object by checking for its methods
        if (obj && typeof obj.get === 'function' && typeof obj.set === 'function' && typeof obj.subscribe === 'function' && typeof obj.getState === 'function') {
            return ['div', { style: 'font-weight: bold; color: #4A4;' }, 'AIFlow Chat Store'];
        }
        return null;
    },

    /**
     * @param {*} obj - The object to check.
     * @returns {boolean} True if the object has a body to display.
     */
    hasBody: function(obj) {
        return true;
    },

    /**
     * @param {*} obj - The store object.
     * @param {Object} config - Configuration options.
     * @returns {Array} A JSONML array for the body.
     */
    body: function(obj, config) {
        const state = obj.getState();
        const children = Object.keys(state).map(key => {
            const value = state[key];
            const valueStyle = typeof value === 'object' && value !== null ? '' : 'color: #888;';

            return ['div', { style: 'padding-left: 15px; border-left: 1px solid #ccc; margin-left: 5px;' },
                ['span', { style: 'color: #A4A;' }, key + ': '],
                ['object', { object: value, config: config }]
            ];
        });
        return ['div', {}].concat(children);
    }
};

// Register the custom formatter with DevTools.
window.devtoolsFormatters = window.devtoolsFormatters || [];
window.devtoolsFormatters.push(storeFormatter);
