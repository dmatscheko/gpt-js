'use strict';

import { log } from '../utils/logger.js';

function renderStats(chatlog) {
    if (!chatlog) {
        return '<p>No chat loaded.</p>';
    }

    const messageCount = chatlog.getActiveMessageValues().length;
    const alternatives = chatlog.rootAlternatives;
    let totalAlternatives = 0;
    const stack = [alternatives];
    while (stack.length > 0) {
        const alt = stack.pop();
        if (alt) {
            totalAlternatives += alt.messages.length;
            alt.messages.forEach(msg => {
                if (msg.answerAlternatives) {
                    stack.push(msg.answerAlternatives);
                }
            });
        }
    }

    return `
        <div id="stats-content">
            <h2>Chat Statistics</h2>
            <p>Total messages in active chat: ${messageCount}</p>
            <p>Total messages including all alternatives: ${totalAlternatives}</p>
        </div>
    `;
}

export const statsPlugin = {
    hooks: {
        onChatUpdated: (chatlog) => {
            log(4, 'statsPlugin: onChatUpdated called');
            const statsTab = document.getElementById('stats-tab');
            if (statsTab) {
                statsTab.innerHTML = renderStats(chatlog);
            }
        },
    },
};
