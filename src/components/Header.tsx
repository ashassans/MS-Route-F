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
  UserCheck,
} from 'lucide-react';
import { GatewaySettings } from '../types/gateway.ts';
import { auth, loginWithGoogle, logoutUser, testConnection } from '../lib/firebase.ts';
import { onAuthStateChanged, User } from 'firebase/auth';

interface HeaderProps {
  currentView: string;
  settings: GatewaySettings | null;
  onToggleKillSwitch: (enable: boolean) => void;
  activeProviderCount: number;
  activeKeyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  settings,
  onToggleKillSwitch,
  activeProviderCount,
  activeKeyCount,
}) => {
  const isKillSwitchActive = settings?.emergencyKillSwitch;
  const [currentUser, setCurrentUser] = React.useState<User | { displayName?: string; email?: string; photoURL?: string } | null>(null);
  const [firebaseConnected, setFirebaseConnected] = React.useState<boolean | null>(null);
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [showDomainModal, setShowDomainModal] = React.useState(false);
  const [domainToAuthorize, setDomainToAuthorize] = React.useState('');
  const [copiedDomain, setCopiedDomain] = React.useState(false);

  React.useEffect(() => {
    testConnection().then((connected) => setFirebaseConnected(connected));
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await loginWithGoogle();
      if (!res.success) {
        if (res.unauthorizedDomain || res.code === 'auth/unauthorized-domain') {
          const domain = res.unauthorizedDomain || (typeof window !== 'undefined' ? window.location.hostname : '');
          setDomainToAuthorize(domain);
          setShowDomainModal(true);
        }
      }
    } catch (err: any) {
      if (err?.code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
        setDomainToAuthorize(domain);
        setShowDomainModal(true);
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

  const handleSetLocalAdmin = () => {
    setCurrentUser({
      displayName: 'Gateway Admin',
      email: settings?.ownerEmail || 'digonto9191@gmail.com',
    });
    setShowDomainModal(false);
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

  const headerInfo = viewTitles[currentView] || { title: 'System Overview', subtitle: 'Centralized Personal AI Gateway & Infrastructure Telemetry' };

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
          {/* Quick Metrics Pills */}
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

          {/* Firebase Connection & Auth Status */}
          {currentUser ? (
            <div className="flex items-center gap-2 bg-white border border-[#e5e0d8] shadow-sm rounded-xl px-3 py-1 text-xs">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt={currentUser.displayName || 'User'} className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-bold text-[10px]">
                  {currentUser.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <span className="text-stone-700 font-medium max-w-[120px] truncate">{currentUser.displayName || currentUser.email}</span>
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
              title="Connect with Google via Firebase Auth"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in (ashassansite)'}</span>
            </button>
          )}

          {/* Kill Switch Quick Button */}
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

      {/* Firebase Authorized Domain Modal */}
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
                  <p className="text-xs text-stone-500">Project: <span className="text-amber-700 font-mono font-medium">ashassansite</span></p>
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
              Google Sign-in requires adding this app's domain to your Firebase Console authorized domains list.
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
                href="https://console.firebase.google.com/project/ashassansite/authentication/settings"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Firebase Settings</span>
              </a>

              <button
                onClick={handleSetLocalAdmin}
                className="w-full sm:w-auto px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="Continue using MSRoute locally without waiting for domain authorization"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Use Local Session</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
