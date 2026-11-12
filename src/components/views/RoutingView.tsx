import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  GitBranch,
  CheckCircle2,
  Zap,
  Code2,
  BrainCircuit,
  Eye,
  Layers,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';
import type { RoutingRule, RoutingMode, GatewaySettings, ModelConfig, ComboConfig } from '../../types/gateway.ts';

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
  const [currentMode, setCurrentMode] = useState<RoutingMode>(settings?.defaultRoutingMode || 'auto');
  const [defaultModelId, setDefaultModelId] = useState(settings?.defaultModelId || models[0]?.id || '');
  const [defaultComboId, setDefaultComboId] = useState(settings?.defaultComboId || combos[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    taskType: 'coding' as RoutingRule['taskType'],
    targetType: 'model' as 'model' | 'combo',
    targetId: models[0]?.id || '',
    priority: 1,
  });

  useEffect(() => {
    if (settings) {
      setCurrentMode(settings.defaultRoutingMode || 'auto');
      setDefaultModelId(settings.defaultModelId || models[0]?.id || '');
      setDefaultComboId(settings.defaultComboId || combos[0]?.id || '');
    }
  }, [settings, models, combos]);

  const handleSaveMode = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultRoutingMode: currentMode,
          defaultModelId,
          defaultComboId: defaultComboId || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to save routing strategy');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save routing settings');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddRule = () => {
    const defaultType: 'model' | 'combo' = models.length > 0 ? 'model' : 'combo';
    setRuleForm({
      name: '',
      taskType: 'coding',
      targetType: defaultType,
      targetId: defaultType === 'model' ? models[0]?.id || '' : combos[0]?.id || '',
      priority: rules.length + 1,
    });
    setIsRuleModalOpen(true);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name.trim() || !ruleForm.targetId) return;

    const newRule: RoutingRule = {
      id: `rule-${Date.now()}`,
      name: ruleForm.name.trim(),
      taskType: ruleForm.taskType,
      description: `${ruleForm.taskType} task rule`,
      preferredComboId: ruleForm.targetType === 'combo' ? ruleForm.targetId : undefined,
      preferredModelId: ruleForm.targetType === 'model' ? ruleForm.targetId : undefined,
      priority: Number(ruleForm.priority) || 1,
    };

    try {
      const res = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...rules, newRule]),
      });
      if (!res.ok) throw new Error('Failed to save routing rule');
      setIsRuleModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const updated = rules.filter((r) => r.id !== id);
      const res = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error('Failed to remove rule');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
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
      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Mode Selection Cards */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
        <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-[#1c4d32]" />
          Routing Engine
        </h2>

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
                <h3 className="font-bold text-sm text-stone-900">Combo Routing</h3>
                {currentMode === 'combo' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#d8e8dd] text-xs text-stone-600">
              Active:{' '}
              <span className="font-semibold text-stone-900 font-mono">
                {combos.find((c) => c.id === defaultComboId)?.name || 'None'}
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
                <h3 className="font-bold text-sm text-stone-900">Auto Task Routing</h3>
                {currentMode === 'auto' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
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
                <h3 className="font-bold text-sm text-stone-900">Direct Routing</h3>
                {currentMode === 'manual' && <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#d8e8dd] text-xs text-stone-600">
              Default:{' '}
              <span className="font-semibold text-stone-900 font-mono">
                {models.find((m) => m.id === defaultModelId)?.displayName || 'None'}
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
              {combos.length === 0 ? (
                <option value="">No combos created yet</option>
              ) : (
                combos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.strategy})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-stone-600 mb-1 font-semibold">Default Fallback Model</label>
            <select
              value={defaultModelId}
              onChange={(e) => setDefaultModelId(e.target.value)}
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
            >
              {models.length === 0 ? (
                <option value="">No models registered yet</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.id})
                  </option>
                ))
              )}
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
        <div className="p-5 border-b border-[#f0eae1] flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">Configured Task Routing Rules ({rules.length})</h3>
          <button
            onClick={handleOpenAddRule}
            disabled={models.length === 0 && combos.length === 0}
            className="px-3.5 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title={models.length === 0 && combos.length === 0 ? 'Add a model or combo first' : 'Add routing rule'}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0eae1] bg-[#faf8f5] text-stone-600 font-semibold">
                <th className="p-4">Task Category</th>
                <th className="p-4">Rule Name</th>
                <th className="p-4">Target Destination</th>
                <th className="p-4">Priority</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e8]">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-stone-500">
                    No rules
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className="hover:bg-[#faf8f5] transition">
                    <td className="p-4 font-medium flex items-center gap-2">
                      {getTaskIcon(r.taskType)}
                      <span className="capitalize text-stone-800">{r.taskType}</span>
                    </td>
                    <td className="p-4 font-semibold text-stone-900">{r.name}</td>
                    <td className="p-4 font-mono text-[#a16207] font-semibold">
                      {r.preferredComboId || r.preferredModelId || 'Default'}
                    </td>
                    <td className="p-4 text-stone-600">Level {r.priority}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Remove rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Rule Modal */}
      {isRuleModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 flex min-h-screen items-center justify-center">
          <div className="relative w-full max-w-md my-auto bg-white border border-[#e8e2d8] rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#f0eae1] px-5 sm:px-6 py-4 shrink-0 bg-white">
              <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">Create Task Routing Rule</h3>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreateRule} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5 text-xs flex-1">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Name</label>
                  <input
                    type="text"
                    required
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Category</label>
                    <select
                      value={ruleForm.taskType}
                      onChange={(e) => setRuleForm({ ...ruleForm, taskType: e.target.value as RoutingRule['taskType'] })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                    >
                      <option value="coding">Coding & Tools</option>
                      <option value="reasoning">Deep Reasoning</option>
                      <option value="vision">Vision</option>
                      <option value="fast">Fast</option>
                      <option value="default">Default</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Priority</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={ruleForm.priority}
                      onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Type</label>
                    <select
                      value={ruleForm.targetType}
                      onChange={(e) => {
                        const nextType = e.target.value as 'model' | 'combo';
                        const nextId = nextType === 'model' ? models[0]?.id || '' : combos[0]?.id || '';
                        setRuleForm({ ...ruleForm, targetType: nextType, targetId: nextId });
                      }}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                    >
                      <option value="model">Model</option>
                      <option value="combo">Combo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Target</label>
                    <select
                      value={ruleForm.targetId}
                      onChange={(e) => setRuleForm({ ...ruleForm, targetId: e.target.value })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                    >
                      {ruleForm.targetType === 'model'
                        ? models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.displayName}
                            </option>
                          ))
                        : combos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-3.5 border-t border-[#f0eae1] bg-[#faf8f5] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-[#e4ded5] rounded-xl font-medium transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!ruleForm.targetId}
                  className="px-4 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-semibold transition cursor-pointer shadow-xs disabled:opacity-50 text-xs"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
