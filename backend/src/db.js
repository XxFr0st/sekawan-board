const { Pool } = require('pg');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7) NOT NULL DEFAULT '#2F54EB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       VARCHAR(20) NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'in_progress', 'done')),
  priority     VARCHAR(10) NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks (user_id, due_date);
`;

function createPool(connectionString = config.databaseUrl) {
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Saat container dijalankan bersamaan, database mungkin belum siap menerima
// koneksi. Backend mencoba ulang alih-alih langsung crash.
async function waitForDb(pool, retries = config.dbConnectRetries, delayMs = config.dbConnectDelayMs) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[db] belum siap (percobaan ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) throw err;
      await sleep(delayMs);
    }
  }
}

async function migrate(pool) {
  await pool.query(SCHEMA);
}

module.exports = { createPool, waitForDb, migrate };
