import React from 'react';
import {
  ShieldAlert,
  Key,
  Layers,
  ExternalLink,
  Copy,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GatewaySettings } from '../types/gateway.ts';
import { loginWithGoogle, logoutUser } from '../lib/firebase.ts';
import firebaseConfig from '../../firebase-applet-config.json';

interface HeaderProps {
  currentView: string;
  settings: GatewaySettings | null;
  onToggleKillSwitch: (enable: boolean) => void;
  activeProviderCount: number;
  activeKeyCount: number;
  currentUser: User | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  settings,
  onToggleKillSwitch,
  activeProviderCount,
  activeKeyCount,
  currentUser,
}) => {
  const isKillSwitchActive = settings?.emergencyKillSwitch;
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [showDomainModal, setShowDomainModal] = React.useState(false);
  const [showProviderModal, setShowProviderModal] = React.useState(false);
  const [domainToAuthorize, setDomainToAuthorize] = React.useState('');
  const [copiedDomain, setCopiedDomain] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await loginWithGoogle();
      if (!res.success) {
        if (res.code === 'auth/operation-not-allowed' || res.error?.includes('auth/operation-not-allowed')) {
          setShowProviderModal(true);
        } else if (res.unauthorizedDomain || res.code === 'auth/unauthorized-domain') {
          const domain = res.unauthorizedDomain || (typeof window !== 'undefined' ? window.location.hostname : '');
          setDomainToAuthorize(domain);
          setShowDomainModal(true);
        } else if (res.code !== 'auth/popup-closed-by-user') {
          setAuthError(res.error || 'Authentication failed');
        }
      }
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('auth/operation-not-allowed')) {
        setShowProviderModal(true);
      } else if (err?.code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
        setDomainToAuthorize(domain);
        setShowDomainModal(true);
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setAuthError(err?.message || 'Sign-in failed');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCopyDomain = () => {
    if (navigator?.clipboard && domainToAuthorize) {
      navigator.clipboard.writeText(domainToAuthorize);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    }
  };

  const viewTitles: Record<string, { title: string; subtitle: string }> = {
    overview: { title: 'System Overview', subtitle: 'Centralized Personal AI Gateway & Infrastructure Telemetry' },
    providers: { title: 'AI Providers', subtitle: 'Official APIs, Aggregators & Custom HTTP Endpoints' },
    models: { title: 'Model Registry & Aliases', subtitle: 'Unified Capabilities, Token Pricing & Dynamic Aliases' },
    routing: { title: 'Routing Engine', subtitle: 'Autonomous Task Classification & Cost-Aware Policies' },
    combos: { title: 'Combo Builder', subtitle: 'Sequential Failover, Parallel Races & Weighted Load Balancers' },
    keys: { title: 'API Key Management', subtitle: 'Hashed Gateway Secrets & Granular Permission Scopes' },
    claudecode: { title: 'Claude Code Integration', subtitle: 'Anthropic Messages API Protocol & 10-Point Test Suite' },
    playground: { title: 'API Sandbox & Playground', subtitle: 'Live Interactive Testing for Messages & Completions' },
    analytics: { title: 'Usage & Cost Analytics', subtitle: 'Token Consumption, Estimated Spend & Latency Trends' },
    logs: { title: 'Request Logs & Traces', subtitle: 'Real-time Request History, Failover Paths & Error Debugging' },
    health: { title: 'Provider Health Matrix', subtitle: 'Uptime Monitoring, Auto-Exclusion & Active Latency Pings' },
    settings: { title: 'Gateway Settings', subtitle: 'Spending Limits, Timeouts & Configuration Backups' },
  };

  const headerInfo = viewTitles[currentView] || {
    title: 'System Overview',
    subtitle: 'Centralized Personal AI Gateway & Infrastructure Telemetry',
  };

  return (
    <header className="border-b border-[#e9e4db] bg-[#faf8f5]/90 backdrop-blur sticky top-0 z-30 px-8 py-5">
      {isKillSwitchActive && (
        <div className="mb-4 px-4 py-2.5 bg-rose-50 border border-rose-300 rounded-xl flex items-center justify-between text-rose-800 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">EMERGENCY KILL SWITCH IS ACTIVE:</span> All outgoing AI provider requests are currently blocked.
          </div>
          <button
            onClick={() => onToggleKillSwitch(false)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Resume All Traffic
          </button>
        </div>
      )}

      {authError && (
        <div className="mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-xs">
          <span>{authError}</span>
          <button onClick={() => setAuthError(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-editorial text-2xl md:text-3xl font-medium text-stone-900 tracking-tight">
              {headerInfo.title}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-[#d8ecdf] border border-[#badfc7] text-[#1b4a32] rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1b4a32] animate-pulse" />
              Gateway Online
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 font-normal">{headerInfo.subtitle}</p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#edf5fd] text-[#1e4e8c] border border-[#d2e4f7] rounded-xl px-3 py-1.5 text-xs font-medium">
              <Layers className="w-3.5 h-3.5 text-[#2b6cb0]" />
              <span>{activeProviderCount} Providers Active</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#fef9ee] text-[#8a5d15] border border-[#fae7be] rounded-xl px-3 py-1.5 text-xs font-medium">
              <Key className="w-3.5 h-3.5 text-[#b7791f]" />
              <span>{activeKeyCount} Keys</span>
            </div>
          </div>

          {currentUser ? (
            <div className="flex items-center gap-2 bg-white border border-[#e5e0d8] shadow-sm rounded-xl px-3 py-1 text-xs">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt={currentUser.displayName || 'User'} className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-bold text-[10px]">
                  {(currentUser.email || currentUser.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-stone-700 font-medium max-w-[140px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>
              <button
                onClick={() => logoutUser()}
                className="text-stone-400 hover:text-stone-700 text-[10px] underline ml-1 cursor-pointer"
                title="Sign out from Firebase"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[#fff8ea] text-[#9a6111] border border-[#fde4ad] hover:bg-[#ffeed0] shadow-sm disabled:opacity-50"
              title="Sign in with Google via Firebase Auth"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          )}

          <button
            onClick={() => onToggleKillSwitch(!isKillSwitchActive)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border shadow-sm ${
              isKillSwitchActive
                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500'
                : 'bg-[#fdf2f2] text-[#9b2c2c] border-[#fecaca] hover:bg-[#fee2e2]'
            }`}
            title="Emergency Kill Switch: instantly freeze or resume all provider API calls"
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${isKillSwitchActive ? 'text-white' : 'text-[#b91c1c]'}`} />
            <span>{isKillSwitchActive ? 'Kill Switch Active' : 'Kill Switch'}</span>
          </button>
        </div>
      </div>

      {showDomainModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#e5e0d8] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Firebase Authorized Domain Needed</h3>
                  <p className="text-xs text-stone-500">
                    Project: <span className="text-amber-700 font-mono font-medium">{firebaseConfig.projectId}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDomainModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed">
              Google Sign-in requires adding this app&apos;s domain to your Firebase Console authorized domains list.
            </div>

            <div className="space-y-2">
              <label className="text-xs text-stone-700 font-medium block">
                1. Copy your current App Domain:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={domainToAuthorize}
                  className="flex-1 bg-[#faf8f5] border border-[#e2dcd2] rounded-xl px-3 py-2 text-xs font-mono text-stone-800 select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyDomain}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs text-stone-700">
              <span className="font-semibold block">2. Add it to Firebase Authorized Domains:</span>
              <ol className="list-decimal list-inside space-y-1.5 text-stone-600 bg-[#faf8f5] p-3 rounded-xl border border-[#e2dcd2]">
                <li>Go to <span className="text-stone-800 font-medium">Firebase Console &gt; Authentication &gt; Settings</span></li>
                <li>Under <span className="text-stone-800 font-medium">Authorized domains</span>, click <span className="text-amber-800 font-medium">Add domain</span></li>
                <li>Paste the copied domain and click <span className="text-stone-800 font-medium">Save</span></li>
              </ol>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <a
                href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Firebase Settings</span>
              </a>

              <button
                onClick={() => setShowDomainModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showProviderModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#e5e0d8] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Enable Google Sign-In in Firebase</h3>
                  <p className="text-xs text-stone-500">
                    Project: <span className="text-amber-700 font-mono font-medium">{firebaseConfig.projectId}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProviderModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed">
              Firebase returned <span className="font-mono font-semibold">auth/operation-not-allowed</span> because the <strong>Google</strong> sign-in provider is not yet enabled in your Firebase project.
            </div>

            <div className="space-y-2 pt-1 text-xs text-stone-700">
              <span className="font-semibold block">Steps to fix in 30 seconds:</span>
              <ol className="list-decimal list-inside space-y-1.5 text-stone-600 bg-[#faf8f5] p-3 rounded-xl border border-[#e2dcd2]">
                <li>Open <span className="text-stone-800 font-medium">Firebase Console &gt; Authentication &gt; Sign-in method</span></li>
                <li>Click <span className="text-amber-800 font-medium">Google</span> (or <span className="text-amber-800 font-medium">Add new provider &gt; Google</span>)</li>
                <li>Toggle <span className="text-stone-800 font-medium">Enable</span> ON, select a <span className="text-stone-800 font-medium">Project support email</span>, and click <span className="text-stone-800 font-medium">Save</span></li>
                <li>Also ensure your domain (<span className="font-mono text-stone-800">{typeof window !== 'undefined' ? window.location.hostname : 'your-app.vercel.app'}</span>) is added under <span className="text-stone-800 font-medium">Settings &gt; Authorized domains</span></li>
              </ol>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <a
                href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Sign-In Providers</span>
              </a>

              <button
                onClick={() => setShowProviderModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
