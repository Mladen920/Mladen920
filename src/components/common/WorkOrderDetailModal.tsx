import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, ConsumptionLog } from '../../types';
import { 
  X, 
  Building, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  Layers, 
  FileCheck, 
  Edit3, 
  Save, 
  ShieldCheck,
  Package,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Wrench,
  PackageCheck,
  Plus,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { StoppageModal } from './StoppageModal';
import { LogConsumptionModal } from '../worker/LogConsumptionModal';
import { ConfirmDialog } from './ConfirmDialog';

interface WorkOrderDetailModalProps {
  order: WorkOrder | null;
  onClose: () => void;
}

export const WorkOrderDetailModal: React.FC<WorkOrderDetailModalProps> = ({ order, onClose }) => {
  const { 
    currentUser, 
    consumptionLogs, 
    adminUpdateConsumptionQuantity, 
    releaseOrderToProduction, 
    openCreateWorkOrderModal,
    deleteWorkOrder,
    updateWorkOrder
  } = useApp();

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isStoppageModalOpen, setIsStoppageModalOpen] = useState(false);
  const [isLogConsumptionOpen, setIsLogConsumptionOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  if (!order) return null;

  const isAdmin = currentUser?.role === 'admin';
  const canPrepareModels = isAdmin || Boolean(currentUser?.permissions?.canPrepareModels);
  const isHighPriority = order.priority === 'visoko' || order.priority === 'hitno';
  const hasActiveStoppage = Boolean(order.stoppage && !order.stoppage.resolved);

  // Get all consumption logs for this order
  const orderLogs = (consumptionLogs || []).filter((l) => l?.workOrderId === order.id);

  // Total time
  let totalMinutes = 0;
  orderLogs.forEach((l) => {
    totalMinutes += (l.hoursSpent || 0) * 60 + (l.minutesSpent || 0);
  });
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;

  const handleStartEdit = (log: ConsumptionLog) => {
    setEditingLogId(log.id);
    setEditQtyValue(log.quantity.toString());
    setEditError(null);
  };

  const handleSaveEdit = (logId: string) => {
    const parsed = parseFloat(editQtyValue);
    if (isNaN(parsed) || parsed < 0) {
      setEditError('Unesite ispravnu količinu.');
      return;
    }

    const res = adminUpdateConsumptionQuantity(logId, parsed);
    if (!res.success) {
      setEditError(res.error || 'Greška pri izmjeni količine.');
      return;
    }

    setEditingLogId(null);
    setEditError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4" onClick={onClose}>
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {order.orderNumber}
              </span>
              {isHighPriority && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded shadow-2xs animate-pulse">
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                  HITNO / VISOKO
                </span>
              )}
              {hasActiveStoppage && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-200 px-2 py-0.5 rounded border border-amber-400 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  ZASTOJ U RADU
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
              {order.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
          
          {/* Active Stoppage Box */}
          {hasActiveStoppage && order.stoppage && (
            <div className="p-3.5 bg-red-50 border-2 border-red-500 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 bg-red-100 px-2.5 py-0.5 rounded border border-red-300">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  AKTIVAN ZASTOJ U RADU
                </span>
                <span className="text-[11px] font-mono text-red-700">{order.stoppage.reportedAt}</span>
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900 text-sm">
                  Razlog zastoja: {order.stoppage.reason}
                </div>
                {order.stoppage.description && (
                  <p className="mt-1 text-slate-700 bg-white/90 p-2.5 rounded-lg border border-red-200 leading-relaxed whitespace-pre-wrap select-text">
                    {order.stoppage.description}
                  </p>
                )}
                <div className="mt-1.5 text-[11px] text-slate-500 font-mono">
                  Zabilježio radnik/admin: <strong className="text-slate-800">{order.stoppage.reportedByName}</strong> ({order.stoppage.reportedBy})
                </div>
              </div>
              <div className="pt-2 border-t border-red-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStoppageModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs transition flex items-center gap-1"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Uredi ili zatvori zastoj</span>
                </button>
              </div>
            </div>
          )}

          {/* If no active stoppage, offer button to record one */}
          {!hasActiveStoppage && order.status !== 'zavrseno' && (
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                <Wrench className="w-4 h-4 text-slate-400" />
                Imate li kvar mašine, nestanak struje ili čekanje materijala?
              </span>
              <button
                type="button"
                onClick={() => setIsStoppageModalOpen(true)}
                className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition shadow-2xs whitespace-nowrap shrink-0"
              >
                ⚠️ Prijavi zastoj
              </button>
            </div>
          )}

          {/* Model Preparation Card & Action */}
          {order.modelPreparation && (
            <div className="p-4 bg-linear-to-r from-indigo-50/90 via-purple-50/70 to-blue-50/70 border-2 border-indigo-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-indigo-200">
                <span className="font-bold text-indigo-950 uppercase tracking-wide text-xs flex items-center gap-1.5">
                  📐 Priprema Modela
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  order.status === 'priprema'
                    ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {order.status === 'priprema' ? 'U toku priprema' : 'Završena priprema modela'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-800">
                {order.modelPreparation.modelName && (
                  <div>
                    <span className="text-slate-500 text-[11px] block">Model:</span>
                    <strong className="text-indigo-950 text-sm">{order.modelPreparation.modelName}</strong>
                  </div>
                )}
                {(order.modelPreparation.targetWorkerName || order.modelPreparation.targetWorker) && (
                  <div>
                    <span className="text-slate-500 text-[11px] block">Za kog radnika se priprema:</span>
                    <strong className="text-indigo-950">{order.modelPreparation.targetWorkerName || order.modelPreparation.targetWorker}</strong>
                  </div>
                )}
                {order.modelPreparation.dimensions && (
                  <div className="sm:col-span-2 bg-white/80 p-2 rounded border border-indigo-100">
                    <span className="text-slate-500 text-[11px] block font-semibold">Dimenzije / Rezni list / Specifikacija:</span>
                    <span className="font-mono font-medium text-slate-900">{order.modelPreparation.dimensions}</span>
                  </div>
                )}
                {order.modelPreparation.notes && (
                  <div className="sm:col-span-2 bg-white/80 p-2 rounded border border-indigo-100">
                    <span className="text-slate-500 text-[11px] block font-semibold">Digitalna priprema / CNC nacrti / Uputstva:</span>
                    <p className="whitespace-pre-wrap text-slate-800">{order.modelPreparation.notes}</p>
                  </div>
                )}
              </div>

              {canPrepareModels && order.status === 'priprema' && (
                <div className="mt-2 pt-2 border-t border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-indigo-800 font-medium">
                    Radnici ne vide ovaj nalog dok ga ne pustite u rad:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConfirmDeleteOpen(true)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Obriši pripremu modela ako ste se predomislili"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Obriši pripremu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        releaseOrderToProduction(order.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>🚀 Pusti u rad / Prosledi radnicima</span>
                    </button>
                  </div>
                </div>
              )}

              {canPrepareModels && order.status !== 'priprema' && order.status !== 'zavrseno' && (
                <div className="mt-2 pt-2 border-t border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    Model je pušten u radionicu. Ako ste se predomislili:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      updateWorkOrder(order.id, {
                        status: 'priprema',
                        modelPreparation: { ...(order.modelPreparation || {}), isReady: false }
                      });
                      onClose();
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title="Povući nalog nazad u pripremu kod administratora"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Vrati nazad u pripremu</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Order Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Za koga se radi (Naručilac):</span>
              <span className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                {order.customer || 'Nije specificirano'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Status, Prioritet i Rok:</span>
              <span className="font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <span className="capitalize">
                  {order.status === 'zavrseno' ? 'Završeno' : order.status === 'na_cekanju' ? 'Na čekanju' : order.status === 'u_izradi' ? 'U izradi' : order.status}
                </span>
                <span className="text-slate-400 font-normal">|</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${isHighPriority ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-slate-200 text-slate-700'}`}>
                  {order.priority}
                </span>
                <span className="text-slate-400 font-normal">|</span>
                <span className="font-mono">{order.dueDate}</span>
              </span>
              {order.status === 'zavrseno' && order.closedBy && (
                <div className="mt-1 text-[11px] text-emerald-700 font-medium">
                  Zatvorio: <strong className="text-emerald-900">{order.closedBy.fullName}</strong> ({order.closedBy.username}) u {order.closedBy.timestamp}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 pt-1.5 pb-1 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium text-[11px]">Kreirao radni nalog:</span>
                <strong className="text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                  {order.createdBy?.fullName || 'Administrator'}
                  {order.createdBy?.username ? ` (${order.createdBy.username})` : ''}
                </strong>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                Kreirano: <strong className="text-slate-700">{order.createdBy?.timestamp || order.createdAt}</strong>
              </div>
            </div>

            <div className="sm:col-span-2">
              <span className="text-slate-400 block text-[11px]">Dodijeljeni radnici:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(order.assignedWorkers || []).map((u) => (
                  <span key={u} className="px-2 py-0.5 bg-white border border-slate-300 rounded font-medium text-slate-800">
                    {u} {order.workerNotes?.[u] ? `(${order.workerNotes[u]})` : ''}
                  </span>
                ))}
              </div>
            </div>

            {/* Complete Opis posla bez skraćivanja */}
            {order.description && (
              <div className="sm:col-span-2 pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 block text-[11px] font-semibold">Opis posla i tehničko uputstvo:</span>
                <div className="text-slate-800 mt-1 leading-relaxed bg-white p-3 rounded-lg border border-slate-200 whitespace-pre-wrap select-text">
                  {order.description}
                </div>
              </div>
            )}

            {/* Pojedinačne napomene za radnike */}
            {order.workerNotes && Object.keys(order.workerNotes).length > 0 && (
              <div className="sm:col-span-2 pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 block text-[11px] font-semibold">Zadaci i pojedinačne napomene za radnike:</span>
                <div className="space-y-1.5 mt-1">
                  {Object.entries(order.workerNotes).map(([worker, note]) => (
                    <div key={worker} className="p-2 bg-indigo-50/60 rounded border border-indigo-200 text-xs">
                      <strong className="text-indigo-900">{worker}:</strong> <span className="text-slate-800 whitespace-pre-wrap">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Predviđeni materijali za rad (do 4 materijala) */}
          {order.plannedMaterials && order.plannedMaterials.length > 0 && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between text-blue-900 font-bold">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  Predviđeni materijali za izradu (naveo admin):
                </span>
                <span className="text-[11px] font-mono text-blue-700">
                  {order.plannedMaterials.length}/4 materijala
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {order.plannedMaterials.map((mat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-blue-200">
                    <span className="font-semibold text-slate-800">• {mat.materialName}</span>
                    {mat.quantity !== undefined && mat.quantity > 0 ? (
                      <span className="font-mono font-bold text-emerald-700">{mat.quantity} {mat.unit}</span>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">po utrošku ({mat.unit})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sastavnica info */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-indigo-600" />
              <div>
                <span className="font-bold text-indigo-950 block">Status sastavnice za ovaj nalog:</span>
                <span className="text-indigo-800 text-[11px]">
                  {order.sastavnica?.status === 'napravljena'
                    ? `Sastavnica je napravljena (Broj: ${order.sastavnica.brojSastavnice || 'Da'})`
                    : 'Sastavnica nije napravljena (Čeka izradu)'}
                </span>
              </div>
            </div>
          </div>

          {/* Logged Consumption & Work Time Table */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-emerald-600" />
                Evidentirani utrošak materijala i radno vrijeme ({orderLogs.length} unosa)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLogConsumptionOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-md shadow-2xs transition cursor-pointer"
                  title="Upiši novi utrošak materijala i radnog vremena za ovaj nalog"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Upiši trošak</span>
                </button>
                <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  Ukupno: {totalH}h {totalM}m
                </span>
              </div>
            </div>

            {editError && (
              <div className="mb-2 p-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
                {editError}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Radnik</th>
                    <th className="py-2.5 px-3">Utrošeni materijal</th>
                    <th className="py-2.5 px-3 text-right">Količina</th>
                    <th className="py-2.5 px-3 text-right">Vrijeme</th>
                    <th className="py-2.5 px-3">Napomena</th>
                    {isAdmin && <th className="py-2.5 px-3 text-center">Admin izmjena</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderLogs.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className="py-6 text-center text-slate-400 text-xs">
                        Nema zabilježenog utroška za ovaj radni nalog.
                      </td>
                    </tr>
                  ) : (
                    orderLogs.map((log) => {
                      const isEditing = editingLogId === log.id;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                            {log.workerName}
                          </td>

                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {log.materialName}
                          </td>

                          {/* Quantity with Admin Edit */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={editQtyValue}
                                  onChange={(e) => setEditQtyValue(e.target.value)}
                                  className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold border border-blue-400 rounded text-right"
                                />
                                <span className="text-[10px] text-slate-500">{log.unit}</span>
                              </div>
                            ) : (
                              <span className="text-emerald-700">
                                {log.quantity} {log.unit}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {log.hoursSpent > 0 || log.minutesSpent > 0 ? (
                              `${log.hoursSpent}h ${log.minutesSpent}m`
                            ) : (
                              '-'
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-slate-700 text-xs">
                            {log.note ? (
                              <div className="w-full max-w-[280px] max-h-24 overflow-y-auto break-words whitespace-pre-wrap p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed custom-scrollbar">
                                {log.note}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>

                          {/* Admin action button to edit quantity */}
                          {isAdmin && (
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {isEditing ? (
                                <button
                                  onClick={() => handleSaveEdit(log.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition"
                                >
                                  <Save className="w-3 h-3" />
                                  Sačuvaj
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartEdit(log)}
                                  title="Admin izmjena količine"
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
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

            {isAdmin && (
              <p className="text-[10px] text-slate-400 mt-1.5 italic">
                * Samo administrator ima ovlašćenje da mijenja evidentirane utrošene količine materijala.
              </p>
            )}
          </div>

        </div>

        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {(isAdmin || currentUser?.permissions?.canEditOrders) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openCreateWorkOrderModal(order);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition cursor-pointer"
                title="Otvori formu za izmjenu radnog naloga"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Uredi nalog</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsLogConsumptionOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg border border-emerald-300 transition cursor-pointer"
              title="Upiši novi utrošak materijala i radno vrijeme"
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Upiši trošak</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-2xs cursor-pointer"
          >
            Zatvori pregled
          </button>
        </div>

      </div>

      {/* Log Consumption Modal for Admin & Workers */}
      <LogConsumptionModal
        isOpen={isLogConsumptionOpen}
        preselectedOrderId={order.id}
        allowAllOrders={true}
        onClose={() => setIsLogConsumptionOpen(false)}
      />

      {/* Stoppage Modal */}
      <StoppageModal
        order={order}
        isOpen={isStoppageModalOpen}
        onClose={() => setIsStoppageModalOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Brisanje pripreme modela"
        message={`Da li ste sigurni da želite obrisati pripremu modela za radni nalog ${order.orderNumber} ("${order.title}")? Radni nalog će biti trajno obrisan iz sistema.`}
        confirmLabel="Obriši pripremu"
        onConfirm={() => {
          deleteWorkOrder(order.id);
          setIsConfirmDeleteOpen(false);
          onClose();
        }}
        onCancel={() => setIsConfirmDeleteOpen(false)}
      />
    </div>
  );
};
