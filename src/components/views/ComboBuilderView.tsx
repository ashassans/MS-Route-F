import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  Play,
  ArrowRight,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowDown,
} from 'lucide-react';
import { ComboConfig, ComboStrategy, ProviderConfig, ModelConfig } from '../../types/gateway.ts';

interface ComboBuilderViewProps {
  combos: ComboConfig[];
  providers: ProviderConfig[];
  models: ModelConfig[];
  onRefresh: () => void;
}

export const ComboBuilderView: React.FC<ComboBuilderViewProps> = ({
  combos,
  providers,
  models,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    strategy: 'sequential' as ComboStrategy,
    timeoutMs: 45000,
    retryAttempts: 3,
    steps: [
      { providerId: providers[0]?.id || '', modelId: models[0]?.id || '', weight: 50, priority: 1 },
      { providerId: providers[1]?.id || '', modelId: models[1]?.id || '', weight: 50, priority: 2 },
    ],
  });

  const handleOpenAdd = () => {
    setEditingCombo(null);
    setFormData({
      id: `combo-${Date.now().toString().slice(-4)}`,
      name: '',
      description: '',
      strategy: 'sequential',
      timeoutMs: 40000,
      retryAttempts: 3,
      steps: [
        { providerId: providers[0]?.id || 'anthropic', modelId: 'claude-3-5-sonnet-20241022', weight: 50, priority: 1 },
        { providerId: providers[1]?.id || 'gemini', modelId: 'gemini-2.5-pro', weight: 50, priority: 2 },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (combo: ComboConfig) => {
    setEditingCombo(combo);
    setFormData({
      id: combo.id,
      name: combo.name,
      description: combo.description || '',
      strategy: combo.strategy,
      timeoutMs: combo.timeoutMs,
      retryAttempts: combo.retryRules?.maxAttempts || 3,
      steps: combo.steps,
    });
    setIsModalOpen(true);
  };

  const handleAddStep = () => {
    setFormData({
      ...formData,
      steps: [
        ...formData.steps,
        {
          providerId: providers[0]?.id || '',
          modelId: models[0]?.id || '',
          weight: 20,
          priority: formData.steps.length + 1,
        },
      ],
    });
  };

  const handleRemoveStep = (idx: number) => {
    if (formData.steps.length <= 1) return;
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== idx),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.steps.length === 0) return;

    const payload = {
      id: formData.id,
      name: formData.name,
      description: formData.description,
      strategy: formData.strategy,
      timeoutMs: Number(formData.timeoutMs),
      primaryProviderId: formData.steps[0]?.providerId,
      retryRules: {
        maxAttempts: Number(formData.retryAttempts),
        backoffMs: 500,
        retryOnRateLimit: true,
        retryOnTimeout: true,
        retryOnServerError: true,
      },
      steps: formData.steps,
      enabled: true,
    };

    try {
      const url = editingCombo ? `/api/combos/${editingCombo.id}` : '/api/combos';
      const method = editingCombo ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save combo');
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete combo "${name}"?`)) return;
    try {
      await fetch(`/api/combos/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTestCombo = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/combos/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ id, ...data });
    } catch (err: any) {
      setTestResult({ id, success: false, error: err.message });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[#1c4d32]" />
            Combo Routing Builder
          </h2>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Combine multiple providers into resilient routing pipelines with sequential failover or parallel racing.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Build New Combo</span>
        </button>
      </div>

      {/* Combos Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {combos.map((combo) => {
          const isTesting = testingId === combo.id;
          const result = testResult?.id === combo.id ? testResult : null;

          return (
            <div
              key={combo.id}
              className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-bold text-sm text-stone-900">{combo.name}</h3>
                    <p className="text-[11px] text-stone-500 font-mono mt-0.5">{combo.id}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd]">
                    {combo.strategy}
                  </span>
                </div>

                <p className="text-xs text-stone-600 mt-1 mb-3.5 leading-relaxed min-h-[36px]">
                  {combo.description}
                </p>

                {/* Pipeline visual chain */}
                <div className="bg-[#faf8f5] border border-[#e8e2d8] rounded-2xl p-3.5 space-y-2 mb-4">
                  <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider block">
                    Execution Pipeline ({combo.steps.length} Steps)
                  </span>
                  <div className="space-y-1.5">
                    {combo.steps.map((step, idx) => {
                      const prov = providers.find((p) => p.id === step.providerId);
                      const model = models.find((m) => m.id === step.modelId);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full bg-white border border-[#e5dfd5] flex items-center justify-center font-bold text-[10px] text-stone-700 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-stone-800">{prov?.name || step.providerId}</span>
                          <span className="text-stone-500 font-mono text-[11px]">({model?.displayName || step.modelId})</span>
                          {combo.strategy === 'weighted' && (
                            <span className="ml-auto text-stone-500 font-mono text-[10px]">{step.weight}%</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Test Result Callout */}
                {result && (
                  <div className={`p-2.5 rounded-xl text-xs mb-3 flex items-center gap-2 ${
                    result.success
                      ? 'bg-[#ecf7ef] border border-[#cbe8d2] text-[#166534]'
                      : 'bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]'
                  }`}>
                    {result.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                    <span className="font-semibold">{result.success ? `Verified! Latency: ${result.latencyMs}ms (${result.stepSelected})` : result.error}</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-3.5 border-t border-[#f0eae1] flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestCombo(combo.id)}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Verifying...' : 'Test Combo'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(combo)}
                    className="p-2 text-stone-500 hover:text-stone-900 bg-[#faf8f5] hover:bg-[#f2ede4] border border-[#e4ded5] rounded-xl transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(combo.id, combo.name)}
                    className="p-2 text-stone-500 hover:text-rose-700 bg-[#faf8f5] hover:bg-rose-50 border border-[#e4ded5] rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#e8e2d8] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
              <h3 className="font-editorial text-xl font-medium text-stone-900">
                {editingCombo ? `Edit ${editingCombo.name}` : 'Build New Combo'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Combo Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Production Coding Failover"
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Strategy *</label>
                  <select
                    value={formData.strategy}
                    onChange={(e) => setFormData({ ...formData, strategy: e.target.value as ComboStrategy })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b] font-semibold"
                  >
                    <option value="sequential">Sequential Failover (A → B → C)</option>
                    <option value="parallel">Parallel Race (Fastest Response)</option>
                    <option value="weighted">Weighted Load Balancing (%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Tries Anthropic first; on 429 rate limit or error, fails over to Gemini 2.5 Pro"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              {/* Steps List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-stone-800 font-bold block">
                    Providers in Combo Chain ({formData.steps.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="text-xs text-[#205e3b] hover:text-[#133d26] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {formData.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#faf8f5] border border-[#e4ded5] rounded-2xl flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-white border border-[#e0dad0] flex items-center justify-center font-bold text-xs text-stone-700 shrink-0">
                        {idx + 1}
                      </span>

                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <div>
                          <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">Provider</label>
                          <select
                            value={step.providerId}
                            onChange={(e) => {
                              const updated = [...formData.steps];
                              updated[idx].providerId = e.target.value;
                              const pModels = models.filter((m) => m.providerId === e.target.value);
                              if (pModels.length > 0) updated[idx].modelId = pModels[0].id;
                              setFormData({ ...formData, steps: updated });
                            }}
                            className="w-full bg-white border border-[#e4ded5] rounded-lg px-2 py-1.5 text-stone-800"
                          >
                            {providers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">Model</label>
                          <select
                            value={step.modelId}
                            onChange={(e) => {
                              const updated = [...formData.steps];
                              updated[idx].modelId = e.target.value;
                              setFormData({ ...formData, steps: updated });
                            }}
                            className="w-full bg-white border border-[#e4ded5] rounded-lg px-2 py-1.5 text-stone-800 font-mono text-[11px]"
                          >
                            {models
                              .filter((m) => m.providerId === step.providerId)
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.displayName}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {formData.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-bold transition cursor-pointer shadow-xs"
                >
                  Save Combo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
