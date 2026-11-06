import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  Download,
  Upload,
  CheckCircle2,
  Database,
  RotateCcw,
  CloudUpload,
  CloudDownload,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GatewaySettings } from '../../types/gateway.ts';
import { readApiJson } from '../../lib/api.ts';
import {
  saveGatewayConfigToCloud,
  loadGatewayConfigFromCloud,
  loginWithGoogle,
} from '../../lib/firebase.ts';
import firebaseConfig from '../../../firebase-applet-config.json';

interface SettingsViewProps {
  settings: GatewaySettings | null;
  currentUser: User | null;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  currentUser,
  onRefresh,
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
      const data = await readApiJson(res, 'Import Config API');
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

  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSyncSuccess, setCloudSyncSuccess] = useState<string | null>(null);
  const [cloudRestoreSuccess, setCloudRestoreSuccess] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const handleCloudBackup = async () => {
    setCloudSyncing(true);
    setCloudError(null);
    setCloudSyncSuccess(null);
    setCloudRestoreSuccess(null);
    try {
      if (!currentUser) {
        const loginRes = await loginWithGoogle();
        if (!loginRes.success) {
          throw new Error(loginRes.error || 'Please sign in with Google to backup to Firestore');
        }
      }
      const expRes = await fetch('/api/export-config');
      if (!expRes.ok) throw new Error('Failed to export current configuration');
      const configJson = await expRes.text();
      const res = await saveGatewayConfigToCloud(configJson);
      if (res.success) {
        setCloudSyncSuccess(`Saved to Cloud Firestore at ${new Date(res.updatedAt || '').toLocaleTimeString()}`);
        setTimeout(() => setCloudSyncSuccess(null), 6000);
      } else {
        throw new Error(res.error || 'Failed to save to Cloud Firestore');
      }
    } catch (err: any) {
      setCloudError(err.message || 'Cloud backup failed');
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleCloudRestore = async () => {
    setCloudSyncing(true);
    setCloudError(null);
    setCloudSyncSuccess(null);
    setCloudRestoreSuccess(null);
    try {
      if (!currentUser) {
        const loginRes = await loginWithGoogle();
        if (!loginRes.success) {
          throw new Error(loginRes.error || 'Please sign in with Google to restore from Firestore');
        }
      }
      const res = await loadGatewayConfigFromCloud();
      if (!res.success || !res.configJson) {
        throw new Error(res.error || 'No cloud backup found for this account');
      }
      const importRes = await fetch('/api/import-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: res.configJson }),
      });
      const data = await readApiJson(importRes, 'Import Config API');
      if (!importRes.ok || !data.success) throw new Error('Invalid cloud configuration');
      setCloudRestoreSuccess(`Restored configuration saved on ${new Date(res.updatedAt || '').toLocaleString()}`);
      setTimeout(() => setCloudRestoreSuccess(null), 6000);
      onRefresh();
    } catch (err: any) {
      setCloudError(err.message || 'Cloud restore failed');
    } finally {
      setCloudSyncing(false);
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
          Configure spending guardrails, timeout policies, retention days, and sanitized configuration backups.
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

      {/* Spending & Usage Limits Form */}
      <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-xs">
        <h3 className="font-semibold text-sm text-stone-900 mb-1">Execution & Spending Limits</h3>
        <p className="text-xs text-stone-500 mb-4">
          Request and monthly expenditure limits
        </p>

        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-stone-600 mb-1 font-medium">Daily Request Limit</label>
              <input
                type="number"
                min="10"
                value={formData.globalDailyRequestLimit}
                onChange={(e) => setFormData({ ...formData, globalDailyRequestLimit: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-medium">Monthly Limit ($)</label>
              <input
                type="number"
                min="1"
                value={formData.globalMonthlySpendingLimitUsd}
                onChange={(e) => setFormData({ ...formData, globalMonthlySpendingLimitUsd: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-medium">Timeout (ms)</label>
              <input
                type="number"
                min="5000"
                max="120000"
                value={formData.requestTimeoutMs}
                onChange={(e) => setFormData({ ...formData, requestTimeoutMs: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-medium">Max Retries</label>
              <input
                type="number"
                min="1"
                max="5"
                value={formData.maxRetries}
                onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-medium">Log Retention (Days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={formData.retentionDays}
                onChange={(e) => setFormData({ ...formData, retentionDays: Number(e.target.value) })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-[#205e3b]"
              />
            </div>

            <div>
              <label className="block text-stone-600 mb-1 font-medium">Owner Email</label>
              <input
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                className="w-full bg-[#faf8f5] border border-[#e4ded5] rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-none focus:border-[#205e3b]"
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

      {/* Firebase Cloud Connection & Cloud Sync Card */}
      <div className="bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-[#1c4d32]" />
              <h4 className="text-sm font-bold text-stone-900">Firebase Cloud Integration & Sync</h4>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#dcf0e2] text-[#1c4d32] border border-[#c3e5cd]">
                Connected
              </span>
            </div>
            <p className="text-xs text-stone-600">
              Connected to Firebase Project <code className="text-[#1c4d32] font-mono font-bold">{firebaseConfig.projectId}</code> for persistent Cloud Firestore storage and Google Authentication.
            </p>
          </div>

          {currentUser ? (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-[#d2e2d7] shadow-2xs self-start sm:self-auto">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-left">
                <p className="text-[11px] font-semibold text-stone-900 leading-tight">
                  {currentUser.displayName || 'Google Account'}
                </p>
                <p className="text-[10px] text-stone-500 truncate max-w-[160px] leading-tight">
                  {currentUser.email}
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => loginWithGoogle()}
              className="px-3 py-1.5 bg-white hover:bg-stone-50 text-stone-700 border border-[#d2e2d7] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
            >
              <LogIn className="w-3.5 h-3.5 text-stone-500" />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>

        {/* Cloud Sync Actions */}
        <div className="bg-white p-4 rounded-2xl border border-[#e4ded5] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <CloudUpload className="w-4 h-4 text-[#1c4d32]" />
                Cloud Firestore Config Snapshot
              </h5>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Save your custom Combos, Routing Rules, and Settings to your Firestore cloud profile so you can restore them anytime.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCloudBackup}
                disabled={cloudSyncing}
                className="px-3.5 py-2 bg-[#1c4d32] hover:bg-[#153a26] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {cloudSyncing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="w-3.5 h-3.5" />
                )}
                <span>{cloudSyncing ? 'Syncing...' : 'Backup to Cloud'}</span>
              </button>

              <button
                onClick={handleCloudRestore}
                disabled={cloudSyncing}
                className="px-3.5 py-2 bg-[#f0f7f2] hover:bg-[#e2f0e6] text-[#1c4d32] border border-[#cbe1d3] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                <span>Restore from Cloud</span>
              </button>
            </div>
          </div>

          {cloudSyncSuccess && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{cloudSyncSuccess}</span>
            </div>
          )}

          {cloudRestoreSuccess && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{cloudRestoreSuccess}</span>
            </div>
          )}

          {cloudError && (
            <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
              <span>{cloudError}</span>
              <button onClick={() => setCloudError(null)} className="font-semibold underline ml-2 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Project Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Project ID</span>
            <span className="text-stone-900 font-semibold">{firebaseConfig.projectId}</span>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Auth Domain</span>
            <span className="text-stone-700 truncate block">{firebaseConfig.authDomain}</span>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-[#e4ded5]">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider block font-sans font-semibold">Database Edition</span>
            <span className="text-stone-700 truncate block">Firestore (default)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
