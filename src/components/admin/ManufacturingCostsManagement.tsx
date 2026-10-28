import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { WorkOrder, Material, ConsumptionLog } from '../../types';
import { 
  Calculator, 
  Coins, 
  Search, 
  Download, 
  Printer, 
  Clock, 
  Package, 
  HardHat, 
  Check, 
  X, 
  AlertCircle, 
  Eye, 
  FileSpreadsheet, 
  Edit3, 
  Save, 
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign,
  TrendingUp,
  Boxes
} from 'lucide-react';
import { OrderNumberWithHover } from '../common/OrderNumberWithHover';

export const ManufacturingCostsManagement: React.FC = () => {
  const { workOrders, materials, consumptionLogs, updateWorkOrder, updateMaterial, users } = useApp();

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'zavrseno' | 'u_izradi' | 'priprema' | 'na_cekanju'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'highest_cost' | 'lowest_cost' | 'order_number'>('newest');
  
  // Expanded card IDs for detailed view
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Editing state for an order's labor cost
  // editingLaborCost: { [orderId]: { laborRatePerHour: string; customLaborCost: string; otherCosts: string; costNotes: string } }
  const [editingLaborCost, setEditingLaborCost] = useState<Record<string, {
    laborRatePerHour: string;
    customLaborCost: string;
    otherCosts: string;
    costNotes: string;
    isCustomMode: boolean;
  }>>({});

  // Feedback notifications for saved costs
  const [savedOrderFeedback, setSavedOrderFeedback] = useState<string | null>(null);

  // Quick edit for material price modal
  const [materialForPriceEdit, setMaterialForPriceEdit] = useState<Material | null>(null);
  const [newMaterialPrice, setNewMaterialPrice] = useState<string>('');

  // Printable calculation sheet modal
  const [orderForPrint, setOrderForPrint] = useState<WorkOrder | null>(null);

  // Material lookup map for O(1) speed
  const materialMap = useMemo(() => {
    const map = new Map<string, Material>();
    (materials || []).forEach((m) => {
      if (m && m.id) map.set(m.id, m);
      if (m && m.name) map.set(m.name.toLowerCase().trim(), m);
    });
    return map;
  }, [materials]);

  // Consumption logs grouped by workOrderId
  const logsByOrderId = useMemo(() => {
    const map = new Map<string, ConsumptionLog[]>();
    (consumptionLogs || []).forEach((log) => {
      if (!log || !log.workOrderId) return;
      const list = map.get(log.workOrderId) || [];
      list.push(log);
      map.set(log.workOrderId, list);
    });
    return map;
  }, [consumptionLogs]);

  // Calculation helper for a specific work order
  const calculateOrderCosts = (order: WorkOrder) => {
    const logs = logsByOrderId.get(order.id) || [];
    
    // 1. Material Costs
    let materialCost = 0;
    const materialItems: Array<{
      materialName: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      materialId?: string;
      hasPrice: boolean;
    }> = [];

    if (logs.length > 0) {
      // Group by materialId or name to avoid duplicate rows
      const matSummary = new Map<string, { materialName: string; unit: string; quantity: number; materialId?: string }>();
      logs.forEach((log) => {
        const key = log.materialId || log.materialName.toLowerCase().trim();
        const existing = matSummary.get(key);
        if (existing) {
          existing.quantity += Number(log.quantity || 0);
        } else {
          matSummary.set(key, {
            materialName: log.materialName,
            unit: log.unit,
            quantity: Number(log.quantity || 0),
            materialId: log.materialId,
          });
        }
      });

      matSummary.forEach((item) => {
        const matchedMat = item.materialId ? materialMap.get(item.materialId) : materialMap.get(item.materialName.toLowerCase().trim());
        const unitPrice = Number(matchedMat?.unitPrice || 0);
        const totalPrice = Number((item.quantity * unitPrice).toFixed(2));
        materialCost += totalPrice;

        materialItems.push({
          materialName: item.materialName,
          unit: item.unit,
          quantity: Number(item.quantity.toFixed(3)),
          unitPrice,
          totalPrice,
          materialId: matchedMat?.id || item.materialId,
          hasPrice: unitPrice > 0,
        });
      });
    } else if (Array.isArray(order.plannedMaterials) && order.plannedMaterials.length > 0) {
      // Fallback: If no consumption logged yet, calculate based on planned materials
      order.plannedMaterials.forEach((pm) => {
        if (!pm.materialName) return;
        const matchedMat = pm.materialId ? materialMap.get(pm.materialId) : materialMap.get(pm.materialName.toLowerCase().trim());
        const unitPrice = Number(matchedMat?.unitPrice || 0);
        const qty = Number(pm.quantity || 0);
        const totalPrice = Number((qty * unitPrice).toFixed(2));
        materialCost += totalPrice;

        materialItems.push({
          materialName: pm.materialName,
          unit: pm.unit,
          quantity: qty,
          unitPrice,
          totalPrice,
          materialId: matchedMat?.id || pm.materialId,
          hasPrice: unitPrice > 0,
        });
      });
    }

    // 2. Labor Time & Costs
    let totalMinutes = 0;
    const workerHoursMap = new Map<string, { workerName: string; minutes: number }>();

    logs.forEach((log) => {
      const minutes = Number(log.hoursSpent || 0) * 60 + Number(log.minutesSpent || 0);
      totalMinutes += minutes;

      const wKey = log.workerUsername || log.workerName;
      const existing = workerHoursMap.get(wKey);
      if (existing) {
        existing.minutes += minutes;
      } else {
        workerHoursMap.set(wKey, {
          workerName: log.workerName || log.workerUsername,
          minutes,
        });
      }
    });

    const totalHoursSpent = Number((totalMinutes / 60).toFixed(2));

    // Labor rate determination:
    // If admin set customLaborCost directly -> use customLaborCost
    // Otherwise -> totalHoursSpent * laborRatePerHour (default or configured)
    const effectiveHourlyRate = order.laborRatePerHour !== undefined ? order.laborRatePerHour : 15; // default 15 KM/h if unconfigured
    const isCustomCostSet = order.customLaborCost !== undefined && order.customLaborCost !== null && order.customLaborCost > 0;
    
    let laborCost = 0;
    if (isCustomCostSet) {
      laborCost = Number(order.customLaborCost);
    } else {
      laborCost = Number((totalHoursSpent * effectiveHourlyRate).toFixed(2));
    }

    // 3. Other Costs (prevoz, montaža, kooperanti)
    const otherCosts = Number(order.otherCosts || 0);

    // 4. Grand Total Cost
    const totalOrderCost = Number((materialCost + laborCost + otherCosts).toFixed(2));

    return {
      materialCost: Number(materialCost.toFixed(2)),
      materialItems,
      totalMinutes,
      totalHoursSpent,
      effectiveHourlyRate,
      isCustomCostSet,
      laborCost: Number(laborCost.toFixed(2)),
      workerBreakdown: Array.from(workerHoursMap.values()).map(w => ({
        workerName: w.workerName,
        hours: Math.floor(w.minutes / 60),
        minutes: w.minutes % 60,
        decimalHours: Number((w.minutes / 60).toFixed(2)),
      })),
      otherCosts,
      totalOrderCost,
    };
  };

  // Pre-calculate all order costs for sorting and aggregation
  const calculatedOrders = useMemo(() => {
    return (workOrders || []).map((order) => {
      const costs = calculateOrderCosts(order);
      return {
        order,
        ...costs,
      };
    });
  }, [workOrders, materialMap, logsByOrderId]);

  // Overall KPI aggregates
  const aggregates = useMemo(() => {
    let totalAllOrdersCost = 0;
    let totalAllMaterialsCost = 0;
    let totalAllLaborCost = 0;
    let totalAllHours = 0;

    calculatedOrders.forEach((item) => {
      totalAllOrdersCost += item.totalOrderCost;
      totalAllMaterialsCost += item.materialCost;
      totalAllLaborCost += item.laborCost;
      totalAllHours += item.totalHoursSpent;
    });

    const averageCostPerOrder = calculatedOrders.length > 0
      ? Number((totalAllOrdersCost / calculatedOrders.length).toFixed(2))
      : 0;

    return {
      totalAllOrdersCost: Number(totalAllOrdersCost.toFixed(2)),
      totalAllMaterialsCost: Number(totalAllMaterialsCost.toFixed(2)),
      totalAllLaborCost: Number(totalAllLaborCost.toFixed(2)),
      totalAllHours: Number(totalAllHours.toFixed(1)),
      averageCostPerOrder,
    };
  }, [calculatedOrders]);

  // Filter and sort orders
  const filteredAndSortedOrders = useMemo(() => {
    return calculatedOrders.filter((item) => {
      const o = item.order;
      const num = (o.orderNumber || '').toLowerCase();
      const title = (o.title || '').toLowerCase();
      const cust = (o.customer || '').toLowerCase();
      const desc = (o.description || '').toLowerCase();
      const workers = (o.assignedWorkers || []).join(' ').toLowerCase();

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || num.includes(term) || title.includes(term) || cust.includes(term) || desc.includes(term) || workers.includes(term);

      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'highest_cost') {
        return b.totalOrderCost - a.totalOrderCost;
      }
      if (sortBy === 'lowest_cost') {
        return a.totalOrderCost - b.totalOrderCost;
      }
      if (sortBy === 'order_number') {
        return (b.order.orderNumber || '').localeCompare(a.order.orderNumber || '');
      }
      // default: newest first
      return new Date(b.order.createdAt || '').getTime() - new Date(a.order.createdAt || '').getTime();
    });
  }, [calculatedOrders, searchTerm, statusFilter, sortBy]);

  // Toggle card expansion
  const toggleExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Get or initialize edit state for an order
  const getEditState = (order: WorkOrder, currentCalculated: ReturnType<typeof calculateOrderCosts>) => {
    if (editingLaborCost[order.id]) {
      return editingLaborCost[order.id];
    }
    return {
      laborRatePerHour: (order.laborRatePerHour !== undefined ? order.laborRatePerHour : currentCalculated.effectiveHourlyRate).toString(),
      customLaborCost: order.customLaborCost !== undefined ? order.customLaborCost.toString() : '',
      otherCosts: (order.otherCosts || 0).toString(),
      costNotes: order.costNotes || '',
      isCustomMode: Boolean(order.customLaborCost && order.customLaborCost > 0),
    };
  };

  const handleEditFieldChange = (orderId: string, field: 'laborRatePerHour' | 'customLaborCost' | 'otherCosts' | 'costNotes' | 'isCustomMode', value: any) => {
    setEditingLaborCost((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {
          laborRatePerHour: '15',
          customLaborCost: '',
          otherCosts: '0',
          costNotes: '',
          isCustomMode: false,
        }),
        [field]: value,
      },
    }));
  };

  // Save manual worker labor rate / price for an order
  const handleSaveOrderLaborCost = (order: WorkOrder) => {
    const editState = editingLaborCost[order.id];
    if (!editState) return;

    const updates: Partial<WorkOrder> = {};

    if (editState.isCustomMode) {
      const customAmount = parseFloat(editState.customLaborCost);
      updates.customLaborCost = isNaN(customAmount) ? 0 : Math.max(0, customAmount);
    } else {
      const rate = parseFloat(editState.laborRatePerHour);
      updates.laborRatePerHour = isNaN(rate) ? 15 : Math.max(0, rate);
      updates.customLaborCost = 0; // clear custom override so it calculates hourly
    }

    const other = parseFloat(editState.otherCosts);
    updates.otherCosts = isNaN(other) ? 0 : Math.max(0, other);
    updates.costNotes = editState.costNotes.trim();

    updateWorkOrder(order.id, updates);

    setSavedOrderFeedback(order.id);
    setTimeout(() => {
      setSavedOrderFeedback(null);
    }, 2500);
  };

  // Quick edit material price handler
  const handleSaveMaterialPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForPriceEdit) return;

    const price = parseFloat(newMaterialPrice);
    if (isNaN(price) || price < 0) return;

    updateMaterial(materialForPriceEdit.id, {
      unitPrice: price,
    });

    setMaterialForPriceEdit(null);
    setNewMaterialPrice('');
  };

  // Export complete CSV report of all manufacturing costs
  const handleExportCostsCSV = () => {
    const headers = [
      'Broj radnog naloga',
      'Naručilac (Kupac)',
      'Naziv posla',
      'Status naloga',
      'Radni sati (h)',
      'Cijena radnika / satnica (KM/h)',
      'Ukupni trošak rada (KM)',
      'Ukupni trošak materijala (KM)',
      'Ostali troškovi (KM)',
      'UKUPAN TROŠAK IZRADE (KM)',
      'Datum kreiranja',
      'Napomena o troškovima'
    ];

    const escapeCSV = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredAndSortedOrders.map((item) => {
      const o = item.order;
      let statusLabel = 'Na čekanju';
      if (o.status === 'zavrseno') statusLabel = 'Završeno';
      else if (o.status === 'u_izradi') statusLabel = 'U izradi';
      else if (o.status === 'priprema') statusLabel = 'U pripremi';
      else if (o.status === 'otkazano') statusLabel = 'Otkazano';

      const laborRateDisplay = item.isCustomCostSet
        ? `Fiksno (${item.laborCost.toFixed(2)} KM)`
        : `${item.effectiveHourlyRate.toFixed(2)} KM/h`;

      return [
        escapeCSV(o.orderNumber || ''),
        escapeCSV(o.customer || ''),
        escapeCSV(o.title || ''),
        escapeCSV(statusLabel),
        item.totalHoursSpent,
        escapeCSV(laborRateDisplay),
        item.laborCost.toFixed(2),
        item.materialCost.toFixed(2),
        item.otherCosts.toFixed(2),
        item.totalOrderCost.toFixed(2),
        escapeCSV(o.createdAt || ''),
        escapeCSV(o.costNotes || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `troskovi-izrade-radni-nalozi-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Troškovi Izrade Radnih Naloga</span>
            </h1>
            <span className="text-[11px] font-mono font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
              Finansijski obračun
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Kompletan finansijski utrošak za svaki radni nalog: utrošak materijala, ručni unos i obračun cijene rada radnika, te ukupan trošak izrade.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCostsCSV}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
            title="Preuzmi kompletnu tabelu troškova u CSV formatu"
          >
            <Download className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Preuzmi Troškovnik (CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Total Overall Costs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium">Ukupan trošak (svi nalozi)</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
              {aggregates.totalAllOrdersCost.toLocaleString('sr-Latn-BA', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">KM</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Materijali + rad radnika
          </span>
        </div>

        {/* Total Material Costs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium">Ukupan utrošak materijala</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
              {aggregates.totalAllMaterialsCost.toLocaleString('sr-Latn-BA', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">KM</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Po zadanim cijenama iz baze
          </span>
        </div>

        {/* Total Labor Costs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium">Ukupna cijena rada radnika</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-blue-700 font-mono tabular-nums">
              {aggregates.totalAllLaborCost.toLocaleString('sr-Latn-BA', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">KM</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Ukupno: <strong>{aggregates.totalAllHours} h</strong> rada
          </span>
        </div>

        {/* Average Cost Per Order */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium">Prosjek po radnom nalogu</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-purple-800 font-mono tabular-nums">
              {aggregates.averageCostPerOrder.toLocaleString('sr-Latn-BA', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">KM</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            Ukupno naloga: {calculatedOrders.length}
          </span>
        </div>

      </div>

      {/* Info notice about worker rate manual entry */}
      <div className="p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-950 flex items-start gap-3">
        <Coins className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold">Ručni unos cijene radnika i satnice:</strong> Za svaki radni nalog možete unijeti satnicu radnika (KM/h) ili unijeti fiksnu ukupnu cijenu rada. Promjene se čuvaju trajno u bazi podataka i automatski ažuriraju kalkulaciju.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pretraga po broju naloga (RN-...), naručiocu, nazivu posla ili radniku..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Status & Sort Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
          >
            <option value="all">Svi statusi</option>
            <option value="zavrseno">Završeni nalozi</option>
            <option value="u_izradi">U izradi</option>
            <option value="na_cekanju">Na čekanju</option>
            <option value="priprema">U pripremi</option>
          </select>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
          >
            <option value="newest">Najnoviji nalozi</option>
            <option value="highest_cost">Najveći trošak (KM)</option>
            <option value="lowest_cost">Najmanji trošak (KM)</option>
            <option value="order_number">Broj naloga</option>
          </select>

          <span className="text-xs text-slate-600 px-2 py-1 font-mono tabular-nums bg-slate-100 rounded">
            Prikazano: {filteredAndSortedOrders.length}
          </span>
        </div>

      </div>

      {/* Work Orders Cost Cards / Table */}
      <div className="space-y-4">
        {filteredAndSortedOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            <Calculator className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-sm text-slate-700">Nema pronađenih radnih naloga</p>
            <p className="text-xs text-slate-400 mt-1">
              Pokušajte sa izmjenom kriterijuma pretrage ili filtera statusa.
            </p>
          </div>
        ) : (
          filteredAndSortedOrders.map((item) => {
            const { order } = item;
            const isExpanded = expandedOrderIds.has(order.id);
            const editState = getEditState(order, item);
            const isSavedRecently = savedOrderFeedback === order.id;

            let statusBadge = (
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Na čekanju
              </span>
            );
            if (order.status === 'zavrseno') {
              statusBadge = (
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                  Završeno
                </span>
              );
            } else if (order.status === 'u_izradi') {
              statusBadge = (
                <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                  U izradi
                </span>
              );
            } else if (order.status === 'priprema') {
              statusBadge = (
                <span className="text-[11px] font-semibold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300">
                  U pripremi
                </span>
              );
            }

            return (
              <div 
                key={order.id} 
                className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all overflow-hidden"
              >
                
                {/* Order Summary Header Row */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Left: Order Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderNumberWithHover order={order} />
                      {statusBadge}
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-sans">
                        Rok: <strong className="text-slate-700">{order.dueDate || 'Nije postavljen'}</strong>
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                        {order.title}
                      </h3>
                      <span className="text-xs text-slate-500 font-medium">
                        Naručilac: <strong className="text-slate-800">{order.customer || 'Nije navedeno'}</strong>
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span>
                        Radnici: <strong className="text-slate-700">{(order.assignedWorkers || []).join(', ') || 'Nema dodijeljenih'}</strong>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {item.totalHoursSpent} h rada
                      </span>
                    </div>
                  </div>

                  {/* Middle & Right: Cost Summary Badges */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-3 sm:gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    
                    {/* Material cost snippet */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                        Utrošak materijala
                      </span>
                      <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                        {item.materialCost.toFixed(2)} KM
                      </span>
                    </div>

                    {/* Labor cost snippet */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                        Cijena rada
                      </span>
                      <span className="text-sm font-bold text-blue-700 font-mono tabular-nums">
                        {item.laborCost.toFixed(2)} KM
                      </span>
                    </div>

                    {/* Grand Total Cost Highlight */}
                    <div className="bg-amber-50/90 border border-amber-300/80 rounded-xl px-3.5 py-2 text-right shrink-0">
                      <span className="text-[10px] uppercase font-extrabold text-amber-900 tracking-wider block">
                        Ukupan trošak RN
                      </span>
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-lg sm:text-xl font-black text-amber-950 font-mono tabular-nums">
                          {item.totalOrderCost.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold text-amber-800">KM</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setOrderForPrint(order)}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Pregledaj i odštampaj specifikaciju troškova"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(order.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                      >
                        <span>{isExpanded ? 'Zatvori' : 'Detalji & Uređivanje'}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                  </div>

                </div>

                {/* Expanded Detailed Breakdown & Price Controls */}
                {isExpanded && (
                  <div className="px-4 pb-5 pt-3 sm:px-6 bg-slate-50/70 border-t border-slate-200 space-y-5 animate-in fade-in duration-150">
                    
                    {/* Grid: Left = Material breakdown, Right = Labor cost manual input */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      
                      {/* Left: Material Expenditure Breakdown */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                            <Package className="w-4 h-4 text-emerald-600" />
                            <span>1. Utrošeni materijali za ovaj RN</span>
                          </h4>
                          <span className="text-xs font-bold font-mono text-emerald-700">
                            Zbir: {item.materialCost.toFixed(2)} KM
                          </span>
                        </div>

                        {item.materialItems.length === 0 ? (
                          <div className="py-6 text-center text-slate-400 text-xs">
                            <Boxes className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                            <span>Za ovaj radni nalog još nema unesenog utroška materijala.</span>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 text-xs">
                            {item.materialItems.map((matItem, idx) => (
                              <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {matItem.materialName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                    Količina: <strong className="text-slate-800">{matItem.quantity} {matItem.unit}</strong>
                                    {matItem.hasPrice ? (
                                      <span> × {matItem.unitPrice.toFixed(2)} KM/{matItem.unit}</span>
                                    ) : (
                                      <span className="text-amber-700 ml-1.5">
                                        (Cijena po JM nije postavljena)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {matItem.hasPrice ? (
                                    <span className="font-mono font-bold text-slate-900 text-xs tabular-nums">
                                      {matItem.totalPrice.toFixed(2)} KM
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const foundMat = matItem.materialId ? materialMap.get(matItem.materialId) : materialMap.get(matItem.materialName.toLowerCase().trim());
                                        if (foundMat) {
                                          setMaterialForPriceEdit(foundMat);
                                          setNewMaterialPrice((foundMat.unitPrice || 0).toString());
                                        }
                                      }}
                                      className="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-1 rounded transition cursor-pointer"
                                    >
                                      + Postavi cijenu
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Worker Labor Rate & Manual Cost Form */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                            <HardHat className="w-4 h-4 text-blue-600" />
                            <span>2. Cijena rada radnika (Ručni unos)</span>
                          </h4>
                          <span className="text-xs font-bold font-mono text-blue-700">
                            Obračunato: {item.laborCost.toFixed(2)} KM
                          </span>
                        </div>

                        {/* Hours spent overview */}
                        <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="text-slate-700">Ukupno zabilježenih sati na poslu:</span>
                          </div>
                          <span className="font-mono font-bold text-blue-900 text-sm">
                            {item.totalHoursSpent} h
                          </span>
                        </div>

                        {/* Workers time breakdown if multiple */}
                        {item.workerBreakdown.length > 0 && (
                          <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="font-semibold text-slate-700 block">Radno vrijeme po radnicima:</span>
                            {item.workerBreakdown.map((wb, i) => (
                              <div key={i} className="flex justify-between font-mono">
                                <span>{wb.workerName}:</span>
                                <span>{wb.hours}h {wb.minutes}m ({wb.decimalHours} h)</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mode Switch: Hourly Rate vs Direct Custom Cost */}
                        <div className="pt-1">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-800">
                              Režim obračuna cijene radnika:
                            </label>
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md text-[11px]">
                              <button
                                type="button"
                                onClick={() => handleEditFieldChange(order.id, 'isCustomMode', false)}
                                className={`px-2 py-0.5 rounded cursor-pointer transition ${!editState.isCustomMode ? 'bg-white font-bold shadow-2xs text-blue-900' : 'text-slate-600'}`}
                              >
                                Po satnici (KM/h)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditFieldChange(order.id, 'isCustomMode', true)}
                                className={`px-2 py-0.5 rounded cursor-pointer transition ${editState.isCustomMode ? 'bg-white font-bold shadow-2xs text-blue-900' : 'text-slate-600'}`}
                              >
                                Fiksan ručni iznos (KM)
                              </button>
                            </div>
                          </div>

                          {!editState.isCustomMode ? (
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">
                                Satnica radnika za ovaj nalog (KM/h):
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editState.laborRatePerHour}
                                  onChange={(e) => handleEditFieldChange(order.id, 'laborRatePerHour', e.target.value)}
                                  placeholder="15.00"
                                  className="w-full pl-3 pr-14 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                                  KM/h
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                Kalkulacija: {item.totalHoursSpent} h × {parseFloat(editState.laborRatePerHour || '0')} KM/h = <strong>{(item.totalHoursSpent * parseFloat(editState.laborRatePerHour || '0')).toFixed(2)} KM</strong>
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-slate-600">
                                Direktan ručni unos ukupne cijene rada radnika (KM):
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={editState.customLaborCost}
                                  onChange={(e) => handleEditFieldChange(order.id, 'customLaborCost', e.target.value)}
                                  placeholder="npr. 150.00"
                                  className="w-full pl-3 pr-12 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-700 font-mono">
                                  KM
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                Fiksni iznos koji ste odredili za rad radnika na ovom radnom nalogu.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Optional Other Costs & Notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600 mb-0.5 block">
                              Ostali troškovi (prevoz, okov...):
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={editState.otherCosts}
                                onChange={(e) => handleEditFieldChange(order.id, 'otherCosts', e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-3 pr-10 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                                KM
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-semibold text-slate-600 mb-0.5 block">
                              Napomena o troškovniku:
                            </label>
                            <input
                              type="text"
                              value={editState.costNotes}
                              onChange={(e) => handleEditFieldChange(order.id, 'costNotes', e.target.value)}
                              placeholder="Opciona napomena..."
                              className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        {/* Save Action for this order */}
                        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                          {isSavedRecently ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 animate-in fade-in">
                              <Check className="w-4 h-4 text-emerald-600" />
                              Cijena rada uspešno sačuvana!
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Kliknite na Sačuvaj za trajno ažuriranje baze.
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSaveOrderLaborCost(order)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Sačuvaj cijenu rada</span>
                          </button>
                        </div>

                      </div>

                    </div>

                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* Quick Material Price Edit Modal */}
      {materialForPriceEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs" onClick={() => setMaterialForPriceEdit(null)}>
          <div className="bg-white rounded-xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Postavi cijenu za materijal
                </h3>
              </div>
              <button 
                onClick={() => setMaterialForPriceEdit(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterialPrice} className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 block">Materijal:</span>
                <span className="font-bold text-slate-900 text-sm block">
                  {materialForPriceEdit.name} ({materialForPriceEdit.code})
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Jedinica mjere: <strong className="text-slate-700 font-mono">{materialForPriceEdit.unit}</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cijena po jedinici mjere (KM / {materialForPriceEdit.unit}) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newMaterialPrice}
                    onChange={(e) => setNewMaterialPrice(e.target.value)}
                    placeholder="0.00"
                    required
                    autoFocus
                    className="w-full pl-3 pr-16 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 font-mono">
                    KM/{materialForPriceEdit.unit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ova cijena će se automatski primijeniti na sve radne naloge u kojima se koristi ovaj materijal.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMaterialForPriceEdit(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs"
                >
                  Sačuvaj cijenu materijala
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Calculation Sheet Modal */}
      {orderForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs" onClick={() => setOrderForPrint(null)}>
          <div 
            className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  Specifikacija troškova izrade — {orderForPrint.orderNumber}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Štampaj</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderForPrint(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-800 font-sans print:p-0">
              
              {/* Order Info Header */}
              <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{orderForPrint.orderNumber}</h2>
                  <p className="text-sm font-bold text-slate-700 mt-0.5">{orderForPrint.title}</p>
                  <p className="text-xs text-slate-500 mt-1">Naručilac: <strong>{orderForPrint.customer}</strong></p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-0.5">
                  <p>Datum kreiranja: <strong className="text-slate-800">{orderForPrint.createdAt}</strong></p>
                  <p>Rok završetka: <strong className="text-slate-800">{orderForPrint.dueDate || '-'}</strong></p>
                  <p>Status: <strong className="text-slate-800 uppercase">{orderForPrint.status}</strong></p>
                </div>
              </div>

              {/* Calculations */}
              {(() => {
                const costs = calculateOrderCosts(orderForPrint);
                return (
                  <div className="space-y-6">
                    
                    {/* Material Table */}
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>1. Utrošeni materijali</span>
                        <span className="font-mono text-emerald-700 font-bold">{costs.materialCost.toFixed(2)} KM</span>
                      </h4>
                      <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-xs">
                        <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                          <tr>
                            <th className="py-2 px-3">Materijal</th>
                            <th className="py-2 px-3 text-right">Količina</th>
                            <th className="py-2 px-3 text-right">Cijena po JM</th>
                            <th className="py-2 px-3 text-right">Iznos (KM)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {costs.materialItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-3 px-3 text-center text-slate-400">
                                Nema zabilježenog utroška materijala
                              </td>
                            </tr>
                          ) : (
                            costs.materialItems.map((item, i) => (
                              <tr key={i}>
                                <td className="py-2 px-3 font-medium text-slate-900">{item.materialName}</td>
                                <td className="py-2 px-3 text-right font-mono">{item.quantity} {item.unit}</td>
                                <td className="py-2 px-3 text-right font-mono">{item.unitPrice.toFixed(2)} KM</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{item.totalPrice.toFixed(2)} KM</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Labor Table */}
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>2. Rad radnika (Radna snaga)</span>
                        <span className="font-mono text-blue-700 font-bold">{costs.laborCost.toFixed(2)} KM</span>
                      </h4>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Ukupno utrošeno radno vrijeme:</span>
                          <span className="font-mono font-bold text-slate-900">{costs.totalHoursSpent} h ({costs.totalMinutes} min)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Obračunski parametar cijene rada:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {costs.isCustomCostSet 
                              ? `Ručno zadat fiksni iznos: ${costs.laborCost.toFixed(2)} KM` 
                              : `Satnica: ${costs.effectiveHourlyRate.toFixed(2)} KM/h`}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200">
                          <span className="font-bold text-slate-800">Ukupno za rad:</span>
                          <span className="font-mono font-black text-blue-900">{costs.laborCost.toFixed(2)} KM</span>
                        </div>
                      </div>
                    </div>

                    {/* Other Costs */}
                    {costs.otherCosts > 0 && (
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>3. Ostali troškovi (montaža, prevoz...)</span>
                          <span className="font-mono text-slate-800 font-bold">{costs.otherCosts.toFixed(2)} KM</span>
                        </h4>
                      </div>
                    )}

                    {/* Grand Total Calculation Banner */}
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs uppercase font-extrabold text-amber-900 tracking-wider block">
                          UKUPAN TROŠAK IZRADE RADNOG NALOGA
                        </span>
                        <span className="text-[11px] text-amber-800">
                          Materijal ({costs.materialCost.toFixed(2)} KM) + Rad ({costs.laborCost.toFixed(2)} KM) {costs.otherCosts > 0 ? `+ Ostalo (${costs.otherCosts.toFixed(2)} KM)` : ''}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-amber-950 font-mono">
                          {costs.totalOrderCost.toFixed(2)} KM
                        </span>
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
                      <div className="border-t border-slate-300 pt-2">
                        Kalkulaciju izradio: <strong>{users.find(u => u.role === 'admin')?.fullName || 'Administrator'}</strong>
                      </div>
                      <div className="border-t border-slate-300 pt-2">
                        Potpis odgovornog lica / Datum
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
