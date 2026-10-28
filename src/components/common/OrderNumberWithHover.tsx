import React, { useState } from 'react';
import { WorkOrder } from '../../types';
import { useApp } from '../../context/AppContext';
import { Building, Calendar, Clock, CheckCircle2, Package, Eye, X, AlertTriangle, Flame, ShieldAlert, User, Layers } from 'lucide-react';

interface OrderNumberWithHoverProps {
  order: WorkOrder;
  onClick?: () => void;
  className?: string;
  hideEyeIcon?: boolean;
}

export const OrderNumberWithHover: React.FC<OrderNumberWithHoverProps> = ({
  order,
  onClick,
  className = '',
  hideEyeIcon = false,
}) => {
  const { consumptionLogs } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const orderLogs = (consumptionLogs || []).filter((l) => l?.workOrderId === order?.id);

  let totalMinutes = 0;
  orderLogs.forEach((l) => {
    totalMinutes += (l?.hoursSpent || 0) * 60 + (l?.minutesSpent || 0);
  });
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;

  const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
  const hasActiveStoppage = Boolean(order.stoppage && !order.stoppage.resolved);

  // Shared content for both mobile bottom-sheet and desktop popover
  const renderDetailsBody = () => (
    <>
      {/* Active Stoppage Warning Banner */}
      {hasActiveStoppage && order.stoppage && (
        <div className="p-3 rounded-xl border-2 border-red-500 bg-red-950/95 text-white text-xs mb-2.5 shadow-lg animate-pulse">
          <div className="flex items-center justify-between font-bold text-red-300 mb-1">
            <span className="flex items-center gap-1.5 text-xs text-red-300">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              AKTIVAN ZASTOJ U PROIZVODNJI
            </span>
            <span className="text-[10px] font-mono text-red-300 bg-red-900 px-2 py-0.5 rounded border border-red-700">
              {order.stoppage.reportedAt}
            </span>
          </div>
          <div className="text-sm font-bold text-white mt-1">
            Razlog: {order.stoppage.reason}
          </div>
          {order.stoppage.description && (
            <p className="text-[11px] text-red-100 mt-1 leading-relaxed bg-black/50 p-2 rounded border border-red-800">
              {order.stoppage.description}
            </p>
          )}
          <div className="text-[10px] text-red-300 font-mono mt-1.5">
            Prijavio: {order.stoppage.reportedByName} ({order.stoppage.reportedBy})
          </div>
        </div>
      )}

      {/* High Priority Red Banner */}
      {isHighPriority && (
        <div className="p-2.5 rounded-lg bg-red-600 border border-red-500 text-white text-xs font-bold mb-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-300 animate-bounce" />
            <span>VISOKI PRIORITET RADNOG NALOGA</span>
          </div>
          <span className="text-[10px] font-mono uppercase bg-red-800/80 px-2 py-0.5 rounded">
            {order.priority}
          </span>
        </div>
      )}

      {/* Prominent Status Banner (Završeno / Na čekanju / U izradi / Priprema) */}
      <div
        className={`p-2.5 rounded-lg border text-xs font-semibold mb-2.5 flex items-center justify-between ${
          order.status === 'zavrseno'
            ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
            : order.status === 'u_izradi'
            ? 'bg-blue-950/90 border-blue-600 text-blue-200'
            : order.status === 'priprema'
            ? 'bg-purple-950/90 border-purple-600 text-purple-200'
            : 'bg-amber-950/90 border-amber-600 text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">Status:</span>
          <span className="font-bold text-white text-xs flex items-center gap-1.5">
            {order.status === 'priprema' && (
              <>
                <Layers className="w-4 h-4 text-purple-400" />
                <span>PRIPREMA MODELA (Nije pušten u pogon)</span>
              </>
            )}
            {order.status === 'zavrseno' && (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>ZAVRŠEN RADNI NALOG</span>
              </>
            )}
            {order.status === 'na_cekanju' && (
              <>
                <Clock className="w-4 h-4 text-amber-400" />
                <span>NA ČEKANJU</span>
              </>
            )}
            {order.status === 'u_izradi' && (
              <>
                <Clock className="w-4 h-4 text-blue-400" />
                <span>U IZRADI</span>
              </>
            )}
            {order.status === 'otkazano' && <span>OTKAZANO</span>}
          </span>
        </div>
      </div>

      {/* Model Preparation Details if available */}
      {order.modelPreparation && (
        <div className="bg-purple-950/60 border border-purple-800/70 rounded-lg p-2.5 mb-2.5 text-xs text-purple-200">
          <div className="flex items-center justify-between text-purple-300 font-bold text-[11px] mb-1">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Model: {order.modelPreparation.modelName || 'Digitalna priprema'}</span>
            </span>
            {order.modelPreparation.targetWorker && (
              <span className="text-[10px] bg-purple-900 px-1.5 py-0.5 rounded text-purple-200 font-mono">
                Za radnika: {order.modelPreparation.targetWorker}
              </span>
            )}
          </div>
          {order.modelPreparation.dimensions && (
            <div className="text-[11px] font-mono text-purple-100 mt-1">
              Dimenzije: {order.modelPreparation.dimensions}
            </div>
          )}
          {order.modelPreparation.notes && (
            <p className="text-[10px] text-purple-200/90 mt-1 italic bg-purple-950/80 p-1.5 rounded border border-purple-900">
              {order.modelPreparation.notes}
            </p>
          )}
        </div>
      )}

      {/* Closed By Info (if order is completed) */}
      {order.status === 'zavrseno' && order.closedBy && (
        <div className="bg-emerald-950/80 border border-emerald-700/60 rounded-lg p-2.5 mb-2.5 text-xs text-emerald-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 font-bold text-emerald-300 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zatvorio radnik:</span>
            </div>
            <span className="font-mono text-[10px] text-emerald-400/90">{order.closedBy.timestamp}</span>
          </div>
          <div className="mt-1 text-white font-semibold flex items-center gap-1.5">
            <span>{order.closedBy.fullName}</span>
            <span className="text-[10px] text-emerald-300 font-mono">({order.closedBy.username})</span>
          </div>
        </div>
      )}

      {/* Customer & Title */}
      <div className="space-y-1 mb-2.5">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-300 flex items-center justify-between">
          <span className="text-slate-400">Kreirao nalog:</span>
          <span className="font-semibold text-white">
            {order.createdBy?.fullName || 'Administrator'}
            {order.createdBy?.username ? ` (${order.createdBy.username})` : ''}
          </span>
        </div>

        {order.customer && (
          <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
            <Building className="w-3.5 h-3.5" />
            <span>Za koga se radi: {order.customer}</span>
          </div>
        )}
        <div className="text-xs font-bold text-white leading-snug">
          {order.title}
        </div>
        {/* Full description without truncation */}
        {order.description && (
          <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 whitespace-pre-wrap select-text">
            {order.description}
          </div>
        )}
      </div>

      {/* Worker Notes (if assigned workers have specific notes) */}
      {order.workerNotes && Object.keys(order.workerNotes).length > 0 && (
        <div className="bg-indigo-950/70 border border-indigo-800/60 rounded-lg p-2.5 mb-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px] mb-1.5">
            <User className="w-3.5 h-3.5" />
            <span>Zadaci i napomene za radnike:</span>
          </div>
          <div className="space-y-1">
            {Object.entries(order.workerNotes).map(([w, note]) => (
              <div key={w} className="text-[11px] text-indigo-100 bg-slate-900/80 p-1.5 rounded border border-indigo-900/50">
                <strong className="text-indigo-300">{w}:</strong> {note}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Predviđeni materijali koje je naveo admin (do 4 materijala) */}
      {order.plannedMaterials && order.plannedMaterials.length > 0 && (
        <div className="bg-slate-950/90 border border-blue-900/60 rounded-lg p-2.5 mb-2.5 text-xs">
          <div className="flex items-center justify-between text-blue-300 font-bold text-[11px] mb-1.5">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              Predviđeni materijali (naveo admin):
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-normal">
              {order.plannedMaterials.length}/4
            </span>
          </div>
          <div className="space-y-1">
            {order.plannedMaterials.map((mat, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-[11px] bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800"
              >
                <span className="text-white font-medium">• {mat.materialName}</span>
                {mat.quantity !== undefined && mat.quantity > 0 ? (
                  <span className="font-mono font-bold text-emerald-400">
                    {mat.quantity} {mat.unit}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">
                    {mat.unit} (po utrošku)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workers & Due Date */}
      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 mb-2.5">
        <div>
          <span className="text-slate-400 block">Radnici:</span>
          <span className="font-semibold text-white">
            {(order?.assignedWorkers || []).join(', ') || 'Nema'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Rok izrade:</span>
          <span className="font-mono text-white">{order.dueDate}</span>
        </div>
      </div>

      {/* Consumed Materials & Time Preview */}
      <div className="border-t border-slate-800 pt-2 text-[11px] space-y-1">
        <div className="flex items-center justify-between text-slate-400 text-[10px]">
          <span className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-emerald-400" />
            Utrošeni materijali:
          </span>
          <span className="font-mono text-white">
            Vrijeme: {totalH}h {totalM}m
          </span>
        </div>

        {orderLogs.length === 0 ? (
          <span className="text-[10px] text-slate-400 italic block py-1">
            Nema zabilježenog utroška
          </span>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar-dark pr-1">
            {orderLogs.map((l) => (
              <div key={l.id} className="flex justify-between items-center text-[10px] font-mono bg-slate-950/40 px-2 py-0.5 rounded">
                <span className="text-slate-300 truncate max-w-[200px]">{l.materialName}</span>
                <span className="text-emerald-400 font-bold ml-2 shrink-0">{l.quantity} {l.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className="relative inline-flex items-center gap-1.5"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => {
          if (onClick) {
            onClick();
          } else {
            setIsOpen((prev) => !prev);
          }
        }}
        className={`inline-flex items-center gap-1 font-mono font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer transition text-xs ${className}`}
        title="Kliknite za kompletan uvid i izmjenu količina"
      >
        <span>{order.orderNumber}</span>
        {isHighPriority && (
          <span className="text-[10px] px-1 py-0.2 rounded bg-red-100 text-red-700 border border-red-300 font-sans font-bold flex items-center gap-0.5" title="Visoki prioritet">
            <Flame className="w-3 h-3 text-red-600" />
            <span className="hidden sm:inline">HITNO</span>
          </span>
        )}
        {hasActiveStoppage && (
          <span className="text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-sans font-bold flex items-center gap-0.5 animate-pulse" title="Aktivan zastoj u proizvodnji">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span className="hidden sm:inline">ZASTOJ</span>
          </span>
        )}
      </button>

      {/* Oko sa strane za brzi padajući meni */}
      {!hideEyeIcon && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 rounded transition cursor-pointer"
          title="Oko sa strane: Otvara padajući meni sa detaljima naloga"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}

      {/* MOBILE BOTTOM SHEET MODAL (Screen < 640px) with its own dedicated visible scrollbar */}
      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col justify-end p-0 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            className="bg-slate-900 text-white rounded-t-2xl border-t border-x border-slate-700 shadow-2xl flex flex-col max-h-[85dvh] w-full overflow-hidden animate-in slide-in-from-bottom duration-200 text-left pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Drag Indicator & Header */}
            <div className="pt-2 pb-2.5 px-4 border-b border-slate-800 shrink-0">
              <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-2" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-blue-400 bg-blue-950 px-2.5 py-1 rounded border border-blue-800">
                    {order.orderNumber}
                  </span>
                  <span className="text-xs font-semibold text-slate-200">
                    Pregled radnog naloga
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-md bg-slate-800 hover:bg-slate-700 transition"
                  title="Zatvori pregled"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body: Dedicated visible scrollbar track that goes ALL THE WAY TO THE BOTTOM! */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar-dark overscroll-contain">
              {renderDetailsBody()}
            </div>

            {/* Mobile Bottom Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2 px-3 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition text-center"
              >
                Zatvori
              </button>
              {onClick && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onClick();
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition text-center"
                >
                  Detaljan uvid →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP HOVER POPOVER (Screen >= 640px) with dedicated visible scrollbar */}
      {isOpen && (
        <div
          className="hidden sm:flex flex-col absolute z-50 left-0 top-full mt-1.5 w-96 max-h-[75vh] bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 overflow-hidden pointer-events-auto animate-in fade-in zoom-in-95 duration-100 text-left"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-800 shrink-0">
            <span className="font-mono font-bold text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
              {order.orderNumber}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Brzi pregled naloga</span>
          </div>

          {/* Desktop Scrollable Body with its own scroll track */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-2.5 custom-scrollbar-dark overscroll-contain">
            {renderDetailsBody()}
          </div>

          {onClick && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onClick();
              }}
              className="p-2.5 bg-slate-950 hover:bg-blue-950/60 border-t border-slate-800 text-[10px] text-blue-400 hover:text-blue-300 text-center font-mono cursor-pointer transition shrink-0"
            >
              Kliknite za kompletan uvid i izmjenu količina →
            </button>
          )}
        </div>
      )}
    </div>
  );
};
