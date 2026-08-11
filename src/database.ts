import { createClient, type Session } from "@supabase/supabase-js";
import { demoAccount } from "./account-data";
import { seedSnapshot } from "./data";
import { createDefaultPlatformState, mergePlatformState, type AutomationRun, type PlatformState, type WorkForm } from "./platform";
import { enqueueOfflineOperation, flushOfflineOperations, isOfflineError, type OfflineOperation, type OfflineOperationType } from "./offline";
import type { BackupBundle, ObservabilityEvent } from "./reliability";
import type {
  AccountState,
  ActivityEntry,
  AppUser,
  Attachment,
  Board,
  BoardMember,
  BoardRole,
  BoardPrivacy,
  BoardSnapshot,
  Invitation,
  ItemUpdate,
  Team,
  TeamMember,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  WorkItem,
} from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasOnlineDatabase = Boolean(supabaseUrl && supabaseAnonKey);
export const database = hasOnlineDatabase
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export type WorkspaceBackupRecord = {
  id: string;
  workspace_id: string;
  status: "complete" | "failed";
  item_count: number;
  size_bytes: number;
  created_at: string;
  expires_at: string;
};

const demoAccountKey = "mondayflow-demo-account-v1";
const demoBoardKey = (boardId: string) => `mondayflow-demo-board-v3-${boardId}`;
const demoPlatformKey = (workspaceId: string) => `mondayflow-platform-v1-${workspaceId}`;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copySeed(boardId: string): BoardSnapshot {
  const snapshot = clone(seedSnapshot);
  snapshot.items = snapshot.items.map((item) => ({ ...item, board_id: boardId }));
  snapshot.updates = snapshot.updates.map((entry) => ({ ...entry, board_id: boardId }));
  snapshot.activity = snapshot.activity.map((entry) => ({ ...entry, board_id: boardId }));
  return snapshot;
}

function loadDemoAccount(): AccountState {
  try {
    const value = localStorage.getItem(demoAccountKey);
    if (!value) return clone(demoAccount);
    const stored = JSON.parse(value) as Partial<AccountState>;
    return {
      ...clone(demoAccount),
      ...stored,
      boardMembers: stored.boardMembers ?? clone(demoAccount.boardMembers),
      teams: stored.teams ?? clone(demoAccount.teams),
      teamMembers: stored.teamMembers ?? clone(demoAccount.teamMembers),
      invitations: stored.invitations ?? [],
    };
  } catch {
    return clone(demoAccount);
  }
}

function loadDemoBoard(boardId: string): BoardSnapshot {
  try {
    const value = localStorage.getItem(demoBoardKey(boardId));
    if (!value) return copySeed(boardId);
    const stored = JSON.parse(value) as Partial<BoardSnapshot>;
    const fallback = copySeed(boardId);
    return {
      items: stored.items ?? fallback.items,
      updates: stored.updates ?? fallback.updates,
      activity: stored.activity ?? fallback.activity,
      attachments: stored.attachments ?? [],
    };
  } catch {
    return copySeed(boardId);
  }
}

export function persistDemoAccount(account: AccountState) {
  if (!database) localStorage.setItem(demoAccountKey, JSON.stringify(account));
}

export function persistDemo(boardId: string, snapshot: BoardSnapshot) {
  if (!database) localStorage.setItem(demoBoardKey(boardId), JSON.stringify(snapshot));
}

export function resetDemo(boardId: string) {
  localStorage.removeItem(demoBoardKey(boardId));
}

export function resetDemoAccount() {
  localStorage.removeItem(demoAccountKey);
}

export function resetDemoPlatform(workspaceId: string) {
  localStorage.removeItem(demoPlatformKey(workspaceId));
}

export async function loadPlatformState(workspaceId: string, boardId: string): Promise<PlatformState> {
  if (!database) {
    try {
      const stored = localStorage.getItem(demoPlatformKey(workspaceId));
      return mergePlatformState(stored ? JSON.parse(stored) as Partial<PlatformState> : null, workspaceId, boardId);
    } catch {
      return mergePlatformState(null, workspaceId, boardId);
    }
  }
  const [stateResult, submissionResult] = await Promise.all([
    database.from("workspace_feature_state").select("state").eq("workspace_id", workspaceId).maybeSingle(),
    database.from("public_form_submissions").select("id,form_id,values,created_at").eq("board_id", boardId).order("created_at", { ascending: false }),
  ]);
  const error = stateResult.error ?? submissionResult.error;
  if (error) throw error;
  const merged = mergePlatformState(stateResult.data?.state as Partial<PlatformState> | null, workspaceId, boardId);
  return { ...merged, submissions: (submissionResult.data ?? []) as PlatformState["submissions"] };
}

export async function savePlatformState(workspaceId: string, state: PlatformState) {
  if (!database) {
    localStorage.setItem(demoPlatformKey(workspaceId), JSON.stringify(state));
    return;
  }
  try {
    await savePlatformStateOnline(workspaceId, state);
  } catch (error) {
    await queueIfOffline("save_platform", { workspaceId, state }, error);
  }
}

async function savePlatformStateOnline(workspaceId: string, state: PlatformState) {
  if (!database) return;
  const { error } = await database.from("workspace_feature_state").upsert({ workspace_id: workspaceId, state, updated_at: new Date().toISOString() });
  if (error) throw error;
  const security = state.enterprise;
  const { error: securityError } = await database.from("organization_security").upsert({ workspace_id: workspaceId, sso_provider: security.sso_provider, verified_domain: security.sso_domain, sso_enforced: security.sso_enforced, scim_enabled: security.scim_enabled, retention_days: security.retention_days, updated_at: new Date().toISOString() });
  if (securityError) throw securityError;
  const connections = state.integrations.filter((entry) => entry.workspace_id === workspaceId).map((entry) => ({ workspace_id: workspaceId, provider: entry.provider, status: entry.status, config: { endpoint: entry.endpoint }, updated_at: entry.updated_at }));
  if (!connections.length) return;
  const { error: integrationError } = await database.from("integration_connections").upsert(connections, { onConflict: "workspace_id,provider" });
  if (integrationError) throw integrationError;
}

export async function queueAutomationRuns(runs: AutomationRun[]) {
  if (!database || !runs.length) return;
  const { error } = await database.from("automation_jobs").insert(runs.map((run) => ({
    id: run.id,
    automation_id: run.automation_id,
    board_id: run.board_id,
    item_id: run.item_id,
    status: run.status === "success" ? "completed" : run.status,
    message: run.message,
    payload: run.payload ?? {},
    scheduled_for: new Date().toISOString(),
  })));
  if (error) throw error;
}

export async function loadPublishedForm(formId: string): Promise<WorkForm | null> {
  if (!database) return createDefaultPlatformState("demo-workspace-1", "demo-board-1").forms.find((form) => form.id === formId) ?? null;
  const { data, error } = await database.rpc("get_public_form", { p_form_id: formId });
  if (error) throw error;
  return data ? data as WorkForm : null;
}

export async function submitPublishedForm(form: WorkForm, values: Record<string, string>) {
  if (!database) return crypto.randomUUID();
  const { data, error } = await database.rpc("submit_public_form", { p_board_id: form.board_id, p_form_id: form.id, p_values: values });
  if (error) throw error;
  return data as string;
}

export async function createScimToken(workspaceId: string) {
  if (!database) return `mf_scim_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const { data, error } = await database.rpc("create_scim_token", { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as string;
}

export async function startWorkspaceTrial(workspaceId: string, plan: string) {
  if (!database) return;
  const { error } = await database.rpc("start_workspace_trial", { p_workspace_id: workspaceId, p_plan: plan });
  if (error) throw error;
}

export type WorkloadSummary = { user_id: string; full_name: string; assigned_count: number; board_count: number };

export async function loadWorkspaceWorkload(workspaceId: string): Promise<WorkloadSummary[]> {
  if (!database) {
    const account = loadDemoAccount();
    const boards = account.boards.filter((board) => board.workspace_id === workspaceId);
    return account.members.filter((member) => member.workspace_id === workspaceId && member.role !== "guest").map((member) => {
      const firstName = member.profile.full_name.split(" ")[0];
      const assignedBoards = boards.map((board) => loadDemoBoard(board.id)).filter((snapshot) => snapshot.items.some((item) => !item.parent_id && item.owner === firstName));
      const assigned = boards.flatMap((board) => loadDemoBoard(board.id).items).filter((item) => !item.parent_id && item.owner === firstName).length;
      return { user_id: member.user_id, full_name: member.profile.full_name, assigned_count: assigned, board_count: assignedBoards.length };
    });
  }
  const { data, error } = await database.rpc("workspace_workload", { p_workspace_id: workspaceId });
  if (error) throw error;
  return (data ?? []).map((entry: Record<string, unknown>) => ({ user_id: String(entry.user_id), full_name: String(entry.full_name), assigned_count: Number(entry.assigned_count), board_count: Number(entry.board_count) }));
}

export async function getSession() {
  if (!database) return null;
  const { data, error } = await database.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  if (!database) return () => undefined;
  const { data } = database.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string) {
  if (!database) return;
  const { error } = await database.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(fullName: string, email: string, password: string) {
  if (!database) return;
  const { data, error } = await database.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  if (!database) return;
  const { error } = await database.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  if (!database) return;
  const { error } = await database.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function signOutUser() {
  if (!database) return;
  const { error } = await database.auth.signOut();
  if (error) throw error;
}

function appUserFromSession(session: Session, profile?: Record<string, unknown> | null): AppUser {
  return {
    id: session.user.id,
    email: String(profile?.email ?? session.user.email ?? ""),
    full_name: String(profile?.full_name ?? session.user.user_metadata.full_name ?? session.user.email?.split("@")[0] ?? "Member"),
    avatar_url: (profile?.avatar_url as string | null | undefined) ?? null,
  };
}

export async function loadAccount(): Promise<AccountState> {
  if (!database) return loadDemoAccount();
  const session = await getSession();
  if (!session) throw new Error("Please sign in to continue.");

  const { error: bootstrapError } = await database.rpc("bootstrap_account");
  if (bootstrapError) throw bootstrapError;

  const [profileResult, workspacesResult, membersResult, boardsResult, boardMembersResult, teamsResult, teamMembersResult, invitationsResult] = await Promise.all([
    database.from("profiles").select("id,email,full_name,avatar_url").eq("id", session.user.id).maybeSingle(),
    database.from("workspaces").select("*").order("created_at"),
    database.from("workspace_members").select("workspace_id,user_id,role,status,profile:profiles(id,email,full_name,avatar_url)").eq("status", "active"),
    database.from("boards").select("*").order("updated_at", { ascending: false }),
    database.from("board_members").select("board_id,user_id,role"),
    database.from("teams").select("*").order("name"),
    database.from("team_members").select("team_id,user_id"),
    database.from("workspace_invitations").select("*").eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  const error = profileResult.error ?? workspacesResult.error ?? membersResult.error ?? boardsResult.error ?? boardMembersResult.error ?? teamsResult.error ?? teamMembersResult.error ?? invitationsResult.error;
  if (error) throw error;

  const members = (membersResult.data ?? []).map((row: Record<string, unknown>) => {
    const rawProfile = (Array.isArray(row.profile) ? row.profile[0] : row.profile) as Record<string, unknown> | null;
    return {
      workspace_id: String(row.workspace_id),
      user_id: String(row.user_id),
      role: row.role as WorkspaceRole,
      status: row.status as "active" | "suspended",
      profile: {
        id: String(rawProfile?.id ?? row.user_id),
        email: String(rawProfile?.email ?? ""),
        full_name: String(rawProfile?.full_name ?? "Member"),
        avatar_url: (rawProfile?.avatar_url as string | null | undefined) ?? null,
      },
    } satisfies WorkspaceMember;
  });

  return {
    currentUser: appUserFromSession(session, profileResult.data as Record<string, unknown> | null),
    workspaces: (workspacesResult.data ?? []) as Workspace[],
    members,
    boards: (boardsResult.data ?? []) as Board[],
    boardMembers: (boardMembersResult.data ?? []) as BoardMember[],
    teams: (teamsResult.data ?? []) as Team[],
    teamMembers: (teamMembersResult.data ?? []) as TeamMember[],
    invitations: (invitationsResult.data ?? []) as Invitation[],
  };
}

export async function createWorkspace(name: string): Promise<Workspace> {
  if (!database) {
    return { id: crypto.randomUUID(), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), created_by: demoAccount.currentUser.id, created_at: new Date().toISOString() };
  }
  const { data, error } = await database.rpc("create_workspace_with_owner", { p_name: name });
  if (error) throw error;
  const { data: workspace, error: readError } = await database.from("workspaces").select("*").eq("id", data).single();
  if (readError) throw readError;
  return workspace as Workspace;
}

export async function createBoard(workspaceId: string, title: string, privacy: BoardPrivacy): Promise<Board> {
  const board: Board = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    title,
    description: "Plan work, assign owners, and keep delivery visible.",
    privacy,
    created_by: demoAccount.currentUser.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!database) return board;
  const { id: _id, ...payload } = board;
  const { data, error } = await database.from("boards").insert(payload).select().single();
  if (error) throw error;
  return data as Board;
}

export async function updateBoard(boardId: string, patch: Partial<Pick<Board, "title" | "description" | "privacy">>) {
  if (!database) return;
  const { error } = await database.from("boards").update(patch).eq("id", boardId);
  if (error) throw error;
}

export async function setBoardMember(boardId: string, userId: string, role: BoardRole | null) {
  if (!database) return;
  if (role) {
    const { error } = await database.from("board_members").upsert({ board_id: boardId, user_id: userId, role });
    if (error) throw error;
  } else {
    const { error } = await database.from("board_members").delete().eq("board_id", boardId).eq("user_id", userId);
    if (error) throw error;
  }
}

export async function updateProfile(fullName: string) {
  if (!database) return;
  const session = await getSession();
  if (!session) throw new Error("Authentication required");
  const { error } = await database.from("profiles").update({ full_name: fullName }).eq("id", session.user.id);
  if (error) throw error;
  await database.auth.updateUser({ data: { full_name: fullName } });
}

export async function createTeam(workspaceId: string, name: string): Promise<Team> {
  if (!database) return { id: crypto.randomUUID(), workspace_id: workspaceId, name, created_at: new Date().toISOString() };
  const { data, error } = await database.from("teams").insert({ workspace_id: workspaceId, name }).select().single();
  if (error) throw error;
  return data as Team;
}

export async function setTeamMember(teamId: string, userId: string, active: boolean) {
  if (!database) return;
  if (active) {
    const { error } = await database.from("team_members").upsert({ team_id: teamId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await database.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) throw error;
  }
}

export async function createInvitation(workspaceId: string, email: string, role: WorkspaceRole): Promise<Invitation> {
  if (!database) {
    return { id: crypto.randomUUID(), workspace_id: workspaceId, email, role, token: crypto.randomUUID().replaceAll("-", ""), status: "pending", expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: new Date().toISOString() };
  }
  const { data, error } = await database.rpc("create_workspace_invitation", { p_workspace_id: workspaceId, p_email: email, p_role: role });
  if (error) throw error;
  return data as Invitation;
}

export async function acceptInvitation(token: string) {
  if (!database) return;
  const { error } = await database.rpc("accept_workspace_invitation", { p_token: token });
  if (error) throw error;
}

export async function setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  if (!database) return;
  const { error } = await database.rpc("set_workspace_member_role", { p_workspace_id: workspaceId, p_user_id: userId, p_role: role });
  if (error) throw error;
}

export async function removeMember(workspaceId: string, userId: string) {
  if (!database) return;
  const { error } = await database.rpc("remove_workspace_member", { p_workspace_id: workspaceId, p_user_id: userId });
  if (error) throw error;
}

export async function loadSnapshot(boardId: string): Promise<BoardSnapshot> {
  if (!database) return loadDemoBoard(boardId);
  const [itemsResult, updatesResult, activityResult, attachmentsResult] = await Promise.all([
    database.from("work_items").select("*").eq("board_id", boardId).order("sort_order").limit(2000),
    database.from("item_updates").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(500),
    database.from("activity_logs").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(100),
    database.from("attachments").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(500),
  ]);
  const error = itemsResult.error ?? updatesResult.error ?? activityResult.error ?? attachmentsResult.error;
  if (error) throw error;

  let items = (itemsResult.data ?? []) as WorkItem[];
  if (items.length === 0) {
    const prepared = seedSnapshot.items.filter((item) => !item.parent_id).map(({ id: _id, ...item }) => ({ ...item, board_id: boardId, parent_id: null }));
    const { data, error: seedError } = await database.from("work_items").insert(prepared).select();
    if (seedError) throw seedError;
    items = data as WorkItem[];
  }
  return {
    items,
    updates: (updatesResult.data ?? []) as ItemUpdate[],
    activity: (activityResult.data ?? []) as ActivityEntry[],
    attachments: (attachmentsResult.data ?? []) as Attachment[],
  };
}

export function subscribeToBoard(boardId: string, onChange: () => void) {
  if (!database) return () => undefined;
  const channel = database
    .channel(`board:${boardId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_items", filter: `board_id=eq.${boardId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "item_updates", filter: `board_id=eq.${boardId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter: `board_id=eq.${boardId}` }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs", filter: `board_id=eq.${boardId}` }, onChange)
    .subscribe();
  return () => { void database.removeChannel(channel); };
}

export async function insertItem(item: WorkItem) {
  if (!database) return;
  const { data, error } = await database.from("work_items").insert(item).select().single();
  if (error) { await queueIfOffline("insert_item", { item }, error); return item; }
  return data as WorkItem;
}

export async function patchItem(id: string, patch: Partial<WorkItem>) {
  if (!database) return;
  const { data, error } = await database.from("work_items").update(patch).eq("id", id).select().single();
  if (error) { await queueIfOffline("patch_item", { id, patch }, error); return; }
  return data as WorkItem;
}

export async function removeItems(ids: string[]) {
  if (!database) return;
  const { error } = await database.from("work_items").delete().in("id", ids);
  if (error) await queueIfOffline("remove_items", { ids }, error);
}

export async function insertUpdate(update: ItemUpdate) {
  if (!database) return;
  const { data, error } = await database.from("item_updates").insert(update).select().single();
  if (error) { await queueIfOffline("insert_update", { update }, error); return update; }
  return data as ItemUpdate;
}

export async function insertActivity(entry: ActivityEntry) {
  if (!database) return;
  const { data, error } = await database.from("activity_logs").insert(entry).select().single();
  if (error) { await queueIfOffline("insert_activity", { entry }, error); return entry; }
  return data as ActivityEntry;
}

export async function uploadAttachment(boardId: string, itemId: string, file: File): Promise<Attachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const fileId = crypto.randomUUID();
  if (!database) {
    return { id: fileId, board_id: boardId, item_id: itemId, file_name: file.name, storage_path: URL.createObjectURL(file), content_type: file.type || "application/octet-stream", size_bytes: file.size, uploaded_by: null, created_at: new Date().toISOString() };
  }
  const storagePath = `${boardId}/${itemId}/${fileId}-${safeName}`;
  const { error: uploadError } = await database.storage.from("board-files").upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await database.from("attachments").insert({ board_id: boardId, item_id: itemId, file_name: file.name, storage_path: storagePath, content_type: file.type || "application/octet-stream", size_bytes: file.size }).select().single();
  if (error) {
    await database.storage.from("board-files").remove([storagePath]);
    throw error;
  }
  return data as Attachment;
}

export async function getAttachmentUrl(storagePath: string) {
  if (storagePath.startsWith("blob:")) return storagePath;
  if (!database) return storagePath;
  const { data, error } = await database.storage.from("board-files").createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(attachment: Attachment) {
  if (!database) return;
  const { error: storageError } = await database.storage.from("board-files").remove([attachment.storage_path]);
  if (storageError) throw storageError;
  const { error } = await database.from("attachments").delete().eq("id", attachment.id);
  if (error) throw error;
}

async function queueIfOffline(type: OfflineOperationType, payload: Record<string, unknown>, error: unknown) {
  if (!isOfflineError(error)) throw error;
  await enqueueOfflineOperation(type, payload);
}

export async function flushDatabaseOfflineQueue() {
  if (!database) return { completed: 0, remaining: 0 };
  return flushOfflineOperations(executeOfflineOperation);
}

export async function recordObservabilityEvent(workspaceId: string, event: ObservabilityEvent) {
  if (!database) return;
  const { error } = await database.from("observability_events").insert({
    id: event.id,
    workspace_id: workspaceId,
    event_type: event.type,
    name: event.name,
    value: event.value,
    detail: event.detail,
    context: { path: window.location.pathname, user_agent: navigator.userAgent.slice(0, 300) },
  });
  if (error) throw error;
}

export async function loadBackupRecords(workspaceId: string): Promise<WorkspaceBackupRecord[]> {
  if (!database) return [];
  const { data, error } = await database.from("workspace_backups").select("id,workspace_id,status,item_count,size_bytes,created_at,expires_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as WorkspaceBackupRecord[];
}

export async function requestCloudBackup(workspaceId: string) {
  if (!database) return null;
  const { data, error } = await database.functions.invoke("backup-workspace", { body: { action: "backup", workspace_id: workspaceId } });
  if (error) throw error;
  return data as { backup_id: string; item_count: number };
}

export async function requestCloudRestore(workspaceId: string, bundle: BackupBundle) {
  if (!database) return;
  const { error } = await database.functions.invoke("backup-workspace", { body: { action: "restore", workspace_id: workspaceId, bundle } });
  if (error) throw error;
}

async function executeOfflineOperation(operation: OfflineOperation) {
  if (!database) return;
  const payload = operation.payload;
  let error: { message: string } | null = null;
  if (operation.type === "insert_item") ({ error } = await database.from("work_items").upsert(payload.item as WorkItem));
  if (operation.type === "patch_item") ({ error } = await database.from("work_items").update(payload.patch as Partial<WorkItem>).eq("id", String(payload.id)));
  if (operation.type === "remove_items") ({ error } = await database.from("work_items").delete().in("id", payload.ids as string[]));
  if (operation.type === "insert_update") ({ error } = await database.from("item_updates").upsert(payload.update as ItemUpdate));
  if (operation.type === "insert_activity") ({ error } = await database.from("activity_logs").upsert(payload.entry as ActivityEntry));
  if (operation.type === "save_platform") return savePlatformStateOnline(String(payload.workspaceId), payload.state as PlatformState);
  if (error) throw error;
}
