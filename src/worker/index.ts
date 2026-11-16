import { join } from 'path';

import { NativeConnection, Worker } from '@temporalio/worker';
import { longTailActivities, longTailTools, type LongTailActivityConfig } from '@hotmeshio/long-tail-temporal/worker';

import * as activities from '../activities';
import { WORKFLOW_BOT, workflowConnection } from '../config/workflow-bot';
import type { AppConfig } from '../modules/config';
import { APP_ROLE, TASK_QUEUE } from '../modules/constants';
import { issueBotKey } from '../services/bot-key';

/**
 * How the workflow side reaches Long Tail. Beside the API it calls Long Tail in
 * process. A worker of its own calls the API with a key it issues at boot.
 */
export async function connectLongTail(config: AppConfig): Promise<LongTailActivityConfig> {
  if (config.appRole === APP_ROLE.BOTH) return workflowConnection();
  if (!config.admin.password) throw new Error('LT_ADMIN_PASSWORD is required when APP_ROLE=worker');
  const { apiKey } = await issueBotKey(config.ltUrl, { username: config.admin.user, password: config.admin.password }, WORKFLOW_BOT);
  return { url: config.ltUrl, apiKey };
}

/** The Temporal worker: runs the workflows, their activities and the Long Tail activities. */
export async function createWorker(config: AppConfig): Promise<{ worker: Worker; connection: NativeConnection }> {
  // 1. Long Tail
  const longTail = await connectLongTail(config);

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
