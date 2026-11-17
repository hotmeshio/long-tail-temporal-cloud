import { findLensBlank } from '../../../src/activities/stock';
import { ORDER_DEFAULTS } from '../../../src/modules/constants';
import { ORDERS_WITHOUT_BLANK } from '../../../src/modules/order-fixtures';

const defaults = { lensMaterial: ORDER_DEFAULTS.LENS_MATERIAL, coating: ORDER_DEFAULTS.COATING };

describe('findLensBlank', () => {
  it('finds the stocked lot for the default lens', async () => {
    expect(await findLensBlank({ orderId: 'A-1', ...defaults })).toEqual({ lotNumber: 'LOT-4417', ...defaults });
  });

  it('matches on material and coating together', async () => {
    expect((await findLensBlank({ orderId: 'A-1', lensMaterial: 'polycarbonate', coating: 'blue-light' }))?.lotNumber).toBe('LOT-4302');
    expect((await findLensBlank({ orderId: 'A-1', lensMaterial: 'high-index', coating: 'anti-glare' }))?.lotNumber).toBe('LOT-5120');
  });

  it('returns null when nothing in stock matches', async () => {
    expect(await findLensBlank({ orderId: 'A-1', lensMaterial: 'glass', coating: 'anti-glare' })).toBeNull();
  });

  it('returns null for an order no stocked blank covers', async () => {
    expect(await findLensBlank({ orderId: ORDERS_WITHOUT_BLANK[0], ...defaults })).toBeNull();
  });
});
