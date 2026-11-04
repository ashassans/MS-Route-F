import React, { useState } from 'react';
import {
  GitBranch,
  CheckCircle2,
  Zap,
  Code2,
  BrainCircuit,
  Eye,
  Layers,
  Save,
} from 'lucide-react';
import { RoutingRule, RoutingMode, GatewaySettings, ModelConfig, ComboConfig } from '../../types/gateway.ts';

interface RoutingViewProps {
  rules: RoutingRule[];
  settings: GatewaySettings | null;
  models: ModelConfig[];
  combos: ComboConfig[];
  onRefresh: () => void;
}

export const RoutingView: React.FC<RoutingViewProps> = ({
  rules,
  settings,
  models,
  combos,
  onRefresh,
}) => {
  const [currentMode, setCurrentMode] = useState<RoutingMode>(settings?.defaultRoutingMode || 'combo');
  const [defaultModelId, setDefaultModelId] = useState(settings?.defaultModelId || models[0]?.id || '');
  const [defaultComboId, setDefaultComboId] = useState(settings?.defaultComboId || combos[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveMode = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultRoutingMode: currentMode,
          defaultModelId,
          defaultComboId,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'coding':
        return <Code2 className="w-4 h-4 text-emerald-600" />;
      case 'fast':
        return <Zap className="w-4 h-4 text-amber-600" />;
      case 'reasoning':
        return <BrainCircuit className="w-4 h-4 text-purple-600" />;
      case 'vision':
        return <Eye className="w-4 h-4 text-blue-600" />;
      default:
        return <Layers className="w-4 h-4 text-stone-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection Cards */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
        <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2 mb-2">
          <GitBranch className="w-5 h-5 text-[#1c4d32]" />
          Routing Engine Strategy
        </h2>
        <p className="text-xs text-stone-600 mb-5">
          Select how the gateway determines downstream AI providers and models for incoming requests.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. Combo Routing */}
          <div
            onClick={() => setCurrentMode('combo')}
            className={`border rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between ${
              currentMode === 'combo'
                ? 'bg-[#ecf7ef] border-[#205e3b] shadow-xs'
                : 'bg-[#faf8f5] border-[#e8e2d8] hover:border-[#d6cebf]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1c4d32]">Strategy A</span>
                {currentMode === 'combo' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
              <h3 className="font-bold text-sm text-stone-900">Combo Routing (Recommended)</h3>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Dispatches requests through a failover combo pipeline (Anthropic → Gemini → DeepSeek).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#d8e8dd] text-xs text-stone-600">
              Active:{' '}
              <span className="font-semibold text-stone-900 font-mono">
                {combos.find((c) => c.id === defaultComboId)?.name || 'Production Failover'}
              </span>
            </div>
          </div>

          {/* 2. Auto Routing */}
          <div
            onClick={() => setCurrentMode('auto')}
            className={`border rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between ${
              currentMode === 'auto'
                ? 'bg-[#ecf7ef] border-[#205e3b] shadow-xs'
                : 'bg-[#faf8f5] border-[#e8e2d8] hover:border-[#d6cebf]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1c4d32]">Strategy B</span>
                {currentMode === 'auto' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
              <h3 className="font-bold text-sm text-stone-900">Auto Task-Based Routing</h3>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Inspects prompt characteristics and tool requirements to dynamically route requests.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#d8e8dd] text-xs text-stone-600">
              Active: <span className="font-semibold text-stone-900">{rules.length} Rules</span>
            </div>
          </div>

          {/* 3. Manual Routing */}
          <div
            onClick={() => setCurrentMode('manual')}
            className={`border rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between ${
              currentMode === 'manual'
                ? 'bg-[#ecf7ef] border-[#205e3b] shadow-xs'
                : 'bg-[#faf8f5] border-[#e8e2d8] hover:border-[#d6cebf]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1c4d32]">Strategy C</span>
                {currentMode === 'manual' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
              <h3 className="font-bold text-sm text-stone-900">Direct Manual Routing</h3>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Passes through directly to the requested model without automatic tiering.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#d8e8dd] text-xs text-stone-600">
              Default:{' '}
              <span className="font-semibold text-stone-900 font-mono">
                {models.find((m) => m.id === defaultModelId)?.displayName || 'Claude 3.7 Sonnet'}
              </span>
            </div>
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-5 border-t border-[#f0eae1] text-xs">
          <div>
            <label className="block text-stone-600 mb-1 font-semibold">Default Failover Combo</label>
            <select
              value={defaultComboId}
              onChange={(e) => setDefaultComboId(e.target.value)}
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
            >
              {combos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.strategy})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-stone-600 mb-1 font-semibold">Default Fallback Model</label>
            <select
              value={defaultModelId}
              onChange={(e) => setDefaultModelId(e.target.value)}
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#f0eae1]">
          <span className="text-xs text-stone-500">
            {saveSuccess ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Strategy applied successfully!
              </span>
            ) : (
              'Changes take effect instantly for all incoming client API traffic.'
            )}
          </span>
          <button
            onClick={handleSaveMode}
            disabled={saving}
            className="px-5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Apply Strategy'}</span>
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-[#f0eae1]">
          <h3 className="font-bold text-sm text-stone-900">Configured Task Routing Rules ({rules.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0eae1] bg-[#faf8f5] text-stone-600 font-semibold">
                <th className="p-4">Task Category</th>
                <th className="p-4">Rule Name</th>
                <th className="p-4">Target Model</th>
                <th className="p-4">Priority</th>
                <th className="p-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e8]">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-[#faf8f5] transition">
                  <td className="p-4 font-medium flex items-center gap-2">
                    {getTaskIcon(r.taskType)}
                    <span className="capitalize text-stone-800">{r.taskType}</span>
                  </td>
                  <td className="p-4 font-semibold text-stone-900">{r.name}</td>
                  <td className="p-4 font-mono text-[#a16207] font-semibold">{r.targetModelId}</td>
                  <td className="p-4 text-stone-600">Level {r.priority}</td>
                  <td className="p-4 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#e2f1e6] text-[#1e5c36]">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
