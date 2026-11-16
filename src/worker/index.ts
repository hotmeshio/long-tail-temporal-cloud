import { join } from 'path';

import { NativeConnection, Worker } from '@temporalio/worker';
import { longTailActivities, longTailTools } from '@hotmeshio/long-tail-temporal/worker';

import * as activities from '../activities';
import type { AppConfig } from '../modules/config';
import { BOT, ROLE, ROLE_TYPE, TASK_QUEUE } from '../modules/constants';
import { issueBotKey } from '../services/bot-key';

/** The key the workflow side calls Long Tail with: LT_API_KEY, or one minted by admin sign-in for a local stack. */
export async function resolveApiKey(config: AppConfig): Promise<string> {
  if (config.ltApiKey) return config.ltApiKey;
  if (!config.admin.password) {
    throw new Error('Set LT_API_KEY, or LT_ADMIN_USER and LT_ADMIN_PASSWORD so a local stack mints one');
  }
  const issued = await issueBotKey(
    config.ltUrl,
    { username: config.admin.user, password: config.admin.password },
    { name: BOT.WORKFLOWS, description: 'Opens and closes waits for the Temporal workflows', roles: [{ role: ROLE.FABRICATION, type: ROLE_TYPE.MEMBER }] },
  );
  return issued.apiKey;
}

/** The Temporal worker: runs the workflows, their activities and the Long Tail activities. */
export async function createWorker(config: AppConfig): Promise<{ worker: Worker; connection: NativeConnection }> {
  // 1. Key for the Long Tail API
  const apiKey = await resolveApiKey(config);
  const longTail = { url: config.ltUrl, apiKey };

  // 2. Temporal connection; an API key means Temporal Cloud over TLS
  const { address, namespace, apiKey: temporalKey } = config.temporal;
  const connection = await NativeConnection.connect({ address, ...(temporalKey ? { apiKey: temporalKey, tls: true } : {}) });

  // 3. Worker
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: join(__dirname, '../workflows'),
    activities: { ...activities, ...longTailActivities(longTail), ...longTailTools(longTail) },
  });
  return { worker, connection };
}
