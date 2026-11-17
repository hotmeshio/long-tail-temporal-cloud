import { requestApi } from '../lib/api-request';
import { WORKFLOW, workflowIdFor, type Role } from '../modules/constants';
import type { EyeglassOrderInput, EyeglassOrderResult } from '../types/order';
import type { AdminLogin } from './bot-key';

export interface WaitRow { id: string; status: string; role: string }
export interface Polling { timeoutMs: number; pollMs: number }

const STATUS_PENDING = 'pending';
const STATE_COMPLETED = 'completed';

interface WorkflowRead { state?: string; result?: { data: EyeglassOrderResult } | null }

export async function signInAdmin(url: string, admin: AdminLogin): Promise<string> {
  const { token } = await requestApi<{ token: string }>(url, { method: 'POST', path: '/api/auth/login', body: admin });
  return token;
}

/** Start an order under the workflow id its order id names. */
export async function startOrder(url: string, token: string, input: EyeglassOrderInput): Promise<string> {
  const workflowId = workflowIdFor(input.orderId);
  await requestApi(url, {
    method: 'POST',
    path: `/api/workflows/${WORKFLOW.EYEGLASS_ORDER_REQUEST}/invoke`,
    token,
    body: { workflowId, data: input },
  });
  return workflowId;
}

/** Every row the order has opened, in any status. */
export async function listWaits(url: string, token: string, orderId: string): Promise<WaitRow[]> {
  const listed = await requestApi<{ escalations?: WaitRow[] }>(url, {
    method: 'GET',
    path: `/api/escalations/by-workflow/${workflowIdFor(orderId)}`,
    token,
  });
  return listed?.escalations ?? [];
}

/** Wait for the order to park on a pending row, in one role when a role is named. */
export async function awaitPendingWait(url: string, token: string, orderId: string, polling: Polling, role?: Role): Promise<WaitRow> {
  const where = role ? `the ${role} queue` : 'a queue';
  return waitUntil(`order ${orderId} to reach ${where}`, polling, async () => {
    const rows = await listWaits(url, token, orderId);
    return rows.find((row) => row.status === STATUS_PENDING && (!role || row.role === role));
  });
}

/** Close a wait by its signal key, as the caller the token names. */
export async function resolveWait(url: string, token: string, signalKey: string, resolverPayload: Record<string, unknown>): Promise<void> {
  await requestApi(url, {
    method: 'POST',
    path: '/api/escalations/resolve-by-signal-key',
    token,
    body: { signalKey, resolverPayload },
  });
}

export async function awaitOrderResult(url: string, token: string, orderId: string, polling: Polling): Promise<EyeglassOrderResult> {
  const workflowId = workflowIdFor(orderId);
  return waitUntil(`workflow ${workflowId} to complete`, polling, async () => {
    const read = await requestApi<WorkflowRead>(url, { method: 'GET', path: `/api/workflows/${workflowId}/result`, token });
    return read?.state === STATE_COMPLETED ? read.result?.data : undefined;
  });
}

export async function waitUntil<T>(what: string, polling: Polling, read: () => Promise<T | undefined>): Promise<T> {
  const started = performance.now();
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (performance.now() - started > polling.timeoutMs) {
      throw new Error(`timed out after ${polling.timeoutMs}ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, polling.pollMs));
  }
}
