import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (request) => {
  if (request.headers.get("authorization") !== `Bearer ${Deno.env.get("AUTOMATION_CRON_SECRET")}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await supabase.rpc("enqueue_due_date_automations");
  const { data: jobs, error } = await supabase.from("automation_jobs").select("*").eq("status", "queued").lte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(25);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });

  const results = [];
  for (const job of jobs ?? []) {
    await supabase.from("automation_jobs").update({ status: "running", started_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id).eq("status", "queued");
    try {
      const payload = job.payload ?? {};
      if (payload.type === "send_email") await sendEmail(payload);
      if (payload.type === "call_webhook") await callWebhook(payload);
      if (payload.type === "set_status" && job.item_id) await updateItem(supabase, job.item_id, { status: payload.value });
      if (payload.type === "assign_owner" && job.item_id) await updateItem(supabase, job.item_id, { owner: payload.value });
      if (payload.type === "notify") await supabase.from("activity_logs").insert({ board_id: job.board_id, item_id: job.item_id, action: String(payload.value ?? job.message) });
      await supabase.from("automation_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, status: "completed" });
    } catch (caught) {
      await supabase.from("automation_jobs").update({ status: "failed", message: String((caught as Error).message).slice(0, 500), completed_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, status: "failed" });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: jsonHeaders });
});

async function sendEmail(payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("AUTOMATION_EMAIL_FROM");
  if (!apiKey || !from) throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: payload.to, subject: payload.subject, text: payload.text }) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

async function updateItem(supabase: ReturnType<typeof createClient>, itemId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("work_items").update(patch).eq("id", itemId);
  if (error) throw error;
}

async function callWebhook(payload: Record<string, unknown>) {
  const endpoint = new URL(String(payload.endpoint ?? ""));
  const allowlist = (Deno.env.get("AUTOMATION_WEBHOOK_ALLOWLIST") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowlist.includes(endpoint.hostname)) throw new Error("Webhook hostname is not allowlisted");
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "user-agent": "MondayFlow-Automation/1.0" }, body: JSON.stringify(payload.body ?? {}) });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
}
