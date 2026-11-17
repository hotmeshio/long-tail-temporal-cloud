import {
  APP_ROLE, ASSET, BOT, LOG_EVENTS, ORDER_STATUS, ROLE, blankKey, chaseKey, newCopyKey, orderFilePath, pickupKey,
  productionKey, reviewKey, workflowIdFor,
} from '../../../src/modules/constants';

describe('constants', () => {
  it('derives the key a site resolves by from the order id', () => {
    expect(productionKey('A-1042')).toBe('production-A-1042');
  });

  it('derives the pickup key, numbered for a rebooked pickup', () => {
    expect(pickupKey('A-1042')).toBe('carrier-pickup-A-1042');
    expect(pickupKey('A-1042', 2)).toBe('carrier-pickup-A-1042-2');
  });

  it('gives every wait of one order its own key', () => {
    const workflowId = workflowIdFor('A-1');
    const keys = [reviewKey(workflowId), newCopyKey(workflowId), blankKey('A-1'), productionKey('A-1'), pickupKey('A-1'), pickupKey('A-1', 2), chaseKey('A-1')];
    expect(workflowId).toBe('order-A-1');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps an order\'s files under one prefix', () => {
    expect(orderFilePath('A-1', 'prescription.json')).toBe('orders/A-1/prescription.json');
  });

  it('names the files a site reads', () => {
    expect(ASSET).toEqual({ FRAME: 'frame', PRESCRIPTION: 'prescription' });
  });

  it('names every log event under one prefix', () => {
    for (const event of Object.values(LOG_EVENTS)) expect(event).toMatch(/^cloud\./);
  });

  it('has distinct roles and statuses', () => {
    expect(new Set(Object.values(APP_ROLE)).size).toBe(3);
    expect(new Set(Object.values(ROLE)).size).toBe(6);
    expect(new Set(Object.values(ORDER_STATUS)).size).toBe(7);
  });

  it('gives each bot its own name, so one key never retires another', () => {
    expect(new Set(Object.values(BOT)).size).toBe(3);
    expect(BOT.SITE).toBe('site-1');
  });
});
