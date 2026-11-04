import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, testConnection } from './lib/firebase.ts';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { OverviewView } from './components/views/OverviewView.tsx';
import { ProvidersView } from './components/views/ProvidersView.tsx';
import { ModelsView } from './components/views/ModelsView.tsx';
import { RoutingView } from './components/views/RoutingView.tsx';
import { ComboBuilderView } from './components/views/ComboBuilderView.tsx';
import { ApiKeysView } from './components/views/ApiKeysView.tsx';
import { ClaudeCodeView } from './components/views/ClaudeCodeView.tsx';
import { PlaygroundView } from './components/views/PlaygroundView.tsx';
import { AnalyticsView } from './components/views/AnalyticsView.tsx';
import { RequestLogsView } from './components/views/RequestLogsView.tsx';
import { HealthView } from './components/views/HealthView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import type {
  ProviderConfig,
  ModelConfig,
  ModelAlias,
  ComboConfig,
  RoutingRule,
  GatewayApiKey,
  RequestLog,
  GatewayAnalytics,
  GatewaySettings,
} from './types/gateway.ts';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('overview');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [aliases, setAliases] = useState<ModelAlias[]>([]);
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [apiKeys, setApiKeys] = useState<GatewayApiKey[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [analytics, setAnalytics] = useState<GatewayAnalytics | null>(null);
  const [settings, setSettings] = useState<GatewaySettings | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    try {
      const [
        provRes,
        modRes,
        aliasRes,
        comboRes,
        ruleRes,
        keyRes,
        logRes,
        anaRes,
        setRes,
      ] = await Promise.all([
        fetch('/api/providers'),
        fetch('/api/models'),
        fetch('/api/aliases'),
        fetch('/api/combos'),
        fetch('/api/rules'),
        fetch('/api/keys'),
        fetch('/api/logs?limit=100'),
        fetch('/api/analytics?range=7d'),
        fetch('/api/settings'),
      ]);

      if (provRes.ok) setProviders(await provRes.json());
      if (modRes.ok) setModels(await modRes.json());
      if (aliasRes.ok) setAliases(await aliasRes.json());
      if (comboRes.ok) setCombos(await comboRes.json());
      if (ruleRes.ok) setRules(await ruleRes.json());
      if (keyRes.ok) setApiKeys(await keyRes.json());
      if (logRes.ok) setLogs(await logRes.json());
      if (anaRes.ok) setAnalytics(await anaRes.json());
      if (setRes.ok) setSettings(await setRes.json());
      setBannerError(null);
    } catch (err) {
      console.error('Error fetching gateway state:', err);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    testConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, [fetchAllData]);

  const handleToggleKillSwitch = async (enabled: boolean) => {
    try {
      const res = await fetch('/api/emergency-kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (settings) {
        setSettings({ ...settings, emergencyKillSwitch: data.emergencyKillSwitch });
      }
    } catch (err: any) {
      setBannerError(`Failed to update kill switch: ${err.message}`);
    }
  };

  const activeProviderCount = providers.filter((p) => p.enabled).length;
  const activeKeyCount = apiKeys.filter((k) => !k.revoked).length;
  const degradedProviderCount = providers.filter(
    (p) => p.enabled && (p.health.status === 'degraded' || p.health.status === 'unavailable')
  ).length;

  return (
    <div className="flex h-screen bg-[#faf8f5] text-stone-800 font-sans antialiased overflow-hidden selection:bg-[#c2e4cc] selection:text-[#143a24]">
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        errorCount={degradedProviderCount}
        currentUser={currentUser}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#faf8f5]">
        <Header
          currentView={currentView}
          settings={settings}
          onToggleKillSwitch={handleToggleKillSwitch}
          activeProviderCount={activeProviderCount}
          activeKeyCount={activeKeyCount}
          currentUser={currentUser}
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {bannerError && (
              <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
                <span>{bannerError}</span>
                <button
                  onClick={() => setBannerError(null)}
                  className="font-semibold underline ml-4 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {currentView === 'overview' && (
              <OverviewView
                providers={providers}
                models={models}
                combos={combos}
                apiKeys={apiKeys}
                logs={logs}
                analytics={analytics}
                settings={settings}
                onNavigate={setCurrentView}
              />
            )}

            {currentView === 'providers' && (
              <ProvidersView
                providers={providers}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'models' && (
              <ModelsView
                models={models}
                aliases={aliases}
                providers={providers}
                combos={combos}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'routing' && (
              <RoutingView
                rules={rules}
                settings={settings}
                models={models}
                combos={combos}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'combos' && (
              <ComboBuilderView
                combos={combos}
                providers={providers}
                models={models}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'keys' && (
              <ApiKeysView
                apiKeys={apiKeys}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'claudecode' && (
              <ClaudeCodeView
                apiKeys={apiKeys}
                models={models}
                combos={combos}
                onNavigate={setCurrentView}
              />
            )}

            {currentView === 'playground' && (
              <PlaygroundView
                models={models}
                aliases={aliases}
                combos={combos}
                onRefresh={fetchAllData}
                onNavigate={setCurrentView}
              />
            )}

            {currentView === 'analytics' && (
              <AnalyticsView
                analytics={analytics}
              />
            )}

            {currentView === 'logs' && (
              <RequestLogsView
                logs={logs}
                onRefresh={fetchAllData}
              />
            )}

            {currentView === 'health' && (
              <HealthView
                providers={providers}
                onRefresh={fetchAllData}
                onNavigate={setCurrentView}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView
                settings={settings}
                currentUser={currentUser}
                onRefresh={fetchAllData}
                onToggleKillSwitch={handleToggleKillSwitch}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
