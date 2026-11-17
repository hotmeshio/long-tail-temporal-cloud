const conditional = vi.hoisted(() => vi.fn());
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional }));

import { CARRIER_STATUS, CHASE_OUTCOME, CHASE_REASON, ORDER_STATUS, ROLE, WAIT_TIMEOUT } from '../../../src/modules/constants';
import { chaseCarrier, shipOrder } from '../../../src/workflows/ship-order';

const BOOKING = { orderId: 'A-1042', carrier: 'Acme Freight', bookingRef: 'BK-311' };
const scan = (carrierStatus: string) => ({ carrierStatus, scannedAt: '2026-01-01T00:00:00Z' });
const REBOOKED = { outcome: CHASE_OUTCOME.REBOOKED, pickupAt: '2026-01-02T00:00:00Z' };
const keys = () => conditional.mock.calls.map((call) => call[0]);

beforeEach(() => { conditional.mockReset(); });

describe('shipOrder', () => {
  it('ships when the carrier scans the pickup', async () => {
    conditional.mockResolvedValueOnce(scan(CARRIER_STATUS.PICKED_UP));
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.SHIPPED);
    const [key, wait] = conditional.mock.calls[0];
    expect(key).toBe('carrier-pickup-A-1042');
    expect(wait).toMatchObject({ role: ROLE.CARRIER_PICKUP, signalKey: key, timeout: WAIT_TIMEOUT.PICKUP, metadata: BOOKING });
  });

  it('ends as refused when the carrier refuses the parcel', async () => {
    conditional.mockResolvedValueOnce({ ...scan(CARRIER_STATUS.REFUSED), refusalNote: 'damaged box' });
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.REFUSED);
  });

  it('ends as cancelled when the pickup is cancelled', async () => {
    conditional.mockResolvedValueOnce(null);
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.CANCELLED);
    expect(conditional).toHaveBeenCalledTimes(1);
  });

  it('chases an overdue pickup and waits again under a new key once rebooked', async () => {
    conditional.mockResolvedValueOnce(false).mockResolvedValueOnce(REBOOKED).mockResolvedValueOnce(scan(CARRIER_STATUS.PICKED_UP));
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.SHIPPED);
    expect(keys()).toEqual(['carrier-pickup-A-1042', 'carrier-chase-A-1042', 'carrier-pickup-A-1042-2']);
  });

  it('ends as cancelled when the shipping desk cancels the shipment', async () => {
    conditional.mockResolvedValueOnce(false).mockResolvedValueOnce({ outcome: CHASE_OUTCOME.CANCELLED });
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.CANCELLED);
  });

  it.each([[false, ORDER_STATUS.EXPIRED], [null, ORDER_STATUS.CANCELLED]])('ends by the chase answer %s', async (answer, status) => {
    conditional.mockResolvedValueOnce(false).mockResolvedValueOnce(answer);
    expect(await shipOrder(BOOKING)).toBe(status);
    expect(conditional).toHaveBeenCalledTimes(2);
  });

  it('ends as expired when the rebooked pickup is overdue too', async () => {
    conditional.mockResolvedValueOnce(false).mockResolvedValueOnce(REBOOKED).mockResolvedValueOnce(false).mockResolvedValueOnce(REBOOKED);
    expect(await shipOrder(BOOKING)).toBe(ORDER_STATUS.EXPIRED);
    expect(conditional).toHaveBeenCalledTimes(4);
  });
});

describe('chaseCarrier', () => {
  it('opens a shipping desk row for the order and returns the answer', async () => {
    conditional.mockResolvedValueOnce(REBOOKED);
    expect(await chaseCarrier('A-1042')).toBe(REBOOKED);
    const [key, wait] = conditional.mock.calls[0];
    expect(key).toBe('carrier-chase-A-1042');
    expect(wait).toMatchObject({ role: ROLE.SHIPPING_DESK, metadata: { orderId: 'A-1042', reason: CHASE_REASON }, timeout: WAIT_TIMEOUT.CHASE });
  });
});
