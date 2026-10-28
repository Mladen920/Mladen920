import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, OrderStatus } from '../../types';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Clock, 
  Layers, 
  CheckCircle2, 
  Calendar, 
  Building,
  Eye,
  FileSpreadsheet,
  Users,
  FileText,
  Flame,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  Compass,
  Send,
  PackageCheck,
  Download
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { OrderNumberWithHover } from '../common/OrderNumberWithHover';
import { WorkOrderDetailModal } from '../common/WorkOrderDetailModal';
import { GoogleSheetsSyncModal } from '../common/GoogleSheetsSyncModal';
import { StoppageModal } from '../common/StoppageModal';
import { NoteViewerModal } from '../common/NoteViewerModal';
import { LogConsumptionModal } from '../worker/LogConsumptionModal';

interface WorkOrdersTableProps {
  onNavigateToModels?: () => void;
}

export const WorkOrdersTable: React.FC<WorkOrdersTableProps> = ({ onNavigateToModels }) => {
  const { 
    users, 
    workOrders, 
    deleteWorkOrder, 
    consumptionLogs, 
    updateWorkOrder, 
    openCreateWorkOrderModal,
    releaseOrderToProduction,
    materials
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isLowStockCollapsed, setIsLowStockCollapsed] = useState(false);
  const [isPrepCollapsed, setIsPrepCollapsed] = useState(false);
  // Default to 'scroll' so exactly 9 work orders are visible in the window with smooth scrolling
  const [tableDisplayMode, setTableDisplayMode] = useState<'scroll' | 'full'>('scroll');
  const [orderSortDirection, setOrderSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Full details modal state
  const [orderForFullDetails, setOrderForFullDetails] = useState<WorkOrder | null>(null);

  // Consumption logging modal state for Admin (Upiši trošak)
  const [orderForConsumption, setOrderForConsumption] = useState<WorkOrder | null>(null);

  // Stoppage and Note viewer modals
  const [orderForStoppage, setOrderForStoppage] = useState<WorkOrder | null>(null);
  const [orderForNotes, setOrderForNotes] = useState<WorkOrder | null>(null);

  // Delete confirm state
  const [orderToDelete, setOrderToDelete] = useState<WorkOrder | null>(null);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Collect all known workers for advanced worker filter
  const allWorkers = useMemo(() => {
    const list = new Set<string>();
    (users || []).forEach((u) => {
      if (u.role === 'worker') list.add(u.username);
    });
    (workOrders || []).forEach((o) => {
      (o.assignedWorkers || []).forEach((w) => list.add(w));
      if (o.closedBy?.username) list.add(o.closedBy.username);
    });
    (consumptionLogs || []).forEach((l) => {
      if (l.workerUsername) list.add(l.workerUsername);
    });
    return Array.from(list).sort();
  }, [users, workOrders, consumptionLogs]);

  const lowStockMaterials = useMemo(
    () => (materials || []).filter((m) => (m?.currentStock ?? 0) <= (m?.minStock ?? 0)),
    [materials]
  );

  const preparationOrders = useMemo(
    () => (workOrders || []).filter((o) => o?.status === 'priprema'),
    [workOrders]
  );

  const activeStoppages = useMemo(
    () => (workOrders || []).filter((o) => Boolean(o?.stoppage && !o.stoppage.resolved)),
    [workOrders]
  );

  // Hitan nalog je na samom vrhu SAMO kada NIJE završen (urađen)!
  // Kada se nalog završi, vraća se na redno mjesto po broju naloga.
  const getUrgentTopWeight = (order: WorkOrder) => {
    if (order.status === 'zavrseno' || order.status === 'otkazano') return 0;
    if (order.priority === 'hitno') return 3;
    if (order.priority === 'visoko') return 2;
    return 0;
  };

  // Filtered and priority-sorted work orders
  // 1. Nezavršeni hitni nalozi su na samom vrhu
  // 2. Čim se nalog završi, vraća se u tabeli na redno mjesto po broju naloga
  const sortedFilteredOrders = useMemo(() => {
    const list = (workOrders || []).filter((order) => {
      const oNum = order?.orderNumber || '';
      const oTitle = order?.title || '';
      const oCust = order?.customer || '';
      const oDesc = order?.description || '';

      const matchesSearch =
        oNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
        oTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        oCust.toLowerCase().includes(searchTerm.toLowerCase()) ||
        oDesc.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'u_pripremi' || statusFilter === 'priprema') {
        matchesStatus = order?.status === 'priprema';
      } else if (statusFilter === 'pusteno') {
        matchesStatus = order?.status !== 'priprema';
      } else {
        matchesStatus = order?.status === statusFilter;
      }

      // Advanced Worker Filter: matches if assigned, or if they completed the order, or logged consumption!
      const assigned = Array.isArray(order?.assignedWorkers) ? order.assignedWorkers : [];
      const closedByUser = order?.closedBy?.username;
      const workedOnLogs = (consumptionLogs || []).some(
        (l) => l?.workOrderId === order?.id && l?.workerUsername === workerFilter
      );

      const matchesWorker =
        workerFilter === 'all' ||
        assigned.includes(workerFilter) ||
        closedByUser === workerFilter ||
        workedOnLogs;

      return matchesSearch && matchesStatus && matchesWorker;
    });

    // Sortiranje i redoslijed radnih naloga (Admin/Opšti pregled):
    // 1. SVI nalozi čiji status NIJE 'zavrseno' i NIJE 'otkazano' (tj. na_cekanju, u_izradi, priprema) OSTAJU NA VRHU dok se ne završe ili ne otkažu.
    // 2. Unutar aktivnih naloga na vrhu, hitni nalozi (hitno, zatim visoko) imaju apsolutni prioritet na samom vrhu iznad ostalih.
    // 3. SAMO radni nalozi koji su završeni ('zavrseno') ili otkazani ('otkazano') vraćaju se na svoje redno mjesto (redno mjesto u arhivi po broju naloga).
    const isClosed = (o: WorkOrder) => o.status === 'zavrseno' || o.status === 'otkazano';
    const isActive = (o: WorkOrder) => !isClosed(o);

    return list.sort((a, b) => {
      const activeA = isActive(a);
      const activeB = isActive(b);

      // 1. Svi aktivni statusi (priprema, na_cekanju, u_izradi) OSTAJU NA VRHU
      if (activeA && !activeB) return -1;
      if (!activeA && activeB) return 1;

      // 2. Unutar aktivnih naloga na vrhu:
      if (activeA && activeB) {
        const urgentA = a.priority === 'hitno' ? 3 : a.priority === 'visoko' ? 2 : 1;
        const urgentB = b.priority === 'hitno' ? 3 : b.priority === 'visoko' ? 2 : 1;
        if (urgentB !== urgentA) {
          return urgentB - urgentA;
        }

        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        const orderA = a.orderNumber || '';
        const orderB = b.orderNumber || '';

        if (orderSortDirection === 'asc') {
          const cmpDate = dateA.localeCompare(dateB);
          if (cmpDate !== 0) return cmpDate;
          return orderA.localeCompare(orderB, undefined, { numeric: true, sensitivity: 'base' });
        } else {
          const cmpDate = dateB.localeCompare(dateA);
          if (cmpDate !== 0) return cmpDate;
          return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
        }
      }

      // 3. SAMO nalozi koji su završeni ili otkazani vraćaju se na svoje standardno redno mjesto po broju naloga:
      const orderA = a.orderNumber || '';
      const orderB = b.orderNumber || '';
      if (orderSortDirection === 'asc') {
        return orderA.localeCompare(orderB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return orderB.localeCompare(orderA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });
  }, [workOrders, searchTerm, statusFilter, workerFilter, consumptionLogs, orderSortDirection]);

  const filteredOrders = sortedFilteredOrders;

  const handleOpenNew = () => {
    openCreateWorkOrderModal(null);
  };

  const handleOpenEdit = (order: WorkOrder) => {
    openCreateWorkOrderModal(order);
  };

  const downloadCSVBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const generateClientCSV = (orders: WorkOrder[]): Blob => {
    const escapeCSV = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'Broj naloga',
      'Naručilac',
      'Naziv posla',
      'Faza',
      'Radnici',
      'Prioritet',
      'Rok',
      'Status',
      'Datum kreiranja',
      'Zatvorio',
      'Kreirao',
      'Datum završetka',
      'Opis posla'
    ];

    const rows = orders.map((order) => {
      const faza = order.status === 'priprema' ? 'U pripremi' : 'U radionici / Proizvodnja';
      const radnici = (order.assignedWorkers || []).join('; ');
      let prioritetText = 'Normalno';
      if (order.priority === 'hitno') prioritetText = 'HITNO';
      else if (order.priority === 'visoko') prioritetText = 'Visoko';

      let statusText = 'Na čekanju';
      if (order.status === 'zavrseno') statusText = 'Završeno';
      else if (order.status === 'u_izradi') statusText = 'U izradi';
      else if (order.status === 'priprema') statusText = 'U pripremi';
      else if (order.status === 'otkazano') statusText = 'Otkazano';

      const zatvorio = order.closedBy
        ? `${order.closedBy.fullName || ''} (${order.closedBy.username || ''}) ${order.closedBy.timestamp || ''}`.trim()
        : '';

      const kreirao = order.createdBy
        ? `${order.createdBy.fullName || ''} (${order.createdBy.username || ''})`.trim()
        : '';

      return [
        escapeCSV(order.orderNumber || ''),
        escapeCSV(order.customer || ''),
        escapeCSV(order.title || ''),
        escapeCSV(faza),
        escapeCSV(radnici),
        escapeCSV(prioritetText),
        escapeCSV(order.dueDate || ''),
        escapeCSV(statusText),
        escapeCSV(order.createdAt || ''),
        escapeCSV(zatvorio),
        escapeCSV(kreirao),
        escapeCSV(order.completedAt || ''),
        escapeCSV(order.description || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  };

  const handleDownloadCSVBackup = async () => {
    setIsExportingCSV(true);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `backup-radni-nalozi-${dateStr}.csv`;
    try {
      const res = await fetch('/api/backup/csv');
      if (res.ok) {
        const blob = await res.blob();
        downloadCSVBlob(blob, fileName);
        return;
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn('Backend CSV backup failed, generating from client state:', err);
      const fallbackBlob = generateClientCSV(workOrders);
      downloadCSVBlob(fallbackBlob, fileName);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (orderToDelete) {
      const idToDelete = orderToDelete.id;
      setOrderToDelete(null);
      await deleteWorkOrder(idToDelete);
    }
  };

  const getOrderTotalTime = (orderId: string) => {
    const logs = (consumptionLogs || []).filter((l) => l?.workOrderId === orderId);
    let totalMinutes = 0;
    logs.forEach((log) => {
      totalMinutes += (log?.hoursSpent || 0) * 60 + (log?.minutesSpent || 0);
    });
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { h, m, totalEntries: logs.length };
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'priprema':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300 animate-pulse">
            <Compass className="w-3.5 h-3.5 text-indigo-600" />
            Priprema modela
          </span>
        );
      case 'zavrseno':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Završeno
          </span>
        );
      case 'u_izradi':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            U izradi
          </span>
        );
      case 'otkazano':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Otkazano
          </span>
        );
      case 'na_cekanju':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Na čekanju
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: WorkOrder['priority']) => {
    switch (priority) {
      case 'hitno':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-md border border-red-700 shadow-xs animate-pulse">
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            HITNO
          </span>
        );
      case 'visoko':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-md border border-red-700 shadow-xs">
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            VISOKO
          </span>
        );
      default:
        return <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-medium">Normalno</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Generalna Tabela Radnih Naloga
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md text-[11px] font-bold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              Neograničen unos ({workOrders.length} naloga trajno u bazi)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Svi radni nalozi se trajno čuvaju bez brisanja ili prepisivanja. Prislonite kursor na broj naloga za brzi pregled, ili kliknite za kompletan uvid.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preuzmi Backup Baze (CSV) - Vidljivo ISKLJUČIVO administratoru */}
          <button
            type="button"
            onClick={handleDownloadCSVBackup}
            disabled={isExportingCSV}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 active:bg-black text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer disabled:opacity-60"
            title="Preuzmite kompletan CSV backup svih radnih naloga iz baze podataka na svoj uređaj"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>{isExportingCSV ? 'Preuzimanje...' : 'Preuzmi Backup Baze (CSV)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSheetsModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Izdaj novi radni nalog</span>
          </button>
        </div>
      </div>

      {/* SEKCIJA 1: AKTIVNI ZASTOJI U RADIONICI (Kritični prioritet) */}
      {activeStoppages.length > 0 && (
        <div className="p-3 bg-red-50 border-2 border-red-500 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              <ShieldAlert className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-950 uppercase tracking-wide">
                  PAŽNJA: {activeStoppages.length} aktivan zastoj u proizvodnji!
                </span>
                <span className="text-[10px] font-mono font-bold bg-red-200 text-red-900 px-1.5 py-0.2 rounded">
                  {activeStoppages[0].orderNumber}
                </span>
              </div>
              <p className="text-[11px] text-red-700">
                Prijavljen razlog: <strong className="font-semibold text-red-900">{activeStoppages[0].stoppage?.reason}</strong>
                {activeStoppages[0].stoppage?.description ? ` — "${activeStoppages[0].stoppage.description}"` : ''} 
                <span className="text-slate-500 ml-1">({activeStoppages[0].stoppage?.reportedByName})</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOrderForStoppage(activeStoppages[0])}
            className="self-end sm:self-auto px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Otkloni / Uredi zastoj →</span>
          </button>
        </div>
      )}

      {/* SEKCIJA 2: KRITIČNE ZALIHE / POTREBNA NABAVKA */}
      {lowStockMaterials.length > 0 && (
        <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-xl shadow-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <span>Upozorenje zaliha: {lowStockMaterials.length} materijala je na ili ispod minimalnog praga</span>
                </h3>
                <p className="text-[11px] text-amber-800">
                  Potrebna je nabavka materijala kako proizvodnja ne bi imala zastoje.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setIsLowStockCollapsed(!isLowStockCollapsed)}
                className="text-xs font-semibold text-amber-900 hover:text-amber-950 bg-amber-200/80 hover:bg-amber-200 px-2.5 py-1 rounded-md transition cursor-pointer"
              >
                {isLowStockCollapsed ? 'Prikaži materijale ↓' : 'Sakrij detalje ↑'}
              </button>
            </div>
          </div>

          {!isLowStockCollapsed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-amber-200/70">
              {lowStockMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="p-2.5 bg-white rounded-lg border border-amber-200 flex items-center justify-between shadow-2xs"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-xs text-slate-900 block truncate">
                      {mat.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 block">
                      Šifra: {mat.code} • Min: <strong className="text-slate-700">{mat.minStock} {mat.unit}</strong>
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold font-mono text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 block">
                      {mat.currentStock} {mat.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEKCIJA 3: NALOZI U PRIPREMI MODELA */}
      {preparationOrders.length > 0 && (
        <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs font-bold text-xs">
              📐
            </div>
            <div>
              <h4 className="text-xs font-bold text-indigo-950">
                {preparationOrders.length} radnih naloga čeka digitalnu pripremu modela
              </h4>
              <p className="text-[11px] text-indigo-700">
                Radnici u radionici još ne vide ove naloge dok ne kliknete "Pusti u rad".
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onNavigateToModels) {
                  onNavigateToModels();
                } else {
                  setStatusFilter('priprema');
                }
              }}
              className="px-3 py-1 text-xs font-bold text-indigo-950 bg-white hover:bg-indigo-100 rounded-lg border border-indigo-300 transition shadow-2xs cursor-pointer"
            >
              Otvori pripremu modela ({preparationOrders.length}) →
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pretraga po broju naloga, naručiocu (za koga se radi) ili nazivu posla..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filters: Status & Worker */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Brzi toggle: Svi / U pripremi / Pušteno u proizvodnju */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Svi ({workOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('u_pripremi')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                statusFilter === 'u_pripremi' || statusFilter === 'priprema'
                  ? 'bg-amber-500 text-white shadow-2xs font-bold'
                  : 'text-amber-800 hover:text-amber-950'
              }`}
            >
              <span>⏳ U pripremi</span>
              <span className="font-mono text-[10px]">({preparationOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pusteno')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                statusFilter === 'pusteno'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-emerald-800 hover:text-emerald-950'
              }`}
            >
              <span>✅ U proizvodnji</span>
              <span className="font-mono text-[10px]">({workOrders.length - preparationOrders.length})</span>
            </button>
          </div>

          {/* Filter by Status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">Svi radni nalozi ({workOrders.length})</option>
              <option value="u_pripremi">⏳ U pripremi kod admina ({preparationOrders.length})</option>
              <option value="pusteno">✅ Pušteno u proizvodnju ({workOrders.length - preparationOrders.length})</option>
              <option value="na_cekanju">Na čekanju</option>
              <option value="u_izradi">U izradi</option>
              <option value="zavrseno">Završeno</option>
              <option value="otkazano">Otkazano</option>
            </select>
          </div>

          {/* Filter by Worker (Ko je uradio ili ko je zadužen) */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Filtriraj naloge po tome ko ih je uradio ili ko je zadužen"
            >
              <option value="all">Svi radnici (zajedno)</option>
              {allWorkers.map((w) => {
                const userObj = users.find((u) => u.username === w);
                const displayName = userObj?.fullName ? `${userObj.fullName} (${w})` : w;
                return (
                  <option key={w} value={w}>
                    {displayName}
                  </option>
                );
              })}
            </select>
          </div>

          <span className="text-xs text-slate-600 px-2 py-1 font-mono tabular-nums">
            Prikazano: {filteredOrders.length} / {workOrders.length}
          </span>
        </div>

      </div>

      {/* Mobile Card List View (Visible on phones & narrow screens) */}
      <div className="md:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-sm text-slate-800">Nema pronađenih radnih naloga</p>
            <p className="text-xs text-slate-400 mt-1">
              Pokušajte promijeniti filtere ili dodati novi radni nalog.
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const timeStats = getOrderTotalTime(order.id);
            const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
            const hasActiveStoppage = Boolean(order.stoppage && !order.stoppage.resolved);

            return (
              <div 
                key={order.id}
                className={`rounded-xl p-4 space-y-3 transition-all ${
                  isHighPriority
                    ? 'border-2 border-red-500 bg-linear-to-r from-red-50/70 via-white to-white shadow-sm ring-1 ring-red-400/20'
                    : 'bg-white border border-slate-200 shadow-xs'
                }`}
              >
                {/* High Priority Mobile Alert Banner */}
                {isHighPriority && (
                  <div className="flex items-center justify-between px-2.5 py-1 bg-red-600 text-white rounded-md text-[11px] font-bold shadow-2xs">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
                      VISOKI PRIORITET RADNOG NALOGA
                    </span>
                    <span className="font-mono text-[10px] uppercase bg-red-800/80 px-1.5 py-0.2 rounded">
                      {order.priority}
                    </span>
                  </div>
                )}

                {/* Active Stoppage Banner on Card */}
                {hasActiveStoppage && order.stoppage && (
                  <div className="p-2.5 bg-red-950/10 border-2 border-red-500 rounded-lg text-xs space-y-1 animate-pulse">
                    <div className="flex items-center justify-between font-bold text-red-700">
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        AKTIVAN ZASTOJ: {order.stoppage.reason}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{order.stoppage.reportedAt}</span>
                    </div>
                    {order.stoppage.description && (
                      <p className="text-[11px] text-slate-700 bg-white/90 p-1.5 rounded leading-relaxed">
                        {order.stoppage.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <OrderNumberWithHover
                    order={order}
                    onClick={() => setOrderForFullDetails(order)}
                  />
                  <div className="flex items-center gap-1.5">
                    {getPriorityBadge(order.priority)}
                    <span className="text-[11px] font-mono text-slate-500">
                      {order.dueDate}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs mb-1">
                    <Building className="w-3 h-3 text-blue-600" />
                    {order.customer || 'Bez kupca'}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {order.title}
                  </h3>
                  {order.description && (
                    <div className="mt-1">
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">
                        {order.description}
                      </p>
                    </div>
                  )}
                  {order.workerNotes && Object.keys(order.workerNotes).length > 0 && (
                    <div className="mt-1.5 text-[11px] text-indigo-800 bg-indigo-50/70 p-2 rounded border border-indigo-200">
                      <strong>Zadaci radnika:</strong> {Object.entries(order.workerNotes).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                    </div>
                  )}

                  {/* Ko je kreirao radni nalog */}
                  <div className="text-[10px] text-slate-500 font-sans mt-1">
                    Kreirao: <strong className="text-slate-700">{order.createdBy?.fullName || 'Administrator'}</strong>
                    {order.createdBy?.timestamp ? ` • ${order.createdBy.timestamp.split(' ')[0]}` : ''}
                  </div>

                  {/* Sve akcije smještene direktno ispod naziva posla / proizvoda na pregledu telefona */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-1 w-full max-w-full">
                    {order.status === 'priprema' && (
                      <button
                        type="button"
                        onClick={() => releaseOrderToProduction(order.id)}
                        className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs transition cursor-pointer"
                        title="Pusti nalog u radionicu"
                      >
                        <Send className="w-2.5 h-2.5" />
                        <span>Pusti</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(order)}
                      title="Uredi radni nalog"
                      className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition cursor-pointer"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Uredi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderForConsumption(order)}
                      title="Upiši trošak"
                      className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition cursor-pointer"
                    >
                      <PackageCheck className="w-2.5 h-2.5 text-emerald-600" />
                      <span>Trošak</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderForFullDetails(order)}
                      title="Pregled svih detalja i utroška"
                      className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition cursor-pointer"
                    >
                      <Eye className="w-2.5 h-2.5 text-slate-500" />
                      <span>Detalji</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderForNotes(order)}
                      title="Pročitaj kompletne napomene"
                      className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded transition cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderForStoppage(order)}
                      title={hasActiveStoppage ? "Uredi ili zatvori aktivan zastoj" : "Evidentiraj zastoj"}
                      className={`p-1 rounded border transition cursor-pointer ${
                        hasActiveStoppage
                          ? 'text-amber-800 bg-amber-100 hover:bg-amber-200 border-amber-300 animate-pulse'
                          : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50 border-slate-200'
                      }`}
                    >
                      <Wrench className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderToDelete(order)}
                      title="Obriši radni nalog"
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Priprema / Proizvodnja status na mobilnoj kartici */}
                <div className="p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 bg-slate-50 border-slate-200">
                  <span className="font-semibold text-slate-600 text-[11px]">Faza:</span>
                  {order.status === 'priprema' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3 text-amber-600 animate-spin-slow" />
                      U pripremi kod admina
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Pušteno u radionicu
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Zaduženi:</span>
                    <span className="font-medium text-slate-700">
                      {(order?.assignedWorkers || []).join(', ') || 'Niko'}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[10px] text-slate-400 block">Utrošeno:</span>
                    <span className="font-bold text-slate-800">
                      {timeStats.h > 0 || timeStats.m > 0 ? `${timeStats.h}h ${timeStats.m}m` : '0h'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <span className="text-xs text-slate-500 font-medium">Status naloga:</span>
                  <select
                    value={order.status}
                    onChange={(e) =>
                      updateWorkOrder(order.id, {
                        status: e.target.value as OrderStatus,
                      })
                    }
                    className={`px-2 py-1 rounded-md text-xs font-bold border transition ${
                      order.status === 'zavrseno'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : order.status === 'u_izradi'
                        ? 'bg-blue-50 text-blue-800 border-blue-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    <option value="na_cekanju">Na čekanju</option>
                    <option value="u_izradi">U izradi</option>
                    <option value="zavrseno">Završeno</option>
                    <option value="otkazano">Otkazano</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Desktop Table (Hidden on mobile) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table top toolbar: 9-orders scroll view vs Full view toggle */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              Prikaz: <strong className="text-slate-900">{tableDisplayMode === 'scroll' ? '9 prvih naloga (skrolovanje)' : 'svi nalozi'}</strong> od ukupno <strong className="text-blue-700">{filteredOrders.length}</strong> (u bazi: {workOrders.length})
            </span>
            <span className="text-[10px] text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-full font-bold">
              Baza trajno sačuvana
            </span>
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setTableDisplayMode('scroll')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                tableDisplayMode === 'scroll'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
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
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Puni prikaz svih radnih naloga bez ograničenja visine"
            >
              📜 Puni prikaz
            </button>
          </div>
        </div>

        {/* Scrollable container with vertical scrollbar: 520px height shows roughly 9 rows without horizontal scrollbar on desktop */}
        <div className={`overflow-x-auto scroll-smooth custom-scrollbar ${
          tableDisplayMode === 'scroll' ? 'max-h-[520px] overflow-y-auto' : 'overflow-y-visible'
        }`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className={tableDisplayMode === 'scroll' ? 'sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs shadow-2xs' : 'bg-slate-50'}>
              <tr className="border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th 
                  className="py-2.5 px-2.5 cursor-pointer hover:bg-slate-200/60 select-none transition whitespace-nowrap"
                  onClick={() => setOrderSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  title="Kliknite za promjenu smjera (noviji na vrh ili najstariji na vrh)"
                >
                  <div className="flex items-center gap-1">
                    <span>Broj</span>
                    <span className="text-[10px] text-blue-600 font-mono font-bold">
                      {orderSortDirection === 'desc' ? '↓' : '↑'}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Naručilac</th>
                <th className="py-2.5 px-2.5">Naziv posla / Proizvod</th>
                <th className="py-2.5 px-2 bg-indigo-50/70 text-indigo-950 font-bold border-x border-indigo-200 whitespace-nowrap">
                  Faza
                </th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Radnici</th>
                <th className="py-2.5 px-2 whitespace-nowrap">Prioritet</th>
                <th className="py-2.5 px-2 whitespace-nowrap">Rok</th>
                <th className="py-2.5 px-2 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Utrošeno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-500">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-sm text-slate-800">
                      Nema pronađenih radnih naloga
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Pokušajte promijeniti filtere ili dodajte novi radni nalog.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const timeStats = getOrderTotalTime(order.id);
                  const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
                  const hasActiveStoppage = Boolean(order.stoppage && !order.stoppage.resolved);

                  return (
                    <tr
                      key={order.id}
                      className={`transition-colors ${
                        isHighPriority
                          ? 'bg-red-50/50 hover:bg-red-50/80 border-l-4 border-l-red-600 font-medium'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Order Number with HOVER DROPDOWN and CLICK FOR FULL DETAILS */}
                      <td className="py-2 px-2.5 whitespace-nowrap align-top">
                        <OrderNumberWithHover
                          order={order}
                          onClick={() => setOrderForFullDetails(order)}
                        />
                      </td>

                      {/* Customer / Za koga se radi */}
                      <td className="py-2 px-2.5 whitespace-nowrap max-w-[120px] align-top">
                        <span 
                          className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100/80 px-1.5 py-0.5 rounded border border-slate-200 text-xs truncate max-w-full"
                          title={order.customer || '-'}
                        >
                          <Building className="w-3 h-3 text-blue-600 shrink-0" />
                          <span className="truncate">{order.customer || '-'}</span>
                        </span>
                      </td>

                      {/* Title & Description with actions directly underneath (bez vodoravne scroll trake) */}
                      <td className="py-2 px-2.5 align-top">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{order.title}</span>
                          {isHighPriority && (
                            <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.2 rounded font-bold shadow-2xs shrink-0">
                              HITNO
                            </span>
                          )}
                        </div>

                        {/* Stoppage Alert Banner if active */}
                        {hasActiveStoppage && order.stoppage && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Zastoj: {order.stoppage.reason}</span>
                          </div>
                        )}

                        {order.description && (
                          <p className="mt-0.5 text-[11px] text-slate-600 line-clamp-1">
                            {order.description}
                          </p>
                        )}

                        {/* Ko je kreirao radni nalog */}
                        <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                          Kreirao: <strong className="text-slate-700">{order.createdBy?.fullName || 'Administrator'}</strong>
                        </div>

                        {/* Akcije u tabeli direktno ispod Naziva proizvoda */}
                        <div className="mt-1.5 pt-1 border-t border-slate-100 flex flex-wrap items-center gap-1">
                          {order.status === 'priprema' && (
                            <button
                              type="button"
                              onClick={() => releaseOrderToProduction(order.id)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded shadow-xs transition cursor-pointer"
                              title="Pusti nalog u radionicu"
                            >
                              <Send className="w-2.5 h-2.5" />
                              <span>Pusti</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(order)}
                            title="Uredi radni nalog"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Uredi</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOrderForConsumption(order)}
                            title="Upiši trošak / Evidencija utroška materijala i radnog vremena"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition cursor-pointer"
                          >
                            <PackageCheck className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Trošak</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOrderForFullDetails(order)}
                            title="Pregled svih detalja i utroška"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition cursor-pointer"
                          >
                            <Eye className="w-2.5 h-2.5 text-slate-500" />
                            <span>Detalji</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOrderForNotes(order)}
                            title="Pročitaj kompletne napomene i opis radnog naloga"
                            className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded transition cursor-pointer"
                          >
                            <FileText className="w-2.5 h-2.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setOrderForStoppage(order)}
                            title={hasActiveStoppage ? "Uredi ili zatvori aktivan zastoj" : "Evidentiraj zastoj u radu"}
                            className={`p-1 rounded border transition cursor-pointer ${
                              hasActiveStoppage
                                ? 'text-amber-800 bg-amber-100 hover:bg-amber-200 border-amber-300 animate-pulse'
                                : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50 border-slate-200'
                            }`}
                          >
                            <Wrench className="w-2.5 h-2.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setOrderToDelete(order)}
                            title="Obriši radni nalog"
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </td>

                      {/* SEKCIJA / KOLONA: Faza Priprema / Proizvodnja */}
                      <td className="py-2 px-2 whitespace-nowrap bg-indigo-50/20 border-x border-indigo-100/70 align-top">
                        {order.status === 'priprema' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <Clock className="w-3 h-3 text-amber-600 animate-spin-slow" />
                              <span>U pripremi</span>
                            </span>
                            <span className="block text-[9px] text-slate-400 italic">
                              kod admina
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>U radionici</span>
                            </span>
                            <span className="block text-[9px] text-slate-400">
                              {order.modelPreparation?.readyAt ? order.modelPreparation.readyAt.split(' ')[0] : 'aktivno'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Assigned Workers */}
                      <td className="py-2 px-2.5 max-w-[130px] align-top">
                        <div className="flex flex-wrap gap-1">
                          {(order?.assignedWorkers || []).map((workerUsername) => (
                            <span
                              key={workerUsername}
                              className="inline-flex items-center gap-1 text-[10px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {workerUsername}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-2 px-2 whitespace-nowrap align-top">
                        {getPriorityBadge(order.priority)}
                      </td>

                      {/* Due Date */}
                      <td className="py-2 px-2 font-mono text-slate-700 text-[11px] whitespace-nowrap align-top">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {order.dueDate}
                        </span>
                      </td>

                      {/* Status - Padajući meni za status naloga */}
                      <td className="py-2 px-2 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-0.5">
                          <select
                            value={order.status}
                            onChange={(e) => updateWorkOrder(order.id, { status: e.target.value as OrderStatus })}
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs transition ${
                              order.status === 'zavrseno'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : order.status === 'u_izradi'
                                ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            }`}
                            title="Padajući meni za status radnog naloga (Završeno / Na čekanju / U izradi)"
                          >
                            <option value="na_cekanju">Na čekanju</option>
                            <option value="u_izradi">U izradi</option>
                            <option value="zavrseno">Završeno</option>
                            <option value="otkazano">Otkazano</option>
                          </select>
                          {order.status === 'zavrseno' && order.closedBy && (
                            <div className="text-[9px] text-slate-500 font-sans truncate max-w-[100px]" title={`Zatvorio: ${order.closedBy.fullName}`}>
                              Zatvorio: {order.closedBy.fullName}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Total Logged Time */}
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums text-[11px] whitespace-nowrap align-top">
                        {timeStats.h > 0 || timeStats.m > 0 ? (
                          <span className="text-slate-900 font-semibold">
                            {timeStats.h}h {timeStats.m}m
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Details & Admin Edit Modal */}
      <WorkOrderDetailModal
        order={orderForFullDetails}
        onClose={() => setOrderForFullDetails(null)}
      />

      {/* Complete Notes Viewer Modal */}
      <NoteViewerModal
        order={orderForNotes}
        isOpen={Boolean(orderForNotes)}
        onClose={() => setOrderForNotes(null)}
      />

      {/* Stoppage / Downtime Modal */}
      <StoppageModal
        order={orderForStoppage}
        isOpen={Boolean(orderForStoppage)}
        onClose={() => setOrderForStoppage(null)}
      />

      {/* Log Consumption Modal for Admin (Upisi trošak) */}
      <LogConsumptionModal
        isOpen={Boolean(orderForConsumption)}
        preselectedOrderId={orderForConsumption?.id}
        allowAllOrders={true}
        onClose={() => setOrderForConsumption(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!orderToDelete}
        title="Brisanje radnog naloga"
        message={`Da li ste sigurni da želite obrisati radni nalog ${orderToDelete?.orderNumber} ("${orderToDelete?.title}")?`}
        confirmLabel="Obriši nalog"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setOrderToDelete(null)}
      />

      {/* Google Sheets Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
      />

    </div>
  );
};
