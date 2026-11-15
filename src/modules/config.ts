import { APP_ROLE, type AppRole } from './constants';

type Env = NodeJS.ProcessEnv;

export function envStr(env: Env, name: string, fallback: string): string {
  return env[name] || fallback;
}

export function envInt(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

export function envRequired(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export interface TemporalConfig {
  address: string;
  namespace: string;
  /** Set for Temporal Cloud; the connection then uses TLS. */
  apiKey?: string;
  uiUrl?: string;
}

export interface AppConfig {
  appRole: AppRole;
  port: number;
  temporal: TemporalConfig;
  /** Where the worker reaches the Long Tail API. */
  ltUrl: string;
  ltApiKey?: string;
  admin: { user: string; password?: string; email?: string };
  jwtSecret?: string;
  database: { connectionString?: string; host: string; port: number; user: string; password: string; database: string };
  nats?: { url: string; wsProxy?: string; token?: string };
}

export function loadConfig(env: Env = process.env): AppConfig {
  const appRole = envStr(env, 'APP_ROLE', APP_ROLE.BOTH) as AppRole;
  if (!Object.values(APP_ROLE).includes(appRole)) {
    throw new Error(`APP_ROLE must be one of ${Object.values(APP_ROLE).join(', ')}, got "${appRole}"`);
  }
  const port = envInt(env, 'PORT', 3000);
  return {
    appRole,
    port,
    temporal: {
      address: envRequired(env, 'TEMPORAL_ADDRESS'),
      namespace: envStr(env, 'TEMPORAL_NAMESPACE', 'default'),
      apiKey: env.TEMPORAL_API_KEY || undefined,
      uiUrl: env.TEMPORAL_UI_URL || undefined,
    },
    ltUrl: envStr(env, 'LT_URL', `http://localhost:${port}`).replace(/\/+$/, ''),
    ltApiKey: env.LT_API_KEY || undefined,
    admin: {
      user: envStr(env, 'LT_ADMIN_USER', 'superadmin'),
      password: env.LT_ADMIN_PASSWORD || undefined,
      email: env.LT_ADMIN_EMAIL || undefined,
    },
    jwtSecret: env.JWT_SECRET || undefined,
    database: {
      connectionString: env.DATABASE_URL || undefined,
      host: envStr(env, 'POSTGRES_HOST', 'localhost'),
      port: envInt(env, 'POSTGRES_PORT', 5432),
      user: envStr(env, 'POSTGRES_USER', 'postgres'),
      password: envStr(env, 'POSTGRES_PASSWORD', 'password'),
      database: envStr(env, 'POSTGRES_DB', 'longtail'),
    },
    nats: env.NATS_URL
      ? { url: env.NATS_URL, wsProxy: env.NATS_WS_TARGET || undefined, token: env.NATS_TOKEN || undefined }
      : undefined,
  };
}

/** The dashboard's link to a run; it fills in only {workflowId}. */
export function consoleUrl(temporal: TemporalConfig): string | undefined {
  if (!temporal.uiUrl) return undefined;
  return `${temporal.uiUrl.replace(/\/+$/, '')}/namespaces/${encodeURIComponent(temporal.namespace)}/workflows/{workflowId}`;
}
