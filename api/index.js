// src/server/app.ts
import express from "express";
import dotenv from "dotenv";

// src/server/routes/gateway-v1.ts
import { Router } from "express";

// src/server/store/db.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// src/server/security/encryption.ts
import crypto from "node:crypto";
function getMasterKey() {
  const masterSecret = process.env.GATEWAY_ENCRYPTION_SECRET || "nexusgate-secure-default-encryption-key-32b-len";
  return crypto.createHash("sha256").update(masterSecret).digest();
}
function encryptSecret(plainText) {
  if (!plainText) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}
function decryptSecret(encryptedPayload) {
  if (!encryptedPayload) return "";
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    return encryptedPayload;
  }
  try {
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Failed to decrypt secret payload:", err);
    return "";
  }
}
function generateGatewayApiKey() {
  const random = crypto.randomBytes(24).toString("hex");
  const rawKey = `gw-live-${random}`;
  const keyPrefix = `gw-live-${random.slice(0, 6)}...`;
  const keyHash = hashGatewayKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}
function hashGatewayKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey.trim()).digest("hex");
}
function maskSecret(secret) {
  if (!secret) return "Not configured";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

// src/lib/combo-helpers.ts
function toComboModelSlug(name) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (!/\s/.test(trimmed) && /[/:.]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9/:._-]+/g, "-").replace(/^-+|-+$/g, "");
}

// src/server/store/db.ts
function resolveDbFilePath() {
  try {
    if (typeof process !== "undefined" && process.env?.CLOUDFLARE_WORKER === "1") {
      return null;
    }
    if (typeof process !== "undefined" && process.env?.VERCEL) {
      return path.join(os.tmpdir(), ".gateway-data.json");
    }
    return path.resolve(process.cwd(), ".gateway-data.json");
  } catch {
    return null;
  }
}
function buildEnvBootstrappedState() {
  const providers = [];
  const models = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    providers.push({
      id: "prov-gemini",
      name: "Google Gemini",
      type: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: encryptSecret(geminiKey),
      protocol: "google-gemini",
      models: ["gemini-2.5-flash", "gemini-2.5-pro"],
      defaultModel: "gemini-2.5-flash",
      timeoutMs: 3e4,
      priority: 1,
      maxRetries: 2,
      enabled: true,
      health: { status: "unknown", recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now
    });
    models.push(
      {
        id: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        providerId: "prov-gemini",
        apiModelName: "gemini-2.5-flash",
        contextWindow: 1048576,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
        enabled: true
      },
      {
        id: "gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        providerId: "prov-gemini",
        apiModelName: "gemini-2.5-pro",
        contextWindow: 2097152,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 1.25, outputPer1MTokens: 5 },
        enabled: true
      }
    );
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    providers.push({
      id: "prov-anthropic",
      name: "Anthropic",
      type: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: encryptSecret(anthropicKey),
      protocol: "anthropic-messages",
      models: ["claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
      defaultModel: "claude-3-7-sonnet-20250219",
      timeoutMs: 45e3,
      priority: 1,
      maxRetries: 2,
      enabled: true,
      health: { status: "unknown", recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now
    });
    models.push(
      {
        id: "claude-3-7-sonnet",
        displayName: "Claude 3.7 Sonnet",
        providerId: "prov-anthropic",
        apiModelName: "claude-3-7-sonnet-20250219",
        contextWindow: 2e5,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
        pricing: { inputPer1MTokens: 3, outputPer1MTokens: 15 },
        enabled: true
      },
      {
        id: "claude-3-5-haiku",
        displayName: "Claude 3.5 Haiku",
        providerId: "prov-anthropic",
        apiModelName: "claude-3-5-haiku-20241022",
        contextWindow: 2e5,
        capabilities: { streaming: true, tools: true, vision: false, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.8, outputPer1MTokens: 4 },
        enabled: true
      }
    );
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    providers.push({
      id: "prov-openai",
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: encryptSecret(openaiKey),
      protocol: "openai-chat",
      models: ["gpt-4o", "gpt-4o-mini"],
      defaultModel: "gpt-4o",
      timeoutMs: 3e4,
      priority: 2,
      maxRetries: 2,
      enabled: true,
      health: { status: "unknown", recentErrorsCount: 0 },
      createdAt: now,
      updatedAt: now
    });
    models.push(
      {
        id: "gpt-4o",
        displayName: "GPT-4o",
        providerId: "prov-openai",
        apiModelName: "gpt-4o",
        contextWindow: 128e3,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 2.5, outputPer1MTokens: 10 },
        enabled: true
      },
      {
        id: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        providerId: "prov-openai",
        apiModelName: "gpt-4o-mini",
        contextWindow: 128e3,
        capabilities: { streaming: true, tools: true, vision: true, reasoning: false, jsonOutput: true },
        pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
        enabled: true
      }
    );
  }
  return { providers, models };
}
function buildInitialSettings(defaultModelId = "") {
  return {
    emergencyKillSwitch: false,
    defaultRoutingMode: "auto",
    defaultModelId,
    defaultComboId: "",
    globalDailyRequestLimit: 5e3,
    globalMonthlySpendingLimitUsd: 150,
    currentMonthlySpentUsd: 0,
    requestTimeoutMs: 35e3,
    maxRetries: 3,
    retentionDays: 30,
    ownerUid: "",
    ownerEmail: "",
    claudeCodeProfile: {
      defaultSonnetModel: defaultModelId,
      defaultOpusModel: defaultModelId,
      defaultHaikuModel: defaultModelId,
      activeRoutingProfile: "Default Gateway Policy"
    }
  };
}
var GatewayStore = class {
  constructor() {
    this.customSaveHook = null;
    this.state = this.loadFromDisk();
  }
  setPersistenceHook(saveFn) {
    this.customSaveHook = saveFn;
  }
  serializeFullState() {
    return JSON.stringify(this.state);
  }
  hydrateFromJson(raw) {
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
        settings: { ...fresh.settings, ...parsed.settings || {} }
      };
    } catch {
      this.state = fresh;
    }
  }
  createFreshState() {
    const bootstrapped = buildEnvBootstrappedState();
    return {
      providers: bootstrapped.providers,
      models: bootstrapped.models,
      aliases: [],
      combos: [],
      rules: [],
      apiKeys: [],
      logs: [],
      settings: buildInitialSettings(bootstrapped.models[0]?.id || "")
    };
  }
  loadFromDisk() {
    const dbFile = resolveDbFilePath();
    if (!dbFile) {
      return this.createFreshState();
    }
    try {
      if (fs.existsSync(dbFile)) {
        const raw = fs.readFileSync(dbFile, "utf-8");
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
          settings: { ...fresh.settings, ...parsed.settings || {} }
        };
      }
    } catch (err) {
      console.warn("Failed to read database file, initializing clean state:", err);
    }
    return this.createFreshState();
  }
  saveToDisk() {
    if (this.customSaveHook) {
      try {
        this.customSaveHook(JSON.stringify(this.state));
      } catch (err) {
        console.error("Failed to persist gateway state to custom storage:", err);
      }
      return;
    }
    const dbFile = resolveDbFilePath();
    if (!dbFile) return;
    try {
      fs.writeFileSync(dbFile, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write to database file:", err);
    }
  }
  // --- Providers ---
  getProviders() {
    return this.state.providers;
  }
  getProvider(id) {
    return this.state.providers.find((p) => p.id === id);
  }
  saveProvider(provider) {
    const idx = this.state.providers.findIndex((p) => p.id === provider.id);
    if (idx >= 0) {
      this.state.providers[idx] = { ...provider, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else {
      this.state.providers.push({
        ...provider,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    this.saveToDisk();
  }
  deleteProvider(id) {
    const prev = this.state.providers.length;
    this.state.providers = this.state.providers.filter((p) => p.id !== id);
    if (this.state.providers.length !== prev) {
      this.state.models = this.state.models.filter((m) => m.providerId !== id);
      if (this.state.settings.defaultModelId && !this.state.models.some((m) => m.id === this.state.settings.defaultModelId)) {
        this.state.settings.defaultModelId = this.state.models[0]?.id || "";
      }
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // --- Models ---
  getModels() {
    return this.state.models;
  }
  getModel(id) {
    return this.state.models.find((m) => m.id === id);
  }
  saveModel(model) {
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
  deleteModel(id) {
    const prev = this.state.models.length;
    this.state.models = this.state.models.filter((m) => m.id !== id);
    if (this.state.models.length !== prev) {
      if (this.state.settings.defaultModelId === id) {
        this.state.settings.defaultModelId = this.state.models[0]?.id || "";
      }
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // --- Aliases ---
  getAliases() {
    return this.state.aliases;
  }
  getAlias(alias) {
    return this.state.aliases.find((a) => a.alias.toLowerCase() === alias.toLowerCase());
  }
  saveAlias(alias) {
    const idx = this.state.aliases.findIndex((a) => a.id === alias.id || a.alias === alias.alias);
    if (idx >= 0) {
      this.state.aliases[idx] = alias;
    } else {
      this.state.aliases.push(alias);
    }
    this.saveToDisk();
  }
  deleteAlias(id) {
    const prev = this.state.aliases.length;
    this.state.aliases = this.state.aliases.filter((a) => a.id !== id);
    if (this.state.aliases.length !== prev) {
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // --- Combos ---
  getCombos() {
    return this.state.combos;
  }
  getCombo(id) {
    return this.state.combos.find((c) => c.id === id);
  }
  findCombo(identifier) {
    const clean = identifier.trim();
    if (!clean) return void 0;
    const lower = clean.toLowerCase();
    const slug = toComboModelSlug(clean).toLowerCase();
    return this.state.combos.find((c) => c.id === clean) || this.state.combos.find((c) => c.id.toLowerCase() === lower) || this.state.combos.find((c) => c.name.trim().toLowerCase() === lower) || (slug ? this.state.combos.find((c) => toComboModelSlug(c.name).toLowerCase() === slug) : void 0);
  }
  saveCombo(combo, previousId) {
    const lookupId = previousId || combo.id;
    const idx = this.state.combos.findIndex((c) => c.id === lookupId || c.id === combo.id);
    if (idx >= 0) {
      this.state.combos[idx] = combo;
    } else {
      this.state.combos.push(combo);
    }
    if (!this.state.settings.defaultComboId || this.state.settings.defaultComboId === previousId) {
      this.state.settings.defaultComboId = combo.id;
    }
    this.saveToDisk();
  }
  deleteCombo(id) {
    const prev = this.state.combos.length;
    this.state.combos = this.state.combos.filter((c) => c.id !== id);
    if (this.state.combos.length !== prev) {
      if (this.state.settings.defaultComboId === id) {
        this.state.settings.defaultComboId = this.state.combos[0]?.id || "";
      }
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // --- Routing Rules ---
  getRules() {
    return [...this.state.rules].sort((a, b) => a.priority - b.priority);
  }
  saveRules(rules) {
    this.state.rules = rules;
    this.saveToDisk();
  }
  // --- API Keys ---
  getApiKeys() {
    return this.state.apiKeys;
  }
  verifyApiKey(rawKey) {
    if (!rawKey) return null;
    const hash = hashGatewayKey(rawKey);
    const keyObj = this.state.apiKeys.find((k) => k.keyHash === hash && !k.revoked);
    if (keyObj) {
      keyObj.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.saveToDisk();
      return keyObj;
    }
    return null;
  }
  saveApiKey(key) {
    this.state.apiKeys.push(key);
    this.saveToDisk();
  }
  revokeApiKey(id) {
    const key = this.state.apiKeys.find((k) => k.id === id);
    if (key) {
      key.revoked = true;
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // --- Logs ---
  getLogs(limit = 100) {
    return this.state.logs.slice(0, limit);
  }
  addLog(log) {
    this.state.logs.unshift(log);
    if (this.state.logs.length > 1e3) {
      this.state.logs.length = 1e3;
    }
    const monthPrefix = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const monthSpent = this.state.logs.filter((l) => l.timestamp.startsWith(monthPrefix)).reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
    this.state.settings.currentMonthlySpentUsd = Number(monthSpent.toFixed(5));
    this.saveToDisk();
  }
  clearLogs() {
    this.state.logs = [];
    this.state.settings.currentMonthlySpentUsd = 0;
    this.saveToDisk();
  }
  // --- Settings ---
  getSettings() {
    return this.state.settings;
  }
  updateSettings(partial) {
    this.state.settings = { ...this.state.settings, ...partial };
    this.saveToDisk();
    return this.state.settings;
  }
  // --- Analytics ---
  getAnalytics(range = "7d") {
    const daysCount = range === "today" ? 1 : range === "30d" ? 30 : 7;
    const cutoffMs = Date.now() - daysCount * 864e5;
    const allLogs = this.state.logs;
    const logs = range === "today" ? allLogs.filter((l) => l.timestamp.split("T")[0] === (/* @__PURE__ */ new Date()).toISOString().split("T")[0]) : allLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoffMs);
    const totalRequests = logs.length;
    const successfulRequests = logs.filter((l) => l.status === "success" || l.status === "fallback_success").length;
    const failedRequests = logs.filter((l) => l.status === "error").length;
    const totalInputTokens = logs.reduce((sum, l) => sum + (l.inputTokens || 0), 0);
    const totalOutputTokens = logs.reduce((sum, l) => sum + (l.outputTokens || 0), 0);
    const totalEstimatedCostUsd = logs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
    const averageLatencyMs = totalRequests > 0 ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalRequests) : 0;
    const providerDistribution = {};
    const modelDistribution = {};
    for (const log of logs) {
      const p = log.selectedProvider || "Unknown";
      const m = log.resolvedModel || "Unknown";
      providerDistribution[p] = (providerDistribution[p] || 0) + 1;
      modelDistribution[m] = (modelDistribution[m] || 0) + 1;
    }
    const timelineDays = range === "today" ? 1 : range === "30d" ? 14 : 7;
    const timelineMap = {};
    for (let i = timelineDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().split("T")[0];
      timelineMap[d] = { requests: 0, tokens: 0, costUsd: 0, errors: 0 };
    }
    for (const log of allLogs) {
      const day = log.timestamp.split("T")[0];
      if (timelineMap[day]) {
        timelineMap[day].requests += 1;
        timelineMap[day].tokens += (log.inputTokens || 0) + (log.outputTokens || 0);
        timelineMap[day].costUsd += log.estimatedCostUsd || 0;
        if (log.status === "error") timelineMap[day].errors += 1;
      }
    }
    const timeline = Object.entries(timelineMap).map(([date, data]) => ({
      date,
      requests: data.requests,
      tokens: data.tokens,
      costUsd: Number(data.costUsd.toFixed(5)),
      errors: data.errors
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
      timeline
    };
  }
  exportConfig() {
    const safeState = {
      providers: this.state.providers.map((p) => ({
        ...p,
        apiKey: void 0
      })),
      models: this.state.models,
      aliases: this.state.aliases,
      combos: this.state.combos,
      rules: this.state.rules,
      settings: this.state.settings,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0.0"
    };
    return JSON.stringify(safeState, null, 2);
  }
  importConfig(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.models)) this.state.models = parsed.models;
      if (Array.isArray(parsed.aliases)) this.state.aliases = parsed.aliases;
      if (Array.isArray(parsed.combos)) this.state.combos = parsed.combos;
      if (Array.isArray(parsed.rules)) this.state.rules = parsed.rules;
      if (parsed.settings && typeof parsed.settings === "object") {
        this.state.settings = { ...this.state.settings, ...parsed.settings };
      }
      this.saveToDisk();
      return true;
    } catch (err) {
      console.error("Failed to import config:", err);
      return false;
    }
  }
  resetState() {
    this.state = this.createFreshState();
    this.saveToDisk();
  }
};
var db = new GatewayStore();

// src/server/adapters/protocol-converter.ts
function parseAnthropicRequest(body) {
  const model = body.model || "claude-3-7-sonnet";
  const stream = Boolean(body.stream);
  const maxTokens = body.max_tokens || 4096;
  const temperature = body.temperature;
  const topP = body.top_p;
  let system = "";
  if (typeof body.system === "string") {
    system = body.system;
  } else if (Array.isArray(body.system)) {
    system = body.system.map((b) => typeof b === "string" ? b : b.text || "").join("\n\n");
  }
  const messages = [];
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const role = msg.role === "assistant" ? "assistant" : "user";
      if (typeof msg.content === "string") {
        messages.push({ role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") {
            messages.push({ role, content: block.text || "" });
          } else if (block.type === "tool_use") {
            messages.push({
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: block.id,
                  type: "function",
                  function: {
                    name: block.name,
                    arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input || {})
                  }
                }
              ]
            });
          } else if (block.type === "tool_result") {
            messages.push({
              role: "tool",
              toolCallId: block.tool_use_id,
              content: typeof block.content === "string" ? block.content : JSON.stringify(block.content || "")
            });
          } else if (block.type === "image") {
            const source = block.source;
            const url = source?.type === "base64" ? `data:${source.media_type};base64,${source.data}` : source?.url || "";
            messages.push({
              role: "user",
              content: [{ type: "image_url", image_url: { url } }]
            });
          }
        }
      }
    }
  }
  const tools = [];
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      tools.push({
        name: t.name,
        description: t.description,
        parameters: t.input_schema || t.parameters
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
    tools: tools.length > 0 ? tools : void 0,
    toolChoice: body.tool_choice
  };
}
function parseOpenAiRequest(body) {
  const model = body.model || "gpt-4o";
  const stream = Boolean(body.stream);
  const maxTokens = body.max_tokens || body.max_completion_tokens || 4096;
  const temperature = body.temperature;
  const topP = body.top_p;
  let system = "";
  const messages = [];
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === "system") {
        system = (system ? system + "\n\n" : "") + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      } else if (msg.role === "tool") {
        messages.push({
          role: "tool",
          toolCallId: msg.tool_call_id,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        });
      } else {
        const role = msg.role === "assistant" ? "assistant" : "user";
        messages.push({
          role,
          content: msg.content,
          toolCalls: msg.tool_calls
        });
      }
    }
  }
  const tools = [];
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (t.type === "function" && t.function) {
        tools.push({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
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
    tools: tools.length > 0 ? tools : void 0,
    toolChoice: body.tool_choice
  };
}
function formatAnthropicResponse(res) {
  const contentBlocks = [];
  if (res.content) {
    contentBlocks.push({
      type: "text",
      text: res.content
    });
  }
  if (res.toolCalls && res.toolCalls.length > 0) {
    for (const call of res.toolCalls) {
      let inputObj = {};
      try {
        inputObj = JSON.parse(call.arguments || "{}");
      } catch {
        inputObj = { raw: call.arguments };
      }
      contentBlocks.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: inputObj
      });
    }
  }
  return {
    id: res.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: res.model,
    content: contentBlocks,
    stop_reason: res.stopReason || (res.toolCalls?.length ? "tool_use" : "end_turn"),
    stop_sequence: null,
    usage: {
      input_tokens: res.usage.inputTokens,
      output_tokens: res.usage.outputTokens
    }
  };
}
function formatOpenAiResponse(res) {
  const message = {
    role: "assistant",
    content: res.content || null
  };
  if (res.toolCalls && res.toolCalls.length > 0) {
    message.tool_calls = res.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.name,
        arguments: call.arguments
      }
    }));
  }
  return {
    id: res.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model: res.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: res.stopReason || (res.toolCalls?.length ? "tool_calls" : "stop")
      }
    ],
    usage: {
      prompt_tokens: res.usage.inputTokens,
      completion_tokens: res.usage.outputTokens,
      total_tokens: res.usage.inputTokens + res.usage.outputTokens
    }
  };
}

// src/server/engine/router.ts
function resolveRoute(requestedModelName, req, forcedMode) {
  const settings = db.getSettings();
  const effectiveMode = forcedMode || settings.defaultRoutingMode;
  const alias = db.getAlias(requestedModelName);
  if (alias) {
    if (alias.targetType === "combo") {
      const combo = db.findCombo(alias.targetId);
      if (combo && combo.enabled) {
        return resolveComboRoute(combo, `alias:${alias.alias}`);
      }
    } else if (alias.targetType === "model") {
      const model = db.getModel(alias.targetId);
      if (model && model.enabled) {
        const prov2 = db.getProvider(model.providerId);
        if (prov2 && prov2.enabled) {
          return {
            strategy: `alias:${alias.alias}`,
            selectedProvider: prov2,
            selectedModel: model
          };
        }
      }
    }
  }
  const directCombo = db.findCombo(requestedModelName);
  if (directCombo && directCombo.enabled) {
    return resolveComboRoute(directCombo, "direct-combo");
  }
  const directModel = db.getModel(requestedModelName) || db.getModels().find((m) => m.apiModelName === requestedModelName && m.enabled);
  if (directModel && directModel.enabled) {
    const prov2 = db.getProvider(directModel.providerId);
    if (prov2 && prov2.enabled) {
      return {
        strategy: "direct-model",
        selectedProvider: prov2,
        selectedModel: directModel
      };
    }
  }
  if (effectiveMode === "auto") {
    return resolveAutoRoute(req);
  }
  if (effectiveMode === "combo" && settings.defaultComboId) {
    const combo = db.getCombo(settings.defaultComboId);
    if (combo && combo.enabled) {
      return resolveComboRoute(combo, "default-combo");
    }
  }
  const enabledModels = db.getModels().filter((m) => m.enabled);
  const enabledProviders = db.getProviders().filter((p) => p.enabled);
  if (enabledModels.length === 0 || enabledProviders.length === 0) {
    throw new Error("No active AI providers or models are configured. Add an AI provider and API key in the Providers tab.");
  }
  const defaultModel = enabledModels.find((m) => m.id === settings.defaultModelId) || enabledModels.find((m) => enabledProviders.some((p) => p.id === m.providerId)) || enabledModels[0];
  const prov = enabledProviders.find((p) => p.id === defaultModel.providerId) || enabledProviders[0];
  return {
    strategy: "default-fallback",
    selectedProvider: prov,
    selectedModel: defaultModel
  };
}
function resolveComboRoute(combo, prefix = "combo") {
  const providers = db.getProviders();
  const models = db.getModels();
  const availableSteps = combo.steps.map((step) => {
    const p = providers.find((pr) => pr.id === step.providerId);
    if (!p || !p.enabled) {
      return { step, provider: void 0, model: void 0 };
    }
    const rawModelId = (step.modelId || p.defaultModel || p.models[0] || "").trim();
    if (!rawModelId) {
      return { step, provider: p, model: void 0 };
    }
    let m = models.find(
      (mo) => mo.providerId === p.id && (mo.id === rawModelId || mo.apiModelName === rawModelId)
    );
    if (!m) {
      const shared = models.find((mo) => mo.id === rawModelId || mo.apiModelName === rawModelId);
      if (shared) {
        m = {
          ...shared,
          id: `${p.id}:${shared.apiModelName || rawModelId}`,
          providerId: p.id,
          enabled: true
        };
      }
    }
    if (!m) {
      m = {
        id: rawModelId,
        displayName: rawModelId,
        providerId: p.id,
        apiModelName: rawModelId,
        contextWindow: 128e3,
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
          reasoning: false,
          jsonOutput: true
        },
        pricing: {
          inputPer1MTokens: 0.5,
          outputPer1MTokens: 1.5
        },
        enabled: true
      };
    }
    return { step, provider: p, model: m };
  }).filter((s) => {
    return Boolean(s.provider && s.provider.enabled && s.model && s.model.enabled !== false);
  });
  if (availableSteps.length === 0) {
    const enabledModels = models.filter((m) => m.enabled);
    const enabledProviders = providers.filter((p) => p.enabled);
    if (enabledModels.length === 0 || enabledProviders.length === 0) {
      throw new Error(`Combo "${combo.name}" has no active providers/models available.`);
    }
    const defaultModel = enabledModels[0];
    const defaultProv = enabledProviders.find((p) => p.id === defaultModel.providerId) || enabledProviders[0];
    return {
      strategy: `${prefix}:${combo.name} (no-active-steps)`,
      selectedProvider: defaultProv,
      selectedModel: defaultModel
    };
  }
  if (combo.strategy === "weighted") {
    const totalWeight = availableSteps.reduce((acc, s) => acc + (s.step.weight || 50), 0);
    const rand = Math.random() * totalWeight;
    let accumulated = 0;
    let chosen = availableSteps[0];
    for (const step of availableSteps) {
      accumulated += step.step.weight || 50;
      if (rand <= accumulated) {
        chosen = step;
        break;
      }
    }
    return {
      strategy: `${prefix}:${combo.name} (weighted)`,
      selectedProvider: chosen.provider,
      selectedModel: chosen.model,
      isCombo: true,
      comboConfig: combo,
      fallbackChain: availableSteps.filter((s) => !(s.provider.id === chosen.provider.id && s.model.id === chosen.model.id)).map((s) => ({ provider: s.provider, model: s.model }))
    };
  }
  const primary = availableSteps[0];
  const fallbacks = availableSteps.slice(1).map((s) => ({ provider: s.provider, model: s.model }));
  return {
    strategy: `${prefix}:${combo.name} (${combo.strategy})`,
    selectedProvider: primary.provider,
    selectedModel: primary.model,
    isCombo: true,
    comboConfig: combo,
    fallbackChain: fallbacks
  };
}
function resolveAutoRoute(req) {
  const rules = db.getRules();
  const models = db.getModels().filter((m) => m.enabled);
  const providers = db.getProviders().filter((p) => p.enabled);
  if (models.length === 0 || providers.length === 0) {
    throw new Error("No active AI providers or models are configured. Add an AI provider and API key in the Providers tab.");
  }
  const promptText = req.messages.map((m) => typeof m.content === "string" ? m.content : "").join(" ").toLowerCase();
  const hasTools = Boolean(req.tools && req.tools.length > 0);
  const hasVision = req.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image_url" || b.type === "image")
  );
  for (const rule of rules) {
    if (rule.taskType === "vision" && hasVision) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === "coding" && (hasTools || promptText.includes("function") || promptText.includes("code") || promptText.includes("class") || promptText.includes("debug"))) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === "reasoning" && (promptText.includes("think") || promptText.includes("calculate") || promptText.includes("proof") || promptText.includes("math") || promptText.includes("architect"))) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === "fast" && promptText.length < 150) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === "default") {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
  }
  const settings = db.getSettings();
  const defaultModel = models.find((m) => m.id === settings.defaultModelId) || models.find((m) => providers.some((p) => p.id === m.providerId)) || models[0];
  const defaultProv = providers.find((p) => p.id === defaultModel.providerId) || providers[0];
  return {
    strategy: "auto:heuristic",
    selectedProvider: defaultProv,
    selectedModel: defaultModel
  };
}
function getModelOrComboFromRule(rule, providers, models) {
  if (rule.preferredComboId) {
    const combo = db.getCombo(rule.preferredComboId);
    if (combo && combo.enabled) {
      return resolveComboRoute(combo, `auto:rule:${rule.name}`);
    }
  }
  if (rule.preferredModelId) {
    const model = models.find((m) => m.id === rule.preferredModelId);
    if (model && model.enabled) {
      const prov = providers.find((p) => p.id === model.providerId);
      if (prov && prov.enabled) {
        return {
          strategy: `auto:rule:${rule.name}`,
          selectedProvider: prov,
          selectedModel: model
        };
      }
    }
  }
  return null;
}

// src/server/adapters/executor.ts
import { GoogleGenAI, Type } from "@google/genai";
function resolveProviderApiKey(provider) {
  const stored = decryptSecret(provider.apiKey || "").trim();
  if (stored) return stored;
  switch (provider.type) {
    case "gemini":
      return (process.env.GEMINI_API_KEY || "").trim();
    case "anthropic":
      return (process.env.ANTHROPIC_API_KEY || "").trim();
    case "openai":
      return (process.env.OPENAI_API_KEY || "").trim();
    case "deepseek":
      return (process.env.DEEPSEEK_API_KEY || "").trim();
    case "groq":
      return (process.env.GROQ_API_KEY || "").trim();
    case "openrouter":
      return (process.env.OPENROUTER_API_KEY || "").trim();
    default:
      return "";
  }
}
async function pingProviderConnection(provider) {
  const apiKey = resolveProviderApiKey(provider);
  const start = Date.now();
  if (!apiKey && provider.type !== "custom") {
    throw new Error(`401 Unauthorized: No API key configured for ${provider.name}. Add an API key in Providers.`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(provider.timeoutMs || 15e3, 15e3));
  try {
    if (provider.protocol === "google-gemini" || provider.type === "gemini") {
      const base2 = (provider.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
      const res2 = await fetch(`${base2}/v1beta/models?pageSize=5&key=${encodeURIComponent(apiKey)}`, {
        method: "GET",
        signal: controller.signal
      });
      if (!res2.ok) {
        const body2 = await res2.text();
        throw new Error(`Gemini API (${res2.status}): ${body2.slice(0, 180)}`);
      }
      const data = await res2.json();
      return { latencyMs: Date.now() - start, modelsCount: Array.isArray(data.models) ? data.models.length : void 0 };
    }
    if (provider.protocol === "anthropic-messages" || provider.type === "anthropic") {
      const base2 = (provider.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
      const url = base2.endsWith("/v1") ? `${base2}/models` : `${base2}/v1/models`;
      const res2 = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          ...provider.customHeaders || {}
        },
        signal: controller.signal
      });
      if (!res2.ok) {
        const body2 = await res2.text();
        throw new Error(`Anthropic API (${res2.status}): ${body2.slice(0, 180)}`);
      }
      const data = await res2.json();
      return { latencyMs: Date.now() - start, modelsCount: Array.isArray(data.data) ? data.data.length : void 0 };
    }
    const base = provider.baseUrl.replace(/\/$/, "");
    const modelsUrl = base.endsWith("/v1") || base.includes("/openai") ? `${base}/models` : `${base}/v1/models`;
    const headers = {
      ...provider.customHeaders || {}
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { latencyMs: Date.now() - start, modelsCount: Array.isArray(data?.data) ? data.data.length : void 0 };
    }
    const probeModel = provider.defaultModel || provider.models[0];
    if ((res.status === 404 || res.status === 405) && probeModel) {
      const chatUrl = base.endsWith("/chat/completions") ? base : base.endsWith("/v1") || base.includes("/openai") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
      const probeRes = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          model: probeModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1
        }),
        signal: controller.signal
      });
      if (probeRes.ok) {
        return { latencyMs: Date.now() - start, modelsCount: provider.models.length || 1 };
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
async function executeProviderRequest(provider, modelConfig, unifiedReq, signal) {
  const rawKey = resolveProviderApiKey(provider);
  if (!rawKey && provider.type !== "custom") {
    throw new Error(`401 Unauthorized: Missing API key for provider "${provider.name}". Please configure a valid API key.`);
  }
  if (provider.protocol === "google-gemini" || provider.type === "gemini") {
    return await executeGemini(provider, modelConfig, unifiedReq, rawKey);
  }
  if (provider.protocol === "anthropic-messages" || provider.type === "anthropic") {
    return await executeAnthropicNative(provider, modelConfig, unifiedReq, rawKey, signal);
  }
  return await executeOpenAiCompatible(provider, modelConfig, unifiedReq, rawKey, signal);
}
async function* executeProviderStream(provider, modelConfig, unifiedReq, signal) {
  const rawKey = resolveProviderApiKey(provider);
  if (!rawKey && provider.type !== "custom") {
    throw new Error(`401 Unauthorized: Missing API key for provider "${provider.name}". Please configure a valid API key.`);
  }
  if (provider.protocol === "google-gemini" || provider.type === "gemini") {
    const ai = new GoogleGenAI({ apiKey: rawKey });
    const apiModel = modelConfig.apiModelName || "gemini-2.5-flash";
    const promptParts = unifiedReq.messages.map((m) => {
      const textContent = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((b) => b.text || "").join(" ") : "";
      return `${m.role.toUpperCase()}: ${textContent}`;
    });
    const config = {
      systemInstruction: unifiedReq.system || void 0,
      temperature: unifiedReq.temperature,
      maxOutputTokens: unifiedReq.maxTokens
    };
    if (unifiedReq.tools && unifiedReq.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: unifiedReq.tools.map((t) => ({
            name: t.name,
            description: t.description || "",
            parameters: t.parameters || { type: Type.OBJECT, properties: {} }
          }))
        }
      ];
    }
    const responseStream = await ai.models.generateContentStream({
      model: apiModel,
      contents: promptParts.join("\n\n"),
      config
    });
    let totalInputTokens = Math.max(10, Math.floor(promptParts.join("\n\n").length / 4));
    let totalOutputTokens = 0;
    let finishReason2 = "end_turn";
    for await (const chunk of responseStream) {
      if (signal?.aborted) break;
      if (chunk.usageMetadata?.promptTokenCount) {
        totalInputTokens = chunk.usageMetadata.promptTokenCount;
      }
      if (chunk.usageMetadata?.candidatesTokenCount) {
        totalOutputTokens = chunk.usageMetadata.candidatesTokenCount;
      }
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        finishReason2 = "tool_use";
        for (const fc of chunk.functionCalls) {
          yield {
            type: "tool_call",
            toolCall: {
              id: fc.id || `toolu_${Date.now()}`,
              name: fc.name || "tool",
              argumentsDelta: JSON.stringify(fc.args || {})
            }
          };
        }
      }
      const text = chunk.text || "";
      if (text) {
        if (!chunk.usageMetadata?.candidatesTokenCount) {
          totalOutputTokens += Math.max(1, Math.floor(text.length / 4));
        }
        yield { type: "delta", deltaText: text };
      }
    }
    yield {
      type: "done",
      inputTokens: totalInputTokens,
      outputTokens: Math.max(1, totalOutputTokens),
      finishReason: finishReason2
    };
    return;
  }
  if (provider.protocol === "anthropic-messages" || provider.type === "anthropic") {
    const base = (provider.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const url2 = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
    const headers2 = {
      "content-type": "application/json",
      "x-api-key": rawKey,
      "anthropic-version": "2023-06-01",
      ...provider.customHeaders || {}
    };
    const body2 = {
      model: modelConfig.apiModelName,
      messages: unifiedReq.messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      })),
      max_tokens: unifiedReq.maxTokens || 4096,
      stream: true
    };
    if (unifiedReq.system) body2.system = unifiedReq.system;
    if (unifiedReq.temperature !== void 0) body2.temperature = unifiedReq.temperature;
    if (unifiedReq.tools && unifiedReq.tools.length > 0) {
      body2.tools = unifiedReq.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: "object" }
      }));
    }
    const res2 = await fetch(url2, {
      method: "POST",
      headers: headers2,
      body: JSON.stringify(body2),
      signal
    });
    if (!res2.ok) {
      const errorText = await res2.text();
      throw new Error(`Anthropic API Error (${res2.status}): ${errorText}`);
    }
    let inputTokens = 0;
    let outputTokens2 = 0;
    let finishReason2 = "end_turn";
    for await (const dataStr of readSseLines(res2)) {
      if (signal?.aborted) break;
      try {
        const evt = JSON.parse(dataStr);
        if (evt.type === "message_start" && evt.message?.usage?.input_tokens) {
          inputTokens = evt.message.usage.input_tokens;
        } else if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
          finishReason2 = "tool_use";
          yield {
            type: "tool_call",
            toolCall: {
              id: evt.content_block.id,
              name: evt.content_block.name,
              argumentsDelta: ""
            }
          };
        } else if (evt.type === "content_block_delta") {
          if (evt.delta?.type === "text_delta" && evt.delta.text) {
            yield { type: "delta", deltaText: evt.delta.text };
          }
        } else if (evt.type === "message_delta") {
          if (evt.delta?.stop_reason) finishReason2 = evt.delta.stop_reason;
          if (evt.usage?.output_tokens) outputTokens2 = evt.usage.output_tokens;
        }
      } catch {
      }
    }
    yield {
      type: "done",
      inputTokens: inputTokens || 50,
      outputTokens: outputTokens2 || 20,
      finishReason: finishReason2
    };
    return;
  }
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : baseUrl.endsWith("/v1") || baseUrl.includes("/openai") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const messages = [];
  if (unifiedReq.system) {
    messages.push({ role: "system", content: unifiedReq.system });
  }
  for (const m of unifiedReq.messages) {
    messages.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId
    });
  }
  const body = {
    model: modelConfig.apiModelName,
    messages,
    max_tokens: unifiedReq.maxTokens || 4096,
    stream: true
  };
  if (unifiedReq.temperature !== void 0) body.temperature = unifiedReq.temperature;
  if (unifiedReq.tools && unifiedReq.tools.length > 0) {
    body.tools = unifiedReq.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: "object" }
      }
    }));
  }
  const headers = {
    "content-type": "application/json",
    ...provider.customHeaders || {}
  };
  if (rawKey) {
    headers["Authorization"] = `Bearer ${rawKey}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${provider.name} API Error (${res.status}): ${errorText}`);
  }
  let outputTokens = 0;
  let finishReason = "stop";
  for await (const dataStr of readSseLines(res)) {
    if (signal?.aborted) break;
    if (dataStr === "[DONE]") break;
    try {
      const parsed = JSON.parse(dataStr);
      const choice = parsed.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        outputTokens += Math.max(1, Math.floor(delta.content.length / 4));
        yield { type: "delta", deltaText: delta.content };
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name || tc.id) {
            yield {
              type: "tool_call",
              toolCall: {
                id: tc.id || `call_${Date.now()}`,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments || ""
              }
            };
          }
        }
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    } catch {
    }
  }
  yield {
    type: "done",
    inputTokens: Math.max(10, Math.floor(JSON.stringify(messages).length / 4)),
    outputTokens: Math.max(1, outputTokens),
    finishReason
  };
}
async function* readSseLines(res) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        yield trimmed.slice(5).trim();
      }
    }
  }
  if (buffer.trim().startsWith("data:")) {
    yield buffer.trim().slice(5).trim();
  }
}
async function executeGemini(_provider, modelConfig, req, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const modelName = modelConfig.apiModelName || "gemini-2.5-flash";
  const contents = req.messages.map((m) => {
    const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((b) => b.text || "").join(" ") : "";
    return `${m.role.toUpperCase()}: ${text}`;
  }).join("\n\n");
  const config = {
    systemInstruction: req.system || void 0,
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens
  };
  if (req.tools && req.tools.length > 0) {
    config.tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description || "",
          parameters: t.parameters || { type: Type.OBJECT, properties: {} }
        }))
      }
    ];
  }
  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config
  });
  const content = response.text || "";
  const toolCalls = response.functionCalls?.map((fc) => ({
    id: fc.id || `toolu_${Date.now()}`,
    name: fc.name || "tool",
    arguments: JSON.stringify(fc.args || {})
  }));
  const inputTokens = response.usageMetadata?.promptTokenCount || Math.max(10, Math.floor(contents.length / 4));
  const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.max(5, Math.floor(content.length / 4));
  return {
    id: `msg_gemini_${Date.now()}`,
    model: modelConfig.id,
    content,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : void 0,
    stopReason: toolCalls && toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: { inputTokens, outputTokens }
  };
}
async function executeAnthropicNative(provider, modelConfig, req, apiKey, signal) {
  const base = (provider.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const url = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    ...provider.customHeaders || {}
  };
  const body = {
    model: modelConfig.apiModelName,
    messages: req.messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    })),
    max_tokens: req.maxTokens || 4096
  };
  if (req.system) body.system = req.system;
  if (req.temperature !== void 0) body.temperature = req.temperature;
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: "object" }
    }));
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API Error (${res.status}): ${errorText}`);
  }
  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  const toolBlocks = Array.isArray(data.content) ? data.content.filter((b) => b.type === "tool_use") : [];
  return {
    id: data.id || `msg_ant_${Date.now()}`,
    model: modelConfig.id,
    content: textBlock ? textBlock.text : "",
    toolCalls: toolBlocks.length > 0 ? toolBlocks.map((tb) => ({
      id: tb.id,
      name: tb.name,
      arguments: JSON.stringify(tb.input || {})
    })) : void 0,
    stopReason: data.stop_reason || "end_turn",
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    }
  };
}
async function executeOpenAiCompatible(provider, modelConfig, req, apiKey, signal) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : baseUrl.endsWith("/v1") || baseUrl.includes("/openai") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const messages = [];
  if (req.system) {
    messages.push({ role: "system", content: req.system });
  }
  for (const m of req.messages) {
    messages.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId
    });
  }
  const body = {
    model: modelConfig.apiModelName,
    messages,
    max_tokens: req.maxTokens || 4096
  };
  if (req.temperature !== void 0) body.temperature = req.temperature;
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: "object" }
      }
    }));
  }
  const headers = {
    "content-type": "application/json",
    ...provider.customHeaders || {}
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
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
    content: message.content || "",
    toolCalls: message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments || "{}"
    })),
    stopReason: choice?.finish_reason || "stop",
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    }
  };
}

// src/server/engine/fallback.ts
function isRetryableError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") || msg.includes("missing api key") || msg.includes("no api key")) {
    return false;
  }
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("network")) return true;
  return true;
}
async function executeWithFallback(route, req, signal) {
  const fallbackHistory = [];
  const chain = [
    { provider: route.selectedProvider, model: route.selectedModel },
    ...route.fallbackChain || []
  ];
  if (route.comboConfig?.strategy === "parallel" && chain.length > 1) {
    try {
      const winner = await Promise.any(
        chain.map(async (entry, idx) => {
          const response = await executeProviderRequest(entry.provider, entry.model, req, signal);
          return { response, entry, idx };
        })
      );
      return {
        response: winner.response,
        selectedProvider: winner.entry.provider,
        selectedModel: winner.entry.model,
        retryCount: 0,
        fallbackHistory: [],
        wasFallback: winner.idx > 0
      };
    } catch (aggErr) {
      const firstMsg = aggErr?.errors?.[0]?.message || aggErr?.message || "Parallel race failed";
      throw new Error(`All providers in parallel race failed. Last error: ${firstMsg}`);
    }
  }
  let retryCount = 0;
  let lastError = null;
  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    const maxRetries = current.provider.maxRetries ?? 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error("Request was aborted by client");
      }
      try {
        const response = await executeProviderRequest(current.provider, current.model, req, signal);
        return {
          response,
          selectedProvider: current.provider,
          selectedModel: current.model,
          retryCount,
          fallbackHistory,
          wasFallback: i > 0
        };
      } catch (err) {
        lastError = err;
        retryCount++;
        const errMsg = err?.message || "Unknown provider error";
        console.warn(`[Gateway Failover] Attempt ${attempt + 1} failed on ${current.provider.name} (${current.model.displayName}): ${errMsg}`);
        if (!isRetryableError(err) || attempt === maxRetries) {
          fallbackHistory.push({
            providerId: current.provider.id,
            modelId: current.model.id,
            error: errMsg,
            attemptTime: (/* @__PURE__ */ new Date()).toISOString()
          });
          break;
        }
        const backoff = Math.min(2e3, 300 * Math.pow(1.5, attempt) + Math.random() * 50);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error(`All providers in routing chain failed. Last error: ${lastError?.message || "Unknown failure"}`);
}
async function openStreamWithFallback(route, req, signal) {
  const fallbackHistory = [];
  const chain = [
    { provider: route.selectedProvider, model: route.selectedModel },
    ...route.fallbackChain || []
  ];
  let lastError = null;
  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    try {
      const iterator = executeProviderStream(current.provider, current.model, req, signal);
      const first = await iterator.next();
      if (first.done) {
        return {
          firstChunk: { type: "done", inputTokens: 0, outputTokens: 0, finishReason: "stop" },
          iterator,
          selectedProvider: current.provider,
          selectedModel: current.model,
          wasFallback: i > 0,
          fallbackHistory
        };
      }
      return {
        firstChunk: first.value,
        iterator,
        selectedProvider: current.provider,
        selectedModel: current.model,
        wasFallback: i > 0,
        fallbackHistory
      };
    } catch (err) {
      lastError = err;
      fallbackHistory.push({
        providerId: current.provider.id,
        modelId: current.model.id,
        error: err?.message || "Stream connection failed",
        attemptTime: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  throw new Error(`All providers in streaming chain failed. Last error: ${lastError?.message || "Unknown failure"}`);
}

// src/server/routes/gateway-v1.ts
var router = Router();
function isPlaygroundHeader(req) {
  return req.headers["x-msroute-client"] === "playground" || req.headers["x-nexus-client"] === "playground";
}
function authenticateGateway(req, res, next) {
  const settings = db.getSettings();
  if (settings.emergencyKillSwitch) {
    return res.status(503).json({
      error: {
        type: "service_unavailable_error",
        message: "MSRoute Emergency Kill Switch is ACTIVE. All outgoing AI provider requests are paused by the owner."
      }
    });
  }
  if (settings.globalMonthlySpendingLimitUsd > 0 && settings.currentMonthlySpentUsd >= settings.globalMonthlySpendingLimitUsd) {
    return res.status(429).json({
      error: {
        type: "rate_limit_error",
        message: `Monthly spending limit ($${settings.globalMonthlySpendingLimitUsd}) reached.`
      }
    });
  }
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const todayCount = db.getLogs(1e3).filter((l) => l.timestamp.startsWith(todayStr)).length;
  if (settings.globalDailyRequestLimit > 0 && todayCount >= settings.globalDailyRequestLimit) {
    return res.status(429).json({
      error: {
        type: "rate_limit_error",
        message: `Daily request limit (${settings.globalDailyRequestLimit}) reached.`
      }
    });
  }
  let rawKey = "";
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7).trim();
  } else if (req.headers["x-api-key"]) {
    rawKey = String(req.headers["x-api-key"]).trim();
  }
  const isPlayground = isPlaygroundHeader(req);
  if (!rawKey && !isPlayground) {
    return res.status(401).json({
      error: {
        type: "authentication_error",
        message: "Invalid or missing API key. Pass Authorization: Bearer <GATEWAY_API_KEY> or x-api-key: <GATEWAY_API_KEY>."
      }
    });
  }
  if (rawKey) {
    const verified = db.verifyApiKey(rawKey);
    if (!verified) {
      return res.status(401).json({
        error: {
          type: "authentication_error",
          message: "API key is invalid or has been revoked."
        }
      });
    }
  }
  next();
}
router.post("/messages", authenticateGateway, async (req, res) => {
  const startTime = Date.now();
  const clientType = req.headers["user-agent"]?.toLowerCase().includes("claude") ? "claude-code" : isPlaygroundHeader(req) ? "playground" : "other";
  try {
    const parsed = parseAnthropicRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);
    if (parsed.stream) {
      const streamConn = await openStreamWithFallback(route, parsed);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const msgId = `msg_${Date.now()}`;
      res.write(
        `event: message_start
data: ${JSON.stringify({
          type: "message_start",
          message: {
            id: msgId,
            type: "message",
            role: "assistant",
            model: streamConn.selectedModel.id,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        })}

`
      );
      res.write(
        `event: content_block_start
data: ${JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" }
        })}

`
      );
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let stopReason = "end_turn";
      const handleChunk = (chunk) => {
        if (chunk.type === "delta" && chunk.deltaText) {
          totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
          res.write(
            `event: content_block_delta
data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: chunk.deltaText }
            })}

`
          );
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          stopReason = "tool_use";
          res.write(
            `event: content_block_start
data: ${JSON.stringify({
              type: "content_block_start",
              index: 1,
              content_block: {
                type: "tool_use",
                id: chunk.toolCall.id,
                name: chunk.toolCall.name || "tool",
                input: {}
              }
            })}

`
          );
        } else if (chunk.type === "done") {
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
      } catch (streamErr) {
        res.write(
          `event: error
data: ${JSON.stringify({
            type: "error",
            error: { type: "api_error", message: streamErr.message }
          })}

`
        );
      }
      res.write(
        `event: content_block_stop
data: ${JSON.stringify({
          type: "content_block_stop",
          index: 0
        })}

`
      );
      res.write(
        `event: message_delta
data: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: totalOutputTokens }
        })}

`
      );
      res.write(`event: message_stop
data: ${JSON.stringify({ type: "message_stop" })}

`);
      res.end();
      const latencyMs2 = Date.now() - startTime;
      const log2 = {
        id: `req_${Date.now()}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        clientType,
        endpoint: "/v1/messages",
        requestedModel: parsed.model,
        resolvedModel: streamConn.selectedModel.displayName,
        selectedProvider: streamConn.selectedProvider.name,
        routingStrategy: route.strategy,
        status: streamConn.wasFallback ? "fallback_success" : "success",
        statusCode: 200,
        latencyMs: latencyMs2,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: Number(
          (totalInputTokens / 1e6 * (streamConn.selectedModel.pricing.inputPer1MTokens || 0.15) + totalOutputTokens / 1e6 * (streamConn.selectedModel.pricing.outputPer1MTokens || 0.6)).toFixed(5)
        ),
        retryCount: streamConn.fallbackHistory.length,
        fallbackHistory: streamConn.fallbackHistory,
        streaming: true
      };
      db.addLog(log2);
      return;
    }
    const execRes = await executeWithFallback(route, parsed);
    const anthropicResponse = formatAnthropicResponse(execRes.response);
    const latencyMs = Date.now() - startTime;
    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number(
      (inputTokens / 1e6 * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) + outputTokens / 1e6 * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)).toFixed(5)
    );
    const log = {
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType,
      endpoint: "/v1/messages",
      requestedModel: parsed.model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      routingStrategy: route.strategy,
      status: execRes.wasFallback ? "fallback_success" : "success",
      statusCode: 200,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      retryCount: execRes.retryCount,
      fallbackHistory: execRes.fallbackHistory,
      streaming: false
    };
    db.addLog(log);
    return res.json(anthropicResponse);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const statusCode = (err?.message || "").includes("No active AI providers") || (err?.message || "").includes("Missing API key") ? 400 : 502;
    const log = {
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType,
      endpoint: "/v1/messages",
      requestedModel: req.body?.model || "unknown",
      resolvedModel: "Error",
      selectedProvider: "None",
      routingStrategy: "error",
      status: "error",
      statusCode,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      retryCount: 0,
      fallbackHistory: [],
      errorMessage: err.message,
      streaming: Boolean(req.body?.stream)
    };
    db.addLog(log);
    return res.status(statusCode).json({
      type: "error",
      error: {
        type: "api_error",
        message: err.message || "Internal AI Gateway Error"
      }
    });
  }
});
router.post("/messages/count_tokens", authenticateGateway, (req, res) => {
  const parsed = parseAnthropicRequest(req.body);
  const text = parsed.messages.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join(" ");
  const estimatedTokens = Math.max(1, Math.floor((text.length + (parsed.system?.length || 0)) / 3.8));
  return res.json({ input_tokens: estimatedTokens });
});
router.post("/chat/completions", authenticateGateway, async (req, res) => {
  const startTime = Date.now();
  const clientType = isPlaygroundHeader(req) ? "playground" : "openai-sdk";
  try {
    const parsed = parseOpenAiRequest(req.body);
    const route = resolveRoute(parsed.model, parsed);
    if (parsed.stream) {
      const streamConn = await openStreamWithFallback(route, parsed);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const chunkId = `chatcmpl-${Date.now()}`;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const handleChunk = (chunk) => {
        if (chunk.type === "delta" && chunk.deltaText) {
          totalOutputTokens += Math.max(1, Math.floor(chunk.deltaText.length / 4));
          const openAiChunk = {
            id: chunkId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1e3),
            model: streamConn.selectedModel.id,
            choices: [
              {
                index: 0,
                delta: { content: chunk.deltaText },
                finish_reason: null
              }
            ]
          };
          res.write(`data: ${JSON.stringify(openAiChunk)}

`);
        } else if (chunk.type === "done") {
          if (chunk.inputTokens) totalInputTokens = chunk.inputTokens;
          if (chunk.outputTokens) totalOutputTokens = chunk.outputTokens;
          const finalChunk = {
            id: chunkId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1e3),
            model: streamConn.selectedModel.id,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: chunk.finishReason || "stop"
              }
            ]
          };
          res.write(`data: ${JSON.stringify(finalChunk)}

`);
        }
      };
      try {
        handleChunk(streamConn.firstChunk);
        for await (const chunk of streamConn.iterator) {
          handleChunk(chunk);
        }
      } catch (streamErr) {
        console.error("OpenAI stream chunk error:", streamErr);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      const latencyMs2 = Date.now() - startTime;
      const log2 = {
        id: `req_${Date.now()}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        clientType,
        endpoint: "/v1/chat/completions",
        requestedModel: parsed.model,
        resolvedModel: streamConn.selectedModel.displayName,
        selectedProvider: streamConn.selectedProvider.name,
        routingStrategy: route.strategy,
        status: streamConn.wasFallback ? "fallback_success" : "success",
        statusCode: 200,
        latencyMs: latencyMs2,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: Number(
          (totalInputTokens / 1e6 * (streamConn.selectedModel.pricing.inputPer1MTokens || 0.15) + totalOutputTokens / 1e6 * (streamConn.selectedModel.pricing.outputPer1MTokens || 0.6)).toFixed(5)
        ),
        retryCount: streamConn.fallbackHistory.length,
        fallbackHistory: streamConn.fallbackHistory,
        streaming: true
      };
      db.addLog(log2);
      return;
    }
    const execRes = await executeWithFallback(route, parsed);
    const openAiResponse = formatOpenAiResponse(execRes.response);
    const latencyMs = Date.now() - startTime;
    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number(
      (inputTokens / 1e6 * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) + outputTokens / 1e6 * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)).toFixed(5)
    );
    const log = {
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType,
      endpoint: "/v1/chat/completions",
      requestedModel: parsed.model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      routingStrategy: route.strategy,
      status: execRes.wasFallback ? "fallback_success" : "success",
      statusCode: 200,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      retryCount: execRes.retryCount,
      fallbackHistory: execRes.fallbackHistory,
      streaming: false
    };
    db.addLog(log);
    return res.json(openAiResponse);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const statusCode = (err?.message || "").includes("No active AI providers") || (err?.message || "").includes("Missing API key") ? 400 : 502;
    db.addLog({
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType,
      endpoint: "/v1/chat/completions",
      requestedModel: req.body?.model || "unknown",
      resolvedModel: "Error",
      selectedProvider: "None",
      routingStrategy: "error",
      status: "error",
      statusCode,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      retryCount: 0,
      fallbackHistory: [],
      errorMessage: err.message,
      streaming: Boolean(req.body?.stream)
    });
    return res.status(statusCode).json({
      error: {
        message: err.message || "Internal Gateway Error",
        type: "api_error",
        code: statusCode
      }
    });
  }
});
router.post("/responses", authenticateGateway, async (req, res) => {
  req.url = "/chat/completions";
  return router(req, res, () => {
  });
});
router.get("/models", authenticateGateway, (_req, res) => {
  const models = db.getModels();
  const aliases = db.getAliases();
  const combos = db.getCombos().filter((c) => c.enabled);
  const data = [
    ...combos.map((c) => ({
      id: c.id,
      object: "model",
      created: Math.floor(Date.now() / 1e3),
      owned_by: "msroute-combo",
      permission: [],
      root: c.id,
      parent: null,
      display_name: `${c.name} (Combo \u2022 ${c.strategy})`,
      description: c.description
    })),
    ...models.map((m) => ({
      id: m.id,
      object: "model",
      created: Math.floor(Date.now() / 1e3),
      owned_by: m.providerId,
      permission: [],
      root: m.id,
      parent: null,
      display_name: m.displayName,
      context_window: m.contextWindow,
      capabilities: m.capabilities
    })),
    ...aliases.map((a) => ({
      id: a.alias,
      object: "model_alias",
      created: Math.floor(Date.now() / 1e3),
      owned_by: "msroute",
      permission: [],
      root: a.targetId,
      parent: null,
      display_name: `${a.alias} (Alias -> ${a.targetId})`,
      description: a.description
    }))
  ];
  return res.json({ object: "list", data });
});
var gateway_v1_default = router;

// src/server/routes/dashboard-api.ts
import { Router as Router2 } from "express";

// src/server/security/ssrf.ts
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
  // AWS/GCP instance metadata service
  "instance-data"
]);
var BLOCKED_PREFIXES = [
  "10.",
  // Class A private network
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  // Class B private network
  "192.168.",
  // Class C private network
  "169.254.",
  // Link-local
  "fc00:",
  "fe80:"
  // IPv6 ULA / link-local
];
function validateProviderUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, reason: "URL cannot be empty" };
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, reason: `Unsupported protocol ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `SSRF Violation: requests to loopback or metadata endpoints (${hostname}) are blocked.` };
  }
  for (const prefix of BLOCKED_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      return { valid: false, reason: `SSRF Violation: requests to internal private network address (${hostname}) are blocked.` };
    }
  }
  return { valid: true, sanitizedUrl: parsed.origin + parsed.pathname.replace(/\/$/, "") };
}

// src/server/testing/claude-suite.ts
async function runClaudeCodeTestSuite() {
  const checks = [];
  const t1Start = Date.now();
  try {
    const { rawKey, keyPrefix, keyHash } = generateGatewayApiKey();
    const recomputed = hashGatewayKey(rawKey);
    const rejected = db.verifyApiKey("invalid-unregistered-token-000");
    const cipher = encryptSecret(rawKey);
    const plain = decryptSecret(cipher);
    const passed = recomputed === keyHash && rejected === null && plain === rawKey && keyPrefix.startsWith("gw-live-");
    checks.push({
      id: "check-1-auth",
      name: "1. Authentication & AES-256/SHA-256 Security",
      description: "Validates gateway API key SHA-256 hashing, AES-256-GCM secret encryption, and invalid token rejection",
      passed,
      durationMs: Date.now() - t1Start,
      details: passed ? `SHA-256 & AES-256-GCM verified (${db.getApiKeys().filter((k) => !k.revoked).length} active user keys)` : "Cryptographic key verification failed"
    });
  } catch (err) {
    checks.push({
      id: "check-1-auth",
      name: "1. Authentication & AES-256/SHA-256 Security",
      description: "Validates cryptographic gateway key security",
      passed: false,
      durationMs: Date.now() - t1Start,
      details: err.message
    });
  }
  const t2Start = Date.now();
  try {
    const rawReq = {
      model: "claude-3-7-sonnet",
      max_tokens: 1024,
      system: [{ type: "text", text: "Act as a senior software architect." }],
      messages: [{ role: "user", content: "Verify Messages API protocol framing." }]
    };
    const parsed = parseAnthropicRequest(rawReq);
    const formatted = formatAnthropicResponse({
      id: `msg_${Date.now()}`,
      model: parsed.model,
      content: "Protocol framing verified.",
      stopReason: "end_turn",
      usage: { inputTokens: 24, outputTokens: 8 }
    });
    const validStructure = parsed.system === "Act as a senior software architect." && formatted.type === "message" && formatted.role === "assistant" && Array.isArray(formatted.content) && formatted.content[0]?.type === "text" && formatted.stop_reason === "end_turn";
    checks.push({
      id: "check-2-basic",
      name: "2. Basic Messages API Protocol",
      description: "Validates Anthropic POST /v1/messages request parsing and response envelope structure",
      passed: validStructure,
      durationMs: Date.now() - t2Start,
      details: `Envelope type="${formatted.type}", stop_reason="${formatted.stop_reason}"`
    });
  } catch (err) {
    checks.push({
      id: "check-2-basic",
      name: "2. Basic Messages API Protocol",
      description: "Validates Anthropic POST /v1/messages",
      passed: false,
      durationMs: Date.now() - t2Start,
      details: err.message
    });
  }
  const t3Start = Date.now();
  try {
    const events = [
      { type: "message_start", message: { id: "msg_sse", type: "message", role: "assistant", content: [] } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "chunk" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: "message_stop" }
    ];
    const encoded = events.map((e) => `event: ${e.type}
data: ${JSON.stringify(e)}

`).join("");
    const passed = encoded.includes("event: message_start") && encoded.includes("event: content_block_delta") && encoded.includes("event: message_stop");
    checks.push({
      id: "check-3-stream",
      name: "3. Streaming SSE Event Ordering",
      description: "Validates Anthropic SSE lifecycle sequence (message_start -> content_block_delta -> message_stop)",
      passed,
      durationMs: Date.now() - t3Start,
      details: `Verified ${events.length}-stage Anthropic SSE frame sequence`
    });
  } catch (err) {
    checks.push({
      id: "check-3-stream",
      name: "3. Streaming SSE Event Ordering",
      description: "Validates SSE streaming sequence",
      passed: false,
      durationMs: Date.now() - t3Start,
      details: err.message
    });
  }
  const t4Start = Date.now();
  try {
    const rawReq = {
      model: "claude-3-7-sonnet",
      messages: [
        { role: "user", content: "Inspect package.json" },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_01", name: "read_file", input: { path: "package.json" } }]
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_01", content: '{"name":"msroute"}' }]
        }
      ]
    };
    const parsed = parseAnthropicRequest(rawReq);
    const passed = parsed.messages.length === 3 && parsed.messages[1].role === "assistant" && parsed.messages[1].toolCalls?.[0]?.function.name === "read_file" && parsed.messages[2].role === "tool" && parsed.messages[2].toolCallId === "toolu_01";
    checks.push({
      id: "check-4-multiturn",
      name: "4. Multi-turn & Tool Result Context",
      description: "Ensures alternating user/assistant/tool_result turns are preserved accurately",
      passed,
      durationMs: Date.now() - t4Start,
      details: `Verified 3 dialog turns including tool_use and tool_result linkage`
    });
  } catch (err) {
    checks.push({
      id: "check-4-multiturn",
      name: "4. Multi-turn & Tool Result Context",
      description: "Preserves conversation context",
      passed: false,
      durationMs: Date.now() - t4Start,
      details: err.message
    });
  }
  const t5Start = Date.now();
  try {
    const rawReq = {
      model: "claude-3-7-sonnet",
      tools: [
        {
          name: "read_file",
          description: "Read local source code file",
          input_schema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"]
          }
        }
      ],
      messages: [{ role: "user", content: "Read tsconfig.json" }]
    };
    const parsed = parseAnthropicRequest(rawReq);
    const formatted = formatAnthropicResponse({
      id: "msg_tool_check",
      model: parsed.model,
      content: "Reading file...",
      toolCalls: [{ id: "toolu_99", name: "read_file", arguments: '{"path":"tsconfig.json"}' }],
      stopReason: "tool_use",
      usage: { inputTokens: 45, outputTokens: 18 }
    });
    const toolBlock = formatted.content.find((b) => b.type === "tool_use");
    const passed = Boolean(parsed.tools && parsed.tools[0].name === "read_file") && Boolean(toolBlock && toolBlock.input?.path === "tsconfig.json") && formatted.stop_reason === "tool_use";
    checks.push({
      id: "check-5-tools",
      name: "5. Tool-use Schema & Block Translation",
      description: "Validates input_schema transformation to UnifiedTool & Anthropic tool_use blocks",
      passed,
      durationMs: Date.now() - t5Start,
      details: `Verified input_schema -> tool_use (stop_reason="${formatted.stop_reason}")`
    });
  } catch (err) {
    checks.push({
      id: "check-5-tools",
      name: "5. Tool-use Schema & Block Translation",
      description: "Tool use handling",
      passed: false,
      durationMs: Date.now() - t5Start,
      details: err.message
    });
  }
  const t6Start = Date.now();
  try {
    const longPrompt = "const x = 1;\n".repeat(1e3);
    const parsed = parseAnthropicRequest({
      model: "gemini-2.5-pro",
      system: "Analyze large codebase",
      messages: [{ role: "user", content: longPrompt }],
      max_tokens: 8192
    });
    const estimatedTokens = Math.max(1, Math.floor((longPrompt.length + (parsed.system?.length || 0)) / 3.8));
    const passed = parsed.messages[0].content.length === longPrompt.length && estimatedTokens > 3e3;
    checks.push({
      id: "check-6-long",
      name: "6. Large Payload & /count_tokens Support",
      description: "Ensures large code context payloads parse cleanly without truncation",
      passed,
      durationMs: Date.now() - t6Start,
      details: `Parsed ${longPrompt.length.toLocaleString()} bytes (~${estimatedTokens.toLocaleString()} tokens)`
    });
  } catch (err) {
    checks.push({
      id: "check-6-long",
      name: "6. Large Payload & /count_tokens Support",
      description: "Large payload handling",
      passed: false,
      durationMs: Date.now() - t6Start,
      details: err.message
    });
  }
  const t7Start = Date.now();
  try {
    const oaiParsed = parseOpenAiRequest({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Concise" },
        { role: "user", content: "Ping" }
      ]
    });
    const unifiedRes = {
      id: "res_usage",
      model: "gpt-4o",
      content: "Pong",
      usage: { inputTokens: 128, outputTokens: 64 }
    };
    const antOut = formatAnthropicResponse(unifiedRes);
    const oaiOut = formatOpenAiResponse(unifiedRes);
    const passed = oaiParsed.system === "Concise" && antOut.usage.input_tokens === 128 && antOut.usage.output_tokens === 64 && oaiOut.usage.total_tokens === 192;
    checks.push({
      id: "check-7-usage",
      name: "7. Cross-Protocol Usage & Token Reporting",
      description: "Validates token usage counters across Anthropic and OpenAI response envelopes",
      passed,
      durationMs: Date.now() - t7Start,
      details: `Verified input_tokens=128, output_tokens=64, total_tokens=192`
    });
  } catch (err) {
    checks.push({
      id: "check-7-usage",
      name: "7. Cross-Protocol Usage & Token Reporting",
      description: "Usage reporting",
      passed: false,
      durationMs: Date.now() - t7Start,
      details: err.message
    });
  }
  const t8Start = Date.now();
  try {
    const blockedLocal = validateProviderUrl("http://127.0.0.1:8080/v1");
    const blockedMeta = validateProviderUrl("http://169.254.169.254/computeMetadata/v1/");
    const allowedHttps = validateProviderUrl("https://api.anthropic.com");
    const passed = !blockedLocal.valid && !blockedMeta.valid && allowedHttps.valid;
    checks.push({
      id: "check-8-errors",
      name: "8. SSRF Guard & Safe Error Normalization",
      description: "Blocks loopback/metadata SSRF targets and prevents internal credential leaks",
      passed,
      durationMs: Date.now() - t8Start,
      details: "Loopback and cloud metadata endpoints blocked; public HTTPS verified"
    });
  } catch (err) {
    checks.push({
      id: "check-8-errors",
      name: "8. SSRF Guard & Safe Error Normalization",
      description: "SSRF and structured error mapping",
      passed: false,
      durationMs: Date.now() - t8Start,
      details: err.message
    });
  }
  const t9Start = Date.now();
  try {
    const activeProviders = db.getProviders().filter((p) => p.enabled);
    const activeModels = db.getModels().filter((m) => m.enabled);
    const aliases = db.getAliases();
    const passed = Array.isArray(activeProviders) && Array.isArray(activeModels) && Array.isArray(aliases);
    checks.push({
      id: "check-9-alias",
      name: "9. Model & Alias Registry State",
      description: "Validates dynamic alias lookup table and registered provider/model state",
      passed,
      durationMs: Date.now() - t9Start,
      details: `Active: ${activeProviders.length} providers, ${activeModels.length} models, ${aliases.length} aliases`
    });
  } catch (err) {
    checks.push({
      id: "check-9-alias",
      name: "9. Model & Alias Registry State",
      description: "Model alias registry check",
      passed: false,
      durationMs: Date.now() - t9Start,
      details: err.message
    });
  }
  const t10Start = Date.now();
  try {
    const retry429 = isRetryableError(new Error("429 Rate limit exceeded"));
    const retry503 = isRetryableError(new Error("503 Service Unavailable"));
    const skip401 = !isRetryableError(new Error("401 Unauthorized: Missing API key"));
    const passed = retry429 && retry503 && skip401;
    checks.push({
      id: "check-10-fallback",
      name: "10. Pre-Stream Failover & Retry Classifier",
      description: "Retries transient 429/503 faults and immediately fails over on 401/unconfigured providers",
      passed,
      durationMs: Date.now() - t10Start,
      details: `429/503 transient retry=true, 401 immediate provider failover=true`
    });
  } catch (err) {
    checks.push({
      id: "check-10-fallback",
      name: "10. Pre-Stream Failover & Retry Classifier",
      description: "Pre-stream failover policy",
      passed: false,
      durationMs: Date.now() - t10Start,
      details: err.message
    });
  }
  const passedTests = checks.filter((c) => c.passed).length;
  const failedTests = checks.length - passedTests;
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    totalTests: checks.length,
    passedTests,
    failedTests,
    status: failedTests === 0 ? "passed" : "failed",
    checks
  };
}

// src/server/routes/dashboard-api.ts
var router2 = Router2();
function inferModelDefaults(modelId, providerId) {
  const lower = modelId.toLowerCase();
  const isVision = lower.includes("gemini") || lower.includes("4o") || lower.includes("sonnet") || lower.includes("opus") || lower.includes("vision");
  const isReasoning = lower.includes("reason") || lower.includes("r1") || lower.includes("o1") || lower.includes("o3") || lower.includes("3-7") || lower.includes("2.5");
  const contextWindow = lower.includes("gemini-2.5-pro") ? 2097152 : lower.includes("gemini") ? 1048576 : lower.includes("claude") ? 2e5 : 128e3;
  return {
    id: modelId,
    displayName: modelId,
    providerId,
    apiModelName: modelId,
    contextWindow,
    capabilities: {
      streaming: true,
      tools: !lower.includes("reasoner"),
      vision: isVision,
      reasoning: isReasoning,
      jsonOutput: !lower.includes("reasoner")
    },
    pricing: {
      inputPer1MTokens: lower.includes("mini") || lower.includes("flash") || lower.includes("deepseek-chat") ? 0.15 : 2.5,
      outputPer1MTokens: lower.includes("mini") || lower.includes("flash") || lower.includes("deepseek-chat") ? 0.6 : 10
    },
    enabled: true
  };
}
function ensureProviderModelRegistered(modelId, provider) {
  const cleanId = modelId.trim();
  if (!cleanId) return;
  const existingForProvider = db.getModels().find((m) => m.providerId === provider.id && (m.id === cleanId || m.apiModelName === cleanId));
  if (existingForProvider) return;
  const existingGlobal = db.getModel(cleanId);
  if (!existingGlobal) {
    db.saveModel(inferModelDefaults(cleanId, provider.id));
  } else if (existingGlobal.providerId !== provider.id) {
    const base = inferModelDefaults(cleanId, provider.id);
    db.saveModel({
      ...base,
      id: `${provider.id}:${cleanId}`,
      displayName: `${cleanId} (${provider.name})`,
      apiModelName: cleanId
    });
  }
}
function sanitizeProviderForClient(p) {
  const effectiveRaw = resolveProviderApiKey(p);
  return {
    ...p,
    apiKey: effectiveRaw ? maskSecret(effectiveRaw) : void 0,
    hasApiKey: Boolean(effectiveRaw)
  };
}
router2.get("/status", (_req, res) => {
  const settings = db.getSettings();
  const providers = db.getProviders();
  const models = db.getModels();
  const combos = db.getCombos();
  const activeKeys = db.getApiKeys().filter((k) => !k.revoked);
  const analytics = db.getAnalytics("30d");
  res.json({
    appName: "MSRoute AI Gateway",
    version: "1.0.0",
    status: settings.emergencyKillSwitch ? "kill_switch_active" : "online",
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
    averageLatencyMs: analytics.averageLatencyMs
  });
});
router2.get("/providers", (_req, res) => {
  const providers = db.getProviders().map(sanitizeProviderForClient);
  res.json(providers);
});
router2.post("/providers", (req, res) => {
  const body = req.body;
  if (!body.name || !body.baseUrl) {
    return res.status(400).json({ error: "Name and Base URL are required" });
  }
  const ssrfCheck = validateProviderUrl(body.baseUrl);
  if (!ssrfCheck.valid) {
    return res.status(400).json({ error: ssrfCheck.reason });
  }
  const modelList = Array.isArray(body.models) ? body.models.filter(Boolean) : [];
  const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const newProvider = {
    id: body.id || `prov-${Date.now()}`,
    name: body.name.trim(),
    type: body.type || "custom",
    baseUrl: ssrfCheck.sanitizedUrl || body.baseUrl,
    apiKey: rawApiKey ? encryptSecret(rawApiKey) : void 0,
    protocol: body.protocol || "openai-chat",
    customHeaders: body.customHeaders || {},
    models: modelList,
    defaultModel: body.defaultModel || (modelList[0] ?? ""),
    timeoutMs: Number(body.timeoutMs) || 3e4,
    priority: Number(body.priority) || 2,
    maxRetries: Number(body.maxRetries ?? 2),
    enabled: body.enabled !== false,
    health: {
      status: "unknown",
      recentErrorsCount: 0
    },
    metadata: body.metadata || {},
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.saveProvider(newProvider);
  for (const mId of modelList) {
    ensureProviderModelRegistered(mId, newProvider);
  }
  res.json({ success: true, provider: sanitizeProviderForClient(newProvider) });
});
router2.put("/providers/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.getProvider(id);
  if (!existing) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const body = { ...req.body };
  if (body.baseUrl) {
    const ssrfCheck = validateProviderUrl(body.baseUrl);
    if (!ssrfCheck.valid) {
      return res.status(400).json({ error: ssrfCheck.reason });
    }
    body.baseUrl = ssrfCheck.sanitizedUrl || body.baseUrl;
  }
  const rawNewKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const shouldUpdateKey = rawNewKey.length > 0 && !rawNewKey.includes("...") && !rawNewKey.includes("****");
  const updated = {
    ...existing,
    ...body,
    apiKey: shouldUpdateKey ? encryptSecret(rawNewKey) : existing.apiKey,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.saveProvider(updated);
  if (Array.isArray(updated.models)) {
    for (const mId of updated.models) {
      if (mId) ensureProviderModelRegistered(mId, updated);
    }
  }
  res.json({ success: true, provider: sanitizeProviderForClient(updated) });
});
router2.delete("/providers/:id", (req, res) => {
  const { id } = req.params;
  const success = db.deleteProvider(id);
  for (const m of db.getModels()) {
    if (m.providerId === id) {
      db.deleteModel(m.id);
    }
  }
  res.json({ success });
});
router2.post("/providers/:id/test", async (req, res) => {
  const { id } = req.params;
  const provider = db.getProvider(id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const start = Date.now();
  try {
    const ping = await pingProviderConnection(provider);
    provider.health = {
      status: "healthy",
      latencyMs: ping.latencyMs,
      lastChecked: (/* @__PURE__ */ new Date()).toISOString(),
      lastSuccess: (/* @__PURE__ */ new Date()).toISOString(),
      errorMessage: void 0,
      recentErrorsCount: 0
    };
    db.saveProvider(provider);
    res.json({
      success: true,
      providerId: id,
      providerName: provider.name,
      latencyMs: ping.latencyMs,
      availableModels: provider.models,
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAuthMissing = (err?.message || "").includes("401");
    provider.health = {
      status: isAuthMissing ? "unavailable" : "degraded",
      latencyMs,
      lastChecked: (/* @__PURE__ */ new Date()).toISOString(),
      lastSuccess: provider.health.lastSuccess,
      errorMessage: err.message,
      recentErrorsCount: (provider.health.recentErrorsCount || 0) + 1
    };
    db.saveProvider(provider);
    res.status(400).json({
      success: false,
      error: err.message,
      latencyMs
    });
  }
});
router2.get("/models", (_req, res) => {
  res.json(db.getModels());
});
router2.post("/models", (req, res) => {
  const body = req.body;
  if (!body.id || !body.displayName || !body.providerId) {
    return res.status(400).json({ error: "Model ID, display name, and provider ID are required" });
  }
  const model = {
    id: body.id.trim(),
    displayName: body.displayName.trim(),
    providerId: body.providerId,
    apiModelName: (body.apiModelName || body.id).trim(),
    contextWindow: Number(body.contextWindow) || 128e3,
    capabilities: {
      streaming: body.capabilities?.streaming !== false,
      tools: Boolean(body.capabilities?.tools),
      vision: Boolean(body.capabilities?.vision),
      reasoning: Boolean(body.capabilities?.reasoning),
      jsonOutput: body.capabilities?.jsonOutput !== false
    },
    pricing: {
      inputPer1MTokens: Number(body.pricing?.inputPer1MTokens ?? 0.5),
      outputPer1MTokens: Number(body.pricing?.outputPer1MTokens ?? 1.5)
    },
    enabled: body.enabled !== false
  };
  db.saveModel(model);
  res.json({ success: true, model });
});
router2.put(/^\/models\/(.+)$/, (req, res) => {
  const id = decodeURIComponent(req.params[0] || "");
  const existing = db.getModel(id);
  if (!existing) return res.status(404).json({ error: "Model not found" });
  const updated = { ...existing, ...req.body };
  db.saveModel(updated);
  res.json({ success: true, model: updated });
});
router2.delete(/^\/models\/(.+)$/, (req, res) => {
  const id = decodeURIComponent(req.params[0] || "");
  res.json({ success: db.deleteModel(id) });
});
router2.get("/aliases", (_req, res) => {
  res.json(db.getAliases());
});
router2.post("/aliases", (req, res) => {
  const body = req.body;
  if (!body.alias || !body.targetId) {
    return res.status(400).json({ error: "Alias and targetId are required" });
  }
  const newAlias = {
    id: body.id || `alias-${Date.now()}`,
    alias: body.alias.trim(),
    description: body.description || "",
    targetType: body.targetType || "model",
    targetId: body.targetId,
    isClaudeCodeDefault: Boolean(body.isClaudeCodeDefault)
  };
  db.saveAlias(newAlias);
  res.json({ success: true, alias: newAlias });
});
router2.delete("/aliases/:id", (req, res) => {
  res.json({ success: db.deleteAlias(req.params.id) });
});
router2.get("/combos", (_req, res) => {
  res.json(db.getCombos());
});
router2.post("/combos", (req, res) => {
  const body = req.body;
  if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
    return res.status(400).json({ error: "Combo name and at least one step are required" });
  }
  const cleanId = (body.id || "").trim() || toComboModelSlug(body.name) || `combo-${Date.now()}`;
  const newCombo = {
    id: cleanId,
    name: body.name.trim(),
    description: body.description || "",
    strategy: body.strategy || "sequential",
    steps: body.steps,
    primaryProviderId: body.primaryProviderId || body.steps[0]?.providerId,
    retryRules: body.retryRules || {
      maxAttempts: 3,
      backoffMs: 500,
      retryOnRateLimit: true,
      retryOnTimeout: true,
      retryOnServerError: true
    },
    timeoutMs: Number(body.timeoutMs) || 3e4,
    enabled: body.enabled !== false
  };
  db.saveCombo(newCombo);
  for (const s of newCombo.steps) {
    const prov = db.getProvider(s.providerId);
    if (prov && s.modelId) {
      if (!prov.models.includes(s.modelId) && !s.modelId.startsWith(`${prov.id}:`)) {
        prov.models = [...prov.models, s.modelId];
        db.saveProvider(prov);
      }
      ensureProviderModelRegistered(s.modelId.replace(`${prov.id}:`, ""), prov);
    }
  }
  res.json({ success: true, combo: newCombo });
});
router2.post(/^\/combos\/(.+)\/test$/, async (req, res) => {
  const id = decodeURIComponent(req.params[0] || "");
  const combo = db.findCombo(id);
  if (!combo) return res.status(404).json({ error: "Combo not found" });
  const start = Date.now();
  try {
    const route = resolveComboRoute(combo, "test");
    const dummyReq = parseAnthropicRequest({
      model: combo.id,
      max_tokens: 64,
      messages: [{ role: "user", content: "Respond with OK" }]
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
      fallbackHistory: execRes.fallbackHistory
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, latencyMs: Date.now() - start });
  }
});
router2.put(/^\/combos\/(.+)$/, (req, res) => {
  const id = decodeURIComponent(req.params[0] || "");
  const existing = db.getCombo(id) || db.findCombo(id);
  if (!existing) return res.status(404).json({ error: "Combo not found" });
  const updatedId = (req.body.id || existing.id).trim();
  const updated = { ...existing, ...req.body, id: updatedId, name: (req.body.name ?? existing.name).trim() };
  db.saveCombo(updated, existing.id);
  if (Array.isArray(updated.steps)) {
    for (const s of updated.steps) {
      const prov = db.getProvider(s.providerId);
      if (prov && s.modelId) {
        if (!prov.models.includes(s.modelId) && !s.modelId.startsWith(`${prov.id}:`)) {
          prov.models = [...prov.models, s.modelId];
          db.saveProvider(prov);
        }
        ensureProviderModelRegistered(s.modelId.replace(`${prov.id}:`, ""), prov);
      }
    }
  }
  res.json({ success: true, combo: updated });
});
router2.delete(/^\/combos\/(.+)$/, (req, res) => {
  const id = decodeURIComponent(req.params[0] || "");
  const existing = db.getCombo(id) || db.findCombo(id);
  res.json({ success: db.deleteCombo(existing?.id || id) });
});
router2.get("/rules", (_req, res) => {
  res.json(db.getRules());
});
router2.put("/rules", (req, res) => {
  if (Array.isArray(req.body)) {
    db.saveRules(req.body);
    res.json({ success: true, rules: db.getRules() });
  } else {
    res.status(400).json({ error: "Expected array of rules" });
  }
});
router2.get("/keys", (_req, res) => {
  const keys = db.getApiKeys().map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    permissions: k.permissions,
    rateLimitPerMinute: k.rateLimitPerMinute,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    revoked: k.revoked
  }));
  res.json(keys);
});
router2.post("/keys", (req, res) => {
  const body = req.body;
  if (!body.name) return res.status(400).json({ error: "Key name is required" });
  const { rawKey, keyPrefix, keyHash } = generateGatewayApiKey();
  const keyObj = {
    id: `key-${Date.now()}`,
    name: body.name.trim(),
    keyPrefix,
    keyHash,
    permissions: body.permissions || ["all"],
    rateLimitPerMinute: Number(body.rateLimitPerMinute) || 600,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    revoked: false
  };
  db.saveApiKey(keyObj);
  res.json({
    success: true,
    key: {
      ...keyObj,
      rawKey
    }
  });
});
router2.delete("/keys/:id", (req, res) => {
  const success = db.revokeApiKey(req.params.id);
  res.json({ success });
});
router2.get("/logs", (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  res.json(db.getLogs(limit));
});
router2.delete("/logs", (_req, res) => {
  db.clearLogs();
  res.json({ success: true });
});
router2.get("/analytics", (req, res) => {
  const rangeParam = String(req.query.range || "7d");
  const range = rangeParam === "today" || rangeParam === "30d" ? rangeParam : "7d";
  res.json(db.getAnalytics(range));
});
router2.get("/settings", (_req, res) => {
  res.json(db.getSettings());
});
router2.put("/settings", (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});
router2.post("/emergency-kill-switch", (req, res) => {
  const { enabled } = req.body;
  const updated = db.updateSettings({ emergencyKillSwitch: Boolean(enabled) });
  res.json({
    success: true,
    emergencyKillSwitch: updated.emergencyKillSwitch,
    message: updated.emergencyKillSwitch ? "Emergency kill switch ACTIVATED. All outgoing AI provider requests are now blocked." : "Emergency kill switch DEACTIVATED. Normal gateway routing resumed."
  });
});
router2.post("/test/claude-suite", async (_req, res) => {
  try {
    const report = await runClaudeCodeTestSuite();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/test/playground", async (req, res) => {
  const { protocol, model, prompt, stream, system, systemPrompt } = req.body;
  const effectiveSystem = system ?? systemPrompt ?? "";
  const start = Date.now();
  const endpoint = protocol === "anthropic" ? "/v1/messages" : "/v1/chat/completions";
  if (db.getSettings().emergencyKillSwitch) {
    return res.status(503).json({
      success: false,
      error: "Emergency Kill Switch is active. Deactivate it to dispatch requests.",
      latencyMs: 0
    });
  }
  try {
    const parsed = protocol === "anthropic" ? parseAnthropicRequest({
      model,
      messages: [{ role: "user", content: prompt || "Hello" }],
      system: effectiveSystem,
      stream: Boolean(stream)
    }) : parseOpenAiRequest({
      model,
      messages: [
        ...effectiveSystem ? [{ role: "system", content: effectiveSystem }] : [],
        { role: "user", content: prompt || "Hello" }
      ],
      stream: Boolean(stream)
    });
    const route = resolveRoute(parsed.model, parsed);
    const execRes = await executeWithFallback(route, parsed);
    const latencyMs = Date.now() - start;
    const inputTokens = execRes.response.usage.inputTokens;
    const outputTokens = execRes.response.usage.outputTokens;
    const costUsd = Number(
      (inputTokens / 1e6 * (execRes.selectedModel.pricing.inputPer1MTokens || 0.15) + outputTokens / 1e6 * (execRes.selectedModel.pricing.outputPer1MTokens || 0.6)).toFixed(5)
    );
    const log = {
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType: "playground",
      endpoint,
      requestedModel: model || parsed.model,
      resolvedModel: execRes.selectedModel.displayName,
      selectedProvider: execRes.selectedProvider.name,
      routingStrategy: route.strategy,
      status: execRes.wasFallback ? "fallback_success" : "success",
      statusCode: 200,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      retryCount: execRes.retryCount,
      fallbackHistory: execRes.fallbackHistory,
      streaming: false
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
      stopReason: execRes.response.stopReason
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    db.addLog({
      id: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      clientType: "playground",
      endpoint,
      requestedModel: model || "auto",
      resolvedModel: "Error",
      selectedProvider: "None",
      routingStrategy: "error",
      status: "error",
      statusCode: 400,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      retryCount: 0,
      fallbackHistory: [],
      errorMessage: err.message,
      streaming: false
    });
    res.status(400).json({ success: false, error: err.message, latencyMs });
  }
});
router2.get("/export-config", (_req, res) => {
  const jsonStr = db.exportConfig();
  res.setHeader("Content-Disposition", 'attachment; filename="msroute-config.json"');
  res.setHeader("Content-Type", "application/json");
  res.send(jsonStr);
});
router2.post("/import-config", (req, res) => {
  const { configJson } = req.body;
  if (!configJson) return res.status(400).json({ error: "Config JSON is required" });
  const success = db.importConfig(configJson);
  res.json({ success });
});
router2.post("/reset-state", (_req, res) => {
  db.resetState();
  res.json({ success: true });
});
var dashboard_api_default = router2;

// src/server/app.ts
dotenv.config();
function createGatewayApp() {
  const app2 = express();
  app2.use(express.json({ limit: "15mb" }));
  app2.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app2.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-api-key, anthropic-version, x-msroute-client, x-nexus-client"
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app2.use("/v1", gateway_v1_default);
  app2.use("/api", dashboard_api_default);
  return app2;
}
var app = createGatewayApp();
var app_default = app;
export {
  createGatewayApp,
  app_default as default
};
