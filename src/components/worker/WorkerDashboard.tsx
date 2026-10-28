import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, OrderStatus } from '../../types';
import { 
  ClipboardCheck, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Layers, 
  HardHat, 
  Info, 
  Search, 
  Wrench, 
  Building,
  History,
  Eye,
  Users,
  Flame,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Plus,
  Edit3,
  Trash2
} from 'lucide-react';
import { LogConsumptionModal } from './LogConsumptionModal';
import { OrderNumberWithHover } from '../common/OrderNumberWithHover';
import { WorkOrderDetailModal } from '../common/WorkOrderDetailModal';
import { StoppageModal } from '../common/StoppageModal';
import { NoteViewerModal } from '../common/NoteViewerModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface WorkerDashboardProps {
  mode: 'my' | 'all';
}

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({ mode }) => {
  const { currentUser, workOrders, consumptionLogs, users, openCreateWorkOrderModal, deleteWorkOrder } = useApp();

  const [selectedOrderIdForLogging, setSelectedOrderIdForLogging] = useState<string | undefined>(undefined);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [orderForFullDetails, setOrderForFullDetails] = useState<WorkOrder | null>(null);
  const [stoppageOrder, setStoppageOrder] = useState<WorkOrder | null>(null);
  const [noteOrder, setNoteOrder] = useState<WorkOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<WorkOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  const [historyViewMode, setHistoryViewMode] = useState<'all' | 'my'>('all');

  const canCreateOrders = Boolean(currentUser?.permissions?.canCreateOrders);
  const canEditOrders = Boolean(currentUser?.permissions?.canEditOrders);
  const canDeleteOrders = Boolean(currentUser?.permissions?.canDeleteOrders);

  if (!currentUser) return null;

  const getUrgentTopWeight = (order: WorkOrder) => {
    if (order.status === 'zavrseno' || order.status === 'otkazano') return 0;
    if (order.priority === 'hitno') return 3;
    if (order.priority === 'visoko') return 2;
    return 0;
  };

  const myActiveOrders = (workOrders || []).filter(
    (order) =>
      Array.isArray(order?.assignedWorkers) &&
      order.assignedWorkers.includes(currentUser.username) &&
      order.status !== 'zavrseno' &&
      order.status !== 'priprema' &&
      order.status !== 'otkazano'
  ).sort((a, b) => {
    // Hitni nalozi (prioritet: hitno) moraju imati apsolutni prioritet i uvijek biti na samom vrhu
    const urgentA = a.priority === 'hitno' ? 3 : a.priority === 'visoko' ? 2 : 1;
    const urgentB = b.priority === 'hitno' ? 3 : b.priority === 'visoko' ? 2 : 1;
    if (urgentB !== urgentA) return urgentB - urgentA;

    // Unutar iste grupe prioriteta, sortiraj po datumu izdavanja tako da novi idu prvi (opadajući redoslijed)
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    const cmpDate = dateB.localeCompare(dateA);
    if (cmpDate !== 0) return cmpDate;

    const orderA = a.orderNumber || '';
    const orderB = b.orderNumber || '';
    return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Completed & Cancelled work orders (History) for this worker
  const myCompletedOrders = (workOrders || []).filter(
    (order) =>
      Array.isArray(order?.assignedWorkers) &&
      order.assignedWorkers.includes(currentUser.username) &&
      (order.status === 'zavrseno' || order.status === 'otkazano')
  ).sort((a, b) => {
    const orderA = a.orderNumber || '';
    const orderB = b.orderNumber || '';
    return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
  });

  // All completed & cancelled work orders (redno mjesto po broju naloga)
  const allCompletedOrders = (workOrders || []).filter(
    (order) => order.status === 'zavrseno' || order.status === 'otkazano'
  ).sort((a, b) => {
    const orderA = a.orderNumber || '';
    const orderB = b.orderNumber || '';
    return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
  });

  const displayedHistoryOrders = historyViewMode === 'my' ? myCompletedOrders : allCompletedOrders;

  // Dynamic collection of all workers for filter
  const allWorkers = Array.from(
    new Set([
      ...(users || []).filter((u) => u.role === 'worker' || u.role === 'admin').map((u) => ({ username: u.username, fullName: u.fullName })),
      ...(workOrders || []).flatMap((o) => (o.assignedWorkers || []).map((w) => ({ username: w, fullName: users.find((u) => u.username === w)?.fullName || w }))),
      ...(consumptionLogs || []).map((l) => ({ username: l.workerUsername, fullName: l.workerName || l.workerUsername })),
    ].reduce((acc, curr) => {
      if (!acc.some((item) => item.username === curr.username)) {
        acc.push(curr);
      }
      return acc;
    }, [] as { username: string; fullName: string }[]))
  ).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const handleOpenLogModal = (orderId: string) => {
    setSelectedOrderIdForLogging(orderId);
    setIsLogModalOpen(true);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'zavrseno':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Završeno
          </span>
        );
      case 'u_izradi':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-md border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            U izradi
          </span>
        );
      case 'na_cekanju':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Na čekanju
          </span>
        );
    }
  };

  const filteredAllOrders = (workOrders || []).filter((order) => {
    // Workers must NEVER see orders currently in digital model preparation
    if (order?.status === 'priprema') return false;

    const oNum = order?.orderNumber || '';
    const oTitle = order?.title || '';
    const oCust = order?.customer || '';
    const oDesc = order?.description || '';
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      oNum.toLowerCase().includes(searchLower) ||
      oTitle.toLowerCase().includes(searchLower) ||
      oCust.toLowerCase().includes(searchLower) ||
      oDesc.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    if (workerFilter !== 'all') {
      const isAssigned = Array.isArray(order?.assignedWorkers) && order.assignedWorkers.includes(workerFilter);
      const isClosedBy = order?.closedBy?.username === workerFilter;
      const hasLogged = (consumptionLogs || []).some(
        (log) => log.workOrderId === order.id && log.workerUsername === workerFilter
      );
      return isAssigned || isClosedBy || hasLogged;
    }

    return true;
  }).sort((a, b) => {
    const isUnfinished = (o: WorkOrder) => o.status !== 'zavrseno' && o.status !== 'otkazano';
    const unfinA = isUnfinished(a);
    const unfinB = isUnfinished(b);

    // 1. Nezavršeni nalozi moraju uvijek biti na vrhu tabele
    if (unfinA && !unfinB) return -1;
    if (!unfinA && unfinB) return 1;

    // Unutar nezavršenih:
    if (unfinA && unfinB) {
      // Hitni nalozi (prioritet: hitno) moraju imati apsolutni prioritet i uvijek biti na samom vrhu
      const urgentA = a.priority === 'hitno' ? 3 : a.priority === 'visoko' ? 2 : 1;
      const urgentB = b.priority === 'hitno' ? 3 : b.priority === 'visoko' ? 2 : 1;
      if (urgentB !== urgentA) {
        return urgentB - urgentA;
      }

      // Unutar nezavršenih, sortiraj ih po datumu izdavanja tako da novi idu prvi (opadajući redoslijed)
      const dateA = a.createdAt || '';
      const dateB = b.createdAt || '';
      const cmpDate = dateB.localeCompare(dateA);
      if (cmpDate !== 0) return cmpDate;

      const orderA = a.orderNumber || '';
      const orderB = b.orderNumber || '';
      return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
    }

    // 3. Samo nalozi koji su završeni ili otkazani vraćaju se na svoje standardno redno mjesto po broju naloga:
    const orderA = a.orderNumber || '';
    const orderB = b.orderNumber || '';
    return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
  });

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-500/20">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              Radni profil: {currentUser.fullName} ({currentUser.username})
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'my'
                ? 'Prikazani su vaši aktivni radni zadaci. Završeni nalozi automatski prelaze u istoriju.'
                : 'Prikazani su svi radni nalozi u radionici sa mogućnošću filtriranja po radnicima i evidentiranja zastoja.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
          {canCreateOrders && (
            <button
              type="button"
              onClick={() => openCreateWorkOrderModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Novi nalog</span>
            </button>
          )}

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Aktivnih naloga</span>
              <span className="font-bold text-blue-700">{myActiveOrders.length}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Završeno u istoriji</span>
              <span className="font-bold text-emerald-700">{myCompletedOrders.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW: MOJI RADNI NALOZI (Samo aktivni u kvadratima!) */}
      {mode === 'my' && (
        <div className="space-y-6">
          
          {/* Active Work Orders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-600" />
                Moji aktivni radni nalozi ({myActiveOrders.length})
              </h2>
              <span className="text-xs font-mono text-slate-500">
                Za rad, evidentiranje zastoja i utroška
              </span>
            </div>

            {myActiveOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-800 text-sm">Nemate trenutno aktivnih zaduženih radnih naloga</p>
                <p className="text-xs text-slate-400 mt-1">
                  Svi vaši zadaci su završeni i nalaze se u istoriji ispod, ili možete preći na tab "Svi radni nalozi".
                </p>
                {canCreateOrders && (
                  <button
                    type="button"
                    onClick={() => openCreateWorkOrderModal()}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Kreiraj novi radni nalog</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myActiveOrders.map((order) => {
                  const myNote = order.workerNotes?.[currentUser.username];
                  const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                  const hasActiveStoppage = !!(order.stoppage && !order.stoppage.resolved);

                  return (
                    <div
                      key={order.id}
                      className={`rounded-xl p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between ${
                        isHighPriority
                          ? 'bg-linear-to-br from-red-50/60 via-white to-white border-2 border-red-500 ring-2 ring-red-200'
                          : 'bg-white border border-blue-200 ring-1 ring-blue-50'
                      }`}
                    >
                      <div className="space-y-3">
                        
                        {/* High Priority Red Banner */}
                        {isHighPriority && (
                          <div className="bg-red-600 text-white px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-bold animate-pulse shadow-xs">
                            <span className="flex items-center gap-1.5">
                              <Flame className="w-4 h-4 fill-white text-white" />
                              HITAN / VISOK PRIORITET
                            </span>
                            <span className="text-[10px] uppercase tracking-wider font-mono bg-white/20 px-2 py-0.5 rounded">
                              Odmah pristupiti radu
                            </span>
                          </div>
                        )}

                        {/* Active Stoppage Banner */}
                        {hasActiveStoppage && (
                          <div className="p-3 bg-red-100 border-2 border-red-400 rounded-xl flex items-start gap-2.5">
                            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5 animate-bounce" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-red-900 uppercase flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                  ZASTOJ: {order.stoppage?.reason}
                                </span>
                                <span className="text-[10px] text-red-700 font-mono">
                                  {order.stoppage?.reportedAt}
                                </span>
                              </div>
                              <p className="text-xs text-red-800 mt-1 whitespace-pre-wrap leading-relaxed font-medium">
                                {order.stoppage?.description}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStoppageOrder(order)}
                                  className="text-[11px] font-bold text-red-800 bg-white/90 hover:bg-white px-2.5 py-1 rounded-md border border-red-300 transition cursor-pointer shadow-2xs"
                                >
                                  Ažuriraj ili riješi zastoj →
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Top Row: Number, Customer & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <OrderNumberWithHover
                              order={order}
                              onClick={() => setOrderForFullDetails(order)}
                            />
                            {order.customer && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <Building className="w-3 h-3 text-slate-500" />
                                {order.customer}
                              </span>
                            )}
                          </div>
                          <div>{getStatusBadge(order.status)}</div>
                        </div>

                        {/* Title */}
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm leading-snug">
                            {order.title}
                          </h3>
                          {order.createdBy && (
                            <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                              Kreirao nalog: <span className="font-medium text-slate-700">{order.createdBy.fullName || order.createdBy.username}</span>
                            </div>
                          )}
                          {order.description && (
                            <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {order.description}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Specific task note from admin */}
                        {myNote && (
                          <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-xs text-amber-900">
                            <div className="font-semibold text-[11px] text-amber-800 flex items-center gap-1 mb-0.5">
                              <Info className="w-3.5 h-3.5 text-amber-600" />
                              Vaš zadatak / Uputstvo:
                            </div>
                            <p className="text-xs whitespace-pre-wrap leading-relaxed">{myNote}</p>
                          </div>
                        )}

                        {/* Meta info & Full notes button */}
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono pt-1">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              Rok: {order.dueDate}
                            </span>
                            <span>·</span>
                            <span className={`flex items-center gap-1 font-bold ${
                              isHighPriority ? 'text-red-600' : 'text-slate-600'
                            }`}>
                              {isHighPriority && <Flame className="w-3 h-3 fill-red-600 text-red-600" />}
                              Prioritet: {order.priority}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setNoteOrder(order)}
                            className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition cursor-pointer"
                            title="Otvori sve unijete napomene u cijelosti"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Cijele napomene</span>
                          </button>
                        </div>

                        {/* Status naloga row inside card */}
                        <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs">
                          <span className="text-slate-600 font-semibold">Status radnog naloga:</span>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(order.status)}
                          </div>
                        </div>

                      </div>

                      {/* Action buttons directly on order */}
                      <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setStoppageOrder(order)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                            hasActiveStoppage
                              ? 'text-red-800 bg-red-100 hover:bg-red-200 border-red-300'
                              : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300'
                          }`}
                          title="Evidencija problema ili zastoja na mašini / čekanju materijala"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>{hasActiveStoppage ? 'Ažuriraj zastoj' : '⚠️ Prijavi zastoj'}</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOrderForFullDetails(order)}
                            title="Oko: Detaljan uvid u radni nalog i materijale"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canEditOrders && (
                            <button
                              type="button"
                              onClick={() => openCreateWorkOrderModal(order)}
                              title="Izmijeni radni nalog"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {canDeleteOrders && (
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order)}
                              title="Obriši radni nalog"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenLogModal(order.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition cursor-pointer"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Uradi nalog / Upiši utrošak</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Istorija završenih radnih naloga */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-visible">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-900">
                  Istorija završenih radnih naloga ({displayedHistoryOrders.length})
                </h3>
              </div>

              {/* Toggle: Svi završeni vs Samo moji */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      historyViewMode === 'all'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Svi do sada završeni ({allCompletedOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('my')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      historyViewMode === 'my'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Samo moji ({myCompletedOrders.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">Broj naloga</th>
                    <th className="py-2.5 px-4">Za koga se radilo</th>
                    <th className="py-2.5 px-4">Naziv posla i ko je kreirao</th>
                    <th className="py-2.5 px-4">Datum završetka</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedHistoryOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                        {historyViewMode === 'my'
                          ? 'Nemate svojih završenih naloga. Izaberite "Svi do sada završeni" za pregled svih naloga u radionici.'
                          : 'Nema završenih radnih naloga u bazi.'}
                      </td>
                    </tr>
                  ) : (
                    displayedHistoryOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <OrderNumberWithHover
                            order={order}
                            onClick={() => setOrderForFullDetails(order)}
                          />
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                          {order.customer || '-'}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{order.title}</div>
                          {order.createdBy && (
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                              Kreirao: <span className="font-semibold text-slate-700">{order.createdBy.fullName || order.createdBy.username}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {order.completedAt || order.dueDate}
                        </td>
                        <td className="py-2.5 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Završeno
                          </span>
                          {order.closedBy && (
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                              Zatvorio: <strong className="text-slate-700">{order.closedBy.fullName}</strong>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* VIEW: SVI RADNI NALOZI */}
      {mode === 'all' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-purple-600" />
              Svi radni nalozi u radionici
            </h2>
            <div className="flex items-center gap-3">
              {canCreateOrders && (
                <button
                  type="button"
                  onClick={() => openCreateWorkOrderModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-2xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Novi nalog</span>
                </button>
              )}
              <span className="text-xs font-mono text-slate-500">
                Prikazano: {filteredAllOrders.length}
              </span>
            </div>
          </div>

          {/* Search and Worker Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pretraži po broju naloga, naručiocu ili nazivu posla..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Filter po radnicima */}
            <div className="flex items-center gap-2 min-w-56">
              <Users className="w-4 h-4 text-purple-600 shrink-0" />
              <select
                value={workerFilter}
                onChange={(e) => setWorkerFilter(e.target.value)}
                className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
              >
                <option value="all">Svi radnici (svi nalozi)</option>
                {allWorkers.map((w) => (
                  <option key={w.username} value={w.username}>
                    {w.fullName} ({w.username})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prikaz za mobilne telefone: Identicne vizuelne kartice (kocke) prilagodjene sirini ekrana telefona bez vodoravnog skrola */}
          <div className="md:hidden space-y-4">
            {filteredAllOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-800 text-sm">Nema radnih naloga koji odgovaraju izabranom filteru</p>
              </div>
            ) : (
              filteredAllOrders.map((order) => {
                const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                const hasActiveStoppage = !!(order.stoppage && !order.stoppage.resolved);
                const isAssignedToMe = Array.isArray(order.assignedWorkers) && order.assignedWorkers.includes(currentUser.username);
                const myNote = order.workerNotes?.[currentUser.username];

                return (
                  <div
                    key={order.id}
                    className={`rounded-xl p-4 shadow-xs transition hover:shadow-md flex flex-col justify-between w-full ${
                      isHighPriority && order.status !== 'zavrseno'
                        ? 'bg-linear-to-br from-red-50/60 via-white to-white border-2 border-red-500 ring-2 ring-red-200'
                        : order.status === 'zavrseno'
                        ? 'bg-slate-50/80 border border-slate-200'
                        : isAssignedToMe
                        ? 'bg-white border-2 border-blue-400 ring-1 ring-blue-100'
                        : 'bg-white border border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* High Priority Red Banner */}
                      {isHighPriority && order.status !== 'zavrseno' && (
                        <div className="bg-red-600 text-white px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-bold animate-pulse shadow-xs">
                          <span className="flex items-center gap-1.5">
                            <Flame className="w-4 h-4 fill-white text-white" />
                            HITAN / VISOK PRIORITET
                          </span>
                          <span className="text-[10px] uppercase tracking-wider font-mono bg-white/20 px-2 py-0.5 rounded">
                            Odmah raditi
                          </span>
                        </div>
                      )}

                      {/* Active Stoppage Banner */}
                      {hasActiveStoppage && (
                        <div className="p-3 bg-red-100 border-2 border-red-400 rounded-xl flex items-start gap-2.5">
                          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5 animate-bounce" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-red-900 uppercase flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                ZASTOJ: {order.stoppage?.reason}
                              </span>
                              <span className="text-[10px] text-red-700 font-mono">
                                {order.stoppage?.reportedAt}
                              </span>
                            </div>
                            <p className="text-xs text-red-800 mt-1 whitespace-pre-wrap leading-relaxed font-medium">
                              {order.stoppage?.description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setStoppageOrder(order)}
                                className="text-[11px] font-bold text-red-800 bg-white/90 hover:bg-white px-2.5 py-1 rounded-md border border-red-300 transition cursor-pointer shadow-2xs"
                              >
                                Ažuriraj ili riješi zastoj →
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Top Row: Number, Customer & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <OrderNumberWithHover
                            order={order}
                            onClick={() => setOrderForFullDetails(order)}
                          />
                          {order.customer && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              <Building className="w-3 h-3 text-slate-500" />
                              {order.customer}
                            </span>
                          )}
                        </div>
                        <div>{getStatusBadge(order.status)}</div>
                      </div>

                      {/* Title & Creator */}
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-snug">
                          {order.title}
                        </h3>
                        {order.createdBy && (
                          <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                            Kreirao nalog: <span className="font-medium text-slate-700">{order.createdBy.fullName || order.createdBy.username}</span>
                          </div>
                        )}
                        {order.description && (
                          <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {order.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Specific task note if assigned to me */}
                      {myNote && (
                        <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-xs text-amber-900">
                          <div className="font-semibold text-[11px] text-amber-800 flex items-center gap-1 mb-0.5">
                            <Info className="w-3.5 h-3.5 text-amber-600" />
                            Vaš zadatak / Uputstvo:
                          </div>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed">{myNote}</p>
                        </div>
                      )}

                      {/* Assigned Workers */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-purple-600" />
                          Radnici:
                        </span>
                        {(order?.assignedWorkers || []).length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">Nije dodijeljen</span>
                        ) : (
                          (order?.assignedWorkers || []).map((u) => (
                            <span
                              key={u}
                              className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                u === currentUser.username
                                  ? 'bg-blue-100 text-blue-800 font-bold border border-blue-300'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {u}
                            </span>
                          ))
                        )}
                      </div>

                      {/* Meta info & Full notes button */}
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Rok: {order.dueDate}
                          </span>
                          <span>·</span>
                          <span className={`flex items-center gap-1 font-bold ${
                            isHighPriority ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {isHighPriority && <Flame className="w-3 h-3 fill-red-600 text-red-600" />}
                            {order.priority}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setNoteOrder(order)}
                          className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition cursor-pointer"
                          title="Otvori sve unijete napomene u cijelosti"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Napomene</span>
                        </button>
                      </div>

                      {/* Status row if closed */}
                      {order.status === 'zavrseno' && (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Završeno: {order.completedAt || order.dueDate}
                          </span>
                          {order.closedBy && (
                            <span>Zatvorio: <strong>{order.closedBy.fullName}</strong></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons directly on order */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      {order.status !== 'zavrseno' ? (
                        <button
                          type="button"
                          onClick={() => setStoppageOrder(order)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                            hasActiveStoppage
                              ? 'text-red-800 bg-red-100 hover:bg-red-200 border-red-300'
                              : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300'
                          }`}
                          title="Evidencija problema ili zastoja"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>{hasActiveStoppage ? 'Ažuriraj zastoj' : '⚠️ Zastoj'}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Urađeno
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => setOrderForFullDetails(order)}
                          title="Detaljan uvid u radni nalog i materijale"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canEditOrders && (
                          <button
                            type="button"
                            onClick={() => openCreateWorkOrderModal(order)}
                            title="Izmijeni radni nalog"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {canDeleteOrders && (
                          <button
                            type="button"
                            onClick={() => setOrderToDelete(order)}
                            title="Obriši radni nalog"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {order.status !== 'zavrseno' && (
                          <button
                            type="button"
                            onClick={() => handleOpenLogModal(order.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-2xs transition cursor-pointer"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Uradi / Upiši</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Prikaz za racunare i vece ekrane: Tabela */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-visible">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Broj naloga</th>
                    <th className="py-3 px-4">Za koga se radi</th>
                    <th className="py-3 px-4">Naziv posla i opis</th>
                    <th className="py-3 px-4">Radnici</th>
                    <th className="py-3 px-4">Rok / Prioritet</th>
                    <th className="py-3 px-4">Status / Zastoj</th>
                    <th className="py-3 px-4 text-center">Akcija</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAllOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                        Nema radnih naloga koji odgovaraju izabranom filteru.
                      </td>
                    </tr>
                  ) : (
                    filteredAllOrders.map((order) => {
                      const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                      const hasActiveStoppage = !!(order.stoppage && !order.stoppage.resolved);

                      return (
                        <tr
                          key={order.id}
                          className={`transition-colors ${
                            isHighPriority
                              ? 'border-l-4 border-l-red-600 bg-red-50/40 hover:bg-red-50/70'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <OrderNumberWithHover
                                order={order}
                                onClick={() => setOrderForFullDetails(order)}
                              />
                              {isHighPriority && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 border border-red-300 px-1.5 py-0.5 rounded animate-pulse">
                                  <Flame className="w-3 h-3 fill-red-600 text-red-600" />
                                  HITNO
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                              <Building className="w-3 h-3 text-slate-500" />
                              {order.customer || '-'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 max-w-sm">
                            <div className="font-semibold text-slate-900">{order.title}</div>
                            {order.createdBy && (
                              <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                                Kreirao nalog: <span className="font-semibold text-slate-700">{order.createdBy.fullName || order.createdBy.username}</span>
                              </div>
                            )}
                            {order.description && (
                              <div className="mt-1 text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">
                                {order.description}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setNoteOrder(order)}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              Prikaži sve napomene →
                            </button>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(order?.assignedWorkers || []).map((u) => (
                                <span
                                  key={u}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    u === currentUser.username
                                      ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {u}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-mono text-slate-600 text-xs">{order.dueDate}</div>
                            <div className="mt-0.5">
                              {isHighPriority ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                                  <Flame className="w-3 h-3 fill-red-600 text-red-600" />
                                  {order.priority}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {order.priority}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-1">
                              {getStatusBadge(order.status)}

                              {hasActiveStoppage && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setStoppageOrder(order)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-300 px-2 py-0.5 rounded cursor-pointer"
                                    title="Prijavljen zastoj - kliknite za detalje"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-red-600 animate-pulse" />
                                    <span>ZASTOJ: {order.stoppage?.reason}</span>
                                  </button>
                                </div>
                              )}

                              {order.status === 'zavrseno' && order.closedBy && (
                                <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                                  Zatvorio: <strong className="text-slate-700">{order.closedBy.fullName}</strong>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setOrderForFullDetails(order)}
                                title="Oko: Detaljan uvid u radni nalog i materijale"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {canEditOrders && (
                                <button
                                  type="button"
                                  onClick={() => openCreateWorkOrderModal(order)}
                                  title="Izmijeni radni nalog"
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}

                              {canDeleteOrders && (
                                <button
                                  type="button"
                                  onClick={() => setOrderToDelete(order)}
                                  title="Obriši radni nalog"
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}

                              {order.status !== 'zavrseno' && (
                                <button
                                  type="button"
                                  onClick={() => setStoppageOrder(order)}
                                  title="Prijavi ili ažuriraj zastoj"
                                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                    hasActiveStoppage
                                      ? 'text-red-700 bg-red-100 border-red-300'
                                      : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                  }`}
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              )}

                              {order.status !== 'zavrseno' ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLogModal(order.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-2xs transition cursor-pointer"
                                >
                                  <Wrench className="w-3.5 h-3.5" />
                                  <span>Uradi / Upiši</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Završen</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Log Consumption Modal (Up to 4 materials or 0 materials) */}
      {selectedOrderIdForLogging && (
        <LogConsumptionModal
          isOpen={isLogModalOpen}
          onClose={() => {
            setIsLogModalOpen(false);
            setSelectedOrderIdForLogging(undefined);
          }}
          preselectedOrderId={selectedOrderIdForLogging}
          allowAllOrders={true}
        />
      )}

      {/* Full Details Modal on clicking order number */}
      <WorkOrderDetailModal
        order={orderForFullDetails}
        onClose={() => setOrderForFullDetails(null)}
      />

      {/* Stoppage Modal */}
      <StoppageModal
        isOpen={!!stoppageOrder}
        order={stoppageOrder}
        onClose={() => setStoppageOrder(null)}
      />

      {/* Note Viewer Modal for complete unclipped notes */}
      <NoteViewerModal
        isOpen={!!noteOrder}
        order={noteOrder}
        onClose={() => setNoteOrder(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!orderToDelete}
        title="Brisanje radnog naloga"
        message={`Da li ste sigurni da želite obrisati radni nalog "${orderToDelete?.orderNumber} - ${orderToDelete?.title}"?`}
        confirmLabel="Obriši nalog"
        onConfirm={() => {
          if (orderToDelete) {
            deleteWorkOrder(orderToDelete.id);
            setOrderToDelete(null);
          }
        }}
        onCancel={() => setOrderToDelete(null)}
      />

    </div>
  );
};
