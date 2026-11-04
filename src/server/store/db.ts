import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ProviderConfig,
  ModelConfig,
  ModelAlias,
  ComboConfig,
  RoutingRule,
  GatewayApiKey,
  RequestLog,
  GatewaySettings,
  GatewayAnalytics,
} from '../../types/gateway.ts';
import { encryptSecret, hashGatewayKey } from '../security/encryption.ts';

function resolveDbFilePath(): string | null {
  try {
    if (typeof process !== 'undefined' && process.env?.CLOUDFLARE_WORKER === '1') {
      return null;
    }
    if (typeof process !== 'undefined' && process.env?.VERCEL) {
      return path.join(os.tmpdir(), '.gateway-data.json');
    }
    return path.resolve(process.cwd(), '.gateway-data.json');
  } catch {
    return null;
  }
}

interface GatewayDatabaseState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  aliases: ModelAlias[];
  combos: ComboConfig[];
  rules: RoutingRule[];
  apiKeys: GatewayApiKey[];
  logs: RequestLog[];
  settings: GatewaySettings;
}

function buildEnvBootstrappedState(): Pick<GatewayDatabaseState, 'providers' | 'models'> {
  const providers: ProviderConfig[] = [];
  const models: ModelConfig[] = [];
  const now = new Date().toISOString();

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    providers.push({
      id: 'prov-gemini',
      name: 'Google Gemini',
      type: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: encryptSecret(geminiKey),
      protocol: 'google-gemini',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      defaultModel: 'gemini-2.5-flash',
      timeoutMs: 30000,
      priority: 1,
      maxRetries: 2,
      enabled: true,
      health: { status: 'unknown', recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now,
    });
    models.push(
      {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        providerId: 'prov-gemini',
        apiModelName: 'gemini-2.5-flash',
        contextWindow: 1048576,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
        enabled: true,
      },
      {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        providerId: 'prov-gemini',
        apiModelName: 'gemini-2.5-pro',
        contextWindow: 2097152,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 1.25, outputPer1MTokens: 5.0 },
        enabled: true,
      }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    providers.push({
      id: 'prov-anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: encryptSecret(anthropicKey),
      protocol: 'anthropic-messages',
      models: ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
      defaultModel: 'claude-3-7-sonnet-20250219',
      timeoutMs: 45000,
      priority: 1,
      maxRetries: 2,
      enabled: true,
      health: { status: 'unknown', recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now,
    });
    models.push(
      {
        id: 'claude-3-7-sonnet',
        displayName: 'Claude 3.7 Sonnet',
        providerId: 'prov-anthropic',
        apiModelName: 'claude-3-7-sonnet-20250219',
        contextWindow: 200000,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 3.0, outputPer1MTokens: 15.0 },
        enabled: true,
      },
      {
        id: 'claude-3-5-haiku',
        displayName: 'Claude 3.5 Haiku',
        providerId: 'prov-anthropic',
        apiModelName: 'claude-3-5-haiku-20241022',
        contextWindow: 200000,
        capabilities: { streaming: true, tools: true, vision: false, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.8, outputPer1MTokens: 4.0 },
        enabled: true,
      }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    providers.push({
      id: 'prov-openai',
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: encryptSecret(openaiKey),
      protocol: 'openai-chat',
      models: ['gpt-4o', 'gpt-4o-mini'],
      defaultModel: 'gpt-4o',
      timeoutMs: 30000,
      priority: 2,
      maxRetries: 2,
      enabled: true,
      health: { status: 'unknown', recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now,
    });
    models.push(
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        providerId: 'prov-openai',
        apiModelName: 'gpt-4o',
        contextWindow: 128000,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 2.5, outputPer1MTokens: 10.0 },
        enabled: true,
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        providerId: 'prov-openai',
        apiModelName: 'gpt-4o-mini',
        contextWindow: 128000,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
        enabled: true,
      }
    );
  }

  return { providers, models };
}

function buildInitialSettings(defaultModelId = ''): GatewaySettings {
  return {
    emergencyKillSwitch: false,
    defaultRoutingMode: 'auto',
    defaultModelId,
    defaultComboId: '',
    globalDailyRequestLimit: 5000,
    globalMonthlySpendingLimitUsd: 150.0,
    currentMonthlySpentUsd: 0,
    requestTimeoutMs: 35000,
    maxRetries: 3,
    retentionDays: 30,
    ownerUid: '',
    ownerEmail: '',
    claudeCodeProfile: {
      defaultSonnetModel: defaultModelId,
      defaultOpusModel: defaultModelId,
      defaultHaikuModel: defaultModelId,
      activeRoutingProfile: 'Default Gateway Policy',
    },
  };
}

class GatewayStore {
  private state: GatewayDatabaseState;
  private customSaveHook: ((json: string) => void) | null = null;

  constructor() {
    this.state = this.loadFromDisk();
  }

  setPersistenceHook(saveFn: ((json: string) => void) | null): void {
    this.customSaveHook = saveFn;
  }

  serializeFullState(): string {
    return JSON.stringify(this.state);
  }

  hydrateFromJson(raw: string | null | undefined): void {
    const fresh = this.createFreshState();
    if (!raw) {
      this.state = fresh;
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.state = {
        providers: Array.isArray(parsed.providers) ? parsed.providers : fresh.providers,
        models: Array.isArray(parsed.models) ? parsed.models : fresh.models,
        aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
        combos: Array.isArray(parsed.combos) ? parsed.combos : [],
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        settings: { ...fresh.settings, ...(parsed.settings || {}) },
      };
    } catch {
      this.state = fresh;
    }
  }

  private createFreshState(): GatewayDatabaseState {
    const bootstrapped = buildEnvBootstrappedState();
    return {
      providers: bootstrapped.providers,
      models: bootstrapped.models,
      aliases: [],
      combos: [],
      rules: [],
      apiKeys: [],
      logs: [],
      settings: buildInitialSettings(bootstrapped.models[0]?.id || ''),
    };
  }

  private loadFromDisk(): GatewayDatabaseState {
    const dbFile = resolveDbFilePath();
    if (!dbFile) {
      return this.createFreshState();
    }
    try {
      if (fs.existsSync(dbFile)) {
        const raw = fs.readFileSync(dbFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const fresh = this.createFreshState();
        return {
          providers: Array.isArray(parsed.providers) ? parsed.providers : fresh.providers,
          models: Array.isArray(parsed.models) ? parsed.models : fresh.models,
          aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
          combos: Array.isArray(parsed.combos) ? parsed.combos : [],
          rules: Array.isArray(parsed.rules) ? parsed.rules : [],
          apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
          logs: Array.isArray(parsed.logs) ? parsed.logs : [],
          settings: { ...fresh.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.warn('Failed to read database file, initializing clean state:', err);
    }

    return this.createFreshState();
  }

  private saveToDisk(): void {
    if (this.customSaveHook) {
      try {
        this.customSaveHook(JSON.stringify(this.state));
      } catch (err) {
        console.error('Failed to persist gateway state to custom storage:', err);
      }
      return;
    }

    const dbFile = resolveDbFilePath();
    if (!dbFile) return;

    try {
      fs.writeFileSync(dbFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write to database file:', err);
    }
  }

  // --- Providers ---
  getProviders(): ProviderConfig[] {
    return this.state.providers;
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.state.providers.find((p) => p.id === id);
  }

  saveProvider(provider: ProviderConfig): void {
    const idx = this.state.providers.findIndex((p) => p.id === provider.id);
    if (idx >= 0) {
      this.state.providers[idx] = { ...provider, updatedAt: new Date().toISOString() };
    } else {
      this.state.providers.push({
        ...provider,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    this.saveToDisk();
  }

  deleteProvider(id: string): boolean {
    const prev = this.state.providers.length;
    this.state.providers = this.state.providers.filter((p) => p.id !== id);
    if (this.state.providers.length !== prev) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  // --- Models ---
  getModels(): ModelConfig[] {
    return this.state.models;
  }

  getModel(id: string): ModelConfig | undefined {
    return this.state.models.find((m) => m.id === id);
  }

  saveModel(model: ModelConfig): void {
    const idx = this.state.models.findIndex((m) => m.id === model.id);
    if (idx >= 0) {
      this.state.models[idx] = model;
    } else {
      this.state.models.push(model);
    }
    if (!this.state.settings.defaultModelId) {
      this.state.settings.defaultModelId = model.id;
    }
    this.saveToDisk();
  }

  deleteModel(id: string): boolean {
    const prev = this.state.models.length;
    this.state.models = this.state.models.filter((m) => m.id !== id);
    if (this.state.models.length !== prev) {
      if (this.state.settings.defaultModelId === id) {
        this.state.settings.defaultModelId = this.state.models[0]?.id || '';
      }
      this.saveToDisk();
      return true;
    }
    return false;
  }

  // --- Aliases ---
  getAliases(): ModelAlias[] {
    return this.state.aliases;
  }

  getAlias(alias: string): ModelAlias | undefined {
    return this.state.aliases.find((a) => a.alias.toLowerCase() === alias.toLowerCase());
  }

  saveAlias(alias: ModelAlias): void {
    const idx = this.state.aliases.findIndex((a) => a.id === alias.id || a.alias === alias.alias);
    if (idx >= 0) {
      this.state.aliases[idx] = alias;
    } else {
      this.state.aliases.push(alias);
    }
    this.saveToDisk();
  }

  deleteAlias(id: string): boolean {
    const prev = this.state.aliases.length;
    this.state.aliases = this.state.aliases.filter((a) => a.id !== id);
    if (this.state.aliases.length !== prev) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  // --- Combos ---
  getCombos(): ComboConfig[] {
    return this.state.combos;
  }

  getCombo(id: string): ComboConfig | undefined {
    return this.state.combos.find((c) => c.id === id);
  }

  saveCombo(combo: ComboConfig): void {
    const idx = this.state.combos.findIndex((c) => c.id === combo.id);
    if (idx >= 0) {
      this.state.combos[idx] = combo;
    } else {
      this.state.combos.push(combo);
    }
    if (!this.state.settings.defaultComboId) {
      this.state.settings.defaultComboId = combo.id;
    }
    this.saveToDisk();
  }

  deleteCombo(id: string): boolean {
    const prev = this.state.combos.length;
    this.state.combos = this.state.combos.filter((c) => c.id !== id);
    if (this.state.combos.length !== prev) {
      if (this.state.settings.defaultComboId === id) {
        this.state.settings.defaultComboId = this.state.combos[0]?.id || '';
      }
      this.saveToDisk();
      return true;
    }
    return false;
  }

  // --- Routing Rules ---
  getRules(): RoutingRule[] {
    return [...this.state.rules].sort((a, b) => a.priority - b.priority);
  }

  saveRules(rules: RoutingRule[]): void {
    this.state.rules = rules;
    this.saveToDisk();
  }

  // --- API Keys ---
  getApiKeys(): GatewayApiKey[] {
    return this.state.apiKeys;
  }

  verifyApiKey(rawKey: string): GatewayApiKey | null {
    if (!rawKey) return null;
    const hash = hashGatewayKey(rawKey);
    const keyObj = this.state.apiKeys.find((k) => k.keyHash === hash && !k.revoked);
    if (keyObj) {
      keyObj.lastUsedAt = new Date().toISOString();
      this.saveToDisk();
      return keyObj;
    }
    return null;
  }

  saveApiKey(key: GatewayApiKey): void {
    this.state.apiKeys.push(key);
    this.saveToDisk();
  }

  revokeApiKey(id: string): boolean {
    const key = this.state.apiKeys.find((k) => k.id === id);
    if (key) {
      key.revoked = true;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  // --- Logs ---
  getLogs(limit = 100): RequestLog[] {
    return this.state.logs.slice(0, limit);
  }

  addLog(log: RequestLog): void {
    this.state.logs.unshift(log);
    if (this.state.logs.length > 1000) {
      this.state.logs.length = 1000;
    }
    // Recalculate current monthly spend from logs in current UTC month
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const monthSpent = this.state.logs
      .filter((l) => l.timestamp.startsWith(monthPrefix))
      .reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
    this.state.settings.currentMonthlySpentUsd = Number(monthSpent.toFixed(5));
    this.saveToDisk();
  }

  clearLogs(): void {
    this.state.logs = [];
    this.state.settings.currentMonthlySpentUsd = 0;
    this.saveToDisk();
  }

  // --- Settings ---
  getSettings(): GatewaySettings {
    return this.state.settings;
  }

  updateSettings(partial: Partial<GatewaySettings>): GatewaySettings {
    this.state.settings = { ...this.state.settings, ...partial };
    this.saveToDisk();
    return this.state.settings;
  }

  // --- Analytics ---
  getAnalytics(range: 'today' | '7d' | '30d' = '7d'): GatewayAnalytics {
    const daysCount = range === 'today' ? 1 : range === '30d' ? 30 : 7;
    const cutoffMs = Date.now() - daysCount * 86400000;
    const allLogs = this.state.logs;
    const logs = range === 'today'
      ? allLogs.filter((l) => l.timestamp.split('T')[0] === new Date().toISOString().split('T')[0])
      : allLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoffMs);

    const totalRequests = logs.length;
    const successfulRequests = logs.filter((l) => l.status === 'success' || l.status === 'fallback_success').length;
    const failedRequests = logs.filter((l) => l.status === 'error').length;
    const totalInputTokens = logs.reduce((sum, l) => sum + (l.inputTokens || 0), 0);
    const totalOutputTokens = logs.reduce((sum, l) => sum + (l.outputTokens || 0), 0);
    const totalEstimatedCostUsd = logs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
    const averageLatencyMs = totalRequests > 0
      ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalRequests)
      : 0;

    const providerDistribution: Record<string, number> = {};
    const modelDistribution: Record<string, number> = {};

    for (const log of logs) {
      const p = log.selectedProvider || 'Unknown';
      const m = log.resolvedModel || 'Unknown';
      providerDistribution[p] = (providerDistribution[p] || 0) + 1;
      modelDistribution[m] = (modelDistribution[m] || 0) + 1;
    }

    const timelineDays = range === 'today' ? 1 : range === '30d' ? 14 : 7;
    const timelineMap: Record<string, { requests: number; tokens: number; costUsd: number; errors: number }> = {};
    for (let i = timelineDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      timelineMap[d] = { requests: 0, tokens: 0, costUsd: 0, errors: 0 };
    }

    for (const log of allLogs) {
      const day = log.timestamp.split('T')[0];
      if (timelineMap[day]) {
        timelineMap[day].requests += 1;
        timelineMap[day].tokens += (log.inputTokens || 0) + (log.outputTokens || 0);
        timelineMap[day].costUsd += log.estimatedCostUsd || 0;
        if (log.status === 'error') timelineMap[day].errors += 1;
      }
    }

    const timeline = Object.entries(timelineMap).map(([date, data]) => ({
      date,
      requests: data.requests,
      tokens: data.tokens,
      costUsd: Number(data.costUsd.toFixed(5)),
      errors: data.errors,
    }));

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalInputTokens,
      totalOutputTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(5)),
      averageLatencyMs,
      providerDistribution,
      modelDistribution,
      timeline,
    };
  }

  exportConfig(): string {
    const safeState = {
      providers: this.state.providers.map((p) => ({
        ...p,
        apiKey: undefined,
      })),
      models: this.state.models,
      aliases: this.state.aliases,
      combos: this.state.combos,
      rules: this.state.rules,
      settings: this.state.settings,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };
    return JSON.stringify(safeState, null, 2);
  }

  importConfig(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.models)) this.state.models = parsed.models;
      if (Array.isArray(parsed.aliases)) this.state.aliases = parsed.aliases;
      if (Array.isArray(parsed.combos)) this.state.combos = parsed.combos;
      if (Array.isArray(parsed.rules)) this.state.rules = parsed.rules;
      if (parsed.settings && typeof parsed.settings === 'object') {
        this.state.settings = { ...this.state.settings, ...parsed.settings };
      }
      this.saveToDisk();
      return true;
    } catch (err) {
      console.error('Failed to import config:', err);
      return false;
    }
  }

  resetState(): void {
    this.state = this.createFreshState();
    this.saveToDisk();
  }
}

export const db = new GatewayStore();
