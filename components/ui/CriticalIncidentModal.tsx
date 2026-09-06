import React from 'react';
import {
  FiAlertOctagon,
  FiHardDrive,
  FiCpu,
  FiCheckCircle,
  FiShield,
  FiArrowRight,
  FiX
} from 'react-icons/fi';

export interface CriticalIncidentData {
  title: string;
  incidentType: 'DISK_FULL' | 'BUFFER_OVERRUN' | 'FATAL_RECORDING_ERROR';
  message: string;
  reason?: string;
  app?: string;
  stream?: string;
  key?: string;
  storage?: {
    totalFmt?: string;
    availableFmt?: string;
    usedFmt?: string;
    usePercent?: number;
    thresholdPercent?: number;
    criticalThresholdPercent?: number;
  };
  details?: Record<string, any>;
  timestamp?: string;
}

interface Props {
  isOpen: boolean;
  incident: CriticalIncidentData | null;
  onClose: () => void;
  onNavigateToAuditLogs?: () => void;
  onNavigateToRecordings?: () => void;
}

export const CriticalIncidentModal: React.FC<Props> = ({
  isOpen,
  incident,
  onClose,
  onNavigateToAuditLogs,
  onNavigateToRecordings,
}) => {
  if (!isOpen || !incident) return null;

  const isDisk = incident.incidentType === 'DISK_FULL' || /storage|disk/i.test(incident.reason || incident.message);
  const isOverrun = incident.incidentType === 'BUFFER_OVERRUN' || /buffer|overrun|decklink/i.test(incident.reason || incident.message);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 w-screen h-screen overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Darkened backdrop with warning glow */}
      <div
        className="fixed inset-0 w-screen h-screen bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl rounded-2xl border-2 border-red-600 bg-white shadow-[0_0_50px_rgba(220,38,38,0.4)] animate-[scale-in_0.2s_ease-out] flex flex-col max-h-[90vh] dark:bg-[#150A20] dark:border-red-500 overflow-hidden">
        {/* Top Critical Header Banner */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-xs ring-4 ring-white/20 animate-pulse">
              <FiAlertOctagon size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  CRITICAL BROADCAST ALERT
                </span>
                <span className="text-[11px] font-mono opacity-85">
                  {incident.timestamp ? new Date(incident.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </span>
              </div>
              <h2 className="text-[17px] font-black tracking-tight leading-tight mt-0.5">
                {incident.title || 'Recording Emergency Auto-Stop Triggered'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/25 text-white transition-colors"
            title="Dismiss Alert"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-[#1B1024] dark:text-[#F1EAFA]">
          {/* Main Status Message Box */}
          <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 dark:border-red-900/60 dark:bg-red-950/40">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-red-600 dark:text-red-400 shrink-0">
                {isDisk ? <FiHardDrive size={20} /> : <FiCpu size={20} />}
              </div>
              <div className="space-y-1">
                <div className="text-[13px] font-bold text-red-900 dark:text-red-200">
                  {isDisk
                    ? 'Storage Capacity Deadline Exceeded (<5% Free)'
                    : isOverrun
                    ? 'DeckLink Hardware Buffer Overrun / I/O Write Saturation'
                    : 'Fatal Hardware / Ingest Process Interruption'}
                </div>
                <p className="text-[12px] text-red-800 dark:text-red-300 leading-relaxed font-medium whitespace-pre-wrap break-words">
                  {incident.message}
                </p>
              </div>
            </div>
          </div>

          {/* Diagnostic Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {incident.storage && (
              <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 dark:border-[#371F59] dark:bg-[#211335]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] flex items-center gap-1.5">
                    <FiHardDrive size={13} /> Disk Space State
                  </span>
                  <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                    {incident.storage.usePercent?.toFixed(1)}% Full
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
                  <div
                    className="h-full bg-red-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, incident.storage.usePercent || 95)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-[#1B1024] dark:text-white">
                  <span>Free: <strong>{incident.storage.availableFmt || '0 MB'}</strong></span>
                  <span>Total: {incident.storage.totalFmt || '—'}</span>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 dark:border-[#371F59] dark:bg-[#211335]">
              <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1.5 flex items-center gap-1.5">
                <FiCheckCircle size={13} className="text-emerald-500" /> File Protection Status
              </div>
              <p className="text-[11px] text-[#1B1024] dark:text-white font-medium leading-normal">
                Recording pipeline was <strong>gracefully finalized</strong> via SIGTERM to flush container headers (moov atom) and prevent file corruption.
              </p>
              {incident.stream && (
                <div className="mt-2 text-[10px] font-mono text-[#7C3AED] dark:text-[#C4B5FD] truncate">
                  Stream Target: {incident.app ? `${incident.app}/` : ''}{incident.stream}
                </div>
              )}
            </div>
          </div>

          {/* Standard Operating Procedure (SOP) Preventive Guidance */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <h4 className="text-[12px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-2">
              <FiShield size={14} /> Recommended Broadcast Standard Operating Procedure (SOP):
            </h4>
            <ul className="text-[11.5px] text-amber-800 dark:text-amber-300 space-y-1.5 list-disc list-inside">
              {isOverrun ? (
                <>
                  <li><strong>Avoid uncompressed 10-bit v210 MOV:</strong> Requires &gt;138 MB/s sustained disk bandwidth. Standard SSDs or shared volumes quickly drop frames.</li>
                  <li><strong>Use Recommended Master Codecs:</strong> Apple ProRes 422 (~18 MB/s), Avid DNxHD (~15 MB/s), or XDCAM HD422 MPEG-2 (~6.25 MB/s).</li>
                  <li><strong>High-Speed NVMe Storage:</strong> Ensure target recording drive is high-speed NVMe or RAID array.</li>
                </>
              ) : isDisk ? (
                <>
                  <li><strong>Free Storage Space:</strong> Open Recording Library and archive or delete completed older captures.</li>
                  <li><strong>Mount Dedicated Media Disk:</strong> Attach a secondary high-capacity volume to <code>/app/media/recordings</code>.</li>
                  <li><strong>Enforce 10% Reserve:</strong> StreamOps requires at least 5-10% free space to write container trailers safely.</li>
                </>
              ) : (
                <>
                  <li>Check PCIe card connections, DeckLink Desktop Video drivers, and available system memory.</li>
                  <li>Verify video resolution and frame rate match source SDI/HDMI output signal exactly.</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#E8DFF0] bg-[#F8F7FA] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 dark:bg-[#1C0E2D] dark:border-[#311B4E]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onNavigateToAuditLogs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToAuditLogs();
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#D8C6E8] bg-white px-3 py-2 text-[12px] font-bold text-[#4A1B7A] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B] transition-colors"
              >
                <FiShield size={13} /> View Audit Logs
              </button>
            )}
            {onNavigateToRecordings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToRecordings();
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 py-2 text-[12px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2F1A4B] transition-colors"
              >
                Recording Library
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-[12px] font-bold text-white hover:bg-red-700 shadow-md transition-colors cursor-pointer"
          >
            Acknowledge & Dismiss <FiArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CriticalIncidentModal;
