import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "content-type": "application/scim+json" };

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const tokenHash = await sha256(token);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: scimToken } = await admin.from("scim_tokens").select("id,workspace_id").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
  if (!scimToken) return scimError(401, "Invalid provisioning token");
  await admin.from("scim_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", scimToken.id);

  const url = new URL(request.url);
  const path = url.pathname.split("/").filter(Boolean);
  const usersIndex = path.lastIndexOf("Users");
  const resource = usersIndex >= 0 ? "Users" : path.at(-1);
  const userId = usersIndex >= 0 ? path[usersIndex + 1] ?? null : null;

  if (request.method === "GET" && resource === "Users" && !userId) {
    const { data, error } = await admin.from("workspace_members").select("user_id,status,profile:profiles(email,full_name)").eq("workspace_id", scimToken.workspace_id);
    if (error) return scimError(500, error.message);
    const resources = (data ?? []).map((entry: Record<string, unknown>) => toScimUser(entry));
    return new Response(JSON.stringify({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: resources.length, startIndex: 1, itemsPerPage: resources.length, Resources: resources }), { headers });
  }

  if (request.method === "PATCH" && resource === "Users" && userId) {
    const body = await request.json();
    const active = !JSON.stringify(body).includes('"value":false');
    const { error } = await admin.from("workspace_members").update({ status: active ? "active" : "suspended" }).eq("workspace_id", scimToken.workspace_id).eq("user_id", userId);
    if (error) return scimError(400, error.message);
    return new Response(JSON.stringify({ id: userId, active }), { headers });
  }
  return scimError(501, "Supported operations: GET /Users and PATCH /Users/{id}");
});

function toScimUser(entry: Record<string, unknown>) {
  const profile = (Array.isArray(entry.profile) ? entry.profile[0] : entry.profile) as Record<string, unknown>;
  return { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], id: entry.user_id, userName: profile?.email, displayName: profile?.full_name, active: entry.status === "active" };
}

function scimError(status: number, detail: string) { return new Response(JSON.stringify({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail }), { status, headers }); }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
