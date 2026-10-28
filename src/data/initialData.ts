import { Material, WorkOrder, ConsumptionLog, User } from '../types';

export const SYSTEM_USERS: User[] = [
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

// Početno prazne baze materijala, radnih naloga i utrošaka kako bi administrator uneo svoje prave podatke
export const INITIAL_MATERIALS: Material[] = [];

export const INITIAL_WORK_ORDERS: WorkOrder[] = [];

export const INITIAL_CONSUMPTION_LOGS: ConsumptionLog[] = [];
