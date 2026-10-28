export type UserRole = 'admin' | 'worker';

export interface WorkerPermissions {
  canCreateOrders?: boolean;      // Pravljenje / izdavanje novih radnih naloga
  canEditOrders?: boolean;        // Izmjena postojećih radnih naloga
  canDeleteOrders?: boolean;      // Brisanje / otkazivanje radnih naloga
  canManageMaterials?: boolean;   // Upravljanje materijalima i skladištem zaliha
  canPrepareModels?: boolean;     // Pristup pripremi modela i puštanje u proizvodnju
  canViewReports?: boolean;       // Pregled analitike i izvještaja proizvodnje
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  password?: string;
  createdAt?: string;
  permissions?: WorkerPermissions;
}

export type OrderStatus = 'priprema' | 'na_cekanju' | 'u_izradi' | 'zavrseno' | 'otkazano';
export type OrderPriority = 'normalno' | 'hitno' | 'visoko';
export type UnitOfMeasure = 'm3' | 'm2' | 'm' | 'kom' | 'kg' | 'l' | 'pak';

export type SastavnicaStatus = 'napravljena' | 'nije_napravljena';

export interface SastavnicaInfo {
  status: SastavnicaStatus;
  brojSastavnice?: string;
  evidentiranoDatum?: string;
  napomena?: string;
}

export interface ClosedByInfo {
  username: string;
  fullName: string;
  timestamp: string;
}

export interface PlannedMaterial {
  materialId?: string;
  materialName: string;
  quantity?: number;
  unit: string;
}

export interface ModelPreparationInfo {
  modelName?: string; // Tačan naziv ili oznaka modela (npr. "Model kuhinje LUX", "Ormar 3D", "Profil stolice")
  targetWorker?: string; // Za kog konkretnog radnika se priprema model (username)
  targetWorkerName?: string; // Puno ime radnika
  dimensions?: string; // Dimenzije, rezni list, tehničke specifikacije
  notes?: string; // Digitalna priprema, CNC putanje, CAD fajlovi, upute za pripremu
  isReady?: boolean; // Da li je digitalna priprema modela završena
  readyAt?: string; // Datum i vrijeme kada je model pušten u rad
  readyBy?: string; // Ko je pustio u rad (administrator)
}

export interface StoppageInfo {
  reason: string; // npr. 'Kvar mašine' | 'Čekanje materijala' | 'Nestanak struje' | 'Kvar alata' | 'Čekanje tehničke dokumentacije' | 'Drugo'
  description?: string; // detaljan opis problema
  reportedBy: string; // username
  reportedByName: string; // puno ime radnika ili admina
  reportedAt: string; // datum i vreme prijave
  resolved?: boolean; // da li je zastoj rešen
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolutionNote?: string;
}

export interface CreatedByInfo {
  username: string;
  fullName: string;
  timestamp?: string;
}

export interface WorkOrder {
  id: string;
  orderNumber: string;
  customer: string; // Za koga se radi (Naručilac / Kupac)
  title: string;
  description: string;
  assignedWorkers: string[]; // usernames of assigned workers
  workerNotes?: Record<string, string>; // worker-specific assignment note
  plannedMaterials?: PlannedMaterial[]; // Do 4 materijala koje je admin naveo
  status: OrderStatus;
  priority: OrderPriority;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  createdBy?: CreatedByInfo; // Ko je kreirao radni nalog
  closedBy?: ClosedByInfo; // Ko je zatvorio radni nalog
  sastavnica?: SastavnicaInfo;
  stoppage?: StoppageInfo; // Trenutni / aktivni zastoj
  stoppageHistory?: StoppageInfo[]; // Istorija svih zabeleženih zastoja
  modelPreparation?: ModelPreparationInfo; // Detalji pripreme modela
}

export interface Material {
  id: string;
  code: string;
  name: string;
  unit: UnitOfMeasure;
  currentStock: number;
  minStock: number;
  category: string;
  lastUpdated: string;
  createdBy?: CreatedByInfo; // Ko je unio materijal
}

export interface ConsumptionLog {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  customer?: string;
  workerUsername: string;
  workerName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: UnitOfMeasure;
  hoursSpent: number;
  minutesSpent: number;
  note?: string;
  timestamp: string;
}

export interface MultiMaterialEntry {
  materialId: string;
  quantity: number;
}
