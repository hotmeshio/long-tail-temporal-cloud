import { bookCarrier } from '../../../src/activities/carrier';
import { BOOKING_REF_FALLBACK, SAMPLE_ORDER_ID } from '../../../src/modules/order-fixtures';

describe('bookCarrier', () => {
  it('books the sample order under its story reference', async () => {
    expect(await bookCarrier({ orderId: SAMPLE_ORDER_ID, carrier: 'Acme Freight' }))
      .toEqual({ orderId: SAMPLE_ORDER_ID, carrier: 'Acme Freight', bookingRef: 'BK-311' });
  });

  it('derives the reference from the digits of any other order id', async () => {
    expect((await bookCarrier({ orderId: 'A-1045', carrier: 'Acme Freight' })).bookingRef).toBe('BK-1045');
  });

  it('gives the same order the same reference each time', async () => {
    const first = await bookCarrier({ orderId: 'T-77', carrier: 'c' });
    expect(await bookCarrier({ orderId: 'T-77', carrier: 'c' })).toEqual(first);
  });

  it('falls back when the order id has no digits', async () => {
    expect((await bookCarrier({ orderId: 'SMOKE', carrier: 'c' })).bookingRef).toBe(BOOKING_REF_FALLBACK);
  });
});
