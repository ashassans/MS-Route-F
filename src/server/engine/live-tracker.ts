import type { RequestLog, ProviderConfig } from '../../types/gateway.ts';
import type { LiveGatewayStatus, LiveInFlightRequest, LiveProviderState } from '../../types/gateway.ts';
import type { GatewayStore } from '../store/db.ts';

interface InFlightEntry {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  clientType: string;
  startedAtMs: number;
}

interface LastUsedEntry {
  id: string;
  providerId?: string;
  providerName: string;
  model: string;
  timestamp: string;
  latencyMs: number;
  status: 'success' | 'error' | 'fallback_success';
  endpoint: string;
  clientType: string;
}

class LiveTrafficTracker {
  private inFlightMap = new Map<string, InFlightEntry>();
  private lastUsed: LastUsedEntry | null = null;
  private recentHistory: RequestLog[] = [];

  public startRequest(
    id: string,
    providerId: string,
    providerName: string,
    model: string,
    clientType: string
  ): (details: {
    status: 'success' | 'error' | 'fallback_success';
    latencyMs: number;
    endpoint: string;
    log?: RequestLog;
  }) => void {
    const entry: InFlightEntry = {
      id,
      providerId,
      providerName,
      model,
      clientType,
      startedAtMs: Date.now(),
    };
    this.inFlightMap.set(id, entry);

    // Return cleanup callback
    return (details) => {
      this.inFlightMap.delete(id);
      this.lastUsed = {
        id,
        providerId,
        providerName,
        model,
        timestamp: new Date().toISOString(),
        latencyMs: details.latencyMs,
        status: details.status,
        endpoint: details.endpoint,
        clientType,
      };

      if (details.log) {
        this.recentHistory.unshift(details.log);
        if (this.recentHistory.length > 50) {
          this.recentHistory.pop();
        }
      }
    };
  }

  public getLiveStatus(db: GatewayStore): LiveGatewayStatus {
    const now = Date.now();
    const inFlightRequests: LiveInFlightRequest[] = Array.from(this.inFlightMap.values()).map((e) => ({
      id: e.id,
      providerId: e.providerId,
      providerName: e.providerName,
      model: e.model,
      clientType: e.clientType,
      startedAt: new Date(e.startedAtMs).toISOString(),
      elapsedMs: now - e.startedAtMs,
    }));

    const providers = db.getProviders();
    const logs = db.getLogs(200);

    const fifteenMinsAgo = now - 15 * 60 * 1000;

    // Build map of recent logs per provider
    const providerStatsMap = new Map<
      string,
      { total: number; recent15m: number; totalLatency: number; lastUsedAt?: string }
    >();

    for (const log of logs) {
      const pName = log.selectedProvider;
      if (!pName || pName === 'None') continue;

      const stat = providerStatsMap.get(pName) || {
        total: 0,
        recent15m: 0,
        totalLatency: 0,
        lastUsedAt: undefined,
      };

      stat.total += 1;
      stat.totalLatency += log.latencyMs;

      const logTime = new Date(log.timestamp).getTime();
      if (logTime >= fifteenMinsAgo) {
        stat.recent15m += 1;
      }
      if (!stat.lastUsedAt || logTime > new Date(stat.lastUsedAt).getTime()) {
        stat.lastUsedAt = log.timestamp;
      }

      providerStatsMap.set(pName, stat);
    }

    const providerStates: LiveProviderState[] = providers.map((p: ProviderConfig) => {
      const stats = providerStatsMap.get(p.name) || {
        total: 0,
        recent15m: 0,
        totalLatency: 0,
        lastUsedAt: undefined,
      };
      const inFlightForProvider = inFlightRequests.filter(
        (req) => req.providerId === p.id || req.providerName.toLowerCase() === p.name.toLowerCase()
      );
      const isCurrentlyActive = inFlightForProvider.length > 0;

      return {
        id: p.id,
        name: p.name,
        type: p.type,
        enabled: p.enabled,
        isCurrentlyActive,
        inFlightCount: inFlightForProvider.length,
        lastUsedAt: stats.lastUsedAt,
        totalRequests: stats.total,
        recentRequests15m: stats.recent15m,
        averageLatencyMs: stats.total > 0 ? Math.round(stats.totalLatency / stats.total) : 0,
        healthStatus: p.health.status,
      };
    });

    // Derive lastUsed from state or latest log if not yet set in memory
    let effectiveLastUsed = this.lastUsed;
    if (!effectiveLastUsed && logs.length > 0) {
      const latest = logs[0];
      const matchedProv = providers.find((p: ProviderConfig) => p.name === latest.selectedProvider);
      effectiveLastUsed = {
        id: latest.id,
        providerId: matchedProv?.id,
        providerName: latest.selectedProvider,
        model: latest.resolvedModel || latest.requestedModel,
        timestamp: latest.timestamp,
        latencyMs: latest.latencyMs,
        status: latest.status,
        endpoint: latest.endpoint,
        clientType: latest.clientType,
      };
    }

    return {
      isProcessing: inFlightRequests.length > 0,
      inFlightCount: inFlightRequests.length,
      inFlightRequests,
      lastUsed: effectiveLastUsed,
      providers: providerStates,
      recentActivity: logs.slice(0, 10),
      serverTime: new Date().toISOString(),
    };
  }
}

export const liveTracker = new LiveTrafficTracker();
