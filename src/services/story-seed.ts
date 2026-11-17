import { ROLE, productionKey } from '../modules/constants';
import { STORY_ORDER_IDS } from '../modules/order-fixtures';
import { issueBotKey, type AdminLogin } from './bot-key';
import { SMOKE_BOT, SMOKE_OUTCOME } from './handoff-smoke';
import { awaitPendingWait, listWaits, resolveWait, signInAdmin, startOrder } from './order-api';

export interface StoryOptions {
  /** Orders whose production a bot reports, so they wait for the carrier without a site running. */
  reportProduction?: string[];
  timeoutMs?: number;
  pollMs?: number;
}

export interface StoryOrder {
  orderId: string;
  /** False when the order was already there. */
  started: boolean;
  /** The queue the order is waiting in. */
  waitingIn: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 1000;

/**
 * Start the story's orders and wait for each to park in its queue. An order
 * that already has rows is left as it is, so a second run starts nothing.
 */
export async function seedStory(url: string, admin: AdminLogin, options: StoryOptions = {}): Promise<StoryOrder[]> {
  const polling = { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, pollMs: options.pollMs ?? DEFAULT_POLL_MS };
  const reportProduction = options.reportProduction ?? [];
  const token = await signInAdmin(url, admin);

  // 1. Start the orders that are not there yet
  const started = new Set<string>();
  for (const orderId of STORY_ORDER_IDS) {
    if ((await listWaits(url, token, orderId)).length > 0) continue;
    await startOrder(url, token, { orderId });
    started.add(orderId);
  }

  // 2. Wait for each to park
  for (const orderId of STORY_ORDER_IDS) await awaitPendingWait(url, token, orderId, polling);

  // 3. Report production for the named orders that still wait for a site
  for (const orderId of reportProduction) {
    const row = await awaitPendingWait(url, token, orderId, polling);
    if (row.role !== ROLE.PRODUCTION) continue;
    const bot = await issueBotKey(url, admin, SMOKE_BOT, { attempts: 1 });
    await resolveWait(url, bot.apiKey, productionKey(orderId), { ...SMOKE_OUTCOME });
    await awaitPendingWait(url, token, orderId, polling, ROLE.CARRIER_PICKUP);
  }

  // 4. Report where each order waits
  const story: StoryOrder[] = [];
  for (const orderId of STORY_ORDER_IDS) {
    const row = await awaitPendingWait(url, token, orderId, polling);
    story.push({ orderId, started: started.has(orderId), waitingIn: row.role });
  }
  return story;
}
