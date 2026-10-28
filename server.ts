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
  version: number;
  lastUpdated: string;
}

// In-memory cache singleton - Single Source of Truth
let memoryDb: ServerDatabase | null = null;

const cloneDb = (db: ServerDatabase): ServerDatabase => {
  return JSON.parse(JSON.stringify(db));
};

// Atomically save database to disk (temp file -> renameSync) + persistent backup
function writeDatabase(db: ServerDatabase, eventType?: string): boolean {
  try {
    // 🛡️ ANTI-WIPE GUARD: Never allow overwriting non-empty workOrders with empty array!
    if (memoryDb && Array.isArray(memoryDb.workOrders) && memoryDb.workOrders.length > 0) {
      if (!Array.isArray(db.workOrders) || db.workOrders.length === 0) {
        if (eventType !== 'db_reset') {
          console.warn(`🛡️ [DB Guard] Blokirano resetovanje naloga na prazno! Zadržano ${memoryDb.workOrders.length} postojećih naloga.`);
          db.workOrders = cloneDb(memoryDb).workOrders;
        }
      }
    }

    db.version = (db.version || 0) + 1;
    db.lastUpdated = new Date().toISOString();

    // 1. Immediately update in-memory state
    memoryDb = cloneDb(db);

    // 2. Atomic disk write via unique temporary file (prevents empty/corrupt reads)
    const serialized = JSON.stringify(db, null, 2);
    const tmpFile = `${DB_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    fs.writeFileSync(tmpFile, serialized, 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);

    // 3. Keep persistent backup whenever workOrders or materials exist
    if ((db.workOrders && db.workOrders.length > 0) || (db.materials && db.materials.length > 0)) {
      try {
        fs.writeFileSync(DB_BACKUP_FILE, serialized, 'utf-8');
      } catch (backupErr) {
        console.warn('⚠️ [DB Engine] Backup write warning:', backupErr);
      }
    }

    // Notice: Automatic external network sync (Google Sheets/Git) is deliberately DISABLED here.
    // All order and warehouse operations are stored locally and atomically to avoid Quota Exceeded errors.

    return true;
  } catch (err) {
    console.error('Error saving server database file:', err);
    return false;
  }
}

// Helper to validate and sanitize any loaded database object
function sanitizeLoadedDb(parsed: any): ServerDatabase | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const userMap = new Map<string, any>();
  DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
  if (Array.isArray(parsed.users)) {
    parsed.users.forEach((u: any) => {
      if (u && u.id) userMap.set(u.id, { ...userMap.get(u.id), ...u });
    });
  }
  const sanitizedUsers = Array.from(userMap.values()).map((u) =>
    u.username === 'admin' ? { ...u, password: 'admin123' } : u
  );

  const workOrders = Array.isArray(parsed.workOrders) ? parsed.workOrders : [];
  const materials = Array.isArray(parsed.materials) ? parsed.materials : [];
  const consumptionLogs = Array.isArray(parsed.consumptionLogs) ? parsed.consumptionLogs : [];
  const deletedOrderIds = Array.isArray(parsed.deletedOrderIds) ? parsed.deletedOrderIds : [];

  return {
    users: sanitizedUsers,
    workOrders,
    materials,
    consumptionLogs,
    deletedOrderIds,
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    lastUpdated: parsed.lastUpdated || new Date().toISOString(),
  };
}

// Safely load database without ever wiping existing records
function readDatabase(): ServerDatabase {
  if (memoryDb && Array.isArray(memoryDb.workOrders)) {
    return cloneDb(memoryDb);
  }

  // 1. Try reading primary DB_FILE
  let primaryDb: ServerDatabase | null = null;
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8').trim();
      if (content) {
        primaryDb = sanitizeLoadedDb(JSON.parse(content));
      }
    }
  } catch (err) {
    console.warn('⚠️ [DB Engine] Greška pri čitanju DB_FILE:', err);
  }

  // 2. Try reading BACKUP_FILE
  let backupDb: ServerDatabase | null = null;
  try {
    if (fs.existsSync(DB_BACKUP_FILE)) {
      const backupContent = fs.readFileSync(DB_BACKUP_FILE, 'utf-8').trim();
      if (backupContent) {
        backupDb = sanitizeLoadedDb(JSON.parse(backupContent));
      }
    }
  } catch (err) {
    console.warn('⚠️ [DB Engine] Greška pri čitanju backup fajla:', err);
  }

  // 3. Multi-tier non-destructive merge: always keep whichever has existing orders
  let chosenDb: ServerDatabase | null = null;
  if (primaryDb && backupDb) {
    if (backupDb.workOrders.length > primaryDb.workOrders.length) {
      console.log(`🛡️ [DB Engine] Backup ima više naloga (${backupDb.workOrders.length}) od primarnog fajla (${primaryDb.workOrders.length}). Spajanje...`);
      const orderMap = new Map<string, any>();
      backupDb.workOrders.forEach((o) => { if (o && o.id) orderMap.set(o.id, o); });
      primaryDb.workOrders.forEach((o) => { if (o && o.id) orderMap.set(o.id, { ...orderMap.get(o.id), ...o }); });
      primaryDb.workOrders = Array.from(orderMap.values());
    }
    chosenDb = primaryDb;
  } else if (primaryDb) {
    chosenDb = primaryDb;
  } else if (backupDb) {
    chosenDb = backupDb;
  }

  if (chosenDb) {
    memoryDb = chosenDb;
    return cloneDb(memoryDb);
  }

  // 4. Fallback only if absolutely no database files exist on disk
  const initialDb: ServerDatabase = {
    users: DEFAULT_SYSTEM_USERS,
    workOrders: [],
    materials: [],
    consumptionLogs: [],
    deletedOrderIds: [],
    version: 1,
    lastUpdated: new Date().toISOString(),
  };

  memoryDb = initialDb;
  writeDatabase(memoryDb, 'initial_setup');
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

  // Basic CORS & JSON parser
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // API Endpoints - Single Source of Truth for ALL devices (Desktop, Mobile, Tablet)
  
  // 1. Get full live application state (with optional on-demand refresh from Google Sheets)
  app.get('/api/state', async (req: Request, res: Response) => {
    if (req.query.refresh === 'true' && GOOGLE_SHEETS_API_URL) {
      await syncFromExternalSheets();
    }
    const db = readDatabase();
    res.json(db);
  });

  // 2. Full synchronization endpoint - Safe non-destructive merge
  app.post('/api/sync', (req: Request, res: Response) => {
    const { users, workOrders, materials, consumptionLogs, deletedOrderIds } = req.body;
    const db = readDatabase();

    // Merge deleted order IDs tombstones
    if (Array.isArray(deletedOrderIds)) {
      const tombstoneSet = new Set(db.deletedOrderIds || []);
      deletedOrderIds.forEach((id: string) => { if (id) tombstoneSet.add(id); });
      db.deletedOrderIds = Array.from(tombstoneSet);
    }
    const currentDeletedSet = new Set(db.deletedOrderIds || []);

    const isSyncTombstoned = (o: any) => {
      if (!o || !o.id) return false;
      return currentDeletedSet.has(o.id);
    };

    if (Array.isArray(users) && users.length > 0) {
      const userMap = new Map<string, any>();
      DEFAULT_SYSTEM_USERS.forEach((u) => userMap.set(u.id, u));
      (db.users || []).forEach((u) => { if (u?.id) userMap.set(u.id, u); });
      users.forEach((u: any) => { if (u?.id) userMap.set(u.id, { ...userMap.get(u.id), ...u }); });
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

    if (Array.isArray(workOrders) && workOrders.length > 0) {
      workOrders.forEach((o: any) => {
        if (o && o.id && !isSyncTombstoned(o)) {
          const existing = orderMap.get(o.id);
          orderMap.set(o.id, { ...existing, ...o });
        }
      });
    }

    db.workOrders = Array.from(orderMap.values());

    if (Array.isArray(materials) && materials.length > 0) {
      const matMap = new Map<string, any>();
      (db.materials || []).forEach((m) => { if (m?.id) matMap.set(m.id, m); });
      materials.forEach((m: any) => { if (m?.id) matMap.set(m.id, { ...matMap.get(m.id), ...m }); });
      db.materials = Array.from(matMap.values());
    }

    if (Array.isArray(consumptionLogs) && consumptionLogs.length > 0) {
      const logMap = new Map<string, any>();
      (db.consumptionLogs || []).forEach((l) => { if (l?.id) logMap.set(l.id, l); });
      consumptionLogs.forEach((l: any) => { if (l?.id) logMap.set(l.id, l); });
      db.consumptionLogs = Array.from(logMap.values());
    }

    writeDatabase(db, 'safe_merge_sync');
    res.json({ success: true, db });
  });

  // 3. Work Orders - Unlimited persistent storage (Safe additive merge)
  app.post('/api/work-orders', (req: Request, res: Response) => {
    const newOrder = req.body;
    if (!newOrder || !newOrder.orderNumber || !newOrder.title) {
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

    writeDatabase(db, 'work_order_created');
    console.log(`✅ [Work Order Created] Nalog "${newOrder.orderNumber}" (ID: ${newOrder.id}) uspešno sačuvan. Ukupno naloga u bazi: ${db.workOrders.length}`);
    res.json({ success: true, workOrder: newOrder, workOrders: db.workOrders });
  });

  app.put('/api/work-orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
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

    db.workOrders[idx] = { ...db.workOrders[idx], ...updates };
    writeDatabase(db, 'work_order_updated');
    res.json({ success: true, workOrder: db.workOrders[idx], workOrders: db.workOrders });
  });

  app.delete('/api/work-orders/:id', (req: Request, res: Response) => {
    const rawId = req.params.id;
    const id = decodeURIComponent(rawId);
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
    res.json({ success: true, workOrders: db.workOrders, deletedOrderIds: db.deletedOrderIds });
  });

  // 4. Materials
  app.post('/api/materials', (req: Request, res: Response) => {
    const newMaterial = req.body;
    const db = readDatabase();
    db.materials.push(newMaterial);
    writeDatabase(db, 'material_created');
    res.json({ success: true, materials: db.materials });
  });

  app.put('/api/materials/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    const db = readDatabase();
    const idx = db.materials.findIndex(m => m.id === id);
    if (idx !== -1) {
      db.materials[idx] = { ...db.materials[idx], ...updates };
      writeDatabase(db, 'material_updated');
    }
    res.json({ success: true, materials: db.materials });
  });

  app.delete('/api/materials/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDatabase();
    db.materials = db.materials.filter(m => m.id !== id);
    writeDatabase(db, 'material_deleted');
    res.json({ success: true, materials: db.materials });
  });

  // 5. Workers
  app.post('/api/workers', (req: Request, res: Response) => {
    const newWorker = req.body;
    const db = readDatabase();
    const exists = db.users.some(u => u.username.toLowerCase() === newWorker.username.toLowerCase());
    if (exists) {
      return res.status(400).json({ success: false, error: 'Korisničko ime već postoji.' });
    }
    db.users.push(newWorker);
    writeDatabase(db, 'worker_created');
    res.json({ success: true, users: db.users });
  });

  app.put('/api/workers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    const db = readDatabase();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...updates };
      writeDatabase(db, 'worker_updated');
    }
    res.json({ success: true, users: db.users });
  });

  app.delete('/api/workers/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const db = readDatabase();
    db.users = db.users.filter(u => u.id !== id);
    writeDatabase(db, 'worker_deleted');
    res.json({ success: true, users: db.users });
  });

  // 6. Consumption & Completion Logging
  app.post('/api/consumption', (req: Request, res: Response) => {
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

  // Reset to default
  app.post('/api/reset', (req: Request, res: Response) => {
    const initialDb: ServerDatabase = {
      users: DEFAULT_SYSTEM_USERS,
      workOrders: [],
      materials: [],
      consumptionLogs: [],
      version: 1,
      lastUpdated: new Date().toISOString(),
    };
    writeDatabase(initialDb, 'db_reset');
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
