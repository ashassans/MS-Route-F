import { GoogleGenAI, Type } from '@google/genai';
import type { ProviderConfig, ModelConfig } from '../../types/gateway.ts';
import { decryptSecret } from '../security/encryption.ts';
import type { UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamChunk } from './types.ts';

/**
 * Resolves the real API key for a specific provider without cross-provider leakage.
 */
export function resolveProviderApiKey(provider: ProviderConfig): string {
  const stored = decryptSecret(provider.apiKey || '').trim();
  if (stored) return stored;

  switch (provider.type) {
    case 'gemini':
      return (process.env.GEMINI_API_KEY || '').trim();
    case 'anthropic':
      return (process.env.ANTHROPIC_API_KEY || '').trim();
    case 'openai':
      return (process.env.OPENAI_API_KEY || '').trim();
    case 'deepseek':
      return (process.env.DEEPSEEK_API_KEY || '').trim();
    case 'groq':
      return (process.env.GROQ_API_KEY || '').trim();
    case 'openrouter':
      return (process.env.OPENROUTER_API_KEY || '').trim();
    default:
      return '';
  }
}

/**
 * Performs a real connectivity and authentication check against the upstream provider.
 */
export async function pingProviderConnection(provider: ProviderConfig): Promise<{
  latencyMs: number;
  modelsCount?: number;
  detectedModels?: string[];
}> {
  const apiKey = resolveProviderApiKey(provider);
  const start = Date.now();

  if (!apiKey && provider.type !== 'custom') {
    throw new Error(`401 Unauthorized: No API key configured for ${provider.name}. Add an API key in Providers.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(provider.timeoutMs || 15000, 15000));

  try {
    if (provider.protocol === 'google-gemini' || provider.type === 'gemini') {
      const base = (provider.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
      const res = await fetch(`${base}/v1beta/models?pageSize=50&key=${encodeURIComponent(apiKey)}`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini API (${res.status}): ${body.slice(0, 180)}`);
      }
      const data = await res.json();
      const detectedModels: string[] = Array.isArray(data.models)
        ? data.models.map((m: any) => (m.name || '').replace(/^models\//, '')).filter(Boolean)
        : [];
      return {
        latencyMs: Date.now() - start,
        modelsCount: detectedModels.length,
        detectedModels,
      };
    }

    if (provider.protocol === 'anthropic-messages' || provider.type === 'anthropic') {
      const base = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
      const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...(provider.customHeaders || {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API (${res.status}): ${body.slice(0, 180)}`);
      }
      const data = await res.json();
      const detectedModels: string[] = Array.isArray(data.data)
        ? data.data.map((m: any) => m.id).filter(Boolean)
        : [];
      return {
        latencyMs: Date.now() - start,
        modelsCount: detectedModels.length,
        detectedModels,
      };
    }

    // OpenAI-compatible & Custom HTTP endpoints
    const base = provider.baseUrl.replace(/\/$/, '');
    const modelsUrl = base.endsWith('/v1') || base.includes('/openai') ? `${base}/models` : `${base}/v1/models`;
    const headers: Record<string, string> = {
      ...(provider.customHeaders || {}),
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const detectedModels: string[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => m.id).filter(Boolean)
        : [];
      return {
        latencyMs: Date.now() - start,
        modelsCount: detectedModels.length,
        detectedModels,
      };
    }

    // Some custom OpenAI-compatible inference servers only expose POST /chat/completions
    const probeModel = provider.defaultModel || provider.models[0];
    if ((res.status === 404 || res.status === 405) && probeModel) {
      const chatUrl = base.endsWith('/chat/completions')
        ? base
        : base.endsWith('/v1') || base.includes('/openai')
          ? `${base}/chat/completions`
          : `${base}/v1/chat/completions`;
      const probeRes = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          model: probeModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });
      if (probeRes.ok) {
        return {
          latencyMs: Date.now() - start,
          modelsCount: provider.models.length || 1,
          detectedModels: provider.models,
        };
      }
      const probeBody = await probeRes.text();
      throw new Error(`${provider.name} (${probeRes.status}): ${probeBody.slice(0, 180)}`);
    }

    const body = await res.text();
    throw new Error(`${provider.name} (${res.status}): ${body.slice(0, 180)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeProviderRequest(
  provider: ProviderConfig,
  modelConfig: ModelConfig,
  unifiedReq: UnifiedChatRequest,
  signal?: AbortSignal
): Promise<UnifiedChatResponse> {
  const rawKey = resolveProviderApiKey(provider);

  if (!rawKey && provider.type !== 'custom') {
    throw new Error(`401 Unauthorized: Missing API key for provider "${provider.name}". Please configure a valid API key.`);
  }

  if (provider.protocol === 'google-gemini' || provider.type === 'gemini') {
    return await executeGemini(provider, modelConfig, unifiedReq, rawKey);
  }

  if (provider.protocol === 'anthropic-messages' || provider.type === 'anthropic') {
    return await executeAnthropicNative(provider, modelConfig, unifiedReq, rawKey, signal);
  }

  return await executeOpenAiCompatible(provider, modelConfig, unifiedReq, rawKey, signal);
}

/**
 * Real Streaming Generator for upstream AI providers (Gemini SDK, Anthropic SSE, OpenAI SSE).
 */
export async function* executeProviderStream(
  provider: ProviderConfig,
  modelConfig: ModelConfig,
  unifiedReq: UnifiedChatRequest,
  signal?: AbortSignal
): AsyncGenerator<UnifiedStreamChunk> {
  const rawKey = resolveProviderApiKey(provider);

  if (!rawKey && provider.type !== 'custom') {
    throw new Error(`401 Unauthorized: Missing API key for provider "${provider.name}". Please configure a valid API key.`);
  }

  // 1. Google Gemini Native Stream
  if (provider.protocol === 'google-gemini' || provider.type === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: rawKey });
    const apiModel = modelConfig.apiModelName || 'gemini-2.5-flash';

    const promptParts = unifiedReq.messages.map((m) => {
      const textContent = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((b: any) => b.text || '').join(' ')
          : '';
      return `${m.role.toUpperCase()}: ${textContent}`;
    });

    const config: Record<string, any> = {
      systemInstruction: unifiedReq.system || undefined,
      temperature: unifiedReq.temperature,
      maxOutputTokens: unifiedReq.maxTokens,
    };

    if (unifiedReq.tools && unifiedReq.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: unifiedReq.tools.map((t) => ({
            name: t.name,
            description: t.description || '',
            parameters: t.parameters || { type: Type.OBJECT, properties: {} },
          })),
        },
      ];
    }

    const responseStream = await ai.models.generateContentStream({
      model: apiModel,
      contents: promptParts.join('\n\n'),
      config,
    });

    let totalInputTokens = Math.max(10, Math.floor(promptParts.join('\n\n').length / 4));
    let totalOutputTokens = 0;
    let finishReason = 'end_turn';

    for await (const chunk of responseStream) {
      if (signal?.aborted) break;
      if (chunk.usageMetadata?.promptTokenCount) {
        totalInputTokens = chunk.usageMetadata.promptTokenCount;
      }
      if (chunk.usageMetadata?.candidatesTokenCount) {
        totalOutputTokens = chunk.usageMetadata.candidatesTokenCount;
      }
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        finishReason = 'tool_use';
        for (const fc of chunk.functionCalls) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: fc.id || `toolu_${Date.now()}`,
              name: fc.name || 'tool',
              argumentsDelta: JSON.stringify(fc.args || {}),
            },
          };
        }
      }
      const text = chunk.text || '';
      if (text) {
        if (!chunk.usageMetadata?.candidatesTokenCount) {
          totalOutputTokens += Math.max(1, Math.floor(text.length / 4));
        }
        yield { type: 'delta', deltaText: text };
      }
    }

    yield {
      type: 'done',
      inputTokens: totalInputTokens,
      outputTokens: Math.max(1, totalOutputTokens),
      finishReason,
    };
    return;
  }

  // 2. Anthropic Messages Real SSE Stream
  if (provider.protocol === 'anthropic-messages' || provider.type === 'anthropic') {
    const base = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': rawKey,
      'anthropic-version': '2023-06-01',
      ...(provider.customHeaders || {}),
    };

    const body: Record<string, any> = {
      model: modelConfig.apiModelName,
      messages: unifiedReq.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      max_tokens: unifiedReq.maxTokens || 4096,
      stream: true,
    };
    if (unifiedReq.system) body.system = unifiedReq.system;
    if (unifiedReq.temperature !== undefined) body.temperature = unifiedReq.temperature;
    if (unifiedReq.tools && unifiedReq.tools.length > 0) {
      body.tools = unifiedReq.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object' },
      }));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API Error (${res.status}): ${errorText}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'end_turn';

    for await (const dataStr of readSseLines(res)) {
      if (signal?.aborted) break;
      try {
        const evt = JSON.parse(dataStr);
        if (evt.type === 'message_start' && evt.message?.usage?.input_tokens) {
          inputTokens = evt.message.usage.input_tokens;
        } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
          finishReason = 'tool_use';
          yield {
            type: 'tool_call',
            toolCall: {
              id: evt.content_block.id,
              name: evt.content_block.name,
              argumentsDelta: '',
            },
          };
        } else if (evt.type === 'content_block_delta') {
          if (evt.delta?.type === 'text_delta' && evt.delta.text) {
            yield { type: 'delta', deltaText: evt.delta.text };
          }
        } else if (evt.type === 'message_delta') {
          if (evt.delta?.stop_reason) finishReason = evt.delta.stop_reason;
          if (evt.usage?.output_tokens) outputTokens = evt.usage.output_tokens;
        }
      } catch {
        // Ignore non-JSON SSE keepalives
      }
    }

    yield {
      type: 'done',
      inputTokens: inputTokens || 50,
      outputTokens: outputTokens || 20,
      finishReason,
    };
    return;
  }

  // 3. OpenAI-Compatible Real SSE Stream
  const baseUrl = provider.baseUrl.replace(/\/$/, '');
  const url = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : baseUrl.endsWith('/v1') || baseUrl.includes('/openai')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

  const messages: any[] = [];
  if (unifiedReq.system) {
    messages.push({ role: 'system', content: unifiedReq.system });
  }
  for (const m of unifiedReq.messages) {
    messages.push({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
    });
  }

  const body: Record<string, any> = {
    model: modelConfig.apiModelName,
    messages,
    max_tokens: unifiedReq.maxTokens || 4096,
    stream: true,
  };
  if (unifiedReq.temperature !== undefined) body.temperature = unifiedReq.temperature;
  if (unifiedReq.tools && unifiedReq.tools.length > 0) {
    body.tools = unifiedReq.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object' },
      },
    }));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(provider.customHeaders || {}),
  };
  if (rawKey) {
    headers['Authorization'] = `Bearer ${rawKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${provider.name} API Error (${res.status}): ${errorText}`);
  }

  let outputTokens = 0;
  let finishReason = 'stop';

  for await (const dataStr of readSseLines(res)) {
    if (signal?.aborted) break;
    if (dataStr === '[DONE]') break;
    try {
      const parsed = JSON.parse(dataStr);
      const choice = parsed.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        outputTokens += Math.max(1, Math.floor(delta.content.length / 4));
        yield { type: 'delta', deltaText: delta.content };
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name || tc.id) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: tc.id || `call_${Date.now()}`,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments || '',
              },
            };
          }
        }
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    } catch {
      // Ignore partial comments
    }
  }

  yield {
    type: 'done',
    inputTokens: Math.max(10, Math.floor(JSON.stringify(messages).length / 4)),
    outputTokens: Math.max(1, outputTokens),
    finishReason,
  };
}

async function* readSseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        yield trimmed.slice(5).trim();
      }
    }
  }
  if (buffer.trim().startsWith('data:')) {
    yield buffer.trim().slice(5).trim();
  }
}

async function executeGemini(
  _provider: ProviderConfig,
  modelConfig: ModelConfig,
  req: UnifiedChatRequest,
  apiKey: string
): Promise<UnifiedChatResponse> {
  const ai = new GoogleGenAI({ apiKey });
  const modelName = modelConfig.apiModelName || 'gemini-2.5-flash';

  const contents = req.messages.map((m) => {
    const text = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((b: any) => b.text || '').join(' ')
        : '';
    return `${m.role.toUpperCase()}: ${text}`;
  }).join('\n\n');

  const config: Record<string, any> = {
    systemInstruction: req.system || undefined,
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens,
  };

  if (req.tools && req.tools.length > 0) {
    config.tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: Type.OBJECT, properties: {} },
        })),
      },
    ];
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config,
  });

  const content = response.text || '';
  const toolCalls = response.functionCalls?.map((fc) => ({
    id: fc.id || `toolu_${Date.now()}`,
    name: fc.name || 'tool',
    arguments: JSON.stringify(fc.args || {}),
  }));

  const inputTokens = response.usageMetadata?.promptTokenCount || Math.max(10, Math.floor(contents.length / 4));
  const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.max(5, Math.floor(content.length / 4));

  return {
    id: `msg_gemini_${Date.now()}`,
    model: modelConfig.id,
    content,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: toolCalls && toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    usage: { inputTokens, outputTokens },
  };
}

async function executeAnthropicNative(
  provider: ProviderConfig,
  modelConfig: ModelConfig,
  req: UnifiedChatRequest,
  apiKey: string,
  signal?: AbortSignal
): Promise<UnifiedChatResponse> {
  const base = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...(provider.customHeaders || {}),
  };

  const body: Record<string, any> = {
    model: modelConfig.apiModelName,
    messages: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    max_tokens: req.maxTokens || 4096,
  };
  if (req.system) body.system = req.system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object' },
    }));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  const toolBlocks = Array.isArray(data.content) ? data.content.filter((b: any) => b.type === 'tool_use') : [];

  return {
    id: data.id || `msg_ant_${Date.now()}`,
    model: modelConfig.id,
    content: textBlock ? textBlock.text : '',
    toolCalls: toolBlocks.length > 0
      ? toolBlocks.map((tb: any) => ({
          id: tb.id,
          name: tb.name,
          arguments: JSON.stringify(tb.input || {}),
        }))
      : undefined,
    stopReason: data.stop_reason || 'end_turn',
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

async function executeOpenAiCompatible(
  provider: ProviderConfig,
  modelConfig: ModelConfig,
  req: UnifiedChatRequest,
  apiKey: string,
  signal?: AbortSignal
): Promise<UnifiedChatResponse> {
  const baseUrl = provider.baseUrl.replace(/\/$/, '');
  const url = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : baseUrl.endsWith('/v1') || baseUrl.includes('/openai')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

  const messages: any[] = [];
  if (req.system) {
    messages.push({ role: 'system', content: req.system });
  }
  for (const m of req.messages) {
    messages.push({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
    });
  }

  const body: any = {
    model: modelConfig.apiModelName,
    messages,
    max_tokens: req.maxTokens || 4096,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object' },
      },
    }));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(provider.customHeaders || {}),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${provider.name} API Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message || {};

  return {
    id: data.id || `chatcmpl-${Date.now()}`,
    model: modelConfig.id,
    content: message.content || '',
    toolCalls: message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments || '{}',
    })),
    stopReason: choice?.finish_reason || 'stop',
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}
