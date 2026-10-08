// POST /api/stripe-webhook — Stripe tells us when a subscription changes
// (started, trial ends, payment fails, plan changes, cancelled). The
// organization is created if it doesn't exist yet, and its plan, office
// limit and status follow, so every phone sees the change at once.
//
// In Stripe: Developers > Webhooks > Add endpoint
//   https://officeswap.co/api/stripe-webhook
//   events: customer.subscription.created, .updated, .deleted

import { billingFields, ensureOrg, json, missing, updateOrg, verifyStripeSignature } from "../_lib/billing.js";

export async function onRequestPost({ request, env }) {
  if (missing(env, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "FIREBASE_SERVICE_ACCOUNT"]).length) return json({ error: "not configured" }, 503);
  const raw = await request.text();
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "bad signature" }, 400);
  }
  const event = JSON.parse(raw);
  if (!event.type || !event.type.startsWith("customer.subscription.")) return json({ received: true });

  const sub = event.data.object;
  const fields = billingFields(env, sub);
  if (event.type === "customer.subscription.deleted") fields.billingStatus = "canceled";

  const known = sub.metadata && sub.metadata.org_code;
  if (known && (await updateOrg(env, known, fields))) return json({ received: true, code: known });
  if (fields.billingStatus === "canceled" || fields.billingStatus === "incomplete_expired") return json({ received: true });
  // Not created yet (the buyer hasn't come back from Checkout): create it now.
  const code = await ensureOrg(env, sub);
  await updateOrg(env, code, fields);
  return json({ received: true, code, created: true });
}
