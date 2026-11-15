import { proxyActivities } from '@temporalio/workflow';
import { conditional, type LTEnvelope } from '@hotmeshio/long-tail-temporal/workflow';

import type * as activities from '../activities';
import {
  DEFAULT_QUANTITY, DEFAULT_WAIT_TIMEOUT, ESCALATION_TYPE, ORDER_STATUS, ROLE, fabricationKey, type OrderStatus,
} from '../modules/constants';

export interface FabricationOrderInput {
  orderId: string;
  product: string;
  quantity?: number;
  /** How long the order waits for a site, such as 7d. */
  timeout?: string;
}

/** What the site reports when the work is done. */
export interface FabricationOutcome {
  completed: boolean;
  units?: number;
  site?: string;
  notes?: string;
}

export interface FabricationOrderResult {
  orderId: string;
  status: OrderStatus;
  outcome?: FabricationOutcome;
}

const { stageAssets } = proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

/** Stage the order's files, advertise the work to the fabrication role, and wait for a site to report back. */
export async function fabricationOrder(input: FabricationOrderInput): Promise<FabricationOrderResult> {
  const { orderId, product, quantity = DEFAULT_QUANTITY, timeout = DEFAULT_WAIT_TIMEOUT } = input;

  // 1. Stage the files the site will download
  const assets = await stageAssets({ orderId, product, quantity });

  // 2. Advertise the work and wait
  const key = fabricationKey(orderId);
  const outcome = await conditional<FabricationOutcome>(key, {
    role: ROLE.FABRICATION,
    type: ESCALATION_TYPE.FABRICATION,
    description: `Fabricate ${quantity} x ${product} for order ${orderId}`,
    signalKey: key,
    metadata: { orderId },
    data: {
      orderId,
      product,
      quantity,
      signalKey: key,
      assets: assets.map(({ as, sha256, size }) => ({ as, sha256, size })),
    },
    files: assets.map(({ as, path, name, contentType }) => ({ as, path, name, contentType })),
    timeout,
  });

  // 3. Record how it ended
  if (outcome === false) return { orderId, status: ORDER_STATUS.EXPIRED };
  if (outcome === null) return { orderId, status: ORDER_STATUS.CANCELLED };
  return { orderId, status: outcome.completed ? ORDER_STATUS.FABRICATED : ORDER_STATUS.REJECTED, outcome };
}

/** Invoked from Long Tail: the envelope carries the invoke form's fields. */
export async function fabricationOrderRequest(envelope: LTEnvelope<FabricationOrderInput>) {
  return { data: await fabricationOrder(envelope.data) };
}
