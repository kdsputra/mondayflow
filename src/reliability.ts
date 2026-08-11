import type { PlatformState } from "./platform";
import type { AccountState, BoardSnapshot } from "./types";

export type ObservabilityEvent = {
  id: string;
  type: "metric" | "error" | "rejection" | "lifecycle";
  name: string;
  value: number;
  detail: string;
  created_at: string;
};

export type BackupBundle = {
  product: "MondayFlow";
  schema_version: 7;
  created_at: string;
  workspace_id: string;
  board_id: string;
  account: AccountState;
  snapshot: BoardSnapshot;
  platform: PlatformState;
};

const events: ObservabilityEvent[] = [];

function capture(type: ObservabilityEvent["type"], name: string, value = 0, detail = "") {
  const event = { id: crypto.randomUUID(), type, name, value, detail: detail.slice(0, 1000), created_at: new Date().toISOString() } satisfies ObservabilityEvent;
  events.unshift(event);
  if (events.length > 100) events.pop();
  window.dispatchEvent(new CustomEvent("mondayflow:observability", { detail: event }));
}

export function startObservability() {
  capture("lifecycle", "app_started");
  const onError = (event: ErrorEvent) => capture("error", "window_error", 1, `${event.message} at ${event.filename}:${event.lineno}`);
  const onRejection = (event: PromiseRejectionEvent) => capture("rejection", "unhandled_rejection", 1, String(event.reason?.message ?? event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const observers: PerformanceObserver[] = [];
  if ("PerformanceObserver" in window) {
    observe("largest-contentful-paint", (entries) => { const last = entries[entries.length - 1]; if (last) capture("metric", "LCP", Math.round(last.startTime)); }, observers);
    observe("layout-shift", (entries) => { const value = entries.reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : Number(entry.value ?? 0)), 0); if (value) capture("metric", "CLS", Number(value.toFixed(4))); }, observers);
    observe("longtask", (entries) => entries.forEach((entry) => capture("metric", "long_task", Math.round(entry.duration))), observers);
  }
  window.addEventListener("load", () => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) capture("metric", "TTFB", Math.round(navigation.responseStart));
  }, { once: true });
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); observers.forEach((observer) => observer.disconnect()); };
}

function observe(type: string, callback: (entries: Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) => void, observers: PerformanceObserver[]) {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>));
    observer.observe({ type, buffered: true });
    observers.push(observer);
  } catch { /* Unsupported metric in this browser. */ }
}

export function observabilitySnapshot() { return [...events]; }

export function createBackupBundle(workspaceId: string, boardId: string, account: AccountState, snapshot: BoardSnapshot, platform: PlatformState): BackupBundle {
  return { product: "MondayFlow", schema_version: 7, created_at: new Date().toISOString(), workspace_id: workspaceId, board_id: boardId, account, snapshot, platform };
}

export function parseBackupBundle(value: string): BackupBundle {
  const parsed = JSON.parse(value) as Partial<BackupBundle>;
  if (parsed.product !== "MondayFlow" || parsed.schema_version !== 7 || !parsed.account || !parsed.snapshot || !parsed.platform || !parsed.workspace_id || !parsed.board_id) throw new Error("This is not a valid MondayFlow phase 7 backup.");
  if (!Array.isArray(parsed.snapshot.items) || !Array.isArray(parsed.account.workspaces)) throw new Error("Backup data is incomplete.");
  return parsed as BackupBundle;
}

export function downloadBackup(bundle: BackupBundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mondayflow-backup-${bundle.created_at.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
