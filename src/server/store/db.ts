import fs from 'node:fs';
import path from 'node:path';
import {
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

const DB_FILE = path.resolve(process.cwd(), '.gateway-data.json');

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

// Initial Seed Configuration for Instant Out-of-the-Box Functionality
const INITIAL_PROVIDERS: ProviderConfig[] = [
  {
    id: 'prov-gemini',
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: encryptSecret(process.env.GEMINI_API_KEY || 'demo-gemini-key'),
    protocol: 'google-gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    defaultModel: 'gemini-2.5-flash',
    timeoutMs: 30000,
    priority: 1,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 142,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prov-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: encryptSecret(process.env.ANTHROPIC_API_KEY || ''),
    protocol: 'anthropic-messages',
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
    defaultModel: 'claude-3-7-sonnet',
    timeoutMs: 45000,
    priority: 1,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 280,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prov-openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: encryptSecret(process.env.OPENAI_API_KEY || ''),
    protocol: 'openai-chat',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    defaultModel: 'gpt-4o',
    timeoutMs: 30000,
    priority: 2,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 210,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prov-deepseek',
    name: 'DeepSeek',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: encryptSecret(process.env.DEEPSEEK_API_KEY || ''),
    protocol: 'openai-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    timeoutMs: 40000,
    priority: 3,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 310,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prov-groq',
    name: 'Groq Cloud',
    type: 'groq',
    baseUrl: 'https://api.groq.com/openai',
    apiKey: encryptSecret(process.env.GROQ_API_KEY || ''),
    protocol: 'openai-chat',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    timeoutMs: 20000,
    priority: 2,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 95,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prov-openrouter',
    name: 'OpenRouter Aggregator',
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    apiKey: encryptSecret(process.env.OPENROUTER_API_KEY || ''),
    protocol: 'openai-chat',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-r1'],
    defaultModel: 'anthropic/claude-3.5-sonnet',
    timeoutMs: 45000,
    priority: 4,
    maxRetries: 2,
    enabled: true,
    health: {
      status: 'healthy',
      latencyMs: 340,
      lastChecked: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      recentErrorsCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const INITIAL_MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    providerId: 'prov-gemini',
    apiModelName: 'gemini-2.5-flash',
    contextWindow: 1048576,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.60 },
    enabled: true,
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    providerId: 'prov-gemini',
    apiModelName: 'gemini-2.5-pro',
    contextWindow: 2097152,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
    pricing: { inputPer1MTokens: 1.25, outputPer1MTokens: 5.00 },
    enabled: true,
  },
  {
    id: 'claude-3-7-sonnet',
    displayName: 'Claude 3.7 Sonnet',
    providerId: 'prov-anthropic',
    apiModelName: 'claude-3-7-sonnet-20250219',
    contextWindow: 200000,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
    pricing: { inputPer1MTokens: 3.00, outputPer1MTokens: 15.00 },
    enabled: true,
  },
  {
    id: 'claude-3-5-haiku',
    displayName: 'Claude 3.5 Haiku',
    providerId: 'prov-anthropic',
    apiModelName: 'claude-3-5-haiku-20241022',
    contextWindow: 200000,
    capabilities: { streaming: true, tools: true, vision: false, reasoning: false, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.80, outputPer1MTokens: 4.00 },
    enabled: true,
  },
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o Omnimodal',
    providerId: 'prov-openai',
    apiModelName: 'gpt-4o',
    contextWindow: 128000,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
    pricing: { inputPer1MTokens: 2.50, outputPer1MTokens: 10.00 },
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    providerId: 'prov-openai',
    apiModelName: 'gpt-4o-mini',
    contextWindow: 128000,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.60 },
    enabled: true,
  },
  {
    id: 'deepseek-chat',
    displayName: 'DeepSeek-V3 Chat',
    providerId: 'prov-deepseek',
    apiModelName: 'deepseek-chat',
    contextWindow: 64000,
    capabilities: { streaming: true, tools: true, vision: false, reasoning: false, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.14, outputPer1MTokens: 0.28 },
    enabled: true,
  },
  {
    id: 'deepseek-reasoner',
    displayName: 'DeepSeek-R1 Reasoner',
    providerId: 'prov-deepseek',
    apiModelName: 'deepseek-reasoner',
    contextWindow: 64000,
    capabilities: { streaming: true, tools: true, vision: false, reasoning: true, jsonOutput: false },
    pricing: { inputPer1MTokens: 0.55, outputPer1MTokens: 2.19 },
    enabled: true,
  },
  {
    id: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B (Groq)',
    providerId: 'prov-groq',
    apiModelName: 'llama-3.3-70b-versatile',
    contextWindow: 128000,
    capabilities: { streaming: true, tools: true, vision: false, reasoning: false, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.59, outputPer1MTokens: 0.79 },
    enabled: true,
  },
];

const INITIAL_ALIASES: ModelAlias[] = [
  {
    id: 'alias-fast',
    alias: 'my-fast',
    description: 'Ultra-low latency model for simple tasks and quick inspections',
    targetType: 'model',
    targetId: 'gemini-2.5-flash',
  },
  {
    id: 'alias-coding',
    alias: 'my-coding',
    description: 'Top-tier code engineering combo with automatic fallback',
    targetType: 'combo',
    targetId: 'combo-prod-coding',
  },
  {
    id: 'alias-reasoning',
    alias: 'my-reasoning',
    description: 'Deep chain-of-thought mathematical and architectural reasoning',
    targetType: 'model',
    targetId: 'deepseek-reasoner',
  },
  {
    id: 'alias-vision',
    alias: 'my-vision',
    description: 'High-resolution multimodal visual analysis',
    targetType: 'model',
    targetId: 'gemini-2.5-pro',
  },
  {
    id: 'alias-best',
    alias: 'my-best',
    description: 'Best overall model for mission-critical tasks',
    targetType: 'model',
    targetId: 'claude-3-7-sonnet',
  },
  // Claude Code standard aliases
  {
    id: 'alias-claude-sonnet',
    alias: 'claude-3-5-sonnet-20241022',
    description: 'Claude Code Default Sonnet mapping',
    targetType: 'combo',
    targetId: 'combo-prod-coding',
    isClaudeCodeDefault: true,
  },
  {
    id: 'alias-claude-haiku',
    alias: 'claude-3-5-haiku-20241022',
    description: 'Claude Code Default Haiku mapping',
    targetType: 'model',
    targetId: 'claude-3-5-haiku',
    isClaudeCodeDefault: true,
  },
  {
    id: 'alias-claude-opus',
    alias: 'claude-3-opus-20240229',
    description: 'Claude Code Opus mapping',
    targetType: 'model',
    targetId: 'claude-3-7-sonnet',
    isClaudeCodeDefault: true,
  },
];

const INITIAL_COMBOS: ComboConfig[] = [
  {
    id: 'combo-prod-coding',
    name: 'Production Coding Failover',
    description: 'Tries Anthropic Sonnet first. On rate-limit or error, falls back to Gemini 2.5 Pro, then DeepSeek Chat.',
    strategy: 'sequential',
    steps: [
      { providerId: 'prov-anthropic', modelId: 'claude-3-7-sonnet', priority: 1 },
      { providerId: 'prov-gemini', modelId: 'gemini-2.5-pro', priority: 2 },
      { providerId: 'prov-deepseek', modelId: 'deepseek-chat', priority: 3 },
    ],
    primaryProviderId: 'prov-anthropic',
    retryRules: {
      maxAttempts: 3,
      backoffMs: 500,
      retryOnRateLimit: true,
      retryOnTimeout: true,
      retryOnServerError: true,
    },
    timeoutMs: 45000,
    enabled: true,
  },
  {
    id: 'combo-ultra-fast',
    name: 'Ultra Fast Parallel Race',
    description: 'Concurrent race between Groq Llama 3.3 and Gemini Flash. Returns the lowest-latency response.',
    strategy: 'parallel',
    steps: [
      { providerId: 'prov-groq', modelId: 'llama-3.3-70b-versatile' },
      { providerId: 'prov-gemini', modelId: 'gemini-2.5-flash' },
    ],
    retryRules: {
      maxAttempts: 2,
      backoffMs: 300,
      retryOnRateLimit: true,
      retryOnTimeout: true,
      retryOnServerError: true,
    },
    timeoutMs: 20000,
    enabled: true,
  },
  {
    id: 'combo-cost-balancer',
    name: 'Weighted Cost Balancer',
    description: 'Distributes 65% of volume to Groq and 35% to Gemini Flash with health-aware automatic exclusion.',
    strategy: 'weighted',
    steps: [
      { providerId: 'prov-groq', modelId: 'llama-3.3-70b-versatile', weight: 65 },
      { providerId: 'prov-gemini', modelId: 'gemini-2.5-flash', weight: 35 },
    ],
    retryRules: {
      maxAttempts: 2,
      backoffMs: 400,
      retryOnRateLimit: true,
      retryOnTimeout: true,
      retryOnServerError: true,
    },
    timeoutMs: 25000,
    enabled: true,
  },
];

const INITIAL_RULES: RoutingRule[] = [
  {
    id: 'rule-coding',
    name: 'Coding & Development Tasks',
    taskType: 'coding',
    description: 'Routes coding workflows to the Production Coding combo',
    preferredComboId: 'combo-prod-coding',
    minimumCapabilities: { tools: true, streaming: true },
    priority: 1,
  },
  {
    id: 'rule-fast',
    name: 'Fast & Lightweight Queries',
    taskType: 'fast',
    description: 'Routes conversational queries to lowest-latency model',
    preferredModelId: 'gemini-2.5-flash',
    minimumCapabilities: { streaming: true },
    priority: 2,
  },
  {
    id: 'rule-reasoning',
    name: 'Complex Reasoning & Math',
    taskType: 'reasoning',
    description: 'Routes deep step-by-step logic to DeepSeek R1',
    preferredModelId: 'deepseek-reasoner',
    minimumCapabilities: { reasoning: true },
    priority: 3,
  },
  {
    id: 'rule-vision',
    name: 'Vision & Multimodal Input',
    taskType: 'vision',
    description: 'Routes image inspection to Gemini 2.5 Pro or GPT-4o',
    preferredModelId: 'gemini-2.5-pro',
    minimumCapabilities: { vision: true },
    priority: 4,
  },
];

// Pre-seeded master key for owner access
const DEFAULT_KEY_RAW = 'gw-live-master-key-prod-001';
const INITIAL_KEYS: GatewayApiKey[] = [
  {
    id: 'key-master-001',
    name: 'Claude Code & Primary Development Key',
    keyPrefix: 'gw-live-master...',
    keyHash: hashGatewayKey(DEFAULT_KEY_RAW),
    permissions: ['all'],
    rateLimitPerMinute: 600,
    createdAt: new Date().toISOString(),
    revoked: false,
  },
];

const INITIAL_SETTINGS: GatewaySettings = {
  emergencyKillSwitch: false,
  defaultRoutingMode: 'combo',
  defaultModelId: 'claude-3-7-sonnet',
  defaultComboId: 'combo-prod-coding',
  globalDailyRequestLimit: 5000,
  globalMonthlySpendingLimitUsd: 150.0,
  currentMonthlySpentUsd: 14.82,
  requestTimeoutMs: 35000,
  maxRetries: 3,
  retentionDays: 30,
  ownerUid: 'owner-personal-cloud-uid',
  ownerEmail: 'digonto9191@gmail.com',
  claudeCodeProfile: {
    defaultSonnetModel: 'combo-prod-coding',
    defaultOpusModel: 'claude-3-7-sonnet',
    defaultHaikuModel: 'claude-3-5-haiku',
    activeRoutingProfile: 'Production Coding Failover',
  },
};

// Seed 8 realistic recent request logs for rich UI
const INITIAL_LOGS: RequestLog[] = [
  {
    id: 'req-001-init',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    clientType: 'claude-code',
    endpoint: '/v1/messages',
    requestedModel: 'claude-3-5-sonnet-20241022',
    resolvedModel: 'claude-3-7-sonnet',
    selectedProvider: 'Anthropic',
    routingStrategy: 'combo-sequential',
    status: 'success',
    statusCode: 200,
    latencyMs: 385,
    inputTokens: 1420,
    outputTokens: 620,
    estimatedCostUsd: 0.0135,
    retryCount: 0,
    fallbackHistory: [],
    streaming: true,
  },
  {
    id: 'req-002-init',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    clientType: 'claude-code',
    endpoint: '/v1/messages',
    requestedModel: 'claude-3-5-sonnet-20241022',
    resolvedModel: 'gemini-2.5-pro',
    selectedProvider: 'Google Gemini',
    routingStrategy: 'combo-sequential (fallback)',
    status: 'fallback_success',
    statusCode: 200,
    latencyMs: 512,
    inputTokens: 2150,
    outputTokens: 890,
    estimatedCostUsd: 0.0071,
    retryCount: 1,
    fallbackHistory: [
      {
        providerId: 'prov-anthropic',
        modelId: 'claude-3-7-sonnet',
        error: '429 Rate limit exceeded - failover triggered',
        attemptTime: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      },
    ],
    streaming: true,
  },
  {
    id: 'req-003-init',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    clientType: 'openai-sdk',
    endpoint: '/v1/chat/completions',
    requestedModel: 'my-fast',
    resolvedModel: 'gemini-2.5-flash',
    selectedProvider: 'Google Gemini',
    routingStrategy: 'alias-resolution',
    status: 'success',
    statusCode: 200,
    latencyMs: 145,
    inputTokens: 520,
    outputTokens: 180,
    estimatedCostUsd: 0.00018,
    retryCount: 0,
    fallbackHistory: [],
    streaming: true,
  },
  {
    id: 'req-004-init',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    clientType: 'claude-code',
    endpoint: '/v1/messages',
    requestedModel: 'my-reasoning',
    resolvedModel: 'deepseek-reasoner',
    selectedProvider: 'DeepSeek',
    routingStrategy: 'alias-resolution',
    status: 'success',
    statusCode: 200,
    latencyMs: 820,
    inputTokens: 3100,
    outputTokens: 1450,
    estimatedCostUsd: 0.0048,
    retryCount: 0,
    fallbackHistory: [],
    streaming: true,
  },
  {
    id: 'req-005-init',
    timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    clientType: 'playground',
    endpoint: '/v1/chat/completions',
    requestedModel: 'gpt-4o',
    resolvedModel: 'gpt-4o',
    selectedProvider: 'OpenAI',
    routingStrategy: 'manual',
    status: 'success',
    statusCode: 200,
    latencyMs: 275,
    inputTokens: 410,
    outputTokens: 195,
    estimatedCostUsd: 0.0029,
    retryCount: 0,
    fallbackHistory: [],
    streaming: false,
  },
];

class GatewayStore {
  private state: GatewayDatabaseState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): GatewayDatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          providers: parsed.providers || INITIAL_PROVIDERS,
          models: parsed.models || INITIAL_MODELS,
          aliases: parsed.aliases || INITIAL_ALIASES,
          combos: parsed.combos || INITIAL_COMBOS,
          rules: parsed.rules || INITIAL_RULES,
          apiKeys: parsed.apiKeys || INITIAL_KEYS,
          logs: parsed.logs || INITIAL_LOGS,
          settings: { ...INITIAL_SETTINGS, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.warn('Failed to read database file, initializing defaults:', err);
    }

    return {
      providers: INITIAL_PROVIDERS,
      models: INITIAL_MODELS,
      aliases: INITIAL_ALIASES,
      combos: INITIAL_COMBOS,
      rules: INITIAL_RULES,
      apiKeys: INITIAL_KEYS,
      logs: INITIAL_LOGS,
      settings: INITIAL_SETTINGS,
    };
  }

  private saveToDisk(): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
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
    this.saveToDisk();
  }

  deleteModel(id: string): boolean {
    const prev = this.state.models.length;
    this.state.models = this.state.models.filter((m) => m.id !== id);
    if (this.state.models.length !== prev) {
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
    this.state.aliases = this.state.aliases.filter((a) => a.id !== id);
    this.saveToDisk();
    return true;
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
    this.saveToDisk();
  }

  deleteCombo(id: string): boolean {
    this.state.combos = this.state.combos.filter((c) => c.id !== id);
    this.saveToDisk();
    return true;
  }

  // --- Routing Rules ---
  getRules(): RoutingRule[] {
    return this.state.rules.sort((a, b) => a.priority - b.priority);
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
    // Keep max 1000 logs
    if (this.state.logs.length > 1000) {
      this.state.logs.length = 1000;
    }
    this.saveToDisk();
  }

  clearLogs(): void {
    this.state.logs = [];
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
  getAnalytics(): GatewayAnalytics {
    const logs = this.state.logs;
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

    // Build 7-day timeline
    const timelineMap: Record<string, { requests: number; tokens: number; costUsd: number; errors: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      timelineMap[d] = { requests: 0, tokens: 0, costUsd: 0, errors: 0 };
    }

    for (const log of logs) {
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
      costUsd: Number(data.costUsd.toFixed(4)),
      errors: data.errors,
    }));

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalInputTokens,
      totalOutputTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(4)),
      averageLatencyMs,
      providerDistribution,
      modelDistribution,
      timeline,
    };
  }

  // Export full non-secret configuration
  exportConfig(): string {
    const safeState = {
      providers: this.state.providers.map((p) => ({
        ...p,
        apiKey: undefined, // Never export secrets
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

  // Import configuration
  importConfig(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.models) this.state.models = parsed.models;
      if (parsed.aliases) this.state.aliases = parsed.aliases;
      if (parsed.combos) this.state.combos = parsed.combos;
      if (parsed.rules) this.state.rules = parsed.rules;
      if (parsed.settings) this.state.settings = { ...this.state.settings, ...parsed.settings };
      this.saveToDisk();
      return true;
    } catch (err) {
      console.error('Failed to import config:', err);
      return false;
    }
  }
}

export const db = new GatewayStore();
export { DEFAULT_KEY_RAW };
