import { requestApi } from '../lib/api-request';
import { BOT, ORDER_STATUS, ROLE, ROLE_TYPE, WORKFLOW, fabricationKey } from '../modules/constants';
import type { FabricationOrderResult } from '../workflows/fabrication-order';
import { issueBotKey, type AdminLogin } from './bot-key';

export interface SmokeOptions {
  orderId?: string;
  /** How long each wait (the pending row, the result) may take. */
  timeoutMs?: number;
  pollMs?: number;
}

const SMOKE_PRODUCT = 'smoke-check';
const SMOKE_WAIT = '10m';
const SMOKE_SITE = 'smoke';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 1000;
const STATUS_PENDING = 'pending';
const STATE_COMPLETED = 'completed';

interface EscalationRow { id: string; status: string }
interface WorkflowResult { state?: string; result?: { data: FabricationOrderResult } }

/**
 * Run one order through the handoff: start it, resolve its wait as a bot that
 * holds the fabrication role, and return the workflow's result. Throws unless
 * the order ends as fabricated.
 */
export async function runHandoffSmoke(url: string, admin: AdminLogin, options: SmokeOptions = {}): Promise<FabricationOrderResult> {
  const orderId = options.orderId ?? `SMOKE-${Date.now().toString(36)}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const workflowId = `order-${orderId}`;

  // 1. Sign in and mint the resolver's key
  const { token } = await requestApi<{ token: string }>(url, { method: 'POST', path: '/api/auth/login', body: admin });
  const bot = await issueBotKey(
    url, admin,
    { name: BOT.SMOKE, description: 'Resolves the order a smoke run starts', roles: [{ role: ROLE.FABRICATION, type: ROLE_TYPE.MEMBER }] },
    { attempts: 1 },
  );

  // 2. Start the order
  await requestApi(url, {
    method: 'POST',
    path: `/api/workflows/${WORKFLOW.FABRICATION_ORDER_REQUEST}/invoke`,
    token,
    body: { workflowId, data: { orderId, product: SMOKE_PRODUCT, quantity: 1, timeout: SMOKE_WAIT } },
  });

  // 3. Wait for the order to reach the fabrication queue
  await waitUntil(`order ${orderId} to reach the ${ROLE.FABRICATION} queue`, timeoutMs, pollMs, async () => {
    const listed = await requestApi<{ escalations?: EscalationRow[] }>(url, { method: 'GET', path: `/api/escalations/by-workflow/${workflowId}`, token });
    return listed.escalations?.find((row) => row.status === STATUS_PENDING);
  });

  // 4. Report it done, as a site would
  await requestApi(url, {
    method: 'POST',
    path: '/api/escalations/resolve-by-signal-key',
    token: bot.apiKey,
    body: { signalKey: fabricationKey(orderId), resolverPayload: { completed: true, units: 1, site: SMOKE_SITE } },
  });

  // 5. Read the workflow's result
  const result = await waitUntil(`workflow ${workflowId} to complete`, timeoutMs, pollMs, async () => {
    const read = await requestApi<WorkflowResult>(url, { method: 'GET', path: `/api/workflows/${workflowId}/result`, token });
    return read?.state === STATE_COMPLETED ? read.result?.data : undefined;
  });
  if (result.status !== ORDER_STATUS.FABRICATED) {
    throw new Error(`order ${orderId} ended as ${result.status}, expected ${ORDER_STATUS.FABRICATED}`);
  }
  return result;
}

async function waitUntil<T>(what: string, timeoutMs: number, pollMs: number, read: () => Promise<T | undefined>): Promise<T> {
  const started = performance.now();
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (performance.now() - started > timeoutMs) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
