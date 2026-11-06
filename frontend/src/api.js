const TOKEN_KEY = 'sekawan_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

let unauthorizedHandler = () => {};
export const onUnauthorized = (fn) => { unauthorizedHandler = fn; };

// Pembungkus fetch: menambahkan token, mem-parse JSON, dan melempar Error berisi pesan dari server.
export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* respon bukan JSON */ }
  if (res.status === 401 && token) unauthorizedHandler();
  if (!res.ok) throw new Error(data?.error || `Permintaan gagal (${res.status})`);
  return data;
}

// ---- helper tanggal (tanpa library) ----
export const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function formatDue(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export const STATUS_LABEL = { todo: 'Belum dikerjakan', in_progress: 'Sedang dikerjakan', done: 'Selesai' };
export const PRIORITY_LABEL = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
