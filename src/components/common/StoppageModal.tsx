import React, { useState, useEffect } from 'react';
import { WorkOrder } from '../../types';
import { useApp } from '../../context/AppContext';
import { 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  Package, 
  ZapOff, 
  FileQuestion, 
  HelpCircle,
  ShieldAlert
} from 'lucide-react';

interface StoppageModalProps {
  order: WorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export const STOPPAGE_REASONS = [
  { label: 'Kvar mašine', icon: Wrench, color: 'text-red-600 bg-red-50 border-red-200' },
  { label: 'Čekanje materijala', icon: Package, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { label: 'Nestanak struje', icon: ZapOff, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { label: 'Kvar alata / opreme', icon: Wrench, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { label: 'Čekanje tehničke dokumentacije / naručioca', icon: FileQuestion, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { label: 'Drugo (navedite u opisu)', icon: HelpCircle, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

export const StoppageModal: React.FC<StoppageModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { reportStoppage, resolveStoppage, currentUser } = useApp();

  const [selectedReason, setSelectedReason] = useState<string>('Kvar mašine');
  const [description, setDescription] = useState<string>('');
  const [resolutionNote, setResolutionNote] = useState<string>('');
  const [isResolvingMode, setIsResolvingMode] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (order?.stoppage && !order.stoppage.resolved) {
      setSelectedReason(order.stoppage.reason || 'Kvar mašine');
      setDescription(order.stoppage.description || '');
      setIsResolvingMode(false);
    } else {
      setSelectedReason('Kvar mašine');
      setDescription('');
      setIsResolvingMode(false);
    }
    setResolutionNote('');
    setError(null);
    setSuccessMsg(null);
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const hasActiveStoppage = Boolean(order.stoppage && !order.stoppage.resolved);

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedReason.trim()) {
      setError('Izaberite razlog zastoja.');
      return;
    }

    const res = reportStoppage(order.id, selectedReason, description);
    if (!res.success) {
      setError(res.error || 'Greška pri prijavi zastoja.');
      return;
    }

    setSuccessMsg('Razlog zastoja je uspješno zabilježen na radnom nalogu!');
    setTimeout(() => {
      onClose();
    }, 1100);
  };

  const handleResolve = () => {
    setError(null);
    const res = resolveStoppage(order.id, resolutionNote);
    if (!res.success) {
      setError(res.error || 'Greška pri zatvaranju zastoja.');
      return;
    }

    setSuccessMsg('Zastoj je označen kao otklonjen. Rad na nalogu se nastavlja!');
    setTimeout(() => {
      onClose();
    }, 1100);
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-t-2xl sm:rounded-xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-amber-500/10 text-slate-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold leading-tight flex items-center gap-2">
                <span>Evidencija zastoja / problema</span>
                <span className="font-mono text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                  {order.orderNumber}
                </span>
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
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

        {/* Notifications */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-medium shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Active Stoppage Banner (if present) */}
        {hasActiveStoppage && order.stoppage && !isResolvingMode && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 bg-red-950/10 border-2 border-red-500 rounded-xl space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-md border border-red-300">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                AKTIVAN ZASTOJ U RADU
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {order.stoppage.reportedAt}
              </span>
            </div>
            <div className="text-xs">
              <span className="font-bold text-slate-900 block text-sm">
                Razlog: {order.stoppage.reason}
              </span>
              {order.stoppage.description && (
                <p className="text-slate-700 mt-1 leading-relaxed bg-white/80 p-2 rounded border border-red-200">
                  {order.stoppage.description}
                </p>
              )}
              <div className="mt-1.5 text-[11px] text-slate-500">
                Prijavio radnik/admin: <strong className="text-slate-800">{order.stoppage.reportedByName}</strong> ({order.stoppage.reportedBy})
              </div>
            </div>

            <div className="pt-2 border-t border-red-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsResolvingMode(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Označi zastoj kao riješen</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        {isResolvingMode ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
              <div className="font-bold flex items-center gap-1.5 text-sm mb-1 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Zatvaranje zastoja i nastavak rada
              </div>
              Potvrdite da je problem/kvar otklonjen kako bi radni nalog nastavio redovnu izradu.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Komentar / Rješenje problema (opciono)
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Unesite komentar ili opis otklanjanja zastoja..."
                rows={3}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 pb-4 sm:pb-0">
              <button
                type="button"
                onClick={() => setIsResolvingMode(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Nazad
              </button>
              <button
                type="button"
                onClick={handleResolve}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Potvrdi da je zastoj otklonjen</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReport} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-2">
                Izaberite razlog zastoja / problema *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STOPPAGE_REASONS.map((reason) => {
                  const Icon = reason.icon;
                  const isSelected = selectedReason === reason.label;
                  return (
                    <button
                      key={reason.label}
                      type="button"
                      onClick={() => setSelectedReason(reason.label)}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition text-xs ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 font-bold text-amber-950 ring-2 ring-amber-400/30'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700 font-medium'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span className="leading-tight">{reason.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dodatni opis zastoja / detalji problema (opciono)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Unesite detaljan opis zastoja..."
                rows={3}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                Prijavljeni zastoj će se odmah upečatljivo prikazati na nalogu i u evidenciji za sve radnike i administratora.
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 pb-6 sm:pb-1 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Odustani
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{hasActiveStoppage ? 'Ažuriraj razlog zastoja' : 'Zabilježi razlog zastoja'}</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
