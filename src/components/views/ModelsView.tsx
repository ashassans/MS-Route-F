import React, { useState } from 'react';
import {
  Cpu,
  Plus,
  Zap,
  Eye,
  Wrench,
  BrainCircuit,
  Trash2,
  Tag,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { ModelConfig, ModelAlias, ProviderConfig, ComboConfig } from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';

interface ModelsViewProps {
  models: ModelConfig[];
  aliases: ModelAlias[];
  providers: ProviderConfig[];
  combos: ComboConfig[];
  onRefresh: () => void;
}

export const ModelsView: React.FC<ModelsViewProps> = ({
  models,
  aliases,
  providers,
  combos,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'models' | 'aliases'>('models');
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteModelId, setConfirmDeleteModelId] = useState<string | null>(null);
  const [confirmDeleteAliasId, setConfirmDeleteAliasId] = useState<string | null>(null);

  // Model Testing State
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; latencyMs?: number; error?: string } | null>(null);

  const [modelForm, setModelForm] = useState({
    id: '',
    displayName: '',
    providerId: providers[0]?.id || '',
    apiModelName: '',
    contextWindow: 128000,
    inputPer1MTokens: 0.5,
    outputPer1MTokens: 1.5,
    streaming: true,
    tools: true,
    vision: false,
    reasoning: false,
  });

  const [aliasForm, setAliasForm] = useState({
    alias: '',
    description: '',
    targetType: 'model' as 'model' | 'combo',
    targetId: models[0]?.id || '',
  });

  const handleOpenModelModal = () => {
    setFormError(null);
    setModelForm({
      id: '',
      displayName: '',
      providerId: providers[0]?.id || '',
      apiModelName: '',
      contextWindow: 128000,
      inputPer1MTokens: 0.5,
      outputPer1MTokens: 1.5,
      streaming: true,
      tools: true,
      vision: false,
      reasoning: false,
    });
    setIsModelModalOpen(true);
  };

  const handleOpenAliasModal = () => {
    setFormError(null);
    const defaultType: 'model' | 'combo' = models.length > 0 ? 'model' : combos.length > 0 ? 'combo' : 'model';
    const defaultTarget = defaultType === 'model' ? models[0]?.id || '' : combos[0]?.id || '';
    setAliasForm({
      alias: '',
      description: '',
      targetType: defaultType,
      targetId: defaultTarget,
    });
    setIsAliasModalOpen(true);
  };

  const handleTestModel = async (model: ModelConfig) => {
    const prov = providers.find((p) => p.id === model.providerId);
    if (!prov) {
      setTestResult({ id: model.id, success: false, error: 'Provider not found' });
      return;
    }
    setTestingModelId(model.id);
    setTestResult(null);

    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(prov.id)}/test`, { method: 'POST' });
      const data = await readApiJson(res, 'Model Test API');
      const isAvailable = Array.isArray(data.availableModels)
        ? data.availableModels.includes(model.apiModelName) || data.availableModels.includes(model.id)
        : data.success;

      setTestResult({
        id: model.id,
        success: Boolean(data.success),
        latencyMs: data.latencyMs,
        error: isAvailable ? undefined : `Model ${model.apiModelName} not reported by provider`,
      });
    } catch (err: any) {
      setTestResult({
        id: model.id,
        success: false,
        error: err.message,
      });
    } finally {
      setTestingModelId(null);
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!modelForm.id.trim() || !modelForm.displayName.trim() || !modelForm.providerId) {
      setFormError('Model ID, Name, and Provider are required');
      return;
    }

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modelForm.id.trim(),
          displayName: modelForm.displayName.trim(),
          providerId: modelForm.providerId,
          apiModelName: (modelForm.apiModelName || modelForm.id).trim(),
          contextWindow: Number(modelForm.contextWindow),
          capabilities: {
            streaming: modelForm.streaming,
            tools: modelForm.tools,
            vision: modelForm.vision,
            reasoning: modelForm.reasoning,
            jsonOutput: true,
          },
          pricing: {
            inputPer1MTokens: Number(modelForm.inputPer1MTokens),
            outputPer1MTokens: Number(modelForm.outputPer1MTokens),
          },
          enabled: true,
        }),
      });
      const data = await readApiJson(res, 'Models API');
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save model');
      setIsModelModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to save model');
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      await fetch(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmDeleteModelId(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleCreateAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!aliasForm.alias.trim() || !aliasForm.targetId) {
      setFormError('Alias name and target are required');
      return;
    }

    try {
      const res = await fetch('/api/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: aliasForm.alias.trim(),
          description: aliasForm.description.trim(),
          targetType: aliasForm.targetType,
          targetId: aliasForm.targetId,
        }),
      });
      const data = await readApiJson(res, 'Aliases API');
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save alias');
      setIsAliasModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to save alias');
    }
  };

  const handleDeleteAlias = async (id: string) => {
    try {
      await fetch(`/api/aliases/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmDeleteAliasId(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tab Switcher & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#eff6f2] border border-[#d6e5dc] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-editorial text-xl sm:text-2xl font-medium text-stone-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#1c4d32]" />
              Models & Aliases
            </h2>
            <div className="flex bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('models')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'models'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-400 hover:text-stone-700'
                }`}
              >
                Models ({models.length})
              </button>
              <button
                onClick={() => setActiveTab('aliases')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'aliases'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-400 hover:text-stone-700'
                }`}
              >
                Aliases ({aliases.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Model catalog and dynamic alias routing
          </p>
        </div>

        {activeTab === 'models' ? (
          <button
            onClick={handleOpenModelModal}
            disabled={providers.length === 0}
            className="px-3.5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Model</span>
          </button>
        ) : (
          <button
            onClick={handleOpenAliasModal}
            disabled={models.length === 0 && combos.length === 0}
            className="px-3.5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Alias</span>
          </button>
        )}
      </div>

      {activeTab === 'models' && (
        models.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-2xl p-8 text-center shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-900">No Models</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {providers.length === 0
                ? 'Add a provider first. Its models will be automatically registered.'
                : 'Register a model to set context windows and token pricing.'}
            </p>
            {providers.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={handleOpenModelModal}
                  className="px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Model</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => {
              const prov = providers.find((p) => p.id === m.providerId);
              const isConfirming = confirmDeleteModelId === m.id;
              const isTesting = testingModelId === m.id;
              const result = testResult?.id === m.id ? testResult : null;

              return (
                <div
                  key={m.id}
                  className="bg-white border border-[#e8e2d8] rounded-2xl p-5 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-stone-900 truncate">{m.displayName}</h3>
                        <p className="text-[11px] text-stone-400 font-mono mt-0.5 truncate">{m.apiModelName}</p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#faf8f5] text-stone-500 border border-[#e5dfd5] shrink-0">
                        {prov?.name || m.providerId}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#faf8f5] border border-[#e8e2d8] rounded-xl p-2.5 my-2.5 text-xs">
                      <div>
                        <span className="text-stone-400 text-[10px] block">Context</span>
                        <span className="font-mono text-stone-700 font-medium">{m.contextWindow.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 text-[10px] block">Price (In / Out)</span>
                        <span className="font-mono text-stone-700 text-[11px]">
                          ${m.pricing.inputPer1MTokens} / ${m.pricing.outputPer1MTokens}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap gap-1">
                        {m.capabilities.streaming && (
                          <span className="px-1.5 py-0.5 bg-[#ecf7ef] text-[#166534] border border-[#cbe8d2] rounded text-[10px] flex items-center gap-1 font-medium">
                            <Zap className="w-2.5 h-2.5" /> Streaming
                          </span>
                        )}
                        {m.capabilities.tools && (
                          <span className="px-1.5 py-0.5 bg-[#eff6fe] text-[#1e40af] border border-[#bfdbfe] rounded text-[10px] flex items-center gap-1 font-medium">
                            <Wrench className="w-2.5 h-2.5" /> Tools
                          </span>
                        )}
                        {m.capabilities.vision && (
                          <span className="px-1.5 py-0.5 bg-[#faf5ff] text-[#6b21a8] border border-[#e9d5ff] rounded text-[10px] flex items-center gap-1 font-medium">
                            <Eye className="w-2.5 h-2.5" /> Vision
                          </span>
                        )}
                        {m.capabilities.reasoning && (
                          <span className="px-1.5 py-0.5 bg-[#fffbeb] text-[#92400e] border border-[#fde68a] rounded text-[10px] flex items-center gap-1 font-medium">
                            <BrainCircuit className="w-2.5 h-2.5" /> Reasoning
                          </span>
                        )}
                      </div>
                    </div>

                    {result && (
                      <div
                        className={`mt-2.5 p-2 rounded-xl text-xs flex items-center gap-1.5 ${
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
                        <span className="truncate text-[11px]">
                          {result.success ? `Available (${result.latencyMs}ms)` : result.error}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-[#f0eae1] flex items-center justify-between text-[11px] text-stone-500">
                    <button
                      onClick={() => handleTestModel(m)}
                      disabled={isTesting}
                      className="px-2 py-1 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-700 border border-[#e4ded5] rounded-lg text-[11px] font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      <Activity className={`w-3 h-3 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing...' : 'Test'}</span>
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteModel(m.id)}
                          className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteModelId(null)}
                          className="px-2 py-1 bg-stone-100 text-stone-600 rounded-lg text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteModelId(m.id)}
                        className="p-1 text-stone-400 hover:text-rose-600 transition cursor-pointer"
                        title="Delete model"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === 'aliases' && (
        aliases.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-2xl p-8 text-center shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
              <Tag className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-900">No Aliases</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Create aliases to map incoming model names dynamically to models or combos.
            </p>
            <div className="pt-2">
              <button
                onClick={handleOpenAliasModal}
                disabled={models.length === 0 && combos.length === 0}
                className="px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Add Alias</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {aliases.map((a) => {
              const isConfirming = confirmDeleteAliasId === a.id;
              return (
                <div
                  key={a.id}
                  className="bg-white border border-[#e8e2d8] rounded-2xl p-5 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <span className="px-2 py-0.5 bg-[#f4efe8] text-stone-800 rounded font-mono font-medium text-xs">
                          {a.alias}
                        </span>
                        {a.description && (
                          <p className="text-xs text-stone-500 mt-1 truncate">{a.description}</p>
                        )}
                      </div>
                      <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono bg-[#eff6fe] text-[#1e40af] border border-[#bfdbfe] rounded">
                        {a.targetType}
                      </span>
                    </div>

                    <div className="bg-[#faf8f5] border border-[#e8e2d8] rounded-xl p-2.5 my-2 text-xs">
                      <span className="text-stone-400 text-[10px] block">Target</span>
                      <code className="text-stone-800 font-mono font-medium text-[11px] truncate block">
                        {a.targetId}
                      </code>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#f0eae1] flex items-center justify-end">
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteAlias(a.id)}
                          className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteAliasId(null)}
                          className="px-2 py-1 bg-stone-100 text-stone-600 rounded-lg text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteAliasId(a.id)}
                        className="p-1 text-stone-400 hover:text-rose-600 transition cursor-pointer"
                        title="Delete alias"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Add Model Modal */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8e2d8] rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-2.5">
              <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">Add Model</h3>
              <button onClick={() => setIsModelModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer p-1">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{formError}</div>
            )}

            <form onSubmit={handleCreateModel} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Model ID</label>
                  <input
                    type="text"
                    required
                    value={modelForm.id}
                    onChange={(e) => setModelForm({ ...modelForm, id: e.target.value, apiModelName: modelForm.apiModelName || e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Name</label>
                  <input
                    type="text"
                    required
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Provider</label>
                  <select
                    value={modelForm.providerId}
                    onChange={(e) => setModelForm({ ...modelForm, providerId: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">API Model</label>
                  <input
                    type="text"
                    value={modelForm.apiModelName}
                    onChange={(e) => setModelForm({ ...modelForm, apiModelName: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Context</label>
                  <input
                    type="number"
                    min="1024"
                    value={modelForm.contextWindow}
                    onChange={(e) => setModelForm({ ...modelForm, contextWindow: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Input ($/1M)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.inputPer1MTokens}
                    onChange={(e) => setModelForm({ ...modelForm, inputPer1MTokens: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Output ($/1M)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.outputPer1MTokens}
                    onChange={(e) => setModelForm({ ...modelForm, outputPer1MTokens: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.streaming}
                    onChange={(e) => setModelForm({ ...modelForm, streaming: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>Streaming</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.tools}
                    onChange={(e) => setModelForm({ ...modelForm, tools: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>Tools</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.vision}
                    onChange={(e) => setModelForm({ ...modelForm, vision: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>Vision</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.reasoning}
                    onChange={(e) => setModelForm({ ...modelForm, reasoning: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>Reasoning</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(false)}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-semibold transition cursor-pointer shadow-xs"
                >
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Alias Modal */}
      {isAliasModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8e2d8] rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-2.5">
              <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">Add Alias</h3>
              <button onClick={() => setIsAliasModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer p-1">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{formError}</div>
            )}

            <form onSubmit={handleCreateAlias} className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-600 mb-1 font-medium">Alias</label>
                <input
                  type="text"
                  required
                  value={aliasForm.alias}
                  onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Type</label>
                  <select
                    value={aliasForm.targetType}
                    onChange={(e) => {
                      const nextType = e.target.value as 'model' | 'combo';
                      const nextTarget = nextType === 'model' ? models[0]?.id || '' : combos[0]?.id || '';
                      setAliasForm({ ...aliasForm, targetType: nextType, targetId: nextTarget });
                    }}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  >
                    <option value="model">Direct Model</option>
                    <option value="combo">Combo Pipeline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Target</label>
                  <select
                    value={aliasForm.targetId}
                    onChange={(e) => setAliasForm({ ...aliasForm, targetId: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  >
                    {aliasForm.targetType === 'model' ? (
                      models.length === 0 ? (
                        <option value="">No models</option>
                      ) : (
                        models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))
                      )
                    ) : combos.length === 0 ? (
                      <option value="">No combos</option>
                    ) : (
                      combos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  value={aliasForm.description}
                  onChange={(e) => setAliasForm({ ...aliasForm, description: e.target.value })}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
                <button
                  type="button"
                  onClick={() => setIsAliasModalOpen(false)}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!aliasForm.targetId}
                  className="px-4 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  Save Alias
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
