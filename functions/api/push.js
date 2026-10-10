// POST /api/push — push notifications for the iPhone app ("You got Sarah
// Kim's office for Thu, Oct 15"), sent through Firebase Cloud Messaging with
// the project's service account (FIREBASE_SERVICE_ACCOUNT, see billing.js).
//
//   { action: "register", token, code, name }   this phone belongs to `name` in `code`
//   { action: "unregister", token }             signed out: stop sending to this phone
//   { action: "notify", code, token?, seats: [{ visit, day, name, office, label }] }
//        a phone saw these waiting requests get an office; tells each person,
//        except on the phone that reported it (`token`). visit and office
//        are IDs, day is the app's day number (Shards.dayNumber), label is the text shown
//
// Matching runs on every phone, so several may report the same office:
//   pushTokens/{token}                              code, name, updatedAt
//   pushSent/{code}_{visit}_{day}_{office}          sentAt (created once)
// make each one go out once. Neither collection is open to the app (the
// rules don't mention them), only to this service account.

import { accessToken, firestore, json, missing, toFields } from "../_lib/billing.js";

const tokenRE = /^[A-Za-z0-9_:\-]{20,400}$/;
const codeRE = /^[A-Za-z0-9]{3,32}$/;
const idRE = /^[A-Za-z0-9\-]{1,64}$/;
const DEMO = "DEMO";

export async function onRequestPost({ request, env }) {
  if (missing(env, ["FIREBASE_SERVICE_ACCOUNT"]).length) return json({ error: "Not set up." }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const s = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);
  const token = s(b.token, 400), code = s(b.code, 32).toUpperCase();

  try {
    if (b.action === "register") {
      const name = s(b.name, 100);
      if (!tokenRE.test(token) || !codeRE.test(code) || code === DEMO || !name) return json({ error: "Bad request." }, 400);
      const r = await firestore(env, "PATCH", `pushTokens/${token}`, { fields: toFields({ code, name, updatedAt: new Date() }) });
      return r.status === 200 ? json({ ok: true }) : json({ error: "Couldn't save." }, 502);
    }

    if (b.action === "unregister") {
      if (!tokenRE.test(token)) return json({ error: "Bad request." }, 400);
      await firestore(env, "DELETE", `pushTokens/${token}`);
      return json({ ok: true });
    }

    if (b.action === "notify") {
      if (!codeRE.test(code) || code === DEMO || !Array.isArray(b.seats)) return json({ error: "Bad request." }, 400);
      const sent = [];
      for (const seat of b.seats.slice(0, 20)) {
        const visit = s(seat.visit, 64), office = s(seat.office, 64), name = s(seat.name, 100);
        const label = s(seat.label, 120);
        const day = Number(seat.day);
        if (!idRE.test(visit) || !idRE.test(office) || !name || !label || !Number.isInteger(day)) continue;
        // Skip days already past (the app counts days from 2001, at noon UTC).
        if (day < Math.floor((Date.now() / 1000 - 978307200 + 43200) / 86400) - 1) continue;
        const key = `${code}_${visit}_${day}_${office}`;
        const created = await firestore(env, "POST", `pushSent?documentId=${encodeURIComponent(key)}`, { fields: toFields({ sentAt: new Date() }) });
        if (created.status !== 200) continue; // already sent (409) or failed
        const tokens = await tokensFor(env, code, name);
        let n = 0;
        for (const t of tokens) {
          if (t === token) continue;
          if (await send(env, t, "You got an office", label, { code })) n++;
        }
        sent.push({ key, phones: n });
      }
      return json({ ok: true, sent });
    }
  } catch (e) {
    return json({ error: "Something went wrong." }, 500);
  }
  return json({ error: "Bad request." }, 400);
}

// The phones registered to this person in this organization.
async function tokensFor(env, code, name) {
  const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } });
  const r = await firestore(env, "POST", ":runQuery", {
    structuredQuery: {
      from: [{ collectionId: "pushTokens" }],
      where: { compositeFilter: { op: "AND", filters: [eq("code", code), eq("name", name)] } },
      limit: 20,
    },
  });
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  return r.data.filter((row) => row.document).map((row) => row.document.name.split("/").pop());
}

// One notification to one phone; a token Firebase no longer knows is removed.
async function send(env, token, title, body, data) {
  const project = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        apns: { payload: { aps: { sound: "default" } } },
      },
    }),
  });
  if (res.ok) return true;
  // 404 UNREGISTERED: the app was deleted or the token replaced.
  if (res.status === 404) await firestore(env, "DELETE", `pushTokens/${token}`);
  return false;
}
