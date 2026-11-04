import { ProviderConfig, ModelConfig } from '../../types/gateway.ts';
import { UnifiedChatRequest, UnifiedChatResponse } from '../adapters/types.ts';
import { executeProviderRequest } from '../adapters/executor.ts';
import { RouteResolution } from './router.ts';

export interface ExecutionResult {
  response: UnifiedChatResponse;
  selectedProvider: ProviderConfig;
  selectedModel: ModelConfig;
  retryCount: number;
  fallbackHistory: Array<{
    providerId: string;
    modelId: string;
    error: string;
    attemptTime: string;
  }>;
  wasFallback: boolean;
}

/**
 * Checks if an error is considered retryable (e.g. rate limit, temporary server error, network timeout)
 */
export function isRetryableError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit')) return true;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return true;
  // Permanent errors: 401 Unauthorized, 400 Bad Request, 403 Forbidden
  if (msg.includes('401') || msg.includes('invalid api key')) return false;
  return true;
}

/**
 * Executes a request with automatic failover across the resolved route and fallback chain.
 */
export async function executeWithFallback(
  route: RouteResolution,
  req: UnifiedChatRequest,
  signal?: AbortSignal
): Promise<ExecutionResult> {
  const fallbackHistory: Array<{
    providerId: string;
    modelId: string;
    error: string;
    attemptTime: string;
  }> = [];

  // Chain: [primary, ...fallbacks]
  const chain: Array<{ provider: ProviderConfig; model: ModelConfig }> = [
    { provider: route.selectedProvider, model: route.selectedModel },
    ...(route.fallbackChain || []),
  ];

  let retryCount = 0;
  let lastError: any = null;

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    const maxRetries = current.provider.maxRetries || 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error('Request was aborted by client');
      }

      try {
        const response = await executeProviderRequest(current.provider, current.model, req, signal);
        return {
          response,
          selectedProvider: current.provider,
          selectedModel: current.model,
          retryCount,
          fallbackHistory,
          wasFallback: i > 0,
        };
      } catch (err: any) {
        lastError = err;
        retryCount++;

        const errMsg = err?.message || 'Unknown provider error';
        console.warn(`[Gateway Failover] Attempt ${attempt + 1} failed on ${current.provider.name} (${current.model.displayName}): ${errMsg}`);

        // If not retryable or final attempt for this provider, record in fallback history and break to next provider
        if (!isRetryableError(err) || attempt === maxRetries) {
          fallbackHistory.push({
            providerId: current.provider.id,
            modelId: current.model.id,
            error: errMsg,
            attemptTime: new Date().toISOString(),
          });
          break;
        }

        // Exponential backoff with jitter: backoff * 2^attempt + random(0-50ms)
        const backoff = Math.min(2000, 300 * Math.pow(1.5, attempt) + Math.random() * 50);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw new Error(`All providers in routing chain failed. Last error: ${lastError?.message || 'Unknown failure'}`);
}
