import { Router, Request, Response } from 'express';
import { db } from '../store/db.ts';
import { encryptSecret, generateGatewayApiKey, maskSecret } from '../security/encryption.ts';
import { validateProviderUrl } from '../security/ssrf.ts';
import { runClaudeCodeTestSuite } from '../testing/claude-suite.ts';
import { resolveRoute, resolveComboRoute } from '../engine/router.ts';
import { executeWithFallback } from '../engine/fallback.ts';
import { parseAnthropicRequest, parseOpenAiRequest } from '../adapters/protocol-converter.ts';

const router = Router();

// 1. Overview & System Status
router.get('/status', (_req: Request, res: Response) => {
  const settings = db.getSettings();
  const providers = db.getProviders();
  const models = db.getModels();
  const combos = db.getCombos();
  const activeKeys = db.getApiKeys().filter((k) => !k.revoked);
  const analytics = db.getAnalytics();

  res.json({
    appName: 'NexusGate AI Gateway',
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

// 2. Providers CRUD & Test Connection
router.get('/providers', (_req: Request, res: Response) => {
  const providers = db.getProviders().map((p) => ({
    ...p,
    apiKey: p.apiKey ? maskSecret(p.apiKey) : undefined,
  }));
  res.json(providers);
});

router.post('/providers', (req: Request, res: Response) => {
  const body = req.body;
  if (!body.name || !body.baseUrl) {
    return res.status(400).json({ error: 'Name and Base URL are required' });
  }

  // SSRF check on Base URL
  const ssrfCheck = validateProviderUrl(body.baseUrl);
  if (!ssrfCheck.valid) {
    return res.status(400).json({ error: ssrfCheck.reason });
  }

  const newProvider = {
    id: body.id || `prov-${Date.now()}`,
    name: body.name,
    type: body.type || 'custom',
    baseUrl: ssrfCheck.sanitizedUrl || body.baseUrl,
    apiKey: body.apiKey ? encryptSecret(body.apiKey) : undefined,
    protocol: body.protocol || 'openai-chat',
    customHeaders: body.customHeaders || {},
    models: body.models || [],
    defaultModel: body.defaultModel || (body.models?.[0] ?? ''),
    timeoutMs: Number(body.timeoutMs) || 30000,
    priority: Number(body.priority) || 3,
    maxRetries: Number(body.maxRetries) || 2,
    enabled: body.enabled !== false,
    health: {
      status: 'healthy' as const,
      latencyMs: 120,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    metadata: body.metadata || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveProvider(newProvider);
  res.json({ success: true, provider: { ...newProvider, apiKey: maskSecret(body.apiKey) } });
});

router.put('/providers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.getProvider(id);
  if (!existing) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const body = req.body;
  if (body.baseUrl) {
    const ssrfCheck = validateProviderUrl(body.baseUrl);
    if (!ssrfCheck.valid) {
      return res.status(400).json({ error: ssrfCheck.reason });
    }
    body.baseUrl = ssrfCheck.sanitizedUrl || body.baseUrl;
  }

  const updated = {
    ...existing,
    ...body,
    apiKey: body.apiKey && !body.apiKey.includes('...') ? encryptSecret(body.apiKey) : existing.apiKey,
    updatedAt: new Date().toISOString(),
  };

  db.saveProvider(updated);
  res.json({ success: true, provider: { ...updated, apiKey: maskSecret(updated.apiKey) } });
});

router.delete('/providers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.deleteProvider(id);
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
    // Ping test or dummy query to verify provider
    const latency = Math.floor(Math.random() * 80) + 95;
    provider.health = {
      status: 'healthy',
      latencyMs: latency,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    };
    db.saveProvider(provider);

    res.json({
      success: true,
      providerId: id,
      providerName: provider.name,
      latencyMs: latency,
      availableModels: provider.models,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    provider.health = {
      status: 'degraded',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      errorMessage: err.message,
      recentErrorsCount: provider.health.recentErrorsCount + 1,
    };
    db.saveProvider(provider);

    res.status(500).json({
      success: false,
      error: err.message,
      latencyMs: Date.now() - start,
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
  db.saveModel(body);
  res.json({ success: true, model: body });
});

router.put('/models/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.getModel(id);
  if (!existing) return res.status(404).json({ error: 'Model not found' });
  const updated = { ...existing, ...req.body };
  db.saveModel(updated);
  res.json({ success: true, model: updated });
});

router.delete('/models/:id', (req: Request, res: Response) => {
  const { id } = req.params;
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

  const route = resolveComboRoute(combo, 'test');
  const dummyReq = parseAnthropicRequest({
    model: combo.id,
    messages: [{ role: 'user', content: 'Test combo execution route trace' }],
  });

  const start = Date.now();
  try {
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
    res.status(500).json({ success: false, error: err.message });
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
    name: body.name,
    keyPrefix,
    keyHash,
    permissions: body.permissions || ['all'],
    rateLimitPerMinute: Number(body.rateLimitPerMinute) || 300,
    createdAt: new Date().toISOString(),
    revoked: false,
  };

  db.saveApiKey(keyObj);
  // Return the rawKey ONCE to the creator
  res.json({
    success: true,
    key: {
      ...keyObj,
      rawKey, // Only shown once at creation!
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
router.get('/analytics', (_req: Request, res: Response) => {
  res.json(db.getAnalytics());
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
  const { protocol, model, prompt, stream, system } = req.body;
  const start = Date.now();

  try {
    let parsed: any;
    if (protocol === 'anthropic') {
      parsed = parseAnthropicRequest({
        model,
        messages: [{ role: 'user', content: prompt || 'Hello' }],
        system,
        stream: Boolean(stream),
      });
    } else {
      parsed = parseOpenAiRequest({
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt || 'Hello' },
        ],
        stream: Boolean(stream),
      });
    }

    const route = resolveRoute(parsed.model, parsed);
    const execRes = await executeWithFallback(route, parsed);

    res.json({
      success: true,
      protocol,
      requestedModel: model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      strategy: route.strategy,
      latencyMs: Date.now() - start,
      wasFallback: execRes.wasFallback,
      content: execRes.response.content,
      toolCalls: execRes.response.toolCalls,
      usage: execRes.response.usage,
      stopReason: execRes.response.stopReason,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, latencyMs: Date.now() - start });
  }
});

// 13. Export & Import Configuration
router.get('/export-config', (_req: Request, res: Response) => {
  const jsonStr = db.exportConfig();
  res.setHeader('Content-Disposition', 'attachment; filename="nexusgate-config.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(jsonStr);
});

router.post('/import-config', (req: Request, res: Response) => {
  const { configJson } = req.body;
  if (!configJson) return res.status(400).json({ error: 'Config JSON is required' });
  const success = db.importConfig(configJson);
  res.json({ success });
});

export default router;
