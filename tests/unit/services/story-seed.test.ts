import { BOT, ROLE } from '../../../src/modules/constants';
import { STORY_ORDER_IDS } from '../../../src/modules/order-fixtures';
import { SMOKE_OUTCOME } from '../../../src/services/handoff-smoke';
import { seedStory } from '../../../src/services/story-seed';
import { stubFetch, type StubbedCall } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';
const ADMIN = { username: 'superadmin', password: 'pw' };
const FAST = { timeoutMs: 200, pollMs: 1 };
const PARKS_IN: Record<string, string> = {
  'A-1042': ROLE.PRESCRIPTION_REVIEW, 'A-1043': ROLE.PRODUCTION, 'A-1044': ROLE.ORDER_DESK, 'A-1045': ROLE.PRODUCTION,
};
const pending = (role: string) => ({ id: `e-${role}`, status: 'pending', role });
const orderOf = (call: StubbedCall) => call.url.split('/order-')[1];

/** A stack where an order has rows only once it is started, and production moves on once reported. */
function stack(existing: string[] = []) {
  const there = new Set(existing);
  const reported = new Set<string>();
  return stubFetch({
    'POST /api/auth/login': { body: { token: 'jwt' } },
    'POST /api/workflows/eyeglassOrderRequest/invoke': (call) => {
      there.add((call.body as { data: { orderId: string } }).data.orderId);
      return { body: {} };
    },
    ...Object.fromEntries(STORY_ORDER_IDS.map((id) => [`GET /api/escalations/by-workflow/order-${id}`, (call: StubbedCall) => {
      const orderId = orderOf(call);
      if (!there.has(orderId)) return { body: { escalations: [] } };
      if (reported.has(orderId)) return { body: { escalations: [{ ...pending(ROLE.PRODUCTION), status: 'resolved' }, pending(ROLE.CARRIER_PICKUP)] } };
      return { body: { escalations: [pending(PARKS_IN[orderId])] } };
    }])),
    'GET /api/bot-accounts': { body: [{ id: 'bot-1', external_id: BOT.SMOKE }] },
    'POST /api/bot-accounts/bot-1/roles': { status: 201, body: {} },
    'POST /api/bot-accounts/bot-1/api-keys': { body: { id: 'k1', rawKey: 'lt_bot_smoke' } },
    'GET /api/bot-accounts/bot-1/api-keys': { body: [{ id: 'k1' }] },
    'POST /api/escalations/resolve-by-signal-key': (call) => {
      reported.add((call.body as { signalKey: string }).signalKey.replace('production-', ''));
      return { body: {} };
    },
  });
}
const invokes = (calls: StubbedCall[]) => calls.filter((c) => c.url.endsWith('/invoke'));

afterEach(() => vi.unstubAllGlobals());

describe('seedStory', () => {
  it('starts the four story orders and reports where each waits', async () => {
    const { calls } = stack();
    expect(await seedStory(URL_BASE, ADMIN, FAST)).toEqual(STORY_ORDER_IDS.map((orderId) => ({ orderId, started: true, waitingIn: PARKS_IN[orderId] })));
    expect(invokes(calls).map((c) => c.body)).toEqual(STORY_ORDER_IDS.map((orderId) => ({ workflowId: `order-${orderId}`, data: { orderId } })));
  });

  it('starts nothing on a second run', async () => {
    const { calls } = stack([...STORY_ORDER_IDS]);
    const story = await seedStory(URL_BASE, ADMIN, FAST);
    expect(invokes(calls)).toHaveLength(0);
    expect(story.every((order) => !order.started)).toBe(true);
  });

  it('starts only the orders that are not there yet', async () => {
    const { calls } = stack(['A-1042', 'A-1043']);
    const story = await seedStory(URL_BASE, ADMIN, FAST);
    expect(invokes(calls)).toHaveLength(2);
    expect(story.filter((order) => order.started).map((order) => order.orderId)).toEqual(['A-1044', 'A-1045']);
  });

  it('reports production for a named order, which then waits for the carrier', async () => {
    const { calls } = stack();
    const story = await seedStory(URL_BASE, ADMIN, { ...FAST, reportProduction: ['A-1045'] });
    expect(story.find((order) => order.orderId === 'A-1045')?.waitingIn).toBe(ROLE.CARRIER_PICKUP);
    expect(story.find((order) => order.orderId === 'A-1043')?.waitingIn).toBe(ROLE.PRODUCTION);
    const resolve = calls.find((c) => c.url.endsWith('/resolve-by-signal-key'));
    expect(resolve).toMatchObject({ authorization: 'Bearer lt_bot_smoke', body: { signalKey: 'production-A-1045', resolverPayload: SMOKE_OUTCOME } });
  });

  it('leaves a named order alone when it waits somewhere other than production', async () => {
    const { calls } = stack();
    await seedStory(URL_BASE, ADMIN, { ...FAST, reportProduction: ['A-1042'] });
    expect(calls.some((c) => c.url.endsWith('/resolve-by-signal-key'))).toBe(false);
  });

  it('times out when an order never parks', async () => {
    stubFetch({
      'POST /api/auth/login': { body: { token: 'jwt' } },
      'POST /api/workflows/eyeglassOrderRequest/invoke': { body: {} },
      ...Object.fromEntries(STORY_ORDER_IDS.map((id) => [`GET /api/escalations/by-workflow/order-${id}`, { body: { escalations: [] } }])),
    });
    await expect(seedStory(URL_BASE, ADMIN, { timeoutMs: 5, pollMs: 1 })).rejects.toThrow('waiting for order A-1042 to reach a queue');
  });

  it('fails when the admin cannot sign in', async () => {
    stubFetch({ 'POST /api/auth/login': { status: 401, body: { error: 'bad credentials' } } });
    await expect(seedStory(URL_BASE, ADMIN, FAST)).rejects.toMatchObject({ status: 401 });
  });
});
