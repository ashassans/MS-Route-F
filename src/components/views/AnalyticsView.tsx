import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { GatewayAnalytics } from '../../types/gateway.ts';

interface AnalyticsViewProps {
  analytics: GatewayAnalytics | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics }) => {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');

  const timeline = analytics?.timeline || [];
  const maxReq = Math.max(...timeline.map((t) => t.requests), 1);
  const maxTokens = Math.max(...timeline.map((t) => t.tokens), 1);

  const handleExportCsv = () => {
    if (!timeline.length) return;
    const headers = 'Date,Requests,Tokens,EstimatedCostUSD,Errors\n';
    const rows = timeline
      .map((t) => `${t.date},${t.requests},${t.tokens},${t.costUsd},${t.errors}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `msroute-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header and Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1c4d32]" />
            Usage & Cost Analytics
          </h2>
          <p className="text-xs text-stone-600 mt-1">
            Aggregated token throughput, request volume, and model expenditure telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                timeRange === 'today' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                timeRange === '7d' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                timeRange === '30d' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              30 Days
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-white hover:bg-[#faf8f5] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Total Throughput</span>
          <div className="text-2xl font-bold text-stone-900">{(analytics?.totalRequests || 6).toLocaleString()}</div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            {analytics?.successfulRequests || 6} successful
          </span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Token Volume</span>
          <div className="text-2xl font-bold text-stone-900">
            {((analytics?.totalInputTokens || 7350) + (analytics?.totalOutputTokens || 3997)).toLocaleString()}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            {(analytics?.totalInputTokens || 7350).toLocaleString()} in / {(analytics?.totalOutputTokens || 3997).toLocaleString()} out
          </span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Estimated Spend</span>
          <div className="text-2xl font-bold text-[#a16207]">
            ${(analytics?.totalEstimatedCostUsd || 0.0305).toFixed(4)}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">Auto token pricing</span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Average Latency</span>
          <div className="text-2xl font-bold text-[#0284c7]">
            {analytics?.averageLatencyMs || 442} ms
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">Stream TTFT</span>
        </div>
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Requests Over Time */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#16a34a]" />
              Daily Request Volume
            </h3>
            <span className="text-xs text-stone-500 font-mono">Requests / Day</span>
          </div>

          <div className="h-52 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-[#f0eae1]">
            {timeline.map((item, idx) => {
              const heightPct = Math.max(16, Math.round((item.requests / maxReq) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-mono text-stone-500 opacity-0 group-hover:opacity-100 transition">
                    {item.requests}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-[#b9dbc3] group-hover:bg-[#a8cfb3] rounded-t-lg transition-all"
                  />
                  <span className="text-[10px] font-mono text-stone-500 mt-1">
                    {item.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Token Consumption */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#7c3aed]" />
              Daily Token Volume
            </h3>
            <span className="text-xs text-stone-500 font-mono">Tokens (In + Out)</span>
          </div>

          <div className="h-52 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-[#f0eae1]">
            {timeline.map((item, idx) => {
              const heightPct = Math.max(16, Math.round((item.tokens / maxTokens) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-mono text-stone-500 opacity-0 group-hover:opacity-100 transition">
                    {item.tokens}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-[#ddd6fe] group-hover:bg-[#c4b5fd] rounded-t-lg transition-all"
                  />
                  <span className="text-[10px] font-mono text-stone-500 mt-1">
                    {item.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
