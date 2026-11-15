const { stageAssets, conditional } = vi.hoisted(() => ({ stageAssets: vi.fn(), conditional: vi.fn() }));
vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => ({ stageAssets }) }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional }));

import { ESCALATION_TYPE, ORDER_STATUS, ROLE } from '../../../src/modules/constants';
import { fabricationOrder, fabricationOrderRequest } from '../../../src/workflows/fabrication-order';

const ASSETS = [
  { as: 'model', path: 'orders/A-1/model.gcode', name: 'model.gcode', contentType: 'text/x.gcode', sha256: 'aa', size: 10 },
  { as: 'ticket', path: 'orders/A-1/ticket.json', name: 'ticket.json', contentType: 'application/json', sha256: 'bb', size: 20 },
];

beforeEach(() => {
  stageAssets.mockReset().mockResolvedValue(ASSETS);
  conditional.mockReset();
});

describe('fabricationOrder', () => {
  it('advertises the order to the fabrication role with files, checksums and a signal key', async () => {
    conditional.mockResolvedValue({ completed: true, units: 2 });
    await fabricationOrder({ orderId: 'A-1', product: 'bracket', quantity: 2 });
    expect(stageAssets).toHaveBeenCalledWith({ orderId: 'A-1', product: 'bracket', quantity: 2 });
    const [key, wait] = conditional.mock.calls[0];
    expect(key).toBe('fab-A-1');
    expect(wait).toMatchObject({
      role: ROLE.FABRICATION, type: ESCALATION_TYPE.FABRICATION, signalKey: 'fab-A-1', metadata: { orderId: 'A-1' }, timeout: '7d',
    });
    expect(wait.files).toEqual(ASSETS.map(({ as, path, name, contentType }) => ({ as, path, name, contentType })));
    expect(wait.data.assets).toEqual([{ as: 'model', sha256: 'aa', size: 10 }, { as: 'ticket', sha256: 'bb', size: 20 }]);
    expect(wait.data.signalKey).toBe('fab-A-1');
  });

  it('defaults to one unit and passes a caller deadline through', async () => {
    conditional.mockResolvedValue({ completed: true });
    await fabricationOrder({ orderId: 'A-1', product: 'bracket', timeout: '2h' });
    expect(stageAssets).toHaveBeenCalledWith({ orderId: 'A-1', product: 'bracket', quantity: 1 });
    expect(conditional.mock.calls[0][1].timeout).toBe('2h');
  });

  it('reports a built order with the site outcome', async () => {
    const outcome = { completed: true, units: 2, site: 'site-1' };
    conditional.mockResolvedValue(outcome);
    expect(await fabricationOrder({ orderId: 'A-1', product: 'bracket' })).toEqual({ orderId: 'A-1', status: ORDER_STATUS.FABRICATED, outcome });
  });

  it('reports a rejected order', async () => {
    conditional.mockResolvedValue({ completed: false, notes: 'material out' });
    expect((await fabricationOrder({ orderId: 'A-1', product: 'bracket' })).status).toBe(ORDER_STATUS.REJECTED);
  });

  it('reports an expired wait', async () => {
    conditional.mockResolvedValue(false);
    expect(await fabricationOrder({ orderId: 'A-1', product: 'bracket' })).toEqual({ orderId: 'A-1', status: ORDER_STATUS.EXPIRED });
  });

  it('reports a cancelled wait', async () => {
    conditional.mockResolvedValue(null);
    expect(await fabricationOrder({ orderId: 'A-1', product: 'bracket' })).toEqual({ orderId: 'A-1', status: ORDER_STATUS.CANCELLED });
  });

  it('wraps the result for an invoke from Long Tail', async () => {
    conditional.mockResolvedValue({ completed: true });
    const result = await fabricationOrderRequest({ data: { orderId: 'A-1', product: 'bracket' }, metadata: {} } as never);
    expect(result.data.status).toBe(ORDER_STATUS.FABRICATED);
  });
});
