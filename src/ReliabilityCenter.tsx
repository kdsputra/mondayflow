import { useEffect, useMemo, useRef, useState } from "react";
import { CloudDownload, CloudUpload, DatabaseBackup, Download, HardDrive, RefreshCw, ShieldCheck, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { flushDatabaseOfflineQueue, hasOnlineDatabase, loadBackupRecords, requestCloudBackup, requestCloudRestore, type WorkspaceBackupRecord } from "./database";
import { clearOfflineQueue, listOfflineOperations, type OfflineOperation } from "./offline";
import type { PlatformState, ReliabilitySettings } from "./platform";
import { canInstallPwa, installPwa, isStandalonePwa } from "./pwa";
import { createBackupBundle, downloadBackup, observabilitySnapshot, parseBackupBundle, type BackupBundle, type ObservabilityEvent } from "./reliability";
import type { AccountState, BoardSnapshot } from "./types";

type Props = {
  account: AccountState;
  snapshot: BoardSnapshot;
  platform: PlatformState;
  workspaceId: string;
  boardId: string;
  online: boolean;
  canManage: boolean;
  onPlatformChange: (next: PlatformState) => void;
  onRestore: (bundle: BackupBundle) => Promise<void>;
  onNotify: (message: string) => void;
  onClose: () => void;
};

export default function ReliabilityCenter(props: Props) {
  const { account, snapshot, platform, workspaceId, boardId, online, canManage, onPlatformChange, onRestore, onNotify, onClose } = props;
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [events, setEvents] = useState<ObservabilityEvent[]>(observabilitySnapshot());
  const [backups, setBackups] = useState<WorkspaceBackupRecord[]>([]);
  const [installable, setInstallable] = useState(canInstallPwa());
  const [working, setWorking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const restoreInput = useRef<HTMLInputElement | null>(null);

  const refreshQueue = () => void listOfflineOperations().then(setOperations).catch(() => setOperations([]));
  const refreshBackups = () => void loadBackupRecords(workspaceId).then(setBackups).catch(() => setBackups([]));

  useEffect(() => {
    refreshQueue();
    refreshBackups();
    const queueChanged = () => refreshQueue();
    const metricsChanged = () => setEvents(observabilitySnapshot());
    const installChanged = () => setInstallable(canInstallPwa());
    window.addEventListener("mondayflow:offline-queue", queueChanged);
    window.addEventListener("mondayflow:observability", metricsChanged);
    window.addEventListener("mondayflow:pwa-install", installChanged);
    return () => {
      window.removeEventListener("mondayflow:offline-queue", queueChanged);
      window.removeEventListener("mondayflow:observability", metricsChanged);
      window.removeEventListener("mondayflow:pwa-install", installChanged);
    };
  }, [workspaceId]);

  const metrics = useMemo(() => Object.fromEntries(events.filter((event) => event.type === "metric").map((event) => [event.name, event.value])), [events]);
  const recentProblems = events.filter((event) => event.type === "error" || event.type === "rejection").slice(0, 4);

  function updateReliability(patch: Partial<ReliabilitySettings>) {
    if (!canManage) return;
    onPlatformChange({ ...platform, reliability: { ...platform.reliability, ...patch } });
  }

  async function syncNow() {
    setWorking(true);
    try {
      const result = await flushDatabaseOfflineQueue();
      refreshQueue();
      onNotify(result.remaining ? `${result.completed} perubahan tersinkron, ${result.remaining} masih menunggu.` : `${result.completed} perubahan berhasil disinkronkan.`);
    } catch (error) {
      onNotify((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function createLocalBackup() {
    const bundle = createBackupBundle(workspaceId, boardId, account, snapshot, platform);
    downloadBackup(bundle);
    updateReliability({ last_backup_at: bundle.created_at });
    onNotify("Backup lokal berhasil dibuat.");
  }

  async function createOnlineBackup() {
    setWorking(true);
    try {
      await requestCloudBackup(workspaceId);
      const now = new Date().toISOString();
      updateReliability({ last_backup_at: now });
      refreshBackups();
      onNotify("Backup online selesai dibuat.");
    } catch (error) {
      onNotify((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function restore(file: File) {
    setWorking(true);
    try {
      const bundle = parseBackupBundle(await file.text());
      if (hasOnlineDatabase && bundle.workspace_id !== workspaceId) throw new Error("Backup berasal dari workspace yang berbeda.");
      if (hasOnlineDatabase) await requestCloudRestore(workspaceId, bundle);
      await onRestore(bundle);
      onNotify("Backup berhasil dipulihkan.");
    } catch (error) {
      onNotify((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="reliability-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="reliability-center" role="dialog" aria-modal="true" aria-label="Reliability center">
        <header>
          <div><span><ShieldCheck size={19} /></span><div><strong>Reliability center</strong><small>Offline, backup, dan kesehatan aplikasi</small></div></div>
          <button className="icon-button" onClick={onClose} aria-label="Close reliability center"><X size={18} /></button>
        </header>

        <div className="reliability-status">
          <Status icon={online ? <Wifi size={17} /> : <WifiOff size={17} />} label="Network" value={online ? "Online" : "Offline"} tone={online ? "good" : "warn"} />
          <Status icon={<HardDrive size={17} />} label="Offline queue" value={`${operations.length} pending`} tone={operations.length ? "warn" : "good"} />
          <Status icon={<DatabaseBackup size={17} />} label="App mode" value={isStandalonePwa() ? "Installed PWA" : installable ? "Install ready" : "Browser"} />
          <Status icon={<CloudDownload size={17} />} label="Last backup" value={platform.reliability.last_backup_at ? formatDate(platform.reliability.last_backup_at) : "Not created"} />
        </div>

        <div className="reliability-grid">
          <section>
            <div className="reliability-heading"><div><strong>Offline sync</strong><span>Perubahan data diantrekan di perangkat dan diputar ulang saat koneksi pulih.</span></div><button className="secondary-button" disabled={working || !online || !operations.length} onClick={() => void syncNow()}><RefreshCw size={15} /> Sync now</button></div>
            <div className="queue-list">
              {operations.length ? operations.slice(0, 6).map((operation) => <div key={operation.id}><span>{operation.type.replaceAll("_", " ")}</span><time>{formatDate(operation.created_at)}</time><b>{operation.attempts ? `${operation.attempts} retry` : "Queued"}</b></div>) : <div className="reliability-empty"><ShieldCheck size={21} /><span>Semua perubahan sudah tersinkron.</span></div>}
            </div>
            <div className="reliability-actions">
              {installable && !isStandalonePwa() ? <button className="secondary-button" onClick={() => void installPwa()}><Download size={15} /> Install app</button> : null}
              {operations.length && canManage ? <button className={`danger-button ${confirmClear ? "confirm" : ""}`} onClick={() => { if (!confirmClear) return setConfirmClear(true); void clearOfflineQueue().then(() => { setConfirmClear(false); refreshQueue(); onNotify("Antrean offline dibersihkan."); }); }}><Trash2 size={15} /> {confirmClear ? "Confirm clear" : "Clear queue"}</button> : null}
            </div>
          </section>

          <section>
            <div className="reliability-heading"><div><strong>Application health</strong><span>Core Web Vitals dan error terbaru dari sesi ini.</span></div></div>
            <div className="metric-grid">
              <Metric label="LCP" value={formatMetric(metrics.LCP, "ms")} />
              <Metric label="CLS" value={formatMetric(metrics.CLS, "")} />
              <Metric label="TTFB" value={formatMetric(metrics.TTFB, "ms")} />
              <Metric label="Long task" value={formatMetric(metrics.long_task, "ms")} />
            </div>
            <div className="health-events">{recentProblems.length ? recentProblems.map((event) => <div key={event.id}><b>{event.name}</b><span>{event.detail || "No detail"}</span></div>) : <div className="reliability-empty"><ShieldCheck size={21} /><span>Tidak ada error pada sesi ini.</span></div>}</div>
            <label className="reliability-toggle"><input type="checkbox" checked={platform.reliability.telemetry_enabled} disabled={!canManage} onChange={(event) => updateReliability({ telemetry_enabled: event.target.checked })} /><span><strong>Workspace telemetry</strong><small>Kirim metrik teknis tanpa isi board.</small></span></label>
          </section>

          <section className="backup-section">
            <div className="reliability-heading"><div><strong>Backup & restore</strong><span>Backup lokal lengkap; backup online memakai bucket privat dan retensi workspace.</span></div><div className="backup-buttons"><button className="secondary-button" onClick={() => void createLocalBackup()}><Download size={15} /> Local backup</button>{hasOnlineDatabase ? <button className="primary-button" disabled={!canManage || working || !online} onClick={() => void createOnlineBackup()}><CloudUpload size={15} /> Cloud backup</button> : null}</div></div>
            <div className="backup-settings">
              <label className="reliability-toggle"><input type="checkbox" checked={platform.reliability.automatic_backups} disabled={!canManage || !hasOnlineDatabase} onChange={(event) => updateReliability({ automatic_backups: event.target.checked })} /><span><strong>Automatic backup</strong><small>Worker menjalankan backup sesuai interval.</small></span></label>
              <label>Interval<select value={platform.reliability.backup_interval} disabled={!canManage || !platform.reliability.automatic_backups} onChange={(event) => updateReliability({ backup_interval: event.target.value as ReliabilitySettings["backup_interval"] })}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
              <button className="secondary-button" disabled={!canManage || working} onClick={() => restoreInput.current?.click()}><CloudDownload size={15} /> Restore file</button>
              <input ref={restoreInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.currentTarget.value = ""; }} />
            </div>
            {hasOnlineDatabase ? <div className="backup-history">{backups.length ? backups.map((backup) => <div key={backup.id}><span><DatabaseBackup size={15} /><b>{backup.status}</b></span><time>{formatDate(backup.created_at)}</time><small>{backup.item_count} items · {formatBytes(backup.size_bytes)}</small></div>) : <div className="reliability-empty"><DatabaseBackup size={21} /><span>Belum ada backup online.</span></div>}</div> : <div className="demo-backup-note">Mode demo mengunduh backup sebagai file JSON. Simpan file di lokasi privat, atau sambungkan Supabase untuk arsip online.</div>}
          </section>
        </div>
      </section>
    </div>
  );
}

function Status({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return <div className={tone}>{icon}<span><small>{label}</small><strong>{value}</strong></span></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function formatMetric(value: number | undefined, suffix: string) { return value === undefined ? "-" : `${value}${suffix}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1048576 ? `${Math.round(value / 1024)} KB` : `${(value / 1048576).toFixed(1)} MB`; }
