import { ORDER_STATUS, ROLE, fabricationKey } from '../../src/modules/constants';
import { signInAdmin, signInSite, startOrder, uniqueOrderId, waitFor, workflowResult, type Caller } from '../helpers/compose-stack';

const parsed = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value);

describe('fabrication handoff', () => {
  let admin: Caller;
  let site: Caller;
  let botId: string;

  beforeAll(async () => {
    admin = await signInAdmin();
    ({ api: site, botId } = await signInSite());
  });

  /** Claim until this order's row is among the claimed; earlier runs may have left others. */
  async function claimOrder(orderId: string) {
    const { status, data } = await site('POST', '/api/escalations/claim-by-facets', {
      query: { role: ROLE.FABRICATION, facets: { orderId } }, limit: 1, durationMinutes: 60,
    });
    expect(status).toBe(200);
    return data.claimed as any[];
  }

  it('advertises an order with files and checksums', async () => {
    const orderId = uniqueOrderId();
    const { escalation } = await startOrder(admin, orderId);
    expect(escalation).toMatchObject({ role: ROLE.FABRICATION, metadata: { orderId }, assigned_to: null });
    expect(parsed(escalation.envelope).files.map((f: any) => f.as)).toEqual(['model', 'ticket']);
    const payload = parsed(escalation.escalation_payload);
    expect(payload).toMatchObject({ orderId, product: 'bracket', quantity: 2 });
    expect(payload.assets.every((a: any) => /^[0-9a-f]{64}$/.test(a.sha256) && a.size > 0)).toBe(true);
    await site('POST', '/api/escalations/resolve-by-signal-key', { signalKey: fabricationKey(orderId), resolverPayload: { completed: true } });
  });

  it('lets the site claim once, read signed files, resolve, and finishes the workflow', async () => {
    const orderId = uniqueOrderId();
    const { workflowId, escalation } = await startOrder(admin, orderId);

    const claimed = await claimOrder(orderId);
    expect(claimed.map((row) => row.id)).toEqual([escalation.id]);
    expect(claimed[0].assigned_to).toBe(botId);
    expect(await claimOrder(orderId)).toEqual([]);

    const own = await site('GET', `/api/escalations?assigned_to=${botId}&status=pending`);
    expect(own.data.escalations.map((row: any) => row.id)).toContain(escalation.id);

    const files = await site('GET', `/api/escalations/${escalation.id}/files`);
    expect(files.status).toBe(200);
    for (const file of files.data.files) {
      expect(file.url).toContain(`orders/${orderId}/${file.name}`);
      expect(file.error).toBeUndefined();
    }

    const outcome = { completed: true, units: 2, site: 'site-1' };
    const resolved = await site('POST', '/api/escalations/resolve-by-signal-key', { signalKey: fabricationKey(orderId), resolverPayload: outcome });
    expect(resolved.status).toBe(200);
    expect(await workflowResult(admin, workflowId)).toEqual({ orderId, status: ORDER_STATUS.FABRICATED, outcome });
  });

  it('answers a repeated resolve with 409 and a row resolved by the site', async () => {
    const orderId = uniqueOrderId();
    const { escalation } = await startOrder(admin, orderId);
    const body = { signalKey: fabricationKey(orderId), resolverPayload: { completed: true } };
    expect((await site('POST', '/api/escalations/resolve-by-signal-key', body)).status).toBe(200);
    expect((await site('POST', '/api/escalations/resolve-by-signal-key', body)).status).toBe(409);
    const row = await site('GET', `/api/escalations/${escalation.id}`);
    expect(row.data).toMatchObject({ status: 'resolved', metadata: { resolved_by: botId } });
  });

  it('reports a rejected order', async () => {
    const orderId = uniqueOrderId();
    const { workflowId } = await startOrder(admin, orderId);
    await site('POST', '/api/escalations/resolve-by-signal-key', { signalKey: fabricationKey(orderId), resolverPayload: { completed: false, notes: 'material out' } });
    expect((await workflowResult(admin, workflowId)).status).toBe(ORDER_STATUS.REJECTED);
  });

  it('expires an order no site resolved, and the late resolve gets 409', async () => {
    const orderId = uniqueOrderId();
    const { workflowId, escalation } = await startOrder(admin, orderId, { timeout: '3s' });
    expect(await workflowResult(admin, workflowId)).toEqual({ orderId, status: ORDER_STATUS.EXPIRED });
    const late = await site('POST', '/api/escalations/resolve-by-signal-key', { signalKey: fabricationKey(orderId), resolverPayload: { completed: true } });
    expect([404, 409]).toContain(late.status);
    const row = await waitFor('the expired row', async () => (await site('GET', `/api/escalations/${escalation.id}`)).data);
    expect(row.status).toBe('expired');
  });
});
