import Stripe from "npm:stripe@17.7.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const subscription = event.data.object as Stripe.Subscription;
  const workspaceId = subscription.metadata?.workspace_id;
  if (workspaceId && event.type.startsWith("customer.subscription.")) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("billing_accounts").upsert({ workspace_id: workspaceId, provider_customer_id: String(subscription.customer), provider_subscription_id: subscription.id, plan: subscription.metadata.plan ?? "pro", status: mapStatus(subscription.status), seats: subscription.items.data[0]?.quantity ?? 1, current_period_end: new Date(subscription.current_period_end * 1000).toISOString(), updated_at: new Date().toISOString() });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});

function mapStatus(status: Stripe.Subscription.Status) { if (status === "active" || status === "trialing") return status === "trialing" ? "trial" : "active"; if (status === "past_due" || status === "unpaid") return "past_due"; return "cancelled"; }
