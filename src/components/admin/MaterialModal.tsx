import React, { useState, useEffect } from 'react';
import { Material, UnitOfMeasure } from '../../types';
import { useApp } from '../../context/AppContext';
import { X, PackagePlus, AlertCircle, Box } from 'lucide-react';

interface MaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialToEdit?: Material | null;
}

const AVAILABLE_UNITS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'm3', label: 'm3' },
  { value: 'm2', label: 'm2' },
  { value: 'm', label: 'm' },
  { value: 'kom', label: 'kom' },
  { value: 'kg', label: 'kg' },
  { value: 'l', label: 'l' },
  { value: 'pak', label: 'pak' },
];

export const MaterialModal: React.FC<MaterialModalProps> = ({
  isOpen,
  onClose,
  materialToEdit,
}) => {
  const { addMaterial, updateMaterial, materials } = useApp();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Osnovni materijal');
  const [unit, setUnit] = useState<UnitOfMeasure>('kom');
  const [currentStock, setCurrentStock] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (materialToEdit) {
      setCode(materialToEdit.code || '');
      setName(materialToEdit.name || '');
      setCategory(materialToEdit.category || 'Opšti materijal');
      setUnit(materialToEdit.unit || 'kom');
      setCurrentStock((materialToEdit.currentStock ?? 0).toString());
      setMinStock((materialToEdit.minStock ?? 0).toString());
    } else {
      const nextIndex = materials.length + 1;
      setCode(`MAT-${(100 + nextIndex).toString()}`);
      setName('');
      setCategory('Osnovni materijal');
      setUnit('kom');
      setCurrentStock('0');
      setMinStock('0');
    }
    setError(null);
  }, [materialToEdit, isOpen, materials.length]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError('Šifra materijala je obavezna.');
      return;
    }
    if (!name.trim()) {
      setError('Naziv materijala je obavezan.');
      return;
    }

    const parsedStock = parseFloat(currentStock);
    const parsedMin = parseFloat(minStock);

    if (isNaN(parsedStock) || parsedStock < 0) {
      setError('Količina zalihe mora biti važeći pozitivan broj.');
      return;
    }

    if (isNaN(parsedMin) || parsedMin < 0) {
      setError('Minimalna zaliha mora biti važeći pozitivan broj.');
      return;
    }

    if (materialToEdit) {
      const res = updateMaterial(materialToEdit.id, {
        code: code.trim(),
        name: name.trim(),
        category: category.trim(),
        unit,
        currentStock: parsedStock,
        minStock: parsedMin,
      });
      if (!res.success) {
        setError(res.error || 'Greška pri izmjeni materijala.');
        return;
      }
    } else {
      const res = addMaterial({
        code: code.trim(),
        name: name.trim(),
        category: category.trim(),
        unit,
        currentStock: parsedStock,
        minStock: parsedMin,
      });
      if (!res.success) {
        setError(res.error || 'Greška pri dodavanju materijala.');
        return;
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div 
        className="bg-white rounded-t-2xl sm:rounded-xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <PackagePlus className="w-5 h-5 text-emerald-600 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {materialToEdit ? 'Uredi materijal u bazi' : 'Dodaj novi materijal u bazu'}
            </h3>
          </div>
          <button
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

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar overscroll-contain">
          
          {/* Row 1: Code & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Šifra materijala *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Unesite šifru materijala..."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kategorija
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Kategorija materijala"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Naziv materijala *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unesite puni naziv materijala"
              required
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Unit of Measure selection: strictly clean m, m2, m3, kom, kg, l, pak */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-emerald-600" />
              Jedinica mjere *
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as UnitOfMeasure)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {AVAILABLE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row: Current Stock & Min Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trenutno stanje u bazi ({unit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Minimalna zaliha ({unit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
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
              className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
            >
              {materialToEdit ? 'Sačuvaj izmjene' : 'Dodaj materijal u bazu'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
