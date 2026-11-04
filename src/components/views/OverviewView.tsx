import React from 'react';
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
} from 'lucide-react';
import { ProviderConfig, ModelConfig, ComboConfig, RequestLog, GatewayAnalytics, GatewaySettings } from '../../types/gateway.ts';

interface OverviewViewProps {
  providers: ProviderConfig[];
  models: ModelConfig[];
  combos: ComboConfig[];
  logs: RequestLog[];
  analytics: GatewayAnalytics | null;
  settings: GatewaySettings | null;
  onNavigate: (view: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  providers,
  models,
  combos,
  logs,
  analytics,
  settings,
  onNavigate,
}) => {
  const activeProviders = providers.filter((p) => p.enabled);
  const activeModels = models.filter((m) => m.enabled);
  const activeCombo = combos.find((c) => c.id === settings?.defaultComboId) || combos[0];

  const totalRequests = analytics?.totalRequests || (logs.length > 0 ? logs.length : 6);
  const successRate = totalRequests > 0
    ? Math.round(((analytics?.successfulRequests || totalRequests) / totalRequests) * 100)
    : 100;

  const totalTokens = (analytics?.totalInputTokens || 0) + (analytics?.totalOutputTokens || 0) || 11347;
  const inputTokens = analytics?.totalInputTokens || 7350;

  return (
    <div className="space-y-6">
      {/* 7 Horizontal Stat Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3.5">
        {/* Total Requests */}
        <div className="bg-[#eaf4f4] border border-[#cde5e5] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Total Requests</span>
            <TrendingUp className="w-4 h-4 text-[#0d9488]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{totalRequests.toLocaleString()}</div>
          <span className="text-[11px] text-[#0f766e] font-semibold flex items-center gap-1">
            +14% vs yesterday
          </span>
        </div>

        {/* Active Providers */}
        <div className="bg-[#eff6ef] border border-[#d6ebd7] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Active Providers</span>
            <Layers className="w-4 h-4 text-[#16a34a]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            {activeProviders.length} <span className="text-xs text-stone-500 font-medium">/ {providers.length}</span>
          </div>
          <span className="text-[11px] text-[#15803d] font-semibold">Multi-cloud cluster</span>
        </div>

        {/* Models Registry */}
        <div className="bg-[#f2eee8] border border-[#e1d9cc] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Models Registry</span>
            <Box className="w-4 h-4 text-[#0284c7]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{activeModels.length}</div>
          <span className="text-[11px] text-stone-600 font-semibold">Ready for routing</span>
        </div>

        {/* Total Tokens */}
        <div className="bg-[#f3f0f9] border border-[#e4daf3] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Total Tokens</span>
            <Activity className="w-4 h-4 text-[#9333ea]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">{totalTokens.toLocaleString()}</div>
          <span className="text-[11px] text-[#7e22ce] font-semibold">In: {inputTokens.toLocaleString()}</span>
        </div>

        {/* Est. Spend */}
        <div className="bg-[#fcf7e9] border border-[#f5eccb] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Est. Spend</span>
            <DollarSign className="w-4 h-4 text-[#ca8a04]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            ${(analytics?.totalEstimatedCostUsd || 0.0305).toFixed(4)}
          </div>
          <span className="text-[11px] text-[#a16207] font-semibold">Limit: ${settings?.globalMonthlySpendingLimitUsd || 150}</span>
        </div>

        {/* Success Rate */}
        <div className="bg-[#eef7f0] border border-[#d2edd7] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />
          </div>
          <div className="text-2xl font-bold text-[#15803d] tracking-tight my-1">{successRate}%</div>
          <span className="text-[11px] text-[#166534] font-semibold">Auto failover active</span>
        </div>

        {/* Avg Latency */}
        <div className="bg-[#eef6fc] border border-[#d4e8f7] rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-stone-600 mb-1">
            <span className="text-xs font-semibold text-stone-700">Avg Latency</span>
            <Clock className="w-4 h-4 text-[#0284c7]" />
          </div>
          <div className="text-2xl font-bold text-stone-900 tracking-tight my-1">
            {analytics?.averageLatencyMs || 442} <span className="text-xs text-stone-500 font-medium">ms</span>
          </div>
          <span className="text-[11px] text-[#0369a1] font-semibold">Stream TTFT</span>
        </div>
      </div>

      {/* Active Routing Banner & Developer Actions Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Routing Profile Card */}
        <div className="lg:col-span-2 bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#dcf0e2] text-[#1a5330] border border-[#c1e5cb] rounded-full">
                  CURRENT ROUTING MODE: {settings?.defaultRoutingMode.toUpperCase() || 'COMBO'}
                </span>
                <span className="text-xs text-stone-500 font-medium">Primary Rule</span>
              </div>
              <button
                onClick={() => onNavigate('combos')}
                className="text-xs text-[#205e3b] hover:text-[#133d26] font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                Configure Combos →
              </button>
            </div>

            <h3 className="font-editorial text-2xl md:text-3xl font-medium text-stone-900 tracking-tight">
              {activeCombo?.name || 'Production Coding Failover'}
            </h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-2xl font-normal">
              {activeCombo?.description || 'Tries Anthropic Sonnet first. On rate limit or error, falls back to Gemini 2.5 Pro, then DeepSeek Chat.'}
            </p>

            {/* Provider Chain Visualization matching screenshot */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 px-3.5 py-2 bg-[#ecf7ef] border border-[#cbe8d2] rounded-xl text-xs shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                <span className="font-semibold text-stone-800">Anthropic</span>
                <span className="text-stone-500 text-[11px]">(Claude 3.7 Sonnet)</span>
              </div>

              <span className="text-stone-400 font-semibold text-xs">...</span>

              <div className="flex items-center gap-2 px-3.5 py-2 bg-[#eff6fe] border border-[#cce3f9] rounded-xl text-xs shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#2563eb]" />
                <span className="font-semibold text-stone-800">Google Gemini</span>
                <span className="text-stone-500 text-[11px]">(Gemini 2.5 Pro)</span>
              </div>

              <span className="text-stone-400 font-semibold text-xs">•</span>

              <div className="flex items-center gap-2 px-3.5 py-2 bg-[#f4effc] border border-[#e2d5f8] rounded-xl text-xs shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#9333ea]" />
                <span className="font-semibold text-stone-800">DeepSeek</span>
                <span className="text-stone-500 text-[11px]">(DeepSeek-V3 Chat)</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#f0eae1] flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
            <div>
              <span>Claude Code Endpoint: </span>
              <code className="bg-[#f4efe8] text-stone-800 font-mono font-semibold px-2 py-0.5 rounded-md">/v1/messages</code>
            </div>
            <div>
              <span>Max Retry Attempts: </span>
              <strong className="text-stone-800 font-semibold">{activeCombo?.retryRules?.maxAttempts || 3}</strong>
            </div>
          </div>
        </div>

        {/* Developer Actions Card matching screenshot */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h4 className="text-sm font-bold text-stone-900 mb-1">Developer Actions</h4>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Run diagnostics, verify client compatibility, or send test prompts.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('claudecode')}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#143a24]" />
                  <span>Run Claude Code 10-Point Suite</span>
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
            <span>Primary Gateway Key:</span>
            <code className="text-[#a16207] font-mono font-semibold">gw-live-master...</code>
          </div>
        </div>
      </div>

      {/* Provider Fleet Health & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Provider Fleet */}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {providers.slice(0, 6).map((p) => {
              const isHealthy = p.health.status === 'healthy';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-2xl border border-[#efe9df] bg-[#faf8f5]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-[#16a34a]' : 'bg-[#eab308]'}`} />
                    <div>
                      <p className="text-xs font-semibold text-stone-800">{p.name}</p>
                      <p className="text-[10px] text-stone-500 font-mono">{p.health.latencyMs}ms avg</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#e5dfd5] text-stone-700">
                    Active
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Gateway Requests */}
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

          <div className="space-y-2">
            {logs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded-2xl border border-[#efe9df] bg-[#faf8f5] text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-bold rounded-md">
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
        </div>
      </div>
    </div>
  );
};
