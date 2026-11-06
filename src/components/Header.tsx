import React from 'react';
import {
  Key,
  Layers,
  Menu,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GatewaySettings } from '../types/gateway.ts';

interface HeaderProps {
  currentView: string;
  settings: GatewaySettings | null;
  activeProviderCount: number;
  activeKeyCount: number;
  currentUser: User | null;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  activeProviderCount,
  activeKeyCount,
  onToggleMobileMenu,
}) => {
  const viewTitles: Record<string, { title: string; subtitle: string }> = {
    overview: { title: 'System Overview', subtitle: 'Gateway Telemetry & Metrics' },
    providers: { title: 'AI Providers', subtitle: 'Connected Upstream Endpoints' },
    models: { title: 'Models & Aliases', subtitle: 'Model Catalog & Aliases' },
    routing: { title: 'Routing Engine', subtitle: 'Routing Policies & Fallbacks' },
    combos: { title: 'Combo Builder', subtitle: 'Pipelines & Load Balancers' },
    keys: { title: 'API Keys', subtitle: 'Client Authentication Keys' },
    request: { title: 'Make a Request', subtitle: 'cURL & SDK Request Snippets' },
    playground: { title: 'API Playground', subtitle: 'Interactive Request Sandbox' },
    analytics: { title: 'Usage & Cost', subtitle: 'Tokens & Estimated Spend' },
    logs: { title: 'Request Logs', subtitle: 'Live Request Traces' },
    health: { title: 'Health Matrix', subtitle: 'Endpoint Health & Latencies' },
    settings: { title: 'Settings', subtitle: 'Gateway Configuration' },
  };

  const headerInfo = viewTitles[currentView] || {
    title: 'System Overview',
    subtitle: 'Gateway Telemetry & Metrics',
  };

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
                {headerInfo.title}
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-[#d8ecdf] border border-[#badfc7] text-[#1b4a32] rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1b4a32] animate-pulse" />
                Gateway Online
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-stone-500 mt-0.5 font-normal">{headerInfo.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
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

