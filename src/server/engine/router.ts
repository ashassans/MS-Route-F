import { db } from '../store/db.ts';
import type { ProviderConfig, ModelConfig, ComboConfig, RoutingMode } from '../../types/gateway.ts';
import type { UnifiedChatRequest } from '../adapters/types.ts';

export interface RouteResolution {
  strategy: string;
  selectedProvider: ProviderConfig;
  selectedModel: ModelConfig;
  fallbackChain?: Array<{ provider: ProviderConfig; model: ModelConfig }>;
  isCombo?: boolean;
  comboConfig?: ComboConfig;
}

/**
 * Resolves which provider and model to dispatch the request to.
 */
export function resolveRoute(
  requestedModelName: string,
  req: UnifiedChatRequest,
  forcedMode?: RoutingMode
): RouteResolution {
  const settings = db.getSettings();
  const effectiveMode = forcedMode || settings.defaultRoutingMode;

  // 1. Check if requested model matches a Model Alias
  const alias = db.getAlias(requestedModelName);
  if (alias) {
    if (alias.targetType === 'combo') {
      const combo = db.findCombo(alias.targetId);
      if (combo && combo.enabled) {
        return resolveComboRoute(combo, `alias:${alias.alias}`);
      }
    } else if (alias.targetType === 'model') {
      const model = db.getModel(alias.targetId);
      if (model && model.enabled) {
        const prov = db.getProvider(model.providerId);
        if (prov && prov.enabled) {
          return {
            strategy: `alias:${alias.alias}`,
            selectedProvider: prov,
            selectedModel: model,
          };
        }
      }
    }
  }

  // 2. Check if requested model matches a Combo ID, Combo Name, or Combo Slug
  const directCombo = db.findCombo(requestedModelName);
  if (directCombo && directCombo.enabled) {
    return resolveComboRoute(directCombo, 'direct-combo');
  }

  // 3. Check if requested model directly matches a Model ID or API model name
  const directModel =
    db.getModel(requestedModelName) ||
    db.getModels().find((m) => m.apiModelName === requestedModelName && m.enabled);
  if (directModel && directModel.enabled) {
    const prov = db.getProvider(directModel.providerId);
    if (prov && prov.enabled) {
      return {
        strategy: 'direct-model',
        selectedProvider: prov,
        selectedModel: directModel,
      };
    }
  }

  // 4. Auto Routing Mode
  if (effectiveMode === 'auto') {
    return resolveAutoRoute(req);
  }

  // 5. Default Combo Routing Mode
  if (effectiveMode === 'combo' && settings.defaultComboId) {
    const combo = db.getCombo(settings.defaultComboId);
    if (combo && combo.enabled) {
      return resolveComboRoute(combo, 'default-combo');
    }
  }

  // 6. Fallback to default configured model or first enabled model
  const enabledModels = db.getModels().filter((m) => m.enabled);
  const enabledProviders = db.getProviders().filter((p) => p.enabled);

  if (enabledModels.length === 0 || enabledProviders.length === 0) {
    throw new Error('No active AI providers or models are configured. Add an AI provider and API key in the Providers tab.');
  }

  const defaultModel =
    enabledModels.find((m) => m.id === settings.defaultModelId) ||
    enabledModels.find((m) => enabledProviders.some((p) => p.id === m.providerId)) ||
    enabledModels[0];

  const prov = enabledProviders.find((p) => p.id === defaultModel.providerId) || enabledProviders[0];

  return {
    strategy: 'default-fallback',
    selectedProvider: prov,
    selectedModel: defaultModel,
  };
}

/**
 * Resolves route based on Combo Strategy (Sequential, Weighted, Priority, Parallel)
 */
export function resolveComboRoute(combo: ComboConfig, prefix = 'combo'): RouteResolution {
  const providers = db.getProviders();
  const models = db.getModels();

  const availableSteps = combo.steps
    .map((step) => {
      const p = providers.find((pr) => pr.id === step.providerId);
      if (!p || !p.enabled) {
        return { step, provider: undefined, model: undefined };
      }

      const rawModelId = (step.modelId || p.defaultModel || p.models[0] || '').trim();
      if (!rawModelId) {
        return { step, provider: p, model: undefined };
      }

      // 1. Exact provider + model match
      let m = models.find(
        (mo) =>
          mo.providerId === p.id &&
          (mo.id === rawModelId || mo.apiModelName === rawModelId)
      );

      // 2. Shared model ID registered under another provider — clone with target providerId
      if (!m) {
        const shared = models.find((mo) => mo.id === rawModelId || mo.apiModelName === rawModelId);
        if (shared) {
          m = {
            ...shared,
            id: `${p.id}:${shared.apiModelName || rawModelId}`,
            providerId: p.id,
            enabled: true,
          };
        }
      }

      // 3. Inline/provider-listed model not yet in Model Registry — synthesize valid ModelConfig
      if (!m) {
        m = {
          id: rawModelId,
          displayName: rawModelId,
          providerId: p.id,
          apiModelName: rawModelId,
          contextWindow: 128000,
          capabilities: {
            streaming: true,
            tools: true,
            vision: false,
            reasoning: false,
            jsonOutput: true,
          },
          pricing: {
            inputPer1MTokens: 0.5,
            outputPer1MTokens: 1.5,
          },
          enabled: true,
        };
      }

      return { step, provider: p, model: m };
    })
    .filter((s): s is { step: typeof s.step; provider: ProviderConfig; model: ModelConfig } => {
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
      selectedModel: defaultModel,
    };
  }

  if (combo.strategy === 'weighted') {
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
      fallbackChain: availableSteps
        .filter((s) => !(s.provider.id === chosen.provider.id && s.model.id === chosen.model.id))
        .map((s) => ({ provider: s.provider, model: s.model })),
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
    fallbackChain: fallbacks,
  };
}

function resolveAutoRoute(req: UnifiedChatRequest): RouteResolution {
  const rules = db.getRules();
  const models = db.getModels().filter((m) => m.enabled);
  const providers = db.getProviders().filter((p) => p.enabled);

  if (models.length === 0 || providers.length === 0) {
    throw new Error('No active AI providers or models are configured. Add an AI provider and API key in the Providers tab.');
  }

  const promptText = req.messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join(' ')
    .toLowerCase();

  const hasTools = Boolean(req.tools && req.tools.length > 0);
  const hasVision = req.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b: any) => b.type === 'image_url' || b.type === 'image')
  );

  for (const rule of rules) {
    if (rule.taskType === 'vision' && hasVision) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === 'coding' && (hasTools || promptText.includes('function') || promptText.includes('code') || promptText.includes('class') || promptText.includes('debug'))) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === 'reasoning' && (promptText.includes('think') || promptText.includes('calculate') || promptText.includes('proof') || promptText.includes('math') || promptText.includes('architect'))) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === 'fast' && promptText.length < 150) {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
    if (rule.taskType === 'default') {
      const match = getModelOrComboFromRule(rule, providers, models);
      if (match) return match;
    }
  }

  const settings = db.getSettings();
  const defaultModel =
    models.find((m) => m.id === settings.defaultModelId) ||
    models.find((m) => providers.some((p) => p.id === m.providerId)) ||
    models[0];
  const defaultProv = providers.find((p) => p.id === defaultModel.providerId) || providers[0];

  return {
    strategy: 'auto:heuristic',
    selectedProvider: defaultProv,
    selectedModel: defaultModel,
  };
}

function getModelOrComboFromRule(
  rule: any,
  providers: ProviderConfig[],
  models: ModelConfig[]
): RouteResolution | null {
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
          selectedModel: model,
        };
      }
    }
  }
  return null;
}
