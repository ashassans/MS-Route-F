import React, { useState } from 'react';
import {
  Radio,
  Plus,
  Activity,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import type { ProviderConfig, ProviderType, ApiProtocol, HealthStatus } from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';

interface ProvidersViewProps {
  providers: ProviderConfig[];
  onRefresh: () => void;
}

const PROVIDER_PRESETS: Record<
  ProviderType,
  { label: string; baseUrl: string; protocol: ApiProtocol; suggestedModels: string }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-chat',
    suggestedModels: 'gpt-4o, gpt-4o-mini',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic-messages',
    suggestedModels: 'claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'google-gemini',
    suggestedModels: 'gemini-2.5-flash, gemini-2.5-pro',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-chat',
    suggestedModels: 'deepseek-chat, deepseek-reasoner',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai-chat',
    suggestedModels: 'llama-3.3-70b-versatile, llama-3.1-8b-instant',
  },
  mistral: {
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai-chat',
    suggestedModels: 'mistral-large-latest, codestral-latest',
  },
  xai: {
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    protocol: 'openai-chat',
    suggestedModels: 'grok-2-latest',
  },
  cohere: {
    label: 'Cohere',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    protocol: 'openai-chat',
    suggestedModels: 'command-r-plus',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai-chat',
    suggestedModels: 'anthropic/claude-3.5-sonnet, google/gemini-2.5-flash',
  },
  together: {
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    protocol: 'openai-chat',
    suggestedModels: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  fireworks: {
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    protocol: 'openai-chat',
    suggestedModels: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  },
  custom: {
    label: 'Custom Endpoint',
    baseUrl: '',
    protocol: 'openai-chat',
    suggestedModels: '',
  },
};

export const ProvidersView: React.FC<ProvidersViewProps> = ({ providers, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
    availableModels?: string[];
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Model detector state inside modal
  const [isDetectingModels, setIsDetectingModels] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[] | null>(null);
  const [detectModelError, setDetectModelError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'gemini' as ProviderType,
    baseUrl: PROVIDER_PRESETS.gemini.baseUrl,
    apiKey: '',
    protocol: PROVIDER_PRESETS.gemini.protocol,
    models: PROVIDER_PRESETS.gemini.suggestedModels,
    defaultModel: 'gemini-2.5-flash',
    timeoutMs: 30000,
    priority: 1,
    maxRetries: 2,
    enabled: true,
  });

  const handleOpenAdd = () => {
    setEditingProvider(null);
    setFormError(null);
    setDetectedModels(null);
    setDetectModelError(null);
    const preset = PROVIDER_PRESETS.gemini;
    setFormData({
      id: `prov-${Date.now().toString().slice(-5)}`,
      name: '',
      type: 'gemini',
      baseUrl: preset.baseUrl,
      apiKey: '',
      protocol: preset.protocol,
      models: preset.suggestedModels,
      defaultModel: preset.suggestedModels.split(',')[0]?.trim() || '',
      timeoutMs: 30000,
      priority: 1,
      maxRetries: 2,
      enabled: true,
    });
    setIsModalOpen(true);
  };

  const handleSelectType = (nextType: ProviderType) => {
    const preset = PROVIDER_PRESETS[nextType];
    setDetectedModels(null);
    setDetectModelError(null);
    if (editingProvider) {
      setFormData({ ...formData, type: nextType });
      return;
    }
    const firstModel = preset.suggestedModels.split(',')[0]?.trim() || '';
    const isNameBlankOrPreset =
      !formData.name.trim() ||
      Object.values(PROVIDER_PRESETS).some((p) => p.label === formData.name.trim());

    setFormData({
      ...formData,
      type: nextType,
      name: isNameBlankOrPreset && nextType !== 'custom' ? preset.label : formData.name,
      baseUrl: preset.baseUrl,
      protocol: preset.protocol,
      models: preset.suggestedModels,
      defaultModel: firstModel,
    });
  };

  const handleOpenEdit = (prov: ProviderConfig) => {
    setEditingProvider(prov);
    setFormError(null);
    setDetectedModels(null);
    setDetectModelError(null);
    setFormData({
      id: prov.id,
      name: prov.name,
      type: prov.type,
      baseUrl: prov.baseUrl,
      apiKey: '',
      protocol: prov.protocol,
      models: prov.models.join(', '),
      defaultModel: prov.defaultModel,
      timeoutMs: prov.timeoutMs,
      priority: prov.priority,
      maxRetries: prov.maxRetries,
      enabled: prov.enabled,
    });
    setIsModalOpen(true);
  };

  const handleTestAndFetchModels = async () => {
    if (!formData.baseUrl.trim()) {
      setDetectModelError('Enter Base URL first');
      return;
    }
    setIsDetectingModels(true);
    setDetectModelError(null);
    setDetectedModels(null);

    try {
      const res = await fetch('/api/providers/test-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProvider ? editingProvider.id : undefined,
          baseUrl: formData.baseUrl.trim(),
          apiKey: formData.apiKey.trim() || undefined,
          protocol: formData.protocol,
          type: formData.type,
        }),
      });

      const data = await readApiJson(res, 'Test Models');
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Connection failed');
      }

      const found: string[] = Array.isArray(data.models) ? data.models : [];
      setDetectedModels(found);
      if (found.length === 0) {
        setDetectModelError('Connected, but no models found');
      }
    } catch (err: any) {
      setDetectModelError(err.message || 'Connection failed');
    } finally {
      setIsDetectingModels(false);
    }
  };

  const handleApplyDetectedModels = (modelsToApply: string[]) => {
    setFormData({
      ...formData,
      models: modelsToApply.join(', '),
      defaultModel: modelsToApply[0] || formData.defaultModel,
    });
  };

  const handleToggleSingleModel = (modelName: string) => {
    const current = formData.models
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    let next: string[];
    if (current.includes(modelName)) {
      next = current.filter((m) => m !== modelName);
    } else {
      next = [...current, modelName];
    }
    setFormData({
      ...formData,
      models: next.join(', '),
      defaultModel: next[0] || '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const modelList = formData.models
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey.trim() || undefined,
        protocol: formData.protocol,
        customHeaders: editingProvider?.customHeaders || {},
        models: modelList,
        defaultModel: formData.defaultModel.trim() || modelList[0] || '',
        timeoutMs: Number(formData.timeoutMs),
        priority: Number(formData.priority),
        maxRetries: Number(formData.maxRetries),
        enabled: formData.enabled,
      };

      const url = editingProvider ? `/api/providers/${encodeURIComponent(editingProvider.id)}` : '/api/providers';
      const method = editingProvider ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProvider ? payload : { id: formData.id.trim(), ...payload }),
      });

      const data = await readApiJson(res, 'Providers API');
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save provider');
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Unable to save provider');
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await readApiJson(res, 'Providers API');
      if (!data.success) throw new Error(data.error || 'Failed to delete provider');
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Delete failed');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(id)}/test`, { method: 'POST' });
      const data = await readApiJson(res, 'Provider Test API');
      setTestResult({
        id,
        success: Boolean(data.success),
        latencyMs: data.latencyMs,
        error: data.error,
        availableModels: data.availableModels,
      });
      onRefresh();
    } catch (err: any) {
      setTestResult({
        id,
        success: false,
        error: err.message,
      });
    } finally {
      setTestingId(null);
    }
  };

  const renderHealthBadge = (status: HealthStatus, enabled: boolean) => {
    if (!enabled) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#faf8f5] text-stone-400 border border-[#e5dfd5]">
          Disabled
        </span>
      );
    }
    if (status === 'healthy') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#e2f1e6] text-[#1e5c36] border border-[#c4e6ce]">
          Healthy
        </span>
      );
    }
    if (status === 'unknown') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#faf8f5] text-stone-500 border border-[#e5dfd5]">
          Untested
        </span>
      );
    }
    if (status === 'degraded') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#fefce8] text-[#854d0e] border border-[#fef08a]">
          Degraded
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#fde8e8] text-[#9b1c1c] border border-[#fbd5d5]">
        Unavailable
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Banner and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#eff6f2] border border-[#d6e5dc] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h2 className="font-editorial text-xl sm:text-2xl font-medium text-stone-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#1c4d32]" />
            AI Providers
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Manage upstream endpoints and models
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-3.5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Provider</span>
        </button>
      </div>

      {actionError && (
        <div className="px-3.5 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Empty State or Provider Cards Grid */}
      {providers.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-8 text-center shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-[#eff6f2] border border-[#d6e5dc] flex items-center justify-center mx-auto text-[#1c4d32]">
            <Radio className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-stone-900">No Providers</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Connect Gemini, Anthropic, OpenAI, DeepSeek, Groq, or custom endpoints to start routing.
          </p>
          <div className="pt-2">
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Provider</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => {
            const isTesting = testingId === p.id;
            const result = testResult?.id === p.id ? testResult : null;
            const isConfirmingDelete = confirmDeleteId === p.id;

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-2xl p-5 flex flex-col justify-between shadow-xs transition ${
                  p.enabled ? 'border-[#e8e2d8]' : 'border-[#e8e2d8]/60 opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-stone-900 truncate">{p.name}</h3>
                        <span className="px-1.5 py-0.2 text-[10px] uppercase font-mono font-medium bg-[#faf8f5] text-stone-500 rounded border border-[#e5dfd5]">
                          {p.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 font-mono mt-0.5 truncate max-w-[200px]" title={p.baseUrl}>
                        {p.baseUrl}
                      </p>
                    </div>

                    {renderHealthBadge(p.health.status, p.enabled)}
                  </div>

                  {/* Specs Box */}
                  <div className="bg-[#faf8f5] border border-[#e8e2d8] rounded-xl p-3 text-xs space-y-1.5 my-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Protocol</span>
                      <span className="font-mono text-stone-700 font-medium">{p.protocol}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Priority / Retries</span>
                      <span className="text-stone-700 font-medium">
                        Tier {p.priority} • {p.maxRetries}x
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Timeout</span>
                      <span className="text-stone-700 font-mono">{p.timeoutMs / 1000}s</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Key</span>
                      {p.hasApiKey ? (
                        <span className="text-emerald-700 flex items-center gap-1 font-medium">
                          <Lock className="w-3 h-3" /> Configured
                        </span>
                      ) : (
                        <span className="text-stone-400 flex items-center gap-1">
                          <KeyRound className="w-3 h-3" /> None
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Models List */}
                  <div className="text-xs">
                    <span className="text-stone-400 text-[11px]">Models ({p.models.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.models.length === 0 ? (
                        <span className="text-[11px] text-stone-400 italic">None listed</span>
                      ) : (
                        <>
                          {p.models.slice(0, 3).map((m) => (
                            <span key={m} className="px-1.5 py-0.5 bg-[#f4efe8] text-stone-700 rounded text-[10px] font-mono">
                              {m}
                            </span>
                          ))}
                          {p.models.length > 3 && (
                            <span className="px-1.5 py-0.5 bg-[#f4efe8] text-stone-500 rounded text-[10px]">
                              +{p.models.length - 3} more
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Live Test Feedback banner */}
                  {result && (
                    <div
                      className={`mt-3 p-2.5 rounded-xl text-xs flex flex-col gap-1 ${
                        result.success
                          ? 'bg-[#ecf7ef] border border-[#cbe8d2] text-[#166534]'
                          : 'bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {result.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <span className="font-medium truncate">
                          {result.success ? `Connected (${result.latencyMs}ms)` : result.error}
                        </span>
                      </div>
                      {result.success && result.availableModels && result.availableModels.length > 0 && (
                        <div className="text-[10px] text-stone-600 pt-1 border-t border-[#cbe8d2]/60">
                          <span className="font-semibold text-stone-700">Available: </span>
                          <span className="font-mono">{result.availableModels.slice(0, 4).join(', ')}</span>
                          {result.availableModels.length > 4 && ` +${result.availableModels.length - 4} more`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[#f0eae1] flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleTestConnection(p.id)}
                    disabled={isTesting}
                    className="px-2.5 py-1.5 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-700 border border-[#e4ded5] rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Activity className={`w-3.5 h-3.5 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg text-[11px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-stone-400 hover:text-stone-800 bg-[#faf8f5] hover:bg-[#f2ede4] border border-[#e4ded5] rounded-xl transition cursor-pointer"
                        title="Edit provider"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 bg-[#faf8f5] hover:bg-rose-50 border border-[#e4ded5] rounded-xl transition cursor-pointer"
                        title="Delete provider"
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

      {/* Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 flex min-h-full items-center justify-center">
          <div className="relative w-full max-w-lg my-auto bg-white border border-[#e8e2d8] rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#f0eae1] px-5 sm:px-6 py-4 shrink-0 bg-white">
              <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">
                {editingProvider ? `Edit ${editingProvider.name}` : 'Add Provider'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5 text-xs flex-1">
                {formError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Preset</label>
                    <select
                      value={formData.type}
                      onChange={(e) => handleSelectType(e.target.value as ProviderType)}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="groq">Groq</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="mistral">Mistral</option>
                      <option value="xai">xAI</option>
                      <option value="together">Together AI</option>
                      <option value="cohere">Cohere</option>
                      <option value="fireworks">Fireworks AI</option>
                      <option value="custom">Custom Endpoint</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Protocol</label>
                    <select
                      value={formData.protocol}
                      onChange={(e) => setFormData({ ...formData, protocol: e.target.value as ApiProtocol })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b] font-mono text-[11px]"
                    >
                      <option value="openai-chat">OpenAI Chat API</option>
                      <option value="anthropic-messages">Anthropic Messages API</option>
                      <option value="google-gemini">Google Gemini REST</option>
                      <option value="openai-responses">OpenAI Responses API</option>
                      <option value="custom-http">Custom HTTP</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">ID</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingProvider)}
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Base URL</label>
                  <input
                    type="url"
                    required
                    value={formData.baseUrl}
                    onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />
                </div>

                <div>
                  <label className="block text-stone-600 mb-1 font-medium">API Key</label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={editingProvider?.hasApiKey ? '•••••••••••• (Leave blank to keep existing)' : 'Enter API Key (optional)'}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-stone-600 font-medium">Models</label>
                    <button
                      type="button"
                      onClick={handleTestAndFetchModels}
                      disabled={isDetectingModels}
                      className="text-[11px] text-[#1c4d32] hover:text-[#143a24] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3 h-3 ${isDetectingModels ? 'animate-spin' : ''}`} />
                      <span>{isDetectingModels ? 'Detecting...' : 'Test & Fetch Models'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.models}
                    onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                  />

                  {/* Detected Models Feedback */}
                  {detectModelError && (
                    <p className="text-[11px] text-rose-600 mt-1">{detectModelError}</p>
                  )}

                  {detectedModels && detectedModels.length > 0 && (
                    <div className="mt-2 p-2.5 bg-[#eff6f2] border border-[#d6e5dc] rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[#1c4d32]">
                          Available ({detectedModels.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleApplyDetectedModels(detectedModels)}
                          className="text-[10px] font-semibold text-[#1c4d32] hover:underline cursor-pointer"
                        >
                          Use All
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                        {detectedModels.map((m) => {
                          const isSelected = formData.models
                            .split(',')
                            .map((s) => s.trim())
                            .includes(m);
                          return (
                            <button
                              type="button"
                              key={m}
                              onClick={() => handleToggleSingleModel(m)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                                isSelected
                                  ? 'bg-[#1c4d32] text-white'
                                  : 'bg-white text-stone-700 hover:bg-[#e2f0e7] border border-[#d6e5dc]'
                              }`}
                              title={isSelected ? 'Click to remove' : 'Click to add'}
                            >
                              {m} {isSelected ? '✓' : '+'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Timeout (ms)</label>
                    <input
                      type="number"
                      min="1000"
                      value={formData.timeoutMs}
                      onChange={(e) => setFormData({ ...formData, timeoutMs: Number(e.target.value) })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Priority</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Retries</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={formData.maxRetries}
                      onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                      className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="enabledCheck"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded border-[#e4ded5] text-[#205e3b] cursor-pointer"
                  />
                  <label htmlFor="enabledCheck" className="text-stone-700 font-medium cursor-pointer">
                    Enabled
                  </label>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-3.5 border-t border-[#f0eae1] bg-[#faf8f5] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-[#e4ded5] rounded-xl font-medium transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-semibold transition cursor-pointer shadow-xs text-xs"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
