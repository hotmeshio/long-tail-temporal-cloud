const { conditional, acts } = vi.hoisted(() => ({
  conditional: vi.fn(),
  acts: {
    stageOrderFiles: vi.fn(), parsePrescription: vi.fn(), savePrescription: vi.fn(), findLensBlank: vi.fn(), bookCarrier: vi.fn(),
  },
}));
vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => acts, workflowInfo: () => ({ workflowId: 'order-A-1' }) }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional }));

import { ASSET, CARRIER_STATUS, ORDER_DEFAULTS, ORDER_STATUS, REVIEW_DECISION, ROLE, WAIT_TIMEOUT } from '../../../src/modules/constants';
import { CLEAR_PARSE, PARSE_BY_ORDER, SAMPLE_ORDER_ID, SAMPLE_PRESCRIPTION } from '../../../src/modules/order-fixtures';
import { eyeglassOrder, eyeglassOrderRequest } from '../../../src/workflows/eyeglass-order';

const file = (path: string) => ({ path, sha256: 'a'.repeat(64), size: 10 });
const OUTCOME = { completed: true, site: 'site-1' };
const SCAN = { carrierStatus: CARRIER_STATUS.PICKED_UP, scannedAt: '2026-01-01T00:00:00Z' };
const waitsIn = () => conditional.mock.calls.map((call) => call[1].role);

beforeEach(() => {
  conditional.mockReset();
  for (const act of Object.values(acts)) act.mockReset();
  acts.stageOrderFiles.mockResolvedValue({ prescription: file('orders/A-1/prescription.pdf'), frame: file('orders/A-1/round-48.gcode.3mf') });
  acts.parsePrescription.mockResolvedValue(CLEAR_PARSE);
  acts.savePrescription.mockResolvedValue(file('orders/A-1/prescription.json'));
  acts.findLensBlank.mockResolvedValue({ lotNumber: 'LOT-4417' });
  acts.bookCarrier.mockResolvedValue({ orderId: 'A-1', carrier: 'Acme Freight', bookingRef: 'BK-1' });
});

describe('eyeglassOrder', () => {
  it('ships a clearly read order after production and the pickup scan', async () => {
    conditional.mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    expect(await eyeglassOrder({ orderId: 'A-1' })).toEqual({ orderId: 'A-1', status: ORDER_STATUS.SHIPPED });
    expect(waitsIn()).toEqual([ROLE.PRODUCTION, ROLE.CARRIER_PICKUP]);
    expect(acts.savePrescription).toHaveBeenCalledWith({ orderId: 'A-1', prescription: CLEAR_PARSE.values, reviewedBy: undefined });
  });

  it('advertises production under the order key with the files a site reads', async () => {
    conditional.mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    await eyeglassOrder({ orderId: 'A-1' });
    const [key, wait] = conditional.mock.calls[0];
    expect(key).toBe('production-A-1');
    expect(wait).toMatchObject({ signalKey: 'production-A-1', timeout: WAIT_TIMEOUT.PRODUCTION, metadata: { orderId: 'A-1', lotNumber: 'LOT-4417' } });
    expect(wait.data).toMatchObject({
      orderId: 'A-1', frameStyle: ORDER_DEFAULTS.FRAME_STYLE, lotNumber: 'LOT-4417', signalKey: 'production-A-1', prescription: CLEAR_PARSE.values,
    });
    expect(wait.data.assets.map((a: { as: string }) => a.as)).toEqual([ASSET.FRAME, ASSET.PRESCRIPTION]);
    expect(wait.files.map((f: { as: string; path: string }) => [f.as, f.path])).toEqual([
      [ASSET.FRAME, 'orders/A-1/round-48.gcode.3mf'], [ASSET.PRESCRIPTION, 'orders/A-1/prescription.json'],
    ]);
  });

  it('passes the caller\'s choices and deadline through', async () => {
    conditional.mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    await eyeglassOrder({ orderId: 'A-1', frameStyle: 'aviator-52', lensMaterial: 'high-index', carrier: 'Other', timeout: '3s' });
    expect(acts.stageOrderFiles).toHaveBeenCalledWith({ orderId: 'A-1', frameStyle: 'aviator-52' });
    expect(acts.findLensBlank).toHaveBeenCalledWith({ orderId: 'A-1', lensMaterial: 'high-index', coating: ORDER_DEFAULTS.COATING });
    expect(conditional.mock.calls[0][1].timeout).toBe('3s');
    expect(acts.bookCarrier).toHaveBeenCalledWith({ orderId: 'A-1', carrier: 'Other' });
  });

  it('sends a low-confidence read to review and saves what the reviewer confirmed', async () => {
    acts.parsePrescription.mockResolvedValue(PARSE_BY_ORDER[SAMPLE_ORDER_ID]);
    const corrected = { ...SAMPLE_PRESCRIPTION, pd: 64 };
    conditional
      .mockResolvedValueOnce({ decision: REVIEW_DECISION.APPROVE, ...corrected, $resolution: { escalationId: 'e1', resolvedBy: 'user-9' } })
      .mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    expect((await eyeglassOrder({ orderId: 'A-1' })).status).toBe(ORDER_STATUS.SHIPPED);
    expect(waitsIn()).toEqual([ROLE.PRESCRIPTION_REVIEW, ROLE.PRODUCTION, ROLE.CARRIER_PICKUP]);
    expect(acts.savePrescription).toHaveBeenCalledWith({ orderId: 'A-1', prescription: corrected, reviewedBy: 'user-9' });
  });

  it('ends without production when review does not confirm', async () => {
    acts.parsePrescription.mockResolvedValue(PARSE_BY_ORDER[SAMPLE_ORDER_ID]);
    conditional.mockResolvedValueOnce(false);
    expect(await eyeglassOrder({ orderId: 'A-1' })).toEqual({ orderId: 'A-1', status: ORDER_STATUS.EXPIRED });
    expect(acts.savePrescription).not.toHaveBeenCalled();
  });

  it('asks the order desk for a lot when stock has none', async () => {
    acts.findLensBlank.mockResolvedValue(null);
    conditional.mockResolvedValueOnce({ lotNumber: 'LOT-9' }).mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    await eyeglassOrder({ orderId: 'A-1' });
    expect(conditional.mock.calls[0][0]).toBe('blank-A-1');
    expect(waitsIn()).toEqual([ROLE.ORDER_DESK, ROLE.PRODUCTION, ROLE.CARRIER_PICKUP]);
    expect(conditional.mock.calls[1][1].data.lotNumber).toBe('LOT-9');
  });

  it.each([[false], [null]])('holds the order when the order desk answers %s', async (answer) => {
    acts.findLensBlank.mockResolvedValue(null);
    conditional.mockResolvedValueOnce(answer);
    expect((await eyeglassOrder({ orderId: 'A-1' })).status).toBe(ORDER_STATUS.HELD);
    expect(conditional).toHaveBeenCalledTimes(1);
  });

  it.each([
    [false, ORDER_STATUS.EXPIRED], [null, ORDER_STATUS.CANCELLED], [{ completed: false, site: 'site-1' }, ORDER_STATUS.REJECTED],
  ])('ends as the production answer %j says', async (answer, status) => {
    conditional.mockResolvedValueOnce(answer);
    expect((await eyeglassOrder({ orderId: 'A-1' })).status).toBe(status);
    expect(acts.bookCarrier).not.toHaveBeenCalled();
  });

  it('fails when an activity fails', async () => {
    acts.stageOrderFiles.mockRejectedValue(new Error('storage is down'));
    await expect(eyeglassOrder({ orderId: 'A-1' })).rejects.toThrow('storage is down');
  });
});

describe('eyeglassOrderRequest', () => {
  it('runs the order from the envelope and wraps the result', async () => {
    conditional.mockResolvedValueOnce(OUTCOME).mockResolvedValueOnce(SCAN);
    expect(await eyeglassOrderRequest({ data: { orderId: 'A-1' } } as never)).toEqual({ data: { orderId: 'A-1', status: ORDER_STATUS.SHIPPED } });
  });
});
