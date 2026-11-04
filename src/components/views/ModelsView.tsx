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
} from 'lucide-react';
import type { ModelConfig, ModelAlias, ProviderConfig, ComboConfig } from '../../types/gateway.ts';

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

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!modelForm.id.trim() || !modelForm.displayName.trim() || !modelForm.providerId) {
      setFormError('Model ID, Display Name, and Provider are required.');
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
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to register model');
      setIsModelModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to register model');
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      await fetch(`/api/models/${id}`, { method: 'DELETE' });
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
      setFormError('Alias identifier and a valid target destination are required.');
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
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create alias');
      setIsAliasModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to create alias');
    }
  };

  const handleDeleteAlias = async (id: string) => {
    try {
      await fetch(`/api/aliases/${id}`, { method: 'DELETE' });
      setConfirmDeleteAliasId(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#1c4d32]" />
              Model Registry & Aliases
            </h2>
            <div className="flex bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('models')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeTab === 'models'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Models ({models.length})
              </button>
              <button
                onClick={() => setActiveTab('aliases')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeTab === 'aliases'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Aliases ({aliases.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            Map incoming client requests to registered upstream models or multi-provider failover combos.
          </p>
        </div>

        {activeTab === 'models' ? (
          <button
            onClick={handleOpenModelModal}
            disabled={providers.length === 0}
            className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
            title={providers.length === 0 ? 'Add a provider first to register models' : 'Register model'}
          >
            <Plus className="w-4 h-4" />
            <span>Register Model</span>
          </button>
        ) : (
          <button
            onClick={handleOpenAliasModal}
            disabled={models.length === 0 && combos.length === 0}
            className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
            title={models.length === 0 && combos.length === 0 ? 'Register a model or combo first' : 'Create model alias'}
          >
            <Plus className="w-4 h-4" />
            <span>Create Model Alias</span>
          </button>
        )}
      </div>

      {/* Models Tab */}
      {activeTab === 'models' && (
        models.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-3xl p-10 text-center shadow-xs space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="font-editorial text-xl font-medium text-stone-900">No Models Registered Yet</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
              {providers.length === 0
                ? 'Connect an AI Provider first — listed models are automatically registered here, or you can add custom model definitions with token pricing.'
                : 'Register your first model definition to configure capabilities, context window, and token cost estimation.'}
            </p>
            {providers.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={handleOpenModelModal}
                  className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Model</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {models.map((m) => {
              const prov = providers.find((p) => p.id === m.providerId);
              const isConfirming = confirmDeleteModelId === m.id;
              return (
                <div
                  key={m.id}
                  className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="font-bold text-sm text-stone-900">{m.displayName}</h3>
                        <p className="text-[11px] text-stone-500 font-mono mt-0.5">{m.apiModelName}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#faf8f5] text-stone-600 border border-[#e5dfd5]">
                        {prov?.name || m.providerId}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#faf8f5] border border-[#e8e2d8] rounded-2xl p-3 my-3 text-xs">
                      <div>
                        <span className="text-stone-500 text-[10px] block font-medium">Context Window</span>
                        <span className="font-mono text-stone-800 font-semibold">{m.contextWindow.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 text-[10px] block font-medium">Pricing (In / Out)</span>
                        <span className="font-mono text-stone-800 text-[11px] font-semibold">
                          ${m.pricing.inputPer1MTokens} / ${m.pricing.outputPer1MTokens}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-stone-500 block mb-1.5 uppercase font-semibold tracking-wider">
                        Capabilities
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {m.capabilities.streaming && (
                          <span className="px-2 py-0.5 bg-[#ecf7ef] text-[#166534] border border-[#cbe8d2] rounded-md text-[10px] flex items-center gap-1 font-semibold">
                            <Zap className="w-3 h-3" /> Streaming
                          </span>
                        )}
                        {m.capabilities.tools && (
                          <span className="px-2 py-0.5 bg-[#eff6fe] text-[#1e40af] border border-[#bfdbfe] rounded-md text-[10px] flex items-center gap-1 font-semibold">
                            <Wrench className="w-3 h-3" /> Tools
                          </span>
                        )}
                        {m.capabilities.vision && (
                          <span className="px-2 py-0.5 bg-[#faf5ff] text-[#6b21a8] border border-[#e9d5ff] rounded-md text-[10px] flex items-center gap-1 font-semibold">
                            <Eye className="w-3 h-3" /> Vision
                          </span>
                        )}
                        {m.capabilities.reasoning && (
                          <span className="px-2 py-0.5 bg-[#fffbeb] text-[#92400e] border border-[#fde68a] rounded-md text-[10px] flex items-center gap-1 font-semibold">
                            <BrainCircuit className="w-3 h-3" /> Reasoning
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#f0eae1] flex items-center justify-between text-[11px] text-stone-500">
                    <div className="truncate mr-2">
                      <span>ID: </span>
                      <code className="text-stone-800 font-mono font-semibold">{m.id}</code>
                    </div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDeleteModel(m.id)}
                          className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteModelId(null)}
                          className="px-2 py-1 bg-stone-100 text-stone-700 rounded-lg text-[10px] font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteModelId(m.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                        title="Remove model"
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

      {/* Aliases Tab */}
      {activeTab === 'aliases' && (
        <div className="bg-white border border-[#e8e2d8] rounded-3xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0eae1] bg-[#faf8f5] text-stone-600 font-semibold">
                <th className="p-4">Alias Identifier</th>
                <th className="p-4">Target Type</th>
                <th className="p-4">Resolved Destination</th>
                <th className="p-4">Description</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e8]">
              {aliases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-stone-500">
                    No model aliases configured yet. Create aliases (such as <code className="font-mono text-stone-700">claude-3-7-sonnet</code> or <code className="font-mono text-stone-700">coding-default</code>) to map incoming client model names dynamically.
                  </td>
                </tr>
              ) : (
                aliases.map((a) => (
                  <tr key={a.id} className="hover:bg-[#faf8f5] transition">
                    <td className="p-4 font-mono font-bold text-stone-900">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-[#16a34a]" />
                        {a.alias}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-[#faf8f5] border border-[#e5dfd5] text-stone-700 rounded-md font-mono text-[10px] uppercase font-bold">
                        {a.targetType}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[#a16207] font-semibold">{a.targetId}</td>
                    <td className="p-4 text-stone-600">{a.description || '—'}</td>
                    <td className="p-4 text-right">
                      {confirmDeleteAliasId === a.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleDeleteAlias(a.id)}
                            className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAliasId(null)}
                            className="px-2 py-1 bg-stone-100 text-stone-700 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAliasId(a.id)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title="Delete alias"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Model Modal */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#e8e2d8] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
              <h3 className="font-editorial text-xl font-medium text-stone-900">Register Upstream Model</h3>
              <button onClick={() => setIsModelModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{formError}</div>
            )}

            <form onSubmit={handleCreateModel} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Routing Model ID *</label>
                  <input
                    type="text"
                    required
                    value={modelForm.id}
                    onChange={(e) => setModelForm({ ...modelForm, id: e.target.value, apiModelName: modelForm.apiModelName || e.target.value })}
                    placeholder="e.g. gemini-2.5-pro"
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Display Name *</label>
                  <input
                    type="text"
                    required
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                    placeholder="e.g. Gemini 2.5 Pro"
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Provider *</label>
                  <select
                    value={modelForm.providerId}
                    onChange={(e) => setModelForm({ ...modelForm, providerId: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Context Window</label>
                  <input
                    type="number"
                    min="1024"
                    value={modelForm.contextWindow}
                    onChange={(e) => setModelForm({ ...modelForm, contextWindow: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Input Price ($ / 1M tokens)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.inputPer1MTokens}
                    onChange={(e) => setModelForm({ ...modelForm, inputPer1MTokens: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Output Price ($ / 1M tokens)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.outputPer1MTokens}
                    onChange={(e) => setModelForm({ ...modelForm, outputPer1MTokens: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.streaming}
                    onChange={(e) => setModelForm({ ...modelForm, streaming: e.target.checked })}
                  />
                  <span>Streaming</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.tools}
                    onChange={(e) => setModelForm({ ...modelForm, tools: e.target.checked })}
                  />
                  <span>Tool Calling</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.vision}
                    onChange={(e) => setModelForm({ ...modelForm, vision: e.target.checked })}
                  />
                  <span>Vision</span>
                </label>
                <label className="flex items-center gap-1.5 text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelForm.reasoning}
                    onChange={(e) => setModelForm({ ...modelForm, reasoning: e.target.checked })}
                  />
                  <span>Reasoning</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-bold transition cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8e2d8] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
              <h3 className="font-editorial text-xl font-medium text-stone-900">Create Dynamic Model Alias</h3>
              <button onClick={() => setIsAliasModalOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{formError}</div>
            )}

            <form onSubmit={handleCreateAlias} className="space-y-4 text-xs">
              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Alias Name (Incoming Model Request) *</label>
                <input
                  type="text"
                  required
                  value={aliasForm.alias}
                  onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
                  placeholder="e.g. claude-3-7-sonnet, gpt-4o, default"
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Target Type</label>
                <select
                  value={aliasForm.targetType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'model' | 'combo';
                    const nextTarget = nextType === 'model' ? models[0]?.id || '' : combos[0]?.id || '';
                    setAliasForm({ ...aliasForm, targetType: nextType, targetId: nextTarget });
                  }}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                >
                  <option value="model">Direct Model</option>
                  <option value="combo">Combo Pipeline (Failover / Race)</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Target Destination *</label>
                <select
                  value={aliasForm.targetId}
                  onChange={(e) => setAliasForm({ ...aliasForm, targetId: e.target.value })}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                >
                  {aliasForm.targetType === 'model' ? (
                    models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} ({m.id})
                        </option>
                      ))
                    )
                  ) : combos.length === 0 ? (
                    <option value="">No combos available</option>
                  ) : (
                    combos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  value={aliasForm.description}
                  onChange={(e) => setAliasForm({ ...aliasForm, description: e.target.value })}
                  placeholder="e.g. Production coding model alias"
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
                <button
                  type="button"
                  onClick={() => setIsAliasModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!aliasForm.targetId}
                  className="px-5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
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
