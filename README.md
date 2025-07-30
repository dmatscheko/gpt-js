# GPT JS Chat

An HTML-based chat application that uses the OpenAI chat API.

It uses the streaming API for the GPT-3.5-turbo model and, additionally to writing text, tables and code, is capable of creating formulas and simple SVG images.

The drawings are not very good yet, but better than nothing. You can improve them using the chat.

In some cases, it even recognizes the SVG images.

If your API key has acces to GPT-4, you can choose that model in the settings.

### Usage:

You can test it at: [https://huggingface.co/spaces/dma123/gpt-js](https://huggingface.co/spaces/dma123/gpt-js).

You can also run it locally: `python -m http.server 8000`

1. Create an OpenAI account at [https://platform.openai.com/account](https://platform.openai.com/account).
2. Create an API key at [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys).
3. Enter the API key at the login dialog. This can be called by clicking login at the settings panel (gear button).

### Screenshot:

This screenshot was "randomly selected" because its output was ok-ish ;)

![screenshot.png](screenshot.png)
