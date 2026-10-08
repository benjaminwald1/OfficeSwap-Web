// GET /api/health — whether sign-up is set up: which settings are present,
// and whether the Firebase key works. Reports yes/no only, never values.

import { getOrg, json } from "../_lib/billing.js";

export async function onRequestGet({ env }) {
  const has = (k) => !!env[k];
  let firebase = false;
  if (has("FIREBASE_SERVICE_ACCOUNT")) {
    try { await getOrg(env, "JPM"); firebase = true; } catch (e) { firebase = false; }
  }
  return json({
    stripeKey: has("STRIPE_SECRET_KEY"),
    firebaseKey: has("FIREBASE_SERVICE_ACCOUNT"),
    firebaseWorks: firebase,
    webhookSecret: has("STRIPE_WEBHOOK_SECRET"),
    portalLink: true,
  });
}
