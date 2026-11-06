const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { signToken, requireAuth } = require('./auth');
const { validateRegister, validateCategory, validateTask } = require('./validate');

// Kolom task yang dikirim ke klien (due_date diformat YYYY-MM-DD agar bebas masalah timezone)
const TASK_SELECT = `
  t.id, t.title, t.description, t.status, t.priority,
  to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
  t.category_id, c.name AS category_name, c.color AS category_color,
  t.created_at, t.updated_at, t.completed_at`;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Pembatas laju sederhana (in-memory) untuk endpoint autentikasi
function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(req.ip, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan, coba lagi sebentar lagi' });
    }
    next();
  };
}

function createApp(pool, options = {}) {
  const app = express();
  const authLimiter = createRateLimiter(options.rateLimit);

  app.set('trust proxy', 1); // aplikasi berjalan di belakang Nginx (frontend container)
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // ---------------------------------------------------------------- Health
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({
        status: 'ok',
        database: 'up',
        version: config.appVersion,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ status: 'error', database: 'down', version: config.appVersion });
    }
  });

  // ------------------------------------------------------------------ Auth
  app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
    const { errors, value } = validateRegister(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [value.email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const hash = await bcrypt.hash(value.password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [value.name, value.email, hash]
    );
    // Beri kategori awal agar pengguna baru tidak melihat layar kosong
    await pool.query(
      `INSERT INTO categories (user_id, name, color) VALUES
        ($1, 'Kuliah', '#2F54EB'), ($1, 'Proyek', '#D4380D'), ($1, 'Pribadi', '#389E0D')`,
      [rows[0].id]
    );
    res.status(201).json({ user: rows[0], token: signToken(rows[0]) });
  }));

  app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Email atau password salah' });
    delete user.password_hash;
    res.json({ user, token: signToken(user) });
  }));

  app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Pengguna tidak ditemukan' });
    res.json({ user: rows[0] });
  }));

  // ------------------------------------------------------------ Categories
  app.get('/api/categories', requireAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.color, COUNT(t.id)::int AS task_count
         FROM categories c LEFT JOIN tasks t ON t.category_id = c.id
        WHERE c.user_id = $1
        GROUP BY c.id ORDER BY c.name`,
      [req.user.id]
    );
    res.json({ data: rows });
  }));

  app.post('/api/categories', requireAuth, wrap(async (req, res) => {
    const { errors, value } = validateCategory(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    try {
      const { rows } = await pool.query(
        'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color',
        [req.user.id, value.name, value.color]
      );
      res.status(201).json({ data: { ...rows[0], task_count: 0 } });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Nama kategori sudah dipakai' });
      throw err;
    }
  }));

  app.put('/api/categories/:id', requireAuth, wrap(async (req, res) => {
    const { errors, value } = validateCategory(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    try {
      const { rows } = await pool.query(
        'UPDATE categories SET name = $1, color = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, color',
        [value.name, value.color, req.params.id, req.user.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
      res.json({ data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Nama kategori sudah dipakai' });
      throw err;
    }
  }));

  app.delete('/api/categories/:id', requireAuth, wrap(async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    res.status(204).end();
  }));

  // ----------------------------------------------------------------- Stats
  app.get('/api/stats', requireAuth, wrap(async (req, res) => {
    const uid = req.user.id;
    const [byStatus, byPriority, byCategory, due, recent] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS n FROM tasks WHERE user_id = $1 GROUP BY status', [uid]),
      pool.query(
        `SELECT priority, COUNT(*)::int AS n FROM tasks
          WHERE user_id = $1 AND status <> 'done' GROUP BY priority`, [uid]),
      pool.query(
        `SELECT c.id, c.name, c.color, COUNT(t.id)::int AS n
           FROM categories c LEFT JOIN tasks t ON t.category_id = c.id
          WHERE c.user_id = $1 GROUP BY c.id ORDER BY n DESC, c.name`, [uid]),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int AS overdue,
           COUNT(*) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status <> 'done')::int AS due_this_week
           FROM tasks WHERE user_id = $1`, [uid]),
      pool.query(
        `SELECT ${TASK_SELECT} FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = $1 AND t.status <> 'done' AND t.due_date IS NOT NULL
          ORDER BY t.due_date ASC LIMIT 5`, [uid]),
    ]);

    const status = { todo: 0, in_progress: 0, done: 0 };
    byStatus.rows.forEach((r) => { status[r.status] = r.n; });
    const priority = { low: 0, medium: 0, high: 0 };
    byPriority.rows.forEach((r) => { priority[r.priority] = r.n; });
    const total = status.todo + status.in_progress + status.done;

    res.json({
      total,
      status,
      priority,
      completion_rate: total ? Math.round((status.done / total) * 100) : 0,
      overdue: due.rows[0].overdue,
      due_this_week: due.rows[0].due_this_week,
      by_category: byCategory.rows,
      upcoming: recent.rows,
    });
  }));

  // ----------------------------------------------------------------- Tasks
  app.get('/api/tasks', requireAuth, wrap(async (req, res) => {
    const { status, priority, category_id, q } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const where = ['t.user_id = $1'];
    const params = [req.user.id];
    // Semua tanda '?' pada satu kondisi merujuk ke parameter yang sama
    const add = (sql, val) => { params.push(val); where.push(sql.replace(/\?/g, `$${params.length}`)); };

    if (status) add('t.status = ?', status);
    if (priority) add('t.priority = ?', priority);
    if (category_id) add('t.category_id = ?', parseInt(category_id, 10) || 0);
    if (q) add('(t.title ILIKE ? OR t.description ILIKE ?)', `%${String(q).trim()}%`);

    const whereSql = where.join(' AND ');
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM tasks t WHERE ${whereSql}`, params);
    const { rows } = await pool.query(
      `SELECT ${TASK_SELECT}
         FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${whereSql}
        ORDER BY (t.due_date IS NULL), t.due_date ASC, t.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params
    );
    res.json({ data: rows, page, limit, total: total.rows[0].n });
  }));

  app.get('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${TASK_SELECT} FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = $1 AND t.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
    res.json({ data: rows[0] });
  }));

  async function categoryBelongsToUser(categoryId, userId) {
    if (categoryId == null) return true;
    const r = await pool.query('SELECT 1 FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
    return r.rowCount > 0;
  }

  async function fetchTask(id, userId) {
    const { rows } = await pool.query(
      `SELECT ${TASK_SELECT} FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = $1 AND t.user_id = $2`, [id, userId]);
    return rows[0];
  }

  app.post('/api/tasks', requireAuth, wrap(async (req, res) => {
    const { errors, value } = validateTask(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    if (!(await categoryBelongsToUser(value.category_id, req.user.id)))
      return res.status(400).json({ error: 'Kategori tidak ditemukan' });

    const status = value.status || 'todo';
    const { rows } = await pool.query(
      `INSERT INTO tasks (user_id, category_id, title, description, status, priority, due_date, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.user.id, value.category_id ?? null, value.title, value.description || '',
       status, value.priority || 'medium', value.due_date ?? null,
       status === 'done' ? new Date() : null]
    );
    res.status(201).json({ data: await fetchTask(rows[0].id, req.user.id) });
  }));

  async function updateTask(req, res) {
    const { errors, value } = validateTask(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    if (!Object.keys(value).length) return res.status(400).json({ error: 'Tidak ada data yang diubah' });
    if ('category_id' in value && !(await categoryBelongsToUser(value.category_id, req.user.id)))
      return res.status(400).json({ error: 'Kategori tidak ditemukan' });

    const sets = [];
    const params = [];
    for (const [key, val] of Object.entries(value)) {
      params.push(val);
      sets.push(`${key} = $${params.length}`);
    }
    if (value.status) sets.push(value.status === 'done' ? 'completed_at = NOW()' : 'completed_at = NULL');
    sets.push('updated_at = NOW()');
    params.push(req.params.id, req.user.id);

    const { rowCount } = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
    res.json({ data: await fetchTask(req.params.id, req.user.id) });
  }
  app.put('/api/tasks/:id', requireAuth, wrap(updateTask));
  app.patch('/api/tasks/:id', requireAuth, wrap(updateTask));

  app.delete('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
      req.params.id, req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
    res.status(204).end();
  }));

  // -------------------------------------------------------- Fallback & error
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
    // id non-numerik pada path menyebabkan error tipe data PostgreSQL
    if (err.code === '22P02') return res.status(400).json({ error: 'Parameter tidak valid' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  });

  return app;
}

module.exports = { createApp };
