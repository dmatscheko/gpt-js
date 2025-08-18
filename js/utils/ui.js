/**
 * @fileoverview UI utility functions for showing and hiding elements.
 */

'use strict';

/**
 * Displays the login section and hides the logout section.
 */
export function showLogin() {
    document.getElementById('session-login').style.display = 'block';
    document.getElementById('session-logout').style.display = 'none';
}

/**
 * Displays the logout section and hides the login section.
 */
export function showLogout() {
    document.getElementById('session-login').style.display = 'none';
    document.getElementById('session-logout').style.display = 'block';
}

/**
 * Helper function to create a tool button.
 * @param {string} title - The button's title (tooltip).
 * @param {string} svgHtml - The SVG icon for the button.
 * @param {function} onClick - The click event handler.
 * @returns {HTMLButtonElement} The created button element.
 */
export function createControlButton(title, svgHtml, onClick) {
    const button = document.createElement('button');
    button.title = title;
    button.classList.add('toolButton', 'small');
    button.innerHTML = svgHtml;
    if (!onClick) return button;
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(e);
    });
    return button;
}
