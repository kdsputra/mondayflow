import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (body.action === "scheduled") {
      if (request.headers.get("authorization") !== `Bearer ${Deno.env.get("BACKUP_CRON_SECRET")}`) throw new ResponseError("Unauthorized", 401);
      const result = await runScheduledBackups(service);
      return response(result);
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new ResponseError("Authentication required", 401);
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) throw new ResponseError("Invalid session", 401);
    const workspaceId = String(body.workspace_id ?? "");
    if (!workspaceId) throw new ResponseError("workspace_id is required", 400);
    await requireManager(service, workspaceId, auth.user.id);

    if (body.action === "backup") return response(await createWorkspaceBackup(service, workspaceId, auth.user.id));
    if (body.action === "restore") {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { authorization: `Bearer ${token}` } } });
      const { error } = await userClient.rpc("restore_workspace_backup", { p_workspace_id: workspaceId, p_bundle: body.bundle });
      if (error) throw new ResponseError(error.message, 400);
      return response({ restored: true });
    }
    throw new ResponseError("Unknown action", 400);
  } catch (caught) {
    const error = caught as Error & { status?: number };
    return response({ error: error.message }, error.status ?? 500);
  }
});

async function requireManager(service: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await service.from("workspace_members").select("role,status").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active" || !["owner", "admin"].includes(data.role)) throw new ResponseError("Workspace admin required", 403);
}

async function createWorkspaceBackup(service: SupabaseClient, workspaceId: string, userId: string | null) {
  const { data: boards, error: boardError } = await service.from("boards").select("*").eq("workspace_id", workspaceId);
  if (boardError) throw boardError;
  const boardIds = (boards ?? []).map((board) => board.id);
  const [workspace, members, teams, feature, integrations, security, billing] = await Promise.all([
    one(service, "workspaces", "id", workspaceId),
    many(service, "workspace_members", "workspace_id", workspaceId),
    many(service, "teams", "workspace_id", workspaceId),
    one(service, "workspace_feature_state", "workspace_id", workspaceId),
    many(service, "integration_connections", "workspace_id", workspaceId, "id,workspace_id,provider,status,config,updated_at"),
    one(service, "organization_security", "workspace_id", workspaceId),
    one(service, "billing_accounts", "workspace_id", workspaceId),
  ]);
  const [boardMembers, items, updates, activity, attachments, submissions] = await Promise.all([
    manyForBoards(service, "board_members", boardIds),
    manyForBoards(service, "work_items", boardIds),
    manyForBoards(service, "item_updates", boardIds),
    manyForBoards(service, "activity_logs", boardIds),
    manyForBoards(service, "attachments", boardIds),
    manyForBoards(service, "public_form_submissions", boardIds),
  ]);
  const teamIds = teams.map((team) => team.id);
  const teamMembers = teamIds.length ? await manyByIds(service, "team_members", "team_id", teamIds) : [];
  const bundle = {
    product: "MondayFlow",
    schema_version: 7,
    created_at: new Date().toISOString(),
    workspace_id: workspaceId,
    data: { workspace, members, boards, board_members: boardMembers, teams, team_members: teamMembers, items, updates, activity, attachments, feature_state: feature, integrations, organization_security: security, billing, form_submissions: submissions },
  };
  const json = JSON.stringify(bundle);
  const backupId = crypto.randomUUID();
  const storagePath = `${workspaceId}/${backupId}.json`;
  const { error: uploadError } = await service.storage.from("workspace-backups").upload(storagePath, new Blob([json], { type: "application/json" }), { upsert: false });
  if (uploadError) throw uploadError;
  const { error: metadataError } = await service.from("workspace_backups").insert({ id: backupId, workspace_id: workspaceId, storage_path: storagePath, schema_version: 7, status: "complete", item_count: items.length, size_bytes: new TextEncoder().encode(json).length, created_by: userId });
  if (metadataError) {
    await service.storage.from("workspace-backups").remove([storagePath]);
    throw metadataError;
  }
  return { backup_id: backupId, item_count: items.length };
}

async function runScheduledBackups(service: SupabaseClient) {
  const { data: states, error } = await service.from("workspace_feature_state").select("workspace_id,state");
  if (error) throw error;
  const now = Date.now();
  const results: Array<{ workspace_id: string; status: string }> = [];
  for (const row of states ?? []) {
    const settings = row.state?.reliability;
    if (!settings?.automatic_backups) continue;
    const interval = settings.backup_interval === "weekly" ? 7 * 86400000 : 86400000;
    const { data: latest } = await service.from("workspace_backups").select("created_at").eq("workspace_id", row.workspace_id).eq("status", "complete").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const last = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
    if (now - last < interval) continue;
    try {
      await createWorkspaceBackup(service, row.workspace_id, null);
      const state = { ...row.state, reliability: { ...settings, last_backup_at: new Date().toISOString() } };
      await service.from("workspace_feature_state").update({ state, updated_at: new Date().toISOString() }).eq("workspace_id", row.workspace_id);
      results.push({ workspace_id: row.workspace_id, status: "complete" });
    } catch {
      results.push({ workspace_id: row.workspace_id, status: "failed" });
    }
  }
  const { data: expired } = await service.from("workspace_backups").select("id,storage_path").lt("expires_at", new Date().toISOString()).limit(100);
  if (expired?.length) {
    await service.storage.from("workspace-backups").remove(expired.map((entry) => entry.storage_path));
    await service.from("workspace_backups").delete().in("id", expired.map((entry) => entry.id));
  }
  return { processed: results.length, results };
}

async function one(service: SupabaseClient, table: string, column: string, value: string) {
  const { data, error } = await service.from(table).select("*").eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}
async function many(service: SupabaseClient, table: string, column: string, value: string, columns = "*") {
  const { data, error } = await service.from(table).select(columns).eq(column, value);
  if (error) throw error;
  return data ?? [];
}
async function manyForBoards(service: SupabaseClient, table: string, boardIds: string[]) {
  if (!boardIds.length) return [];
  return manyByIds(service, table, "board_id", boardIds);
}
async function manyByIds(service: SupabaseClient, table: string, column: string, ids: string[]) {
  const { data, error } = await service.from(table).select("*").in(column, ids);
  if (error) throw error;
  return data ?? [];
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors }); }
class ResponseError extends Error { constructor(message: string, public status: number) { super(message); } }
