// OfficeSwap's schedule logic for the web, ported line for line from the
// iOS app (ContentView.swift: Days, Store) so a change made here matches
// what every phone would do. Reads and writes the same shared JSON the app
// keeps in orgs/{code}/state/current:
//   dates   seconds since 2001-01-01 (Swift's Date), each the local midnight
//           of the day picked
//   seats   a flat [date, officeID, date, officeID, ...] list

const REF = 978307200; // 2001-01-01 in Unix seconds

// ---------- Days ----------

export const Days = {
  toSwift: (d) => d.getTime() / 1000 - REF,
  fromSwift: (n) => new Date((n + REF) * 1000),
  startOfDay: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  today: () => Days.startOfDay(new Date()),
  add: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n),
  isWeekday: (d) => d.getDay() >= 1 && d.getDay() <= 5,
  // A day saved by a phone in another time zone, snapped to local midnight.
  normalized: (d) => Days.startOfDay(new Date(d.getTime() + 12 * 3600 * 1000)),
  monday: (d) => Days.add(Days.startOfDay(d), -((d.getDay() + 6) % 7)),
  weekDates: (monday) => [0, 1, 2, 3, 4].map((i) => Days.add(monday, i)),
  upcoming(n) {
    const out = [];
    let d = Days.today();
    while (out.length < n) { if (Days.isWeekday(d)) out.push(d); d = Days.add(d, 1); }
    return out;
  },
  baseMonday: () => Days.monday(Days.upcoming(1)[0]),
  key: (d) => d.getTime(),
  short: (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  dow: (d) => d.toLocaleDateString(undefined, { weekday: "short" }),
  range(days) {
    const s = [...days].sort((a, b) => a - b);
    if (!s.length) return "";
    const groups = [[s[0]]];
    for (const d of s.slice(1)) {
      let next = Days.add(groups[groups.length - 1].at(-1), 1);
      while (!Days.isWeekday(next)) next = Days.add(next, 1);
      if (next.getTime() === d.getTime()) groups[groups.length - 1].push(d); else groups.push([d]);
    }
    return groups.map((g) => (g.length === 1 ? Days.short(g[0]) : `${Days.short(g[0])} to ${Days.short(g.at(-1))}`)).join("; ");
  },
};

export const uuid = () => crypto.randomUUID().toUpperCase();

// ---------- Store ----------

export class Store {
  constructor(orgCode, orgName, orgAddress) {
    this.orgCode = orgCode;
    this.orgName = orgName;
    this.orgAddress = orgAddress; // {street, city, state, zip} or null
    this.offices = []; this.away = []; this.visits = []; this.knownVisitors = [];
    this.extra = {}; // fields of the shared JSON this version doesn't use (kept as they are)
    this.pending = [];
    this.lastCreated = 0;
  }

  // ----- shared JSON <-> model -----

  load(state) {
    const { offices = [], away = [], visits = [], knownVisitors = [], ...extra } = state;
    this.extra = extra;
    this.offices = offices.map((o) => ({ ...o }));
    this.away = away.map((a) => ({ ...a, days: uniqDays(a.days.map((n) => Days.normalized(Days.fromSwift(n)))) }));
    this.visits = visits.map((v) => {
      const seats = new Map();
      for (let i = 0; i + 1 < (v.seats || []).length; i += 2) {
        const k = Days.key(Days.normalized(Days.fromSwift(v.seats[i])));
        if (!seats.has(k)) seats.set(k, v.seats[i + 1]);
      }
      return { ...v, days: uniqDays(v.days.map((n) => Days.normalized(Days.fromSwift(n)))).sort((a, b) => a - b), seats };
    });
    this.knownVisitors = [...knownVisitors];
  }

  snapshot() {
    const out = { ...this.extra, offices: this.offices, knownVisitors: this.knownVisitors };
    out.away = this.away.map((a) => ({ id: a.id, officeID: a.officeID, days: a.days.map(Days.toSwift), note: a.note }));
    out.visits = this.visits.map((v) => {
      const o = { id: v.id, name: v.name, days: v.days.map(Days.toSwift), seats: [], created: v.created };
      for (const [k, id] of v.seats) o.seats.push(Days.toSwift(new Date(k)), id);
      if (v.location != null) o.location = v.location;
      return o;
    });
    return out;
  }

  // Latest shared data, with this page's unsent changes re-applied on top.
  adopt(remote) {
    if (remote) { this.load(remote); for (const c of this.pending) this.apply(c); }
    else if (!this.pending.length) this.pending = [{ type: "replaceAll", state: this.snapshot() }];
    this.recompute();
  }

  apply(c) {
    switch (c.type) {
      case "addVisit":
        if (!this.visits.some((v) => v.id === c.visit.id)) this.visits.push({ ...c.visit, seats: new Map() });
        break;
      case "addAway":
        if (!this.away.some((a) => a.id === c.away.id)) this.away.push({ ...c.away });
        break;
      case "cancelVisit": this.visits = this.visits.filter((v) => v.id !== c.id); break;
      case "cancelAway": this.away = this.away.filter((a) => a.id !== c.id); break;
      case "setOffices": this.applyOffices(c.text); break;
      case "addPerson": if (!this.peopleDirectory().includes(c.name)) this.knownVisitors.push(c.name); break;
      case "replaceAll": this.load(c.state); break;
    }
  }

  record(c) { this.pending.push(c); this.apply(c); this.recompute(); }

  // ----- reading -----

  peopleDirectory() {
    return [...new Set([...this.offices.map((o) => o.owner).filter(Boolean), ...this.knownVisitors, ...this.visits.map((v) => v.name)])].sort(cmp);
  }
  office(id) { return this.offices.find((o) => o.id === id); }
  locations() { return [...new Set(this.offices.map((o) => o.location))].sort(cmp); }

  requestableNames(location) {
    const t = Days.today();
    const busy = new Set(this.visits.filter((v) => v.days.some((d) => d >= t))
      .filter((v) => location == null || v.location == null || v.location === location).map((v) => v.name));
    const local = new Set(this.offices.filter((o) => location == null || o.location === location).map((o) => o.owner));
    return this.peopleDirectory().filter((n) => !busy.has(n) && !local.has(n));
  }

  offerableOffices() {
    const t = Days.today();
    const busy = new Set(this.away.filter((a) => a.days.some((d) => d >= t)).map((a) => a.officeID));
    return this.offices.filter((o) => o.owner && !busy.has(o.id));
  }

  isOpen(o, d) { return !o.owner || this.away.some((a) => a.officeID === o.id && hasDay(a.days, d)); }
  holder(officeID, d, except) { return this.visits.find((v) => v.id !== except && v.seats.get(Days.key(d)) === officeID); }
  isFree(o, d, except) { return this.isOpen(o, d) && !this.holder(o.id, d, except); }
  waiting(v) { const t = Days.today(); return v.days.filter((d) => !v.seats.has(Days.key(d)) && d >= t); }
  waitlist() { return this.visits.filter((v) => this.waiting(v).length).sort((a, b) => a.created - b.created); }

  // First come, first served. Valid seats never move; visitors are kept in as few offices as possible.
  recompute() {
    for (const v of this.visits) {
      for (const d of v.days) {
        const oid = v.seats.get(Days.key(d));
        if (oid == null) continue;
        const o = this.office(oid);
        if (o && this.isOpen(o, d)) continue;
        v.seats.delete(Days.key(d));
      }
    }
    const today = Days.today();
    const order = [...this.visits].sort((a, b) => a.created - b.created);
    for (const v of order) {
      let need = v.days.filter((d) => !v.seats.has(Days.key(d)) && d >= today);
      while (need.length) {
        const used = new Set(v.seats.values());
        let best = null, bestN = 0;
        for (const o of this.offices) {
          if (v.location != null && o.location !== v.location) continue;
          const n = need.filter((d) => this.isFree(o, d, v.id)).length;
          const bestUsed = best ? used.has(best.id) : false;
          if (n > bestN || (n === bestN && n > 0 && used.has(o.id) && !bestUsed)) { best = o; bestN = n; }
        }
        if (!best) break;
        for (const d of need) if (this.isFree(best, d, v.id)) v.seats.set(Days.key(d), best.id);
        need = need.filter((d) => !v.seats.has(Days.key(d)));
      }
    }
  }

  rows(day, location) {
    return this.offices.filter((o) => location == null || o.location === location).map((o) => {
      const rawNote = (this.away.find((a) => a.officeID === o.id && hasDay(a.days, day)) || {}).note || "";
      const note = rawNote || null;
      const sub = o.owner ? `${o.owner} is away` : "Guest desk";
      const h = this.holder(o.id, day);
      if (h) return { id: o.id, name: o.name, kind: 1, title: h.name, subtitle: sub, note, location: o.location, address: o.address };
      if (this.isOpen(o, day)) return { id: o.id, name: o.name, kind: 0, title: "Open", subtitle: sub, note, location: o.location, address: o.address };
      return { id: o.id, name: o.name, kind: 2, title: o.owner, subtitle: "In the office", note: null, location: o.location, address: o.address };
    }).sort((a, b) => a.kind - b.kind || cmp(a.name, b.name));
  }

  // ----- changes -----

  nextCreated() { this.lastCreated = Math.max(this.lastCreated + 1, Date.now()); return this.lastCreated; }

  addVisit(name, days, location) {
    const v = { id: uuid(), name, days: uniqDays(days).sort((a, b) => a - b), seats: new Map(), created: this.nextCreated(), location: location ?? null };
    this.record({ type: "addVisit", visit: v });
    return v.id;
  }
  addAway(officeID, days, note) { this.record({ type: "addAway", away: { id: uuid(), officeID, days: uniqDays(days), note: note.trim() } }); }
  cancelVisit(id) { this.record({ type: "cancelVisit", id }); }
  cancelAway(id) { this.record({ type: "cancelAway", id }); }
  addPerson(name) { this.record({ type: "addPerson", name }); }
  resetToEmpty() {
    const state = { ...this.extra, offices: [], away: [], visits: [], knownVisitors: [] };
    this.pending.push({ type: "replaceAll", state }); this.load(state); this.recompute();
  }

  // ----- the office list ("office, person, location, address" per line) -----

  officeListText() { return this.offices.map((o) => `${o.name}, ${o.owner}, ${o.location}, ${o.address}`).join("\n"); }

  removesSomething(text) {
    const owners = new Map();
    for (const raw of text.split("\n")) {
      const parts = splitMax(raw, ",", 3).map((s) => s.trim());
      if (!parts[0]) continue;
      owners.set(parts[0].toLowerCase(), parts.length > 1 ? parts[1] : "");
    }
    return this.offices.some((o) => {
      if (!owners.has(o.name.toLowerCase())) return true;
      return !!o.owner && owners.get(o.name.toLowerCase()).toLowerCase() !== o.owner.toLowerCase();
    });
  }

  validateOffices(text) {
    const seen = new Set();
    for (const raw of text.split("\n")) {
      const name = splitMax(raw, ",", 1)[0].trim();
      if (!name) continue;
      if (seen.has(name.toLowerCase())) return `Office "${name}" is listed twice.`;
      seen.add(name.toLowerCase());
    }
    return null;
  }

  setOffices(text) {
    const e = this.validateOffices(text);
    if (e) return e;
    this.record({ type: "setOffices", text });
    return null;
  }

  applyOffices(text) {
    const seen = new Set(); const next = [];
    const a = this.orgAddress;
    const city = a ? a.city : "New York";
    const formatted = a ? `${a.street}, ${a.city}, ${a.state} ${a.zip}` : "";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const parts = splitMax(line, ",", 3).map((s) => s.trim());
      const name = parts[0];
      const owner = parts.length > 1 ? parts[1] : "";
      const location = parts.length > 2 && parts[2] ? parts[2] : city;
      const address = parts.length > 3 && parts[3] ? parts[3] : formatted;
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const existing = this.offices.find((o) => o.name.toLowerCase() === key);
      next.push({ id: existing ? existing.id : uuid(), name, owner, location, address });
    }
    this.offices = next;
    this.away = this.away.filter((w) => { const o = this.office(w.officeID); return o && o.owner; });
  }

  // ----- spreadsheet -----

  csv() {
    const today = Days.today();
    const field = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const row = (r) => r.map((x) => field(String(x))).join(",");
    const lines = ["Offices", row(["Name", "Owner", "Location", "Address", "Status Today", "Occupant Today"])];
    for (const o of [...this.offices].sort((a, b) => cmp(a.name, b.name))) {
      const h = this.holder(o.id, today);
      const [status, occ] = h ? ["Visitor", h.name] : this.isOpen(o, today) ? ["Open", ""] : ["In the Office", o.owner];
      lines.push(row([o.name, o.owner, o.location, o.address, status, occ]));
    }
    lines.push("", "Waitlist (first come, first served)", row(["Position", "Name", "Requested Dates"]));
    this.waitlist().forEach((v, i) => lines.push(row([i + 1, v.name, Days.range(this.waiting(v))])));
    lines.push("", "Away", row(["Office", "Owner", "Dates", "Note"]));
    for (const w of this.away) { const o = this.office(w.officeID); lines.push(row([o ? o.name : "", o ? o.owner : "", Days.range(w.days), w.note])); }
    return lines.join("\n");
  }
}

// Office lines are counted the way plans count them: one per line with a name.
export function officeCount(text) {
  return text.split("\n").filter((l) => splitMax(l, ",", 1)[0].trim()).length;
}

function splitMax(s, sep, max) {
  const out = []; let rest = s;
  while (out.length < max) { const i = rest.indexOf(sep); if (i < 0) break; out.push(rest.slice(0, i)); rest = rest.slice(i + 1); }
  out.push(rest);
  return out;
}
function uniqDays(days) { const m = new Map(); for (const d of days) m.set(Days.key(d), d); return [...m.values()]; }
function hasDay(days, d) { return days.some((x) => x.getTime() === d.getTime()); }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
