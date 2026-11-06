const config = require('./config');
const { createPool, waitForDb, migrate } = require('./db');
const { createApp } = require('./app');

async function main() {
  const pool = createPool();
  await waitForDb(pool);
  await migrate(pool);
  console.log('[db] koneksi berhasil dan skema siap');

  const app = createApp(pool);
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Sekawan Board API ${config.appVersion} berjalan di port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown: `docker stop` / `podman stop` mengirim SIGTERM
  const shutdown = (signal) => {
    console.log(`[api] menerima ${signal}, menutup server...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
