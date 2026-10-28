import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder } from '../../types';
import { 
  Bell, 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  Package, 
  Compass, 
  Flame, 
  CheckCircle2, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface NotificationCenterProps {
  onNavigateTab?: (tab: string) => void;
  onOpenStoppageModal?: (order: WorkOrder) => void;
  onOpenOrderDetails?: (order: WorkOrder) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onNavigateTab,
  onOpenStoppageModal,
  onOpenOrderDetails,
}) => {
  const { 
    workOrders, 
    materials, 
    hasNewOrderNotification, 
    clearNewOrderNotification,
    currentUser 
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUser?.role === 'admin';
  const canManageMaterials = isAdmin || Boolean(currentUser?.permissions?.canManageMaterials);
  const canPrepareModels = isAdmin || Boolean(currentUser?.permissions?.canPrepareModels);

  // 1. Active stoppages in workshop
  const activeStoppages = useMemo(() => {
    return (workOrders || []).filter(
      (order) => Boolean(order?.stoppage && !order.stoppage.resolved)
    );
  }, [workOrders]);

  // 2. Critical stock materials (at or below minimum)
  const lowStockMaterials = useMemo(() => {
    if (!canManageMaterials) return [];
    return (materials || []).filter(
      (m) => (m?.currentStock ?? 0) <= (m?.minStock ?? 0)
    );
  }, [materials, canManageMaterials]);

  // 3. Orders waiting for model preparation
  const preparationOrders = useMemo(() => {
    if (!canPrepareModels) return [];
    return (workOrders || []).filter((order) => order?.status === 'priprema');
  }, [workOrders, canPrepareModels]);

  // 4. Urgent active orders
  const urgentOrders = useMemo(() => {
    return (workOrders || []).filter((order) => {
      const isUrgent = order?.priority === 'hitno';
      const isActive = order?.status !== 'zavrseno' && order?.status !== 'otkazano';
      if (!isAdmin) {
        // for worker: only their assigned orders
        const isAssigned = Array.isArray(order?.assignedWorkers) && order.assignedWorkers.includes(currentUser?.username || '');
        return isUrgent && isActive && isAssigned;
      }
      return isUrgent && isActive;
    });
  }, [workOrders, isAdmin, currentUser]);

  // Calculate total count
  const totalCount = 
    activeStoppages.length + 
    lowStockMaterials.length + 
    (preparationOrders.length > 0 ? 1 : 0) + 
    urgentOrders.length + 
    (hasNewOrderNotification ? 1 : 0);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenDropdown = () => {
    setIsOpen((prev) => !prev);
    if (hasNewOrderNotification) {
      clearNewOrderNotification();
    }
  };

  const handleNavigate = (tab: string) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleOpenDropdown}
        title="Centar za obavještenja"
        className={`relative p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
          isOpen
            ? 'bg-slate-800 text-white ring-2 ring-blue-500/40'
            : totalCount > 0
            ? 'text-amber-300 hover:text-white bg-slate-800/80 hover:bg-slate-800'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
        aria-label="Obavještenja"
      >
        <Bell className={`w-4 h-4 ${totalCount > 0 ? 'animate-bounce' : ''}`} />
        
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xs">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div 
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-slate-900 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ right: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Centar za obavještenja
              </span>
              {totalCount > 0 && (
                <span className="px-1.5 py-0.2 bg-red-600 text-white text-[10px] font-mono font-bold rounded-full">
                  {totalCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Notifications Scrollable List */}
          <div className="max-h-[68vh] overflow-y-auto p-3 space-y-2.5 custom-scrollbar bg-slate-50/50">
            {totalCount === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-bold text-slate-800">Nema aktivnih obavještenja</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Proizvodnja teče po planu, nema evidentiranih zastoja niti kritičnih zaliha.
                </p>
              </div>
            ) : (
              <>
                {/* 1. Active Workshop Stoppages (Critical priority) */}
                {activeStoppages.map((order) => (
                  <div
                    key={`stoppage-${order.id}`}
                    className="p-3 bg-red-50 border border-red-300 rounded-xl space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-red-950">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                        <span>AKTIVAN ZASTOJ: {order.stoppage?.reason}</span>
                      </div>
                      <span className="font-mono text-[10px] bg-red-200/80 text-red-900 px-1.5 py-0.2 rounded font-bold shrink-0">
                        {order.orderNumber}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-700 leading-snug">
                      Nalog: <strong className="text-slate-900">{order.title}</strong>
                      {order.customer ? ` (${order.customer})` : ''}
                    </p>

                    {order.stoppage?.description && (
                      <p className="text-[11px] text-red-900 bg-white/90 p-1.5 rounded border border-red-200 leading-relaxed italic">
                        "{order.stoppage.description}"
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-red-200/70 text-[10px] font-mono text-slate-500">
                      <span>Prijavio: {order.stoppage?.reportedByName}</span>
                      {onOpenStoppageModal && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenStoppageModal(order);
                          }}
                          className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          Otkloni zastoj →
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* 2. Critical Stock Materials */}
                {lowStockMaterials.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Kritične zalihe: {lowStockMaterials.length} materijala</span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-800 bg-amber-200/70 px-1.5 py-0.2 rounded font-bold">
                        Minimalni prag
                      </span>
                    </div>

                    <div className="space-y-1">
                      {lowStockMaterials.slice(0, 3).map((mat) => (
                        <div key={mat.id} className="flex items-center justify-between text-xs bg-white/90 px-2 py-1 rounded border border-amber-200">
                          <span className="font-medium text-slate-800 truncate mr-2">
                            {mat.name}
                          </span>
                          <span className="font-mono font-bold text-red-700 shrink-0">
                            {mat.currentStock} / min. {mat.minStock} {mat.unit}
                          </span>
                        </div>
                      ))}
                      {lowStockMaterials.length > 3 && (
                        <p className="text-[10px] text-amber-800 italic text-right">
                          + još {lowStockMaterials.length - 3} materijala...
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleNavigate('materials')}
                      className="w-full py-1 text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Otvori bazu materijala za nabavku →</span>
                    </button>
                  </div>
                )}

                {/* 3. Orders in Digital Model Preparation (Admin) */}
                {preparationOrders.length > 0 && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-950">
                        <Compass className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{preparationOrders.length} naloga čeka pripremu modela</span>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-800 bg-indigo-100 px-1.5 py-0.2 rounded font-bold">
                        Digitalna priprema
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-800">
                      Nalozi još nisu vidljivi radnicima u radionici dok se ne puste u rad.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleNavigate('models')}
                      className="w-full py-1 text-xs font-bold text-indigo-950 bg-white hover:bg-indigo-100 rounded-lg border border-indigo-300 transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Otvori pripremu modela ({preparationOrders.length}) →</span>
                    </button>
                  </div>
                )}

                {/* 4. Urgent Orders Alert */}
                {urgentOrders.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rose-950">
                        <Flame className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Hitni radni nalozi ({urgentOrders.length})</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded font-bold">
                        HITNO
                      </span>
                    </div>
                    <div className="space-y-1">
                      {urgentOrders.slice(0, 2).map((ord) => (
                        <div key={ord.id} className="text-xs bg-white/90 p-1.5 rounded border border-rose-200 flex items-center justify-between">
                          <span className="truncate font-semibold text-slate-800">
                            {ord.orderNumber}: {ord.title}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-1">
                            {ord.dueDate}
                          </span>
                        </div>
                      ))}
                    </div>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('orders')}
                        className="w-full py-1 text-xs font-bold text-rose-950 bg-white hover:bg-rose-100 rounded-lg border border-rose-300 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>Prikaži tabelu sa hitnim nalozima →</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>Sistem automatskih obavještenja</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
            >
              U redu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
