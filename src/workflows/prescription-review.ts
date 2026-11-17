import { workflowInfo } from '@temporalio/workflow';
import { conditional } from '@hotmeshio/long-tail-temporal/workflow';

import {
  ASSET, ESCALATION_TYPE, ORDER_STATUS, REVIEW_DECISION, REVIEW_PRIORITY, REVIEW_SCHEMA_VERSION, ROLE, WAIT_TIMEOUT,
  newCopyKey, reviewKey, type OrderStatus,
} from '../modules/constants';
import type { Eye, Prescription, PrescriptionParse } from '../types/order';

/** What the reviewer submits: the corrected values and a decision. */
export interface ReviewAnswer {
  decision: typeof REVIEW_DECISION[keyof typeof REVIEW_DECISION];
  right: Eye;
  left: Eye;
  pd: number;
  reason?: string;
  notes?: string;
}

export type ReviewOutcome =
  | { confirmed: true; prescription: Prescription; reviewedBy?: string }
  | { confirmed: false; status: OrderStatus };

/** Put a low-confidence parse in front of a reviewer and wait for the decision. */
export async function reviewPrescription(orderId: string, parse: PrescriptionParse, pdfPath: string): Promise<ReviewOutcome> {
  const { workflowId } = workflowInfo();
  const { confidence, summary, values, scores } = parse;

  const review = await conditional<ReviewAnswer>(reviewKey(workflowId), {
    role: ROLE.PRESCRIPTION_REVIEW,
    type: ESCALATION_TYPE.PRESCRIPTION_REVIEW,
    priority: REVIEW_PRIORITY,
    description: `Check the prescription for order ${orderId}`,
    metadata: { orderId, confidence },
    envelope: { formDefaults: { orderId, confidence, summary, ...values }, confidence: scores },
    files: [{ path: pdfPath, as: ASSET.PRESCRIPTION }],
    timeout: WAIT_TIMEOUT.REVIEW,
    schemaVersion: REVIEW_SCHEMA_VERSION,
    withResolution: true,
  });

  if (review === false) return { confirmed: false, status: ORDER_STATUS.EXPIRED };
  if (review === null) {
    await askForNewCopy(workflowId, orderId, `Withdrawn from review: ${orderId}`);
    return { confirmed: false, status: ORDER_STATUS.CANCELLED };
  }
  if (review.decision !== REVIEW_DECISION.APPROVE) {
    await askForNewCopy(workflowId, orderId, `Ask for a clearer copy: ${orderId}`);
    return { confirmed: false, status: ORDER_STATUS.CLEARER_COPY };
  }
  const { right, left, pd } = review;
  return { confirmed: true, prescription: { right, left, pd }, reviewedBy: review.$resolution?.resolvedBy };
}

/** Customer care asks the customer for a new copy and records the reply. */
async function askForNewCopy(workflowId: string, orderId: string, description: string): Promise<void> {
  await conditional<{ reply: string }>(newCopyKey(workflowId), {
    role: ROLE.CUSTOMER_CARE,
    type: ESCALATION_TYPE.NEW_COPY,
    description,
    metadata: { orderId },
    envelope: { formDefaults: { orderId } },
  });
}
