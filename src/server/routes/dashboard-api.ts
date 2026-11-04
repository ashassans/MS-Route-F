import { Router, type Request, type Response } from 'express';
import { db } from '../store/db.ts';
import { encryptSecret, generateGatewayApiKey, maskSecret } from '../security/encryption.ts';
import { validateProviderUrl } from '../security/ssrf.ts';
import { runClaudeCodeTestSuite } from '../testing/claude-suite.ts';
import { resolveRoute, resolveComboRoute } from '../engine/router.ts';
import { executeWithFallback } from '../engine/fallback.ts';
import { parseAnthropicRequest, parseOpenAiRequest } from '../adapters/protocol-converter.ts';
import { pingProviderConnection, resolveProviderApiKey } from '../adapters/executor.ts';
import type { ModelConfig, ProviderConfig, RequestLog } from '../../types/gateway.ts';

const router = Router();

function inferModelDefaults(modelId: string, providerId: string): ModelConfig {
  const lower = modelId.toLowerCase();
  const isVision = lower.includes('gemini') || lower.includes('4o') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('vision');
  const isReasoning = lower.includes('reason') || lower.includes('r1') || lower.includes('o1') || lower.includes('o3') || lower.includes('3-7') || lower.includes('2.5');
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
      inputPer1MTokens: lower.includes('mini') || lower.includes('flash') || lower.includes('deepseek-chat') ? 0.15 : 2.5,
      outputPer1MTokens: lower.includes('mini') || lower.includes('flash') || lower.includes('deepseek-chat') ? 0.6 : 10.0,
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

// 1. Overview & System Status
router.get('/status', (_req: Request, res: Response) => {
  const settings = db.getSettings();
  const providers = db.getProviders();
  const models = db.getModels();
  const combos = db.getCombos();
  const activeKeys = db.getApiKeys().filter((k) => !k.revoked);
  const analytics = db.getAnalytics('30d');

  res.json({
    appName: 'MSRoute AI Gateway',
    version: '1.0.0',
    status: settings.emergencyKillSwitch ? 'kill_switch_active' : 'online',
    uptimeSeconds: Math.floor(process.uptime()),
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
});

// 2. Providers CRUD & Real Test Connection
router.get('/providers', (_req: Request, res: Response) => {
  const providers = db.getProviders().map(sanitizeProviderForClient);
  res.json(providers);
});

router.post('/providers', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.name || !body.baseUrl) {
    return res.status(400).json({ error: 'Name and Base URL are required' });
  }

  const ssrfCheck = validateProviderUrl(body.baseUrl);
  if (!ssrfCheck.valid) {
    return res.status(400).json({ error: ssrfCheck.reason });
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

  // Automatically register listed models into Model Registry if not already registered
  for (const mId of modelList) {
    if (!db.getModel(mId)) {
      db.saveModel(inferModelDefaults(mId, newProvider.id));
    }
  }

  res.json({ success: true, provider: sanitizeProviderForClient(newProvider) });
});

router.put('/providers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.getProvider(id);
  if (!existing) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const body = { ...req.body };
  if (body.baseUrl) {
    const ssrfCheck = validateProviderUrl(body.baseUrl);
    if (!ssrfCheck.valid) {
      return res.status(400).json({ error: ssrfCheck.reason });
    }
    body.baseUrl = ssrfCheck.sanitizedUrl || body.baseUrl;
  }

  const rawNewKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const shouldUpdateKey = rawNewKey.length > 0 && !rawNewKey.includes('...') && !rawNewKey.includes('****');

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

  res.json({ success: true, provider: sanitizeProviderForClient(updated) });
});

router.delete('/providers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteProvider(id);
  // Also remove orphaned models belonging solely to this deleted provider
  for (const m of db.getModels()) {
    if (m.providerId === id) {
      db.deleteModel(m.id);
    }
  }
  res.json({ success });
});

router.post('/providers/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;
  const provider = db.getProvider(id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
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

    res.json({
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

    res.status(400).json({
      success: false,
      error: err.message,
      latencyMs,
    });
  }
});

// 3. Models CRUD
router.get('/models', (_req: Request, res: Response) => {
  res.json(db.getModels());
});

router.post('/models', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.id || !body.displayName || !body.providerId) {
    return res.status(400).json({ error: 'Model ID, display name, and provider ID are required' });
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
  res.json({ success: true, model });
});

router.put(/^\/models\/(.+)$/, (req: Request, res: Response) => {
  const id = decodeURIComponent(req.params[0] || '');
  const existing = db.getModel(id);
  if (!existing) return res.status(404).json({ error: 'Model not found' });
  const updated = { ...existing, ...req.body };
  db.saveModel(updated);
  res.json({ success: true, model: updated });
});

router.delete(/^\/models\/(.+)$/, (req: Request, res: Response) => {
  const id = decodeURIComponent(req.params[0] || '');
  res.json({ success: db.deleteModel(id) });
});

// 4. Aliases CRUD
router.get('/aliases', (_req: Request, res: Response) => {
  res.json(db.getAliases());
});

router.post('/aliases', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.alias || !body.targetId) {
    return res.status(400).json({ error: 'Alias and targetId are required' });
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
  res.json({ success: true, alias: newAlias });
});

router.delete('/aliases/:id', (req: Request, res: Response) => {
  res.json({ success: db.deleteAlias(req.params.id) });
});

// 5. Combos CRUD & Test
router.get('/combos', (_req: Request, res: Response) => {
  res.json(db.getCombos());
});

router.post('/combos', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
    return res.status(400).json({ error: 'Combo name and at least one step are required' });
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
  res.json({ success: true, combo: newCombo });
});

router.put('/combos/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.getCombo(id);
  if (!existing) return res.status(404).json({ error: 'Combo not found' });
  const updated = { ...existing, ...req.body };
  db.saveCombo(updated);
  res.json({ success: true, combo: updated });
});

router.delete('/combos/:id', (req: Request, res: Response) => {
  res.json({ success: db.deleteCombo(req.params.id) });
});

router.post('/combos/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;
  const combo = db.getCombo(id);
  if (!combo) return res.status(404).json({ error: 'Combo not found' });

  const start = Date.now();
  try {
    const route = resolveComboRoute(combo, 'test');
    const dummyReq = parseAnthropicRequest({
      model: combo.id,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Respond with OK' }],
    });

    const execRes = await executeWithFallback(route, dummyReq);
    res.json({
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
    res.status(400).json({ success: false, error: err.message, latencyMs: Date.now() - start });
  }
});

// 6. Routing Rules
router.get('/rules', (_req: Request, res: Response) => {
  res.json(db.getRules());
});

router.put('/rules', (req: Request, res: Response) => {
  if (Array.isArray(req.body)) {
    db.saveRules(req.body);
    res.json({ success: true, rules: db.getRules() });
  } else {
    res.status(400).json({ error: 'Expected array of rules' });
  }
});

// 7. API Keys CRUD
router.get('/keys', (_req: Request, res: Response) => {
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
  res.json(keys);
});

router.post('/keys', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.name) return res.status(400).json({ error: 'Key name is required' });

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
  res.json({
    success: true,
    key: {
      ...keyObj,
      rawKey,
    },
  });
});

router.delete('/keys/:id', (req: Request, res: Response) => {
  const success = db.revokeApiKey(req.params.id);
  res.json({ success });
});

// 8. Request Logs
router.get('/logs', (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  res.json(db.getLogs(limit));
});

router.delete('/logs', (_req: Request, res: Response) => {
  db.clearLogs();
  res.json({ success: true });
});

// 9. Analytics
router.get('/analytics', (req: Request, res: Response) => {
  const rangeParam = String(req.query.range || '7d');
  const range = rangeParam === 'today' || rangeParam === '30d' ? rangeParam : '7d';
  res.json(db.getAnalytics(range));
});

// 10. Settings & Emergency Kill Switch
router.get('/settings', (_req: Request, res: Response) => {
  res.json(db.getSettings());
});

router.put('/settings', (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

router.post('/emergency-kill-switch', (req: Request, res: Response) => {
  const { enabled } = req.body;
  const updated = db.updateSettings({ emergencyKillSwitch: Boolean(enabled) });
  res.json({
    success: true,
    emergencyKillSwitch: updated.emergencyKillSwitch,
    message: updated.emergencyKillSwitch
      ? 'Emergency kill switch ACTIVATED. All outgoing AI provider requests are now blocked.'
      : 'Emergency kill switch DEACTIVATED. Normal gateway routing resumed.',
  });
});

// 11. Claude Code Test Suite
router.post('/test/claude-suite', async (_req: Request, res: Response) => {
  try {
    const report = await runClaudeCodeTestSuite();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Playground Execution
router.post('/test/playground', async (req: Request, res: Response) => {
  const { protocol, model, prompt, stream, system, systemPrompt } = req.body;
  const effectiveSystem = system ?? systemPrompt ?? '';
  const start = Date.now();
  const endpoint = protocol === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';

  if (db.getSettings().emergencyKillSwitch) {
    return res.status(503).json({
      success: false,
      error: 'Emergency Kill Switch is active. Deactivate it to dispatch requests.',
      latencyMs: 0,
    });
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

    res.json({
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
    res.status(400).json({ success: false, error: err.message, latencyMs });
  }
});

// 13. Export, Import & Factory Reset Configuration
router.get('/export-config', (_req: Request, res: Response) => {
  const jsonStr = db.exportConfig();
  res.setHeader('Content-Disposition', 'attachment; filename="msroute-config.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(jsonStr);
});

router.post('/import-config', (req: Request, res: Response) => {
  const { configJson } = req.body;
  if (!configJson) return res.status(400).json({ error: 'Config JSON is required' });
  const success = db.importConfig(configJson);
  res.json({ success });
});

router.post('/reset-state', (_req: Request, res: Response) => {
  db.resetState();
  res.json({ success: true });
});

export default router;
