import React, { useState } from 'react';
import {
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Power,
  Radio,
  Plus,
} from 'lucide-react';
import type { ProviderConfig, HealthStatus } from '../../types/gateway.ts';

interface HealthViewProps {
  providers: ProviderConfig[];
  onRefresh: () => void;
  onNavigate: (view: string) => void;
}

export const HealthView: React.FC<HealthViewProps> = ({ providers, onRefresh, onNavigate }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePingAll = async () => {
    if (providers.length === 0) return;
    setRefreshing(true);
    setErrorMsg(null);
    try {
      for (const p of providers) {
        await fetch(`/api/providers/${p.id}/test`, { method: 'POST' });
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to complete fleet ping');
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleEnable = async (p: ProviderConfig) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/providers/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle provider state');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const getStatusBadge = (status: HealthStatus, enabled: boolean) => {
    if (!enabled) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#faf8f5] text-stone-500 border border-[#e5dfd5]">
          Disabled
        </span>
      );
    }
    switch (status) {
      case 'healthy':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ecf7ef] text-[#166534] border border-[#cbe8d2] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Healthy
          </span>
        );
      case 'unknown':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#faf8f5] text-stone-600 border border-[#e5dfd5]">
            Untested
          </span>
        );
      case 'degraded':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#fefce8] text-[#854d0e] border border-[#fef08a] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Degraded
          </span>
        );
      case 'unavailable':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Unavailable
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-[#1c4d32]" />
            Provider Health Matrix
          </h2>
          <p className="text-xs text-stone-600 mt-1">
            Live upstream connectivity checks, measured round-trip latency, and circuit-breaker controls.
          </p>
        </div>

        <button
          onClick={handlePingAll}
          disabled={refreshing || providers.length === 0}
          className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Pinging All Fleet...' : 'Ping All Providers'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Empty State or Provider Matrix Cards */}
      {providers.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-10 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
            <HeartPulse className="w-6 h-6" />
          </div>
          <h3 className="font-editorial text-xl font-medium text-stone-900">No Providers in Health Matrix</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            Add AI providers to monitor real-time endpoint latency, authentication status, and automatic failover readiness.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onNavigate('providers')}
              className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Configure Providers</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {providers.map((p) => (
            <div
              key={p.id}
              className={`bg-white border rounded-3xl p-6 flex flex-col justify-between shadow-xs transition ${
                p.enabled ? 'border-[#e8e2d8]' : 'border-[#e8e2d8]/60 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#16a34a]" />
                    <h3 className="font-bold text-sm text-stone-900">{p.name}</h3>
                  </div>
                  {getStatusBadge(p.health.status, p.enabled)}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-[#faf8f5] border border-[#e8e2d8] rounded-2xl p-3 my-3 text-xs">
                  <div>
                    <span className="text-stone-500 text-[10px] block font-medium">Ping Latency</span>
                    <span className="font-mono text-stone-800 font-bold">
                      {p.health.latencyMs !== undefined ? `${p.health.latencyMs} ms` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 text-[10px] block font-medium">Recent Failures</span>
                    <span className="font-mono text-stone-800 font-bold">{p.health.recentErrorsCount ?? 0}</span>
                  </div>
                </div>

                <div className="text-xs text-stone-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Last Checked:</span>
                    <span className="font-mono text-stone-700">
                      {p.health.lastChecked ? new Date(p.health.lastChecked).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                  {p.health.errorMessage && (
                    <div className="pt-1 text-[11px] text-rose-700 truncate" title={p.health.errorMessage}>
                      {p.health.errorMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-[#f0eae1] flex items-center justify-between">
                <span className="text-xs text-stone-500">
                  {p.enabled ? 'Routing Active' : 'Routing Suspended'}
                </span>
                <button
                  onClick={() => handleToggleEnable(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    p.enabled
                      ? 'bg-[#faf8f5] hover:bg-stone-200 text-stone-700 border-[#e5dfd5]'
                      : 'bg-[#ecf7ef] hover:bg-[#d8eedc] text-[#166534] border-[#cbe8d2]'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{p.enabled ? 'Disable' : 'Enable'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
