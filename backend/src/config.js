// Seluruh konfigurasi dibaca dari environment variable (12-factor app),
// sehingga image container yang sama bisa dipakai di dev, CI, maupun produksi.
const env = process.env;

const config = {
  port: parseInt(env.PORT || '3000', 10),
  nodeEnv: env.NODE_ENV || 'development',
  databaseUrl:
    env.DATABASE_URL || 'postgres://sekawan:sekawan@localhost:5432/sekawan_board',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  appVersion: env.APP_VERSION || 'dev',
  dbConnectRetries: parseInt(env.DB_CONNECT_RETRIES || '30', 10),
  dbConnectDelayMs: parseInt(env.DB_CONNECT_DELAY_MS || '2000', 10),
};

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET wajib diisi di mode production');
}

module.exports = config;
