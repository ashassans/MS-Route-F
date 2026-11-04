import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ShieldAlert,
  Save,
  Download,
  Upload,
  CheckCircle2,
  Database,
  RotateCcw,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GatewaySettings } from '../../types/gateway.ts';
import firebaseConfig from '../../../firebase-applet-config.json';

interface SettingsViewProps {
  settings: GatewaySettings | null;
  currentUser: User | null;
  onRefresh: () => void;
  onToggleKillSwitch: (enable: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  currentUser,
  onRefresh,
  onToggleKillSwitch,
}) => {
  const [formData, setFormData] = useState({
    globalDailyRequestLimit: settings?.globalDailyRequestLimit ?? 5000,
    globalMonthlySpendingLimitUsd: settings?.globalMonthlySpendingLimitUsd ?? 150,
    requestTimeoutMs: settings?.requestTimeoutMs ?? 35000,
    maxRetries: settings?.maxRetries ?? 3,
    retentionDays: settings?.retentionDays ?? 30,
    ownerEmail: settings?.ownerEmail || currentUser?.email || '',
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData({
        globalDailyRequestLimit: settings.globalDailyRequestLimit ?? 5000,
        globalMonthlySpendingLimitUsd: settings.globalMonthlySpendingLimitUsd ?? 150,
        requestTimeoutMs: settings.requestTimeoutMs ?? 35000,
        maxRetries: settings.maxRetries ?? 3,
        retentionDays: settings.retentionDays ?? 30,
        ownerEmail: settings.ownerEmail || currentUser?.email || '',
      });
    }
  }, [settings, currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/export-config');
      if (!res.ok) throw new Error('Export failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `msroute-config-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch('/api/import-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: importJson }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('Invalid configuration JSON');
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
      setImportJson('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(`Import error: ${err.message}`);
    }
  };

  const handleResetGateway = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/reset-state', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset gateway state');
      setConfirmReset(false);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#1c4d32]" />
          Gateway Infrastructure Settings
        </h2>
        <p className="text-xs text-stone-600 mt-1 max-w-2xl">
          Configure spending guardrails, emergency kill switch, timeout policies, and sanitized configuration backups.
        </p>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Emergency Kill Switch Section */}
      <div
        className={`border rounded-3xl p-6 transition shadow-xs ${
          settings?.emergencyKillSwitch ? 'bg-rose-50 border-rose-300' : 'bg-white border-[#e8e2d8]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                settings?.emergencyKillSwitch
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                Emergency Gateway Kill Switch
                {settings?.emergencyKillSwitch && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-full uppercase animate-pulse">
                    Active
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-600 mt-0.5 max-w-xl leading-relaxed">
                Immediately blocks all outgoing API requests to external AI providers. Incoming client requests return HTTP 503.
              </p>
            </div>
          </div>

          <button
            onClick={() => onToggleKillSwitch(!settings?.emergencyKillSwitch)}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer shadow-xs shrink-0 ${
              settings?.emergencyKillSwitch
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            {settings?.emergencyKillSwitch ? 'Deactivate Kill Switch & Resume' : 'Activate Emergency Kill Switch'}
          </button>
        </div>
      </div>

      {/* Spending & Usage Limits Form */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 shadow-xs">
        <h3 className="font-bold text-sm text-stone-900 mb-1">Execution & Spending Guardrails</h3>
        <p className="text-xs text-stone-500 mb-4">
          Enforce request and monthly expenditure caps across all gateway endpoints.
        </p>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Daily Request Limit (Global)</label>
              <input
                type="number"
                min="10"
                value={formData.globalDailyRequestLimit}
                onChange={(e) => setFormData({ ...formData, globalDailyRequestLimit: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Monthly Spending Limit ($ USD)</label>
              <input
                type="number"
                min="1"
                value={formData.globalMonthlySpendingLimitUsd}
                onChange={(e) => setFormData({ ...formData, globalMonthlySpendingLimitUsd: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Global Request Timeout (ms)</label>
              <input
                type="number"
                min="5000"
                max="120000"
                value={formData.requestTimeoutMs}
                onChange={(e) => setFormData({ ...formData, requestTimeoutMs: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Max Failover Retries per Hop</label>
              <input
                type="number"
                min="1"
                max="5"
                value={formData.maxRetries}
                onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Log Retention (Days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={formData.retentionDays}
                onChange={(e) => setFormData({ ...formData, retentionDays: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-semibold">Gateway Owner Email (Optional)</label>
              <input
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                placeholder="owner@yourdomain.com"
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-3 py-2 text-stone-800 focus:outline-none focus:border-[#205e3b]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#f0eae1]">
            {saveSuccess ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Guardrails updated successfully!
              </span>
            ) : (
              <span className="text-stone-500">Settings apply immediately across all gateway routes</span>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Guardrails'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Backup, Restore & Factory Reset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs space-y-4">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-1">
              <Download className="w-4 h-4 text-[#16a34a]" />
              Export & Reset Configuration
            </h4>
            <p className="text-xs text-stone-500 leading-relaxed">
              Download your non-secret gateway configuration (models, aliases, combos, routing rules) as JSON, or reset the local gateway store to a clean slate.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={handleExport}
              className="w-full px-4 py-2.5 bg-[#faf8f5] hover:bg-[#f2ede4] text-stone-800 border border-[#e4ded5] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download msroute-config.json</span>
            </button>

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetGateway}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold cursor-pointer"
                >
                  Confirm Full Reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="w-full px-4 py-2 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-[#e4ded5] hover:border-rose-200 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{resetSuccess ? 'Gateway Reset Complete' : 'Reset Gateway State'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded-3xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4 text-[#0284c7]" />
              Import Configuration
            </h4>
            <p className="text-xs text-stone-500 mb-2">
              Paste a previously exported configuration JSON to restore models, aliases, combos, and rules.
            </p>
            <textarea
              rows={3}
              placeholder='Paste JSON here: { "models": [...], "aliases": [...], ... }'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl p-2.5 text-stone-800 font-mono text-xs focus:outline-none focus:border-[#205e3b]"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            {importSuccess && (
              <span className="text-emerald-700 text-xs font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Restored successfully!
              </span>
            )}
            <button
              onClick={handleImport}
              disabled={!importJson.trim()}
              className="ml-auto px-4 py-2 bg-[#b9dbc3] hover:bg-[#a8cfb3] text-[#143a24] rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>Import Config</span>
            </button>
          </div>
        </div>
      </div>

      {/* Firebase Cloud Connection Card */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-5 h-5 text-[#1c4d32]" />
          <h4 className="text-sm font-bold text-stone-900">Firebase Cloud Integration</h4>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd]">
            Configured
          </span>
        </div>
        <p className="text-xs text-stone-600">
          Connected to Firebase Project <code className="text-[#1c4d32] font-mono font-bold">{firebaseConfig.projectId}</code> for Cloud Firestore persistence & Google Authentication.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs font-mono">
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Project ID</span>
            <span className="text-stone-900 font-semibold">{firebaseConfig.projectId}</span>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Auth Domain</span>
            <span className="text-stone-700 truncate block">{firebaseConfig.authDomain}</span>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Storage Bucket</span>
            <span className="text-stone-700 truncate block">{firebaseConfig.storageBucket}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
