import { CLEAR_PARSE, PARSE_BY_ORDER } from '../modules/order-fixtures';
import type { PrescriptionParse } from '../types/order';

/** Read the prescription. A stand-in for a model call: each order has a fixed answer. */
export async function parsePrescription(order: { orderId: string }): Promise<PrescriptionParse> {
  return PARSE_BY_ORDER[order.orderId] ?? CLEAR_PARSE;
}
