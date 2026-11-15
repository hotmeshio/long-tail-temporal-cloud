import { ApiRequestError } from '../../../src/lib/api-request';
import { issueBotKey } from '../../../src/services/bot-key';
import { stubFetch } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';
const ADMIN = { username: 'superadmin', password: 'pw' };
const BOT = { name: 'fabrication-site', roles: [{ role: 'fabrication', type: 'member' }] };
const FAST = { attempts: 3, delayMs: 1 };

afterEach(() => vi.unstubAllGlobals());

describe('issueBotKey', () => {
  it('creates the bot when none exists and returns its id and key', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/login': { body: { token: 'jwt' } },
      'GET /api/bot-accounts': { body: { bots: [] } },
      'POST /api/bot-accounts': { status: 201, body: { id: 'bot-1', external_id: BOT.name } },
      'POST /api/bot-accounts/bot-1/api-keys': { status: 201, body: { id: 'k2', rawKey: 'lt_bot_new' } },
      'GET /api/bot-accounts/bot-1/api-keys': { body: [{ id: 'k2' }] },
    });
    expect(await issueBotKey(URL_BASE, ADMIN, BOT, FAST)).toEqual({ botId: 'bot-1', apiKey: 'lt_bot_new' });
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/bot-accounts'))?.body).toEqual(BOT);
    expect(calls.every((c) => c.url.endsWith('/login') || c.authorization === 'Bearer jwt')).toBe(true);
  });

  it('reuses an existing bot and revokes its earlier keys', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/login': { body: { token: 'jwt' } },
      'GET /api/bot-accounts': { body: [{ id: 'bot-9', external_id: BOT.name }, { id: 'bot-8', external_id: 'other' }] },
      'POST /api/bot-accounts/bot-9/api-keys': { body: { id: 'k3', rawKey: 'lt_bot_3' } },
      'GET /api/bot-accounts/bot-9/api-keys': { body: { keys: [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }] } },
      'DELETE /api/bot-accounts/bot-9/api-keys/k1': { body: {} },
      'DELETE /api/bot-accounts/bot-9/api-keys/k2': { body: {} },
    });
    expect(await issueBotKey(URL_BASE, ADMIN, BOT, FAST)).toEqual({ botId: 'bot-9', apiKey: 'lt_bot_3' });
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/bot-accounts'))).toBe(false);
  });

  it('waits for the API to come up before signing in', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/login': [new TypeError('fetch failed'), { status: 503, body: {} }, { body: { token: 'jwt' } }],
      'GET /api/bot-accounts': { body: [{ id: 'bot-1', external_id: BOT.name }] },
      'POST /api/bot-accounts/bot-1/api-keys': { body: { id: 'k1', rawKey: 'lt_bot_1' } },
      'GET /api/bot-accounts/bot-1/api-keys': { body: [{ id: 'k1' }] },
    });
    await issueBotKey(URL_BASE, ADMIN, BOT, FAST);
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(3);
  });

  it('fails at once when the sign-in is rejected', async () => {
    const { calls } = stubFetch({ 'POST /api/auth/login': { status: 401, body: { error: 'bad credentials' } } });
    const err = await issueBotKey(URL_BASE, ADMIN, BOT, FAST).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('gives up after the allowed attempts', async () => {
    const { calls } = stubFetch({ 'POST /api/auth/login': new TypeError('fetch failed') });
    await expect(issueBotKey(URL_BASE, ADMIN, BOT, FAST)).rejects.toBeInstanceOf(ApiRequestError);
    expect(calls).toHaveLength(3);
  });
});
