import { BOOKING_PREFIX, BOOKING_REF_BY_ORDER, BOOKING_REF_FALLBACK } from '../modules/order-fixtures';
import type { Booking } from '../types/order';

/** Book the pickup. A stand-in for a carrier API: the reference follows from the order id. */
export async function bookCarrier(order: { orderId: string; carrier: string }): Promise<Booking> {
  const digits = order.orderId.replace(/\D/g, '');
  const bookingRef = BOOKING_REF_BY_ORDER[order.orderId] ?? (digits ? `${BOOKING_PREFIX}${digits}` : BOOKING_REF_FALLBACK);
  return { orderId: order.orderId, carrier: order.carrier, bookingRef };
}
