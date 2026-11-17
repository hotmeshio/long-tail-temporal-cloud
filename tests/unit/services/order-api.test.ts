import { ApiRequestError } from '../../../src/lib/api-request';
import { ROLE } from '../../../src/modules/constants';
import {
  awaitOrderResult, awaitPendingWait, listWaits, resolveWait, signInAdmin, startOrder, waitUntil,
} from '../../../src/services/order-api';
import { stubFetch } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';
const FAST = { timeoutMs: 200, pollMs: 1 };
const ROWS = 'GET /api/escalations/by-workflow/order-A-1';
const RESULT = 'GET /api/workflows/order-A-1/result';
const row = (role: string, status = 'pending') => ({ id: `e-${role}`, status, role });

afterEach(() => vi.unstubAllGlobals());

describe('order api', () => {
  it('signs the admin in and returns the token', async () => {
    const { calls } = stubFetch({ 'POST /api/auth/login': { body: { token: 'jwt' } } });
    expect(await signInAdmin(URL_BASE, { username: 'superadmin', password: 'pw' })).toBe('jwt');
    expect(calls[0].body).toEqual({ username: 'superadmin', password: 'pw' });
  });

  it('starts an order under the workflow id its order id names', async () => {
    const { calls } = stubFetch({ 'POST /api/workflows/eyeglassOrderRequest/invoke': { body: {} } });
    expect(await startOrder(URL_BASE, 'jwt', { orderId: 'A-1', timeout: '3s' })).toBe('order-A-1');
    expect(calls[0]).toMatchObject({ authorization: 'Bearer jwt', body: { workflowId: 'order-A-1', data: { orderId: 'A-1', timeout: '3s' } } });
  });

  it('surfaces a refused start as a typed error', async () => {
    stubFetch({ 'POST /api/workflows/eyeglassOrderRequest/invoke': { status: 403, body: { error: 'forbidden' } } });
    const err = await startOrder(URL_BASE, 'jwt', { orderId: 'A-1' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(403);
  });

  it('lists the rows an order has opened', async () => {
    stubFetch({ [ROWS]: [{ body: { escalations: [row(ROLE.PRODUCTION)] } }, { body: {} }] });
    expect(await listWaits(URL_BASE, 'jwt', 'A-1')).toEqual([row(ROLE.PRODUCTION)]);
    expect(await listWaits(URL_BASE, 'jwt', 'A-1')).toEqual([]);
  });

  it('waits for a pending row in the named role', async () => {
    const { calls } = stubFetch({
      [ROWS]: [
        { body: { escalations: [] } },
        { body: { escalations: [row(ROLE.PRODUCTION, 'resolved')] } },
        { body: { escalations: [row(ROLE.PRODUCTION, 'resolved'), row(ROLE.CARRIER_PICKUP)] } },
      ],
    });
    expect(await awaitPendingWait(URL_BASE, 'jwt', 'A-1', FAST, ROLE.CARRIER_PICKUP)).toEqual(row(ROLE.CARRIER_PICKUP));
    expect(calls).toHaveLength(3);
  });

  it('takes any pending row when no role is named', async () => {
    stubFetch({ [ROWS]: { body: { escalations: [row(ROLE.PRESCRIPTION_REVIEW)] } } });
    expect((await awaitPendingWait(URL_BASE, 'jwt', 'A-1', FAST)).role).toBe(ROLE.PRESCRIPTION_REVIEW);
  });

  it('times out naming the order and the queue', async () => {
    stubFetch({ [ROWS]: { body: { escalations: [row(ROLE.PRODUCTION)] } } });
    await expect(awaitPendingWait(URL_BASE, 'jwt', 'A-1', { timeoutMs: 5, pollMs: 1 }, ROLE.CARRIER_PICKUP))
      .rejects.toThrow('timed out after 5ms waiting for order A-1 to reach the carrier-pickup queue');
  });

  it('closes a wait by its signal key as the caller', async () => {
    const { calls } = stubFetch({ 'POST /api/escalations/resolve-by-signal-key': { body: {} } });
    await resolveWait(URL_BASE, 'lt_bot_1', 'production-A-1', { completed: true });
    expect(calls[0]).toMatchObject({ authorization: 'Bearer lt_bot_1', body: { signalKey: 'production-A-1', resolverPayload: { completed: true } } });
  });

  it('surfaces a repeated resolve as a typed error', async () => {
    stubFetch({ 'POST /api/escalations/resolve-by-signal-key': { status: 409, body: { error: 'already resolved' } } });
    await expect(resolveWait(URL_BASE, 't', 'k', {})).rejects.toMatchObject({ status: 409 });
  });

  it('waits for the workflow to complete and returns its result', async () => {
    const done = { orderId: 'A-1', status: 'shipped' };
    stubFetch({ [RESULT]: [{ body: { state: 'running' } }, { body: { state: 'completed', result: { data: done } } }] });
    expect(await awaitOrderResult(URL_BASE, 'jwt', 'A-1', FAST)).toEqual(done);
  });
});

describe('waitUntil', () => {
  it('returns the first value that is read', async () => {
    const read = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(0);
    expect(await waitUntil('a value', FAST, read)).toBe(0);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('throws once the time is up', async () => {
    await expect(waitUntil('nothing', { timeoutMs: 3, pollMs: 1 }, async () => undefined)).rejects.toThrow('timed out after 3ms waiting for nothing');
  });
});
