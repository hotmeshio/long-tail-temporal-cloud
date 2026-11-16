import { ApiRequestError, requestApi } from '../lib/api-request';

export interface BotSpec {
  name: string;
  description?: string;
  roles: { role: string; type: string }[];
}

export interface AdminLogin {
  username: string;
  password: string;
}

export interface IssuedKey {
  botId: string;
  apiKey: string;
}

export interface IssueOptions {
  /** How long to wait for the API to accept the sign-in. */
  attempts?: number;
  delayMs?: number;
}

interface BotRow { id: string; external_id: string }
interface KeyRow { id: string }

/**
 * Sign in as an admin, find or create the bot, and mint it a key. The bot's
 * earlier keys are revoked, so each bot holds one live key.
 */
export async function issueBotKey(url: string, admin: AdminLogin, bot: BotSpec, options: IssueOptions = {}): Promise<IssuedKey> {
  // 1. Sign in, waiting for the API to come up
  const token = await signIn(url, admin, options.attempts ?? 30, options.delayMs ?? 2000);

  // 2. Find or create the bot
  const listed = await requestApi<BotRow[] | { bots: BotRow[] }>(url, { method: 'GET', path: `/api/bot-accounts?search=${encodeURIComponent(bot.name)}`, token });
  const existing = rowsOf(listed, 'bots').find((row) => row.external_id === bot.name);
  const account = existing ?? await requestApi<BotRow>(url, { method: 'POST', path: '/api/bot-accounts', token, body: bot });

  // 3. Mint the key, then revoke the earlier ones
  const keysPath = `/api/bot-accounts/${account.id}/api-keys`;
  const key = await requestApi<{ id: string; rawKey: string }>(url, { method: 'POST', path: keysPath, token, body: { name: `${bot.name}-${Date.now()}` } });
  const keys = await requestApi<KeyRow[] | { keys: KeyRow[] }>(url, { method: 'GET', path: keysPath, token });
  for (const earlier of rowsOf(keys, 'keys').filter((row) => row.id !== key.id)) {
    await requestApi(url, { method: 'DELETE', path: `${keysPath}/${earlier.id}`, token });
  }
  return { botId: account.id, apiKey: key.rawKey };
}

async function signIn(url: string, admin: AdminLogin, attempts: number, delayMs: number): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { token } = await requestApi<{ token: string }>(url, { method: 'POST', path: '/api/auth/login', body: admin });
      return token;
    } catch (err) {
      const rejected = err instanceof ApiRequestError && err.status !== undefined && err.status < 500;
      if (rejected || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function rowsOf<T, K extends string>(listed: T[] | Record<K, T[]>, key: K): T[] {
  return Array.isArray(listed) ? listed : listed[key];
}
