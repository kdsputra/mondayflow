export type OfflineOperationType = "insert_item" | "patch_item" | "remove_items" | "insert_update" | "insert_activity" | "save_platform";

export type OfflineOperation = {
  id: string;
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  last_error: string;
};

const databaseName = "mondayflow-offline-v1";
const storeName = "operations";
let flushing = false;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    action(tx.objectStore(storeName), resolve, reject);
    tx.oncomplete = () => database.close();
    tx.onerror = () => reject(tx.error);
  });
}

function announceQueueChange() {
  window.dispatchEvent(new CustomEvent("mondayflow:offline-queue"));
}

export async function enqueueOfflineOperation(type: OfflineOperationType, payload: Record<string, unknown>) {
  const operation: OfflineOperation = { id: crypto.randomUUID(), type, payload, created_at: new Date().toISOString(), attempts: 0, last_error: "" };
  await transaction<void>("readwrite", (store, resolve, reject) => { const request = store.put(operation); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  announceQueueChange();
  return operation;
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> {
  if (typeof indexedDB === "undefined") return [];
  return transaction<OfflineOperation[]>("readonly", (store, resolve, reject) => { const request = store.getAll(); request.onsuccess = () => resolve((request.result as OfflineOperation[]).sort((a, b) => a.created_at.localeCompare(b.created_at))); request.onerror = () => reject(request.error); });
}

export async function offlineQueueCount() { return (await listOfflineOperations()).length; }

export async function clearOfflineQueue() {
  await transaction<void>("readwrite", (store, resolve, reject) => { const request = store.clear(); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  announceQueueChange();
}

async function removeOperation(id: string) {
  await transaction<void>("readwrite", (store, resolve, reject) => { const request = store.delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

async function updateOperation(operation: OfflineOperation) {
  await transaction<void>("readwrite", (store, resolve, reject) => { const request = store.put(operation); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

export async function flushOfflineOperations(executor: (operation: OfflineOperation) => Promise<void>) {
  if (flushing || !navigator.onLine) return { completed: 0, remaining: await offlineQueueCount() };
  flushing = true;
  let completed = 0;
  try {
    const operations = await listOfflineOperations();
    for (const operation of operations) {
      try {
        await executor(operation);
        await removeOperation(operation.id);
        completed += 1;
      } catch (caught) {
        const next = { ...operation, attempts: operation.attempts + 1, last_error: (caught as Error).message.slice(0, 300) };
        await updateOperation(next);
        if (isOfflineError(caught)) break;
      }
    }
  } finally {
    flushing = false;
    announceQueueChange();
  }
  return { completed, remaining: await offlineQueueCount() };
}

export function isOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = String((error as Error)?.message ?? error).toLowerCase();
  return message.includes("failed to fetch") || message.includes("network") || message.includes("load failed") || message.includes("connection");
}
