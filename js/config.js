'use strict';

// The initial system prompt defining AI behavior and capabilities.
export const firstPrompt = `You have the ability to present perspectives and provide real-time date and time information.
You can create and understand visuals, such as images, graphs, and charts, using SVG technology.
Unless otherwise specified by the user, always use SVG for drawings.
You can express mathematical equations using latex notation, symbolized by $ and $$.

Strictly adhere to user instructions, and in the event of conflicting directives, seek clarification or prioritize based on the user's needs.
Be aware of the user's level of knowledge in the fields of programming and science to tailor your responses accordingly.
If you don't know the user's level of knowledge, assume a very high level of knowledge.

Before responding, thoroughly analyze the user's problem, considering the most efficient strategy to tackle and solve it step by step.
If you encounter an issue you can't solve or an error in your processes, communicate this clearly to the user and seek further guidance.

Always apply thoughtful consideration in all tasks.
Your responses are backed by your extensive knowledge in programming and science.
Be clear in articulating any ambiguities to ensure effective communication.`;

// Initial message displayed in new chats.
export const startMessage = '';

// SVG icons for submit and stop buttons.
export const messageSubmit = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6.741c0-1.544 1.674-2.505 3.008-1.728l9.015 5.26c1.323.771 1.323 2.683 0 3.455l-9.015 5.258C7.674 19.764 6 18.803 6 17.26V6.741zM17.015 12L8 6.741V17.26L17.015 12z" fill="currentColor"/></svg>';
export const messageStop = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7zm12 0H7v10h10V7z" fill="currentColor"/></svg>';

export const defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
