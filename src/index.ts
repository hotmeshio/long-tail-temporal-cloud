try { require('dotenv/config'); } catch { /* env comes from the platform */ }

import { startApi } from './api';
import { loadConfig } from './modules/config';
import { APP_ROLE, LOG_EVENTS, type LogEvent } from './modules/constants';
import { createWorker } from './worker';

const SHUTDOWN_GRACE_MS = 8000;

function log(event: LogEvent, context: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...context }));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const closers: Array<() => Promise<unknown> | unknown> = [];

  // 1. API and dashboard
  if (config.appRole !== APP_ROLE.WORKER) {
    const lt = await startApi(config);
    closers.push(() => lt.shutdown());
    log(LOG_EVENTS.API_STARTED, { port: config.port, namespace: config.temporal.namespace });
  }

  // 2. Temporal worker
  let running: Promise<void> | undefined;
  if (config.appRole !== APP_ROLE.API) {
    const { worker, connection } = await createWorker(config);
    running = worker.run();
    closers.unshift(async () => { worker.shutdown(); await running; await connection.close(); });
    log(LOG_EVENTS.WORKER_STARTED, { namespace: config.temporal.namespace });
  }

  // 3. Bounded shutdown
  const shutdown = async (signal: string) => {
    log(LOG_EVENTS.SHUTDOWN, { signal });
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    for (const close of closers) await close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await running;
}

main().catch((err) => {
  log(LOG_EVENTS.FATAL, { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
