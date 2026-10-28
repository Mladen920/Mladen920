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

const STORAGE_KEYS = {
  USER: 'rn_current_user_v5',
  USERS_LIST: 'rn_users_list_v5',
  WORK_ORDERS: 'rn_work_orders_v5',
  MATERIALS: 'rn_materials_v5',
  CONSUMPTION_LOGS: 'rn_consumption_logs_v5',
  DELETED_ORDERS: 'rn_deleted_orders_v5',
};

const getInitialDeletedOrderIds = (): Set<string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.DELETED_ORDERS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {}
  return new Set<string>();
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ref for deleted order IDs to immediately prevent resurrecting deleted orders/preparations
  const deletedOrdersRef = useRef<Set<string>>(getInitialDeletedOrderIds());

  // Local states
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS_LIST);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((u: User) =>
            u.username.toLowerCase() === 'admin' ? { ...u, password: 'admin123' } : u
          );
        }
      }
      return SYSTEM_USERS;
    } catch {
      return SYSTEM_USERS;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USER);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => {
    try {
      const deletedSet = getInitialDeletedOrderIds();
      const saved = localStorage.getItem(STORAGE_KEYS.WORK_ORDERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((o: WorkOrder) => o && o.id && !deletedSet.has(o.id));
        }
      }
      return INITIAL_WORK_ORDERS.filter((o) => o && o.id && !deletedSet.has(o.id));
    } catch {
      return INITIAL_WORK_ORDERS;
    }
  });

  const [materials, setMaterials] = useState<Material[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MATERIALS);
      return saved ? JSON.parse(saved) : INITIAL_MATERIALS;
    } catch {
      return INITIAL_MATERIALS;
    }
  });

  const [consumptionLogs, setConsumptionLogs] = useState<ConsumptionLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONSUMPTION_LOGS);
      return saved ? JSON.parse(saved) : INITIAL_CONSUMPTION_LOGS;
    } catch {
      return INITIAL_CONSUMPTION_LOGS;
    }
  });

  // Global Work Order creation modal (for mobile button, header button, floating button, table)
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [selectedOrderToEdit, setSelectedOrderToEdit] = useState<WorkOrder | null>(null);

  // Notification for new orders
  const [hasNewOrderNotification, setHasNewOrderNotification] = useState<boolean>(false);
  const [isSyncedWithServer, setIsSyncedWithServer] = useState<boolean>(true);
  const serverVersionRef = useRef<number>(0);
  const previousOrdersCountRef = useRef<number>(workOrders.length);

  // Local storage cache updates
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS_LIST, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORK_ORDERS, JSON.stringify(workOrders));
  }, [workOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONSUMPTION_LOGS, JSON.stringify(consumptionLogs));
  }, [consumptionLogs]);

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

  const workOrdersRef = useRef(workOrders);
  workOrdersRef.current = workOrders;
  const materialsRef = useRef(materials);
  materialsRef.current = materials;
  const usersRef = useRef(users);
  usersRef.current = users;
  const consumptionLogsRef = useRef(consumptionLogs);
  consumptionLogsRef.current = consumptionLogs;

  // Central Sync Engine: Fetch live state from backend safely without deleting local records
  const fetchServerState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      setIsSyncedWithServer(true);
      
      if (data.version && data.version >= serverVersionRef.current) {
        serverVersionRef.current = data.version;

        if (Array.isArray(data.users) && data.users.length > 0) {
          const sanitizedUsers = data.users.map((u: any) =>
            u.username?.toLowerCase() === 'admin' ? { ...u, password: 'admin123' } : u
          );
          setUsers((prev) => {
            const userMap = new Map<string, User>();
            prev.forEach((u) => userMap.set(u.id, u));
            sanitizedUsers.forEach((u: User) => userMap.set(u.id, { ...userMap.get(u.id), ...u }));
            return Array.from(userMap.values());
          });
        }

        if (Array.isArray(data.deletedOrderIds)) {
          let updatedTombstones = false;
          data.deletedOrderIds.forEach((id: string) => {
            if (id && !deletedOrdersRef.current.has(id)) {
              deletedOrdersRef.current.add(id);
              updatedTombstones = true;
            }
          });
          if (updatedTombstones) {
            try {
              localStorage.setItem(STORAGE_KEYS.DELETED_ORDERS, JSON.stringify(Array.from(deletedOrdersRef.current)));
            } catch {}
          }
        }

        if (Array.isArray(data.workOrders)) {
          // Strictly exclude any work orders or preparations that have been explicitly deleted!
          const validServerOrders = data.workOrders.filter((o: WorkOrder) => {
            if (!o || !o.id) return false;
            if (deletedOrdersRef.current.has(o.id)) return false;
            return true;
          });

          setWorkOrders((prev) => {
            // Safety guard: If server temporarily returned 0 orders, NEVER wipe client local orders!
            if (validServerOrders.length === 0 && (prev || []).length > 0) {
              return prev;
            }

            const orderMap = new Map<string, WorkOrder>();
            // 1. Keep existing client orders first so nothing in memory or local storage is lost
            (prev || []).forEach((o: WorkOrder) => {
              if (o && o.id && !deletedOrdersRef.current.has(o.id)) {
                orderMap.set(o.id, o);
              }
            });

            // 2. Merge server orders
            validServerOrders.forEach((o: WorkOrder) => {
              const existing = orderMap.get(o.id);
              orderMap.set(o.id, { ...existing, ...o });
            });

            const merged = Array.from(orderMap.values());
            try {
              localStorage.setItem(STORAGE_KEYS.WORK_ORDERS, JSON.stringify(merged));
            } catch {}
            return merged;
          });

          if (validServerOrders.length > previousOrdersCountRef.current && previousOrdersCountRef.current > 0) {
            setHasNewOrderNotification(true);
          }
          previousOrdersCountRef.current = validServerOrders.length;
        }

        if (Array.isArray(data.materials) && data.materials.length > 0) {
          setMaterials((prev) => {
            const matMap = new Map<string, Material>();
            (prev || []).forEach((m) => matMap.set(m.id, m));
            data.materials.forEach((m: Material) => matMap.set(m.id, { ...matMap.get(m.id), ...m }));
            return Array.from(matMap.values());
          });
        }

        if (Array.isArray(data.consumptionLogs) && data.consumptionLogs.length > 0) {
          setConsumptionLogs((prev) => {
            const logMap = new Map<string, ConsumptionLog>();
            (prev || []).forEach((l) => logMap.set(l.id, l));
            data.consumptionLogs.forEach((l: ConsumptionLog) => logMap.set(l.id, l));
            return Array.from(logMap.values());
          });
        }

        setIsSyncedWithServer(true);
      }
    } catch {
      // Offline fallback: keep local storage
      setIsSyncedWithServer(false);
    }
  }, []);

  // Periodic polling to keep Phone & Desktop completely in sync
  useEffect(() => {
    fetchServerState();
    const interval = setInterval(() => {
      fetchServerState();
    }, 3000);

    const onFocus = () => fetchServerState();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [fetchServerState]);

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
    return { success: true };
  };

  // Keep currentUser synchronized with latest worker record in state
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

    // Send to central server
    fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWorker),
    }).catch(console.error);

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
    }).catch(() => {});

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
    }).catch(() => {});

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

    // Remove new unique ID and orderNumber from tombstones
    deletedOrdersRef.current.delete(uniqueId);
    if (order.orderNumber) {
      deletedOrdersRef.current.delete(order.orderNumber);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_ORDERS, JSON.stringify(Array.from(deletedOrdersRef.current)));
    } catch {}

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
      const next = [newOrder, ...(prev || []).filter(o => o.id !== newOrder.id)];
      try {
        localStorage.setItem(STORAGE_KEYS.WORK_ORDERS, JSON.stringify(next));
      } catch {}
      return next;
    });
    setHasNewOrderNotification(true);

    // Sync to backend so Desktop and Phone see it immediately
    fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    }).catch((err) => {
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

    setWorkOrders((prev) =>
      prev.map((order) => {
        if (order.id !== id) return order;
        const updated = { ...order, ...updates };
        if (updates.status === 'zavrseno') {
          if (!updated.completedAt) {
            updated.completedAt = getNowFormatted();
          }
          if (!updated.closedBy && currentUser) {
            updated.closedBy = {
              username: currentUser.username,
              fullName: currentUser.fullName,
              timestamp: updated.completedAt,
            };
          }
        } else if (updates.status) {
          updated.completedAt = undefined;
          updated.closedBy = undefined;
        }
        return updated;
      })
    );

    fetch(`/api/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});

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

  // Delete work order / model preparation permanently
  const deleteWorkOrder = async (id: string) => {
    const canDelete = currentUser?.role === 'admin' || Boolean(currentUser?.permissions?.canDeleteOrders);
    if (!currentUser || !canDelete) {
      return { success: false, error: 'Nemate ovlašćenje za brisanje radnih naloga.' };
    }

    const targetOrder = workOrders.find((o) => o.id === id);
    const targetId = targetOrder?.id || id;

    // 1. Permanently register unique ID in tombstones
    deletedOrdersRef.current.add(targetId);
    if (id) deletedOrdersRef.current.add(id);

    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_ORDERS, JSON.stringify(Array.from(deletedOrdersRef.current)));
    } catch {}

    // 2. Immediately purge from local state and localStorage
    setWorkOrders((prev) => {
      const filtered = (prev || []).filter((order) => order.id !== targetId && order.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.WORK_ORDERS, JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    // 3. Inform server to delete from database and record tombstone (await to ensure completion before any refresh)
    try {
      await fetch(`/api/work-orders/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
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
    }).catch(() => {});

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
    }).catch(() => {});

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
    }).catch(() => {});

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
    }).catch(() => {});

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
    }).catch(() => {});

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
    }).catch(() => {});

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

    // Push to backend
    fetch('/api/consumption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logs: newLogs,
        workOrderId: targetOrder.id,
        closedBy: closedByObj,
        status: statusToUpdate,
      }),
    }).catch(() => {});

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
    }).catch(() => {});

    return { success: true };
  };

  const resetToDefaultData = () => {
    setUsers(SYSTEM_USERS);
    setWorkOrders([]);
    setMaterials([]);
    setConsumptionLogs([]);
    deletedOrdersRef.current.clear();
    localStorage.removeItem(STORAGE_KEYS.USERS_LIST);
    localStorage.removeItem(STORAGE_KEYS.WORK_ORDERS);
    localStorage.removeItem(STORAGE_KEYS.MATERIALS);
    localStorage.removeItem(STORAGE_KEYS.CONSUMPTION_LOGS);
    localStorage.removeItem(STORAGE_KEYS.DELETED_ORDERS);

    fetch('/api/reset', { method: 'POST' }).catch(() => {});
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
