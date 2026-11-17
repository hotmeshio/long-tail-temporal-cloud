try { require('dotenv/config'); } catch { /* env comes from the platform */ }

import { startLongTail } from './api';
import { seedDemoPeople } from './config/demo-people';
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

  // 1. Long Tail; the API and dashboard are served unless this is a worker
  const lt = await startLongTail(config);
  closers.push(() => lt.shutdown());
  if (config.appRole !== APP_ROLE.WORKER) {
    log(LOG_EVENTS.API_STARTED, { port: config.port, namespace: config.temporal.namespace });
    const people = await seedDemoPeople(config.demoPassword);
    log(LOG_EVENTS.DEMO_PEOPLE_SEEDED, people);
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
