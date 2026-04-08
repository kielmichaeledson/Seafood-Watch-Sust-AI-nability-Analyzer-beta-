import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'SeafoodSustAInDB';
const DB_VERSION = 1;

export interface AnalysisHistory {
  id: string;
  timestamp: number;
  fileName: string;
  rowCount: number;
  results: any[];
  summary: any;
}

export interface SemanticCacheEntry {
  key: string;
  value: any;
  timestamp: number;
}

export const initDB = async (): Promise<IDBPDatabase> => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // History store
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id' });
      }
      
      // Semantic cache store
      if (!db.objectStoreNames.contains('semanticCache')) {
        db.createObjectStore('semanticCache', { keyPath: 'key' });
      }
    },
  });
};

export const saveHistory = async (history: AnalysisHistory) => {
  const db = await initDB();
  return db.put('history', history);
};

export const getHistory = async (): Promise<AnalysisHistory[]> => {
  const db = await initDB();
  return db.getAll('history');
};

export const deleteHistory = async (id: string) => {
  const db = await initDB();
  return db.delete('history', id);
};

export const saveSemanticCache = async (key: string, value: any) => {
  const db = await initDB();
  return db.put('semanticCache', {
    key,
    value,
    timestamp: Date.now()
  });
};

export const getSemanticCache = async (key: string) => {
  const db = await initDB();
  const entry = await db.get('semanticCache', key);
  return entry ? entry.value : null;
};

export const clearSemanticCache = async () => {
  const db = await initDB();
  return db.clear('semanticCache');
};
