// GET /api/org?session_id=… — after Checkout, creates the organization (once)
// and returns its access code. Safe to call again: the code is derived from
// the subscription, so a reload finds the same organization.

import { ensureOrg, json, missing, stripe } from "../_lib/billing.js";

export async function onRequestGet({ request, env }) {
  if (missing(env, ["STRIPE_SECRET_KEY", "FIREBASE_SERVICE_ACCOUNT"]).length) return json({ error: "Sign-up isn't open yet." }, 503);
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "That link isn't valid." }, 400);

  const session = await stripe(env, "GET", `checkout/sessions/${id}`, { expand: { 0: "subscription" } });
  const sub = session.subscription;
  if (session.status !== "complete" || !sub || typeof sub !== "object") {
    return json({ error: "Your checkout isn't finished yet." }, 409);
  }
  if (["canceled", "incomplete_expired"].includes(sub.status)) return json({ error: "This subscription has ended." }, 410);
  try {
    const code = await ensureOrg(env, sub);
    return json({ code, name: sub.metadata.org_name, plan: sub.metadata.plan });
  } catch (e) {
    return json({ error: "We couldn't create your organization. Please contact support." }, 500);
  }
}
