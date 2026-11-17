const conditional = vi.hoisted(() => vi.fn());
vi.mock('@temporalio/workflow', () => ({ workflowInfo: () => ({ workflowId: 'order-A-1042' }) }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional }));

import { ASSET, ORDER_STATUS, REVIEW_DECISION, REVIEW_SCHEMA_VERSION, ROLE } from '../../../src/modules/constants';
import { PARSE_BY_ORDER, SAMPLE_ORDER_ID, SAMPLE_PRESCRIPTION } from '../../../src/modules/order-fixtures';
import { reviewPrescription } from '../../../src/workflows/prescription-review';

const PARSE = PARSE_BY_ORDER[SAMPLE_ORDER_ID];
const PDF = 'orders/A-1042/prescription.pdf';
const review = () => reviewPrescription(SAMPLE_ORDER_ID, PARSE, PDF);

beforeEach(() => { conditional.mockReset(); });

describe('reviewPrescription', () => {
  it('opens the review with the parse, its scores and the PDF', async () => {
    conditional.mockResolvedValueOnce(false);
    await review();
    const [key, wait] = conditional.mock.calls[0];
    expect(key).toBe('review-order-A-1042');
    expect(wait).toMatchObject({
      role: ROLE.PRESCRIPTION_REVIEW, metadata: { orderId: SAMPLE_ORDER_ID, confidence: PARSE.confidence },
      files: [{ path: PDF, as: ASSET.PRESCRIPTION }], schemaVersion: REVIEW_SCHEMA_VERSION, withResolution: true,
    });
    expect(wait.envelope.formDefaults).toMatchObject({ orderId: SAMPLE_ORDER_ID, summary: PARSE.summary, pd: PARSE.values.pd, left: PARSE.values.left });
    expect(wait.envelope.confidence).toBe(PARSE.scores);
    expect(wait.description).toBe(`Check the prescription for order ${SAMPLE_ORDER_ID}`);
  });

  it('returns the values the reviewer confirmed and who confirmed them', async () => {
    const left = { ...SAMPLE_PRESCRIPTION.left, axis: 165 };
    conditional.mockResolvedValueOnce({
      decision: REVIEW_DECISION.APPROVE, ...SAMPLE_PRESCRIPTION, left, notes: 'fold read', $resolution: { escalationId: 'e1', resolvedBy: 'user-9' },
    });
    expect(await review()).toEqual({ confirmed: true, prescription: { ...SAMPLE_PRESCRIPTION, left }, reviewedBy: 'user-9' });
    expect(conditional).toHaveBeenCalledTimes(1);
  });

  it('confirms without a reviewer when the answer names none', async () => {
    conditional.mockResolvedValueOnce({ decision: REVIEW_DECISION.APPROVE, ...SAMPLE_PRESCRIPTION });
    expect(await review()).toMatchObject({ confirmed: true, reviewedBy: undefined });
  });

  it('sends a rejected read to customer care, then ends as clearer-copy', async () => {
    conditional
      .mockResolvedValueOnce({ decision: REVIEW_DECISION.REJECT, ...SAMPLE_PRESCRIPTION, reason: 'left axis folded' })
      .mockResolvedValueOnce({ reply: 'sending a new photo' });
    expect(await review()).toEqual({ confirmed: false, status: ORDER_STATUS.CLEARER_COPY });
    const [key, wait] = conditional.mock.calls[1];
    expect(key).toBe('copy-order-A-1042');
    expect(wait).toMatchObject({ role: ROLE.CUSTOMER_CARE, metadata: { orderId: SAMPLE_ORDER_ID }, envelope: { formDefaults: { orderId: SAMPLE_ORDER_ID } } });
  });

  it('sends a withdrawn review to customer care, then ends as cancelled', async () => {
    conditional.mockResolvedValueOnce(null).mockResolvedValueOnce({ reply: 'ok' });
    expect(await review()).toEqual({ confirmed: false, status: ORDER_STATUS.CANCELLED });
    expect(conditional.mock.calls[1][1].role).toBe(ROLE.CUSTOMER_CARE);
  });

  it('ends as expired when no one reviews in time', async () => {
    conditional.mockResolvedValueOnce(false);
    expect(await review()).toEqual({ confirmed: false, status: ORDER_STATUS.EXPIRED });
    expect(conditional).toHaveBeenCalledTimes(1);
  });
});
