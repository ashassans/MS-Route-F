import type { ProviderConfig, ModelConfig } from '../../types/gateway.ts';
import type { UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamChunk } from '../adapters/types.ts';
import { executeProviderRequest, executeProviderStream } from '../adapters/executor.ts';
import type { RouteResolution } from './router.ts';

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
  // Permanent auth / config / client errors should not retry on the same provider (fail over immediately)
  if (msg.includes('401') || msg.includes('403') || msg.includes('invalid api key') || msg.includes('missing api key') || msg.includes('no api key')) {
    return false;
  }
  if (msg.includes('429') || msg.includes('rate limit')) return true;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return true;
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

  const chain: Array<{ provider: ProviderConfig; model: ModelConfig }> = [
    { provider: route.selectedProvider, model: route.selectedModel },
    ...(route.fallbackChain || []),
  ];

  // Parallel Race strategy
  if (route.comboConfig?.strategy === 'parallel' && chain.length > 1) {
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
        wasFallback: winner.idx > 0,
      };
    } catch (aggErr: any) {
      const firstMsg = aggErr?.errors?.[0]?.message || aggErr?.message || 'Parallel race failed';
      throw new Error(`All providers in parallel race failed. Last error: ${firstMsg}`);
    }
  }

  let retryCount = 0;
  let lastError: any = null;

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    const maxRetries = current.provider.maxRetries ?? 2;

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

        if (!isRetryableError(err) || attempt === maxRetries) {
          fallbackHistory.push({
            providerId: current.provider.id,
            modelId: current.model.id,
            error: errMsg,
            attemptTime: new Date().toISOString(),
          });
          break;
        }

        const backoff = Math.min(2000, 300 * Math.pow(1.5, attempt) + Math.random() * 50);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw new Error(`All providers in routing chain failed. Last error: ${lastError?.message || 'Unknown failure'}`);
}

/**
 * Initiates a stream with pre-stream failover across the combo fallback chain.
 * Guarantees failover occurs strictly before streaming chunks commit to the HTTP response.
 */
export async function openStreamWithFallback(
  route: RouteResolution,
  req: UnifiedChatRequest,
  signal?: AbortSignal
): Promise<{
  firstChunk: UnifiedStreamChunk;
  iterator: AsyncGenerator<UnifiedStreamChunk>;
  selectedProvider: ProviderConfig;
  selectedModel: ModelConfig;
  wasFallback: boolean;
  fallbackHistory: ExecutionResult['fallbackHistory'];
}> {
  const fallbackHistory: ExecutionResult['fallbackHistory'] = [];
  const chain: Array<{ provider: ProviderConfig; model: ModelConfig }> = [
    { provider: route.selectedProvider, model: route.selectedModel },
    ...(route.fallbackChain || []),
  ];

  let lastError: any = null;

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    try {
      const iterator = executeProviderStream(current.provider, current.model, req, signal);
      const first = await iterator.next();
      if (first.done) {
        return {
          firstChunk: { type: 'done', inputTokens: 0, outputTokens: 0, finishReason: 'stop' },
          iterator,
          selectedProvider: current.provider,
          selectedModel: current.model,
          wasFallback: i > 0,
          fallbackHistory,
        };
      }
      return {
        firstChunk: first.value,
        iterator,
        selectedProvider: current.provider,
        selectedModel: current.model,
        wasFallback: i > 0,
        fallbackHistory,
      };
    } catch (err: any) {
      lastError = err;
      fallbackHistory.push({
        providerId: current.provider.id,
        modelId: current.model.id,
        error: err?.message || 'Stream connection failed',
        attemptTime: new Date().toISOString(),
      });
    }
  }

  throw new Error(`All providers in streaming chain failed. Last error: ${lastError?.message || 'Unknown failure'}`);
}
