import { ASSET, CARRIER_STATUS, ORDER_DEFAULTS, ORDER_STATUS, ROLE, pickupKey, productionKey } from '../../src/modules/constants';
import {
  pendingRow, signInAdmin, signInSite, startOrder, uniqueOrderId, waitFor, workflowResult, type Caller,
} from '../helpers/compose-stack';

const RESOLVE = '/api/escalations/resolve-by-signal-key';
const OUTCOME = { completed: true, site: 'site-1', binKey: 'BIN-7', destination: 'dock-2' };
const parsed = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value);

describe('eyeglass order handoff', () => {
  let admin: Caller;
  let site: Caller;
  let botId: string;

  beforeAll(async () => {
    admin = await signInAdmin();
    ({ api: site, botId } = await signInSite());
  });

  const reportProduction = (orderId: string, resolverPayload: Record<string, unknown> = OUTCOME) =>
    site('POST', RESOLVE, { signalKey: productionKey(orderId), resolverPayload });

  async function claimOrder(orderId: string) {
    const { status, data } = await site('POST', '/api/escalations/claim-by-facets', {
      query: { role: ROLE.PRODUCTION, facets: { orderId } }, limit: 1, durationMinutes: 60,
    });
    expect(status).toBe(200);
    return data.claimed as any[];
  }

  it('advertises an order with files and checksums', async () => {
    const orderId = uniqueOrderId();
    const { escalation } = await startOrder(admin, orderId);
    expect(escalation).toMatchObject({ role: ROLE.PRODUCTION, metadata: { orderId }, assigned_to: null });
    expect(parsed(escalation.envelope).files.map((f: any) => f.as)).toEqual([ASSET.FRAME, ASSET.PRESCRIPTION]);
    const payload = parsed(escalation.escalation_payload);
    expect(payload).toMatchObject({ orderId, frameStyle: ORDER_DEFAULTS.FRAME_STYLE, signalKey: productionKey(orderId) });
    expect(payload.assets.every((a: any) => /^[0-9a-f]{64}$/.test(a.sha256) && a.size > 0)).toBe(true);
    await reportProduction(orderId);
  });

  it('lets the site claim once, read signed files and report, then ships on the pickup scan', async () => {
    const orderId = uniqueOrderId();
    const { workflowId, escalation } = await startOrder(admin, orderId);

    const claimed = await claimOrder(orderId);
    expect(claimed.map((row) => row.id)).toEqual([escalation.id]);
    expect(claimed[0].assigned_to).toBe(botId);
    expect(await claimOrder(orderId)).toEqual([]);

    const files = await site('GET', `/api/escalations/${escalation.id}/files`);
    expect(files.status).toBe(200);
    for (const file of files.data.files) {
      expect(file.url).toContain(`orders/${orderId}/${file.name}`);
      expect(file.error).toBeUndefined();
    }

    expect((await reportProduction(orderId)).status).toBe(200);
    const pickup = await pendingRow(admin, workflowId, ROLE.CARRIER_PICKUP);
    expect(pickup.metadata).toMatchObject({ orderId, carrier: ORDER_DEFAULTS.CARRIER });
    const scan = { carrierStatus: CARRIER_STATUS.PICKED_UP, scannedAt: new Date().toISOString() };
    expect((await site('POST', RESOLVE, { signalKey: pickupKey(orderId), resolverPayload: scan })).status).toBe(200);
    expect(await workflowResult(admin, workflowId)).toEqual({ orderId, status: ORDER_STATUS.SHIPPED });
  });

  it('answers a repeated report with 409 and a row resolved by the site', async () => {
    const orderId = uniqueOrderId();
    const { escalation } = await startOrder(admin, orderId);
    expect((await reportProduction(orderId)).status).toBe(200);
    expect((await reportProduction(orderId)).status).toBe(409);
    const row = await site('GET', `/api/escalations/${escalation.id}`);
    expect(row.data).toMatchObject({ status: 'resolved', metadata: { resolved_by: botId } });
  });

  it('reports a rejected order', async () => {
    const orderId = uniqueOrderId();
    const { workflowId } = await startOrder(admin, orderId);
    await reportProduction(orderId, { completed: false, site: 'site-1', notes: 'lens blank cracked' });
    expect((await workflowResult(admin, workflowId)).status).toBe(ORDER_STATUS.REJECTED);
  });

  it('expires an order no site reported, and the late report gets 409', async () => {
    const orderId = uniqueOrderId();
    const { workflowId, escalation } = await startOrder(admin, orderId, { timeout: '3s' });
    expect(await workflowResult(admin, workflowId)).toEqual({ orderId, status: ORDER_STATUS.EXPIRED });
    expect([404, 409]).toContain((await reportProduction(orderId)).status);
    const row = await waitFor('the expired row', async () => (await site('GET', `/api/escalations/${escalation.id}`)).data);
    expect(row.status).toBe('expired');
  });
});
