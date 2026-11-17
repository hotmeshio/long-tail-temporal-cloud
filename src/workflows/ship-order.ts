import { conditional } from '@hotmeshio/long-tail-temporal/workflow';

import {
  CARRIER_STATUS, CHASE_AFTER, CHASE_OUTCOME, CHASE_PRIORITY, CHASE_REASON, ESCALATION_SUBTYPE, ESCALATION_TYPE,
  MAX_PICKUP_ROUNDS, ORDER_STATUS, ROLE, WAIT_TIMEOUT, chaseKey, pickupKey, type OrderStatus,
} from '../modules/constants';
import type { Booking } from '../types/order';

export interface PickupScan {
  carrierStatus: typeof CARRIER_STATUS[keyof typeof CARRIER_STATUS];
  scannedAt: string;
  refusalNote?: string;
}

export interface ChaseAnswer {
  outcome: typeof CHASE_OUTCOME[keyof typeof CHASE_OUTCOME];
  pickupAt?: string;
  note?: string;
}

/** Wait for the carrier's pickup scan. An overdue pickup goes to the shipping desk, and a rebooked one waits again. */
export async function shipOrder(booking: Booking): Promise<OrderStatus> {
  const { orderId, carrier, bookingRef } = booking;

  for (let round = 1; round <= MAX_PICKUP_ROUNDS; round++) {
    const key = pickupKey(orderId, round);
    const pickup = await conditional<PickupScan>(key, {
      role: ROLE.CARRIER_PICKUP,
      type: ESCALATION_TYPE.SHIPPING,
      subtype: ESCALATION_SUBTYPE.AWAITING_PICKUP,
      description: `Waiting for ${carrier} to pick up ${orderId}`,
      metadata: { orderId, carrier, bookingRef },
      timeout: WAIT_TIMEOUT.PICKUP,
      signalKey: key,
    });

    if (pickup === null) return ORDER_STATUS.CANCELLED;
    if (pickup) return pickup.carrierStatus === CARRIER_STATUS.PICKED_UP ? ORDER_STATUS.SHIPPED : ORDER_STATUS.REFUSED;

    const call = await chaseCarrier(orderId);
    if (call === false) return ORDER_STATUS.EXPIRED;
    if (call === null || call.outcome !== CHASE_OUTCOME.REBOOKED) return ORDER_STATUS.CANCELLED;
  }
  return ORDER_STATUS.EXPIRED;
}

/** The shipping desk calls the carrier, then rebooks or cancels. */
export async function chaseCarrier(orderId: string): Promise<ChaseAnswer | false | null> {
  return conditional<ChaseAnswer>(chaseKey(orderId), {
    role: ROLE.SHIPPING_DESK,
    type: ESCALATION_TYPE.SHIPPING,
    priority: CHASE_PRIORITY,
    description: `No pickup for ${orderId} after ${CHASE_AFTER}. Call the carrier, then rebook or cancel.`,
    metadata: { orderId, reason: CHASE_REASON },
    timeout: WAIT_TIMEOUT.CHASE,
  });
}
