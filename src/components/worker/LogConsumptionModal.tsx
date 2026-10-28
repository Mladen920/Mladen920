import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, Material, MultiMaterialEntry } from '../../types';
import { X, PackageCheck, AlertCircle, Clock, CheckCircle2, Plus, Trash2, Building } from 'lucide-react';

interface LogConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedOrderId?: string;
  allowAllOrders?: boolean;
}

export const LogConsumptionModal: React.FC<LogConsumptionModalProps> = ({
  isOpen,
  onClose,
  preselectedOrderId,
  allowAllOrders = true,
}) => {
  const { currentUser, workOrders, materials, recordWorkCompletion } = useApp();

  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  
  // Up to 4 optional material slots
  const [materialSlots, setMaterialSlots] = useState<{ materialId: string; quantity: string }[]>([
    { materialId: '', quantity: '' },
  ]);

  const [hoursSpent, setHoursSpent] = useState<string>('1');
  const [minutesSpent, setMinutesSpent] = useState<string>('0');
  const [note, setNote] = useState<string>('');
  const [markAsCompleted, setMarkAsCompleted] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const availableWorkOrders = (workOrders || []).filter((wo) => {
    // Orders in preparation must never be accessible to workers
    if (wo?.status === 'priprema' || wo?.status === 'otkazano') return false;
    if (wo?.id === preselectedOrderId) return true;
    if (wo?.status === 'zavrseno') return false;
    if (allowAllOrders || currentUser?.role === 'admin') return true;
    return Array.isArray(wo?.assignedWorkers) && wo.assignedWorkers.includes(currentUser?.username || '');
  });

  useEffect(() => {
    if (preselectedOrderId) {
      setSelectedOrderId(preselectedOrderId);
    } else if (availableWorkOrders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(availableWorkOrders[0].id);
    }

    // Reset slots to 1 empty slot (user can add up to 4)
    setMaterialSlots([{ materialId: '', quantity: '' }]);
    setError(null);
    setSuccessMessage(null);
  }, [isOpen, preselectedOrderId]);

  if (!isOpen) return null;

  const currentOrder = workOrders.find((w) => w.id === selectedOrderId);

  const handleSlotChange = (index: number, field: 'materialId' | 'quantity', value: string) => {
    setMaterialSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddSlot = () => {
    if (materialSlots.length < 4) {
      setMaterialSlots((prev) => [...prev, { materialId: '', quantity: '' }]);
    }
  };

  const handleRemoveSlot = (index: number) => {
    setMaterialSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLoadPlannedMaterials = () => {
    if (!currentOrder?.plannedMaterials || currentOrder.plannedMaterials.length === 0) return;
    const loadedSlots = currentOrder.plannedMaterials.map((p) => {
      const matched = materials.find((m) => (p.materialId && m.id === p.materialId) || m.name.toLowerCase() === p.materialName.toLowerCase());
      return {
        materialId: matched ? matched.id : (p.materialId || ''),
        quantity: p.quantity !== undefined ? p.quantity.toString() : '',
      };
    }).filter(s => !!s.materialId).slice(0, 4);

    if (loadedSlots.length > 0) {
      setMaterialSlots(loadedSlots);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!selectedOrderId) {
      setError('Molimo odaberite radni nalog.');
      return;
    }

    const h = parseInt(hoursSpent, 10) || 0;
    const m = parseInt(minutesSpent, 10) || 0;

    if (h === 0 && m === 0) {
      setError('Morate unijeti utrošeno vrijeme rada (sate ili minute).');
      return;
    }

    if (m < 0 || m >= 60) {
      setError('Minuti moraju biti između 0 i 59.');
      return;
    }

    // Prepare valid material entries (materials are completely optional!)
    const preparedMaterials: MultiMaterialEntry[] = [];
    for (let i = 0; i < materialSlots.length; i++) {
      const slot = materialSlots[i];
      if (slot.materialId) {
        const qty = parseFloat(slot.quantity);
        if (isNaN(qty) || qty <= 0) {
          setError(`Molimo unesite ispravnu količinu za materijal #${i + 1} ili ga uklonite.`);
          return;
        }
        const mat = materials.find((m) => m.id === slot.materialId);
        if (mat && qty > mat.currentStock) {
          setError(`Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima trenutno samo ${mat.currentStock} ${mat.unit} na zalihama, a unijeli ste ${qty} ${mat.unit}.`);
          return;
        }
        preparedMaterials.push({
          materialId: slot.materialId,
          quantity: qty,
        });
      }
    }

    const res = recordWorkCompletion({
      workOrderId: selectedOrderId,
      materials: preparedMaterials,
      hoursSpent: h,
      minutesSpent: m,
      note: note.trim() || undefined,
      markAsCompleted,
    });

    if (!res.success) {
      setError(res.error || 'Greška pri evidentiranju rada.');
      return;
    }

    setSuccessMessage(
      markAsCompleted
        ? 'Radni nalog je uspješno završen i prebačen u istoriju radnih naloga!'
        : 'Utrošak i vrijeme rada su uspješno evidentirani!'
    );

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4" onClick={onClose}>
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Evidentiraj rad i utrošak materijala
              </h3>
              <p className="text-[11px] text-slate-500">
                Radnik: {currentUser?.fullName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Message Banner */}
        {successMessage && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-medium shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Message Banner */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
          
          {/* Select Work Order */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Radni nalog *
            </label>
            {availableWorkOrders.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Nema otvorenih radnih naloga.
              </div>
            ) : (
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableWorkOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.orderNumber} - {wo.title} {wo.customer ? `(Za: ${wo.customer})` : ''}
                  </option>
                ))}
              </select>
            )}
            {currentOrder && (
              <div className="mt-2 space-y-2">
                {/* High Priority Banner */}
                {(currentOrder.priority === 'visoko' || currentOrder.priority === 'hitno') && (
                  <div className="p-2 bg-red-100 border border-red-300 rounded-lg text-xs font-bold text-red-800 flex items-center gap-1.5 animate-pulse">
                    <span className="text-base">🔥</span>
                    <span>HITAN RADNI NALOG (Prioritet: {currentOrder.priority})</span>
                  </div>
                )}

                {/* Active Stoppage Alert */}
                {currentOrder.stoppage && !currentOrder.stoppage.resolved && (
                  <div className="p-2.5 bg-red-50 border-2 border-red-300 rounded-lg text-xs text-red-900">
                    <div className="font-bold flex items-center gap-1.5 text-red-700">
                      <span className="text-base">⚠️</span>
                      <span>PAŽNJA: Prijavljen je zastoj na ovom nalogu!</span>
                    </div>
                    <p className="mt-1 text-[11px] text-red-800 font-medium">
                      <strong>Razlog:</strong> {currentOrder.stoppage.reason} — {currentOrder.stoppage.description}
                    </p>
                  </div>
                )}

                {/* Customer, Description, Worker instructions */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentOrder.customer && (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        Za: {currentOrder.customer}
                      </span>
                    )}
                    <span className="font-mono text-slate-500 text-[11px]">
                      Rok: {currentOrder.dueDate}
                    </span>
                  </div>

                  {currentOrder.description && (
                    <div className="pt-1">
                      <span className="font-semibold text-slate-500 text-[11px] block">Opis radnog naloga:</span>
                      <div className="mt-0.5 text-slate-800 whitespace-pre-wrap text-xs bg-white p-2 rounded border border-slate-200 font-sans max-h-36 overflow-y-auto custom-scrollbar">
                        {currentOrder.description}
                      </div>
                    </div>
                  )}

                  {currentOrder.workerNotes?.[currentUser?.username || ''] && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                      <strong>Vaš zadatak:</strong> {currentOrder.workerNotes[currentUser?.username || '']}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Up to 4 optional materials */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-900">
                  Utrošeni materijali (opciono, do 4 materijala)
                </label>
                <span className="text-[11px] text-slate-500">
                  Ako niste trošili materijal, nalog se može zatvoriti bez unosa materijala.
                </span>
              </div>
              {materialSlots.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj materijal ({materialSlots.length}/4)</span>
                </button>
              )}
            </div>

            {/* If admin pre-planned materials, offer instant load button */}
            {currentOrder?.plannedMaterials && currentOrder.plannedMaterials.length > 0 && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-blue-900 flex items-center gap-1">
                    <span>Planirani materijali od strane administratora ({currentOrder.plannedMaterials.length}):</span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    {currentOrder.plannedMaterials.map((p) => `${p.materialName}${p.quantity ? ` (${p.quantity} ${p.unit})` : ''}`).join(' • ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadPlannedMaterials}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-800 bg-white hover:bg-blue-100 rounded border border-blue-300 shadow-2xs whitespace-nowrap cursor-pointer transition shrink-0"
                >
                  Učitaj ove materijale
                </button>
              </div>
            )}

            {materialSlots.map((slot, index) => {
              const selectedMat = materials.find((m) => m.id === slot.materialId);

              return (
                <div
                  key={index}
                  className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Materijal #{index + 1} (opciono)</span>
                    {materialSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(index)}
                        className="text-slate-400 hover:text-red-600 p-0.5"
                        title="Ukloni ovaj materijal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <select
                        value={slot.materialId}
                        onChange={(e) => handleSlotChange(index, 'materialId', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">-- Bez materijala / Izaberi --</option>
                        {materials.map((m) => {
                          const isPlanned = currentOrder?.plannedMaterials?.some(
                            (p) => (p.materialId && p.materialId === m.id) || p.materialName.toLowerCase() === m.name.toLowerCase()
                          );
                          return (
                            <option key={m.id} value={m.id} className={isPlanned ? 'font-bold text-blue-700 bg-blue-50' : ''}>
                              {isPlanned ? '⭐ [PLANIRANO ZA NALOG] ' : ''}{m.code} - {m.name} ({m.unit})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={!slot.materialId}
                        value={slot.quantity}
                        onChange={(e) => handleSlotChange(index, 'quantity', e.target.value)}
                        placeholder="Količina"
                        className="w-full pl-2.5 pr-12 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-xs font-mono text-slate-500">
                        {selectedMat?.unit || ''}
                      </span>
                    </div>
                  </div>

                  {selectedMat && (
                    <div className="text-[11px] font-mono flex items-center justify-between pt-0.5">
                      <span className={slot.quantity && parseFloat(slot.quantity) > selectedMat.currentStock ? 'text-red-600 font-bold' : 'text-slate-600'}>
                        Raspoloživo u magacinu: <strong>{selectedMat.currentStock} {selectedMat.unit}</strong>
                      </span>
                      {slot.quantity && parseFloat(slot.quantity) > selectedMat.currentStock ? (
                        <span className="text-red-600 font-bold bg-red-100 px-1.5 py-0.5 rounded border border-red-300 animate-pulse">
                          ⚠️ Premašuje zalihe!
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Automatski se skida sa stanja</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Work Time: Hours & Minutes */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              Utrošeno radno vrijeme *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Radni sati</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="48"
                    value={hoursSpent}
                    onChange={(e) => setHoursSpent(e.target.value)}
                    required
                    className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-xs text-slate-400">
                    h
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Radni minuti</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={minutesSpent}
                    onChange={(e) => setMinutesSpent(e.target.value)}
                    required
                    className="w-full pl-3 pr-10 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-xs text-slate-400">
                    min
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Work Phase / Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opis obavljenog posla / Napomena (opciono)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Unesite opis obavljenog posla ili napomenu o utrošku..."
              className="w-full max-h-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-y-auto resize-none custom-scrollbar"
            />
          </div>

          {/* Close / Complete Checkbox */}
          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={markAsCompleted}
                onChange={(e) => setMarkAsCompleted(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-emerald-950 block">
                  Završi ovaj radni nalog i prebaci u istoriju
                </span>
                <span className="text-[11px] text-emerald-800 block">
                  Nalog se uklanja iz zaduženih radnih naloga i prelazi u istoriju završenih poslova.
                </span>
              </div>
            </label>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100 p-2 rounded">
            <strong>Napomena:</strong> Nakon evidentiranja, utrošene količine može mijenjati isključivo administrator.
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
              disabled={availableWorkOrders.length === 0}
              className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
            >
              <PackageCheck className="w-4 h-4" />
              <span>{markAsCompleted ? 'Završi nalog i sačuvaj' : 'Sačuvaj utrošak'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
