import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "content-type": "application/json" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const authorization = request.headers.get("authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return response({ error: "Authentication required" }, 401);
  const body = await request.json();
  const { workspaceId, provider, endpoint } = body;
  const { data: membership } = await userClient.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) return response({ error: "Workspace admin required" }, 403);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("integration_connections").upsert({ workspace_id: workspaceId, provider, status: "ready", config: { endpoint }, connected_by: user.id, updated_at: new Date().toISOString() });
  if (error) return response({ error: error.message }, 400);
  return response({ status: "ready", next: "Configure provider OAuth credentials and token vault before marking connected." });
});

function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: cors }); }
