// The web app's link to OfficeSwap's Firebase project: an anonymous
// sign-in (like the app's) and Firestore's REST API, under the same
// security rules every phone uses.

const PROJECT = "officeswap-uw3il";
// Firebase's web API key identifies the project; it isn't a secret (the
// same key ships inside the iOS app). Access is decided by the rules.
const API_KEY = "AIzaSyBfpw5r8T2dMftpEPbaectPYpSRK_sG2tI";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN_KEY = "officeswap.auth";

let auth = null;

function stored() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; } }
function store(a) { auth = a; try { localStorage.setItem(TOKEN_KEY, JSON.stringify(a)); } catch {} }

async function token() {
  auth = auth || stored();
  if (auth && auth.exp > Date.now() + 60000) return auth.id;
  let res;
  if (auth && auth.refresh) {
    res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refresh }),
    });
    if (res.ok) {
      const d = await res.json();
      store({ id: d.id_token, refresh: d.refresh_token, exp: Date.now() + Number(d.expires_in) * 1000 });
      return auth.id;
    }
  }
  res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error("Couldn't connect. Check your internet connection.");
  const d = await res.json();
  store({ id: d.idToken, refresh: d.refreshToken, exp: Date.now() + Number(d.expiresIn) * 1000 });
  return auth.id;
}

async function call(method, path, body) {
  const res = await fetch(`${DOCS}/${path}`, {
    method, headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Firestore's typed values to plain ones.
function plain(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return v.bytesValue; // base64
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  return null;
}
function fields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = plain(v); return o; }

export async function getOrg(code) {
  const r = await call("GET", `orgs/${code}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error("Couldn't reach OfficeSwap. Try again.");
  return fields(r.data.fields);
}

// The shared schedule and the version it was read at (null: none yet).
export async function getState(code) {
  const r = await call("GET", `orgs/${code}/state/current`);
  if (r.status === 404) return { state: null, version: null };
  if (r.status !== 200) throw new Error("Couldn't load the schedule.");
  const json = r.data.fields && r.data.fields.json && r.data.fields.json.stringValue;
  return { state: json ? JSON.parse(json) : null, version: r.data.updateTime };
}

// Writes the schedule only if nobody else has since `version`; false if
// someone did (read again, merge, and retry).
export async function putState(code, state, version) {
  const name = `projects/${PROJECT}/databases/(default)/documents/orgs/${code}/state/current`;
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: JSON.stringify({ writes: [{
      update: { name, fields: { json: { stringValue: JSON.stringify(state) } } },
      updateMask: { fieldPaths: ["json"] },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: version ? { updateTime: version } : { exists: false },
    }] }),
  });
  if (res.ok) return true;
  const e = await res.json().catch(() => ({}));
  const status = e.error && e.error.status;
  if (status === "FAILED_PRECONDITION" || status === "ABORTED" || status === "ALREADY_EXISTS" || res.status === 409) return false;
  throw new Error(status === "PERMISSION_DENIED" ? "This organization can't be changed right now." : "Couldn't save. Check your connection and try again.");
}

// Photos chosen in the app: key ("org", an office ID, or "person-…") to a data URL.
export async function getPhotos(code) {
  const out = {};
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const r = await call("GET", `orgs/${code}/photos?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    if (r.status !== 200) break;
    for (const d of r.data.documents || []) {
      const key = d.name.split("/").pop();
      const b = d.fields && d.fields.jpeg && d.fields.jpeg.bytesValue;
      if (b) out[key] = `data:image/jpeg;base64,${b}`;
    }
    pageToken = r.data.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

// Deletes the organization for everyone: photos, schedule, then the record.
export async function deleteOrg(code) {
  let pageToken = "";
  do {
    const r = await call("GET", `orgs/${code}/photos?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    for (const d of (r.data && r.data.documents) || []) await call("DELETE", `orgs/${code}/photos/${d.name.split("/").pop()}`);
    pageToken = (r.data && r.data.nextPageToken) || "";
  } while (pageToken);
  await call("DELETE", `orgs/${code}/state/current`);
  const r = await call("DELETE", `orgs/${code}`);
  if (r.status !== 200) throw new Error("Couldn't delete the organization. Try again.");
}
