import { Router, type Request, type Response } from 'express';
import { db } from '../store/db.ts';
import { parseAnthropicRequest, parseOpenAiRequest, formatAnthropicResponse, formatOpenAiResponse } from '../adapters/protocol-converter.ts';
import { resolveRoute } from '../engine/router.ts';
import { executeWithFallback, openStreamWithFallback } from '../engine/fallback.ts';
import { liveTracker } from '../engine/live-tracker.ts';
import type { RequestLog } from '../../types/gateway.ts';

const router = Router();

function isPlaygroundHeader(req: Request): boolean {
  return req.headers['x-msroute-client'] === 'playground' || req.headers['x-nexus-client'] === 'playground';
}

// Middleware: Authenticate Gateway API Key, Guardrails & Check Kill Switch
function authenticateGateway(req: Request, res: Response, next: () => void) {
  const settings = db.getSettings();

  if (settings.emergencyKillSwitch) {
    return res.status(503).json({
      error: {
        type: 'service_unavailable_error',
        message: 'MSRoute Emergency Kill Switch is ACTIVE. All outgoing AI provider requests are paused by the owner.',
      },
    });
  }

  // Enforce monthly spending limit guardrail
  if (
    settings.globalMonthlySpendingLimitUsd > 0 &&
    settings.currentMonthlySpentUsd >= settings.globalMonthlySpendingLimitUsd
  ) {
    return res.status(429).json({
      error: {
        type: 'rate_limit_error',
        message: `Monthly spending limit ($${settings.globalMonthlySpendingLimitUsd}) reached.`,
      },
    });
  }

  // Enforce daily request limit guardrail
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = db.getLogs(1000).filter((l) => l.timestamp.startsWith(todayStr)).length;
  if (settings.globalDailyRequestLimit > 0 && todayCount >= settings.globalDailyRequestLimit) {
    return res.status(429).json({
      error: {
        type: 'rate_limit_error',
        message: `Daily request limit (${settings.globalDailyRequestLimit}) reached.`,
      },
    });
  }

  let rawKey = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim();
  } else if (req.headers['x-api-key']) {
    rawKey = String(req.headers['x-api-key']).trim();
  }

  const isPlayground = isPlaygroundHeader(req);

  if (!rawKey && !isPlayground) {
    return res.status(401).json({
      error: {
        type: 'authentication_error',
        message: 'Invalid or missing API key. Pass Authorization: Bearer <GATEWAY_API_KEY> or x-api-key: <GATEWAY_API_KEY>.',
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
    : isPlaygroundHeader(req)
      ? 'playground'
      : 'other';

  const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let finishLive: ((details: any) => void) | null = null;

  try {
    const parsed = parseAnthropicRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);

    if (parsed.stream) {
      // Open stream with pre-stream failover BEFORE committing HTTP 200 SSE headers
      const streamConn = await openStreamWithFallback(route, parsed);

      finishLive = liveTracker.startRequest(
        reqId,
        streamConn.selectedProvider.id,
        streamConn.selectedProvider.name,
        streamConn.selectedModel.displayName,
        clientType
      );

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('x-msroute-provider', streamConn.selectedProvider.name);
      res.setHeader('x-msroute-model', streamConn.selectedModel.displayName);

      const msgId = `msg_${Date.now()}`;
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: {
            id: msgId,
            type: 'message',
            role: 'assistant',
            model: streamConn.selectedModel.id,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        })}\n\n`
      );

      res.write(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        })}\n\n`
      );

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let stopReason = 'end_turn';

      const handleChunk = (chunk: typeof streamConn.firstChunk) => {
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
          if (chunk.inputTokens) totalInputTokens = chunk.inputTokens;
          if (chunk.outputTokens) totalOutputTokens = chunk.outputTokens;
          stopReason = chunk.finishReason || stopReason;
        }
      };

      try {
        handleChunk(streamConn.firstChunk);
        for await (const chunk of streamConn.iterator) {
          handleChunk(chunk);
        }
      } catch (streamErr: any) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: streamErr.message },
          })}\n\n`
        );
      }

      res.write(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0,
        })}\n\n`
      );

      res.write(
        `event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: totalOutputTokens },
        })}\n\n`
      );

      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();

      const latencyMs = Date.now() - startTime;
      const log: RequestLog = {
        id: reqId,
        timestamp: new Date().toISOString(),
        clientType,
        endpoint: '/v1/messages',
        requestedModel: parsed.model,
        resolvedModel: streamConn.selectedModel.displayName,
        selectedProvider: streamConn.selectedProvider.name,
        routingStrategy: route.strategy,
        status: streamConn.wasFallback ? 'fallback_success' : 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: Number(
          (
            (totalInputTokens / 1e6) * (streamConn.selectedModel.pricing.inputPer1MTokens || 0.15) +
            (totalOutputTokens / 1e6) * (streamConn.selectedModel.pricing.outputPer1MTokens || 0.6)
          ).toFixed(5)
        ),
        retryCount: streamConn.fallbackHistory.length,
        fallbackHistory: streamConn.fallbackHistory,
        streaming: true,
      };
      db.addLog(log);
      if (finishLive) {
        finishLive({
          status: streamConn.wasFallback ? 'fallback_success' : 'success',
          latencyMs,
          endpoint: '/v1/messages',
          log,
        });
      }
      return;
    }

    finishLive = liveTracker.startRequest(
      reqId,
      route.selectedProvider.id,
      route.selectedProvider.name,
      route.selectedModel.displayName,
      clientType
    );

    const execRes = await executeWithFallback(route, parsed);
    const anthropicResponse = formatAnthropicResponse(execRes.response);
    const latencyMs = Date.now() - startTime;

    res.setHeader('x-msroute-provider', execRes.selectedProvider.name);
    res.setHeader('x-msroute-model', execRes.selectedModel.displayName);

    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number(
      (
        (inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) +
        (outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)
      ).toFixed(5)
    );

    const log: RequestLog = {
      id: reqId,
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
    if (finishLive) {
      finishLive({
        status: execRes.wasFallback ? 'fallback_success' : 'success',
        latencyMs,
        endpoint: '/v1/messages',
        log,
      });
    }

    return res.json(anthropicResponse);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const statusCode = (err?.message || '').includes('No active AI providers') || (err?.message || '').includes('Missing API key') ? 400 : 502;
    const log: RequestLog = {
      id: reqId,
      timestamp: new Date().toISOString(),
      clientType,
      endpoint: '/v1/messages',
      requestedModel: req.body?.model || 'unknown',
      resolvedModel: 'Error',
      selectedProvider: 'None',
      routingStrategy: 'error',
      status: 'error',
      statusCode,
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
    if (finishLive) {
      finishLive({
        status: 'error',
        latencyMs,
        endpoint: '/v1/messages',
        log,
      });
    }

    return res.status(statusCode).json({
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
  const clientType = isPlaygroundHeader(req) ? 'playground' : 'openai-sdk';
  const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let finishLive: ((details: any) => void) | null = null;

  try {
    const parsed = parseOpenAiRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);

    if (parsed.stream) {
      const streamConn = await openStreamWithFallback(route, parsed);

      finishLive = liveTracker.startRequest(
        reqId,
        streamConn.selectedProvider.id,
        streamConn.selectedProvider.name,
        streamConn.selectedModel.displayName,
        clientType
      );

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('x-msroute-provider', streamConn.selectedProvider.name);
      res.setHeader('x-msroute-model', streamConn.selectedModel.displayName);

      const chunkId = `chatcmpl-${Date.now()}`;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const handleChunk = (chunk: typeof streamConn.firstChunk) => {
        if (chunk.type === 'delta' && chunk.deltaText) {
          totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
          const openAiChunk = {
            id: chunkId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: streamConn.selectedModel.id,
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
          if (chunk.inputTokens) totalInputTokens = chunk.inputTokens;
          if (chunk.outputTokens) totalOutputTokens = chunk.outputTokens;
          const finalChunk = {
            id: chunkId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: streamConn.selectedModel.id,
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
      };

      try {
        handleChunk(streamConn.firstChunk);
        for await (const chunk of streamConn.iterator) {
          handleChunk(chunk);
        }
      } catch (streamErr: any) {
        console.error('OpenAI stream chunk error:', streamErr);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      const latencyMs = Date.now() - startTime;
      const log: RequestLog = {
        id: reqId,
        timestamp: new Date().toISOString(),
        clientType,
        endpoint: '/v1/chat/completions',
        requestedModel: parsed.model,
        resolvedModel: streamConn.selectedModel.displayName,
        selectedProvider: streamConn.selectedProvider.name,
        routingStrategy: route.strategy,
        status: streamConn.wasFallback ? 'fallback_success' : 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: Number(
          (
            (totalInputTokens / 1e6) * (streamConn.selectedModel.pricing.inputPer1MTokens || 0.15) +
            (totalOutputTokens / 1e6) * (streamConn.selectedModel.pricing.outputPer1MTokens || 0.6)
          ).toFixed(5)
        ),
        retryCount: streamConn.fallbackHistory.length,
        fallbackHistory: streamConn.fallbackHistory,
        streaming: true,
      };
      db.addLog(log);
      if (finishLive) {
        finishLive({
          status: streamConn.wasFallback ? 'fallback_success' : 'success',
          latencyMs,
          endpoint: '/v1/chat/completions',
          log,
        });
      }
      return;
    }

    finishLive = liveTracker.startRequest(
      reqId,
      route.selectedProvider.id,
      route.selectedProvider.name,
      route.selectedModel.displayName,
      clientType
    );

    const execRes = await executeWithFallback(route, parsed);
    const openAiResponse = formatOpenAiResponse(execRes.response);
    const latencyMs = Date.now() - startTime;

    res.setHeader('x-msroute-provider', execRes.selectedProvider.name);
    res.setHeader('x-msroute-model', execRes.selectedModel.displayName);

    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number(
      (
        (inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) +
        (outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)
      ).toFixed(5)
    );

    const log: RequestLog = {
      id: reqId,
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
    if (finishLive) {
      finishLive({
        status: execRes.wasFallback ? 'fallback_success' : 'success',
        latencyMs,
        endpoint: '/v1/chat/completions',
        log,
      });
    }

    return res.json(openAiResponse);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const statusCode = (err?.message || '').includes('No active AI providers') || (err?.message || '').includes('Missing API key') ? 400 : 502;
    const log: RequestLog = {
      id: reqId,
      timestamp: new Date().toISOString(),
      clientType,
      endpoint: '/v1/chat/completions',
      requestedModel: req.body?.model || 'unknown',
      resolvedModel: 'Error',
      selectedProvider: 'None',
      routingStrategy: 'error',
      status: 'error',
      statusCode,
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
    if (finishLive) {
      finishLive({
        status: 'error',
        latencyMs,
        endpoint: '/v1/chat/completions',
        log,
      });
    }

    return res.status(statusCode).json({
      error: {
        message: err.message || 'Internal Gateway Error',
        type: 'api_error',
        code: statusCode,
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
  const combos = db.getCombos().filter((c) => c.enabled);

  const data = [
    ...combos.map((c) => ({
      id: c.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'msroute-combo',
      permission: [],
      root: c.id,
      parent: null,
      display_name: `${c.name} (Combo • ${c.strategy})`,
      description: c.description,
    })),
    ...models.map((m) => ({
      id: m.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
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
      created: Math.floor(Date.now() / 1000),
      owned_by: 'msroute',
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
