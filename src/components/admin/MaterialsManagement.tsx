import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Material } from '../../types';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  Edit3, 
  Trash2, 
  ArrowUpRight, 
  Layers, 
  Box,
  CheckCircle
} from 'lucide-react';
import { MaterialModal } from './MaterialModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

export const MaterialsManagement: React.FC = () => {
  const { materials, updateMaterial, deleteMaterial } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  // Default to 'scroll' so exactly 9 materials are visible in the window with smooth scrolling
  const [tableDisplayMode, setTableDisplayMode] = useState<'scroll' | 'full'>('scroll');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMaterialToEdit, setSelectedMaterialToEdit] = useState<Material | null>(null);

  // Quick Restock modal state
  const [restockMaterial, setRestockMaterial] = useState<Material | null>(null);
  const [restockAmount, setRestockAmount] = useState<string>('');
  const [restockError, setRestockError] = useState<string | null>(null);

  // Delete confirm state
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);

  // Extract unique categories
  const categories = Array.from(new Set((materials || []).map((m) => m?.category || 'Opšte')));
  const lowStockCount = (materials || []).filter((m) => (m?.currentStock ?? 0) <= (m?.minStock ?? 0)).length;

  // Filter materials
  const filteredMaterials = (materials || []).filter((mat) => {
    const mName = mat?.name || '';
    const mCode = mat?.code || '';
    const mCat = mat?.category || '';

    const matchesSearch =
      mName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mCat.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || mat?.category === categoryFilter;
    const matchesLowStock = !onlyLowStock || (mat?.currentStock ?? 0) <= (mat?.minStock ?? 0);

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const handleOpenNew = () => {
    setSelectedMaterialToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (mat: Material) => {
    setSelectedMaterialToEdit(mat);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (materialToDelete) {
      deleteMaterial(materialToDelete.id);
      setMaterialToDelete(null);
    }
  };

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRestockError(null);

    if (!restockMaterial) return;

    const amount = parseFloat(restockAmount);
    if (isNaN(amount) || amount <= 0) {
      setRestockError('Molimo unesite količinu veću od 0.');
      return;
    }

    const newStock = Number((restockMaterial.currentStock + amount).toFixed(4));
    updateMaterial(restockMaterial.id, { currentStock: newStock });
    
    setRestockMaterial(null);
    setRestockAmount('');
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Baza Podataka Materijala
            </h1>
            <span className="text-[11px] font-mono font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
              Samo Administrator
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralna evidencija raspoloživih zaliha materijala sa jedinicama mjere (m, m2, m3, kom, kg, l, pak).
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Dodaj novi materijal</span>
        </button>
      </div>

      {/* Info notice for materials */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-3">
        <Box className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold">Automatsko skidanje zaliha:</strong> Kada radnici evidentiraju utrošak na radnom nalogu, količina se istog trenutka oduzima iz ove glavne baze podataka, a administrator dobija zapis u izvještaj.
        </div>
      </div>

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
            placeholder="Pretraga po nazivu materijala, šifri (MAT-...) ili kategoriji..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Sve kategorije</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              onlyLowStock
                ? 'bg-red-600 text-white border-red-700 shadow-xs'
                : lowStockCount > 0
                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 animate-pulse'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>Ispod minimuma ({lowStockCount})</span>
          </button>

          <span className="text-xs text-slate-600 px-2 py-1 font-mono tabular-nums">
            Prikazano: {filteredMaterials.length}
          </span>
        </div>

      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table top toolbar: 9-materials scroll view vs Full view toggle */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              Prikaz: <strong className="text-slate-900">{tableDisplayMode === 'scroll' ? '9 prvih materijala (skrolovanje)' : 'svi materijali'}</strong> od ukupno <strong className="text-emerald-700">{filteredMaterials.length}</strong> (u bazi: {materials.length})
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
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Prikazuje 9 prvih materijala sa nesmetanim skrolovanjem kroz sve ostale"
            >
              ↕️ Scroll traka (prikaz 9 materijala)
            </button>
            <button
              type="button"
              onClick={() => setTableDisplayMode('full')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                tableDisplayMode === 'full'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Puni prikaz svih materijala bez ograničenja visine"
            >
              📜 Puni prikaz
            </button>
          </div>
        </div>

        {/* Scrollable container: 520px height shows roughly 9 rows, with sticky table header */}
        <div className={`overflow-x-auto scroll-smooth custom-scrollbar ${
          tableDisplayMode === 'scroll' ? 'max-h-[520px] overflow-y-auto' : 'overflow-y-visible'
        }`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className={tableDisplayMode === 'scroll' ? 'sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs shadow-2xs' : 'bg-slate-50'}>
              <tr className="border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3">Šifra</th>
                <th className="py-2.5 px-3">Naziv materijala</th>
                <th className="py-2.5 px-3">Kategorija</th>
                <th className="py-2.5 px-3 text-center">Jedinica</th>
                <th className="py-2.5 px-3 text-right">Cijena / JM</th>
                <th className="py-2.5 px-3 text-right">Trenutna zaliha</th>
                <th className="py-2.5 px-3 text-right">Minimalna zaliha</th>
                <th className="py-2.5 px-3 text-center">Status lagera</th>
                <th className="py-2.5 px-3 text-center">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-sm text-slate-700">Baza materijala je prazna</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Dodajte materijale klikom na dugme "Dodaj novi materijal" iznad.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((mat) => {
                  const isLowStock = mat.currentStock <= mat.minStock;

                  return (
                    <tr
                      key={mat.id}
                      className={`transition-colors ${
                        isLowStock
                          ? 'bg-red-50/80 hover:bg-red-100/90 border-l-4 border-l-red-600'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Code */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isLowStock && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 animate-bounce" />}
                          <span>{mat.code}</span>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isLowStock ? 'text-red-950 font-bold' : 'text-slate-900'}`}>
                            {mat.name}
                          </span>
                          {isLowStock && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-300 animate-pulse">
                              Ispod minimuma!
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                          Unio: <strong className="text-slate-700">{mat.createdBy?.fullName || 'Administrator'}</strong>
                          {mat.createdBy?.timestamp ? ` • ${mat.createdBy.timestamp.split(' ')[0]}` : ''}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {mat.category || 'Opšte'}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="font-mono font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 border border-slate-200">
                          {mat.unit}
                        </span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        {mat.unitPrice && mat.unitPrice > 0 ? (
                          <span className="text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                            {mat.unitPrice.toFixed(2)} KM
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal text-[11px]">
                            0.00 KM
                          </span>
                        )}
                      </td>

                      {/* Current Stock */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        <span
                          className={`text-sm px-2 py-0.5 rounded ${
                            isLowStock 
                              ? 'text-red-700 font-extrabold bg-red-100 border border-red-300' 
                              : 'text-slate-900'
                          }`}
                        >
                          {mat.unit === 'm3' || mat.unit === 'm2'
                            ? mat.currentStock.toFixed(3)
                            : mat.unit === 'kom'
                            ? Math.round(mat.currentStock)
                            : mat.currentStock.toFixed(2)}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            {mat.unit}
                          </span>
                        </span>
                      </td>

                      {/* Min Stock */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-700">
                          {mat.minStock}{' '}
                          <span className="text-[10px] font-normal text-slate-500">{mat.unit}</span>
                        </span>
                      </td>

                      {/* Stock Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-md shadow-xs animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-200" />
                            HITNA NABAVKA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Optimalno
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setRestockMaterial(mat);
                              setRestockAmount('');
                              setRestockError(null);
                            }}
                            title="Dopuna stanja"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Dopuni</span>
                          </button>

                          <button
                            onClick={() => handleOpenEdit(mat)}
                            title="Uredi materijal"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setMaterialToDelete(mat)}
                            title="Obriši materijal"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Material Modal (Add / Edit) */}
      <MaterialModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        materialToEdit={selectedMaterialToEdit}
      />

      {/* Quick Restock Modal */}
      {restockMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Dopuna zalihe materijala
              </h3>
              <button
                onClick={() => setRestockMaterial(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleRestockSubmit} className="p-5 space-y-3">
              <div>
                <span className="text-[11px] text-slate-500 block">Materijal:</span>
                <span className="text-xs font-bold text-slate-900 block">{restockMaterial.name}</span>
                <span className="text-[11px] font-mono text-slate-600">
                  Trenutno stanje: {restockMaterial.currentStock} {restockMaterial.unit}
                </span>
              </div>

              {restockError && (
                <div className="p-2 text-xs text-red-600 bg-red-50 rounded border border-red-200">
                  {restockError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Količina za dodavanje ({restockMaterial.unit}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  autoFocus
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockMaterial(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm"
                >
                  Potvrdi prijem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!materialToDelete}
        title="Brisanje materijala iz baze"
        message={`Da li ste sigurni da želite obrisati materijal "${materialToDelete?.name}" (${materialToDelete?.code})?`}
        confirmLabel="Obriši materijal"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setMaterialToDelete(null)}
      />

    </div>
  );
};
