// OfficeSwap on the web: the app's Board, Waitlist, Plans, Export and
// Settings in a browser, signed in with the organization's access code.
// Changes go into the same shared schedule every phone uses.

import { Store, Days, officeCount } from "./engine.js";
import { getOrg, getState, putState, getPhotos, deleteOrg } from "./cloud.js";

const root = document.getElementById("root");
const sheet = document.getElementById("sheet");
const SESSION = "officeswap.session";
const nameKey = (code) => `officeswap.myName.${code}`;
const locKey = (code) => `officeswap.boardLocation.${code}`;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const S = { code: null, org: null, store: null, version: null, photos: {}, tab: "board", location: null, weekOffset: 0, picked: null, timer: null, orgTimer: null, pushing: false };

// ---------- helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const myName = () => { const n = (ls.get(nameKey(S.code)) || "").trim(); return n || null; };

function officePhoto(id) {
  if (S.photos[id]) return S.photos[id];
  const hex = id.replace(/-/g, "");
  let n = 0;
  for (let i = 0; i < 32; i += 2) n = (n * 31 + parseInt(hex.slice(i, i + 2), 16)) & 0xffff;
  return `img/office${(n % 8) + 1}.jpg`;
}
async function personKey(name) {
  const norm = name.toLowerCase().split(" ").filter(Boolean).join(" ");
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm)));
  return "person-" + [...d.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const personKeys = new Map();
function avatar(name, cls = "") {
  const key = personKeys.get(name);
  if (key === undefined) { personKeys.set(name, null); personKey(name).then((k) => { personKeys.set(name, k); if (S.photos[k]) render(); }); }
  const photo = key && S.photos[key];
  const palette = ["#0a84ff", "#30b0c7", "#5856d6", "#ff9500", "#ff2d55", "#34c759", "#af52de", "#a2845e"];
  let n = 0; for (const ch of name.toLowerCase()) n = (n * 31 + ch.codePointAt(0)) & 0xffff;
  const tint = palette[n % 8];
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return photo
    ? `<span class="av ${cls}"><img src="${photo}" alt=""></span>`
    : `<span class="av ${cls}" style="color:${tint};background:color-mix(in srgb, ${tint} 16%, transparent)" aria-hidden="true">${esc(initials)}</span>`;
}

// ---------- billing (paid organizations; others are free) ----------

const billing = () => (S.org && S.org.plan ? { plan: S.org.plan, limit: S.org.officeLimit ?? null, status: S.org.billingStatus || "active" } : null);
const planName = (p) => ({ starter: "Starter", growth: "Growth", enterprise: "Enterprise" }[p] || p);
const isActive = (b) => !b || ["trialing", "active", "past_due", "incomplete"].includes(b.status);

// ---------- master code (same PBKDF2 as the app) ----------

async function masterMatches(code) {
  if (!S.org.masterHash || !S.org.masterSalt) return true;
  const salt = Uint8Array.from(atob(S.org.masterSalt), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim()), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256));
  let s = ""; bits.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s) === S.org.masterHash;
}
function askMaster(title, message, then) {
  openSheet(title, `
    <p class="foot" style="margin-top:0">${esc(message)}</p>
    <input class="field" id="mc" type="password" autocomplete="off" placeholder="Master code" style="margin-top:12px">
    <p class="err" id="mc-err" hidden>That's not the master code.</p>
    <button class="primary" id="mc-go">Continue</button>`, () => {
    const go = sheet.querySelector("#mc-go"), input = sheet.querySelector("#mc");
    input.focus();
    const run = async () => {
      go.disabled = true;
      if (await masterMatches(input.value)) { closeSheet(); then(); }
      else { sheet.querySelector("#mc-err").hidden = false; go.disabled = false; }
    };
    go.onclick = run; input.onkeydown = (e) => { if (e.key === "Enter") run(); };
  });
}

// ---------- sync ----------

async function refresh() {
  if (!S.store) return;
  try {
    const { state, version } = await getState(S.code);
    if (version !== S.version || !S.loaded) {
      S.version = version; S.loaded = true;
      S.store.adopt(state);
      if (S.store.pending.length) return push();
      render();
    }
  } catch { /* offline: try again next tick */ }
}
async function refreshOrg() {
  try {
    const org = await getOrg(S.code);
    if (!org) { toast(`${S.org.name} was deleted.`); return signOut(); }
    const changed = JSON.stringify(org) !== JSON.stringify(S.org);
    S.org = org; if (changed) render();
    S.photos = await getPhotos(S.code).catch(() => S.photos); render();
  } catch {}
}
// Sends this page's changes: read the latest, merge them on top, write if
// nobody else wrote in between (otherwise read again and retry).
async function push() {
  if (S.pushing) { S.pushAgain = true; return; }
  S.pushing = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { state, version } = await getState(S.code);
      S.store.adopt(state);
      const sent = S.store.pending.length;
      if (!sent) break;
      if (await putState(S.code, S.store.snapshot(), version)) {
        S.store.pending.splice(0, sent); S.version = null;
        if (!S.store.pending.length && !S.pushAgain) break;
        S.pushAgain = false;
      }
    }
    if (S.store.pending.length) toast("Couldn't save yet. Retrying…");
  } catch (e) { toast(e.message); }
  finally { S.pushing = false; render(); if (S.store.pending.length) setTimeout(push, 4000); }
}

// ---------- sign in ----------

function showGate(error = "") {
  stopTimers();
  root.innerHTML = `
  <div class="gate"><form class="gate-in" id="gate">
    <img src="../logo.png" alt="">
    <h1>OfficeSwap</h1>
    <p>Enter your organization's access code</p>
    <input id="code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code" aria-label="Access code">
    <p class="err" id="err" ${error ? "" : "hidden"}>${esc(error)}</p>
    <button class="go" id="go" disabled>Continue</button>
    <p class="fine">New to OfficeSwap? <a href="../start/">Set up your organization</a></p>
    <p class="fine">By continuing, you agree to the <a href="../terms/">Terms of Service</a> and <a href="../privacy/">Privacy Policy</a>.</p>
  </form></div>`;
  const input = root.querySelector("#code"), go = root.querySelector("#go");
  input.focus();
  input.oninput = () => { go.disabled = !input.value.trim(); root.querySelector("#err").hidden = true; };
  root.querySelector("#gate").onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code)) return showGate("Invalid access code");
    go.disabled = true; go.textContent = "Checking…";
    try {
      const org = await getOrg(code);
      if (!org) return showGate("Invalid access code");
      ls.set(SESSION, code);
      open(code, org);
    } catch (x) { showGate(x.message); }
  };
}

async function open(code, org) {
  S.code = code; S.org = org || (await getOrg(code));
  if (!S.org) { ls.set(SESSION, null); return showGate(); }
  S.store = new Store(code, S.org.name, S.org.address || null);
  S.loaded = false; S.version = null; S.tab = "board"; S.weekOffset = 0; S.picked = null;
  S.location = ls.get(locKey(code));
  root.innerHTML = `<div class="paused"><p class="muted">Loading ${esc(S.org.name)}…</p></div>`;
  await refresh();
  render();
  S.photos = await getPhotos(code).catch(() => ({})); render();
  stopTimers();
  S.timer = setInterval(() => { if (!document.hidden) refresh(); }, 8000);
  S.orgTimer = setInterval(() => { if (!document.hidden) refreshOrg(); }, 45000);
  if (!myName()) askName(true);
}
function stopTimers() { clearInterval(S.timer); clearInterval(S.orgTimer); }
function signOut() { stopTimers(); ls.set(SESSION, null); S.store = null; S.code = null; closeSheet(); showGate(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.store) refresh(); });

// ---------- "What's your name?" ----------

function askName(first) {
  openSheet(first ? "Your name" : "Your name", `
    <p style="margin:0 4px 4px;font-weight:600">${first ? `Welcome to ${esc(S.org.name)}. ` : ""}What's your name?</p>
    <p class="foot" style="margin-top:0">Type your name so OfficeSwap can fill it in whenever you request or offer an office. It's shown only to people in ${esc(S.org.name)}.</p>
    <input class="field" id="nm" autocomplete="name" placeholder="Your full name" style="margin-top:14px" value="${esc(myName() || "")}">
    <div class="suggest" id="sg"></div>
    <button class="primary" id="nm-go">${first ? "Continue" : "Save"}</button>
    ${first ? `<button class="link-btn" style="color:var(--muted);width:100%;margin-top:8px" id="nm-skip">Not now</button>` : ""}`, () => {
    const input = sheet.querySelector("#nm"), go = sheet.querySelector("#nm-go"), sg = sheet.querySelector("#sg");
    const clean = () => input.value.split(" ").filter(Boolean).join(" ");
    const upd = () => {
      const t = clean().toLowerCase();
      go.disabled = clean().length < 2;
      const people = t ? S.store.peopleDirectory().filter((p) => p.toLowerCase().includes(t) && p.toLowerCase() !== t).slice(0, 5) : [];
      sg.innerHTML = people.map((p) => `<button type="button">${esc(p)}</button>`).join("");
      sg.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { input.value = people[i]; upd(); }));
    };
    input.oninput = upd; upd(); input.focus();
    const save = () => {
      const n = clean(); if (n.length < 2) return;
      const existing = S.store.peopleDirectory().find((p) => p.toLowerCase() === n.toLowerCase());
      const final = existing || n;
      if (!existing) { S.store.addPerson(final); push(); }
      ls.set(nameKey(S.code), final); closeSheet(); render();
    };
    go.onclick = save; input.onkeydown = (e) => { if (e.key === "Enter") save(); };
    const skip = sheet.querySelector("#nm-skip"); if (skip) skip.onclick = closeSheet;
  });
}

// ---------- sheets ----------

function openSheet(title, body, setup, right) {
  sheet.innerHTML = `<div class="sheet"><div class="sheet-head"><button id="sh-x">${right ? "Cancel" : "Close"}</button><h3>${esc(title)}</h3>${right ? `<button id="sh-r">${esc(right)}</button>` : `<span style="min-width:70px"></span>`}</div><div class="sheet-body">${body}</div></div>`;
  sheet.querySelector("#sh-x").onclick = closeSheet;
  if (!sheet.open) sheet.showModal();
  if (setup) setup();
}
function closeSheet() { if (sheet.open) sheet.close(); }

function calendar(selected, onChange) {
  // the next eight weeks of weekdays, from this Monday
  const start = Days.monday(Days.today()), today = Days.today();
  let html = "", month = "";
  for (let w = 0; w < 8; w++) {
    const days = Days.weekDates(Days.add(start, w * 7));
    const m = days[0].toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (m !== month) {
      if (month) html += "</div>";
      month = m;
      html += `<div class="cal-month">${esc(m)}</div><div class="cal-grid">${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => `<span class="h">${d}</span>`).join("")}`;
    }
    for (const d of days) {
      const past = d < today;
      html += `<button type="button" data-k="${d.getTime()}" ${past ? "disabled" : ""} class="${selected.has(d.getTime()) ? "on" : ""}">${d.getDate()}</button>`;
    }
  }
  html += "</div>";
  return { html, wire(container) {
    container.querySelectorAll(".cal-grid button[data-k]").forEach((b) => (b.onclick = () => {
      const k = Number(b.dataset.k);
      selected.has(k) ? selected.delete(k) : selected.add(k);
      b.classList.toggle("on"); onChange();
    }));
  } };
}

function requestSheet() {
  const locs = S.store.locations();
  let location = locs.includes(S.location) ? S.location : locs[0] ?? null;
  const picks = new Set();
  let name = "";
  const names = () => S.store.requestableNames(locs.length ? location : null);
  const draw = () => {
    const list = names();
    if (!name && myName() && list.includes(myName())) name = myName();
    if (name && !list.includes(name)) name = "";
    const days = [...picks].map((k) => new Date(k)).filter(Days.isWeekday).sort((a, b) => a - b);
    const cal = calendar(picks, () => { const n = picks.size; const btn = sheet.querySelector("#rq-go"); btn.textContent = n ? `Request an office for ${n} ${n === 1 ? "day" : "days"}` : "Pick your days above"; btn.disabled = !name || !n; });
    let step = 1;
    openSheet("Request an Office", `
      <div class="card explain"><span class="ic" style="background:color-mix(in srgb,var(--navy) 14%,transparent)">👤</span><div><b>You need an office</b><div class="small muted">Use this if you need an office for specific days: you don't have one, or you're traveling to another location. If one is free you're assigned right away; otherwise you join the waitlist and get one automatically.</div></div></div>
      ${locs.length > 1 ? `<div class="step">Step ${step++}: Where do you need an office?</div>
        <select class="field" id="rq-loc">${locs.map((l) => `<option ${l === location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <p class="foot">Traveling? Pick the location you're visiting. You can have a request in each location.</p>` : ""}
      <div class="step">Step ${step++}: Who is requesting?</div>
      ${S.store.peopleDirectory().length === 0 ? `<p class="foot">No names yet. Add offices with owners in Settings first.</p>`
        : list.length === 0 ? `<p class="foot">${locs.length > 1 ? `Everyone already has an office or an upcoming request in ${esc(location)}.` : "Everyone already has an upcoming request."}</p>`
        : `<select class="field" id="rq-name"><option value="">Choose a name</option>${list.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`}
      <div class="step">Step ${step++}: Which days do you need an office?</div>
      <div class="card cal" id="rq-cal">${cal.html}</div>
      <p class="foot">Tap each day you'll be in. Weekdays only.</p>
      <button class="primary" id="rq-go" ${!name || !days.length ? "disabled" : ""}>${days.length ? `Request an office for ${days.length} ${days.length === 1 ? "day" : "days"}` : "Pick your days above"}</button>`, () => {
      cal.wire(sheet.querySelector("#rq-cal"));
      const l = sheet.querySelector("#rq-loc"); if (l) l.onchange = () => { location = l.value; draw(); };
      const n = sheet.querySelector("#rq-name"); if (n) n.onchange = () => { name = n.value; sheet.querySelector("#rq-go").disabled = !name || !picks.size; };
      sheet.querySelector("#rq-go").onclick = () => {
        const chosen = [...picks].map((k) => new Date(k)).filter((d) => Days.isWeekday(d) && d >= Days.today()).sort((a, b) => a - b);
        if (!names().includes(name) || !chosen.length) return;
        const id = S.store.addVisit(name, chosen, locs.length ? location : null);
        push();
        showResult(id);
      };
    });
  };
  draw();
}

function showResult(id) {
  const v = S.store.visits.find((x) => x.id === id);
  if (!v) return closeSheet();
  const none = v.seats.size === 0, all = v.seats.size === v.days.length;
  openSheet("", `
    <div class="result"><div class="big">${none ? "⏳" : "✅"}</div>
      <h4>${all ? "You have an office" : none ? "You're on the waitlist" : "Partly assigned"}</h4>
      <p class="muted">${none ? `No office is free${v.location ? ` in ${esc(v.location)}` : ""} on your days yet. As soon as someone gives theirs up, you'll be assigned to it automatically.` : all ? "Here's the office you've been assigned for each day." : "You've been assigned an office for some days and are on the waitlist for the rest."}</p></div>
    <div class="card list">${v.days.map((d) => { const o = S.store.office(v.seats.get(Days.key(d))); return `<div class="row"><span class="grow">${esc(Days.short(d))}</span>${o ? `<b class="ok">${esc(o.name)}</b>` : `<span class="wait">Waitlisted</span>`}</div>`; }).join("")}</div>
    <button class="primary" id="res-done">Done</button>`, () => { sheet.querySelector("#res-done").onclick = () => { closeSheet(); render(); }; });
}

function offerSheet() {
  const owned = S.store.offerableOffices();
  let officeID = (owned.find((o) => o.owner === myName()) || {}).id || "";
  const picks = new Set();
  const cal = calendar(picks, () => upd());
  const upd = () => { const n = picks.size, b = sheet.querySelector("#of-go"); b.textContent = n ? `Offer my office for ${n} ${n === 1 ? "day" : "days"}` : "Pick your days above"; b.disabled = !officeID || !n; };
  openSheet("Offer My Office", `
    <div class="card explain"><span class="ic" style="background:color-mix(in srgb,var(--brass) 14%,transparent)">🔑</span><div><b>You're offering your office</b><div class="small muted">On the days you're away your office opens up, and the first person on the waitlist is placed in it automatically. You keep it every other day.</div></div></div>
    <div class="step">Step 1: Which office are you offering?</div>
    ${owned.length ? `<select class="field" id="of-office"><option value="">Choose your office</option>${owned.map((o) => `<option value="${o.id}" ${o.id === officeID ? "selected" : ""}>${esc(o.name)}${o.owner ? ` (${esc(o.owner)})` : ""}</option>`).join("")}</select>`
      : `<p class="foot">Every office already has an upcoming offer.</p>`}
    <p class="foot">Offices already offered for upcoming days aren't listed. To change your days, cancel your offer in Plans and make a new one.</p>
    <div class="step">Step 2: Which days will you be away?</div>
    <div class="card cal" id="of-cal">${cal.html}</div>
    <div class="step">Step 3: Note for whoever uses it (optional)</div>
    <input class="field" id="of-note" placeholder="e.g. monitor cable is in the top drawer" maxlength="300">
    <button class="primary" id="of-go" disabled>Pick your days above</button>`, () => {
    cal.wire(sheet.querySelector("#of-cal"));
    const sel = sheet.querySelector("#of-office"); if (sel) sel.onchange = () => { officeID = sel.value; upd(); };
    upd();
    sheet.querySelector("#of-go").onclick = () => {
      const days = [...picks].map((k) => new Date(k)).filter((d) => Days.isWeekday(d) && d >= Days.today());
      if (!officeID || !days.length || !S.store.offerableOffices().some((o) => o.id === officeID)) return;
      S.store.addAway(officeID, days, sheet.querySelector("#of-note").value);
      push(); closeSheet(); toast("Your office is offered."); render();
    };
  });
}

function officeListSheet() {
  openSheet("Office list", `
    <p class="foot" style="margin-top:0">One per line: office, person, location, address. Leave the person blank for a guest desk that's always open, like "Hot desk 3,". ${S.org.address ? `Location and address default to ${esc(S.org.address.city)} and ${esc(`${S.org.address.street}, ${S.org.address.city}, ${S.org.address.state} ${S.org.address.zip}`)}.` : ""}</p>
    <textarea class="field" id="ol" spellcheck="false" style="margin-top:10px">${esc(S.store.officeListText())}</textarea>
    <p class="err" id="ol-err" hidden></p>
    <p class="foot">To scan a printed staff list with your camera, use the iPhone app.</p>`, () => {
    const text = sheet.querySelector("#ol"), err = sheet.querySelector("#ol-err");
    sheet.querySelector("#sh-r").onclick = () => {
      const t = text.value, b = billing(), n = officeCount(t);
      if (b && b.limit != null && n > b.limit && n > S.store.offices.length) {
        err.innerHTML = `Your ${esc(planName(b.plan))} plan covers up to ${b.limit} offices, and this list has ${n}. <a href="../account">Change plan</a>`;
        err.hidden = false; return;
      }
      const e = S.store.validateOffices(t); if (e) { err.textContent = e; err.hidden = false; return; }
      const save = () => { S.store.setOffices(t); push(); closeSheet(); toast("Office list saved."); render(); };
      if (S.org.masterHash && S.store.removesSomething(t)) askMaster("Remove offices or people?", "These changes remove an office or a person. Enter the master code to save them.", save);
      else save();
    };
  }, "Save");
}

// ---------- screens ----------

function render() {
  if (!S.store) return;
  const b = billing();
  const wait = S.store.waitlist().length;
  const tabs = [["board", "Board"], ["waitlist", "Waitlist"], ["plans", "Plans"], ["export", "Export"], ["settings", "Settings"]];
  let body;
  if (!isActive(b)) {
    body = `<div class="paused"><div style="font-size:52px">⏸</div><h2 style="margin:0;font:700 24px var(--round)">${esc(S.org.name)} is paused</h2>
      <p class="muted" style="max-width:420px;margin:0">This organization's subscription has ended. Its offices and schedule are kept safe. Whoever set it up can renew to pick up where everyone left off.</p>
      <a class="primary" style="width:auto;padding:14px 28px;text-decoration:none" href="../account">Renew subscription</a>
      <button class="link-btn" style="color:var(--brass)" id="sw">Use a different organization</button></div>`;
  } else body = { board, waitlist: waitlistTab, plans, export: exportTab, settings }[S.tab]();
  root.innerHTML = `
    <header class="top"><div class="top-in">
      <a class="brand" href="../"><img src="../logo.png" alt=""> OfficeSwap</a>
      <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}${k === "waitlist" && wait ? `<span class="badge">${wait}</span>` : ""}</button>`).join("")}</nav>
    </div></header>
    <main class="wrap">${body}</main>`;
  root.querySelectorAll("[data-tab]").forEach((t) => (t.onclick = () => { S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }));
  const sw = root.querySelector("#sw"); if (sw) sw.onclick = signOut;
  wire[S.tab] && isActive(b) && wire[S.tab]();
}

function board() {
  const st = S.store, locs = st.locations();
  if (S.location && !locs.includes(S.location)) S.location = null;
  // Start on the location of this person's own office, else the first one.
  if (!S.location) { const mine = st.offices.find((o) => o.owner && o.owner === myName()); S.location = (mine && mine.location) || locs[0] || null; }
  const week = Days.weekDates(Days.add(Days.baseMonday(), S.weekOffset * 7));
  const day = (S.picked && week.some((d) => d.getTime() === S.picked.getTime())) ? S.picked : (week.find((d) => d >= Days.today()) || week[0]);
  const rows = st.rows(day, S.location);
  const groups = [[0, "Available"], [1, "Visitors"], [2, "In the office"]];
  const waiting = st.visits.filter((v) => v.days.some((d) => d.getTime() === day.getTime()) && !v.seats.has(Days.key(day)) && day >= Days.today())
    .filter((v) => v.location == null || !S.location || v.location === S.location).sort((a, b) => a.created - b.created);
  const orgPhoto = S.photos.org || S.org.photoURL || "img/orgDefault.jpg";
  return `
    <section class="card org"><img class="ph" src="${esc(orgPhoto)}" alt=""><div><h2>${esc(S.org.name)}</h2>
      ${locs.length ? `<select id="loc" aria-label="Location">${locs.map((l) => `<option ${l === S.location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}</div></section>
    <div class="actions">
      <button class="action navy" id="act-req"><span class="ic">👤</span><span><b>Request an Office</b><span>I don't have an office and need one on certain days.</span></span></button>
      <button class="action brass" id="act-off"><span class="ic">🔑</span><span><b>Offer My Office</b><span>I own an office but will be away on certain days.</span></span></button>
    </div>
    <section class="card week">
      <div class="week-head"><b>${week.some((d) => d.getTime() === Days.today().getTime()) ? "This week" : S.weekOffset < 0 ? "Earlier week" : "Coming week"}</b>
        <button id="wk-prev" aria-label="Previous week">‹</button><span class="muted small">${esc(Days.short(week[0]))} – ${esc(Days.short(week[4]))}</span><button id="wk-next" aria-label="Next week">›</button></div>
      <div class="days">${week.map((d) => { const open = st.offices.filter((o) => !S.location || o.location === S.location).some((o) => st.isFree(o, d)); return `<button class="day ${d.getTime() === day.getTime() ? "on" : ""}" data-day="${d.getTime()}"><small>${esc(Days.dow(d))}</small><span class="n">${d.getDate()}</span><i class="${open ? "open" : ""}"></i></button>`; }).join("")}</div>
    </section>
    <div class="section-title" style="font-size:15px;color:var(--muted)">${esc(day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</div>
    ${rows.length ? groups.map(([k, title]) => { const g = rows.filter((r) => r.kind === k); return g.length ? `<div class="section-title">${title} <span class="tag ${["open", "visitor", "in"][k]}">${g.length}</span></div>${g.map(roomRow).join("")}` : ""; }).join("")
      : `<div class="card empty">No offices yet. Add them in Settings.</div>`}
    ${waiting.length ? `<div class="section-title" style="color:var(--orange)">⏳ Waiting for a space</div><div class="card list">${waiting.map((v, i) => `<div class="row"><span class="num">${i + 1}</span>${avatar(v.name, "sm")}<b class="grow">${esc(v.name)}</b></div>`).join("")}</div>` : ""}`;
}
function roomRow(r) {
  const status = [["Available", "open"], ["Visitor", "visitor"], ["In office", "in"]][r.kind];
  const who = r.kind === 0 ? r.subtitle : r.kind === 1 ? `${r.title} · ${r.subtitle}` : `${r.title} is in`;
  return `<div class="card room ${r.kind === 2 ? "in" : ""}"><span class="ph"><img class="o" src="${esc(officePhoto(r.id))}" alt="">${r.kind !== 0 ? avatar(r.title, "sm") : ""}</span>
    <div class="grow"><b>${esc(r.name)}</b><div class="who">${esc(who)}</div><span class="tag ${status[1]}">${status[0]}</span>
    ${r.note && r.kind !== 2 ? `<div class="note">📝 ${esc(r.note)}</div>` : ""}<div class="small muted" style="margin-top:4px">${esc(r.location)}${r.address ? ` · ${esc(r.address)}` : ""}</div></div></div>`;
}

function waitlistTab() {
  const wl = S.store.waitlist();
  return `<div class="section-title">Waitlist</div>${wl.length ? `<div class="card list">${wl.map((v, i) => `<div class="row"><span class="num">${i + 1}</span>${avatar(v.name)}<div class="grow"><b>${esc(v.name)}</b><span class="small muted">Needs ${esc(Days.range(S.store.waiting(v)))}${v.location ? ` in ${esc(v.location)}` : ""}</span></div></div>`).join("")}</div>
    <p class="foot">First come, first served. People here have no office open on the days they need. They get one automatically as soon as someone offers an office on those days.</p>`
    : `<div class="card empty">✅ Nobody's waiting. Every visitor has an office.</div>`}`;
}

function plans() {
  const t = Days.today();
  const visits = S.store.visits.filter((v) => v.days.some((d) => d >= t)).sort((a, b) => a.created - b.created);
  const trips = S.store.away.filter((a) => a.days.some((d) => d >= t)).sort((a, b) => Math.min(...a.days) - Math.min(...b.days));
  return `<div class="section-title">Office requests</div>
    ${visits.length ? `<div class="card list">${visits.map((v) => {
      const seated = v.days.filter((d) => v.seats.has(Days.key(d))), waitd = v.days.filter((d) => !v.seats.has(Days.key(d)) && d >= t);
      const offices = [...new Set(seated.map((d) => S.store.office(v.seats.get(Days.key(d)))?.name).filter(Boolean))];
      return `<div class="row">${avatar(v.name)}<div class="grow"><b>${esc(v.name)}</b><span class="small muted">${esc(Days.range(v.days))}${v.location ? ` · ${esc(v.location)}` : ""}</span>
        ${offices.length ? `<div class="small ok">✓ ${esc(offices.join(", "))}</div>` : ""}${waitd.length ? `<div class="small wait">⏳ Waitlisted, ${esc(Days.range(waitd))}</div>` : ""}</div>
        <button class="link-btn" data-cancel-visit="${v.id}">Cancel</button></div>`; }).join("")}</div>
      <p class="foot">Cancelling frees any office it was using for the next person on the waitlist.</p>`
      : `<div class="card empty">No office requests yet</div>`}
    <div class="section-title">Offices offered</div>
    ${trips.length ? `<div class="card list">${trips.map((a) => { const o = S.store.office(a.officeID); return `<div class="row">${avatar(o ? o.owner : "?")}<div class="grow"><b>${esc(o ? o.owner : "Unknown")}</b><span class="small muted">${esc(o ? o.name : "Office")} open ${esc(Days.range(a.days))}</span></div><button class="link-btn" data-cancel-away="${a.id}">Cancel</button></div>`; }).join("")}</div>`
      : `<div class="card empty">No offices offered yet</div>`}`;
}

function exportTab() {
  return `<div class="section-title">Export</div><div class="card list">
    <button class="setting" id="dl"><span class="grow"><b>Download spreadsheet</b><span class="small muted">Offices with today's status, the waitlist and offered days, as a CSV file for Excel, Numbers or Google Sheets.</span></span><span class="val">⬇︎</span></button></div>`;
}

function settings() {
  const b = billing(), n = myName();
  const jpm = S.code === "JPM";
  return `<div class="section-title">Settings</div>
    <div class="card list">
      <button class="setting" id="st-name"><span class="grow">Your name</span><span class="val">${esc(n || "Not set")}</span></button>
      <button class="setting" id="st-offices"><span class="grow">Edit office list</span><span class="val">${S.store.offices.length}</span></button>
      ${b ? `<a class="setting" href="../account"><span class="grow">${esc(planName(b.plan))} plan${b.status === "trialing" ? " (free trial)" : ""}</span><span class="val">${b.limit != null ? `${S.store.offices.length} of ${b.limit} offices` : `${S.store.offices.length} offices`} ›</span></a>` : ""}
      ${jpm ? "" : `<button class="setting" id="st-reset"><span class="grow">Reset data</span></button>`}
      <button class="setting danger" id="st-switch"><span class="grow">Switch organization</span></button>
    </div>
    <p class="foot">Access code: <b>${esc(S.code)}</b>. Changes here show up on everyone's phones within a few seconds. Photos can be changed in the iPhone app.</p>
    ${jpm ? "" : `<div class="section-title" style="margin-top:34px"></div><div class="card list"><button class="setting danger" id="st-delete"><span class="grow">Delete organization</span></button></div>
    <p class="foot">Permanently deletes ${esc(S.org.name)} for everyone who uses its access code: offices, schedule, waitlist and photos.${S.org.masterHash ? " Needs the master code." : ""}</p>`}`;
}

const wire = {
  board() {
    const loc = root.querySelector("#loc"); if (loc) loc.onchange = () => { S.location = loc.value; ls.set(locKey(S.code), loc.value); render(); };
    root.querySelector("#act-req").onclick = requestSheet;
    root.querySelector("#act-off").onclick = offerSheet;
    root.querySelector("#wk-prev").onclick = () => { S.weekOffset--; S.picked = null; render(); };
    root.querySelector("#wk-next").onclick = () => { S.weekOffset++; S.picked = null; render(); };
    root.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { S.picked = new Date(Number(b.dataset.day)); render(); }));
  },
  plans() {
    root.querySelectorAll("[data-cancel-visit]").forEach((b) => (b.onclick = () => { S.store.cancelVisit(b.dataset.cancelVisit); push(); render(); }));
    root.querySelectorAll("[data-cancel-away]").forEach((b) => (b.onclick = () => { S.store.cancelAway(b.dataset.cancelAway); push(); render(); }));
  },
  export() {
    root.querySelector("#dl").onclick = () => {
      const url = URL.createObjectURL(new Blob([S.store.csv()], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = `OfficeSwap-${S.code}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  },
  settings() {
    root.querySelector("#st-name").onclick = () => askName(false);
    root.querySelector("#st-offices").onclick = officeListSheet;
    root.querySelector("#st-switch").onclick = signOut;
    const reset = root.querySelector("#st-reset");
    if (reset) reset.onclick = () => {
      const run = () => { S.store.resetToEmpty(); push(); toast("Data reset."); render(); };
      if (S.org.masterHash) askMaster("Reset data?", "This clears the office list, schedule and waitlist for everyone. Enter the master code to continue.", run);
      else confirmSheet("Reset data?", "This clears the office list, schedule and waitlist for everyone.", "Reset", run);
    };
    const del = root.querySelector("#st-delete");
    if (del) del.onclick = () => {
      const run = async () => { try { stopTimers(); await deleteOrg(S.code); ls.set(nameKey(S.code), null); toast(`${S.org.name} was deleted.`); signOut(); } catch (e) { toast(e.message); } };
      if (S.org.masterHash) askMaster(`Delete ${S.org.name}?`, "This permanently deletes the organization for everyone. Enter the master code to continue.", run);
      else confirmSheet(`Delete ${S.org.name}?`, "This permanently deletes the organization for everyone who uses its access code. It can't be undone.", "Delete", run);
    };
  },
};

function confirmSheet(title, message, action, run) {
  openSheet(title, `<p class="foot" style="margin-top:0;font-size:15px">${esc(message)}</p><button class="primary" id="cf-go" style="background:var(--red)">${esc(action)}</button>`, () => {
    sheet.querySelector("#cf-go").onclick = () => { closeSheet(); run(); };
  });
  return false;
}

// ---------- start ----------

const saved = ls.get(SESSION);
if (saved) open(saved).catch(() => showGate()); else showGate();
