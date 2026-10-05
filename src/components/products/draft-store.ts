// Keeps "Add many at once" drafts (the photos and videos themselves, and
// what's been typed) on this phone or computer, so a closed tab, a dead
// battery or a failed upload doesn't lose them. One set per business, in the
// browser's IndexedDB; nothing leaves the device until it's posted.

const DB_NAME = "spendbox-drafts";
const STORE = "bulk";

export interface StoredDraft {
  key: string;
  type: "image" | "video";
  file: Blob;
  fileName: string;
  fileType: string;
  poster: Blob | null;
  aspect?: number | null;
  kind: "product" | "service";
  title: string;
  description: string;
  price: string;
  category: string | null;
  selected: boolean;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDrafts(bizId: string): Promise<StoredDraft[]> {
  try {
    const saved = await run<{ drafts?: StoredDraft[] } | undefined>("readonly", (s) => s.get(bizId));
    return Array.isArray(saved?.drafts) ? saved.drafts.filter((d) => d && d.file instanceof Blob) : [];
  } catch {
    return [];
  }
}

export async function saveDrafts(bizId: string, drafts: StoredDraft[]) {
  try {
    if (drafts.length) await run("readwrite", (s) => s.put({ savedAt: Date.now(), drafts }, bizId));
    else await run("readwrite", (s) => s.delete(bizId));
    return true;
  } catch {
    return false;
  }
}

export const clearDrafts = (bizId: string) => saveDrafts(bizId, []);
