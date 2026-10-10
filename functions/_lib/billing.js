// Shared helpers for OfficeSwap's paid organizations, run as Cloudflare
// Pages Functions on officeswap.co.
//
// Settings (Cloudflare Pages > officeswap-web > Settings > Variables, as
// encrypted secrets where marked):
//   STRIPE_SECRET_KEY          secret   sk_live_… (or sk_test_… to try it out)
//   STRIPE_WEBHOOK_SECRET      secret   whsec_… from the webhook endpoint
//   STRIPE_PRICE_STARTER       price_…  $299 / month, 1–19 offices     (optional: see PRICE_IDS)
//   STRIPE_PRICE_GROWTH        price_…  $699 / month, 20–99 offices    (optional: see PRICE_IDS)
//   STRIPE_PRICE_ENTERPRISE    price_…  $1,099 / month, 100+ offices   (optional: see PRICE_IDS)
//   STRIPE_PORTAL_LOGIN_URL    the customer portal's login link (billing.stripe.com/p/login/…)
//   FIREBASE_SERVICE_ACCOUNT   secret   the service account JSON from Firebase
//
// An organization made here carries its plan; organizations without one
// (everything made before paid plans) are free and unlimited.

export const SITE = "https://officeswap.co";
export const TRIAL_DAYS = 30;

// Office limits per plan; null means no limit.
export const PLANS = {
  starter: { name: "Starter", limit: 19, env: "STRIPE_PRICE_STARTER" },
  growth: { name: "Growth", limit: 99, env: "STRIPE_PRICE_GROWTH" },
  enterprise: { name: "Enterprise", limit: null, env: "STRIPE_PRICE_ENTERPRISE" },
};

// Stripe price IDs (not secret). A Cloudflare setting of the same plan wins.
export const PRICE_IDS = {
  starter: "price_1UO8rIIWSF4jElIrY5hhu0T5",
  growth: "price_1UO8ujIWSF4jElIrlAYf0ynE",
  enterprise: "price_1UO8vcIWSF4jElIr7f2GXOaN",
};

export function priceFor(env, plan) {
  return (PLANS[plan] && env[PLANS[plan].env]) || PRICE_IDS[plan] || "";
}

export function planForPrice(env, priceId) {
  for (const key of Object.keys(PLANS)) if (priceId && priceFor(env, key) === priceId) return key;
  return null;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function missing(env, names) {
  return names.filter((n) => !env[n]);
}

// ---------- Stripe ----------

function form(params, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

// Most calls use the API version the site was built on. Checkout on the page
// itself (ui_mode "elements") needs a newer one, matching Stripe.js "endive".
export const API_VERSION = "2024-06-20";
export const CHECKOUT_API_VERSION = "2026-09-30.endive";

export async function stripe(env, method, path, params, version = API_VERSION) {
  const init = {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "stripe-version": version },
  };
  let url = `https://api.stripe.com/v1/${path}`;
  if (params && method === "GET") url += "?" + form(params).toString();
  else if (params) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = form(params).toString();
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error ? data.error.message : res.status}`);
  return data;
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Checks the Stripe-Signature header against the raw body (HMAC-SHA256),
// within five minutes, comparing in constant time.
export async function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const t = parts.t;
  const sigs = header.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`)));
  return sigs.some((s) => s.length === expected.length && [...s].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

// ---------- Access codes ----------

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// The access code for a subscription: derived from its ID, so asking twice
// (the success page and the webhook) always lands on the same organization.
export async function codeFor(subscriptionId, attempt = 0) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`officeswap:${subscriptionId}:${attempt}`)));
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[digest[i] % CODE_CHARS.length];
  return code;
}

// ---------- Firestore (as the project's service account) ----------

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken = null;

export async function accessToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging", iat: now, exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`))));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${sig}` }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token: ${data.error_description || data.error || res.status}`);
  cachedToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

function docsURL(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  return `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
}

// Plain values to Firestore's typed JSON.
export function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

export async function firestore(env, method, path, body) {
  // ":runQuery" and the like attach straight to the documents root.
  const res = await fetch(`${docsURL(env)}${path.startsWith(":") ? "" : "/"}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function getOrg(env, code) {
  const r = await firestore(env, "GET", `orgs/${code}`);
  return r.status === 200 ? r.data : null;
}

// Creates orgs/{code}; false if a record with that code already exists.
export async function createOrg(env, code, fields) {
  const r = await firestore(env, "POST", `orgs?documentId=${encodeURIComponent(code)}`, { fields: toFields(fields) });
  if (r.status === 200) return true;
  if (r.status === 409) return false;
  throw new Error(`Firestore create ${code}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
}

// Updates some fields of an existing organization; false if it's gone.
export async function updateOrg(env, code, fields) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
  const r = await firestore(env, "PATCH", `orgs/${code}?${mask}&currentDocument.exists=true`, { fields: toFields(fields) });
  if (r.status === 200) return true;
  if (r.status === 404 || r.status === 400) return false;
  throw new Error(`Firestore update ${code}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
}

// The billing fields the app reads, from a Stripe subscription.
export function billingFields(env, sub) {
  const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price.id;
  const plan = planForPrice(env, priceId) || (sub.metadata && sub.metadata.plan) || "starter";
  return {
    plan,
    officeLimit: PLANS[plan] ? PLANS[plan].limit : null,
    billingStatus: sub.status,
    stripeCustomer: typeof sub.customer === "string" ? sub.customer : sub.customer && sub.customer.id,
    stripeSubscription: sub.id,
  };
}

// ---------- Creating the organization ----------

// Creates the organization for a subscription if it doesn't exist yet and
// returns its access code. Used by the success page and the webhook (so a
// buyer who closes the tab before coming back still gets one). The code is
// derived from the subscription, so both land on the same record.
export async function ensureOrg(env, sub) {
  const m = sub.metadata || {};
  if (m.org_code && (await getOrg(env, m.org_code))) return m.org_code;
  if (!m.org_name || !m.master_hash) throw new Error(`subscription ${sub.id} has no organization details`);
  const fields = {
    name: m.org_name,
    address: { street: m.street, city: m.city, state: m.state, zip: m.zip },
    createdAt: new Date(),
    ownerEmail: m.owner_email,
    masterHash: m.master_hash,
    masterSalt: m.master_salt,
    ...billingFields(env, sub),
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = await codeFor(sub.id, attempt);
    let mine = await createOrg(env, code, fields);
    if (!mine) {
      // Taken: by this same subscription (another request got there first),
      // or by some other organization, in which case try the next code.
      const org = await getOrg(env, code);
      mine = !!(org && org.fields && org.fields.stripeSubscription && org.fields.stripeSubscription.stringValue === sub.id);
    }
    if (mine) {
      // Keep the code on the subscription and the customer, for the webhook
      // and for finding an organization from the Stripe dashboard.
      await stripe(env, "POST", `subscriptions/${sub.id}`, { metadata: { org_code: code } });
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer && sub.customer.id;
      if (customer) await stripe(env, "POST", `customers/${customer}`, { metadata: { org_code: code } });
      return code;
    }
  }
  throw new Error(`no free access code for subscription ${sub.id}`);
}
