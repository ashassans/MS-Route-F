import type { UnifiedChatRequest, UnifiedMessage, UnifiedTool, UnifiedChatResponse } from './types.ts';

/**
 * Parses Anthropic Messages API request format into UnifiedChatRequest
 */
export function parseAnthropicRequest(body: Record<string, any>): UnifiedChatRequest {
  const model = body.model || 'claude-3-7-sonnet';
  const stream = Boolean(body.stream);
  const maxTokens = body.max_tokens || 4096;
  const temperature = body.temperature;
  const topP = body.top_p;

  // System prompt can be a string or array of blocks
  let system = '';
  if (typeof body.system === 'string') {
    system = body.system;
  } else if (Array.isArray(body.system)) {
    system = body.system.map((b: any) => (typeof b === 'string' ? b : b.text || '')).join('\n\n');
  }

  const messages: UnifiedMessage[] = [];

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';

      if (typeof msg.content === 'string') {
        messages.push({ role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // May contain text, image, tool_use, or tool_result blocks
        for (const block of msg.content) {
          if (block.type === 'text') {
            messages.push({ role, content: block.text || '' });
          } else if (block.type === 'tool_use') {
            messages.push({
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: block.id,
                  type: 'function',
                  function: {
                    name: block.name,
                    arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
                  },
                },
              ],
            });
          } else if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              toolCallId: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content || ''),
            });
          } else if (block.type === 'image') {
            // Support base64 image or url
            const source = block.source;
            const url = source?.type === 'base64'
              ? `data:${source.media_type};base64,${source.data}`
              : source?.url || '';
            messages.push({
              role: 'user',
              content: [{ type: 'image_url', image_url: { url } }],
            });
          }
        }
      }
    }
  }

  // Convert tools
  const tools: UnifiedTool[] = [];
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      tools.push({
        name: t.name,
        description: t.description,
        parameters: t.input_schema || t.parameters,
      });
    }
  }

  return {
    model,
    messages,
    system,
    maxTokens,
    temperature,
    topP,
    stream,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: body.tool_choice,
  };
}

/**
 * Parses OpenAI Chat Completions API request format into UnifiedChatRequest
 */
export function parseOpenAiRequest(body: Record<string, any>): UnifiedChatRequest {
  const model = body.model || 'gpt-4o';
  const stream = Boolean(body.stream);
  const maxTokens = body.max_tokens || body.max_completion_tokens || 4096;
  const temperature = body.temperature;
  const topP = body.top_p;

  let system = '';
  const messages: UnifiedMessage[] = [];

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === 'system') {
        system = (system ? system + '\n\n' : '') + (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          toolCallId: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      } else {
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        messages.push({
          role,
          content: msg.content,
          toolCalls: msg.tool_calls,
        });
      }
    }
  }

  const tools: UnifiedTool[] = [];
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (t.type === 'function' && t.function) {
        tools.push({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        });
      }
    }
  }

  return {
    model,
    messages,
    system,
    maxTokens,
    temperature,
    topP,
    stream,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: body.tool_choice,
  };
}

/**
 * Formats a UnifiedChatResponse into standard Anthropic Messages JSON response
 */
export function formatAnthropicResponse(res: UnifiedChatResponse): Record<string, any> {
  const contentBlocks: any[] = [];

  if (res.content) {
    contentBlocks.push({
      type: 'text',
      text: res.content,
    });
  }

  if (res.toolCalls && res.toolCalls.length > 0) {
    for (const call of res.toolCalls) {
      let inputObj = {};
      try {
        inputObj = JSON.parse(call.arguments || '{}');
      } catch {
        inputObj = { raw: call.arguments };
      }
      contentBlocks.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: inputObj,
      });
    }
  }

  return {
    id: res.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: res.model,
    content: contentBlocks,
    stop_reason: res.stopReason || (res.toolCalls?.length ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: {
      input_tokens: res.usage.inputTokens,
      output_tokens: res.usage.outputTokens,
    },
  };
}

/**
 * Formats a UnifiedChatResponse into standard OpenAI Chat Completion JSON response
 */
export function formatOpenAiResponse(res: UnifiedChatResponse): Record<string, any> {
  const message: any = {
    role: 'assistant',
    content: res.content || null,
  };

  if (res.toolCalls && res.toolCalls.length > 0) {
    message.tool_calls = res.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: {
        name: call.name,
        arguments: call.arguments,
      },
    }));
  }

  return {
    id: res.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: res.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: res.stopReason || (res.toolCalls?.length ? 'tool_calls' : 'stop'),
      },
    ],
    usage: {
      prompt_tokens: res.usage.inputTokens,
      completion_tokens: res.usage.outputTokens,
      total_tokens: res.usage.inputTokens + res.usage.outputTokens,
    },
  };
}
