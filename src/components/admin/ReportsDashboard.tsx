import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, SastavnicaStatus } from '../../types';
import { 
  BarChart3, 
  Search, 
  Download, 
  Printer, 
  Layers, 
  Calendar, 
  Hammer, 
  CheckCircle2, 
  FileCheck, 
  CheckSquare, 
  XSquare, 
  Edit2, 
  X, 
  Building,
  FileText,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { OrderNumberWithHover } from '../common/OrderNumberWithHover';
import { WorkOrderDetailModal } from '../common/WorkOrderDetailModal';
import { GoogleSheetsSyncModal } from '../common/GoogleSheetsSyncModal';

export const ReportsDashboard: React.FC = () => {
  const { consumptionLogs, workOrders, updateSastavnica, currentUser } = useApp();

  const [activeReportView, setActiveReportView] = useState<'consumption' | 'sastavnice'>('consumption');
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  // Filters for consumption logs
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderFilter, setSelectedOrderFilter] = useState('all');
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState('all');

  // Modal for full details & admin edit
  const [orderForFullDetails, setOrderForFullDetails] = useState<WorkOrder | null>(null);

  // Sastavnica management modal state
  const [orderForSastavnica, setOrderForSastavnica] = useState<WorkOrder | null>(null);
  const [sastavnicaStatus, setSastavnicaStatus] = useState<SastavnicaStatus>('napravljena');
  const [brojSastavnice, setBrojSastavnice] = useState('');
  const [napomenaSastavnice, setNapomenaSastavnice] = useState('');
  const [sastavnicaFilter, setSastavnicaFilter] = useState<string>('all');

  // Filter consumption logs
  const filteredLogs = (consumptionLogs || []).filter((log) => {
    const wTitle = log?.workOrderTitle || '';
    const wNum = log?.workOrderNumber || '';
    const cust = log?.customer || '';
    const matName = log?.materialName || '';
    const worker = log?.workerName || '';
    const note = log?.note || '';

    const matchesSearch =
      wTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.toLowerCase().includes(searchTerm.toLowerCase()) ||
      matName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesOrder =
      selectedOrderFilter === 'all' || log?.workOrderId === selectedOrderFilter;

    const matchesWorker =
      selectedWorkerFilter === 'all' || log?.workerUsername === selectedWorkerFilter;

    return matchesSearch && matchesOrder && matchesWorker;
  });

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      'Datum i vrijeme',
      'Broj radnog naloga',
      'Naručilac (Za koga se radi)',
      'Naziv posla',
      'Radnik',
      'Korisničko ime',
      'Materijal',
      'Količina',
      'Jedinica mjere',
      'Radni sati',
      'Radni minuti',
      'Napomena',
    ];

    const rows = filteredLogs.map((log) => [
      `"${log?.timestamp || ''}"`,
      `"${log?.workOrderNumber || ''}"`,
      `"${(log?.customer || '').replace(/"/g, '""')}"`,
      `"${(log?.workOrderTitle || '').replace(/"/g, '""')}"`,
      `"${log?.workerName || ''}"`,
      `"${log?.workerUsername || ''}"`,
      `"${(log?.materialName || '').replace(/"/g, '""')}"`,
      log?.quantity ?? 0,
      `"${log?.unit || ''}"`,
      log?.hoursSpent ?? 0,
      log?.minutesSpent ?? 0,
      `"${(log?.note || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `izvjestaj_utroska_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenSastavnicaModal = (order: WorkOrder) => {
    setOrderForSastavnica(order);
    setSastavnicaStatus(order.sastavnica?.status || 'napravljena');
    setBrojSastavnice(order.sastavnica?.brojSastavnice || `SAST-${order.orderNumber}`);
    setNapomenaSastavnice(order.sastavnica?.napomena || '');
  };

  const handleSaveSastavnica = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForSastavnica) return;

    updateSastavnica(orderForSastavnica.id, {
      status: sastavnicaStatus,
      brojSastavnice: brojSastavnice.trim() || undefined,
      napomena: napomenaSastavnice.trim() || undefined,
    });

    setOrderForSastavnica(null);
  };

  const handleOrderClickByNumber = (orderNumber: string) => {
    const found = workOrders.find((w) => w.orderNumber === orderNumber);
    if (found) {
      setOrderForFullDetails(found);
    }
  };

  const filteredWorkOrdersForSastavnica = workOrders.filter((wo) => {
    const currentSastStatus = wo.sastavnica?.status || 'nije_napravljena';
    if (sastavnicaFilter === 'napravljena') return currentSastStatus === 'napravljena';
    if (sastavnicaFilter === 'nije_napravljena') return currentSastStatus === 'nije_napravljena';
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Izvještaji Proizvodnje &amp; Evidencija Sastavnica
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Klikom na broj naloga dobijate kompletan uvid u sve detalje, utroške i mogućnost administrativne izmjene količina.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSheetsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Izvezi u Google Sheets</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Izvezi CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg shadow-2xs transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Štampaj</span>
          </button>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveReportView('consumption')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition ${
            activeReportView === 'consumption'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Utrošak materijala i radno vrijeme</span>
        </button>

        <button
          onClick={() => setActiveReportView('sastavnice')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition ${
            activeReportView === 'sastavnice'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Izvještaj urađenog &amp; Sastavnice</span>
          <span className="ml-1 text-[10px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full">
            {workOrders.filter((wo) => wo.sastavnica?.status === 'napravljena').length} / {workOrders.length}
          </span>
        </button>
      </div>

      {/* VIEW 1: Utrošak materijala i radno vrijeme */}
      {activeReportView === 'consumption' && (
        <div className="space-y-6">
          
          {/* Quick Counter Cards (Without 'ukupno vrijeme' & 'utrosena građa' as requested) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">Ukupno zabilježenih razduženja</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                  {filteredLogs.length} unosa
                </div>
              </div>
              <FileText className="w-6 h-6 text-blue-500" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">Radnih naloga u evidenciji</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                  {Array.from(new Set(filteredLogs.map((l) => l.workOrderId))).length}
                </div>
              </div>
              <Hammer className="w-6 h-6 text-purple-500" />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pretraga po naručiocu, poslu, materijalu ili radniku..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedOrderFilter}
                onChange={(e) => setSelectedOrderFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] truncate"
              >
                <option value="all">Svi radni nalozi</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.orderNumber} - {wo.title}
                  </option>
                ))}
              </select>

              <select
                value={selectedWorkerFilter}
                onChange={(e) => setSelectedWorkerFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Svi radnici</option>
                {Array.from(new Set(consumptionLogs.map((l) => l.workerUsername))).map((wUname) => (
                  <option key={wUname} value={wUname}>
                    {wUname}
                  </option>
                ))}
              </select>

              <span className="text-xs text-slate-600 px-2 py-1 font-mono tabular-nums">
                Prikazano: {filteredLogs.length}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-visible">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Datum &amp; Vrijeme</th>
                    <th className="py-3 px-4">Broj naloga</th>
                    <th className="py-3 px-4">Za koga se radi &amp; Posao</th>
                    <th className="py-3 px-4">Radnik</th>
                    <th className="py-3 px-4">Utrošeni materijal</th>
                    <th className="py-3 px-4 text-right">Utrošena količina</th>
                    <th className="py-3 px-4 text-right">Radno vrijeme</th>
                    <th className="py-3 px-4">Opis rada</th>
                    {currentUser?.role === 'admin' && (
                      <th className="py-3 px-4 text-center">Pregled</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={currentUser?.role === 'admin' ? 9 : 8} className="py-12 text-center text-slate-500">
                        <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-medium text-sm text-slate-700">Nema unosa utroška</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const matchedOrder = workOrders.find((w) => w.id === log.workOrderId);

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {log.timestamp}
                            </span>
                          </td>

                          {/* CLICKABLE ORDER NUMBER WITH HOVER PREVIEW */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {matchedOrder ? (
                              <OrderNumberWithHover
                                order={matchedOrder}
                                onClick={() => setOrderForFullDetails(matchedOrder)}
                              />
                            ) : (
                              <button
                                onClick={() => handleOrderClickByNumber(log.workOrderNumber)}
                                className="font-mono font-bold text-blue-700 hover:underline"
                              >
                                {log.workOrderNumber}
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900 line-clamp-1">
                              {log.workOrderTitle}
                            </div>
                            {log.customer && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building className="w-3 h-3 text-slate-400" />
                                {log.customer}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              {log.workerName}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-medium text-slate-800">
                            {log.materialName}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap text-emerald-700">
                            {log.quantity} <span className="text-xs font-normal text-slate-500">{log.unit}</span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                            {log.hoursSpent > 0 || log.minutesSpent > 0 ? `${log.hoursSpent}h ${log.minutesSpent}m` : '-'}
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                            {log.note ? (
                              <div className="w-full max-w-[260px] max-h-24 overflow-y-auto break-words whitespace-pre-wrap p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-800 custom-scrollbar">
                                {log.note}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>

                          {/* Oko za brzi pregled samo za admina */}
                          {currentUser?.role === 'admin' && (
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {matchedOrder ? (
                                <button
                                  type="button"
                                  onClick={() => setOrderForFullDetails(matchedOrder)}
                                  title="Brzi pregled naloga i izmjena utroška (Oko)"
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center justify-center cursor-pointer"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOrderClickByNumber(log.workOrderNumber)}
                                  title="Brzi pregled naloga (Oko)"
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center justify-center cursor-pointer"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          )}
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

      {/* VIEW 2: Izvještaj urađenog & Sastavnice */}
      {activeReportView === 'sastavnice' && (
        <div className="space-y-6">
          
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-3 text-xs text-indigo-950">
            <FileCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-bold text-indigo-900">Evidencija sastavnica za urađene dijelove:</strong> Kliknite na broj bilo kog radnog naloga za kompletan uvid u sve podatke, utrošak i izmjenu količina.
            </div>
          </div>

          {/* Sastavnica Filter */}
          <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">Filter:</span>
              <select
                value={sastavnicaFilter}
                onChange={(e) => setSastavnicaFilter(e.target.value)}
                className="py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Svi radni nalozi</option>
                <option value="napravljena">Sa napravljenom sastavnicom</option>
                <option value="nije_napravljena">Čeka izradu sastavnice</option>
              </select>
            </div>

            <div className="text-xs font-mono text-slate-500">
              Prikazano: {filteredWorkOrdersForSastavnica.length} radnih naloga
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-visible">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Broj naloga</th>
                    <th className="py-3 px-4">Za koga se radi</th>
                    <th className="py-3 px-4">Naziv posla</th>
                    <th className="py-3 px-4">Ko je radio</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Status sastavnice</th>
                    <th className="py-3 px-4">Broj / Napomena sastavnice</th>
                    <th className="py-3 px-4 text-center">Evidencija</th>
                    {currentUser?.role === 'admin' && (
                      <th className="py-3 px-4 text-center">Pregled</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkOrdersForSastavnica.length === 0 ? (
                    <tr>
                      <td colSpan={currentUser?.role === 'admin' ? 9 : 8} className="py-10 text-center text-slate-400 text-xs">
                        Nema radnih naloga za prikaz.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkOrdersForSastavnica.map((order) => {
                      const sastInfo = order.sastavnica;
                      const isMade = sastInfo?.status === 'napravljena';

                      return (
                        <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* CLICKABLE ORDER NUMBER WITH HOVER PREVIEW */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <OrderNumberWithHover
                              order={order}
                              onClick={() => setOrderForFullDetails(order)}
                            />
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                              <Building className="w-3 h-3 text-slate-500" />
                              {order.customer || '-'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 max-w-sm">
                            <div className="font-semibold text-slate-900">{order.title}</div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {order.assignedWorkers.map((u) => (
                                <span key={u} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                                  {u}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {order.status === 'zavrseno' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Završeno
                                </span>
                                {order.closedBy && (
                                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                                    Zatvorio: <strong className="text-slate-700">{order.closedBy.fullName}</strong>
                                  </div>
                                )}
                              </div>
                            ) : order.status === 'u_izradi' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                U izradi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Na čekanju
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isMade ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-300 shadow-2xs">
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                                Sastavnica napravljena
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                                <XSquare className="w-3.5 h-3.5 text-amber-600" />
                                Čeka sastavnicu
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs">
                            {isMade ? (
                              <div>
                                {sastInfo?.brojSastavnice && (
                                  <span className="font-mono font-bold text-slate-900 block text-[11px]">
                                    {sastInfo.brojSastavnice}
                                  </span>
                                )}
                                {sastInfo?.evidentiranoDatum && (
                                  <span className="text-[10px] text-slate-500 font-mono block">
                                    Datum: {sastInfo.evidentiranoDatum}
                                  </span>
                                )}
                                {sastInfo?.napomena && (
                                  <span className="text-[11px] text-slate-600 line-clamp-1">
                                    {sastInfo.napomena}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Nije unesena sastavnica</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleOpenSastavnicaModal(order)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Evidentiraj</span>
                            </button>
                          </td>

                          {/* Oko za brzi pregled samo za admina */}
                          {currentUser?.role === 'admin' && (
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setOrderForFullDetails(order)}
                                title="Brzi pregled naloga i izmjena utroška (Oko)"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center justify-center cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          )}
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

      {/* Sastavnica Modal */}
      {orderForSastavnica && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Evidentiraj sastavnicu
                </h3>
              </div>
              <button
                onClick={() => setOrderForSastavnica(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSastavnica} className="p-6 space-y-4">
              <div>
                <span className="text-[11px] text-slate-500 font-mono block">
                  Radni nalog: {orderForSastavnica.orderNumber}
                </span>
                {orderForSastavnica.customer && (
                  <span className="text-xs text-blue-700 font-medium block">
                    Za koga se radi: {orderForSastavnica.customer}
                  </span>
                )}
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {orderForSastavnica.title}
                </span>
              </div>

              {/* Status Radio */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-800">
                  Da li je sastavnica napravljena? *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      sastavnicaStatus === 'napravljena'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sastavnica_status"
                      value="napravljena"
                      checked={sastavnicaStatus === 'napravljena'}
                      onChange={() => setSastavnicaStatus('napravljena')}
                      className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs">DA, napravljena</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      sastavnicaStatus === 'nije_napravljena'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sastavnica_status"
                      value="nije_napravljena"
                      checked={sastavnicaStatus === 'nije_napravljena'}
                      onChange={() => setSastavnicaStatus('nije_napravljena')}
                      className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-xs">NE (na čekanju)</span>
                  </label>
                </div>
              </div>

              {/* Broj sastavnice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Broj / Oznaka sastavnice
                </label>
                <input
                  type="text"
                  value={brojSastavnice}
                  onChange={(e) => setBrojSastavnice(e.target.value)}
                  placeholder="Unesite broj ili oznaku sastavnice..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Napomena sastavnice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Napomena o sastavnici
                </label>
                <textarea
                  rows={2}
                  value={napomenaSastavnice}
                  onChange={(e) => setNapomenaSastavnice(e.target.value)}
                  placeholder=""
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOrderForSastavnica(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
                >
                  Sačuvaj evidenciju sastavnice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Details & Admin Edit Modal (triggered on clicking any order number) */}
      <WorkOrderDetailModal
        order={orderForFullDetails}
        onClose={() => setOrderForFullDetails(null)}
      />

      {/* Google Sheets Export Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
      />

    </div>
  );
};
