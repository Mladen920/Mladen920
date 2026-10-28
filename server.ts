import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables (.env / Cloud environment)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(__dirname, 'server-db.json');
const DB_BACKUP_FILE = path.join(__dirname, 'server-db.backup.json');
const GOOGLE_SHEETS_API_URL = process.env.GOOGLE_SHEETS_API_URL?.trim();

// Track external sync metrics and status
let lastSheetsSyncTime: string | null = null;
let lastSheetsSyncStatus: 'success' | 'error' | 'idle' = 'idle';
let lastSheetsSyncError: string | null = null;

// Default seed data if no database exists on server yet
const DEFAULT_SYSTEM_USERS = [
  {
    id: 'user-admin',
    username: 'admin',
    fullName: 'Administrator Radionice',
    role: 'admin',
    password: 'admin123',
    createdAt: '2026-10-01',
  },
  {
    id: 'user-stefan',
    username: 'Stefan1',
    fullName: 'Stefan Petrović',
    role: 'worker',
    password: 'Stefan123',
    createdAt: '2026-10-05',
  },
  {
    id: 'user-drasko',
    username: 'Drasko1',
    fullName: 'Draško Marković',
    role: 'worker',
    password: 'Drasko456',
    createdAt: '2026-10-10',
  },
];

interface ServerDatabase {
  users: any[];
  workOrders: any[];
  materials: any[];
  consumptionLogs: any[];
  deletedOrderIds?: string[];
  deletedMaterialIds?: string[];
  deletedWorkerIds?: string[];
  version: number;
  lastUpdated: string;
}

// In-memory cache singleton - Single Source of Truth
let memoryDb: ServerDatabase | null = null;

// Connected SSE clients for instant real-time synchronization across Phone & Desktop
const sseClients = new Set<Response>();

function broadcastDatabaseUpdate(db: ServerDatabase) {
  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(db)}\n\n`;
  sseClients.forEach((clientRes) => {
    try {
      clientRes.write(payload);
    } catch {
      sseClients.delete(clientRes);
    }
  });
}

const cloneDb = (db: ServerDatabase): ServerDatabase => {
  return JSON.parse(JSON.stringify(db));
};

// Check whether a database snapshot holds any meaningful user records
function hasDatabaseRecords(db: ServerDatabase | null | undefined): boolean {
  if (!db || typeof db !== 'object') return false;
  const hasOrders = Array.isArray(db.workOrders) && db.workOrders.length > 0;
  const hasMaterials = Array.isArray(db.materials) && db.materials.length > 0;
  const hasLogs = Array.isArray(db.consumptionLogs) && db.consumptionLogs.length > 0;
  const hasCustomUsers = Array.isArray(db.users) && db.users.length > DEFAULT_SYSTEM_USERS.length;
  return hasOrders || hasMaterials || hasLogs || hasCustomUsers;
}

// Helper to validate and sanitize any loaded database object
function sanitizeLoadedDb(parsed: any): ServerDatabase | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const deletedOrderIds: string[] = Array.isArray(parsed.deletedOrderIds)
    ? Array.from(new Set<string>(parsed.deletedOrderIds.filter(Boolean).map(String)))
    : [];
  const deletedMaterialIds: string[] = Array.isArray(parsed.deletedMaterialIds)
    ? Array.from(new Set<string>(parsed.deletedMaterialIds.filter(Boolean).map(String)))
    : [];
  const deletedWorkerIds: string[] = Array.isArray(parsed.deletedWorkerIds)
    ? Array.from(new Set<string>(parsed.deletedWorkerIds.filter(Boolean).map(String)))
    : [];

  const deletedWorkerSet = new Set(deletedWorkerIds);
  const userMap = new Map<string, any>();
  DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
  if (Array.isArray(parsed.users)) {
    parsed.users.forEach((u: any) => {
      if (u && u.id && (!deletedWorkerSet.has(u.id) || u.role === 'admin')) {
        userMap.set(u.id, { ...userMap.get(u.id), ...u });
      }
    });
  }
  const sanitizedUsers = Array.from(userMap.values()).map((u) =>
    u.username === 'admin' ? { ...u, password: 'admin123' } : u
  );

  const deletedOrderSet = new Set(deletedOrderIds);
  const workOrders = Array.isArray(parsed.workOrders)
    ? parsed.workOrders.filter((o: any) => o && o.id && !deletedOrderSet.has(o.id))
    : [];

  const deletedMatSet = new Set(deletedMaterialIds);
  const materials = Array.isArray(parsed.materials)
    ? parsed.materials.filter((m: any) => m && m.id && !deletedMatSet.has(m.id))
    : [];

  const consumptionLogs = Array.isArray(parsed.consumptionLogs)
    ? parsed.consumptionLogs.filter((l: any) => l && l.id)
    : [];

  return {
    users: sanitizedUsers,
    workOrders,
    materials,
    consumptionLogs,
    deletedOrderIds,
    deletedMaterialIds,
    deletedWorkerIds,
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    lastUpdated: parsed.lastUpdated || new Date().toISOString(),
  };
}

// Safely read and parse a JSON database file from disk
function readDiskFile(filePath: string): ServerDatabase | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return null;
    return sanitizeLoadedDb(JSON.parse(content));
  } catch (err) {
    console.warn(`⚠️ [DB Engine] Greška pri čitanju fajla ${path.basename(filePath)}:`, err);
    return null;
  }
}

// Non-destructively merge two database snapshots while respecting explicit deletion tombstones
function mergeDatabases(baseDb: ServerDatabase, newerDb: ServerDatabase): ServerDatabase {
  const deletedOrderIds = Array.from(
    new Set([...(baseDb.deletedOrderIds || []), ...(newerDb.deletedOrderIds || [])].filter(Boolean))
  );
  const deletedMaterialIds = Array.from(
    new Set([...(baseDb.deletedMaterialIds || []), ...(newerDb.deletedMaterialIds || [])].filter(Boolean))
  );
  const deletedWorkerIds = Array.from(
    new Set([...(baseDb.deletedWorkerIds || []), ...(newerDb.deletedWorkerIds || [])].filter(Boolean))
  );

  const deletedOrderSet = new Set(deletedOrderIds);
  const deletedMatSet = new Set(deletedMaterialIds);
  const deletedWorkerSet = new Set(deletedWorkerIds);

  // 1. Merge Users
  const userMap = new Map<string, any>();
  DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
  (baseDb.users || []).forEach((u) => {
    if (u && u.id && (!deletedWorkerSet.has(u.id) || u.role === 'admin')) {
      userMap.set(u.id, u);
    }
  });
  (newerDb.users || []).forEach((u) => {
    if (u && u.id && (!deletedWorkerSet.has(u.id) || u.role === 'admin')) {
      userMap.set(u.id, { ...userMap.get(u.id), ...u });
    }
  });
  const users = Array.from(userMap.values()).map((u) =>
    u.username === 'admin' ? { ...u, password: 'admin123' } : u
  );

  // 2. Merge Work Orders (keep newerDb items as authoritative for matching IDs, preserve any missing from baseDb)
  const orderMap = new Map<string, any>();
  (newerDb.workOrders || []).forEach((o) => {
    if (o && o.id && !deletedOrderSet.has(o.id)) {
      orderMap.set(o.id, o);
    }
  });
  (baseDb.workOrders || []).forEach((o) => {
    if (o && o.id && !deletedOrderSet.has(o.id) && !orderMap.has(o.id)) {
      orderMap.set(o.id, o);
    }
  });
  const workOrders = Array.from(orderMap.values());

  // 3. Merge Materials
  const matMap = new Map<string, any>();
  (newerDb.materials || []).forEach((m) => {
    if (m && m.id && !deletedMatSet.has(m.id)) {
      matMap.set(m.id, m);
    }
  });
  (baseDb.materials || []).forEach((m) => {
    if (m && m.id && !deletedMatSet.has(m.id) && !matMap.has(m.id)) {
      matMap.set(m.id, m);
    }
  });
  const materials = Array.from(matMap.values());

  // 4. Merge Consumption Logs
  const logMap = new Map<string, any>();
  (newerDb.consumptionLogs || []).forEach((l) => {
    if (l && l.id) logMap.set(l.id, l);
  });
  (baseDb.consumptionLogs || []).forEach((l) => {
    if (l && l.id && !logMap.has(l.id)) {
      logMap.set(l.id, l);
    }
  });
  const consumptionLogs = Array.from(logMap.values());

  return {
    users,
    workOrders,
    materials,
    consumptionLogs,
    deletedOrderIds,
    deletedMaterialIds,
    deletedWorkerIds,
    version: Math.max(baseDb.version || 1, newerDb.version || 1),
    lastUpdated: newerDb.lastUpdated || baseDb.lastUpdated || new Date().toISOString(),
  };
}

// Raw atomic file writer helper
function writeJsonFileAtomically(targetPath: string, data: ServerDatabase): void {
  const serialized = JSON.stringify(data, null, 2);
  const tmpFile = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  fs.writeFileSync(tmpFile, serialized, 'utf-8');
  fs.renameSync(tmpFile, targetPath);
}

// Atomically save database to disk (temp file -> renameSync) + persistent backup with strict Anti-Wipe Guard
function writeDatabase(db: ServerDatabase, eventType?: string): boolean {
  try {
    if (!db || typeof db !== 'object') {
      console.warn('🛡️ [Anti-Wipe Guard] Odbijen upis nevalidnog (null/empty) objekta baze.');
      return false;
    }

    // Load authoritative existing state from memory + disk (primary & backup) to prevent any accidental wipe
    let existingDb: ServerDatabase | null = memoryDb ? cloneDb(memoryDb) : null;
    const diskPrimary = readDiskFile(DB_FILE);
    const diskBackup = readDiskFile(DB_BACKUP_FILE);

    if (diskBackup) {
      existingDb = existingDb ? mergeDatabases(diskBackup, existingDb) : diskBackup;
    }
    if (diskPrimary) {
      existingDb = existingDb ? mergeDatabases(diskPrimary, existingDb) : diskPrimary;
    }

    // Ensure arrays exist on incoming db
    db.deletedOrderIds = Array.isArray(db.deletedOrderIds) ? db.deletedOrderIds : [];
    db.deletedMaterialIds = Array.isArray(db.deletedMaterialIds) ? db.deletedMaterialIds : [];
    db.deletedWorkerIds = Array.isArray(db.deletedWorkerIds) ? db.deletedWorkerIds : [];

    if (existingDb && eventType !== 'db_admin_reset') {
      // Combine tombstones unless an item is explicitly being re-created right now
      const activeIdsBeingWritten = new Set([
        ...(Array.isArray(db.workOrders) ? db.workOrders.map((o: any) => o?.id) : []),
        ...(Array.isArray(db.materials) ? db.materials.map((m: any) => m?.id) : []),
        ...(Array.isArray(db.users) ? db.users.map((u: any) => u?.id) : []),
      ].filter(Boolean));

      const mergedDeletedOrders = new Set([
        ...(existingDb.deletedOrderIds || []),
        ...(db.deletedOrderIds || []),
      ]);
      activeIdsBeingWritten.forEach((id) => mergedDeletedOrders.delete(id));
      db.deletedOrderIds = Array.from(mergedDeletedOrders);

      const mergedDeletedMaterials = new Set([
        ...(existingDb.deletedMaterialIds || []),
        ...(db.deletedMaterialIds || []),
      ]);
      activeIdsBeingWritten.forEach((id) => mergedDeletedMaterials.delete(id));
      db.deletedMaterialIds = Array.from(mergedDeletedMaterials);

      const mergedDeletedWorkers = new Set([
        ...(existingDb.deletedWorkerIds || []),
        ...(db.deletedWorkerIds || []),
      ]);
      activeIdsBeingWritten.forEach((id) => mergedDeletedWorkers.delete(id));
      db.deletedWorkerIds = Array.from(mergedDeletedWorkers);

      const survivingExistingOrders = (existingDb.workOrders || []).filter(
        (o: any) => o && o.id && !mergedDeletedOrders.has(o.id)
      );
      const survivingExistingMaterials = (existingDb.materials || []).filter(
        (m: any) => m && m.id && !mergedDeletedMaterials.has(m.id)
      );
      const survivingExistingLogs = existingDb.consumptionLogs || [];

      // 🛡️ 1. STRICT ANTI-WIPE GUARD FOR WORK ORDERS
      if (survivingExistingOrders.length > 0 && (!Array.isArray(db.workOrders) || db.workOrders.length === 0)) {
        console.warn(
          `🛡️ [Anti-Wipe Guard] Blokiran pokušaj brisanja radnih naloga praznom listom (event: ${eventType})! Zadržano ${survivingExistingOrders.length} postojećih naloga.`
        );
        db.workOrders = cloneDb(existingDb).workOrders.filter(
          (o: any) => o && o.id && !mergedDeletedOrders.has(o.id)
        );
      } else {
        // Non-destructively preserve all non-deleted existing orders alongside incoming orders
        const orderMap = new Map<string, any>();
        (Array.isArray(db.workOrders) ? db.workOrders : []).forEach((o: any) => {
          if (o && o.id && !mergedDeletedOrders.has(o.id)) {
            orderMap.set(o.id, o);
          }
        });
        survivingExistingOrders.forEach((o: any) => {
          if (o && o.id && !mergedDeletedOrders.has(o.id) && !orderMap.has(o.id)) {
            orderMap.set(o.id, o);
          }
        });
        db.workOrders = Array.from(orderMap.values());
      }

      // 🛡️ 2. STRICT ANTI-WIPE GUARD FOR MATERIALS (MAGACIN)
      if (survivingExistingMaterials.length > 0 && (!Array.isArray(db.materials) || db.materials.length === 0)) {
        console.warn(
          `🛡️ [Anti-Wipe Guard] Blokiran pokušaj brisanja magacina praznom listom (event: ${eventType})! Zadržano ${survivingExistingMaterials.length} postojećih materijala.`
        );
        db.materials = cloneDb(existingDb).materials.filter(
          (m: any) => m && m.id && !mergedDeletedMaterials.has(m.id)
        );
      } else {
        const matMap = new Map<string, any>();
        (Array.isArray(db.materials) ? db.materials : []).forEach((m: any) => {
          if (m && m.id && !mergedDeletedMaterials.has(m.id)) {
            matMap.set(m.id, m);
          }
        });
        survivingExistingMaterials.forEach((m: any) => {
          if (m && m.id && !mergedDeletedMaterials.has(m.id) && !matMap.has(m.id)) {
            matMap.set(m.id, m);
          }
        });
        db.materials = Array.from(matMap.values());
      }

      // 🛡️ 3. STRICT ANTI-WIPE GUARD FOR CONSUMPTION LOGS (TROŠKOVI)
      if (survivingExistingLogs.length > 0 && (!Array.isArray(db.consumptionLogs) || db.consumptionLogs.length === 0)) {
        console.warn(
          `🛡️ [Anti-Wipe Guard] Blokiran pokušaj brisanja troškova/utroška praznom listom (event: ${eventType})! Zadržano ${survivingExistingLogs.length} zapisa.`
        );
        db.consumptionLogs = cloneDb(existingDb).consumptionLogs;
      } else {
        const logMap = new Map<string, any>();
        (Array.isArray(db.consumptionLogs) ? db.consumptionLogs : []).forEach((l: any) => {
          if (l && l.id) logMap.set(l.id, l);
        });
        survivingExistingLogs.forEach((l: any) => {
          if (l && l.id && !logMap.has(l.id)) {
            logMap.set(l.id, l);
          }
        });
        db.consumptionLogs = Array.from(logMap.values());
      }

      // 🛡️ 4. STRICT ANTI-WIPE GUARD FOR USERS / WORKERS
      const userMap = new Map<string, any>();
      DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
      (existingDb.users || []).forEach((u: any) => {
        if (u && u.id && (!mergedDeletedWorkers.has(u.id) || u.role === 'admin')) {
          userMap.set(u.id, u);
        }
      });
      (Array.isArray(db.users) ? db.users : []).forEach((u: any) => {
        if (u && u.id && (!mergedDeletedWorkers.has(u.id) || u.role === 'admin')) {
          userMap.set(u.id, { ...userMap.get(u.id), ...u });
        }
      });
      db.users = Array.from(userMap.values()).map((u) =>
        u.username === 'admin' ? { ...u, password: 'admin123' } : u
      );
    }

    db.version = Math.max(db.version || 0, existingDb?.version || 0) + 1;
    db.lastUpdated = new Date().toISOString();

    // 1. Immediately update in-memory state
    memoryDb = cloneDb(db);

    // 2. Atomic disk write to primary server-db.json
    writeJsonFileAtomically(DB_FILE, memoryDb);

    // 3. Keep persistent backup (server-db.backup.json) updated whenever records exist or explicit delete tombstones are added
    const isExplicitDelete =
      eventType === 'work_order_deleted' ||
      eventType === 'material_deleted' ||
      eventType === 'worker_deleted';

    if (hasDatabaseRecords(memoryDb) || isExplicitDelete) {
      try {
        writeJsonFileAtomically(DB_BACKUP_FILE, memoryDb);
      } catch (backupErr) {
        console.warn('⚠️ [DB Engine] Backup write warning:', backupErr);
      }
    }

    // 4. Broadcast updated authoritative database to all connected phones & computers in real time
    broadcastDatabaseUpdate(memoryDb);

    return true;
  } catch (err) {
    console.error('Error saving server database file:', err);
    return false;
  }
}

// Safely load database without ever wiping existing records, with automatic restore from server-db.backup.json
function readDatabase(): ServerDatabase {
  // Always inspect disk files if memoryDb is not initialized OR if memoryDb appears empty
  if (memoryDb && hasDatabaseRecords(memoryDb)) {
    return cloneDb(memoryDb);
  }

  // 1. Read primary server-db.json and backup server-db.backup.json
  const primaryDb = readDiskFile(DB_FILE);
  const backupDb = readDiskFile(DB_BACKUP_FILE);

  const primaryHasData = hasDatabaseRecords(primaryDb);
  const backupHasData = hasDatabaseRecords(backupDb);

  // 2. Automatic Recovery if primary server-db.json is missing, corrupt, or empty while backup has data
  if (!primaryHasData && backupHasData && backupDb) {
    console.warn(
      `🔄 [Auto-Recovery] Glavni fajl server-db.json je prazan ili oštećen! Automatsko vraćanje podataka iz rezervne kopije (server-db.backup.json): ${backupDb.workOrders.length} naloga, ${backupDb.materials.length} materijala.`
    );
    memoryDb = cloneDb(backupDb);
    try {
      writeJsonFileAtomically(DB_FILE, memoryDb);
    } catch (err) {
      console.warn('⚠️ [Auto-Recovery] Greška pri upisu vraćene baze u server-db.json:', err);
    }
    return cloneDb(memoryDb);
  }

  // 3. If both primary and backup exist, non-destructively merge them so no record from either is ever lost
  if (primaryDb && backupDb) {
    const mergedDb = mergeDatabases(backupDb, primaryDb);
    const recoveredOrders = mergedDb.workOrders.length > primaryDb.workOrders.length;
    const recoveredMaterials = mergedDb.materials.length > primaryDb.materials.length;
    const recoveredLogs = mergedDb.consumptionLogs.length > primaryDb.consumptionLogs.length;

    memoryDb = mergedDb;

    if (recoveredOrders || recoveredMaterials || recoveredLogs) {
      console.log(
        `🛡️ [Auto-Recovery Merge] Dopunjeni podaci iz server-db.backup.json u server-db.json (Nalozi: ${mergedDb.workOrders.length}, Materijali: ${mergedDb.materials.length}, Troškovi: ${mergedDb.consumptionLogs.length}).`
      );
      try {
        writeJsonFileAtomically(DB_FILE, memoryDb);
        writeJsonFileAtomically(DB_BACKUP_FILE, memoryDb);
      } catch {}
    } else if (primaryHasData && !backupHasData) {
      // Ensure backup is populated if primary has data and backup was empty
      try {
        writeJsonFileAtomically(DB_BACKUP_FILE, memoryDb);
      } catch {}
    }

    return cloneDb(memoryDb);
  }

  if (primaryDb) {
    memoryDb = primaryDb;
    if (primaryHasData) {
      try {
        writeJsonFileAtomically(DB_BACKUP_FILE, memoryDb);
      } catch {}
    }
    return cloneDb(memoryDb);
  }

  if (backupDb) {
    console.warn('🔄 [Auto-Recovery] Vraćanje baze iz server-db.backup.json...');
    memoryDb = backupDb;
    try {
      writeJsonFileAtomically(DB_FILE, memoryDb);
    } catch {}
    return cloneDb(memoryDb);
  }

  // 4. Fallback ONLY if neither server-db.json nor server-db.backup.json exists on disk
  if (memoryDb) {
    return cloneDb(memoryDb);
  }

  const initialDb: ServerDatabase = {
    users: DEFAULT_SYSTEM_USERS,
    workOrders: [],
    materials: [],
    consumptionLogs: [],
    deletedOrderIds: [],
    deletedMaterialIds: [],
    deletedWorkerIds: [],
    version: 1,
    lastUpdated: new Date().toISOString(),
  };

  memoryDb = initialDb;
  try {
    writeJsonFileAtomically(DB_FILE, memoryDb);
  } catch {}
  return cloneDb(memoryDb);
}

// Dispatch updated database state to external Google Sheets / Webhook via POST
async function syncToExternalSheets(db: ServerDatabase, eventType?: string): Promise<boolean> {
  if (!GOOGLE_SHEETS_API_URL) return false;

  try {
    console.log(`📤 [Sheets Sync] Slanje ažuriranja na eksterni URL (događaj: ${eventType || 'db_update'})...`);

    const payload = {
      action: 'sync',
      event: eventType || 'db_update',
      timestamp: new Date().toISOString(),
      users: db.users,
      workOrders: db.workOrders,
      materials: db.materials,
      consumptionLogs: db.consumptionLogs,
      deletedOrderIds: db.deletedOrderIds || [],
      version: db.version,
      lastUpdated: db.lastUpdated,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      lastSheetsSyncTime = new Date().toISOString();
      lastSheetsSyncStatus = 'success';
      lastSheetsSyncError = null;
      console.log(`✅ [Sheets Sync] Uspešno poslati ažurirani podaci na Google Sheets/Webhook (HTTP ${res.status})`);
      return true;
    } else {
      lastSheetsSyncStatus = 'error';
      lastSheetsSyncError = `HTTP ${res.status}: ${res.statusText}`;
      console.warn(`⚠️ [Sheets Sync] Eksterni URL vratio grešku: ${res.status} ${res.statusText}`);
      return false;
    }
  } catch (err: any) {
    lastSheetsSyncStatus = 'error';
    lastSheetsSyncError = err?.message || 'Greška pri slanju na eksterni URL';
    console.warn(`⚠️ [Sheets Sync] Greška pri slanju na Google Sheets URL (lokalna baza server-db.json je bezbjedna):`, err?.message || err);
    return false;
  }
}

// Fetch database snapshot from external Google Sheets / Webhook and safely merge with local database
async function syncFromExternalSheets(): Promise<ServerDatabase | null> {
  if (!GOOGLE_SHEETS_API_URL) return null;

  try {
    console.log(`📡 [Sheets Sync] Preuzimanje baze podataka sa eksternog Google Sheets URL-a: ${GOOGLE_SHEETS_API_URL}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res: globalThis.Response | null = null;
    try {
      res = await fetch(GOOGLE_SHEETS_API_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch {
      // If GET is rejected or not supported by endpoint, proceed to try POST with action 'read'
    }

    if (!res || !res.ok) {
      const postController = new AbortController();
      const postTimeoutId = setTimeout(() => postController.abort(), 12000);
      try {
        res = await fetch(GOOGLE_SHEETS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ action: 'read', timestamp: new Date().toISOString() }),
          redirect: 'follow',
          signal: postController.signal,
        });
      } finally {
        clearTimeout(postTimeoutId);
      }
    }

    clearTimeout(timeoutId);

    if (!res || !res.ok) {
      lastSheetsSyncStatus = 'error';
      lastSheetsSyncError = `HTTP ${res?.status || 'Unknown error'}`;
      console.warn(`⚠️ [Sheets Sync] Eksterni endpoint vratio neuspešan status: ${res?.status}`);
      return null;
    }

    const payload = await res.json();
    const rawData = payload?.db || payload?.data || payload;

    if (!rawData || typeof rawData !== 'object' || rawData.error || rawData.status === 'error') {
      const msg = rawData?.error || rawData?.message || 'Eksterni servis nije vratio validne podatke.';
      console.warn(`⚠️ [Sheets Sync] Eksterni odgovor označava grešku ili prekoračenje kvote: ${msg}`);
      lastSheetsSyncStatus = 'error';
      lastSheetsSyncError = String(msg);
      return null;
    }

    // Only proceed to merge if at least one recognizable database array is present
    const hasAnyValidData = Array.isArray(rawData.workOrders) || Array.isArray(rawData.materials) || Array.isArray(rawData.users);
    if (!hasAnyValidData) {
      console.warn(`⚠️ [Sheets Sync] Eksterni odgovor ne sadrži strukturu baze podataka. Lokalna baza ostaje netaknuta.`);
      return null;
    }

    const currentDb = readDatabase();

    // Merge users safely, always preserving default system users (admin, Stefan1, Drasko1)
    if (Array.isArray(rawData.users) && rawData.users.length > 0) {
      const userMap = new Map<string, any>();
      DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
      (currentDb.users || []).forEach((u) => { if (u?.id) userMap.set(u.id, u); });
      rawData.users.forEach((u: any) => { if (u?.id) userMap.set(u.id, { ...userMap.get(u.id), ...u }); });
      currentDb.users = Array.from(userMap.values());
    }

    // Merge deleted order IDs (tombstones) from external Sheets
    if (Array.isArray(rawData.deletedOrderIds)) {
      const tombstoneSet = new Set(currentDb.deletedOrderIds || []);
      rawData.deletedOrderIds.forEach((id: string) => { if (id) tombstoneSet.add(id); });
      currentDb.deletedOrderIds = Array.from(tombstoneSet);
    }
    const activeTombstoneSet = new Set(currentDb.deletedOrderIds || []);

    const isExternalTombstoned = (o: any) => {
      if (!o || !o.id) return false;
      return activeTombstoneSet.has(o.id);
    };

    // Merge work orders (KEEP ALL LOCAL ORDERS - NEVER WIPE!)
    if (Array.isArray(rawData.workOrders) && rawData.workOrders.length > 0) {
      const orderMap = new Map<string, any>();
      (currentDb.workOrders || []).forEach((o) => {
        if (!isExternalTombstoned(o)) orderMap.set(o.id, o);
      });
      rawData.workOrders.forEach((o: any) => {
        if (!isExternalTombstoned(o)) {
          const existing = orderMap.get(o.id);
          orderMap.set(o.id, { ...existing, ...o });
        }
      });
      currentDb.workOrders = Array.from(orderMap.values());
    }

    // Merge materials (KEEP ALL LOCAL MATERIALS - NEVER WIPE!)
    if (Array.isArray(rawData.materials) && rawData.materials.length > 0) {
      const matMap = new Map<string, any>();
      (currentDb.materials || []).forEach((m) => { if (m?.id) matMap.set(m.id, m); });
      rawData.materials.forEach((m: any) => { if (m?.id) matMap.set(m.id, { ...matMap.get(m.id), ...m }); });
      currentDb.materials = Array.from(matMap.values());
    }

    // Merge consumption logs
    if (Array.isArray(rawData.consumptionLogs) && rawData.consumptionLogs.length > 0) {
      const logMap = new Map<string, any>();
      (currentDb.consumptionLogs || []).forEach((l) => { if (l?.id) logMap.set(l.id, l); });
      rawData.consumptionLogs.forEach((l: any) => { if (l?.id) logMap.set(l.id, l); });
      currentDb.consumptionLogs = Array.from(logMap.values());
    }

    currentDb.version = Math.max(currentDb.version || 1, rawData.version || 1) + 1;
    currentDb.lastUpdated = new Date().toISOString();

    // Write merged result atomically
    writeDatabase(currentDb, 'sheets_pull_merge');

    lastSheetsSyncTime = new Date().toISOString();
    lastSheetsSyncStatus = 'success';
    lastSheetsSyncError = null;

    console.log(`✅ [Sheets Sync] Baza uspešno ažurirana sa eksternog Google Sheets URL-a. Naloga: ${currentDb.workOrders.length}, Materijala: ${currentDb.materials.length}`);
    return currentDb;
  } catch (err: any) {
    lastSheetsSyncStatus = 'error';
    lastSheetsSyncError = err?.message || 'Greška pri čitanju sa eksternog URL-a';
    console.warn(`⚠️ [Sheets Sync] Neuspešno čitanje sa Google Sheets API URL-a (koristi se lokalni fallback):`, err?.message || err);
    return null;
  }
}

async function startServer() {
  const app = express();

  // Basic CORS & JSON parser + strict no-cache for API routes
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // API Endpoints - Single Source of Truth for ALL devices (Desktop, Mobile, Tablet)

  // Real-time Server-Sent Events (SSE) stream for instant multi-device sync
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const db = readDatabase();
    res.write(`data: ${JSON.stringify(db)}\n\n`);

    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // 1. Get full live application state (with optional on-demand refresh from Google Sheets)
  app.get('/api/state', async (req: Request, res: Response) => {
    if (req.query.refresh === 'true' && GOOGLE_SHEETS_API_URL) {
      await syncFromExternalSheets();
    }
    const db = readDatabase();
    res.json(db);
  });

  // 2. Full synchronization endpoint - Safe non-destructive merge with Anti-Wipe Guard
  app.post('/api/sync', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      const currentDb = readDatabase();
      return res.json({ success: true, db: currentDb, ignoredEmptyPayload: true });
    }

    const { users, workOrders, materials, consumptionLogs, deletedOrderIds, deletedMaterialIds, deletedWorkerIds } = req.body;
    const db = readDatabase();

    // Anti-Wipe Guard: If all payload arrays are empty or missing, never touch or overwrite existing database
    const hasIncomingOrders = Array.isArray(workOrders) && workOrders.length > 0;
    const hasIncomingMaterials = Array.isArray(materials) && materials.length > 0;
    const hasIncomingLogs = Array.isArray(consumptionLogs) && consumptionLogs.length > 0;
    const hasIncomingUsers = Array.isArray(users) && users.length > 0;
    const hasIncomingTombstones =
      (Array.isArray(deletedOrderIds) && deletedOrderIds.length > 0) ||
      (Array.isArray(deletedMaterialIds) && deletedMaterialIds.length > 0) ||
      (Array.isArray(deletedWorkerIds) && deletedWorkerIds.length > 0);

    if (!hasIncomingOrders && !hasIncomingMaterials && !hasIncomingLogs && !hasIncomingUsers && !hasIncomingTombstones) {
      return res.json({ success: true, db, ignoredEmptyPayload: true });
    }

    // Merge deleted order IDs tombstones
    if (Array.isArray(deletedOrderIds) && deletedOrderIds.length > 0) {
      const tombstoneSet = new Set(db.deletedOrderIds || []);
      deletedOrderIds.forEach((id: string) => { if (id) tombstoneSet.add(id); });
      db.deletedOrderIds = Array.from(tombstoneSet);
    }
    if (Array.isArray(deletedMaterialIds) && deletedMaterialIds.length > 0) {
      const matTombstoneSet = new Set(db.deletedMaterialIds || []);
      deletedMaterialIds.forEach((id: string) => { if (id) matTombstoneSet.add(id); });
      db.deletedMaterialIds = Array.from(matTombstoneSet);
    }
    if (Array.isArray(deletedWorkerIds) && deletedWorkerIds.length > 0) {
      const workerTombstoneSet = new Set(db.deletedWorkerIds || []);
      deletedWorkerIds.forEach((id: string) => { if (id) workerTombstoneSet.add(id); });
      db.deletedWorkerIds = Array.from(workerTombstoneSet);
    }

    const currentDeletedSet = new Set(db.deletedOrderIds || []);
    const currentDeletedMatSet = new Set(db.deletedMaterialIds || []);
    const currentDeletedWorkerSet = new Set(db.deletedWorkerIds || []);

    const isSyncTombstoned = (o: any) => {
      if (!o || !o.id) return false;
      return currentDeletedSet.has(o.id);
    };

    if (hasIncomingUsers) {
      const userMap = new Map<string, any>();
      DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
      (db.users || []).forEach((u) => {
        if (u?.id && (!currentDeletedWorkerSet.has(u.id) || u.role === 'admin')) userMap.set(u.id, u);
      });
      users.forEach((u: any) => {
        if (u?.id && (!currentDeletedWorkerSet.has(u.id) || u.role === 'admin')) {
          userMap.set(u.id, { ...userMap.get(u.id), ...u });
        }
      });
      db.users = Array.from(userMap.values());
    }

    // SAFE NON-DESTRUCTIVE MERGE OF WORK ORDERS:
    // ALWAYS preserve existing local db.workOrders! Never wipe!
    const orderMap = new Map<string, any>();
    (db.workOrders || []).forEach((o) => {
      if (o && o.id && !isSyncTombstoned(o)) {
        orderMap.set(o.id, o);
      }
    });

    if (hasIncomingOrders) {
      workOrders.forEach((o: any) => {
        if (o && o.id && !isSyncTombstoned(o)) {
          const existing = orderMap.get(o.id);
          orderMap.set(o.id, { ...existing, ...o });
        }
      });
    }

    db.workOrders = Array.from(orderMap.values());

    if (hasIncomingMaterials) {
      const matMap = new Map<string, any>();
      (db.materials || []).forEach((m) => {
        if (m?.id && !currentDeletedMatSet.has(m.id)) matMap.set(m.id, m);
      });
      materials.forEach((m: any) => {
        if (m?.id && !currentDeletedMatSet.has(m.id)) {
          matMap.set(m.id, { ...matMap.get(m.id), ...m });
        }
      });
      db.materials = Array.from(matMap.values());
    }

    if (hasIncomingLogs) {
      const logMap = new Map<string, any>();
      (db.consumptionLogs || []).forEach((l) => { if (l?.id) logMap.set(l.id, l); });
      consumptionLogs.forEach((l: any) => { if (l?.id) logMap.set(l.id, { ...logMap.get(l.id), ...l }); });
      db.consumptionLogs = Array.from(logMap.values());
    }

    writeDatabase(db, 'safe_merge_sync');
    res.json({ success: true, db });
  });

  // 3. Work Orders - Unlimited persistent storage (Safe additive merge)
  app.post('/api/work-orders', (req: Request, res: Response) => {
    const newOrder = req.body;
    if (!newOrder || typeof newOrder !== 'object' || Array.isArray(newOrder) || !newOrder.orderNumber || !newOrder.title) {
      return res.status(400).json({ success: false, error: 'Broj naloga i naziv su obavezni.' });
    }

    const db = readDatabase();
    if (!Array.isArray(db.workOrders)) {
      db.workOrders = [];
    }

    const previousCount = db.workOrders.length;

    // If newOrder.id was in deletedOrderIds, user is explicitly creating this order, so remove it from tombstones
    if (newOrder.id && Array.isArray(db.deletedOrderIds)) {
      db.deletedOrderIds = db.deletedOrderIds.filter((d: string) => d !== newOrder.id && d !== newOrder.orderNumber);
    }

    // Strict validation: planned materials cannot exceed stock
    if (Array.isArray(newOrder.plannedMaterials)) {
      for (const p of newOrder.plannedMaterials) {
        if (p.materialId && p.quantity && p.quantity > 0) {
          const mat = (db.materials || []).find((m) => m.id === p.materialId);
          if (mat && p.quantity > mat.currentStock) {
            return res.status(400).json({
              success: false,
              error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a uneto je ${p.quantity} ${mat.unit}.`,
            });
          }
        }
      }
    }

    // Match strictly by unique ID so distinct orders are NEVER overwritten!
    const existingIndex = db.workOrders.findIndex((o) => o.id === newOrder.id);
    if (existingIndex >= 0) {
      db.workOrders[existingIndex] = { ...db.workOrders[existingIndex], ...newOrder };
    } else {
      db.workOrders.unshift(newOrder);
    }

    // Safety assertion: Work orders list must NEVER shrink when adding an order!
    if (db.workOrders.length < previousCount) {
      console.error('🛡️ [DB Guard Alert] Work orders count decreased on POST /api/work-orders!');
      return res.status(500).json({ success: false, error: 'Integritet baze ugrožen - operacija prekinuta.' });
    }

    writeDatabase(db, 'work_order_Created');
    console.log(`✅ [Work Order Created] Nalog "${newOrder.orderNumber}" (ID: ${newOrder.id}) uspešno sačuvan. Ukupno naloga u bazi: ${db.workOrders.length}`);
    res.json({ success: true, workOrder: newOrder, workOrders: db.workOrders, db });
  });

  app.put('/api/work-orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Podaci za izmjenu naloga ne mogu biti prazni.' });
    }

    const db = readDatabase();

    const idx = db.workOrders.findIndex(o => o.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Radni nalog nije pronađen.' });
    }

    // Strict validation: planned materials cannot exceed stock
    if (Array.isArray(updates.plannedMaterials)) {
      for (const p of updates.plannedMaterials) {
        if (p.materialId && p.quantity && p.quantity > 0) {
          const mat = db.materials.find(m => m.id === p.materialId);
          if (mat && p.quantity > mat.currentStock) {
            return res.status(400).json({
              success: false,
              error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a uneto je ${p.quantity} ${mat.unit}.`
            });
          }
        }
      }
    }

    db.workOrders[idx] = { ...db.workOrders[idx], ...updates, id };
    writeDatabase(db, 'work_order_updated');
    res.json({ success: true, workOrder: db.workOrders[idx], workOrders: db.workOrders, db });
  });

  app.delete('/api/work-orders/:id', (req: Request, res: Response) => {
    const rawId = req.params.id;
    const id = decodeURIComponent(rawId);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID naloga je obavezan.' });
    }

    const db = readDatabase();

    const found = (db.workOrders || []).find((o: any) => o.id === id || o.id === rawId);
    const idToDelete = found?.id || id;

    db.workOrders = (db.workOrders || []).filter((o: any) => {
      if (!o) return false;
      if (o.id === idToDelete || o.id === id || o.id === rawId) return false;
      return true;
    });

    if (!Array.isArray(db.deletedOrderIds)) {
      db.deletedOrderIds = [];
    }
    const idsToAdd = [id, rawId, idToDelete].filter(Boolean) as string[];
    idsToAdd.forEach(x => {
      if (!db.deletedOrderIds!.includes(x)) {
        db.deletedOrderIds!.push(x);
      }
    });

    writeDatabase(db, 'work_order_deleted');
    console.log(`🗑️ [Delete Work Order] Trajno obrisan nalog/priprema ID: ${idToDelete}. Preostalo naloga u bazi: ${db.workOrders.length}`);
    res.json({ success: true, workOrders: db.workOrders, deletedOrderIds: db.deletedOrderIds, db });
  });

  // 4. Materials
  app.post('/api/materials', (req: Request, res: Response) => {
    const newMaterial = req.body;
    if (!newMaterial || typeof newMaterial !== 'object' || Array.isArray(newMaterial) || !newMaterial.id || !newMaterial.name) {
      return res.status(400).json({ success: false, error: 'Nevalidni podaci materijala.' });
    }

    const db = readDatabase();
    if (!Array.isArray(db.materials)) db.materials = [];
    if (Array.isArray(db.deletedMaterialIds)) {
      db.deletedMaterialIds = db.deletedMaterialIds.filter((mId) => mId !== newMaterial.id);
    }

    const existingIdx = db.materials.findIndex(m => m.id === newMaterial.id);
    if (existingIdx >= 0) {
      db.materials[existingIdx] = { ...db.materials[existingIdx], ...newMaterial };
    } else {
      db.materials.unshift(newMaterial);
    }
    writeDatabase(db, 'material_created');
    res.json({ success: true, materials: db.materials, db });
  });

  app.put('/api/materials/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Prazni podaci za izmjenu materijala.' });
    }

    const db = readDatabase();
    const idx = db.materials.findIndex(m => m.id === id);
    if (idx !== -1) {
      db.materials[idx] = { ...db.materials[idx], ...updates, id };
      writeDatabase(db, 'material_updated');
    }
    res.json({ success: true, materials: db.materials, db });
  });

  app.delete('/api/materials/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID materijala je obavezan.' });
    }

    const db = readDatabase();
    db.materials = (db.materials || []).filter(m => m.id !== id);
    if (!Array.isArray(db.deletedMaterialIds)) {
      db.deletedMaterialIds = [];
    }
    if (!db.deletedMaterialIds.includes(id)) {
      db.deletedMaterialIds.push(id);
    }

    writeDatabase(db, 'material_deleted');
    res.json({ success: true, materials: db.materials, deletedMaterialIds: db.deletedMaterialIds, db });
  });

  // 5. Workers
  app.post('/api/workers', (req: Request, res: Response) => {
    const newWorker = req.body;
    if (!newWorker || typeof newWorker !== 'object' || Array.isArray(newWorker) || !newWorker.username) {
      return res.status(400).json({ success: false, error: 'Nevalidni podaci radnika.' });
    }

    const db = readDatabase();
    if (Array.isArray(db.deletedWorkerIds) && newWorker.id) {
      db.deletedWorkerIds = db.deletedWorkerIds.filter((wId) => wId !== newWorker.id);
    }

    const exists = db.users.some(u => u.username.toLowerCase() === newWorker.username.toLowerCase());
    if (exists) {
      return res.status(400).json({ success: false, error: 'Korisničko ime već postoji.' });
    }
    db.users.push(newWorker);
    writeDatabase(db, 'worker_created');
    res.json({ success: true, users: db.users, db });
  });

  app.put('/api/workers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Prazni podaci za izmjenu radnika.' });
    }

    const db = readDatabase();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...updates, id };
      writeDatabase(db, 'worker_updated');
    }
    res.json({ success: true, users: db.users, db });
  });

  app.delete('/api/workers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDatabase();
    const target = (db.users || []).find(u => u.id === id);
    if (target?.role === 'admin' || id === 'user-admin') {
      return res.status(400).json({ success: false, error: 'Glavni administrator se ne može obrisati.' });
    }

    db.users = (db.users || []).filter(u => u.id !== id);
    if (!Array.isArray(db.deletedWorkerIds)) {
      db.deletedWorkerIds = [];
    }
    if (id && !db.deletedWorkerIds.includes(id)) {
      db.deletedWorkerIds.push(id);
    }

    writeDatabase(db, 'worker_deleted');
    res.json({ success: true, users: db.users, deletedWorkerIds: db.deletedWorkerIds, db });
  });

  // 6. Consumption & Completion Logging
  app.post('/api/consumption', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, error: 'Nevalidni podaci utroška.' });
    }
    const { logs, workOrderId, closedBy, status } = req.body;
    const db = readDatabase();

    if (Array.isArray(logs) && logs.length > 0) {
      // Strict validation: cannot consume more than current warehouse stock
      for (const log of logs) {
        if (log.materialId && log.quantity > 0) {
          const mat = db.materials.find(m => m.id === log.materialId);
          if (mat && log.quantity > mat.currentStock) {
            return res.status(400).json({
              success: false,
              error: `Uneta količina premašuje stanje na zalihama! Materijal "${mat.name}" ima na stanju ${mat.currentStock} ${mat.unit}, a uneto je ${log.quantity} ${mat.unit}.`
            });
          }
        }
      }

      db.consumptionLogs.push(...logs);

      // Decrement stock in materials
      logs.forEach(log => {
        if (log.materialId && log.quantity > 0) {
          const mat = db.materials.find(m => m.id === log.materialId);
          if (mat) {
            mat.currentStock = Math.max(0, Number((mat.currentStock - log.quantity).toFixed(4)));
            mat.lastUpdated = new Date().toISOString();
          }
        }
      });
    }

    if (workOrderId) {
      const order = db.workOrders.find(o => o.id === workOrderId);
      if (order) {
        if (status) order.status = status;
        if (closedBy) {
          order.closedBy = closedBy;
          // Reassign to whoever completed it if not originally assigned
          if (!order.assignedWorkers.includes(closedBy.username)) {
            order.assignedWorkers.push(closedBy.username);
          }
        }
        if (status === 'zavrseno') {
          order.completedAt = new Date().toISOString();
        }
      }
    }

    writeDatabase(db, 'consumption_recorded');
    res.json({ success: true, db });
  });

  // Admin edit consumption quantity
  app.put('/api/consumption/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { quantity } = req.body;
    const db = readDatabase();

    const log = db.consumptionLogs.find(l => l.id === id);
    if (!log) {
      return res.status(404).json({ success: false, error: 'Zapis nije pronađen.' });
    }

    const diff = Number(quantity) - log.quantity;
    log.quantity = Number(quantity);

    if (log.materialId && diff !== 0) {
      const mat = db.materials.find(m => m.id === log.materialId);
      if (mat) {
        mat.currentStock = Math.max(0, Number((mat.currentStock - diff).toFixed(4)));
        mat.lastUpdated = new Date().toISOString();
      }
    }

    writeDatabase(db, 'consumption_updated');
    res.json({ success: true, db });
  });

  // Sastavnica update
  app.put('/api/work-orders/:id/sastavnica', (req: Request, res: Response) => {
    const { id } = req.params;
    const { sastavnica } = req.body;
    const db = readDatabase();

    const order = db.workOrders.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Radni nalog nije pronađen.' });
    }

    order.sastavnica = sastavnica;
    writeDatabase(db, 'sastavnica_updated');
    res.json({ success: true, db });
  });

  // Stoppage / Downtime update
  app.put('/api/work-orders/:id/stoppage', (req: Request, res: Response) => {
    const { id } = req.params;
    const { stoppage, stoppageHistory } = req.body;
    const db = readDatabase();

    const order = db.workOrders.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Radni nalog nije pronađen.' });
    }

    order.stoppage = stoppage;
    if (Array.isArray(stoppageHistory)) {
      order.stoppageHistory = stoppageHistory;
    } else if (stoppage) {
      if (!Array.isArray(order.stoppageHistory)) order.stoppageHistory = [];
      // If not already in history, add it
      order.stoppageHistory.push(stoppage);
    }
    writeDatabase(db, 'stoppage_updated');
    res.json({ success: true, db, workOrder: order });
  });

  // 7. Google Sheets / Webhook Sync Endpoints
  app.get('/api/sheets-sync/status', (req: Request, res: Response) => {
    res.json({
      configured: Boolean(GOOGLE_SHEETS_API_URL),
      apiUrl: GOOGLE_SHEETS_API_URL ? `${GOOGLE_SHEETS_API_URL.substring(0, 35)}...` : null,
      lastSync: lastSheetsSyncTime,
      status: lastSheetsSyncStatus,
      error: lastSheetsSyncError,
    });
  });

  app.post('/api/sheets-sync/push', async (req: Request, res: Response) => {
    if (!GOOGLE_SHEETS_API_URL) {
      return res.status(400).json({ success: false, error: 'GOOGLE_SHEETS_API_URL nije podešen u okruženju.' });
    }
    const db = readDatabase();
    const ok = await syncToExternalSheets(db, 'manual_push');
    res.json({
      success: ok,
      lastSync: lastSheetsSyncTime,
      status: lastSheetsSyncStatus,
      error: lastSheetsSyncError,
    });
  });

  app.post('/api/sheets-sync/pull', async (req: Request, res: Response) => {
    if (!GOOGLE_SHEETS_API_URL) {
      return res.status(400).json({ success: false, error: 'GOOGLE_SHEETS_API_URL nije podešen u okruženju.' });
    }
    const updatedDb = await syncFromExternalSheets();
    if (updatedDb) {
      res.json({ success: true, db: updatedDb, lastSync: lastSheetsSyncTime });
    } else {
      res.status(502).json({
        success: false,
        error: lastSheetsSyncError || 'Neuspešno preuzimanje sa Google Sheets URL-a.',
        fallbackUsed: true,
      });
    }
  });

  // 8. Download complete CSV backup of all work orders from local database
  app.get('/api/backup/csv', (req: Request, res: Response) => {
    try {
      const db = readDatabase();
      const orders = db.workOrders || [];

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        'Broj naloga',
        'Naručilac',
        'Naziv posla',
        'Faza',
        'Radnici',
        'Prioritet',
        'Rok',
        'Status',
        'Datum kreiranja',
        'Zatvorio',
        'Kreirao',
        'Datum završetka',
        'Opis posla'
      ];

      const rows = orders.map(order => {
        const faza = order.status === 'priprema' ? 'U pripremi' : 'U radionici / Proizvodnja';
        const radnici = (order.assignedWorkers || []).join('; ');
        let prioritetText = 'Normalno';
        if (order.priority === 'hitno') prioritetText = 'HITNO';
        else if (order.priority === 'visoko') prioritetText = 'Visoko';

        let statusText = 'Na čekanju';
        if (order.status === 'zavrseno') statusText = 'Završeno';
        else if (order.status === 'u_izradi') statusText = 'U izradi';
        else if (order.status === 'priprema') statusText = 'U pripremi';
        else if (order.status === 'otkazano') statusText = 'Otkazano';

        const zatvorio = order.closedBy
          ? `${order.closedBy.fullName || ''} (${order.closedBy.username || ''}) ${order.closedBy.timestamp || ''}`.trim()
          : '';

        const kreirao = order.createdBy
          ? `${order.createdBy.fullName || ''} (${order.createdBy.username || ''})`.trim()
          : '';

        return [
          escapeCSV(order.orderNumber || ''),
          escapeCSV(order.customer || ''),
          escapeCSV(order.title || ''),
          escapeCSV(faza),
          escapeCSV(radnici),
          escapeCSV(prioritetText),
          escapeCSV(order.dueDate || ''),
          escapeCSV(statusText),
          escapeCSV(order.createdAt || ''),
          escapeCSV(zatvorio),
          escapeCSV(kreirao),
          escapeCSV(order.completedAt || ''),
          escapeCSV(order.description || '')
        ].join(',');
      });

      // Include UTF-8 BOM (\uFEFF) for Excel compatibility with Bosnian characters (č, ć, ž, š, đ)
      const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');

      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="backup-radni-nalozi-${dateStr}.csv"`);
      res.status(200).send(csvContent);
    } catch (err: any) {
      console.error('Error generating CSV backup:', err);
      res.status(500).json({ success: false, error: 'Greška pri generisanju CSV backup-a.' });
    }
  });

  // Reset to default - Protected by Anti-Wipe Guard unless explicitly confirmed by Admin
  app.post('/api/reset', (req: Request, res: Response) => {
    if (!req.body || req.body.confirmAdminReset !== true || req.body.role !== 'admin') {
      console.warn('🛡️ [Anti-Wipe Guard] Odbijen neautorizovan poziv na /api/reset. Postojeći podaci zadržani.');
      const currentDb = readDatabase();
      return res.json({ success: false, db: currentDb });
    }

    const initialDb: ServerDatabase = {
      users: DEFAULT_SYSTEM_USERS,
      workOrders: [],
      materials: [],
      consumptionLogs: [],
      deletedOrderIds: [],
      deletedMaterialIds: [],
      deletedWorkerIds: [],
      version: 1,
      lastUpdated: new Date().toISOString(),
    };
    writeDatabase(initialDb, 'db_admin_reset');
    res.json({ success: true, db: initialDb });
  });

  // Mount Vite middleware in development or serve static in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Authoritative local database initialization
  const bootDb = readDatabase();
  console.log(`📦 [DB Engine] Server spreman. Učitano naloga: ${bootDb.workOrders?.length || 0}, korisnika: ${bootDb.users?.length || 0}, materijala: ${bootDb.materials?.length || 0}`);
  if (GOOGLE_SHEETS_API_URL) {
    console.log(`ℹ️ [Google Sheets Sync] Eksterni URL registrovan (${GOOGLE_SHEETS_API_URL.substring(0, 30)}...). Sinhronizacija je isključivo ručna (na zahtev administratora) radi očuvanja kvote.`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified Server running on port ${PORT} (Desktop & Mobile synchronized)`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
