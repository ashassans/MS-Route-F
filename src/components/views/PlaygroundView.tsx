import React, { useState, useEffect } from 'react';
import {
  Play,
  Send,
  Zap,
  Clock,
  Radio,
} from 'lucide-react';
import type { ModelConfig, ModelAlias, ComboConfig } from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';

interface PlaygroundViewProps {
  models: ModelConfig[];
  aliases: ModelAlias[];
  combos: ComboConfig[];
  onRefresh: () => void;
  onNavigate: (view: string) => void;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({
  models,
  aliases,
  combos,
  onRefresh,
  onNavigate,
}) => {
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>('anthropic');
  const [selectedModel, setSelectedModel] = useState<string>(
    aliases[0]?.alias || models[0]?.id || combos[0]?.id || 'auto'
  );
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [responseMeta, setResponseMeta] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'response' | 'json'>('response');

  const hasTargets = aliases.length > 0 || models.length > 0 || combos.length > 0;

  useEffect(() => {
    const validTargets = [
      'auto',
      ...aliases.map((a) => a.alias),
      ...models.map((m) => m.id),
      ...combos.map((c) => c.id),
    ];
    if (!validTargets.includes(selectedModel)) {
      setSelectedModel(aliases[0]?.alias || models[0]?.id || combos[0]?.id || 'auto');
    }
  }, [aliases, models, combos, selectedModel]);

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setOutput('');
    setResponseMeta(null);

    const startTime = Date.now();

    try {
      if (isStreaming) {
        const endpoint = protocol === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
        const body =
          protocol === 'anthropic'
            ? {
                model: selectedModel,
                ...(systemPrompt.trim() ? { system: systemPrompt.trim() } : {}),
                messages: [{ role: 'user', content: prompt.trim() }],
                stream: true,
              }
            : {
                model: selectedModel,
                messages: [
                  ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
                  { role: 'user', content: prompt.trim() },
                ],
                stream: true,
              };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-msroute-client': 'playground',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          let message = errText;
          try {
            const parsedErr = JSON.parse(errText);
            message = parsedErr?.error?.message || parsedErr?.error || errText;
          } catch {
            // keep raw text
          }
          throw new Error(`HTTP ${res.status}: ${message}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data:')) {
                const dataStr = trimmed.slice(5).trim();
                if (!dataStr || dataStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (protocol === 'anthropic') {
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      accumulated += parsed.delta.text;
                      setOutput(accumulated);
                    }
                  } else {
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                      accumulated += delta;
                      setOutput(accumulated);
                    }
                  }
                } catch {
                  // skip partial chunk
                }
              }
            }
          }
        }

        setResponseMeta({
          latencyMs: Date.now() - startTime,
          stream: true,
          protocol,
          model: selectedModel,
        });
      } else {
        const res = await fetch('/api/test/playground', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol,
            model: selectedModel,
            prompt: prompt.trim(),
            systemPrompt: systemPrompt.trim(),
            stream: false,
          }),
        });

        const data = await readApiJson(res, 'Playground API');
        if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');

        setOutput(data.content ?? data.output ?? '');
        setResponseMeta(data);
      }
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
          <Play className="w-5 h-5 text-[#1c4d32]" />
          Interactive API Sandbox
        </h2>
        <p className="text-xs text-stone-600 mt-1 max-w-2xl">
          Test live routing combos, model aliases, and SSE streaming with Anthropic Messages and OpenAI Chat Completions formats.
        </p>
      </div>

      {!hasTargets && (
        <div className="bg-[#fff8ea] border border-[#fde4ad] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8a5d15]">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              No AI providers or models are registered yet. Connect a provider with a valid upstream credential before dispatching live requests.
            </span>
          </div>
          <button
            onClick={() => onNavigate('providers')}
            className="px-3.5 py-1.5 bg-white hover:bg-[#faf8f5] text-stone-800 border border-[#e5dfd5] rounded-xl font-semibold transition cursor-pointer shrink-0"
          >
            Configure Provider →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request Form */}
        <div className="lg:col-span-5 bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-stone-900 border-b border-[#f0eae1] pb-2">
            Request Parameters
          </h3>

          <div>
            <label className="block text-stone-600 text-xs mb-1.5 font-semibold">API Protocol</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProtocol('anthropic')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  protocol === 'anthropic'
                    ? 'bg-[#dcf0e2] text-[#1c4d32] border-[#bfe4ca]'
                    : 'bg-[#faf8f5] text-stone-600 border-[#e4ded5] hover:bg-[#f2ede4]'
                }`}
              >
                Anthropic Messages
              </button>
              <button
                type="button"
                onClick={() => setProtocol('openai')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  protocol === 'openai'
                    ? 'bg-[#dcf0e2] text-[#1c4d32] border-[#bfe4ca]'
                    : 'bg-[#faf8f5] text-stone-600 border-[#e4ded5] hover:bg-[#f2ede4]'
                }`}
              >
                OpenAI Completions
              </button>
            </div>
          </div>

          <div>
            <label className="block text-stone-600 text-xs mb-1.5 font-semibold">Routing Target</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 text-xs font-mono focus:outline-none focus:border-[#205e3b]"
            >
              <option value="auto">auto (Gateway Default Policy)</option>
              {aliases.length > 0 && (
                <optgroup label="Model Aliases">
                  {aliases.map((a) => (
                    <option key={a.alias} value={a.alias}>
                      {a.alias} ({a.targetType} → {a.targetId})
                    </option>
                  ))}
                </optgroup>
              )}
              {models.length > 0 && (
                <optgroup label="Registered Models">
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.id})
                    </option>
                  ))}
                </optgroup>
              )}
              {combos.length > 0 && (
                <optgroup label="Combos">
                  {combos.map((c) => (
                    <option key={c.id} value={c.id}>
                      Combo: {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-stone-600 text-xs mb-1 font-semibold">System Prompt (Optional)</label>
            <textarea
              rows={2}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional system instructions..."
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-2.5 text-stone-800 text-xs focus:outline-none focus:border-[#205e3b]"
            />
          </div>

          <div>
            <label className="block text-stone-600 text-xs mb-1 font-semibold">User Message *</label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type a message to send through your gateway..."
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-2.5 text-stone-800 text-xs focus:outline-none focus:border-[#205e3b]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isStreaming}
                onChange={(e) => setIsStreaming(e.target.checked)}
                className="rounded border-[#e4ded5] text-[#205e3b]"
              />
              <span className="flex items-center gap-1 font-semibold">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> SSE Streaming
              </span>
            </label>

            <button
              onClick={handleSend}
              disabled={loading || !prompt.trim()}
              className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Dispatching...' : 'Dispatch Request'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Output */}
        <div className="lg:col-span-7 bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#f0eae1] pb-3 mb-3">
              <div className="flex bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-0.5 text-xs">
                <button
                  onClick={() => setActiveTab('response')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    activeTab === 'response' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Model Output
                </button>
                <button
                  onClick={() => setActiveTab('json')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    activeTab === 'json' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Raw Gateway Telemetry
                </button>
              </div>

              {responseMeta && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    {responseMeta.latencyMs}ms
                  </span>
                </div>
              )}
            </div>

            {activeTab === 'response' ? (
              <div className="min-h-[260px] max-h-[380px] overflow-y-auto bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs text-stone-800 font-mono whitespace-pre-wrap leading-relaxed select-text">
                {output ? (
                  output
                ) : (
                  <span className="text-stone-400 italic">
                    Enter a message and click &apos;Dispatch Request&apos; to test live upstream execution. Streamed SSE tokens render here in real time.
                  </span>
                )}
              </div>
            ) : (
              <pre className="min-h-[260px] max-h-[380px] overflow-y-auto bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs text-stone-800 font-mono leading-relaxed">
                {JSON.stringify(
                  responseMeta || { status: 'idle', note: 'Dispatch a request to inspect live gateway trace metadata' },
                  null,
                  2
                )}
              </pre>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-xs text-stone-500 flex items-center justify-between">
            <span>
              Client Header: <code className="text-stone-700 font-mono font-semibold">x-msroute-client: playground</code>
            </span>
            <span className="text-[#16a34a] font-semibold">Live Endpoint</span>
          </div>
        </div>
      </div>
    </div>
  );
};
