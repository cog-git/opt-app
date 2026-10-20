/** Environment-derived server configuration. */
export interface AppConfig {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRememberExpiresIn: string;
  corsOrigin: string;
  databaseUrl: string;
}

const DEV_JWT_SECRET = 'change-me-in-production';

export function loadConfig(): AppConfig {
  const jwtSecret = process.env.JWT_SECRET ?? DEV_JWT_SECRET;

  // A forgeable default secret in production means anyone can mint tokens for
  // any tenant/role. Refuse to boot rather than run wide open.
  if (process.env.NODE_ENV === 'production' && jwtSecret === DEV_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET must be set to a strong secret in production (the default is forgeable).',
    );
  }

  return {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    // "Keep me signed in" tokens live much longer so the operator isn't bounced
    // back to the login screen after a normal 12h token would have lapsed.
    jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN ?? '30d',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://opt:opt@localhost:5432/opt',
  };
}
