import React, { useState } from 'react';
import {
  Activity,
  Layers,
  Box,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  ArrowRight,
  Play,
  Terminal,
  Plus,
  Radio,
  FileText,
  Zap,
} from 'lucide-react';
import type {
  ProviderConfig,
  ModelConfig,
  ComboConfig,
  GatewayApiKey,
  RequestLog,
  GatewayAnalytics,
  GatewaySettings,
  LiveGatewayStatus,
} from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';

interface OverviewViewProps {
  providers: ProviderConfig[];
  models: ModelConfig[];
  combos: ComboConfig[];
  apiKeys: GatewayApiKey[];
  logs: RequestLog[];
  analytics: GatewayAnalytics | null;
  settings: GatewaySettings | null;
  liveStatus?: LiveGatewayStatus | null;
  onRefresh?: () => void;
  onNavigate: (view: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  providers,
  models,
  combos,
  apiKeys,
  logs,
  analytics,
  settings,
  liveStatus,
  onRefresh,
  onNavigate,
}) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    provider: string;
    model: string;
    latencyMs: number;
    content: string;
  } | null>(null);

  const activeProviders = providers.filter((p) => p.enabled);
  const activeModels = models.filter((m) => m.enabled);
  const activeCombo = combos.find((c) => c.id === settings?.defaultComboId) || combos[0] || null;
  const activeKey = apiKeys.find((k) => !k.revoked) || null;

  const totalRequests = analytics?.totalRequests ?? logs.length;
  const successfulRequests = analytics?.successfulRequests ?? logs.filter((l) => l.status !== 'error').length;
  const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;

  const inputTokens = analytics?.totalInputTokens ?? 0;
  const outputTokens = analytics?.totalOutputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const estimatedCost = analytics?.totalEstimatedCostUsd ?? 0;
  const averageLatency = analytics?.averageLatencyMs ?? 0;

  const timeline = analytics?.timeline || [];
  const todayReqs = timeline[timeline.length - 1]?.requests ?? 0;
  const yesterdayReqs = timeline[timeline.length - 2]?.requests ?? 0;
  const requestSubtext =
    totalRequests === 0
      ? 'No requests yet'
      : yesterdayReqs > 0
        ? `${todayReqs >= yesterdayReqs ? '+' : ''}${Math.round(((todayReqs - yesterdayReqs) / yesterdayReqs) * 100)}% vs yesterday`
        : `${todayReqs} today`;

  const isProcessing = Boolean(liveStatus?.isProcessing && (liveStatus?.inFlightRequests?.length ?? 0) > 0);
  const activeReq = liveStatus?.inFlightRequests?.[0];
  const lastUsed = liveStatus?.lastUsed;
  const liveProviders = liveStatus?.providers || [];

  const handleSimulateLiveRequest = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/simulate-live-request', { method: 'POST' });
      const data = await readApiJson(res, 'Simulate Live API');
      if (data.success) {
        setSimulationResult({
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
          content: data.content,
        });
        if (onRefresh) onRefresh();
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Active Provider & Real-Time Traffic Radar */}
      <div className="bg-gradient-to-r from-[#edf7f1] via-[#f5faf6] to-[#edf7f1] border border-[#cbe4d4] rounded-3xl p-5 sm:p-6 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d5ede0] border border-[#b8dfc8] flex items-center justify-center text-[#144728] shadow-2xs shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-editorial text-xl sm:text-2xl font-medium text-stone-900">
                  Live Provider Activity & Traffic Radar
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#dcfce7] text-[#14532d] border border-[#86efac] rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-ping" />
                  Real-Time Monitor
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Real-time upstream telemetry across Claude Code, cURL, OpenAI SDKs, and Playground
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              onClick={handleSimulateLiveRequest}
              disabled={isSimulating || activeProviders.length === 0}
              className="px-3.5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] disabled:opacity-50 text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Send a quick test request through the active gateway pipeline"
            >
              <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Routing Ping...' : 'Test Live Request / Ping'}</span>
            </button>
          </div>
        </div>

        {/* Active In-Flight or Last Routed Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Box 1: Currently Active Provider */}
          <div className="bg-white/95 backdrop-blur border border-[#d6e8dc] rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1">
                Currently Active Provider
              </span>
              {isProcessing && activeReq ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] animate-ping" />
                    <span className="text-lg font-bold text-stone-900">{activeReq.providerName}</span>
                  </div>
                  <p className="text-xs text-stone-600 font-mono">
                    Model: <strong className="text-stone-800">{activeReq.model}</strong>
                  </p>
                  <p className="text-[11px] text-[#15803d] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                    In-flight for {activeReq.elapsedMs}ms • Client: {activeReq.clientType}
                  </p>
                </div>
              ) : lastUsed ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" />
                    <span className="text-lg font-bold text-stone-900">{lastUsed.providerName}</span>
                  </div>
                  <p className="text-xs text-stone-600 font-mono">
                    Model: <strong className="text-stone-800">{lastUsed.model}</strong>
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Latency: <strong className="text-stone-700">{lastUsed.latencyMs}ms</strong> • Status:{' '}
                    <span className={lastUsed.status === 'error' ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {lastUsed.status}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm font-semibold text-stone-700">Awaiting First Request</p>
                  <p className="text-xs text-stone-400 mt-0.5">Dispatched requests will appear live</p>
                </div>
              )}
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#f0eae1] flex items-center justify-between text-[11px] text-stone-400">
              <span>Routing Mode:</span>
              <span className="font-semibold text-stone-700 font-mono">
                {(settings?.defaultRoutingMode || 'auto').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Box 2: Live Provider Fleet Status */}
          <div className="bg-white/95 backdrop-blur border border-[#d6e8dc] rounded-2xl p-4 flex flex-col justify-between shadow-2xs md:col-span-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  Connected Provider Fleet ({providers.length} Registered)
                </span>
                <button
                  onClick={() => onNavigate('providers')}
                  className="text-[11px] text-[#205e3b] hover:underline font-semibold cursor-pointer"
                >
                  Manage Providers →
                </button>
              </div>

              {providers.length === 0 ? (
                <p className="text-xs text-stone-400 py-3">No upstream providers configured yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {(liveProviders.length > 0 ? liveProviders : providers.map((p) => ({
                    id: p.id,
                    name: p.name,
                    type: p.type,
                    enabled: p.enabled,
                    isCurrentlyActive: false,
                    inFlightCount: 0,
                    lastUsedAt: undefined,
                    totalRequests: logs.filter((l) => l.selectedProvider === p.name).length,
                    recentRequests15m: 0,
                    averageLatencyMs: p.health.latencyMs || 0,
                    healthStatus: p.health.status,
                  }))).map((p) => {
                    const isSelectedActive = p.isCurrentlyActive || (lastUsed?.providerName === p.name);
                    return (
                      <div
                        key={p.id}
                        className={`p-2.5 rounded-xl border transition ${
                          p.isCurrentlyActive
                            ? 'bg-[#ecfdf5] border-[#86efac] shadow-2xs'
                            : isSelectedActive
                              ? 'bg-[#f4faf6] border-[#cbe4d4]'
                              : 'bg-[#faf8f5] border-[#ede8df]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-stone-800 truncate">{p.name}</span>
                          {p.isCurrentlyActive ? (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                              LIVE
                            </span>
                          ) : isSelectedActive ? (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-[#e1f1e6] text-[#1c4d32]">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-[9px] text-stone-400 font-mono uppercase">{p.type}</span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-stone-500 flex items-center justify-between">
                          <span>{p.totalRequests} reqs</span>
                          <span className="font-mono">{p.averageLatencyMs > 0 ? `${p.averageLatencyMs}ms` : '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {simulationResult && (
              <div className="mt-2.5 pt-2 border-t border-[#f0eae1] flex items-center justify-between text-xs text-stone-600">
                <span>
                  Last Test Ping: <strong className="text-stone-800">{simulationResult.provider}</strong> ({simulationResult.model})
                </span>
                <span className="text-emerald-700 font-semibold font-mono">{simulationResult.latencyMs}ms OK</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 7 Horizontal Stat Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-[#eaf4f4] border border-[#cde5e5] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Total Requests</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#0d9488] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{totalRequests.toLocaleString()}</div>
          <span className="text-[11px] text-[#0f766e] font-semibold flex items-center gap-1">
            {requestSubtext}
          </span>
        </div>

        <div className="bg-[#eff6ef] border border-[#d6ebd7] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Active Providers</span>
            <Layers className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            {activeProviders.length} <span className="text-xs text-stone-500 font-medium">/ {providers.length}</span>
          </div>
          <span className="text-[11px] text-[#15803d] font-semibold">
            {providers.length > 1 ? 'Multi-cloud cluster' : providers.length === 1 ? '1 provider ready' : 'Add provider'}
          </span>
        </div>

        <div className="bg-[#f2eee8] border border-[#e1d9cc] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Models Registry</span>
            <Box className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{activeModels.length}</div>
          <span className="text-[11px] text-stone-600 font-semibold">
            {activeModels.length > 0 ? 'Ready for routing' : 'None registered'}
          </span>
        </div>

        <div className="bg-[#f3f0f9] border border-[#e4daf3] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Total Tokens</span>
            <Activity className="w-3.5 h-3.5 text-[#9333ea] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{totalTokens.toLocaleString()}</div>
          <span className="text-[11px] text-[#7e22ce] font-semibold">In: {inputTokens.toLocaleString()}</span>
        </div>

        <div className="bg-[#fcf7e9] border border-[#f5eccb] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Est. Spend</span>
            <DollarSign className="w-3.5 h-3.5 text-[#ca8a04] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            ${estimatedCost.toFixed(4)}
          </div>
          <span className="text-[11px] text-[#a16207] font-semibold">
            Limit: ${settings?.globalMonthlySpendingLimitUsd ?? 150}
          </span>
        </div>

        <div className="bg-[#eef7f0] border border-[#d2edd7] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Success Rate</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-[#15803d] tracking-tight my-1">
            {totalRequests > 0 ? `${successRate}%` : '—'}
          </div>
          <span className="text-[11px] text-[#166534] font-semibold">
            {totalRequests > 0 ? `${successfulRequests}/${totalRequests} succeeded` : 'Awaiting traffic'}
          </span>
        </div>

        <div className="bg-[#eef6fc] border border-[#d4e8f7] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-1 text-stone-600 mb-1">
            <span className="text-[11px] font-semibold text-stone-700 whitespace-nowrap">Avg Latency</span>
            <Clock className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            {averageLatency} <span className="text-xs text-stone-500 font-medium">ms</span>
          </div>
          <span className="text-[11px] text-[#0369a1] font-semibold">Measured RTT</span>
        </div>
      </div>

      {/* Active Routing Banner & Developer Actions Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#dcf0e2] text-[#1a5330] border border-[#c1e5cb] rounded-full">
                  CURRENT ROUTING MODE: {(settings?.defaultRoutingMode || 'auto').toUpperCase()}
                </span>
                <span className="text-xs text-stone-500 font-medium">Active Gateway Policy</span>
              </div>
              <button
                onClick={() => onNavigate('routing')}
                className="text-xs text-[#205e3b] hover:text-[#133d26] font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                Configure Routing →
              </button>
            </div>

            {activeCombo ? (
              <>
                <h3 className="font-editorial text-2xl md:text-3xl font-medium text-stone-900 tracking-tight">
                  {activeCombo.name}
                </h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-2xl font-normal">
                  {activeCombo.description || `Multi-provider ${activeCombo.strategy} routing pipeline.`}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  {activeCombo.steps.map((step, idx) => {
                    const prov = providers.find((p) => p.id === step.providerId);
                    const mod = models.find((m) => m.id === step.modelId);
                    return (
                      <React.Fragment key={`${step.providerId}-${step.modelId}-${idx}`}>
                        {idx > 0 && <span className="text-stone-400 font-semibold text-xs">→</span>}
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-[#ecf7ef] border border-[#cbe8d2] rounded-xl text-xs shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                          <span className="font-semibold text-stone-800">{prov?.name || step.providerId}</span>
                          <span className="text-stone-500 text-[11px]">({mod?.displayName || step.modelId})</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-editorial text-2xl md:text-3xl font-medium text-stone-900 tracking-tight">
                  {activeProviders.length > 0 ? 'Direct & Heuristic Gateway Routing' : 'Ready for Provider Configuration'}
                </h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-2xl font-normal">
                  {activeProviders.length > 0
                    ? 'Incoming Anthropic (/v1/messages) and OpenAI (/v1/chat/completions) traffic routes dynamically across your active providers. Build a Combo pipeline to enable multi-provider failover.'
                    : 'Connect your first AI provider (Google Gemini, Anthropic, OpenAI, DeepSeek, Groq, or OpenRouter) to start routing live requests and building failover combos.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button
                    onClick={() => onNavigate('providers')}
                    className="px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    + Add AI Provider
                  </button>
                  {activeProviders.length >= 1 && (
                    <button
                      onClick={() => onNavigate('combos')}
                      className="px-4 py-2 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Build Failover Combo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-[#f0eae1] flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
            <div>
              <span>Messages Endpoint: </span>
              <code className="bg-[#f4efe8] text-stone-800 font-mono font-semibold px-2 py-0.5 rounded-md">/v1/messages</code>
            </div>
            <div>
              <span>Max Retry Attempts: </span>
              <strong className="text-stone-800 font-semibold">{activeCombo?.retryRules?.maxAttempts ?? settings?.maxRetries ?? 3}</strong>
            </div>
          </div>
        </div>

        {/* Developer Actions Card */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h4 className="text-sm font-bold text-stone-900 mb-1">Developer Actions</h4>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Run diagnostics, verify client compatibility, or issue gateway keys.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('request')}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#143a24]" />
                  <span>Make a Request (cURL & SDKs)</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#143a24]" />
              </button>

              <button
                onClick={() => onNavigate('playground')}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#dbeef0] hover:bg-[#c9e4e6] text-[#134448] rounded-2xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#134448]" />
                  <span>Open Interactive API Sandbox</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#134448]" />
              </button>

              <button
                onClick={() => onNavigate('providers')}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#faedd0] hover:bg-[#f6e4bd] text-[#714a09] rounded-2xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#714a09]" />
                  <span>Add New AI Provider</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#714a09]" />
              </button>
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-[#f0eae1] text-xs text-stone-500 flex items-center justify-between">
            <span>Active Gateway Key:</span>
            {activeKey ? (
              <code className="text-[#a16207] font-mono font-semibold">{activeKey.keyPrefix}</code>
            ) : (
              <button
                onClick={() => onNavigate('keys')}
                className="text-[#205e3b] hover:underline font-semibold cursor-pointer"
              >
                Generate Key →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Provider Fleet Health & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#16a34a]" />
              Connected Provider Fleet
            </h4>
            <button
              onClick={() => onNavigate('providers')}
              className="text-xs text-[#205e3b] hover:text-[#133d26] font-semibold cursor-pointer"
            >
              Manage →
            </button>
          </div>

          {providers.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-[#e4ded5] bg-[#faf8f5] text-center space-y-2">
              <p className="text-xs font-semibold text-stone-700">No AI providers connected yet</p>
              <p className="text-[11px] text-stone-500">
                Add OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, or custom endpoints to activate routing.
              </p>
              <button
                onClick={() => onNavigate('providers')}
                className="mt-1 px-3.5 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Configure Provider
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {providers.slice(0, 6).map((p) => {
                const isHealthy = p.health.status === 'healthy';
                const isUnknown = p.health.status === 'unknown';
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-[#efe9df] bg-[#faf8f5]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isHealthy ? 'bg-[#16a34a]' : isUnknown ? 'bg-stone-400' : 'bg-[#eab308]'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-semibold text-stone-800">{p.name}</p>
                        <p className="text-[10px] text-stone-500 font-mono">
                          {p.health.latencyMs !== undefined ? `${p.health.latencyMs}ms ping` : 'Not pinged yet'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#e5dfd5] text-stone-700">
                      {p.enabled ? (p.hasApiKey || p.type === 'custom' ? 'Active' : 'Needs Key') : 'Disabled'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0284c7]" />
              Recent Gateway Requests & Fallback Logs
            </h4>
            <button
              onClick={() => onNavigate('logs')}
              className="text-xs text-[#205e3b] hover:text-[#133d26] font-semibold cursor-pointer"
            >
              View Full Logs →
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-[#e4ded5] bg-[#faf8f5] text-center space-y-2">
              <p className="text-xs font-semibold text-stone-700">No gateway requests recorded yet</p>
              <p className="text-[11px] text-stone-500">
                Real-time telemetry traces from cURL, SDK clients, and the API Playground appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 4).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-2xl border border-[#efe9df] bg-[#faf8f5] text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md border ${
                        log.status === 'error'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {log.statusCode || 200}
                    </span>
                    <div>
                      <span className="font-semibold text-stone-800">{log.resolvedModel || log.requestedModel}</span>
                      <span className="text-stone-500 text-[11px] ml-1.5 font-mono">({log.selectedProvider})</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-stone-700 font-semibold">{log.latencyMs}ms</span>
                    <span className="text-[10px] text-stone-400 block font-mono">
                      {(log.inputTokens || 0) + (log.outputTokens || 0)} tokens
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
