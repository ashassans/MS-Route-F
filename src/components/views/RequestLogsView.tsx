import React, { useState } from 'react';
import {
  FileText,
  Search,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import type { RequestLog } from '../../types/gateway.ts';

interface RequestLogsViewProps {
  logs: RequestLog[];
  onRefresh: () => void;
}

export const RequestLogsView: React.FC<RequestLogsViewProps> = ({ logs, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'fallback_success' | 'error'>('all');
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.requestedModel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.selectedProvider.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleClearLogs = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear request logs');
      setConfirmClear(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Search Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eff6f2] border border-[#d6e5dc] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="font-editorial text-2xl font-medium text-stone-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#1c4d32]" />
            Request Traces & Audit Logs
          </h2>
          <p className="text-xs text-stone-600 mt-1">
            Real-time audit telemetry, failover paths, and latency breakdown for client requests.
          </p>
        </div>

        {confirmClear ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleClearLogs}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold transition cursor-pointer"
            >
              Confirm Clear All
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-2 bg-white hover:bg-stone-100 text-stone-700 border border-[#e4ded5] rounded-2xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            disabled={logs.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-[#e4ded5] hover:border-rose-200 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-semibold underline ml-3 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search logs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-[#e8e2d8] rounded-2xl pl-10 pr-4 py-2 text-xs text-stone-800 focus:outline-none focus:border-[#205e3b] shadow-xs"
          />
        </div>

        <div className="flex bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-0.5 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
              statusFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            All Logs ({logs.length})
          </button>
          <button
            onClick={() => setStatusFilter('success')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
              statusFilter === 'success' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Success
          </button>
          <button
            onClick={() => setStatusFilter('fallback_success')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
              statusFilter === 'fallback_success' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Failover Success
          </button>
          <button
            onClick={() => setStatusFilter('error')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
              statusFilter === 'error' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Errors
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-[#e8e2d8] rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f0eae1] bg-[#faf8f5] text-stone-600 font-semibold">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Status</th>
                <th className="p-4">Requested Model</th>
                <th className="p-4">Resolved Destination</th>
                <th className="p-4">Tokens</th>
                <th className="p-4">Latency</th>
                <th className="p-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f0e8]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    {logs.length === 0
                      ? 'No gateway requests have been recorded yet. Send traffic via /v1/messages, /v1/chat/completions, or the API Playground to inspect live traces.'
                      : 'No request logs match your current search or status filter.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSuccess = log.status === 'success' || log.status === 'fallback_success';
                  const isFallback = log.status === 'fallback_success';
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-[#faf8f5] transition cursor-pointer"
                    >
                      <td className="p-4 text-stone-500 font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="p-4">
                        {isFallback ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#eff6fe] text-[#1e40af] border border-[#bfdbfe]">
                            Failover 200
                          </span>
                        ) : isSuccess ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ecf7ef] text-[#166534] border border-[#cbe8d2]">
                            200 OK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]">
                            {log.statusCode || 500}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-stone-800 font-semibold">{log.requestedModel}</td>
                      <td className="p-4 font-mono text-stone-600">
                        <span className="font-semibold text-stone-800">{log.resolvedModel || log.requestedModel}</span>
                        <span className="text-stone-400 text-[10px] ml-1">({log.selectedProvider})</span>
                      </td>
                      <td className="p-4 font-mono text-stone-700">
                        {(log.inputTokens || 0) + (log.outputTokens || 0)}
                      </td>
                      <td className="p-4 font-mono text-stone-700 font-semibold">{log.latencyMs}ms</td>
                      <td className="p-4 text-right">
                        <ChevronRight className="w-4 h-4 text-stone-400 inline" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trace Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 flex min-h-full items-center justify-center">
          <div className="relative w-full max-w-xl my-auto bg-white border border-[#e8e2d8] rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#f0eae1] px-5 sm:px-6 py-4 shrink-0 bg-white">
              <div>
                <h3 className="font-editorial text-lg sm:text-xl font-medium text-stone-900">Request Telemetry Trace</h3>
                <p className="text-xs font-mono text-stone-500 mt-0.5">ID: {selectedLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-stone-400 hover:text-stone-700 text-sm cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#faf8f5] p-3 rounded-2xl border border-[#e8e2d8]">
                  <span className="text-stone-500 block font-medium">Protocol & Client</span>
                  <span className="font-mono font-bold text-stone-800">
                    {selectedLog.endpoint} ({selectedLog.clientType})
                  </span>
                </div>
                <div className="bg-[#faf8f5] p-3 rounded-2xl border border-[#e8e2d8]">
                  <span className="text-stone-500 block font-medium">Estimated Cost</span>
                  <span className="font-mono font-bold text-[#a16207]">${selectedLog.estimatedCostUsd.toFixed(5)}</span>
                </div>
              </div>

              <pre className="bg-[#faf8f5] border border-[#e4ded5] rounded-2xl p-4 text-xs font-mono text-stone-800 max-h-72 overflow-y-auto leading-relaxed">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>

            {/* Fixed Footer */}
            <div className="flex items-center justify-end px-5 sm:px-6 py-3.5 border-t border-[#f0eae1] bg-[#faf8f5] shrink-0">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-[#e4ded5] rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
