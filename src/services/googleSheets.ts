import { getAccessToken } from './googleAuth';
import { WorkOrder, Material, ConsumptionLog } from '../types';

export interface SheetDefinition {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

/**
 * Formats Serbian statuses for Google Sheets display
 */
export const formatOrderStatus = (status: string): string => {
  switch (status) {
    case 'zavrseno':
      return 'Završeno';
    case 'u_izradi':
      return 'U izradi';
    case 'na_cekanju':
      return 'Na čekanju';
    case 'otkazano':
      return 'Otkazano';
    default:
      return status;
  }
};

export const formatPriority = (priority: string): string => {
  switch (priority) {
    case 'visoko':
    case 'hitno':
      return 'Hitno';
    default:
      return 'Normalno';
  }
};

/**
 * Creates a brand new Google Spreadsheet on the user's Google Drive
 * populated with multiple tabs, headers, styled header rows, and all data.
 */
export const createSpreadsheetWithData = async (
  title: string,
  sheets: SheetDefinition[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Niste prijavljeni na Google račun ili je sesija istekla. Molimo prijavite se.');
  }

  // 1. Create spreadsheet with sheets
  const createPayload = {
    properties: {
      title,
    },
    sheets: sheets.map((s) => ({
      properties: {
        title: s.title,
        gridProperties: {
          frozenRowCount: 1,
        },
      },
    })),
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    const message = errorData.error?.message || `Greška ${createRes.status}: Neuspješno kreiranje Google Tabele.`;
    throw new Error(message);
  }

  const createdSpreadsheet = await createRes.json();
  const spreadsheetId = createdSpreadsheet.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Batch update data (populate cells)
  const valueData = sheets.map((s) => ({
    range: `'${s.title}'!A1`,
    values: [s.headers, ...s.rows],
  }));

  const updateValuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueData,
      }),
    }
  );

  if (!updateValuesRes.ok) {
    console.warn('Upozorenje: Podaci nisu potpuno upisani:', await updateValuesRes.text());
  }

  // 3. Batch update styling: Dark blue headers with white bold text & auto-fit columns
  try {
    const requests: any[] = [];
    const createdSheetsList = createdSpreadsheet.sheets || [];

    createdSheetsList.forEach((sheetObj: any, index: number) => {
      const sheetId = sheetObj.properties.sheetId;
      const colCount = sheets[index]?.headers.length || 10;

      // Header row styling (slate-800 background, bold white text)
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: colCount,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.16, blue: 0.22 }, // Dark slate
              textFormat: {
                foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                bold: true,
                fontSize: 10,
              },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

      // Auto resize columns
      requests.push({
        autoResizeDimensions: {
          dimensions: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: colCount,
          },
        },
      });
    });

    if (requests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });
    }
  } catch {
    // Styling is non-critical, spreadsheet created
  }

  return { spreadsheetId, spreadsheetUrl };
};

/**
 * List recent spreadsheets created/owned by user using Google Drive API
 */
export const listRecentSpreadsheets = async (): Promise<DriveSpreadsheetFile[]> => {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,modifiedTime,webViewLink)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
    }));
  } catch {
    return [];
  }
};

/**
 * Convert WorkOrders to SheetDefinition
 */
export const buildWorkOrdersSheet = (orders: WorkOrder[]): SheetDefinition => {
  const headers = [
    'Broj naloga',
    'Kupac / Za koga se radi',
    'Naziv posla',
    'Opis',
    'Zaduženi radnici',
    'Planirani materijali (do 4)',
    'Status',
    'Prioritet',
    'Rok izrade',
    'Datum kreiranja',
    'Završeno dana',
    'Zatvorio radnik',
    'Status sastavnice',
    'Broj sastavnice',
    'Napomena sastavnice',
  ];

  const rows = orders.map((o) => {
    const plannedMatStr = (o.plannedMaterials || [])
      .map((m) => `${m.materialName} (${m.quantity || 0} ${m.unit})`)
      .join('; ');

    const sastavnicaStatusStr = o.sastavnica?.status === 'napravljena' ? 'Napravljena' : 'Nije napravljena';

    return [
      o.orderNumber,
      o.customer || 'Nije navedeno',
      o.title,
      o.description || '',
      (o.assignedWorkers || []).join(', '),
      plannedMatStr || 'Nema',
      formatOrderStatus(o.status),
      formatPriority(o.priority),
      o.dueDate || '',
      o.createdAt || '',
      o.completedAt || '',
      o.closedBy ? `${o.closedBy.fullName} (${o.closedBy.username})` : '',
      sastavnicaStatusStr,
      o.sastavnica?.brojSastavnice || '',
      o.sastavnica?.napomena || '',
    ];
  });

  return {
    title: 'Radni Nalozi',
    headers,
    rows,
  };
};

/**
 * Convert ConsumptionLogs to SheetDefinition
 */
export const buildConsumptionSheet = (logs: ConsumptionLog[]): SheetDefinition => {
  const headers = [
    'Datum & Vrijeme',
    'Broj radnog naloga',
    'Kupac / Za koga se radi',
    'Naziv radnog naloga',
    'Radnik (ime)',
    'Korisničko ime radnika',
    'Utrošeni materijal',
    'Utrošena količina',
    'Jedinica mjere',
    'Radno vrijeme (sati)',
    'Radno vrijeme (minuti)',
    'Ukupno vrijeme (h:mm)',
    'Napomena',
  ];

  const rows = logs.map((l) => [
    l.timestamp,
    l.workOrderNumber,
    l.customer || '',
    l.workOrderTitle,
    l.workerName,
    l.workerUsername,
    l.materialName,
    l.quantity,
    l.unit,
    l.hoursSpent,
    l.minutesSpent,
    `${l.hoursSpent}h ${l.minutesSpent}min`,
    l.note || '',
  ]);

  return {
    title: 'Utrošak & Vrijeme',
    headers,
    rows,
  };
};

/**
 * Convert Materials to SheetDefinition
 */
export const buildMaterialsSheet = (materials: Material[]): SheetDefinition => {
  const headers = [
    'Šifra',
    'Naziv materijala',
    'Jedinica mjere',
    'Trenutno stanje',
    'Minimalno stanje zaliha',
    'Kategorija',
    'Zadnje ažurirano',
  ];

  const rows = materials.map((m) => [
    m.code,
    m.name,
    m.unit,
    m.currentStock,
    m.minStock,
    m.category,
    m.lastUpdated || '',
  ]);

  return {
    title: 'Baza Materijala',
    headers,
    rows,
  };
};

/**
 * Convert Sastavnice to SheetDefinition
 */
export const buildSastavniceSheet = (orders: WorkOrder[]): SheetDefinition => {
  const headers = [
    'Broj radnog naloga',
    'Kupac / Za koga se radi',
    'Naziv posla',
    'Status sastavnice',
    'Broj sastavnice',
    'Datum evidentiranja sastavnice',
    'Zatvorio radnik',
    'Napomena',
  ];

  const completedOrders = orders.filter((o) => o.status === 'zavrseno' || o.sastavnica);

  const rows = completedOrders.map((o) => [
    o.orderNumber,
    o.customer || '',
    o.title,
    o.sastavnica?.status === 'napravljena' ? 'Napravljena' : 'Nije napravljena',
    o.sastavnica?.brojSastavnice || 'Nema',
    o.sastavnica?.evidentiranoDatum || o.completedAt || '',
    o.closedBy ? `${o.closedBy.fullName} (${o.closedBy.username})` : 'Nepoznato',
    o.sastavnica?.napomena || '',
  ]);

  return {
    title: 'Sastavnice & Izvještaj',
    headers,
    rows,
  };
};
