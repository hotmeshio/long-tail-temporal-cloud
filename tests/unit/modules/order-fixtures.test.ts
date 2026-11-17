import { CONFIDENCE_THRESHOLD, ORDER_DEFAULTS } from '../../../src/modules/constants';
import {
  CLEAR_PARSE, LENS_STOCK, ORDERS_WITHOUT_BLANK, PARSE_BY_ORDER, SAMPLE_ORDER_ID, SAMPLE_PRESCRIPTION, STORY_ORDER_IDS,
  frameFileBody,
} from '../../../src/modules/order-fixtures';

describe('order fixtures', () => {
  it('tells the story with four orders, the sample first', () => {
    expect(STORY_ORDER_IDS).toEqual(['A-1042', 'A-1043', 'A-1044', 'A-1045']);
    expect(STORY_ORDER_IDS[0]).toBe(SAMPLE_ORDER_ID);
  });

  it('sends the sample order and three more to review, one story order among them', () => {
    expect(Object.keys(PARSE_BY_ORDER)).toEqual([SAMPLE_ORDER_ID, 'A-1048', 'A-1051', 'A-1054']);
    for (const parse of Object.values(PARSE_BY_ORDER)) expect(parse.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(STORY_ORDER_IDS.filter((id) => id in PARSE_BY_ORDER)).toEqual([SAMPLE_ORDER_ID]);
    expect(CLEAR_PARSE.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('carries the sample prescription the PDF shows', () => {
    expect(SAMPLE_PRESCRIPTION.pd).toBe(63);
    expect(SAMPLE_PRESCRIPTION.left.axis).toBe(15);
  });

  it('reads the folded left axis as 75 where the PDF shows 15', () => {
    const { values, scores } = PARSE_BY_ORDER[SAMPLE_ORDER_ID];
    expect(values.left.axis).toBe(75);
    expect(scores.left.axis).toBeLessThan(0.6);
    expect({ ...values, left: { ...values.left, axis: 15 } }).toEqual(SAMPLE_PRESCRIPTION);
  });

  it('stocks the default lens and holds one story order for the order desk', () => {
    expect(LENS_STOCK.some((b) => b.lensMaterial === ORDER_DEFAULTS.LENS_MATERIAL && b.coating === ORDER_DEFAULTS.COATING)).toBe(true);
    expect(new Set(LENS_STOCK.map((b) => b.lotNumber)).size).toBe(LENS_STOCK.length);
    expect(ORDERS_WITHOUT_BLANK).toEqual(['A-1044']);
  });

  it('names the frame style in the frame file', () => {
    expect(frameFileBody('round-48')).toContain('round-48');
  });
});
