'use strict';

const toolsDescription = `
## Tools:

You use tools via function calls to help you solve questions. Make sure to use the following format for function calls, including the <dma:function_call> and </dma:function_call> tags. Function call should follow the following XML-inspired format:
<dma:function_call name="example_tool_name">
<parameter name="example_arg_name1">
example_arg_value1
</parameter>
<parameter name="example_arg_name2">
example_arg_value2
</parameter>
</dma:function_call>
Do not escape any of the function call arguments. The arguments will be parsed as normal text. There is one exception: If you need to write </dma:function_call> or </parameter> as value inside a <parameter>, write it like <\/dma:function_call> or <\/parameter>.


You can use multiple tools in parallel by calling them together.

### Available Tools:

1.  **Code Execution**
   - **Description:**: This is a stateful code interpreter you have access to. You can use the code interpreter tool to check the code execution output of the code.
Here the stateful means that it's a REPL (Read Eval Print Loop) like environment, so previous code execution result is preserved.
Here are some tips on how to use the code interpreter:
- Make sure you format the code correctly with the right indentation and formatting.
- You have access to some default environments with some basic and STEM libraries:
  - Environment: Python 3.12.3
  - Basic libraries: tqdm, ecdsa
  - Data processing: numpy, scipy, pandas, matplotlib
  - Math: sympy, mpmath, statsmodels, PuLP
  - Physics: astropy, qutip, control
  - Biology: biopython, pubchempy, dendropy
  - Chemistry: rdkit, pyscf
  - Game Development: pygame, chess
  - Multimedia: mido, midiutil
  - Machine Learning: networkx, torch
  - others: snappy
Keep in mind you have no internet access. Therefore, you CANNOT install any additional packages via pip install, curl, wget, etc.
You must import any packages you need in the code.
Do not run code that terminates or exits the repl session.
   - **Action**: \`code_execution\`
   - **Arguments**: 
     - \`code\`: Code : The code to be executed. (type: string) (required)

2.  **Browse Page**
   - **Description:**: Use this tool to request content from any website URL. It will fetch the page and process it via the LLM summarizer, which extracts/summarizes based on the provided instructions.
   - **Action**: \`browse_page\`
   - **Arguments**: 
     - \`url\`: Url : The URL of the webpage to browse. (type: string) (required)
     - \`instructions\`: Instructions : The instructions are a custom prompt guiding the summarizer on what to look for. Best use: Make instructions explicit, self-contained, and dense—general for broad overviews or specific for targeted details. This helps chain crawls: If the summary lists next URLs, you can browse those next. Always keep requests focused to avoid vague outputs. (type: string) (required)

3.  **Web Search**
   - **Description:**: This action allows you to search the web. You can use search operators like site:reddit.com when needed.
   - **Action**: \`web_search\`
   - **Arguments**: 
     - \`query\`: Query : The search query to look up on the web. (type: string) (required)
     - \`num_results\`: Num Results : The number of results to return. It is optional, default 10, max is 30. (type: integer)(optional) (default: 10)

4.  **Web Search With Snippets**
   - **Description:**: Search the internet and return long snippets from each search result. Useful for quickly confirming a fact without reading the entire page.
   - **Action**: \`web_search_with_snippets\`
   - **Arguments**: 
     - \`query\`: Query : Search query; you may use operators like site:, filetype:, "exact" for precision. (type: string) (required)

9.  **View Image**
   - **Description:**: Look at an image at a given url.
   - **Action**: \`view_image\`
   - **Arguments**: 
     - \`image_url\`: Image Url : The url of the image to view. (type: string) (required)



## Render Components:

You use render components to display content to the user in the final response. Make sure to use the following format for render components, including the  tags. Render component should follow the following XML-inspired format:
Do not escape any of the arguments. The arguments will be parsed as normal text.

### Available Render Components:

1.  **Render Inline Citation**
   - **Description:**: Display an inline citation as part of your final response. This component must be placed inline, directly after the final punctuation mark of the relevant sentence, paragraph, bullet point, or table cell.
Do not cite sources any other way; always use this component to render citation. You should only render citation from web search, browse page, or X search results, not other sources.
This component only takes one argument, which is "citation_id" and the value should be the citation_id extracted from the previous web search or browse page tool call result which has the format of '[web:citation_id]' or '[post:citation_id]'.
   - **Type**: \`render_inline_citation\`
   - **Arguments**: 
     - \`citation_id\`: Citation Id : The id of the citation to render. Extract the citation_id from the previous web search or browse page tool call result which has the format of '[web:citation_id]'. (type: integer) (required)


Interweave render components within your final response where appropriate to enrich the visual presentation. In the final response, you must never use a function call, and may only use render components.
`;

export const mcpPlugin = {
    name: 'mcp',
    hooks: {
        onSettingsRender: function (settingsEl) {
            if (settingsEl.querySelector('#mcpServer')) return;

            const p = document.createElement('p');
            const label = document.createElement('label');
            label.for = 'mcpServer';
            label.textContent = 'MCP Server URL';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'mcpServer';
            input.placeholder = 'e.g., http://localhost:3000/mcp';
            input.value = localStorage.getItem('gptChat_mcpServer') || '';
            input.addEventListener('input', () => localStorage.setItem('gptChat_mcpServer', input.value));
            p.appendChild(label);
            p.appendChild(document.createElement('br'));
            p.appendChild(input);
            settingsEl.appendChild(p);
        },
        beforeApiCall: function (payload) {
            const mcpUrl = localStorage.getItem('gptChat_mcpServer');
            if (mcpUrl && payload.messages[0].role === 'system') {
                payload.messages[0].content += toolsDescription;
            }
            return payload;
        },
        onMessageComplete: async function (message, chatbox) {
            if (message.value.role !== 'assistant') return;

            const { toolCalls, cleanedContent } = parseFunctionCalls(message.value.content);
            message.value.content = cleanedContent;
            if (toolCalls.length > 0) {
                const toolResults = await Promise.all(toolCalls.map(async (tc) => {
                    const result = await mcpJsonRpc('call_tool', { name: tc.name, arguments: tc.params });
                    if (tc.name === 'web_search' || tc.name === 'browse_page' || tc.name.startsWith('x_')) {
                        message.metadata = { ...message.metadata || {}, sources: result.sources || [] };
                    }
                    return { role: 'tool', content: JSON.stringify(result) };
                }));

                toolResults.forEach(tr => message.chatlog.addMessage(tr));
                chatbox.update();
                // Auto-continue by streaming new assistant response
                const chatlog = chatbox.chatlog;
                chatlog.addMessage(null);
                chatbox.update();
                await generateAIResponse(chatbox);
            }
        },
        onPostFormatContent: function (wrapper, message) {
            wrapper.querySelectorAll('dma\\:render[type="render_inline_citation"]').forEach(node => {
                const argNode = node.querySelector('argument[name="citation_id"]');
                const id = argNode ? parseInt(argNode.textContent.trim()) : null;
                if (id) {
                    const source = message.metadata?.sources?.[id - 1];
                    if (source) {
                        const sup = document.createElement('sup');
                        const a = document.createElement('a');
                        a.href = source.url;
                        a.title = source.title || 'Source';
                        a.textContent = `[${id}]`;
                        sup.appendChild(a);
                        node.parentNode.replaceChild(sup, node);
                    } else {
                        // Fallback if no source: remove or placeholder
                        node.parentNode.removeChild(node);
                    }
                } else {
                    node.parentNode.removeChild(node);
                }
            });
        }
    }
};

// Parser for <dma:function_call>
function parseFunctionCalls(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<root>${content}</root>`, 'application/xml');
    const toolCalls = [];
    doc.querySelectorAll('dma\\:function_call').forEach(node => {
        const name = node.getAttribute('name');
        const params = {};
        node.querySelectorAll('parameter').forEach(param => {
            params[param.getAttribute('name')] = param.textContent.trim();
        });
        toolCalls.push({ name, params });
        node.parentNode.removeChild(node);
    });
    return { toolCalls, cleanedContent: doc.documentElement.innerHTML };
}

// MCP JSON-RPC
async function mcpJsonRpc(method, params = {}) {
    const url = localStorage.getItem('gptChat_mcpServer');
    if (!url) throw new Error('No MCP server URL set');

    const body = {
        jsonrpc: '2.0',
        method,
        params,
        id: Math.floor(Math.random() * 1000000)
    };

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) throw new Error(`MCP error: ${resp.statusText}`);

        const data = await resp.json();
        if (data.error) throw new Error(data.error.message || 'MCP call failed');

        return data.result;
    } catch (error) {
        throw new AggregateError(
            [error],
            `Failed to perform MCP JSON-RPC call.\nURL: ${url}, Method: ${method}, Params: ${JSON.stringify(params)}.\nOriginal error: ${error.message || 'Unknown'}.`
        );
    }
}
