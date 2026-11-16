import { ApiRequestError } from '../../../src/lib/api-request';
import { BOT } from '../../../src/modules/constants';
import { runHandoffSmoke } from '../../../src/services/handoff-smoke';
import { stubFetch } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';
const ADMIN = { username: 'superadmin', password: 'pw' };
const FAST = { orderId: 'S-1', timeoutMs: 200, pollMs: 1 };
const RESULT_PATH = 'GET /api/workflows/order-S-1/result';
const ROW_PATH = 'GET /api/escalations/by-workflow/order-S-1';

const fabricated = { state: 'completed', result: { data: { orderId: 'S-1', status: 'fabricated', outcome: { completed: true } } } };

function routes(overrides: Parameters<typeof stubFetch>[0] = {}) {
  return {
    'POST /api/auth/login': { body: { token: 'jwt' } },
    'GET /api/bot-accounts': { body: [{ id: 'bot-1', external_id: BOT.SMOKE }] },
    'POST /api/bot-accounts/bot-1/api-keys': { body: { id: 'k1', rawKey: 'lt_bot_smoke' } },
    'GET /api/bot-accounts/bot-1/api-keys': { body: [{ id: 'k1' }] },
    'POST /api/workflows/fabricationOrderRequest/invoke': { body: { workflowId: 'order-S-1' } },
    [ROW_PATH]: { body: { escalations: [{ id: 'e1', status: 'pending' }] } },
    'POST /api/escalations/resolve-by-signal-key': { body: {} },
    [RESULT_PATH]: { body: fabricated },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('runHandoffSmoke', () => {
  it('starts an order, resolves it and returns the fabricated result', async () => {
    const { calls } = stubFetch(routes());
    expect(await runHandoffSmoke(URL_BASE, ADMIN, FAST)).toEqual(fabricated.result.data);
    const invoke = calls.find((c) => c.url.endsWith('/invoke'));
    expect(invoke?.body).toMatchObject({ workflowId: 'order-S-1', data: { orderId: 'S-1', quantity: 1 } });
  });

  it('resolves by the order signal key with the bot key', async () => {
    const { calls } = stubFetch(routes());
    await runHandoffSmoke(URL_BASE, ADMIN, FAST);
    const resolve = calls.find((c) => c.url.endsWith('/resolve-by-signal-key'));
    expect(resolve?.authorization).toBe('Bearer lt_bot_smoke');
    expect(resolve?.body).toMatchObject({ signalKey: 'fab-S-1', resolverPayload: { completed: true } });
  });

  it('waits for the pending row and for the result', async () => {
    const { calls } = stubFetch(routes({
      [ROW_PATH]: [{ body: { escalations: [] } }, { body: { escalations: [{ id: 'e1', status: 'pending' }] } }],
      [RESULT_PATH]: [{ body: { state: 'running' } }, { body: fabricated }],
    }));
    await runHandoffSmoke(URL_BASE, ADMIN, FAST);
    expect(calls.filter((c) => c.url.includes('/by-workflow/'))).toHaveLength(2);
    expect(calls.filter((c) => c.url.endsWith('/result'))).toHaveLength(2);
  });

  it('generates an order id when none is given', async () => {
    const { calls } = stubFetch(routes());
    await runHandoffSmoke(URL_BASE, ADMIN, { timeoutMs: 20, pollMs: 1 }).catch(() => undefined);
    const invoke = calls.find((c) => c.url.endsWith('/invoke'));
    expect((invoke?.body as { data: { orderId: string } }).data.orderId).toMatch(/^SMOKE-/);
  });

  it('fails when the order ends in another status', async () => {
    stubFetch(routes({ [RESULT_PATH]: { body: { state: 'completed', result: { data: { orderId: 'S-1', status: 'rejected' } } } } }));
    await expect(runHandoffSmoke(URL_BASE, ADMIN, FAST)).rejects.toThrow(/ended as rejected/);
  });

  it('times out when the order never reaches the queue', async () => {
    stubFetch(routes({ [ROW_PATH]: { body: { escalations: [] } } }));
    await expect(runHandoffSmoke(URL_BASE, ADMIN, { ...FAST, timeoutMs: 10 })).rejects.toThrow(/timed out after 10ms/);
  });

  it('surfaces a failed invoke as a typed error and resolves nothing', async () => {
    const { calls } = stubFetch(routes({ 'POST /api/workflows/fabricationOrderRequest/invoke': { status: 403, body: { error: 'forbidden' } } }));
    const err = await runHandoffSmoke(URL_BASE, ADMIN, FAST).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(403);
    expect(calls.some((c) => c.url.endsWith('/resolve-by-signal-key'))).toBe(false);
  });
});
