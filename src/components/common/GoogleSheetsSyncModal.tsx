import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  X, 
  FileSpreadsheet, 
  ExternalLink, 
  CheckCircle2, 
  Loader2, 
  Copy, 
  Check, 
  AlertCircle, 
  Clock, 
  RefreshCw,
  LogOut,
  Folder,
  Layers,
  FileCheck,
  Package,
  ClipboardList
} from 'lucide-react';
import { 
  googleSignIn, 
  googleSignOut, 
  initGoogleAuth, 
  getCurrentGoogleUser 
} from '../../services/googleAuth';
import { 
  createSpreadsheetWithData, 
  buildWorkOrdersSheet, 
  buildConsumptionSheet, 
  buildMaterialsSheet, 
  buildSastavniceSheet,
  listRecentSpreadsheets,
  DriveSpreadsheetFile,
  SheetDefinition
} from '../../services/googleSheets';
import { User as FirebaseUser } from 'firebase/auth';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({ isOpen, onClose }) => {
  const { workOrders, consumptionLogs, materials } = useApp();

  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successLink, setSuccessLink] = useState<{ url: string; title: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Export configuration
  const defaultTitle = `Radni Nalozi & Proizvodnja - ${new Date().toLocaleDateString('sr-Latn-BA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })}`;
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(defaultTitle);
  const [includeOrders, setIncludeOrders] = useState(true);
  const [includeConsumption, setIncludeConsumption] = useState(true);
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includeSastavnice, setIncludeSastavnice] = useState(true);

  // Destructive/Creation Confirmation Modal state (Mandatory per Workspace Skill)
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Recent sheets on Drive
  const [recentSheets, setRecentSheets] = useState<DriveSpreadsheetFile[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Check Firebase Auth state
    const unsubscribe = initGoogleAuth(
      (user) => {
        setGoogleUser(user);
        loadRecents();
      },
      () => {
        setGoogleUser(getCurrentGoogleUser());
      }
    );

    const currentUser = getCurrentGoogleUser();
    if (currentUser) {
      setGoogleUser(currentUser);
      loadRecents();
    }

    return () => unsubscribe();
  }, [isOpen]);

  const loadRecents = async () => {
    setIsLoadingRecents(true);
    try {
      const files = await listRecentSpreadsheets();
      setRecentSheets(files);
    } catch {
      // Ignored
    } finally {
      setIsLoadingRecents(false);
    }
  };

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const res = await googleSignIn();
      setGoogleUser(res.user);
      loadRecents();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Prijavljivanje je prekinuto (prozor zatvoren).');
      } else {
        setErrorMsg(err.message || 'Greška pri prijavi sa Google nalogom.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleSignOut();
      setGoogleUser(null);
      setRecentSheets([]);
      setSuccessLink(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Greška pri odjavi.');
    }
  };

  // Triggered by "Kreiraj Google Tabelu" button, opens confirmation dialog
  const handleInitiateExport = () => {
    setErrorMsg(null);
    if (!includeOrders && !includeConsumption && !includeMaterials && !includeSastavnice) {
      setErrorMsg('Morate označiti barem jednu stavku za izvoz.');
      return;
    }
    setShowConfirmModal(true);
  };

  // Actual export execution after user confirmation
  const handleExecuteExport = async () => {
    setShowConfirmModal(false);
    setIsExporting(true);
    setErrorMsg(null);
    setSuccessLink(null);

    try {
      const sheetsToCreate: SheetDefinition[] = [];

      if (includeOrders) {
        sheetsToCreate.push(buildWorkOrdersSheet(workOrders));
      }
      if (includeConsumption) {
        sheetsToCreate.push(buildConsumptionSheet(consumptionLogs));
      }
      if (includeMaterials) {
        sheetsToCreate.push(buildMaterialsSheet(materials));
      }
      if (includeSastavnice) {
        sheetsToCreate.push(buildSastavniceSheet(workOrders));
      }

      const result = await createSpreadsheetWithData(spreadsheetTitle.trim() || 'Radni Nalozi', sheetsToCreate);

      setSuccessLink({
        url: result.spreadsheetUrl,
        title: spreadsheetTitle.trim() || 'Radni Nalozi',
      });

      // Reload recents
      loadRecents();
    } catch (err: any) {
      setErrorMsg(err.message || 'Greška prilikom kreiranja tabele u Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div 
        className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white border border-white/20">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Google Sheets Integracija</h3>
              <p className="text-xs text-emerald-100">
                Izvoz radnih naloga, utrošaka i baze materijala direktno u Google Tabele
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {/* Zone 1: Google Account Connection Status */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {googleUser ? (
                <div className="flex items-center gap-3">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || 'Google Korisnik'}
                      className="w-10 h-10 rounded-full border border-slate-300 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">
                      {(googleUser.displayName || googleUser.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {googleUser.displayName || 'Google Korisnik'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                        Povezano
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {googleUser.email}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Povežite svoj Google nalog</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Potrebna je jednokratna prijava sa Google nalogom kako bi aplikacija mogla kreirati i ažurirati tabele na vašem Google Drive-u.
                  </p>
                </div>
              )}

              {googleUser ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:text-red-600 transition-colors shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Odjavi Google
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md border border-slate-300 shadow-xs transition-colors shrink-0 disabled:opacity-50"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Prijavi se sa Google nalogom</span>
                </button>
              )}
            </div>
          </div>

          {/* Success Banner if exported */}
          {successLink && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-900">
                    Google Tabela je uspješno kreirana!
                  </h4>
                  <p className="text-[11px] text-emerald-700 truncate max-w-sm">
                    {successLink.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleCopy(successLink.url)}
                  className="px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-white border border-emerald-300 rounded hover:bg-emerald-50 flex items-center gap-1"
                  title="Kopiraj link"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Kopirano!' : 'Kopiraj'}</span>
                </button>
                <a
                  href={successLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Otvori u Google Sheets</span>
                </a>
              </div>
            </div>
          )}

          {/* Zone 2: Export Options */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Podešavanja za novu tabelu
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Naziv nove Google Tabele:
              </label>
              <input
                type="text"
                value={spreadsheetTitle}
                onChange={(e) => setSpreadsheetTitle(e.target.value)}
                placeholder="Unesite naziv tabele..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Izaberi radne listove (Tabs) koji će biti kreirani u tabeli:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* 1. Radni Nalozi */}
                <label className={`p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors ${includeOrders ? 'bg-blue-50/60 border-blue-200 text-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input
                    type="checkbox"
                    checked={includeOrders}
                    onChange={(e) => setIncludeOrders(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                      Radni Nalozi
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {workOrders.length} radnih naloga, kupci, statusi, planirani materijali
                    </div>
                  </div>
                </label>

                {/* 2. Utrošak & Vrijeme */}
                <label className={`p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors ${includeConsumption ? 'bg-amber-50/60 border-amber-200 text-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input
                    type="checkbox"
                    checked={includeConsumption}
                    onChange={(e) => setIncludeConsumption(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      Utrošak &amp; Radno Vrijeme
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {consumptionLogs.length} evidentiranih utrošaka i radnih sati
                    </div>
                  </div>
                </label>

                {/* 3. Baza Materijala */}
                <label className={`p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors ${includeMaterials ? 'bg-emerald-50/60 border-emerald-200 text-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input
                    type="checkbox"
                    checked={includeMaterials}
                    onChange={(e) => setIncludeMaterials(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      Baza Materijala
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {materials.length} artikala, zalihe, šifre i jedinice mjere
                    </div>
                  </div>
                </label>

                {/* 4. Sastavnice */}
                <label className={`p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors ${includeSastavnice ? 'bg-purple-50/60 border-purple-200 text-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input
                    type="checkbox"
                    checked={includeSastavnice}
                    onChange={(e) => setIncludeSastavnice(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-purple-600" />
                      Sastavnice &amp; Izvještaj
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Evidencija urađenog i napravljenih sastavnica
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md border border-slate-300 transition-colors"
              >
                Zatvori
              </button>

              <button
                type="button"
                onClick={handleInitiateExport}
                disabled={isExporting || !googleUser}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 rounded-md shadow-sm transition-colors"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Kreiram Google Tabelu...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Kreiraj Google Tabelu</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Zone 3: Recent Spreadsheets on Google Drive */}
          {googleUser && (
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                  Prethodne Google Tabele na Drive-u
                </h4>
                <button
                  type="button"
                  onClick={loadRecents}
                  disabled={isLoadingRecents}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  title="Osvježi listu"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingRecents ? 'animate-spin' : ''}`} />
                  <span>Osvježi</span>
                </button>
              </div>

              {isLoadingRecents ? (
                <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Učitavam tabele sa Google Drive-a...</span>
                </div>
              ) : recentSheets.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
                  Nema pronađenih tabela kreiranih u ovoj sesiji.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {recentSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50/20 transition-all text-xs"
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-medium text-slate-800 truncate" title={sheet.name}>
                          {sheet.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(sheet.modifiedTime).toLocaleDateString('sr-Latn-BA')}
                        </span>
                        <a
                          href={sheet.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Otvori</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog (Mandatory per Google Workspace Integration Skill) */}
      {showConfirmModal && (
        <div 
          className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Potvrda kreiranja Google Tabele
              </h3>
              <p className="text-xs text-slate-600 mt-2">
                Da li želite kreirati novu tabelu na vašem Google Drive nalogu pod nazivom:
              </p>
              <div className="my-3 p-3 bg-slate-100 rounded-lg text-xs font-mono font-semibold text-slate-800 break-words">
                {spreadsheetTitle.trim() || 'Radni Nalozi'}
              </div>
              <ul className="text-xs text-slate-500 space-y-1 mb-4">
                {includeOrders && <li>• Radni nalozi: {workOrders.length} stavki</li>}
                {includeConsumption && <li>• Utrošak i vrijeme: {consumptionLogs.length} stavki</li>}
                {includeMaterials && <li>• Baza materijala: {materials.length} stavki</li>}
                {includeSastavnice && <li>• Sastavnice i evidencija rada</li>}
              </ul>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md border border-slate-300 transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="button"
                  onClick={handleExecuteExport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors"
                >
                  Potvrdi i kreiraj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
