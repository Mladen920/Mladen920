import React, { useState } from 'react';
import { WorkOrder } from '../../types';
import { useApp } from '../../context/AppContext';
import { 
  FileText, 
  X, 
  Copy, 
  Check, 
  User, 
  AlertTriangle, 
  Clock, 
  MessageSquare,
  Building
} from 'lucide-react';

interface NoteViewerModalProps {
  order: WorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export const NoteViewerModal: React.FC<NoteViewerModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { consumptionLogs } = useApp();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  // Logs for this order with notes
  const orderLogsWithNotes = (consumptionLogs || []).filter(
    (l) => l.workOrderId === order.id && l.note && l.note.trim().length > 0
  );

  const handleCopyAll = () => {
    let fullText = `RADNI NALOG: ${order.orderNumber} - ${order.title}\n`;
    if (order.customer) fullText += `NARUČILAC: ${order.customer}\n`;
    fullText += `ROK: ${order.dueDate}\n\n`;

    if (order.description) {
      fullText += `--- OPIS POSLA & TEHNIČKO UPUTSTVO ---\n${order.description}\n\n`;
    }

    if (order.workerNotes && Object.keys(order.workerNotes).length > 0) {
      fullText += `--- NAPOMENE ZA RADNIKE ---\n`;
      Object.entries(order.workerNotes).forEach(([worker, note]) => {
        fullText += `• ${worker}: ${note}\n`;
      });
      fullText += `\n`;
    }

    if (order.stoppage) {
      fullText += `--- ZASTOJ U RADU ---\n`;
      fullText += `Razlog: ${order.stoppage.reason}\n`;
      if (order.stoppage.description) fullText += `Opis: ${order.stoppage.description}\n`;
      fullText += `Prijavio: ${order.stoppage.reportedByName} (${order.stoppage.reportedAt})\n\n`;
    }

    if (orderLogsWithNotes.length > 0) {
      fullText += `--- NAPOMENE IZ EVIDENCIJE RADA ---\n`;
      orderLogsWithNotes.forEach((log) => {
        fullText += `• ${log.workerName} (${log.timestamp}): ${log.note}\n`;
      });
    }

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-t-2xl sm:rounded-xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {order.orderNumber}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Kompletne napomene i opis
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {order.title} {order.customer ? `(Za: ${order.customer})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container with Dedicated Scrollbar */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
          
          {/* Customer & Title Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            {order.customer && (
              <div className="flex items-center gap-1.5 font-bold text-blue-800 mb-1">
                <Building className="w-3.5 h-3.5" />
                <span>Za koga se radi: {order.customer}</span>
              </div>
            )}
            <div className="font-semibold text-slate-900 text-sm">{order.title}</div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-3">
              <span>Rok: {order.dueDate}</span>
              <span>Prioritet: <strong className="capitalize">{order.priority}</strong></span>
            </div>
          </div>

          {/* Section 1: Opis i tehničko uputstvo */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Opis posla i tehničko uputstvo administratora:
              </span>
            </div>
            {order.description ? (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                {order.description}
              </div>
            ) : (
              <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-200/60 text-xs text-slate-400 italic">
                Nema unesenog opisa za ovaj radni nalog.
              </div>
            )}
          </div>

          {/* Section 2: Zaduženja i napomene za radnike */}
          {order.workerNotes && Object.keys(order.workerNotes).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-indigo-600" />
                Pojedinačne napomene i zadaci za radnike:
              </div>
              <div className="space-y-2">
                {Object.entries(order.workerNotes).map(([worker, note]) => (
                  <div key={worker} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 text-xs text-indigo-950">
                    <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1">
                      <span>Radnik: {worker}</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Evidencija zastoja */}
          {order.stoppage && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Evidentiran zastoj u radu:
              </div>
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-sm text-amber-900">Razlog: {order.stoppage.reason}</span>
                  <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    {order.stoppage.resolved ? 'Otklonjen' : 'Aktivan'}
                  </span>
                </div>
                {order.stoppage.description && (
                  <p className="leading-relaxed bg-white/70 p-2.5 rounded-lg border border-amber-200">
                    {order.stoppage.description}
                  </p>
                )}
                <div className="text-[10px] text-amber-800 font-mono pt-1">
                  Prijavio: {order.stoppage.reportedByName} ({order.stoppage.reportedAt})
                </div>
                {order.stoppage.resolutionNote && (
                  <div className="mt-1 pt-1 border-t border-amber-200 text-[11px] text-emerald-800">
                    <strong>Rješenje:</strong> {order.stoppage.resolutionNote} ({order.stoppage.resolvedAt})
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Napomene iz evidencije rada */}
          {orderLogsWithNotes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                Napomene radnika iz evidencije utroška:
              </div>
              <div className="space-y-2">
                {orderLogsWithNotes.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Radnik: {log.workerName} ({log.workerUsername})</span>
                      <span className="font-mono text-[10px] text-slate-400">{log.timestamp}</span>
                    </div>
                    <div className="w-full max-h-36 overflow-y-auto break-words whitespace-pre-wrap p-2.5 bg-white rounded-lg border border-slate-200 text-xs leading-relaxed custom-scrollbar">
                      {log.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Kopirano!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Kopiraj sve podatke</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
          >
            Zatvori
          </button>
        </div>

      </div>
    </div>
  );
};
