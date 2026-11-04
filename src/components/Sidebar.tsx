import React from 'react';
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
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  errorCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView, errorCount = 0 }) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'providers', label: 'Providers', icon: Radio },
    { id: 'models', label: 'Models & Aliases', icon: Box },
    { id: 'routing', label: 'Routing Engine', icon: GitBranch },
    { id: 'combos', label: 'Combo Builder', icon: Layers },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'claudecode', label: 'Claude Code', icon: Terminal, badge: 'v1/messages' },
    { id: 'playground', label: 'API Playground', icon: Play },
    { id: 'analytics', label: 'Usage & Cost', icon: BarChart3 },
    { id: 'logs', label: 'Request Logs', icon: FileText },
    { id: 'health', label: 'Health Matrix', icon: HeartPulse, errorBadge: errorCount > 0 },
    { id: 'settings', label: 'Settings', icon: Sliders },
  ];

  return (
    <aside className="w-64 border-r border-[#dbe7df] bg-[#eff5f1] flex flex-col shrink-0 h-screen sticky top-0 text-stone-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#dbe7df] flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#e2f0e7] border border-[#c5decb] flex items-center justify-center text-[#1c4d32] shadow-sm">
          <Sparkles className="w-5 h-5 fill-[#2a7a4f]/20 text-[#1c4d32]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-stone-900 tracking-tight text-lg">MSRoute</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#f1e6fa] text-[#7c3aed] border border-[#e0cbf3] rounded-md leading-none">
              AI
            </span>
          </div>
          <p className="text-[11px] text-[#5c6e64] font-normal">Personal AI Cloud Gateway</p>
        </div>
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
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                isActive
                  ? 'bg-white text-stone-900 font-semibold shadow-sm border border-[#d6e4dc]'
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
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                isActive
                  ? 'bg-white text-stone-900 font-semibold shadow-sm border border-[#d6e4dc]'
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
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                isActive
                  ? 'bg-white text-stone-900 font-semibold shadow-sm border border-[#d6e4dc]'
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

      {/* Cloud Owner Footer */}
      <div className="p-4 border-t border-[#dbe7df] bg-[#e8f1eb]/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe] flex items-center justify-center text-xs font-bold">
            DG
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-stone-800 truncate">Owner Account</p>
            <p className="text-[11px] text-[#617468] truncate">digonto9191@gmail.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
