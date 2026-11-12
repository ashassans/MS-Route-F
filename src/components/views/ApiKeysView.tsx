import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import type { GatewayApiKey } from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';

interface ApiKeysViewProps {
  apiKeys: GatewayApiKey[];
  onRefresh: () => void;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({ apiKeys, onRefresh }) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(600);
  const [permissions, setPermissions] = useState<string[]>(['all']);

  const handleTogglePerm = (perm: string) => {
    if (perm === 'all') {
      setPermissions(['all']);
      return;
    }
    const withoutAll = permissions.filter((p) => p !== 'all');
    if (withoutAll.includes(perm)) {
      const next = withoutAll.filter((p) => p !== perm);
      setPermissions(next.length > 0 ? next : ['all']);
    } else {
      setPermissions([...withoutAll, perm]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorMsg(null);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), rateLimitPerMinute, permissions }),
      });
      const data = await readApiJson(res, 'API Keys');
      if (!res.ok) throw new Error(data.error || 'Failed to create key');

      setIsCreateModalOpen(false);
      setName('');
      setPermissions(['all']);
      setCreatedKeyData({ rawKey: data.key.rawKey, name: data.key.name });
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to generate key');
    }
  };

  const handleRevoke = async (id: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke key');
      setConfirmRevokeId(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#eff6f2] border border-[#d6e5dc] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h2 className="font-editorial text-xl sm:text-2xl font-medium text-stone-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1c4d32]" />
            API Keys
          </h2>
        </div>
        <button
          onClick={() => {
            setErrorMsg(null);
            setIsCreateModalOpen(true);
          }}
          className="px-3.5 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Key</span>
        </button>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* API Keys Table */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#f0eae1] flex items-center justify-between">
          <h3 className="font-bold text-sm text-stone-900">Keys ({apiKeys.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0eae1] bg-[#faf8f5] text-stone-600 font-semibold">
                <th className="p-4">Key</th>
                <th className="p-4">Permissions</th>
                <th className="p-4">Rate Limit</th>
                <th className="p-4">Last Used</th>
                <th className="p-4">Created</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e8]">
              {apiKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-500">
                    No keys
                  </td>
                </tr>
              ) : (
                apiKeys.map((k) => {
                  const isRevoked = k.revoked;
                  const isConfirming = confirmRevokeId === k.id;
                  return (
                    <tr key={k.id} className="hover:bg-[#faf8f5] transition">
                      <td className="p-4">
                        <div className="font-semibold text-stone-900">{k.name}</div>
                        <div className="font-mono text-[11px] text-[#a16207] font-semibold mt-0.5">{k.keyPrefix}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {k.permissions.map((p) => (
                            <span key={p} className="px-2 py-0.5 bg-[#f4efe8] text-stone-700 rounded-md font-mono text-[10px] font-medium">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-stone-700 font-medium">{k.rateLimitPerMinute} req/min</td>
                      <td className="p-4 text-stone-500 text-[11px]">
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : 'Never'}
                      </td>
                      <td className="p-4 text-stone-500 text-[11px]">{new Date(k.createdAt).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        {isRevoked ? (
                          <span className="text-stone-400 font-semibold text-[11px]">Revoked</span>
                        ) : isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleRevoke(k.id)}
                              className="px-2.5 py-1 bg-rose-600 text-white rounded-xl text-[11px] font-bold cursor-pointer"
                            >
                              Confirm Revoke
                            </button>
                            <button
                              onClick={() => setConfirmRevokeId(null)}
                              className="px-2 py-1 bg-stone-100 text-stone-700 rounded-xl text-[11px] font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRevokeId(k.id)}
                            className="px-2.5 py-1 bg-[#faf8f5] hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-[#e5dfd5] hover:border-rose-200 rounded-xl text-[11px] font-semibold transition cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {isCreateModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 flex min-h-screen items-center justify-center">
          <div className="relative w-full max-w-md my-auto bg-white border border-[#e8e2d8] rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#f0eae1] px-5 sm:px-6 py-4 shrink-0 bg-white">
              <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">Generate Key</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5 text-xs flex-1">
              <div>
                <label className="block text-stone-600 mb-1 font-medium">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-medium">Rate Limit (req/min)</label>
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={rateLimitPerMinute}
                  onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                  className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
                />
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-medium">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'messages', 'completions', 'models'] as const).map((perm) => {
                    const active = permissions.includes(perm);
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => handleTogglePerm(perm)}
                        className={`px-3 py-1 rounded-xl font-mono text-[11px] font-semibold border transition cursor-pointer ${
                          active
                            ? 'bg-[#dcf0e2] text-[#1c4d32] border-[#bfe4ca]'
                            : 'bg-[#faf8f5] text-stone-600 border-[#e4ded5]'
                        }`}
                      >
                        {perm}
                      </button>
                    );
                  })}
                </div>
              </div>

              </div>

              {/* Fixed Footer */}
              <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-3.5 border-t border-[#f0eae1] bg-[#faf8f5] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-[#e4ded5] rounded-xl font-medium transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl font-semibold transition cursor-pointer shadow-xs text-xs"
                >
                  Create Key
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Reveal Key Modal */}
      {createdKeyData && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 flex min-h-screen items-center justify-center">
          <div className="relative w-full max-w-lg my-auto bg-white border border-[#e8e2d8] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto animate-fade-in">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h3 className="font-editorial text-lg font-medium text-stone-900">Key Generated</h3>
            </div>

            <div className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 font-mono text-xs text-[#a16207] break-all select-all font-semibold">
              {createdKeyData.rawKey}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0eae1]">
              <button
                onClick={() => handleCopy(createdKeyData.rawKey)}
                className="px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Key!' : 'Copy to Clipboard'}</span>
              </button>
              <button
                onClick={() => setCreatedKeyData(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
