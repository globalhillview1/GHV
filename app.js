// app.js — shared API + auth helpers for Pages

const TOKEN_KEY = 'token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiPost(op, body = {}, includeToken = true) {
  const payload = { op, ...body };
  if (includeToken) payload.token = getToken();

  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Handle non-2xx simply
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return res.json();
}

export async function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.replace('/login.html');
    return null;
  }
  const r = await apiPost('sessionInfo', {}, true);
  if (!r || !r.ok || !r.info || !r.info.ok) {
    clearToken();
    window.location.replace('/login.html');
    return null;
  }
  return r.info; // { ok: true, user, role }
}

export async function signOut() {
  const token = getToken();
  if (token) await apiPost('logout', { token }, false);
  clearToken();
  window.location.replace('/login.html');
}
