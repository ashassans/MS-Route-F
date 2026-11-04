import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  TrendingUp,
  Activity,
} from 'lucide-react';
import type { GatewayAnalytics } from '../../types/gateway.ts';

interface AnalyticsViewProps {
  analytics: GatewayAnalytics | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics }) => {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');
  const [rangeAnalytics, setRangeAnalytics] = useState<GatewayAnalytics | null>(analytics);

  useEffect(() => {
    if (timeRange === '7d' && analytics) {
      setRangeAnalytics(analytics);
    }
  }, [analytics, timeRange]);

  useEffect(() => {
    let cancelled = false;
    const loadRange = async () => {
      try {
        const res = await fetch(`/api/analytics?range=${timeRange}`);
        if (res.ok && !cancelled) {
          setRangeAnalytics(await res.json());
        }
      } catch {
        // Keep current analytics snapshot on transient error
      }
    };
    loadRange();
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const data = rangeAnalytics ?? analytics;
  const timeline = data?.timeline || [];

  const totalRequests = data?.totalRequests ?? 0;
  const successfulRequests = data?.successfulRequests ?? 0;
  const totalInputTokens = data?.totalInputTokens ?? 0;
  const totalOutputTokens = data?.totalOutputTokens ?? 0;
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalEstimatedCostUsd = data?.totalEstimatedCostUsd ?? 0;
  const averageLatencyMs = data?.averageLatencyMs ?? 0;

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
    a.download = `msroute-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderSvgBarChart = (
    items: typeof timeline,
    valueKey: 'requests' | 'tokens',
    maxVal: number,
    barFill: string
  ) => {
    const count = Math.max(items.length, 1);
    const svgWidth = 560;
    const svgHeight = 190;
    const chartTop = 22;
    const chartBottom = 158;
    const maxBarHeight = chartBottom - chartTop;
    const slotWidth = svgWidth / count;
    const barWidth = Math.min(36, Math.max(6, slotWidth * 0.58));
    const labelStep = count > 10 ? 5 : 1;

    return (
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-52 select-none">
        <line x1={0} y1={chartBottom} x2={svgWidth} y2={chartBottom} stroke="#ebe5dc" strokeWidth={1.5} />
        {items.map((item, idx) => {
          const val = item[valueKey];
          const barHeight = val > 0 ? Math.max(8, Math.round((val / maxVal) * maxBarHeight)) : 2;
          const x = idx * slotWidth + (slotWidth - barWidth) / 2;
          const y = chartBottom - barHeight;
          const centerX = idx * slotWidth + slotWidth / 2;
          const showDateLabel = idx % labelStep === 0 || idx === count - 1;

          return (
            <g key={item.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={val > 0 ? barFill : '#e7e2d8'}
              />
              {val > 0 && count <= 10 && (
                <text
                  x={centerX}
                  y={Math.max(14, y - 5)}
                  textAnchor="middle"
                  fill="#57534e"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {val}
                </text>
              )}
              {showDateLabel && (
                <text
                  x={centerX}
                  y={178}
                  textAnchor="middle"
                  fill="#78716c"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {item.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
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
            Real-time aggregated token throughput, request volume, and model expenditure telemetry.
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
            disabled={timeline.length === 0}
            className="px-3.5 py-1.5 bg-white hover:bg-[#faf8f5] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
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
          <div className="text-2xl font-bold text-stone-900">{totalRequests.toLocaleString()}</div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            {successfulRequests.toLocaleString()} successful
          </span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Token Volume</span>
          <div className="text-2xl font-bold text-stone-900">{totalTokens.toLocaleString()}</div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            {totalInputTokens.toLocaleString()} in / {totalOutputTokens.toLocaleString()} out
          </span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Estimated Spend</span>
          <div className="text-2xl font-bold text-[#a16207]">${totalEstimatedCostUsd.toFixed(4)}</div>
          <span className="text-[11px] text-stone-500 mt-1 block">Calculated from model pricing</span>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
          <span className="text-stone-500 text-xs block mb-1 font-medium">Average Latency</span>
          <div className="text-2xl font-bold text-[#0284c7]">{averageLatencyMs} ms</div>
          <span className="text-[11px] text-stone-500 mt-1 block">Measured gateway RTT</span>
        </div>
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#16a34a]" />
              Daily Request Volume
            </h3>
            <span className="text-xs text-stone-500 font-mono">Requests / Day</span>
          </div>
          {renderSvgBarChart(timeline, 'requests', maxReq, '#b9dbc3')}
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#7c3aed]" />
              Daily Token Volume
            </h3>
            <span className="text-xs text-stone-500 font-mono">Tokens (In + Out)</span>
          </div>
          {renderSvgBarChart(timeline, 'tokens', maxTokens, '#ddd6fe')}
        </div>
      </div>
    </div>
  );
};
