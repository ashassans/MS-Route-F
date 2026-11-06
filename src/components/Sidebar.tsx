import React, { useState } from 'react';
import {
  LayoutGrid,
  Radio,
  Box,
  GitBranch,
  Layers,
  KeyRound,
  Terminal,
  Play,
  BarChart3,
  FileText,
  HeartPulse,
  Sliders,
  Sparkles,
  LogOut,
  LogIn,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { loginWithGoogle, logoutUser } from '../lib/firebase.ts';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  errorCount?: number;
  currentUser: User | null;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  errorCount = 0,
  currentUser,
  isOpen = false,
  onClose,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await loginWithGoogle();
      if (!res.success && res.code !== 'auth/popup-closed-by-user') {
        setAuthError(res.error || 'Login failed');
        setTimeout(() => setAuthError(null), 4000);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setAuthError(err?.message || 'Login error');
        setTimeout(() => setAuthError(null), 4000);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'providers', label: 'Providers', icon: Radio },
    { id: 'models', label: 'Models & Aliases', icon: Box },
    { id: 'routing', label: 'Routing Engine', icon: GitBranch },
    { id: 'combos', label: 'Combo Builder', icon: Layers },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'request', label: 'Make a Request', icon: Terminal, badge: 'cURL / SDK' },
    { id: 'playground', label: 'API Playground', icon: Play },
    { id: 'analytics', label: 'Usage & Cost', icon: BarChart3 },
    { id: 'logs', label: 'Request Logs', icon: FileText },
    { id: 'health', label: 'Health Matrix', icon: HeartPulse, errorBadge: errorCount > 0 },
    { id: 'settings', label: 'Settings', icon: Sliders },
  ];

  const initials = currentUser?.displayName
    ? currentUser.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : currentUser?.email
      ? currentUser.email.slice(0, 2).toUpperCase()
      : null;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-xs md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 z-50 md:z-0 w-64 border-r border-[#dbe7df] bg-[#eff5f1] flex flex-col shrink-0 h-screen text-stone-800 select-none transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-[#dbe7df] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e2f0e7] border border-[#c5decb] flex items-center justify-center text-[#1c4d32] shadow-sm transition-transform hover:scale-105">
              <Sparkles className="w-5 h-5 fill-[#2a7a4f]/20 text-[#1c4d32]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-900 tracking-tight text-lg">MSRoute</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#f1e6fa] text-[#7c3aed] border border-[#e0cbf3] rounded-md leading-none shadow-2xs">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-[#5c6e64] font-normal">Personal AI Cloud Gateway</p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 text-stone-500 hover:text-stone-800 hover:bg-[#e2ebe4] rounded-xl transition cursor-pointer"
              title="Close menu"
              aria-label="Close navigation menu"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold text-[#687b70] uppercase tracking-wider">
            Infrastructure Core
          </div>
          {navItems.slice(0, 6).map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectView(item.id);
                  onClose?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-white text-stone-900 font-semibold shadow-xs border border-[#d6e4dc] translate-x-0.5'
                    : 'text-[#48594f] hover:text-stone-900 hover:bg-[#e4eee7] font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#1c4d32]' : 'text-[#617468]'}`} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}

        <div className="px-3 pt-5 pb-2 text-[10px] font-semibold text-[#687b70] uppercase tracking-wider">
          Clients & Testing
        </div>
        {navItems.slice(6, 8).map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectView(item.id);
                onClose?.();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-white text-stone-900 font-semibold shadow-xs border border-[#d6e4dc] translate-x-0.5'
                  : 'text-[#48594f] hover:text-stone-900 hover:bg-[#e4eee7] font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#1c4d32]' : 'text-[#617468]'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[9px] bg-[#ede9fe] text-[#5b21b6] border border-[#ddd6fe] rounded font-mono font-medium">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="px-3 pt-5 pb-2 text-[10px] font-semibold text-[#687b70] uppercase tracking-wider">
          Telemetry & Config
        </div>
        {navItems.slice(8).map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectView(item.id);
                onClose?.();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-white text-stone-900 font-semibold shadow-xs border border-[#d6e4dc] translate-x-0.5'
                  : 'text-[#48594f] hover:text-stone-900 hover:bg-[#e4eee7] font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#1c4d32]' : 'text-[#617468]'}`} />
                <span>{item.label}</span>
              </div>
              {item.errorBadge && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Cloud Owner / Login Footer at Bottom */}
      <div className="p-3.5 border-t border-[#dbe7df] bg-[#e8f1eb]/80">
        {authError && (
          <div className="mb-2 px-2.5 py-1.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[10px] leading-tight">
            {authError}
          </div>
        )}

        {currentUser ? (
          <div className="flex items-center justify-between gap-2.5 bg-white/80 border border-[#d2e2d7] rounded-2xl p-2.5 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="User"
                  className="w-8 h-8 rounded-full border border-[#c5decb] shrink-0 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe] flex items-center justify-center text-xs font-bold shrink-0">
                  {initials || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">
                  {currentUser.displayName || 'Owner'}
                </p>
                <p className="text-[10px] text-stone-500 truncate">
                  {currentUser.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => logoutUser()}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition cursor-pointer shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-stone-600">Account Access</span>
              <span className="text-[10px] text-stone-400">Not signed in</span>
            </div>
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-stone-50 text-stone-800 border border-[#d2e2d7] rounded-xl text-xs font-semibold shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-3.5 h-3.5 text-stone-600" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  </>
);
};
