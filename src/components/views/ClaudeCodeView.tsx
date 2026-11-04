import React, { useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Play,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ClaudeSuiteReport } from '../../server/testing/claude-suite.ts';
import { GatewayApiKey } from '../../types/gateway.ts';

interface ClaudeCodeViewProps {
  apiKeys: GatewayApiKey[];
}

export const ClaudeCodeView: React.FC<ClaudeCodeViewProps> = ({ apiKeys }) => {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [testingSuite, setTestingSuite] = useState(false);
  const [suiteReport, setSuiteReport] = useState<ClaudeSuiteReport | null>(null);

  const activeKey = apiKeys.find((k) => !k.revoked) || apiKeys[0];
  const gatewayUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-msroute-domain.com';

  const bashConfig = `# MSRoute — Claude Code Configuration
export ANTHROPIC_BASE_URL="${gatewayUrl}"
export ANTHROPIC_AUTH_TOKEN="${activeKey?.keyPrefix || 'gw-live-master-key-prod-001'}"
export ANTHROPIC_DEFAULT_SONNET_MODEL="combo-prod-coding"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-3-7-sonnet"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-3-5-haiku"`;

  const handleCopyBash = () => {
    navigator.clipboard.writeText(bashConfig);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const handleRunSuite = async () => {
    setTestingSuite(true);
    setSuiteReport(null);
    try {
      const res = await fetch('/api/test/claude-suite', { method: 'POST' });
      const report: ClaudeSuiteReport = await res.json();
      setSuiteReport(report);
    } catch (err: any) {
      alert(`Error running compatibility suite: ${err.message}`);
    } finally {
      setTestingSuite(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd] rounded-full uppercase tracking-wider">
                Claude Code Client
              </span>
              <span className="text-xs text-stone-500">Anthropic Messages API Compatible</span>
            </div>
            <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2 tracking-tight">
              <Terminal className="w-5 h-5 text-[#1c4d32]" />
              Claude Code Setup & Verification Suite
            </h2>
            <p className="text-xs text-stone-600 mt-1 max-w-2xl leading-relaxed">
              Connect the official Anthropic Claude Code CLI tool through your private MSRoute Cloud gateway. Claude Code seamlessly leverages your multi-provider failover combos and zero-rate-limit resilience.
            </p>
          </div>

          <button
            onClick={handleRunSuite}
            disabled={testingSuite}
            className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${testingSuite ? 'animate-spin' : ''}`} />
            <span>{testingSuite ? 'Executing 10 Checks...' : 'Run 10-Point Compatibility Suite'}</span>
          </button>
        </div>
      </div>

      {/* Terminal Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Export Shell Environment */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd] flex items-center justify-center text-xs font-bold">1</span>
                Terminal Environment Configuration
              </h3>
              <button
                onClick={handleCopyBash}
                className="text-xs text-[#205e3b] hover:text-[#133d26] flex items-center gap-1 font-semibold cursor-pointer"
              >
                {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEnv ? 'Copied Commands!' : 'Copy to Shell'}</span>
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Add these variables to your <code className="text-stone-800 font-mono font-semibold bg-[#faf8f5] px-1 py-0.5 rounded">~/.zshrc</code>, <code className="text-stone-800 font-mono font-semibold bg-[#faf8f5] px-1 py-0.5 rounded">~/.bashrc</code>, or run them directly in your shell:
            </p>

            <pre className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs font-mono text-stone-800 overflow-x-auto leading-relaxed select-all">
              {bashConfig}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-xs text-stone-500 flex items-center justify-between">
            <span>Gateway Target:</span>
            <code className="text-[#205e3b] font-mono font-semibold">{gatewayUrl}/v1/messages</code>
          </div>
        </div>

        {/* Step 2: Launch Claude Code */}
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd] flex items-center justify-center text-xs font-bold">2</span>
                Launch Claude Code
              </h3>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Once the environment variables are active in your shell, launch Claude Code. All requests are routed through your cloud gateway:
            </p>

            <div className="space-y-3">
              <div className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-3.5 font-mono text-xs text-[#15803d] flex items-center justify-between font-semibold">
                <span>$ claude</span>
                <span className="text-[10px] text-stone-400 font-normal">Interactive CLI</span>
              </div>

              <div className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-3.5 font-mono text-xs text-[#0284c7] flex items-center justify-between font-semibold">
                <span>$ claude "explain src/App.tsx"</span>
                <span className="text-[10px] text-stone-400 font-normal">One-off query</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0eae1] text-xs text-stone-500">
            <span>All tool-use calls and streaming tokens are converted on-the-fly.</span>
          </div>
        </div>
      </div>

      {/* Test Suite Results */}
      {suiteReport && (
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Claude Code Compatibility Report
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                {suiteReport.checksPassed} of {suiteReport.totalChecks} verification checks passed ({suiteReport.summary})
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              suiteReport.allPassed ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              {suiteReport.allPassed ? '100% Compatible' : 'Partial Pass'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suiteReport.details.map((check) => (
              <div
                key={check.step}
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  check.passed ? 'bg-[#f7fbf8] border-[#d8edd9]' : 'bg-[#fff8f8] border-[#fcdada]'
                }`}
              >
                {check.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-900">{check.name}</span>
                    <span className="text-[10px] text-stone-500 font-mono">{check.latencyMs}ms</span>
                  </div>
                  <p className="text-[11px] text-stone-600 mt-0.5">{check.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
