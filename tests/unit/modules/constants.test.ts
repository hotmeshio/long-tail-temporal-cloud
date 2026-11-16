import { APP_ROLE, BOT, LOG_EVENTS, ORDER_STATUS, fabricationKey } from '../../../src/modules/constants';

describe('constants', () => {
  it('derives the signal key from the order id', () => {
    expect(fabricationKey('A-100')).toBe('fab-A-100');
  });

  it('names every log event under one prefix', () => {
    for (const event of Object.values(LOG_EVENTS)) expect(event).toMatch(/^cloud\./);
  });

  it('has distinct roles and statuses', () => {
    expect(new Set(Object.values(APP_ROLE)).size).toBe(3);
    expect(new Set(Object.values(ORDER_STATUS)).size).toBe(4);
  });

  it('gives each bot its own name, so one key never retires another', () => {
    expect(new Set(Object.values(BOT)).size).toBe(3);
  });
});
