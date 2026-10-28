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

// Legacy localStorage keys to purge on startup so browser cache never causes out-of-sync data
const LEGACY_DATA_KEYS = [
  'rn_users_list_v5',
  'rn_work_orders_v5',
  'rn_materials_v5',
  'rn_consumption_logs_v5',
  'rn_deleted_orders_v5',
  'rn_current_user_v5',
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Purge any old localStorage caches on mount so Phone & Desktop strictly use server-db.json
  useEffect(() => {
    try {
      LEGACY_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {}
  }, []);

  // Authoritative tombstone set from server-db.json
  const deletedOrdersRef = useRef<Set<string>>(new Set<string>());

  // Pure in-memory states backed 100% by server-db.json
  const [users, setUsers] = useState<User[]>(SYSTEM_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(INITIAL_WORK_ORDERS);
  const [materials, setMaterials] = useState<Material[]>(INITIAL_MATERIALS);
  const [consumptionLogs, setConsumptionLogs] = useState<ConsumptionLog[]>(INITIAL_CONSUMPTION_LOGS);

  // Global Work Order creation modal (for mobile button, header button, floating button, table)
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [selectedOrderToEdit, setSelectedOrderToEdit] = useState<WorkOrder | null>(null);

  // Notification for new orders
  const [hasNewOrderNotification, setHasNewOrderNotification] = useState<boolean>(false);
  const [isSyncedWithServer, setIsSyncedWithServer] = useState<boolean>(true);
  const previousOrdersCountRef = useRef<number>(0);

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

  // Authoritative state applier: directly mirrors server-db.json onto client state
  const applyServerSnapshot = useCallback((data: any) => {
    if (!data || typeof data !== 'object') return;
    setIsSyncedWithServer(true);

    if (Array.isArray(data.deletedOrderIds)) {
      deletedOrdersRef.current = new Set(data.deletedOrderIds.filter(Boolean));
    }

    if (Array.isArray(data.users) && data.users.length > 0) {
      const sanitizedUsers = data.users.map((u: any) =>
        u.username?.toLowerCase() === 'admin' ? { ...u, password: 'admin123' } : u
      );
      setUsers(sanitizedUsers);
    }

    if (Array.isArray(data.workOrders)) {
      const validServerOrders = data.workOrders.filter((o: WorkOrder) => {
        if (!o || !o.id) return false;
        if (deletedOrdersRef.current.has(o.id)) return false;
        return true;
      });
      setWorkOrders(validServerOrders);

      if (validServerOrders.length > previousOrdersCountRef.current && previousOrdersCountRef.current > 0) {
        setHasNewOrderNotification(true);
      }
      previousOrdersCountRef.current = validServerOrders.length;
    }

    if (Array.isArray(data.materials)) {
      setMaterials(data.materials);
    }

    if (Array.isArray(data.consumptionLogs)) {
      setConsumptionLogs(data.consumptionLogs);
    }
  }, []);

  // Central Sync Engine: Fetch live state directly from server-db.json
  const fetchServerState = useCallback(async () => {
    try {
      const res = await fetch(`/api/state?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      applyServerSnapshot(data);
    } catch {
      setIsSyncedWithServer(false);
    }
  }, [applyServerSnapshot]);

  // Real-time SSE connection + 2-second polling fallback so Phone & Desktop are 100% identical in real time
  useEffect(() => {
    fetchServerState();

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
      fetchServerState();
    }, 2000);

    const onFocus = () => fetchServerState();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [fetchServerState, applyServerSnapshot]);

  const syncNow = async () => {
    await fetchServerState();
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
    fetchServerState();
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
          setCurrentUser((prev) =>
            prev
              ? {
                  ...prev,
                  fullName: fresh.fullName,
                  permissions: fresh.permissions,
                }
              : null
          );
        }
      }
    }
  }, [users, currentUser]);

  const logout = () => {
    setCurrentUser(null);
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

    setUsers((prev) => [...prev, newWorker]);

    fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWorker),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(console.error);

    return { success: true };
  };

  // Update Worker
  const updateWorker = (id: string, updates: Partial<{ username: string; fullName: string; password: string; permissions: WorkerPermissions; hourlyRate?: number }>) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Samo administrator može mijenjati radnike.' };
    }

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        return {
          ...u,
          fullName: updates.fullName !== undefined ? updates.fullName.trim() : u.fullName,
          username: updates.username !== undefined ? updates.username.trim() : u.username,
          password: updates.password !== undefined ? updates.password.trim() : u.password,
          permissions: updates.permissions !== undefined ? updates.permissions : u.permissions,
          hourlyRate: updates.hourlyRate !== undefined ? Number(updates.hourlyRate) : u.hourlyRate,
        };
      })
    );

    fetch(`/api/workers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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

    setUsers((prev) => prev.filter((u) => u.id !== id));

    fetch(`/api/workers/${id}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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

    setWorkOrders((prev) => [newOrder, ...(prev || []).filter((o) => o.id !== newOrder.id)]);
    setHasNewOrderNotification(true);

    // Save directly to server-db.json
    fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch((err) => {
        console.warn('Network error posting work order to server:', err);
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

    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id !== id) return order;
        const updated = { ...order, ...payloadUpdates };
        if (updates.status && updates.status !== 'zavrseno') {
          updated.completedAt = undefined;
          updated.closedBy = undefined;
        }
        return updated;
      })
    );

    fetch(`/api/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadUpdates),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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

    setWorkOrders((prev) => (prev || []).filter((order) => order.id !== targetId && order.id !== id));

    try {
      const res = await fetch(`/api/work-orders/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.db) applyServerSnapshot(data.db);
      }
    } catch (err) {
      console.warn('Network error while deleting on server:', err);
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

    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id !== workOrderId) return order;
        return {
          ...order,
          sastavnica: payload,
        };
      })
    );

    fetch(`/api/work-orders/${workOrderId}/sastavnica`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sastavnica: payload }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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

    setWorkOrders((prev) =>
      prev.map((o) =>
        o.id === workOrderId
          ? { ...o, stoppage, stoppageHistory: updatedHistory }
          : o
      )
    );

    fetch(`/api/work-orders/${workOrderId}/stoppage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stoppage, stoppageHistory: updatedHistory }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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

    setWorkOrders((prev) =>
      prev.map((o) =>
        o.id === workOrderId
          ? { ...o, stoppage: undefined, stoppageHistory: updatedHistory }
          : o
      )
    );

    fetch(`/api/work-orders/${workOrderId}/stoppage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stoppage: null, stoppageHistory: updatedHistory }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

    return { success: true };
  };

  // Add Material
  const addMaterial = (material: Omit<Material, 'id' | 'lastUpdated'>) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za dodavanje novog materijala.' };
    }

    const newMaterial: Material = {
      ...material,
      id: `mat-${Date.now()}`,
      lastUpdated: getNowFormatted(),
      createdBy: {
        username: currentUser.username,
        fullName: currentUser.fullName,
        timestamp: getNowFormatted(),
      },
    };

    setMaterials((prev) => [newMaterial, ...prev]);

    fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMaterial),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

    return { success: true };
  };

  // Update Material
  const updateMaterial = (id: string, updates: Partial<Material>) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za izmjenu materijala.' };
    }

    const updatePayload = { ...updates, lastUpdated: getNowFormatted() };

    setMaterials((prev) =>
      prev.map((mat) => (mat.id === id ? { ...mat, ...updatePayload } : mat))
    );

    fetch(`/api/materials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

    return { success: true };
  };

  // Delete Material
  const deleteMaterial = (id: string) => {
    const canManage = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canManageMaterials);
    if (!currentUser || !canManage) {
      return { success: false, error: 'Nemate ovlašćenje za brisanje materijala.' };
    }

    setMaterials((prev) => prev.filter((mat) => mat.id !== id));

    fetch(`/api/materials/${id}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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
      setMaterials((prev) =>
        prev.map((mat) => {
          const used = validMaterials.find((m) => m.materialId === mat.id);
          if (!used) return mat;
          const newStock = Math.max(0, Number((mat.currentStock - used.quantity).toFixed(4)));
          return {
            ...mat,
            currentStock: newStock,
            lastUpdated: timestamp,
          };
        })
      );

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

      setConsumptionLogs((prev) => [...newLogs, ...prev]);
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
      setConsumptionLogs((prev) => [timeLog, ...prev]);
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
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

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
      setMaterials((prev) =>
        prev.map((mat) => {
          if (mat.id !== log.materialId) return mat;
          const updatedStock = Math.max(0, Number((mat.currentStock - diff).toFixed(4)));
          return {
            ...mat,
            currentStock: updatedStock,
            lastUpdated: getNowFormatted(),
          };
        })
      );
    }

    setConsumptionLogs((prev) =>
      prev.map((l) => (l.id === logId ? { ...l, quantity: newQuantity } : l))
    );

    fetch(`/api/consumption/${logId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});

    return { success: true };
  };

  const resetToDefaultData = () => {
    setUsers(SYSTEM_USERS);
    setWorkOrders([]);
    setMaterials([]);
    setConsumptionLogs([]);
    deletedOrdersRef.current.clear();

    fetch('/api/reset', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.db) applyServerSnapshot(data.db);
      })
      .catch(() => {});
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
      {children}
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
