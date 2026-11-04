import { db } from '../store/db.ts';
import { ProviderConfig, ModelConfig, ComboConfig, RoutingMode } from '../../types/gateway.ts';
import { UnifiedChatRequest } from '../adapters/types.ts';

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

  // 1. First, check if requested model matches a Model Alias
  const alias = db.getAlias(requestedModelName);
  if (alias) {
    if (alias.targetType === 'combo') {
      const combo = db.getCombo(alias.targetId);
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

  // 2. Check if requested model directly matches a Model ID
  const directModel = db.getModel(requestedModelName);
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

  // 3. Check if requested model matches a Combo ID
  const directCombo = db.getCombo(requestedModelName);
  if (directCombo && directCombo.enabled) {
    return resolveComboRoute(directCombo, 'direct-combo');
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

  // 6. Fallback to default configured model
  const defaultModel = db.getModel(settings.defaultModelId) || db.getModels()[0];
  const prov = db.getProvider(defaultModel.providerId) || db.getProviders()[0];

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

  // Filter steps whose provider and model are enabled and not in 'disabled' / 'unavailable' state
  const availableSteps = combo.steps
    .map((step) => {
      const p = providers.find((pr) => pr.id === step.providerId);
      const m = models.find((mo) => mo.id === step.modelId);
      return { step, provider: p, model: m };
    })
    .filter((s): s is { step: typeof s.step; provider: ProviderConfig; model: ModelConfig } => {
      return Boolean(s.provider && s.provider.enabled && s.model && s.model.enabled);
    });

  if (availableSteps.length === 0) {
    // Fallback if combo has no available steps
    const defaultModel = models[0];
    const defaultProv = providers.find((p) => p.id === defaultModel.providerId) || providers[0];
    return {
      strategy: `${prefix}:${combo.name} (no-active-steps)`,
      selectedProvider: defaultProv,
      selectedModel: defaultModel,
    };
  }

  // A. Weighted Strategy
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
        .filter((s) => s.provider.id !== chosen.provider.id)
        .map((s) => ({ provider: s.provider, model: s.model })),
    };
  }

  // B. Sequential Strategy
  // Return step 0 as primary, and remaining steps as fallback chain
  const primary = availableSteps[0];
  const fallbacks = availableSteps.slice(1).map((s) => ({ provider: s.provider, model: s.model }));

  return {
    strategy: `${prefix}:${combo.name} (sequential)`,
    selectedProvider: primary.provider,
    selectedModel: primary.model,
    isCombo: true,
    comboConfig: combo,
    fallbackChain: fallbacks,
  };
}

/**
 * Auto-routing logic based on request characteristics
 */
function resolveAutoRoute(req: UnifiedChatRequest): RouteResolution {
  const rules = db.getRules();
  const models = db.getModels();
  const providers = db.getProviders();

  const promptText = req.messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join(' ')
    .toLowerCase();

  const hasTools = Boolean(req.tools && req.tools.length > 0);
  const hasVision = req.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b: any) => b.type === 'image_url' || b.type === 'image')
  );

  // Check rules in priority order
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
  }

  // Default Auto selection
  const defaultModel = models.find((m) => m.id === 'gemini-2.5-flash') || models[0];
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
