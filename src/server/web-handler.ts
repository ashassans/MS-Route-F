import { db } from './store/db.ts';
import { encryptSecret, generateGatewayApiKey, maskSecret } from './security/encryption.ts';
import { validateProviderUrl } from './security/ssrf.ts';
import { runClaudeCodeTestSuite } from './testing/claude-suite.ts';
import { resolveRoute, resolveComboRoute } from './engine/router.ts';
import { executeWithFallback, openStreamWithFallback } from './engine/fallback.ts';
import {
  parseAnthropicRequest,
  parseOpenAiRequest,
  formatAnthropicResponse,
  formatOpenAiResponse,
} from './adapters/protocol-converter.ts';
import { pingProviderConnection, resolveProviderApiKey } from './adapters/executor.ts';
import type { ModelConfig, ProviderConfig, RequestLog } from '../types/gateway.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-api-key, anthropic-version, x-msroute-client, x-nexus-client',
};

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...(extraHeaders || {}),
    },
  });
}

async function readJsonBody(request: Request): Promise<any> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON request body');
  }
}

function inferModelDefaults(modelId: string, providerId: string): ModelConfig {
  const lower = modelId.toLowerCase();
  const isVision =
    lower.includes('gemini') ||
    lower.includes('4o') ||
    lower.includes('sonnet') ||
    lower.includes('opus') ||
    lower.includes('vision');
  const isReasoning =
    lower.includes('reason') ||
    lower.includes('r1') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('3-7') ||
    lower.includes('2.5');
  const contextWindow = lower.includes('gemini-2.5-pro')
    ? 2097152
    : lower.includes('gemini')
      ? 1048576
      : lower.includes('claude')
        ? 200000
        : 128000;

  return {
    id: modelId,
    displayName: modelId,
    providerId,
    apiModelName: modelId,
    contextWindow,
    capabilities: {
      streaming: true,
      tools: !lower.includes('reasoner'),
      vision: isVision,
      reasoning: isReasoning,
      jsonOutput: !lower.includes('reasoner'),
    },
    pricing: {
      inputPer1MTokens:
        lower.includes('mini') || lower.includes('flash') || lower.includes('deepseek-chat') ? 0.15 : 2.5,
      outputPer1MTokens:
        lower.includes('mini') || lower.includes('flash') || lower.includes('deepseek-chat') ? 0.6 : 10.0,
    },
    enabled: true,
  };
}

function sanitizeProviderForClient(p: ProviderConfig) {
  const effectiveRaw = resolveProviderApiKey(p);
  return {
    ...p,
    apiKey: effectiveRaw ? maskSecret(effectiveRaw) : undefined,
    hasApiKey: Boolean(effectiveRaw),
  };
}

function isPlaygroundRequest(request: Request): boolean {
  return (
    request.headers.get('x-msroute-client') === 'playground' ||
    request.headers.get('x-nexus-client') === 'playground'
  );
}

function checkGatewayAuth(request: Request): Response | null {
  const settings = db.getSettings();

  if (settings.emergencyKillSwitch) {
    return jsonResponse(
      {
        error: {
          type: 'service_unavailable_error',
          message: 'MSRoute Emergency Kill Switch is ACTIVE. All outgoing AI provider requests are paused by the owner.',
        },
      },
      503
    );
  }

  if (
    settings.globalMonthlySpendingLimitUsd > 0 &&
    settings.currentMonthlySpentUsd >= settings.globalMonthlySpendingLimitUsd
  ) {
    return jsonResponse(
      {
        error: {
          type: 'rate_limit_error',
          message: `Monthly spending limit ($${settings.globalMonthlySpendingLimitUsd}) reached.`,
        },
      },
      429
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = db.getLogs(1000).filter((l) => l.timestamp.startsWith(todayStr)).length;
  if (settings.globalDailyRequestLimit > 0 && todayCount >= settings.globalDailyRequestLimit) {
    return jsonResponse(
      {
        error: {
          type: 'rate_limit_error',
          message: `Daily request limit (${settings.globalDailyRequestLimit}) reached.`,
        },
      },
      429
    );
  }

  let rawKey = '';
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim();
  } else if (request.headers.get('x-api-key')) {
    rawKey = String(request.headers.get('x-api-key')).trim();
  }

  const isPlayground = isPlaygroundRequest(request);
  if (!rawKey && !isPlayground) {
    return jsonResponse(
      {
        error: {
          type: 'authentication_error',
          message:
            'Invalid or missing API key. Pass Authorization: Bearer <GATEWAY_API_KEY> or x-api-key: <GATEWAY_API_KEY>.',
        },
      },
      401
    );
  }

  if (rawKey) {
    const verified = db.verifyApiKey(rawKey);
    if (!verified) {
      return jsonResponse(
        {
          error: {
            type: 'authentication_error',
            message: 'API key is invalid or has been revoked.',
          },
        },
        401
      );
    }
  }

  return null;
}

export async function handleGatewayFetch(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  try {
    // =========================================================
    // DASHBOARD API ROUTES (/api/*)
    // =========================================================
    if (pathname.startsWith('/api/')) {
      const subPath = pathname.slice(4); // e.g. "/providers"

      // 1. GET /api/status
      if (method === 'GET' && subPath === '/status') {
        const settings = db.getSettings();
        const providers = db.getProviders();
        const models = db.getModels();
        const combos = db.getCombos();
        const activeKeys = db.getApiKeys().filter((k) => !k.revoked);
        const analytics = db.getAnalytics('30d');

        return jsonResponse({
          appName: 'MSRoute AI Gateway',
          version: '1.0.0',
          status: settings.emergencyKillSwitch ? 'kill_switch_active' : 'online',
          uptimeSeconds: 0,
          activeProviders: providers.filter((p) => p.enabled).length,
          totalProviders: providers.length,
          availableModels: models.filter((m) => m.enabled).length,
          activeCombos: combos.filter((c) => c.enabled).length,
          activeKeys: activeKeys.length,
          defaultRoutingMode: settings.defaultRoutingMode,
          emergencyKillSwitch: settings.emergencyKillSwitch,
          totalRequests: analytics.totalRequests,
          totalEstimatedCostUsd: analytics.totalEstimatedCostUsd,
          averageLatencyMs: analytics.averageLatencyMs,
        });
      }

      // 2. Providers CRUD & Test Connection
      if (method === 'GET' && subPath === '/providers') {
        return jsonResponse(db.getProviders().map(sanitizeProviderForClient));
      }

      if (method === 'POST' && subPath === '/providers') {
        const body = await readJsonBody(request);
        if (!body.name || !body.baseUrl) {
          return jsonResponse({ error: 'Name and Base URL are required' }, 400);
        }

        const ssrfCheck = validateProviderUrl(body.baseUrl);
        if (!ssrfCheck.valid) {
          return jsonResponse({ error: ssrfCheck.reason }, 400);
        }

        const modelList: string[] = Array.isArray(body.models) ? body.models.filter(Boolean) : [];
        const rawApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

        const newProvider: ProviderConfig = {
          id: body.id || `prov-${Date.now()}`,
          name: body.name.trim(),
          type: body.type || 'custom',
          baseUrl: ssrfCheck.sanitizedUrl || body.baseUrl,
          apiKey: rawApiKey ? encryptSecret(rawApiKey) : undefined,
          protocol: body.protocol || 'openai-chat',
          customHeaders: body.customHeaders || {},
          models: modelList,
          defaultModel: body.defaultModel || (modelList[0] ?? ''),
          timeoutMs: Number(body.timeoutMs) || 30000,
          priority: Number(body.priority) || 2,
          maxRetries: Number(body.maxRetries ?? 2),
          enabled: body.enabled !== false,
          health: {
            status: 'unknown',
            recentErrorsCount: 0,
          },
          metadata: body.metadata || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        db.saveProvider(newProvider);

        for (const mId of modelList) {
          if (!db.getModel(mId)) {
            db.saveModel(inferModelDefaults(mId, newProvider.id));
          }
        }

        return jsonResponse({ success: true, provider: sanitizeProviderForClient(newProvider) });
      }

      const providerTestMatch = subPath.match(/^\/providers\/([^/]+)\/test$/);
      if (method === 'POST' && providerTestMatch) {
        const id = decodeURIComponent(providerTestMatch[1]);
        const provider = db.getProvider(id);
        if (!provider) {
          return jsonResponse({ error: 'Provider not found' }, 404);
        }

        const start = Date.now();
        try {
          const ping = await pingProviderConnection(provider);
          provider.health = {
            status: 'healthy',
            latencyMs: ping.latencyMs,
            lastChecked: new Date().toISOString(),
            lastSuccess: new Date().toISOString(),
            errorMessage: undefined,
            recentErrorsCount: 0,
          };
          db.saveProvider(provider);

          return jsonResponse({
            success: true,
            providerId: id,
            providerName: provider.name,
            latencyMs: ping.latencyMs,
            availableModels: provider.models,
            status: 'healthy',
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          const latencyMs = Date.now() - start;
          const isAuthMissing = (err?.message || '').includes('401');
          provider.health = {
            status: isAuthMissing ? 'unavailable' : 'degraded',
            latencyMs,
            lastChecked: new Date().toISOString(),
            lastSuccess: provider.health.lastSuccess,
            errorMessage: err.message,
            recentErrorsCount: (provider.health.recentErrorsCount || 0) + 1,
          };
          db.saveProvider(provider);

          return jsonResponse({ success: false, error: err.message, latencyMs }, 400);
        }
      }

      const providerItemMatch = subPath.match(/^\/providers\/([^/]+)$/);
      if (providerItemMatch) {
        const id = decodeURIComponent(providerItemMatch[1]);
        if (method === 'PUT') {
          const existing = db.getProvider(id);
          if (!existing) return jsonResponse({ error: 'Provider not found' }, 404);

          const body = { ...(await readJsonBody(request)) };
          if (body.baseUrl) {
            const ssrfCheck = validateProviderUrl(body.baseUrl);
            if (!ssrfCheck.valid) {
              return jsonResponse({ error: ssrfCheck.reason }, 400);
            }
            body.baseUrl = ssrfCheck.sanitizedUrl || body.baseUrl;
          }

          const rawNewKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
          const shouldUpdateKey =
            rawNewKey.length > 0 && !rawNewKey.includes('...') && !rawNewKey.includes('****');

          const updated: ProviderConfig = {
            ...existing,
            ...body,
            apiKey: shouldUpdateKey ? encryptSecret(rawNewKey) : existing.apiKey,
            updatedAt: new Date().toISOString(),
          };

          db.saveProvider(updated);
          if (Array.isArray(updated.models)) {
            for (const mId of updated.models) {
              if (mId && !db.getModel(mId)) {
                db.saveModel(inferModelDefaults(mId, updated.id));
              }
            }
          }

          return jsonResponse({ success: true, provider: sanitizeProviderForClient(updated) });
        }

        if (method === 'DELETE') {
          const success = db.deleteProvider(id);
          for (const m of db.getModels()) {
            if (m.providerId === id) {
              db.deleteModel(m.id);
            }
          }
          return jsonResponse({ success });
        }
      }

      // 3. Models CRUD (including slash-containing IDs such as MiniMaxAI/MiniMax-M2.7)
      if (method === 'GET' && subPath === '/models') {
        return jsonResponse(db.getModels());
      }

      if (method === 'POST' && subPath === '/models') {
        const body = await readJsonBody(request);
        if (!body.id || !body.displayName || !body.providerId) {
          return jsonResponse({ error: 'Model ID, display name, and provider ID are required' }, 400);
        }
        const model: ModelConfig = {
          id: body.id.trim(),
          displayName: body.displayName.trim(),
          providerId: body.providerId,
          apiModelName: (body.apiModelName || body.id).trim(),
          contextWindow: Number(body.contextWindow) || 128000,
          capabilities: {
            streaming: body.capabilities?.streaming !== false,
            tools: Boolean(body.capabilities?.tools),
            vision: Boolean(body.capabilities?.vision),
            reasoning: Boolean(body.capabilities?.reasoning),
            jsonOutput: body.capabilities?.jsonOutput !== false,
          },
          pricing: {
            inputPer1MTokens: Number(body.pricing?.inputPer1MTokens ?? 0.5),
            outputPer1MTokens: Number(body.pricing?.outputPer1MTokens ?? 1.5),
          },
          enabled: body.enabled !== false,
        };
        db.saveModel(model);
        return jsonResponse({ success: true, model });
      }

      if (subPath.startsWith('/models/')) {
        const id = decodeURIComponent(subPath.slice('/models/'.length));
        if (method === 'PUT') {
          const existing = db.getModel(id);
          if (!existing) return jsonResponse({ error: 'Model not found' }, 404);
          const body = await readJsonBody(request);
          const updated = { ...existing, ...body };
          db.saveModel(updated);
          return jsonResponse({ success: true, model: updated });
        }
        if (method === 'DELETE') {
          return jsonResponse({ success: db.deleteModel(id) });
        }
      }

      // 4. Aliases CRUD
      if (method === 'GET' && subPath === '/aliases') {
        return jsonResponse(db.getAliases());
      }

      if (method === 'POST' && subPath === '/aliases') {
        const body = await readJsonBody(request);
        if (!body.alias || !body.targetId) {
          return jsonResponse({ error: 'Alias and targetId are required' }, 400);
        }
        const newAlias = {
          id: body.id || `alias-${Date.now()}`,
          alias: body.alias.trim(),
          description: body.description || '',
          targetType: body.targetType || 'model',
          targetId: body.targetId,
          isClaudeCodeDefault: Boolean(body.isClaudeCodeDefault),
        };
        db.saveAlias(newAlias);
        return jsonResponse({ success: true, alias: newAlias });
      }

      if (method === 'DELETE' && subPath.startsWith('/aliases/')) {
        const id = decodeURIComponent(subPath.slice('/aliases/'.length));
        return jsonResponse({ success: db.deleteAlias(id) });
      }

      // 5. Combos CRUD & Test
      if (method === 'GET' && subPath === '/combos') {
        return jsonResponse(db.getCombos());
      }

      if (method === 'POST' && subPath === '/combos') {
        const body = await readJsonBody(request);
        if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
          return jsonResponse({ error: 'Combo name and at least one step are required' }, 400);
        }
        const newCombo = {
          id: body.id || `combo-${Date.now()}`,
          name: body.name,
          description: body.description || '',
          strategy: body.strategy || 'sequential',
          steps: body.steps,
          primaryProviderId: body.primaryProviderId || body.steps[0]?.providerId,
          retryRules: body.retryRules || {
            maxAttempts: 3,
            backoffMs: 500,
            retryOnRateLimit: true,
            retryOnTimeout: true,
            retryOnServerError: true,
          },
          timeoutMs: Number(body.timeoutMs) || 30000,
          enabled: body.enabled !== false,
        };
        db.saveCombo(newCombo);
        return jsonResponse({ success: true, combo: newCombo });
      }

      const comboTestMatch = subPath.match(/^\/combos\/([^/]+)\/test$/);
      if (method === 'POST' && comboTestMatch) {
        const id = decodeURIComponent(comboTestMatch[1]);
        const combo = db.getCombo(id);
        if (!combo) return jsonResponse({ error: 'Combo not found' }, 404);

        const start = Date.now();
        try {
          const route = resolveComboRoute(combo, 'test');
          const dummyReq = parseAnthropicRequest({
            model: combo.id,
            max_tokens: 64,
            messages: [{ role: 'user', content: 'Respond with OK' }],
          });

          const execRes = await executeWithFallback(route, dummyReq);
          return jsonResponse({
            success: true,
            comboName: combo.name,
            strategy: combo.strategy,
            primaryResolved: execRes.selectedProvider.name,
            modelResolved: execRes.selectedModel.displayName,
            latencyMs: Date.now() - start,
            wasFallback: execRes.wasFallback,
            fallbackHistory: execRes.fallbackHistory,
          });
        } catch (err: any) {
          return jsonResponse({ success: false, error: err.message, latencyMs: Date.now() - start }, 400);
        }
      }

      const comboItemMatch = subPath.match(/^\/combos\/([^/]+)$/);
      if (comboItemMatch) {
        const id = decodeURIComponent(comboItemMatch[1]);
        if (method === 'PUT') {
          const existing = db.getCombo(id);
          if (!existing) return jsonResponse({ error: 'Combo not found' }, 404);
          const body = await readJsonBody(request);
          const updated = { ...existing, ...body };
          db.saveCombo(updated);
          return jsonResponse({ success: true, combo: updated });
        }
        if (method === 'DELETE') {
          return jsonResponse({ success: db.deleteCombo(id) });
        }
      }

      // 6. Routing Rules
      if (method === 'GET' && subPath === '/rules') {
        return jsonResponse(db.getRules());
      }
      if (method === 'PUT' && subPath === '/rules') {
        const body = await readJsonBody(request);
        if (!Array.isArray(body)) {
          return jsonResponse({ error: 'Expected array of rules' }, 400);
        }
        db.saveRules(body);
        return jsonResponse({ success: true, rules: db.getRules() });
      }

      // 7. API Keys CRUD
      if (method === 'GET' && subPath === '/keys') {
        const keys = db.getApiKeys().map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          permissions: k.permissions,
          rateLimitPerMinute: k.rateLimitPerMinute,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
          revoked: k.revoked,
        }));
        return jsonResponse(keys);
      }

      if (method === 'POST' && subPath === '/keys') {
        const body = await readJsonBody(request);
        if (!body.name) return jsonResponse({ error: 'Key name is required' }, 400);

        const { rawKey, keyPrefix, keyHash } = generateGatewayApiKey();
        const keyObj = {
          id: `key-${Date.now()}`,
          name: body.name.trim(),
          keyPrefix,
          keyHash,
          permissions: body.permissions || ['all'],
          rateLimitPerMinute: Number(body.rateLimitPerMinute) || 600,
          createdAt: new Date().toISOString(),
          revoked: false,
        };
        db.saveApiKey(keyObj);
        return jsonResponse({ success: true, key: { ...keyObj, rawKey } });
      }

      if (method === 'DELETE' && subPath.startsWith('/keys/')) {
        const id = decodeURIComponent(subPath.slice('/keys/'.length));
        return jsonResponse({ success: db.revokeApiKey(id) });
      }

      // 8. Request Logs
      if (method === 'GET' && subPath === '/logs') {
        const limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);
        return jsonResponse(db.getLogs(limit));
      }
      if (method === 'DELETE' && subPath === '/logs') {
        db.clearLogs();
        return jsonResponse({ success: true });
      }

      // 9. Analytics
      if (method === 'GET' && subPath === '/analytics') {
        const rangeParam = String(url.searchParams.get('range') || '7d');
        const range = rangeParam === 'today' || rangeParam === '30d' ? rangeParam : '7d';
        return jsonResponse(db.getAnalytics(range));
      }

      // 10. Settings & Emergency Kill Switch
      if (method === 'GET' && subPath === '/settings') {
        return jsonResponse(db.getSettings());
      }
      if (method === 'PUT' && subPath === '/settings') {
        const body = await readJsonBody(request);
        const updated = db.updateSettings(body);
        return jsonResponse({ success: true, settings: updated });
      }
      if (method === 'POST' && subPath === '/emergency-kill-switch') {
        const body = await readJsonBody(request);
        const updated = db.updateSettings({ emergencyKillSwitch: Boolean(body.enabled) });
        return jsonResponse({
          success: true,
          emergencyKillSwitch: updated.emergencyKillSwitch,
          message: updated.emergencyKillSwitch
            ? 'Emergency kill switch ACTIVATED. All outgoing AI provider requests are now blocked.'
            : 'Emergency kill switch DEACTIVATED. Normal gateway routing resumed.',
        });
      }

      // 11. Claude Code Test Suite
      if (method === 'POST' && subPath === '/test/claude-suite') {
        const report = await runClaudeCodeTestSuite();
        return jsonResponse(report);
      }

      // 12. Playground Execution
      if (method === 'POST' && subPath === '/test/playground') {
        const body = await readJsonBody(request);
        const { protocol, model, prompt, stream, system, systemPrompt } = body;
        const effectiveSystem = system ?? systemPrompt ?? '';
        const start = Date.now();
        const endpoint = protocol === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';

        if (db.getSettings().emergencyKillSwitch) {
          return jsonResponse(
            {
              success: false,
              error: 'Emergency Kill Switch is active. Deactivate it to dispatch requests.',
              latencyMs: 0,
            },
            503
          );
        }

        try {
          const parsed =
            protocol === 'anthropic'
              ? parseAnthropicRequest({
                  model,
                  messages: [{ role: 'user', content: prompt || 'Hello' }],
                  system: effectiveSystem,
                  stream: Boolean(stream),
                })
              : parseOpenAiRequest({
                  model,
                  messages: [
                    ...(effectiveSystem ? [{ role: 'system', content: effectiveSystem }] : []),
                    { role: 'user', content: prompt || 'Hello' },
                  ],
                  stream: Boolean(stream),
                });

          const route = resolveRoute(parsed.model, parsed);
          const execRes = await executeWithFallback(route, parsed);
          const latencyMs = Date.now() - start;

          const inputTokens = execRes.response.usage.inputTokens;
          const outputTokens = execRes.response.usage.outputTokens;
          const costUsd = Number(
            (
              (inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) +
              (outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)
            ).toFixed(5)
          );

          const log: RequestLog = {
            id: `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            clientType: 'playground',
            endpoint,
            requestedModel: model || parsed.model,
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

          return jsonResponse({
            success: true,
            protocol,
            requestedModel: model,
            resolvedModel: execRes.selectedModel.displayName,
            selectedProvider: execRes.selectedProvider.name,
            strategy: route.strategy,
            latencyMs,
            wasFallback: execRes.wasFallback,
            content: execRes.response.content,
            output: execRes.response.content,
            toolCalls: execRes.response.toolCalls,
            usage: execRes.response.usage,
            stopReason: execRes.response.stopReason,
          });
        } catch (err: any) {
          const latencyMs = Date.now() - start;
          db.addLog({
            id: `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            clientType: 'playground',
            endpoint,
            requestedModel: model || 'auto',
            resolvedModel: 'Error',
            selectedProvider: 'None',
            routingStrategy: 'error',
            status: 'error',
            statusCode: 400,
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            retryCount: 0,
            fallbackHistory: [],
            errorMessage: err.message,
            streaming: false,
          });
          return jsonResponse({ success: false, error: err.message, latencyMs }, 400);
        }
      }

      // 13. Export, Import & Factory Reset Configuration
      if (method === 'GET' && subPath === '/export-config') {
        const jsonStr = db.exportConfig();
        return new Response(jsonStr, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="msroute-config.json"',
            ...CORS_HEADERS,
          },
        });
      }

      if (method === 'POST' && subPath === '/import-config') {
        const body = await readJsonBody(request);
        if (!body.configJson) return jsonResponse({ error: 'Config JSON is required' }, 400);
        return jsonResponse({ success: db.importConfig(body.configJson) });
      }

      if (method === 'POST' && subPath === '/reset-state') {
        db.resetState();
        return jsonResponse({ success: true });
      }

      return jsonResponse({ error: `API route not found: ${method} ${pathname}` }, 404);
    }

    // =========================================================
    // AI GATEWAY PROTOCOL ROUTES (/v1/*)
    // =========================================================
    if (pathname.startsWith('/v1/')) {
      const authErr = checkGatewayAuth(request);
      if (authErr) return authErr;

      // GET /v1/models
      if (method === 'GET' && pathname === '/v1/models') {
        const models = db.getModels();
        const aliases = db.getAliases();
        const data = [
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
        return jsonResponse({ object: 'list', data });
      }

      // POST /v1/messages/count_tokens
      if (method === 'POST' && pathname === '/v1/messages/count_tokens') {
        const body = await readJsonBody(request);
        const parsed = parseAnthropicRequest(body);
        const text = parsed.messages
          .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
          .join(' ');
        const estimatedTokens = Math.max(1, Math.floor((text.length + (parsed.system?.length || 0)) / 3.8));
        return jsonResponse({ input_tokens: estimatedTokens });
      }

      // POST /v1/messages (Anthropic Messages API & Claude Code SSE)
      if (method === 'POST' && pathname === '/v1/messages') {
        const startTime = Date.now();
        const body = await readJsonBody(request);
        const ua = (request.headers.get('user-agent') || '').toLowerCase();
        const clientType = ua.includes('claude')
          ? 'claude-code'
          : isPlaygroundRequest(request)
            ? 'playground'
            : 'other';

        try {
          const parsed = parseAnthropicRequest(body);
          const route = resolveRoute(parsed.model, parsed);

          if (parsed.stream) {
            const streamConn = await openStreamWithFallback(route, parsed);
            const encoder = new TextEncoder();
            const msgId = `msg_${Date.now()}`;

            const readable = new ReadableStream({
              async start(controller) {
                const sendSse = (raw: string) => controller.enqueue(encoder.encode(raw));

                sendSse(
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

                sendSse(
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
                    sendSse(
                      `event: content_block_delta\ndata: ${JSON.stringify({
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: chunk.deltaText },
                      })}\n\n`
                    );
                  } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                    stopReason = 'tool_use';
                    sendSse(
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
                  sendSse(
                    `event: error\ndata: ${JSON.stringify({
                      type: 'error',
                      error: { type: 'api_error', message: streamErr.message },
                    })}\n\n`
                  );
                }

                sendSse(
                  `event: content_block_stop\ndata: ${JSON.stringify({
                    type: 'content_block_stop',
                    index: 0,
                  })}\n\n`
                );

                sendSse(
                  `event: message_delta\ndata: ${JSON.stringify({
                    type: 'message_delta',
                    delta: { stop_reason: stopReason, stop_sequence: null },
                    usage: { output_tokens: totalOutputTokens },
                  })}\n\n`
                );

                sendSse(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
                controller.close();

                const latencyMs = Date.now() - startTime;
                db.addLog({
                  id: `req_${Date.now()}`,
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
                });
              },
            });

            return new Response(readable, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                ...CORS_HEADERS,
              },
            });
          }

          const execRes = await executeWithFallback(route, parsed);
          const anthropicResponse = formatAnthropicResponse(execRes.response);
          const latencyMs = Date.now() - startTime;

          const inputTokens = execRes.response.usage.inputTokens;
          const outputTokens = execRes.response.usage.outputTokens;
          const costUsd = Number(
            (
              (inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) +
              (outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)
            ).toFixed(5)
          );

          db.addLog({
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
          });

          return jsonResponse(anthropicResponse);
        } catch (err: any) {
          const latencyMs = Date.now() - startTime;
          const statusCode =
            (err?.message || '').includes('No active AI providers') ||
            (err?.message || '').includes('Missing API key')
              ? 400
              : 502;
          db.addLog({
            id: `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            clientType,
            endpoint: '/v1/messages',
            requestedModel: body?.model || 'unknown',
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
            streaming: Boolean(body?.stream),
          });

          return jsonResponse(
            {
              type: 'error',
              error: {
                type: 'api_error',
                message: err.message || 'Internal AI Gateway Error',
              },
            },
            statusCode
          );
        }
      }

      // POST /v1/chat/completions or POST /v1/responses
      if (method === 'POST' && (pathname === '/v1/chat/completions' || pathname === '/v1/responses')) {
        const startTime = Date.now();
        const body = await readJsonBody(request);
        const clientType = isPlaygroundRequest(request) ? 'playground' : 'openai-sdk';

        try {
          const parsed = parseOpenAiRequest(body);
          const route = resolveRoute(parsed.model, parsed);

          if (parsed.stream) {
            const streamConn = await openStreamWithFallback(route, parsed);
            const encoder = new TextEncoder();
            const chunkId = `chatcmpl-${Date.now()}`;

            const readable = new ReadableStream({
              async start(controller) {
                const sendSse = (raw: string) => controller.enqueue(encoder.encode(raw));
                let totalInputTokens = 0;
                let totalOutputTokens = 0;

                const handleChunk = (chunk: typeof streamConn.firstChunk) => {
                  if (chunk.type === 'delta' && chunk.deltaText) {
                    totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
                    sendSse(
                      `data: ${JSON.stringify({
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
                      })}\n\n`
                    );
                  } else if (chunk.type === 'done') {
                    if (chunk.inputTokens) totalInputTokens = chunk.inputTokens;
                    if (chunk.outputTokens) totalOutputTokens = chunk.outputTokens;
                    sendSse(
                      `data: ${JSON.stringify({
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
                      })}\n\n`
                    );
                  }
                };

                try {
                  handleChunk(streamConn.firstChunk);
                  for await (const chunk of streamConn.iterator) {
                    handleChunk(chunk);
                  }
                } catch (streamErr) {
                  console.error('OpenAI stream chunk error:', streamErr);
                }

                sendSse('data: [DONE]\n\n');
                controller.close();

                const latencyMs = Date.now() - startTime;
                db.addLog({
                  id: `req_${Date.now()}`,
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
                });
              },
            });

            return new Response(readable, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                ...CORS_HEADERS,
              },
            });
          }

          const execRes = await executeWithFallback(route, parsed);
          const openAiResponse = formatOpenAiResponse(execRes.response);
          const latencyMs = Date.now() - startTime;

          const inputTokens = execRes.response.usage.inputTokens;
          const outputTokens = execRes.response.usage.outputTokens;
          const costUsd = Number(
            (
              (inputTokens / 1e6) * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) +
              (outputTokens / 1e6) * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)
            ).toFixed(5)
          );

          db.addLog({
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
          });

          return jsonResponse(openAiResponse);
        } catch (err: any) {
          const latencyMs = Date.now() - startTime;
          const statusCode =
            (err?.message || '').includes('No active AI providers') ||
            (err?.message || '').includes('Missing API key')
              ? 400
              : 502;
          db.addLog({
            id: `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            clientType,
            endpoint: '/v1/chat/completions',
            requestedModel: body?.model || 'unknown',
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
            streaming: Boolean(body?.stream),
          });

          return jsonResponse(
            {
              error: {
                message: err.message || 'Internal Gateway Error',
                type: 'api_error',
                code: statusCode,
              },
            },
            statusCode
          );
        }
      }

      return jsonResponse({ error: `Gateway v1 route not found: ${method} ${pathname}` }, 404);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Internal Server Error' }, 500);
  }
}
