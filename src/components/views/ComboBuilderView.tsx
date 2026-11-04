import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  Play,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { ComboConfig, ComboStrategy, ProviderConfig, ModelConfig } from '../../types/gateway.ts';

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canBuildCombo = providers.length > 0 && models.length > 0;

  const getDefaultStep = (providerIndex: number, priority: number) => {
    const prov = providers[providerIndex] || providers[0];
    const provModels = prov ? models.filter((m) => m.providerId === prov.id) : [];
    const mod = provModels[0] || models[0];
    return {
      providerId: prov?.id || '',
      modelId: mod?.id || '',
      weight: 50,
      priority,
    };
  };

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    strategy: 'sequential' as ComboStrategy,
    timeoutMs: 40000,
    retryAttempts: 3,
    steps: [{ providerId: '', modelId: '', weight: 100, priority: 1 }],
  });

  const handleOpenAdd = () => {
    if (!canBuildCombo) return;
    setEditingCombo(null);
    setFormError(null);

    const initialSteps =
      providers.length >= 2
        ? [getDefaultStep(0, 1), getDefaultStep(1, 2)]
        : [getDefaultStep(0, 1)];

    setFormData({
      id: `combo-${Date.now().toString().slice(-5)}`,
      name: '',
      description: '',
      strategy: 'sequential',
      timeoutMs: 40000,
      retryAttempts: 3,
      steps: initialSteps,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (combo: ComboConfig) => {
    setEditingCombo(combo);
    setFormError(null);
    setFormData({
      id: combo.id,
      name: combo.name,
      description: combo.description || '',
      strategy: combo.strategy,
      timeoutMs: combo.timeoutMs,
      retryAttempts: combo.retryRules?.maxAttempts || 3,
      steps: combo.steps.map((s, idx) => ({
        providerId: s.providerId,
        modelId: s.modelId,
        weight: s.weight ?? 50,
        priority: s.priority ?? idx + 1,
      })),
    });
    setIsModalOpen(true);
  };

  const handleAddStep = () => {
    const step = getDefaultStep(0, formData.steps.length + 1);
    setFormData({
      ...formData,
      steps: [...formData.steps, step],
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
    setFormError(null);
    if (!formData.name.trim() || formData.steps.length === 0) {
      setFormError('Combo name and at least one step are required.');
      return;
    }

    const hasInvalidStep = formData.steps.some((s) => !s.providerId || !s.modelId);
    if (hasInvalidStep) {
      setFormError('Every step must have a valid Provider and Model selected.');
      return;
    }

    const payload = {
      id: formData.id.trim(),
      name: formData.name.trim(),
      description: formData.description.trim(),
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
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save combo');
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to save combo');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/combos/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
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
            Combine multiple providers into resilient routing pipelines with sequential failover, parallel racing, or weighted load distribution.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          disabled={!canBuildCombo}
          className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
          title={!canBuildCombo ? 'Add at least one provider and model first' : 'Build new combo'}
        >
          <Plus className="w-4 h-4" />
          <span>Build New Combo</span>
        </button>
      </div>

      {/* Empty State or Combos Grid */}
      {combos.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-10 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
            <Boxes className="w-6 h-6" />
          </div>
          <h3 className="font-editorial text-xl font-medium text-stone-900">No Combo Pipelines Created Yet</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            {canBuildCombo
              ? 'Create a multi-step combo to automatically fail over between providers on HTTP 429 rate limits, timeouts, or 5xx errors.'
              : 'Configure at least one AI provider and model in the Providers tab before building a failover combo pipeline.'}
          </p>
          {canBuildCombo && (
            <div className="pt-2">
              <button
                onClick={handleOpenAdd}
                className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Build Your First Combo</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {combos.map((combo) => {
            const isTesting = testingId === combo.id;
            const result = testResult?.id === combo.id ? testResult : null;
            const isConfirming = confirmDeleteId === combo.id;

            return (
              <div
                key={combo.id}
                className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]"
              >
                <div>
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
                    {combo.description || 'Multi-step routing pipeline'}
                  </p>

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
                            <span className="text-stone-500 font-mono text-[11px] truncate">
                              ({model?.displayName || step.modelId})
                            </span>
                            {combo.strategy === 'weighted' && (
                              <span className="ml-auto text-stone-500 font-mono text-[10px]">{step.weight ?? 50}%</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {result && (
                    <div
                      className={`p-2.5 rounded-xl text-xs mb-3 flex items-center gap-2 ${
                        result.success
                          ? 'bg-[#ecf7ef] border border-[#cbe8d2] text-[#166534]'
                          : 'bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      <span className="font-semibold break-words">
                        {result.success
                          ? `Verified! Latency: ${result.latencyMs}ms (${result.primaryResolved} / ${result.modelResolved})`
                          : result.error}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3.5 border-t border-[#f0eae1] flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleTestCombo(combo.id)}
                    disabled={isTesting}
                    className="px-3 py-1.5 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Play className={`w-3.5 h-3.5 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Verifying...' : 'Test Combo'}</span>
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(combo.id)}
                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-[11px] font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(combo)}
                        className="p-2 text-stone-500 hover:text-stone-900 bg-[#faf8f5] hover:bg-[#f2ede4] border border-[#e4ded5] rounded-xl transition cursor-pointer"
                        title="Edit combo"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(combo.id)}
                        className="p-2 text-stone-500 hover:text-rose-700 bg-[#faf8f5] hover:bg-rose-50 border border-[#e4ded5] rounded-xl transition cursor-pointer"
                        title="Delete combo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{formError}</div>
            )}

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
                  placeholder="Describe failover order or routing purpose..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                />
              </div>

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
                  {formData.steps.map((step, idx) => {
                    const providerModels = models.filter((m) => m.providerId === step.providerId);
                    const availableModels = providerModels.length > 0 ? providerModels : models;
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-[#faf8f5] border border-[#e4ded5] rounded-2xl flex items-center gap-3"
                      >
                        <span className="w-6 h-6 rounded-full bg-white border border-[#e0dad0] flex items-center justify-center font-bold text-xs text-stone-700 shrink-0">
                          {idx + 1}
                        </span>

                        <div className={`grid gap-2 flex-1 ${formData.strategy === 'weighted' ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                              {availableModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.displayName}
                                </option>
                              ))}
                            </select>
                          </div>

                          {formData.strategy === 'weighted' && (
                            <div>
                              <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">Weight %</label>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={step.weight}
                                onChange={(e) => {
                                  const updated = [...formData.steps];
                                  updated[idx].weight = Number(e.target.value);
                                  setFormData({ ...formData, steps: updated });
                                }}
                                className="w-full bg-white border border-[#e4ded5] rounded-lg px-2 py-1.5 text-stone-800 font-mono"
                              />
                            </div>
                          )}
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
                    );
                  })}
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
