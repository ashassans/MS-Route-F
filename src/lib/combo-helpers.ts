import type { ModelConfig, ProviderConfig } from '../types/gateway.ts';

export interface ComboStepDraft {
  providerId: string;
  modelId: string;
  weight: number;
  priority: number;
}

export interface SelectableModelOption {
  id: string;
  displayName: string;
  apiModelName: string;
}

/**
 * Generates a clean API model identifier from a Combo Name.
 * Preserves slashes/dots/colons if the user enters a provider/model identifier
 * (e.g. "MiniMaxAI/MiniMax-M2.7"), while converting spaces in human titles
 * (e.g. "Smart Coding Failover" -> "smart-coding-failover").
 */
export function toComboModelSlug(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (!/\s/.test(trimmed) && /[/:.]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9/:._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Returns all selectable model options for a given provider by merging
 * registered ModelConfigs for that provider with any model strings listed
 * directly on the ProviderConfig (including shared model names across providers).
 */
export function getModelsForProvider(
  providerId: string,
  providers: ProviderConfig[],
  models: ModelConfig[]
): SelectableModelOption[] {
  if (!providerId) return [];

  const options: SelectableModelOption[] = [];
  const seenIds = new Set<string>();
  const seenApiNames = new Set<string>();

  for (const m of models) {
    if (m.providerId === providerId && m.enabled !== false) {
      options.push({
        id: m.id,
        displayName: m.displayName || m.apiModelName || m.id,
        apiModelName: m.apiModelName || m.id,
      });
      seenIds.add(m.id);
      seenApiNames.add(m.apiModelName || m.id);
    }
  }

  const prov = providers.find((p) => p.id === providerId);
  if (prov) {
    const rawNames = [
      ...(Array.isArray(prov.models) ? prov.models : []),
      ...(prov.defaultModel ? [prov.defaultModel] : []),
    ]
      .map((s) => s.trim())
      .filter(Boolean);

    for (const rawName of rawNames) {
      if (!seenIds.has(rawName) && !seenApiNames.has(rawName)) {
        options.push({
          id: rawName,
          displayName: rawName,
          apiModelName: rawName,
        });
        seenIds.add(rawName);
        seenApiNames.add(rawName);
      }
    }
  }

  return options;
}

/**
 * Builds an initial ComboStepDraft for a provider at a given index.
 */
export function createComboStepForProvider(
  provider: ProviderConfig | undefined,
  providers: ProviderConfig[],
  models: ModelConfig[],
  priority: number,
  weight = 50
): ComboStepDraft {
  const providerId = provider?.id || providers[0]?.id || '';
  const providerModels = getModelsForProvider(providerId, providers, models);
  return {
    providerId,
    modelId: providerModels[0]?.id || provider?.defaultModel || '',
    weight,
    priority,
  };
}

/**
 * Immutably updates a step when the user selects a different provider in Combo Builder.
 */
export function applyStepProviderChange(
  steps: ComboStepDraft[],
  stepIndex: number,
  nextProviderId: string,
  providers: ProviderConfig[],
  models: ModelConfig[]
): ComboStepDraft[] {
  const providerModels = getModelsForProvider(nextProviderId, providers, models);
  const prov = providers.find((p) => p.id === nextProviderId);
  const nextModelId = providerModels[0]?.id || prov?.defaultModel || '';

  return steps.map((step, idx) =>
    idx === stepIndex
      ? {
          ...step,
          providerId: nextProviderId,
          modelId: nextModelId,
        }
      : step
  );
}
