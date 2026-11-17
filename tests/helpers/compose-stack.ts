import { requestApi, ApiRequestError } from '../../src/lib/api-request';
import { issueBotKey } from '../../src/services/bot-key';
import { BOT, ROLE, ROLE_TYPE, WORKFLOW, workflowIdFor } from '../../src/modules/constants';

export const STACK_URL = process.env.LT_URL_UNDER_TEST ?? 'http://localhost:3600';
const ADMIN = { username: process.env.LT_ADMIN_USER ?? 'superadmin', password: process.env.LT_ADMIN_PASSWORD ?? 'l0ngt@1l' };

const STATUS_PENDING = 'pending';

export interface ApiReply<T = any> { status: number; data: T }
type Method = 'GET' | 'POST' | 'DELETE';
export type Caller = <T = any>(method: Method, path: string, body?: unknown) => Promise<ApiReply<T>>;

/** A caller that returns the status with the body, so a test asserts on both. */
export function callerFor(token: string): Caller {
  return async <T>(method: Method, path: string, body?: unknown) => {
    try {
      return { status: 200, data: await requestApi<T>(STACK_URL, { method, path, token, body }) };
    } catch (err) {
      if (err instanceof ApiRequestError && err.status) return { status: err.status, data: err.body as T };
      throw err;
    }
  };
}

export async function signInAdmin(): Promise<Caller> {
  const { token } = await requestApi<{ token: string }>(STACK_URL, { method: 'POST', path: '/api/auth/login', body: ADMIN });
  return callerFor(token);
}

/** The site's bot, with a fresh key, as a factory site would hold it. */
export async function signInSite(): Promise<{ api: Caller; botId: string }> {
  const { botId, apiKey } = await issueBotKey(STACK_URL, ADMIN, { name: BOT.SITE, roles: [{ role: ROLE.PRODUCTION, type: ROLE_TYPE.MEMBER }, { role: ROLE.CARRIER_PICKUP, type: ROLE_TYPE.MEMBER }] });
  return { api: callerFor(apiKey), botId };
}

export async function waitFor<T>(what: string, read: () => Promise<T | undefined | null | false>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function uniqueOrderId(): string {
  return `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The order's pending row in one role. */
export async function pendingRow(admin: Caller, workflowId: string, role: string) {
  return waitFor(`the ${role} row`, async () => {
    const { data } = await admin('GET', `/api/escalations/by-workflow/${workflowId}`);
    return data.escalations?.find((row: any) => row.status === STATUS_PENDING && row.role === role);
  });
}

/** Start an order and return its workflow id and the pending production row. */
export async function startOrder(admin: Caller, orderId: string, extra: Record<string, unknown> = {}) {
  const workflowId = workflowIdFor(orderId);
  const started = await admin('POST', `/api/workflows/${WORKFLOW.EYEGLASS_ORDER_REQUEST}/invoke`, {
    workflowId, data: { orderId, ...extra },
  });
  if (started.status !== 200) throw new Error(`invoke failed: ${started.status} ${JSON.stringify(started.data)}`);
  return { workflowId, escalation: await pendingRow(admin, workflowId, ROLE.PRODUCTION) };
}

export async function workflowResult(admin: Caller, workflowId: string) {
  return waitFor('the workflow result', async () => {
    const { data } = await admin('GET', `/api/workflows/${workflowId}/result`);
    return data?.state === 'completed' ? data.result.data : undefined;
  });
}
