// Integration test: dijalankan terhadap PostgreSQL sungguhan (service container di CI).
// Gunakan: DATABASE_URL=postgres://... npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createPool, waitForDb, migrate } = require('../src/db');
const { createApp } = require('../src/app');

let pool, server, base;
const email = `tester-${Date.now()}@example.com`;
let token, categoryId, taskId;

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  pool = createPool(process.env.DATABASE_URL);
  await waitForDb(pool, 10, 1000);
  await migrate(pool);
  server = createApp(pool, { rateLimit: { max: 10_000 } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['tester-%@example.com']);
  server.close();
  await pool.end();
});

test('health check melaporkan database aktif', async () => {
  const r = await api('/api/health', { auth: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.database, 'up');
});

test('endpoint terproteksi menolak request tanpa token', async () => {
  const r = await api('/api/tasks', { auth: false });
  assert.equal(r.status, 401);
});

test('register: validasi input ditolak', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST', auth: false,
    body: { name: 'A', email: 'bukan-email', password: '123' },
  });
  assert.equal(r.status, 400);
});

test('register berhasil dan mengembalikan token', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST', auth: false,
    body: { name: 'Penguji Sekawan', email, password: 'rahasia123' },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.email, email);
  assert.equal(r.body.user.password_hash, undefined);
  token = r.body.token;
});

test('register dengan email yang sama ditolak', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST', auth: false,
    body: { name: 'Penguji Dua', email, password: 'rahasia123' },
  });
  assert.equal(r.status, 409);
});

test('login: password salah ditolak, password benar diterima', async () => {
  const bad = await api('/api/auth/login', { method: 'POST', auth: false, body: { email, password: 'salah-salah' } });
  assert.equal(bad.status, 401);
  const ok = await api('/api/auth/login', { method: 'POST', auth: false, body: { email, password: 'rahasia123' } });
  assert.equal(ok.status, 200);
  token = ok.body.token;
  const me = await api('/api/auth/me');
  assert.equal(me.body.user.email, email);
});

test('kategori: pengguna baru mendapat kategori awal, bisa tambah/ubah', async () => {
  const list = await api('/api/categories');
  assert.equal(list.body.data.length, 3);

  const created = await api('/api/categories', { method: 'POST', body: { name: 'DevOps', color: '#722ED1' } });
  assert.equal(created.status, 201);
  categoryId = created.body.data.id;

  const dup = await api('/api/categories', { method: 'POST', body: { name: 'DevOps' } });
  assert.equal(dup.status, 409);

  const upd = await api(`/api/categories/${categoryId}`, { method: 'PUT', body: { name: 'DevOps UTS', color: '#722ED1' } });
  assert.equal(upd.body.data.name, 'DevOps UTS');
});

test('tugas: buat, baca, ubah, dan validasi', async () => {
  const invalid = await api('/api/tasks', { method: 'POST', body: { title: '', priority: 'urgent' } });
  assert.equal(invalid.status, 400);

  const created = await api('/api/tasks', {
    method: 'POST',
    body: { title: 'Menulis Dockerfile', description: 'Multi-stage build', priority: 'high', due_date: '2030-01-15', category_id: categoryId },
  });
  assert.equal(created.status, 201);
  taskId = created.body.data.id;
  assert.equal(created.body.data.status, 'todo');
  assert.equal(created.body.data.due_date, '2030-01-15');
  assert.equal(created.body.data.category_name, 'DevOps UTS');

  const one = await api(`/api/tasks/${taskId}`);
  assert.equal(one.body.data.title, 'Menulis Dockerfile');

  const upd = await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status: 'in_progress' } });
  assert.equal(upd.body.data.status, 'in_progress');
  assert.equal(upd.body.data.completed_at, null);

  const done = await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status: 'done' } });
  assert.ok(done.body.data.completed_at);
});

test('tugas: filter, pencarian, dan paginasi', async () => {
  await api('/api/tasks', { method: 'POST', body: { title: 'Menyiapkan pipeline CI', priority: 'medium', due_date: '2000-01-01' } });
  await api('/api/tasks', { method: 'POST', body: { title: 'Rekam video demo', priority: 'low' } });

  const all = await api('/api/tasks');
  assert.equal(all.body.total, 3);

  const byStatus = await api('/api/tasks?status=done');
  assert.equal(byStatus.body.total, 1);

  const byPriority = await api('/api/tasks?priority=low');
  assert.equal(byPriority.body.data[0].title, 'Rekam video demo');

  const byCategory = await api(`/api/tasks?category_id=${categoryId}`);
  assert.equal(byCategory.body.total, 1);

  const search = await api('/api/tasks?q=pipeline');
  assert.equal(search.body.total, 1);

  const paged = await api('/api/tasks?limit=2&page=2');
  assert.equal(paged.body.data.length, 1);
  assert.equal(paged.body.total, 3);
});

test('statistik dashboard menghitung status, overdue, dan completion rate', async () => {
  const r = await api('/api/stats');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 3);
  assert.equal(r.body.status.done, 1);
  assert.equal(r.body.status.todo, 2);
  assert.equal(r.body.overdue, 1);
  assert.equal(r.body.completion_rate, 33);
  assert.ok(Array.isArray(r.body.by_category));
});

test('data antar pengguna terisolasi', async () => {
  const other = await api('/api/auth/register', {
    method: 'POST', auth: false,
    body: { name: 'Pengguna Lain', email: `tester-lain-${Date.now()}@example.com`, password: 'rahasia123' },
  });
  const saved = token;
  token = other.body.token;
  const list = await api('/api/tasks');
  assert.equal(list.body.total, 0);
  const peek = await api(`/api/tasks/${taskId}`);
  assert.equal(peek.status, 404);
  token = saved;
});

test('hapus tugas dan kategori', async () => {
  const del = await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  const gone = await api(`/api/tasks/${taskId}`);
  assert.equal(gone.status, 404);
  const delCat = await api(`/api/categories/${categoryId}`, { method: 'DELETE' });
  assert.equal(delCat.status, 204);
});

test('endpoint tidak dikenal mengembalikan 404 JSON', async () => {
  const r = await api('/api/tidak-ada', { auth: false });
  assert.equal(r.status, 404);
});
