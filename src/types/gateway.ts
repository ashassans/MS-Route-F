export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'cohere'
  | 'openrouter'
  | 'together'
  | 'fireworks'
  | 'custom';

export type ApiProtocol =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-gemini'
  | 'custom-http';

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'disabled' | 'unknown';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string; // Encrypted or masked
  protocol: ApiProtocol;
  customHeaders?: Record<string, string>;
  models: string[]; // List of model IDs provided
  defaultModel: string;
  timeoutMs: number;
  priority: number; // 1 = highest
  maxRetries: number;
  enabled: boolean;
  health: {
    status: HealthStatus;
    latencyMs?: number;
    lastChecked?: string;
    lastSuccess?: string;
    errorMessage?: string;
    recentErrorsCount: number;
  };
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ModelCapability {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  jsonOutput: boolean;
}

export interface ModelConfig {
  id: string;
  displayName: string;
  providerId: string;
  apiModelName: string;
  contextWindow: number;
  capabilities: ModelCapability;
  pricing: {
    inputPer1MTokens: number; // in USD
    outputPer1MTokens: number;
  };
  enabled: boolean;
}

export interface ModelAlias {
  id: string;
  alias: string; // e.g. "my-fast", "my-coding", "claude-3-5-sonnet-20241022"
  description: string;
  targetType: 'model' | 'combo' | 'auto';
  targetId: string; // modelId or comboId
  isClaudeCodeDefault?: boolean;
}

export type RoutingMode = 'auto' | 'manual' | 'combo';

export type ComboStrategy = 'sequential' | 'parallel' | 'weighted' | 'priority';

export interface ComboProviderStep {
  providerId: string;
  modelId: string;
  weight?: number; // for weighted strategy, e.g. 50
  priority?: number; // for priority strategy
}

export interface ComboConfig {
  id: string;
  name: string;
  description: string;
  strategy: ComboStrategy;
  steps: ComboProviderStep[];
  primaryProviderId?: string;
  retryRules: {
    maxAttempts: number;
    backoffMs: number;
    retryOnRateLimit: boolean;
    retryOnTimeout: boolean;
    retryOnServerError: boolean;
  };
  timeoutMs: number;
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  taskType: 'fast' | 'coding' | 'reasoning' | 'vision' | 'default';
  description: string;
  preferredComboId?: string;
  preferredModelId?: string;
  minimumCapabilities?: Partial<ModelCapability>;
  maxCostPer1M?: number;
  priority: number;
}

export interface GatewayApiKey {
  id: string;
  name: string;
  keyPrefix: string; // e.g. "gw-live-a1b2..."
  keyHash: string;
  permissions: Array<'all' | 'messages' | 'completions' | 'models'>;
  rateLimitPerMinute: number;
  maxTokensPerRequest?: number;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revoked: boolean;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  clientType: 'claude-code' | 'openai-sdk' | 'curl' | 'playground' | 'other';
  endpoint: '/v1/messages' | '/v1/chat/completions' | '/v1/models' | '/v1/responses';
  requestedModel: string;
  resolvedModel: string;
  selectedProvider: string;
  routingStrategy: string;
  status: 'success' | 'error' | 'fallback_success';
  statusCode: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  retryCount: number;
  fallbackHistory: Array<{
    providerId: string;
    modelId: string;
    error: string;
    attemptTime: string;
  }>;
  errorMessage?: string;
  streaming: boolean;
}

export interface GatewaySettings {
  emergencyKillSwitch: boolean; // if true, block all outgoing AI calls
  defaultRoutingMode: RoutingMode;
  defaultModelId: string;
  defaultComboId?: string;
  globalDailyRequestLimit: number;
  globalMonthlySpendingLimitUsd: number;
  currentMonthlySpentUsd: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retentionDays: number;
  ownerUid: string;
  ownerEmail: string;
  claudeCodeProfile: {
    defaultSonnetModel: string;
    defaultOpusModel: string;
    defaultHaikuModel: string;
    activeRoutingProfile: string;
  };
}

export interface GatewayAnalytics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  averageLatencyMs: number;
  providerDistribution: Record<string, number>;
  modelDistribution: Record<string, number>;
  timeline: Array<{
    date: string;
    requests: number;
    tokens: number;
    costUsd: number;
    errors: number;
  }>;
}
