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
} from 'lucide-react';
import { ProviderConfig, ProviderType, ApiProtocol } from '../../types/gateway.ts';

interface ProvidersViewProps {
  providers: ProviderConfig[];
  onRefresh: () => void;
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({ providers, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; latencyMs?: number; error?: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'openai' as ProviderType,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    protocol: 'openai-chat' as ApiProtocol,
    customHeaders: '',
    models: 'gpt-4o, gpt-4o-mini',
    defaultModel: 'gpt-4o',
    timeoutMs: 30000,
    priority: 2,
    maxRetries: 2,
    enabled: true,
  });

  const handleOpenAdd = () => {
    setEditingProvider(null);
    setFormData({
      id: `prov-custom-${Date.now().toString().slice(-4)}`,
      name: '',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      protocol: 'openai-chat',
      customHeaders: '',
      models: 'gpt-4o, gpt-4o-mini',
      defaultModel: 'gpt-4o',
      timeoutMs: 30000,
      priority: 2,
      maxRetries: 2,
      enabled: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prov: ProviderConfig) => {
    setEditingProvider(prov);
    setFormData({
      id: prov.id,
      name: prov.name,
      type: prov.type,
      baseUrl: prov.baseUrl,
      apiKey: '', // Never populate encrypted secret
      protocol: prov.protocol,
      customHeaders: JSON.stringify(prov.customHeaders || {}, null, 2),
      models: prov.models.join(', '),
      defaultModel: prov.defaultModel,
      timeoutMs: prov.timeoutMs,
      priority: prov.priority,
      maxRetries: prov.maxRetries,
      enabled: prov.enabled,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedHeaders = {};
      if (formData.customHeaders.trim()) {
        try {
          parsedHeaders = JSON.parse(formData.customHeaders);
        } catch {
          alert('Custom Headers must be valid JSON');
          return;
        }
      }

      const payload = {
        name: formData.name,
        type: formData.type,
        baseUrl: formData.baseUrl,
        apiKey: formData.apiKey || undefined,
        protocol: formData.protocol,
        customHeaders: parsedHeaders,
        models: formData.models.split(',').map((m) => m.trim()).filter(Boolean),
        defaultModel: formData.defaultModel,
        timeoutMs: Number(formData.timeoutMs),
        priority: Number(formData.priority),
        maxRetries: Number(formData.maxRetries),
        enabled: formData.enabled,
      };

      const url = editingProvider ? `/api/providers/${editingProvider.id}` : '/api/providers';
      const method = editingProvider ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProvider ? payload : { id: formData.id, ...payload }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save provider');

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(`Save Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      onRefresh();
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({
        id,
        success: data.success,
        latencyMs: data.latencyMs,
        error: data.error,
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

  return (
    <div className="space-y-6">
      {/* Top Banner and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#1c4d32]" />
            AI Provider Fleet
          </h2>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Configure official AI providers and custom endpoints. All API keys are securely encrypted via AES-256-GCM.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Provider</span>
        </button>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {providers.map((p) => {
          const isHealthy = p.health.status === 'healthy';
          const isTesting = testingId === p.id;
          const result = testResult?.id === p.id ? testResult : null;

          return (
            <div
              key={p.id}
              className={`bg-white border rounded-3xl p-6 flex flex-col justify-between shadow-xs transition ${
                p.enabled ? 'border-[#e8e2d8]' : 'border-[#e8e2d8]/60 opacity-70'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-stone-900">{p.name}</h3>
                      <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-bold bg-[#faf8f5] text-stone-600 rounded-md border border-[#e5dfd5]">
                        {p.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 font-mono mt-0.5 truncate max-w-[220px]" title={p.baseUrl}>
                      {p.baseUrl}
                    </p>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      isHealthy
                        ? 'bg-[#e2f1e6] text-[#1e5c36] border border-[#c4e6ce]'
                        : 'bg-[#fde8e8] text-[#9b1c1c] border border-[#fbd5d5]'
                    }`}
                  >
                    {p.health.status}
                  </span>
                </div>

                {/* Specs Box */}
                <div className="bg-[#faf8f5] border border-[#e8e2d8] rounded-2xl p-3.5 text-xs space-y-1.5 my-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Protocol:</span>
                    <span className="font-mono text-stone-800 text-[11px] font-semibold">{p.protocol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Priority / Retries:</span>
                    <span className="text-stone-800 font-medium">Tier {p.priority} (Max {p.maxRetries}x)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Timeout:</span>
                    <span className="text-stone-800 font-mono font-medium">{p.timeoutMs / 1000}s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Security:</span>
                    <span className="text-[#16a34a] flex items-center gap-1 text-[11px] font-semibold">
                      <Lock className="w-3 h-3" /> AES-256 Encrypted
                    </span>
                  </div>
                </div>

                {/* Models List */}
                <div className="text-xs">
                  <span className="text-stone-500 text-[11px] font-medium">Models ({p.models.length}):</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.models.slice(0, 3).map((m) => (
                      <span key={m} className="px-2 py-0.5 bg-[#f4efe8] text-stone-700 rounded-md text-[10px] font-mono">
                        {m}
                      </span>
                    ))}
                    {p.models.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-[#f4efe8] text-stone-500 rounded-md text-[10px]">
                        +{p.models.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Live Test Feedback banner */}
                {result && (
                  <div className={`mt-3 p-2.5 rounded-xl text-xs flex items-center justify-between ${
                    result.success
                      ? 'bg-[#ecf7ef] border border-[#cbe8d2] text-[#166534]'
                      : 'bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {result.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                      <span className="font-semibold">{result.success ? `Connected! Latency: ${result.latencyMs}ms` : result.error}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3.5 border-t border-[#f0eae1] flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestConnection(p.id)}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-800 border border-[#e4ded5] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Ping provider endpoint"
                >
                  <Activity className={`w-3.5 h-3.5 text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Pinging...' : 'Test Connection'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-2 text-stone-500 hover:text-stone-900 bg-[#faf8f5] hover:bg-[#f2ede4] border border-[#e4ded5] rounded-xl transition cursor-pointer"
                    title="Edit provider"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-2 text-stone-500 hover:text-rose-700 bg-[#faf8f5] hover:bg-rose-50 border border-[#e4ded5] rounded-xl transition cursor-pointer"
                    title="Delete provider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#e8e2d8] rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3">
              <h3 className="font-editorial text-xl font-medium text-stone-900">
                {editingProvider ? `Edit ${editingProvider.name}` : 'Configure New AI Provider'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Provider Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Together AI, DeepSeek V3"
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Provider ID *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingProvider)}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Category / Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as ProviderType })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="groq">Groq</option>
                    <option value="mistral">Mistral</option>
                    <option value="xai">xAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="together">Together AI</option>
                    <option value="custom">Custom Provider</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">API Protocol *</label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value as ApiProtocol })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b] font-mono"
                  >
                    <option value="openai-chat">OpenAI Chat Completions API</option>
                    <option value="anthropic-messages">Anthropic Messages API</option>
                    <option value="google-gemini">Google Gemini REST / SDK</option>
                    <option value="openai-responses">OpenAI Responses API</option>
                    <option value="custom-http">Custom HTTP Adapter</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">API Base URL * (SSRF Protected)</label>
                <input
                  type="url"
                  required
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">
                  API Key {editingProvider && '(Leave blank to retain encrypted existing key)'}
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={editingProvider ? '••••••••••••••••' : 'sk-...'}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Available Models (comma separated)</label>
                <input
                  type="text"
                  value={formData.models}
                  onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                  placeholder="model-1, model-2"
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Timeout (ms)</label>
                  <input
                    type="number"
                    value={formData.timeoutMs}
                    onChange={(e) => setFormData({ ...formData, timeoutMs: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Priority (1 = high)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-semibold">Max Retries</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={formData.maxRetries}
                    onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                    className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded border-[#e4ded5] text-[#205e3b]"
                />
                <label htmlFor="enabledCheck" className="text-stone-700 font-medium">
                  Enable provider in active routing pool
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#f0eae1]">
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
