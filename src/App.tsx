import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { LoginForm } from './components/LoginForm';
import { WorkOrdersTable } from './components/admin/WorkOrdersTable';
import { MaterialsManagement } from './components/admin/MaterialsManagement';
import { WorkersManagement } from './components/admin/WorkersManagement';
import { ReportsDashboard } from './components/admin/ReportsDashboard';
import { ModelPreparationManagement } from './components/admin/ModelPreparationManagement';
import { ManufacturingCostsManagement } from './components/admin/ManufacturingCostsManagement';
import { WorkerDashboard } from './components/worker/WorkerDashboard';
import { WorkOrderModal } from './components/admin/WorkOrderModal';
import { Plus } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { currentUser, openCreateWorkOrderModal } = useApp();
  const [currentTab, setCurrentTab] = useState<string>('orders');

  if (!currentUser) {
    return <LoginForm />;
  }

  const isAdmin = currentUser.role === 'admin';
  const canCreateOrders = isAdmin || Boolean(currentUser.permissions?.canCreateOrders);
  const canManageMaterials = isAdmin || Boolean(currentUser.permissions?.canManageMaterials);
  const canPrepareModels = isAdmin || Boolean(currentUser.permissions?.canPrepareModels);
  const canViewReports = isAdmin || Boolean(currentUser.permissions?.canViewReports);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100/70 text-slate-900 flex flex-col relative pb-16 sm:pb-0">
      {/* Sticky Top Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {isAdmin ? (
          <>
            {currentTab === 'orders' && <WorkOrdersTable onNavigateToModels={() => setCurrentTab('models')} />}
            {currentTab === 'models' && <ModelPreparationManagement />}
            {currentTab === 'materials' && <MaterialsManagement />}
            {currentTab === 'costs' && <ManufacturingCostsManagement />}
            {currentTab === 'workers' && <WorkersManagement />}
            {currentTab === 'reports' && <ReportsDashboard />}
          </>
        ) : (
          <>
            {(currentTab === 'my-orders' || currentTab === 'all-orders' || currentTab === 'orders') && (
              <WorkerDashboard
                key={currentTab}
                mode={currentTab === 'all-orders' ? 'all' : 'my'}
              />
            )}
            {currentTab === 'models' && canPrepareModels && <ModelPreparationManagement />}
            {currentTab === 'materials' && canManageMaterials && <MaterialsManagement />}
            {currentTab === 'costs' && canViewReports && <ManufacturingCostsManagement />}
            {currentTab === 'reports' && canViewReports && <ReportsDashboard />}
          </>
        )}
      </main>

      {/* Mobile Floating Action Button (Admin OR worker with canCreateOrders) */}
      {canCreateOrders && (
        <button
          type="button"
          onClick={() => openCreateWorkOrderModal()}
          className="sm:hidden fixed bottom-5 right-4 z-40 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full px-4 py-3 shadow-2xl flex items-center gap-2 border-2 border-white ring-4 ring-blue-500/20 active:scale-95 transition-all cursor-pointer"
          title="Izdaj novi radni nalog"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-bold">Novi nalog</span>
        </button>
      )}

      {/* Global Work Order Modal (Admin OR authorized worker) */}
      {(canCreateOrders || currentUser.permissions?.canEditOrders) && <WorkOrderModal />}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Radni Nalozi &amp; Proizvodnja</span>
          <span className="font-mono text-[11px]">
            Prijavljeni korisnik: <strong className="text-slate-700">{currentUser.fullName}</strong> ({currentUser.username})
          </span>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
