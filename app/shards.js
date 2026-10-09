// How an organization's shared schedule is split across Firestore documents,
// so one organization can have thousands of busy offices. The same layout as
// the iOS app's Shards.swift (keep the two in step):
//
//   orgs/{code}/state/meta        json: { v: 2, chunks, weeks: {wN: buckets}, knownVisitors, rosterVersion? }
//   orgs/{code}/state/o{i}        json: [office], up to 1,500 per chunk, in order
//   orgs/{code}/state/w{N}b{j}    json: { away: [...], visits: [...] }
//
// An offer or request is filed under the week of its last day (N is that
// week's Monday, in days from 2001-01-01, itself a Monday) and in bucket
// j = (the first 8 hex digits of its ID) mod the week's bucket count. A week
// starts with one bucket per 600 offices and doubles its buckets whenever one
// gets too big. Readers load last week onward.
//
// Everything here works on the shared JSON format (days are Swift dates:
// seconds since 2001-01-01; seats a flat [day, officeID, ...] list).

export const META = "meta";
// The old single-document schedule once an organization has moved (the app
// writes it): older versions show its one entry telling people to update.
export const MOVED = '{"offices":[{"id":"00000000-0000-4000-8000-0000000000A1","name":"Update OfficeSwap","owner":"A new version","location":"Update required","address":"Your organization now needs the latest version of OfficeSwap. Update it in the App Store to keep using it."}],"away":[],"visits":[],"knownVisitors":[],"movedTo":"v2"}';
const PER_CHUNK = 1500, PER_BUCKET = 600, BUCKET_BYTES = 600000;

export const chunkID = (i) => `o${i}`;
export const bucketID = (week, j) => `${week}b${j}`;
export const dayNumber = (swift) => Math.floor((swift + 43200) / 86400);
export function weekKey(swift) { const n = dayNumber(swift); return `w${n - (((n % 7) + 7) % 7)}`; }
export const weekStart = (key) => Number(key.slice(1)) || 0;
export const isLoaded = (key, todaySwift) => weekStart(key) >= weekStart(weekKey(todaySwift)) - 7;
export const bucket = (id, n) => (parseInt(id.slice(0, 8), 16) || 0) % Math.max(1, n);
export const weekOf = (days) => weekKey(days.length ? Math.max(...days) : 0);
const newBuckets = (offices) => Math.max(1, Math.ceil(offices / PER_BUCKET));

// Every document ID the layout uses, for loading (loadedOnly) or deleting.
export function documentIDs(meta, loadedOnly, todaySwift) {
  const ids = [];
  for (let i = 0; i < meta.chunks; i++) ids.push(chunkID(i));
  for (const week of Object.keys(meta.weeks).sort()) {
    if (loadedOnly && !isLoaded(week, todaySwift)) continue;
    for (let j = 0; j < meta.weeks[week]; j++) ids.push(bucketID(week, j));
  }
  return ids;
}

const utf8 = (s) => new TextEncoder().encode(s || "").length;
// About how big a bucket is as JSON (the same estimate as the app).
function estimatedBytes(w) {
  let n = 30;
  for (const a of w.away) n += 110 + 20 * a.days.length + utf8(a.note) * 2;
  for (const v of w.visits) n += 150 + 20 * v.days.length + 62 * (v.seats.length / 2) + utf8(v.name) + utf8(v.location);
  return n;
}
const byID = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Splits a snapshot into { meta, docs: {id: content} }. Weeks keep their
// bucket counts from the previous layout; entries are sorted by ID inside
// each bucket so the same data always splits the same way.
export function split(state, prev) {
  const docs = {};
  const offices = state.offices || [];
  let chunks = 0;
  for (let i = 0; i < offices.length; i += PER_CHUNK) docs[chunkID(chunks++)] = offices.slice(i, i + PER_CHUNK);
  const weeks = { ...(prev ? prev.weeks : {}) };
  const away = {}, visits = {};
  for (const a of state.away || []) (away[weekOf(a.days)] ||= []).push(a);
  for (const v of state.visits || []) (visits[weekOf(v.days)] ||= []).push(v);
  const fresh = newBuckets(offices.length);
  for (const key of new Set([...Object.keys(away), ...Object.keys(visits)])) {
    let n = weeks[key] ?? fresh;
    for (;;) {
      const buckets = Array.from({ length: n }, () => ({ away: [], visits: [] }));
      for (const a of away[key] || []) buckets[bucket(a.id, n)].away.push(a);
      for (const v of visits[key] || []) buckets[bucket(v.id, n)].visits.push(v);
      for (const b of buckets) { b.away.sort(byID); b.visits.sort(byID); }
      if (buckets.some((b) => estimatedBytes(b) > BUCKET_BYTES) && n < 512) { n *= 2; continue; }
      buckets.forEach((b, j) => { docs[bucketID(key, j)] = b; });
      weeks[key] = n;
      break;
    }
  }
  const meta = { v: 2, chunks, weeks, knownVisitors: state.knownVisitors || [] };
  if (state.rosterVersion != null) meta.rosterVersion = state.rosterVersion;
  return { meta, docs };
}

// Puts loaded documents back together as a snapshot, offices in chunk order.
export function merge(meta, docs) {
  const offices = [], away = [], visits = [];
  for (let i = 0; i < meta.chunks; i++) offices.push(...(docs[chunkID(i)] || []));
  for (const id of Object.keys(docs).sort()) {
    if (id[0] !== "w") continue;
    away.push(...docs[id].away); visits.push(...docs[id].visits);
  }
  const s = { offices, away, visits, knownVisitors: meta.knownVisitors || [] };
  if (meta.rosterVersion != null) s.rosterVersion = meta.rosterVersion;
  return s;
}

// A document's content in one canonical form (days snapped to the same day
// numbers, sorted; seats sorted by day), for telling whether it changed.
export function canonical(id, content) {
  if (id[0] === "o") return JSON.stringify((content || []).map((o) => [o.id, o.name, o.owner, o.location, o.address]));
  const w = content || { away: [], visits: [] };
  const days = (ds) => [...new Set(ds.map(dayNumber))].sort((a, b) => a - b);
  return JSON.stringify([
    [...w.away].sort(byID).map((a) => [a.id, a.officeID, days(a.days), a.note]),
    [...w.visits].sort(byID).map((v) => {
      const seats = [];
      for (let i = 0; i + 1 < v.seats.length; i += 2) seats.push([dayNumber(v.seats[i]), v.seats[i + 1]]);
      seats.sort((a, b) => a[0] - b[0]);
      return [v.id, v.name, days(v.days), seats, v.created, v.location ?? null];
    }),
  ]);
}

export const empty = (id) => (id[0] === "o" ? [] : { away: [], visits: [] });
