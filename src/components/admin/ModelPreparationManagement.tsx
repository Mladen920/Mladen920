import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder } from '../../types';
import { 
  Compass, 
  Search, 
  UserCheck, 
  Calendar, 
  ArrowRight, 
  Building, 
  CheckCircle2, 
  Clock, 
  Layers, 
  Send, 
  Eye, 
  Edit3, 
  Users, 
  Plus, 
  Flame, 
  Sparkles,
  Check,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { OrderNumberWithHover } from '../common/OrderNumberWithHover';
import { WorkOrderDetailModal } from '../common/WorkOrderDetailModal';
import { NoteViewerModal } from '../common/NoteViewerModal';

export const ModelPreparationManagement: React.FC = () => {
  const { 
    workOrders, 
    users, 
    releaseOrderToProduction, 
    openCreateWorkOrderModal,
    deleteWorkOrder,
    updateWorkOrder
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [tableDisplayMode, setTableDisplayMode] = useState<'scroll' | 'full'>('scroll');
  const [overviewFilter, setOverviewFilter] = useState<'all' | 'priprema' | 'pusteno'>('all');
  const [orderForFullDetails, setOrderForFullDetails] = useState<WorkOrder | null>(null);
  const [orderForNotes, setOrderForNotes] = useState<WorkOrder | null>(null);
  const [releasedSuccessId, setReleasedSuccessId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<WorkOrder | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ title: string; text: string; type: 'success' | 'info' | 'danger' } | null>(null);

  // All orders currently in 'priprema' status (unlimited)
  const ordersInPreparation = (workOrders || []).filter(
    (order) => order?.status === 'priprema'
  );

  // Orders that were prepared and released into production:
  // Svi aktivni statusi (na_cekanju, u_izradi) ostaju na vrhu dok se ne završe ili otkažu
  const releasedOrders = (workOrders || [])
    .filter((order) => order?.modelPreparation?.isReady && order?.status !== 'priprema')
    .sort((a, b) => {
      const isClosed = (o: WorkOrder) => o.status === 'zavrseno' || o.status === 'otkazano';
      const activeA = !isClosed(a);
      const activeB = !isClosed(b);

      // 1. Aktivni nalozi ostaju na vrhu
      if (activeA && !activeB) return -1;
      if (!activeA && activeB) return 1;

      // 2. Unutar aktivnih na vrhu:
      if (activeA && activeB) {
        const urgentA = a.priority === 'hitno' ? 3 : a.priority === 'visoko' ? 2 : 1;
        const urgentB = b.priority === 'hitno' ? 3 : b.priority === 'visoko' ? 2 : 1;
        if (urgentB !== urgentA) return urgentB - urgentA;

        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        const cmpDate = dateB.localeCompare(dateA);
        if (cmpDate !== 0) return cmpDate;

        const orderA = a.orderNumber || '';
        const orderB = b.orderNumber || '';
        return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
      }

      // 3. Samo završeni i otkazani vraćaju se na svoje redno mjesto po broju naloga:
      const orderA = a.orderNumber || '';
      const orderB = b.orderNumber || '';
      return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
    });

  // Worker list
  const workerUsers = (users || []).filter((u) => u.role === 'worker');

  const getUrgentTopWeight = (order: WorkOrder) => {
    if (order.status === 'zavrseno' || order.status === 'otkazano') return 0;
    if (order.priority === 'hitno') return 3;
    if (order.priority === 'visoko') return 2;
    return 0;
  };

  // Filtered orders in preparation
  const filteredPreparationOrders = ordersInPreparation.filter((order) => {
    const oNum = order?.orderNumber || '';
    const oTitle = order?.title || '';
    const oCust = order?.customer || '';
    const mName = order?.modelPreparation?.modelName || '';
    const targetW = order?.modelPreparation?.targetWorker || (order?.assignedWorkers?.[0] || '');
    const notes = order?.modelPreparation?.notes || '';

    const matchesSearch =
      oNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oCust.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notes.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesWorker = workerFilter === 'all' || targetW === workerFilter;

    return matchesSearch && matchesWorker;
  });

  // Nezavršeni hitni nalozi su na početku; završeni se vraćaju na redno mesto po broju naloga
  // Najstariji ide poslednji, noviji na vrh
  const sortedPreparationOrders = [...filteredPreparationOrders].sort((a, b) => {
    const pDiff = getUrgentTopWeight(b) - getUrgentTopWeight(a);
    if (pDiff !== 0) return pDiff;
    const orderA = a.orderNumber || '';
    const orderB = b.orderNumber || '';
    const cmp = orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  const handleRelease = (orderId: string) => {
    const res = releaseOrderToProduction(orderId);
    if (res.success) {
      setReleasedSuccessId(orderId);
      setTimeout(() => {
        setReleasedSuccessId(null);
      }, 3500);
    }
  };

  const handleDeleteConfirm = async () => {
    if (orderToDelete) {
      const orderNum = orderToDelete.orderNumber;
      const orderTitle = orderToDelete.title;
      const idToDelete = orderToDelete.id;
      setOrderToDelete(null);
      await deleteWorkOrder(idToDelete);
      setNotificationMsg({
        title: 'Priprema modela je obrisana',
        text: `Radni nalog ${orderNum} ("${orderTitle}") je trajno obrisan iz sistema.`,
        type: 'danger',
      });
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  const handleRevertToPreparation = (orderId: string) => {
    const order = workOrders.find((o) => o.id === orderId);
    if (!order) return;
    const res = updateWorkOrder(orderId, {
      status: 'priprema',
      modelPreparation: {
        ...(order.modelPreparation || {}),
        isReady: false,
      },
    });
    if (res.success) {
      setNotificationMsg({
        title: 'Nalog je vraćen u pripremu modela',
        text: `Radni nalog ${order.orderNumber} ("${order.title}") je povučen iz radionice nazad u pripremu kod administratora.`,
        type: 'info',
      });
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Compass className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Faza: Priprema Modela
            </h1>
            <span className="text-[11px] font-mono font-semibold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded border border-indigo-300">
              {ordersInPreparation.length} u pripremi (Neograničen unos)
            </span>
            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Trajno čuvanje u bazi
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Digitalna priprema modela od strane administratora sa <strong>neograničenim unosom naloga</strong>. Radnici u radionici <strong>ne vide nalog</strong> dok administrator ne završi pripremu i ne klikne na dugme <em>"Pusti u rad / Prosledi radnicima"</em>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateWorkOrderModal(null)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Kreiraj nalog za pripremu modela</span>
        </button>
      </div>

      {/* Success Notification after release */}
      {releasedSuccessId && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-center gap-3 animate-in fade-in duration-200 shadow-xs">
          <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="text-xs text-emerald-900">
            <strong className="text-sm font-bold block text-emerald-950">
              Nalog je uspješno pušten u rad!
            </strong>
            <span>
              Radni nalog je prebačen u aktivne naloge i sada je vidljiv radnicima u radionici za preuzimanje i evidenciju rada.
            </span>
          </div>
        </div>
      )}

      {/* Action Notification Banner */}
      {notificationMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in duration-200 shadow-xs border-2 ${
          notificationMsg.type === 'danger'
            ? 'bg-red-50 border-red-300 text-red-900'
            : notificationMsg.type === 'info'
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-emerald-50 border-emerald-300 text-emerald-900'
        }`}>
          <div className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 ${
            notificationMsg.type === 'danger'
              ? 'bg-red-600'
              : notificationMsg.type === 'info'
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}>
            {notificationMsg.type === 'danger' ? (
              <Trash2 className="w-5 h-5" />
            ) : notificationMsg.type === 'info' ? (
              <RotateCcw className="w-5 h-5" />
            ) : (
              <Check className="w-5 h-5 stroke-[2.5]" />
            )}
          </div>
          <div className="text-xs">
            <strong className="text-sm font-bold block">
              {notificationMsg.title}
            </strong>
            <span className="opacity-90">
              {notificationMsg.text}
            </span>
          </div>
        </div>
      )}

      {/* Key KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Čeka digitalnu pripremu</span>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">Neograničeno</span>
            </div>
            <span className="text-2xl font-bold font-mono text-indigo-700">
              {ordersInPreparation.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
            <Compass className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Završena priprema & pušteno</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Svi nalozi</span>
            </div>
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {releasedOrders.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">Raspoloživih radnika</span>
            <span className="text-2xl font-bold font-mono text-slate-700">
              {workerUsers.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pretraga po broju naloga, kupcu, nazivu modela ili tehničkim uputama..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 min-w-56">
          <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <select
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Svi radnici</option>
            {workerUsers.map((w) => (
              <option key={w.username} value={w.username}>
                {w.fullName} ({w.username})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders In Preparation Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-600" />
            Nalozi koji čekaju pripremu modela ({sortedPreparationOrders.length})
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Hitni nalozi su na početku • Dozvoljena količina neograničeno
          </span>
        </div>

        {sortedPreparationOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500 shadow-xs">
            <Compass className="w-10 h-10 text-indigo-200 mx-auto mb-2 animate-spin-slow" />
            <h3 className="text-sm font-bold text-slate-800">
              Nema radnih naloga u pripremi modela
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Svi modeli su uspješno pripremljeni i proslijeđeni radnicima u radionicu. 
              Možete kreirati novi radni nalog klikom na dugme iznad.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedPreparationOrders.map((order) => {
              const prep = order.modelPreparation;
              const targetWorkerObj = users.find(
                (u) => u.username === (prep?.targetWorker || order.assignedWorkers?.[0])
              );
              const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden relative ${
                    isHighPriority
                      ? 'border-2 border-red-500 ring-1 ring-red-400/20'
                      : 'border-2 border-indigo-200'
                  }`}
                >
                  {/* Top Bar with Badge */}
                  <div className="bg-linear-to-r from-indigo-50 via-purple-50 to-blue-50 px-4 py-2.5 border-b border-indigo-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <OrderNumberWithHover
                        order={order}
                        onClick={() => setOrderForFullDetails(order)}
                      />
                      {order.customer && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          <Building className="w-3 h-3 text-slate-500" />
                          {order.customer}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isHighPriority && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded animate-pulse">
                          <Flame className="w-3 h-3 fill-amber-300 text-amber-300" />
                          HITNO
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Priprema modela
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3 flex-1">
                    {/* Job Title & Main Model Name */}
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {order.title}
                      </h3>
                      {prep?.modelName && (
                        <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                          <Compass className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Model: {prep.modelName}</span>
                        </div>
                      )}
                    </div>

                    {/* Target Worker Box */}
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                          Za kog radnika se priprema model:
                        </span>
                        <strong className="text-indigo-900 font-bold">
                          {targetWorkerObj ? targetWorkerObj.fullName : (prep?.targetWorker || 'Nije specificiran')}
                        </strong>
                      </div>
                      {order.assignedWorkers && order.assignedWorkers.length > 1 && (
                        <div className="text-[10px] text-slate-500 pt-0.5">
                          Ostali radnici na nalogu: {order.assignedWorkers.filter(w => w !== prep?.targetWorker).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Dimensions & Technical Specs */}
                    {prep?.dimensions && (
                      <div className="p-2 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <span className="font-semibold text-[11px] text-amber-800 block">
                          Dimenzije / Rezni list:
                        </span>
                        <p className="mt-0.5 font-mono text-[11px] font-medium">
                          {prep.dimensions}
                        </p>
                      </div>
                    )}

                    {/* Digital Preparation Instructions */}
                    {prep?.notes && (
                      <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900">
                        <span className="font-semibold text-[11px] text-blue-800 block">
                          Uputstva za pripremu (CNC / CAD / Fajlovi):
                        </span>
                        <p className="mt-0.5 text-xs whitespace-pre-wrap">
                          {prep.notes}
                        </p>
                      </div>
                    )}

                    {/* Order General Description */}
                    {order.description && (
                      <div className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                        <span className="font-semibold text-slate-500 text-[11px] block">Opis naloga:</span>
                        <p className="mt-0.5 whitespace-pre-wrap line-clamp-3">
                          {order.description}
                        </p>
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Rok izrade: {order.dueDate}
                      </span>
                      <span>Prioritet: {order.priority}</span>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOrderForFullDetails(order)}
                        title="Kompletan uvid u nalog"
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openCreateWorkOrderModal(order)}
                        title="Uredi nalog i pripremu modela"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderToDelete(order)}
                        title="Obriši ovu pripremu modela ako ste se predomislili"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* PRIMARY ACTION BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleRelease(order.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Pusti u rad / Prosledi radnicima</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comprehensive Scrollable Overview Table of All Orders in Model Preparation */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                Tabela svih naloga u pripremi modela
              </h3>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Neograničen uvid & nesmetano skrolovanje
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Prikaz svih naloga u pripremi ({sortedPreparationOrders.length}) i puštenih modela ({releasedOrders.length}) sa automatskim stavljanjem hitnih naloga na početak tabele.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Filter pills: Svi / U pripremi / Pušteni */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setOverviewFilter('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  overviewFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Svi ({sortedPreparationOrders.length + releasedOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOverviewFilter('priprema')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  overviewFilter === 'priprema'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
              >
                U pripremi ({sortedPreparationOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOverviewFilter('pusteno')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  overviewFilter === 'pusteno'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-800 hover:text-emerald-950'
                }`}
              >
                Pušteni ({releasedOrders.length})
              </button>
            </div>

            {/* Display Mode: Scroll traka vs Puni prikaz */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setTableDisplayMode('scroll')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                  tableDisplayMode === 'scroll'
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Prikazuje 9 prvih naloga sa nesmetanim skrolovanjem kroz sve ostale"
              >
                ↕️ Scroll traka (prikaz 9 naloga)
              </button>
              <button
                type="button"
                onClick={() => setTableDisplayMode('full')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                  tableDisplayMode === 'full'
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Puni prikaz svih naloga bez ograničenja visine"
              >
                📜 Puni prikaz
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable container: 520px height shows roughly 9 rows, with sticky table header */}
        <div className={`overflow-x-auto scroll-smooth custom-scrollbar ${
          tableDisplayMode === 'scroll' ? 'max-h-[520px] overflow-y-auto' : 'overflow-y-visible'
        }`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className={tableDisplayMode === 'scroll' ? 'sticky top-0 z-20 bg-slate-100/95 backdrop-blur-xs shadow-2xs' : 'bg-slate-50'}>
              <tr className="border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Prioritet</th>
                <th className="py-2.5 px-3">Broj naloga</th>
                <th className="py-2.5 px-3">Za koga se radi</th>
                <th className="py-2.5 px-3">Model / Naziv posla</th>
                <th className="py-2.5 px-3">Dodeljeni radnik</th>
                <th className="py-2.5 px-3">Dimenzije / Specifikacije</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-center">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {((overviewFilter === 'all' && sortedPreparationOrders.length === 0 && releasedOrders.length === 0) ||
                (overviewFilter === 'priprema' && sortedPreparationOrders.length === 0) ||
                (overviewFilter === 'pusteno' && releasedOrders.length === 0)) ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                    <Compass className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Nema naloga za prikaz u odabranoj kategoriji.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Svi uneti nalozi su trajno sačuvani u bazi podataka.</p>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Preparation orders first (urgent at top) - shown if filter is 'all' or 'priprema' */}
                  {(overviewFilter === 'all' || overviewFilter === 'priprema') && sortedPreparationOrders.map((order) => {
                    const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                    const targetWorkerObj = users.find(
                      (u) => u.username === (order.modelPreparation?.targetWorker || order.assignedWorkers?.[0])
                    );

                    return (
                      <tr 
                        key={order.id} 
                        className={`transition-colors ${
                          isHighPriority 
                            ? 'bg-red-50/60 hover:bg-red-50/90 font-medium' 
                            : 'hover:bg-indigo-50/40 bg-white'
                        }`}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isHighPriority ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded shadow-2xs animate-pulse">
                              <Flame className="w-3 h-3 fill-amber-300 text-amber-300" />
                              HITNO
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              {order.priority}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <OrderNumberWithHover
                            order={order}
                            onClick={() => setOrderForFullDetails(order)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium whitespace-nowrap">
                          {order.customer ? (
                            <span className="inline-flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" />
                              {order.customer}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 leading-snug">
                            {order.modelPreparation?.modelName || order.title}
                          </div>
                          {order.modelPreparation?.modelName && order.title !== order.modelPreparation.modelName && (
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">
                              {order.title}
                            </div>
                          )}
                          <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                            Kreirao: <strong className="text-slate-700">{order.createdBy?.fullName || 'Administrator'}</strong>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {targetWorkerObj ? targetWorkerObj.fullName : (order.modelPreparation?.targetWorker || order.assignedWorkers.join(', '))}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate font-mono text-[11px]">
                          {order.modelPreparation?.dimensions || '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 shadow-2xs">
                            <Clock className="w-3 h-3 text-amber-600" />
                            U pripremi kod admina
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRelease(order.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded shadow-xs transition cursor-pointer"
                              title="Pusti nalog u radionicu"
                            >
                              <Send className="w-3 h-3" />
                              <span>Pusti u rad</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderForFullDetails(order)}
                              title="Pregled detalja"
                              className="p-1 text-slate-500 hover:text-indigo-600 rounded transition cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateWorkOrderModal(order)}
                              title="Uredi pripremu"
                              className="p-1 text-slate-500 hover:text-blue-600 rounded transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order)}
                              title="Obriši pripremu modela ako ste se predomislili"
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Prethodno pušteni nalozi - shown if filter is 'all' or 'pusteno' */}
                  {(overviewFilter === 'all' || overviewFilter === 'pusteno') && releasedOrders.map((order) => {
                    const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                    return (
                      <tr key={order.id} className="hover:bg-slate-50/70 bg-slate-50/30">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isHighPriority ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded shadow-2xs">
                              <Flame className="w-3 h-3 fill-amber-300 text-amber-300" />
                              HITNO
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              {order.priority}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <OrderNumberWithHover
                            order={order}
                            onClick={() => setOrderForFullDetails(order)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {order.customer || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          <div>{order.modelPreparation?.modelName || order.title}</div>
                          <span className="text-[10px] text-slate-500 font-sans block mt-0.5 font-normal">
                            Kreirao: <strong className="text-slate-700">{order.createdBy?.fullName || 'Administrator'}</strong>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {order.modelPreparation?.targetWorkerName || order.modelPreparation?.targetWorker || order.assignedWorkers.join(', ')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate font-mono text-[11px]">
                          {order.modelPreparation?.dimensions || '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Pušteno u radionicu
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRevertToPreparation(order.id)}
                              title="Vrati nalog nazad u pripremu modela ako ste se predomislili (povući iz radionice)"
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Vrati u pripremu</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderForFullDetails(order)}
                              title="Pregled detalja"
                              className="p-1 text-slate-500 hover:text-indigo-600 rounded transition cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateWorkOrderModal(order)}
                              title="Uredi radni nalog"
                              className="p-1 text-slate-500 hover:text-blue-600 rounded transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order)}
                              title="Obriši radni nalog"
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Details Modal on clicking order number */}
      <WorkOrderDetailModal
        order={orderForFullDetails}
        onClose={() => setOrderForFullDetails(null)}
      />

      {/* Note Viewer Modal */}
      <NoteViewerModal
        isOpen={!!orderForNotes}
        order={orderForNotes}
        onClose={() => setOrderForNotes(null)}
      />

      {/* Delete Preparation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!orderToDelete}
        title="Brisanje pripreme modela"
        message={`Da li ste sigurni da želite obrisati pripremu modela za radni nalog ${orderToDelete?.orderNumber} ("${orderToDelete?.title}")? Radni nalog će biti trajno uklonjen iz baze.`}
        confirmLabel="Obriši pripremu"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setOrderToDelete(null)}
      />

    </div>
  );
};
