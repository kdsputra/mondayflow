import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  const workspaceId = url.searchParams.get("workspace_id") ?? "";
  const expected = Deno.env.get(`WEBHOOK_SECRET_${provider.toUpperCase().replaceAll("-", "_")}`);
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return response({ error: "Invalid webhook signature" }, 401);
  const payload = await request.json();
  const externalId = String(payload.id ?? request.headers.get("x-request-id") ?? crypto.randomUUID());
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error: eventError } = await admin.from("integration_webhook_events").upsert({ workspace_id: workspaceId, provider, external_id: externalId, event_type: String(payload.type ?? "event"), payload, status: "received" }, { onConflict: "workspace_id,provider,external_id", ignoreDuplicates: true });
  if (eventError) return response({ error: eventError.message }, 400);
  const { data: featureState } = await admin.from("workspace_feature_state").select("state").eq("workspace_id", workspaceId).maybeSingle();
  const recipes = (featureState?.state?.automations ?? []).filter((recipe: Record<string, unknown>) => recipe.enabled && recipe.trigger === "webhook_received" && (!recipe.trigger_value || recipe.trigger_value === provider));
  if (recipes.length) await admin.from("automation_jobs").insert(recipes.map((recipe: Record<string, unknown>) => ({ automation_id: recipe.id, board_id: recipe.board_id, status: "queued", message: `${provider} webhook queued automation`, payload: actionPayload(recipe, payload) })));
  await admin.from("integration_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("provider", provider).eq("external_id", externalId);
  return response({ received: true, queued: recipes.length });
});

function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function actionPayload(recipe: Record<string, unknown>, source: unknown) {
  if (recipe.action === "call_webhook") return { type: "call_webhook", endpoint: recipe.action_value, body: source };
  if (recipe.action === "send_email") return { type: "send_email", to: recipe.action_value, subject: "MondayFlow integration event", text: JSON.stringify(source) };
  return { type: recipe.action, value: recipe.action_value, source };
}
