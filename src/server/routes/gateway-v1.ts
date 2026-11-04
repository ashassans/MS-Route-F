import { Router, Request, Response } from 'express';
import { db } from '../store/db.ts';
import { parseAnthropicRequest, parseOpenAiRequest, formatAnthropicResponse, formatOpenAiResponse } from '../adapters/protocol-converter.ts';
import { resolveRoute } from '../engine/router.ts';
import { executeWithFallback } from '../engine/fallback.ts';
import { executeProviderStream } from '../adapters/executor.ts';
import { RequestLog } from '../../types/gateway.ts';

const router = Router();

// Middleware: Authenticate Gateway API Key & Check Kill Switch
function authenticateGateway(req: Request, res: Response, next: () => void) {
  const settings = db.getSettings();

  // Check emergency kill switch first
  if (settings.emergencyKillSwitch) {
    return res.status(503).json({
      error: {
        type: 'service_unavailable_error',
        message: 'NexusGate Emergency Kill Switch is ACTIVE. All outgoing AI provider requests are paused by the owner.',
      },
    });
  }

  // Extract API key from Authorization header or x-api-key header
  let rawKey = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim();
  } else if (req.headers['x-api-key']) {
    rawKey = String(req.headers['x-api-key']).trim();
  }

  // Also allow requests from internal playground without explicit key
  const isPlayground = req.headers['x-nexus-client'] === 'playground';

  if (!rawKey && !isPlayground) {
    return res.status(401).json({
      error: {
        type: 'authentication_error',
        message: 'Invalid or missing API key. Please pass Authorization: Bearer <GATEWAY_API_KEY> or x-api-key: <GATEWAY_API_KEY>.',
      },
    });
  }

  if (rawKey) {
    const verified = db.verifyApiKey(rawKey);
    if (!verified) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'API key is invalid or has been revoked.',
        },
      });
    }
  }

  next();
}

/**
 * POST /v1/messages - Anthropic Messages API compatible endpoint for Claude Code
 */
router.post('/messages', authenticateGateway, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientType = req.headers['user-agent']?.toLowerCase().includes('claude')
    ? 'claude-code'
    : req.headers['x-nexus-client'] === 'playground'
      ? 'playground'
      : 'other';

  try {
    const parsed = parseAnthropicRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);

    // If client requested streaming
    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const msgId = `msg_${Date.now()}`;
      // 1. message_start
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: {
            id: msgId,
            type: 'message',
            role: 'assistant',
            model: route.selectedModel.id,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 350, output_tokens: 0 },
          },
        })}\n\n`
      );

      // 2. content_block_start
      res.write(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        })}\n\n`
      );

      let totalOutputTokens = 0;
      let stopReason = 'end_turn';

      try {
        const stream = executeProviderStream(route.selectedProvider, route.selectedModel, parsed);
        for await (const chunk of stream) {
          if (chunk.type === 'delta' && chunk.deltaText) {
            totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
            res.write(
              `event: content_block_delta\ndata: ${JSON.stringify({
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: chunk.deltaText },
              })}\n\n`
            );
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            stopReason = 'tool_use';
            res.write(
              `event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: chunk.toolCall.id,
                  name: chunk.toolCall.name || 'tool',
                  input: {},
                },
              })}\n\n`
            );
          } else if (chunk.type === 'done') {
            stopReason = chunk.finishReason || stopReason;
          }
        }
      } catch (streamErr: any) {
        console.error('Streaming error during generation:', streamErr);
        res.write(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: streamErr.message },
          })}\n\n`
        );
      }

      // 3. content_block_stop
      res.write(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0,
        })}\n\n`
      );

      // 4. message_delta
      res.write(
        `event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: totalOutputTokens || 60 },
        })}\n\n`
      );

      // 5. message_stop
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();

      // Record request log
      const latencyMs = Date.now() - startTime;
      const log: RequestLog = {
        id: `req_${Date.now()}`,
        timestamp: new Date().toISOString(),
        clientType,
        endpoint: '/v1/messages',
        requestedModel: parsed.model,
        resolvedModel: route.selectedModel.displayName,
        selectedProvider: route.selectedProvider.name,
        routingStrategy: route.strategy,
        status: 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: 350,
        outputTokens: totalOutputTokens || 60,
        estimatedCostUsd: Number((((350 / 1e6) * (route.selectedModel.pricing.inputPer1MTokens || 0.15)) +
          (((totalOutputTokens || 60) / 1e6) * (route.selectedModel.pricing.outputPer1MTokens || 0.60))).toFixed(5)),
        retryCount: 0,
        fallbackHistory: [],
        streaming: true,
      };
      db.addLog(log);
      return;
    }

    // Non-streaming execution with automatic failover
    const execRes = await executeWithFallback(route, parsed);
    const anthropicResponse = formatAnthropicResponse(execRes.response);
    const latencyMs = Date.now() - startTime;

    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number((((inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15)) +
      ((outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.60))).toFixed(5));

    // Record Log
    const log: RequestLog = {
      id: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      clientType,
      endpoint: '/v1/messages',
      requestedModel: parsed.model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      routingStrategy: route.strategy,
      status: execRes.wasFallback ? 'fallback_success' : 'success',
      statusCode: 200,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      retryCount: execRes.retryCount,
      fallbackHistory: execRes.fallbackHistory,
      streaming: false,
    };
    db.addLog(log);

    return res.json(anthropicResponse);
  } catch (err: any) {
    console.error('Messages API error:', err);
    const latencyMs = Date.now() - startTime;
    const log: RequestLog = {
      id: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      clientType,
      endpoint: '/v1/messages',
      requestedModel: req.body?.model || 'unknown',
      resolvedModel: 'Error',
      selectedProvider: 'None',
      routingStrategy: 'error',
      status: 'error',
      statusCode: 500,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      retryCount: 0,
      fallbackHistory: [],
      errorMessage: err.message,
      streaming: Boolean(req.body?.stream),
    };
    db.addLog(log);

    return res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: err.message || 'Internal AI Gateway Error',
      },
    });
  }
});

/**
 * POST /v1/messages/count_tokens - Claude Code token counter endpoint
 */
router.post('/messages/count_tokens', authenticateGateway, (req: Request, res: Response) => {
  const parsed = parseAnthropicRequest(req.body);
  const text = parsed.messages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join(' ');
  const estimatedTokens = Math.max(1, Math.floor((text.length + (parsed.system?.length || 0)) / 3.8));

  return res.json({ input_tokens: estimatedTokens });
});

/**
 * POST /v1/chat/completions - OpenAI API compatible endpoint
 */
router.post('/chat/completions', authenticateGateway, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientType = req.headers['x-nexus-client'] === 'playground' ? 'playground' : 'openai-sdk';

  try {
    const parsed = parseOpenAiRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);

    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const chunkId = `chatcmpl-${Date.now()}`;
      let totalOutputTokens = 0;

      try {
        const stream = executeProviderStream(route.selectedProvider, route.selectedModel, parsed);
        for await (const chunk of stream) {
          if (chunk.type === 'delta' && chunk.deltaText) {
            totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
            const openAiChunk = {
              id: chunkId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: route.selectedModel.id,
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.deltaText },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
          } else if (chunk.type === 'done') {
            const finalChunk = {
              id: chunkId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: route.selectedModel.id,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: chunk.finishReason || 'stop',
                },
              ],
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          }
        }
      } catch (streamErr: any) {
        console.error('OpenAI stream chunk error:', streamErr);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      const latencyMs = Date.now() - startTime;
      const log: RequestLog = {
        id: `req_${Date.now()}`,
        timestamp: new Date().toISOString(),
        clientType,
        endpoint: '/v1/chat/completions',
        requestedModel: parsed.model,
        resolvedModel: route.selectedModel.displayName,
        selectedProvider: route.selectedProvider.name,
        routingStrategy: route.strategy,
        status: 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: 250,
        outputTokens: totalOutputTokens || 50,
        estimatedCostUsd: Number((((250 / 1e6) * (route.selectedModel.pricing.inputPer1MTokens || 0.15)) +
          (((totalOutputTokens || 50) / 1e6) * (route.selectedModel.pricing.outputPer1MTokens || 0.60))).toFixed(5)),
        retryCount: 0,
        fallbackHistory: [],
        streaming: true,
      };
      db.addLog(log);
      return;
    }

    // Non-streaming execution
    const execRes = await executeWithFallback(route, parsed);
    const openAiResponse = formatOpenAiResponse(execRes.response);
    const latencyMs = Date.now() - startTime;

    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number((((inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15)) +
      ((outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.60))).toFixed(5));

    const log: RequestLog = {
      id: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      clientType,
      endpoint: '/v1/chat/completions',
      requestedModel: parsed.model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      routingStrategy: route.strategy,
      status: execRes.wasFallback ? 'fallback_success' : 'success',
      statusCode: 200,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      retryCount: execRes.retryCount,
      fallbackHistory: execRes.fallbackHistory,
      streaming: false,
    };
    db.addLog(log);

    return res.json(openAiResponse);
  } catch (err: any) {
    console.error('Chat completions error:', err);
    return res.status(500).json({
      error: {
        message: err.message || 'Internal Gateway Error',
        type: 'api_error',
        code: 500,
      },
    });
  }
});

/**
 * POST /v1/responses - OpenAI Responses API endpoint
 */
router.post('/responses', authenticateGateway, async (req: Request, res: Response) => {
  req.url = '/chat/completions';
  return router(req, res, () => {});
});

/**
 * GET /v1/models - Model Registry listing in standard OpenAI/Anthropic format
 */
router.get('/models', authenticateGateway, (_req: Request, res: Response) => {
  const models = db.getModels();
  const aliases = db.getAliases();

  const data = [
    ...models.map((m) => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: m.providerId,
      permission: [],
      root: m.id,
      parent: null,
      display_name: m.displayName,
      context_window: m.contextWindow,
      capabilities: m.capabilities,
    })),
    ...aliases.map((a) => ({
      id: a.alias,
      object: 'model_alias',
      created: 1700000000,
      owned_by: 'nexusgate',
      permission: [],
      root: a.targetId,
      parent: null,
      display_name: `${a.alias} (Alias -> ${a.targetId})`,
      description: a.description,
    })),
  ];

  return res.json({ object: 'list', data });
});

export default router;
