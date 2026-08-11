import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Blocks,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  CloudCog,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Gauge,
  Grid2X2,
  Home,
  Import,
  KanbanSquare,
  LayoutDashboard,
  ListFilter,
  Lock,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  acceptInvitation,
  createBoard,
  createWorkspace,
  deleteAttachment,
  getAttachmentUrl,
  getSession,
  flushDatabaseOfflineQueue,
  hasOnlineDatabase,
  insertActivity,
  insertItem,
  insertUpdate,
  loadAccount,
  loadPlatformState,
  loadSnapshot,
  onAuthStateChange,
  patchItem,
  persistDemo,
  persistDemoAccount,
  queueAutomationRuns,
  recordObservabilityEvent,
  removeItems,
  resetDemo,
  resetDemoAccount,
  resetDemoPlatform,
  savePlatformState,
  signOutUser,
  subscribeToBoard,
  updateBoard,
  updateProfile,
  uploadAttachment,
} from "./database";
import AuthScreen from "./AuthScreen";
import WorkspaceDialog from "./WorkspaceDialog";
import { seedSnapshot } from "./data";
import { offlineQueueCount } from "./offline";
import { calculateFormula, runItemAutomations, type CustomColumn, type PlatformState } from "./platform";
import { observabilitySnapshot, type BackupBundle, type ObservabilityEvent } from "./reliability";
import {
  groups,
  owners,
  priorities,
  statuses,
  type ActivityEntry,
  type AccountState,
  type AppUser,
  type Attachment,
  type Board,
  type BoardPrivacy,
  type BoardSnapshot,
  type ItemUpdate,
  type Priority,
  type Status,
  type View,
  type WorkItem,
} from "./types";

type Toast = { message: string; action?: string; onAction?: () => void } | null;
type DetailTab = "updates" | "activity";

const today = new Date().toISOString().slice(0, 10);
const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const PlatformCenter = lazy(() => import("./PlatformCenter"));
const PublicForm = lazy(() => import("./PublicForm"));
const ReliabilityCenter = lazy(() => import("./ReliabilityCenter"));

export default function App() {
  const publicFormId = new URLSearchParams(window.location.search).get("form");
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(seedSnapshot);
  const [authReady, setAuthReady] = useState(!hasOnlineDatabase);
  const [signedIn, setSignedIn] = useState(!hasOnlineDatabase);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [activeBoardId, setActiveBoardId] = useState("");
  const [view, setView] = useState<View>("table");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [reliabilityOpen, setReliabilityOpen] = useState(false);
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [queuedChanges, setQueuedChanges] = useState(0);
  const [createEntity, setCreateEntity] = useState<"workspace" | "board" | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const deleteTimer = useRef<number | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const sentTelemetry = useRef(new Set<string>());

  const { items, updates, activity, attachments } = snapshot;

  const activeWorkspace = account?.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeBoard = account?.boards.find((board) => board.id === activeBoardId) ?? null;
  const workspaceBoards = account?.boards.filter((board) => board.workspace_id === activeWorkspaceId) ?? [];
  const currentOwnerName = account?.currentUser.full_name.split(" ")[0] ?? "Nadia";
  const currentMembership = account?.members.find((member) => member.workspace_id === activeWorkspaceId && member.user_id === account.currentUser.id);
  const currentBoardMembership = account?.boardMembers.find((member) => member.board_id === activeBoardId && member.user_id === account.currentUser.id);
  const canEditActiveBoard = currentMembership?.role === "owner" || currentMembership?.role === "admin" || (activeBoard?.privacy === "main" && currentMembership?.role === "member") || currentBoardMembership?.role === "owner" || currentBoardMembership?.role === "editor";
  const canManageActiveBoard = currentMembership?.role === "owner" || currentMembership?.role === "admin" || activeBoard?.created_by === account?.currentUser.id || currentBoardMembership?.role === "owner";
  const canManageWorkspace = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!hasOnlineDatabase) return;
    getSession().then((session) => {
      setSignedIn(Boolean(session));
      setAuthReady(true);
    }).catch((error: Error) => {
      setSyncError(error.message);
      setAuthReady(true);
    });
    return onAuthStateChange((session) => {
      setSignedIn(Boolean(session));
      if (!session) setAccount(null);
    });
  }, []);

  useEffect(() => {
    if (!authReady || (hasOnlineDatabase && !signedIn)) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const inviteToken = new URLSearchParams(window.location.search).get("invite");
        if (inviteToken && hasOnlineDatabase) {
          await acceptInvitation(inviteToken);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("invite");
          window.history.replaceState({}, "", cleanUrl);
          setToast({ message: "Workspace invitation accepted." });
        }
        const result = await loadAccount();
        if (!mounted) return;
        setAccount(result);
        const savedWorkspace = localStorage.getItem("mondayflow-active-workspace");
        const workspaceId = result.workspaces.some((workspace) => workspace.id === savedWorkspace) ? savedWorkspace! : result.workspaces[0]?.id ?? "";
        const savedBoard = localStorage.getItem("mondayflow-active-board");
        const boardId = result.boards.some((board) => board.id === savedBoard && board.workspace_id === workspaceId)
          ? savedBoard!
          : result.boards.find((board) => board.workspace_id === workspaceId)?.id ?? "";
        setActiveWorkspaceId(workspaceId);
        setActiveBoardId(boardId);
      } catch (error) {
        if (mounted) setSyncError((error as Error).message);
      }
    })();
    return () => { mounted = false; };
  }, [authReady, signedIn]);

  useEffect(() => {
    if (!activeBoardId) return;
    let mounted = true;
    setLoading(true);
    setSelectedIds([]);
    setActiveItemId(null);
    loadSnapshot(activeBoardId)
      .then((result) => { if (mounted) setSnapshot(result); })
      .catch((error: Error) => { if (mounted) setSyncError(error.message); })
      .finally(() => { if (mounted) setLoading(false); });
    localStorage.setItem("mondayflow-active-workspace", activeWorkspaceId);
    localStorage.setItem("mondayflow-active-board", activeBoardId);
    return () => { mounted = false; };
  }, [activeBoardId, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId || !activeBoardId) return;
    let mounted = true;
    loadPlatformState(activeWorkspaceId, activeBoardId)
      .then((result) => { if (mounted) setPlatform(result); })
      .catch((error: Error) => { if (mounted) setSyncError(error.message); });
    return () => { mounted = false; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!platform || !activeWorkspaceId || !canManageWorkspace) return;
    const timer = window.setTimeout(() => {
      savePlatformState(activeWorkspaceId, platform).catch((error: Error) => setSyncError(error.message));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [activeWorkspaceId, canManageWorkspace, platform]);

  useEffect(() => {
    if (!activeBoardId || !hasOnlineDatabase) return;
    let reloadTimer = 0;
    return subscribeToBoard(activeBoardId, () => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        loadSnapshot(activeBoardId).then(setSnapshot).catch(() => undefined);
      }, 180);
    });
  }, [activeBoardId]);

  useEffect(() => {
    const refreshCount = () => void offlineQueueCount().then(setQueuedChanges).catch(() => setQueuedChanges(0));
    const onOffline = () => setNetworkOnline(false);
    const onOnline = () => {
      setNetworkOnline(true);
      void flushDatabaseOfflineQueue().then((result) => {
        refreshCount();
        if (result.completed && activeBoardId) void loadSnapshot(activeBoardId).then(setSnapshot);
        if (result.completed) setToast({ message: `${result.completed} perubahan offline berhasil disinkronkan.` });
      }).catch((error: Error) => setSyncError(error.message));
    };
    refreshCount();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("mondayflow:offline-queue", refreshCount);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("mondayflow:offline-queue", refreshCount);
    };
  }, [activeBoardId]);

  useEffect(() => {
    if (!hasOnlineDatabase || !activeWorkspaceId || !platform?.reliability.telemetry_enabled) return;
    const sendMetric = (metric: ObservabilityEvent) => {
      const key = `${activeWorkspaceId}:${metric.id}`;
      if (sentTelemetry.current.has(key)) return;
      sentTelemetry.current.add(key);
      void recordObservabilityEvent(activeWorkspaceId, metric).catch(() => sentTelemetry.current.delete(key));
    };
    const onMetric = (event: Event) => sendMetric((event as CustomEvent<ObservabilityEvent>).detail);
    window.addEventListener("mondayflow:observability", onMetric);
    observabilitySnapshot().forEach(sendMetric);
    return () => window.removeEventListener("mondayflow:observability", onMetric);
  }, [activeWorkspaceId, platform?.reliability.telemetry_enabled]);

  useEffect(() => {
    if (!loading && activeBoardId) persistDemo(activeBoardId, snapshot);
  }, [snapshot, loading, activeBoardId]);

  useEffect(() => {
    if (account) persistDemoAccount(account);
  }, [account]);

  useEffect(() => () => {
    if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
  }, []);

  useEffect(() => {
    if (!toast || toast.action) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredItems = useMemo(() => {
    const lowered = deferredQuery.trim().toLowerCase();
    return items
      .filter((item) => {
        const matchesText = !lowered || [item.title, item.owner, item.group_name, item.description].some((value) => value.toLowerCase().includes(lowered));
        return (
          matchesText &&
          (statusFilter === "All" || item.status === statusFilter) &&
          (ownerFilter === "All" || item.owner === ownerFilter) &&
          (priorityFilter === "All" || item.priority === priorityFilter)
        );
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [deferredQuery, items, ownerFilter, priorityFilter, statusFilter]);

  const stats = useMemo(() => {
    const rootItems = filteredItems.filter((item) => !item.parent_id);
    const totalBudget = rootItems.reduce((sum, item) => sum + Number(item.budget), 0);
    const avgProgress = rootItems.length ? Math.round(rootItems.reduce((sum, item) => sum + item.progress, 0) / rootItems.length) : 0;
    return {
      totalBudget,
      avgProgress,
      done: rootItems.filter((item) => item.status === "Done").length,
      stuck: rootItems.filter((item) => item.status === "Stuck").length,
    };
  }, [filteredItems]);

  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const hasFilters = Boolean(query || statusFilter !== "All" || ownerFilter !== "All" || priorityFilter !== "All");

  function recordActivity(itemId: string | null, action: string) {
    if (!activeBoardId) return;
    const entry: ActivityEntry = { id: crypto.randomUUID(), board_id: activeBoardId, item_id: itemId, action, created_at: new Date().toISOString() };
    setSnapshot((current) => ({ ...current, activity: [entry, ...current.activity] }));
    insertActivity(entry).catch(() => undefined);
  }

  function applyAutomationEffects(result: ReturnType<typeof runItemAutomations>) {
    if (!result.runs.length) return;
    const runIds = new Set(result.runs.map((run) => run.automation_id));
    const lastRunAt = result.runs[0].created_at;
    setPlatform((current) => current ? {
      ...current,
      automations: current.automations.map((recipe) => runIds.has(recipe.id) ? { ...recipe, last_run_at: lastRunAt } : recipe),
      automationRuns: [...result.runs, ...current.automationRuns].slice(0, 100),
      inbox: result.notices.length ? [{ id: crypto.randomUUID(), workspace_id: activeWorkspaceId, title: "Automation notification", body: result.notices.join(" · "), read: false, created_at: lastRunAt }, ...current.inbox] : current.inbox,
    } : current);
    void queueAutomationRuns(result.runs).catch((error: Error) => setSyncError(error.message));
    result.runs.forEach((run) => recordActivity(run.item_id, run.message));
    if (result.notices[0]) setToast({ message: result.notices[0] });
  }

  async function addItem(group = "This week", status: Status = "Not started", parentId: string | null = null) {
    let item: WorkItem = {
      id: crypto.randomUUID(),
      board_id: activeBoardId,
      title: parentId ? "New subitem" : "New item",
      group_name: group,
      owner: "Unassigned",
      status,
      priority: "Medium",
      timeline_start: today,
      timeline_end: inSevenDays,
      progress: status === "Done" ? 100 : 0,
      budget: 0,
      description: "",
      parent_id: parentId,
      sort_order: Math.max(0, ...items.map((entry) => entry.sort_order)) + 10,
    };
    const automationResult = platform ? runItemAutomations(platform, activeBoardId, item, null, "item_created") : { patch: {}, runs: [], notices: [] };
    item = { ...item, ...automationResult.patch };
    setSnapshot((current) => ({ ...current, items: [...current.items, item] }));
    setActiveItemId(item.id);
    setSaving(true);
    try {
      const saved = await insertItem(item);
      if (saved) {
        setSnapshot((current) => ({
          ...current,
          items: current.items.map((entry) => (entry.id === item.id ? saved : entry)),
        }));
        setActiveItemId(saved.id);
      }
      recordActivity(saved?.id ?? item.id, `${parentId ? "Subitem" : "Item"} created`);
      applyAutomationEffects(automationResult);
    } catch (error) {
      setSyncError((error as Error).message);
      setToast({ message: "Item tersimpan di demo, tetapi sinkronisasi online gagal." });
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(id: string, patch: Partial<WorkItem>, action?: string) {
    const previous = items.find((item) => item.id === id);
    if (!previous) return;
    const proposed = { ...previous, ...patch };
    const automationResult = platform ? runItemAutomations(platform, activeBoardId, proposed, previous, "item_updated") : { patch: {}, runs: [], notices: [] };
    const finalPatch = { ...patch, ...automationResult.patch };
    setSnapshot((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...finalPatch } : item)),
    }));
    setSaving(true);
    try {
      const saved = await patchItem(id, finalPatch);
      if (saved) {
        setSnapshot((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? saved : item)) }));
      }
      if (action) recordActivity(id, action);
      applyAutomationEffects(automationResult);
    } catch (error) {
      setSnapshot((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? previous : item)) }));
      setSyncError((error as Error).message);
      setToast({ message: "Perubahan dibatalkan karena sinkronisasi gagal." });
    } finally {
      setSaving(false);
    }
  }

  function deleteWithUndo(ids: string[]) {
    const itemIds = new Set(ids);
    const relatedIds = items.filter((item) => item.parent_id && itemIds.has(item.parent_id)).map((item) => item.id);
    const allIds = [...new Set([...ids, ...relatedIds])];
    const removed = items.filter((item) => allIds.includes(item.id));
    if (!removed.length) return;
    setSnapshot((current) => ({ ...current, items: current.items.filter((item) => !allIds.includes(item.id)) }));
    setSelectedIds([]);
    setActiveItemId(null);
    if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
    deleteTimer.current = window.setTimeout(() => {
      removeItems(allIds).catch((error: Error) => setSyncError(error.message));
      recordActivity(null, `${removed.length} item deleted`);
      setToast(null);
      deleteTimer.current = null;
    }, 5000);
    setToast({
      message: `${removed.length} item dihapus`,
      action: "Undo",
      onAction: () => {
        if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
        deleteTimer.current = null;
        setSnapshot((current) => ({ ...current, items: [...current.items, ...removed] }));
        setToast({ message: "Item dipulihkan." });
      },
    });
  }

  async function duplicateItem(item: WorkItem) {
    const copy = { ...item, id: crypto.randomUUID(), title: `${item.title} copy`, sort_order: item.sort_order + 1, parent_id: null };
    setSnapshot((current) => ({ ...current, items: [...current.items, copy] }));
    try {
      const saved = await insertItem(copy);
      if (saved) setSnapshot((current) => ({ ...current, items: current.items.map((entry) => (entry.id === copy.id ? saved : entry)) }));
      setToast({ message: "Item berhasil diduplikasi." });
    } catch (error) {
      setSyncError((error as Error).message);
    }
  }

  async function addUpdate(itemId: string, body: string) {
    const update: ItemUpdate = {
      id: crypto.randomUUID(),
      board_id: activeBoardId,
      item_id: itemId,
      author: currentOwnerName,
      body,
      created_at: new Date().toISOString(),
    };
    setSnapshot((current) => ({ ...current, updates: [update, ...current.updates] }));
    try {
      const saved = await insertUpdate(update);
      if (saved) setSnapshot((current) => ({ ...current, updates: current.updates.map((entry) => (entry.id === update.id ? saved : entry)) }));
      recordActivity(itemId, `${currentOwnerName} posted an update`);
    } catch (error) {
      setSyncError((error as Error).message);
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("All");
    setOwnerFilter("All");
    setPriorityFilter("All");
  }

  function updateCustomValue(itemId: string, columnId: string, value: string | number | boolean) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const customValues = { ...(item.custom_values ?? {}), [columnId]: value };
    setSnapshot((current) => ({ ...current, items: current.items.map((entry) => entry.id === itemId ? { ...entry, custom_values: customValues } : entry) }));
    patchItem(itemId, { custom_values: customValues }).catch((error: Error) => setSyncError(error.message));
  }

  function exportCsv() {
    const headers = ["title", "group_name", "owner", "status", "priority", "timeline_start", "timeline_end", "progress", "budget", "description"];
    const rows = items.map((item) => headers.map((key) => csvEscape(String(item[key as keyof WorkItem] ?? ""))).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "growth-campaign-board.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setToast({ message: "Board berhasil diekspor ke CSV." });
  }

  async function importCsv(file: File) {
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setToast({ message: "File CSV tidak memiliki data." });
    const headers = parsed[0];
    const imported = parsed.slice(1).map((row, index): WorkItem => {
      const value = Object.fromEntries(headers.map((header, cell) => [header, row[cell] ?? ""]));
      return {
        id: crypto.randomUUID(),
        board_id: activeBoardId,
        title: value.title || `Imported item ${index + 1}`,
        group_name: groups.includes(value.group_name) ? value.group_name : "Backlog",
        owner: value.owner || "Unassigned",
        status: statuses.includes(value.status as Status) ? (value.status as Status) : "Not started",
        priority: priorities.includes(value.priority as Priority) ? (value.priority as Priority) : "Medium",
        timeline_start: value.timeline_start || today,
        timeline_end: value.timeline_end || inSevenDays,
        progress: Math.min(100, Math.max(0, Number(value.progress) || 0)),
        budget: Math.max(0, Number(value.budget) || 0),
        description: value.description || "",
        parent_id: null,
        sort_order: Math.max(0, ...items.map((entry) => entry.sort_order)) + (index + 1) * 10,
      };
    });
    setSnapshot((current) => ({ ...current, items: [...current.items, ...imported] }));
    setSaving(true);
    const results = await Promise.allSettled(imported.map((item) => insertItem(item)));
    setSaving(false);
    const failures = results.filter((result) => result.status === "rejected").length;
    setToast({ message: failures ? `${imported.length - failures} item diimpor, ${failures} gagal sinkron.` : `${imported.length} item berhasil diimpor.` });
  }

  function resetDemoData() {
    resetDemo(activeBoardId);
    resetDemoAccount();
    resetDemoPlatform(activeWorkspaceId);
    void Promise.all([loadAccount(), loadSnapshot("demo-board-1"), loadPlatformState("demo-workspace-1", "demo-board-1")]).then(([nextAccount, nextSnapshot, nextPlatform]) => {
      setAccount(nextAccount);
      setActiveWorkspaceId("demo-workspace-1");
      setActiveBoardId("demo-board-1");
      setSnapshot(nextSnapshot);
      setPlatform(nextPlatform);
    });
    setToast({ message: "Demo account reset to its original state." });
  }

  function switchWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    const nextBoard = account?.boards.find((board) => board.workspace_id === workspaceId);
    setActiveBoardId(nextBoard?.id ?? "");
    setMobileNavOpen(false);
  }

  async function createAccountEntity(name: string, privacy: BoardPrivacy) {
    if (!account) return;
    setSaving(true);
    try {
      if (createEntity === "workspace") {
        const workspace = await createWorkspace(name);
        if (hasOnlineDatabase) {
          const refreshed = await loadAccount();
          setAccount(refreshed);
          setActiveWorkspaceId(workspace.id);
          setActiveBoardId(refreshed.boards.find((board) => board.workspace_id === workspace.id)?.id ?? "");
        } else {
          const board = await createBoard(workspace.id, "My first board", "main");
          setAccount({ ...account, workspaces: [...account.workspaces, workspace], boards: [...account.boards, board], boardMembers: [...account.boardMembers, { board_id: board.id, user_id: account.currentUser.id, role: "owner" }], members: [...account.members, { workspace_id: workspace.id, user_id: account.currentUser.id, role: "owner", status: "active", profile: account.currentUser }] });
          setActiveWorkspaceId(workspace.id);
          setActiveBoardId(board.id);
        }
        setToast({ message: "Workspace created." });
      } else {
        const board = await createBoard(activeWorkspaceId, name, privacy);
        setAccount({ ...account, boards: [...account.boards, board], boardMembers: [...account.boardMembers, { board_id: board.id, user_id: account.currentUser.id, role: "owner" }] });
        setActiveBoardId(board.id);
        setToast({ message: "Board created." });
      }
      setCreateEntity(null);
    } catch (error) {
      setToast({ message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function saveBoardSettings(patch: Pick<Board, "title" | "description" | "privacy">) {
    if (!account || !activeBoard) return;
    setSaving(true);
    try {
      await updateBoard(activeBoard.id, patch);
      setAccount({ ...account, boards: account.boards.map((board) => board.id === activeBoard.id ? { ...board, ...patch, updated_at: new Date().toISOString() } : board) });
      setSettingsOpen(false);
      setToast({ message: "Board settings saved." });
    } catch (error) {
      setToast({ message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(fullName: string) {
    if (!account) return;
    setSaving(true);
    try {
      await updateProfile(fullName);
      const currentUser = { ...account.currentUser, full_name: fullName };
      setAccount({
        ...account,
        currentUser,
        members: account.members.map((member) => member.user_id === currentUser.id ? { ...member, profile: currentUser } : member),
      });
      setProfileOpen(false);
      setToast({ message: "Profile updated." });
    } catch (error) {
      setToast({ message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function addAttachment(itemId: string, file: File) {
    setSaving(true);
    try {
      const attachment = await uploadAttachment(activeBoardId, itemId, file);
      setSnapshot((current) => ({ ...current, attachments: [attachment, ...current.attachments] }));
      recordActivity(itemId, `${currentOwnerName} uploaded ${file.name}`);
      setToast({ message: "File uploaded." });
    } catch (error) {
      setToast({ message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function openAttachment(attachment: Attachment) {
    try {
      const url = await getAttachmentUrl(attachment.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setToast({ message: (error as Error).message });
    }
  }

  async function removeAttachmentFromItem(attachment: Attachment) {
    try {
      await deleteAttachment(attachment);
      setSnapshot((current) => ({ ...current, attachments: current.attachments.filter((entry) => entry.id !== attachment.id) }));
      setToast({ message: "File removed." });
    } catch (error) {
      setToast({ message: (error as Error).message });
    }
  }

  async function restoreBackup(bundle: BackupBundle) {
    if (hasOnlineDatabase) {
      const [nextAccount, nextSnapshot, nextPlatform] = await Promise.all([
        loadAccount(),
        loadSnapshot(bundle.board_id),
        loadPlatformState(activeWorkspaceId, bundle.board_id),
      ]);
      setAccount(nextAccount);
      setActiveBoardId(bundle.board_id);
      setSnapshot(nextSnapshot);
      setPlatform(nextPlatform);
      return;
    }
    setAccount(bundle.account);
    setActiveWorkspaceId(bundle.workspace_id);
    setActiveBoardId(bundle.board_id);
    setSnapshot(bundle.snapshot);
    setPlatform(bundle.platform);
    persistDemoAccount(bundle.account);
    persistDemo(bundle.board_id, bundle.snapshot);
    await savePlatformState(bundle.workspace_id, bundle.platform);
  }

  if (publicFormId) return <Suspense fallback={<div className="app-loading"><div className="loader" /><strong>Loading form</strong></div>}><PublicForm formId={publicFormId} /></Suspense>;
  if (!authReady) return <div className="app-loading"><div className="loader" /><strong>Preparing MondayFlow</strong></div>;
  if (hasOnlineDatabase && !signedIn) return <AuthScreen />;
  if (!account || !activeWorkspace || !activeBoard) return <div className="app-loading"><div className="loader" /><strong>Loading your workspace</strong>{syncError ? <span>{syncError}</span> : null}</div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div><strong>MondayFlow</strong><span>Work OS</span></div>
          <button className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          <button className={ownerFilter === "All" ? "active" : ""} onClick={() => { setOwnerFilter("All"); setView("table"); }}><Home size={18} /> Home</button>
          <button onClick={() => setNotificationsOpen(true)}><Bell size={18} /> Notifications <span className="nav-count">{activity.slice(0, 9).length}</span></button>
          <button className={ownerFilter === "Nadia" ? "active" : ""} onClick={() => { setOwnerFilter("Nadia"); setView("table"); }}><Activity size={18} /> My work</button>
          <button onClick={() => setShareOpen(true)}><UsersRound size={18} /> Teams</button>
        </nav>
        <div className="workspace-card">
          <div className="card-title">Workspace</div>
          <label className="workspace-selector"><Building2 size={17} /><select value={activeWorkspaceId} onChange={(event) => switchWorkspace(event.target.value)} aria-label="Active workspace">{account.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><ChevronDown size={14} /></label>
          <div className="workspace-board-list">{workspaceBoards.map((board) => <button key={board.id} className={`workspace-row ${board.id === activeBoardId ? "active" : ""}`} onClick={() => { setActiveBoardId(board.id); setMobileNavOpen(false); }}>{board.privacy === "private" ? <Lock size={16} /> : <Grid2X2 size={16} />}<span>{board.title}</span></button>)}</div>
          <button className="sidebar-add" disabled={currentMembership?.role === "viewer" || currentMembership?.role === "guest"} onClick={() => setCreateEntity("board")}><Plus size={15} /> New board</button>
          <button className="sidebar-add" onClick={() => setCreateEntity("workspace")}><Plus size={15} /> New workspace</button>
        </div>
        <button className="invite-button" onClick={() => setShareOpen(true)}><UserPlus size={17} /> Invite members</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div className="crumb">{activeWorkspace.name} / {activeBoard.title}</div>
          </div>
          <div className="top-actions">
            <span className={`database-badge ${!networkOnline ? "offline" : hasOnlineDatabase && !syncError ? "online" : "demo"}`}>
              <span /> {!networkOnline ? `${queuedChanges} pending` : hasOnlineDatabase && !syncError ? "Secure online" : "Demo mode"}
            </span>
            <button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label="Notifications"><Bell size={18} /></button>
            <button className="icon-button" onClick={() => setPlatformOpen(true)} aria-label="Platform center"><Blocks size={18} /></button>
            <button className="icon-button reliability-button" onClick={() => setReliabilityOpen(true)} aria-label="Reliability center"><CloudCog size={18} />{queuedChanges ? <i>{queuedChanges}</i> : null}</button>
            <button className="icon-button" disabled={!canManageActiveBoard} onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings size={18} /></button>
            <div className="menu-wrap account-menu-wrap"><button className="avatar-button" aria-label="Profile menu">{initials(account.currentUser.full_name)}</button><div className="action-menu account-menu"><div><strong>{account.currentUser.full_name}</strong><span>{account.currentUser.email}</span></div><button onClick={() => setProfileOpen(true)}><Settings size={15} /> Profile settings</button>{hasOnlineDatabase ? <button onClick={() => void signOutUser()}><LogOut size={15} /> Sign out</button> : <span className="demo-account-label"><ShieldCheck size={14} /> Demo account</span>}</div></div>
          </div>
        </header>

        <section className="board-header">
          <div>
            <div className="board-title-row">
              <h1>{activeBoard.title}</h1>
              <button className="icon-button" disabled={!canManageActiveBoard} onClick={() => setSettingsOpen(true)} aria-label="Board settings"><MoreHorizontal size={20} /></button>
            </div>
            <p>{activeBoard.description}</p>
          </div>
          <div className="header-actions">
            <button className="secondary-button" onClick={() => setShareOpen(true)}><UserPlus size={17} /> Share</button>
            <button className="primary-button" disabled={!canEditActiveBoard} onClick={() => addItem()}><CirclePlus size={18} /> New item</button>
          </div>
        </section>

        <section className="toolbar" aria-label="Board tools">
          <div className="view-tabs">
            <ViewButton active={view === "table"} onClick={() => setView("table")} icon={<Table2 size={17} />} label="Main table" />
            <ViewButton active={view === "kanban"} onClick={() => setView("kanban")} icon={<KanbanSquare size={17} />} label="Kanban" />
            <ViewButton active={view === "calendar"} onClick={() => setView("calendar")} icon={<CalendarDays size={17} />} label="Calendar" />
            <ViewButton active={view === "dashboard"} onClick={() => setView("dashboard")} icon={<LayoutDashboard size={17} />} label="Dashboard" />
          </div>
          <div className="toolbar-actions">
            <label className="search-box"><Search size={17} /><input placeholder="Search board" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="select-box"><Filter size={16} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | "All")}><option value="All">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-box compact"><UsersRound size={16} /><select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="All">All owners</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label>
            <label className="select-box compact"><ListFilter size={16} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "All")}><option value="All">All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            {hasFilters ? <button className="text-button" onClick={clearFilters}><X size={15} /> Clear</button> : null}
            <div className="menu-wrap">
              <button className="icon-button" aria-label="Board data menu"><MoreHorizontal size={19} /></button>
              <div className="action-menu">
                <button disabled={!canEditActiveBoard} onClick={() => importInput.current?.click()}><Import size={16} /> Import CSV</button>
                <button onClick={exportCsv}><Download size={16} /> Export CSV</button>
              </div>
            </div>
            <input ref={importInput} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }} />
          </div>
        </section>

        <section className="status-strip" aria-label="Board status">
          <Metric label="Items" value={filteredItems.filter((item) => !item.parent_id).length.toString()} />
          <Metric label="Done" value={stats.done.toString()} tone="green" />
          <Metric label="Stuck" value={stats.stuck.toString()} tone="red" />
          <Metric label="Progress" value={`${stats.avgProgress}%`} tone="blue" />
          <Metric label="Budget" value={formatCurrency(stats.totalBudget)} />
        </section>

        {!canEditActiveBoard ? <div className="read-only-banner"><Lock size={15} /><span>You have view-only access to this board.</span></div> : null}

        {selectedIds.length ? (
          <div className="bulk-bar">
            <strong>{selectedIds.length} selected</strong>
            <label>Status <select onChange={(event) => { const status = event.target.value as Status; selectedIds.forEach((id) => void updateItem(id, { status, progress: status === "Done" ? 100 : items.find((item) => item.id === id)?.progress }, `Status changed to ${status}`)); }} defaultValue=""><option value="" disabled>Set status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <button onClick={() => deleteWithUndo(selectedIds)}><Trash2 size={16} /> Delete</button>
            <button className="icon-button small" onClick={() => setSelectedIds([])} aria-label="Clear selection"><X size={15} /></button>
          </div>
        ) : null}

        <div className="content-surface">
          {loading ? <div className="empty-state"><div className="loader" /><strong>Loading board</strong></div> : null}
          {!loading && view === "table" ? (
            <TableView
              items={filteredItems}
              selectedIds={selectedIds}
              collapsedGroups={collapsedGroups}
              onSelect={setSelectedIds}
              onCollapse={(group) => setCollapsedGroups((current) => current.includes(group) ? current.filter((name) => name !== group) : [...current, group])}
              onOpen={setActiveItemId}
              onUpdate={updateItem}
              onAdd={addItem}
              onDuplicate={duplicateItem}
              onDelete={(id) => deleteWithUndo([id])}
              readOnly={!canEditActiveBoard}
              customColumns={platform?.customColumns.filter((column) => column.board_id === activeBoardId) ?? []}
              customValues={Object.fromEntries(items.map((item) => [item.id, item.custom_values ?? {}]))}
              allItems={items}
              people={account.members.filter((member) => member.workspace_id === activeWorkspaceId).map((member) => member.profile.full_name)}
              onCustomValue={updateCustomValue}
            />
          ) : null}
          {!loading && view === "kanban" ? <KanbanView items={filteredItems.filter((item) => !item.parent_id)} onUpdate={updateItem} onOpen={setActiveItemId} onAdd={addItem} readOnly={!canEditActiveBoard} /> : null}
          {!loading && view === "calendar" ? <CalendarView items={filteredItems.filter((item) => !item.parent_id)} onOpen={setActiveItemId} /> : null}
          {!loading && view === "dashboard" ? <DashboardView items={filteredItems.filter((item) => !item.parent_id)} stats={stats} /> : null}
          {!loading && filteredItems.length === 0 ? <div className="no-results"><Search size={26} /><strong>No items found</strong><span>Try clearing the active filters.</span><button className="secondary-button" onClick={clearFilters}>Clear filters</button></div> : null}
        </div>
        <footer className="save-state">
          <span className={saving ? "saving" : "saved"}>{saving ? "Saving changes..." : <><Check size={14} /> All changes saved</>}</span>
          {syncError ? <span className="sync-error" title={syncError}>Online sync needs attention</span> : null}
        </footer>
        <nav className="mobile-dock" aria-label="Mobile navigation">
          <button className={view === "table" && ownerFilter === "All" ? "active" : ""} onClick={() => { clearFilters(); setView("table"); }}><Home size={19} /><span>Home</span></button>
          <button className={ownerFilter === currentOwnerName ? "active" : ""} onClick={() => { setOwnerFilter(currentOwnerName); setView("table"); }}><Activity size={19} /><span>My work</span></button>
          <button className="mobile-create" disabled={!canEditActiveBoard} onClick={() => void addItem()} aria-label="New item"><Plus size={22} /></button>
          <button onClick={() => setPlatformOpen(true)}><Blocks size={19} /><span>Platform</span></button>
          <button onClick={() => setNotificationsOpen(true)}><Bell size={19} /><span>Inbox</span></button>
        </nav>
      </main>

      {activeItem ? <ItemDrawer item={activeItem} updates={updates.filter((entry) => entry.item_id === activeItem.id)} activity={activity.filter((entry) => entry.item_id === activeItem.id)} attachments={attachments.filter((entry) => entry.item_id === activeItem.id)} onClose={() => setActiveItemId(null)} onUpdate={updateItem} onAddUpdate={addUpdate} onAddSubitem={() => addItem(activeItem.group_name, "Not started", activeItem.id)} onUpload={(file) => addAttachment(activeItem.id, file)} onOpenAttachment={openAttachment} onDeleteAttachment={removeAttachmentFromItem} onDelete={() => deleteWithUndo([activeItem.id])} readOnly={!canEditActiveBoard} /> : null}
      {notificationsOpen ? <NotificationsPanel activity={activity} onClose={() => setNotificationsOpen(false)} onOpenItem={(id) => { setNotificationsOpen(false); setActiveItemId(id); }} /> : null}
      {shareOpen ? <WorkspaceDialog account={account} workspaceId={activeWorkspaceId} boardId={activeBoardId} onChange={setAccount} onClose={() => setShareOpen(false)} onNotify={(message) => setToast({ message })} /> : null}
      {settingsOpen ? <SettingsModal board={activeBoard} isDemo={!hasOnlineDatabase} onSave={saveBoardSettings} onReset={resetDemoData} onClose={() => setSettingsOpen(false)} /> : null}
      {profileOpen ? <ProfileModal user={account.currentUser} onSave={saveProfile} onClose={() => setProfileOpen(false)} /> : null}
      <Suspense fallback={null}>
        {platformOpen && platform ? <PlatformCenter state={platform} workspaceId={activeWorkspaceId} boardId={activeBoardId} account={account} snapshot={snapshot} currentView={{ view, status: statusFilter, priority: priorityFilter, owner: ownerFilter }} canManage={Boolean(canManageWorkspace)} onChange={setPlatform} onApplyView={(saved) => { setView(saved.view); setStatusFilter(saved.status); setPriorityFilter(saved.priority); setOwnerFilter(saved.owner); setToast({ message: "Saved view applied." }); }} onNotify={(message) => setToast({ message })} onClose={() => setPlatformOpen(false)} /> : null}
        {reliabilityOpen && platform ? <ReliabilityCenter account={account} snapshot={snapshot} platform={platform} workspaceId={activeWorkspaceId} boardId={activeBoardId} online={networkOnline} canManage={Boolean(canManageWorkspace)} onPlatformChange={setPlatform} onRestore={restoreBackup} onNotify={(message) => setToast({ message })} onClose={() => setReliabilityOpen(false)} /> : null}
      </Suspense>
      {createEntity ? <CreateEntityModal kind={createEntity} onCreate={createAccountEntity} onClose={() => setCreateEntity(null)} /> : null}
      {toast ? <div className="toast" role="status"><span>{toast.message}</span>{toast.action ? <button onClick={() => { toast.onAction?.(); setToast(null); }}><RotateCcw size={15} /> {toast.action}</button> : null}<button className="toast-close" onClick={() => setToast(null)} aria-label="Close message"><X size={15} /></button></div> : null}
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? "selected" : ""} onClick={onClick}>{icon}{label}</button>;
}

function TableView({ items, selectedIds, collapsedGroups, onSelect, onCollapse, onOpen, onUpdate, onAdd, onDuplicate, onDelete, readOnly, customColumns, customValues, allItems, people, onCustomValue }: {
  items: WorkItem[];
  selectedIds: string[];
  collapsedGroups: string[];
  onSelect: (ids: string[]) => void;
  onCollapse: (group: string) => void;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WorkItem>, action?: string) => void;
  onAdd: (group?: string, status?: Status, parentId?: string | null) => void;
  onDuplicate: (item: WorkItem) => void;
  onDelete: (id: string) => void;
  readOnly: boolean;
  customColumns: CustomColumn[];
  customValues: Record<string, Record<string, string | number | boolean>>;
  allItems: WorkItem[];
  people: string[];
  onCustomValue: (itemId: string, columnId: string, value: string | number | boolean) => void;
}) {
  const visibleGroups = [...new Set(items.map((item) => item.group_name))];
  const tableGrid = `minmax(260px,1.55fr) 140px 140px 118px 220px 145px 105px ${customColumns.map(() => "150px").join(" ")} 42px`;
  return <div className="table-view">
    {visibleGroups.map((group, groupIndex) => {
      const groupItems = items.filter((item) => item.group_name === group);
      const rootItems = groupItems.filter((item) => !item.parent_id);
      const isCollapsed = collapsedGroups.includes(group);
      const allSelected = groupItems.length > 0 && groupItems.every((item) => selectedIds.includes(item.id));
      return <div className={`group group-${groupIndex % 3}`} key={group}>
        <div className="group-heading">
          <button onClick={() => onCollapse(group)} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group}`}><ChevronDown size={18} className={isCollapsed ? "rotated" : ""} /></button>
          <span className="group-dot" /><strong>{group}</strong><span>{groupItems.length} items</span>
        </div>
        {!isCollapsed ? <div className="work-table" style={{ minWidth: `${1180 + customColumns.length * 150}px` }} role="table" aria-label={`${group} items`}>
          <div className="table-row table-head" style={{ gridTemplateColumns: tableGrid }} role="row">
            <div className="select-cell"><input type="checkbox" disabled={readOnly} checked={allSelected} onChange={(event) => onSelect(event.target.checked ? [...new Set([...selectedIds, ...groupItems.map((item) => item.id)])] : selectedIds.filter((id) => !groupItems.some((item) => item.id === id)))} aria-label={`Select ${group}`} /> Item</div>
            <div>Owner</div><div>Status</div><div>Priority</div><div>Timeline</div><div>Progress</div><div>Budget</div>{customColumns.map((column) => <div className="custom-column-head" key={column.id}><span>{column.title}</span><small>{column.type}</small></div>)}<div />
          </div>
          {rootItems.flatMap((item) => [item, ...groupItems.filter((child) => child.parent_id === item.id)]).map((item) => <div className={`table-row ${item.parent_id ? "subitem-row" : ""}`} style={{ gridTemplateColumns: tableGrid }} role="row" key={item.id}>
            <div className="item-title">
              <input type="checkbox" disabled={readOnly} checked={selectedIds.includes(item.id)} onChange={(event) => onSelect(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} aria-label={`Select ${item.title}`} />
              {item.parent_id ? <span className="subitem-line" /> : null}
              <button onClick={() => onOpen(item.id)}>{item.title}</button>
              {!item.parent_id ? <button className="update-indicator" onClick={() => onOpen(item.id)} aria-label={`Open updates for ${item.title}`}><MessageSquareText size={15} /></button> : null}
            </div>
            <OwnerSelect value={item.owner} disabled={readOnly} onChange={(owner) => onUpdate(item.id, { owner }, `Owner changed to ${owner}`)} />
            <SelectPill value={item.status} options={statuses} kind="status" disabled={readOnly} onChange={(status) => onUpdate(item.id, { status: status as Status, progress: status === "Done" ? 100 : item.progress }, `Status changed to ${status}`)} />
            <SelectPill value={item.priority} options={priorities} kind="priority" disabled={readOnly} onChange={(priority) => onUpdate(item.id, { priority: priority as Priority }, `Priority changed to ${priority}`)} />
            <div className="timeline-cell"><input type="date" disabled={readOnly} value={item.timeline_start} onChange={(event) => onUpdate(item.id, { timeline_start: event.target.value })} aria-label="Start date" /><span>-</span><input type="date" disabled={readOnly} value={item.timeline_end} onChange={(event) => onUpdate(item.id, { timeline_end: event.target.value })} aria-label="End date" /></div>
            <label className="progress-edit"><input type="range" disabled={readOnly} min="0" max="100" value={item.progress} onChange={(event) => onUpdate(item.id, { progress: Number(event.target.value), status: Number(event.target.value) === 100 ? "Done" : item.status })} /><span>{item.progress}%</span></label>
            <label className="budget-edit"><span>$</span><input type="number" disabled={readOnly} min="0" value={item.budget} onChange={(event) => onUpdate(item.id, { budget: Number(event.target.value) })} aria-label="Budget" /></label>
            {customColumns.map((column) => <CustomCell key={column.id} item={item} column={column} value={customValues[item.id]?.[column.id] ?? ""} items={allItems} people={people} readOnly={readOnly} onChange={(value) => onCustomValue(item.id, column.id, value)} />)}
            {readOnly ? <div /> : <div className="row-menu"><button className="icon-button small" aria-label={`Actions for ${item.title}`}><MoreHorizontal size={16} /></button><div className="action-menu row-actions"><button onClick={() => onDuplicate(item)}><Copy size={15} /> Duplicate</button>{!item.parent_id ? <button onClick={() => onAdd(group, "Not started", item.id)}><Plus size={15} /> Add subitem</button> : null}<button className="danger" onClick={() => onDelete(item.id)}><Trash2 size={15} /> Delete</button></div></div>}
          </div>)}
          {!readOnly ? <button className="add-row" onClick={() => onAdd(group)}><Plus size={15} /> Add item</button> : null}
        </div> : null}
      </div>;
    })}
  </div>;
}

function CustomCell({ item, column, value, items, people, readOnly, onChange }: { item: WorkItem; column: CustomColumn; value: string | number | boolean; items: WorkItem[]; people: string[]; readOnly: boolean; onChange: (value: string | number | boolean) => void }) {
  if (column.type === "formula") return <div className="custom-cell formula-cell">{calculateFormula(column.formula, item)}</div>;
  if (column.type === "checkbox") return <label className="custom-cell checkbox-cell"><input type="checkbox" checked={Boolean(value)} disabled={readOnly} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (column.type === "dropdown") return <label className="custom-cell"><select value={String(value)} disabled={readOnly} onChange={(event) => onChange(event.target.value)}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (column.type === "people") return <label className="custom-cell"><select value={String(value)} disabled={readOnly} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{people.map((person) => <option key={person}>{person}</option>)}</select></label>;
  if (column.type === "dependency") return <label className="custom-cell"><select value={String(value)} disabled={readOnly} onChange={(event) => onChange(event.target.value)}><option value="">No dependency</option>{items.filter((entry) => entry.id !== item.id && !entry.parent_id).map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>;
  return <label className="custom-cell"><input type={column.type === "date" ? "date" : column.type === "number" ? "number" : "text"} value={String(value)} disabled={readOnly} onChange={(event) => onChange(column.type === "number" ? Number(event.target.value) : event.target.value)} placeholder="-" /></label>;
}

function KanbanView({ items, onUpdate, onOpen, onAdd, readOnly }: { items: WorkItem[]; onUpdate: (id: string, patch: Partial<WorkItem>, action?: string) => void; onOpen: (id: string) => void; onAdd: (group?: string, status?: Status) => void; readOnly: boolean }) {
  const [dragged, setDragged] = useState<string | null>(null);
  return <div className="kanban-grid">
    {statuses.map((status) => <section className="kanban-column" key={status} onDragOver={(event) => { if (!readOnly) event.preventDefault(); }} onDrop={() => { if (!readOnly && dragged) onUpdate(dragged, { status, progress: status === "Done" ? 100 : items.find((item) => item.id === dragged)?.progress }, `Status changed to ${status}`); setDragged(null); }}>
      <div className={`column-title status-${slug(status)}`}><span>{status}</span><strong>{items.filter((item) => item.status === status).length}</strong></div>
      <div className="kanban-stack">
        {items.filter((item) => item.status === status).map((item) => <article className="kanban-card" key={item.id} draggable={!readOnly} onDragStart={() => setDragged(item.id)} onDragEnd={() => setDragged(null)}>
          <button className="card-title-button" onClick={() => onOpen(item.id)}>{item.title}</button>
          <Owner name={item.owner} />
          <div className="card-meta"><span className={`priority-dot priority-${slug(item.priority)}`} />{item.priority}<span>{formatDate(item.timeline_end)}</span></div>
          <Progress value={item.progress} />
          <label className="kanban-status-select">
            <span>Move to</span>
            <select value={item.status} disabled={readOnly} onChange={(event) => { const next = event.target.value as Status; onUpdate(item.id, { status: next, progress: next === "Done" ? 100 : item.progress }, `Status changed to ${next}`); }}>
              {statuses.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </article>)}
      </div>
      {!readOnly ? <button className="add-card" onClick={() => onAdd("This week", status)}><Plus size={16} /> Add item</button> : null}
    </section>)}
  </div>;
}

function CalendarView({ items, onOpen }: { items: WorkItem[]; onOpen: (id: string) => void }) {
  const [cursor, setCursor] = useState(new Date(2026, 7, 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - firstDay + 1);
  return <div className="calendar-view">
    <div className="calendar-header"><div><strong>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(cursor)}</strong><span>{items.length} scheduled items</span></div><div><button className="secondary-button" onClick={() => setCursor(new Date())}>Today</button><button className="icon-button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button><button className="icon-button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month"><ChevronRight size={18} /></button></div></div>
    <div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="weekday" key={day}>{day}</div>)}{cells.map((day, index) => {
      const date = day > 0 && day <= days ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
      const dayItems = items.filter((item) => item.timeline_start === date || item.timeline_end === date);
      return <div className={`calendar-day ${date ? "" : "outside"}`} key={index}>{date ? <span className={date === today ? "today" : ""}>{day}</span> : null}{dayItems.slice(0, 3).map((item) => <button className={`calendar-item status-${slug(item.status)}`} key={item.id} onClick={() => onOpen(item.id)}>{item.title}</button>)}{dayItems.length > 3 ? <small>+{dayItems.length - 3} more</small> : null}</div>;
    })}</div>
  </div>;
}

function DashboardView({ items, stats }: { items: WorkItem[]; stats: { totalBudget: number; avgProgress: number; done: number; stuck: number } }) {
  const statusCounts = statuses.map((status) => ({ status, count: items.filter((item) => item.status === status).length }));
  const ownerCounts = owners.filter((owner) => owner !== "Unassigned").map((owner) => ({ owner, count: items.filter((item) => item.owner === owner).length })).filter((entry) => entry.count);
  return <div className="dashboard-grid">
    <div className="dashboard-panel wide"><div className="panel-title"><Gauge size={18} /> Portfolio health</div><div className="health-row"><div className="health-score">{stats.avgProgress}%<span>average progress</span></div><div className="health-bars">{statusCounts.map(({ status, count }) => <div className="bar-row" key={status}><span>{status}</span><div className="bar-track"><div className={`bar-fill status-${slug(status)}`} style={{ width: `${items.length ? (count / items.length) * 100 : 0}%` }} /></div><strong>{count}</strong></div>)}</div></div></div>
    <div className="dashboard-panel"><div className="panel-title">Budget</div><div className="large-number">{formatCurrency(stats.totalBudget)}</div><p>Tracked across visible items.</p></div>
    <div className="dashboard-panel"><div className="panel-title">Blocked work</div><div className="large-number red">{stats.stuck}</div><p>Items that need an unblocker.</p></div>
    <div className="dashboard-panel wide"><div className="panel-title">Timeline focus</div><div className="timeline-list">{items.slice(0, 6).map((item) => <div className="timeline-row" key={item.id}><strong>{item.title}</strong><span>{formatDate(item.timeline_start)} - {formatDate(item.timeline_end)}</span><Progress value={item.progress} /></div>)}</div></div>
    <div className="dashboard-panel wide"><div className="panel-title">Workload by owner</div><div className="owner-workload">{ownerCounts.map(({ owner, count }) => <div key={owner}><Owner name={owner} /><strong>{count}</strong><div className="workload-track"><span style={{ width: `${Math.min(100, count * 22)}%` }} /></div></div>)}</div></div>
  </div>;
}

function ItemDrawer({ item, updates, activity, attachments, onClose, onUpdate, onAddUpdate, onAddSubitem, onUpload, onOpenAttachment, onDeleteAttachment, onDelete, readOnly }: { item: WorkItem; updates: ItemUpdate[]; activity: ActivityEntry[]; attachments: Attachment[]; onClose: () => void; onUpdate: (id: string, patch: Partial<WorkItem>, action?: string) => void; onAddUpdate: (itemId: string, body: string) => void; onAddSubitem: () => void; onUpload: (file: File) => void; onOpenAttachment: (attachment: Attachment) => void; onDeleteAttachment: (attachment: Attachment) => void; onDelete: () => void; readOnly: boolean }) {
  const [tab, setTab] = useState<DetailTab>("updates");
  const [draft, setDraft] = useState("");
  const attachmentInput = useRef<HTMLInputElement | null>(null);
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="item-drawer" aria-label="Item details">
      <div className="drawer-header"><span>Item details</span><div>{!readOnly ? <button className="icon-button" onClick={onDelete} aria-label="Delete item"><Trash2 size={17} /></button> : null}<button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button></div></div>
      <div className="drawer-body">
        <input className="drawer-title" disabled={readOnly} value={item.title} onChange={(event) => onUpdate(item.id, { title: event.target.value })} aria-label="Item title" />
        <div className="detail-grid">
          <label>Owner<OwnerSelect value={item.owner} disabled={readOnly} onChange={(owner) => onUpdate(item.id, { owner }, `Owner changed to ${owner}`)} /></label>
          <label>Status<SelectPill value={item.status} options={statuses} kind="status" disabled={readOnly} onChange={(status) => onUpdate(item.id, { status: status as Status, progress: status === "Done" ? 100 : item.progress }, `Status changed to ${status}`)} /></label>
          <label>Priority<SelectPill value={item.priority} options={priorities} kind="priority" disabled={readOnly} onChange={(priority) => onUpdate(item.id, { priority: priority as Priority }, `Priority changed to ${priority}`)} /></label>
          <label>Group<select value={item.group_name} disabled={readOnly} onChange={(event) => onUpdate(item.id, { group_name: event.target.value }, `Moved to ${event.target.value}`)}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label>Start date<input type="date" disabled={readOnly} value={item.timeline_start} onChange={(event) => onUpdate(item.id, { timeline_start: event.target.value })} /></label>
          <label>End date<input type="date" disabled={readOnly} value={item.timeline_end} onChange={(event) => onUpdate(item.id, { timeline_end: event.target.value })} /></label>
          <label className="full">Progress<div className="drawer-progress"><input type="range" disabled={readOnly} min="0" max="100" value={item.progress} onChange={(event) => onUpdate(item.id, { progress: Number(event.target.value), status: Number(event.target.value) === 100 ? "Done" : item.status })} /><strong>{item.progress}%</strong></div></label>
          <label className="full">Budget<input type="number" disabled={readOnly} min="0" value={item.budget} onChange={(event) => onUpdate(item.id, { budget: Number(event.target.value) })} /></label>
          <label className="full">Description<textarea value={item.description} disabled={readOnly} placeholder="Add notes, context, or a brief..." onChange={(event) => onUpdate(item.id, { description: event.target.value })} /></label>
        </div>
        <section className="attachment-section">
          <div className="attachment-heading"><div><Paperclip size={16} /><strong>Files</strong><span>{attachments.length}</span></div>{!readOnly ? <><button className="secondary-button" onClick={() => attachmentInput.current?.click()}><Upload size={15} /> Upload</button><input ref={attachmentInput} className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></> : null}</div>
          {attachments.length ? <div className="attachment-list">{attachments.map((attachment) => <div key={attachment.id}><span><FileText size={17} /></span><button onClick={() => onOpenAttachment(attachment)}><strong>{attachment.file_name}</strong><small>{formatBytes(attachment.size_bytes)}</small></button><button className="icon-button small" onClick={() => onOpenAttachment(attachment)} aria-label={`Open ${attachment.file_name}`}><ExternalLink size={14} /></button>{!readOnly ? <button className="icon-button small" onClick={() => onDeleteAttachment(attachment)} aria-label={`Delete ${attachment.file_name}`}><Trash2 size={14} /></button> : null}</div>)}</div> : <div className="attachment-empty">No files attached</div>}
        </section>
        {!readOnly && !item.parent_id ? <button className="secondary-button add-subitem" onClick={onAddSubitem}><Plus size={16} /> Add subitem</button> : null}
        <div className="drawer-tabs"><button className={tab === "updates" ? "active" : ""} onClick={() => setTab("updates")}>Updates <span>{updates.length}</span></button><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity <span>{activity.length}</span></button></div>
        {tab === "updates" ? <div className="updates-panel">{!readOnly ? <div className="composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write an update..." /><button className="primary-button" disabled={!draft.trim()} onClick={() => { onAddUpdate(item.id, draft.trim()); setDraft(""); }}>Post update</button></div> : null}{updates.length ? updates.map((update) => <article className="update-card" key={update.id}><div><Owner name={update.author} /><time>{formatRelative(update.created_at)}</time></div><p>{update.body}</p></article>) : <div className="mini-empty"><MessageSquareText size={22} /><span>No updates yet</span></div>}</div> : <ActivityList entries={activity} />}
      </div>
    </aside>
  </div>;
}

function NotificationsPanel({ activity, onClose, onOpenItem }: { activity: ActivityEntry[]; onClose: () => void; onOpenItem: (id: string) => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="notification-panel"><div className="drawer-header"><strong>Notifications</strong><button className="icon-button" onClick={onClose} aria-label="Close notifications"><X size={18} /></button></div><div className="notification-title"><span>Inbox</span><button>Mark all read</button></div>{activity.length ? <ActivityList entries={activity} onOpen={onOpenItem} /> : <div className="mini-empty"><Bell size={22} /><span>You're all caught up</span></div>}</aside></div>;
}

function ActivityList({ entries, onOpen }: { entries: ActivityEntry[]; onOpen?: (id: string) => void }) {
  return <div className="activity-list">{entries.map((entry) => <button key={entry.id} onClick={() => entry.item_id && onOpen?.(entry.item_id)} disabled={!onOpen || !entry.item_id}><span className="activity-icon"><Activity size={15} /></span><span><strong>{entry.action}</strong><time>{formatRelative(entry.created_at)}</time></span></button>)}</div>;
}

function SettingsModal({ board, isDemo, onSave, onReset, onClose }: { board: Board; isDemo: boolean; onSave: (patch: Pick<Board, "title" | "description" | "privacy">) => void; onReset: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description);
  const [privacy, setPrivacy] = useState<BoardPrivacy>(board.privacy);
  return <Modal title="Board settings" onClose={onClose}><div className="settings-form"><label>Board name<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Board privacy<select value={privacy} onChange={(event) => setPrivacy(event.target.value as BoardPrivacy)}><option value="main">Main · visible to workspace members</option><option value="private">Private · invited board members only</option><option value="shareable">Shareable · supports invited guests</option></select></label>{isDemo ? <div className="demo-settings"><strong>Demo account</strong><span>Reset workspaces, boards, members, teams, and sample data.</span><button className="secondary-button" onClick={onReset}>Reset demo account</button></div> : null}<button className="primary-button save-settings" disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), description: description.trim(), privacy })}>Save settings</button></div></Modal>;
}

function ProfileModal({ user, onSave, onClose }: { user: AppUser; onSave: (fullName: string) => void; onClose: () => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  return <Modal title="Profile settings" onClose={onClose}><div className="settings-form profile-form"><div className="profile-avatar-large">{initials(fullName)}</div><label>Full name<input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Email<input value={user.email} disabled /></label><button className="primary-button save-settings" disabled={fullName.trim().length < 2} onClick={() => onSave(fullName.trim())}>Save profile</button></div></Modal>;
}

function CreateEntityModal({ kind, onCreate, onClose }: { kind: "workspace" | "board"; onCreate: (name: string, privacy: BoardPrivacy) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<BoardPrivacy>("main");
  return <Modal title={kind === "workspace" ? "Create workspace" : "Create board"} onClose={onClose}><div className="settings-form create-entity-form"><div className="create-entity-icon">{kind === "workspace" ? <Building2 size={22} /> : <Grid2X2 size={22} />}</div><label>{kind === "workspace" ? "Workspace name" : "Board name"}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "workspace" ? "e.g. Marketing Operations" : "e.g. Product Launch"} /></label>{kind === "board" ? <label>Privacy<select value={privacy} onChange={(event) => setPrivacy(event.target.value as BoardPrivacy)}><option value="main">Main</option><option value="private">Private</option><option value="shareable">Shareable</option></select></label> : null}<button className="primary-button save-settings" disabled={name.trim().length < 2} onClick={() => onCreate(name.trim(), privacy)}>Create {kind}</button></div></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><strong>{title}</strong><button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={18} /></button></div>{children}</div></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`metric ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Owner({ name }: { name: string }) {
  return <div className="owner"><span className={`avatar avatar-${avatarTone(name)}`}>{initials(name)}</span><strong>{name}</strong></div>;
}

function OwnerSelect({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="owner-select"><span className={`avatar avatar-${avatarTone(value)}`}>{initials(value)}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label="Owner">{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label>;
}

function SelectPill({ value, options, kind, onChange, disabled = false }: { value: string; options: string[]; kind: "status" | "priority"; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className={`pill-select ${kind}-${slug(value)}`}><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={kind}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Progress({ value }: { value: number }) {
  return <div className="progress"><div className="progress-track"><div style={{ width: `${value}%` }} /></div><span>{value}%</span></div>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function avatarTone(name: string) {
  const tones = ["violet", "blue", "green", "pink", "orange"];
  return tones[[...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % tones.length];
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  const hours = Math.floor(difference / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}
