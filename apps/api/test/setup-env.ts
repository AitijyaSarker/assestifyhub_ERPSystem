process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters';
process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://erp:erp_dev_password@localhost:55432/erp_pos?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
