import React, { useState } from 'react';
import {
  SendHorizontal,
  Copy,
  Check,
  KeyRound,
  Code2,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { GatewayApiKey, ModelConfig, ComboConfig } from '../../types/gateway.ts';

interface MakeRequestViewProps {
  apiKeys: GatewayApiKey[];
  models: ModelConfig[];
  combos: ComboConfig[];
  onNavigate: (view: string) => void;
}

export const MakeRequestView: React.FC<MakeRequestViewProps> = ({
  apiKeys,
  models,
  combos,
  onNavigate,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<'openai' | 'anthropic'>('openai');

  const activeKey = apiKeys.find((k) => !k.revoked) || null;
  const gatewayUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-msroute-domain.com';

  const defaultTarget = combos[0]?.id || models[0]?.id || 'auto';
  const tokenDisplay = activeKey ? `<YOUR_FULL_KEY_FOR_${activeKey.keyPrefix}>` : '<YOUR_MSROUTE_GATEWAY_KEY>';

  const openAiCurl = `curl -X POST "${gatewayUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenDisplay}" \\
  -d '{
    "model": "${defaultTarget}",
    "messages": [
      { "role": "user", "content": "Hello via MSRoute Gateway!" }
    ],
    "temperature": 0.7
  }'`;

  const anthropicCurl = `curl -X POST "${gatewayUrl}/v1/messages" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${tokenDisplay}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "${defaultTarget}",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "Hello via MSRoute Gateway!" }
    ]
  }'`;

  const pythonCode = `from openai import OpenAI

client = OpenAI(
    base_url="${gatewayUrl}/v1",
    api_key="${tokenDisplay}"
)

response = client.chat.completions.create(
    model="${defaultTarget}",
    messages=[{"role": "user", "content": "Hello via MSRoute!"}]
)

print(response.choices[0].message.content)`;

  const jsCode = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${gatewayUrl}/v1",
  apiKey: "${tokenDisplay}",
});

const completion = await openai.chat.completions.create({
  model: "${defaultTarget}",
  messages: [{ role: "user", content: "Hello via MSRoute!" }],
});

console.log(completion.choices[0].message.content);`;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const currentCurl = selectedProtocol === 'openai' ? openAiCurl : anthropicCurl;
  const endpointPath = selectedProtocol === 'openai' ? '/v1/chat/completions' : '/v1/messages';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-editorial text-xl sm:text-2xl font-medium text-stone-900 flex items-center gap-2">
              <SendHorizontal className="w-5 h-5 text-[#1c4d32]" />
              Make a Request
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              cURL & SDK code snippets with auto-failover
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 bg-white/80 p-1 border border-[#d2e2d7] rounded-2xl shadow-2xs">
            <button
              onClick={() => setSelectedProtocol('openai')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedProtocol === 'openai'
                  ? 'bg-[#1c4d32] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              OpenAI API
            </button>
            <button
              onClick={() => setSelectedProtocol('anthropic')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedProtocol === 'anthropic'
                  ? 'bg-[#1c4d32] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Anthropic API
            </button>
          </div>
        </div>
      </div>

      {!activeKey && (
        <div className="bg-[#fff8ea] border border-[#fde4ad] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8a5d15] shadow-2xs">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              No active gateway key found. Generate an API Key in <strong className="font-semibold">API Keys</strong> to authenticate your requests.
            </span>
          </div>
          <button
            onClick={() => onNavigate('keys')}
            className="px-3.5 py-1.5 bg-white hover:bg-[#faf8f5] text-stone-800 border border-[#e5dfd5] rounded-xl font-semibold transition cursor-pointer shrink-0 shadow-2xs"
          >
            Generate Key →
          </button>
        </div>
      )}

      {/* Primary cURL Card */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl p-5 md:p-6 shadow-xs transition hover:border-[#d6cebf]">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-xl bg-[#eef6fc] text-[#0369a1] border border-[#d4e8f7] flex items-center justify-center text-xs font-bold font-mono">
              $
            </span>
            <h3 className="font-bold text-sm text-stone-900">
              cURL Request ({selectedProtocol === 'openai' ? 'OpenAI Format' : 'Anthropic Format'})
            </h3>
          </div>
          <button
            onClick={() => handleCopy(currentCurl, 'curl')}
            className="text-xs text-[#205e3b] hover:text-[#133d26] flex items-center gap-1.5 font-semibold cursor-pointer px-3 py-1.5 bg-[#faf8f5] hover:bg-[#f2ede4] border border-[#e4ded5] rounded-xl transition shadow-2xs"
          >
            {copiedType === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedType === 'curl' ? 'Copied cURL!' : 'Copy cURL'}</span>
          </button>
        </div>

        <p className="text-xs text-stone-500 mb-3">
          Copy and run in terminal or import into Postman/Insomnia:
        </p>

        <pre className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs font-mono text-stone-800 overflow-x-auto leading-relaxed select-all">
          {currentCurl}
        </pre>

        <div className="mt-4 pt-3 border-t border-[#f0eae1] flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span>Target Endpoint:</span>
            <code className="text-[#205e3b] font-mono font-semibold">{gatewayUrl}{endpointPath}</code>
          </div>
          <button
            onClick={() => onNavigate('playground')}
            className="text-[#205e3b] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open in Interactive Playground →</span>
          </button>
        </div>
      </div>

      {/* Code Snippets for SDKs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Python Card */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-5 md:p-6 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#0284c7]" />
                Python (OpenAI SDK)
              </h3>
              <button
                onClick={() => handleCopy(pythonCode, 'python')}
                className="text-xs text-[#205e3b] hover:text-[#133d26] flex items-center gap-1 font-semibold cursor-pointer transition"
              >
                {copiedType === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'python' ? 'Copied Python!' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Just set <code className="bg-[#faf8f5] px-1 py-0.5 rounded font-mono text-stone-700">base_url</code> to your MSRoute gateway:
            </p>

            <pre className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs font-mono text-stone-800 overflow-x-auto leading-relaxed select-all">
              {pythonCode}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-xs text-stone-500 flex items-center justify-between">
            <span>Library:</span>
            <code className="text-stone-800 font-mono font-semibold">pip install openai</code>
          </div>
        </div>

        {/* Node.js Card */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-5 md:p-6 flex flex-col justify-between shadow-xs transition hover:border-[#d6cebf]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#15803d]" />
                Node.js / TypeScript
              </h3>
              <button
                onClick={() => handleCopy(jsCode, 'js')}
                className="text-xs text-[#205e3b] hover:text-[#133d26] flex items-center gap-1 font-semibold cursor-pointer transition"
              >
                {copiedType === 'js' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'js' ? 'Copied Node.js!' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Direct drop-in replacement with standard <code className="bg-[#faf8f5] px-1 py-0.5 rounded font-mono text-stone-700">baseURL</code>:
            </p>

            <pre className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs font-mono text-stone-800 overflow-x-auto leading-relaxed select-all">
              {jsCode}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-xs text-stone-500 flex items-center justify-between">
            <span>Package:</span>
            <code className="text-stone-800 font-mono font-semibold">npm i openai</code>
          </div>
        </div>
      </div>
    </div>
  );
};
