'use strict';

// Global variables for controlling API requests and state.
let controller = new AbortController(); // Controller to abort ongoing API requests.
let receiving = false; // Flag indicating if a response is being received from the API. It prevents multiple parallel messages to the server.
let regenerateLastAnswer = false; // Flag to regenerate the last answer without new input.

// The initial system prompt defining AI behavior and capabilities.
const firstPrompt = `You have the ability to present perspectives and provide real-time date and time information.
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
const startMessage = '';

// SVG icons for submit and stop buttons.
const messageSubmit = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6.741c0-1.544 1.674-2.505 3.008-1.728l9.015 5.26c1.323.771 1.323 2.683 0 3.455l-9.015 5.258C7.674 19.764 6 18.803 6 17.26V6.741zM17.015 12L8 6.741V17.26L17.015 12z" fill="currentColor"/></svg>';
const messageStop = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7zm12 0H7v10h10V7z" fill="currentColor"/></svg>';

// Default SVG avatars for user (ping) and assistant (pong).
const avatarPing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<circle cx="40" cy="40" r="40" fill="#FFC107" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<path d="M 25 55 Q 40 65, 55 55" fill="none" stroke="white" stroke-width="4" />
</svg>`;
const avatarPong = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
<rect x="2" y="2" width="76" height="76" fill="#2196F3" />
<circle cx="25" cy="30" r="5" fill="white" />
<circle cx="55" cy="30" r="5" fill="white" />
<rect x="15" y="50" width="50" height="5" fill="#ffffff" />
<rect x="25" y="60" width="30" height="5" fill="#ffffff" />
</svg>`;

const defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
