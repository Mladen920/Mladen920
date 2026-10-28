import React, { useState, useEffect } from 'react';
import { WorkOrder, OrderPriority, OrderStatus, PlannedMaterial } from '../../types';
import { useApp } from '../../context/AppContext';
import { X, ClipboardCheck, AlertCircle, Calendar, Flag, UserCheck, Building, Package, Plus, Trash2, Check } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface WorkOrderModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  workOrderToEdit?: WorkOrder | null;
}

export const WorkOrderModal: React.FC<WorkOrderModalProps> = ({
  isOpen: propsIsOpen,
  onClose: propsOnClose,
  workOrderToEdit: propsWorkOrderToEdit,
}) => {
  const { 
    addWorkOrder, 
    updateWorkOrder, 
    deleteWorkOrder,
    workOrders, 
    users, 
    materials, 
    currentUser,
    isWorkOrderModalOpen,
    closeWorkOrderModal,
    selectedOrderToEdit
  } = useApp();

  // Use props if provided, otherwise fallback to context
  const isOpen = propsIsOpen !== undefined ? propsIsOpen : isWorkOrderModalOpen;
  const onClose = propsOnClose || closeWorkOrderModal;
  const workOrderToEdit = propsWorkOrderToEdit !== undefined ? propsWorkOrderToEdit : selectedOrderToEdit;

  const [orderNumber, setOrderNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedWorkers, setAssignedWorkers] = useState<string[]>([]);
  const [workerNotes, setWorkerNotes] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<OrderPriority>('normalno');
  const [status, setStatus] = useState<OrderStatus>('priprema');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Model preparation fields
  const [modelName, setModelName] = useState('');
  const [targetWorker, setTargetWorker] = useState('');
  const [modelDimensions, setModelDimensions] = useState('');
  const [modelNotes, setModelNotes] = useState('');

  // Up to 4 planned materials specified by admin/creator
  const [plannedMaterials, setPlannedMaterials] = useState<
    { materialId: string; customName: string; quantity: string; unit: string }[]
  >([]);

  // Available worker users in the system (or all users including admin if needed)
  const workerUsers = users.filter((u) => u.role === 'worker');

  // Initialize or reset form fields
  useEffect(() => {
    if (!isOpen) return;

    if (workOrderToEdit) {
      setOrderNumber(workOrderToEdit.orderNumber || '');
      setCustomer(workOrderToEdit.customer || '');
      setTitle(workOrderToEdit.title || '');
      setDescription(workOrderToEdit.description || '');
      setAssignedWorkers(workOrderToEdit.assignedWorkers || []);
      setWorkerNotes(workOrderToEdit.workerNotes || {});
      setPriority(workOrderToEdit.priority || 'normalno');
      setStatus(workOrderToEdit.status || 'na_cekanju');
      setDueDate(workOrderToEdit.dueDate || '');

      // Model preparation fields
      setModelName(workOrderToEdit.modelPreparation?.modelName || '');
      setTargetWorker(
        workOrderToEdit.modelPreparation?.targetWorker || 
        (workOrderToEdit.assignedWorkers?.[0] || '')
      );
      setModelDimensions(workOrderToEdit.modelPreparation?.dimensions || '');
      setModelNotes(workOrderToEdit.modelPreparation?.notes || '');

      if (workOrderToEdit.plannedMaterials && workOrderToEdit.plannedMaterials.length > 0) {
        setPlannedMaterials(
          workOrderToEdit.plannedMaterials.map((m) => ({
            materialId: m.materialId || '',
            customName: m.materialName || '',
            quantity: m.quantity !== undefined ? m.quantity.toString() : '',
            unit: m.unit || 'kom',
          }))
        );
      } else {
        setPlannedMaterials([]);
      }
    } else {
      // Auto-generate next order number
      const nextNum = workOrders.length + 1;
      const formattedNum = `RN-2026-${nextNum.toString().padStart(3, '0')}`;
      setOrderNumber(formattedNum);
      setCustomer('');
      setTitle('');
      setDescription('');
      
      // Auto-assign to current worker if worker creates order, or first available
      const defaultWorker = workerUsers.length > 0 ? workerUsers[0].username : (currentUser?.username || '');
      if (defaultWorker) {
        setAssignedWorkers([defaultWorker]);
        setTargetWorker(defaultWorker);
      } else {
        setAssignedWorkers([]);
        setTargetWorker('');
      }

      setModelName('');
      setModelDimensions('');
      setModelNotes('');
      setWorkerNotes({});
      setPriority('normalno');
      // Radnik bez prava na pripremu modela nalog direktno stavlja na čekanje u radionici
      const workerWithoutPrep = currentUser?.role === 'worker' && !currentUser?.permissions?.canPrepareModels;
      setStatus(workerWithoutPrep ? 'na_cekanju' : 'priprema');
      setPlannedMaterials([]);
      
      // Default due date: 7 days from today
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      setDueDate(defaultDate.toISOString().split('T')[0]);
    }
    setError(null);
  }, [workOrderToEdit, isOpen, workOrders.length, currentUser]);

  const isAdmin = currentUser?.role === 'admin';
  const canCreate = isAdmin || Boolean(currentUser?.permissions?.canCreateOrders);
  const canEdit = isAdmin || Boolean(currentUser?.permissions?.canEditOrders);

  if (!isOpen || (!canCreate && !canEdit)) return null;

  const handleAddMaterialSlot = () => {
    if (plannedMaterials.length < 4) {
      setPlannedMaterials((prev) => [
        ...prev,
        { materialId: '', customName: '', quantity: '', unit: 'kom' },
      ]);
    }
  };

  const handleRemoveMaterialSlot = (index: number) => {
    setPlannedMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMaterialSlotChange = (
    index: number,
    field: 'materialId' | 'customName' | 'quantity' | 'unit',
    value: string
  ) => {
    setPlannedMaterials((prev) => {
      const copy = [...prev];
      const slot = { ...copy[index] };

      if (field === 'materialId') {
        slot.materialId = value;
        const found = materials.find((m) => m.id === value);
        if (found) {
          slot.customName = found.name;
          slot.unit = found.unit;
        }
      } else if (field === 'customName') {
        slot.customName = value;
        slot.materialId = '';
      } else if (field === 'quantity') {
        slot.quantity = value;
      } else if (field === 'unit') {
        slot.unit = value;
      }

      copy[index] = slot;
      return copy;
    });
  };

  const toggleWorker = (username: string) => {
    setAssignedWorkers((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  };

  const handleNoteChange = (username: string, note: string) => {
    setWorkerNotes((prev) => ({
      ...prev,
      [username]: note,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!orderNumber.trim()) {
      setError('Broj radnog naloga je obavezan.');
      return;
    }
    if (!customer.trim()) {
      setError('Molimo unesite za koga se radi radni nalog (kupac / klijent).');
      return;
    }
    if (!title.trim()) {
      setError('Naziv posla / proizvoda je obavezan.');
      return;
    }

    let finalAssigned = assignedWorkers;
    if (finalAssigned.length === 0) {
      if (currentUser) {
        finalAssigned = [currentUser.username];
      } else {
        setError('Morate označiti bar jednog radnika za ovaj radni nalog.');
        return;
      }
    }

    if (!dueDate) {
      setError('Molimo unesite rok izrade.');
      return;
    }

    // Process planned materials (up to 4)
    const validPlanned: PlannedMaterial[] = plannedMaterials
      .map((p) => {
        const mat = materials.find((m) => m.id === p.materialId);
        const name = mat ? mat.name : p.customName.trim();
        const unit = mat ? mat.unit : (p.unit || 'kom');
        const qty = p.quantity && !isNaN(parseFloat(p.quantity)) ? parseFloat(p.quantity) : undefined;
        return {
          materialId: p.materialId || undefined,
          materialName: name,
          quantity: qty,
          unit,
        };
      })
      .filter((p) => p.materialName.trim().length > 0);

    // Strict stock verification for planned materials
    for (const p of validPlanned) {
      if (p.materialId && p.quantity !== undefined && p.quantity > 0) {
        const mat = materials.find((m) => m.id === p.materialId);
        if (mat && p.quantity > mat.currentStock) {
          setError(`Uneta količina premašuje stanje na zalihama za materijal "${mat.name}". Trenutno na stanju: ${mat.currentStock} ${mat.unit}, a unijeto je: ${p.quantity} ${mat.unit}.`);
          return;
        }
      }
    }

    const targetWorkerObj = users.find((u) => u.username === targetWorker);

    const modelPrepPayload = {
      modelName: modelName.trim() || undefined,
      targetWorker: targetWorker || undefined,
      targetWorkerName: targetWorkerObj ? targetWorkerObj.fullName : undefined,
      dimensions: modelDimensions.trim() || undefined,
      notes: modelNotes.trim() || undefined,
      isReady: status !== 'priprema',
      readyAt: status !== 'priprema' ? (workOrderToEdit?.modelPreparation?.readyAt || new Date().toISOString()) : undefined,
      readyBy: status !== 'priprema' ? (workOrderToEdit?.modelPreparation?.readyBy || currentUser?.fullName) : undefined,
    };

    if (workOrderToEdit) {
      const res = updateWorkOrder(workOrderToEdit.id, {
        orderNumber: orderNumber.trim(),
        customer: customer.trim(),
        title: title.trim(),
        description: description.trim(),
        assignedWorkers: finalAssigned,
        workerNotes,
        plannedMaterials: validPlanned.length > 0 ? validPlanned : undefined,
        priority,
        status,
        dueDate,
        stoppage: workOrderToEdit.stoppage,
        stoppageHistory: workOrderToEdit.stoppageHistory,
        modelPreparation: modelPrepPayload,
      });
      if (!res.success) {
        setError(res.error || 'Greška pri izmjeni naloga.');
        return;
      }
    } else {
      const res = addWorkOrder({
        orderNumber: orderNumber.trim(),
        customer: customer.trim(),
        title: title.trim(),
        description: description.trim(),
        assignedWorkers: finalAssigned,
        workerNotes,
        plannedMaterials: validPlanned.length > 0 ? validPlanned : undefined,
        priority,
        status,
        dueDate,
        modelPreparation: modelPrepPayload,
      });
      if (!res.success) {
        setError(res.error || 'Greška pri kreiranju naloga.');
        return;
      }
    }

    onClose();
  };

  const handleReleaseAndSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    setStatus('na_cekanju');
    // Trigger submit with 'na_cekanju' status
    setTimeout(() => {
      const form = document.getElementById('work-order-form') as HTMLFormElement;
      if (form) {
        form.requestSubmit();
      }
    }, 50);
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-t-2xl sm:rounded-xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {workOrderToEdit ? 'Uredi radni nalog' : 'Izdavanje novog radnog naloga'}
              </h3>
              <span className="text-[11px] text-slate-500">
                {workOrderToEdit ? `Ažuriranje naloga ${orderNumber}` : 'Kreirajte radni nalog sa zadacima i materijalima'}
              </span>
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

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} id="work-order-form" className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
          
          {/* Row 1: Order number & Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Broj radnog naloga *
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Unesite broj radnog naloga..."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                Za koga se radi (Naručilac / Kupac / Klijent) *
              </label>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Ime kupca ili naziv firme"
                required
                className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Row 2: Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Naziv posla / Proizvoda *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Unesite kratak i jasan naziv posla"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Row 3: Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opis posla, dimenzije i tehničke napomene
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detaljan opis radnih operacija, dimenzije ili specifikacija..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Posebna sekcija: Faza Pripreme Modela */}
          <div className="p-4 bg-linear-to-r from-indigo-50/80 via-purple-50/60 to-blue-50/60 rounded-xl border-2 border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-200/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  📐
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                    Faza: Priprema Modela
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    Administrator unosi model, dimenzije i bira radnika za izradu
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border self-start sm:self-auto ${
                  status === 'priprema'
                    ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {status === 'priprema' ? '⏳ U pripremi (skriveno od radnika)' : '✅ Pušteno u radionici'}
                </span>

                {(modelName || modelDimensions || modelNotes || status === 'priprema') && (
                  <button
                    type="button"
                    onClick={() => {
                      setModelName('');
                      setModelDimensions('');
                      setModelNotes('');
                      setStatus('na_cekanju');
                    }}
                    className="text-[10px] font-semibold text-slate-600 hover:text-red-700 bg-white hover:bg-red-50 px-2 py-0.5 rounded border border-slate-300 transition cursor-pointer"
                    title="Poništi podatke pripreme modela i prebaci nalog u standardni status 'Na čekanju'"
                  >
                    Poništi pripremu modela
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Za koji model se radi */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Za koji tačno model se radi (Naziv / Oznaka modela)
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Unesite naziv ili oznaku modela..."
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Za kog radnika se priprema model */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Za kog radnika se priprema model *
                </label>
                <select
                  value={targetWorker}
                  onChange={(e) => {
                    const chosen = e.target.value;
                    setTargetWorker(chosen);
                    if (chosen && !assignedWorkers.includes(chosen)) {
                      setAssignedWorkers((prev) => [...prev, chosen]);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Odaberite radnika koji će raditi model --</option>
                  {workerUsers.map((w) => (
                    <option key={w.username} value={w.username}>
                      {w.fullName} ({w.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Dimenzije i specifikacije */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Dimenzije / Rezni list / Tehničke specifikacije
                </label>
                <input
                  type="text"
                  value={modelDimensions}
                  onChange={(e) => setModelDimensions(e.target.value)}
                  placeholder="Unesite dimenzije ili tehničke specifikacije..."
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Uputstva za pripremu modela / fajlovi */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Digitalna priprema / CNC nacrti / Uputstva
                </label>
                <input
                  type="text"
                  value={modelNotes}
                  onChange={(e) => setModelNotes(e.target.value)}
                  placeholder="Unesite uputstva za pripremu, CNC nacrte ili detalje..."
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Assigned Workers */}
          <div className="p-3.5 sm:p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" />
                Zaduženi radnici *
              </label>
              <span className="text-[11px] text-slate-500">
                {assignedWorkers.length} odabrano
              </span>
            </div>

            {users.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                Nema unesenih radnika. Možete dodati radnike u sekciji "Radnici &amp; Pristup".
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {users.map((w) => {
                  const isChecked = assignedWorkers.includes(w.username);
                  return (
                    <div
                      key={w.id}
                      onClick={() => toggleWorker(w.username)}
                      className={`p-2.5 rounded-lg border cursor-pointer select-none transition-all flex items-start justify-between gap-2 ${
                        isChecked 
                          ? 'bg-blue-50 border-blue-300 shadow-2xs' 
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {w.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {w.username} ({w.role === 'admin' ? 'Admin' : 'Radnik'})
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Predviđeni materijal za izradu (Do 4 materijala) */}
          <div className="p-3.5 sm:p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600" />
                <label className="text-xs font-bold text-slate-900">
                  Planirani materijal (do 4 stavke - opciono)
                </label>
              </div>
              {plannedMaterials.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddMaterialSlot}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj ({plannedMaterials.length}/4)</span>
                </button>
              )}
            </div>

            {plannedMaterials.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic py-1">
                Trenutno nema navedenih planiranih materijala. Kliknite "Dodaj" ukoliko želite radnicima unaprijed specificirati do 4 materijala.
              </p>
            ) : (
              <div className="space-y-2.5">
                {plannedMaterials.map((slot, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-600">
                        Materijal #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterialSlot(index)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                        title="Ukloni ovaj materijal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      {/* Izbor iz baze materijala ili slobodan unos */}
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Iz baze materijala:
                        </label>
                        <select
                          value={slot.materialId}
                          onChange={(e) => handleMaterialSlotChange(index, 'materialId', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">-- Izaberi iz baze ili upiši ručno --</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.code}) - {m.unit}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Ručni naziv ukoliko nije u bazi */}
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Naziv materijala:
                        </label>
                        <input
                          type="text"
                          value={slot.customName}
                          onChange={(e) => handleMaterialSlotChange(index, 'customName', e.target.value)}
                          placeholder="Unesite naziv materijala..."
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {/* Količina */}
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Predviđena količina:
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={slot.quantity}
                          onChange={(e) => handleMaterialSlotChange(index, 'quantity', e.target.value)}
                          placeholder="Količina"
                          className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 ${
                            (() => {
                              const m = materials.find((mat) => mat.id === slot.materialId);
                              return m && slot.quantity && parseFloat(slot.quantity) > m.currentStock
                                ? 'border-red-400 bg-red-50 text-red-900 focus:ring-red-500'
                                : 'border-slate-300 focus:ring-blue-500';
                            })()
                          }`}
                        />
                        {(() => {
                          const m = materials.find((mat) => mat.id === slot.materialId);
                          if (!m) return null;
                          const isExceeding = slot.quantity && parseFloat(slot.quantity) > m.currentStock;
                          return (
                            <div className="mt-1 text-[10px] font-mono flex items-center justify-between">
                              <span className={isExceeding ? 'text-red-600 font-bold' : 'text-slate-500'}>
                                Na stanju: {m.currentStock} {m.unit}
                              </span>
                              {isExceeding && (
                                <span className="text-red-600 font-bold animate-pulse">
                                  ⚠️ Premašuje zalihe!
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Jedinica mjere */}
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Jedinica mjere:
                        </label>
                        <select
                          value={slot.unit}
                          onChange={(e) => handleMaterialSlotChange(index, 'unit', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="kom">kom</option>
                          <option value="m">m</option>
                          <option value="m2">m2</option>
                          <option value="m3">m3</option>
                          <option value="kg">kg</option>
                          <option value="l">l</option>
                          <option value="pak">pak</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row 5: Due Date, Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Rok izrade *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-slate-500" />
                Prioritet
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OrderPriority)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="normalno">Normalno</option>
                <option value="visoko">Visoko</option>
                <option value="hitno">Hitno</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status naloga
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="priprema">Priprema modela</option>
                <option value="na_cekanju">Na čekanju</option>
                <option value="u_izradi">U izradi</option>
                <option value="zavrseno">Završeno</option>
                <option value="otkazano">Otkazano</option>
              </select>
            </div>
          </div>

        </form>

        {/* Sticky Mobile & Desktop Action Bar */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs border-t border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Odustani
            </button>
            {workOrderToEdit && (
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(true)}
                className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                title="Obriši ovaj nalog / pripremu ako ste se predomislili"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Obriši {status === 'priprema' ? 'pripremu' : 'nalog'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReleaseAndSubmit}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Završi pripremu i odmah prosledi radnicima u radionicu"
            >
              <span>🚀 Pusti u rad / Prosledi radnicima</span>
            </button>

            <button
              type="submit"
              form="work-order-form"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>
                {status === 'priprema'
                  ? 'Sačuvaj u pripremi modela'
                  : workOrderToEdit
                  ? 'Sačuvaj izmjene'
                  : 'Izdaj radni nalog'}
              </span>
            </button>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Brisanje radnog naloga / pripreme"
        message={`Da li ste sigurni da želite obrisati ${workOrderToEdit?.orderNumber} ("${workOrderToEdit?.title}")? Radni nalog će biti trajno uklonjen iz sistema.`}
        confirmLabel="Obriši"
        onConfirm={() => {
          if (workOrderToEdit) {
            deleteWorkOrder(workOrderToEdit.id);
            setIsConfirmDeleteOpen(false);
            onClose();
          }
        }}
        onCancel={() => setIsConfirmDeleteOpen(false)}
      />
    </div>
  );
};
