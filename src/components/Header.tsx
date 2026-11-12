import React from 'react';
import {
  Key,
  Layers,
  Menu,
  Zap,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GatewaySettings, LiveGatewayStatus } from '../types/gateway.ts';

interface HeaderProps {
  currentView: string;
  settings: GatewaySettings | null;
  activeProviderCount: number;
  activeKeyCount: number;
  currentUser: User | null;
  liveStatus?: LiveGatewayStatus | null;
  onNavigate?: (view: string) => void;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  activeProviderCount,
  activeKeyCount,
  liveStatus,
  onNavigate,
  onToggleMobileMenu,
}) => {
  const viewTitles: Record<string, string> = {
    overview: 'System Overview',
    providers: 'AI Providers',
    models: 'Models & Aliases',
    routing: 'Routing Engine',
    combos: 'Combo Builder',
    keys: 'API Keys',
    request: 'Make a Request',
    playground: 'API Playground',
    analytics: 'Usage & Cost',
    logs: 'Request Logs',
    health: 'Health Matrix',
    settings: 'Settings',
  };

  const title = viewTitles[currentView] || 'System Overview';

  const isProcessing = Boolean(liveStatus?.isProcessing && (liveStatus?.inFlightRequests?.length ?? 0) > 0);
  const activeReq = liveStatus?.inFlightRequests?.[0];
  const lastUsed = liveStatus?.lastUsed;

  return (
    <header className="border-b border-[#e9e4db] bg-[#faf8f5]/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5 sm:py-4.5 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 text-stone-600 hover:text-stone-900 hover:bg-[#eae4da] rounded-xl transition cursor-pointer"
              title="Toggle Menu"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-editorial text-xl sm:text-2xl md:text-3xl font-medium text-stone-900 tracking-tight">
                {title}
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-[#d8ecdf] border border-[#badfc7] text-[#1b4a32] rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1b4a32] animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto shrink-0">
          {/* Live In-Flight Request Pulse */}
          {isProcessing && activeReq ? (
            <div className="flex items-center gap-2 bg-[#dcfce7] text-[#14532d] border border-[#86efac] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold shadow-2xs animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-ping shrink-0" />
              <Zap className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
              <span className="font-mono text-[10px] sm:text-[11px]">
                LIVE: {activeReq.providerName} ({activeReq.model})
              </span>
            </div>
          ) : lastUsed ? (
            <button
              type="button"
              onClick={() => onNavigate?.('overview')}
              className="flex items-center gap-1.5 bg-[#f5f1eb] hover:bg-[#ebe4da] text-stone-700 border border-[#e2dcd1] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium shadow-2xs transition cursor-pointer"
              title={`Last routed via ${lastUsed.providerName} (${lastUsed.model}) in ${lastUsed.latencyMs}ms`}
            >
              <span className="w-2 h-2 rounded-full bg-[#16a34a] shrink-0" />
              <span className="text-stone-400 font-normal">Active:</span>
              <span className="font-semibold text-stone-900">{lastUsed.providerName}</span>
              <span className="text-stone-500 text-[10px] font-mono hidden md:inline">({lastUsed.model})</span>
            </button>
          ) : null}

          <div className="flex items-center gap-1.5 bg-[#edf5fd] text-[#1e4e8c] border border-[#d2e4f7] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium shadow-2xs">
            <Layers className="w-3.5 h-3.5 text-[#2b6cb0]" />
            <span>{activeProviderCount} Providers</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#fef9ee] text-[#8a5d15] border border-[#fae7be] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium shadow-2xs">
            <Key className="w-3.5 h-3.5 text-[#b7791f]" />
            <span>{activeKeyCount} Keys</span>
          </div>
        </div>
      </div>
    </header>
  );
};

