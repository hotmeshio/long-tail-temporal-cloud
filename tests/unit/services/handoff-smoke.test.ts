import { ApiRequestError } from '../../../src/lib/api-request';
import { BOT, CARRIER_STATUS, ROLE } from '../../../src/modules/constants';
import { SMOKE_BOT, SMOKE_OUTCOME, runHandoffSmoke } from '../../../src/services/handoff-smoke';
import { stubFetch, type StubbedCall } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';
const ADMIN = { username: 'superadmin', password: 'pw' };
const FAST = { orderId: 'S-1', timeoutMs: 200, pollMs: 1 };
const RESULT_PATH = 'GET /api/workflows/order-S-1/result';
const ROW_PATH = 'GET /api/escalations/by-workflow/order-S-1';
const INVOKE_PATH = 'POST /api/workflows/eyeglassOrderRequest/invoke';

const shipped = { state: 'completed', result: { data: { orderId: 'S-1', status: 'shipped' } } };
const production = { id: 'e1', status: 'pending', role: ROLE.PRODUCTION };
const pickup = { id: 'e2', status: 'pending', role: ROLE.CARRIER_PICKUP };

function routes(overrides: Parameters<typeof stubFetch>[0] = {}) {
  return {
    'POST /api/auth/login': { body: { token: 'jwt' } },
    'GET /api/bot-accounts': { body: [{ id: 'bot-1', external_id: BOT.SMOKE }] },
    'POST /api/bot-accounts/bot-1/roles': { status: 201, body: {} },
    'POST /api/bot-accounts/bot-1/api-keys': { body: { id: 'k1', rawKey: 'lt_bot_smoke' } },
    'GET /api/bot-accounts/bot-1/api-keys': { body: [{ id: 'k1' }] },
    [INVOKE_PATH]: { body: { workflowId: 'order-S-1' } },
    [ROW_PATH]: [{ body: { escalations: [production] } }, { body: { escalations: [{ ...production, status: 'resolved' }, pickup] } }],
    'POST /api/escalations/resolve-by-signal-key': { body: {} },
    [RESULT_PATH]: { body: shipped },
    ...overrides,
  };
}
const resolves = (calls: StubbedCall[]) => calls.filter((c) => c.url.endsWith('/resolve-by-signal-key'));

afterEach(() => vi.unstubAllGlobals());

describe('runHandoffSmoke', () => {
  it('runs an order to shipped and returns the result', async () => {
    const { calls } = stubFetch(routes());
    expect(await runHandoffSmoke(URL_BASE, ADMIN, FAST)).toEqual(shipped.result.data);
    const invoke = calls.find((c) => c.url.endsWith('/invoke'));
    expect(invoke?.body).toMatchObject({ workflowId: 'order-S-1', data: { orderId: 'S-1' } });
  });

  it('reports production by the order key with the bot key', async () => {
    const { calls } = stubFetch(routes());
    await runHandoffSmoke(URL_BASE, ADMIN, FAST);
    const [reported] = resolves(calls);
    expect(reported.authorization).toBe('Bearer lt_bot_smoke');
    expect(reported.body).toEqual({ signalKey: 'production-S-1', resolverPayload: SMOKE_OUTCOME });
  });

  it('scans the pickup after production', async () => {
    const { calls } = stubFetch(routes());
    await runHandoffSmoke(URL_BASE, ADMIN, FAST);
    expect(resolves(calls)).toHaveLength(2);
    expect(resolves(calls)[1].body).toMatchObject({ signalKey: 'carrier-pickup-S-1', resolverPayload: { carrierStatus: CARRIER_STATUS.PICKED_UP } });
  });

  it('holds the roles of both rows it closes', () => {
    expect(SMOKE_BOT.roles.map((r) => r.role)).toEqual([ROLE.PRODUCTION, ROLE.CARRIER_PICKUP]);
    expect(SMOKE_OUTCOME.completed).toBe(true);
  });

  it('waits for each row and for the result', async () => {
    const { calls } = stubFetch(routes({
      [ROW_PATH]: [{ body: { escalations: [] } }, { body: { escalations: [production] } }, { body: { escalations: [pickup] } }],
      [RESULT_PATH]: [{ body: { state: 'running' } }, { body: shipped }],
    }));
    await runHandoffSmoke(URL_BASE, ADMIN, FAST);
    expect(calls.filter((c) => c.url.includes('/by-workflow/'))).toHaveLength(3);
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
    await expect(runHandoffSmoke(URL_BASE, ADMIN, FAST)).rejects.toThrow('order S-1 ended as rejected, expected shipped');
  });

  it('times out when the order never reaches the production queue', async () => {
    const { calls } = stubFetch(routes({ [ROW_PATH]: { body: { escalations: [] } } }));
    await expect(runHandoffSmoke(URL_BASE, ADMIN, { ...FAST, timeoutMs: 10 })).rejects.toThrow(/timed out after 10ms.*production queue/);
    expect(resolves(calls)).toHaveLength(0);
  });

  it('surfaces a failed invoke as a typed error and resolves nothing', async () => {
    const { calls } = stubFetch(routes({ [INVOKE_PATH]: { status: 403, body: { error: 'forbidden' } } }));
    const err = await runHandoffSmoke(URL_BASE, ADMIN, FAST).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(403);
    expect(resolves(calls)).toHaveLength(0);
  });
});
