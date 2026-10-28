import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, WorkerPermissions } from '../../types';
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit3, 
  Trash2, 
  Key, 
  ShieldCheck, 
  HardHat, 
  AlertCircle, 
  X, 
  Eye, 
  EyeOff,
  CheckCircle2,
  Plus,
  Package,
  Compass,
  BarChart3,
  Shield,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Check,
  Coins
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface PermissionDefinition {
  key: keyof WorkerPermissions;
  title: string;
  description: string;
  badgeLabel: string;
  badgeColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'canCreateOrders',
    title: 'Pravljenje novih radnih naloga (+ Novi nalog)',
    description: 'Radnik dobija dugme i formu za samostalno kreiranje i izdavanje novih radnih naloga.',
    badgeLabel: '+ Novi nalozi',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Plus,
  },
  {
    key: 'canEditOrders',
    title: 'Izmjena postojećih radnih naloga',
    description: 'Radnik može uređivati rokove, opis, prioritet, planirane materijale i radnike na nalogu.',
    badgeLabel: 'Izmjena naloga',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    icon: Edit3,
  },
  {
    key: 'canDeleteOrders',
    title: 'Brisanje i otkazivanje naloga',
    description: 'Radnik ima pravo da trajno ukloni ili otkaže radni nalog sa sistema.',
    badgeLabel: 'Brisanje naloga',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: Trash2,
  },
  {
    key: 'canManageMaterials',
    title: 'Upravljanje skladištem i materijalima',
    description: 'Radnik dobija karticu "Materijali", uvid u skladište, dodavanje artikala i izmjenu zaliha.',
    badgeLabel: 'Materijali',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: Package,
  },
  {
    key: 'canPrepareModels',
    title: 'Priprema modela & Puštanje u proizvodnju',
    description: 'Radnik dobija karticu "Priprema" sa uvidom u modele i puštanjem naloga iz pripreme u izradu.',
    badgeLabel: 'Priprema modela',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: Compass,
  },
  {
    key: 'canViewReports',
    title: 'Pregled izvještaja i analitike utroška',
    description: 'Radnik dobija karticu "Izvještaji" sa uvidom u utrošak materijala, radne sate i filtere.',
    badgeLabel: 'Izvještaji',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: BarChart3,
  },
];

export const WorkersManagement: React.FC = () => {
  const { users, addWorker, updateWorker, deleteWorker, workOrders } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hourlyRate, setHourlyRate] = useState<string>('15');
  const [permissions, setPermissions] = useState<WorkerPermissions>({
    canCreateOrders: false,
    canEditOrders: false,
    canDeleteOrders: false,
    canManageMaterials: false,
    canPrepareModels: false,
    canViewReports: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const workersOnly = (users || []).filter((u) => u?.role === 'worker');

  const filteredWorkers = workersOnly.filter((w) =>
    (w?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w?.username || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setUserToEdit(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setHourlyRate('15');
    setPermissions({
      canCreateOrders: false,
      canEditOrders: false,
      canDeleteOrders: false,
      canManageMaterials: false,
      canPrepareModels: false,
      canViewReports: false,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (w: User) => {
    setUserToEdit(w);
    setFullName(w.fullName);
    setUsername(w.username);
    setPassword(w.password || '');
    setHourlyRate((w.hourlyRate !== undefined ? w.hourlyRate : 15).toString());
    setPermissions({
      canCreateOrders: Boolean(w.permissions?.canCreateOrders),
      canEditOrders: Boolean(w.permissions?.canEditOrders),
      canDeleteOrders: Boolean(w.permissions?.canDeleteOrders),
      canManageMaterials: Boolean(w.permissions?.canManageMaterials),
      canPrepareModels: Boolean(w.permissions?.canPrepareModels),
      canViewReports: Boolean(w.permissions?.canViewReports),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const togglePermission = (key: keyof WorkerPermissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Presets
  const applyPreset = (presetType: 'standard' | 'orders' | 'shift_leader' | 'warehouse' | 'full') => {
    switch (presetType) {
      case 'standard':
        setPermissions({
          canCreateOrders: false,
          canEditOrders: false,
          canDeleteOrders: false,
          canManageMaterials: false,
          canPrepareModels: false,
          canViewReports: false,
        });
        break;
      case 'orders':
        setPermissions({
          canCreateOrders: true,
          canEditOrders: true,
          canDeleteOrders: false,
          canManageMaterials: false,
          canPrepareModels: false,
          canViewReports: false,
        });
        break;
      case 'shift_leader':
        setPermissions({
          canCreateOrders: true,
          canEditOrders: true,
          canDeleteOrders: false,
          canManageMaterials: false,
          canPrepareModels: true,
          canViewReports: true,
        });
        break;
      case 'warehouse':
        setPermissions({
          canCreateOrders: false,
          canEditOrders: false,
          canDeleteOrders: false,
          canManageMaterials: true,
          canPrepareModels: false,
          canViewReports: true,
        });
        break;
      case 'full':
        setPermissions({
          canCreateOrders: true,
          canEditOrders: true,
          canDeleteOrders: true,
          canManageMaterials: true,
          canPrepareModels: true,
          canViewReports: true,
        });
        break;
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedRate = parseFloat(hourlyRate);
    const rateToSave = isNaN(parsedRate) || parsedRate < 0 ? 15 : parsedRate;

    if (userToEdit) {
      const res = updateWorker(userToEdit.id, {
        fullName,
        username,
        password,
        permissions,
        hourlyRate: rateToSave,
      });
      if (!res.success) {
        setFormError(res.error || 'Greška pri izmjeni radnika.');
        return;
      }
      setSuccessNotice(`Podaci i dopuštenja za radnika "${fullName}" su uspješno ažurirani.`);
    } else {
      const res = addWorker({
        fullName,
        username,
        password,
        permissions,
        hourlyRate: rateToSave,
      });
      if (!res.success) {
        setFormError(res.error || 'Greška pri dodavanju radnika.');
        return;
      }
      setSuccessNotice(`Novi radnik "${fullName}" je uspješno kreiran sa izabranim dopuštenjima.`);
    }

    setIsModalOpen(false);
    setTimeout(() => setSuccessNotice(null), 3000);
  };

  const handleDeleteConfirm = () => {
    if (userToDelete) {
      deleteWorker(userToDelete.id);
      setUserToDelete(null);
      setSuccessNotice('Radnik je obrisan.');
      setTimeout(() => setSuccessNotice(null), 3000);
    }
  };

  // Count assigned orders per worker
  const getAssignedCount = (workerUsername: string) => {
    return workOrders.filter((wo) => wo.assignedWorkers.includes(workerUsername)).length;
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Upravljanje Radnicima &amp; Dopuštenjima
            </h1>
            <span className="text-[11px] font-mono font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Samo Administrator
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Dodavanje radnika, postavljanje šifara i dodjela specifičnih ovlašćenja (pravljenje naloga, materijali, priprema, izvještaji).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Dodaj novog radnika</span>
        </button>
      </div>

      {/* Success Notification */}
      {successNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pretraga po imenu ili korisničkom imenu radnika..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <span className="text-xs text-slate-600 px-2 py-1 font-mono tabular-nums">
          Ukupno radnika u timu: {filteredWorkers.length}
        </span>
      </div>

      {/* Workers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Radnik (Ime i prezime)</th>
                <th className="py-3 px-4">Korisničko ime</th>
                <th className="py-3 px-4">Šifra za pristup</th>
                <th className="py-3 px-4 text-right">Zadana satnica</th>
                <th className="py-3 px-4">Dodijeljena dopuštenja (Ovlašćenja)</th>
                <th className="py-3 px-4 text-center">Nalozi</th>
                <th className="py-3 px-4 text-center">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">Nema pronađenih radnika</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Dodajte radnika klikom na dugme iznad.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w) => {
                  const assignedCount = getAssignedCount(w.username);
                  const activePermissions = PERMISSION_DEFINITIONS.filter(
                    (p) => Boolean(w.permissions?.[p.key])
                  );

                  return (
                    <tr key={w.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200 shrink-0">
                            {w.fullName.charAt(0)}
                          </div>
                          <div>
                            <span className="block font-bold">{w.fullName}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              Radnik proizvodnje
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {w.username}
                      </td>

                      {/* Password */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200 text-xs font-semibold">
                          <Key className="w-3.5 h-3.5 text-slate-500" />
                          {w.password}
                        </span>
                      </td>

                      {/* Hourly Rate */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-xs">
                          {w.hourlyRate !== undefined ? Number(w.hourlyRate).toFixed(2) : '15.00'} KM/h
                        </span>
                      </td>

                      {/* Permissions badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 items-center max-w-md">
                          {activePermissions.length === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <HardHat className="w-3 h-3 text-slate-400" />
                              Standardni radnik (samo svoji nalozi i utrošak)
                            </span>
                          ) : (
                            activePermissions.map((p) => {
                              const IconComp = p.icon;
                              return (
                                <span
                                  key={p.key}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${p.badgeColor}`}
                                  title={p.description}
                                >
                                  <IconComp className="w-3 h-3" />
                                  <span>{p.badgeLabel}</span>
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>

                      {/* Assigned Orders */}
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {assignedCount} naloga
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(w)}
                            title="Uredi radnika i dopuštenja"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 rounded-md border border-indigo-200 transition cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Dopuštenja &amp; Šifra</span>
                          </button>
                          <button
                            onClick={() => setUserToDelete(w)}
                            title="Obriši radnika"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
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

      {/* Add / Edit Worker Modal with Permissions */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-base font-bold">
                    {userToEdit ? `Uredi radnika: ${userToEdit.fullName}` : 'Novi radnik i dodjela dopuštenja'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Pristupni podaci i specifična administratorska ovlašćenja
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto custom-scrollbar">
              
              {/* Sekcija 1: Osnovni podaci i šifra */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-600" />
                  Osnovni podaci i pristupna šifra
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ime i prezime radnika *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="npr. Stefan Petrović"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Korisničko ime za prijavu *
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="npr. Stefan1"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Šifra za pristup (lozinka) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Lozinka za prijavu"
                      required
                      className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Radnik koristi ovo korisničko ime i šifru za prijavu na telefonu ili računaru.
                  </span>
                </div>

                {/* Zadana satnica radnika */}
                <div className="pt-1 border-t border-slate-200/80">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-600" />
                      Zadana satnica radnika (KM/h)
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Za sekciju Troškovi izrade</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="15.00"
                      className="w-full pl-3 pr-14 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                      KM/h
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Podrazumijevana satnica radnika. U novoj sekciji <strong>Troškovi izrade</strong> možete po želji za svaki radni nalog ručno prilagoditi satnicu ili unijeti fiksnu cijenu rada.
                  </span>
                </div>
              </div>

              {/* Sekcija 2: Dopuštenja radnika (Permissions) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      Dopuštenja i ovlašćenja radnika
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Izaberite šta sve ovaj radnik može samostalno da radi u sistemu
                    </p>
                  </div>

                  {/* Brzi profili (Presets) */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-semibold text-slate-400 mr-1">Brzi profil:</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('standard')}
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 cursor-pointer transition"
                    >
                      Standardni
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('orders')}
                      className="px-2 py-0.5 text-[10px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 cursor-pointer transition"
                    >
                      + Nalozi
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('shift_leader')}
                      className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 cursor-pointer transition"
                    >
                      Vođa smjene
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('warehouse')}
                      className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 cursor-pointer transition"
                    >
                      Magacioner
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('full')}
                      className="px-2 py-0.5 text-[10px] font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 cursor-pointer transition"
                    >
                      Puni pristup
                    </button>
                  </div>
                </div>

                {/* List of permissions */}
                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  {PERMISSION_DEFINITIONS.map((def) => {
                    const isChecked = Boolean(permissions[def.key]);
                    const IconComp = def.icon;

                    return (
                      <div
                        key={def.key}
                        onClick={() => togglePermission(def.key)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                          isChecked
                            ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-400/40 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </div>

                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-white shadow-2xs">
                          <IconComp className={`w-4 h-4 ${isChecked ? 'text-indigo-600' : 'text-slate-500'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {def.title}
                            </span>
                            {isChecked && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.2 rounded font-mono">
                                Dozvoljeno
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {def.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{userToEdit ? 'Sačuvaj izmjene i dopuštenja' : 'Kreiraj radnika sa dopuštenjima'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!userToDelete}
        title="Brisanje radnika"
        message={`Da li ste sigurni da želite obrisati radnika "${userToDelete?.fullName}" (${userToDelete?.username})? Radnik više neće moći da se prijavi na sistem.`}
        confirmLabel="Obriši radnika"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setUserToDelete(null)}
      />

    </div>
  );
};

