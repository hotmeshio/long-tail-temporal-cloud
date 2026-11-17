import { join } from 'path';

import { NativeConnection, Worker } from '@temporalio/worker';
import { longTailActivities, longTailTools } from '@hotmeshio/long-tail-temporal/worker';

import * as activities from '../activities';
import { workflowConnection } from '../config/workflow-bot';
import type { AppConfig } from '../modules/config';
import { TASK_QUEUE } from '../modules/constants';

/** The Temporal worker: runs the workflows, their activities and the Long Tail activities. */
export async function createWorker(config: AppConfig): Promise<{ worker: Worker; connection: NativeConnection }> {
  // 1. Long Tail in this process, called as the workflow bot
  const longTail = await workflowConnection();

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
