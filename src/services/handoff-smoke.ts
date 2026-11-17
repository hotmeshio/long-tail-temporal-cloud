import { BOT, CARRIER_STATUS, ORDER_STATUS, ROLE, ROLE_TYPE, pickupKey, productionKey } from '../modules/constants';
import type { EyeglassOrderResult, ProductionOutcome } from '../types/order';
import { issueBotKey, type AdminLogin, type BotSpec } from './bot-key';
import { awaitOrderResult, awaitPendingWait, resolveWait, signInAdmin, startOrder } from './order-api';

export interface SmokeOptions {
  orderId?: string;
  /** How long each wait (a pending row, the result) may take. */
  timeoutMs?: number;
  pollMs?: number;
}

const SMOKE_WAIT = '10m';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 1000;

/** What the smoke bot reports for production, as a site would. */
export const SMOKE_OUTCOME: ProductionOutcome = { completed: true, site: 'smoke', binKey: 'BIN-SMOKE', destination: 'smoke-dock' };

/** A bot that stands in for a site and for the carrier scan. */
export const SMOKE_BOT: BotSpec = {
  name: BOT.SMOKE,
  description: 'Reports production and the pickup scan for the order a smoke run starts',
  roles: [
    { role: ROLE.PRODUCTION, type: ROLE_TYPE.MEMBER },
    { role: ROLE.CARRIER_PICKUP, type: ROLE_TYPE.MEMBER },
  ],
};

/**
 * Run one order from start to shipped: start it, report production as a site
 * would, scan the pickup, and return the workflow's result. Throws unless the
 * order ends as shipped.
 */
export async function runHandoffSmoke(url: string, admin: AdminLogin, options: SmokeOptions = {}): Promise<EyeglassOrderResult> {
  const orderId = options.orderId ?? `SMOKE-${Date.now().toString(36)}`;
  const polling = { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, pollMs: options.pollMs ?? DEFAULT_POLL_MS };

  // 1. Sign in and mint the bot's key
  const token = await signInAdmin(url, admin);
  const bot = await issueBotKey(url, admin, SMOKE_BOT, { attempts: 1 });

  // 2. Start the order
  await startOrder(url, token, { orderId, timeout: SMOKE_WAIT });

  // 3. Report production once the order reaches the production queue
  await awaitPendingWait(url, token, orderId, polling, ROLE.PRODUCTION);
  await resolveWait(url, bot.apiKey, productionKey(orderId), { ...SMOKE_OUTCOME });

  // 4. Scan the pickup once the carrier is booked
  await awaitPendingWait(url, token, orderId, polling, ROLE.CARRIER_PICKUP);
  await resolveWait(url, bot.apiKey, pickupKey(orderId), {
    carrierStatus: CARRIER_STATUS.PICKED_UP,
    scannedAt: new Date().toISOString(),
  });

  // 5. Read the workflow's result
  const result = await awaitOrderResult(url, token, orderId, polling);
  if (result.status !== ORDER_STATUS.SHIPPED) {
    throw new Error(`order ${orderId} ended as ${result.status}, expected ${ORDER_STATUS.SHIPPED}`);
  }
  return result;
}
