import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { User, WorkOrder, Material, ConsumptionLog, SastavnicaInfo, MultiMaterialEntry, StoppageInfo, WorkerPermissions } from '../types';
import { SYSTEM_USERS, INITIAL_MATERIALS, INITIAL_WORK_ORDERS, INITIAL_CONSUMPTION_LOGS } from '../data/initialData';

interface AppContextType {
  currentUser: User | null;
  login: (username: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  
  // Users / Workers management
  users: User[];
  addWorker: (worker: { username: string; fullName: string; password: string; permissions?: WorkerPermissions; hourlyRate?: number }) => { success: boolean; error?: string };
  updateWorker: (id: string, updates: Partial<{ username: string; fullName: string; password: string; permissions: WorkerPermissions; hourlyRate?: number }>) => { success: boolean; error?: string };
  deleteWorker: (id: string) => { success: boolean; error?: string };
  hasPermission: (permissionKey: keyof WorkerPermissions) => boolean;

  // Work Orders (Can be issued on desktop or mobile by admin or worker)
  workOrders: WorkOrder[];
  addWorkOrder: (order: Omit<WorkOrder, 'id' | 'createdAt'>) => { success: boolean; error?: string };
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => { success: boolean; error?: string };
  deleteWorkOrder: (id: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  updateSastavnica: (workOrderId: string, sastavnica: SastavnicaInfo) => { success: boolean; error?: string };
  
  // Evidencija zastoja (Downtime / Stoppage tracking)
  reportStoppage: (workOrderId: string, reason: string, description?: string) => { success: boolean; error?: string };
  resolveStoppage: (workOrderId: string, resolutionNote?: string) => { success: boolean; error?: string };
  releaseOrderToProduction: (orderId: string) => { success: boolean; error?: string };
  
  // Global Work Order Modal state (accessible from any screen, mobile or desktop)
  isWorkOrderModalOpen: boolean;
  selectedOrderToEdit: WorkOrder | null;
  openCreateWorkOrderModal: (orderToEdit?: WorkOrder | null) => void;
  closeWorkOrderModal: () => void;

  // Materials
  materials: Material[];
  addMaterial: (material: Omit<Material, 'id' | 'lastUpdated'>) => { success: boolean; error?: string };
  updateMaterial: (id: string, updates: Partial<Material>) => { success: boolean; error?: string };
  deleteMaterial: (id: string) => { success: boolean; error?: string };
  
  // Consumption & Time logging
  consumptionLogs: ConsumptionLog[];
  recordWorkCompletion: (params: {
    workOrderId: string;
    materials: MultiMaterialEntry[];
    hoursSpent: number;
    minutesSpent: number;
    note?: string;
    markAsCompleted: boolean;
  }) => { success: boolean; error?: string };

  // Admin exclusive: edit consumed quantity
  adminUpdateConsumptionQuantity: (logId: string, newQuantity: number) => { success: boolean; error?: string };

  // Notifications
  hasNewOrderNotification: boolean;
  clearNewOrderNotification: () => void;

  // Sync state between mobile & desktop
  isSyncedWithServer: boolean;
  syncNow: () => Promise<void>;

  resetToDefaultData: () => void;
}

const SESSION_USER_KEY = 'rn_session_auth_user_v6';
const SESSION_ORDERS_KEY = 'rn_session_work_orders_v6';
const SESSION_MATERIALS_KEY = 'rn_session_materials_v6';
const SESSION_LOGS_KEY = 'rn_session_consumption_logs_v6';
const SESSION_USERS_KEY = 'rn_session_users_v6';
const SESSION_TOMBSTONES_KEY = 'rn_session_tombstones_v6';

interface TombstonesCache {
  deletedOrderIds: string[];
  deletedMaterialIds: string[];
  deletedWorkerIds: string[];
}

function readCachedTombstones(): TombstonesCache {
  try {
    const raw = sessionStorage.getItem(SESSION_TOMBSTONES_KEY) || localStorage.getItem(SESSION_TOMBSTONES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        deletedOrderIds: Array.isArray(parsed?.deletedOrderIds) ? parsed.deletedOrderIds.filter(Boolean) : [],
        deletedMaterialIds: Array.isArray(parsed?.deletedMaterialIds) ? parsed.deletedMaterialIds.filter(Boolean) : [],
        deletedWorkerIds: Array.isArray(parsed?.deletedWorkerIds) ? parsed.deletedWorkerIds.filter(Boolean) : [],
      };
    }
  } catch {}
  return { deletedOrderIds: [], deletedMaterialIds: [], deletedWorkerIds: [] };
}

function writeCachedTombstones(tombstones: TombstonesCache): void {
  try {
    const serialized = JSON.stringify(tombstones);
    sessionStorage.setItem(SESSION_TOMBSTONES_KEY, serialized);
    localStorage.setItem(SESSION_TOMBSTONES_KEY, serialized);
  } catch {}
}

function readCachedArray<T>(key: string, fallback: T[]): T[] {
  try {
    const sessionRaw = sessionStorage.getItem(key);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    const localRaw = localStorage.getItem(key);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        sessionStorage.setItem(key, localRaw);
        return parsed;
      }
    }
  } catch {}
  return fallback;
}

function writeCachedArray<T>(key: string, items: T[], allowEmpty = false): void {
  try {
    if (!Array.isArray(items)) return;
    if (items.length === 0 && !allowEmpty) {
      return;
    }
    const serialized = JSON.stringify(items);
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch {}
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialTombstones = readCachedTombstones();

  // Authoritative tombstone sets from server-db.json & sessionStorage
  const deletedOrdersRef = useRef<Set<string>>(new Set<string>(initialTombstones.deletedOrderIds));
  const deletedMaterialsRef = useRef<Set<string>>(new Set<string>(initialTombstones.deletedMaterialIds));
  const deletedWorkersRef = useRef<Set<string>>(new Set<string>(initialTombstones.deletedWorkerIds));

  // Track server version & active mutations so stale background polls never overwrite newer state
  const serverVersionRef = useRef<number>(0);
  const pendingMutationsRef = useRef<number>(0);
  const allowAdminResetRef = useRef<boolean>(false);

  // Block rendering children until /api/state is fetched and saved into sessionStorage
  const [isInitialServerHydrated, setIsInitialServerHydrated] = useState<boolean>(false);

  // Hydrate initial state from sessionStorage (prioritized & updated by /api/state before first render)
  const [users, setUsers] = useState<User[]>(() => {
    const cached = readCachedArray<User>(SESSION_USERS_KEY, SYSTEM_USERS);
    return cached.filter((u) => u && u.id && (!deletedWorkersRef.current.has(u.id) || u.role === 'admin'));
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedSession = sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(SESSION_USER_KEY);
      if (savedSession) {
        return JSON.parse(savedSession);
      }
    } catch {}
    return null;
  });

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => {
    const cached = readCachedArray<WorkOrder>(SESSION_ORDERS_KEY, INITIAL_WORK_ORDERS);
    return cached.filter((o) => o && o.id && !deletedOrdersRef.current.has(o.id));
  });

  const [materials, setMaterials] = useState<Material[]>(() => {
    const cached = readCachedArray<Material>(SESSION_MATERIALS_KEY, INITIAL_MATERIALS);
    return cached.filter((m) => m && m.id && !deletedMaterialsRef.current.has(m.id));
  });

  const [consumptionLogs, setConsumptionLogs] = useState<ConsumptionLog[]>(() => {
    return readCachedArray<ConsumptionLog>(SESSION_LOGS_KEY, INITIAL_CONSUMPTION_LOGS);
  });

  // Global Work Order creation modal (for mobile button, header button, floating button, table)
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [selectedOrderToEdit, setSelectedOrderToEdit] = useState<WorkOrder | null>(null);

  // Notification for new orders
  const [hasNewOrderNotification, setHasNewOrderNotification] = useState<boolean>(false);
  const [isSyncedWithServer, setIsSyncedWithServer] = useState<boolean>(true);
  const previousOrdersCountRef = useRef<number>(0);

  // Keep sessionStorage in sync whenever state changes (after initial hydration)
  useEffect(() => {
    if (!isInitialServerHydrated) return;
    writeCachedArray(SESSION_USERS_KEY, users, false);
  }, [users, isInitialServerHydrated]);

  useEffect(() => {
    if (!isInitialServerHydrated) return;
    writeCachedArray(SESSION_ORDERS_KEY, workOrders, workOrders.length === 0 && deletedOrdersRef.current.size > 0);
  }, [workOrders, isInitialServerHydrated]);

  useEffect(() => {
    if (!isInitialServerHydrated) return;
    writeCachedArray(SESSION_MATERIALS_KEY, materials, materials.length === 0 && deletedMaterialsRef.current.size > 0);
  }, [materials, isInitialServerHydrated]);

  useEffect(() => {
    if (!isInitialServerHydrated) return;
    writeCachedArray(SESSION_LOGS_KEY, consumptionLogs, false);
  }, [consumptionLogs, isInitialServerHydrated]);

  const syncTombstonesToSession = useCallback(() => {
    writeCachedTombstones({
      deletedOrderIds: Array.from(deletedOrdersRef.current),
      deletedMaterialIds: Array.from(deletedMaterialsRef.current),
      deletedWorkerIds: Array.from(deletedWorkersRef.current),
    });
  }, []);

  const openCreateWorkOrderModal = (orderToEdit?: WorkOrder | null) => {
    const isAdmin = currentUser?.role === 'admin';
    const canCreate = isAdmin || Boolean(currentUser?.permissions?.canCreateOrders);
    const canEdit = isAdmin || Boolean(currentUser?.permissions?.canEditOrders);
    if (!orderToEdit && !canCreate) return;
    if (orderToEdit && !canEdit) return;
    setSelectedOrderToEdit(orderToEdit || null);
    setIsWorkOrderModalOpen(true);
  };

  const closeWorkOrderModal = () => {
    setSelectedOrderToEdit(null);
    setIsWorkOrderModalOpen(false);
  };

  const clearNewOrderNotification = () => {
    setHasNewOrderNotification(false);
  };

  // Authoritative state applier with strict Anti-Wipe Guard: prioritizes /api/state and saves to sessionStorage
  const applyServerSnapshot = useCallback((
    data: any,
    options?: { isMutationResponse?: boolean; isInitialHydration?: boolean }
  ) => {
    // 🛡️ Guard 1: Reject null, undefined, or non-object payloads immediately
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;

    // 🛡️ Guard 2: Do not let background polling clobber an in-flight write mutation
    if (!options?.isMutationResponse && !options?.isInitialHydration && pendingMutationsRef.current > 0) {
      return;
    }

    // 🛡️ Guard 3: Ignore stale snapshots with older version numbers
    if (
      typeof data.version === 'number' &&
      serverVersionRef.current > 0 &&
      data.version < serverVersionRef.current &&
      !allowAdminResetRef.current &&
      !options?.isInitialHydration
    ) {
      return;
    }
    if (typeof data.version === 'number') {
      serverVersionRef.current = Math.max(serverVersionRef.current, data.version);
    }

    setIsSyncedWithServer(true);

    // Sync tombstones from server-db.json
    if (Array.isArray(data.deletedOrderIds)) {
      data.deletedOrderIds.forEach((id: string) => {
        if (id) deletedOrdersRef.current.add(id);
      });
    }
    if (Array.isArray(data.deletedMaterialIds)) {
      data.deletedMaterialIds.forEach((id: string) => {
        if (id) deletedMaterialsRef.current.add(id);
      });
    }
    if (Array.isArray(data.deletedWorkerIds)) {
      data.deletedWorkerIds.forEach((id: string) => {
        if (id) deletedWorkersRef.current.add(id);
      });
    }
    syncTombstonesToSession();

    // 🛡️ Guard 4: Users / Workers Anti-Wipe Guard (Server prioritized)
    if (Array.isArray(data.users) && data.users.length > 0) {
      const sanitizedUsers = data.users
        .filter((u: any) => u && u.id && (!deletedWorkersRef.current.has(u.id) || u.role === 'admin'))
        .map((u: any) => (u.username?.toLowerCase() === 'admin' ? { ...u, password: 'admin123' } : u));
      if (sanitizedUsers.length > 0) {
        writeCachedArray(SESSION_USERS_KEY, sanitizedUsers, false);
        setUsers(sanitizedUsers);
      }
    }

    // 🛡️ Guard 5: Work Orders Strict Anti-Wipe Guard (Server /api/state prioritized + saved to sessionStorage)
    if (Array.isArray(data.workOrders)) {
      const validServerOrders = data.workOrders.filter((o: WorkOrder) => {
        if (!o || !o.id) return false;
        if (deletedOrdersRef.current.has(o.id)) return false;
        return true;
      });

      setWorkOrders((prev) => {
        const cachedOrders = readCachedArray<WorkOrder>(SESSION_ORDERS_KEY, []);
        const survivingPrev = [...(prev || []), ...cachedOrders].filter(
          (o) => o && o.id && !deletedOrdersRef.current.has(o.id)
        );

        // Never overwrite non-empty surviving orders with an empty array unless explicitly reset by admin
        if (validServerOrders.length === 0 && survivingPrev.length > 0 && !allowAdminResetRef.current) {
          const uniqueSurviving = Array.from(new Map(survivingPrev.map((o) => [o.id, o])).values());
          writeCachedArray(SESSION_ORDERS_KEY, uniqueSurviving, false);
          return uniqueSurviving;
        }

        if (validServerOrders.length === 0) {
          writeCachedArray(SESSION_ORDERS_KEY, [], true);
          return [];
        }

        // Prioritize server orders first, then preserve any surviving local orders not yet on server
        const orderMap = new Map<string, WorkOrder>();
        validServerOrders.forEach((o: WorkOrder) => {
          orderMap.set(o.id, o);
        });
        survivingPrev.forEach((o: WorkOrder) => {
          if (!orderMap.has(o.id) && !deletedOrdersRef.current.has(o.id)) {
            orderMap.set(o.id, o);
          }
        });

        const merged = Array.from(orderMap.values());
        writeCachedArray(SESSION_ORDERS_KEY, merged, false);

        if (merged.length > previousOrdersCountRef.current && previousOrdersCountRef.current > 0) {
          setHasNewOrderNotification(true);
        }
        previousOrdersCountRef.current = merged.length;
        return merged;
      });
    }

    // 🛡️ Guard 6: Materials (Magacin) Strict Anti-Wipe Guard (Server /api/state prioritized + saved to sessionStorage)
    if (Array.isArray(data.materials)) {
      const validServerMaterials = data.materials.filter((m: Material) => {
        if (!m || !m.id) return false;
        if (deletedMaterialsRef.current.has(m.id)) return false;
        return true;
      });

      setMaterials((prev) => {
        const cachedMaterials = readCachedArray<Material>(SESSION_MATERIALS_KEY, []);
        const survivingPrev = [...(prev || []), ...cachedMaterials].filter(
          (m) => m && m.id && !deletedMaterialsRef.current.has(m.id)
        );

        if (validServerMaterials.length === 0 && survivingPrev.length > 0 && !allowAdminResetRef.current) {
          const uniqueSurviving = Array.from(new Map(survivingPrev.map((m) => [m.id, m])).values());
          writeCachedArray(SESSION_MATERIALS_KEY, uniqueSurviving, false);
          return uniqueSurviving;
        }

        if (validServerMaterials.length === 0) {
          writeCachedArray(SESSION_MATERIALS_KEY, [], true);
          return [];
        }

        const matMap = new Map<string, Material>();
        validServerMaterials.forEach((m: Material) => {
          matMap.set(m.id, m);
        });
        survivingPrev.forEach((m: Material) => {
          if (!matMap.has(m.id) && !deletedMaterialsRef.current.has(m.id)) {
            matMap.set(m.id, m);
          }
        });
        const merged = Array.from(matMap.values());
        writeCachedArray(SESSION_MATERIALS_KEY, merged, false);
        return merged;
      });
    }

    // 🛡️ Guard 7: Consumption Logs (Troškovi) Strict Anti-Wipe Guard
    if (Array.isArray(data.consumptionLogs)) {
      const validLogs = data.consumptionLogs.filter((l: ConsumptionLog) => l && l.id);

      setConsumptionLogs((prev) => {
        const cachedLogs = readCachedArray<ConsumptionLog>(SESSION_LOGS_KEY, []);
        const survivingPrev = [...(prev || []), ...cachedLogs].filter((l) => l && l.id);

        if (validLogs.length === 0 && survivingPrev.length > 0 && !allowAdminResetRef.current) {
          const uniqueSurviving = Array.from(new Map(survivingPrev.map((l) => [l.id, l])).values());
          writeCachedArray(SESSION_LOGS_KEY, uniqueSurviving, false);
          return uniqueSurviving;
        }

        if (validLogs.length === 0) {
          return [];
        }

        const logMap = new Map<string, ConsumptionLog>();
        validLogs.forEach((l: ConsumptionLog) => {
          logMap.set(l.id, l);
        });
        survivingPrev.forEach((l: ConsumptionLog) => {
          if (!logMap.has(l.id)) {
            logMap.set(l.id, l);
          }
        });
        const merged = Array.from(logMap.values());
        writeCachedArray(SESSION_LOGS_KEY, merged, false);
        return merged;
      });
    }

    if (allowAdminResetRef.current) {
      allowAdminResetRef.current = false;
    }
  }, [syncTombstonesToSession]);

  // Central Sync Engine: Fetch live state directly from server-db.json (/api/state)
  const fetchServerState = useCallback(async (isInitial = false) => {
    if (!isInitial && pendingMutationsRef.current > 0) return;
    try {
      const res = await fetch(`/api/state?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) return;
      const serverData = await res.json();
      applyServerSnapshot(serverData, { isInitialHydration: isInitial });

      // If this is the initial load and sessionStorage had non-deleted items that the server lost (e.g. Render restart),
      // push ONLY non-empty records back to /api/sync. NEVER send empty arrays [] on mount!
      if (isInitial && serverData && typeof serverData === 'object') {
        const currentDeletedOrders = new Set<string>([
          ...Array.from(deletedOrdersRef.current),
          ...(Array.isArray(serverData.deletedOrderIds) ? serverData.deletedOrderIds : []),
        ]);
        const currentDeletedMaterials = new Set<string>([
          ...Array.from(deletedMaterialsRef.current),
          ...(Array.isArray(serverData.deletedMaterialIds) ? serverData.deletedMaterialIds : []),
        ]);

        const cachedOrders = readCachedArray<WorkOrder>(SESSION_ORDERS_KEY, []).filter(
          (o) => o && o.id && !currentDeletedOrders.has(o.id)
        );
        const cachedMaterials = readCachedArray<Material>(SESSION_MATERIALS_KEY, []).filter(
          (m) => m && m.id && !currentDeletedMaterials.has(m.id)
        );
        const cachedLogs = readCachedArray<ConsumptionLog>(SESSION_LOGS_KEY, []).filter(
          (l) => l && l.id
        );

        const serverOrdersCount = Array.isArray(serverData.workOrders) ? serverData.workOrders.length : 0;
        const serverMaterialsCount = Array.isArray(serverData.materials) ? serverData.materials.length : 0;

        const needsServerRecovery =
          (cachedOrders.length > serverOrdersCount && cachedOrders.length > 0) ||
          (cachedMaterials.length > serverMaterialsCount && cachedMaterials.length > 0);

        if (needsServerRecovery) {
          const recoveryPayload: Record<string, any> = {};
          if (cachedOrders.length > 0) recoveryPayload.workOrders = cachedOrders;
          if (cachedMaterials.length > 0) recoveryPayload.materials = cachedMaterials;
          if (cachedLogs.length > 0) recoveryPayload.consumptionLogs = cachedLogs;

          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recoveryPayload),
          })
            .then((r) => r.json())
            .then((syncRes) => {
              if (syncRes?.db) applyServerSnapshot(syncRes.db, { isMutationResponse: true });
            })
            .catch(() => {});
        }
      }
    } catch {
      setIsSyncedWithServer(false);
    } finally {
      if (isInitial) {
        setIsInitialServerHydrated(true);
      }
    }
  }, [applyServerSnapshot]);

  // Pre-render initialization + Real-time SSE connection + 2-second polling fallback
  useEffect(() => {
    let isMounted = true;

    // Prioritize fetching /api/state and storing in sessionStorage BEFORE rendering children
    fetchServerState(true).finally(() => {
      if (isMounted) {
        setIsInitialServerHydrated(true);
      }
    });

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          applyServerSnapshot(parsed);
        } catch {}
      };
      eventSource.onerror = () => {
        // Fallback polling continues seamlessly if SSE reconnects
      };
    } catch {}

    const interval = setInterval(() => {
      fetchServerState(false);
    }, 2000);

    const onFocus = () => fetchServerState(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [fetchServerState, applyServerSnapshot]);

  const syncNow = async () => {
    await fetchServerState(false);
  };

  const login = (username: string, password: string) => {
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    const matched = users.find(
      (u) =>
        u.username.toLowerCase() === trimmedUser.toLowerCase() &&
        (u.username.toLowerCase() === 'admin' ? trimmedPass === 'admin123' : u.password === trimmedPass)
    );

    if (!matched) {
      return {
        success: false,
        error: 'Pogrešno korisničko ime ili lozinka. Pokušajte ponovo.',
      };
    }

    const authUser: User = {
      id: matched.id,
      username: matched.username,
      fullName: matched.fullName,
      role: matched.role,
      permissions: matched.permissions,
    };

    setCurrentUser(authUser);
    try {
      const serialized = JSON.stringify(authUser);
      sessionStorage.setItem(SESSION_USER_KEY, serialized);
      localStorage.setItem(SESSION_USER_KEY, serialized);
    } catch {}
    fetchServerState(false);
    return { success: true };
  };

  // Keep currentUser synchronized with latest worker record from server
  useEffect(() => {
    if (currentUser) {
      const fresh = users.find(
        (u) => u.id === currentUser.id || u.username.toLowerCase() === currentUser.username.toLowerCase()
      );
      if (fresh) {
        const permissionsChanged = JSON.stringify(fresh.permissions || {}) !== JSON.stringify(currentUser.permissions || {});
        if (permissionsChanged || fresh.fullName !== currentUser.fullName) {
          const updatedUser: User = {
            ...currentUser,
            fullName: fresh.fullName,
            permissions: fresh.permissions,
          };
          setCurrentUser(updatedUser);
          try {
            const serialized = JSON.stringify(updatedUser);
            sessionStorage.setItem(SESSION_USER_KEY, serialized);
            localStorage.setItem(SESSION_USER_KEY, serialized);
          } catch {}
        }
      }
    }
  }, [users, currentUser]);

  const logout = () => {
    setCurrentUser(null);
    try {
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
    } catch {}
  };

  const getNowFormatted = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Add Worker
  const addWorker = (worker: { username: string; fullName: string; password: string; permissions?: WorkerPermissions; hourlyRate?: number }) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može unositi radnike.' };
    }

    const trimmedUser = worker.username.trim();
    const trimmedName = worker.fullName.trim();
    const trimmedPass = worker.password.trim();

    if (!trimmedUser || !trimmedName || !trimmedPass) {
      return { success: false, error: 'Sva polja su obavezna.' };
    }

    const exists = users.some((u) => u.username.toLowerCase() === trimmedUser.toLowerCase());
    if (exists) {
      return { success: false, error: 'Korisničko ime već postoji u sistemu. Izaberite drugo.' };
    }

    const newWorker: User = {
      id: `user-${Date.now()}`,
      username: trimmedUser,
      fullName: trimmedName,
      role: 'worker',
      password: trimmedPass,
      permissions: worker.permissions || {},
      hourlyRate: worker.hourlyRate !== undefined ? Number(worker.hourlyRate) : 15,
      createdAt: getNowFormatted().split(' ')[0],
    };

    deletedWorkersRef.current.delete(newWorker.id);
    syncTombstonesToSession();
    setUsers((prev) => {
      const next = [...prev, newWorker];
      writeCachedArray(SESSION_USERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWorker),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(console.error)
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Update Worker
  const updateWorker = (id: string, updates: Partial<{ username: string; fullName: string; password: string; permissions: WorkerPermissions; hourlyRate?: number }>) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može mijenjati radnike.' };
    }

    setUsers((prev) => {
      const next = prev.map((u) => {
        if (u.id !== id) return u;
        return {
          ...u,
          fullName: updates.fullName !== undefined ? updates.fullName.trim() : u.fullName,
          username: updates.username !== undefined ? updates.username.trim() : u.username,
          password: updates.password !== undefined ? updates.password.trim() : u.password,
          permissions: updates.permissions !== undefined ? updates.permissions : u.permissions,
          hourlyRate: updates.hourlyRate !== undefined ? Number(updates.hourlyRate) : u.hourlyRate,
        };
      });
      writeCachedArray(SESSION_USERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/workers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  const hasPermission = useCallback(
    (permissionKey: keyof WorkerPermissions): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      return Boolean(currentUser.permissions?.[permissionKey]);
    },
    [currentUser]
  );

  // Delete Worker
  const deleteWorker = (id: string) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može brisati radnike.' };
    }

    const targetUser = users.find((u) => u.id === id);
    if (targetUser?.role === 'admin') {
      return { success: false, error: 'Glavni administrator se ne može obrisati.' };
    }

    deletedWorkersRef.current.add(id);
    syncTombstonesToSession();
    setUsers((prev) => {
      const next = prev.filter((u) => u.id !== id);
      writeCachedArray(SESSION_USERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/workers/${id}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Add work order -> Administrator ili radnik sa dozvolom canCreateOrders
  const addWorkOrder = (order: Omit<WorkOrder, 'id' | 'createdAt'>) => {
    const isAdmin = currentUser?.role === 'admin';
    const canCreate = isAdmin || Boolean(currentUser?.permissions?.canCreateOrders);
    if (!currentUser || !canCreate) {
      return { success: false, error: 'Nemate ovlašćenje za kreiranje novog radnog naloga.' };
    }

    // Strict validation: planned materials cannot exceed warehouse stock
    if (Array.isArray(order.plannedMaterials)) {
      for (const p of order.plannedMaterials) {
        if (p.materialId && p.quantity && p.quantity > 0) {
          const mat = materials.find((m) => m.id === p.materialId);
          if (mat && p.quantity > mat.currentStock) {
            return {
              success: false,
              error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a unijeto je ${p.quantity} ${mat.unit}.`,
            };
          }
        }
      }
    }

    const assigned = order.assignedWorkers || [];
    const uniqueId = `wo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    deletedOrdersRef.current.delete(uniqueId);
    if (order.orderNumber) {
      deletedOrdersRef.current.delete(order.orderNumber);
    }
    syncTombstonesToSession();

    const newOrder: WorkOrder = {
      ...order,
      assignedWorkers: assigned,
      id: uniqueId,
      createdAt: getNowFormatted(),
      status: order.status || 'priprema',
      createdBy: {
        username: currentUser.username,
        fullName: currentUser.fullName,
        timestamp: getNowFormatted(),
      },
      sastavnica: {
        status: 'nije_napravljena',
      },
    };

    setWorkOrders((prev) => {
      const next = [newOrder, ...(prev || []).filter((o) => o.id !== newOrder.id)];
      writeCachedArray(SESSION_ORDERS_KEY, next, false);
      return next;
    });
    setHasNewOrderNotification(true);

    // Save directly to server-db.json
    pendingMutationsRef.current += 1;
    fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch((err) => {
        console.warn('Network error posting work order to server:', err);
      })
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Update work order
  const updateWorkOrder = (id: string, updates: Partial<WorkOrder>) => {
    // Strict validation: planned materials cannot exceed warehouse stock
    if (Array.isArray(updates.plannedMaterials)) {
      for (const p of updates.plannedMaterials) {
        if (p.materialId && p.quantity && p.quantity > 0) {
          const mat = materials.find((m) => m.id === p.materialId);
          if (mat && p.quantity > mat.currentStock) {
            return {
              success: false,
              error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a unijeto je ${p.quantity} ${mat.unit}.`,
            };
          }
        }
      }
    }

    const payloadUpdates: Partial<WorkOrder> = { ...updates };
    if (updates.status === 'zavrseno') {
      if (!payloadUpdates.completedAt) {
        payloadUpdates.completedAt = getNowFormatted();
      }
      if (!payloadUpdates.closedBy && currentUser) {
        payloadUpdates.closedBy = {
          username: currentUser.username,
          fullName: currentUser.fullName,
          timestamp: payloadUpdates.completedAt,
        };
      }
    }

    setWorkOrders((prev) => {
      const next = prev.map((order) => {
        if (order.id !== id) return order;
        const updated = { ...order, ...payloadUpdates };
        if (updates.status && updates.status !== 'zavrseno') {
          updated.completedAt = undefined;
          updated.closedBy = undefined;
        }
        return updated;
      });
      writeCachedArray(SESSION_ORDERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadUpdates),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Release order from Model Preparation to Production ("Pusti u rad / Prosledi radnicima")
  const releaseOrderToProduction = (orderId: string) => {
    const canPrep = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canPrepareModels);
    if (!currentUser || !canPrep) {
      return { success: false, error: 'Nemate ovlašćenje za puštanje radnog naloga iz pripreme.' };
    }
    const order = workOrders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, error: 'Radni nalog nije pronađen.' };
    }

    const updatedPrep = {
      ...(order.modelPreparation || {}),
      isReady: true,
      readyAt: getNowFormatted(),
      readyBy: currentUser.fullName,
    };

    const updates: Partial<WorkOrder> = {
      status: 'na_cekanju',
      modelPreparation: updatedPrep,
    };

    const res = updateWorkOrder(orderId, updates);
    if (res.success) {
      setHasNewOrderNotification(true);
    }
    return res;
  };

  // Delete work order / model preparation permanently on server
  const deleteWorkOrder = async (id: string) => {
    const canDelete = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canDeleteOrders);
    if (!currentUser || !canDelete) {
      return { success: false, error: 'Nemate ovlašćenje za brisanje radnih naloga.' };
    }

    const targetOrder = workOrders.find((o) => o.id === id);
    const targetId = targetOrder?.id || id;

    deletedOrdersRef.current.add(targetId);
    if (id) deletedOrdersRef.current.add(id);
    syncTombstonesToSession();

    setWorkOrders((prev) => {
      const next = (prev || []).filter((order) => order.id !== targetId && order.id !== id);
      writeCachedArray(SESSION_ORDERS_KEY, next, true);
      return next;
    });

    pendingMutationsRef.current += 1;
    try {
      const res = await fetch(`/api/work-orders/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      }
    } catch (err) {
      console.warn('Network error while deleting on server:', err);
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }

    return { success: true };
  };

  // Update Sastavnica
  const updateSastavnica = (workOrderId: string, sastavnica: SastavnicaInfo) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može evidentirati sastavnicu.' };
    }

    const payload = {
      ...sastavnica,
      evidentiranoDatum: sastavnica.evidentiranoDatum || getNowFormatted(),
    };

    setWorkOrders((prev) => {
      const next = prev.map((order) => {
        if (order.id !== workOrderId) return order;
        return {
          ...order,
          sastavnica: payload,
        };
      });
      writeCachedArray(SESSION_ORDERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/work-orders/${workOrderId}/sastavnica`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sastavnica: payload }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Report Stoppage / Delay (Radnik ili Administrator)
  const reportStoppage = (workOrderId: string, reason: string, description?: string) => {
    if (!currentUser) {
      return { success: false, error: 'Morate biti prijavljeni.' };
    }
    const order = workOrders.find((o) => o.id === workOrderId);
    if (!order) {
      return { success: false, error: 'Radni nalog nije pronađen.' };
    }

    const stoppage: StoppageInfo = {
      reason: reason.trim(),
      description: description?.trim() || '',
      reportedBy: currentUser.username,
      reportedByName: currentUser.fullName,
      reportedAt: getNowFormatted(),
      resolved: false,
    };

    const updatedHistory = Array.isArray(order.stoppageHistory)
      ? [stoppage, ...order.stoppageHistory]
      : [stoppage];

    setWorkOrders((prev) => {
      const next = prev.map((o) =>
        o.id === workOrderId
          ? { ...o, stoppage, stoppageHistory: updatedHistory }
          : o
      );
      writeCachedArray(SESSION_ORDERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/work-orders/${workOrderId}/stoppage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stoppage, stoppageHistory: updatedHistory }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Resolve Stoppage (Otkloni zastoj)
  const resolveStoppage = (workOrderId: string, resolutionNote?: string) => {
    if (!currentUser) {
      return { success: false, error: 'Morate biti prijavljeni.' };
    }
    const order = workOrders.find((o) => o.id === workOrderId);
    if (!order || !order.stoppage) {
      return { success: false, error: 'Aktivni zastoj nije pronađen.' };
    }

    const resolvedStoppage: StoppageInfo = {
      ...order.stoppage,
      resolved: true,
      resolvedAt: getNowFormatted(),
      resolvedBy: currentUser.username,
      resolvedByName: currentUser.fullName,
      resolutionNote: resolutionNote?.trim() || 'Zastoj je uspješno otklonjen i rad se nastavlja.',
    };

    const updatedHistory = Array.isArray(order.stoppageHistory)
      ? order.stoppageHistory.map((s, idx) => (idx === 0 ? resolvedStoppage : s))
      : [resolvedStoppage];

    setWorkOrders((prev) => {
      const next = prev.map((o) =>
        o.id === workOrderId
          ? { ...o, stoppage: undefined, stoppageHistory: updatedHistory }
          : o
      );
      writeCachedArray(SESSION_ORDERS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/work-orders/${workOrderId}/stoppage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stoppage: null, stoppageHistory: updatedHistory }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Add Material
  const addMaterial = (material: Omit<Material, 'id' | 'lastUpdated'>) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za dodavanje novog materijala.' };
    }

    const uniqueMatId = `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    deletedMaterialsRef.current.delete(uniqueMatId);
    syncTombstonesToSession();

    const newMaterial: Material = {
      ...material,
      id: uniqueMatId,
      lastUpdated: getNowFormatted(),
      createdBy: {
        username: currentUser.username,
        fullName: currentUser.fullName,
        timestamp: getNowFormatted(),
      },
    };

    setMaterials((prev) => {
      const next = [newMaterial, ...prev];
      writeCachedArray(SESSION_MATERIALS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMaterial),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Update Material
  const updateMaterial = (id: string, updates: Partial<Material>) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za izmjenu materijala.' };
    }

    const updatePayload = { ...updates, lastUpdated: getNowFormatted() };

    setMaterials((prev) => {
      const next = prev.map((mat) => (mat.id === id ? { ...mat, ...updatePayload } : mat));
      writeCachedArray(SESSION_MATERIALS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/materials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Delete Material
  const deleteMaterial = (id: string) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za brisanje materijala.' };
    }

    deletedMaterialsRef.current.add(id);
    syncTombstonesToSession();
    setMaterials((prev) => {
      const next = prev.filter((mat) => mat.id !== id);
      writeCachedArray(SESSION_MATERIALS_KEY, next, true);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/materials/${id}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Record work completion & consumption
  const recordWorkCompletion = ({
    workOrderId,
    materials: enteredMaterials,
    hoursSpent,
    minutesSpent,
    note,
    markAsCompleted,
  }: {
    workOrderId: string;
    materials: MultiMaterialEntry[];
    hoursSpent: number;
    minutesSpent: number;
    note?: string;
    markAsCompleted: boolean;
  }) => {
    if (!currentUser) {
      return { success: false, error: 'Niste prijavljeni.' };
    }

    const targetOrder = workOrders.find((w) => w.id === workOrderId);
    if (!targetOrder) {
      return { success: false, error: 'Radni nalog nije pronađen.' };
    }

    const parsedHours = Math.max(0, Number(hoursSpent) || 0);
    const parsedMinutes = Math.max(0, Number(minutesSpent) || 0);

    const validMaterials = enteredMaterials.filter(
      (m) => m.materialId && Number(m.quantity) > 0
    );

    for (const item of validMaterials) {
      const mat = materials.find((m) => m.id === item.materialId);
      if (!mat) {
        return { success: false, error: 'Odabrani materijal ne postoji u bazi.' };
      }
      if (item.quantity > mat.currentStock) {
        return {
          success: false,
          error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a uneto je ${item.quantity} ${mat.unit}.`,
        };
      }
    }

    const timestamp = getNowFormatted();
    let newLogs: ConsumptionLog[] = [];

    if (validMaterials.length > 0) {
      setMaterials((prev) => {
        const next = prev.map((mat) => {
          const used = validMaterials.find((m) => m.materialId === mat.id);
          if (!used) return mat;
          const newStock = Math.max(0, Number((mat.currentStock - used.quantity).toFixed(4)));
          return {
            ...mat,
            currentStock: newStock,
            lastUpdated: timestamp,
          };
        });
        writeCachedArray(SESSION_MATERIALS_KEY, next, false);
        return next;
      });

      newLogs = validMaterials.map((used, idx) => {
        const mat = materials.find((m) => m.id === used.materialId)!;
        return {
          id: `log-${Date.now()}-${idx}`,
          workOrderId: targetOrder.id,
          workOrderNumber: targetOrder.orderNumber,
          workOrderTitle: targetOrder.title,
          customer: targetOrder.customer,
          workerUsername: currentUser.username,
          workerName: currentUser.fullName,
          materialId: mat.id,
          materialName: mat.name,
          quantity: used.quantity,
          unit: mat.unit,
          hoursSpent: idx === 0 ? parsedHours : 0,
          minutesSpent: idx === 0 ? parsedMinutes : 0,
          note: note?.trim(),
          timestamp,
        };
      });

      setConsumptionLogs((prev) => {
        const next = [...newLogs, ...prev];
        writeCachedArray(SESSION_LOGS_KEY, next, false);
        return next;
      });
    } else {
      const timeLog: ConsumptionLog = {
        id: `log-${Date.now()}`,
        workOrderId: targetOrder.id,
        workOrderNumber: targetOrder.orderNumber,
        workOrderTitle: targetOrder.title,
        customer: targetOrder.customer,
        workerUsername: currentUser.username,
        workerName: currentUser.fullName,
        materialId: 'none',
        materialName: 'Bez utroška materijala',
        quantity: 0,
        unit: 'kom',
        hoursSpent: parsedHours,
        minutesSpent: parsedMinutes,
        note: note?.trim(),
        timestamp,
      };
      newLogs = [timeLog];
      setConsumptionLogs((prev) => {
        const next = [timeLog, ...prev];
        writeCachedArray(SESSION_LOGS_KEY, next, false);
        return next;
      });
    }

    let statusToUpdate: 'zavrseno' | 'u_izradi' | undefined = undefined;
    let closedByObj = undefined;

    if (markAsCompleted) {
      statusToUpdate = 'zavrseno';
      const isAlreadyAssigned = targetOrder.assignedWorkers.includes(currentUser.username);
      const newAssignedWorkers = isAlreadyAssigned
        ? targetOrder.assignedWorkers
        : [...targetOrder.assignedWorkers, currentUser.username];

      closedByObj = {
        username: currentUser.username,
        fullName: currentUser.fullName,
        timestamp,
      };

      updateWorkOrder(targetOrder.id, {
        status: 'zavrseno',
        completedAt: timestamp,
        assignedWorkers: newAssignedWorkers,
        closedBy: closedByObj,
      });
    } else if (targetOrder.status === 'na_cekanju') {
      statusToUpdate = 'u_izradi';
      updateWorkOrder(targetOrder.id, { status: 'u_izradi' });
    }

    // Push to backend server-db.json
    pendingMutationsRef.current += 1;
    fetch('/api/consumption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logs: newLogs,
        workOrderId: targetOrder.id,
        closedBy: closedByObj,
        status: statusToUpdate,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  // Admin exclusive edit of consumed quantities
  const adminUpdateConsumptionQuantity = (logId: string, newQuantity: number) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može mijenjati utrošene količine.' };
    }

    const log = consumptionLogs.find((l) => l.id === logId);
    if (!log) {
      return { success: false, error: 'Zapis utroška nije pronađen.' };
    }

    const diff = newQuantity - log.quantity;

    if (log.materialId !== 'none') {
      setMaterials((prev) => {
        const next = prev.map((mat) => {
          if (mat.id !== log.materialId) return mat;
          const updatedStock = Math.max(0, Number((mat.currentStock - diff).toFixed(4)));
          return {
            ...mat,
            currentStock: updatedStock,
            lastUpdated: getNowFormatted(),
          };
        });
        writeCachedArray(SESSION_MATERIALS_KEY, next, false);
        return next;
      });
    }

    setConsumptionLogs((prev) => {
      const next = prev.map((l) => (l.id === logId ? { ...l, quantity: newQuantity } : l));
      writeCachedArray(SESSION_LOGS_KEY, next, false);
      return next;
    });

    pendingMutationsRef.current += 1;
    fetch(`/api/consumption/${logId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });

    return { success: true };
  };

  const resetToDefaultData = () => {
    if (currentUser?.role !== 'admin') return;
    allowAdminResetRef.current = true;
    serverVersionRef.current = 0;
    setUsers(SYSTEM_USERS);
    setWorkOrders([]);
    setMaterials([]);
    setConsumptionLogs([]);
    deletedOrdersRef.current.clear();
    deletedMaterialsRef.current.clear();
    deletedWorkersRef.current.clear();
    syncTombstonesToSession();
    writeCachedArray(SESSION_ORDERS_KEY, [], true);
    writeCachedArray(SESSION_MATERIALS_KEY, [], true);
    writeCachedArray(SESSION_LOGS_KEY, [], true);

    pendingMutationsRef.current += 1;
    fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmAdminReset: true, role: 'admin' }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db, { isMutationResponse: true });
      })
      .catch(() => {})
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      });
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        login,
        logout,
        users,
        addWorker,
        updateWorker,
        deleteWorker,
        workOrders,
        addWorkOrder,
        updateWorkOrder,
        deleteWorkOrder,
        updateSastavnica,
        reportStoppage,
        resolveStoppage,
        releaseOrderToProduction,
        isWorkOrderModalOpen,
        selectedOrderToEdit,
        openCreateWorkOrderModal,
        closeWorkOrderModal,
        materials,
        addMaterial,
        updateMaterial,
        deleteMaterial,
        consumptionLogs,
        recordWorkCompletion,
        adminUpdateConsumptionQuantity,
        hasNewOrderNotification,
        clearNewOrderNotification,
        isSyncedWithServer,
        syncNow,
        resetToDefaultData,
        hasPermission,
      }}
    >
      {isInitialServerHydrated ? (
        children
      ) : (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-300">Učitavanje podataka sa servera...</p>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
