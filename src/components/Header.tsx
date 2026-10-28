import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ClipboardList, 
  Package, 
  BarChart3, 
  LogOut, 
  Wrench, 
  Shield, 
  HardHat, 
  Users, 
  LayoutList, 
  FileSpreadsheet, 
  Plus, 
  Compass,
  Coins 
} from 'lucide-react';
import { GoogleSheetsSyncModal } from './common/GoogleSheetsSyncModal';
import { NotificationCenter } from './common/NotificationCenter';
import { StoppageModal } from './common/StoppageModal';
import { WorkOrder } from '../types';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab }) => {
  const { 
    currentUser, 
    logout, 
    hasNewOrderNotification, 
    clearNewOrderNotification, 
    openCreateWorkOrderModal, 
    isSyncedWithServer, 
    workOrders, 
    materials 
  } = useApp();

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [orderForStoppage, setOrderForStoppage] = useState<WorkOrder | null>(null);

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin';
  const canCreateOrders = isAdmin || Boolean(currentUser.permissions?.canCreateOrders);
  const canManageMaterials = isAdmin || Boolean(currentUser.permissions?.canManageMaterials);
  const canPrepareModels = isAdmin || Boolean(currentUser.permissions?.canPrepareModels);
  const canViewReports = isAdmin || Boolean(currentUser.permissions?.canViewReports);

  const preparationOrdersCount = (workOrders || []).filter((o) => o?.status === 'priprema').length;
  const lowStockMaterialsCount = (materials || []).filter((m) => (m?.currentStock ?? 0) <= (m?.minStock ?? 0)).length;

  const handleOrdersTabClick = (tab: string) => {
    setCurrentTab(tab);
    clearNewOrderNotification();
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-sm w-full max-w-full overflow-x-clip overflow-y-visible">
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-3 lg:px-4">
        <div className="flex items-center justify-between h-13 sm:h-14 gap-1.5 sm:gap-2.5 min-w-0">
          
          {/* Zone 1: Logo Brand (Compact) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="leading-tight">
              <span className="text-xs sm:text-sm font-bold tracking-tight text-white block whitespace-nowrap">
                Radni Nalozi
              </span>
              <span className="hidden sm:block text-[9px] text-slate-400 font-mono leading-none">
                {isAdmin ? 'Admin Portal' : 'Radnički Pult'}
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links (Desktop) - Compact & Space-Efficient */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 min-w-0">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOrdersTabClick('orders')}
                  className={`relative flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'orders'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Nalozi</span>
                  {hasNewOrderNotification && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('models')}
                  className={`relative flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'models'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Priprema</span>
                  {preparationOrdersCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 text-[9px] font-bold bg-indigo-600 text-white rounded-full">
                      {preparationOrdersCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('materials')}
                  className={`relative flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'materials'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Materijali</span>
                  {lowStockMaterialsCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 text-[9px] font-bold bg-red-600 text-white rounded-full animate-pulse">
                      {lowStockMaterialsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('costs')}
                  className={`flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'costs'
                      ? 'bg-slate-800 text-white shadow-inner font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Troškovi</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('workers')}
                  className={`flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'workers'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Radnici</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('reports')}
                  className={`flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'reports'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Izvještaji</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleOrdersTabClick('my-orders')}
                  className={`relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'my-orders'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Moji nalozi</span>
                  {hasNewOrderNotification && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOrdersTabClick('all-orders')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                    currentTab === 'all-orders'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Svi nalozi</span>
                </button>

                {/* Additional tabs if worker has specific permissions */}
                {canPrepareModels && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('models')}
                    className={`relative flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                      currentTab === 'models'
                        ? 'bg-slate-800 text-white shadow-inner'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Priprema</span>
                    {preparationOrdersCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 text-[9px] font-bold bg-indigo-600 text-white rounded-full">
                        {preparationOrdersCount}
                      </span>
                    )}
                  </button>
                )}

                {canManageMaterials && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('materials')}
                    className={`relative flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                      currentTab === 'materials'
                        ? 'bg-slate-800 text-white shadow-inner'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Materijali</span>
                    {lowStockMaterialsCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 text-[9px] font-bold bg-red-600 text-white rounded-full animate-pulse">
                        {lowStockMaterialsCount}
                      </span>
                    )}
                  </button>
                )}

                {canViewReports && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('reports')}
                    className={`flex items-center gap-1 px-2 lg:px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                      currentTab === 'reports'
                        ? 'bg-slate-800 text-white shadow-inner'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Izvještaji</span>
                  </button>
                )}
              </>
            )}
          </nav>

          {/* Zone 3: Actions (Novi nalog, Google Sheets) + Admin Info + Zvonce Obavještenja + Odjavi se */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Live sync indicator (Compact) */}
            <div 
              className="hidden 2xl:flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 rounded border border-slate-700/60 text-[10px] text-slate-300 font-mono shrink-0"
              title={isSyncedWithServer ? 'Telefon i računar su povezani na istu bazu uživo' : 'Offline režim rada'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSyncedWithServer ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isSyncedWithServer ? 'Uživo' : 'Lokalno'}</span>
            </div>

            {/* + Novi Nalog dugme - Admin OR authorized worker */}
            {canCreateOrders && (
              <button
                type="button"
                onClick={() => openCreateWorkOrderModal()}
                title="Izdaj novi radni nalog"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-md shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>+ Novi nalog</span>
              </button>
            )}

            {/* Google Sheets Trigger - Admin only (Vidljivo i na mobilnom u zaglavlju bez gužvanja navigacionih tabova) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsSheetsModalOpen(true)}
                title="Google Sheets Sinhronizacija & Izvoz"
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-600/50 rounded-md shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Sheets</span>
              </button>
            )}

            {/* Informacije o korisniku / Administratorsko ime (Admin) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/90 rounded-md border border-slate-700/70 text-xs shrink-0 max-w-[130px] md:max-w-[160px]">
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              ) : (
                <HardHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-white truncate text-[11px] leading-tight" title={currentUser.fullName}>
                  {currentUser.fullName}
                </span>
                <span className="text-[9px] text-blue-300 font-semibold leading-none">
                  {isAdmin ? 'Admin' : 'Radnik'}
                </span>
              </div>
            </div>

            {/* TAČNA POZICIJA DUGMETA: Zvonce sa obavještenjima - Tačno između Admina i dugmeta "Odjavi se" */}
            <NotificationCenter 
              onNavigateTab={(tab) => setCurrentTab(tab)}
              onOpenStoppageModal={(order) => setOrderForStoppage(order)}
            />

            {/* DIRECT LOGOUT BUTTON - Always prominently visible and safely inside the screen bounds */}
            <button
              type="button"
              onClick={logout}
              title="Odjavi se sa sistema"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1 text-xs font-bold text-white bg-rose-700 hover:bg-rose-600 active:bg-rose-800 rounded-md shadow-xs border border-rose-500/60 transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Odjavi se</span>
            </button>
          </div>

        </div>

        {/* Mobile Navigation bar - 100% full width, strictly zero horizontal scrolling */}
        <div className="md:hidden w-full border-t border-slate-800 bg-slate-900/95 px-1 py-1 select-none overflow-x-hidden">
          {isAdmin ? (
            <nav className="grid grid-cols-5 gap-1 w-full" aria-label="Mobilna navigacija">
              {/* Nalozi */}
              <button
                type="button"
                onClick={() => handleOrdersTabClick('orders')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'orders'
                    ? 'bg-slate-800 text-blue-400 font-bold border-b-2 border-blue-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  {hasNewOrderNotification && (
                    <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping ring-1 ring-slate-900" />
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Nalozi
                </span>
              </button>

              {/* Priprema */}
              <button
                type="button"
                onClick={() => setCurrentTab('models')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'models'
                    ? 'bg-slate-800 text-indigo-400 font-bold border-b-2 border-indigo-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Compass className="w-4 h-4 shrink-0" />
                  {preparationOrdersCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-3.5 px-1 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center ring-1 ring-slate-900 leading-none">
                      {preparationOrdersCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Priprema
                </span>
              </button>

              {/* Materijali */}
              <button
                type="button"
                onClick={() => setCurrentTab('materials')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'materials'
                    ? 'bg-slate-800 text-emerald-400 font-bold border-b-2 border-emerald-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Package className="w-4 h-4 shrink-0" />
                  {lowStockMaterialsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-3.5 px-1 text-[9px] font-bold bg-red-600 text-white rounded-full flex items-center justify-center ring-1 ring-slate-900 leading-none animate-pulse">
                      {lowStockMaterialsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Materijali
                </span>
              </button>

              {/* Troškovi */}
              <button
                type="button"
                onClick={() => setCurrentTab('costs')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'costs'
                    ? 'bg-slate-800 text-amber-400 font-bold border-b-2 border-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Coins className="w-4 h-4 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Troškovi
                </span>
              </button>

              {/* Radnici */}
              <button
                type="button"
                onClick={() => setCurrentTab('workers')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'workers'
                    ? 'bg-slate-800 text-indigo-400 font-bold border-b-2 border-indigo-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Radnici
                </span>
              </button>

              {/* Izvještaji */}
              <button
                type="button"
                onClick={() => setCurrentTab('reports')}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'reports'
                    ? 'bg-slate-800 text-amber-400 font-bold border-b-2 border-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Izvještaji
                </span>
              </button>
            </nav>
          ) : (
            <nav className="flex items-center justify-around gap-1 w-full" aria-label="Radnička mobilna navigacija">
              {/* Moji nalozi */}
              <button
                type="button"
                onClick={() => handleOrdersTabClick('my-orders')}
                className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'my-orders'
                    ? 'bg-slate-800 text-blue-400 font-bold border-b-2 border-blue-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  {hasNewOrderNotification && (
                    <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping ring-1 ring-slate-900" />
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Moji nalozi
                </span>
              </button>

              {/* Svi nalozi */}
              <button
                type="button"
                onClick={() => handleOrdersTabClick('all-orders')}
                className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors cursor-pointer min-w-0 ${
                  currentTab === 'all-orders'
                    ? 'bg-slate-800 text-purple-400 font-bold border-b-2 border-purple-400 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <LayoutList className="w-4 h-4 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                  Svi nalozi
                </span>
              </button>

              {/* Priprema (ako ima ovlaštenje) */}
              {canPrepareModels && (
                <button
                  type="button"
                  onClick={() => setCurrentTab('models')}
                  className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors cursor-pointer min-w-0 ${
                    currentTab === 'models'
                      ? 'bg-slate-800 text-indigo-400 font-bold border-b-2 border-indigo-400 shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Compass className="w-4 h-4 shrink-0" />
                    {preparationOrdersCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-3.5 px-1 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center ring-1 ring-slate-900 leading-none">
                        {preparationOrdersCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                    Priprema
                  </span>
                </button>
              )}

              {/* Materijali (ako ima ovlaštenje) */}
              {canManageMaterials && (
                <button
                  type="button"
                  onClick={() => setCurrentTab('materials')}
                  className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors cursor-pointer min-w-0 ${
                    currentTab === 'materials'
                      ? 'bg-slate-800 text-emerald-400 font-bold border-b-2 border-emerald-400 shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Package className="w-4 h-4 shrink-0" />
                    {lowStockMaterialsCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-3.5 px-1 text-[9px] font-bold bg-red-600 text-white rounded-full flex items-center justify-center ring-1 ring-slate-900 leading-none animate-pulse">
                        {lowStockMaterialsCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                    Materijali
                  </span>
                </button>
              )}

              {/* Izvještaji (ako ima ovlaštenje) */}
              {canViewReports && (
                <button
                  type="button"
                  onClick={() => setCurrentTab('reports')}
                  className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors cursor-pointer min-w-0 ${
                    currentTab === 'reports'
                      ? 'bg-slate-800 text-amber-400 font-bold border-b-2 border-amber-400 shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 tracking-tight truncate w-full text-center">
                    Izvještaji
                  </span>
                </button>
              )}
            </nav>
          )}
        </div>

      </div>

      {/* Google Sheets Synchronization Modal */}
      {isAdmin && (
        <GoogleSheetsSyncModal
          isOpen={isSheetsModalOpen}
          onClose={() => setIsSheetsModalOpen(false)}
        />
      )}

      {/* Direct Stoppage Modal when triggered from Notification Center */}
      {orderForStoppage && (
        <StoppageModal
          order={orderForStoppage}
          isOpen={Boolean(orderForStoppage)}
          onClose={() => setOrderForStoppage(null)}
        />
      )}
    </header>
  );
};
