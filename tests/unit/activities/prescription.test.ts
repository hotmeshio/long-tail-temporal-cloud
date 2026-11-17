import { parsePrescription } from '../../../src/activities/prescription';
import { CONFIDENCE_THRESHOLD } from '../../../src/modules/constants';
import { CLEAR_PARSE, SAMPLE_ORDER_ID, SAMPLE_PRESCRIPTION } from '../../../src/modules/order-fixtures';

describe('parsePrescription', () => {
  it('reads the sample order with low confidence and names the doubt', async () => {
    const parse = await parsePrescription({ orderId: SAMPLE_ORDER_ID });
    expect(parse.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(parse.summary).toContain('left eye');
    expect(parse.scores.left.axis).toBeLessThan(parse.scores.right.axis);
  });

  it('reads any other order cleanly', async () => {
    expect(await parsePrescription({ orderId: 'A-9999' })).toBe(CLEAR_PARSE);
    expect(CLEAR_PARSE.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('returns values and scores in the same shape', async () => {
    const parse = await parsePrescription({ orderId: SAMPLE_ORDER_ID });
    expect(parse.values).toEqual({ ...SAMPLE_PRESCRIPTION, left: { ...SAMPLE_PRESCRIPTION.left, axis: 75 } });
    expect(Object.keys(parse.scores)).toEqual(Object.keys(parse.values));
    expect(Object.keys(parse.scores.left)).toEqual(Object.keys(parse.values.left));
  });
});
